/**
 * EnemyAudioCommon
 *
 * Plays the zombie sound effect every 5 seconds after the enemy spawns.
 * Attached to the Audio/SfxZombie entity which has a SoundPlatformComponent with the audio asset.
 *
 * Component Attachment: EnemyCharacter template -> Audio/SfxZombie entity
 * Component Networking: Local (audio plays client-side only)
 * Component Ownership: Server-owned entity; audio playback guarded to client only
 */
import type { Maybe } from "meta/worlds";
import { isCutscenePlaying } from "../events/CutsceneEvents";
import {
	Component,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	SoundComponent,
	component,
	subscribe,
} from "meta/worlds";

@component()
export class EnemyAudioCommon extends Component {
	private static readonly PLAY_INTERVAL_SECONDS = 5.0;

	private timeSinceLastPlay: number = 0;
	private soundComponent: Maybe<SoundComponent> = null;

	@subscribe(OnEntityStartEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onStart(): void {
		this.soundComponent = this.entity.getComponent(SoundComponent);
		this.timeSinceLastPlay = 0;
	}

	@subscribe(OnWorldUpdateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		} else if (!this.soundComponent) {
			return;
		}
		if (isCutscenePlaying()) {
			return;
		}

		this.timeSinceLastPlay += payload.deltaTime;
		if (this.timeSinceLastPlay >= EnemyAudioCommon.PLAY_INTERVAL_SECONDS) {
			this.timeSinceLastPlay -= EnemyAudioCommon.PLAY_INTERVAL_SECONDS;
			this.soundComponent.play({
				fadeInDuration: 0,
			});
		}
	}
}
