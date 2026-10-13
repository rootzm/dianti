import {
	DrawingCommandData,
	uiViewModel,
} from "meta/worlds";
import { HudPanelTipsViewModel } from "../../generated/view_models/HudPanelTipsViewModel";

@uiViewModel()
export class HudPanelTipsViewModelExt extends HudPanelTipsViewModel {
	public drawCommandsText: DrawingCommandData = new DrawingCommandData();
}
