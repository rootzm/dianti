/**
 * CharacterUpdateManager - Centralized per-frame update driver for all character sub-systems.
 *
 * Component Attachment: Player (character root entity)
 * Component Networking: Networked
 * Component Ownership: Client (runs on Owner via OnWorldUpdateEvent)
 *
 * Orchestrates per-frame updates for physics simulation, state machine,
 * animation controller, and registered external callbacks. External systems
 * (e.g. GamePhaseManager) can poll `isInitialized` and call `setActive()`
 * to control when the character becomes active.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	Component,
	component,
	ExecuteOn,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	property,
	subscribe,
} from "meta/worlds";
import { AnimationController } from "../../controllers/AnimationController";
import { CharacterStateMachine } from "../../controllers/CharacterStateMachine";
import { ICharacterInitializable } from "../../controllers/ICharacterInitializable";
import { CharacterSimulationController } from "../physics/CharacterSimulationController";

@component({
	description: "Centralized per-frame update driver for all character sub-systems",
})
export class CharacterUpdateManager extends Component {
	private static readonly SMOOTHED_DT_INITIAL = 1 / 72;
	private static readonly MAX_DT = 1 / 30;
	private static readonly SMOOTHING_FACTOR = 0.125;

	@property()
	public characterSimulatedEntity: Maybe<Entity> = null;

	private stateMachine!: CharacterStateMachine;
	private simulationController: CharacterSimulationController | null = null;
	private animationController: AnimationController | null = null;
	private callbacks: CharacterUpdateManagerCallback[] = [];
	private smoothedDt: number = CharacterUpdateManager.SMOOTHED_DT_INITIAL;

	/** Whether initialization has completed. External systems (e.g. GamePhaseManager) poll this. */
	public isInitialized: boolean = false;

	@subscribe(OnEntityStartEvent, {execution: ExecuteOn.Owner})
	private onEntityStart(): void {
		const characterRootEntity = this.entity;
		const target = this.characterSimulatedEntity ?? this.entity;
		const targetController = target.getComponent(CharacterSimulationController);
		if (targetController) {
			targetController.setup(this.entity);
			targetController.setActive(true);
		}
		this.characterSimulatedEntity = target;
		const characterSimulatedEntity = target;

		this.animationController = characterRootEntity.getComponent(AnimationController);
		this.stateMachine = characterRootEntity.getComponentOrThrow(CharacterStateMachine);

		// Bind simulation controller and initialize sub-systems (inlined from swapSimulatedEntity)
		this.simulationController = characterSimulatedEntity.getComponent(CharacterSimulationController);
		this.simulationController?.setup(characterRootEntity);
		this.simulationController?.setActive(true);

		const initializables = characterRootEntity.getComponents(ICharacterInitializable);
		for (const initializable of initializables) {
			initializable.initialize(characterRootEntity, characterSimulatedEntity);
		}

		// After initialization, default to INACTIVE so external systems (GamePhaseManager)
		// control when the player is unfrozen. This prevents the race where init overwrites
		// a prior setActive(false) call.
		if (this.simulationController) {
			this.simulationController.setActive(false);
		}
		this.isInitialized = true;
	}

	@subscribe(OnWorldUpdateEvent)
	private onWorldUpdate(params: OnWorldUpdateEventPayload): void {
		if (!this.isOwned()) {
			return;
		}
		if (!this.isInitialized) {
			return;
		}

		const rawDt = params.deltaTime;
		const clampedDt = Math.min(rawDt, CharacterUpdateManager.MAX_DT);
		this.smoothedDt += (clampedDt - this.smoothedDt) * CharacterUpdateManager.SMOOTHING_FACTOR;
		const dt = this.smoothedDt;
		const timestamp = Date.now();

		this.simulationController?.update(dt);
		this.stateMachine.update(dt);
		this.animationController?.update();

		for (const callback of this.callbacks) {
			callback(dt, timestamp);
		}
	}

	/**
	 * External API to control the physics simulation active state.
	 * GamePhaseManager should call this instead of directly accessing CharacterSimulationController.
	 */
	public setActive(value: boolean): void {
		if (this.simulationController) {
			this.simulationController.setActive(value);
		}
	}

	public registerUpdate(callback: CharacterUpdateManagerCallback): void {
		this.callbacks.push(callback);
	}

	public unregisterUpdate(callback: CharacterUpdateManagerCallback): void {
		const index = this.callbacks.indexOf(callback);
		if (index !== -1) {
			this.callbacks.splice(index, 1);
		}
	}
}

export type CharacterUpdateManagerCallback = (dt: number, timestamp: number) => void;
