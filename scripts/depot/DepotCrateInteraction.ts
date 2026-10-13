/**
 * DepotCrateInteraction - Handles player proximity detection on warehouse crate trigger zone.
 *
 * Component Attachment: Spawned/Scene Entity (child TriggerZone entity under the crate)
 * Component Networking: Local (UI interaction is client-side only)
 * Component Ownership: Not Networked
 *
 * When the player enters the trigger, shows a HUD prompt (hand.png + "Open").
 * When the player clicks the prompt, opens the Depot UI via DepotPanelToggleRequestEvent.
 */

import type {
	Entity,
	Maybe,
	OnTriggerEnterEventPayload,
	OnTriggerExitEventPayload,
} from "meta/worlds";
import {
	BasePlayerComponent,
	Component,
	component,
	ExecuteOn,
	OnTriggerEnterEvent,
	OnTriggerExitEvent,
	PlayerService,
	Service,
	subscribe,
} from "meta/worlds";
import {
	PropPromptConfirmPickupEvent,
	PropPromptHideEvent,
	PropPromptShowEvent,
} from "../events/PropEvents";
import { DepotPanelToggleRequestEvent } from "../events/DepotEvents";

@component({ description: "Detects player proximity on crate trigger zone. Shows hand.png + Open prompt. Click opens depot UI." })
export class DepotCrateInteractionComponent extends Component {
	private isLocalPlayerNearby: boolean = false;

	// #region Trigger Detection
	@subscribe(OnTriggerEnterEvent, { execution: ExecuteOn.Everywhere })
	public onTriggerEnter(payload: OnTriggerEnterEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		const playerEntity = this.findPlayerEntity(payload.actorEntity);
		if (!playerEntity) {
			return;
		}

		if (Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			this.isLocalPlayerNearby = true;
			this.sendEventLocally(PropPromptShowEvent, {
				icon: null,
				baseValue: 0,
				isDepotInteraction: true,
				isDoorInteraction: false,
				text: "",
			});
		}
	}

	@subscribe(OnTriggerExitEvent, { execution: ExecuteOn.Everywhere })
	public onTriggerExit(payload: OnTriggerExitEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		const playerEntity = this.findPlayerEntity(payload.actorEntity);
		if (!playerEntity) {
			return;
		}

		if (Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			this.isLocalPlayerNearby = false;
			this.sendEventLocally(PropPromptHideEvent, {});
		}
	}
	// #endregion

	// #region Prompt Confirm
	@subscribe(PropPromptConfirmPickupEvent, { execution: ExecuteOn.Everywhere })
	public onPromptConfirm(): void {
		if (!this.isLocalPlayerNearby) {
			return;
		}

		this.isLocalPlayerNearby = false;
		this.sendEventLocally(PropPromptHideEvent, {});
		this.sendEventLocally(DepotPanelToggleRequestEvent, {});
	}
	// #endregion

	// #region Helpers
	private findPlayerEntity(actorEntity: Entity): Maybe<Entity> {
		if (actorEntity.getComponent(BasePlayerComponent)) {
			return actorEntity;
		}
		for (const ancestor of actorEntity.getAncestors()) {
			if (ancestor.getComponent(BasePlayerComponent)) {
				return ancestor;
			}
		}
		return null;
	}
	// #endregion
}
