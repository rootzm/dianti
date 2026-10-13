/**
 * DynamicForceController - Rigid-body implementation of CharacterForceControllerBase.
 *
 * Component Attachment: Character simulated entity (child of root)
 * Component Networking: Networked (inherits from CharacterForceControllerBase)
 * Component Ownership: Owner of the character entity (Server for enemies, Client for player)
 *
 * Uses a PhysicsBodyComponent for full rigid-body dynamics. All forces and
 * velocities are delegated to the physics engine, and gravity is applied
 * manually each frame so the base-class gravity vector is respected.
 *
 * Choose DynamicForceController when you need a rigid-body character whose
 * motion is driven entirely by the physics engine (e.g. ball character, ragdoll).
 * For stable, predictable locomotion use KinematicForceController instead.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	PhysicsBodyComponent,
	Quaternion,
	Vec3,
	component,
} from "meta/worlds";
import { CharacterForceControllerBase } from "./CharacterForceControllerBase";

@component()
export class DynamicForceController extends CharacterForceControllerBase {
	private static readonly EPSILON = 1e-6;

	private physicsBody: Maybe<PhysicsBodyComponent> = null;
	private wasEnabled: boolean = true;

	public override resetToPosition(worldPos: Vec3, worldRot: Quaternion = Quaternion.identity): void {
		super.resetToPosition(worldPos, worldRot);
		if (this.physicsBody) {
			this.physicsBody.linearVelocity = Vec3.zero;
			this.physicsBody.angularVelocity = Vec3.zero;
		}
	}

	public override initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		super.initialize(characterRootEntity, characterSimulatedEntity);
		if (this.characterSimulatedEntity === null) {
			this.initialized = false;
			console.error("[DynamicForceController.initialize] characterSimulatedEntity is null.");
			return;
		}
		this.physicsBody = this.characterSimulatedEntity.getComponent(PhysicsBodyComponent);
		if (this.physicsBody !== null) {
			// We apply gravity ourselves via the base-class gravity property,
			// so disable the engine's built-in gravity on this body.
			this.physicsBody.isAffectedByGravity = false;

			// Sync initial mass from the base-class property.
			this.physicsBody.mass = this.mass;
		}
	}

	public override addForce(force: Vec3): void {
		super.addForce(force);
		this.physicsBody?.applyForce(force);
	}

	public override addVelocity(deltaVelocity: Vec3): void {
		// Translate a velocity delta into an impulse (impulse = mass × Δv).
		// Don't call super — velocity is owned by the physics body.
		this.physicsBody?.applyImpulse(deltaVelocity.mul(this.mass));
	}

	public update(dt: number): void {
		if (!this.physicsBody) {
			return;
		}

		// Handle enabled ↔ disabled transitions.
		if (!this.enabled) {
			if (this.wasEnabled) {
				this.physicsBody.sleep();
				this.wasEnabled = false;
			}
			return;
		}
		if (!this.wasEnabled) {
			this.physicsBody.wake();
			this.wasEnabled = true;
		}

		// Keep PhysicsBodyComponent mass in sync.
		this.physicsBody.mass = this.mass;
		// Manual control gravity
		this.physicsBody.isAffectedByGravity = false;

		// One-shot force disable.
		if (this.disableForcesForSingleFrame) {
			this.physicsBody.linearVelocity = Vec3.zero;
			this.velocity = Vec3.zero;
			this.desiredTranslation = Vec3.zero;
			this.inputForce = Vec3.zero;
			this.disableForcesForSingleFrame = false;

			this.syncCharacterTransform();
			return;
		}

		// Apply gravity as a force (F = m·g).
		this.physicsBody.applyForce(this.gravity.mul(this.mass));

		// Enforce maxFallSpeed by clamping velocity along the gravity direction.
		if (this.gravity.magnitudeSquared() > DynamicForceController.EPSILON && this.maxFallSpeed > 0) {
			const currentVelocity = this.physicsBody.linearVelocity;
			const gravityDir = this.gravity.normalize();
			const fallingSpeed = currentVelocity.dot(gravityDir);
			if (fallingSpeed > this.maxFallSpeed) {
				this.physicsBody.linearVelocity = currentVelocity.sub(
					gravityDir.mul(fallingSpeed - this.maxFallSpeed),
				);
			}
		}

		// Sync character transform
		this.syncCharacterTransform();

		// Read back authoritative state from the physics body.
		this.velocity = this.physicsBody.linearVelocity;
		this.sampledVelocity = this.velocity;
		this.desiredTranslation = this.velocity.mul(dt);

		// Clear accumulated input force for the next frame.
		this.inputForce = Vec3.zero;
	}
}
