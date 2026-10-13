import {
	DrawingCommandData,
	uiViewModel,
} from "meta/worlds";
import { HudGameHpPowerViewModel } from "../../generated/view_models/HudGameHpPowerViewModel";

@uiViewModel()
export class HudGameHpPowerViewModelExt extends HudGameHpPowerViewModel {
	public drawCommandsTextHp: DrawingCommandData = new DrawingCommandData();
	public drawCommandsTextPower: DrawingCommandData = new DrawingCommandData();
}
