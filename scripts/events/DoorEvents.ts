/**
 * DoorEvents - Shared event definitions for the door system.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	LocalEvent,
	property,
	serializable,
} from "meta/worlds";

// #region Door State Enum
/** Door state machine states. */
export enum DoorState {
	Closed = 0,
	Open = 1,
	Broken = 2,
}
// #endregion

// #region Event Payloads
@serializable()
export class DoorStateChangedPayload {
	@property()
	public readonly doorEntity: Maybe<Entity> = null;

	@property()
	public readonly newState: DoorState = DoorState.Closed;

	constructor(doorEntity?: Entity, newState?: DoorState) {
		const overrides: Record<string, unknown> = {};
		if (doorEntity !== undefined) {
			overrides.doorEntity = doorEntity;
		}
		if (newState !== undefined) {
			overrides.newState = newState;
		}
		Object.assign(this, overrides);
	}
}

@serializable()
export class DoorDamagedPayload {
	@property()
	public readonly doorEntity: Maybe<Entity> = null;

	@property()
	public readonly currentHp: number = 0;

	@property()
	public readonly maxHp: number = 80;

	constructor(doorEntity?: Entity, currentHp?: number, maxHp?: number) {
		const overrides: Record<string, unknown> = {};
		if (doorEntity !== undefined) {
			overrides.doorEntity = doorEntity;
		}
		if (currentHp !== undefined) {
			overrides.currentHp = currentHp;
		}
		if (maxHp !== undefined) {
			overrides.maxHp = maxHp;
		}
		Object.assign(this, overrides);
	}
}
// #endregion

// #region Events
/** Fired locally when a door changes state (Open/Closed/Broken). */
export const DoorStateChangedEvent = new LocalEvent<DoorStateChangedPayload>(
	"DoorSystem_StateChanged",
	DoorStateChangedPayload,
);

/** Fired locally when a door takes damage. */
export const DoorDamagedEvent = new LocalEvent<DoorDamagedPayload>(
	"DoorSystem_Damaged",
	DoorDamagedPayload,
);
// #endregion
