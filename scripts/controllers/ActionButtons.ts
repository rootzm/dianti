/**
 * ActionButtons - Minimal stub for character controller action button integration.
 *
 * Component Attachment: N/A (serializable payload class)
 * Component Networking: Local
 * Component Ownership: Not Networked
 *
 * Provides the ActionButtonPayload serializable class and a static registration
 * method. Replace with the full adding-action-buttons skill when ready.
 */

import type { LocalEvent } from "meta/worlds";
import {
	property,
	serializable,
} from "meta/worlds";

@serializable()
export class ActionButtonPayload {
	@property()
	public readonly state: string = "down";

	/**
	 * Registers an action button with the HUD system.
	 * This is a stub — the full implementation comes from the adding-action-buttons skill.
	 */
	public static registerAction(
		slot: string,
		label: string,
		event: LocalEvent<ActionButtonPayload>,
	): void {
		// No-op stub until adding-action-buttons skill is activated
	}
}
