/**
 * EnemyFov
 *
 * Component Attachment: EnemyCharacter template root entity (same entity as EnemyActionController)
 * Component Networking: Local (client-owned, spawned as LocalOnly)
 * Component Ownership: Client (local entity)
 *
 * Standalone FOV (field-of-view) cone detection component. Determines whether
 * a player entity is within the enemy's detection cone based on angle, range,
 * and line-of-sight (raycast occlusion check).
 *
 * Detection states:
 * - "Idle" — no player in FOV range at all
 * - "Alert+" — player is within FOV cone AND range, BUT blocked by obstacle (occluded)
 * - "Alert" — player is within FOV cone AND range AND has clear LOS
 *
 * Debug line: When showDebug is true and isDetecting is true, spawns and positions
 * a thin red line entity between the enemy's RayPoint and the detected player's RayPoint.
 *
 * Used by EnemyActionController to decide chase/patrol transitions.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	CastMode,
	CollisionLayerMask,
	Color,
	ColorComponent,
	Component,
	component,
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
	subscribe,
	TemplateAsset,
	TransformComponent,
	Vec3,
	WorldService,
} from "meta/worlds";

/** Detection state exposed to other components. */
export enum EnemyDetectionState {
	Idle = 0,
	AlertOccluded = 1,
	Alert = 2,
}

interface FovPlayerEntry {
	entity: Entity;
	dist: number;
}

interface LosDetailedResult {
	clear: boolean;
	blockerName: string;
}

interface FovDetectionResult {
	visiblePlayer: Maybe<Entity>;
	state: EnemyDetectionState;
	blockedByName: string;
}

@component({
	description: "FOV cone detection for enemies - checks angle, range, and line-of-sight occlusion via raycast",
})
export class EnemyFov extends Component {
	private static readonly RAY_POINT_NAME = "RayPoint";

	/** Half-angle of the enemy's field of view cone in degrees (full cone = fovAngle * 2 halves, but this property represents the full cone width). */
	@property({minValue: 10, maxValue: 360})
	public fovAngle: number = 120;

	/** Maximum detection distance for the FOV check. */
	@property({minValue: 1, maxValue: 50})
	public detectionRange: number = 12;

	/** Toggle debug FOV cone visualization on/off. */
	@property()
	public showDebug: boolean = false;

	/** Whether the enemy currently detects a player in its FOV (synced to clients for debug viz). */
	@property()
	public isDetecting: boolean = false;

	/**
	 * Current detection state (synced to clients for debug display).
	 * 0 = Idle, 1 = AlertOccluded, 2 = Alert
	 */
	@property()
	public detectionState: number = EnemyDetectionState.Idle;

	/** The currently detected target entity (synced so debug line knows where to draw). */
	@property()
	public detectedTarget: Maybe<Entity> = null;

	/** Template asset for the debug line (should be a basic cube primitive). */
	@property()
	public debugLineTemplate: Maybe<TemplateAsset> = null;

	// #region Component references
	private cachedTransform: Maybe<TransformComponent> = null;
	private get transform(): Maybe<TransformComponent> {
		return (this.cachedTransform ??= this.entity.getComponent(TransformComponent));
	}
	private physicsService: PhysicsService = Service.inject(PhysicsService);
	private physicsBodyEntity: Maybe<Entity> = null;
	// #endregion

	// #region Debug line state
	private debugLineEntity: Maybe<Entity> = null;
	private debugLineTransform: Maybe<TransformComponent> = null;
	private debugLineSpawned: boolean = false;
	private debugLineVisible: boolean = false;
	// #endregion

	// #region Debug Line Lifecycle
	/**
	 * Spawn the debug line entity on start (client-side since this component runs locally).
	 * The line entity is local-only since the enemy itself is local.
	 */
	@subscribe(OnEntityStartEvent, {execution: ExecuteOn.Everywhere})
	private async onStart(): Promise<void> {
		// Cache the KinematicCharacter child entity which has the actual PhysicsBodyComponent.
		const kinematicChildren = this.entity.findChildrenWithName("KinematicCharacter", true);
		if (kinematicChildren.length > 0) {
			this.physicsBodyEntity = kinematicChildren[0];
		} else {
		}

		if (!this.debugLineTemplate) {
			return;
		}

		try {
			const spawnedEntity = await WorldService.get().spawnTemplate({
				templateAsset: this.debugLineTemplate,
				networkMode: NetworkMode.LocalOnly,
				position: new Vec3(0, -100, 0),
				rotation: Quaternion.identity,
			});

			this.debugLineEntity = spawnedEntity;
			this.debugLineTransform = spawnedEntity.getComponent(TransformComponent);
			this.debugLineSpawned = true;
			this.debugLineVisible = false;

			const body = this.debugLineEntity.getComponent(PhysicsBodyComponent);
			if (body) {
				body.collisionEnabled = false;
			}

			const colorComp = spawnedEntity.getComponent(ColorComponent);
			if (colorComp) {
				colorComp.color = new Color(1, 0, 0, 1);
			}

			if (this.debugLineTransform) {
				this.debugLineTransform.localScale = new Vec3(0.03, 0.03, 0.01);
			}
		} catch (e) {
		}
	}

	/**
	 * Update debug line position/visibility every frame.
	 * This component runs locally on the client that spawned the enemy.
	 */
	@subscribe(OnWorldUpdateEvent, {execution: ExecuteOn.Everywhere})
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (!this.debugLineSpawned || !this.debugLineEntity || !this.debugLineTransform) {
			return;
		}

		const shouldShow = this.showDebug && this.isDetecting && this.detectedTarget !== null;

		if (!shouldShow) {
			if (this.debugLineVisible) {
				this.debugLineTransform.worldPosition = new Vec3(0, -100, 0);
				this.debugLineTransform.localScale = new Vec3(0.001, 0.001, 0.001);
				this.debugLineVisible = false;
			}
			return;
		}

		// Get enemy's RayPoint position
		const myRayPoint = this.entity.findChildrenWithName(EnemyFov.RAY_POINT_NAME, true)[0];
		const myRayTransform = myRayPoint?.getComponent(TransformComponent);
		if (!myRayTransform && !this.transform) {
			return;
		}
		let startPos: Vec3;
		if (myRayTransform) {
			startPos = myRayTransform.worldPosition;
		} else {
			startPos = this.transform!.worldPosition;
		}

		// Get target's RayPoint position
		const target = this.detectedTarget!;
		const targetRayPoint = target.findChildrenWithName(EnemyFov.RAY_POINT_NAME, true)[0];
		const targetRayTransform = targetRayPoint?.getComponent(TransformComponent);
		const targetTransform = target.getComponent(TransformComponent);
		if (!targetRayTransform && !targetTransform) {
			return;
		}
		let endPos: Vec3;
		if (targetRayTransform) {
			endPos = targetRayTransform.worldPosition;
		} else {
			endPos = targetTransform!.worldPosition;
		}

		// Calculate midpoint, direction, and distance
		const midpoint = new Vec3(
			(startPos.x + endPos.x) * 0.5,
			(startPos.y + endPos.y) * 0.5,
			(startPos.z + endPos.z) * 0.5,
		);

		const direction = endPos.sub(startPos);
		const distance = direction.magnitude();

		if (distance < 0.01) {
			return;
		}

		const normalizedDir = direction.normalize();

		this.debugLineTransform.worldPosition = midpoint;
		this.debugLineTransform.worldRotation = Quaternion.lookRotation(normalizedDir, Vec3.up);
		this.debugLineTransform.worldScale = new Vec3(0.03, 0.03, distance);
		this.debugLineVisible = true;

		// Update color based on detection state
		const colorComp = this.debugLineEntity.getComponent(ColorComponent);
		if (colorComp) {
			if (this.detectionState === EnemyDetectionState.Alert) {
				colorComp.color = new Color(1, 0, 0, 1);
			} else {
				colorComp.color = new Color(0, 0, 1, 1);
			}
		}
	}
	// #endregion

	// #region FOV Detection Logic
	/**
	 * Reset all mutable runtime state for entity pool reuse.
	 * Called by GameEnemyManager before returning this enemy to the pool.
	 */
	public resetForPool(): void {
		this.isDetecting = false;
		this.detectedTarget = null;
		this.detectionState = EnemyDetectionState.Idle;

		// Hide debug line if visible
		if (this.debugLineSpawned && this.debugLineTransform) {
			this.debugLineTransform.worldPosition = new Vec3(0, -100, 0);
			this.debugLineTransform.localScale = new Vec3(0.001, 0.001, 0.001);
			this.debugLineVisible = false;
		}
	}

	/**
	 * Returns true if the given entity is within this enemy's FOV cone
	 * (within detectionRange AND within fovAngle). Does NOT check LOS.
	 */
	public isEntityInFov(targetEntity: Entity): boolean {
		if (!this.transform) {
			return false;
		}

		const myRayPoint = this.entity.findChildrenWithName(EnemyFov.RAY_POINT_NAME, true)[0];
		const myRayTransform = myRayPoint?.getComponent(TransformComponent);
		let myPos: Vec3;
		if (myRayTransform) {
			myPos = myRayTransform.worldPosition;
		} else {
			myPos = this.transform.worldPosition;
		}

		const targetRayPoint = targetEntity.findChildrenWithName(EnemyFov.RAY_POINT_NAME, true)[0];
		const targetRayTransform = targetRayPoint?.getComponent(TransformComponent);
		const targetTransform = targetEntity.getComponent(TransformComponent);
		if (!targetTransform && !targetRayTransform) {
			return false;
		}
		let targetPos: Vec3;
		if (targetRayTransform) {
			targetPos = targetRayTransform.worldPosition;
		} else {
			targetPos = targetTransform!.worldPosition;
		}

		const dist = myPos.distance(targetPos);

		if (dist > this.detectionRange) {
			return false;
		}

		// FOV cone check
		const toTarget = targetPos.sub(myPos);
		const flatToTarget = new Vec3(toTarget.x, 0, toTarget.z).normalize();
		const enemyForward = this.transform.worldForward;
		const flatForward = new Vec3(enemyForward.x, 0, enemyForward.z).normalize();

		const dotVal = flatForward.dot(flatToTarget);
		const halfAngleRad = (this.fovAngle / 2) * (Math.PI / 180);
		const cosThreshold = Math.cos(halfAngleRad);

		return dotVal >= cosThreshold;
	}

	/**
	 * Performs an async raycast from the enemy's eye level toward the target entity.
	 * Returns an object with `clear` (true if no obstacle) and `blockerName` (name of blocking entity, or '').
	 */
	public async checkLineOfSightDetailed(targetEntity: Entity): Promise<LosDetailedResult> {
		if (!this.transform) {
			return {
				clear: false,
				blockerName: "",
			};
		}

		const targetTransform = targetEntity.getComponent(TransformComponent);
		if (!targetTransform) {
			return {
				clear: false,
				blockerName: "",
			};
		}

		// Use RayPoint child entity positions for ray origin and target
		const myRayPoint = this.entity.findChildrenWithName(EnemyFov.RAY_POINT_NAME, true)[0];
		const myRayTransform = myRayPoint?.getComponent(TransformComponent);
		let rayOrigin: Vec3;
		if (myRayTransform) {
			rayOrigin = myRayTransform.worldPosition;
		} else {
			rayOrigin = this.transform.worldPosition;
		}

		const targetRayPoint = targetEntity.findChildrenWithName(EnemyFov.RAY_POINT_NAME, true)[0];
		const targetRayTransform = targetRayPoint?.getComponent(TransformComponent);
		let targetEyePos: Vec3;
		if (targetRayTransform) {
			targetEyePos = targetRayTransform.worldPosition;
		} else {
			targetEyePos = targetTransform.worldPosition;
		}

		const toTarget = targetEyePos.sub(rayOrigin);
		const distToTarget = toTarget.magnitude();

		if (distToTarget < 0.01) {
			return {
				clear: true,
				blockerName: "",
			};
		}

		const direction = toTarget.normalize();

		try {
			const result = await this.physicsService.rayCast({
				origin: rayOrigin,
				dir: direction,
				distance: distToTarget,
				mode: CastMode.ClosestHit,
				includeTriggers: false,
				maxUnsortedHits: 1,
				collisionLayerMask: CollisionLayerMask.AllLayers,
				excludeEntity: this.physicsBodyEntity ?? this.entity,
			});

			if (!result.hasHitSomething || !result.hits || result.hits.length === 0) {
				return {
					clear: true,
					blockerName: "",
				};
			}

			const hit = result.hits[0];
			const hitEntity = hit.actorEntity ?? hit.shapeEntity ?? null;

			if (hitEntity) {
				let current: Maybe<Entity> = hitEntity;
				while (current) {
					if (current === this.entity) {
						return {
							clear: true,
							blockerName: "",
						};
					}
					if (current === targetEntity) {
						return {
							clear: true,
							blockerName: "",
						};
					}
					current = current.parent;
				}
			}

			const blockerName = hit.actorEntity?.name ?? hit.shapeEntity?.name ?? "unknown";
			return {
				clear: false,
				blockerName: blockerName,
			};
		} catch (e) {
			return {
				clear: false,
				blockerName: "",
			};
		}
	}

	/**
	 * Legacy wrapper: returns boolean only for backward compatibility.
	 */
	public async checkLineOfSight(targetEntity: Entity): Promise<boolean> {
		const result = await this.checkLineOfSightDetailed(targetEntity);
		return result.clear;
	}

	/**
	 * Checks an array of player entities and returns the nearest one that is
	 * within the FOV cone AND has clear line of sight, or null if none qualifies.
	 *
	 * Also updates the detection state for debug display:
	 * - Idle: no player in cone
	 * - AlertOccluded: player in cone but occluded
	 * - Alert: player in cone with clear LOS
	 *
	 * Also updates detectedTarget for the debug line visualization.
	 *
	 * This is async because it performs raycasts for LOS.
	 */
	public async getNearestVisiblePlayerAsync(players: Entity[]): Promise<FovDetectionResult> {
		if (!this.transform || players.length === 0) {
			this.detectionState = EnemyDetectionState.Idle;
			this.detectedTarget = null;
			this.isDetecting = false;
			return {
				visiblePlayer: null,
				state: EnemyDetectionState.Idle,
				blockedByName: "",
			};
		}

		const myPos = this.transform.worldPosition;
		let nearestInCone: Maybe<Entity> = null;
		let nearestInConeDist = Infinity;
		let nearestVisible: Maybe<Entity> = null;
		let nearestVisibleDist = Infinity;

		// First pass: find all players in FOV cone
		const playersInCone: FovPlayerEntry[] = [];
		for (const player of players) {
			const playerTransform = player.getComponent(TransformComponent);
			if (!playerTransform) {
				continue;
			}

			const dist = myPos.distance(playerTransform.worldPosition);
			if (this.isEntityInFov(player)) {
				playersInCone.push({
					entity: player,
					dist: dist,
				});
				if (dist < nearestInConeDist) {
					nearestInConeDist = dist;
					nearestInCone = player;
				}
			}
		}

		if (playersInCone.length === 0) {
			this.detectionState = EnemyDetectionState.Idle;
			this.detectedTarget = null;
			this.isDetecting = false;
			return {
				visiblePlayer: null,
				state: EnemyDetectionState.Idle,
				blockedByName: "",
			};
		}

		// Second pass: check LOS for players in cone (sorted by distance, closest first)
		playersInCone.sort((a: FovPlayerEntry, b: FovPlayerEntry): number => {
			return a.dist - b.dist;
		});

		let lastBlockerName = "";
		for (const entry of playersInCone) {
			const losResult = await this.checkLineOfSightDetailed(entry.entity);
			if (losResult.clear && entry.dist < nearestVisibleDist) {
				nearestVisibleDist = entry.dist;
				nearestVisible = entry.entity;
				break;
			} else if (!losResult.clear && !lastBlockerName) {
				lastBlockerName = losResult.blockerName;
			}
		}

		if (nearestVisible) {
			this.detectionState = EnemyDetectionState.Alert;
			this.detectedTarget = nearestVisible;
			this.isDetecting = true;
			return {
				visiblePlayer: nearestVisible,
				state: EnemyDetectionState.Alert,
				blockedByName: "",
			};
		} else {
			this.detectionState = EnemyDetectionState.AlertOccluded;
			this.detectedTarget = nearestInCone;
			this.isDetecting = true;
			return {
				visiblePlayer: null,
				state: EnemyDetectionState.AlertOccluded,
				blockedByName: lastBlockerName,
			};
		}
	}

	/**
	 * Synchronous fallback: checks only angle+distance (no LOS).
	 * Kept for backward compatibility if needed.
	 */
	public getNearestVisiblePlayer(players: Entity[]): Maybe<Entity> {
		if (!this.transform || players.length === 0) {
			return null;
		}

		const myPos = this.transform.worldPosition;
		let nearest: Maybe<Entity> = null;
		let nearestDist = Infinity;

		for (const player of players) {
			const playerTransform = player.getComponent(TransformComponent);
			if (!playerTransform) {
				continue;
			}

			const dist = myPos.distance(playerTransform.worldPosition);
			if (dist < nearestDist && this.isEntityInFov(player)) {
				nearestDist = dist;
				nearest = player;
			}
		}

		return nearest;
	}
	// #endregion
}
