/**
 * AnalyticsManager - Comprehensive in-world analytics using InWorldAnalyticsService.
 *
 * Component Attachment: Scene Entity (Systems entity in space.hstf)
 * Component Networking: Local (analytics are client-side only)
 * Component Ownership: Not Networked
 *
 * Subscribes to existing game events and instruments level funnel segments,
 * core action metrics, high-frequency counters, and countdown/penalty tracking.
 * Does NOT modify gameplay — purely observational.
 */

import type {
	Maybe,
} from "meta/worlds";
import {
	Component,
	EventService,
	ExecuteOn,
	InWorldAnalyticsService,
	NetworkingService,
	OnEntityStartEvent,
	Service,
	component,
	property,
	subscribe,
} from "meta/worlds";
import type { GamePhaseChangedPayload } from "../events/GamePhaseEvents";
import {
	GamePhase,
	GamePhaseChangedEvent,
	LevelResetEvent,
	LevelTransitionRequestEvent,
} from "../events/GamePhaseEvents";
import type { LevelResetPayload, LevelTransitionRequestPayload } from "../events/GamePhaseEvents";
import { PlayerDeathEvent } from "../events/HealthEvents";
import type { PlayerDeathEventPayload } from "../events/HealthEvents";
import { PropPickedUpEvent } from "../events/PropEvents";
import type { PropPickedUpPayload } from "../events/PropEvents";
import { DoorStateChangedEvent } from "../events/DoorEvents";
import type { DoorStateChangedPayload } from "../events/DoorEvents";
import { AnnouncementCountdownEndEvent } from "../events/AnnouncementEvents";
import type { AnnouncementPayload } from "../events/AnnouncementEvents";
import { ElevatorEnergyFullEvent } from "../events/GamePhaseEvents";
import type { ElevatorEnergyFullPayload } from "../events/GamePhaseEvents";
import { EnemyFrozenEvent } from "../events/AnalyticsEvents";
import type { EnemyFrozenEventPayload } from "../events/AnalyticsEvents";
import { OvertimeDamageTickEvent } from "../events/AnalyticsEvents";
import type { OvertimeDamageTickEventPayload } from "../events/AnalyticsEvents";

// Counter names (constants to avoid typos)
const COUNTER_ENEMY_FROZEN = "enemy_frozen";
const COUNTER_PROP_PICKUP = "prop_pickup";
const COUNTER_DOOR_INTERACT = "door_interact";
const COUNTER_OVERTIME_DAMAGE = "overtime_damage_taken";

@component({
	description: "Comprehensive in-world analytics. Subscribes to game events and instruments segments, metrics, and counters via InWorldAnalyticsService.",
})
export class AnalyticsManager extends Component {
	// #region Properties
	/** Enable analytics debug mode (logs segment/event/counter calls to console). */
	@property({ isNetworked: false })
	public enableDebug: boolean = true;
	// #endregion

	// #region Internal State
	private analytics: Maybe<InWorldAnalyticsService> = null;
	private currentLevelId: number = 0;
	private segmentOpen: boolean = false;
	private countersCreated: boolean = false;
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	private onStart(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		this.analytics = Service.get(InWorldAnalyticsService);
		if (this.analytics) {
			this.analytics.debug = this.enableDebug;
			console.log("[AnalyticsManager] Initialized. Debug=" + String(this.enableDebug));
		} else {
			console.log("[AnalyticsManager] WARNING: InWorldAnalyticsService not available");
		}
	}
	// #endregion

	// #region Counter Initialization (lazy, first use)
	private ensureCountersCreated(): void {
		if (this.countersCreated || !this.analytics) {
			return;
		}
		this.analytics.createEventCounter(COUNTER_ENEMY_FROZEN, { manualFlush: true });
		this.analytics.createEventCounter(COUNTER_PROP_PICKUP, { manualFlush: true });
		this.analytics.createEventCounter(COUNTER_DOOR_INTERACT, { manualFlush: true });
		this.analytics.createEventCounter(COUNTER_OVERTIME_DAMAGE, { manualFlush: true });
		this.countersCreated = true;
		console.log("[AnalyticsManager] Event counters created");
	}
	// #endregion

	// #region Plan A — Level Funnel Segments
	@subscribe(GamePhaseChangedEvent, { execution: ExecuteOn.Everywhere })
	private onGamePhaseChanged(payload: GamePhaseChangedPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		if (payload.newPhase === GamePhase.Exploration) {
			// Open a new level segment
			this.ensureCountersCreated();
			const segName = "gameplay|level_" + String(this.currentLevelId);
			this.analytics.openSegment(segName);
			this.segmentOpen = true;
			console.log("[AnalyticsManager] Segment opened: " + segName);
		} else if (payload.newPhase === GamePhase.Settlement) {
			// Level completed successfully — close the segment
			this.flushAndCloseSegment();
		}
	}

	@subscribe(PlayerDeathEvent, { execution: ExecuteOn.Everywhere })
	private onPlayerDeath(_payload: PlayerDeathEventPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		// Plan B — core metric
		this.analytics.sendEvent("player_death", this.currentLevelId);
		console.log("[AnalyticsManager] sendEvent: player_death, level=" + String(this.currentLevelId));

		// Plan A — close the segment on death
		this.flushAndCloseSegment();
	}

	@subscribe(LevelResetEvent, { execution: ExecuteOn.Everywhere })
	private onLevelReset(payload: LevelResetPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		// Plan B — core metric
		this.analytics.sendEvent("game_restart", this.currentLevelId);
		console.log("[AnalyticsManager] sendEvent: game_restart, level=" + String(this.currentLevelId));

		// Plan A — close any open segment
		this.flushAndCloseSegment();

		// Update current level for next segment
		this.currentLevelId = payload.newLevelIndex;
	}
	// #endregion

	// #region Plan B — Core Action Metrics
	@subscribe(LevelTransitionRequestEvent, { execution: ExecuteOn.Everywhere })
	private onLevelTransitionRequest(_payload: LevelTransitionRequestPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		this.analytics.sendEvent("level_complete", this.currentLevelId);
		console.log("[AnalyticsManager] sendEvent: level_complete, level=" + String(this.currentLevelId));
	}

	@subscribe(ElevatorEnergyFullEvent, { execution: ExecuteOn.Everywhere })
	private onEnergyFull(_payload: ElevatorEnergyFullPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		this.analytics.sendEvent("energy_submit", this.currentLevelId);
		console.log("[AnalyticsManager] sendEvent: energy_submit, level=" + String(this.currentLevelId));
	}
	// #endregion

	// #region Plan C — High-Frequency Counters
	@subscribe(EnemyFrozenEvent, { execution: ExecuteOn.Everywhere })
	private onEnemyFrozen(_payload: EnemyFrozenEventPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		this.ensureCountersCreated();
		this.analytics.incrementEventCounter(COUNTER_ENEMY_FROZEN, 1);
	}

	@subscribe(PropPickedUpEvent, { execution: ExecuteOn.Everywhere })
	private onPropPickedUp(_payload: PropPickedUpPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		this.ensureCountersCreated();
		this.analytics.incrementEventCounter(COUNTER_PROP_PICKUP, 1);
	}

	@subscribe(DoorStateChangedEvent, { execution: ExecuteOn.Everywhere })
	private onDoorStateChanged(_payload: DoorStateChangedPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		this.ensureCountersCreated();
		this.analytics.incrementEventCounter(COUNTER_DOOR_INTERACT, 1);
	}
	// #endregion

	// #region Plan D — Countdown & Penalty
	@subscribe(AnnouncementCountdownEndEvent, { execution: ExecuteOn.Everywhere })
	private onCountdownEnd(_payload: AnnouncementPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		this.analytics.sendEvent("countdown_expired", this.currentLevelId);
		console.log("[AnalyticsManager] sendEvent: countdown_expired, level=" + String(this.currentLevelId));
	}

	@subscribe(OvertimeDamageTickEvent, { execution: ExecuteOn.Everywhere })
	private onOvertimeDamageTick(_payload: OvertimeDamageTickEventPayload): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		this.ensureCountersCreated();
		this.analytics.incrementEventCounter(COUNTER_OVERTIME_DAMAGE, 1);
	}
	// #endregion

	// #region Helpers
	/**
	 * Flush all counters and close the current gameplay segment.
	 * Flush BEFORE close per API best practices.
	 */
	private flushAndCloseSegment(): void {
		if (!this.analytics || !this.segmentOpen) {
			return;
		}

		// Flush all counters before closing
		this.analytics.sendEventCounter(COUNTER_ENEMY_FROZEN);
		this.analytics.sendEventCounter(COUNTER_PROP_PICKUP);
		this.analytics.sendEventCounter(COUNTER_DOOR_INTERACT);
		this.analytics.sendEventCounter(COUNTER_OVERTIME_DAMAGE);

		const segName = "gameplay|level_" + String(this.currentLevelId);
		this.analytics.closeSegment(segName);
		this.segmentOpen = false;
		console.log("[AnalyticsManager] Segment closed: " + segName);
	}

	/**
	 * Safety net: close all open segments on destroy to prevent data loss.
	 */
	public onDestroy(): void {
		if (NetworkingService.get().isServerContext() || !this.analytics) {
			return;
		}

		if (this.segmentOpen) {
			this.flushAndCloseSegment();
		}
		this.analytics.closeAllOpenSegments();
		console.log("[AnalyticsManager] onDestroy: all segments closed");
	}
	// #endregion
}
