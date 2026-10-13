/**
 * PlayerActionController - UI controller for player input routing.
 *
 * Component Attachment: Player (PlayerCharacter template root entity)
 * Component Networking: Local (client-owned, executes on owning client)
 * Component Ownership: Player
 *
 * Receives button/input events and routes them to the character state machine.
 * Registers Jump (A) and Dash (B) with the ActionButtons HUD system. Also keeps
 * legacy UiEvent subscriptions for backward compatibility.
 */

import type {
	Maybe,
	PlayerInputAxisCallbackPayload,
} from "meta/worlds";
import {
	CameraService,
	Component,
	ExecuteOn,
	LocalEvent,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	PlayerInputAxis,
	PlayerInputService,
	TransformComponent,
	component,
	subscribe,
} from "meta/worlds";
import { ActionButtonPayload } from "./ActionButtons";
import { CharacterStateMachine } from "./CharacterStateMachine";
import {
	DashClickEvent,
	JumpClickEvent,
	JumpReleaseEvent,
} from "../events/ActionEvents";
import {
	GamePhase,
	GamePhaseChangedEvent,
	GamePhaseChangedPayload,
} from "../events/GamePhaseEvents";

export const JumpActionEvent = new LocalEvent("JumpActionEvent", ActionButtonPayload);
export const DashActionEvent = new LocalEvent("DashActionEvent", ActionButtonPayload);

@component({
	description: "UI controller that receives button/input events and routes them to the character state machine",
})
export class PlayerActionController extends Component {
	private stateMachine: Maybe<CharacterStateMachine> = null;

	/**
	 * When true, all actions (jump, dash) are blocked.
	 * Unblocked when the Exploration phase begins.
	 */
	private actionsBlocked: boolean = true;

	/**
	 * Cached reference to the Flashlight entity's TransformComponent.
	 * Updated every frame to match camera forward direction (including pitch).
	 */
	private flashlightTransform: Maybe<TransformComponent> = null;

	// Attached to PlayerCharacter (client-owned). OnEntityStartEvent with Owner
	// runs on the owning client, which is where we register buttons and input.
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Owner })
	public onStart(): void {
		this.stateMachine = this.entity.getComponent(CharacterStateMachine);

		// Register actions with the ActionButtons HUD system
		ActionButtonPayload.registerAction("A", "Jump", JumpActionEvent);
		ActionButtonPayload.registerAction("B", "Dash", DashActionEvent);

		// Subscribe to left stick input for movement using engine defaults.
		PlayerInputService.get().subscribePlayerInputAxis(
			this,
			PlayerInputAxis.Left,
			(payload: PlayerInputAxisCallbackPayload): void => {
				this.stateMachine?.handleMovementInput(payload.value);
			},
		);

		// Explicitly show the joystick to release any sticky hide-lock
		PlayerInputService.get().setJoystickVisible(true);

		// Find the Flashlight entity from root (may be direct child or nested)
		const flashlights = this.entity.findChildrenWithName("Flashlight", true);
		if (flashlights.length > 0) {
			this.flashlightTransform = flashlights[0].getComponent(TransformComponent);
		}
	}

	/**
	 * Per-frame update to align the Flashlight's rotation with the camera's
	 * look direction (including pitch). Runs on the owning client only.
	 */
	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Owner })
	public onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (this.flashlightTransform) {
			this.flashlightTransform.worldRotation = CameraService.get().rotation;
		}
	}

	/**
	 * Subscribe to phase changes globally.
	 * Block actions during Preparation/Settlement, unblock during Exploration.
	 */
	@subscribe(GamePhaseChangedEvent, { execution: ExecuteOn.Everywhere })
	private onPhaseChanged(payload: GamePhaseChangedPayload): void {
		if (payload.newPhase === GamePhase.Exploration) {
			this.actionsBlocked = false;
		} else {
			this.actionsBlocked = true;
		}
	}


	// #region ActionButton HUD Event Handlers
	@subscribe(JumpActionEvent, { execution: ExecuteOn.Everywhere })
	public onJumpAction(payload: ActionButtonPayload): void {
		if (payload.state === "down") {
			if (this.actionsBlocked) {
				return;
			}
			this.stateMachine?.handleJumpClick();
		} else {
			// Release is never gated: a phase change mid-jump must not leave jump
			// ability stuck in the active state.
			this.stateMachine?.handleJumpRelease();
		}
	}

	@subscribe(DashActionEvent, { execution: ExecuteOn.Everywhere })
	public onDashAction(payload: ActionButtonPayload): void {
		if (this.actionsBlocked) {
			return;
		}
		if (payload.state === "down") {
			this.stateMachine?.handleDashClick();
		}
	}
	// #endregion

	// #region Legacy UiEvent Handlers
	@subscribe(JumpClickEvent)
	public onJumpClick(): void {
		if (this.actionsBlocked) {
			return;
		}
		this.stateMachine?.handleJumpClick();
	}

	@subscribe(JumpReleaseEvent)
	public onJumpRelease(): void {
		this.stateMachine?.handleJumpRelease();
	}

	@subscribe(DashClickEvent)
	public onDashClick(): void {
		if (this.actionsBlocked) {
			return;
		}
		this.stateMachine?.handleDashClick();
	}
	// #endregion
}
