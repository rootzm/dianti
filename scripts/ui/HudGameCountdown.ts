/**
 * HudGameCountdown - Per-level countdown timer HUD controller and ViewModel.
 *
 * Component Attachment: Scene Entity (HudGameCountdown entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Displays a MM:SS countdown that starts when GamePhase enters Exploration.
 * When the timer reaches zero, fires AnnouncementCountdownEndEvent and applies
 * periodic penalty to the local player every 1s: drains 1 power first, then
 * 1 HP once power is depleted. The existing HudGameHurt red flash triggers
 * automatically from the damage event.
 */

import type {
	Entity,
	Maybe,
	OnWorldUpdateEventPayload,
} from "meta/worlds";
import {
	BasePlayerComponent,
	Component,
	CustomUiComponent,
	EntityService,
	EventService,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	OnPlayerCreateEvent,
	OnWorldUpdateEvent,
	UiViewModel,
	component,
	subscribe,
	uiViewModel,
} from "meta/worlds";
import type { GamePhaseChangedPayload } from "../events/GamePhaseEvents";
import {
	GamePhase,
	GamePhaseChangedEvent,
} from "../events/GamePhaseEvents";
import { AnnouncementCountdownEndEvent } from "../events/AnnouncementEvents";
import { OvertimeDamageTickEvent } from "../events/AnalyticsEvents";
import { PlayerLogic } from "../components/PlayerLogic";

// #region ViewModel
@uiViewModel()
export class HudGameCountdownViewModel extends UiViewModel {
	public textTime: string = "10:00";
}
// #endregion

// #region Controller
@component({
	description: "Per-level countdown timer HUD. Counts down during Exploration phase, drains power then HP when expired.",
})
export class HudGameCountdownController extends Component {
	// #region Constants
	private static readonly COUNTDOWN_DURATION_S: number = 600;
	private static readonly DAMAGE_INTERVAL_S: number = 1.0;
	private static readonly ZERO_PAD_THRESHOLD: number = 10;
	// #endregion

	// #region Properties
	// (No configurable properties — penalty is fixed: 1 power/tick, then 1 HP/tick)
	// #endregion

	// #region Internal State
	private viewModel: HudGameCountdownViewModel = new HudGameCountdownViewModel();
	private uiComponent: Maybe<CustomUiComponent> = null;
	private localPlayerEntity: Maybe<Entity> = null;
	private remainingTime: number = HudGameCountdownController.COUNTDOWN_DURATION_S;
	private isRunning: boolean = false;
	private isExpired: boolean = false;
	private hasFiredExpiredEvent: boolean = false;
	private damageAccumulator: number = 0;
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	private onStart(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		this.uiComponent = this.entity.getComponent(CustomUiComponent);
		if (this.uiComponent) {
			this.uiComponent.dataContext = this.viewModel;
		} else {
			console.log("[HudGameCountdownController.onStart] No CustomUiComponent found on entity");
			return;
		}

		this.localPlayerEntity = this.findLocalPlayer();
		this.updateDisplay();
	}

	@subscribe(OnPlayerCreateEvent, { execution: ExecuteOn.Everywhere })
	private onPlayerCreate(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		if (!this.localPlayerEntity) {
			this.localPlayerEntity = this.findLocalPlayer();
		}
	}
	// #endregion

	// #region Phase Subscription
	@subscribe(GamePhaseChangedEvent, { execution: ExecuteOn.Everywhere })
	private onGamePhaseChanged(payload: GamePhaseChangedPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		if (payload.newPhase === GamePhase.Exploration) {
			this.remainingTime = HudGameCountdownController.COUNTDOWN_DURATION_S;
			this.isRunning = true;
			this.isExpired = false;
			this.hasFiredExpiredEvent = false;
			this.damageAccumulator = 0;
			this.updateDisplay();
		} else {
			this.isRunning = false;
		}
	}
	// #endregion

	// #region Per-Frame Update
	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Everywhere })
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		if (!this.isRunning) {
			return;
		}

		if (!this.isExpired) {
			this.remainingTime -= payload.deltaTime;

			if (this.remainingTime <= 0) {
				this.remainingTime = 0;
				this.isExpired = true;
				this.updateDisplay();

				if (!this.hasFiredExpiredEvent) {
					this.hasFiredExpiredEvent = true;
					EventService.sendLocally(AnnouncementCountdownEndEvent, {
						dummy: 0,
					});
				}
			} else {
				this.updateDisplay();
			}
		} else {
			this.applyPeriodicDamage(payload.deltaTime);
		}
	}
	// #endregion

	// #region Damage Logic
	private applyPeriodicDamage(dt: number): void {
		this.damageAccumulator += dt;

		if (this.damageAccumulator >= HudGameCountdownController.DAMAGE_INTERVAL_S) {
			this.damageAccumulator -= HudGameCountdownController.DAMAGE_INTERVAL_S;

			if (!this.localPlayerEntity) {
				this.localPlayerEntity = this.findLocalPlayer();
			}

			if (this.localPlayerEntity) {
				const playerLogic = this.localPlayerEntity.getComponent(PlayerLogic);
				if (playerLogic) {
					// Drain power first; once depleted, drain HP
					const consumed = playerLogic.consumePower(1);
					if (!consumed) {
						playerLogic.takeDamage({ baseDamage: 1 });
					}
				}
			}

			EventService.sendLocally(OvertimeDamageTickEvent, { dummy: 0 });
		}
	}
	// #endregion

	// #region Display Helpers
	private updateDisplay(): void {
		const totalSeconds = Math.max(0, Math.floor(this.remainingTime));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		let minuteStr: string;
		if (minutes < HudGameCountdownController.ZERO_PAD_THRESHOLD) {
			minuteStr = `0${minutes}`;
		} else {
			minuteStr = `${minutes}`;
		}

		let secondStr: string;
		if (seconds < HudGameCountdownController.ZERO_PAD_THRESHOLD) {
			secondStr = `0${seconds}`;
		} else {
			secondStr = `${seconds}`;
		}

		this.viewModel.textTime = `${minuteStr}:${secondStr}`;
	}
	// #endregion

	// #region Helpers
	private findLocalPlayer(): Maybe<Entity> {
		const players = EntityService.findEntitiesWithComponent(BasePlayerComponent);
		if (players.length > 0) {
			return players[0];
		}
		return null;
	}
	// #endregion
}
// #endregion
