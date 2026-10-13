/**
 * Handles manual prop pickup via HUD button interaction.
 *
 * Component Attachment: Spawned Entity (prop root entity that has PhysicsBody=Trigger)
 * Component Networking: Local (not networked)
 * Component Ownership: Not Networked
 *
 * All props use manual pickup: player enters trigger range, sees a HUD prompt,
 * and clicks to pick up.
 * Shows a 2D screen-space HUD prompt (via LocalEvent) when player is in range.
 *
 * Networking Plan:
 * - All pickup logic runs locally on the client.
 * - OnTriggerEnterEvent/Exit handle Manual pickup locally.
 * - No RPC or server authority needed; consumed flag is local.
 * - PropPickedUpEvent is emitted locally for inventory to pick up.
 * - Pickup prompt is shown/hidden via LocalEvent to a ScreenSpace HUD.
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
	EntityService,
	ExecuteOn,
	OnTriggerEnterEvent,
	OnTriggerExitEvent,
	PlayerService,
	Service,
	property,
	subscribe,
} from "meta/worlds";
import { PropData } from "./PropData";
import {
	PropDataSnapshot,
	PropPickedUpEvent,
	PropTransferNotifyEvent,
} from "../events/PropEvents";
import { GamePlayerPropManager } from "../game/GamePlayerPropManager";
import {
	PropPromptConfirmPickupEvent,
	PropPromptHideEvent,
	PropPromptShowEvent,
} from "../events/PropEvents";

@component({ description: "Handles manual prop pickup via HUD button. Shows 2D screen prompt when player enters trigger range. Runs locally." })
export class PropPickupHandler extends Component {
	/** Whether this prop has been consumed (prevents double pickup) */
	@property()
	public consumed: boolean = false;

	private isLocalPlayerNearby: boolean = false;
	private nearbyPlayer: Maybe<Entity> = null;

	// #region Trigger Detection
	@subscribe(OnTriggerEnterEvent, { execution: ExecuteOn.Everywhere })
	public onTriggerEnter(payload: OnTriggerEnterEventPayload): void {
		if (this.consumed || !payload.actorEntity) {
			return;
		}

		const playerEntity = this.findPlayerEntity(payload.actorEntity);
		if (!playerEntity) {
			return;
		}

		const propBase = this.entity.getComponent(PropData);
		if (!propBase) {
			return;
		}

		// Manual pickup: show 2D prompt for local player
		this.nearbyPlayer = playerEntity;
		if (Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			this.isLocalPlayerNearby = true;
			this.sendEventLocally(PropPromptShowEvent, {
				icon: propBase.icon,
				baseValue: propBase.baseValue,
				isDepotInteraction: false,
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

		const propBase = this.entity.getComponent(PropData);
		if (!propBase) {
			return;
		}

		if (Service.get(PlayerService).isLocalPlayer(playerEntity)) {
			this.isLocalPlayerNearby = false;
			this.nearbyPlayer = null;
			this.sendEventLocally(PropPromptHideEvent, {});
		}
	}
	// #endregion

	// #region Manual Pickup via HUD Click
	@subscribe(PropPromptConfirmPickupEvent, { execution: ExecuteOn.Everywhere })
	public onPromptConfirmPickup(): void {
		if (this.consumed) {
			return;
		}
		if (!this.isLocalPlayerNearby) {
			return;
		}

		const propBase = this.entity.getComponent(PropData);
		if (!propBase) {
			return;
		}

		// Check inventory capacity before manual pickup
		if (this.nearbyPlayer && this.isInventoryFull(this.nearbyPlayer)) {
			this.sendEventLocally(PropTransferNotifyEvent, {
				message: "Backpack Full",
			});
			return;
		}

		this.consumed = true;
		this.sendEventLocally(PropPromptHideEvent, {});

		if (this.nearbyPlayer) {
			this.emitPickupEvent(this.nearbyPlayer, propBase);
		}

		// Disable entity for pool reuse instead of destroying.
		// GamePropManager will formally recycle it at level end.
		this.entity.enabledSelf = false;
	}
	// #endregion

	// #region Emit Pickup Event
	private emitPickupEvent(playerEntity: Entity, propBase: PropData): void {
		const snapshot = new PropDataSnapshot(
			propBase.propName,
			propBase.weight,
			propBase.spawnWeight,
			propBase.usable,
			propBase.baseValue,
			propBase.rarity,
			propBase.category,
			propBase.icon,
			propBase.useValue,
		);
		this.sendEventLocally(PropPickedUpEvent, {
			playerEntity: playerEntity,
			propData: snapshot,
		});
	}
	// #endregion

	// #region Pool Reset
	/**
	 * Reset all runtime state so this entity can be reused from the pool.
	 * Called by GamePropManager before re-enabling a pooled prop.
	 */
	public resetForPool(): void {
		this.consumed = false;
		this.isLocalPlayerNearby = false;
		this.nearbyPlayer = null;
	}
	// #endregion

	// #region Helpers
	/**
	 * Check if the player's inventory is full.
	 * GamePlayerPropManager lives on a scene manager entity, not on the player.
	 * We find it via EntityService and pass the player entity to its method.
	 */
	private isInventoryFull(playerEntity: Entity): boolean {
		const inventoryEntities = EntityService.findEntitiesWithComponent(GamePlayerPropManager);
		if (inventoryEntities.length === 0) {
			return false;
		}
		const inventory = inventoryEntities[0].getComponent(GamePlayerPropManager);
		if (!inventory) {
			return false;
		}
		return inventory.isInventoryFull(playerEntity);
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
