/**
 * EnemyDebug - Displays real-time debug info on the DebugText child entity's Billboard component.
 *
 * Component Attachment: EnemyCharacter template root entity
 * Component Networking: Networked (server-owned)
 * Component Ownership: Server
 *
 * Server sets @property() fields (enemyName, stateLabel) which auto-replicate to clients.
 * Clients detect changes and call Billboard.setText() to update the visual display.
 *
 * Supports three detection states:
 * - "Idle" — no player in FOV range
 * - "Alert+" — player in FOV cone but occluded by obstacle
 * - "Alert" — player in FOV cone with clear line of sight
 *
 * Networking approach:
 * - @property() fields replicate from owner (server) → all clients automatically
 * - Clients run a lightweight per-frame check comparing current property values
 *   against the last-rendered text to update the Billboard only when needed.
 * - WorldTextComponent is a local visual, so each client must call setText() itself.
 */

import type { Entity, Maybe } from 'meta/worlds';
import {
	Component,
	component,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	property,
	subscribe,
} from 'meta/worlds';
import { Billboard } from './Billboard';

@component({
	description: "Displays real-time debug info (AI state, distance, position) on the DebugText Billboard entity. Server writes @property() fields; clients read them to update the visual.",
})
export class EnemyDebug extends Component {
	/** Whether the debug display is enabled. Set to true to show debug text above enemy. */
	@property()
	public showDebug: boolean = false;

	/** The enemy's display name. Set by the server; replicated to all clients. */
	@property()
	public enemyName: string = '';

	/** Current AI state label (e.g. 'Patrol', 'Chase', 'Stop'). Set by server; replicated to all clients. */
	@property()
	public stateLabel: string = 'Patrol';

	/** Current FOV detection state (e.g. 'Idle', 'Alert+', 'Alert'). Set by server; replicated to all clients. */
	@property()
	public detectionLabel: string = 'Idle';

	/** Name of the entity blocking the FOV raycast. Empty string or '—' when no occlusion. Set by server; replicated to all clients. */
	@property()
	public blockedBy: string = '—';

	private cachedBillboard: Maybe<Billboard> = null;

	/** Reference to the DebugText child entity for enabling/disabling visibility. */
	private debugTextEntity: Maybe<Entity> = null;

	/** Tracks the last text we rendered so we only call setText when it actually changes. */
	private lastRenderedText: string = '';

	@subscribe(OnEntityStartEvent, {execution: ExecuteOn.Everywhere})
	public onStart(): void {
		const debugTextEntities = this.entity.findChildrenWithName('DebugText');
		if (debugTextEntities.length > 0) {
			this.debugTextEntity = debugTextEntities[0];
			this.cachedBillboard = debugTextEntities[0].getComponent(Billboard);
		}

		// Set initial visibility of the DebugText entity based on showDebug
		if (this.debugTextEntity) {
			this.debugTextEntity.enabledSelf = this.showDebug;
		}

		// Initial render on all sides (only if debug is enabled)
		if (this.showDebug) {
			this.updateDisplay();
		}
	}

	/**
	 * Lightweight client-side check: when replicated property values differ from
	 * what was last rendered, refresh the Billboard text.
	 * Only runs on clients (WorldTextComponent is a local visual, no point updating on server).
	 */
	@subscribe(OnWorldUpdateEvent, {execution: ExecuteOn.Everywhere})
	public onUpdate(payload: OnWorldUpdateEventPayload): void {
		// Only update display on clients — server doesn't render text
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		// If debug display is disabled, hide the DebugText entity and skip
		if (!this.showDebug) {
			if (this.debugTextEntity?.enabledSelf) {
				this.debugTextEntity.enabledSelf = false;
				this.lastRenderedText = '';
			}
			return;
		}

		// Ensure DebugText entity is visible when showDebug is true
		if (this.debugTextEntity && !this.debugTextEntity.enabledSelf) {
			this.debugTextEntity.enabledSelf = true;
		}

		const currentText = this.buildDisplayText();
		if (currentText !== this.lastRenderedText) {
			this.lastRenderedText = currentText;
			this.cachedBillboard?.setText(currentText);
		}
	}

	/**
	 * Called by server-side scripts (e.g. EnemyActionController) to set the name.
	 * Writing the @property() field triggers replication to all clients.
	 */
	public setName(value: string): void {
		if (this.enemyName !== value) {
			this.enemyName = value;
		}
	}

	/**
	 * Set the AI state label (e.g. "Patrol", "Chase", "Stop").
	 * Called by server-side scripts. Writing the @property() field triggers replication.
	 */
	public setState(state: string): void {
		if (this.stateLabel !== state) {
			this.stateLabel = state;
		}
	}

	/**
	 * Set the FOV detection state label (e.g. "Idle", "Alert+", "Alert").
	 * Called by server-side scripts. Writing the @property() field triggers replication.
	 */
	public setDetection(detection: string): void {
		if (this.detectionLabel !== detection) {
			this.detectionLabel = detection;
		}
	}

	/**
	 * Set the name of the entity blocking the FOV raycast.
	 * Pass empty string or "—" when there is no occlusion.
	 * Called by server-side scripts. Writing the @property() field triggers replication.
	 */
	public setBlockedBy(entityName: string): void {
		const display = entityName || '—';
		if (this.blockedBy !== display) {
			this.blockedBy = display;
		}
	}

	/**
	 * Legacy method - kept for backward compatibility.
	 * Update the displayed detection state based on whether the enemy is detecting a player.
	 */
	public setDetecting(detecting: boolean): void {
		const newLabel = detecting ? 'Alert' : 'Idle';
		this.setDetection(newLabel);
	}

	private buildDisplayText(): string {
		let text = "";
		text += `name:${this.enemyName}\n`;
		text += `state:${this.stateLabel}\n`;
		text += `detect:${this.detectionLabel}\n`;
		text += `blocked:${this.blockedBy}`;
		return text;
	}

	private updateDisplay(): void {
		if (!this.cachedBillboard) {
			return;
		}

		const text = this.buildDisplayText();
		this.lastRenderedText = text;
		this.cachedBillboard.setText(text);
	}
}
