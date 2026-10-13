/**
 * ThirdPersonCamera - Input-driven third-person camera with collision avoidance.
 *
 * Component Attachment: Scene entity (NOT on player) - must have CameraPlatformComponent
 * Component Networking: Local (camera is client-only)
 * Component Ownership: Not networked - runs on all clients locally
 *
 * Based on BBArena's third-person camera with angle-space smoothing to prevent
 * quaternion hemisphere-crossing oscillation during rapid rotation.
 *
 * Control scheme:
 * - RIGHT STICK / MOUSE: Control camera yaw (horizontal) and pitch (vertical)
 * - Camera orbits around the player at a configurable distance and height
 * - Movement scripts should use CameraService.get().forward for camera-relative movement
 *
 * Exposes inputToWorldDirection() for converting screen-relative input to world direction
 * for movement scripts.
 *
 * Usage:
 * 1. Create a "Camera" entity in the scene
 * 2. Add CameraPlatformComponent to it
 * 3. Add this ThirdPersonCamera script component
 * 4. In movement scripts, use CameraService.get().forward or
 *    ThirdPersonCamera.get()?.inputToWorldDirection(inputX, inputY)
 *
 * NOTE: This camera subscribes to PlayerInputAxis.Right. If using
 * ThirdPersonControllerInputAligned (which also subscribes to Right for player
 * rotation), there will be an input conflict. The default CharacterUpdateManager
 * + MovementAbility system does NOT use the right stick, so there is no conflict
 * with the default setup.
 */

import type {
	Entity,
	Maybe,
	RayCastInput,
	PlayerInputSubscription,
} from "meta/worlds";
import {
	CameraComponent,
	CameraMode,
	CameraService,
	CastMode,
	CollisionLayer,
	Component,
	component,
	editor,
	EntityService,
	ExecuteOn,
	lerp,
	NetworkingService,
	OnEntityStartEvent,
	OnLateWorldUpdateEvent,
	OnPlayerCreateEvent,
	OnWorldUpdateEventPayload,
	PhysicsBodyComponent,
	PhysicsBodyType,
	PhysicsService,
	PlayerInputAxis,
	PlayerInputAxisCallbackPayload,
	PlayerInputService,
	PlayerService,
	property,
	Quaternion,
	SceneHitData,
	Service,
	subscribe,
	TransformComponent,
	Vec3,
} from "meta/worlds";

/**
 * Camera collision state machine (matching C++ CameraCollision implementation).
 * States: NoCollision -> Collided -> WaitingToReturn -> Returning
 */
enum CameraCollisionState {
	NoCollision = 0,
	Collided = 1,
	WaitingToReturn = 2,
	Returning = 3,
}

@component({
	description:
		"Input-driven third-person camera with collision avoidance and angle-space smoothing",
})
export class ThirdPersonCamera extends Component {
	// #region Static constants
	private static readonly RETURN_DELAY = 0.5;
	private static readonly RETURN_DURATION = 0.75;
	// #endregion

	// #region Static singleton
	private static instance: Maybe<ThirdPersonCamera> = null;

	/**
	 * Get the ThirdPersonCamera instance.
	 * Use this from movement scripts to access inputToWorldDirection().
	 */
	public static get(): Maybe<ThirdPersonCamera> {
		return ThirdPersonCamera.instance;
	}
	// #endregion

	// #region Services
	private playerService = Service.inject(PlayerService);
	private playerInputService = Service.inject(PlayerInputService);
	private physicsService = Service.inject(PhysicsService);
	// #endregion

	// #region Target & Transform References
	private targetEntity: Maybe<Entity> = null;
	private targetTransform: Maybe<TransformComponent> = null;
	private cameraTransform: Maybe<TransformComponent> = null;
	private inputSubscription: Maybe<PlayerInputSubscription> = null;
	// #endregion

	// #region Input State: Raw accumulated yaw/pitch
	private currentYaw: number = 0;
	private currentPitch: number = 0;
	// #endregion

	// #region Angle-Space Smoothing
	private smoothedYaw: number = 0;
	private smoothedPitch: number = 0;
	private lastSmoothedPosition: Maybe<Vec3> = null;
	private cachedRaycastResult: {hasCollision: boolean; hitDistance: number} = {
		hasCollision: false,
		hitDistance: 0,
	};
	// #endregion

	// #region Collision State Machine
	private collisionState: CameraCollisionState = CameraCollisionState.NoCollision;
	private currentCollisionDistance: number = 0;
	private closestCollisionDistance: number = 0;
	private uncollidedDistance: number = 0;
	private returnTimer: number = 0;
	private collisionFactor: number = 0;
	private collisionLayerMask: number = 0;
	// #endregion

	// #region Configurable Properties
	/** Distance behind the player in world units */
	@editor({show: true})
	@property()
	public targetDistance: number = 8;

	/** Height offset above the player (shoulder/head level) */
	@editor({show: true})
	@property()
	public shoulderHeight: number = 1.8;

	/** Horizontal offset for over-the-shoulder view (0 = centered) */
	@editor({show: true})
	@property()
	public shoulderOffset: number = 0;

	/** Base rotation offset applied before input rotation */
	@editor({show: true})
	@property()
	public rotationOffset: Quaternion = new Quaternion(0, 0, 0, 1);

	/** Translation smoothing speed. Higher = faster follow. */
	@editor({show: true})
	@property()
	public translationSpeed: number = 5;

	/**
	 * Rotation smoothing speed. Higher = snappier rotation.
	 * Uses exponential decay in angle-space: lerp = 1 - pow(4, -speed * dt)
	 */
	@editor({show: true})
	@property()
	public rotationSpeed: number = 8;

	/** Mouse/stick sensitivity for camera rotation */
	@editor({show: true})
	@property()
	public mouseSensitivity: number = 100;

	/** Minimum pitch angle in degrees (looking up, negative = up) */
	@editor({show: true})
	@property()
	public minPitch: number = -80;

	/** Maximum pitch angle in degrees (looking down) */
	@editor({show: true})
	@property()
	public maxPitch: number = 5;

	/** Default yaw angle on start (degrees, 0 = -Z forward) */
	@editor({show: true})
	@property()
	public defaultYaw: number = 0;

	/** Default pitch angle on start (negative = looking slightly down) */
	@editor({show: true})
	@property()
	public defaultPitch: number = -15;

	/** Enable camera collision avoidance */
	@editor({show: true})
	@property()
	public enableCollision: boolean = true;

	/** Collision sphere radius for raycasting */
	@editor({show: true})
	@property()
	public collisionRadius: number = 0.1;

	/** Maximum number of unsorted raycast hits to process */
	@property()
	public numRaycastAttempts: number = 9;

	/** Collision layers to check against */
	@editor({show: true})
	@property()
	public readonly collisionLayers: readonly CollisionLayer[] = [
		CollisionLayer.Layer2,
	];

	/** Field of view in degrees */
	@editor({show: true})
	@property()
	public fieldOfView: number = 60;
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, {execution: ExecuteOn.Everywhere})
	public onStart(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		ThirdPersonCamera.instance = this;

		this.cameraTransform = this.entity.getComponent(TransformComponent);

		this.refreshTarget();

		// Subscribe to right stick/mouse for camera rotation
		this.inputSubscription =
			this.playerInputService.subscribePlayerInputAxis(
				this,
				PlayerInputAxis.Right,
				this.onCameraInput.bind(this),
			);

		// Initialize yaw from SpawnPoint's world rotation Y-axis, fallback to defaultYaw
		this.currentYaw = this.getSpawnPointYaw();
		this.currentPitch = this.defaultPitch;
		this.smoothedYaw = this.currentYaw;
		this.smoothedPitch = this.currentPitch;

		// Set up collision layer mask
		this.collisionLayerMask = 0;
		for (const layer of this.collisionLayers) {
			this.collisionLayerMask |= 1 << layer;
		}
		if (this.enableCollision && this.collisionLayerMask === 0) {
			this.enableCollision = false;
		}

		this.activateCustomCamera();
	}

	/**
	 * Re-acquire target and re-activate camera after player spawns.
	 * The engine resets camera mode on player creation.
	 */
	@subscribe(OnPlayerCreateEvent, {execution: ExecuteOn.Everywhere})
	public onPlayerCreate(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		this.refreshTarget();
		// Re-read SpawnPoint yaw on player create to reset camera facing
		const spawnYaw = this.getSpawnPointYaw();
		this.currentYaw = spawnYaw;
		this.smoothedYaw = spawnYaw;
		this.activateCustomCamera();
	}

	/**
	 * Reset camera angles to SpawnPoint yaw + default pitch.
	 * Called by GamePhaseManager after teleporting the player during level transitions.
	 */
	public resetCamera(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		const spawnYaw = this.getSpawnPointYaw();
		this.currentYaw = spawnYaw;
		this.currentPitch = this.defaultPitch;
		this.smoothedYaw = spawnYaw;
		this.smoothedPitch = this.defaultPitch;
		this.lastSmoothedPosition = null;
	}
	// #endregion

	// #region Update Loop
	@subscribe(OnLateWorldUpdateEvent, {execution: ExecuteOn.Everywhere})
	public onLateUpdate(event: OnWorldUpdateEventPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		this.updateAttachedCamera(event.deltaTime);
	}
	// #endregion

	// #region Camera Input
	private onCameraInput(data: PlayerInputAxisCallbackPayload): void {
		if (!data.value) {
			return;
		}

		const deltaYaw = -data.value.x * this.mouseSensitivity * 0.01;
		const deltaPitch = -data.value.y * this.mouseSensitivity * 0.01;

		this.currentYaw += deltaYaw;
		this.currentPitch += deltaPitch;
		this.currentPitch = Math.max(
			this.minPitch,
			Math.min(this.maxPitch, this.currentPitch),
		);
	}
	// #endregion

	// #region Camera Update with Angle-Space Smoothing
	private updateAttachedCamera(deltaTime: number): void {
		if (!this.targetEntity || !this.targetTransform) {
			this.refreshTarget();
			return;
		}

		const targetPosition = this.targetTransform.worldPosition;
		const targetScale = this.targetTransform.worldScale;
		const maxScale = Math.max(targetScale.x, targetScale.y, targetScale.z);

		// Calculate pivot position (target + shoulder height)
		const pivotPosition = targetPosition.add(
			new Vec3(0, this.shoulderHeight * maxScale, 0),
		);

		// Local-space offsets (reused for smoothed rotation and distance math)
		const shoulderOffsetLocal = new Vec3(
			this.shoulderOffset * maxScale,
			0,
			0,
		);
		const backwardLocal = new Vec3(0, 0, this.targetDistance * maxScale);

		// Smooth yaw and pitch angles directly rather than slerping quaternions.
		// Angle-space smoothing avoids hemisphere-crossing oscillation entirely.
		if (this.rotationSpeed > 0) {
			const rotationLerp =
				1.0 - Math.pow(4.0, -this.rotationSpeed * deltaTime);
			this.smoothedYaw +=
				(this.currentYaw - this.smoothedYaw) * rotationLerp;
			this.smoothedPitch +=
				(this.currentPitch - this.smoothedPitch) * rotationLerp;
		} else {
			this.smoothedYaw = this.currentYaw;
			this.smoothedPitch = this.currentPitch;
		}

		// Build rotation from smoothed angles (not from raw input + slerp)
		const yawRotation = Quaternion.fromEuler(
			new Vec3(0, this.smoothedYaw, 0),
		);
		const pitchRotation = Quaternion.fromEuler(
			new Vec3(this.smoothedPitch, 0, 0),
		);
		const smoothedInputRotation = yawRotation.mul(pitchRotation);
		const finalRotation = this.rotationOffset.mul(smoothedInputRotation);

		// Derive orbit position from the smoothed rotation.
		const smoothedShoulder = finalRotation.mulVec3(shoulderOffsetLocal);
		const smoothedBackward = finalRotation.mulVec3(backwardLocal);
		const orbitPosition = pivotPosition
			.add(smoothedShoulder)
			.add(smoothedBackward);

		// Collision uses the previous frame's raycast distance and dispatches a
		// new raycast for the next frame. The one-frame lag is imperceptible
		// because the collision state machine already smooths transitions.
		const finalCameraPosition = this.updateCameraCollision(
			pivotPosition,
			orbitPosition,
			maxScale,
			deltaTime,
		);

		// Smoothly interpolate radial distance for collision-induced zoom
		let finalPosition = finalCameraPosition;
		if (this.translationSpeed > 0) {
			const translationLerp =
				1.0 - Math.pow(4.0, -this.translationSpeed * deltaTime);
			const orbitOffset = orbitPosition.sub(pivotPosition);
			const orbitMag = orbitOffset.magnitude();
			const desiredMag = finalCameraPosition.sub(pivotPosition).magnitude();
			const currentMag = (this.lastSmoothedPosition ?? finalCameraPosition)
				.sub(pivotPosition)
				.magnitude();
			const smoothedMag =
				currentMag + (desiredMag - currentMag) * translationLerp;

			if (orbitMag > 0.001) {
				finalPosition = pivotPosition.add(
					orbitOffset.mul(smoothedMag / orbitMag),
				);
			} else {
				finalPosition = orbitPosition;
			}
		}

		// Store smoothed position for next frame's distance interpolation
		this.lastSmoothedPosition = finalPosition;

		// Update camera transform
		if (this.cameraTransform) {
			this.cameraTransform.worldPosition = finalPosition;
			this.cameraTransform.worldRotation = finalRotation;
		}
	}
	// #endregion

	// #region Camera Collision
	/**
	 * Uses the previous frame's raycast result and dispatches a new raycast
	 * (fire-and-forget) for the next frame.
	 */
	private updateCameraCollision(
		pivotPosition: Vec3,
		desiredCameraPosition: Vec3,
		scale: number,
		deltaTime: number,
	): Vec3 {
		if (!this.enableCollision) {
			return desiredCameraPosition;
		}

		const direction = desiredCameraPosition.sub(pivotPosition);
		const rayDirection = direction.normalize();
		this.uncollidedDistance = direction.magnitude();
		this.currentCollisionDistance = this.uncollidedDistance;

		// Use the previous frame's raycast result
		if (this.cachedRaycastResult.hasCollision) {
			this.currentCollisionDistance = Math.max(
				0,
				Math.min(this.cachedRaycastResult.hitDistance, this.uncollidedDistance),
			);
		}

		// Dispatch a new raycast for the next frame (fire-and-forget)
		void this.dispatchCollisionRaycast(
			pivotPosition,
			rayDirection,
			this.uncollidedDistance,
			scale,
		);

		// Update collision state machine
		this.updateCollisionState(
			this.cachedRaycastResult.hasCollision,
			deltaTime,
		);

		// Calculate final camera position with collision adjustment
		const collidedPosition = pivotPosition.add(
			rayDirection.mul(this.closestCollisionDistance),
		);
		return Vec3.lerp(
			desiredCameraPosition,
			collidedPosition,
			this.collisionFactor,
		);
	}

	/**
	 * Dispatches an async raycast and caches the result for the next frame.
	 */
	private async dispatchCollisionRaycast(
		origin: Vec3,
		direction: Vec3,
		distance: number,
		scale: number,
	): Promise<void> {
		this.cachedRaycastResult =
			await this.raycastToClosestObstructingObject(
				origin,
				direction,
				distance,
				scale,
			);
	}

	/**
	 * Performs raycast to detect closest obstructing object.
	 * Filters out the target entity and non-static physics bodies.
	 */
	private async raycastToClosestObstructingObject(
		origin: Vec3,
		direction: Vec3,
		distance: number,
		scale: number,
	): Promise<{hasCollision: boolean; hitDistance: number}> {
		try {
			const raycastInput: RayCastInput = {
				origin: origin,
				dir: direction,
				distance: distance * scale,
				mode: CastMode.UnsortedHits,
				maxUnsortedHits: this.numRaycastAttempts,
				collisionLayerMask: this.collisionLayerMask,
			};

			const castOutput = await this.physicsService.rayCast(raycastInput);

			if (
				castOutput.hasHitSomething &&
				castOutput.hits &&
				castOutput.hits.length > 0
			) {
				let closestHit: Maybe<SceneHitData> = null;
				for (const hit of castOutput.hits) {
					// Skip hits on the target entity (player)
					if (
						hit.actorEntity === this.targetEntity ||
						hit.shapeEntity === this.targetEntity
					) {
						continue;
					}

					// Only collide with static objects (walls, floors, etc.)
					const physicsBody =
						hit.actorEntity?.getComponent(PhysicsBodyComponent);
					if (
						physicsBody &&
						physicsBody.type !== PhysicsBodyType.StaticCollision
					) {
						continue;
					}

					if (closestHit === null || hit.distance < closestHit.distance) {
						closestHit = hit;
					}
				}

				if (closestHit) {
					const hitDistance = Math.min(closestHit.distance, distance);
					return {
						hasCollision: true,
						hitDistance: hitDistance,
					};
				}
			}
		} catch (error) {
			// Camera collision raycast failed
		}

		return {
			hasCollision: false,
			hitDistance: 0,
		};
	}

	/**
	 * Updates collision state machine (matching C++ CameraCollision implementation).
	 */
	private updateCollisionState(
		isColliding: boolean,
		deltaTime: number,
	): void {
		if (
			isColliding &&
			(this.collisionState === CameraCollisionState.NoCollision ||
				this.requiresNewCollision())
		) {
			this.triggerNewCollision();
			return;
		}

		if (this.collisionState === CameraCollisionState.NoCollision) {
			// Nothing to do
		} else if (this.collisionState === CameraCollisionState.Collided) {
			this.collisionState = CameraCollisionState.WaitingToReturn;
			this.returnTimer = ThirdPersonCamera.RETURN_DELAY;
		} else if (this.collisionState === CameraCollisionState.WaitingToReturn) {
			this.returnTimer -= deltaTime;
			if (this.returnTimer <= 0) {
				this.collisionState = CameraCollisionState.Returning;
				this.returnTimer = ThirdPersonCamera.RETURN_DURATION;
			}
		} else if (this.collisionState === CameraCollisionState.Returning) {
			this.returnTimer = Math.max(0, this.returnTimer - deltaTime);
			const t = this.inverseLerp(
				0,
				ThirdPersonCamera.RETURN_DURATION,
				this.returnTimer,
			);
			this.collisionFactor = this.smoothStep(0, 1, t);

			if (this.returnTimer === 0) {
				if (isColliding && this.requiresNewCollision()) {
					this.triggerNewCollision();
				} else {
					this.collisionState = CameraCollisionState.NoCollision;
					this.closestCollisionDistance = 0;
				}
			}
		}
	}

	private requiresNewCollision(): boolean {
		return this.currentCollisionDistance <= this.getReturningDistance();
	}

	private getReturningDistance(): number {
		return lerp(
			this.uncollidedDistance,
			this.closestCollisionDistance,
			this.collisionFactor,
		);
	}

	private triggerNewCollision(): void {
		this.collisionState = CameraCollisionState.Collided;
		this.closestCollisionDistance = this.currentCollisionDistance;
		this.returnTimer = 0;
		this.collisionFactor = 1;
	}
	// #endregion

	// #region Math Utilities
	private inverseLerp(a: number, b: number, value: number): number {
		return (value - a) / (b - a);
	}

	private smoothStep(edge0: number, edge1: number, x: number): number {
		const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
		return t * t * (3 - 2 * t);
	}
	// #endregion

	// #region Helper Methods
	/**
	 * Reads SpawnPoint's world rotation Y-axis euler angle to use as initial camera yaw.
	 * Falls back to defaultYaw if SpawnPoint is not found.
	 */
	private getSpawnPointYaw(): number {
		const spawnPoints = EntityService.findEntitiesWithName("SpawnPoint");
		if (spawnPoints.length > 0) {
			const spawnTransform = spawnPoints[0].getComponent(TransformComponent);
			if (spawnTransform) {
				const euler = spawnTransform.worldRotation.toEuler();
				return euler.y;
			}
		}
		return this.defaultYaw;
	}

	private refreshTarget(): void {
		const localPlayer = this.playerService.getLocalPlayer();
		if (!localPlayer) {
			return;
		}

		this.targetEntity = localPlayer;
		this.targetTransform = localPlayer.getComponent(TransformComponent);
		this.cameraTransform = this.entity.getComponent(TransformComponent);
	}

	private activateCustomCamera(): void {
		const cameraComponent = this.entity.getComponent(CameraComponent);
		if (!cameraComponent) {
			return;
		}

		CameraService.get().setCameraMode(CameraMode.Custom, {
			camera: cameraComponent,
			fov: this.fieldOfView,
			duration: 0.3,
		});
	}
	// #endregion

	// #region Public API
	/**
	 * Convert screen-relative input to world direction.
	 * Projects camera forward/right onto XZ plane for horizontal movement.
	 *
	 * @param inputX - Horizontal input (-1 to 1, positive = right on screen)
	 * @param inputY - Vertical input (-1 to 1, positive = forward on screen)
	 * @returns World-space direction vector (Y = 0, normalized)
	 */
	public inputToWorldDirection(inputX: number, inputY: number): Vec3 {
		if (!this.cameraTransform) {
			const fallback = new Vec3(inputX, 0, inputY);
			if (fallback.magnitudeSquared() > 0.001) {
				return fallback.normalize();
			}
			return Vec3.zero;
		}

		const rotation = this.cameraTransform.worldRotation;

		// Get camera forward and right in world space
		const camForward = rotation.mulVec3(Vec3.forward);
		const camRight = rotation.mulVec3(Vec3.right);

		// Project to XZ plane for horizontal movement
		const fwdMagSq = camForward.x * camForward.x + camForward.z * camForward.z;
		const rightMagSq = camRight.x * camRight.x + camRight.z * camRight.z;

		if (fwdMagSq < 0.001 || rightMagSq < 0.001) {
			const fallback = new Vec3(inputX, 0, inputY);
			if (fallback.magnitudeSquared() > 0.001) {
				return fallback.normalize();
			}
			return Vec3.zero;
		}

		const fwdInvMag = 1 / Math.sqrt(fwdMagSq);
		const rightInvMag = 1 / Math.sqrt(rightMagSq);

		// inputY = forward on screen, inputX = right on screen
		const dir = new Vec3(
			camForward.x * fwdInvMag * inputY + camRight.x * rightInvMag * inputX,
			0,
			camForward.z * fwdInvMag * inputY + camRight.z * rightInvMag * inputX,
		);

		const mag = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
		if (mag > 0.001) {
			return dir.mul(1 / mag);
		}
		return Vec3.zero;
	}
	// #endregion
}
