/**
 * PropData - Base component for all props in the game world.
 *
 * Component Attachment: Spawned Entity (any prop entity in the scene)
 * Component Networking: Networked
 * Component Ownership: Server
 *
 * Holds weight, spawn weight, usability, value, rarity, and category for any prop.
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	component,
	ExecuteOn,
	OnEntityStartEvent,
	property,
	subscribe,
	TextureAsset,
} from "meta/worlds";
import {
	PropCategory,
	PropConstants,
	PropRarity,
} from "./PropConfig";

@component({ description: "Base component for all props. Holds weight, spawnWeight, usable, baseValue, rarity, category." })
export class PropData extends Component {
	/** Unique name identifier for this prop (used for save/load) */
	@property()
	public propName: string = "";

	/** Weight of the prop (affects inventory capacity) */
	@property({ minValue: 0 })
	public weight: number = 1;

	/** Spawn weight — used by weighted random selection when spawning props */
	@property({ minValue: 0 })
	public spawnWeight: number = 10;

	/** Whether this prop is allowed to be used */
	@property()
	public usable: boolean = true;

	/** Base monetary value of the prop */
	@property({ minValue: 0 })
	public baseValue: number = 0;

	/** Energy value gained when the prop is used (flashlight energy) */
	@property({ minValue: 0 })
	public useValue: number = 0;

	/** Rarity tier of this prop */
	@property()
	public rarity: PropRarity = PropRarity.Rarity1;

	/** Category classification of this prop */
	@property()
	public category: PropCategory = PropCategory.Material;

	/** Icon texture for this prop */
	@property()
	public icon: Maybe<TextureAsset> = null;

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
	}
	// #endregion

	// #region Helpers
	/** Get the display name for this prop's rarity */
	public getRarityName(): string {
		return PropConstants.RARITY_DISPLAY_NAMES[this.rarity] ?? "Unknown";
	}

	/** Get the display name for this prop's category */
	public getCategoryName(): string {
		return PropConstants.CATEGORY_DISPLAY_NAMES[this.category] ?? "Unknown";
	}
	// #endregion
}
