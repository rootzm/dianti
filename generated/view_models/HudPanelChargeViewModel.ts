/**
 * @generated SignedSource<<343d621402ef6f1f2e9c809232073178b557091449717bbb8574183dc91b8af0>>
 * @generated This file is generated. Do not modify it manually. Use the UI View Model by importing it into your script.
 */

import {Visibility, TextureAsset, UiEvent, UiViewModel, uiViewModel, type Maybe} from 'meta/worlds';

export const OnClickBtnItem1Event = new UiEvent('HudPanelChargeViewModel_OnClickBtnItem1Event');
export const OnClickBtnItem2Event = new UiEvent('HudPanelChargeViewModel_OnClickBtnItem2Event');
export const OnClickBtnItem3Event = new UiEvent('HudPanelChargeViewModel_OnClickBtnItem3Event');
export const OnClickBtnItem4Event = new UiEvent('HudPanelChargeViewModel_OnClickBtnItem4Event');
export const OnClickBtnItem5Event = new UiEvent('HudPanelChargeViewModel_OnClickBtnItem5Event');
export const OnClickBtnCloseEvent = new UiEvent('HudPanelChargeViewModel_OnClickBtnCloseEvent');
export const OnClickBtnChargeEvent = new UiEvent('HudPanelChargeViewModel_OnClickBtnChargeEvent');

@uiViewModel()
export class HudPanelChargeViewModel extends UiViewModel {
  Icon1: Maybe<TextureAsset> = null;
  Icon2: Maybe<TextureAsset> = null;
  Icon3: Maybe<TextureAsset> = null;
  Icon4: Maybe<TextureAsset> = null;
  Icon5: Maybe<TextureAsset> = null;
  Text1: string = "";
  Text2: string = "";
  Text3: string = "";
  Text4: string = "";
  Text5: string = "";
  showBlank1: Visibility = 0;
  showBlank2: Visibility = 0;
  showBlank3: Visibility = 0;
  showBlank4: Visibility = 0;
  showBlank5: Visibility = 0;
  showIcon1: Visibility = 0;
  showIcon2: Visibility = 0;
  showIcon3: Visibility = 0;
  showIcon4: Visibility = 0;
  showIcon5: Visibility = 0;
  show1Select: Visibility = 0;
  show2Select: Visibility = 0;
  show3Select: Visibility = 0;
  show4Select: Visibility = 0;
  show5Select: Visibility = 0;
  showAnimChargeFlash1: Visibility = 0;
  showAnimChargeFlash2: Visibility = 0;
  showAnimChargeFlash3: Visibility = 0;
  showAnimChargeFlash4: Visibility = 0;
  showAnimChargeFlash5: Visibility = 0;
  showAnimChargeFlashBall: Visibility = 0;

  override readonly events = {
    OnClickBtnItem1: OnClickBtnItem1Event,
    OnClickBtnItem2: OnClickBtnItem2Event,
    OnClickBtnItem3: OnClickBtnItem3Event,
    OnClickBtnItem4: OnClickBtnItem4Event,
    OnClickBtnItem5: OnClickBtnItem5Event,
    OnClickBtnClose: OnClickBtnCloseEvent,
    OnClickBtnCharge: OnClickBtnChargeEvent,
  };
}
