/**
 * EnemyLogic
 *
 * Component Attachment: EnemyCharacter template root entity
 * Component Networking: Local (client-owned, spawned as LocalOnly)
 * Component Ownership: Client (local entity)
 *
 * Central enemy brain that coordinates EnemyFov (detection) and
 * EnemyActionController (movement). Uses NavMesh pathfinding to navigate
 * around walls and obstacles.
 *
 * Patrol behavior:
 * - On start, finds a "PatrolPoints" entity in the scene whose children are
 *   waypoint positions.
 * - Randomly picks a patrol point, computes a NavMesh path to it, and follows
 *   the path waypoints sequentially via EnemyActionController.
 * - On arrival, picks a new random DIFFERENT point and re-paths.
 * - Loops indefinitely between random patrol points.
 *
 * Chase behavior:
 * - When EnemyFov detects a player with clear LOS (Alert state), transitions
 *   from Patrol to Chase and pursues the player via NavMesh pathfinding.
 * - Re-paths to player position periodically during chase.
 * - Returns to Patrol if target is lost or exceeds loseChaseDist.
 *
 * NavMesh Integration:
 * - Auto-discovers NavMeshComponent in the scene on start.
 * - Uses NavMeshComponent.findPath() to get obstacle-avoiding waypoints.
 * - Falls back to straight-line movement if no NavMesh is found or path fails.
 * - Re-paths on each new target assignment.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	AnimatorComponent,
	BasePlayerComponent,
	Component,
	component,
	EntityService,
	ExecuteOn,
	NavMeshComponent,
	OnEntityStartEvent,
	OnPlayerCreateEvent,
	OnPlayerDestroyEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	property,
	Quaternion,
	subscribe,
	TransformComponent,
	Vec2,
	Vec3,
} from "meta/worlds";
import { EnemyActionController } from "../controllers/EnemyActionController";
import {
	GamePhase,
	GamePhaseChangedEvent,
	GamePhaseChangedPayload,
} from "../events/GamePhaseEvents";
import { DoorLogic } from "./DoorLogic";
import { ElevatorSafeZone } from "./ElevatorSafeZone";
import { EnemyDebug } from "./EnemyDebug";
import {
	EnemyDetectionState,
	EnemyFov,
} from "./EnemyFov";
import { PlayerLogic } from "./PlayerLogic";

/** Enemy AI states. */
export enum EnemyAIState {
	Patrol = 0,
	Chase = 1,
	Stop = 2,
	Attack = 3,
	WaitAtDoor = 4,
	AttackDoor = 5,
	WaitAtRegularDoor = 6,
}

@component({
	description: "Central enemy brain — manages patrol/chase state with NavMesh pathfinding",
})
export class EnemyLogic extends Component {
	// #region Static constants
	private static readonly PATROL_POINTS_PARENT_NAME = "PatrolPoints";
	private static readonly CHASE_REPATH_INTERVAL = 1.2;
	private static readonly WAIT_AT_DOOR_DURATION = 3.0;
	private static readonly STUCK_TIME_THRESHOLD: number = 2.5;
	private static readonly STUCK_DISTANCE_THRESHOLD: number = 0.3;
	/** Squared distance threshold for AI LOD. Enemies beyond this skip expensive AI ticks. */
	private static readonly LOD_DISTANCE_SQ: number = 15 * 15;
	/** Interval (seconds) between AI ticks for far-away enemies. */
	private static readonly LOD_THROTTLE_INTERVAL: number = 0.5;
	// #endregion

	// #region Properties
	/** Speed multiplier when patrolling (0-1 range fed to movement input). */
	@property({minValue: 0.1, maxValue: 1.0})
	public patrolSpeed: number = 0.5;

	/** Speed multiplier when chasing (0-1 range fed to movement input). */
	@property({minValue: 0.1, maxValue: 2.0})
	public chaseSpeed: number = 1.0;

	/** Distance at which the enemy considers it has arrived at a waypoint. */
	@property({minValue: 0.3, maxValue: 3.0})
	public arrivalThreshold: number = 1.0;

	/** Distance beyond which the enemy gives up chasing. */
	@property({minValue: 5, maxValue: 60})
	public loseChaseDist: number = 15;

	/**
	 * When true, all AI logic still runs but movement input is zeroed
	 * so the enemy stands still.
	 */
	@property()
	public movementDisabled: boolean = false;

	/** Distance at which enemy stops chasing and begins attacking. */
	@property({minValue: 1, maxValue: 5})
	public attackRange: number = 1.0;

	/** Distance beyond attack range to disengage back to chase. */
	@property({minValue: 2, maxValue: 8})
	public attackDisengageRange: number = 3.0;

	/** Seconds between melee swings. */
	@property({minValue: 0.5, maxValue: 5})
	public attackCooldown: number = 2.0;

	/** Damage dealt per melee hit. */
	@property({minValue: 1, maxValue: 100})
	public attackDamage: number = 20;

	/** Name of the animator transition to trigger on attack. */
	@property()
	public attackTransitionName: string = "Attack";

	/** When true, this enemy can be frozen by the player's flashlight cone. */
	@property()
	public enableStopByFlashLight: boolean = false;
	// #endregion

	// #region Component references
	private cachedTransform: Maybe<TransformComponent> = null;
	private get transform(): Maybe<TransformComponent> {
		return (this.cachedTransform ??= this.entity.getComponent(TransformComponent));
	}
	private actionController: Maybe<EnemyActionController> = null;
	private fov: Maybe<EnemyFov> = null;
	private debugDisplay: Maybe<EnemyDebug> = null;
	private navMeshComponent: Maybe<NavMeshComponent> = null;
	private animator: Maybe<AnimatorComponent> = null;
	// #endregion

	// #region Activation gate
	private active: boolean = false;
	// #endregion

	// #region AI state
	private aiState: EnemyAIState = EnemyAIState.Patrol;
	private chaseTarget: Maybe<Entity> = null;
	// #endregion

	// #region Patrol data
	private patrolPoints: Vec3[] = [];
	private currentPatrolTarget: Vec3 = Vec3.zero;
	// #endregion

	// #region NavMesh path following
	private currentPath: Vec3[] = [];
	private currentPathIndex: number = 0;
	private isPathfinding: boolean = false;
	// #endregion

	// #region Chase repath timer
	private chaseRepathTimer: number = 0;
	// #endregion

	// #region Distance LOD throttle
	private lodThrottleAccum: number = 0;
	// #endregion

	// #region Stuck detection
	private stuckCheckPosition: Vec3 = Vec3.zero;
	private stuckCheckTimer: number = 0;
	// #endregion

	// #region WaitAtDoor state
	private waitAtDoorTimer: number = 0;
	private waitAtDoorArrived: boolean = false;
	// #endregion

	// #region Attack state
	private attackCooldownTimer: number = 0;
	// #endregion

	// #region Flashlight freeze state
	private frozenByFlashlight: boolean = false;
	private stateBeforeFlashlightFreeze: EnemyAIState = EnemyAIState.Patrol;
	// #endregion

	// #region AttackDoor state
	private doorTarget: Maybe<Entity> = null;
	private doorAttackCooldownTimer: number = 0;
	private doorApproachArrived: boolean = false;
	// #endregion

	// #region WaitAtRegularDoor state
	private savedStateBeforeDoorWait: EnemyAIState = EnemyAIState.Patrol;
	private savedChaseTargetBeforeDoorWait: Maybe<Entity> = null;
	private regularDoorWaitTimer: number = 0;
	private targetRegularDoorLogic: Maybe<DoorLogic> = null;
	private static readonly REGULAR_DOOR_WAIT_DURATION = 3.0;
	// #endregion

	// #region Player cache
	private players: Entity[] = [];
	// #endregion

	// #region FOV async guard
	private fovCheckInProgress: boolean = false;
	private lastDetectionState: EnemyDetectionState = EnemyDetectionState.Idle;
	private lastVisiblePlayer: Maybe<Entity> = null;
	/** Accumulated time since last FOV check (throttle to every 0.25s). */
	private fovCheckTimer: number = 0;
	private static readonly FOV_CHECK_INTERVAL: number = 0.25;
	// #endregion

	// #region Alert indicator
	private alertEntity: Maybe<Entity> = null;
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, {execution: ExecuteOn.Everywhere})
	public onStart(): void {
		this.actionController = this.entity.getComponent(EnemyActionController);
		this.fov = this.entity.getComponent(EnemyFov);
		this.debugDisplay = this.entity.getComponent(EnemyDebug);

		if (!this.fov) {
		}
		if (!this.actionController) {
		}

		this.discoverNavMesh();

		// Discover animator on Visuals child for attack animation
		const animChildren = this.entity.getChildrenWithComponent(AnimatorComponent, true);
		if (animChildren.length > 0) {
			this.animator = animChildren[0].getComponent(AnimatorComponent);
		} else {
		}

		this.cachePatrolPoints();
		this.refreshPlayers();

		// Find alert indicator
		const alertEntities = this.entity.findChildrenWithName("AlertIndicator", true);
		if (alertEntities.length > 0) {
			this.alertEntity = alertEntities[0];
			this.alertEntity.enabledSelf = false;
		}

		// Initialize stuck detection position
		if (this.transform) {
			this.stuckCheckPosition = this.transform.worldPosition;
		}

		this.pickNextPatrolPoint();

		this.debugDisplay?.setState("Patrol");
	}

	@subscribe(OnPlayerCreateEvent, {execution: ExecuteOn.Everywhere})
	public onPlayerCreate(): void {
		this.refreshPlayers();
	}

	@subscribe(OnPlayerDestroyEvent, {execution: ExecuteOn.Everywhere})
	public onPlayerDestroy(): void {
		this.refreshPlayers();
	}

	/**
	 * React to game phase changes.
	 * Resume when Exploration starts, stop during Settlement.
	 */
	@subscribe(GamePhaseChangedEvent, {execution: ExecuteOn.Everywhere})
	private onPhaseChanged(payload: GamePhaseChangedPayload): void {
		if (payload.newPhase === GamePhase.Exploration) {
			this.resumeFromStop();
		} else if (payload.newPhase === GamePhase.Settlement) {
			this.stop();
		}
	}
	// #endregion

	// #region Main update loop
	@subscribe(OnWorldUpdateEvent, {execution: ExecuteOn.Everywhere})
	public onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (!this.active) {
			return;
		}

		if (!this.actionController || !this.transform) {
			return;
		}

		if (this.aiState === EnemyAIState.Stop) {
			this.actionController.applyMovementInput(Vec2.zero);
			return;
		}

		if (this.aiState === EnemyAIState.Attack) {
			this.actionController.applyMovementInput(Vec2.zero);
			this.updateAttackState(payload.deltaTime);
			return;
		}

		if (this.aiState === EnemyAIState.WaitAtDoor) {
			this.updateWaitAtDoorState(payload.deltaTime);
			return;
		}

		if (this.aiState === EnemyAIState.AttackDoor) {
			this.updateAttackDoorState(payload.deltaTime);
			return;
		}

		if (this.aiState === EnemyAIState.WaitAtRegularDoor) {
			this.updateWaitAtRegularDoorState(payload.deltaTime);
			return;
		}

		// --- Distance-based AI LOD: throttle expensive ticks for far-away enemies ---
		if (this.shouldRunAIThisFrame(payload.deltaTime)) {
			this.fovCheckTimer += payload.deltaTime;
			if (this.fovCheckTimer >= EnemyLogic.FOV_CHECK_INTERVAL) {
				this.fovCheckTimer = 0;
				this.runFovCheck();
			}
			this.updateStateTransitions();

			if (!this.movementDisabled) {
				this.updateStuckDetection(payload.deltaTime);
			}

			if (this.aiState === EnemyAIState.Chase && this.chaseTarget) {
				this.chaseRepathTimer += payload.deltaTime;
				if (this.chaseRepathTimer >= EnemyLogic.CHASE_REPATH_INTERVAL) {
					this.chaseRepathTimer = 0;
					this.requestPathToEntity(this.chaseTarget, this.chaseSpeed);
				}
			}
		}

		// Path following ALWAYS runs every frame for smooth visual movement
		let moveInput: Vec2 = Vec2.zero;
		if (this.aiState === EnemyAIState.Chase && this.chaseTarget) {
			moveInput = this.computePathFollowingInput(this.chaseSpeed);
		} else {
			moveInput = this.computePathFollowingInput(this.patrolSpeed);
		}

		if (this.movementDisabled) {
			moveInput = Vec2.zero;
		}

		this.actionController.applyMovementInput(moveInput);
	}
	// #endregion

	// #region Distance LOD logic
	/**
	 * Returns true if the enemy should run expensive AI ticks this frame.
	 * Enemies within LOD_DISTANCE of any player run full-rate.
	 * Enemies beyond that distance only tick every LOD_THROTTLE_INTERVAL seconds.
	 * Uses squared-distance comparison to avoid sqrt per frame per enemy.
	 */
	private shouldRunAIThisFrame(deltaTime: number): boolean {
		if (!this.transform) {
			return true;
		}
		const myPos = this.transform.worldPosition;
		let nearestDistSq = Infinity;
		for (const p of this.players) {
			const pt = p.getComponent(TransformComponent);
			if (!pt) {
				continue;
			}
			const pp = pt.worldPosition;
			const dx = pp.x - myPos.x;
			const dz = pp.z - myPos.z;
			const dSq = dx * dx + dz * dz;
			if (dSq < nearestDistSq) {
				nearestDistSq = dSq;
			}
		}
		if (nearestDistSq <= EnemyLogic.LOD_DISTANCE_SQ) {
			this.lodThrottleAccum = 0;
			return true;
		}
		// Far away — accumulate time and only run AI at reduced intervals
		this.lodThrottleAccum += deltaTime;
		if (this.lodThrottleAccum >= EnemyLogic.LOD_THROTTLE_INTERVAL) {
			this.lodThrottleAccum = 0;
			return true;
		}
		return false;
	}
	// #endregion

	// #region NavMesh discovery
	private discoverNavMesh(): void {
		const navMeshEntities = EntityService.findEntitiesWithComponent(NavMeshComponent);
		if (navMeshEntities.length > 0) {
			this.navMeshComponent = navMeshEntities[0].getComponent(NavMeshComponent);

		} else {
		}
	}
	// #endregion

	// #region Pathfinding
	private requestPathToPosition(targetPos: Vec3): void {
		if (!this.transform) {
			return;
		}

		if (!this.navMeshComponent) {
			this.currentPath = [targetPos];
			this.currentPathIndex = 0;
			return;
		}

		if (this.isPathfinding) {
			return;
		}

		this.isPathfinding = true;
		const startPos = this.transform.worldPosition;

		this.navMeshComponent.findPath(startPos, targetPos, {
			maxPathSize: 20,
			maxSearchDistance: 5.0,
		}).then((path: Maybe<Vec3[]>): void => {
			this.isPathfinding = false;

			if (path && path.length > 0) {
				this.currentPath = path;
				this.currentPathIndex = 0;
			} else {
				this.currentPath = [targetPos];
				this.currentPathIndex = 0;
			}
		}).catch((error: unknown): void => {
			this.isPathfinding = false;

			this.currentPath = [targetPos];
			this.currentPathIndex = 0;
		});
	}

	private requestPathToEntity(entity: Entity, speed: number): void {
		const targetTransform = entity.getComponent(TransformComponent);
		if (!targetTransform) {
			return;
		}
		this.requestPathToPosition(targetTransform.worldPosition);
	}
	// #endregion

	// #region Path-following movement
	private computePathFollowingInput(speed: number): Vec2 {
		if (!this.transform || this.currentPath.length === 0) {
			return Vec2.zero;
		}

		if (this.currentPathIndex >= this.currentPath.length) {
			if (this.aiState === EnemyAIState.Patrol) {
				this.pickNextPatrolPoint();
			}
			return Vec2.zero;
		}

		const currentWaypoint = this.currentPath[this.currentPathIndex];
		const myPos = this.transform.worldPosition;

		const dx = currentWaypoint.x - myPos.x;
		const dz = currentWaypoint.z - myPos.z;
		const flatDist = Math.sqrt(dx * dx + dz * dz);

		if (flatDist <= this.arrivalThreshold) {
			this.currentPathIndex++;

			if (this.currentPathIndex >= this.currentPath.length) {
				if (this.aiState === EnemyAIState.Patrol) {
					this.pickNextPatrolPoint();
				}
				return Vec2.zero;
			}
		}

		let moveTarget: Vec3 = this.currentPath[this.currentPathIndex];

		if (this.aiState === EnemyAIState.Chase && this.navMeshComponent) {
			moveTarget = this.getSmoothedChaseTarget(myPos, moveTarget);
		}

		const toTargetX = moveTarget.x - myPos.x;
		const toTargetZ = moveTarget.z - myPos.z;
		const flatMag = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ);
		if (flatMag < 0.0001) {
			return Vec2.zero;
		}
		const invMag = 1 / flatMag;
		return new Vec2(toTargetX * invMag * speed, -(toTargetZ * invMag) * speed);
	}

	/**
	 * During chase, attempts to skip intermediate waypoints by raycasting along
	 * the navmesh surface. Checks in order:
	 * 1. Direct to the chase target (player position)
	 * 2. Later waypoints in the path (from end backward)
	 * If a clear navmesh path exists, returns that position instead of the
	 * current sequential waypoint, producing straighter movement.
	 */
	private getSmoothedChaseTarget(myPos: Vec3, fallbackWaypoint: Vec3): Vec3 {
		if (!this.navMeshComponent) {
			return fallbackWaypoint;
		}

		if (this.chaseTarget) {
			const targetTransform = this.chaseTarget.getComponent(TransformComponent);
			if (targetTransform) {
				const targetPos = targetTransform.worldPosition;
				if (this.isNavMeshPathClear(myPos, targetPos)) {
					return targetPos;
				}
			}
		}

		for (let i = this.currentPath.length - 1; i > this.currentPathIndex; i--) {
			if (this.isNavMeshPathClear(myPos, this.currentPath[i])) {
				this.currentPathIndex = i;
				return this.currentPath[i];
			}
		}

		return fallbackWaypoint;
	}

	/**
	 * Uses NavMeshComponent.raycast() to check if the navmesh surface path
	 * between two points is clear (no non-walkable edges in the way).
	 */
	private isNavMeshPathClear(from: Vec3, to: Vec3): boolean {
		if (!this.navMeshComponent) {
			return false;
		}

		const diffX = to.x - from.x;
		const diffZ = to.z - from.z;
		const dist = Math.sqrt(diffX * diffX + diffZ * diffZ);

		if (dist < 0.1) {
			return true;
		}

		const invDist = 1 / dist;
		const direction = new Vec3(diffX * invDist, 0, diffZ * invDist);
		const result = this.navMeshComponent.raycast(from, direction, dist, {
			maxSearchDistance: 3.0,
		});

		if (!result.hit && result.distance >= dist - 0.1) {
			return true;
		}

		return false;
	}
	// #endregion

	// #region FOV detection
	private runFovCheck(): void {
		if (!this.fov || this.fovCheckInProgress) {
			return;
		}

		const unsafePlayers = this.players.filter((p: Entity): boolean => {
			if (ElevatorSafeZone.isPlayerSafe(p)) {
				return false;
			}
			// Skip dead players
			if (p.getComponent(PlayerLogic)?.isDead) {
				return false;
			}
			return true;
		});
		if (unsafePlayers.length === 0) {
			this.lastDetectionState = EnemyDetectionState.Idle;
			this.lastVisiblePlayer = null;
			return;
		}

		this.fovCheckInProgress = true;
		this.fov.getNearestVisiblePlayerAsync(unsafePlayers).then((result): void => {
			this.fovCheckInProgress = false;
			this.lastDetectionState = result.state;
			this.lastVisiblePlayer = result.visiblePlayer;

			if (this.debugDisplay) {
				if (result.state === EnemyDetectionState.Idle) {
					this.debugDisplay.setDetection("Idle");
					this.debugDisplay.setBlockedBy("");
				} else if (result.state === EnemyDetectionState.AlertOccluded) {
					this.debugDisplay.setDetection("Alert+");
					this.debugDisplay.setBlockedBy(result.blockedByName);
				} else if (result.state === EnemyDetectionState.Alert) {
					this.debugDisplay.setDetection("Alert");
					this.debugDisplay.setBlockedBy("");
				}
			}
		}).catch((error: unknown): void => {
			this.fovCheckInProgress = false;

		});
	}
	// #endregion

	// #region State transitions
	private updateStateTransitions(): void {
		if (this.aiState === EnemyAIState.Patrol) {
			if (this.lastDetectionState === EnemyDetectionState.Alert && this.lastVisiblePlayer) {
				if (!ElevatorSafeZone.isPlayerSafe(this.lastVisiblePlayer)) {
					this.aiState = EnemyAIState.Chase;
					this.chaseTarget = this.lastVisiblePlayer;
					this.chaseRepathTimer = EnemyLogic.CHASE_REPATH_INTERVAL;
					this.resetStuckTracking();
					this.requestPathToEntity(this.chaseTarget, this.chaseSpeed);
					if (this.alertEntity) {
						this.alertEntity.enabledSelf = true;
					}
					this.debugDisplay?.setState("Chase");

				}
			}
		} else if (this.aiState === EnemyAIState.Chase) {
			if (this.chaseTarget && ElevatorSafeZone.isPlayerSafe(this.chaseTarget)) {
				this.transitionToWaitAtDoor();
				return;
			}

			// Stop chasing dead players
			if (this.chaseTarget?.getComponent(PlayerLogic)?.isDead) {
				this.aiState = EnemyAIState.Patrol;
				this.chaseTarget = null;
				if (this.alertEntity) {
					this.alertEntity.enabledSelf = false;
				}
				this.debugDisplay?.setState("Patrol");
				this.resetStuckTracking();
				this.pickNextPatrolPoint();
				return;
			}

			if (this.chaseTarget && this.transform) {
				const targetTransform = this.chaseTarget.getComponent(TransformComponent);
				if (targetTransform) {
					const dist = this.transform.worldPosition.distance(targetTransform.worldPosition);
					if (dist <= this.attackRange) {
						this.aiState = EnemyAIState.Attack;
						this.attackCooldownTimer = 0;
						this.debugDisplay?.setState("Attack");

						return;
					}
				}
			}

			let shouldLose = false;
			if (!this.chaseTarget) {
				shouldLose = true;
			} else if (this.transform) {
				const targetTransform = this.chaseTarget.getComponent(TransformComponent);
				if (targetTransform) {
					const dist = this.transform.worldPosition.distance(targetTransform.worldPosition);
					if (dist > this.loseChaseDist) {
						shouldLose = true;
					}
				} else {
					shouldLose = true;
				}
			}
			if (shouldLose) {
				this.aiState = EnemyAIState.Patrol;
				this.chaseTarget = null;
				if (this.alertEntity) {
					this.alertEntity.enabledSelf = false;
				}
				this.debugDisplay?.setState("Patrol");
				this.resetStuckTracking();
				this.pickNextPatrolPoint();
			}
		}
	}
	// #endregion

	// #region Stuck detection
	/**
	 * Tracks enemy position over time. If the enemy has moved less than
	 * STUCK_DISTANCE_THRESHOLD in STUCK_TIME_THRESHOLD seconds while in
	 * Patrol or Chase state, it's considered stuck. Picks a new patrol
	 * waypoint and repaths to break free.
	 */
	private updateStuckDetection(deltaTime: number): void {
		if (!this.transform) {
			return;
		}

		this.stuckCheckTimer += deltaTime;

		if (this.stuckCheckTimer >= EnemyLogic.STUCK_TIME_THRESHOLD) {
			const currentPos = this.transform.worldPosition;
			const distMoved = currentPos.distance(this.stuckCheckPosition);

			if (distMoved < EnemyLogic.STUCK_DISTANCE_THRESHOLD) {
				this.isPathfinding = false;

				// Check if stuck near a closed door — attack it instead of giving up
				if (this.aiState === EnemyAIState.Chase) {
					const nearbyDoor = this.findNearbyClosedDoor();
					if (nearbyDoor) {
						this.transitionToAttackDoor(nearbyDoor);
						this.stuckCheckTimer = 0;
						this.stuckCheckPosition = currentPos;
						return;
					}

					this.aiState = EnemyAIState.Patrol;
					this.chaseTarget = null;
					if (this.alertEntity) {
						this.alertEntity.enabledSelf = false;
					}
					this.debugDisplay?.setState("Patrol");
				}

				this.pickNextPatrolPoint();
			}

			this.stuckCheckTimer = 0;
			this.stuckCheckPosition = currentPos;
		}
	}

	/**
	 * Resets stuck detection state. Call on any state transition to avoid false positives.
	 */
	private resetStuckTracking(): void {
		this.stuckCheckTimer = 0;
		if (this.transform) {
			this.stuckCheckPosition = this.transform.worldPosition;
		}
	}
	// #endregion

	// #region WaitAtDoor state logic
	/**
	 * Transitions from Chase to WaitAtDoor: paths toward the player's last
	 * known position (nearest navigable point near the elevator door),
	 * then waits WAIT_AT_DOOR_DURATION seconds before resuming patrol.
	 */
	private transitionToWaitAtDoor(): void {
		this.aiState = EnemyAIState.WaitAtDoor;
		this.waitAtDoorTimer = 0;
		this.waitAtDoorArrived = false;

		if (this.chaseTarget) {
			const targetTransform = this.chaseTarget.getComponent(TransformComponent);
			if (targetTransform) {
				this.requestPathToPosition(targetTransform.worldPosition);
			}
		}

		this.chaseTarget = null;

		if (this.alertEntity) {
			this.alertEntity.enabledSelf = false;
		}
		this.debugDisplay?.setState("WaitAtDoor");
	}

	/**
	 * WaitAtDoor update: follow path to door, then stand and wait, then patrol.
	 */
	private updateWaitAtDoorState(deltaTime: number): void {
		if (!this.actionController) {
			return;
		}

		if (!this.waitAtDoorArrived) {
			const moveInput = this.computePathFollowingInput(this.patrolSpeed);

			if (this.currentPathIndex >= this.currentPath.length || moveInput.magnitudeSquared() < 0.001) {
				this.waitAtDoorArrived = true;
				this.waitAtDoorTimer = 0;
				this.actionController.applyMovementInput(Vec2.zero);

			} else {
				let finalInput: Vec2;
				if (this.movementDisabled) {
					finalInput = Vec2.zero;
				} else {
					finalInput = moveInput;
				}
				this.actionController.applyMovementInput(finalInput);
			}
		} else {
			this.actionController.applyMovementInput(Vec2.zero);
			this.waitAtDoorTimer += deltaTime;

			if (this.waitAtDoorTimer >= EnemyLogic.WAIT_AT_DOOR_DURATION) {
				this.aiState = EnemyAIState.Patrol;
				this.debugDisplay?.setState("Patrol");
				this.pickNextPatrolPoint();

			}
		}
	}
	// #endregion

	// #region AttackDoor state logic
	/**
	 * Find the nearest closed door within a short radius of the enemy.
	 * Used by stuck detection to determine if a door is blocking the path.
	 */
	private findNearbyClosedDoor(): Maybe<Entity> {
		if (!this.transform) {
			return null;
		}

		const myPos = this.transform.worldPosition;
		const doorEntities = EntityService.findEntitiesWithComponent(DoorLogic);
		let closestDoor: Maybe<Entity> = null;
		let closestDist = 4.0; // Max search radius for nearby doors

		for (const doorEntity of doorEntities) {
			const doorLogic = doorEntity.getComponent(DoorLogic);
			if (!doorLogic || !doorLogic.isClosed) {
				continue;
			}

			const doorTransform = doorEntity.getComponent(TransformComponent);
			if (!doorTransform) {
				continue;
			}

			const dist = myPos.distance(doorTransform.worldPosition);
			if (dist < closestDist) {
				closestDist = dist;
				closestDoor = doorEntity;
			}
		}

		return closestDoor;
	}

	/**
	 * Transition to AttackDoor state: path toward the door, then attack it.
	 */
	private transitionToAttackDoor(doorEntity: Entity): void {
		this.aiState = EnemyAIState.AttackDoor;
		this.doorTarget = doorEntity;
		this.doorAttackCooldownTimer = 0;
		this.doorApproachArrived = false;

		const doorTransform = doorEntity.getComponent(TransformComponent);
		if (doorTransform) {
			this.requestPathToPosition(doorTransform.worldPosition);
		}

		this.debugDisplay?.setState("AttackDoor");
	}

	/**
	 * AttackDoor update: approach door, face it, attack on cooldown.
	 * When door breaks (HP=0), transition back to Patrol.
	 * When door opens (player opened it), transition to Chase if target visible.
	 */
	private updateAttackDoorState(deltaTime: number): void {
		if (!this.actionController || !this.transform) {
			return;
		}

		// Validate door target still exists and is closed
		if (!this.doorTarget || !this.doorTarget.valid) {
			this.exitAttackDoorToPatrol();
			return;
		}

		const doorLogic = this.doorTarget.getComponent(DoorLogic);
		if (!doorLogic) {
			this.exitAttackDoorToPatrol();
			return;
		}

		// Door was opened (by player) or broken — stop attacking
		if (doorLogic.isOpen || doorLogic.isBroken) {
			this.exitAttackDoorToPatrol();
			return;
		}

		const doorTransform = this.doorTarget.getComponent(TransformComponent);
		if (!doorTransform) {
			this.exitAttackDoorToPatrol();
			return;
		}

		const myPos = this.transform.worldPosition;
		const doorPos = doorTransform.worldPosition;
		const dist = myPos.distance(doorPos);

		// Approach phase: move toward door until within attack range
		if (!this.doorApproachArrived && dist > this.attackRange) {
			const moveInput = this.computePathFollowingInput(this.chaseSpeed);
			if (this.movementDisabled) {
				this.actionController.applyMovementInput(Vec2.zero);
			} else {
				this.actionController.applyMovementInput(moveInput);
			}
			return;
		}

		// Arrived at door — stop moving and begin attacking
		this.doorApproachArrived = true;
		this.actionController.applyMovementInput(Vec2.zero);

		// Face the door
		const toDoorX = doorPos.x - myPos.x;
		const toDoorZ = doorPos.z - myPos.z;
		const doorFlatMagSq = toDoorX * toDoorX + toDoorZ * toDoorZ;
		if (doorFlatMagSq > 0.001) {
			const invDoorFlatMag = 1 / Math.sqrt(doorFlatMagSq);
			const lookRotation = Quaternion.lookRotation(new Vec3(toDoorX * invDoorFlatMag, 0, toDoorZ * invDoorFlatMag), Vec3.up);
			this.transform.worldRotation = lookRotation;
		}

		// Attack cooldown
		this.doorAttackCooldownTimer -= deltaTime;
		if (this.doorAttackCooldownTimer <= 0) {
			this.doorAttackCooldownTimer = this.attackCooldown;
			this.performDoorAttack(doorLogic);
		}
	}

	/**
	 * Perform a single attack against the door.
	 */
	private performDoorAttack(doorLogic: DoorLogic): void {
		// Play attack animation
		if (this.animator) {
			this.animator.requestTransition(this.attackTransitionName);
		}

		const result = doorLogic.takeDamage({
			baseDamage: this.attackDamage,
			damageType: "melee",
			attacker: this.entity,
		});

		// If door broke, exit to patrol
		if (result.wasFatal) {
			this.exitAttackDoorToPatrol();
		}
	}

	/**
	 * Exit AttackDoor state and return to Patrol.
	 */
	private exitAttackDoorToPatrol(): void {
		this.aiState = EnemyAIState.Patrol;
		this.doorTarget = null;
		this.doorApproachArrived = false;
		if (this.alertEntity) {
			this.alertEntity.enabledSelf = false;
		}
		this.debugDisplay?.setState("Patrol");
		this.resetStuckTracking();
		this.pickNextPatrolPoint();
	}
	// #endregion

	// #region Attack state logic
	/**
	 * Handles the Attack state: face the target, run cooldown timer,
	 * trigger attack animation and deal damage. Transitions back to Chase
	 * if target moves beyond attackDisengageRange.
	 */
	private updateAttackState(deltaTime: number): void {
		if (!this.chaseTarget || !this.transform) {
			this.aiState = EnemyAIState.Patrol;
			this.chaseTarget = null;
			this.debugDisplay?.setState("Patrol");
			this.pickNextPatrolPoint();
			return;
		}

		// Stop attacking dead players
		if (this.chaseTarget.getComponent(PlayerLogic)?.isDead) {
			this.aiState = EnemyAIState.Patrol;
			this.chaseTarget = null;
			if (this.alertEntity) {
				this.alertEntity.enabledSelf = false;
			}
			this.debugDisplay?.setState("Patrol");
			this.pickNextPatrolPoint();
			return;
		}

		const targetTransform = this.chaseTarget.getComponent(TransformComponent);
		if (!targetTransform) {
			this.aiState = EnemyAIState.Patrol;
			this.chaseTarget = null;
			this.pickNextPatrolPoint();
			return;
		}

		const myPos = this.transform.worldPosition;
		const targetPos = targetTransform.worldPosition;
		const dist = myPos.distance(targetPos);

		if (dist > this.attackDisengageRange) {
			this.aiState = EnemyAIState.Chase;
			this.chaseRepathTimer = EnemyLogic.CHASE_REPATH_INTERVAL;
			this.requestPathToEntity(this.chaseTarget, this.chaseSpeed);
			this.debugDisplay?.setState("Chase");

			return;
		}

		// Face the target
		const toTargetX = targetPos.x - myPos.x;
		const toTargetZ = targetPos.z - myPos.z;
		const flatMagSq = toTargetX * toTargetX + toTargetZ * toTargetZ;
		if (flatMagSq > 0.001) {
			const invFlatMag = 1 / Math.sqrt(flatMagSq);
			const lookRotation = Quaternion.lookRotation(new Vec3(toTargetX * invFlatMag, 0, toTargetZ * invFlatMag), Vec3.up);
			this.transform.worldRotation = lookRotation;
		}

		this.attackCooldownTimer -= deltaTime;
		if (this.attackCooldownTimer <= 0) {
			this.attackCooldownTimer = this.attackCooldown;
			this.performAttack();
		}
	}

	/**
	 * Performs a single melee attack: triggers animation and deals damage.
	 */
	private performAttack(): void {
		if (this.animator) {
			this.animator.requestTransition(this.attackTransitionName);
		}

		if (this.chaseTarget) {
			let healthEntity = this.chaseTarget;
			let health = healthEntity.getComponent(PlayerLogic);
			if (!health) {
				const ancestors = healthEntity.getAncestors();
				for (const ancestor of ancestors) {
					health = ancestor.getComponent(PlayerLogic);
					if (health) {
						break;
					}
				}
			}

			if (health) {
				const result = health.takeDamage({
					baseDamage: this.attackDamage,
					damageType: "melee",
					attacker: this.entity,
				});

			} else {
			}
		}
	}
	// #endregion

	// #region Patrol point management
	private cachePatrolPoints(): void {
		const parents = EntityService.findEntitiesWithName(EnemyLogic.PATROL_POINTS_PARENT_NAME);
		if (parents.length === 0) {
			return;
		}

		const parentEntity = parents[0];
		const children = parentEntity.getChildren();

		for (const child of children) {
			const t = child.getComponent(TransformComponent);
			if (t) {
				this.patrolPoints.push(t.worldPosition);
			}
		}
	}

	private pickNextPatrolPoint(): void {
		if (this.patrolPoints.length === 0) {
			this.currentPath = [];
			return;
		}

		let attempts = 0;
		let idx = Math.floor(Math.random() * this.patrolPoints.length);

		while (this.patrolPoints.length > 1 && attempts < 5) {
			const candidate = this.patrolPoints[idx];
			if (candidate.distance(this.currentPatrolTarget) > this.arrivalThreshold) {
				break;
			}
			idx = Math.floor(Math.random() * this.patrolPoints.length);
			attempts++;
		}

		this.currentPatrolTarget = this.patrolPoints[idx];

		this.requestPathToPosition(this.currentPatrolTarget);
	}
	// #endregion

	// #region Player cache
	private refreshPlayers(): void {
		this.players = EntityService.findEntitiesWithComponent(BasePlayerComponent);
	}
	// #endregion

	// #region WaitAtRegularDoor state logic
	/**
	 * Called by DoorTriggerZone when an enemy enters a closed regular door's trigger zone.
	 * Saves current state, stops movement, and waits up to 3 seconds for the door to open.
	 * If door doesn't open in time, forces it open.
	 */
	public onEnteredClosedDoorZone(doorLogic: DoorLogic): void {
		// Guard: if frozen by flashlight, do not enter door-wait state
		if (this.frozenByFlashlight) {
			return;
		}
		// Save current state and chase target
		this.savedStateBeforeDoorWait = this.aiState;
		this.savedChaseTargetBeforeDoorWait = this.chaseTarget;
		this.targetRegularDoorLogic = doorLogic;
		this.regularDoorWaitTimer = 0;

		// Switch to wait state
		this.aiState = EnemyAIState.WaitAtRegularDoor;
		this.currentPath = [];

		if (this.actionController) {
			this.actionController.applyMovementInput(Vec2.zero);
		}

		this.debugDisplay?.setState("WaitAtRegularDoor");
	}

	/**
	 * WaitAtRegularDoor update: check each frame if door opened/broken → resume.
	 * After 3 seconds if still closed → force open then resume.
	 */
	private updateWaitAtRegularDoorState(deltaTime: number): void {
		if (!this.actionController) {
			return;
		}

		// Keep enemy stationary
		this.actionController.applyMovementInput(Vec2.zero);

		// Check if door was opened (by player) or broken → resume immediately
		if (!this.targetRegularDoorLogic || this.targetRegularDoorLogic.isOpen || this.targetRegularDoorLogic.isBroken) {
			this.resumeFromDoorWait();
			return;
		}

		// Count timer
		this.regularDoorWaitTimer += deltaTime;

		if (this.regularDoorWaitTimer >= EnemyLogic.REGULAR_DOOR_WAIT_DURATION) {
			// Force open the door
			this.targetRegularDoorLogic.openDoor();
			this.resumeFromDoorWait();
		}
	}

	/**
	 * Resume from WaitAtRegularDoor: restore saved state and chase target.
	 */
	private resumeFromDoorWait(): void {
		const restoredState = this.savedStateBeforeDoorWait;
		const restoredTarget = this.savedChaseTargetBeforeDoorWait;

		this.targetRegularDoorLogic = null;
		this.savedChaseTargetBeforeDoorWait = null;

		// Validate restored state
		if (restoredState === EnemyAIState.Chase && restoredTarget) {
			// Ensure chase target is still alive
			if (restoredTarget.getComponent(PlayerLogic)?.isDead) {
				this.aiState = EnemyAIState.Patrol;
				this.chaseTarget = null;
				this.debugDisplay?.setState("Patrol");
				this.pickNextPatrolPoint();
			} else {
				this.aiState = EnemyAIState.Chase;
				this.chaseTarget = restoredTarget;
				this.chaseRepathTimer = EnemyLogic.CHASE_REPATH_INTERVAL;
				this.requestPathToEntity(this.chaseTarget, this.chaseSpeed);
				this.debugDisplay?.setState("Chase");
			}
		} else if (restoredState === EnemyAIState.Patrol) {
			this.aiState = EnemyAIState.Patrol;
			this.chaseTarget = null;
			this.debugDisplay?.setState("Patrol");
			this.pickNextPatrolPoint();
		} else {
			// Fallback: go to patrol
			this.aiState = EnemyAIState.Patrol;
			this.chaseTarget = null;
			this.debugDisplay?.setState("Patrol");
			this.pickNextPatrolPoint();
		}

		this.resetStuckTracking();
	}
	// #endregion

	// #region Public API — Activation
	/**
	 * Activate the enemy AI: sets the active gate to true and begins patrol.
	 * Called by GameEnemyManager after spawn + physics enable.
	 */
	public activate(): void {
		this.active = true;
		this.pickNextPatrolPoint();
	}

	/**
	 * Reset ALL mutable runtime state for entity pool reuse.
	 * Called by GameEnemyManager before returning this enemy to the pool.
	 * CRITICAL: Every mutable field must be reset here to avoid state leakage.
	 */
	public resetForPool(): void {
		// Activation gate
		this.active = false;

		// AI state
		this.aiState = EnemyAIState.Patrol;
		this.chaseTarget = null;

		// Patrol (keep patrolPoints — they are scene-derived and will be refreshed on reuse)
		this.currentPatrolTarget = Vec3.zero;

		// NavMesh path
		this.currentPath = [];
		this.currentPathIndex = 0;
		this.isPathfinding = false;

		// Chase repath
		this.chaseRepathTimer = 0;

		// LOD throttle
		this.lodThrottleAccum = 0;

		// Stuck detection
		this.stuckCheckPosition = Vec3.zero;
		this.stuckCheckTimer = 0;

		// WaitAtDoor
		this.waitAtDoorTimer = 0;
		this.waitAtDoorArrived = false;

		// Attack
		this.attackCooldownTimer = 0;

		// Flashlight freeze
		this.frozenByFlashlight = false;
		this.stateBeforeFlashlightFreeze = EnemyAIState.Patrol;

		// AttackDoor
		this.doorTarget = null;
		this.doorAttackCooldownTimer = 0;
		this.doorApproachArrived = false;

		// WaitAtRegularDoor
		this.savedStateBeforeDoorWait = EnemyAIState.Patrol;
		this.savedChaseTargetBeforeDoorWait = null;
		this.regularDoorWaitTimer = 0;
		this.targetRegularDoorLogic = null;

		// FOV async guard
		this.fovCheckInProgress = false;
		this.lastDetectionState = EnemyDetectionState.Idle;
		this.lastVisiblePlayer = null;
		this.fovCheckTimer = 0;

		// Alert indicator
		if (this.alertEntity) {
			this.alertEntity.enabledSelf = false;
		}

		// Movement disabled (reset to template default)
		this.movementDisabled = false;
	}

	/**
	 * Re-cache patrol points from the current sublevel.
	 * Called by GameEnemyManager after re-enabling a pooled enemy in a new sublevel.
	 */
	public refreshPatrolPoints(): void {
		this.patrolPoints = [];
		this.cachePatrolPoints();
	}
	// #endregion

	// #region Public API — Stop state
	/**
	 * Put the enemy into Stop state. While stopped the enemy does not move
	 * and does not run FOV detection. Call resumeFromStop() to return to Patrol.
	 */
	public stop(): void {
		if (this.aiState === EnemyAIState.Stop) {
			return;
		}
		this.aiState = EnemyAIState.Stop;
		this.currentPath = [];
		this.chaseTarget = null;
		this.debugDisplay?.setState("Stop");

	}

	/**
	 * Resume normal behavior (Patrol) after being stopped.
	 */
	public resumeFromStop(): void {
		if (this.aiState !== EnemyAIState.Stop) {
			return;
		}
		// Clear flashlight freeze flag — a game-phase resume always takes priority.
		// If the enemy was frozen by flashlight when Settlement triggered, the flag
		// would otherwise remain true, causing the next freezeByFlashlight() call to
		// silently no-op (double-freeze guard fires incorrectly).
		this.frozenByFlashlight = false;
		this.aiState = EnemyAIState.Patrol;
		this.debugDisplay?.setState("Patrol");
		this.pickNextPatrolPoint();
	}

	/** Returns the current AI state. */
	public getAIState(): EnemyAIState {
		return this.aiState;
	}
	// #endregion

	// #region Public API — Flashlight freeze
	/**
	 * Freeze this enemy via flashlight. Saves current state and enters Stop.
	 * Guards against double-freeze and does nothing if already in game-phase Stop.
	 */
	public freezeByFlashlight(): void {
		if (this.frozenByFlashlight) {
			return;
		}
		// If already in Stop from game-phase, don't override
		if (this.aiState === EnemyAIState.Stop) {
			return;
		}
		this.stateBeforeFlashlightFreeze = this.aiState;
		this.frozenByFlashlight = true;
		this.aiState = EnemyAIState.Stop;
		this.currentPath = [];
		// Preserve chaseTarget during WaitAtRegularDoor so resumeFromDoorWait can restore it
		if (this.stateBeforeFlashlightFreeze !== EnemyAIState.WaitAtRegularDoor) {
			this.chaseTarget = null;
		}
		this.debugDisplay?.setState("Stop(Flash)");
	}

	/**
	 * Resume from flashlight freeze. Restores the state that was active before freeze.
	 * Does nothing if not currently frozen by flashlight.
	 */
	public resumeFromFlashlight(): void {
		if (!this.frozenByFlashlight) {
			return;
		}
		this.frozenByFlashlight = false;
		this.aiState = this.stateBeforeFlashlightFreeze;

		if (this.aiState === EnemyAIState.Patrol) {
			this.debugDisplay?.setState("Patrol");
			this.pickNextPatrolPoint();
		} else if (this.aiState === EnemyAIState.Chase) {
			this.debugDisplay?.setState("Chase");
			this.chaseRepathTimer = EnemyLogic.CHASE_REPATH_INTERVAL;
		} else if (this.aiState === EnemyAIState.WaitAtRegularDoor) {
			// Resume back into WaitAtRegularDoor — keep the door-wait timer running
			this.debugDisplay?.setState("WaitAtRegularDoor");
		} else {
			this.debugDisplay?.setState("Patrol");
			this.aiState = EnemyAIState.Patrol;
			this.pickNextPatrolPoint();
		}
	}

	/** Returns whether this enemy is currently frozen by flashlight. */
	public get isFrozenByFlashlight(): boolean {
		return this.frozenByFlashlight;
	}
	// #endregion
}
