/**
 * ElevatorEnergyEvents - Shared event definitions for the elevator energy/charging system.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Keeps events separate to avoid circular imports.
 */

import {
	LocalEvent,
	property,
	serializable,
} from "meta/worlds";

// #region Safe Zone Enter/Exit Events
@serializable()
export class ElevatorSafeZonePlayerPayload {
	/** No fields needed — just signals that local player entered/exited */
	@property()
	public readonly dummy: number = 0;
}

/** Fired locally when the LOCAL player enters the elevator safe zone */
export const ElevatorSafeZoneEnteredEvent = new LocalEvent<ElevatorSafeZonePlayerPayload>(
	"ElevatorEnergy_SafeZoneEntered",
	ElevatorSafeZonePlayerPayload,
);

/** Fired locally when the LOCAL player exits the elevator safe zone */
export const ElevatorSafeZoneExitedEvent = new LocalEvent<ElevatorSafeZonePlayerPayload>(
	"ElevatorEnergy_SafeZoneExited",
	ElevatorSafeZonePlayerPayload,
);
// #endregion

// #region Doors Fully Closed Event
/** Fired locally when the elevator doors finish their closing animation */
export const ElevatorDoorsFullyClosedEvent = new LocalEvent<ElevatorSafeZonePlayerPayload>(
	"ElevatorEnergy_DoorsFullyClosed",
	ElevatorSafeZonePlayerPayload,
);
// #endregion
