/**
 * GamePlayerPropManager - Manages player-prop inventory as a fixed 5-slot array.
 *
 * Component Attachment: Systems Entity (same entity as GamePhaseManager, GameEnemyManager, GamePropManager)
 * Component Networking: Local (not networked)
 * Component Ownership: Not Networked
 *
 * Networking Plan:
 * - This component runs entirely on the local client.
 * - No server authority is needed; all CRUD operations execute locally.
 * - When inventory changes, a LocalEvent (PropInventoryChangedEvent)
 *   is fired so other local systems can react (e.g., update UI).
 *
 * Inventory Rules:
 * - Fixed 5-slot array (slots 0-4)
 * - NO stacking: identical items occupy separate slots
 * - Items placed in first empty slot on pickup
 * - When an item is removed, that slot becomes null (no shifting)
 * - If all 5 slots are full, cannot pick up new items
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	Component,
	component,
	ExecuteOn,
	OnEntityStartEvent,
	property,
	subscribe,
} from "meta/worlds";
import {
	PropCategory,
	PropRarity,
} from "../props/PropConfig";
import {
	PropDataSnapshot,
	PropInventoryChangedEvent,
	PropPickedUpEvent,
	PropPickedUpPayload,
} from "../events/PropEvents";


/** Number of inventory slots */
const SLOT_COUNT = 5;

@component({ description: "Manages player-prop inventory as a fixed 5-slot array. No stacking. Runs locally on the client." })
export class GamePlayerPropManager extends Component {
	/** Maximum number of slots (fixed at 5) */
	@property({ minValue: 1, maxValue: 5 })
	public maxInventorySize: number = SLOT_COUNT;

	/**
	 * Fixed 5-slot inventory per player.
	 * Key = player entity string ID (via entity.toString())
	 * Value = fixed-length array of (PropDataSnapshot | null)
	 */
	private inventories: Map<string, (PropDataSnapshot | null)[]> = new Map();

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
	}

	/**
	 * Listen for prop pickup events (fired locally by PropPickupHandler).
	 * Automatically adds the prop to the player's inventory.
	 */
	@subscribe(PropPickedUpEvent, { execution: ExecuteOn.Everywhere })
	public onPropPickedUp(payload: PropPickedUpPayload): void {
		const playerEntity = payload.playerEntity as Maybe<Entity>;
		if (!playerEntity) {
			return;
		}

		this.addProp(playerEntity, payload.propData);
	}

	/**
	 * Reset inventory for level transition: clear all slots and emit change event.
	 * Called by GamePhaseManager during unloadCurrentLevel().
	 */
	public resetForLevelTransition(playerEntity: Entity): void {
		this.clearInventory(playerEntity);

		this.sendEventLocally(PropInventoryChangedEvent, {
			playerEntity: playerEntity,
			propData: new PropDataSnapshot(),
			changeType: "clear",
		});
	}
	// #endregion

	// #region CREATE
	/**
	 * Add a prop to the first available empty slot.
	 * NO stacking: each item occupies its own slot regardless of duplicates.
	 * @returns true if added successfully, false if inventory is full.
	 */
	public addProp(playerEntity: Entity, propData: PropDataSnapshot, quantity: number = 1): boolean {
		const playerId = playerEntity.toString();
		const slots = this.getOrCreateSlots(playerId);

		// Find first empty slot
		let emptySlotIndex = -1;
		for (let i = 0; i < SLOT_COUNT; i++) {
			if (slots[i] === null) {
				emptySlotIndex = i;
				break;
			}
		}

		if (emptySlotIndex < 0) {
			return false;
		}

		// Place item in the empty slot (no stacking)
		slots[emptySlotIndex] = propData;

		// Notify local listeners of the change
		this.broadcastChange(playerEntity, propData, "add");
		return true;
	}
	// #endregion

	// #region DELETE
	/**
	 * Remove the first occurrence of a prop matching rarity + category.
	 * The slot becomes null (no shifting).
	 * @returns true if removed, false if not found.
	 */
	public removeProp(playerEntity: Entity, rarity: PropRarity, category: PropCategory, quantity: number = 1): boolean {
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return false;
		}

		// Find first slot matching rarity + category
		for (let i = 0; i < SLOT_COUNT; i++) {
			const slot = slots[i];
			if (slot && slot.rarity === rarity && slot.category === category) {
				slots[i] = null;
				this.broadcastChange(playerEntity, slot, "remove");
				return true;
			}
		}

		return false;
	}

	/**
	 * Remove the item at a specific slot index (0-based).
	 * The slot becomes null (no shifting).
	 * @returns the removed PropDataSnapshot, or null if slot was already empty.
	 */
	public removePropAtSlot(playerEntity: Entity, slotIndex: number): PropDataSnapshot | null {
		if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
			return null;
		}

		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return null;
		}

		const data = slots[slotIndex];
		if (!data) {
			return null;
		}

		slots[slotIndex] = null;
		this.broadcastChange(playerEntity, data, "remove");
		return data;
	}

	/**
	 * Remove all props from a player's inventory (e.g., on disconnect or reset).
	 */
	public clearInventory(playerEntity: Entity): void {
		const playerId = playerEntity.toString();
		this.inventories.delete(playerId);
	}
	// #endregion

	// #region READ
	/**
	 * Get the fixed-slot inventory for a player.
	 * Returns a copy of the 5-slot array (null = empty slot).
	 */
	public getPlayerSlots(playerEntity: Entity): ReadonlyArray<PropDataSnapshot | null> {
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return [null, null, null, null, null];
		}
		return [...slots];
	}

	/**
	 * Get all inventory entries for a player (backward-compatible).
	 * Returns non-null items with quantity always 1.
	 */
	public getPlayerInventory(playerEntity: Entity): ReadonlyArray<{ propData: PropDataSnapshot; quantity: number; acquiredAt: number }> {
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return [];
		}
		const result: { propData: PropDataSnapshot; quantity: number; acquiredAt: number }[] = [];
		for (let i = 0; i < SLOT_COUNT; i++) {
			const slot = slots[i];
			if (slot) {
				result.push({
					propData: slot,
					quantity: 1,
					acquiredAt: 0,
				});
			}
		}
		return result;
	}

	/** Check if a player has a specific prop. */
	public hasProp(playerEntity: Entity, rarity: PropRarity, category: PropCategory): boolean {
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return false;
		}
		for (let i = 0; i < SLOT_COUNT; i++) {
			const slot = slots[i];
			if (slot && slot.rarity === rarity && slot.category === category) {
				return true;
			}
		}
		return false;
	}

	/** Get how many of a specific prop the player holds (each in separate slot). */
	public getPropQuantity(playerEntity: Entity, rarity: PropRarity, category: PropCategory): number {
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return 0;
		}
		let count = 0;
		for (let i = 0; i < SLOT_COUNT; i++) {
			const slot = slots[i];
			if (slot && slot.rarity === rarity && slot.category === category) {
				count++;
			}
		}
		return count;
	}

	/** Get the total number of items in the player's inventory. */
	public getInventoryCount(playerEntity: Entity): number {
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return 0;
		}
		let count = 0;
		for (let i = 0; i < SLOT_COUNT; i++) {
			if (slots[i] !== null) {
				count++;
			}
		}
		return count;
	}

	/** Get the total value of all items in the player's inventory. */
	public getPlayerTotalValue(playerEntity: Entity): number {
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return 0;
		}
		let total = 0;
		for (let i = 0; i < SLOT_COUNT; i++) {
			const slot = slots[i];
			if (slot) {
				total += slot.baseValue;
			}
		}
		return total;
	}

	/** Check if inventory is full (all slots occupied). */
	public isInventoryFull(playerEntity: Entity): boolean {
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return false;
		}
		for (let i = 0; i < SLOT_COUNT; i++) {
			if (slots[i] === null) {
				return false;
			}
		}
		return true;
	}

	/** Get the item at a specific slot index. */
	public getSlot(playerEntity: Entity, slotIndex: number): PropDataSnapshot | null {
		if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
			return null;
		}
		const playerId = playerEntity.toString();
		const slots = this.inventories.get(playerId);
		if (!slots) {
			return null;
		}
		return slots[slotIndex];
	}
	// #endregion

	// #region Helpers
	private getOrCreateSlots(playerId: string): (PropDataSnapshot | null)[] {
		let slots = this.inventories.get(playerId);
		if (!slots) {
			slots = [null, null, null, null, null];
			this.inventories.set(playerId, slots);
		}
		return slots;
	}

	private broadcastChange(playerEntity: Entity, propData: PropDataSnapshot, changeType: string): void {
		this.sendEventLocally(PropInventoryChangedEvent, {
			playerEntity: playerEntity,
			propData: propData,
			changeType: changeType,
		});
	}
	// #endregion
}
