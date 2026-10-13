/**
 * CutsceneEvents - Events for the cutscene animation system.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Defines the CutsceneFinishedEvent, fired locally when the cutscene
 * completes naturally or is skipped by the player.
 */

import { LocalEvent } from "meta/worlds";

// ── Cutscene-active flag ─────────────────────────────────────────────
// Module-scoped boolean. Audio scripts import and read this to skip
// playback while a cutscene is running. Only mutated by HudCutscene on
// the client; read by client-side audio guards.
let _cutscenePlaying = false;

/** Returns true while a cutscene is actively playing. */
export function isCutscenePlaying(): boolean {
	return _cutscenePlaying;
}

/** Called by HudCutscene only. Sets the cutscene-active flag. */
export function setCutscenePlaying(value: boolean): void {
	_cutscenePlaying = value;
}

/**
 * Payload for CutsceneFinishedEvent.
 */
export class CutsceneFinishedPayload {
	public readonly finished: boolean = true;
}

/**
 * Fired locally when the cutscene finishes (either completed or skipped).
 * GamePhaseManager subscribes to this to continue the initialization flow.
 */
export const CutsceneFinishedEvent = new LocalEvent<CutsceneFinishedPayload>(
	"Cutscene_Finished",
	CutsceneFinishedPayload,
);
