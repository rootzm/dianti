/**
 * PropEnergyHelper - Provides energy calculation using shared state.
 * Reads from PropEnergyState (which has no imports) to avoid circular dependencies.
 *
 * Component Attachment: N/A (utility file, no component)
 * Component Networking: N/A
 * Component Ownership: N/A
 */

import { currentLevelId, currentTotalPropCount } from "./PropEnergyState";
import { calculatePropEnergy } from "./PropConfig";

export { calculatePropEnergy };

/**
 * Calculate prop energy using the current game state from PropEnergyState.
 * The state is updated by GamePhaseManager/GamePropManager at runtime.
 */
export function calculatePropEnergyFromGameState(baseValue: number): number {
	if (baseValue <= 0) {
		return 0;
	}
	return calculatePropEnergy(baseValue, currentLevelId, currentTotalPropCount);
}
