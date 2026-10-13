/**
 * CharacterForceControllerBase - Abstract base class for character force controllers.
 *
 * Component Attachment: Character simulated entity (child of root)
 * Component Networking: Networked (inherits from ICharacterInitializable)
 * Component Ownership: Owner of the character entity (Server for enemies, Client for player)
 *
 * Defines the public API for applying forces, velocities, and querying
 * physics state. Concrete implementations (e.g. KinematicForceController)
 * provide the actual physics integration.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	Quaternion,
	TransformComponent,
	Vec3,
} from "meta/worlds";
import { ICharacterInitializable } from "./ICharacterInitializable";

export abstract class CharacterForceControllerBase extends ICharacterInitializable {
	public enabled: boolean = true;
	public gravity: Vec3 = new Vec3(0, -9.8, 0);
	public maxFallSpeed: number = 50.0;
	public mass: number = 1.0;

	public characterRootEntity: Maybe<Entity> = null;
	public characterSimulatedEntity: Maybe<Entity> = null;
	public characterRootTransform: Maybe<TransformComponent> = null;
	public characterSimulatedTransform: Maybe<TransformComponent> = null;

	public disableForcesForSingleFrame: boolean = false;
	public inputForce: Vec3 = Vec3.zero;
	public velocity: Vec3 = new Vec3(0, 0, 0);
	public desiredTranslation: Vec3 = Vec3.zero;
	public sampledVelocity: Vec3 = Vec3.zero;
	protected initialized: boolean = false;

	public initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		this.characterRootEntity = characterRootEntity ?? this.entity;
		this.characterRootTransform = this.characterRootEntity.getComponent(TransformComponent);
		this.characterSimulatedEntity = characterSimulatedEntity ?? this.entity;
		this.characterSimulatedTransform = this.characterSimulatedEntity.getComponent(TransformComponent);
		this.initialized = true;
	}

	public addForce(force: Vec3): void {
		this.inputForce = this.inputForce.add(force);
	}

	public addVelocity(deltaVelocity: Vec3): void {
		this.velocity = this.velocity.add(deltaVelocity);
	}

	/**
	 * Resets all variable physics state to defaults and teleports both the
	 * character root and simulated entity to the given world position.
	 * Subclasses should override to reset any additional state they maintain.
	 */
	public resetToPosition(worldPos: Vec3, worldRot: Quaternion = Quaternion.identity): void {
		this.velocity = Vec3.zero;
		this.inputForce = Vec3.zero;
		this.desiredTranslation = Vec3.zero;
		this.sampledVelocity = Vec3.zero;
		this.disableForcesForSingleFrame = false;

		this.characterRootTransform?.teleportTo(worldPos, worldRot);
		this.characterSimulatedTransform?.teleportTo(worldPos, worldRot);
	}

	public abstract update(dt: number): void;

	/**
	 * Applies the simulated (child) entity's transform back to the character entity.
	 * For KinematicCharacter only when syncRotation is true.
	 */
	protected syncCharacterTransform(syncRotation: boolean = false): void {
		if (this.characterSimulatedTransform === null || this.characterRootTransform === null) {
			return;
		}

		if (syncRotation) {
			const worldRot = this.characterSimulatedTransform.worldRotation.normalize();
			this.characterRootTransform.worldRotation = worldRot;
			this.characterSimulatedTransform.worldRotation = worldRot;
		}

		const worldPos = this.characterSimulatedTransform.worldPosition;
		this.characterRootTransform.worldPosition = worldPos;
		// Since the simulatedTransform is usually a child of characterRootTransform,
		// write worldPos back after setting parent's transform above.
		this.characterSimulatedTransform.worldPosition = worldPos;
	}
}
