/**
 * KinematicForceController - Kinematic implementation of CharacterForceControllerBase.
 *
 * Component Attachment: Character simulated entity (child of root)
 * Component Networking: Networked (inherits from CharacterForceControllerBase)
 * Component Ownership: Owner of the character entity (Server for enemies, Client for player)
 *
 * Simulates forces (gravity, friction, collision response) on a kinematic
 * character controller (CharacterControllerBase). Physics are "faked" —
 * forces are integrated manually each frame and the resulting translation
 * is applied via the character controller's move-delta API.
 *
 * Choose KinematicForceController for common character control scenarios.
 * For simulation-style (rolling, tumbling) characters use DynamicForceController.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	CharacterControllerBase,
	Quaternion,
	Vec3,
	component,
	property,
} from "meta/worlds";
import { WorldsGroundInfoComponent } from "../components/physics/WorldsGroundInfoComponent";
import { CharacterForceControllerBase } from "./CharacterForceControllerBase";

/**
 * How the character's friction is combined with the ground surface friction
 * to produce the effective friction used by the kinematic friction model.
 */
export enum FrictionCombineMode {
	/** Use the largest of the two values. */
	Maximum = 0,
	/** Use the product of the two values. */
	Multiply = 1,
	/** Use the smallest of the two values. */
	Minimum = 2,
	/** Use the arithmetic mean of the two values. */
	Average = 3,
}

/**
 * How the character's restitution is combined with the ground surface
 * restitution to produce the effective restitution used by the kinematic
 * bounce model.
 */
export enum RestitutionCombineMode {
	/** Use the largest of the two values. */
	Maximum = 0,
	/** Use the product of the two values. */
	Multiply = 1,
	/** Use the smallest of the two values. */
	Minimum = 2,
	/** Use the arithmetic mean of the two values. */
	Average = 3,
}

@component()
export class KinematicForceController extends CharacterForceControllerBase {
	private static readonly EPSILON = 1e-6;

	/**
	 * Character's static friction coefficient. Combined with the supporting
	 * surface's contactStaticFriction via frictionCombineMode.
	 */
	@property()
	public staticFriction: number = 0.5;

	/**
	 * Character's dynamic friction coefficient. Reserved for future use.
	 */
	@property()
	public dynamicFriction: number = 0.5;

	/**
	 * Character's restitution (bounciness). 0 = no bounce, 1 = full bounce.
	 */
	@property()
	public restitution: number = 0.0;

	/**
	 * How staticFriction and the ground's contactStaticFriction are combined.
	 */
	@property()
	public frictionCombineMode: FrictionCombineMode = FrictionCombineMode.Average;

	/**
	 * How restitution and the ground's contactRestitution are combined.
	 */
	@property()
	public restitutionCombineMode: RestitutionCombineMode = RestitutionCombineMode.Average;

	private characterController: Maybe<CharacterControllerBase> = null;
	private groundInfo: Maybe<WorldsGroundInfoComponent> = null;
	private lastPosition: Vec3 = Vec3.zero;
	private hasLastPosition: boolean = false;
	private lastDt: number = 1;

	public override resetToPosition(worldPos: Vec3, worldRot: Quaternion = Quaternion.identity): void {
		super.resetToPosition(worldPos, worldRot);
		this.lastPosition = Vec3.zero;
		this.hasLastPosition = false;
		this.lastDt = 1;
	}

	public override initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		super.initialize(characterRootEntity, characterSimulatedEntity);
		if (this.characterSimulatedEntity === null || this.characterRootEntity === null) {
			this.initialized = false;
			console.error("[KinematicForceController.initialize] characterSimulatedEntity or characterRootEntity is null.");
			return;
		}
		this.groundInfo = this.characterSimulatedEntity.getComponent(WorldsGroundInfoComponent);
		this.characterController = this.characterSimulatedEntity.getComponent(CharacterControllerBase);
	}

	private static combineFrictions(a: number, b: number, mode: FrictionCombineMode): number {
		if (mode === FrictionCombineMode.Maximum) {
			return Math.max(a, b);
		} else if (mode === FrictionCombineMode.Multiply) {
			return a * b;
		} else if (mode === FrictionCombineMode.Minimum) {
			return Math.min(a, b);
		} else {
			return (a + b) * 0.5;
		}
	}

	private static combineRestitutions(a: number, b: number, mode: RestitutionCombineMode): number {
		if (mode === RestitutionCombineMode.Maximum) {
			return Math.max(a, b);
		} else if (mode === RestitutionCombineMode.Multiply) {
			return a * b;
		} else if (mode === RestitutionCombineMode.Minimum) {
			return Math.min(a, b);
		} else {
			return (a + b) * 0.5;
		}
	}

	/**
	 * Internal helper for continuous forces like gravity.
	 * NOT exposed publicly because it's framerate-dependent.
	 */
	private addAcceleration(acceleration: Vec3): void {
		this.inputForce = this.inputForce.add(acceleration.mul(this.mass));
	}

	private projectOntoPlane(vector: Vec3, planeNormal: Vec3): Vec3 {
		const dotProduct = vector.dot(planeNormal);
		return vector.sub(planeNormal.mul(dotProduct));
	}

	public update(dt: number): void {
		if (!this.enabled) {
			return;
		}
		if (this.characterSimulatedTransform && dt > KinematicForceController.EPSILON) {
			const currentPosition = this.characterSimulatedTransform.worldPosition;
			if (this.hasLastPosition) {
				this.sampledVelocity = currentPosition.sub(this.lastPosition).mul(1.0 / this.lastDt);
			}
			this.lastPosition = currentPosition;
			this.hasLastPosition = true;
		}
		this.lastDt = dt;
		if (this.disableForcesForSingleFrame) {
			this.velocity = Vec3.zero;
			this.desiredTranslation = Vec3.zero;
			this.inputForce = Vec3.zero;
			this.disableForcesForSingleFrame = false;
			this.syncCharacterTransform();
			return;
		}
		this.addAcceleration(this.gravity);
		let simulatedVelocity = this.velocity;
		let velocityAgainstTheSurface = Vec3.zero;
		const isSupported = this.groundInfo?.isGrounded ?? false;
		let supportingSurfaceNormal: Vec3;
		const groundNormal = this.groundInfo?.lastGoodGroundHit.normal ?? null;
		if (groundNormal) {
			supportingSurfaceNormal = groundNormal;
		} else if (this.characterRootTransform) {
			supportingSurfaceNormal = this.characterRootTransform.worldUp;
		} else {
			supportingSurfaceNormal = Vec3.up;
		}
		if (isSupported) {
			const horizontalVelocity = this.projectOntoPlane(simulatedVelocity, supportingSurfaceNormal);
			const velocityDotNormal = simulatedVelocity.dot(supportingSurfaceNormal);
			const verticalForceMagnitude = this.inputForce.dot(supportingSurfaceNormal);
			if (velocityDotNormal < 0.0 || verticalForceMagnitude < 0.0) {
				velocityAgainstTheSurface = supportingSurfaceNormal.mul(Math.min(0.0, velocityDotNormal));
				const horizontalForce = this.inputForce.sub(supportingSurfaceNormal.mul(verticalForceMagnitude));
				const pressingForceAgainstTheSurface = supportingSurfaceNormal.mul(Math.min(0.0, verticalForceMagnitude));
				this.inputForce = this.inputForce.sub(pressingForceAgainstTheSurface);
				const pressureMagnitude = -Math.min(0.0, verticalForceMagnitude);
				const groundFriction = this.groundInfo?.contactStaticFriction ?? this.staticFriction;
				const effectiveFrictionCoefficient = KinematicForceController.combineFrictions(
					this.staticFriction,
					groundFriction,
					this.frictionCombineMode,
				);
				const maxFrictionMagnitude = effectiveFrictionCoefficient * pressureMagnitude;
				const horizontalVelocityMagnitude = horizontalVelocity.magnitude();
				if (horizontalVelocityMagnitude > KinematicForceController.EPSILON) {
					const velocityReducedByFriction = (maxFrictionMagnitude / this.mass) * dt;
					if (velocityReducedByFriction > horizontalVelocityMagnitude) {
						simulatedVelocity = simulatedVelocity.sub(horizontalVelocity);
					} else {
						simulatedVelocity = simulatedVelocity.sub(
							horizontalVelocity.normalize().mul(velocityReducedByFriction),
						);
					}
				}
				const horizontalForceMagnitude = horizontalForce.magnitude();
				if (horizontalForceMagnitude > KinematicForceController.EPSILON) {
					let frictionForce: Vec3;
					if (horizontalForceMagnitude < maxFrictionMagnitude) {
						frictionForce = horizontalForce.mul(-1);
					} else {
						frictionForce = horizontalForce.normalize().mul(-maxFrictionMagnitude);
					}
					this.inputForce = this.inputForce.add(frictionForce);
				}
				if (this.inputForce.magnitudeSquared() <= KinematicForceController.EPSILON) {
					this.inputForce = Vec3.zero;
				}
			}
		}
		const acceleration = this.inputForce.mul(1.0 / this.mass);

		let bounceVelocity = Vec3.zero;
		if (isSupported && velocityAgainstTheSurface.magnitudeSquared() > KinematicForceController.EPSILON) {
			const groundRestitution = this.groundInfo?.contactRestitution ?? this.restitution;
			const effectiveRestitution = KinematicForceController.combineRestitutions(
				this.restitution,
				groundRestitution,
				this.restitutionCombineMode,
			);
			bounceVelocity = velocityAgainstTheSurface.mul(-effectiveRestitution);
		}

		simulatedVelocity = simulatedVelocity.sub(velocityAgainstTheSurface).add(bounceVelocity);
		const frameStartVelocity = simulatedVelocity;
		const deltaVelocity = acceleration.mul(dt);
		simulatedVelocity = simulatedVelocity.add(deltaVelocity);
		if (this.gravity.magnitudeSquared() > KinematicForceController.EPSILON) {
			const gravityDirection = this.gravity.normalize();
			const fallingSpeed = simulatedVelocity.dot(gravityDirection);
			if (fallingSpeed > this.maxFallSpeed) {
				simulatedVelocity = simulatedVelocity.sub(gravityDirection.mul(fallingSpeed));
				simulatedVelocity = simulatedVelocity.add(gravityDirection.mul(this.maxFallSpeed));
			}
		}
		const averageVelocity = frameStartVelocity.add(simulatedVelocity).mul(0.5);
		this.velocity = simulatedVelocity;
		this.desiredTranslation = averageVelocity.mul(dt);
		this.inputForce = Vec3.zero;
		if (this.characterController) {
			this.characterController.addMoveDelta(this.desiredTranslation);
		}
		this.syncCharacterTransform(true);
	}
}
