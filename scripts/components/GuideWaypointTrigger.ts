/**
 * GuideWaypointTrigger - Trigger component for guide waypoint detection.
 *
 * Component Attachment: Child entity of FX_cursor template (with PhysicsBody Trigger + ColliderSphere)
 * Component Networking: Local
 * Component Ownership: Not Networked
 *
 * Listens for OnTriggerEnterEvent. When the local player enters,
 * fires GuideWaypointReachedEvent so the GuideMarkerManager can advance.
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
	ExecuteOn,
	OnTriggerEnterEvent,
	OnTriggerExitEvent,
	PlayerService,
	component,
	subscribe,
} from "meta/worlds";

import {
	GuideWaypointReachedEvent,
	GuideWaypointExitEvent,
} from "../events/GuideEvents";

@component({
	description: "Fires GuideWaypointReachedEvent when the local player enters the trigger volume.",
})
export class GuideWaypointTrigger extends Component {
	@subscribe(OnTriggerEnterEvent, { execution: ExecuteOn.Everywhere })
	onTriggerEnter(payload: OnTriggerEnterEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		const playerEntity = this.findPlayerEntity(payload.actorEntity);
		if (!playerEntity) {
			return;
		}

		if (!PlayerService.get().isLocalPlayer(playerEntity)) {
			return;
		}

		console.log("[GuideWaypointTrigger] Local player reached waypoint");
		this.sendEventLocally(GuideWaypointReachedEvent, {
			waypointEntity: this.entity,
		});
	}

	@subscribe(OnTriggerExitEvent, { execution: ExecuteOn.Everywhere })
	onTriggerExit(payload: OnTriggerExitEventPayload): void {
		if (!payload.actorEntity) {
			return;
		}

		const playerEntity = this.findPlayerEntity(payload.actorEntity);
		if (!playerEntity) {
			return;
		}

		if (!PlayerService.get().isLocalPlayer(playerEntity)) {
			return;
		}

		console.log("[GuideWaypointTrigger] Local player exited waypoint");
		this.sendEventLocally(GuideWaypointExitEvent, {
			waypointEntity: this.entity,
		});
	}

	private findPlayerEntity(actorEntity: Entity): Maybe<Entity> {
		if (actorEntity.getComponent(BasePlayerComponent)) {
			return actorEntity;
		}
		for (const ancestor of actorEntity.getAncestors()) {
			if (ancestor.getComponent(BasePlayerComponent)) {
				return ancestor;
			}
		}
		return null;
	}
}
