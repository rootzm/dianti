/**
 * SaveServer - Server-side save/load manager using PlayerVariables.
 *
 * Component Attachment: Scene Entity (e.g., ServerSystems)
 * Component Networking: Networked
 * Component Ownership: Server
 *
 * Responsibilities:
 * - Listens for save requests from clients (NetworkEvent), writes levelId and depotJson
 *   to PlayerVariables (savedLevel, savedDepot).
 * - Listens for load requests from clients (NetworkEvent), reads PlayerVariables
 *   and responds via a global NetworkEvent targeted at the requesting player.
 *
 * All PlayerVariablesService calls execute on the server only.
 */

import type { Entity, Maybe } from 'meta/worlds';
import {
	Component,
	EventService,
	ExecuteOn,
	NetworkEvent,
	NetworkingService,
	PlayerVariablesService,
	component,
	property,
	serializable,
	subscribe,
} from 'meta/worlds';

// #region Event Payloads
@serializable()
export class SaveRequestPayload {
	@property()
	public readonly player: Maybe<Entity> = null;

	@property()
	public readonly levelId: number = 0;

	@property({maxLength: 5000})
	public readonly depotJson: string = '';

	@property()
	public readonly levelTemplateIndex: number = -1;
}

@serializable()
export class SaveLoadRequestPayload {
	@property()
	public readonly player: Maybe<Entity> = null;
}

@serializable()
export class SaveLoadResponsePayload {
	@property()
	public readonly player: Maybe<Entity> = null;

	@property()
	public readonly levelId: number = 0;

	@property({maxLength: 5000})
	public readonly depotJson: string = '';

	@property()
	public readonly levelTemplateIndex: number = -1;

	@property()
	public readonly success: boolean = false;
}

@serializable()
export class SaveConfirmPayload {
	@property()
	public readonly player: Maybe<Entity> = null;

	@property()
	public readonly success: boolean = false;
}
// #endregion

@serializable()
export class SaveResetRequestPayload {
	@property()
	public readonly player: Maybe<Entity> = null;
}

// #region Event Definitions
/** Client → Server: request to persist the current level and depot state */
export const SaveRequestSaveEvent = new NetworkEvent<SaveRequestPayload>(
	'SaveSystem_RequestSave',
	SaveRequestPayload,
);

/** Client → Server: request to load the saved level and depot state */
export const SaveRequestLoadEvent = new NetworkEvent<SaveLoadRequestPayload>(
	'SaveSystem_RequestLoad',
	SaveLoadRequestPayload,
);

/** Client → Server: request to reset all saved data to defaults */
export const SaveResetRequestEvent = new NetworkEvent<SaveResetRequestPayload>(
	'SaveSystem_RequestReset',
	SaveResetRequestPayload,
);

/** Server → Client: response carrying the loaded save data */
export const SaveLoadResponseEvent = new NetworkEvent<SaveLoadResponsePayload>(
	'SaveSystem_LoadResponse',
	SaveLoadResponsePayload,
);

/** Server → Client: confirmation that save completed */
export const SaveConfirmEvent = new NetworkEvent<SaveConfirmPayload>(
	'SaveSystem_SaveConfirm',
	SaveConfirmPayload,
);
// #endregion

/** Shape of the persisted depot object stored in PlayerVariables */
interface DepotVariable {
	json?: string;
}

/**
 * @component
 * Component Attachment: Scene Entity (e.g., ServerSystems)
 * Component Networking: Networked
 * Component Ownership: Server
 */
@component({ description: 'Server-side save/load manager using PlayerVariables.' })
export class SaveServer extends Component {
	// #region Save Request Handler
	/**
	 * Handles save requests from clients.
	 * Runs on all machines but gates on isServerContext().
	 */
	@subscribe(SaveRequestSaveEvent, { execution: ExecuteOn.Everywhere })
	private async onSaveRequest(payload: SaveRequestPayload): Promise<void> {
		if (!NetworkingService.get().isServerContext()) {
			return;
		}

		const player = payload.player;
		if (player == null) {
			return;
		}

		try {
			const pvs = PlayerVariablesService.get();
			await pvs.setVariable(player, 'savedLevel', payload.levelId);
			await pvs.setVariable(player, 'savedDepot', { json: payload.depotJson });
			await pvs.setVariable(player, 'savedLevelTemplateIndex', payload.levelTemplateIndex);

			EventService.sendGlobally(SaveConfirmEvent, {
				player: player,
				success: true,
			});
		} catch (err: unknown) {
			console.log(`[SaveServer.onSaveRequest] Failed to save: ${String(err)}`);

			EventService.sendGlobally(SaveConfirmEvent, {
				player: player,
				success: false,
			});
		}
	}
	// #endregion

	// #region Load Request Handler
	/**
	 * Handles load requests from clients.
	 * Reads PlayerVariables and broadcasts a response targeted at the requesting player.
	 */
	@subscribe(SaveRequestLoadEvent, { execution: ExecuteOn.Everywhere })
	private async onLoadRequest(payload: SaveLoadRequestPayload): Promise<void> {
		if (!NetworkingService.get().isServerContext()) {
			return;
		}

		const player = payload.player;
		if (player == null) {
			return;
		}

		try {
			const pvs = PlayerVariablesService.get();
			const levelId = await pvs.fetchVariable<number>(player, 'savedLevel');
			const depotObj = await pvs.fetchVariable<object>(player, 'savedDepot');
			const levelTemplateIndex = await pvs.fetchVariable<number>(player, 'savedLevelTemplateIndex');

			const depotJson = (depotObj as DepotVariable | undefined)?.json ?? '';

			EventService.sendGlobally(SaveLoadResponseEvent, {
				player: player,
				levelId: levelId ?? 1,
				depotJson: depotJson,
				levelTemplateIndex: levelTemplateIndex ?? -1,
				success: true,
			});
		} catch (err: unknown) {
			console.log(`[SaveServer.onLoadRequest] Failed to load: ${String(err)}`);

			EventService.sendGlobally(SaveLoadResponseEvent, {
				player: player,
				levelId: 1,
				depotJson: '',
				levelTemplateIndex: -1,
				success: false,
			});
		}
	}
	// #endregion

	// #region Reset Request Handler
	/**
	 * Handles reset requests from clients.
	 * Resets PlayerVariables (savedLevel, savedDepot) to defaults and confirms.
	 */
	@subscribe(SaveResetRequestEvent, { execution: ExecuteOn.Everywhere })
	private async onResetRequest(payload: SaveResetRequestPayload): Promise<void> {
		if (!NetworkingService.get().isServerContext()) {
			return;
		}

		const player = payload.player;
		if (player == null) {
			return;
		}

		try {
			const pvs = PlayerVariablesService.get();
			await pvs.setVariable(player, 'savedLevel', 1);
			await pvs.setVariable(player, 'savedDepot', { json: '' });
			await pvs.setVariable(player, 'savedLevelTemplateIndex', -1);
			await pvs.setVariable(player, 'guideUsableItemShown', 0);

			EventService.sendGlobally(SaveConfirmEvent, {
				player: player,
				success: true,
			});
		} catch (err: unknown) {
			console.log(`[SaveServer.onResetRequest] Failed to reset: ${String(err)}`);

			EventService.sendGlobally(SaveConfirmEvent, {
				player: player,
				success: false,
			});
		}
	}
	// #endregion
}
