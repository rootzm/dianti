/**
 * PlayerFootstepAudio - Distance-accumulator footstep sound system
 *
 * Plays footstep sounds based on horizontal distance traveled while grounded.
 * Uses existing SoundComponent on the "SfxFootstep" child entity.
 *
 * Component Attachment: Player root entity (PlayerCharacter template)
 * Component Networking: Local (client-only, no networking needed)
 * Component Ownership: Player (client-owned)
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	component,
	ExecuteOn,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	SoundComponent,
	subscribe,
	TransformComponent,
} from "meta/worlds";
import { AnimationController } from '../controllers/AnimationController';
import { isCutscenePlaying } from '../events/CutsceneEvents';
import { PlayerMovementAbility } from './ability/PlayerMovementAbility';
import { WorldsGroundInfoComponent } from './physics/WorldsGroundInfoComponent';

// Step length thresholds in meters
const STEP_LENGTH_NORMAL = 1.8;
const STEP_LENGTH_SPRINT = 1.2;

// Speed threshold below which the player is considered stopped
const SPEED_THRESHOLD = 0.3;

// Speed multiplier threshold to detect sprint (sprint usually has multiplier > 1)
const SPRINT_MULTIPLIER_THRESHOLD = 1.3;

@component({
	description: 'Distance-accumulator footstep audio. Plays SfxFootstep sound at regular step intervals based on distance traveled while grounded.',
})
export class PlayerFootstepAudio extends Component {
	private soundComponent: Maybe<SoundComponent> = null;
	private groundInfo: Maybe<WorldsGroundInfoComponent> = null;
	private animController: Maybe<AnimationController> = null;
	private movementAbility: Maybe<PlayerMovementAbility> = null;

	private accumulatedDistance: number = 0;
	private lastPosition: Maybe<{ x: number; z: number }> = null;
	private transformComponent: Maybe<TransformComponent> = null;

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Owner })
	private onStart(): void {
		// Find the SfxFootstep child entity under Audio
		const audioChildren = this.entity.findChildrenWithName('SfxFootstep', true);
		if (audioChildren.length > 0) {
			this.soundComponent = audioChildren[0].getComponent(SoundComponent);
		}

		// Get AnimationController on this entity for speed
		this.animController = this.entity.getComponent(AnimationController);

		// Get PlayerMovementAbility for sprint detection
		this.movementAbility = this.entity.getComponent(PlayerMovementAbility);

		// Get WorldsGroundInfoComponent from KinematicCharacter child
		const groundChildren = this.entity.getChildrenWithComponent(WorldsGroundInfoComponent, true);
		if (groundChildren.length > 0) {
			this.groundInfo = groundChildren[0].getComponent(WorldsGroundInfoComponent);
		}

		// Get transform for position tracking
		this.transformComponent = this.entity.getComponent(TransformComponent);
	}

	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Owner })
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (!this.soundComponent || !this.transformComponent) {
			return;
		}
		if (isCutscenePlaying()) {
			return;
		}

		// Use AnimationController's grace-period grounded check to avoid flicker
		const isRecentlyGrounded = this.animController?.syncedIsRecentlyGrounded ?? false;

		// Get horizontal speed from AnimationController (already computed)
		const horizontalSpeed = this.animController?.syncedSpeed ?? 0;

		// Current world position
		const pos = this.transformComponent.worldPosition;
		const currentX = pos.x;
		const currentZ = pos.z;

		// If not grounded, PAUSE accumulation (do NOT reset) and update last position to avoid jump in distance on landing
		if (!isRecentlyGrounded) {
			this.lastPosition = { x: currentX, z: currentZ };
			return;
		}

		// If speed is below threshold, reset accumulation (player stopped)
		if (horizontalSpeed < SPEED_THRESHOLD) {
			this.lastPosition = { x: currentX, z: currentZ };
			this.accumulatedDistance = 0;
			return;
		}

		// Compute horizontal distance from last frame
		if (this.lastPosition !== null) {
			const dx = currentX - this.lastPosition.x;
			const dz = currentZ - this.lastPosition.z;
			const frameDist = Math.sqrt(dx * dx + dz * dz);

			this.accumulatedDistance += frameDist;
		}

		// Update last position
		this.lastPosition = { x: currentX, z: currentZ };

		// Determine step length based on sprint state
		const speedMultiplier = this.movementAbility?.getSpeedMultiplier() ?? 1.0;
		const stepLength = speedMultiplier >= SPRINT_MULTIPLIER_THRESHOLD
			? STEP_LENGTH_SPRINT
			: STEP_LENGTH_NORMAL;

		// Check if we've accumulated enough distance for a step
		if (this.accumulatedDistance >= stepLength) {
			// Play the footstep sound
			this.soundComponent.play({ fadeInDuration: 0 });

			// Carry over remainder for consistent cadence
			this.accumulatedDistance = this.accumulatedDistance - stepLength;
		}
	}
}
