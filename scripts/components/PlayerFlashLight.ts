/**
 * PlayerFlashLight
 *
 * Component Attachment: Player (PlayerCharacter template root entity)
 * Component Networking: Local (client-owned, executes on owning client)
 * Component Ownership: Player
 *
 * Detects enemies within the flashlight cone each frame and freezes/resumes
 * their AI via EnemyLogic.freezeByFlashlight / resumeFromFlashlight.
 *
 * Detection pipeline per frame:
 * 1. Check flashlight is on (PlayerLogic.flashlightActive)
 * 2. Iterate cachedEnemies (refreshed on EnemySpawnCompleteEvent)
 *    that have enableStopByFlashLight=true
 * 3. Distance filter (SpotLight maxRange)
 * 4. Full 3D angle check (camera forward vs direction to enemy, outerConeAngleDeg)
 * 5. Async raycast LOS confirmation (no obstruction)
 * 6. Compare with previous frame's illuminated set → freeze new, resume departed
 *
 * Performance notes:
 * - Enemy entity list is CACHED and refreshed only on EnemySpawnCompleteEvent
 *   (enemies spawn once per Exploration phase). Never queried per frame.
 * - Detection Set tracking uses a double-buffer pattern (currentIlluminated /
 *   nextIlluminated) to avoid per-cycle heap allocation.
 */

import type {
	Entity,
	Maybe,
	TemplateAsset,
} from "meta/worlds";
import {
	CameraService,
	CastMode,
	CollisionLayerMask,
	Color,
	ColorComponent,
	Component,
	component,
	EntityService,
	EventService,
	ExecuteOn,
	NetworkMode,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	PhysicsBodyComponent,
	PhysicsService,
	property,
	Quaternion,
	Service,
	SpotLightComponent,
	subscribe,
	TransformComponent,
	Vec3,
	WorldService,
} from "meta/worlds";
import {
	EnemySpawnCompleteEvent,
	EnemySpawnCompletePayload,
	GamePhase,
	GamePhaseChangedEvent,
	GamePhaseChangedPayload,
} from "../events/GamePhaseEvents";
import { EnemyLogic } from "./EnemyLogic";
import { PlayerLogic } from "./PlayerLogic";
import { EnemyFrozenEvent } from "../events/AnalyticsEvents";

@component({
	description: "Flashlight cone detection that freezes enemies when illuminated",
})
export class PlayerFlashLight extends Component {
	// #region Debug visualization
	/**
	 * Toggle debug visualization of flashlight detection rays.
	 * When true, draws lines from flashlight to each enemy in range.
	 * RED = illuminated (in cone + LOS), GREEN = in range but not illuminated.
	 * Set to true in the editor for development; defaults to false for production.
	 */
	@property({isNetworked: false})
	public showDebug: boolean = false;

	/**
	 * Template asset for debug lines (assign the Cube primitive template).
	 * Required for debug visualization to work.
	 */
	@property({isNetworked: false})
	public debugLineTemplate: Maybe<TemplateAsset> = null;

	private static readonly DEBUG_POOL_SIZE = 10;
	private debugLines: Array<{entity: Entity; transform: TransformComponent; color: ColorComponent}> = [];
	private debugLinesSpawned: boolean = false;
	private debugSpawnAttempted: boolean = false;
	// #endregion

	// #region Component references
	private playerLogic: Maybe<PlayerLogic> = null;
	private flashlightTransform: Maybe<TransformComponent> = null;
	private spotLight: Maybe<SpotLightComponent> = null;
	private physicsService: PhysicsService = Service.inject(PhysicsService);
	private playerPhysicsEntity: Maybe<Entity> = null;
	/** Cached transform of the player's RayPoint child entity (ray emission origin). Falls back to flashlightTransform. */
	private playerRayPointTransform: Maybe<TransformComponent> = null;
	/** Cached transforms of each enemy's RayPoint child entity (ray target). Falls back to enemy root transform. */
	private enemyRayPointCache: Map<Entity, Maybe<TransformComponent>> = new Map();
	// #endregion

	// #region Detection parameters (read from SpotLight once in onStart)
	private maxRange: number = 25;
	private halfConeAngleRad: number = (25 / 2) * (Math.PI / 180);
	private cosThreshold: number = Math.cos((25 / 2) * (Math.PI / 180));
	// #endregion

	// #region State tracking
	/**
	 * Cached enemy entity list. Refreshed on EnemySpawnCompleteEvent so that
	 * EntityService.findEntitiesWithComponent is never called per detection cycle.
	 */
	private cachedEnemies: Entity[] = [];
	/**
	 * Currently illuminated enemies (active buffer).
	 * Double-buffered with nextIlluminated to avoid per-cycle Set allocation.
	 */
	private currentIlluminated: Set<Entity> = new Set();
	/**
	 * Work buffer for the current detection cycle.
	 * Swapped with currentIlluminated at the end of each cycle (zero allocation).
	 */
	private nextIlluminated: Set<Entity> = new Set();
	private checkInProgress: boolean = false;
	private wasFlashlightOn: boolean = false;

	/** Time accumulator for throttling cone detection (seconds). */
	private detectionTimer: number = 0;
	/** Interval between cone detection cycles (seconds). */
	private readonly detectionInterval: number = 0.15;

	/**
	 * Grace period before resuming enemies after they leave the cone.
	 * Maps enemy entity -> elapsed seconds of continuous non-detection.
	 * Once elapsed >= RESUME_GRACE_SECONDS, resumeFromFlashlight() fires.
	 */
	private static readonly RESUME_GRACE_SECONDS = 1.0;
	private pendingResumeTimers: Map<Entity, number> = new Map();
	// #endregion

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Owner })
	public onStart(): void {
		this.playerLogic = this.entity.getComponent(PlayerLogic);

		// Find Flashlight child entity
		const flashlights = this.entity.findChildrenWithName("Flashlight", true);
		if (flashlights.length > 0) {
			this.flashlightTransform = flashlights[0].getComponent(TransformComponent);
			this.spotLight = flashlights[0].getComponent(SpotLightComponent);

			// Read cone parameters from SpotLight
			if (this.spotLight) {
				this.maxRange = this.spotLight.maxRange;
				const angleDeg = this.spotLight.outerConeAngleDeg;
				this.halfConeAngleRad = (angleDeg / 2) * (Math.PI / 180);
				this.cosThreshold = Math.cos(this.halfConeAngleRad);
				console.log(`[PlayerFlashLight] Cone params: range=${this.maxRange}, angle=${angleDeg}deg`);
			}
		}

		// Cache player's RayPoint child for ray emission origin
		const playerRayPoints = this.entity.findChildrenWithName("RayPoint", true);
		if (playerRayPoints.length > 0) {
			this.playerRayPointTransform = playerRayPoints[0].getComponent(TransformComponent);
			console.log(`[PlayerFlashLight] Player RayPoint found and cached`);
		} else {
			console.log(`[PlayerFlashLight] Player RayPoint not found, falling back to Flashlight transform`);
		}

		// Cache player's KinematicCharacter for raycast exclusion
		const kinChildren = this.entity.findChildrenWithName("KinematicCharacter", true);
		if (kinChildren.length > 0) {
			this.playerPhysicsEntity = kinChildren[0];
		}

		// Spawn debug line pool if debug is enabled
		if (this.showDebug) {
			this.spawnDebugLines();
		}
	}

	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Owner })
	public onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (!this.playerLogic || !this.flashlightTransform) {
			return;
		}

		const isOn = this.playerLogic.flashlightActive;

		// Flashlight just turned off → resume all frozen enemies
		if (this.wasFlashlightOn && !isOn) {
			this.releaseAllFrozen();
		}

		this.wasFlashlightOn = isOn;

		if (!isOn) {
			return;
		}

		// Accumulate grace period timers BEFORE detection so expired enemies
		// don't get re-added to pending in the same frame
		const dt = payload.deltaTime;
		for (const [enemy, elapsed] of this.pendingResumeTimers) {
			if (!enemy.valid) {
				this.pendingResumeTimers.delete(enemy);
				continue;
			}
			const newElapsed = elapsed + dt;
			if (newElapsed >= PlayerFlashLight.RESUME_GRACE_SECONDS) {
				// Grace period expired — actually resume this enemy
				const logic = enemy.getComponent(EnemyLogic);
				if (logic) {
					logic.resumeFromFlashlight();
				}
				this.currentIlluminated.delete(enemy);
				this.pendingResumeTimers.delete(enemy);
			} else {
				this.pendingResumeTimers.set(enemy, newElapsed);
			}
		}

		// Throttle cone detection to every 0.15s instead of every frame
		this.detectionTimer += dt;
		if (this.detectionTimer >= this.detectionInterval && !this.checkInProgress) {
			this.detectionTimer = 0;
			this.runConeDetection();
		}
	}

	/**
	 * Refresh the cached enemy list when all enemies have finished spawning.
	 * Called once per Exploration phase after GameEnemyManager completes spawn.
	 */
	@subscribe(EnemySpawnCompleteEvent, { execution: ExecuteOn.Owner })
	private onEnemySpawnComplete(_payload: EnemySpawnCompletePayload): void {
		this.cachedEnemies = EntityService.findEntitiesWithComponent(EnemyLogic);
		// Cache enemy RayPoint transforms
		this.enemyRayPointCache.clear();
		for (const enemy of this.cachedEnemies) {
			const rayPoints = enemy.findChildrenWithName("RayPoint", true);
			if (rayPoints.length > 0) {
				this.enemyRayPointCache.set(enemy, rayPoints[0].getComponent(TransformComponent));
			} else {
				this.enemyRayPointCache.set(enemy, null);
			}
		}
		console.log(`[PlayerFlashLight] Enemy cache refreshed: ${this.cachedEnemies.length} enemies`);
	}

	/**
	 * On Settlement phase, release all frozen enemies and clear the cache.
	 * Enemies will be destroyed shortly; keeping stale references causes wrong resumes.
	 */
	@subscribe(GamePhaseChangedEvent, { execution: ExecuteOn.Owner })
	private onPhaseChanged(payload: GamePhaseChangedPayload): void {
		if (payload.newPhase === GamePhase.Settlement) {
			this.releaseAllFrozen();
			this.cachedEnemies = [];
			this.enemyRayPointCache.clear();
			this.pendingResumeTimers.clear();
		}
	}

	/**
	 * Release all currently frozen enemies and clear the illuminated set.
	 * Also resumes any enemies in the grace period timer map.
	 */
	private releaseAllFrozen(): void {
		for (const enemy of this.currentIlluminated) {
			if (enemy.valid) {
				const logic = enemy.getComponent(EnemyLogic);
				if (logic) {
					logic.resumeFromFlashlight();
				}
			}
		}
		this.currentIlluminated.clear();

		// Also resume enemies pending grace period expiry
		for (const [enemy] of this.pendingResumeTimers) {
			if (enemy.valid) {
				const logic = enemy.getComponent(EnemyLogic);
				if (logic) {
					logic.resumeFromFlashlight();
				}
			}
		}
		this.pendingResumeTimers.clear();
	}

	/**
	 * Main cone detection routine. Runs asynchronously due to raycasts.
	 * Uses pre-allocated double-buffer Sets (nextIlluminated / currentIlluminated)
	 * to avoid GC pressure from per-cycle Set construction.
	 */
	private async runConeDetection(): Promise<void> {
		this.checkInProgress = true;

		try {
			// Get ray origin from player's RayPoint child (fallback to flashlight transform)
			const flashlightPos = this.playerRayPointTransform
				? this.playerRayPointTransform.worldPosition
				: this.flashlightTransform!.worldPosition;
			const flashlightForward = CameraService.get().forward;

			// Use cached enemy list — never call findEntitiesWithComponent per cycle
			this.nextIlluminated.clear();

			for (const enemyEntity of this.cachedEnemies) {
				if (!enemyEntity.valid) {
					continue;
				}

				const logic = enemyEntity.getComponent(EnemyLogic);
				if (!logic || !logic.enableStopByFlashLight) {
					continue;
				}

				const enemyTransform = enemyEntity.getComponent(TransformComponent);
				if (!enemyTransform) {
					continue;
				}

				// Use enemy's RayPoint child position if available, fallback to root transform
				const enemyRayPointTf = this.enemyRayPointCache.get(enemyEntity);
				const enemyPos = enemyRayPointTf
					? enemyRayPointTf.worldPosition
					: enemyTransform.worldPosition;

				// Step 1: Distance filter
				const toEnemy = enemyPos.sub(flashlightPos);
				const dist = toEnemy.magnitude();
				if (dist > this.maxRange || dist < 0.1) {
					continue;
				}

				// Step 2: Full 3D angle check (no Y zeroing - flashlight follows pitch)
				const dirToEnemy = toEnemy.normalize();
				const dotVal = flashlightForward.dot(dirToEnemy);
				if (dotVal < this.cosThreshold) {
					continue;
				}

				// Step 3: Raycast LOS check
				const hasLos = await this.checkLos(flashlightPos, dirToEnemy, dist, enemyEntity);
				if (hasLos) {
					this.nextIlluminated.add(enemyEntity);
				}
			}

			// Enemies that left the cone → start grace period timer (don't resume immediately)
			for (const prev of this.currentIlluminated) {
				if (!this.nextIlluminated.has(prev)) {
					if (prev.valid && !this.pendingResumeTimers.has(prev)) {
						// Start the grace period — enemy stays frozen until timer expires
						this.pendingResumeTimers.set(prev, 0);
					}
				}
			}

			// Enemies that re-entered the cone while pending resume → cancel timer
			for (const curr of this.nextIlluminated) {
				if (this.pendingResumeTimers.has(curr)) {
					// Re-detected within grace period — cancel the pending resume
					this.pendingResumeTimers.delete(curr);
				}
			}

			// Enemies that newly entered the cone → freeze instantly
			for (const curr of this.nextIlluminated) {
				if (!this.currentIlluminated.has(curr) && !this.pendingResumeTimers.has(curr)) {
					const logic = curr.getComponent(EnemyLogic);
					if (logic) {
						logic.freezeByFlashlight();
						EventService.sendLocally(EnemyFrozenEvent, { dummy: 0 });
					}
				}
			}

			// Swap buffers (zero allocation — recycle old currentIlluminated as next work set)
			const temp = this.currentIlluminated;
			this.currentIlluminated = this.nextIlluminated;
			this.nextIlluminated = temp;

			// Update debug visualization if enabled
			if (this.showDebug && this.debugLinesSpawned) {
				this.updateDebugLines(flashlightPos);
			}
		} catch (e) {
			console.log(`[PlayerFlashLight] Detection error: ${String(e)}`);
		}

		this.checkInProgress = false;
	}

	/**
	 * Raycast from flashlight position toward enemy to confirm clear LOS.
	 * Returns true if the ray hits the enemy (or nothing before it).
	 */
	private async checkLos(origin: Vec3, dir: Vec3, distance: number, targetEntity: Entity): Promise<boolean> {
		try {
			const result = await this.physicsService.rayCast({
				origin: origin,
				dir: dir,
				distance: distance,
				mode: CastMode.ClosestHit,
				includeTriggers: false,
				maxUnsortedHits: 1,
				collisionLayerMask: CollisionLayerMask.AllLayers,
				excludeEntity: this.playerPhysicsEntity ?? this.entity,
			});

			// No hit = clear LOS (enemy may have no collider but is in range)
			if (!result.hasHitSomething || !result.hits || result.hits.length === 0) {
				return true;
			}

			// Check if the hit entity is the target enemy or one of its children
			const hit = result.hits[0];
			const hitEntity = hit.actorEntity ?? hit.shapeEntity ?? null;
			if (hitEntity) {
				let current: Maybe<Entity> = hitEntity;
				while (current) {
					if (current === targetEntity) {
						return true;
					}
					current = current.parent;
				}
			}

			// Hit something else → obstruction
			return false;
		} catch (e) {
			return false;
		}
	}

	// #region Debug Visualization

	/**
	 * Spawns a pool of debug line entities (thin cubes) used to visualize
	 * flashlight-to-enemy rays. LocalOnly so they don't affect networking.
	 */
	private async spawnDebugLines(): Promise<void> {
		if (this.debugSpawnAttempted || !this.debugLineTemplate) {
			return;
		}
		this.debugSpawnAttempted = true;

		try {
			for (let i = 0; i < PlayerFlashLight.DEBUG_POOL_SIZE; i++) {
				const spawnedEntity = await WorldService.get().spawnTemplate({
					templateAsset: this.debugLineTemplate,
					networkMode: NetworkMode.LocalOnly,
					position: new Vec3(0, -200, 0),
					rotation: Quaternion.identity,
				});

				const transform = spawnedEntity.getComponent(TransformComponent);
				const colorComp = spawnedEntity.getComponent(ColorComponent);

				if (!transform || !colorComp) {
					continue;
				}

				// Disable collision so debug lines don't interfere with LOS raycasts
				const body = spawnedEntity.getComponent(PhysicsBodyComponent);
				if (body) {
					body.collisionEnabled = false;
				}

				// Start hidden
				transform.localScale = new Vec3(0.001, 0.001, 0.001);
				colorComp.color = new Color(0, 1, 0, 1);

				this.debugLines.push({entity: spawnedEntity, transform, color: colorComp});
			}

			this.debugLinesSpawned = true;
			console.log(`[PlayerFlashLight] Debug line pool spawned: ${this.debugLines.length} lines`);
		} catch (e) {
			console.log(`[PlayerFlashLight] Failed to spawn debug lines: ${String(e)}`);
		}
	}

	/**
	 * Updates debug line positions and colors based on current detection state.
	 * RED = enemy is illuminated (in cone + LOS passed)
	 * GREEN = enemy is in range but NOT illuminated (failed angle or LOS)
	 */
	private updateDebugLines(flashlightPos: Vec3): void {
		let lineIndex = 0;

		for (const enemyEntity of this.cachedEnemies) {
			if (lineIndex >= this.debugLines.length) {
				break;
			}

			if (!enemyEntity.valid) {
				continue;
			}

			const logic = enemyEntity.getComponent(EnemyLogic);
			if (!logic || !logic.enableStopByFlashLight) {
				continue;
			}

			const enemyTransform = enemyEntity.getComponent(TransformComponent);
			if (!enemyTransform) {
				continue;
			}

			// Use enemy's RayPoint child position if available, fallback to root transform
			const enemyRayPointTf = this.enemyRayPointCache.get(enemyEntity);
			const enemyPos = enemyRayPointTf
				? enemyRayPointTf.worldPosition
				: enemyTransform.worldPosition;
			const toEnemy = enemyPos.sub(flashlightPos);
			const dist = toEnemy.magnitude();

			// Only draw lines to enemies within max range
			if (dist > this.maxRange || dist < 0.1) {
				continue;
			}

			const line = this.debugLines[lineIndex];
			const midpoint = flashlightPos.add(toEnemy.mul(0.5));
			const normalizedDir = toEnemy.normalize();

			// Position and orient the debug line
			line.transform.worldPosition = midpoint;
			line.transform.worldRotation = Quaternion.lookRotation(normalizedDir, Vec3.up);
			line.transform.worldScale = new Vec3(0.03, 0.03, dist);

			// Color based on illumination state
			const isIlluminated = this.currentIlluminated.has(enemyEntity);
			if (isIlluminated) {
				line.color.color = new Color(1, 0, 0, 1); // RED = detected
			} else {
				line.color.color = new Color(0, 1, 0, 1); // GREEN = in range but not detected
			}

			lineIndex++;
		}

		// Hide unused debug lines
		for (let i = lineIndex; i < this.debugLines.length; i++) {
			this.debugLines[i].transform.worldPosition = new Vec3(0, -200, 0);
			this.debugLines[i].transform.localScale = new Vec3(0.001, 0.001, 0.001);
		}
	}

	// #endregion
}
