/**
 * JumpAbility - Jump ability that handles jump physics (impulse and abort).
 *
 * Component Attachment: Player (via CharacterUpdateManager initialization)
 * Component Networking: Local
 * Component Ownership: Client
 *
 * Provides jump impulse, variable-height jump abort, coyote time,
 * jump buffering, and cooldown management. Integrates with
 * CharacterForceControllerBase for velocity manipulation and
 * WorldsGroundInfoComponent for ground detection.
 */

import type {
	Entity,
} from "meta/worlds";
import {
	LocalEvent,
	TransformComponent,
	component,
	property,
} from "meta/worlds";
import { CharacterForceControllerBase } from "../../controllers/CharacterForceControllerBase";
import { Cooldown } from "../../utils/Cooldown";
import { GraceTimer } from "../../utils/GraceTimer";
import { ICharacterInitializable } from "../../controllers/ICharacterInitializable";
import { InputBuffer } from "../../utils/InputBuffer";
import { WorldsGroundInfoComponent } from "../physics/WorldsGroundInfoComponent";

/**
 * Event emitted when a jump is executed.
 */
export const JumpStartedEvent = new LocalEvent("JumpStartedEvent");

@component({
	description: "Jump ability that handles jump physics (impulse and abort)",
})
export class JumpAbility extends ICharacterInitializable {
	@property()
	public jumpImpulse: number = 5.0;

	/**
	 * Jump buffer window in milliseconds.
	 * Allows jump input slightly before landing to still trigger a jump.
	 */
	@property()
	public jumpBufferTime: number = 150;

	/**
	 * Coyote time window in milliseconds.
	 * Allows jumping shortly after walking off a ledge.
	 */
	@property()
	public coyoteTime: number = 120;

	/**
	 * Jump cooldown in milliseconds.
	 * Minimum time between jumps to prevent spam.
	 */
	@property()
	public jumpCooldown: number = 200;

	private cfc!: CharacterForceControllerBase;
	private transformComponent!: TransformComponent;
	private groundInfo!: WorldsGroundInfoComponent;

	private jumpBuffer!: InputBuffer;
	private coyoteTimer!: GraceTimer;
	private cooldownTimer!: Cooldown;
	private isJumping: boolean = false;
	private hasLeftGround: boolean = false;

	public initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		this.cfc = characterSimulatedEntity.getComponentOrThrow(CharacterForceControllerBase);
		this.transformComponent = characterRootEntity.getComponentOrThrow(TransformComponent);
		this.groundInfo = characterSimulatedEntity.getComponentOrThrow(WorldsGroundInfoComponent);

		this.jumpBuffer = new InputBuffer(this.jumpBufferTime);
		this.coyoteTimer = new GraceTimer(this.coyoteTime);
		this.cooldownTimer = new Cooldown(this.jumpCooldown);
	}

	/**
	 * Updates timing utilities. Call this every frame.
	 * @param currentTime - Current time in milliseconds
	 */
	public update(currentTime: number): void {
		const isGrounded = this.isGrounded();

		if (this.isJumping) {
			if (!isGrounded) {
				this.hasLeftGround = true;
			}
			if (this.hasLeftGround && isGrounded) {
				this.isJumping = false;
				this.cooldownTimer.trigger(currentTime);
			}
		}
	}

	/**
	 * Returns whether the character is currently grounded.
	 */
	public isGrounded(): boolean {
		return this.groundInfo.isNearlyGrounded(0.1);
	}

	/**
	 * Records a jump input for buffering.
	 * @param currentTime - Current time in milliseconds
	 */
	public recordInput(currentTime: number): void {
		this.jumpBuffer.record(currentTime);
	}

	/**
	 * Clears the jump input buffer.
	 */
	public clearInputBuffer(): void {
		this.jumpBuffer.clear();
	}

	/**
	 * Checks if the cooldown has elapsed and the jump is ready.
	 * @param currentTime - Current time in milliseconds
	 */
	public isCooldownReady(currentTime: number): boolean {
		return this.cooldownTimer.isReady(currentTime);
	}

	/**
	 * Triggers the cooldown timer.
	 * @param currentTime - Current time in milliseconds
	 */
	public triggerCooldown(currentTime: number): void {
		this.cooldownTimer.trigger(currentTime);
	}

	/**
	 * Checks if ground jump is currently allowed (grounded or in coyote time).
	 * @param currentTime - Current time in milliseconds
	 */
	public canGroundJump(currentTime: number): boolean {
		const isGrounded = this.isGrounded();
		return this.coyoteTimer.isActiveOrInGrace(isGrounded, currentTime);
	}

	/**
	 * Consumes the coyote time grace period if available.
	 * @param currentTime - Current time in milliseconds
	 */
	public consumeCoyoteTime(currentTime: number): void {
		this.coyoteTimer.tryConsume(currentTime);
	}

	/**
	 * Attempts to execute a ground jump with cooldown check.
	 * Used by buffered jump on landing.
	 * @param currentTime - Current time in milliseconds
	 */
	private tryExecuteJump(currentTime: number): boolean {
		if (!this.cooldownTimer.isReady(currentTime)) {
			return false;
		}

		if (this.executeJump()) {
			this.cooldownTimer.trigger(currentTime);
			return true;
		}
		return false;
	}

	/**
	 * Executes a jump by applying upward velocity.
	 * Call this only when jump conditions are met (grounded or coyote time).
	 * @returns true if jump was executed, false if blocked (already at max velocity)
	 */
	public executeJump(): boolean {
		if (this.jumpImpulse <= 0.0) {
			return false;
		}

		const currentJumpVelocity = this.cfc.velocity.dot(this.transformComponent.worldUp);

		if (currentJumpVelocity > this.jumpImpulse) {
			return false;
		}

		this.cfc.addVelocity(
			this.transformComponent.worldUp.mul(Math.max(0, this.jumpImpulse - currentJumpVelocity))
		);

		this.sendEventLocally(JumpStartedEvent, {});

		return true;
	}

	public canActivate(): boolean {
		const grounded = this.isGrounded();
		const cooldownReady = this.cooldownTimer.isReady(Date.now());
		return grounded && cooldownReady;
	}

	public activate(): void {
		const currentTime = Date.now();
		this.executeJump();
		this.clearInputBuffer();
		this.triggerCooldown(currentTime);
		this.isJumping = true;
		this.hasLeftGround = false;
		if (!this.isGrounded()) {
			this.consumeCoyoteTime(currentTime);
		}
	}

	public getIsJumping(): boolean {
		return this.isJumping;
	}

	/**
	 * Aborts the jump by canceling upward velocity.
	 * Call this when jump input is released for variable jump height.
	 * Guard: only cancels velocity if the character is currently airborne,
	 * preventing same-frame press+release from canceling the impulse before
	 * the player has left the ground.
	 */
	public abortJump(): void {
		if (!this.isJumping) {
			return;
		}

		// If still grounded (or nearly so), don't abort — the player hasn't
		// actually lifted off yet. This prevents same-frame press+release from
		// killing the jump impulse.
		if (this.isGrounded()) {
			return;
		}

		const upDirection = this.transformComponent.worldUp;
		const currentUpwardVelocity = this.cfc.velocity.dot(upDirection);

		if (currentUpwardVelocity > 0) {
			this.cfc.addVelocity(upDirection.mul(-currentUpwardVelocity));
		}
	}
}
