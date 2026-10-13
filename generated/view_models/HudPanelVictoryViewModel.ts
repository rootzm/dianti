/**
 * @generated SignedSource<<37a68cebdd158a8c7a40cb3d7818c885061deeb47d0ce3868fdfd5a52c02390b>>
 * @generated This file is generated. Do not modify it manually. Use the UI View Model by importing it into your script.
 */

import {UiEvent, UiViewModel, uiViewModel} from 'meta/worlds';

export const OnClickBtnNextEvent = new UiEvent('HudPanelVictoryViewModel_OnClickBtnNextEvent');

@uiViewModel()
export class HudPanelVictoryViewModel extends UiViewModel {

  override readonly events = {
    OnClickBtnNext: OnClickBtnNextEvent,
  };
}
