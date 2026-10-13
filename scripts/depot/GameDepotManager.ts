/**
 * GameDepotManager - Global depot/warehouse manager as a Component.
 *
 * Component Attachment: Scene Entity (World/Systems)
 * Component Networking: Local (depot data is client-side only)
 * Component Ownership: Not Networked
 *
 * Stores up to 12 props without stacking (each prop occupies one independent slot).
 *
 * Usage:
 *   import { GameDepotManager } from './GameDepotManager';
 *   const depotEntities = EntityService.findEntitiesWithComponent(GameDepotManager);
 *   const depot = depotEntities[0].getComponent(GameDepotManager);
 *   depot.addItem(propDataSnapshot);
 *
 * Compatible with the existing PropDataSnapshot from PropEvents.ts.
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	component,
	EntityService,
	ExecuteOn,
	OnEntityStartEvent,
	subscribe,
} from "meta/worlds";
import { PropCategory } from "../props/PropConfig";
import { PropRarity } from "../props/PropConfig";
import { PropDataSnapshot } from "../events/PropEvents";

export interface DepotSlot {
	/** The prop data stored in this slot */
	readonly propData: PropDataSnapshot;
	/** Timestamp when this item was stored */
	readonly storedAt: number;
}

export interface DepotOperationResult {
	readonly success: boolean;
	readonly message: string;
}

export interface DepotIndexedSlot {
	readonly index: number;
	readonly slot: DepotSlot;
}

/**
 * @component
 * Component Attachment: Scene Entity (World/Systems)
 * Component Networking: Local (depot data is client-side only)
 * Component Ownership: Not Networked
 */
@component({ description: "Depot/warehouse manager. Stores up to 12 props without stacking." })
export class GameDepotManager extends Component {
	private static readonly MAX_SLOTS: number = 12;

	/** Internal storage: sparse array of slots (null = empty) */
	private slots: (DepotSlot | null)[] = [];

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	onStart(): void {
		for (let i = 0; i < GameDepotManager.MAX_SLOTS; i++) {
			this.slots.push(null);
		}
	}

	/** Helper to get the GameDepotManager instance from the scene */
	public static find(): Maybe<GameDepotManager> {
		const entities = EntityService.findEntitiesWithComponent(GameDepotManager);
		if (entities.length === 0) {
			return null;
		}
		return entities[0].getComponent(GameDepotManager);
	}

	// #region CREATE: Add item to depot
	/**
	 * Add a prop to the depot. Occupies the first available empty slot.
	 * Does NOT stack — each item always takes one independent slot.
	 * @returns Result indicating success or failure (e.g., depot full).
	 */
	public addItem(propData: PropDataSnapshot): DepotOperationResult {
		const emptyIndex = this.findFirstEmptySlot();
		if (emptyIndex === -1) {

			return {
				success: false,
				message: `Depot is full (${GameDepotManager.MAX_SLOTS} slots occupied).`,
			};
		}

		this.slots[emptyIndex] = {
			propData: propData,
			storedAt: Date.now(),
		};


		return {
			success: true,
			message: `Added item to slot ${emptyIndex}.`,
		};
	}

	/**
	 * Add a prop to a specific slot index.
	 * @returns Result indicating success or failure.
	 */
	public addItemAt(index: number, propData: PropDataSnapshot): DepotOperationResult {
		if (!this.isValidIndex(index)) {
			return {
				success: false,
				message: `Invalid slot index: ${index}. Must be 0-${GameDepotManager.MAX_SLOTS - 1}.`,
			};
		}
		if (this.slots[index] !== null) {
			return {
				success: false,
				message: `Slot ${index} is already occupied.`,
			};
		}

		this.slots[index] = {
			propData: propData,
			storedAt: Date.now(),
		};


		return {
			success: true,
			message: `Added item to slot ${index}.`,
		};
	}
	// #endregion

	// #region DELETE: Remove item from depot
	/**
	 * Remove the item at the specified slot index.
	 * @returns The removed prop data, or null if the slot was empty.
	 */
	public removeItemAt(index: number): Maybe<PropDataSnapshot> {
		if (!this.isValidIndex(index)) {

			return null;
		}

		const slot = this.slots[index];
		if (!slot) {

			return null;
		}

		this.slots[index] = null;

		return slot.propData;
	}

	/**
	 * Remove the first item matching the given rarity.
	 * @returns The removed prop data, or null if not found.
	 */
	public removeItemByRarity(rarity: PropRarity): Maybe<PropDataSnapshot> {
		for (let i = 0; i < GameDepotManager.MAX_SLOTS; i++) {
			const slot = this.slots[i];
			if (slot && slot.propData.rarity === rarity) {
				this.slots[i] = null;

				return slot.propData;
			}
		}

		return null;
	}

	/**
	 * Clear all items from the depot.
	 */
	public clearAll(): void {
		for (let i = 0; i < GameDepotManager.MAX_SLOTS; i++) {
			this.slots[i] = null;
		}

	}
	// #endregion

	// #region UPDATE: Modify item in depot
	/**
	 * Update the prop data at the specified slot index.
	 * @returns Result indicating success or failure.
	 */
	public updateItem(index: number, newPropData: PropDataSnapshot): DepotOperationResult {
		if (!this.isValidIndex(index)) {
			return {
				success: false,
				message: `Invalid slot index: ${index}.`,
			};
		}
		if (!this.slots[index]) {
			return {
				success: false,
				message: `Slot ${index} is empty, nothing to update.`,
			};
		}

		this.slots[index] = {
			propData: newPropData,
			storedAt: this.slots[index]!.storedAt,
		};


		return {
			success: true,
			message: `Updated slot ${index}.`,
		};
	}

	/**
	 * Swap items between two slots.
	 * @returns Result indicating success or failure.
	 */
	public swapItems(indexA: number, indexB: number): DepotOperationResult {
		if (!this.isValidIndex(indexA) || !this.isValidIndex(indexB)) {
			return {
				success: false,
				message: `Invalid slot index(es): ${indexA}, ${indexB}.`,
			};
		}

		const temp = this.slots[indexA];
		this.slots[indexA] = this.slots[indexB];
		this.slots[indexB] = temp;


		return {
			success: true,
			message: `Swapped slots ${indexA} and ${indexB}.`,
		};
	}
	// #endregion

	// #region READ: Query depot data
	/**
	 * Get the item at a specific slot index.
	 * @returns The DepotSlot or null if the slot is empty.
	 */
	public getItem(index: number): Maybe<DepotSlot> {
		if (!this.isValidIndex(index)) {
			return null;
		}
		return this.slots[index];
	}

	/**
	 * Get all occupied slots as an array of indexed slot pairs.
	 */
	public getAllItems(): DepotIndexedSlot[] {
		const results: DepotIndexedSlot[] = [];
		for (let i = 0; i < GameDepotManager.MAX_SLOTS; i++) {
			const slot = this.slots[i];
			if (slot) {
				results.push({
					index: i,
					slot: slot,
				});
			}
		}
		return results;
	}

	/**
	 * Find all items matching a given category.
	 */
	public findByCategory(category: PropCategory): DepotIndexedSlot[] {
		const results: DepotIndexedSlot[] = [];
		for (let i = 0; i < GameDepotManager.MAX_SLOTS; i++) {
			const slot = this.slots[i];
			if (slot && slot.propData.category === category) {
				results.push({
					index: i,
					slot: slot,
				});
			}
		}
		return results;
	}

	/**
	 * Find all items matching a given rarity.
	 */
	public findByRarity(rarity: PropRarity): DepotIndexedSlot[] {
		const results: DepotIndexedSlot[] = [];
		for (let i = 0; i < GameDepotManager.MAX_SLOTS; i++) {
			const slot = this.slots[i];
			if (slot && slot.propData.rarity === rarity) {
				results.push({
					index: i,
					slot: slot,
				});
			}
		}
		return results;
	}

	/**
	 * Check if the depot contains an item with the given rarity.
	 */
	public hasItemByRarity(rarity: PropRarity): boolean {
		return this.slots.some((slot: DepotSlot | null): boolean => {
			return slot !== null && slot.propData.rarity === rarity;
		});
	}
	// #endregion

	// #region Capacity Info
	/** Get maximum depot capacity */
	public getMaxSlots(): number {
		return GameDepotManager.MAX_SLOTS;
	}

	/** Get current number of occupied slots */
	public getOccupiedCount(): number {
		return this.slots.filter((s: DepotSlot | null): boolean => {
			return s !== null;
		}).length;
	}

	/** Get number of empty slots remaining */
	public getEmptyCount(): number {
		return GameDepotManager.MAX_SLOTS - this.getOccupiedCount();
	}

	/** Check if the depot is full */
	public isFull(): boolean {
		return this.getOccupiedCount() >= GameDepotManager.MAX_SLOTS;
	}

	/** Check if the depot is empty */
	public isEmpty(): boolean {
		return this.getOccupiedCount() === 0;
	}
	// #endregion

	// #region Internal Helpers
	private isValidIndex(index: number): boolean {
		return Number.isInteger(index) && index >= 0 && index < GameDepotManager.MAX_SLOTS;
	}

	private findFirstEmptySlot(): number {
		for (let i = 0; i < GameDepotManager.MAX_SLOTS; i++) {
			if (this.slots[i] === null) {
				return i;
			}
		}
		return -1;
	}
	// #endregion
}
