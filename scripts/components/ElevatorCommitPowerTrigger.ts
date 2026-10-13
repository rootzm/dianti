/**
 * ElevatorCommitPowerTrigger - Trigger zone that opens/closes the energy commit HUD.
 *
 * Component Attachment: CommitPowerTrigger child entity inside Elevator template
 *   (PhysicsBodyComponent Trigger + ColliderBox)
 * Component Networking: Local (Not Networked)
 * Component Ownership: Not Networked (fires local events for local player only)
 *
 * Detects when the local player enters/exits and fires
 * ElevatorSafeZoneEnteredEvent / ElevatorSafeZoneExitedEvent so that the
 * HudElevatorCharge UI shows/hides. Reuses existing events to avoid HUD changes.
 */

import type {
	Entity,
	Maybe,
	OnTriggerEnterEventPayload,
	OnTriggerExitEventPayload,
} from "meta/worlds";
import {
	BasePlayerComponent,
	Component,
	component,
	ExecuteOn,
	OnTriggerEnterEvent,
	OnTriggerExitEvent,
	PlayerService,
	Service,
	subscribe,
} from "meta/worlds";
import {
	ElevatorSafeZoneEnteredEvent,
	ElevatorSafeZoneExitedEvent,
} from "../events/ElevatorEnergyEvents";


@component({
	description: "Trigger zone inside the elevator that opens/closes the energy commit HUD (HudElevatorCharge)",
})
export class ElevatorCommitPowerTrigger extends Component {
	// #region Trigger Events
	@subscribe(OnTriggerEnterEvent, { execution: ExecuteOn.Everywhere })
	private onTriggerEnter(payload: OnTriggerEnterEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		const playerRoot = ElevatorCommitPowerTrigger.findPlayerRoot(payload.actorEntity);
		if (!playerRoot) {
			return;
		}

		// Only fire for the local player
		const localPlayer = Service.get(PlayerService).getLocalPlayer();
		if (localPlayer && localPlayer.toString() === playerRoot.toString()) {
			this.sendEventLocally(ElevatorSafeZoneEnteredEvent, {
				dummy: 0,
			});
		}
	}

	@subscribe(OnTriggerExitEvent, { execution: ExecuteOn.Everywhere })
	private onTriggerExit(payload: OnTriggerExitEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		const playerRoot = ElevatorCommitPowerTrigger.findPlayerRoot(payload.actorEntity);
		if (!playerRoot) {
			return;
		}

		// Only fire for the local player
		const localPlayer = Service.get(PlayerService).getLocalPlayer();
		if (localPlayer && localPlayer.toString() === playerRoot.toString()) {
			this.sendEventLocally(ElevatorSafeZoneExitedEvent, {
				dummy: 0,
			});
		}
	}
	// #endregion

	// #region Helpers
	/**
	 * Given any entity in the player hierarchy, walks up ancestors to find
	 * the entity with BasePlayerComponent (the player root).
	 */
	private static findPlayerRoot(entity: Entity): Maybe<Entity> {
		if (entity.getComponent(BasePlayerComponent)) {
			return entity;
		}
		const ancestors = entity.getAncestors();
		for (const ancestor of ancestors) {
			if (ancestor.getComponent(BasePlayerComponent)) {
				return ancestor;
			}
		}
		return null;
	}
	// #endregion
}
