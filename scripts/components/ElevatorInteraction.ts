/**
 * ElevatorInteraction - PropPrompt interaction for level completion at the elevator.
 *
 * Component Attachment: Scene Entity (TriggerZone child entity near SM_dianti_polySurface22)
 * Component Networking: Local (UI interaction is client-side only)
 * Component Ownership: Not Networked
 *
 * When the player enters the trigger zone, always shows the PropPrompt (hand + button).
 * On confirm: if energy is full, closes elevator doors and fires ShowVictoryPanelEvent.
 * If energy is not full, fires AnnouncementEnergyInsufficientEvent without proceeding.
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

@component({ description: "PropPrompt interaction at elevator for level completion. Shows prompt when energy is full and player is nearby." })
export class ElevatorInteractionComponent extends Component {
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
		console.log("[ElevatorInteraction] Local player entered elevator zone");

		// Always show prompt regardless of energy status
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
		console.log("[ElevatorInteraction] Local player exited elevator zone");

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
			console.log("[ElevatorInteraction] Energy insufficient, firing announcement");
			this.sendEventLocally(AnnouncementEnergyInsufficientEvent, { dummy: 0 });
			return;
		}

		console.log("[ElevatorInteraction] Player confirmed interaction, triggering level completion");
		EventService.sendLocally(AnnouncementChargeDoneEvent, { dummy: 0 });
		this.isLocalPlayerNearby = false;
		this.hidePrompt();

		// Transition to Settlement phase (blocks movement/actions via GamePhaseChangedEvent)
		const phaseEntities = EntityService.findEntitiesWithComponent(GamePhaseManager);
		if (phaseEntities.length > 0) {
			const phaseMgr = phaseEntities[0].getComponent(GamePhaseManager);
			if (phaseMgr) {
				phaseMgr.startSettlement();
			}
		}

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
			isDoorInteraction: false,
			text: "",
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
