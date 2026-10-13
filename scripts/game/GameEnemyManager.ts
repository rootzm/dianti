/**
 * GameEnemyManager - Spawns enemies at random spawn points under "EnemyPoints" parent.
 *
 * Component Attachment: Scene Entity (ServerSystems or any scene entity)
 * Component Networking: Not Networked (local logic only)
 * Component Ownership: Not Networked - runs on every client independently
 *
 * This script runs on every client (ExecuteOn.Everywhere).
 * Each client independently finds spawn point entities under the "EnemyPoints" parent entity,
 * and spawns ((currentLevel - 1) * spawnMultiplier + spawnBase) enemies at randomly selected spawn points.
 * currentLevel is 1-based: Level 1 = 1 enemy (with defaults), Level 2 = 3 enemies, etc.
 *
 * Enemies are spawned as LocalOnly entities (each client has its own independent copy).
 * Destruction and re-spawning are orchestrated by GamePhaseManager via direct method calls.
 */

import type {
	Entity,
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
	subscribe,
	TemplateAsset,
	TransformComponent,
	WorldService,
} from "meta/worlds";
import { EnemySpawnCompleteEvent } from "../events/GamePhaseEvents";
import { EnemyDebug } from "../components/EnemyDebug";
import { CharacterUpdateManager } from "../components/update/CharacterUpdateManager";
import { EnemyLogic } from "../components/EnemyLogic";
import { EnemyFov } from "../components/EnemyFov";
import { EntityPool } from "../utils/EntityPool";

@component()
export class GameEnemyManager extends Component {
	private static readonly SPAWN_PARENT_NAME = "EnemyPoints";

	@property()
	public readonly enemyTemplates: readonly TemplateAsset[] = [];

	/** Base delay in seconds before enemies spawn after level load. Reduced per level. */
	@property({ minValue: 0, maxValue: 300 })
	public baseDelay: number = 100;

	/** Seconds subtracted from baseDelay per level above 1 (Level 1 = full delay, Level 6+ = 0). */
	@property({ minValue: 0, maxValue: 100 })
	public delayReduction: number = 20;

	/** Multiplier applied to (currentLevel - 1) in spawn count formula: (currentLevel - 1) * multiplier + base. */
	@property({ minValue: 1, maxValue: 20 })
	public spawnMultiplier: number = 2;

	/** Base number of enemies added to the spawn count formula: (currentLevel - 1) * multiplier + base. */
	@property({ minValue: 0, maxValue: 20 })
	public spawnBase: number = 1;

	// #region Enemy AI Config (set by GamePhaseManager from game_config.json)
	/** EnemyLogic.patrolSpeed override (applied to each spawned enemy). -1 = use template default. */
	public cfgPatrolSpeed: number = -1;
	/** EnemyLogic.chaseSpeed override. */
	public cfgChaseSpeed: number = -1;
	/** EnemyLogic.arrivalThreshold override. */
	public cfgArrivalThreshold: number = -1;
	/** EnemyLogic.loseChaseDist override. */
	public cfgLoseChaseDist: number = -1;
	/** EnemyLogic.attackRange override. */
	public cfgAttackRange: number = -1;
	/** EnemyLogic.attackDisengageRange override. */
	public cfgAttackDisengageRange: number = -1;
	/** EnemyLogic.attackCooldown override. */
	public cfgAttackCooldown: number = -1;
	/** EnemyLogic.attackDamage override. */
	public cfgAttackDamage: number = -1;
	/** EnemyFov.fovAngle override. */
	public cfgFovAngle: number = -1;
	/** EnemyFov.detectionRange override. */
	public cfgDetectionRange: number = -1;
	// #endregion

	/** References to spawned enemies (one per spawn point, local to this client) */
	private activeEnemies: Entity[] = [];

	/** Entity pool for reusing enemy entities across levels */
	private enemyPool: EntityPool = new EntityPool();

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		// Initial spawn is handled by GamePhaseManager orchestrator after sublevel loads.
		// No auto-spawn here — spawn points live in the sublevel which isn't loaded yet.
	}

	/** Destroy all pooled entities and clear the tracking map. Called by GamePhaseManager after destroyAllEnemies(). */
	public clearPool(): void {
		this.enemyPool.destroyAll();
		console.log('[GameEnemyManager] clearPool: destroyed all pooled entities and cleared entityTemplateMap');
	}

	/** Destroy all currently active enemy entities. Called by GamePhaseManager during level unload. */
	public destroyAllEnemies(): void {
		for (const enemy of this.activeEnemies) {
			if (enemy.valid) {
				this.resetAndReleaseEnemy(enemy);
			}
		}
		this.activeEnemies = [];
	}

	/**
	 * Internal: reset enemy state and return to pool.
	 */
	private resetAndReleaseEnemy(enemy: Entity): void {
		// Deactivate physics/character update
		const updateManager = enemy.getComponent(CharacterUpdateManager);
		if (updateManager) {
			updateManager.setActive(false);
		}

		// Reset AI state
		const enemyLogic = enemy.getComponent(EnemyLogic);
		if (enemyLogic) {
			enemyLogic.resetForPool();
		}

		// Reset FOV state
		const enemyFov = enemy.getComponent(EnemyFov);
		if (enemyFov) {
			enemyFov.resetForPool();
		}

		// Return to pool (disables entity and parks offscreen)
		this.enemyPool.release(enemy);
	}

	/**
	 * Spawn enemies after a level-dependent delay.
	 * Delay = max(0, baseDelay - (currentLevel - 1) * delayReduction).
	 * Level 1 = 100s, Level 2 = 80s, ..., Level 6+ = 0s (with defaults).
	 */
	public async spawnEnemiesWithDelay(currentLevel: number): Promise<void> {
		const delaySeconds = Math.max(0, this.baseDelay - (currentLevel - 1) * this.delayReduction);
		if (delaySeconds > 0) {
			await new Promise<void>((resolve: () => void): void => {
				setTimeout((): void => {
					if (!this.entity.valid) { resolve(); return; }
					resolve();
				}, delaySeconds * 1000);
			});
		}
		await this.spawnEnemiesAtAllPoints(currentLevel);
	}

	public async spawnEnemiesAtAllPoints(currentLevel: number = 0): Promise<void> {
		if (this.enemyTemplates.length === 0) {
			return;
		}
		// Find spawn point entities under the "EnemyPoints" parent entity
		const parentEntities = EntityService.findEntitiesWithName(GameEnemyManager.SPAWN_PARENT_NAME);
		if (parentEntities.length === 0) {
			return;
		}
		const parentEntity = parentEntities[0];
		const children = parentEntity.getChildren();
		if (children.length === 0) {
			return;
		}
		// Filter to children that have a valid transform (usable spawn points)
		const spawnPoints: Entity[] = [];
		for (const child of children) {
			const transform = child.getComponent(TransformComponent);
			if (transform) {
				spawnPoints.push(child);
			}
		}
		if (spawnPoints.length === 0) {
			return;
		}
		// Calculate enemy count: (currentLevel - 1) * multiplier + base
		// Level 1 = 1 enemy, Level 2 = 3 enemies, Level 3 = 5 enemies (with defaults)
		const enemyCount = (currentLevel - 1) * this.spawnMultiplier + this.spawnBase;
		for (let i = 0; i < enemyCount; i++) {
			// Randomly select a spawn point (positions can repeat)
			const randomIndex = Math.floor(Math.random() * spawnPoints.length);
			const spawnPoint = spawnPoints[randomIndex];
			const transform = spawnPoint.getComponent(TransformComponent)!;
			const position = transform.worldPosition;
			const rotation = transform.worldRotation;
			try {
				// Randomly select a template from the array for each enemy
				const templateIndex = Math.floor(Math.random() * this.enemyTemplates.length);
				const selectedTemplate = this.enemyTemplates[templateIndex];

				// Acquire from pool (reuses disabled entity or spawns new)
				const enemy = await this.enemyPool.acquire(selectedTemplate, position, rotation);
				if (!enemy) {
					console.log(`[GameEnemyManager.spawnEnemiesAtAllPoints] Pool acquire returned null`);
					continue;
				}
				// Track in pool for future release
				this.enemyPool.track(enemy, selectedTemplate);
				this.activeEnemies.push(enemy);

				// Set the debug display name to the spawn point entity's name
				const spawnPointName = spawnPoint.name;
				const enemyDebug = enemy.getComponent(EnemyDebug);
				if (enemyDebug) {
					enemyDebug.setName(spawnPointName);
				}

				// Refresh patrol points for new sublevel
				const enemyLogic = enemy.getComponent(EnemyLogic);
				if (enemyLogic) {
					enemyLogic.refreshPatrolPoints();
				}

				// Delayed activation: enable physics then AI after a short delay
				new Promise<void>((resolve: () => void): void => {
					setTimeout((): void => {
						if (!this.entity.valid) { resolve(); return; }
						resolve();
					}, 100);
				}).then((): void => {
					if (!enemy.valid || !enemy.isEnabled()) {
						return;
					}
					const updateManager = enemy.getComponent(CharacterUpdateManager);
					if (updateManager) {
						updateManager.setActive(true);
					}
					// Apply config overrides to spawned enemy AI
					this.applyEnemyConfig(enemy);
					const logic = enemy.getComponent(EnemyLogic);
					if (logic) {
						logic.activate();
					}
				}).catch((e: unknown): void => {
					console.log(`[GameEnemyManager.spawnEnemiesAtAllPoints] Delayed activation failed: ${String(e)}`);
				});
			} catch (e: unknown) {
				console.log(`[GameEnemyManager.spawnEnemiesAtAllPoints] ${String(e)}`);
			}
		}
		EventService.sendLocally(EnemySpawnCompleteEvent, {
			complete: true,
		});
	}

	/**
	 * Apply config overrides from game_config.json to a spawned enemy.
	 * Only overrides values that are >= 0 (negative means use template default).
	 */
	private applyEnemyConfig(enemy: Entity): void {
		const logic = enemy.getComponent(EnemyLogic);
		if (logic) {
			if (this.cfgPatrolSpeed >= 0) { logic.patrolSpeed = this.cfgPatrolSpeed; }
			if (this.cfgChaseSpeed >= 0) { logic.chaseSpeed = this.cfgChaseSpeed; }
			if (this.cfgArrivalThreshold >= 0) { logic.arrivalThreshold = this.cfgArrivalThreshold; }
			if (this.cfgLoseChaseDist >= 0) { logic.loseChaseDist = this.cfgLoseChaseDist; }
			if (this.cfgAttackRange >= 0) { logic.attackRange = this.cfgAttackRange; }
			if (this.cfgAttackDisengageRange >= 0) { logic.attackDisengageRange = this.cfgAttackDisengageRange; }
			if (this.cfgAttackCooldown >= 0) { logic.attackCooldown = this.cfgAttackCooldown; }
			if (this.cfgAttackDamage >= 0) { logic.attackDamage = this.cfgAttackDamage; }
		}
		const fov = enemy.getComponent(EnemyFov);
		if (fov) {
			if (this.cfgFovAngle >= 0) { fov.fovAngle = this.cfgFovAngle; }
			if (this.cfgDetectionRange >= 0) { fov.detectionRange = this.cfgDetectionRange; }
		}
	}
}
