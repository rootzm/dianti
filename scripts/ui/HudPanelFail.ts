/**
 * HudPanelFail - Controller for the fail/death HUD panel.
 *
 * Component Attachment: Scene Entity (dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Shows when the player dies (health <= 0). Displays the current floor and
 * elevator power, and provides a RESTART button to reset the game.
 */
import type { Maybe } from "meta/worlds";
import {
	Component,
	CustomUiComponent,
	EntityService,
	EventService,
	ExecuteOn,
	OnEntityCreateEvent,
	OnEntityStartEvent,
	SoundComponent,
	SoundPlayInfo,
	component,
	subscribe,
} from "meta/worlds";
import { HudPanelFailViewModel, OnClickBtnRestartEvent } from "../../generated/view_models/HudPanelFailViewModel";
import { LevelResetEvent } from "../events/GamePhaseEvents";
import { PlayerDeathEvent, PlayerDeathEventPayload } from "../events/HealthEvents";
import { GameAudio } from "../game/GameAudio";
import { GamePhaseManager } from "../game/GamePhaseManager";

/**
 * @component
 * Component Attachment: Scene Entity (HudPanelFail entity with CustomUiComponent)
 * Component Networking: Local
 * Component Ownership: Not Networked
 */
@component({ description: "Controller for the death/fail HUD panel" })
export class HudPanelFail extends Component {
	private viewModel = new HudPanelFailViewModel();
	private uiComponent: Maybe<CustomUiComponent> = null;
	private sfxFailSound: Maybe<SoundComponent> = null;

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
		// Find the SfxFail child entity and cache its SoundComponent
		const sfxChildren = this.entity.findChildrenWithName("SfxFail", true);
		if (sfxChildren.length > 0) {
			this.sfxFailSound = sfxChildren[0].getComponent(SoundComponent);
		}
	}

	/**
	 * React to player death: show the fail panel with current floor and power.
	 */
	@subscribe(PlayerDeathEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onPlayerDeath(payload: PlayerDeathEventPayload): void {
		// Get current floor (levelId is already 1-based) and energy from GamePhaseManager
		const phaseManagers = EntityService.findEntitiesWithComponent(GamePhaseManager);
		if (phaseManagers.length > 0) {
			const pm = phaseManagers[0].getComponent(GamePhaseManager);
			if (pm) {
				this.viewModel.textFloor = pm.levelId;
				this.viewModel.textPower = Math.floor(pm.currentEnergy);
			}
		}

		// Show the fail panel
		if (this.uiComponent) {
			this.uiComponent.isVisible = true;
		}

		// Play the fail sound effect once
		if (this.sfxFailSound) {
			this.sfxFailSound.play(new SoundPlayInfo());
		}
	}

	/**
	 * Handle the RESTART button click: hide the panel and reset the game.
	 */
	@subscribe(OnClickBtnRestartEvent)
	private onClickRestart(): void {
		GameAudio.playClick();

		// Hide the fail panel
		if (this.uiComponent) {
			this.uiComponent.isVisible = false;
		}

		// Fire the level reset event to restart the game from the beginning (level 1)
		EventService.sendLocally(LevelResetEvent, {
			newLevelIndex: 1
		});
	}
}
