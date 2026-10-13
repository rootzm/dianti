/**
 * SaveClient - Client-side save/load interface.
 *
 * Component Attachment: Player Entity (PlayerCharacter template)
 * Component Networking: Networked
 * Component Ownership: Player (client-owned)
 *
 * Responsibilities:
 * - Provides `loadAsync(): Promise<SaveLoadResult>` to request and await load data.
 * - Provides `saveAsync(levelId, depotJson): Promise<boolean>` to request and await
 *   a save confirmation from the server.
 * - Internally wraps the existing NetworkEvent request/response pattern in Promises
 *   with a 30-second timeout.
 */

import type {
	SaveConfirmPayload,
	SaveLoadResponsePayload,
} from "./SaveServer";
import type { Maybe } from "meta/worlds";
import {
	Component,
	EventService,
	ExecuteOn,
	NetworkingService,
	PlayerService,
	component,
	subscribe,
} from "meta/worlds";
import {
	SaveConfirmEvent,
	SaveLoadResponseEvent,
	SaveRequestLoadEvent,
	SaveRequestSaveEvent,
	SaveResetRequestEvent,
} from "./SaveServer";

// #region Public Result Interface
export interface SaveLoadResult {
	levelId: number;
	depotJson: string;
	levelTemplateIndex: number;
	success: boolean;
}
// #endregion

/**
 * @component
 * Component Attachment: Player Entity (PlayerCharacter template)
 * Component Networking: Networked
 * Component Ownership: Player (client-owned)
 */
@component({ description: "Client-side save/load interface for the player." })
export class SaveClient extends Component {
	private static readonly TIMEOUT_MS = 30000;

	// #region Pending Promise State
	private pendingLoadResolve: Maybe<(result: SaveLoadResult) => void> = null;
	private pendingSaveResolve: Maybe<(success: boolean) => void> = null;
	// #endregion

	// #region Public API
	/**
	 * Request the server to load saved data for this player.
	 * Resolves with the loaded data or default values on timeout.
	 */
	public loadAsync(): Promise<SaveLoadResult> {
		if (NetworkingService.get().isServerContext()) {
			return Promise.resolve({
				levelId: 1,
				depotJson: "",
				levelTemplateIndex: -1,
				success: false,
			});
		}

		const localPlayer = PlayerService.get().getLocalPlayer();
		if (localPlayer == null) {
			return Promise.resolve({
				levelId: 1,
				depotJson: "",
				levelTemplateIndex: -1,
				success: false,
			});
		}

		return new Promise<SaveLoadResult>((resolve: (result: SaveLoadResult) => void): void => {
			this.pendingLoadResolve = resolve;

			const timeoutId = setTimeout((): void => {
				if (!this.entity.valid) return;
				if (this.pendingLoadResolve === resolve) {
					this.pendingLoadResolve = null;
					resolve({
						levelId: 1,
						depotJson: "",
						levelTemplateIndex: -1,
						success: false,
					});
				}
			}, SaveClient.TIMEOUT_MS);

			const originalResolve = resolve;
			this.pendingLoadResolve = (result: SaveLoadResult): void => {
				clearTimeout(timeoutId);
				this.pendingLoadResolve = null;
				originalResolve(result);
			};

			EventService.sendGlobally(SaveRequestLoadEvent, {
				player: localPlayer,
			});
		});
	}

	/**
	 * Request the server to persist the given level and depot state.
	 * Resolves with true if the server confirms success, false on failure or timeout.
	 */
	public saveAsync(levelId: number, depotJson: string, levelTemplateIndex: number = -1): Promise<boolean> {
		if (NetworkingService.get().isServerContext()) {
			return Promise.resolve(false);
		}

		const localPlayer = PlayerService.get().getLocalPlayer();
		if (localPlayer == null) {
			return Promise.resolve(false);
		}

		return new Promise<boolean>((resolve: (success: boolean) => void): void => {
			this.pendingSaveResolve = resolve;

			const timeoutId = setTimeout((): void => {
				if (!this.entity.valid) return;
				if (this.pendingSaveResolve === resolve) {
					this.pendingSaveResolve = null;
					resolve(false);
				}
			}, SaveClient.TIMEOUT_MS);

			const originalResolve = resolve;
			this.pendingSaveResolve = (success: boolean): void => {
				clearTimeout(timeoutId);
				this.pendingSaveResolve = null;
				originalResolve(success);
			};

			EventService.sendGlobally(SaveRequestSaveEvent, {
				player: localPlayer,
				levelId: levelId,
				depotJson: depotJson,
				levelTemplateIndex: levelTemplateIndex,
			});
		});
	}

	/**
	 * Request the server to reset all saved data to defaults (savedLevel=0, savedDepot='').
	 * Resolves with true if the server confirms success, false on failure or timeout.
	 */
	public resetAsync(): Promise<boolean> {
		if (NetworkingService.get().isServerContext()) {
			return Promise.resolve(false);
		}

		const localPlayer = PlayerService.get().getLocalPlayer();
		if (localPlayer == null) {
			return Promise.resolve(false);
		}

		return new Promise<boolean>((resolve: (success: boolean) => void): void => {
			this.pendingSaveResolve = resolve;

			const timeoutId = setTimeout((): void => {
				if (!this.entity.valid) return;
				if (this.pendingSaveResolve === resolve) {
					this.pendingSaveResolve = null;
					resolve(false);
				}
			}, SaveClient.TIMEOUT_MS);

			const originalResolve = resolve;
			this.pendingSaveResolve = (success: boolean): void => {
				clearTimeout(timeoutId);
				this.pendingSaveResolve = null;
				originalResolve(success);
			};

			EventService.sendGlobally(SaveResetRequestEvent, {
				player: localPlayer,
			});
		});
	}
	// #endregion

	// #region Response Handlers
	@subscribe(SaveLoadResponseEvent, { execution: ExecuteOn.Everywhere })
	private onLoadResponse(payload: SaveLoadResponsePayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		const targetPlayer = payload.player;
		if (targetPlayer == null) {
			return;
		}
		if (!PlayerService.get().isLocalPlayer(targetPlayer)) {
			return;
		}

		if (this.pendingLoadResolve != null) {
			this.pendingLoadResolve({
				levelId: payload.levelId,
				depotJson: payload.depotJson,
				levelTemplateIndex: payload.levelTemplateIndex,
				success: payload.success,
			});
		}
	}

	@subscribe(SaveConfirmEvent, { execution: ExecuteOn.Everywhere })
	private onSaveConfirm(payload: SaveConfirmPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		const targetPlayer = payload.player;
		if (targetPlayer == null) {
			return;
		}
		if (!PlayerService.get().isLocalPlayer(targetPlayer)) {
			return;
		}

		if (this.pendingSaveResolve != null) {
			this.pendingSaveResolve(payload.success);
		}
	}
	// #endregion
}
