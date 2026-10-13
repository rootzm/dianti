/**
 * RestoreItemTriggerZone - Proximity detection for player interaction with restore items (HP/Power).
 *
 * Component Attachment: Scene Entity (child trigger zone entity under the restore item root)
 * Component Networking: Local (UI interaction is client-side only)
 * Component Ownership: Not Networked
 *
 * Pattern mirrors DoorTriggerZone:
 * - OnTriggerEnterEvent → show PropPromptShowEvent (interaction prompt)
 * - OnTriggerExitEvent → hide prompt
 * - PropPromptConfirmPickupEvent → call PlayerLogic.heal() or addPower() → disable parent root → hide prompt
 *
 * The trigger entity must have a PhysicsBody (Trigger type) + ColliderBox/Sphere.
 * The parent entity is the item root (sm_HP or SM_MP template root).
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
	property,
	subscribe,
} from "meta/worlds";
import {
	PropPromptConfirmPickupEvent,
	PropPromptHideEvent,
	PropPromptShowEvent,
} from "../events/PropEvents";
import {
	AnnouncementHpFullEvent,
	AnnouncementPowerFullEvent,
} from "../events/AnnouncementEvents";
import { PlayerLogic } from "./PlayerLogic";

@component({
	description: "Detects player proximity on restore item trigger zone. Shows interaction prompt. Click restores HP or Power then disables the item.",
})
export class RestoreItemTriggerZone extends Component {
	// #region Properties
	/** Type of restore: "HP" or "Power" */
	@property()
	public restoreType: string = "HP";

	/** Amount to restore */
	@property({ minValue: 1, maxValue: 500 })
	public restoreAmount: number = 50;
	// #endregion

	// #region Internal State
	private isLocalPlayerNearby: boolean = false;
	private consumed: boolean = false;
	private cachedPlayerEntity: Maybe<Entity> = null;
	// #endregion

	// #region Trigger Detection
	@subscribe(OnTriggerEnterEvent, { execution: ExecuteOn.Everywhere })
	public onTriggerEnter(payload: OnTriggerEnterEventPayload): void {
		if (!payload.actorEntity || this.consumed) {
			return;
		}

		const playerEntity = this.findPlayerEntity(payload.actorEntity);
		if (!playerEntity) {
			return;
		}

		if (Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			this.isLocalPlayerNearby = true;
			this.cachedPlayerEntity = playerEntity;

			const promptText = this.restoreType === "HP"
				? `Restores ${this.restoreAmount} Health`
				: `Restores ${this.restoreAmount} Power`;

			console.log(`[RestoreItemTriggerZone] Player entered - showing prompt: ${promptText}`);
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
		if (!payload.actorEntity || this.consumed) {
			return;
		}

		const playerEntity = this.findPlayerEntity(payload.actorEntity);
		if (!playerEntity) {
			return;
		}

		if (Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			this.isLocalPlayerNearby = false;
			this.cachedPlayerEntity = null;
			this.sendEventLocally(PropPromptHideEvent, {});
		}
	}
	// #endregion

	// #region Prompt Confirm
	@subscribe(PropPromptConfirmPickupEvent, { execution: ExecuteOn.Everywhere })
	public onPromptConfirm(): void {
		if (!this.isLocalPlayerNearby || this.consumed) {
			return;
		}

		if (!this.cachedPlayerEntity) {
			console.log("[RestoreItemTriggerZone] No cached player entity on confirm");
			return;
		}

		const playerLogic = this.cachedPlayerEntity.getComponent(PlayerLogic);
		if (!playerLogic) {
			console.log("[RestoreItemTriggerZone] PlayerLogic not found on player entity");
			return;
		}

		// Check if player is already at max
		if (this.restoreType === "HP" && playerLogic.currentHealth >= playerLogic.maxHealth) {
			console.log("[RestoreItemTriggerZone] Player HP is already full, cannot use.");
			this.sendEventLocally(AnnouncementHpFullEvent, { dummy: 0 });
			return;
		}
		if (this.restoreType !== "HP" && playerLogic.currentPower >= playerLogic.maxPower) {
			console.log("[RestoreItemTriggerZone] Player Power is already full, cannot use.");
			this.sendEventLocally(AnnouncementPowerFullEvent, { dummy: 0 });
			return;
		}

		// Apply restore
		if (this.restoreType === "HP") {
			const actual = playerLogic.heal(this.restoreAmount);
			console.log(`[RestoreItemTriggerZone] Healed player for ${actual} HP`);
		} else {
			const actual = playerLogic.addPower(this.restoreAmount);
			console.log(`[RestoreItemTriggerZone] Restored ${actual} Power to player`);
		}

		// Mark as consumed to prevent repeated interaction
		this.consumed = true;

		// Hide the prompt
		this.sendEventLocally(PropPromptHideEvent, {});

		// Disable the parent root entity (hides mesh + VFX + trigger)
		const rootEntity = this.findRootAncestor();
		if (rootEntity) {
			rootEntity.enabledSelf = false;
			console.log("[RestoreItemTriggerZone] Disabled root entity");
		} else {
			// Fallback: disable self
			this.entity.enabledSelf = false;
			console.log("[RestoreItemTriggerZone] Disabled trigger zone entity (fallback)");
		}

		this.isLocalPlayerNearby = false;
		this.cachedPlayerEntity = null;
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

	/**
	 * Find the topmost ancestor entity (HealthPickup/PowerPickup root).
	 * The last element in getAncestors() is the topmost parent in the hierarchy.
	 */
	private findRootAncestor(): Maybe<Entity> {
		const ancestors = this.entity.getAncestors();
		if (ancestors.length > 0) {
			// The last ancestor is the topmost root (HealthPickup/PowerPickup)
			return ancestors[ancestors.length - 1];
		}
		return null;
	}
	// #endregion
}
