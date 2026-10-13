/**
 * @generated SignedSource<<bba44e515ea088fe1c9daaddf569902ccc4e57d53e8a4e49689495adeb99e692>>
 * @generated This file is generated. Do not modify it manually. Use the UI View Model by importing it into your script.
 */

import {Visibility, UiViewModel, uiViewModel} from 'meta/worlds';

@uiViewModel()
export class HudGameLoadingViewModel extends UiViewModel {
  showProgress: Visibility = 0;
  /** @min 0 @max 100 @decimals 0 */
  progress: number = 0;
  textProgress: string = "";
  textVersion: string = "";
}
