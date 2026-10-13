/**
 * HudPanelVictory - Controller for the victory HUD overlay.
 *
 * Component Attachment: Scene Entity (dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Full-screen victory overlay shown when the player closes HudPanelCharge
 * with energy meeting or exceeding the requirement (level clear condition).
 * Displays "WIN!" text and a "Next" button that triggers level transition.
 */
import type { Maybe } from "meta/worlds";
import {
	Component,
	CustomUiComponent,
	EventService,
	ExecuteOn,
	OnEntityCreateEvent,
	component,
	subscribe
} from "meta/worlds";
import {
	HudPanelVictoryViewModel,
	OnClickBtnNextEvent,
} from "../../generated/view_models/HudPanelVictoryViewModel";
import {
	LevelTransitionRequestEvent,
	ShowVictoryPanelEvent,
} from "../events/GamePhaseEvents";
import { GameAudio } from "../game/GameAudio";

@component({ description: "Controller for the victory HUD overlay. Shows when energy meets level requirement." })
export class HudPanelVictory extends Component {
	private viewModel = new HudPanelVictoryViewModel();
	private uiComponent: Maybe<CustomUiComponent> = null;

	@subscribe(OnEntityCreateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onCraete(): void {
		this.uiComponent = this.entity.getComponent(CustomUiComponent);
		if (this.uiComponent) {
			this.uiComponent.dataContext = this.viewModel;
			this.uiComponent.isVisible = false;
		}
	}

	@subscribe(ShowVictoryPanelEvent, { execution: ExecuteOn.Everywhere })
	private onShowVictory(): void {
		setTimeout((): void => {
			if (!this.entity.valid) return;
			this.show();
		}, 100);
	}

	@subscribe(OnClickBtnNextEvent, { execution: ExecuteOn.Everywhere })
	private onNextClick(): void {
		GameAudio.playClick();
		if (this.uiComponent) {
			this.uiComponent.isVisible = false;
		}
		EventService.sendLocally(LevelTransitionRequestEvent, {
			requested: true,
		});
	}

	private show(): void {
		if (this.uiComponent) {
			this.uiComponent.isVisible = true;
		}
	}
}
