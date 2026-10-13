/**
 * CharacterStateMachine - Manages character states (Movement, Jumping, Dashing).
 *
 * Component Attachment: Character root entity (Player or Enemy)
 * Component Networking: Networked (inherits from StateMachineBase)
 * Component Ownership: Owner of the character entity (Server for enemies, Client for player)
 *
 * Extends StateMachineBase to register Movement, Jumping, and Dashing states
 * with appropriate transitions and ability integrations. Provides public
 * methods for handling movement input, jump, and dash actions.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	component,
	TransformComponent,
	Vec2,
	Vec3,
} from "meta/worlds";
import { DashAbility } from "../components/ability/DashAbility";
import { EnemyMovementAbility } from "../components/ability/EnemyMovementAbility";
import { JumpAbility } from "../components/ability/JumpAbility";
import { MovementAbility } from "../components/ability/MovementAbility";
import { PlayerMovementAbility } from "../components/ability/PlayerMovementAbility";
import { WorldsGroundInfoComponent } from "../components/physics/WorldsGroundInfoComponent";
import { StateMachineBase } from "./StateMachineBase";

@component({
	description: "Character state machine",
})
export class CharacterStateMachine extends StateMachineBase {
	public static readonly STATE_ID = {
		Movement: "Movement",
		Jumping: "Jumping",
		Dashing: "Dashing",
	} as const;

	private groundInfo: Maybe<WorldsGroundInfoComponent> = null;
	private movement: Maybe<MovementAbility> = null;
	private jump: Maybe<JumpAbility> = null;
	private dash: Maybe<DashAbility> = null;
	private transformComponent: Maybe<TransformComponent> = null;

	public override initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		this.groundInfo = characterSimulatedEntity.getComponent(WorldsGroundInfoComponent);
		this.movement = characterRootEntity.getComponent(PlayerMovementAbility)
			?? characterRootEntity.getComponent(EnemyMovementAbility);
		this.jump = characterRootEntity.getComponent(JumpAbility);
		this.dash = characterRootEntity.getComponent(DashAbility);
		this.transformComponent = characterRootEntity.getComponent(TransformComponent);

		if (this.movement) {
			this.movement.initialize(characterRootEntity, characterSimulatedEntity);
		}
		if (this.jump) {
			this.jump.initialize(characterRootEntity, characterSimulatedEntity);
		}
		if (this.dash) {
			this.dash.initialize(characterRootEntity, characterSimulatedEntity);
		}

		this.registerStates();
		this.setInitialState(CharacterStateMachine.STATE_ID.Movement);
	}

	public handleMovementInput(value: Vec2): void {
		this.movement?.setInput(value);
	}

	public handleJumpClick(): void {
		// If we're already in Jumping state but grounded (landing frame before
		// Jumping→Movement transition fires), force-transition to Movement first
		// so the subsequent requestStateChange(Jumping) succeeds.
		// This makes consecutive jumps responsive regardless of update order.
		if (this.getCurrentState() === CharacterStateMachine.STATE_ID.Jumping && this.jump?.canActivate()) {
			this.transitionTo(CharacterStateMachine.STATE_ID.Movement);
		}
		this.requestStateChange(CharacterStateMachine.STATE_ID.Jumping);
	}

	public handleJumpRelease(): void {
		this.jump?.abortJump();
	}

	public handleDashClick(): void {
		this.requestStateChange(CharacterStateMachine.STATE_ID.Dashing);
	}

	private registerStates(): void {
		this.registerState({
			id: CharacterStateMachine.STATE_ID.Movement,
			transitions: [],
			onUpdate: (dt: number): void => {
				this.movement?.update(dt);
			},
		});

		this.registerState({
			id: CharacterStateMachine.STATE_ID.Jumping,
			allowedFrom: [CharacterStateMachine.STATE_ID.Movement],
			transitions: [
				{
					to: CharacterStateMachine.STATE_ID.Movement,
					condition: (): boolean => {
						return !(this.jump?.getIsJumping() ?? false);
					},
				},
			],
			canEnter: (): boolean => {
				return this.jump?.canActivate() ?? false;
			},
			onEnter: (): void => {
				this.jump?.activate();
			},
			onUpdate: (dt: number): void => {
				this.movement?.update(dt);
				this.jump?.update(Date.now());
			},
		});

		this.registerState({
			id: CharacterStateMachine.STATE_ID.Dashing,
			allowedFrom: [CharacterStateMachine.STATE_ID.Movement],
			transitions: [
				{
					to: CharacterStateMachine.STATE_ID.Movement,
					condition: (): boolean => {
						return !(this.dash?.getIsDashing() ?? false);
					},
				},
			],
			canEnter: (): boolean => {
				return this.dash?.canActivate() ?? false;
			},
			onEnter: (): void => {
				if (this.dash && this.transformComponent) {
					this.dash.dash(this.transformComponent.worldRotation.mulVec3(Vec3.forward).normalize());
				}
			},
			onUpdate: (dt: number): void => {
				this.dash?.update(dt);
			},
		});
	}

	public isGrounded(): boolean {
		return this.groundInfo?.isGrounded ?? true;
	}

	public isNearlyGrounded(groundedThreshold: number): boolean {
		return this.groundInfo?.isNearlyGrounded(groundedThreshold) ?? true;
	}
}
