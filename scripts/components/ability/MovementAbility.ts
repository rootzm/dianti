/**
 * MovementAbility - Abstract base class for movement abilities
 *
 * Handles ground movement with acceleration curves, legacy damping,
 * and camera-relative directional input. Subclasses override rotation behavior.
 *
 * Component Attachment: Player or Enemy root entity
 * Component Networking: Local (runs on owner)
 * Component Ownership: Owner of the character entity
 */

import {
	CameraService,
	CharacterControllerBase,
	property,
	TransformComponent,
	Vec2,
	Vec3,
	type Entity,
	type Maybe
} from "meta/worlds";
import { CharacterForceControllerBase } from "../../controllers/CharacterForceControllerBase";
import { ICharacterInitializable } from "../../controllers/ICharacterInitializable";
import { AccelerationCurve, type AccelerationConfig } from "../../utils/AccelerationCurve";
import { WorldsGroundInfoComponent } from "../physics/WorldsGroundInfoComponent";

/** Normalized 2D input vector shape */
interface NormalizedInput2D {
	x: number;
	y: number;
}

/**
 * Abstract base class for movement abilities.
 * Not decorated with @component() - subclasses must provide the @component() decorator.
 */
export abstract class MovementAbility extends ICharacterInitializable {
	@property()
	public moveSpeed: number = 5.0;

	@property()
	public rotationSpeed: number = 2.0;

	// #region Acceleration Properties
	/** Enable smooth acceleration/deceleration */
	@property()
	public enableAcceleration: boolean = true;

	/** Time to accelerate from 0 to max speed (seconds) */
	@property()
	public accelerationTime: number = 0.1;

	/** Multiplier for acceleration time when in air (higher = slower) */
	@property()
	public airControlFactor: number = 2.0;

	/** Factor applied when changing direction >90 degrees or stopping */
	@property()
	public decelerationFactor: number = 2.0;
	// #endregion

	// #region Force-Based Movement
	/**
	 * When true, use CharacterForceControllerBase.addForce instead of
	 * KinematicCharacterComponent.addMoveDelta.
	 */
	@property()
	public useForceAsInputs: boolean = false;
	// #endregion

	// #region Slide Direction Lock Properties
	@property()
	public slideDirectionLockEnabled: boolean = false;

	/**
	 * When enabled, the character faces the camera forward direction
	 * instead of the movement direction, allowing strafe animations.
	 */
	@property()
	public strafeMode: boolean = false;

	@property()
	public slideDirectionLockThreshold: number = 0.3;

	protected kcc: Maybe<CharacterControllerBase> = null;
	protected cfc!: CharacterForceControllerBase;
	protected groundInfoComponent!: WorldsGroundInfoComponent;
	protected transformComponent!: TransformComponent;

	public currentInput: Vec2 = Vec2.zero;

	private readonly stopDamping: number = 15.0;

	protected lastValidHorizontalForward: Vec3 = Vec3.forward;

	private movementBlocked: boolean = false;
	private initialized: boolean = false;
	private speedMultiplier: number = 1.0;

	/**
	 * When true, releasing input instantly sets velocity to zero (no legacy damping).
	 * Subclasses set this to skip the gradual deceleration and avoid
	 * the Speed variable passing through walk animation thresholds.
	 */
	protected instantStop: boolean = false;

	// Acceleration system
	private accelerationCurve!: AccelerationCurve;

	// Slide direction lock state
	private slideDirectionLocked: boolean = false;
	private lockedWorldDirection: Vec3 = Vec3.forward;

	// Legacy damping velocity tracking (used when enableAcceleration is false)
	private legacyVelocity: Vec3 = Vec3.zero;

	// Stores the last requested velocity based on current input
	private lastDesiredVelocity: Vec3 = Vec3.zero;

	public setSpeedMultiplier(multiplier: number): void {
		this.speedMultiplier = multiplier;
	}

	public getSpeedMultiplier(): number {
		return this.speedMultiplier;
	}

	public initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		this.kcc = characterSimulatedEntity.getComponent(CharacterControllerBase);
		this.cfc = characterSimulatedEntity.getComponentOrThrow(CharacterForceControllerBase);
		this.groundInfoComponent = characterSimulatedEntity.getComponentOrThrow(WorldsGroundInfoComponent);
		this.transformComponent = characterRootEntity.getComponentOrThrow(TransformComponent);

		// Initialize acceleration curve with property values
		this.accelerationCurve = new AccelerationCurve({
			accelerationTime: this.accelerationTime,
			airControlFactor: this.airControlFactor,
			decelerationFactor: this.decelerationFactor,
		});

		this.initialized = true;
	}

	public setInput(input: Vec2): void {
		this.currentInput = input;
	}

	public setMovementBlocked(blocked: boolean): void {
		this.movementBlocked = blocked;
	}

	/**
	 * Reset acceleration state (call after teleport, respawn, etc.)
	 */
	public resetAcceleration(): void {
		this.accelerationCurve?.reset();
	}

	/**
	 * Update acceleration configuration at runtime
	 */
	public setAccelerationConfig(config: Partial<AccelerationConfig>): void {
		this.accelerationCurve?.setConfig(config);
	}

	/**
	 * Get current acceleration configuration
	 */
	public getAccelerationConfig(): AccelerationConfig | null {
		return this.accelerationCurve?.getConfig() ?? null;
	}
	// #endregion

	// #region Slide Direction Lock API
	public setSlideDirectionLockEnabled(enabled: boolean): void {
		this.slideDirectionLockEnabled = enabled;
		if (!enabled) {
			this.slideDirectionLocked = false;
		}
	}

	public isSlideDirectionLocked(): boolean {
		return this.slideDirectionLocked;
	}

	public unlockSlideDirection(): void {
		this.slideDirectionLocked = false;
	}

	public update(dt: number): void {
		if (!this.initialized || this.movementBlocked) {
			return;
		}
		this.applyMovement(dt);
	}

	private applyMovement(dt: number): void {
		const inputMagnitude = Math.sqrt(
			this.currentInput.x * this.currentInput.x +
				this.currentInput.y * this.currentInput.y,
		);

		let normalizedInput = this.currentInput;
		if (inputMagnitude > 1.0) {
			normalizedInput = new Vec2(
				this.currentInput.x / inputMagnitude,
				this.currentInput.y / inputMagnitude,
			);
		} else if (!this.enableAcceleration && inputMagnitude > 0.1) {
			// Binary movement mode: any input above deadzone produces full-speed direction.
			// This ensures the Speed animation variable always exceeds the Walk→Run threshold,
			// preventing walk animation from appearing on light joystick pushes.
			normalizedInput = new Vec2(
				this.currentInput.x / inputMagnitude,
				this.currentInput.y / inputMagnitude,
			);
		}

		// Apply slide direction lock if enabled
		const movementDirection = this.applySlideDirectionLock(
			normalizedInput,
			inputMagnitude,
		);

		const effectiveSpeed = this.moveSpeed * this.speedMultiplier;

		if (this.useForceAsInputs && this.cfc !== null) {
			// Force-based: let the physics engine handle acceleration.
			if (inputMagnitude > 0.1) {
				const planeNormal = this.getMovementPlaneNormal();

				const inPlaneCurrentVelocity = this.projectOntoPlane(
					this.cfc.velocity,
					planeNormal,
				);

				const horizontalDesiredVelocity = new Vec3(
					movementDirection.x * effectiveSpeed,
					0,
					movementDirection.z * effectiveSpeed,
				);
				const desiredSpeed = Math.sqrt(
					horizontalDesiredVelocity.magnitudeSquared(),
				);

				const inPlaneDir = this.inPlaneUnitDirection(
					horizontalDesiredVelocity,
					planeNormal,
				);
				const inPlaneDesiredVelocity = inPlaneDir !== null
					? inPlaneDir.mul(desiredSpeed)
					: Vec3.zero;

				const desiredVelocity = inPlaneDesiredVelocity.sub(inPlaneCurrentVelocity);
				this.lastDesiredVelocity = desiredVelocity;
				const force = desiredVelocity.mul(this.cfc.mass / dt);
				this.cfc.addForce(force);
			} else {
				this.lastDesiredVelocity = Vec3.zero;
			}
		} else {
			// Kinematic: compute a per-frame position delta
			let desiredDelta: Vec3;

			if (inputMagnitude > 0.1) {
				desiredDelta = new Vec3(
					movementDirection.x * effectiveSpeed * dt,
					0,
					movementDirection.z * effectiveSpeed * dt,
				);
			} else {
				desiredDelta = Vec3.zero;
			}
			const dampedDelta = this.applyLegacyDamping(desiredDelta, inputMagnitude, dt);

			if (this.cfc !== null) {
				const planeNormal = this.getMovementPlaneNormal();
				const inPlaneDir = this.inPlaneUnitDirection(desiredDelta, planeNormal);
				if (inPlaneDir !== null) {
					const inPlaneVelocity = this.projectOntoPlane(
						this.cfc.velocity,
						planeNormal,
					);
					const projection = inPlaneVelocity.dot(inPlaneDir);
					if (projection < 0) {
						this.cfc.addVelocity(inPlaneDir.mul(-projection));
					}
				}
			}

			// Apply acceleration if enabled
			let finalDelta: Vec3;
			if (this.enableAcceleration) {
				const maxFrameTranslation = effectiveSpeed * dt;
				const isGrounded = this.groundInfoComponent.isGrounded;

				finalDelta = this.accelerationCurve.applyDirectionInterpolation(
					desiredDelta,
					dt,
					maxFrameTranslation,
					isGrounded,
					dampedDelta.div(dt),
				);
			} else {
				finalDelta = dampedDelta;
			}
			this.lastDesiredVelocity = finalDelta.div(dt);

			if (this.kcc !== null) {
				this.kcc.addMoveDelta(finalDelta);
			} else {
				this.transformComponent.worldPosition = this.transformComponent.worldPosition.add(
					finalDelta,
				);
			}
		}

		// Delegate rotation to subclass
		this.applyRotation(movementDirection, inputMagnitude);
	}

	/**
	 * Legacy damping behavior for backwards compatibility.
	 * When instantStop is true, releasing input immediately returns zero
	 * (no gradual deceleration, avoids Speed passing through walk thresholds).
	 */
	private applyLegacyDamping(desiredDelta: Vec3, inputMagnitude: number, dt: number): Vec3 {
		const effectiveSpeed = this.moveSpeed * this.speedMultiplier;

		if (inputMagnitude > 0.1) {
			if (effectiveSpeed > 0 && dt > 0) {
				const invSpeedDt = 1 / (effectiveSpeed * dt);
				this.legacyVelocity = new Vec3(
					desiredDelta.x * invSpeedDt,
					0,
					desiredDelta.z * invSpeedDt,
				);
			}
			return desiredDelta;
		} else {
			// Instant stop: skip damping entirely, zero out immediately
			if (this.instantStop) {
				this.legacyVelocity = Vec3.zero;
				return Vec3.zero;
			}

			const dampFactor = Math.max(0, 1 - this.stopDamping * dt);
			const dampedX = this.legacyVelocity.x * dampFactor;
			const dampedZ = this.legacyVelocity.z * dampFactor;

			if (dampedX * dampedX + dampedZ * dampedZ < 0.0001) {
				this.legacyVelocity = Vec3.zero;
				return Vec3.zero;
			}

			this.legacyVelocity = new Vec3(dampedX, 0, dampedZ);

			return new Vec3(
				dampedX * effectiveSpeed * dt,
				0,
				dampedZ * effectiveSpeed * dt,
			);
		}
	}

	protected calculateMovementDirection(normalizedInput: NormalizedInput2D): Vec3 {
		const horizontalForward = this.getCameraHorizontalForward();
		const horizontalRight = horizontalForward.cross(Vec3.up).normalize();
		return horizontalForward
			.mul(normalizedInput.y)
			.add(horizontalRight.mul(normalizedInput.x));
	}

	private getMovementPlaneNormal(): Vec3 {
		if (this.groundInfoComponent.isGrounded) {
			return this.groundInfoComponent.lastGoodGroundHit.normal;
		}
		return this.transformComponent.worldRotation.mulVec3(Vec3.up);
	}

	private projectOntoPlane(v: Vec3, planeNormal: Vec3): Vec3 {
		return v.sub(planeNormal.mul(v.dot(planeNormal)));
	}

	private inPlaneUnitDirection(v: Vec3, planeNormal: Vec3): Vec3 | null {
		const projected = this.projectOntoPlane(v, planeNormal);
		const magSq = projected.magnitudeSquared();
		if (magSq < 1e-10) {
			return null;
		}
		return projected.mul(1 / Math.sqrt(magSq));
	}

	/**
	 * Subclasses override this to implement different rotation behaviors.
	 */
	protected abstract applyRotation(movementDirection: Vec3, inputMagnitude: number): void;

	protected getCameraHorizontalForward(): Vec3 {
		const camFwd = CameraService.get().forward;
		const flatMagSq = camFwd.x * camFwd.x + camFwd.z * camFwd.z;

		if (flatMagSq < 0.01) {
			return this.lastValidHorizontalForward;
		}

		const invMag = 1 / Math.sqrt(flatMagSq);
		this.lastValidHorizontalForward = new Vec3(
			camFwd.x * invMag,
			0,
			camFwd.z * invMag,
		);
		return this.lastValidHorizontalForward;
	}
	// #endregion

	// #region Slide Direction Lock Implementation
	private applySlideDirectionLock(normalizedInput: Vec2, inputMagnitude: number): Vec3 {
		const baseDirection = this.calculateMovementDirection(normalizedInput);

		if (!this.slideDirectionLockEnabled) {
			return baseDirection;
		}

		const isMoving = inputMagnitude > 0.01;

		if (!isMoving) {
			this.slideDirectionLocked = false;
			return baseDirection;
		}

		if (!this.slideDirectionLocked) {
			if (inputMagnitude >= this.slideDirectionLockThreshold) {
				this.slideDirectionLocked = true;

				const directionMagnitude = Math.sqrt(
					baseDirection.x * baseDirection.x +
					baseDirection.z * baseDirection.z,
				);

				if (directionMagnitude > 0.001) {
					this.lockedWorldDirection = new Vec3(
						baseDirection.x / directionMagnitude,
						0,
						baseDirection.z / directionMagnitude,
					);
				}
			}
			return baseDirection;
		}

		const clampedMagnitude = Math.min(inputMagnitude, 1);
		return new Vec3(
			this.lockedWorldDirection.x * clampedMagnitude,
			0,
			this.lockedWorldDirection.z * clampedMagnitude,
		);
	}

	public getMovementInput(): Vec2 {
		return this.currentInput;
	}

	public getDesiredVelocity(): Vec3 {
		return this.lastDesiredVelocity;
	}
}
