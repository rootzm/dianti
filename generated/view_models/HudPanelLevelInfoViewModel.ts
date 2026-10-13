/**
 * @generated SignedSource<<0fcaffc085171416675ff46fc5edf578bb8c532a8d129488eba7dfd86f21a5ab>>
 * @generated This file is generated. Do not modify it manually. Use the UI View Model by importing it into your script.
 */

import {UiEvent, UiViewModel, uiViewModel} from 'meta/worlds';

export const OnClickBtnCloseEvent = new UiEvent('HudPanelLevelInfoViewModel_OnClickBtnCloseEvent');

@uiViewModel()
export class HudPanelLevelInfoViewModel extends UiViewModel {
  textFloor: string = "";
  textEnergy: string = "";

  override readonly events = {
    OnClickBtnClose: OnClickBtnCloseEvent,
  };
}
