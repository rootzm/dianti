/**
 * DepotEvents - Shared event definitions for the depot panel system.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Extracted from HudPanelDepot.ts to avoid circular imports.
 */

import {
	LocalEvent,
	serializable,
} from "meta/worlds";

@serializable()
export class DepotPanelToggleRequestPayload {}
export const DepotPanelToggleRequestEvent = new LocalEvent<DepotPanelToggleRequestPayload>(
	"DepotPanelUI_ToggleRequest",
	DepotPanelToggleRequestPayload,
);
