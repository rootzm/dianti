/**
 * HudGuideUsableItem - Soft guide overlay for first usable item acquisition.
 *
 * Component Attachment: Scene Entity (dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Two-step guide:
 * Step1 - Highlights the backpack slot where the usable item was placed.
 *         Dismissed when the player clicks that slot (detected via PropUseButtonShowEvent).
 * Step2 - Highlights the BtnUse button. Dismissed when the player clicks BtnUse
 *         (via PropUseButtonClickEvent) or clicks the guide dialog button.
 *
 * Persistence: Uses guideUsableItemShown PlayerVariable via NetworkEvent to server.
 * Trigger: Listens to PropInventoryChangedEvent for first usable item add.
 */

import type {
	GuideLoadResponsePayload,
	GuideUsableItemTriggerPayload,
} from "../events/GuideEvents";
import type {
	PropInventoryChangedPayload,
} from "../events/PropEvents";
import type { Maybe } from "meta/worlds";
import {
	Component,
	CustomUiComponent,
	EntityService,
	EventService,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	PlayerService,
	UiEvent,
	UiViewModel,
	Visibility,
	component,
	subscribe,
	uiViewModel,
} from "meta/worlds";
import {
	GuideLoadRequestEvent,
	GuideLoadResponseEvent,
	GuideSaveRequestEvent,
	GuideUsableItemTriggerEvent,
} from "../events/GuideEvents";
import {
	PropInventoryChangedEvent,
	PropUseButtonClickEvent,
	PropUseButtonShowEvent,
} from "../events/PropEvents";
import { GamePlayerPropManager } from "../game/GamePlayerPropManager";

// #region ViewModel
export const OnClickBtnGuideDialogEvent = new UiEvent("HudGuideUsableItemViewModel_OnClickBtnGuideDialog");

@uiViewModel()
export class HudGuideUsableItemViewModel extends UiViewModel {
	public showStep1Slot1: Visibility = Visibility.Collapsed;
	public showStep1Slot2: Visibility = Visibility.Collapsed;
	public showStep1Slot3: Visibility = Visibility.Collapsed;
	public showStep1Slot4: Visibility = Visibility.Collapsed;
	public showStep1Slot5: Visibility = Visibility.Collapsed;
	public showStep2: Visibility = Visibility.Collapsed;

	public override readonly events = {
		OnClickBtnGuideDialog: OnClickBtnGuideDialogEvent,
	};
}
// #endregion

// #region Guide Step Enum
const GuideStep = {
	None: 0,
	Step1: 1,
	Step2: 2,
	Done: 3,
} as const;
// #endregion

/**
 * @component
 * Component Attachment: Scene Entity (dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 */
@component()
export class HudGuideUsableItem extends Component {
	private static readonly MAX_SLOTS = 5;

	private viewModel = new HudGuideUsableItemViewModel();
	private currentStep: number = GuideStep.None;
	private guideAlreadyShown: boolean = false;
	private guideLoaded: boolean = false;
	private activeSlotIndex: number = -1;

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		const customUi = this.entity.getComponent(CustomUiComponent);
		if (!customUi) {
			return;
		}
		customUi.dataContext = this.viewModel;
		this.hideAll();
		this.requestLoadGuideState();
	}
	// #endregion

	// #region Persistence Load/Save
	private requestLoadGuideState(): void {
		const localPlayer = PlayerService.get().getLocalPlayer();
		if (localPlayer == null) {
			return;
		}
		EventService.sendGlobally(GuideLoadRequestEvent, {
			player: localPlayer,
		});
	}

	@subscribe(GuideLoadResponseEvent, { execution: ExecuteOn.Everywhere })
	private onGuideLoadResponse(payload: GuideLoadResponsePayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		const localPlayer = PlayerService.get().getLocalPlayer();
		if (localPlayer == null) {
			return;
		}
		if (payload.player == null) {
			return;
		}
		if (!PlayerService.get().isLocalPlayer(payload.player)) {
			return;
		}
		this.guideAlreadyShown = payload.guideUsableItemShown === 1;
		this.guideLoaded = true;
	}

	private persistGuideShown(): void {
		const localPlayer = PlayerService.get().getLocalPlayer();
		if (localPlayer == null) {
			return;
		}
		EventService.sendGlobally(GuideSaveRequestEvent, {
			player: localPlayer,
			guideUsableItemShown: 1,
		});
	}
	// #endregion

	// #region Trigger: Inventory Changed
	@subscribe(PropInventoryChangedEvent, { execution: ExecuteOn.Everywhere })
	private onInventoryChanged(payload: PropInventoryChangedPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		// Handle item removal while guide is active — hide guide if no usable items remain
		if (this.currentStep === GuideStep.Step1 || this.currentStep === GuideStep.Step2) {
			if (payload.changeType === "remove" || payload.changeType === "clear") {
				const remainingSlot = this.findUsableItemSlot();
				if (remainingSlot < 0) {
					console.log("[HudGuideUsableItem] No usable items remain after removal, hiding guide");
					this.hideAll();
					this.currentStep = GuideStep.None;
				}
			}
			return;
		}
		if (this.guideAlreadyShown) {
			return;
		}
		if (!this.guideLoaded) {
			return;
		}
		if (payload.changeType !== "add") {
			return;
		}
		if (!payload.propData.usable) {
			return;
		}
		// Find which slot the usable item is in
		const slotIndex = this.findUsableItemSlot();
		if (slotIndex < 0) {
			return;
		}
		this.startStep1(slotIndex);
	}

	@subscribe(GuideUsableItemTriggerEvent, { execution: ExecuteOn.Everywhere })
	private onGuideTrigger(payload: GuideUsableItemTriggerPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		if (this.currentStep !== GuideStep.None) {
			return;
		}
		if (this.guideAlreadyShown) {
			return;
		}
		this.startStep1(payload.slotIndex);
	}
	// #endregion

	// #region Step1: Highlight Item Slot
	private startStep1(slotIndex: number): void {
		this.currentStep = GuideStep.Step1;
		this.activeSlotIndex = slotIndex;
		this.showStep1ForSlot(slotIndex);
	}

	private showStep1ForSlot(slotIndex: number): void {
		this.hideAll();
		if (slotIndex === 0) {
			this.viewModel.showStep1Slot1 = Visibility.Visible;
		} else if (slotIndex === 1) {
			this.viewModel.showStep1Slot2 = Visibility.Visible;
		} else if (slotIndex === 2) {
			this.viewModel.showStep1Slot3 = Visibility.Visible;
		} else if (slotIndex === 3) {
			this.viewModel.showStep1Slot4 = Visibility.Visible;
		} else if (slotIndex === 4) {
			this.viewModel.showStep1Slot5 = Visibility.Visible;
		}
	}

	/**
	 * When PropUseButtonShowEvent fires, it means the player selected a usable
	 * item in the backpack. If we are in Step1, advance to Step2.
	 */
	@subscribe(PropUseButtonShowEvent, { execution: ExecuteOn.Everywhere })
	private onUseButtonShow(): void {
		if (this.currentStep !== GuideStep.Step1) {
			return;
		}
		this.startStep2();
	}
	// #endregion

	// #region Step2: Highlight BtnUse
	private startStep2(): void {
		this.currentStep = GuideStep.Step2;
		this.hideAll();
		this.viewModel.showStep2 = Visibility.Visible;
	}

	/**
	 * When the player clicks BtnUse, dismiss the guide if we are in Step2.
	 */
	@subscribe(PropUseButtonClickEvent, { execution: ExecuteOn.Everywhere })
	private onUseButtonClick(): void {
		if (this.currentStep !== GuideStep.Step2) {
			return;
		}
		this.completeGuide();
	}

	/**
	 * When the player clicks the guide dialog bubble in Step2.
	 */
	@subscribe(OnClickBtnGuideDialogEvent, { execution: ExecuteOn.Everywhere })
	private onClickGuideDialog(): void {
		if (this.currentStep !== GuideStep.Step2) {
			return;
		}
		this.completeGuide();
	}
	// #endregion

	// #region Complete
	private completeGuide(): void {
		this.currentStep = GuideStep.Done;
		this.guideAlreadyShown = true;
		this.hideAll();
		this.persistGuideShown();
	}
	// #endregion

	// #region Helpers
	private hideAll(): void {
		this.viewModel.showStep1Slot1 = Visibility.Collapsed;
		this.viewModel.showStep1Slot2 = Visibility.Collapsed;
		this.viewModel.showStep1Slot3 = Visibility.Collapsed;
		this.viewModel.showStep1Slot4 = Visibility.Collapsed;
		this.viewModel.showStep1Slot5 = Visibility.Collapsed;
		this.viewModel.showStep2 = Visibility.Collapsed;
	}

	private findUsableItemSlot(): number {
		const localPlayer = PlayerService.get().getLocalPlayer();
		if (localPlayer == null) {
			return -1;
		}
		const inventoryEntities = EntityService.findEntitiesWithComponent(GamePlayerPropManager);
		if (inventoryEntities.length === 0) {
			return -1;
		}
		const inventory = inventoryEntities[0].getComponent(GamePlayerPropManager);
		if (!inventory) {
			return -1;
		}
		const slots = inventory.getPlayerSlots(localPlayer);
		for (let i = 0; i < HudGuideUsableItem.MAX_SLOTS; i++) {
			const slot = slots[i];
			if (slot != null && slot.usable) {
				return i;
			}
		}
		return -1;
	}
	// #endregion
}
