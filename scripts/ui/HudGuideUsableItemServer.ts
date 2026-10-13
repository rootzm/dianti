/**
 * HudGuideUsableItemServer - Server-side PlayerVariables handler for guide persistence.
 *
 * Component Attachment: Scene Entity (ServerSystems)
 * Component Networking: Networked
 * Component Ownership: Server
 *
 * Listens for GuideLoadRequestEvent and GuideSaveRequestEvent NetworkEvents.
 * Reads/writes the "guideUsableItemShown" PlayerVariable (NUMBER type, 0 or 1).
 */

import type {
	GuideLoadRequestPayload,
	GuideSaveRequestPayload,
} from "../events/GuideEvents";
import {
	Component,
	EventService,
	ExecuteOn,
	NetworkingService,
	PlayerVariablesService,
	component,
	subscribe,
} from "meta/worlds";
import {
	GuideLoadRequestEvent,
	GuideLoadResponseEvent,
	GuideSaveRequestEvent,
} from "../events/GuideEvents";

/**
 * @component
 * Component Attachment: Scene Entity (ServerSystems)
 * Component Networking: Networked
 * Component Ownership: Server
 */
@component()
export class HudGuideUsableItemServer extends Component {
	// #region Load Handler
	@subscribe(GuideLoadRequestEvent, { execution: ExecuteOn.Everywhere })
	private async onLoadRequest(payload: GuideLoadRequestPayload): Promise<void> {
		if (!NetworkingService.get().isServerContext()) {
			return;
		}
		const player = payload.player;
		if (player == null) {
			return;
		}
		try {
			const pvs = PlayerVariablesService.get();
			const value = await pvs.fetchVariable<number>(player, "guideUsableItemShown");
			EventService.sendGlobally(GuideLoadResponseEvent, {
				player: player,
				guideUsableItemShown: value ?? 0,
			});
		} catch (err: unknown) {
			console.log(`[HudGuideUsableItemServer.onLoadRequest] ${String(err)}`);
			EventService.sendGlobally(GuideLoadResponseEvent, {
				player: player,
				guideUsableItemShown: 0,
			});
		}
	}
	// #endregion

	// #region Save Handler
	@subscribe(GuideSaveRequestEvent, { execution: ExecuteOn.Everywhere })
	private async onSaveRequest(payload: GuideSaveRequestPayload): Promise<void> {
		if (!NetworkingService.get().isServerContext()) {
			return;
		}
		const player = payload.player;
		if (player == null) {
			return;
		}
		try {
			const pvs = PlayerVariablesService.get();
			await pvs.setVariable(player, "guideUsableItemShown", payload.guideUsableItemShown);
		} catch (err: unknown) {
			console.log(`[HudGuideUsableItemServer.onSaveRequest] ${String(err)}`);
		}
	}
	// #endregion
}
