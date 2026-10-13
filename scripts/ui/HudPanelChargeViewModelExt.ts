import {
	DrawingCommandData,
	Visibility,
	uiViewModel,
} from "meta/worlds";
import { HudPanelChargeViewModel } from "../../generated/view_models/HudPanelChargeViewModel";

@uiViewModel()
export class HudPanelChargeViewModelExt extends HudPanelChargeViewModel {
	public drawCommandsAnimEye: DrawingCommandData = new DrawingCommandData();
	public drawCommandsAnimChargeFlash1: DrawingCommandData = new DrawingCommandData();
	public drawCommandsAnimChargeFlash2: DrawingCommandData = new DrawingCommandData();
	public drawCommandsAnimChargeFlash3: DrawingCommandData = new DrawingCommandData();
	public drawCommandsAnimChargeFlash4: DrawingCommandData = new DrawingCommandData();
	public drawCommandsAnimChargeFlash5: DrawingCommandData = new DrawingCommandData();
	public drawCommandsAnimChargeFlashBall: DrawingCommandData = new DrawingCommandData();

	/** Transparent overlay that blocks all interactions during charge animation playback */
	public showInteractionBlocker: Visibility = Visibility.Collapsed;
}
