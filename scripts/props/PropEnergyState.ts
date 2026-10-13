/**
 * PropEnergyState - Shared module-level state for energy calculation parameters.
 * Updated by GamePhaseManager/GamePropManager, read by any UI file.
 * This module has NO imports to avoid circular dependencies.
 *
 * Component Attachment: N/A (shared state module, no component)
 * Component Networking: N/A
 * Component Ownership: N/A
 */

/** Current level ID, updated by GamePhaseManager (1-based: starts at 1) */
export let currentLevelId: number = 1;

/** Current total prop count, updated by GamePropManager or GamePhaseManager */
export let currentTotalPropCount: number = 1;

/** Update the current level ID (called by game managers) */
export function setCurrentLevelId(levelId: number): void {
	currentLevelId = levelId;
}

/** Update the total prop count (called by game managers) */
export function setCurrentTotalPropCount(count: number): void {
	currentTotalPropCount = count > 0 ? count : 1;
}
