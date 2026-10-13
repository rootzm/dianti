/**
 * AnnouncementEvents - LocalEvent definitions for the broadcast announcement system.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * All events are LocalEvents — announcements are client-local UI/audio effects.
 */

import {
	LocalEvent,
	property,
	serializable,
} from "meta/worlds";

// #region Payload
@serializable()
export class AnnouncementPayload {
	@property()
	public readonly dummy: number = 0;
}
// #endregion

// #region Announcement Events
/** Fired after elevator arrives on a new floor and doors open. */
export const AnnouncementElevatorArrivedEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_ElevatorArrived",
	AnnouncementPayload,
);

/** Fired when player HP drops to ≤50% of max (once per floor). */
export const AnnouncementHpLowEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_HpLow",
	AnnouncementPayload,
);

/** Fired when player power drops to ≤50% of max (once per floor). */
export const AnnouncementPowerLowEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_PowerLow",
	AnnouncementPayload,
);

/** Fired when player enters elevator commit zone and energy IS full. */
export const AnnouncementEnergyFullEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_EnergyFull",
	AnnouncementPayload,
);

/** Fired when player enters elevator commit zone and energy is NOT full. */
export const AnnouncementEnergyInsufficientEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_EnergyInsufficient",
	AnnouncementPayload,
);

/** Fired when a charging item successfully restores power. */
export const AnnouncementChargeDoneEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_ChargeDone",
	AnnouncementPayload,
);

/** Fired when countdown timer reaches zero. */
export const AnnouncementCountdownEndEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_CountdownEnd",
	AnnouncementPayload,
);

/** [TEST] Fired when player manually turns off the flashlight. */
export const AnnouncementFlashlightOffEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_FlashlightOff",
	AnnouncementPayload,
);

/** Fired when player tries to use HP item but health is already full. */
export const AnnouncementHpFullEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_HpFull",
	AnnouncementPayload,
);

/** Fired when player tries to use Power item but power is already full. */
export const AnnouncementPowerFullEvent = new LocalEvent<AnnouncementPayload>(
	"Announcement_PowerFull",
	AnnouncementPayload,
);
// #endregion
