/**
 * PropEvents - Shared event definitions for the prop system.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Keeps events in a separate file to avoid circular imports between
 * PropPickupHandler, PropManager, and GamePlayerPropManager.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	LocalEvent,
	property,
	serializable,
	TextureAsset,
} from "meta/worlds";
import {
	PropCategory,
	PropRarity,
} from "../props/PropConfig";


// #region PropDataSnapshot
@serializable()
export class PropDataSnapshot {
	@property()
	public readonly propName: string = "";

	@property()
	public readonly weight: number = 1;

	@property()
	public readonly spawnWeight: number = 10;

	@property()
	public readonly usable: boolean = true;

	@property()
	public readonly baseValue: number = 0;

	@property()
	public readonly useValue: number = 0;

	@property()
	public readonly rarity: PropRarity = PropRarity.Rarity1;

	@property()
	public readonly category: PropCategory = PropCategory.Material;

	@property()
	public readonly icon: Maybe<TextureAsset> = null;

	constructor(
		propName?: string,
		weight?: number,
		spawnWeight?: number,
		usable?: boolean,
		baseValue?: number,
		rarity?: PropRarity,
		category?: PropCategory,
		icon?: TextureAsset | null,
		useValue?: number,
	) {
		const overrides: Record<string, unknown> = {};
		if (propName !== undefined) {
			overrides.propName = propName;
		}
		if (weight !== undefined) {
			overrides.weight = weight;
		}
		if (spawnWeight !== undefined) {
			overrides.spawnWeight = spawnWeight;
		}
		if (usable !== undefined) {
			overrides.usable = usable;
		}
		if (baseValue !== undefined) {
			overrides.baseValue = baseValue;
		}
		if (useValue !== undefined) {
			overrides.useValue = useValue;
		}
		if (rarity !== undefined) {
			overrides.rarity = rarity;
		}
		if (category !== undefined) {
			overrides.category = category;
		}
		if (icon !== undefined) {
			overrides.icon = icon;
		}
		Object.assign(this, overrides);
	}
}
// #endregion

// #region Pickup Event Payload
@serializable()
export class PropPickedUpPayload {
	/** The player entity that picked up the prop */
	@property()
	public readonly playerEntity: Maybe<Entity> = null;

	/** Snapshot of the prop data at pickup time */
	@property()
	public readonly propData: PropDataSnapshot = new PropDataSnapshot();

	constructor(playerEntity?: Entity, propData?: PropDataSnapshot) {
		const overrides: Record<string, unknown> = {};
		if (playerEntity !== undefined) {
			overrides.playerEntity = playerEntity;
		}
		if (propData !== undefined) {
			overrides.propData = propData;
		}
		Object.assign(this, overrides);
	}
}
// #endregion

// #region Inventory Changed Payload
@serializable()
export class PropInventoryChangedPayload {
	/** The player whose inventory changed */
	@property()
	public readonly playerEntity: Maybe<Entity> = null;

	/** The prop data that was affected */
	@property()
	public readonly propData: PropDataSnapshot = new PropDataSnapshot();

	/** The type of change: 'add' | 'remove' | 'update' */
	@property()
	public readonly changeType: string = "add";

	constructor(playerEntity?: Entity, propData?: PropDataSnapshot, changeType?: string) {
		const overrides: Record<string, unknown> = {};
		if (playerEntity !== undefined) {
			overrides.playerEntity = playerEntity;
		}
		if (propData !== undefined) {
			overrides.propData = propData;
		}
		if (changeType !== undefined) {
			overrides.changeType = changeType;
		}
		Object.assign(this, overrides);
	}
}
// #endregion

// #region Consumed Event Payload
@serializable()
export class PropConsumedPayload {
	/** The rarity of the consumed prop */
	@property()
	public readonly rarity: PropRarity = PropRarity.Rarity1;

	constructor(rarity?: PropRarity) {
		const overrides: Record<string, unknown> = {};
		if (rarity !== undefined) {
			overrides.rarity = rarity;
		}
		Object.assign(this, overrides);
	}
}
// #endregion

// #region Transfer Notification Payload
@serializable()
export class PropTransferNotifyPayload {
	/** The message to display */
	@property()
	public readonly message: string = "";

	constructor(message?: string) {
		const overrides: Record<string, unknown> = {};
		if (message !== undefined) {
			overrides.message = message;
		}
		Object.assign(this, overrides);
	}
}
// #endregion

// #region Pickup Prompt Events (moved from HudPickupPromptViewModel)
@serializable()
export class PropPromptShowPayload {
	@property()
	public readonly icon: Maybe<TextureAsset> = null;

	@property()
	public readonly baseValue: number = 0;

	@property()
	public readonly isDepotInteraction: boolean = false;

	@property()
	public readonly isDoorInteraction: boolean = false;

	@property()
	public readonly text: string = "";
}

/** Show the pickup prompt with given prop name */
export const PropPromptShowEvent = new LocalEvent<PropPromptShowPayload>(
	"PropPickupPrompt_Show",
	PropPromptShowPayload,
);

/** Hide the pickup prompt */
export const PropPromptHideEvent = new LocalEvent(
	"PropPickupPrompt_Hide",
);

/** Fired locally when the player clicks the pickup prompt to confirm pickup */
export const PropPromptConfirmPickupEvent = new LocalEvent(
	"PropPickupPrompt_ConfirmPickup",
);
// #endregion

// #region BtnUse Events (show/hide the "Use" button on HUD controls)
@serializable()
export class PropUseButtonShowPayload {
	@property()
	public readonly icon: Maybe<TextureAsset> = null;
}

/** Fired locally to show the BtnUse on the HUD with the selected item's icon */
export const PropUseButtonShowEvent = new LocalEvent<PropUseButtonShowPayload>(
	"PropSystem_UseButtonShow",
	PropUseButtonShowPayload,
);

/** Fired locally to hide the BtnUse on the HUD */
export const PropUseButtonHideEvent = new LocalEvent(
	"PropSystem_UseButtonHide",
);

/** Fired locally when the player clicks BtnUse to use the selected usable item */
export const PropUseButtonClickEvent = new LocalEvent(
	"PropSystem_UseButtonClick",
);
// #endregion

// #region Event Declarations
/** Fired locally (server-side) when a prop is picked up by a player */
export const PropPickedUpEvent = new LocalEvent<PropPickedUpPayload>(
	"PropSystem_PropPickedUp",
	PropPickedUpPayload,
);

/** Fired locally to notify listeners of inventory changes */
export const PropInventoryChangedEvent = new LocalEvent<PropInventoryChangedPayload>(
	"PropSystem_InventoryChanged",
	PropInventoryChangedPayload,
);

/** Fired locally when a prop is consumed (used) from the backpack */
export const PropConsumedEvent = new LocalEvent<PropConsumedPayload>(
	"PropSystem_PropConsumed",
	PropConsumedPayload,
);

/** Fired locally to show a brief transfer notification (depot full, backpack full, success, etc.) */
export const PropTransferNotifyEvent = new LocalEvent<PropTransferNotifyPayload>(
	"PropSystem_TransferNotify",
	PropTransferNotifyPayload,
);

/** Fired locally when depot contents change (item added or removed) so UI can refresh */
export const DepotContentChangedEvent = new LocalEvent(
	"PropSystem_DepotContentChanged",
);
// #endregion
