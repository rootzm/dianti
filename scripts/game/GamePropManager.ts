/**
 * PropManager - Manages registration, querying, filtering of all props in the world,
 * and dynamic spawning of props at designated spawn points.
 *
 * Component Attachment: Scene Entity (client-local execution)
 * Component Networking: Local
 * Component Ownership: Not Networked — each client spawns its own local props independently
 *
 * Spawn points are child entities of the "PropPoints" parent entity.
 * Each spawn point spawns exactly one prop. If spawn points exceed
 * the total prop count for this level, some spawn points remain empty.
 *
 * Spawn counts are calculated dynamically based on the level index set by GamePhaseManager:
 *   Total = min(6 + level * 4, 40)
 *
 * propTemplates is a unified list of all available prop templates (not grouped by rarity).
 * Each template's PropData.spawnWeight determines its probability of being selected
 * via weighted random selection. Weights are read by spawning a temporary instance
 * of each template on initialization.
 *
 * Destruction and re-spawning are orchestrated by GamePhaseManager via direct method calls.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	Component,
	component,
	EntityService,
	EventService,
	ExecuteOn,
	NetworkMode,
	OnEntityStartEvent,
	property,
	Quaternion,
	Service,
	subscribe,
	TemplateAsset,
	TransformComponent,
	Vec3,
	WorldService,
} from "meta/worlds";
import {
	PropCategory,
	PropRarity,
} from "../props/PropConfig";
import { PropData } from "../props/PropData";
import { PropSpawnCompleteEvent } from "../events/GamePhaseEvents";
import { PropPickupHandler } from "../props/PropPickupHandler";
import { EntityPool } from "../utils/EntityPool";

@component({ description: "Manages all props: registration, lookup, filtering, and dynamic prop spawning at spawn points using weighted random selection." })
export class GamePropManager extends Component {
	// #region Static constants
	/** Name of the parent entity containing prop spawn point children */
	private static readonly SPAWN_PARENT_NAME = "PropPoints";
	/** Default spawn weight used if PropData cannot be read from a template */
	private static readonly DEFAULT_SPAWN_WEIGHT = 10;
	// #endregion

	// #region Configurable formula parameters (set by GamePhaseManager from game_config.json)
	/** Y offset so props float slightly above the ground */
	public spawnYOffset: number = 0.5;
	/** Maximum total props that can spawn regardless of level */
	public maxTotalProps: number = 40;
	/** Base prop count in formula: min(base + level * perLevel, max) */
	public propCountBase: number = 6;
	/** Per-level prop count increment in formula */
	public propCountPerLevel: number = 4;
	/** Divisor for energy formula */
	public energyDivisor: number = 6;
	// #endregion

	// #region Properties
	/**
	 * Unified list of all available prop templates.
	 * Each template's PropData.spawnWeight property determines its spawn probability.
	 */
	@property()
	public readonly propTemplates: readonly TemplateAsset[] = [];

	/**
	 * Debug mode: when true, only spawns props whose PropData.usable is true.
	 * When false, spawns all props normally regardless of usable flag.
	 */
	@property({ isNetworked: false })
	public debugEnable: boolean = false;
	// #endregion

	// #region Level tracking
	/**
	 * Cached level index, set by GamePhaseManager before spawning.
	 * Not a @property — derived from the single source of truth (GamePhaseManager.levelId).
	 */
	private levelId: number = 1;

	/** Set the current level index. Called by GamePhaseManager before spawning. */
	public setLevelId(levelId: number): void {
		this.levelId = levelId;
	}

	/** Read the current level */
	private getCurrentLevel(): number {
		return this.levelId;
	}
	// #endregion

	// #region Internal state
	/** Internal registry of known prop entities */
	private registeredProps: Entity[] = [];

	/** Track spawned prop entities for cleanup on level reset */
	private spawnedProps: Entity[] = [];

	/** Entity pool for reusing prop entities across levels */
	private propPool: EntityPool = new EntityPool();

	/**
	 * Cached spawn weights read from PropData.spawnWeight on each template.
	 * Index matches propTemplates index.
	 */
	private templateWeights: number[] = [];
	/**
	 * Cached usable flags read from PropData.usable on each template.
	 * Index matches propTemplates index.
	 */
	private templateUsable: boolean[] = [];
	/** Sum of all template spawn weights */
	private totalWeight: number = 0;
	/** Whether weights have been initialized from template instances */
	private weightsInitialized: boolean = false;
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		this.refreshRegistry();
		// Weight initialization happens asynchronously via initializeWeights().
		// Initial spawn is handled by GamePhaseManager orchestrator after sublevel loads.
	}
	// #endregion

	// #region Weight Initialization
	/**
	 * Spawn a temporary instance of each template to read its PropData.spawnWeight,
	 * then immediately destroy the temporary entities. Call once before first spawn cycle.
	 */
	public async initializeWeights(): Promise<void> {
		if (this.weightsInitialized) {
			return;
		}

		this.templateWeights = [];
		this.templateUsable = [];
		this.totalWeight = 0;

		for (let i = 0; i < this.propTemplates.length; i++) {
			const template = this.propTemplates[i];
			if (!template) {
				this.templateWeights.push(GamePropManager.DEFAULT_SPAWN_WEIGHT);
				this.templateUsable.push(true);
				this.totalWeight += GamePropManager.DEFAULT_SPAWN_WEIGHT;
				continue;
			}

			try {
				// Spawn a temporary instance offscreen to read its PropData.spawnWeight
				const tempEntity = await Service.get(WorldService).spawnTemplate({
					templateAsset: template,
					networkMode: NetworkMode.LocalOnly,
					position: new Vec3(0, -1000, 0),
					rotation: Quaternion.identity,
				});

				const propData = tempEntity.getComponent(PropData);
				const weight = propData ? propData.spawnWeight : GamePropManager.DEFAULT_SPAWN_WEIGHT;
				const usable = propData ? propData.usable : true;
				this.templateWeights.push(weight);
				this.templateUsable.push(usable);
				this.totalWeight += weight;

				// Destroy the temporary entity immediately
				tempEntity.destroy();
			} catch (error: unknown) {
				console.log(`[GamePropManager] Failed to read weight for template ${i}: ${String(error)}`);
				this.templateWeights.push(GamePropManager.DEFAULT_SPAWN_WEIGHT);
				this.templateUsable.push(true);
				this.totalWeight += GamePropManager.DEFAULT_SPAWN_WEIGHT;
			}
		}

		this.weightsInitialized = true;
	}
	// #endregion

	// #region Destroy / Cleanup
	/** Destroy all pooled entities and clear the tracking map. Called by GamePhaseManager after destroyAllProps(). */
	public clearPool(): void {
		this.propPool.destroyAll();
		console.log('[GamePropManager] clearPool: destroyed all pooled entities and cleared entityTemplateMap');
	}

	/**
	 * Recycle all spawned props back into the pool (disable, don't destroy).
	 * Called by GamePhaseManager during level unload.
	 */
	public destroyAllProps(): void {
		for (const prop of this.spawnedProps) {
			if (prop.valid) {
				this.resetAndReleaseProp(prop);
			}
		}
		this.spawnedProps = [];
		this.registeredProps = [];
	}

	/**
	 * Release a single prop back to the pool. Called by PropPickupHandler on pickup.
	 * Resets the prop's runtime state and disables it.
	 */
	public releaseProp(entity: Entity): void {
		if (!entity.valid) {
			return;
		}
		this.resetAndReleaseProp(entity);
		// Remove from active tracking
		const idx = this.spawnedProps.indexOf(entity);
		if (idx >= 0) {
			this.spawnedProps.splice(idx, 1);
		}
		this.unregisterProp(entity);
	}

	/**
	 * Internal: reset prop state and return to pool.
	 */
	private resetAndReleaseProp(entity: Entity): void {
		const pickupHandler = entity.getComponent(PropPickupHandler);
		if (pickupHandler) {
			pickupHandler.resetForPool();
		}
		this.propPool.release(entity);
	}
	// #endregion

	// #region Dynamic Spawning
	/** Calculate total prop count for the current level */
	public getTotalPropCount(): number {
		const raw = this.propCountBase + this.getCurrentLevel() * this.propCountPerLevel;
		return Math.min(raw, this.maxTotalProps);
	}

	/**
	 * Select a random template index using weighted random selection.
	 * Generates a random number in [0, totalWeight) and iterates through
	 * cumulative weights to find the selected template.
	 */
	private selectWeightedRandomTemplate(): number {
		if (this.templateWeights.length === 0 || this.totalWeight <= 0) {
			return 0;
		}

		let rand = Math.random() * this.totalWeight;
		for (let i = 0; i < this.templateWeights.length; i++) {
			rand -= this.templateWeights[i];
			if (rand <= 0) {
				return i;
			}
		}
		// Fallback to last template (shouldn't happen unless floating point issues)
		return this.templateWeights.length - 1;
	}

	/**
	 * Select a random template index using weighted random selection,
	 * only considering templates at the given indices with the given weights/total.
	 */
	private selectWeightedRandomFromSubset(indices: number[], weights: number[], weightSum: number): number {
		if (indices.length === 0 || weightSum <= 0) {
			return 0;
		}

		let rand = Math.random() * weightSum;
		for (let i = 0; i < indices.length; i++) {
			rand -= weights[i];
			if (rand <= 0) {
				return indices[i];
			}
		}
		// Fallback to last index
		return indices[indices.length - 1];
	}

	/** Build the spawn list using weighted random selection from all propTemplates */
	private buildSpawnList(): TemplateAsset[] {
		const total = this.getTotalPropCount();

		if (this.propTemplates.length === 0) {
			return [];
		}

		// When debugEnable is true, build a filtered subset of only usable templates
		let candidateIndices: number[] = [];
		let candidateWeights: number[] = [];
		let candidateWeightSum = 0;

		if (this.debugEnable) {
			for (let i = 0; i < this.propTemplates.length; i++) {
				if (this.templateUsable[i]) {
					candidateIndices.push(i);
					candidateWeights.push(this.templateWeights[i] || GamePropManager.DEFAULT_SPAWN_WEIGHT);
					candidateWeightSum += this.templateWeights[i] || GamePropManager.DEFAULT_SPAWN_WEIGHT;
				}
			}

			if (candidateIndices.length === 0) {
				return [];
			}
		}

		const propsToSpawn: TemplateAsset[] = [];

		for (let i = 0; i < total; i++) {
			let templateIndex: number;

			if (this.debugEnable) {
				// Only pick from usable templates so all spawn points get filled
				templateIndex = this.selectWeightedRandomFromSubset(candidateIndices, candidateWeights, candidateWeightSum);
			} else {
				templateIndex = this.selectWeightedRandomTemplate();
			}

			const template = this.propTemplates[templateIndex];
			if (template) {
				propsToSpawn.push(template);
			}
		}

		return propsToSpawn;
	}

	/** Batch size for parallel prop spawning to avoid single-frame spikes */
	private static readonly SPAWN_BATCH_SIZE = 8;
	/** Delay between spawn batches (ms) to spread GPU/physics init across frames */
	private static readonly SPAWN_BATCH_DELAY_MS = 50;

	/** Spawn props at designated spawn point positions using batched parallel spawning */
	public async spawnPropsAtSpawnPoints(): Promise<void> {
		// Ensure weights are initialized before spawning
		await this.initializeWeights();

		// Find all spawn point entities under the "PropPoints" parent entity
		const parentEntities = EntityService.findEntitiesWithName(GamePropManager.SPAWN_PARENT_NAME);
		if (parentEntities.length === 0) {
			EventService.sendLocally(PropSpawnCompleteEvent, {
				complete: true,
			});
			return;
		}
		const parentEntity = parentEntities[0];
		const allSpawnPoints = parentEntity.getChildren();

		// Shuffle spawn points so that prop placement is randomized across positions
		for (let i = allSpawnPoints.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const tmp = allSpawnPoints[i];
			allSpawnPoints[i] = allSpawnPoints[j];
			allSpawnPoints[j] = tmp;
		}

		// Build spawn list using weighted random selection
		const propsToSpawn = this.buildSpawnList();

		// Shuffle the spawn list to randomize placement across spawn points
		for (let i = propsToSpawn.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const tmp = propsToSpawn[i];
			propsToSpawn[i] = propsToSpawn[j];
			propsToSpawn[j] = tmp;
		}

		const totalProps = propsToSpawn.length;

		// Spawn one prop per spawn point; if spawn points > props, extras remain empty
		const spawnCount = Math.min(totalProps, allSpawnPoints.length);

		// Batched parallel spawning: acquire BATCH_SIZE props concurrently per batch,
		// with a short delay between batches to prevent single-frame CPU/GPU spikes.
		// Uses EntityPool: reuses disabled entities when available, spawns new otherwise.
		for (let i = 0; i < spawnCount; i += GamePropManager.SPAWN_BATCH_SIZE) {
			const batchEnd = Math.min(i + GamePropManager.SPAWN_BATCH_SIZE, spawnCount);
			const batch: Promise<Entity | null>[] = [];
			const batchTemplates: TemplateAsset[] = [];

			for (let j = i; j < batchEnd; j++) {
				const spawnPointEntity = allSpawnPoints[j];
				const transform = spawnPointEntity.getComponent(TransformComponent);
				if (!transform) {
					continue;
				}

				const spawnPos = transform.worldPosition.add(new Vec3(0, this.spawnYOffset, 0));
				const template = propsToSpawn[j];

				batch.push(this.propPool.acquire(template, spawnPos, Quaternion.identity));
				batchTemplates.push(template);
			}

			try {
				const entities = await Promise.all(batch);
				for (let k = 0; k < entities.length; k++) {
					const entity = entities[k];
					if (entity) {
						// Ensure pool tracks this entity's template for future release
						this.propPool.track(entity, batchTemplates[k]);
						this.spawnedProps.push(entity);
					}
				}
			} catch (error: unknown) {
				console.log(`[GamePropManager.spawnPropsAtSpawnPoints] Batch acquire failed: ${String(error)}`);
			}

			// Short delay between batches to spread load across frames
			if (batchEnd < spawnCount) {
				await new Promise<void>((resolve): void => {
					setTimeout((): void => {
						if (!this.entity.valid) { resolve(); return; }
						resolve();
					}, GamePropManager.SPAWN_BATCH_DELAY_MS);
				});
			}
		}

		// Fire event AFTER all spawns have resolved
		EventService.sendLocally(PropSpawnCompleteEvent, {
			complete: true,
		});
	}
	// #endregion

	// #region Registration
	/** Refresh the prop registry by scanning all entities with PropData */
	public refreshRegistry(): void {
		this.registeredProps = EntityService.findEntitiesWithComponent(PropData);
	}

	/** Manually register a prop entity */
	public registerProp(entity: Entity): void {
		const propComp = entity.getComponent(PropData);
		if (!propComp) {
			return;
		}
		if (!this.registeredProps.includes(entity)) {
			this.registeredProps.push(entity);
		}
	}

	/** Unregister a prop entity */
	public unregisterProp(entity: Entity): void {
		const idx = this.registeredProps.indexOf(entity);
		if (idx >= 0) {
			this.registeredProps.splice(idx, 1);
		}
	}
	// #endregion

	// #region Queries
	/** Get all registered props */
	public getAllProps(): Entity[] {
		return this.registeredProps;
	}

	/** Filter props by rarity */
	public getByRarity(rarity: PropRarity): Entity[] {
		return this.registeredProps.filter((e: Entity): boolean => {
			const comp = e.getComponent(PropData);
			return comp !== null && comp.rarity === rarity;
		});
	}

	/** Filter props by category */
	public getByCategory(category: PropCategory): Entity[] {
		return this.registeredProps.filter((e: Entity): boolean => {
			const comp = e.getComponent(PropData);
			return comp !== null && comp.category === category;
		});
	}

	/** Filter props by both rarity and category */
	public getByRarityAndCategory(rarity: PropRarity, category: PropCategory): Entity[] {
		return this.registeredProps.filter((e: Entity): boolean => {
			const comp = e.getComponent(PropData);
			return comp !== null && comp.rarity === rarity && comp.category === category;
		});
	}

	/** Get the count of registered props */
	public getCount(): number {
		return this.registeredProps.length;
	}
	// #endregion
}
