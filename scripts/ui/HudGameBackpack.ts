/**
 * HudGameBackpack - Controls the backpack UI panel with full inventory integration.
 *
 * Component Attachment: Scene Entity (CustomUi entity with HudGameBackpack XAML)
 * Component Networking: Local (UI is client-only)
 * Component Ownership: Not Networked
 *
 * HudGameBackpack UI. Subscribes to
 * PropInventoryChangedEvent, populates slots with icons and energy text,
 * handles use/store actions on the selected item via the use button.
 */

import type { Maybe } from 'meta/worlds';
import {
	Component,
	CustomUiComponent,
	EntityService,
	ExecuteOn,
	OnEntityStartEvent,
	PlayerService,
	Service,
	TextureAsset,
	Visibility,
	component,
	subscribe,
} from 'meta/worlds';
import {
	HudGameBackpackViewModel,
	OnClickBtnBackpackEvent,
	OnClickBtnItem1Event,
	OnClickBtnItem2Event,
	OnClickBtnItem3Event,
	OnClickBtnItem4Event,
	OnClickBtnItem5Event,
} from '../../generated/view_models/HudGameBackpackViewModel';
import { PlayerLogic } from '../components/PlayerLogic';
import { GameDepotManager } from '../depot/GameDepotManager';
import {
	DepotContentChangedEvent,
	PropConsumedEvent,
	PropDataSnapshot,
	PropInventoryChangedEvent,
	PropInventoryChangedPayload,
	PropTransferNotifyEvent,
	PropUseButtonClickEvent,
	PropUseButtonHideEvent,
	PropUseButtonShowEvent,
} from '../events/PropEvents';
import { GameAudio } from '../game/GameAudio';
import { GamePlayerPropManager } from '../game/GamePlayerPropManager';
import { PropRarity } from '../props/PropConfig';
import { calculatePropEnergyFromGameState } from '../props/PropEnergyHelper';


/**
 * Extension interface for quality frame properties added via XAML binding.
 * These properties are auto-generated on the ViewModel at runtime from XAML bindings
 * but may not yet appear in the generated TypeScript definition file.
 */
interface QualityFrameViewModel {
	qualityFrame1: Maybe<TextureAsset>;
	qualityFrame2: Maybe<TextureAsset>;
	qualityFrame3: Maybe<TextureAsset>;
	qualityFrame4: Maybe<TextureAsset>;
	qualityFrame5: Maybe<TextureAsset>;
	showItem1Quality: Visibility;
	showItem2Quality: Visibility;
	showItem3Quality: Visibility;
	showItem4Quality: Visibility;
	showItem5Quality: Visibility;
}

/**
 * @component
 * Component Attachment: Scene Entity (a dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 */
@component()
export class HudGameBackpack extends Component {

	private static readonly MAX_SLOTS = 5;
	private static readonly RARITY_FRAME_TEXTURES: Record<number, TextureAsset> = {
		[PropRarity.Rarity1]: new TextureAsset("@Assets/UI/hud_game/backpack_frame_quality_white.png"),
		[PropRarity.Rarity2]: new TextureAsset("@Assets/UI/hud_game/backpack_frame_quality_green.png"),
		[PropRarity.Rarity3]: new TextureAsset("@Assets/UI/hud_game/backpack_frame_quality_blue.png"),
		[PropRarity.Rarity4]: new TextureAsset("@Assets/UI/hud_game/backpack_frame_quality_purple.png"),
		[PropRarity.Rarity5]: new TextureAsset("@Assets/UI/hud_game/backpack_frame_quality_gold.png"),
	};
	private viewModel = new HudGameBackpackViewModel();
	/** Typed reference for quality frame properties added via XAML binding */
	private get vm(): HudGameBackpackViewModel & QualityFrameViewModel {
		return this.viewModel as HudGameBackpackViewModel & QualityFrameViewModel;
	}
	private isItemsBarShown: boolean = false;
	private selectedSlot: number = -1;

	/** Per-slot stored PropDataSnapshot for inventory lookup (0-indexed internally) */
	private slotData: (PropDataSnapshot | null)[] = [null, null, null, null, null];

	/** Tracks how many slots are currently filled */
	private filledSlotCount: number = 0;

	/** Cooldown tracking for use button */
	private useCooldownActive: boolean = false;

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		const customUi = this.entity.getComponent(CustomUiComponent);
		if (!customUi) {
			return;
		}
		customUi.dataContext = this.viewModel;

		// Default state: items bar shown (expanded), no selection
		this.isItemsBarShown = true;
		this.selectedSlot = -1;

		// Initialize all 5 slots to "no item" state (blank visible, icon hidden, select hidden)
		for (let i = 0; i < HudGameBackpack.MAX_SLOTS; i++) {
			this.clearSlotUI(i);
			this.setSlotSelect(i + 1, false);
		}

		this.refreshUI();
	}

	// #region Inventory Event Handling
	/**
	 * Listen for inventory changes. On ANY change (add, remove, update, clear),
	 * read the ACTUAL current inventory from GamePlayerPropManager and
	 * rebuild ALL slot UIs from that real data. This prevents double-clear bugs.
	 */
	@subscribe(PropInventoryChangedEvent, { execution: ExecuteOn.Everywhere })
	private onInventoryChanged(payload: PropInventoryChangedPayload): void {
		this.rebuildSlotsFromInventory();
	}

	/**
	 * Read the full current inventory from GamePlayerPropManager and
	 * rebuild all 5 slot UIs to match the real data.
	 */
	private rebuildSlotsFromInventory(): void {
		const localPlayer = Service.get(PlayerService).getLocalPlayer();
		if (!localPlayer) {
			return;
		}

		const inventoryEntities = EntityService.findEntitiesWithComponent(GamePlayerPropManager);
		if (inventoryEntities.length === 0) {
			return;
		}

		const inventory = inventoryEntities[0].getComponent(GamePlayerPropManager);
		if (!inventory) {
			return;
		}

		// Read the real slot data from the inventory system
		const realSlots = inventory.getPlayerSlots(localPlayer);

		// Rebuild all 5 slots from real data
		let filled = 0;
		for (let i = 0; i < HudGameBackpack.MAX_SLOTS; i++) {
			const slotItem = realSlots[i] ?? null;
			this.slotData[i] = slotItem;

			if (slotItem) {
				this.setSlotUI(i, slotItem);
				filled++;
			} else {
				this.clearSlotUI(i);
			}
		}

		this.filledSlotCount = filled;

		// If the selected slot is now empty, deselect
		if (this.selectedSlot > 0 && !this.slotData[this.selectedSlot - 1]) {
			this.selectedSlot = -1;
		}

		this.refreshUI();
	}
	// #endregion

	// #region Backpack Toggle
	@subscribe(OnClickBtnBackpackEvent, { execution: ExecuteOn.Owner })
	public onClickBackpack(): void {
		GameAudio.playClick();
		this.isItemsBarShown = !this.isItemsBarShown;

		// When closing items bar, clear selection
		if (!this.isItemsBarShown) {
			this.selectedSlot = -1;
		}

		this.refreshUI();
	}
	// #endregion

	// #region Item Click Handlers
	@subscribe(OnClickBtnItem1Event, { execution: ExecuteOn.Owner })
	public onClickItem1(): void {
		this.handleItemClick(1);
	}

	@subscribe(OnClickBtnItem2Event, { execution: ExecuteOn.Owner })
	public onClickItem2(): void {
		this.handleItemClick(2);
	}

	@subscribe(OnClickBtnItem3Event, { execution: ExecuteOn.Owner })
	public onClickItem3(): void {
		this.handleItemClick(3);
	}

	@subscribe(OnClickBtnItem4Event, { execution: ExecuteOn.Owner })
	public onClickItem4(): void {
		this.handleItemClick(4);
	}

	@subscribe(OnClickBtnItem5Event, { execution: ExecuteOn.Owner })
	public onClickItem5(): void {
		this.handleItemClick(5);
	}

	/**
	 * Handle slot click. Slots are 1-indexed in the UI.
	 * Single click = select/deselect.
	 */
	private handleItemClick(slot: number): void {
		const dataIndex = slot - 1;

		// Only interact with slots that have items
		if (!this.slotData[dataIndex]) {
			return;
		}

		GameAudio.playClick();

		// Toggle selection
		if (this.selectedSlot === slot) {
			this.selectedSlot = -1;
		} else {
			this.selectedSlot = slot;
		}

		this.refreshUI();
	}
	// #endregion

	// #region BtnUse Click Handler
	@subscribe(PropUseButtonClickEvent, { execution: ExecuteOn.Everywhere })
	private onUseButtonClick(): void {
		if (this.selectedSlot <= 0) {
			return;
		}
		const dataIndex = this.selectedSlot - 1;
		const slotItem = this.slotData[dataIndex];
		if (!slotItem || !slotItem.usable) {
			return;
		}
		this.useSelectedItem(dataIndex);
	}
	// #endregion

	// #region Use Item
	/**
	 * Use the item at the given 0-indexed slot.
	 * Removes from inventory, adds flashlight power if useValue > 0, fires PropConsumedEvent.
	 * Does NOT manually clear slot UI - the event handler will rebuild from real data.
	 */
	private useSelectedItem(dataIndex: number): void {
		// Check cooldown
		if (this.useCooldownActive) {
			return;
		}

		const data = this.slotData[dataIndex];
		if (!data) {
			return;
		}

		// Get the real local player entity
		const localPlayer = Service.get(PlayerService).getLocalPlayer();
		if (!localPlayer) {
			return;
		}

		// Find the entity that hosts GamePlayerPropManager
		const inventoryEntities = EntityService.findEntitiesWithComponent(GamePlayerPropManager);
		if (inventoryEntities.length === 0) {
			return;
		}

		const inventory = inventoryEntities[0].getComponent(GamePlayerPropManager);
		if (!inventory) {
			return;
		}

		// Remove from inventory by slot index. The broadcastChange in removePropAtSlot
		// will fire PropInventoryChangedEvent, and our onInventoryChanged handler
		// will rebuild the UI from real data. No manual slot clearing needed here.
		const removedData = inventory.removePropAtSlot(localPlayer, dataIndex);
		if (!removedData) {
			return;
		}

		// Fire the consumed event so the notification HUD can show "Used item"
		this.sendEventLocally(PropConsumedEvent, {
			rarity: data.rarity,
		});

		// If the prop has a positive useValue, add that to flashlight power
		if (data.useValue > 0) {
			const playerLogic = localPlayer.getComponent(PlayerLogic);
			if (playerLogic) {
				playerLogic.addPower(data.useValue);
			}
		}

		// Deselect after use
		this.selectedSlot = -1;
		this.refreshUI();

		// Start 2-second cooldown
		this.useCooldownActive = true;
		setTimeout((): void => {
			if (!this.entity.valid) return;
			this.useCooldownActive = false;
		}, 2000);
	}
	// #endregion

	// #region Public API
	/** Force the backpack items bar to be expanded. Called by GamePhaseManager after level transitions. */
	public ensureExpanded(): void {
		this.isItemsBarShown = true;
		this.refreshUI();
	}
	// #endregion

	// #region Store to Depot
	/**
	 * Store item from backpack slot to depot.
	 * Does NOT manually clear slot UI - the event handler will rebuild from real data.
	 */
	public storeSlotToDepot(dataIndex: number): void {
		const data = this.slotData[dataIndex];
		if (!data) {
			return;
		}

		const depot = GameDepotManager.find();
		if (!depot) {
			return;
		}
		const result = depot.addItem(data);

		if (!result.success) {
			this.sendEventLocally(PropTransferNotifyEvent, {
				message: 'Depot Full',
			});
			return;
		}

		// Remove from player inventory. The broadcastChange in removePropAtSlot
		// will fire PropInventoryChangedEvent, and our onInventoryChanged handler
		// will rebuild the UI from real data. No manual slot clearing needed here.
		const localPlayer = Service.get(PlayerService).getLocalPlayer();
		if (localPlayer) {
			const inventoryEntities = EntityService.findEntitiesWithComponent(GamePlayerPropManager);
			if (inventoryEntities.length > 0) {
				const inventory = inventoryEntities[0].getComponent(GamePlayerPropManager);
				if (inventory) {
					inventory.removePropAtSlot(localPlayer, dataIndex);
				}
			}
		}

		// Deselect after store
		this.selectedSlot = -1;
		this.refreshUI();

		// Notify depot UI to refresh
		this.sendEventLocally(DepotContentChangedEvent, {});

		// Show success notification
		this.sendEventLocally(PropTransferNotifyEvent, {
			message: `Stored item`,
		});
	}
	// #endregion

	// #region UI Update Helpers
	private refreshUI(): void {
		// Tag rotation: 180 when closed, 0 when open
		this.viewModel.tagRotation = this.isItemsBarShown ? 0 : 180;

		// Show/hide items bar
		this.viewModel.showItems = this.isItemsBarShown ? Visibility.Visible : Visibility.Collapsed;

		// Update selection states and use hint visibility for all slots
		for (let i = 1; i <= HudGameBackpack.MAX_SLOTS; i++) {
			const isSelected = this.selectedSlot === i;
			this.setSlotSelect(i, isSelected);

			// Use hint is visible only when the item is usable AND the slot is selected
			const dataIndex = i - 1;
			const slotItem = this.slotData[dataIndex];
			const showHint = isSelected && slotItem !== null && slotItem.usable;
			this.setSlotUseHintVisible(i, showHint);
		}

		// Fire BtnUse show/hide events for HudGameControls
		if (this.selectedSlot > 0) {
			const selectedData = this.slotData[this.selectedSlot - 1];
			if (selectedData !== null && selectedData.usable) {
				this.sendEventLocally(PropUseButtonShowEvent, {
					icon: selectedData.icon,
				});
			} else {
				this.sendEventLocally(PropUseButtonHideEvent, {});
			}
		} else {
			this.sendEventLocally(PropUseButtonHideEvent, {});
		}
	}

	private setSlotSelect(slot: number, selected: boolean): void {
		const value = selected ? Visibility.Visible : Visibility.Collapsed;

		if (slot === 1) {
			this.viewModel.showItem1Select = value;
		} else if (slot === 2) {
			this.viewModel.showItem2Select = value;
		} else if (slot === 3) {
			this.viewModel.showItem3Select = value;
		} else if (slot === 4) {
			this.viewModel.showItem4Select = value;
		} else if (slot === 5) {
			this.viewModel.showItem5Select = value;
		}
	}

	private setSlotUseHintVisible(slot: number, visible: boolean): void {
		const value = visible ? Visibility.Visible : Visibility.Collapsed;

		if (slot === 1) {
			this.viewModel.showUseHint1 = value;
		} else if (slot === 2) {
			this.viewModel.showUseHint2 = value;
		} else if (slot === 3) {
			this.viewModel.showUseHint3 = value;
		} else if (slot === 4) {
			this.viewModel.showUseHint4 = value;
		} else if (slot === 5) {
			this.viewModel.showUseHint5 = value;
		}
	}

	/**
	 * Set a slot's text and visibility in the view model.
	 * slotIndex is 0-indexed.
	 */
	private setSlotUI(slotIndex: number, data: PropDataSnapshot): void {
		// text: always show energy value for elevator charging (no condition)
		const energy = calculatePropEnergyFromGameState(data.baseValue);
		const baseValueStr = `${energy}`;

		// textUseHint: show useValue (flashlight energy) only when usable
		const useHintText = data.usable ? `[color=#FFFFFF]Recover[/color] [color=#FFFF00]${data.useValue}[/color] [color=#FFFFFF]Energy[/color]` : '';

		// showUseHint: default to collapsed here; refreshUI controls final visibility
		// (requires both usable AND selected)
		const useHintVisible = Visibility.Collapsed;

		if (slotIndex === 0) {
			this.viewModel.icon1 = data.icon;
			this.viewModel.text1 = baseValueStr;
			this.viewModel.showItem1Icon = Visibility.Visible;
			this.viewModel.showItem1Blank = Visibility.Collapsed;
			this.viewModel.showUseHint1 = useHintVisible;
			this.viewModel.textUseHint1 = useHintText;
			this.vm.qualityFrame1 = HudGameBackpack.RARITY_FRAME_TEXTURES[data.rarity] ?? null;
			this.vm.showItem1Quality = Visibility.Visible;
		} else if (slotIndex === 1) {
			this.viewModel.icon2 = data.icon;
			this.viewModel.text2 = baseValueStr;
			this.viewModel.showItem2Icon = Visibility.Visible;
			this.viewModel.showItem2Blank = Visibility.Collapsed;
			this.viewModel.showUseHint2 = useHintVisible;
			this.viewModel.textUseHint2 = useHintText;
			this.vm.qualityFrame2 = HudGameBackpack.RARITY_FRAME_TEXTURES[data.rarity] ?? null;
			this.vm.showItem2Quality = Visibility.Visible;
		} else if (slotIndex === 2) {
			this.viewModel.icon3 = data.icon;
			this.viewModel.text3 = baseValueStr;
			this.viewModel.showItem3Icon = Visibility.Visible;
			this.viewModel.showItem3Blank = Visibility.Collapsed;
			this.viewModel.showUseHint3 = useHintVisible;
			this.viewModel.textUseHint3 = useHintText;
			this.vm.qualityFrame3 = HudGameBackpack.RARITY_FRAME_TEXTURES[data.rarity] ?? null;
			this.vm.showItem3Quality = Visibility.Visible;
		} else if (slotIndex === 3) {
			this.viewModel.icon4 = data.icon;
			this.viewModel.text4 = baseValueStr;
			this.viewModel.showItem4Icon = Visibility.Visible;
			this.viewModel.showItem4Blank = Visibility.Collapsed;
			this.viewModel.showUseHint4 = useHintVisible;
			this.viewModel.textUseHint4 = useHintText;
			this.vm.qualityFrame4 = HudGameBackpack.RARITY_FRAME_TEXTURES[data.rarity] ?? null;
			this.vm.showItem4Quality = Visibility.Visible;
		} else if (slotIndex === 4) {
			this.viewModel.icon5 = data.icon;
			this.viewModel.text5 = baseValueStr;
			this.viewModel.showItem5Icon = Visibility.Visible;
			this.viewModel.showItem5Blank = Visibility.Collapsed;
			this.viewModel.showUseHint5 = useHintVisible;
			this.viewModel.textUseHint5 = useHintText;
			this.vm.qualityFrame5 = HudGameBackpack.RARITY_FRAME_TEXTURES[data.rarity] ?? null;
			this.vm.showItem5Quality = Visibility.Visible;
		}
	}

	/**
	 * Clear a single slot's UI content. slotIndex is 0-indexed.
	 */
	private clearSlotUI(slotIndex: number): void {
		if (slotIndex === 0) {
			this.viewModel.icon1 = null;
			this.viewModel.text1 = "";
			this.viewModel.showItem1Icon = Visibility.Collapsed;
			this.viewModel.showItem1Blank = Visibility.Visible;
			this.viewModel.showUseHint1 = Visibility.Collapsed;
			this.viewModel.textUseHint1 = "";
			this.vm.qualityFrame1 = null;
			this.vm.showItem1Quality = Visibility.Collapsed;
		} else if (slotIndex === 1) {
			this.viewModel.icon2 = null;
			this.viewModel.text2 = "";
			this.viewModel.showItem2Icon = Visibility.Collapsed;
			this.viewModel.showItem2Blank = Visibility.Visible;
			this.viewModel.showUseHint2 = Visibility.Collapsed;
			this.viewModel.textUseHint2 = "";
			this.vm.qualityFrame2 = null;
			this.vm.showItem2Quality = Visibility.Collapsed;
		} else if (slotIndex === 2) {
			this.viewModel.icon3 = null;
			this.viewModel.text3 = "";
			this.viewModel.showItem3Icon = Visibility.Collapsed;
			this.viewModel.showItem3Blank = Visibility.Visible;
			this.viewModel.showUseHint3 = Visibility.Collapsed;
			this.viewModel.textUseHint3 = "";
			this.vm.qualityFrame3 = null;
			this.vm.showItem3Quality = Visibility.Collapsed;
		} else if (slotIndex === 3) {
			this.viewModel.icon4 = null;
			this.viewModel.text4 = "";
			this.viewModel.showItem4Icon = Visibility.Collapsed;
			this.viewModel.showItem4Blank = Visibility.Visible;
			this.viewModel.showUseHint4 = Visibility.Collapsed;
			this.viewModel.textUseHint4 = "";
			this.vm.qualityFrame4 = null;
			this.vm.showItem4Quality = Visibility.Collapsed;
		} else if (slotIndex === 4) {
			this.viewModel.icon5 = null;
			this.viewModel.text5 = "";
			this.viewModel.showItem5Icon = Visibility.Collapsed;
			this.viewModel.showItem5Blank = Visibility.Visible;
			this.viewModel.showUseHint5 = Visibility.Collapsed;
			this.viewModel.textUseHint5 = "";
			this.vm.qualityFrame5 = null;
			this.vm.showItem5Quality = Visibility.Collapsed;
		}
	}
	// #endregion
}
