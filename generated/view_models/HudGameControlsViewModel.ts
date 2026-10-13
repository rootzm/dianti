/**
 * @generated SignedSource<<00d4f1c6ed29d5e0f79c215326ee0ad59f9162c912102bdb759249571560ce20>>
 * @generated This file is generated. Do not modify it manually. Use the UI View Model by importing it into your script.
 */

import {Visibility, TextureAsset, UiEvent, UiViewModel, uiViewModel, type Maybe} from 'meta/worlds';

export const OnClickBtnFlashEvent = new UiEvent('HudGameControlsViewModel_OnClickBtnFlashEvent');
export const OnClickBtnActionEvent = new UiEvent('HudGameControlsViewModel_OnClickBtnActionEvent');
export const OnClickBtnOpenDepotEvent = new UiEvent('HudGameControlsViewModel_OnClickBtnOpenDepotEvent');
export const OnClickBtnPickupEvent = new UiEvent('HudGameControlsViewModel_OnClickBtnPickupEvent');
export const OnClickBtnUseEvent = new UiEvent('HudGameControlsViewModel_OnClickBtnUseEvent');

@uiViewModel()
export class HudGameControlsViewModel extends UiViewModel {
  showIconFlashOn: Visibility = 0;
  showIconFlashOff: Visibility = 0;
  showActionRun: Visibility = 0;
  showActionSprint: Visibility = 0;
  showBtnOpenDepot: Visibility = 0;
  showBtnPickup: Visibility = 0;
  btnPickupIcon: Maybe<TextureAsset> = null;
  btnPickupTextPower: string = "";
  btnPickupTextName: string = "";
  showBtnUse: Visibility = 0;
  btnUseIcon: Maybe<TextureAsset> = null;

  override readonly events = {
    OnClickBtnFlash: OnClickBtnFlashEvent,
    OnClickBtnAction: OnClickBtnActionEvent,
    OnClickBtnOpenDepot: OnClickBtnOpenDepotEvent,
    OnClickBtnPickup: OnClickBtnPickupEvent,
    OnClickBtnUse: OnClickBtnUseEvent,
  };
}
