/**
 * HudPanelDepot - Controller for the new depot panel UI using auto-generated ViewModel.
 *
 * Component Attachment: Scene Entity (a dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Displays depot (12 slots) and backpack (5 slots) side-by-side.
 * Clicking a depot slot selects it; clicking a backpack slot selects it.
 * Uses the auto-generated HudPanelDepotViewModel with show/hide visibility bindings.
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	CustomUiComponent,
	EntityService,
	ExecuteOn,
	OnEntityCreateEvent,
	OnEntityStartEvent,
	PlayerService,
	Service,
	TextureAsset,
	Visibility,
	component,
	subscribe,
} from "meta/worlds";
import {
	HudPanelDepotViewModel,
	OnClickBtnBackpackItem1Event,
	OnClickBtnBackpackItem2Event,
	OnClickBtnBackpackItem3Event,
	OnClickBtnBackpackItem4Event,
	OnClickBtnBackpackItem5Event,
	OnClickBtnCloseEvent,
	OnClickBtnDepotItem10Event,
	OnClickBtnDepotItem11Event,
	OnClickBtnDepotItem12Event,
	OnClickBtnDepotItem1Event,
	OnClickBtnDepotItem2Event,
	OnClickBtnDepotItem3Event,
	OnClickBtnDepotItem4Event,
	OnClickBtnDepotItem5Event,
	OnClickBtnDepotItem6Event,
	OnClickBtnDepotItem7Event,
	OnClickBtnDepotItem8Event,
	OnClickBtnDepotItem9Event,
} from "../../generated/view_models/HudPanelDepotViewModel";
import { GameDepotManager } from "../depot/GameDepotManager";
import { DepotPanelToggleRequestEvent } from "../events/DepotEvents";
import {
	DepotContentChangedEvent,
	PropInventoryChangedEvent,
} from "../events/PropEvents";
import { GameAudio } from "../game/GameAudio";
import { GamePlayerPropManager } from "../game/GamePlayerPropManager";
import { calculatePropEnergyFromGameState } from "../props/PropEnergyHelper";

/**
 * @component
 * Component Attachment: Scene Entity (HudPanelDepot entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 */
@component()
export class HudPanelDepot extends Component {
	private static readonly DEPOT_MAX_SLOTS: number = 12;
	private static readonly BACKPACK_MAX_SLOTS: number = 5;

	private viewModel: HudPanelDepotViewModel = new HudPanelDepotViewModel();
	private uiComponent: Maybe<CustomUiComponent> = null;
	private selectedDepotSlot: number = -1;
	private selectedBackpackSlot: number = -1;

	// #region Lifecycle
	@subscribe(OnEntityCreateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onCreate(): void {
		this.uiComponent = this.entity.getComponent(CustomUiComponent);
		if (this.uiComponent) {
			this.uiComponent.dataContext = this.viewModel;
			this.uiComponent.isVisible = false;
		}
	}

	@subscribe(OnEntityStartEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onStart(): void {
		for (let i = 1; i <= HudPanelDepot.DEPOT_MAX_SLOTS; i++) {
			this.setDepotBlankVisibility(i, Visibility.Visible);
			this.setDepotIconVisibility(i, Visibility.Collapsed);
			this.setDepotSelectVisibility(i, Visibility.Collapsed);
		}

		for (let i = 1; i <= HudPanelDepot.BACKPACK_MAX_SLOTS; i++) {
			this.setBackpackBlankVisibility(i, Visibility.Visible);
			this.setBackpackIconVisibility(i, Visibility.Collapsed);
			this.setBackpackSelectVisibility(i, Visibility.Collapsed);
		}
	}
	// #endregion

	// #region Close Button
	@subscribe(OnClickBtnCloseEvent, { execution: ExecuteOn.Owner })
	private onClickBtnClose(): void {
		GameAudio.playClick();
		this.selectedDepotSlot = -1;
		this.selectedBackpackSlot = -1;
		this.updateAllSelections();

		if (this.uiComponent) {
			this.uiComponent.isVisible = false;
		}
	}
	// #endregion

	// #region External Toggle
	@subscribe(DepotPanelToggleRequestEvent, { execution: ExecuteOn.Everywhere })
	private onExternalToggle(): void {
		if (!this.uiComponent) {
			return;
		}

		if (this.uiComponent.isVisible) {
			this.uiComponent.isVisible = false;
			this.selectedDepotSlot = -1;
			this.selectedBackpackSlot = -1;
			this.updateAllSelections();
		} else {
			this.uiComponent.isVisible = true;
			this.selectedDepotSlot = -1;
			this.selectedBackpackSlot = -1;
			this.refreshAllSlots();
		}
	}
	// #endregion

	// #region Content Changed Handlers
	@subscribe(DepotContentChangedEvent, { execution: ExecuteOn.Everywhere })
	private onDepotContentChanged(): void {
		this.refreshDepotSlots();
	}

	@subscribe(PropInventoryChangedEvent, { execution: ExecuteOn.Everywhere })
	private onInventoryChanged(): void {
		this.refreshBackpackSlots();
	}
	// #endregion

	// #region Depot Item Click Handlers
	@subscribe(OnClickBtnDepotItem1Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem1(): void {
		this.handleDepotItemClick(0);
	}

	@subscribe(OnClickBtnDepotItem2Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem2(): void {
		this.handleDepotItemClick(1);
	}

	@subscribe(OnClickBtnDepotItem3Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem3(): void {
		this.handleDepotItemClick(2);
	}

	@subscribe(OnClickBtnDepotItem4Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem4(): void {
		this.handleDepotItemClick(3);
	}

	@subscribe(OnClickBtnDepotItem5Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem5(): void {
		this.handleDepotItemClick(4);
	}

	@subscribe(OnClickBtnDepotItem6Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem6(): void {
		this.handleDepotItemClick(5);
	}

	@subscribe(OnClickBtnDepotItem7Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem7(): void {
		this.handleDepotItemClick(6);
	}

	@subscribe(OnClickBtnDepotItem8Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem8(): void {
		this.handleDepotItemClick(7);
	}

	@subscribe(OnClickBtnDepotItem9Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem9(): void {
		this.handleDepotItemClick(8);
	}

	@subscribe(OnClickBtnDepotItem10Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem10(): void {
		this.handleDepotItemClick(9);
	}

	@subscribe(OnClickBtnDepotItem11Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem11(): void {
		this.handleDepotItemClick(10);
	}

	@subscribe(OnClickBtnDepotItem12Event, { execution: ExecuteOn.Owner })
	private onClickDepotItem12(): void {
		this.handleDepotItemClick(11);
	}
	// #endregion

	// #region Backpack Item Click Handlers
	@subscribe(OnClickBtnBackpackItem1Event, { execution: ExecuteOn.Owner })
	private onClickBackpackItem1(): void {
		this.handleBackpackItemClick(0);
	}

	@subscribe(OnClickBtnBackpackItem2Event, { execution: ExecuteOn.Owner })
	private onClickBackpackItem2(): void {
		this.handleBackpackItemClick(1);
	}

	@subscribe(OnClickBtnBackpackItem3Event, { execution: ExecuteOn.Owner })
	private onClickBackpackItem3(): void {
		this.handleBackpackItemClick(2);
	}

	@subscribe(OnClickBtnBackpackItem4Event, { execution: ExecuteOn.Owner })
	private onClickBackpackItem4(): void {
		this.handleBackpackItemClick(3);
	}

	@subscribe(OnClickBtnBackpackItem5Event, { execution: ExecuteOn.Owner })
	private onClickBackpackItem5(): void {
		this.handleBackpackItemClick(4);
	}
	// #endregion

	// #region Click Logic
	private handleDepotItemClick(slotIndex: number): void {
		GameAudio.playClick();
		const depot = GameDepotManager.find();
		if (!depot) {
			return;
		}
		const slotItem = depot.getItem(slotIndex);
		if (!slotItem) {
			return;
		}

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

		if (inventory.isInventoryFull(localPlayer)) {
			return;
		}

		const removedData = depot.removeItemAt(slotIndex);
		if (!removedData) {
			return;
		}

		inventory.addProp(localPlayer, removedData);
		this.sendEventLocally(DepotContentChangedEvent, {});

		this.selectedDepotSlot = -1;
		this.selectedBackpackSlot = -1;
		this.refreshAllSlots();
	}

	private handleBackpackItemClick(slotIndex: number): void {
		GameAudio.playClick();
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
		const slots = inventory.getPlayerSlots(localPlayer);
		const slotData = slots[slotIndex] ?? null;
		if (!slotData) {
			return;
		}

		const depot = GameDepotManager.find();
		if (!depot || depot.isFull()) {
			return;
		}

		const removedData = inventory.removePropAtSlot(localPlayer, slotIndex);
		if (!removedData) {
			return;
		}

		depot.addItem(removedData);
		this.sendEventLocally(DepotContentChangedEvent, {});

		this.selectedDepotSlot = -1;
		this.selectedBackpackSlot = -1;
		this.refreshAllSlots();
	}
	// #endregion

	// #region Refresh Logic
	private refreshAllSlots(): void {
		this.refreshDepotSlots();
		this.refreshBackpackSlots();
	}

	private refreshDepotSlots(): void {
		const depot = GameDepotManager.find();
		if (!depot) {
			return;
		}

		for (let i = 0; i < HudPanelDepot.DEPOT_MAX_SLOTS; i++) {
			const slot = depot.getItem(i);
			const slotNum = i + 1;

			if (slot) {
				const icon = slot.propData.icon;
				const energy = calculatePropEnergyFromGameState(slot.propData.baseValue);
				let displayText: string;
				if (energy > 0) {
					displayText = energy.toString();
				} else {
					displayText = "";
				}
				this.setDepotIcon(slotNum, icon);
				this.setDepotText(slotNum, displayText);
				this.setDepotBlankVisibility(slotNum, Visibility.Collapsed);
				this.setDepotIconVisibility(slotNum, Visibility.Visible);
			} else {
				this.setDepotIcon(slotNum, null);
				this.setDepotText(slotNum, "");
				this.setDepotBlankVisibility(slotNum, Visibility.Visible);
				this.setDepotIconVisibility(slotNum, Visibility.Collapsed);
			}
		}

		this.updateAllSelections();
	}

	private refreshBackpackSlots(): void {
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

		const slots = inventory.getPlayerSlots(localPlayer);

		for (let i = 0; i < HudPanelDepot.BACKPACK_MAX_SLOTS; i++) {
			const slotData = slots[i] ?? null;
			const slotNum = i + 1;

			if (slotData) {
				const icon = slotData.icon;
				const energy = calculatePropEnergyFromGameState(slotData.baseValue);
				let displayText: string;
				if (energy > 0) {
					displayText = energy.toString();
				} else {
					displayText = "";
				}
				this.setBackpackIcon(slotNum, icon);
				this.setBackpackText(slotNum, displayText);
				this.setBackpackBlankVisibility(slotNum, Visibility.Collapsed);
				this.setBackpackIconVisibility(slotNum, Visibility.Visible);
			} else {
				this.setBackpackIcon(slotNum, null);
				this.setBackpackText(slotNum, "");
				this.setBackpackBlankVisibility(slotNum, Visibility.Visible);
				this.setBackpackIconVisibility(slotNum, Visibility.Collapsed);
			}
		}
	}
	// #endregion

	// #region Selection State
	private updateAllSelections(): void {
		for (let i = 0; i < HudPanelDepot.DEPOT_MAX_SLOTS; i++) {
			let vis: Visibility;
			if (this.selectedDepotSlot === i) {
				vis = Visibility.Visible;
			} else {
				vis = Visibility.Collapsed;
			}
			this.setDepotSelectVisibility(i + 1, vis);
		}

		for (let i = 0; i < HudPanelDepot.BACKPACK_MAX_SLOTS; i++) {
			let vis: Visibility;
			if (this.selectedBackpackSlot === i) {
				vis = Visibility.Visible;
			} else {
				vis = Visibility.Collapsed;
			}
			this.setBackpackSelectVisibility(i + 1, vis);
		}
	}
	// #endregion

	// #region ViewModel Setters (Depot)
	private setDepotBlankVisibility(slot: number, value: Visibility): void {
		if (slot === 1) {
			this.viewModel.showDepotBlank1 = value;
		} else if (slot === 2) {
			this.viewModel.showDepotBlank2 = value;
		} else if (slot === 3) {
			this.viewModel.showDepotBlank3 = value;
		} else if (slot === 4) {
			this.viewModel.showDepotBlank4 = value;
		} else if (slot === 5) {
			this.viewModel.showDepotBlank5 = value;
		} else if (slot === 6) {
			this.viewModel.showDepotBlank6 = value;
		} else if (slot === 7) {
			this.viewModel.showDepotBlank7 = value;
		} else if (slot === 8) {
			this.viewModel.showDepotBlank8 = value;
		} else if (slot === 9) {
			this.viewModel.showDepotBlank9 = value;
		} else if (slot === 10) {
			this.viewModel.showDepotBlank10 = value;
		} else if (slot === 11) {
			this.viewModel.showDepotBlank11 = value;
		} else if (slot === 12) {
			this.viewModel.showDepotBlank12 = value;
		}
	}

	private setDepotIconVisibility(slot: number, value: Visibility): void {
		if (slot === 1) {
			this.viewModel.showDepotIcon1 = value;
		} else if (slot === 2) {
			this.viewModel.showDepotIcon2 = value;
		} else if (slot === 3) {
			this.viewModel.showDepotIcon3 = value;
		} else if (slot === 4) {
			this.viewModel.showDepotIcon4 = value;
		} else if (slot === 5) {
			this.viewModel.showDepotIcon5 = value;
		} else if (slot === 6) {
			this.viewModel.showDepotIcon6 = value;
		} else if (slot === 7) {
			this.viewModel.showDepotIcon7 = value;
		} else if (slot === 8) {
			this.viewModel.showDepotIcon8 = value;
		} else if (slot === 9) {
			this.viewModel.showDepotIcon9 = value;
		} else if (slot === 10) {
			this.viewModel.showDepotIcon10 = value;
		} else if (slot === 11) {
			this.viewModel.showDepotIcon11 = value;
		} else if (slot === 12) {
			this.viewModel.showDepotIcon12 = value;
		}
	}

	private setDepotSelectVisibility(slot: number, value: Visibility): void {
		if (slot === 1) {
			this.viewModel.showDepotSelect1 = value;
		} else if (slot === 2) {
			this.viewModel.showDepotSelect2 = value;
		} else if (slot === 3) {
			this.viewModel.showDepotSelect3 = value;
		} else if (slot === 4) {
			this.viewModel.showDepotSelect4 = value;
		} else if (slot === 5) {
			this.viewModel.showDepotSelect5 = value;
		} else if (slot === 6) {
			this.viewModel.showDepotSelect6 = value;
		} else if (slot === 7) {
			this.viewModel.showDepotSelect7 = value;
		} else if (slot === 8) {
			this.viewModel.showDepotSelect8 = value;
		} else if (slot === 9) {
			this.viewModel.showDepotSelect9 = value;
		} else if (slot === 10) {
			this.viewModel.showDepotSelect10 = value;
		} else if (slot === 11) {
			this.viewModel.showDepotSelect11 = value;
		} else if (slot === 12) {
			this.viewModel.showDepotSelect12 = value;
		}
	}

	private setDepotIcon(slot: number, icon: Maybe<TextureAsset>): void {
		if (slot === 1) {
			this.viewModel.depotIcon1 = icon;
		} else if (slot === 2) {
			this.viewModel.depotIcon2 = icon;
		} else if (slot === 3) {
			this.viewModel.depotIcon3 = icon;
		} else if (slot === 4) {
			this.viewModel.depotIcon4 = icon;
		} else if (slot === 5) {
			this.viewModel.depotIcon5 = icon;
		} else if (slot === 6) {
			this.viewModel.depotIcon6 = icon;
		} else if (slot === 7) {
			this.viewModel.depotIcon7 = icon;
		} else if (slot === 8) {
			this.viewModel.depotIcon8 = icon;
		} else if (slot === 9) {
			this.viewModel.depotIcon9 = icon;
		} else if (slot === 10) {
			this.viewModel.depotIcon10 = icon;
		} else if (slot === 11) {
			this.viewModel.depotIcon11 = icon;
		} else if (slot === 12) {
			this.viewModel.depotIcon12 = icon;
		}
	}

	private setDepotText(slot: number, text: string): void {
		if (slot === 1) {
			this.viewModel.depotText1 = text;
		} else if (slot === 2) {
			this.viewModel.depotText2 = text;
		} else if (slot === 3) {
			this.viewModel.depotText3 = text;
		} else if (slot === 4) {
			this.viewModel.depotText4 = text;
		} else if (slot === 5) {
			this.viewModel.depotText5 = text;
		} else if (slot === 6) {
			this.viewModel.depotText6 = text;
		} else if (slot === 7) {
			this.viewModel.depotText7 = text;
		} else if (slot === 8) {
			this.viewModel.depotText8 = text;
		} else if (slot === 9) {
			this.viewModel.depotText9 = text;
		} else if (slot === 10) {
			this.viewModel.depotText10 = text;
		} else if (slot === 11) {
			this.viewModel.depotText11 = text;
		} else if (slot === 12) {
			this.viewModel.depotText12 = text;
		}
	}
	// #endregion

	// #region ViewModel Setters (Backpack)
	private setBackpackBlankVisibility(slot: number, value: Visibility): void {
		if (slot === 1) {
			this.viewModel.showBackpackBlank1 = value;
		} else if (slot === 2) {
			this.viewModel.showBackpackBlank2 = value;
		} else if (slot === 3) {
			this.viewModel.showBackpackBlank3 = value;
		} else if (slot === 4) {
			this.viewModel.showBackpackBlank4 = value;
		} else if (slot === 5) {
			this.viewModel.showBackpackBlank5 = value;
		}
	}

	private setBackpackIconVisibility(slot: number, value: Visibility): void {
		if (slot === 1) {
			this.viewModel.showBackpackIcon1 = value;
		} else if (slot === 2) {
			this.viewModel.showBackpackIcon2 = value;
		} else if (slot === 3) {
			this.viewModel.showBackpackIcon3 = value;
		} else if (slot === 4) {
			this.viewModel.showBackpackIcon4 = value;
		} else if (slot === 5) {
			this.viewModel.showBackpackIcon5 = value;
		}
	}

	private setBackpackSelectVisibility(slot: number, value: Visibility): void {
		if (slot === 1) {
			this.viewModel.showBackpackSelect1 = value;
		} else if (slot === 2) {
			this.viewModel.showBackpackSelect2 = value;
		} else if (slot === 3) {
			this.viewModel.showBackpackSelect3 = value;
		} else if (slot === 4) {
			this.viewModel.showBackpackSelect4 = value;
		} else if (slot === 5) {
			this.viewModel.showBackpackSelect5 = value;
		}
	}

	private setBackpackIcon(slot: number, icon: Maybe<TextureAsset>): void {
		if (slot === 1) {
			this.viewModel.backpackIcon1 = icon;
		} else if (slot === 2) {
			this.viewModel.backpackIcon2 = icon;
		} else if (slot === 3) {
			this.viewModel.backpackIcon3 = icon;
		} else if (slot === 4) {
			this.viewModel.backpackIcon4 = icon;
		} else if (slot === 5) {
			this.viewModel.backpackIcon5 = icon;
		}
	}

	private setBackpackText(slot: number, text: string): void {
		if (slot === 1) {
			this.viewModel.backpackText1 = text;
		} else if (slot === 2) {
			this.viewModel.backpackText2 = text;
		} else if (slot === 3) {
			this.viewModel.backpackText3 = text;
		} else if (slot === 4) {
			this.viewModel.backpackText4 = text;
		} else if (slot === 5) {
			this.viewModel.backpackText5 = text;
		}
	}
	// #endregion
}
