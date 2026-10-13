/**
 * HudPanelLevelInfo - Controller for the level info HUD panel.
 *
 * Component Attachment: Scene Entity (HudPanelLevelInfo entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Shows at the start of each level (after elevator doors open) displaying
 * the current floor number and energy requirement. Player closes it manually.
 */
import type { Maybe } from "meta/worlds";
import {
	Component,
	CustomUiComponent,
	EntityService,
	ExecuteOn,
	OnEntityCreateEvent,
	component,
	subscribe
} from "meta/worlds";
import {
	HudPanelLevelInfoViewModel,
	OnClickBtnCloseEvent,
} from "../../generated/view_models/HudPanelLevelInfoViewModel";
import { LevelInfoPanelClosedEvent, ShowLevelInfoPanelEvent } from "../events/GamePhaseEvents";
import { GameAudio } from "../game/GameAudio";
import { GamePhaseManager } from "../game/GamePhaseManager";

/**
 * @component
 * Component Attachment: Scene Entity (HudPanelLevelInfo entity with CustomUiComponent)
 * Component Networking: Local
 * Component Ownership: Not Networked
 */
@component({ description: "Controller for the level info HUD panel showing floor and energy requirement" })
export class HudPanelLevelInfo extends Component {
	private viewModel = new HudPanelLevelInfoViewModel();
	private uiComponent: Maybe<CustomUiComponent> = null;

	@subscribe(OnEntityCreateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onStart(): void {
		this.uiComponent = this.entity.getComponent(CustomUiComponent);
		if (this.uiComponent) {
			this.uiComponent.dataContext = this.viewModel;
			this.uiComponent.isVisible = false;
		}
	}

	/**
	 * React to ShowLevelInfoPanelEvent: populate and show the panel.
	 */
	@subscribe(ShowLevelInfoPanelEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onShowLevelInfo(): void {
		// Get current floor and energy from GamePhaseManager
		const phaseManagers = EntityService.findEntitiesWithComponent(GamePhaseManager);
		if (phaseManagers.length > 0) {
			const pm = phaseManagers[0].getComponent(GamePhaseManager);
			if (pm) {
				this.viewModel.textFloor = `${pm.levelId}`;
				this.viewModel.textEnergy = `${Math.floor(pm.currentEnergy)}/${pm.maxEnergy}`;
			}
		}

		// Show the panel
		if (this.uiComponent) {
			this.uiComponent.isVisible = true;
		}
	}

	/**
	 * Handle the close button click: hide the panel and notify GamePhaseManager.
	 */
	@subscribe(OnClickBtnCloseEvent)
	private onClickClose(): void {
		GameAudio.playClick();
		if (this.uiComponent) {
			this.uiComponent.isVisible = false;
		}
		// Notify GamePhaseManager that the panel was closed so it can continue the flow
		this.sendEventLocally(LevelInfoPanelClosedEvent, {
			closed: true
		});
	}
}
