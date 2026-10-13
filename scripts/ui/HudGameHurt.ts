/**
 * HudGameHurt - Controller + ViewModel for the screen-flash hurt effect.
 *
 * Component Attachment: Scene Entity (the HudGameHurt entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Listens to OnHealthSystemDamagedNetworkEvent (broadcast globally by PlayerLogic
 * when the player takes damage). On the local client, toggles the `playHurt`
 * boolean on the ViewModel which triggers the XAML PropertyChangedTrigger to play
 * the "HudGameHurt" Storyboard (red flash overlay, 0.6s).
 */

import type { Entity, Maybe } from "meta/worlds";
import {
	BasePlayerComponent,
	Component,
	CustomUiComponent,
	EntityService,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	OnPlayerCreateEvent,
	component,
	subscribe,
} from "meta/worlds";
import { HudGameHurtViewModel } from "../../generated/view_models/HudGameHurtViewModel";
import {
	HealthSystemDamagedEventPayload,
	OnHealthSystemDamagedNetworkEvent,
} from "../events/HealthEvents";

// #region Controller
@component({
	description:
		"HUD controller for screen-flash hurt effect. Toggles playHurt on damage to trigger XAML Storyboard.",
})
export class HudGameHurt extends Component {
	private viewModel = new HudGameHurtViewModel();
	private localPlayerEntity: Maybe<Entity> = null;
	private uiComponent: Maybe<CustomUiComponent> = null;

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	private onStart(): void {
		// Only run on clients — UI is local
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		// Bind ViewModel to CustomUiComponent
		this.uiComponent = this.entity.getComponent(CustomUiComponent);
		if (this.uiComponent) {
			this.uiComponent.dataContext = this.viewModel;
			// Panel stays visible by default; the red flash animation is triggered by damage events
		} else {
			console.log("[HudGameHurt.onStart] No CustomUiComponent found on entity");
			return;
		}

		// Try to find local player
		this.localPlayerEntity = this.findLocalPlayer();
	}

	@subscribe(OnPlayerCreateEvent, { execution: ExecuteOn.Everywhere })
	private onPlayerCreate(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		if (!this.localPlayerEntity) {
			this.localPlayerEntity = this.findLocalPlayer();
		}
	}
	// #endregion

	// #region Damage Subscription
	@subscribe(OnHealthSystemDamagedNetworkEvent, { execution: ExecuteOn.Everywhere })
	private onDamageReceived(payload: HealthSystemDamagedEventPayload): void {
		// Only react on client
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		// Check if the damaged entity is our local player
		if (!payload.targetEntity) {
			return;
		}

		// Find local player if not cached
		if (!this.localPlayerEntity) {
			this.localPlayerEntity = this.findLocalPlayer();
		}

		if (!this.localPlayerEntity) {
			return;
		}

		// Only flash when the LOCAL player takes damage
		if (payload.targetEntity.toString() === this.localPlayerEntity.toString()) {
			// Ensure UI is visible before triggering animation
			if (this.uiComponent && !this.uiComponent.isVisible) {
				this.uiComponent.isVisible = true;
			}
			// Toggle playHurt to trigger PropertyChangedTrigger in XAML
			this.viewModel.playHurt = !this.viewModel.playHurt;
		}
	}
	// #endregion

	// #region Helpers
	private findLocalPlayer(): Maybe<Entity> {
		const players = EntityService.findEntitiesWithComponent(BasePlayerComponent);
		if (players.length > 0) {
			return players[0];
		}
		return null;
	}
	// #endregion
}
// #endregion
