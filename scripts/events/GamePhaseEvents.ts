/**
 * GamePhaseEvents - Shared phase definitions and events.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Extracted to its own file to prevent circular dependencies between
 * GamePhaseManager, EnemyLogic, and PlayerMovementAbility.
 *
 * All events are LocalEvents — game phases are managed client-locally
 * with no server involvement.
 */

import {
	LocalEvent,
	property,
	serializable,
} from "meta/worlds";

/**
 * Game phases for the loop-based game.
 * Flow: Initialization → Exploration → Settlement (loops Exploration→Settlement)
 */
export enum GamePhase {
	/** One-time phase at game start: waits for player, enemies, and props to be ready. */
	Initialization = 0,
	/** @deprecated No longer used — kept for enum ordinal stability. */
	Preparation = 1,
	Exploration = 2,
	/** Settlement phase — scores/rewards are tallied after exploration ends. */
	Settlement = 3,
}

// #region Phase Changed Events
/**
 * Payload broadcast when the game phase changes.
 */
@serializable()
export class GamePhaseChangedPayload {
	@property()
	public readonly previousPhase: number = GamePhase.Initialization;

	@property()
	public readonly newPhase: number = GamePhase.Initialization;
}

/**
 * LocalEvent broadcast when the phase transitions.
 * Any script can subscribe to this to react to phase changes.
 * Runs entirely client-locally — no networking involved.
 */
export const GamePhaseChangedEvent = new LocalEvent<GamePhaseChangedPayload>(
	"GamePhaseChangedEvent",
	GamePhaseChangedPayload,
);

/**
 * Local payload for the client-side LocalEvent (legacy alias).
 * Used by UI and other entities to react to phase changes.
 */
export class GamePhaseChangedLocalPayload {
	public readonly previousPhase: number = GamePhase.Initialization;
	public readonly newPhase: number = GamePhase.Initialization;
}

/**
 * LocalEvent dispatched on clients when a phase change occurs (legacy alias).
 * Kept for backward compatibility — new code should subscribe to GamePhaseChangedEvent.
 */
export const GamePhaseChangedLocalEvent = new LocalEvent<GamePhaseChangedLocalPayload>(
	"GamePhaseChangedLocalEvent",
	GamePhaseChangedLocalPayload,
);
// #endregion

// #region Level Progression Events
/**
 * Fired by HudVictory when the player clicks the "Next" button.
 * GamePhaseManager subscribes to this and orchestrates the transition.
 */
@serializable()
export class LevelTransitionRequestPayload {
	@property()
	public readonly requested: boolean = true;
}

export const LevelTransitionRequestEvent = new LocalEvent<LevelTransitionRequestPayload>(
	"LevelTransitionRequestEvent",
	LevelTransitionRequestPayload,
);

/**
 * Fired by GamePhaseManager to tell all spawners and
 * game systems to destroy their spawned entities and re-initialize.
 * Carries the new level index for scaling purposes.
 */
@serializable()
export class LevelResetPayload {
	@property()
	public readonly newLevelIndex: number = 0;
}

export const LevelResetEvent = new LocalEvent<LevelResetPayload>(
	"LevelResetEvent",
	LevelResetPayload,
);
// #endregion

// #region Elevator Energy Events
/**
 * Payload broadcast when elevator energy changes.
 * Emitted by GamePhaseManager so HUD can update power display.
 */
@serializable()
export class ElevatorEnergyChangedPayload {
	@property()
	public readonly currentEnergy: number = 0;

	@property()
	public readonly maxEnergy: number = 200;

	@property()
	public readonly addedAmount: number = 0;

	public constructor(currentEnergy?: number, maxEnergy?: number, addedAmount?: number) {
		const overrides: Record<string, unknown> = {};
		if (currentEnergy !== undefined) overrides.currentEnergy = currentEnergy;
		if (maxEnergy !== undefined) overrides.maxEnergy = maxEnergy;
		if (addedAmount !== undefined) overrides.addedAmount = addedAmount;
		Object.assign(this, overrides);
	}
}

/** Fired locally when elevator energy changes, for HUD subscription */
export const ElevatorEnergyChangedEvent = new LocalEvent<ElevatorEnergyChangedPayload>(
	"ElevatorEnergy_Changed",
	ElevatorEnergyChangedPayload,
);

/**
 * Payload for ElevatorEnergyFullEvent.
 */
@serializable()
export class ElevatorEnergyFullPayload {
	@property()
	public readonly dummy: number = 0;
}

/** Fired locally when elevator energy reaches maxEnergy */
export const ElevatorEnergyFullEvent = new LocalEvent<ElevatorEnergyFullPayload>(
	"ElevatorEnergy_Full",
	ElevatorEnergyFullPayload,
);
// #endregion

// #region Victory Panel Event
/**
 * Fired locally when HudPanelCharge determines the level is cleared
 * (currentEnergy >= maxEnergy) and HudPanelVictory should be shown.
 */
export const ShowVictoryPanelEvent = new LocalEvent<ElevatorEnergyFullPayload>(
	"GamePhase_ShowVictoryPanel",
	ElevatorEnergyFullPayload,
);
// #endregion

// #region Level Info Panel Event
/**
 * Fired locally after elevator doors open to show the level info panel
 * (floor number and energy requirement).
 */
export const ShowLevelInfoPanelEvent = new LocalEvent<ElevatorEnergyFullPayload>(
	"GamePhase_ShowLevelInfoPanel",
	ElevatorEnergyFullPayload,
);
// #endregion

// #region Level Info Panel Closed Event
/**
 * Fired locally when the player closes the level info panel.
 * GamePhaseManager awaits this event before continuing the initialization/transition flow.
 */
export class LevelInfoPanelClosedPayload {
	public readonly closed: boolean = true;
}

export const LevelInfoPanelClosedEvent = new LocalEvent<LevelInfoPanelClosedPayload>(
	"GamePhase_LevelInfoPanelClosed",
	LevelInfoPanelClosedPayload,
);
// #endregion

// #region Initialization Readiness Events
/**
 * Payload for EnemySpawnCompleteEvent.
 */
@serializable()
export class EnemySpawnCompletePayload {
	@property()
	public readonly complete: boolean = true;
}

/**
 * Fired by GameEnemyManager when all enemies have been spawned on this client.
 */
export const EnemySpawnCompleteEvent = new LocalEvent<EnemySpawnCompletePayload>(
	"EnemySpawnCompleteEvent",
	EnemySpawnCompletePayload,
);

/**
 * Payload for PropSpawnCompleteEvent.
 */
@serializable()
export class PropSpawnCompletePayload {
	@property()
	public readonly complete: boolean = true;
}

/**
 * Fired by PropManager when all gems have been spawned on this client.
 */
export const PropSpawnCompleteEvent = new LocalEvent<PropSpawnCompletePayload>(
	"PropSpawnCompleteEvent",
	PropSpawnCompletePayload,
);
// #endregion
