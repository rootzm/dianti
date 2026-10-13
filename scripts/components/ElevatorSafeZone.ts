/**
 * ElevatorSafeZone - Trigger zone that marks players as safe from enemy chase.
 *
 * Component Attachment: A child entity inside the Elevator template that has
 *   PhysicsBodyComponent (Trigger type) + ColliderBox.
 * Component Networking: Local (Not Networked)
 * Component Ownership: Not Networked (all logic is local, enemies are LocalOnly)
 *
 * Detects when the local player enters/exits the elevator trigger zone and
 * maintains a global static registry of "safe" player entities. EnemyLogic
 * checks this registry to avoid chasing players who are inside the elevator.
 *
 * OnTriggerEnterEvent fires on the entity that owns the PhysicsBodyComponent
 * (this trigger entity). The actorEntity is the DynamicCollider that entered
 * (the player's KinematicCharacter child). We walk ancestors to find
 * BasePlayerComponent on the player root.
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
	subscribe,
} from "meta/worlds";

/**
 * Module-level set tracking entities that are currently "safe" (inside an elevator).
 * Uses entity.toString() as the key since entity references should not be cached long-term.
 * EnemyLogic imports and checks this set.
 */
export const SAFE_PLAYER_KEYS: Set<string> = new Set();

@component({
	description: "Trigger zone inside the elevator that marks players as safe from enemy chase",
})
export class ElevatorSafeZone extends Component {
	// #region Trigger Events
	@subscribe(OnTriggerEnterEvent, { execution: ExecuteOn.Everywhere })
	private onTriggerEnter(payload: OnTriggerEnterEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		const playerRoot = ElevatorSafeZone.findPlayerRoot(payload.actorEntity);
		if (!playerRoot) {
			return;
		}

		const key = playerRoot.toString();
		SAFE_PLAYER_KEYS.add(key);
	}

	@subscribe(OnTriggerExitEvent, { execution: ExecuteOn.Everywhere })
	private onTriggerExit(payload: OnTriggerExitEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		const playerRoot = ElevatorSafeZone.findPlayerRoot(payload.actorEntity);
		if (!playerRoot) {
			return;
		}

		const key = playerRoot.toString();
		SAFE_PLAYER_KEYS.delete(key);
	}
	// #endregion

	// #region Static Helpers
	/**
	 * Checks whether a given player entity is currently inside an elevator safe zone.
	 * Walks ancestors of the provided entity to find the player root with BasePlayerComponent,
	 * then checks the safe registry.
	 */
	public static isPlayerSafe(entity: Entity): boolean {
		const playerRoot = ElevatorSafeZone.findPlayerRoot(entity);
		if (!playerRoot) {
			return false;
		}
		return SAFE_PLAYER_KEYS.has(playerRoot.toString());
	}

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
