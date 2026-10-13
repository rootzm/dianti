/**
 * DashAbility - Dash ability for instant burst movement.
 *
 * Component Attachment: Player (character root entity)
 * Component Networking: Networked
 * Component Ownership: Client
 *
 * Provides a dash mechanic that propels the character in a given direction
 * at high speed for a short duration. Supports both KCC-based and
 * force-controller-based movement pipelines. After the dash ends, excess
 * momentum injected via the force controller is cleaned up to prevent drift.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	CharacterControllerBase,
	Vec3,
	component,
	property
} from "meta/worlds";
import { CharacterForceControllerBase } from "../../controllers/CharacterForceControllerBase";
import { ICharacterInitializable } from "../../controllers/ICharacterInitializable";

@component({
	description: "Dash ability for instant burst movement",
})
export class DashAbility extends ICharacterInitializable {
	private static readonly MIN_DIRECTION_MAGNITUDE_SQ = 0.0001;

	/** Distance covered by a single dash. */
	@property()
	public dashDistance: number = 5.0;

	/** How long the dash lasts in seconds. */
	@property()
	public dashDuration: number = 0.2;

	/** Minimum time between consecutive dashes. */
	@property()
	public dashCooldown: number = 1.0;

	private kcc: Maybe<CharacterControllerBase> = null;
	private cfc!: CharacterForceControllerBase;
	private dashDirection: Vec3 = Vec3.zero;
	private dashTimer: number = 0;
	private dashSpeed: number = 0;
	private isDashing: boolean = false;
	private lastDashEndTime: number = 0;

	public initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		this.cfc = characterSimulatedEntity.getComponentOrThrow(CharacterForceControllerBase);
		this.kcc = characterSimulatedEntity.getComponent(CharacterControllerBase);
		this.dashSpeed = this.dashDistance / this.dashDuration;
	}

	public canActivate(): boolean {
		if (this.isDashing) {
			return false;
		}
		const elapsed = (Date.now() - this.lastDashEndTime) / 1000;
		return elapsed >= this.dashCooldown;
	}

	public dash(direction: Vec3): void {
		if (direction.magnitudeSquared() < DashAbility.MIN_DIRECTION_MAGNITUDE_SQ) {
			return;
		}
		this.dashDirection = direction.normalize();
		this.dashTimer = this.dashDuration;
		this.isDashing = true;

		if (!this.kcc) {
			this.cfc.addVelocity(this.dashDirection.mul(this.dashSpeed));
		}
	}

	public update(dt: number): void {
		if (!this.isDashing) {
			return;
		}
		const useCfc = this.kcc === null;

		if (this.kcc) {
			const moveDelta = this.dashDirection.mul(this.dashSpeed * dt);
			this.kcc.addMoveDelta(moveDelta);
		}

		this.dashTimer -= dt;
		if (this.dashTimer <= 0) {
			this.isDashing = false;
			this.lastDashEndTime = Date.now();
			if (useCfc) {
				// Remove the dash velocity component so it doesn't generate extra momentum
				const dashComponent = this.cfc.velocity.dot(this.dashDirection);
				const speedToReduce = -Math.min(dashComponent, this.dashSpeed);
				this.cfc.addVelocity(this.dashDirection.mul(speedToReduce));
			}
		}
	}

	public getIsDashing(): boolean {
		return this.isDashing;
	}
}
