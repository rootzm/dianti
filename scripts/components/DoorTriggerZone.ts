/**
 * DoorTriggerZone - Proximity detection for player interaction with doors.
 *
 * Component Attachment: Scene Entity (child trigger zone entity under the door root)
 * Component Networking: Local (UI interaction is client-side only)
 * Component Ownership: Not Networked
 *
 * Mirrors the DepotCrateInteraction pattern:
 * - OnTriggerEnterEvent → show PropPromptShowEvent (interaction prompt)
 * - OnTriggerExitEvent → hide prompt
 * - PropPromptConfirmPickupEvent → call DoorLogic.toggleDoor() on parent
 *
 * The trigger entity must have a PhysicsBody (Trigger type) + ColliderBox sized ~2m.
 * The parent entity (or an ancestor) must have DoorLogic.
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
import { DoorLogic } from "./DoorLogic";
import { DoorState } from "../events/DoorEvents";
import { EnemyLogic, EnemyAIState } from "./EnemyLogic";

@component({
	description: "Detects player proximity on door trigger zone. Shows interaction prompt. Click toggles door open/close.",
})
export class DoorTriggerZone extends Component {
	// #region Constants
	private static readonly PROMPT_RESHOW_DELAY_MS = 550;
	// #endregion

	// #region Internal State
	private isLocalPlayerNearby: boolean = false;
	private doorLogic: Maybe<DoorLogic> = null;
	// #endregion

	// #region Trigger Detection
	@subscribe(OnTriggerEnterEvent, { execution: ExecuteOn.Everywhere })
	public onTriggerEnter(payload: OnTriggerEnterEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		// Lazy-find door logic on first trigger (avoid circular startup timing)
		if (!this.doorLogic) {
			this.doorLogic = this.findDoorLogic();
		}

		// Don't show prompt if door logic not found or door is broken
		if (!this.doorLogic || !this.doorLogic.isInteractable) {
			return;
		}

		// --- Enemy detection branch ---
		const enemyEntity = this.findEnemyEntity(payload.actorEntity);
		if (enemyEntity) {
			const enemyLogic = enemyEntity.getComponent(EnemyLogic);
			if (enemyLogic) {
				// Guard: skip if frozen by flashlight
				if (enemyLogic.isFrozenByFlashlight) {
					return;
				}
				// Guard: skip if already waiting at a regular door
				if (enemyLogic.getAIState() === EnemyAIState.WaitAtRegularDoor) {
					return;
				}
				// If door is closed, tell enemy to wait
				if (this.doorLogic.isClosed) {
					enemyLogic.onEnteredClosedDoorZone(this.doorLogic);
				}
				// If door is open, enemy passes through freely — do nothing
			}
			return;
		}

		// --- Player detection branch ---
		const playerEntity = this.findPlayerEntity(payload.actorEntity);
		if (!playerEntity) {
			return;
		}

		if (Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			this.isLocalPlayerNearby = true;
			let promptText: string;
			if (this.doorLogic!.doorState === DoorState.Closed) {
				promptText = "open";
			} else {
				promptText = "close";
			}
			this.sendEventLocally(PropPromptShowEvent, {
				icon: null,
				baseValue: 0,
				isDepotInteraction: false,
				isDoorInteraction: true,
				text: promptText,
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

		if (!this.doorLogic) {
			this.doorLogic = this.findDoorLogic();
		}

		if (!this.doorLogic || !this.doorLogic.isInteractable) {
			return;
		}

		// Toggle the door
		this.doorLogic.toggleDoor();

		// Hide prompt during animation (prevents double-click)
		this.sendEventLocally(PropPromptHideEvent, {});

		// After animation completes, re-show prompt with updated text if player is still nearby
		setTimeout((): void => {
			if (!this.entity.valid) return;
			if (!this.isLocalPlayerNearby) {
				return;
			}
			if (!this.doorLogic || !this.doorLogic.isInteractable) {
				return;
			}
			let promptText: string;
			if (this.doorLogic.doorState === DoorState.Closed) {
				promptText = "open";
			} else {
				promptText = "close";
			}
			this.sendEventLocally(PropPromptShowEvent, {
				icon: null,
				baseValue: 0,
				isDepotInteraction: false,
				isDoorInteraction: true,
				text: promptText,
			});
		}, DoorTriggerZone.PROMPT_RESHOW_DELAY_MS);
	}
	// #endregion

	// #region Helpers
	/**
	 * Walk ancestors to find an entity with EnemyLogic component.
	 * Enemy PhysicsBody may be on a sub-entity, so we check actorEntity and ancestors.
	 */
	private findEnemyEntity(actorEntity: Entity): Maybe<Entity> {
		if (actorEntity.getComponent(EnemyLogic)) {
			return actorEntity;
		}
		for (const ancestor of actorEntity.getAncestors()) {
			if (ancestor.getComponent(EnemyLogic)) {
				return ancestor;
			}
		}
		return null;
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

	/**
	 * Find DoorLogic on parent or ancestor entities.
	 * The trigger zone is a child of the door root entity which has DoorLogic.
	 */
	private findDoorLogic(): Maybe<DoorLogic> {
		for (const ancestor of this.entity.getAncestors()) {
			const logic = ancestor.getComponent(DoorLogic);
			if (logic) {
				return logic;
			}
		}
		return null;
	}
	// #endregion
}
