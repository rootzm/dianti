import type { Entity, Maybe, OnWorldUpdateEventPayload } from 'meta/worlds';
import {
	Component,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	SoundComponent,
	component,
	subscribe,
} from 'meta/worlds';
import { EnemyAIState, EnemyLogic } from './EnemyLogic';
import { isCutscenePlaying } from '../events/CutsceneEvents';

/**
 * Plays the Sound component on this entity every 5 seconds while the enemy is in Chase state.
 * Stops immediately when leaving Chase state.
 *
 * Component Attachment: Child entity of an enemy that has a SoundPlatformComponent
 * Component Networking: Local (enemy entities are spawned LocalOnly)
 * Component Ownership: Not Networked
 */
@component()
export class EnemyAudioChase extends Component {
	private static readonly PLAY_INTERVAL_SECONDS = 5.0;

	private timeSinceLastPlay: number = 0;
	private soundComponent: Maybe<SoundComponent> = null;
	private enemyLogic: Maybe<EnemyLogic> = null;
	private wasActive: boolean = false;

	@subscribe(OnEntityStartEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onStart(): void {
		this.soundComponent = this.entity.getComponent(SoundComponent);
		this.enemyLogic = this.findEnemyLogic();
		this.timeSinceLastPlay = 0;
		this.wasActive = false;
	}

	@subscribe(OnWorldUpdateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		} else if (!this.soundComponent || !this.enemyLogic) {
			return;
		}
		if (isCutscenePlaying()) {
			if (this.wasActive) {
				this.soundComponent.stop(0);
				this.wasActive = false;
			}
			return;
		}

		const isActive = this.enemyLogic.getAIState() === EnemyAIState.Chase;
		if (isActive) {
			this.timeSinceLastPlay += payload.deltaTime;
			if (this.timeSinceLastPlay >= EnemyAudioChase.PLAY_INTERVAL_SECONDS) {
				this.timeSinceLastPlay -= EnemyAudioChase.PLAY_INTERVAL_SECONDS;
				this.soundComponent.play({
					fadeInDuration: 0
				});
			}
		} else if (this.wasActive) {
			// Just left Chase state — stop immediately
			this.soundComponent.stop(0);
			this.timeSinceLastPlay = 0;
		}
		this.wasActive = isActive;
	}

	private findEnemyLogic(): Maybe<EnemyLogic> {
		// EnemyLogic is on an ancestor (the enemy root entity)
		const ancestors: Entity[] = this.entity.getAncestors();
		for (const ancestor of ancestors) {
			const logic = ancestor.getComponent(EnemyLogic);
			if (logic) {
				return logic;
			}
		}
		return null;
	}
}
