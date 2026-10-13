/**
 * GameLevelManager - Controls which level template is spawned into the world.
 *
 * Level selection algorithm (levelId is 1-based):
 * - levelId === 1: always use level0 template
 * - levelId >= 2: randomly pick from level1-level6, no consecutive repeats
 *
 * Uses WorldService.spawnTemplate to spawn level templates as local entities,
 * and Entity.destroy() to unload them.
 *
 * Component Attachment: Scene Entity (the "Level" entity)
 * Component Networking: Local
 * Component Ownership: Not Networked
 */
import type { Entity, Maybe } from "meta/worlds";
import {
	Component,
	NetworkMode,
	TemplateAsset,
	Vec3,
	WorldService,
	component,
	property
} from "meta/worlds";

@component()
export class GameLevelManager extends Component {
	@property()
	public level0: Maybe<TemplateAsset> = null;

	@property()
	public level1: Maybe<TemplateAsset> = null;

	@property()
	public level2: Maybe<TemplateAsset> = null;

	@property()
	public level3: Maybe<TemplateAsset> = null;

	@property()
	public level4: Maybe<TemplateAsset> = null;

	@property()
	public level5: Maybe<TemplateAsset> = null;

	@property()
	public level6: Maybe<TemplateAsset> = null;

	private currentLevelIndex: number = -1;

	/** Tracks the last randomly selected template index (1-4) to avoid consecutive repeats */
	private lastRandomTemplateIndex: number = -1;

	/** Reference to the currently spawned level entity for cleanup */
	private spawnedLevelEntity: Maybe<Entity> = null;

	/** Template indices available for random selection (level1 through level6) */
	private static readonly RANDOM_POOL: readonly number[] = [1, 2, 3, 4, 5, 6];

	/**
	 * Returns the TemplateAsset for the given template index (0-6), or null if invalid.
	 */
	private getTemplateForIndex(index: number): Maybe<TemplateAsset> {
		if (index === 0) {
			return this.level0;
		} else if (index === 1) {
			return this.level1;
		} else if (index === 2) {
			return this.level2;
		} else if (index === 3) {
			return this.level3;
		} else if (index === 4) {
			return this.level4;
		} else if (index === 5) {
			return this.level5;
		} else if (index === 6) {
			return this.level6;
		} else {
			return null;
		}
	}

	/**
	 * Maps a game levelId (1-based) to a template index and returns the template.
	 * - levelId 1 → level0
	 * - levelId 2 → level1
	 * - levelId > 2 → random from level1-level6 (no consecutive repeats)
	 */
	private selectTemplateForLevelId(levelId: number): Maybe<TemplateAsset> {
		if (levelId === 1) {
			this.lastRandomTemplateIndex = 0;
			return this.getTemplateForIndex(0);
		} else if (levelId === 2) {
			this.lastRandomTemplateIndex = 1;
			return this.getTemplateForIndex(1);
		} else if (levelId > 2) {
			// Random selection from level1-level6, avoiding consecutive repeats
			const pool = GameLevelManager.RANDOM_POOL;
			let candidates: number[];
			if (this.lastRandomTemplateIndex >= 0) {
				candidates = pool.filter((idx: number): boolean => {
					return idx !== this.lastRandomTemplateIndex;
				});
			} else {
				candidates = [...pool];
			}
			const chosen = candidates[Math.floor(Math.random() * candidates.length)];
			this.lastRandomTemplateIndex = chosen;
			return this.getTemplateForIndex(chosen);
		}
		return null;
	}

	/**
	 * Destroys the currently spawned level entity if one exists.
	 */
	private destroyCurrentLevel(): void {
		if (this.spawnedLevelEntity) {
			this.spawnedLevelEntity.destroy();
			this.spawnedLevelEntity = null;
		}
	}

	/**
	 * Spawns a level template as a local entity at the world origin.
	 */
	private async spawnLevel(template: TemplateAsset): Promise<void> {
		try {
			const entity = await WorldService.get().spawnTemplate({
				templateAsset: template,
				networkMode: NetworkMode.LocalOnly,
				position: Vec3.zero,
				rotation: null,
				scale: null,
				parent: this.entity,
			});
			this.spawnedLevelEntity = entity;
		} catch (error: unknown) {
			console.log(`[GameLevelManager.spawnLevel] ${String(error)}`);
		}
	}

	/**
	 * Loads the level for the given game levelId (1-based).
	 * Uses the level selection algorithm to pick the appropriate template.
	 * 1. Destroys the current spawned level entity if any
	 * 2. Selects the template via selectTemplateForLevelId
	 * 3. Spawns the template as a local entity
	 */
	public async loadLevel(levelId: number): Promise<void> {
		const template = this.selectTemplateForLevelId(levelId);
		if (!template) {
			console.log(`[GameLevelManager.loadLevel] No template found for levelId=${levelId}`);
			return;
		}
		this.destroyCurrentLevel();
		await this.spawnLevel(template);
		this.currentLevelIndex = levelId;
	}

	/**
	 * Unloads the current level by destroying the spawned entity.
	 */
	public unload(): void {
		if (!this.spawnedLevelEntity) {
			return;
		}
		this.destroyCurrentLevel();
		this.currentLevelIndex = -1;
	}

	/** Returns the currently loaded level index, or -1 if none. */
	public getCurrentLevelIndex(): number {
		return this.currentLevelIndex;
	}

	/** Returns the template index that was last selected (0-4), or -1 if none loaded yet. */
	public getSelectedTemplateIndex(): number {
		return this.lastRandomTemplateIndex;
	}

	/**
	 * Loads a specific template by index for the given levelId, bypassing random selection.
	 * Used when restoring a saved game to load the exact same template.
	 * Falls back to normal loadLevel if the template index is invalid.
	 */
	public async loadLevelWithTemplateIndex(levelId: number, templateIndex: number): Promise<void> {
		const template = this.getTemplateForIndex(templateIndex);
		if (!template) {
			await this.loadLevel(levelId);
			return;
		}
		this.destroyCurrentLevel();
		this.lastRandomTemplateIndex = templateIndex;
		await this.spawnLevel(template);
		this.currentLevelIndex = levelId;
	}
}
