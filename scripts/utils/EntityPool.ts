/**
 * EntityPool - Generic entity pool keyed by TemplateAsset.
 *
 * Manages reusable entity instances to avoid destroy/respawn GC pressure.
 * Entities are disabled (enabledSelf = false) when returned to the pool,
 * and re-enabled when acquired. If the pool is empty for a given template,
 * a new entity is spawned on demand.
 *
 * Component Attachment: N/A (utility class, not a component)
 * Component Networking: N/A
 * Component Ownership: N/A
 */

import type {
	Entity,
} from "meta/worlds";
import {
	NetworkMode,
	Quaternion,
	TemplateAsset,
	TransformComponent,
	Vec3,
	WorldService,
} from "meta/worlds";

/** Position used to park disabled pool entities offscreen */
const POOL_PARK_POSITION = new Vec3(0, -500, 0);

/**
 * A generic entity pool that manages reusable entities keyed by TemplateAsset.
 * Call acquire() to get an entity (from pool or freshly spawned).
 * Call release() to return an entity to the pool (disables it).
 */
export class EntityPool {
	/** Pool storage: template -> available (disabled) entities */
	private pool: Map<TemplateAsset, Entity[]> = new Map();

	/** Reverse lookup: entity -> its source template (for release without knowing template) */
	private entityTemplateMap: Map<Entity, TemplateAsset> = new Map();

	/**
	 * Acquire an entity from the pool for the given template.
	 * If one is available in the pool, re-enables it and teleports to the given position.
	 * Otherwise spawns a new entity.
	 *
	 * @returns The entity (already enabled and positioned), or null if spawn failed.
	 */
	public async acquire(
		template: TemplateAsset,
		position: Vec3,
		rotation: Quaternion,
	): Promise<Entity | null> {
		const available = this.pool.get(template);
		if (available && available.length > 0) {
			const entity = available.pop()!;
			// Teleport before enabling to avoid flicker at old position
			const transform = entity.getComponent(TransformComponent);
			if (transform) {
				transform.teleportTo(position, rotation);
			}
			entity.enabledSelf = true;
			return entity;
		}

		// Pool empty for this template — spawn new
		try {
			const entity = await WorldService.get().spawnTemplate({
				templateAsset: template,
				networkMode: NetworkMode.LocalOnly,
				position: position,
				rotation: rotation,
			});
			this.entityTemplateMap.set(entity, template);
			return entity;
		} catch (error: unknown) {
			console.log(`[EntityPool] Failed to spawn template: ${String(error)}`);
			return null;
		}
	}

	/**
	 * Release an entity back into the pool. Disables it and parks it offscreen.
	 * The caller is responsible for resetting any runtime state on the entity
	 * BEFORE calling release.
	 */
	public release(entity: Entity): void {
		if (!entity.valid) {
			return;
		}

		const template = this.entityTemplateMap.get(entity);
		if (!template) {
			// Entity was not tracked (shouldn't happen if acquire was used)
			console.log("[EntityPool] release called on untracked entity, destroying instead");
			entity.destroy();
			return;
		}

		entity.enabledSelf = false;

		// Park offscreen
		const transform = entity.getComponent(TransformComponent);
		if (transform) {
			transform.teleportTo(POOL_PARK_POSITION, Quaternion.identity);
		}

		let available = this.pool.get(template);
		if (!available) {
			available = [];
			this.pool.set(template, available);
		}
		available.push(entity);
	}

	/**
	 * Register an entity that was spawned externally (e.g. first spawn in batch)
	 * so it can be released back to this pool later.
	 */
	public track(entity: Entity, template: TemplateAsset): void {
		this.entityTemplateMap.set(entity, template);
	}

	/**
	 * Check how many entities are available (disabled) in the pool for a template.
	 */
	public availableCount(template: TemplateAsset): number {
		const available = this.pool.get(template);
		return available ? available.length : 0;
	}

	/**
	 * Destroy all pooled entities. Call on world teardown if needed.
	 */
	public destroyAll(): void {
		for (const [_template, entities] of this.pool) {
			for (const entity of entities) {
				if (entity.valid) {
					entity.destroy();
				}
			}
		}
		this.pool.clear();
		this.entityTemplateMap.clear();
	}
}
