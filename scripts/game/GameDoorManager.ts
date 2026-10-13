/**
 * GameDoorManager - Finds all doors in the level and randomizes initial states.
 *
 * Component Attachment: Scene Entity (same entity as GamePhaseManager / GameSystems)
 * Component Networking: Local (no networking needed)
 * Component Ownership: Not Networked
 *
 * On level load (called by GamePhaseManager after sublevel is active),
 * finds all entities with DoorLogic and randomizes their state:
 *   70% Closed, 20% Open, 10% Broken.
 *
 * Also provides a public API for GamePhaseManager to call during level transitions.
 */

import {
	Component,
	component,
	EntityService,
	ExecuteOn,
	OnEntityStartEvent,
	subscribe,
} from "meta/worlds";
import { DoorLogic } from "../components/DoorLogic";
import { DoorState } from "../events/DoorEvents";

@component({
	description: "Initializes door states at level start — 70% closed, 20% open, 10% broken.",
})
export class GameDoorManager extends Component {
	// #region Constants
	/** Probability thresholds for door state randomization. */
	private static readonly CLOSED_THRESHOLD = 0.70;
	private static readonly OPEN_THRESHOLD = 0.90; // 0.70 + 0.20
	// Above 0.90 = Broken (10%)
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		// Initial initialization is handled via initializeDoors() called by GamePhaseManager
		// after sublevel loads. Don't auto-run here because sublevel may not be loaded yet.
	}
	// #endregion

	// #region Public API
	/**
	 * Find all DoorLogic components in the scene and randomize their states.
	 * Called by GamePhaseManager after sublevel load completes.
	 *
	 * Distribution: 70% Closed, 20% Open, 10% Broken.
	 */
	public initializeDoors(): void {
		const doorEntities = EntityService.findEntitiesWithComponent(DoorLogic);
		if (doorEntities.length === 0) {
			console.log("[GameDoorManager] No doors found in level");
			return;
		}

		console.log(`[GameDoorManager] Initializing ${doorEntities.length} doors`);

		for (const doorEntity of doorEntities) {
			const doorLogic = doorEntity.getComponent(DoorLogic);
			if (!doorLogic) {
				continue;
			}

			const roll = Math.random();
			let state: DoorState;

			if (roll < GameDoorManager.CLOSED_THRESHOLD) {
				state = DoorState.Closed;
			} else if (roll < GameDoorManager.OPEN_THRESHOLD) {
				state = DoorState.Open;
			} else {
				state = DoorState.Broken;
			}

			// Reset HP based on state
			if (state === DoorState.Broken) {
				doorLogic.currentHp = 0;
			} else {
				doorLogic.currentHp = doorLogic.maxHp;
			}

			// Apply state immediately (no animation on level start)
			doorLogic.applyStateImmediate(state);
		}

		console.log("[GameDoorManager] Door initialization complete");
	}

	/**
	 * Reset all doors to Closed state with full HP.
	 * Called during level unload/transition cleanup.
	 */
	public resetAllDoors(): void {
		const doorEntities = EntityService.findEntitiesWithComponent(DoorLogic);
		for (const doorEntity of doorEntities) {
			const doorLogic = doorEntity.getComponent(DoorLogic);
			if (!doorLogic) {
				continue;
			}
			doorLogic.currentHp = doorLogic.maxHp;
			doorLogic.applyStateImmediate(DoorState.Closed);
		}
	}
	// #endregion
}
