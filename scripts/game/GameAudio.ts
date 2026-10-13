/**
 * GameAudio - Component for playing common UI sound effects and ambient env SFX.
 *
 * Component Attachment: Scene Entity (Audio)
 * Component Networking: Local
 * Component Ownership: Not Networked
 *
 * Finds child sound entities (e.g. SfxBtnClick, SfxEnv*) on start and caches
 * their SoundComponents. Exposes a static singleton so external code can still
 * call GameAudio.playClick() without any changes.
 *
 * Every 10 seconds a random SfxEnv* sound is played on the client.
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	ExecuteOn,
	NetworkingService,
	OnEntityDestroyEvent,
	OnEntityStartEvent,
	SoundComponent,
	SoundPlayInfo,
	component,
	subscribe,
} from "meta/worlds";

const ENV_SFX_INTERVAL_MS = 10_000;

@component()
export class GameAudio extends Component {
	private static instance: Maybe<GameAudio> = null;

	private sfxBtnClick: Maybe<SoundComponent> = null;
	private sfxEnvSounds: SoundComponent[] = [];
	private envSfxTimer: ReturnType<typeof setTimeout> | null = null;

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		GameAudio.instance = this;

		const children = this.entity.findChildrenWithName("SfxBtnClick");
		if (children.length > 0) {
			this.sfxBtnClick = children[0].getComponent(SoundComponent);
		}

		// Cache all SfxEnv* child entity SoundComponents
		const allChildren = this.entity.getChildren({});
		for (const child of allChildren) {
			if (child.name.startsWith("SfxEnv")) {
				const sound = child.getComponent(SoundComponent);
				if (sound) {
					this.sfxEnvSounds.push(sound);
				}
			}
		}
	}

	@subscribe(OnEntityDestroyEvent, { execution: ExecuteOn.Everywhere })
	private onDestroy(): void {
		if (this.envSfxTimer !== null) {
			clearTimeout(this.envSfxTimer);
			this.envSfxTimer = null;
		}
		GameAudio.instance = null;
	}

	private scheduleNextEnvSfx(): void {
		this.envSfxTimer = setTimeout(() => {
			if (!this.entity.valid) return;
			this.playRandomEnvSfx();
			this.scheduleNextEnvSfx();
		}, ENV_SFX_INTERVAL_MS);
	}

	private playRandomEnvSfx(): void {
		if (this.sfxEnvSounds.length === 0) {
			return;
		}
		const idx = Math.floor(Math.random() * this.sfxEnvSounds.length);
		this.sfxEnvSounds[idx].play(new SoundPlayInfo());
	}

	/**
	 * Start the random ambient environment SFX timer.
	 * Only runs on the client. Safe to call multiple times (guards against double-start).
	 */
	public static startRandomAmbient(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		if (!GameAudio.instance) {
			return;
		}
		// Guard against double-start
		if (GameAudio.instance.envSfxTimer !== null) {
			return;
		}
		if (GameAudio.instance.sfxEnvSounds.length > 0) {
			GameAudio.instance.scheduleNextEnvSfx();
			console.log('[GameAudio] startRandomAmbient: timer started');
		}
	}

	/**
	 * Stop the random ambient environment SFX timer.
	 * Only runs on the client. Safe to call even if already stopped (no-op).
	 */
	public static stopRandomAmbient(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		if (!GameAudio.instance) {
			return;
		}
		if (GameAudio.instance.envSfxTimer !== null) {
			clearTimeout(GameAudio.instance.envSfxTimer);
			GameAudio.instance.envSfxTimer = null;
			console.log('[GameAudio] stopRandomAmbient: timer stopped');
		}
	}

	/**
	 * Play the global button click sound effect.
	 * Only plays on the client (isPlayerContext). Safe to call from anywhere.
	 */
	public static playClick(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		if (!GameAudio.instance) {
			return;
		}
		if (GameAudio.instance.sfxBtnClick) {
			GameAudio.instance.sfxBtnClick.play(new SoundPlayInfo());
		}
	}
}
