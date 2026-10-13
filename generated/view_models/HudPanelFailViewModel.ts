/**
 * @generated SignedSource<<2a2d4ff0784589d374045eb37f0a53ad8e011ccb4ebbc90f14dd67a05d02b61c>>
 * @generated This file is generated. Do not modify it manually. Use the UI View Model by importing it into your script.
 */

import {UiEvent, UiViewModel, uiViewModel} from 'meta/worlds';

export const OnClickBtnRestartEvent = new UiEvent('HudPanelFailViewModel_OnClickBtnRestartEvent');

@uiViewModel()
export class HudPanelFailViewModel extends UiViewModel {
  /** @min 0 @max 100 @decimals 0 */
  textFloor: number = 0;
  /** @min 0 @max 100 @decimals 0 */
  textPower: number = 0;

  override readonly events = {
    OnClickBtnRestart: OnClickBtnRestartEvent,
  };
}
