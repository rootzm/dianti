import {
	Visibility,
	uiViewModel,
} from "meta/worlds";
import { HudGameControlsViewModel } from "../../generated/view_models/HudGameControlsViewModel";

@uiViewModel()
export class HudGameControlsViewModelExt extends HudGameControlsViewModel {
	public showBtnPickupDetails: Visibility = Visibility.Collapsed;
}
