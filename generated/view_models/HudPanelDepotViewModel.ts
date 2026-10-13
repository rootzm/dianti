/**
 * @generated SignedSource<<ef3af1e85871b424688712d0a9614a9e835ee4fe005bfbe80ad5e98720614205>>
 * @generated This file is generated. Do not modify it manually. Use the UI View Model by importing it into your script.
 */

import {Visibility, TextureAsset, UiEvent, UiViewModel, uiViewModel, type Maybe} from 'meta/worlds';

export const OnClickBtnCloseEvent = new UiEvent('HudPanelDepotViewModel_OnClickBtnCloseEvent');
export const OnClickBtnDepotItem1Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem1Event');
export const OnClickBtnDepotItem2Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem2Event');
export const OnClickBtnDepotItem3Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem3Event');
export const OnClickBtnDepotItem4Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem4Event');
export const OnClickBtnDepotItem5Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem5Event');
export const OnClickBtnDepotItem6Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem6Event');
export const OnClickBtnDepotItem7Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem7Event');
export const OnClickBtnDepotItem8Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem8Event');
export const OnClickBtnDepotItem9Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem9Event');
export const OnClickBtnDepotItem10Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem10Event');
export const OnClickBtnDepotItem11Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem11Event');
export const OnClickBtnDepotItem12Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnDepotItem12Event');
export const OnClickBtnBackpackItem1Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnBackpackItem1Event');
export const OnClickBtnBackpackItem2Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnBackpackItem2Event');
export const OnClickBtnBackpackItem3Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnBackpackItem3Event');
export const OnClickBtnBackpackItem4Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnBackpackItem4Event');
export const OnClickBtnBackpackItem5Event = new UiEvent('HudPanelDepotViewModel_OnClickBtnBackpackItem5Event');

@uiViewModel()
export class HudPanelDepotViewModel extends UiViewModel {
  depotIcon1: Maybe<TextureAsset> = null;
  depotIcon2: Maybe<TextureAsset> = null;
  depotIcon3: Maybe<TextureAsset> = null;
  depotIcon4: Maybe<TextureAsset> = null;
  depotIcon5: Maybe<TextureAsset> = null;
  depotIcon6: Maybe<TextureAsset> = null;
  depotIcon7: Maybe<TextureAsset> = null;
  depotIcon8: Maybe<TextureAsset> = null;
  depotIcon9: Maybe<TextureAsset> = null;
  depotIcon10: Maybe<TextureAsset> = null;
  depotIcon11: Maybe<TextureAsset> = null;
  depotIcon12: Maybe<TextureAsset> = null;
  backpackIcon1: Maybe<TextureAsset> = null;
  backpackIcon2: Maybe<TextureAsset> = null;
  backpackIcon3: Maybe<TextureAsset> = null;
  backpackIcon4: Maybe<TextureAsset> = null;
  backpackIcon5: Maybe<TextureAsset> = null;
  depotText1: string = "";
  depotText2: string = "";
  depotText3: string = "";
  depotText4: string = "";
  depotText5: string = "";
  depotText6: string = "";
  depotText7: string = "";
  depotText8: string = "";
  depotText9: string = "";
  depotText10: string = "";
  depotText11: string = "";
  depotText12: string = "";
  backpackText1: string = "";
  backpackText2: string = "";
  backpackText3: string = "";
  backpackText4: string = "";
  backpackText5: string = "";
  showDepotBlank1: Visibility = 0;
  showDepotBlank2: Visibility = 0;
  showDepotBlank3: Visibility = 0;
  showDepotBlank4: Visibility = 0;
  showDepotBlank5: Visibility = 0;
  showDepotBlank6: Visibility = 0;
  showDepotBlank7: Visibility = 0;
  showDepotBlank8: Visibility = 0;
  showDepotBlank9: Visibility = 0;
  showDepotBlank10: Visibility = 0;
  showDepotBlank11: Visibility = 0;
  showDepotBlank12: Visibility = 0;
  showDepotIcon1: Visibility = 0;
  showDepotIcon2: Visibility = 0;
  showDepotIcon3: Visibility = 0;
  showDepotIcon4: Visibility = 0;
  showDepotIcon5: Visibility = 0;
  showDepotIcon6: Visibility = 0;
  showDepotIcon7: Visibility = 0;
  showDepotIcon8: Visibility = 0;
  showDepotIcon9: Visibility = 0;
  showDepotIcon10: Visibility = 0;
  showDepotIcon11: Visibility = 0;
  showDepotIcon12: Visibility = 0;
  showDepotSelect1: Visibility = 0;
  showDepotSelect2: Visibility = 0;
  showDepotSelect3: Visibility = 0;
  showDepotSelect4: Visibility = 0;
  showDepotSelect5: Visibility = 0;
  showDepotSelect6: Visibility = 0;
  showDepotSelect7: Visibility = 0;
  showDepotSelect8: Visibility = 0;
  showDepotSelect9: Visibility = 0;
  showDepotSelect10: Visibility = 0;
  showDepotSelect11: Visibility = 0;
  showDepotSelect12: Visibility = 0;
  showBackpackBlank1: Visibility = 0;
  showBackpackBlank2: Visibility = 0;
  showBackpackBlank3: Visibility = 0;
  showBackpackBlank4: Visibility = 0;
  showBackpackBlank5: Visibility = 0;
  showBackpackIcon1: Visibility = 0;
  showBackpackIcon2: Visibility = 0;
  showBackpackIcon3: Visibility = 0;
  showBackpackIcon4: Visibility = 0;
  showBackpackIcon5: Visibility = 0;
  showBackpackSelect1: Visibility = 0;
  showBackpackSelect2: Visibility = 0;
  showBackpackSelect3: Visibility = 0;
  showBackpackSelect4: Visibility = 0;
  showBackpackSelect5: Visibility = 0;

  override readonly events = {
    OnClickBtnClose: OnClickBtnCloseEvent,
    OnClickBtnDepotItem1: OnClickBtnDepotItem1Event,
    OnClickBtnDepotItem2: OnClickBtnDepotItem2Event,
    OnClickBtnDepotItem3: OnClickBtnDepotItem3Event,
    OnClickBtnDepotItem4: OnClickBtnDepotItem4Event,
    OnClickBtnDepotItem5: OnClickBtnDepotItem5Event,
    OnClickBtnDepotItem6: OnClickBtnDepotItem6Event,
    OnClickBtnDepotItem7: OnClickBtnDepotItem7Event,
    OnClickBtnDepotItem8: OnClickBtnDepotItem8Event,
    OnClickBtnDepotItem9: OnClickBtnDepotItem9Event,
    OnClickBtnDepotItem10: OnClickBtnDepotItem10Event,
    OnClickBtnDepotItem11: OnClickBtnDepotItem11Event,
    OnClickBtnDepotItem12: OnClickBtnDepotItem12Event,
    OnClickBtnBackpackItem1: OnClickBtnBackpackItem1Event,
    OnClickBtnBackpackItem2: OnClickBtnBackpackItem2Event,
    OnClickBtnBackpackItem3: OnClickBtnBackpackItem3Event,
    OnClickBtnBackpackItem4: OnClickBtnBackpackItem4Event,
    OnClickBtnBackpackItem5: OnClickBtnBackpackItem5Event,
  };
}
