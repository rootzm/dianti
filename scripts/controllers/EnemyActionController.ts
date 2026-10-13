/**
 * EnemyActionController
 *
 * Component Attachment: EnemyCharacter template root entity
 * Component Networking: Local (client-owned, spawned as LocalOnly)
 * Component Ownership: Client (local entity)
 *
 * Thin movement execution layer for enemy characters. Receives Vec2 movement
 * input from the central EnemyLogic brain and passes it through to the
 * CharacterStateMachine. Does NOT contain any AI decision logic (patrol/chase)
 * — that is handled entirely by EnemyLogic.
 *
 * Retained as a separate component so EnemyLogic can be swapped or extended
 * without touching the locomotion pipeline.
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	component,
	ExecuteOn,
	OnEntityStartEvent,
	property,
	subscribe,
	Vec2,
} from "meta/worlds";
import { CharacterStateMachine } from "./CharacterStateMachine";

@component({
	description: "Movement execution layer for enemies — receives input from EnemyLogic and feeds the state machine",
})
export class EnemyActionController extends Component {
	/**
	 * When true, movement input is zeroed regardless of what EnemyLogic requests.
	 * Useful for cutscenes or stun effects.
	 */
	@property()
	public movementDisabled: boolean = false;

	private stateMachine: Maybe<CharacterStateMachine> = null;

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		this.stateMachine = this.entity.getComponent(CharacterStateMachine);
	}

	/**
	 * Called by EnemyLogic each frame with the desired movement input.
	 * Applies movementDisabled override before forwarding to the state machine.
	 */
	public applyMovementInput(input: Vec2): void {
		if (!this.stateMachine) {
			return;
		}

		let finalInput: Vec2;
		if (this.movementDisabled) {
			finalInput = Vec2.zero;
		} else {
			finalInput = input;
		}
		this.stateMachine.handleMovementInput(finalInput);
	}
}
