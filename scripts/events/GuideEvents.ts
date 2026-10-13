/**
 * GuideEvents - Event definitions for the usable-item soft guide system.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Defines NetworkEvents for server-side PlayerVariable persistence
 * and a LocalEvent for triggering the guide overlay from game logic.
 */

import type { Entity, Maybe } from "meta/worlds";
import {
	LocalEvent,
	NetworkEvent,
	property,
	serializable,
} from "meta/worlds";

// #region Payloads
@serializable()
export class GuideLoadRequestPayload {
	@property()
	public readonly player: Maybe<Entity> = null;
}

@serializable()
export class GuideLoadResponsePayload {
	@property()
	public readonly player: Maybe<Entity> = null;

	@property()
	public readonly guideUsableItemShown: number = 0;
}

@serializable()
export class GuideSaveRequestPayload {
	@property()
	public readonly player: Maybe<Entity> = null;

	@property()
	public readonly guideUsableItemShown: number = 0;
}
// #endregion

// #region Guide Waypoint Events
@serializable()
export class GuideWaypointReachedPayload {
	@property()
	public readonly waypointEntity: Maybe<Entity> = null;
}

/** Fired locally when the player reaches a guide waypoint trigger */
export const GuideWaypointReachedEvent = new LocalEvent<GuideWaypointReachedPayload>(
	"GuideSystem_WaypointReached",
	GuideWaypointReachedPayload,
);

@serializable()
export class GuideWaypointExitPayload {
	@property()
	public readonly waypointEntity: Maybe<Entity> = null;
}

/** Fired locally when the player exits a guide waypoint trigger */
export const GuideWaypointExitEvent = new LocalEvent<GuideWaypointExitPayload>(
	"GuideSystem_WaypointExit",
	GuideWaypointExitPayload,
);
// #endregion

// #region NetworkEvents
/** Client → Server: request to load guide flags */
export const GuideLoadRequestEvent = new NetworkEvent<GuideLoadRequestPayload>(
	"GuideSystem_LoadRequest",
	GuideLoadRequestPayload,
);

/** Server → Client: response carrying loaded guide flags */
export const GuideLoadResponseEvent = new NetworkEvent<GuideLoadResponsePayload>(
	"GuideSystem_LoadResponse",
	GuideLoadResponsePayload,
);

/** Client → Server: request to persist guide flags */
export const GuideSaveRequestEvent = new NetworkEvent<GuideSaveRequestPayload>(
	"GuideSystem_SaveRequest",
	GuideSaveRequestPayload,
);
// #endregion

// #region LocalEvents
@serializable()
export class GuideUsableItemTriggerPayload {
	/** The 0-indexed slot where the usable item landed */
	@property()
	public readonly slotIndex: number = 0;
}

/** Fired locally when the usable-item guide should begin (Step1) */
export const GuideUsableItemTriggerEvent = new LocalEvent<GuideUsableItemTriggerPayload>(
	"GuideSystem_UsableItemTrigger",
	GuideUsableItemTriggerPayload,
);
// #endregion
