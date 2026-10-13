/**
 * PlayerMovementAbility - Player-specific movement ability.
 *
 * Component Attachment: Player root entity (PlayerCharacter template)
 * Component Networking: Local (runs on owning client)
 * Component Ownership: Player (client-owned)
 *
 * Extends MovementAbility with player-specific rotation behavior:
 * The player always faces the camera's horizontal forward direction,
 * even when standing still. When the camera rotates, the player rotates with it.
 *
 * Also listens to GamePhaseChangedEvent to block movement during
 * non-Exploration phases and unblock it when Exploration begins.
 */

import type { Entity } from "meta/worlds";
import {
	ExecuteOn,
	Quaternion,
	Vec3,
	component,
	subscribe,
} from "meta/worlds";
import {
	GamePhase,
	GamePhaseChangedEvent,
	GamePhaseChangedPayload,
} from "../../events/GamePhaseEvents";
import { MovementAbility } from "./MovementAbility";

@component({
	description: "Player movement ability - always faces camera horizontal forward direction",
})
export class PlayerMovementAbility extends MovementAbility {
	private static readonly ROTATION_LERP_BASE: number = 0.1;

	/**
	 * Default movement to blocked on start.
	 * This ensures that even if the GamePhaseChangedEvent is missed due to a race condition
	 * (player joins after server already broadcast), movement is still blocked during Initialization.
	 * The Exploration event will unblock it.
	 *
	 * Also disables acceleration and enables instant stop so the player has
	 * binary (switch-like) movement: joystick push = instant run, release = instant stop.
	 * This skips the walk animation threshold entirely, avoiding animation flicker.
	 */
	public override initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		super.initialize(characterRootEntity, characterSimulatedEntity);
		this.setMovementBlocked(true);

		// Disable acceleration curve: input immediately produces full moveSpeed
		this.enableAcceleration = false;
		// Enable instant stop: releasing input zeroes velocity in one frame
		this.instantStop = true;
	}

	/**
	 * Subscribe to phase changes globally.
	 * Unblock movement on Exploration, block on all other phases.
	 * Runs on the owning client (ExecuteOn.Everywhere ensures we get the event on client).
	 */
	@subscribe(GamePhaseChangedEvent, {execution: ExecuteOn.Everywhere})
	private onPhaseChanged(payload: GamePhaseChangedPayload): void {
		if (payload.newPhase === GamePhase.Exploration) {
			this.setMovementBlocked(false);
		} else if (payload.newPhase === GamePhase.Settlement) {
			this.setMovementBlocked(true);
		}
	}


	/**
	 * Player rotation: always face the camera's horizontal forward direction.
	 * This means the player rotates when the camera rotates, even when standing still.
	 */
	protected applyRotation(movementDirection: Vec3, inputMagnitude: number): void {
		const cameraForward = this.getCameraHorizontalForward();
		const targetRotation = Quaternion.lookRotation(cameraForward, Vec3.up);
		const rotationLerp = PlayerMovementAbility.ROTATION_LERP_BASE * this.rotationSpeed;
		this.transformComponent.worldRotation = this.transformComponent.worldRotation
			.slerp(targetRotation, rotationLerp)
			.normalize();
	}
}
