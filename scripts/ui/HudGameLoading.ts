import type {
	Maybe,
	OnWorldUpdateEventPayload,
} from "meta/worlds";
import {
	Component,
	CustomUiComponent,
	ExecuteOn,
	NetworkingService,
	OnEntityCreateEvent,
	OnWorldUpdateEvent,
	Visibility,
	component,
	subscribe
} from "meta/worlds";
import { HudGameLoadingViewModel } from "../../generated/view_models/HudGameLoadingViewModel";

export enum LoadingState {
	Idle = 0,
	AutoFill = 1,
	Finishing = 2,
}

/**
 * HudGameLoading - Controls the loading screen UI and fake progress display.
 *
 * Component Attachment: Scene Entity (World/Hud/HudGameLoading)
 * Component Networking: Local
 * Component Ownership: Not Networked
 *
 * Implements a fake progress bar that auto-fills to a random target (70-90)
 * over 180 seconds, then quickly finishes to 100 over 0.3s when hide() is called.
 */
@component()
export class HudGameLoading extends Component {
	// #region Constants
	private static readonly FILL_DURATION_S: number = 180;
	private static readonly FINISH_DURATION_S: number = 0.3;
	private static readonly TARGET_MIN: number = 70;
	private static readonly TARGET_RANGE: number = 20;
	// #endregion

	private viewModel: HudGameLoadingViewModel = new HudGameLoadingViewModel();
	private uiComponent: Maybe<CustomUiComponent> = null;

	// #region State
	private state: LoadingState = LoadingState.Idle;
	private elapsedTime: number = 0;
	private currentProgress: number = 0;
	private targetProgress: number = 80;
	private finishStartProgress: number = 0;
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityCreateEvent, {
		execution: ExecuteOn.Everywhere,
	})
	private onCreate(): void {
		this.uiComponent = this.entity.getComponent(CustomUiComponent);
		if (this.uiComponent) {
			this.uiComponent.dataContext = this.viewModel;
		}

		this.viewModel.showProgress = Visibility.Collapsed;
		this.viewModel.progress = 0;
		this.viewModel.textProgress = "0%";
		this.viewModel.textVersion = "V93";
	}
	// #endregion

	// #region Update
	@subscribe(OnWorldUpdateEvent, {
		execution: ExecuteOn.Everywhere,
	})
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		if (this.state === LoadingState.Idle) {
			return;
		}

		if (this.state === LoadingState.AutoFill) {
			this.updateAutoFill(payload.deltaTime);
		} else if (this.state === LoadingState.Finishing) {
			this.updateFinishing(payload.deltaTime);
		}
	}
	// #endregion

	// #region Public Methods
	/** Shows the loading screen and starts the fake progress auto-fill. */
	public show(): void {
		if (this.uiComponent) {
			this.uiComponent.isVisible = true;
		}

		this.currentProgress = 0;
		this.elapsedTime = 0;
		this.targetProgress = HudGameLoading.TARGET_MIN + Math.random() * HudGameLoading.TARGET_RANGE;
		this.state = LoadingState.AutoFill;

		this.viewModel.showProgress = Visibility.Visible;
		this.applyProgress(0);
	}

	/** Triggers the finish phase: fills to 100 over 0.3s then hides UI. */
	public hide(): void {
		if (this.state === LoadingState.Finishing) {
			return;
		}

		this.finishStartProgress = this.currentProgress;
		this.elapsedTime = 0;
		this.state = LoadingState.Finishing;
	}
	// #endregion

	// #region Private Methods
	private updateAutoFill(deltaTime: number): void {
		this.elapsedTime += deltaTime;

		const ratio: number = Math.min(1, this.elapsedTime / HudGameLoading.FILL_DURATION_S);
		this.currentProgress = ratio * this.targetProgress;

		this.applyProgress(this.currentProgress);

		if (this.elapsedTime >= HudGameLoading.FILL_DURATION_S) {
			this.currentProgress = this.targetProgress;
			this.state = LoadingState.Idle;
		}
	}

	private updateFinishing(deltaTime: number): void {
		this.elapsedTime += deltaTime;

		const t: number = Math.min(1, this.elapsedTime / HudGameLoading.FINISH_DURATION_S);
		this.currentProgress = this.finishStartProgress + (100 - this.finishStartProgress) * t;

		this.applyProgress(this.currentProgress);

		if (t >= 1) {
			this.state = LoadingState.Idle;
			this.viewModel.showProgress = Visibility.Collapsed;

			if (this.uiComponent) {
				this.uiComponent.isVisible = false;
			}
		}
	}

	private applyProgress(value: number): void {
		this.viewModel.progress = value;
		this.viewModel.textProgress = `${Math.floor(value)}%`;
	}
	// #endregion
}
