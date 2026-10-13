/**
 * HudAnnouncementManager - Broadcast announcement system with FIFO queue.
 *
 * Component Attachment: Scene Entity (a dedicated entity with child SoundComponent entities)
 * Component Networking: Local (UI/audio is client-side only)
 * Component Ownership: Not Networked
 *
 * Subscribes to announcement events (7 channels). Manages a FIFO queue so that if multiple
 * announcements trigger simultaneously, they play one after another.
 * Each announcement displays text via HudPanelTips for 5 seconds and plays
 * the corresponding audio file simultaneously.
 *
 * HP low and Power low announcements have a per-floor flag — they only trigger
 * once per floor and reset when the game phase transitions to Exploration.
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	ExecuteOn,
	OnEntityStartEvent,
	SoundComponent,
	SoundPlayInfo,
	component,
	subscribe,
} from "meta/worlds";
import {
	AnnouncementChargeDoneEvent,
	AnnouncementCountdownEndEvent,
	AnnouncementElevatorArrivedEvent,
	AnnouncementEnergyFullEvent,
	AnnouncementEnergyInsufficientEvent,
	AnnouncementHpFullEvent,
	AnnouncementHpLowEvent,
	AnnouncementPowerFullEvent,
	AnnouncementPowerLowEvent,
} from "../events/AnnouncementEvents";
import type { AnnouncementPayload } from "../events/AnnouncementEvents";
import {
	GamePhase,
	GamePhaseChangedEvent,
} from "../events/GamePhaseEvents";
import type { GamePhaseChangedPayload } from "../events/GamePhaseEvents";
import { HudPanelTips } from "./HudPanelTips";

// #region Announcement Data
interface AnnouncementEntry {
	text: string;
	soundKey: string;
	durationMs: number;
}
// #endregion

@component({
	description: "Broadcast announcement system with FIFO queue, text display, and audio playback.",
})
export class HudAnnouncementManager extends Component {
	// #region Constants
	private static readonly DURATION_DEFAULT_MS = 4000;
	private static readonly DURATION_CHARGE_DONE_MS = 2000;
	private static readonly TEXT_ELEVATOR_ARRIVED = "电梯已到达，能源已用尽，请补充能源。Elevator arrived. Energy depleted. Please replenish energy.";
	private static readonly TEXT_HP_LOW = "警告，生命值不足，请远离危险。Warning: Low HP. Stay away from hazards.";
	private static readonly TEXT_POWER_LOW = "警告，电量已过半，请谨慎使用。Warning: Power below half. Conserve energy carefully.";
	private static readonly TEXT_ENERGY_FULL = "能源已充足，正在前往下一层。Energy fully charged. Proceeding to the next floor.";
	private static readonly TEXT_ENERGY_INSUFFICIENT = "能量不足，无法前往下一层。Insufficient Energy. Cannot proceed to the next floor.";
	private static readonly TEXT_CHARGE_DONE = "充电成功，机器能量恢复。Charging successful. Machine energy restored.";
	private static readonly TEXT_COUNTDOWN_END = "警告，等待时间过长，电梯开始汲取机器电量。Warning: Waiting time exceeded. The elevator begins siphoning power from the machine.";
	private static readonly TEXT_HP_FULL = "Health is full. Cannot use.";
	private static readonly TEXT_POWER_FULL = "Energy is full. Cannot use.";
	// #endregion

	// #region State
	private queue: AnnouncementEntry[] = [];
	private isPlaying: boolean = false;
	private hpLowFiredThisFloor: boolean = false;
	private powerLowFiredThisFloor: boolean = false;
	private cachedTips: Maybe<HudPanelTips> = null;
	private soundMap: Map<string, SoundComponent> = new Map();
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	private onStart(): void {
		this.cacheSoundComponents();
	}

	private cacheSoundComponents(): void {
		const soundNames = [
			"SfxAnnounceElevatorArrived",
			"SfxAnnounceHpLow",
			"SfxAnnouncePowerLow",
			"SfxAnnounceEnergyFull",
			"SfxAnnounceEnergyInsufficient",
			"SfxAnnounceChargeDone",
			"SfxAnnounceCountdownEnd",
		];
		for (const name of soundNames) {
			const children = this.entity.findChildrenWithName(name, true);
			if (children.length > 0) {
				const sound = children[0].getComponent(SoundComponent);
				if (sound) {
					this.soundMap.set(name, sound);
				}
			}
		}
	}

	/** Receive the HudPanelTips reference from the initialization orchestrator. */
	public setTips(tips: HudPanelTips): void {
		this.cachedTips = tips;
	}
	// #endregion

	// #region Floor Reset
	@subscribe(GamePhaseChangedEvent, { execution: ExecuteOn.Everywhere })
	private onGamePhaseChanged(payload: GamePhaseChangedPayload): void {
		if (payload.newPhase === GamePhase.Exploration) {
			this.hpLowFiredThisFloor = false;
			this.powerLowFiredThisFloor = false;
		}
	}
	// #endregion

	// #region Event Subscriptions
	@subscribe(AnnouncementElevatorArrivedEvent, { execution: ExecuteOn.Everywhere })
	private onElevatorArrived(payload: AnnouncementPayload): void {
		this.enqueue({
			text: HudAnnouncementManager.TEXT_ELEVATOR_ARRIVED,
			soundKey: "SfxAnnounceElevatorArrived",
			durationMs: HudAnnouncementManager.DURATION_DEFAULT_MS,
		});
	}

	@subscribe(AnnouncementHpLowEvent, { execution: ExecuteOn.Everywhere })
	private onHpLow(payload: AnnouncementPayload): void {
		if (this.hpLowFiredThisFloor) {
			return;
		}
		this.hpLowFiredThisFloor = true;
		this.enqueue({
			text: HudAnnouncementManager.TEXT_HP_LOW,
			soundKey: "SfxAnnounceHpLow",
			durationMs: HudAnnouncementManager.DURATION_DEFAULT_MS,
		});
	}

	@subscribe(AnnouncementPowerLowEvent, { execution: ExecuteOn.Everywhere })
	private onPowerLow(payload: AnnouncementPayload): void {
		if (this.powerLowFiredThisFloor) {
			return;
		}
		this.powerLowFiredThisFloor = true;
		this.enqueue({
			text: HudAnnouncementManager.TEXT_POWER_LOW,
			soundKey: "SfxAnnouncePowerLow",
			durationMs: HudAnnouncementManager.DURATION_DEFAULT_MS,
		});
	}

	@subscribe(AnnouncementEnergyFullEvent, { execution: ExecuteOn.Everywhere })
	private onEnergyFull(payload: AnnouncementPayload): void {
		this.enqueue({
			text: HudAnnouncementManager.TEXT_ENERGY_FULL,
			soundKey: "SfxAnnounceEnergyFull",
			durationMs: HudAnnouncementManager.DURATION_DEFAULT_MS,
		});
	}

	@subscribe(AnnouncementEnergyInsufficientEvent, { execution: ExecuteOn.Everywhere })
	private onEnergyInsufficient(payload: AnnouncementPayload): void {
		this.enqueue({
			text: HudAnnouncementManager.TEXT_ENERGY_INSUFFICIENT,
			soundKey: "SfxAnnounceEnergyInsufficient",
			durationMs: HudAnnouncementManager.DURATION_DEFAULT_MS,
		});
	}

	@subscribe(AnnouncementChargeDoneEvent, { execution: ExecuteOn.Everywhere })
	private onChargeDone(payload: AnnouncementPayload): void {
		this.enqueue({
			text: HudAnnouncementManager.TEXT_CHARGE_DONE,
			soundKey: "SfxAnnounceChargeDone",
			durationMs: HudAnnouncementManager.DURATION_CHARGE_DONE_MS,
		});
	}

	@subscribe(AnnouncementCountdownEndEvent, { execution: ExecuteOn.Everywhere })
	private onCountdownEnd(payload: AnnouncementPayload): void {
		this.enqueue({
			text: HudAnnouncementManager.TEXT_COUNTDOWN_END,
			soundKey: "SfxAnnounceCountdownEnd",
			durationMs: HudAnnouncementManager.DURATION_DEFAULT_MS,
		});
	}

	@subscribe(AnnouncementHpFullEvent, { execution: ExecuteOn.Everywhere })
	private onHpFull(payload: AnnouncementPayload): void {
		this.enqueue({
			text: HudAnnouncementManager.TEXT_HP_FULL,
			soundKey: "",
			durationMs: HudAnnouncementManager.DURATION_DEFAULT_MS,
		});
	}

	@subscribe(AnnouncementPowerFullEvent, { execution: ExecuteOn.Everywhere })
	private onPowerFull(payload: AnnouncementPayload): void {
		this.enqueue({
			text: HudAnnouncementManager.TEXT_POWER_FULL,
			soundKey: "",
			durationMs: HudAnnouncementManager.DURATION_DEFAULT_MS,
		});
	}

	// #endregion

	// #region Queue Management
	private enqueue(entry: AnnouncementEntry): void {
		this.queue.push(entry);
		if (!this.isPlaying) {
			this.processNext();
		}
	}

	private processNext(): void {
		if (this.queue.length === 0) {
			this.isPlaying = false;
			return;
		}

		this.isPlaying = true;
		const entry = this.queue.shift()!;

		// Play audio
		const sound = this.soundMap.get(entry.soundKey);
		if (sound) {
			sound.play(new SoundPlayInfo());
		}

		// Show text
		if (this.cachedTips) {
			this.cachedTips.showText(entry.text, entry.durationMs).then((): void => {
				this.processNext();
			}).catch((): void => {
				this.processNext();
			});
		} else {
			// If tips not found, still wait before processing next
			setTimeout((): void => {
				if (!this.entity.valid) return;
				this.processNext();
			}, entry.durationMs);
		}
	}
	// #endregion
}
