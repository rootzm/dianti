/**
 * PassTriggerZone - Proximity-based interaction for level pass trigger.
 *
 * Component Attachment: Scene Entity (PassTrigger child entity inside Elevator template)
 * Component Networking: Local (Not Networked)
 * Component Ownership: Not Networked
 *
 * When the local player enters the PassTrigger zone, shows PropPrompt with text "pass".
 * On confirm: checks energy via GamePhaseManager.isFull().
 * - If full: closes elevator doors and fires ShowVictoryPanelEvent.
 * - If not full: fires AnnouncementEnergyInsufficientEvent.
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
	EntityService,
	EventService,
	ExecuteOn,
	OnTriggerEnterEvent,
	OnTriggerExitEvent,
	PlayerService,
	Service,
	component,
	subscribe,
} from "meta/worlds";
import {
	PropPromptConfirmPickupEvent,
	PropPromptHideEvent,
	PropPromptShowEvent,
} from "../events/PropEvents";
import { ShowVictoryPanelEvent } from "../events/GamePhaseEvents";
import { AnnouncementChargeDoneEvent, AnnouncementEnergyInsufficientEvent } from "../events/AnnouncementEvents";
import { ElevatorDoorController } from "./Elevator";
import { GamePhaseManager } from "../game/GamePhaseManager";

@component({
	description: "Trigger zone for level pass. Shows 'pass' prompt; on confirm checks energy and triggers level completion or insufficient announcement.",
})
export class PassTriggerZone extends Component {
	private isLocalPlayerNearby: boolean = false;
	private promptShown: boolean = false;

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

		if (!Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			return;
		}

		this.isLocalPlayerNearby = true;
		console.log("[PassTriggerZone] Local player entered pass trigger zone");
		this.showPrompt();
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

		if (!Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			return;
		}

		this.isLocalPlayerNearby = false;
		console.log("[PassTriggerZone] Local player exited pass trigger zone");

		if (this.promptShown) {
			this.hidePrompt();
		}
	}
	// #endregion

	// #region Prompt Confirm
	@subscribe(PropPromptConfirmPickupEvent, { execution: ExecuteOn.Everywhere })
	public onPromptConfirm(): void {
		if (!this.isLocalPlayerNearby || !this.promptShown) {
			return;
		}

		// Check energy before proceeding
		if (!this.isEnergyFull()) {
			console.log("[PassTriggerZone] Energy insufficient, firing announcement");
			this.sendEventLocally(AnnouncementEnergyInsufficientEvent, { dummy: 0 });
			return;
		}

		console.log("[PassTriggerZone] Energy full, triggering level completion");
		EventService.sendLocally(AnnouncementChargeDoneEvent, { dummy: 0 });
		this.isLocalPlayerNearby = false;
		this.hidePrompt();

		// Close elevator doors
		const elevatorEntities = EntityService.findEntitiesWithComponent(ElevatorDoorController);
		if (elevatorEntities.length > 0) {
			const doorController = elevatorEntities[0].getComponent(ElevatorDoorController);
			if (doorController) {
				doorController.closeDoors();
			}
		}

		// Fire ShowVictoryPanelEvent to trigger the victory flow
		this.sendEventLocally(ShowVictoryPanelEvent, {
			dummy: 0,
		});
	}
	// #endregion

	// #region Helpers
	private showPrompt(): void {
		this.promptShown = true;
		this.sendEventLocally(PropPromptShowEvent, {
			icon: null,
			baseValue: 0,
			isDepotInteraction: false,
			isDoorInteraction: true,
			text: "pass",
		});
	}

	private hidePrompt(): void {
		this.promptShown = false;
		this.sendEventLocally(PropPromptHideEvent, {});
	}

	private isEnergyFull(): boolean {
		const phaseEntities = EntityService.findEntitiesWithComponent(GamePhaseManager);
		if (phaseEntities.length === 0) {
			return false;
		}
		const phaseMgr = phaseEntities[0].getComponent(GamePhaseManager);
		if (!phaseMgr) {
			return false;
		}
		return phaseMgr.isFull();
	}

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
