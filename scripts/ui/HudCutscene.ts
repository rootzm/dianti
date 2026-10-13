/**
 * HudCutscene - Controller for the cutscene overlay UI.
 *
 * Component Attachment: Scene Entity (HudCutscene entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Plays a timed sequence of 7 images with fade-in/hold/fade-out transitions,
 * accompanied by background audio. Provides a skip button to end early.
 * Fires CutsceneFinishedEvent when done (either completed or skipped).
 */

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
	SoundComponent,
	SoundPlayInfo,
	component,
	subscribe,
} from "meta/worlds";
import {
	HudCutsceneViewModel,
	OnClickBtnSkipEvent,
} from "./HudCutsceneViewModel";
import { CutsceneFinishedEvent, setCutscenePlaying } from "../events/CutsceneEvents";
import { GameAudio } from "../game/GameAudio";

// #region Timeline Data
/**
 * Timeline entry for a single cutscene image.
 * All times are in seconds.
 */
interface CutsceneKeyframe {
	readonly fadeInStart: number;
	readonly fadeInEnd: number;
	readonly holdEnd: number;
	readonly fadeOutEnd: number;
}

/**
 * Hardcoded timeline data for the 7 cutscene images.
 * Image 7 has instant show (fadeInStart === fadeInEnd).
 */
const TIMELINE: readonly CutsceneKeyframe[] = [
	{ fadeInStart: 0,     fadeInEnd: 0.67,  holdEnd: 7.4,   fadeOutEnd: 8.5   },
	{ fadeInStart: 8.5,   fadeInEnd: 9.17,  holdEnd: 14.9,  fadeOutEnd: 15.57 },
	{ fadeInStart: 15.57, fadeInEnd: 15.97, holdEnd: 21.2,  fadeOutEnd: 21.87 },
	{ fadeInStart: 21.87, fadeInEnd: 22.53, holdEnd: 29.43, fadeOutEnd: 30.1  },
	{ fadeInStart: 30.1,  fadeInEnd: 30.7,  holdEnd: 36.63, fadeOutEnd: 37.37 },
	{ fadeInStart: 37.37, fadeInEnd: 37.77, holdEnd: 41.97, fadeOutEnd: 42.67 },
	{ fadeInStart: 42.67, fadeInEnd: 42.67, holdEnd: 45.07, fadeOutEnd: 45.73 },
];

/** Total cutscene duration in seconds */
const TOTAL_DURATION = 45.73;

/** BGM fade-out duration when skipping (seconds) */
const BGM_FADE_OUT = 0.5;
// #endregion

@component({ description: "Controller for the cutscene overlay displaying 7 timed images with skip" })
export class HudCutscene extends Component {
	private viewModel = new HudCutsceneViewModel();
	private uiComponent: Maybe<CustomUiComponent> = null;
	private bgmSound: Maybe<SoundComponent> = null;

	/** Whether the cutscene is currently playing */
	private playing = false;

	/** Elapsed time since cutscene started (seconds) */
	private elapsed = 0;

	/** Resolver for the waitForFinish() Promise */
	private finishResolver: (() => void) | null = null;

	// #region Lifecycle
	@subscribe(OnEntityCreateEvent, { execution: ExecuteOn.Everywhere })
	private onCreate(): void {
		this.uiComponent = this.entity.getComponent(CustomUiComponent);
		if (this.uiComponent) {
			this.uiComponent.dataContext = this.viewModel;
			this.uiComponent.isVisible = false;
		}

		// Find the CutsceneBgm child entity with SoundComponent
		const bgmChildren = this.entity.findChildrenWithName("CutsceneBgm");
		if (bgmChildren.length > 0) {
			this.bgmSound = bgmChildren[0].getComponent(SoundComponent);
		}
	}
	// #endregion

	// #region Public API
	/**
	 * Start the cutscene playback. Shows UI, resets timeline, plays BGM.
	 */
	public playCutscene(): void {
		if (this.playing) {
			return;
		}

		console.log("[HudCutscene] playCutscene: starting cutscene");

		this.playing = true;
		this.elapsed = 0;

		// Mute all non-cutscene audio
		setCutscenePlaying(true);
		GameAudio.stopRandomAmbient();
		console.log("[HudCutscene] playCutscene: muted non-cutscene audio");

		// Reset all opacities to 0
		this.resetOpacities();

		// Show UI
		if (this.uiComponent) {
			this.uiComponent.isVisible = true;
		}

		// Play BGM
		if (this.bgmSound) {
			this.bgmSound.play(new SoundPlayInfo());
		}
	}

	/**
	 * Returns a Promise that resolves when the cutscene finishes
	 * (either by completing or being skipped).
	 * If no cutscene UI entity is found, resolves immediately.
	 */
	public waitForFinish(): Promise<void> {
		if (!this.playing) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve): void => {
			this.finishResolver = resolve;
		});
	}
	// #endregion

	// #region Update Loop
	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Everywhere })
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (!this.playing) {
			return;
		}

		// Only run on client
		if (NetworkingService.get().isServerContext()) {
			return;
		}

		this.elapsed += payload.deltaTime;

		// Update opacities for each image based on elapsed time
		this.updateOpacity(0, TIMELINE[0]);
		this.updateOpacity(1, TIMELINE[1]);
		this.updateOpacity(2, TIMELINE[2]);
		this.updateOpacity(3, TIMELINE[3]);
		this.updateOpacity(4, TIMELINE[4]);
		this.updateOpacity(5, TIMELINE[5]);
		this.updateOpacity(6, TIMELINE[6]);

		// Check if cutscene completed naturally
		if (this.elapsed >= TOTAL_DURATION) {
			console.log("[HudCutscene] onUpdate: cutscene completed naturally");
			this.finishCutscene();
		}
	}
	// #endregion

	// #region Skip Button
	@subscribe(OnClickBtnSkipEvent)
	private onClickSkip(): void {
		if (!this.playing) {
			return;
		}

		console.log("[HudCutscene] onClickSkip: player skipped cutscene");
		this.finishCutscene();
	}
	// #endregion

	// #region Cutscene Finished
	@subscribe(CutsceneFinishedEvent, { execution: ExecuteOn.Everywhere })
	private onCutsceneFinished(): void {
		if (this.finishResolver) {
			const resolve = this.finishResolver;
			this.finishResolver = null;
			resolve();
		}
	}
	// #endregion

	// #region Private Helpers
	/**
	 * End the cutscene: stop BGM, hide UI, fire finished event.
	 */
	private finishCutscene(): void {
		if (!this.playing) {
			return;
		}

		this.playing = false;

		// Restore non-cutscene audio
		setCutscenePlaying(false);
		GameAudio.startRandomAmbient();
		console.log("[HudCutscene] finishCutscene: restored non-cutscene audio");

		// Stop BGM with fade-out
		if (this.bgmSound) {
			this.bgmSound.stop(BGM_FADE_OUT);
		}

		// Reset opacities and hide UI
		this.resetOpacities();
		if (this.uiComponent) {
			this.uiComponent.isVisible = false;
		}

		// Fire finished event so GamePhaseManager can continue
		this.sendEventLocally(CutsceneFinishedEvent, { finished: true });
	}

	/**
	 * Calculate and set opacity for a single image based on current elapsed time.
	 * @param index 0-based image index (0-6)
	 * @param kf The keyframe data for this image
	 */
	private updateOpacity(index: number, kf: CutsceneKeyframe): void {
		const t = this.elapsed;
		let opacity = 0;

		if (t < kf.fadeInStart) {
			// Before this image starts
			opacity = 0;
		} else if (t < kf.fadeInEnd) {
			// Fade in phase
			const fadeInDuration = kf.fadeInEnd - kf.fadeInStart;
			if (fadeInDuration <= 0) {
				// Instant show (image 7)
				opacity = 1;
			} else {
				opacity = (t - kf.fadeInStart) / fadeInDuration;
			}
		} else if (t < kf.holdEnd) {
			// Hold phase
			opacity = 1;
		} else if (t < kf.fadeOutEnd) {
			// Fade out phase
			const fadeOutDuration = kf.fadeOutEnd - kf.holdEnd;
			if (fadeOutDuration <= 0) {
				opacity = 0;
			} else {
				opacity = 1 - (t - kf.holdEnd) / fadeOutDuration;
			}
		} else {
			// After this image ends
			opacity = 0;
		}

		// Clamp to [0, 1]
		opacity = Math.max(0, Math.min(1, opacity));

		this.setOpacity(index, opacity);
	}

	/**
	 * Set the opacity of a specific image in the ViewModel.
	 * @param index 0-based image index (0-6)
	 * @param value Opacity value 0-1
	 */
	private setOpacity(index: number, value: number): void {
		switch (index) {
			case 0: this.viewModel.opacity1 = value; break;
			case 1: this.viewModel.opacity2 = value; break;
			case 2: this.viewModel.opacity3 = value; break;
			case 3: this.viewModel.opacity4 = value; break;
			case 4: this.viewModel.opacity5 = value; break;
			case 5: this.viewModel.opacity6 = value; break;
			case 6: this.viewModel.opacity7 = value; break;
			default: break;
		}
	}

	/** Reset all image opacities to 0 */
	private resetOpacities(): void {
		this.viewModel.opacity1 = 0;
		this.viewModel.opacity2 = 0;
		this.viewModel.opacity3 = 0;
		this.viewModel.opacity4 = 0;
		this.viewModel.opacity5 = 0;
		this.viewModel.opacity6 = 0;
		this.viewModel.opacity7 = 0;
	}
	// #endregion
}
