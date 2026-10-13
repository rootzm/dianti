/**
 * ElevatorDoorController - Controls elevator double sliding doors.
 *
 * Component Attachment: Scene Entity (the Elevator template root or a dedicated door parent)
 * Component Networking: Local (all logic runs locally on each client)
 * Component Ownership: Not Networked
 *
 * The two door entities slide outward from center (left door goes -X, right door goes +X).
 * Doors start closed and open permanently when the game transitions to the Exploration phase.
 * Subscribes to GamePhaseChangedEvent to trigger the open.
 */

import type {
	Entity,
	Maybe,
} from 'meta/worlds';
import {
	Component,
	component,
	ExecuteOn,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	property,
	SoundComponent,
	SoundPlayInfo,
	subscribe,
	TransformComponent,
	Vec3,
} from 'meta/worlds';
import {
	ElevatorDoorsFullyClosedEvent,
} from '../events/ElevatorEnergyEvents';
import {
	GamePhase,
	GamePhaseChangedEvent,
	GamePhaseChangedPayload,
} from '../events/GamePhaseEvents';

enum DoorState {
	Closed = 0,
	Opening = 1,
	Open = 2,
	Closing = 3,
}

@component()
export class ElevatorDoorController extends Component {
	/** Reference to the left door entity */
	@property({ isNetworked: false })
	public leftDoor: Maybe<Entity> = null;

	/** Reference to the right door entity */
	@property({ isNetworked: false })
	public rightDoor: Maybe<Entity> = null;

	/** How far each door slides open (in local X units) */
	@property({ isNetworked: false })
	public slideDistance: number = 0.5;

	/** Speed of the door animation (units per second) */
	@property({ isNetworked: false })
	public slideSpeed: number = 1.0;

	// Internal state (local only)
	private doorState: DoorState = DoorState.Closed;
	private currentSlideOffset: number = 0;

	private leftDoorTransform: Maybe<TransformComponent> = null;
	private rightDoorTransform: Maybe<TransformComponent> = null;
	private leftDoorClosedPos: Vec3 = Vec3.zero;
	private rightDoorClosedPos: Vec3 = Vec3.zero;

	/** Cached reference to the door open SFX SoundComponent */
	private openDoorSound: Maybe<SoundComponent> = null;

	/** Resolve callback for the openDoors() Promise */
	private openResolve: (() => void) | null = null;

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		// Cache door transforms and their closed positions
		this.leftDoorTransform = this.leftDoor?.getComponent(TransformComponent) ?? null;
		if (this.leftDoorTransform) {
			this.leftDoorClosedPos = this.leftDoorTransform.localPosition;
		}
		this.rightDoorTransform = this.rightDoor?.getComponent(TransformComponent) ?? null;
		if (this.rightDoorTransform) {
			this.rightDoorClosedPos = this.rightDoorTransform.localPosition;
		}

		// Cache reference to the door open SFX child entity's SoundComponent
		const sfxEntities = this.entity.findChildrenWithName('SfxElevatorOpenDoor', true);
		if (sfxEntities.length > 0) {
			this.openDoorSound = sfxEntities[0].getComponent(SoundComponent);
		}
	}
	// #endregion

	// #region Phase Events
	/**
	 * Subscribe to game phase changes.
	 * Open doors permanently when Exploration phase begins.
	 */
	@subscribe(GamePhaseChangedEvent, { execution: ExecuteOn.Everywhere })
	public onGamePhaseChanged(payload: GamePhaseChangedPayload): void {
		if (payload.newPhase === GamePhase.Exploration) {
			this.openDoors();
		}
	}


	// #endregion

	// #region Update
	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Everywhere })
	public onUpdate(payload: OnWorldUpdateEventPayload): void {
		const dt = payload.deltaTime;

		if (this.doorState === DoorState.Opening) {
			this.currentSlideOffset += this.slideSpeed * dt;
			if (this.currentSlideOffset >= this.slideDistance) {
				this.currentSlideOffset = this.slideDistance;
				this.doorState = DoorState.Open;
				// Resolve the openDoors() Promise now that doors are fully open
				if (this.openResolve) {
					this.openResolve();
					this.openResolve = null;
				}
			}
			this.updateDoorPositions();
		} else if (this.doorState === DoorState.Closing) {
			this.currentSlideOffset -= this.slideSpeed * dt;
			if (this.currentSlideOffset <= 0) {
				this.currentSlideOffset = 0;
				this.doorState = DoorState.Closed;
				this.sendEventLocally(ElevatorDoorsFullyClosedEvent, {
					dummy: 0,
				});
			}
			this.updateDoorPositions();
		}
	}
	// #endregion

	// #region Public API
	/** Open the elevator doors. Returns a Promise that resolves when doors are fully open. */
	public openDoors(): Promise<void> {
		if (this.doorState === DoorState.Closed) {
			this.doorState = DoorState.Opening;
			// Play door open sound effect
			this.openDoorSound?.play(new SoundPlayInfo());
			return new Promise<void>((resolve): void => {
				this.openResolve = resolve;
			});
		}
		// Already open or opening — resolve immediately
		if (this.doorState === DoorState.Open) {
			return Promise.resolve();
		}
		// Currently opening — attach to the pending resolve
		return new Promise<void>((resolve): void => {
			this.openResolve = resolve;
		});
	}

	/** Close the elevator doors */
	public closeDoors(): void {
		if (this.doorState === DoorState.Open || this.doorState === DoorState.Opening) {
			this.doorState = DoorState.Closing;
		}
	}
	// #endregion

	// #region Helpers
	private updateDoorPositions(): void {
		// Left door slides in -X direction
		if (this.leftDoorTransform) {
			this.leftDoorTransform.localPosition = new Vec3(
				this.leftDoorClosedPos.x - this.currentSlideOffset,
				this.leftDoorClosedPos.y,
				this.leftDoorClosedPos.z,
			);
		}

		// Right door slides in +X direction
		if (this.rightDoorTransform) {
			this.rightDoorTransform.localPosition = new Vec3(
				this.rightDoorClosedPos.x + this.currentSlideOffset,
				this.rightDoorClosedPos.y,
				this.rightDoorClosedPos.z,
			);
		}
	}
	// #endregion
}
