/**
 * @generated SignedSource<<76bfc3fff5e21bea27588a81f0b787afdc97fb82455317d546a3e77578e501d5>>
 * @generated This file is generated. Do not modify it manually. Use the UI View Model by importing it into your script.
 */

import {Visibility, TextureAsset, UiEvent, UiViewModel, uiViewModel, type Maybe} from 'meta/worlds';

export const OnClickBtnBackpackEvent = new UiEvent('HudGameBackpackViewModel_OnClickBtnBackpackEvent');
export const OnClickBtnItem1Event = new UiEvent('HudGameBackpackViewModel_OnClickBtnItem1Event');
export const OnClickBtnItem2Event = new UiEvent('HudGameBackpackViewModel_OnClickBtnItem2Event');
export const OnClickBtnItem3Event = new UiEvent('HudGameBackpackViewModel_OnClickBtnItem3Event');
export const OnClickBtnItem4Event = new UiEvent('HudGameBackpackViewModel_OnClickBtnItem4Event');
export const OnClickBtnItem5Event = new UiEvent('HudGameBackpackViewModel_OnClickBtnItem5Event');

@uiViewModel()
export class HudGameBackpackViewModel extends UiViewModel {
  icon1: Maybe<TextureAsset> = null;
  icon2: Maybe<TextureAsset> = null;
  icon3: Maybe<TextureAsset> = null;
  icon4: Maybe<TextureAsset> = null;
  icon5: Maybe<TextureAsset> = null;
  text1: string = "";
  text2: string = "";
  text3: string = "";
  text4: string = "";
  text5: string = "";
  showItem1Blank: Visibility = 0;
  showItem2Blank: Visibility = 0;
  showItem3Blank: Visibility = 0;
  showItem4Blank: Visibility = 0;
  showItem5Blank: Visibility = 0;
  showItem1Icon: Visibility = 0;
  showItem2Icon: Visibility = 0;
  showItem3Icon: Visibility = 0;
  showItem4Icon: Visibility = 0;
  showItem5Icon: Visibility = 0;
  showItem1Select: Visibility = 0;
  showItem2Select: Visibility = 0;
  showItem3Select: Visibility = 0;
  showItem4Select: Visibility = 0;
  showItem5Select: Visibility = 0;
  /** @min 0 @max 180 @decimals 0 */
  tagRotation: number = 0;
  showItems: Visibility = 0;
  showUseHint1: Visibility = 0;
  showUseHint2: Visibility = 0;
  showUseHint3: Visibility = 0;
  showUseHint4: Visibility = 0;
  showUseHint5: Visibility = 0;
  textUseHint1: string = "";
  textUseHint2: string = "";
  textUseHint3: string = "";
  textUseHint4: string = "";
  textUseHint5: string = "";
  qualityFrame1: Maybe<TextureAsset> = null;
  qualityFrame2: Maybe<TextureAsset> = null;
  qualityFrame3: Maybe<TextureAsset> = null;
  qualityFrame4: Maybe<TextureAsset> = null;
  qualityFrame5: Maybe<TextureAsset> = null;
  showItem1Quality: Visibility = 0;
  showItem2Quality: Visibility = 0;
  showItem3Quality: Visibility = 0;
  showItem4Quality: Visibility = 0;
  showItem5Quality: Visibility = 0;

  override readonly events = {
    OnClickBtnBackpack: OnClickBtnBackpackEvent,
    OnClickBtnItem1: OnClickBtnItem1Event,
    OnClickBtnItem2: OnClickBtnItem2Event,
    OnClickBtnItem3: OnClickBtnItem3Event,
    OnClickBtnItem4: OnClickBtnItem4Event,
    OnClickBtnItem5: OnClickBtnItem5Event,
  };
}
