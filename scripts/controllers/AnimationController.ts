/**
 * AnimationController - Syncs character state machine state with animator graph variables.
 *
 * Component Attachment: Character root entity (Player or Enemy)
 * Component Networking: Networked (@property fields replicate animation state to clients)
 * Component Ownership: Owner of the character entity (Server for enemies, Client for player)
 *
 * Server-side: CharacterUpdateManager calls update() which computes animation values,
 * stores them in @property() fields (auto-replicated), and sets the local animator.
 * Client-side: onClientSync() reads the replicated @property() values each frame
 * and applies them to the local AnimatorComponent via setGraphVariable().
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	AnimatorComponent,
	ExecuteOn,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	TransformComponent,
	Vec3,
	component,
	property,
	subscribe,
} from "meta/worlds";
import { CharacterForceControllerBase } from "./CharacterForceControllerBase";
import { CharacterStateMachine } from "./CharacterStateMachine";
import { EnemyMovementAbility } from "../components/ability/EnemyMovementAbility";
import { ICharacterInitializable } from "./ICharacterInitializable";
import { JumpStartedEvent } from "../components/ability/JumpAbility";
import { MovementAbility } from "../components/ability/MovementAbility";
import { PlayerMovementAbility } from "../components/ability/PlayerMovementAbility";

@component({
	description: "Animation controller that syncs SM state with animator graph variables. Uses @property() bridge to replicate animation state from server to clients.",
})
export class AnimationController extends ICharacterInitializable {
	@property()
	public animatorEntity: Maybe<Entity> = null;

	@property()
	public groundedThreshold: number = 0.8;

	// #region Networked animation state (auto-replicates from owner to all clients)
	@property()
	public syncedSpeed: number = 0;

	@property()
	public syncedIsGrounded: boolean = true;

	@property()
	public syncedIsRecentlyGrounded: boolean = true;

	@property()
	public syncedIsJumping: boolean = false;

	@property()
	public syncedMovementYaw: number = 0;
	// #endregion

	private animator: Maybe<AnimatorComponent> = null;
	private stateMachine: Maybe<CharacterStateMachine> = null;
	private movementComponent: Maybe<MovementAbility> = null;
	private transformComponent: Maybe<TransformComponent> = null;
	private characterForceController: Maybe<CharacterForceControllerBase> = null;

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	private onEntityStart(): void {
		const animEntity = this.animatorEntity ?? this.entity;
		this.animator = animEntity.getComponent(AnimatorComponent);
		if (!this.animator) {
			// Try searching children (Visuals entity pattern)
			const children = animEntity.getChildrenWithComponent(AnimatorComponent, true);
			if (children.length > 0) {
				this.animator = children[0].getComponent(AnimatorComponent);
			}
		}
	}

	public initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		this.stateMachine = characterRootEntity.getComponent(CharacterStateMachine);
		this.movementComponent = characterRootEntity.getComponent(PlayerMovementAbility)
			?? characterRootEntity.getComponent(EnemyMovementAbility);
		this.transformComponent = characterRootEntity.getComponent(TransformComponent);
		this.characterForceController = characterRootEntity.getComponent(CharacterForceControllerBase);
		this.subscribe(JumpStartedEvent, (): void => {
			if (this.animator) {
				this.animator.requestTransition("JumpTrigger");
			}
		});
	}

	/**
	 * Called by CharacterUpdateManager on the OWNER side each frame.
	 * Computes animation values, stores them in @property() fields (replicates to clients),
	 * and sets the local animator directly.
	 */
	public update(): void {
		const state = this.stateMachine?.getCurrentState() ?? CharacterStateMachine.STATE_ID.Movement;

		let velocity = Vec3.zero;
		if (this.movementComponent) {
			velocity = this.movementComponent.getDesiredVelocity();
		}
		if (this.characterForceController) {
			const sampledVelocity = this.characterForceController.sampledVelocity;
			const desiredSpeed = velocity.magnitude();
			if (desiredSpeed < 0.01) {
				velocity = sampledVelocity;
			} else {
				const velocityDirection = velocity.normalize();
				const scalarProjection = Math.max(desiredSpeed, sampledVelocity.dot(velocityDirection));
				velocity = velocityDirection.mul(scalarProjection);
			}
		}

		const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
		const isGrounded = this.stateMachine?.isGrounded() ?? true;
		const isRecentlyGrounded = this.stateMachine?.isNearlyGrounded(this.groundedThreshold) ?? true;
		const isJumping = state === CharacterStateMachine.STATE_ID.Jumping;
		const movementYaw = this.getRelativeMovementYaw(velocity);

		// Store in @property() fields - these auto-replicate to all clients
		this.syncedSpeed = horizontalSpeed;
		this.syncedIsGrounded = isGrounded;
		this.syncedIsRecentlyGrounded = isRecentlyGrounded;
		this.syncedIsJumping = isJumping;
		this.syncedMovementYaw = movementYaw;

		// Also set locally on the owner (server) for the server's copy of the animator
		if (this.animator) {
			this.animator.setGraphVariable("Speed", horizontalSpeed);
			this.animator.setGraphVariable("IsGrounded", isGrounded);
			this.animator.setGraphVariable("IsRecentlyGrounded", isRecentlyGrounded);
			this.animator.setGraphVariable("IsJumping", isJumping);
			this.animator.setGraphVariable("MovementDirectionYaw", movementYaw);
		}
	}

	/**
	 * CLIENT-SIDE SYNC: Runs on all machines every frame.
	 * On non-owner clients, reads the replicated @property() values and applies
	 * them to the local AnimatorComponent so the enemy animates correctly.
	 */
	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Everywhere })
	private onClientSync(payload: OnWorldUpdateEventPayload): void {
		// Only apply on non-owner clients (owner already sets via update())
		if (this.entity.isOwned()) {
			return;
		}

		// Apply synced animation properties to the local animator
		if (this.animator) {
			this.animator.setGraphVariable("Speed", this.syncedSpeed);
			this.animator.setGraphVariable("IsGrounded", this.syncedIsGrounded);
			this.animator.setGraphVariable("IsRecentlyGrounded", this.syncedIsRecentlyGrounded);
			this.animator.setGraphVariable("IsJumping", this.syncedIsJumping);
			this.animator.setGraphVariable("MovementDirectionYaw", this.syncedMovementYaw);
		}
	}

	private getRelativeMovementYaw(worldVelocity: Vec3): number {
		if (!this.transformComponent || worldVelocity.magnitudeSquared() < 0.01) {
			return 0;
		}

		const relativeVelocity = this.transformComponent.worldRotation.inverse().mulVec3(worldVelocity);
		if (relativeVelocity.magnitudeSquared() < 0.01) {
			return 0;
		}

		const moveAngle = Math.atan2(relativeVelocity.x, relativeVelocity.z) * (180 / Math.PI);
		const characterAngle = Math.atan2(Vec3.forward.x, Vec3.forward.z) * (180 / Math.PI);

		let yaw = moveAngle - characterAngle;
		if (yaw > 180) {
			yaw -= 360;
		}
		if (yaw < -180) {
			yaw += 360;
		}
		return yaw;
	}
}
