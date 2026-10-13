/**
 * PropSpotRandomizer — Randomly activates a subset of pre-placed HP/MP restore
 * item instances each time a level loads.
 *
 * Component Attachment: Scene Entity (same entity as GamePhaseManager)
 * Component Networking: Local
 * Component Ownership: Not Networked — each client runs independently
 *
 * Pre-placed instances follow these naming conventions:
 * - HP items: "sm_HP(2)", "sm_HP(3)", ..., "sm_HP(N)"
 * - MP items: "SM_MP", "SM_MP(1)", "SM_MP(2)", ..., "SM_MP(N)"
 *
 * On each call to randomizeSpots(levelId):
 * 1. Collects all matching entities by name pattern
 * 2. Disables all of them (enabledSelf = false)
 * 3. Shuffles the combined list (Fisher-Yates)
 * 4. Enables the first N based on level rules
 *
 * Activation rules:
 * - levelId === 1 → 1 item
 * - levelId === 2 → 3 items
 * - levelId >= 3 → 5 items
 */

import {
	Component,
	EntityService,
	MeshComponent,
	component,
} from "meta/worlds";
import type { Entity } from "meta/worlds";

/** Maximum suffix index to scan for each naming pattern */
const MAX_SCAN_INDEX = 30;

@component()
export class PropSpotRandomizer extends Component {
	/**
	 * Determine how many restore items to activate for a given level.
	 */
	private getActivationCount(levelId: number): number {
		if (levelId <= 1) return 1;
		if (levelId === 2) return 3;
		return 5; // levelId >= 3
	}

	/**
	 * Randomize which pre-placed HP/MP restore spots are active.
	 * Called by GamePhaseManager after sublevel load completes.
	 */
	public randomizeSpots(levelId: number): void {
		const candidates = this.collectAllSpots();

		if (candidates.length === 0) {
			console.log('[PropSpotRandomizer] No restore item spots found in scene');
			return;
		}

		// 1. Hide all candidates (disable + hide mesh)
		for (let i = 0; i < candidates.length; i++) {
			this.setSpotVisible(candidates[i], false);
		}

		// 2. Fisher-Yates shuffle
		for (let i = candidates.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const tmp = candidates[i];
			candidates[i] = candidates[j];
			candidates[j] = tmp;
		}

		// 3. Show the first N
		const count = Math.min(this.getActivationCount(levelId), candidates.length);
		for (let i = 0; i < count; i++) {
			this.setSpotVisible(candidates[i], true);
		}

		console.log(`[PropSpotRandomizer] Level ${levelId}: activated ${count}/${candidates.length} restore spots`);
	}

	/**
	 * Recursively enable/disable an entity and explicitly toggle mesh visibility.
	 * This ensures the root entity's own mesh is hidden, not just its children.
	 */
	private setSpotVisible(entity: Entity, visible: boolean): void {
		entity.enabledSelf = visible;

		// Explicitly set mesh visibility on this entity
		const mesh = entity.getComponent(MeshComponent);
		if (mesh) {
			mesh.isVisibleSelf = visible;
		}

		// Recursively handle all children (includeDisabled so we can find them when re-enabling)
		const children = entity.getChildren({includeDisabled: true});
		for (let i = 0; i < children.length; i++) {
			this.setSpotVisible(children[i], visible);
		}
	}

	/**
	 * Collect all pre-placed HP and MP restore item entities by scanning
	 * known name patterns.
	 */
	private collectAllSpots(): Entity[] {
		const results: Entity[] = [];

		// sm_HP pattern: sm_HP(2) through sm_HP(MAX_SCAN_INDEX)
		for (let i = 2; i <= MAX_SCAN_INDEX; i++) {
			const found = EntityService.findEntitiesWithName(`sm_HP(${i})`);
			for (let j = 0; j < found.length; j++) {
				results.push(found[j]);
			}
		}

		// SM_MP pattern: "SM_MP" (base), then "SM_MP(1)" through "SM_MP(MAX_SCAN_INDEX)"
		const baseMP = EntityService.findEntitiesWithName('SM_MP');
		for (let j = 0; j < baseMP.length; j++) {
			results.push(baseMP[j]);
		}
		for (let i = 1; i <= MAX_SCAN_INDEX; i++) {
			const found = EntityService.findEntitiesWithName(`SM_MP(${i})`);
			for (let j = 0; j < found.length; j++) {
				results.push(found[j]);
			}
		}

		return results;
	}
}
