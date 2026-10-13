/**
 * HudCutsceneViewModel - ViewModel for the cutscene overlay UI.
 * Manually created following the project's auto-generated ViewModel pattern.
 */

import {UiEvent, UiViewModel, uiViewModel} from 'meta/worlds';

export const OnClickBtnSkipEvent = new UiEvent('HudCutsceneViewModel_OnClickBtnSkipEvent');

@uiViewModel()
export class HudCutsceneViewModel extends UiViewModel {
  /** @min 0 @max 1 @decimals 2 */
  opacity1: number = 0;
  /** @min 0 @max 1 @decimals 2 */
  opacity2: number = 0;
  /** @min 0 @max 1 @decimals 2 */
  opacity3: number = 0;
  /** @min 0 @max 1 @decimals 2 */
  opacity4: number = 0;
  /** @min 0 @max 1 @decimals 2 */
  opacity5: number = 0;
  /** @min 0 @max 1 @decimals 2 */
  opacity6: number = 0;
  /** @min 0 @max 1 @decimals 2 */
  opacity7: number = 0;

  override readonly events = {
    OnClickBtnSkip: OnClickBtnSkipEvent,
  };
}
