/**
 * GamePhaseManager — client-local game phase state machine and level progression.
 *
 * Component Attachment: Scene entity (any, e.g. ServerSystems or GameSystems)
 * Component Networking: Local (no networking needed)
 * Component Ownership: Not Networked — runs independently on each client
 *
 * Each client manages its own phase progression independently.
 * Phase transitions are broadcast via LocalEvent so other scripts
 * can subscribe and react (e.g. UI, spawners, enemy managers).
 *
 * Flow: Initialization → Exploration → Settlement (loops Explore→Settle)
 * Initialization only runs once at game start.
 *
 * Level Progression:
 * When the player clicks "Next" on the Victory HUD, LevelTransitionRequestEvent fires.
 * The manager orchestrates: unloadCurrentLevel → loadNextLevel (strict serial await).
 * All sub-system calls (enemies, props, sublevel) are made directly — no broadcast events.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	BasePlayerComponent,
	Component,
	CustomUiComponent,
	EntityService,
	EventService,
	ExecuteOn,
	NetworkingService,
	OnEntityCreateEvent,
	OnEntityStartEvent,
	PlayerInputService,
	TextureAsset,
	TransformComponent,
	component,
	property,
	subscribe,
} from "meta/worlds";
import config from '../../game_config.json';
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import { ElevatorDoorController } from "../components/Elevator";
import { CharacterSimulationController } from "../components/physics/CharacterSimulationController";
import { PlayerLogic } from "../components/PlayerLogic";
import { CharacterUpdateManager } from "../components/update/CharacterUpdateManager";
import { CharacterForceControllerBase } from "../controllers/CharacterForceControllerBase";
import { GameDepotManager } from "../depot/GameDepotManager";
import { AnnouncementElevatorArrivedEvent } from "../events/AnnouncementEvents";
import {
	ElevatorEnergyChangedEvent,
	ElevatorEnergyChangedPayload,
	ElevatorEnergyFullEvent,
	GamePhase,
	GamePhaseChangedEvent,
	GamePhaseChangedLocalEvent,
	LevelInfoPanelClosedEvent,
	LevelResetEvent,
	LevelResetPayload,
	LevelTransitionRequestEvent,
	ShowLevelInfoPanelEvent,
} from "../events/GamePhaseEvents";
import {
	PropDataSnapshot,
} from "../events/PropEvents";
import { PropData } from "../props/PropData";
import { setCurrentLevelId, setCurrentTotalPropCount } from "../props/PropEnergyState";
import { SaveClient } from "../save/SaveClient";
import { HudAnnouncementManager } from "../ui/HudAnnouncementManager";
import { HudGameBackpack } from "../ui/HudGameBackpack";
import { HudGameLoading } from "../ui/HudGameLoading";
import { HudPanelTips } from "../ui/HudPanelTips";
import { GameAssets } from "./GameAssets";
import { CutsceneFinishedEvent } from "../events/CutsceneEvents";
import { HudCutscene } from "../ui/HudCutscene";
import { GameAudio } from "./GameAudio";
import { GameDoorManager } from "./GameDoorManager";
import { GameEnemyManager } from "./GameEnemyManager";
import { GameGuideManager } from "./GameGuideManager";
import { GameLevelManager } from "./GameLevelManager";
import { GamePlayerPropManager } from "./GamePlayerPropManager";
import { GamePropManager } from "./GamePropManager";
import { PropSpotRandomizer } from "./PropSpotRandomizer";

// #region Serialization Types
interface SerializedDepotSlot {
	index: number;
	propName: string;
	weight: number;
	spawnWeight: number;
	usable: boolean;
	baseValue: number;
	useValue: number;
	rarity: number;
	category: number;
}
// #endregion

// Re-export for backwards compatibility
export {
	ElevatorEnergyChangedEvent,
	ElevatorEnergyChangedPayload,
	ElevatorEnergyFullEvent,
	GamePhase,
	GamePhaseChangedEvent,
	GamePhaseChangedLocalEvent,
	GamePhaseChangedPayload,
	LevelInfoPanelClosedEvent,
	LevelResetEvent,
	LevelResetPayload,
	LevelTransitionRequestEvent,
	ShowLevelInfoPanelEvent
} from "../events/GamePhaseEvents";

@component()
export class GamePhaseManager extends Component {
	// #region Properties
	/** Enable debug mode to skip directly to a specific level on game start. */
	@property({ isNetworked: false })
	public debugLevelEnable: boolean = false;

	/** The 1-based level to load when debugLevelEnable is true (e.g. 1 loads level_0, 2 loads level_1). */
	@property({ isNetworked: false })
	public debugLevelId: number = 1;

	/** When true, skip loading save data and instead clear the server-side save (fire-and-forget), starting fresh. */
	@property({ isNetworked: false })
	public debugClearSave: boolean = false;

	/** When true, the energy required to pass a level is maxEnergy (editor value) instead of the formula result. */
	@property({ isNetworked: false })
	public debugEnergyEnable: boolean = false;

	/**
	 * The current game phase, stored locally on each client.
	 * Not networked — each client runs its own phase timer.
	 */
	@property({ isNetworked: false })
	public currentPhase: GamePhase = GamePhase.Initialization;

	/** The current level number (1-based: first floor = 1). */
	@property({ isNetworked: false })
	public levelId: number = 1;
	// #endregion

	// #region Energy Properties
	/** Current accumulated energy */
	@property({ isNetworked: false })
	public currentEnergy: number = 0;

	/** Maximum energy capacity (editable in editor) */
	@property({ isNetworked: false, minValue: 1 })
	public maxEnergy: number = 200;

	// Elevator energy formula values (set from game_config.json)
	private elevatorEnergyBaseValue: number = 256;
	// #endregion

	// #region Constants
	/** Maximum level index supported (level_0 through level_1000) */
	private static readonly MAX_LEVEL_INDEX = 1000;

	/** Polling interval for waiting on async conditions (ms). */
	private static readonly POLL_INTERVAL_MS = 100;

	/** Name of the entity marking the player's spawn position (SpawnPoint in scene) */
	private static readonly PLAYER_POINT_NAME = "SpawnPoint";
	// #endregion

	// #region Level Progression State
	/** Whether a level transition is currently in progress (debounce guard) */
	private transitioning = false;

	/** Resolver for the showLevelInfoAndWait() Promise. Set when waiting for the panel to close. */
	private levelInfoPanelResolver: (() => void) | null = null;

	/** Guard to prevent repeated ElevatorEnergyFullEvent firing */
	private energyFullFired = false;
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityCreateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onCreate(): void {
		// Initialize GameAssets to ensure textures are registered
		GameAssets.init();
	}

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	private onStart(): void {
		// Broadcast initial phase (deferred so all scripts have started)
		setTimeout((): void => {
			if (!this.entity.valid) return;
			this.broadcastPhaseChange(GamePhase.Initialization, GamePhase.Initialization);

			// Emit initial energy state so HudGamePower displays correct values on load
			this.sendEventLocally(ElevatorEnergyChangedEvent, new ElevatorEnergyChangedPayload(
				this.currentEnergy,
				this.maxEnergy,
				0,
			));
		}, 0);

		// Only run the initialization orchestrator on the player client
		if (NetworkingService.get().isPlayerContext()) {
			this.runInitializationSequence().catch((e: unknown): void => {
				console.log(`[GamePhaseManager.onStart] Initialization sequence failed: ${String(e)}`);
			});
		}
	}
	// #endregion

	// #region Level Info Panel Wait
	/**
	 * Subscribe to LevelInfoPanelClosedEvent. When the player closes the panel,
	 * resolve the pending Promise so the flow can continue.
	 */
	@subscribe(LevelInfoPanelClosedEvent, { execution: ExecuteOn.Everywhere })
	private onLevelInfoPanelClosed(): void {
		if (this.levelInfoPanelResolver) {
			const resolve = this.levelInfoPanelResolver;
			this.levelInfoPanelResolver = null;
			resolve();
		}
	}

	/** Timeout for level info panel auto-close (ms) */
	private static readonly LEVEL_INFO_TIMEOUT_MS = 10000;

	/**
	 * Show the level info panel and wait for the player to close it.
	 * Sends ShowLevelInfoPanelEvent, then returns a Promise that resolves
	 * when LevelInfoPanelClosedEvent is received or after a 10s timeout.
	 * If the UI entity is missing, resolves immediately.
	 */
	private showLevelInfoAndWait(): Promise<void> {
		// Check if the UI entity exists; if not, skip waiting
		const uiEntities = EntityService.findEntitiesWithName("HudPanelLevelInfo");
		if (uiEntities.length === 0) {
			console.log('[GamePhaseManager.showLevelInfoAndWait] UI entity HudPanelLevelInfo not found, skipping wait');
			return Promise.resolve();
		}

		return new Promise<void>((resolve): void => {
			this.levelInfoPanelResolver = resolve;
			EventService.sendLocally(ShowLevelInfoPanelEvent, { dummy: 0 });

			// Safety timeout: auto-resolve after 10s if LevelInfoPanelClosedEvent never fires
			setTimeout((): void => {
				if (!this.entity.valid) {
					if (this.levelInfoPanelResolver) {
						const r = this.levelInfoPanelResolver;
						this.levelInfoPanelResolver = null;
						r();
					}
					return;
				}
				if (this.levelInfoPanelResolver) {
					console.log('[GamePhaseManager.showLevelInfoAndWait] Timed out waiting for panel close, auto-resolving');
					const r = this.levelInfoPanelResolver;
					this.levelInfoPanelResolver = null;
					r();
				}
			}, GamePhaseManager.LEVEL_INFO_TIMEOUT_MS);
		});
	}
	// #endregion

	// #region Cutscene
	/** Resolver for the cutscene wait Promise */
	private cutsceneResolver: (() => void) | null = null;

	/**
	 * Subscribe to CutsceneFinishedEvent. When the cutscene ends,
	 * resolve the pending Promise so the flow can continue.
	 */
	@subscribe(CutsceneFinishedEvent, { execution: ExecuteOn.Everywhere })
	private onCutsceneFinished(): void {
		if (this.cutsceneResolver) {
			const resolve = this.cutsceneResolver;
			this.cutsceneResolver = null;
			resolve();
		}
	}

	/**
	 * Find the HudCutscene component, play the cutscene, and wait for it to finish.
	 * If the UI entity is missing, resolves immediately.
	 */
	private playCutsceneAndWait(): Promise<void> {
		const cutsceneEntities = EntityService.findEntitiesWithComponent(HudCutscene);
		if (cutsceneEntities.length === 0) {
			console.log('[GamePhaseManager.playCutsceneAndWait] HudCutscene entity not found, skipping');
			return Promise.resolve();
		}

		const cutscene = cutsceneEntities[0].getComponent(HudCutscene);
		if (!cutscene) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve): void => {
			this.cutsceneResolver = resolve;
			cutscene.playCutscene();

			// Safety timeout: auto-resolve after 50s if CutsceneFinishedEvent never fires
			setTimeout((): void => {
				if (!this.entity.valid) {
					if (this.cutsceneResolver) {
						const r = this.cutsceneResolver;
						this.cutsceneResolver = null;
						r();
					}
					return;
				}
				if (this.cutsceneResolver) {
					console.log('[GamePhaseManager.playCutsceneAndWait] Timed out waiting for cutscene, auto-resolving');
					const r = this.cutsceneResolver;
					this.cutsceneResolver = null;
					r();
				}
			}, 50000);
		});
	}
	// #endregion

	// #region Level Transition Orchestration
	/**
	 * Handle the level transition request from the Victory HUD.
	 * Orchestrates: unloadCurrentLevel → loadNextLevel (strict serial await).
	 */
	@subscribe(LevelTransitionRequestEvent, { execution: ExecuteOn.Everywhere })
	private onTransitionRequest(): void {
		if (this.transitioning) {
			return;
		}

		this.transitioning = true;

		this.performTransition().catch((e: unknown): void => {
			console.log(`[GamePhaseManager.onTransitionRequest] Transition failed: ${String(e)}`);
			this.transitioning = false;
		});
	}

	/**
	 * Handle the level reset request from the Fail HUD (RESTART button).
	 * Resets back to level 1 and re-runs initialization.
	 */
	@subscribe(LevelResetEvent, { execution: ExecuteOn.Everywhere })
	private onLevelReset(payload: LevelResetPayload): void {
		if (this.transitioning) {
			return;
		}

		this.transitioning = true;

		this.performReset(payload.newLevelIndex).catch((e: unknown): void => {
			console.log(`[GamePhaseManager.onLevelReset] Reset failed: ${String(e)}`);
			this.transitioning = false;
		});
	}

	/**
	 * Performs a full game reset: destroys enemies/props, unloads sublevel,
	 * reloads level 1, teleports player, revives player, restarts game.
	 */
	private async performReset(targetLevel: number): Promise<void> {
		// Reset phase to Initialization so that the final startExploration() call
		// will detect a phase change and broadcast GamePhaseChangedEvent correctly.
		this.currentPhase = GamePhase.Initialization;

		// Early save: immediately persist targetLevel (1) to close the race window.
		// If the player quits during the reset flow, next session will load level 1.
		const earlySaveClient = this.findSaveClient();
		if (earlySaveClient) {
			earlySaveClient.saveAsync(targetLevel, "", -1).catch((e: unknown): void => {
				console.log(`[GamePhaseManager.performReset] Early save failed: ${String(e)}`);
			});
		}

		// Step 1: Show loading UI
		this.showLoadingScreen();

		// Step 2: Hide joystick during reset
		PlayerInputService.get().setJoystickVisible(false);

		// Step 3: Find player entity
		const players = EntityService.findEntitiesWithComponent(BasePlayerComponent);
		if (players.length === 0) {
			this.transitioning = false;
			return;
		}
		const playerEntity = players[0];

		// Step 4: Disable player physics simulation
		const updateManager = playerEntity.getComponent(CharacterUpdateManager);
		if (updateManager) {
			updateManager.setActive(false);
		}

		// Step 5: Reset player health and flashlight power to max for the new level
		const playerLogic = playerEntity.getComponent(PlayerLogic);
		if (playerLogic) {
			playerLogic.resetForNewLevel();
		}

		// Step 6: Clear player backpack data
		const playerPropManager = this.entity.getComponent(GamePlayerPropManager);
		if (playerPropManager) {
			playerPropManager.resetForLevelTransition(playerEntity);
		}

		// Step 7: Destroy all enemies
		const enemyManager = this.entity.getComponent(GameEnemyManager);
		if (enemyManager) {
			enemyManager.destroyAllEnemies();
		}

		// Step 8: Destroy all props
		const propManager = this.entity.getComponent(GamePropManager);
		if (propManager) {
			propManager.destroyAllProps();
		}

		// Step 8b: Clear depot storage
		const depot = GameDepotManager.find();
		if (depot) {
			depot.clearAll();
		}

		// Step 8c: Save reset is handled at the top of performReset() (early save to level 1)
		// to close the race window between async save and session restart.

		// Step 8d: Clear entity pools to fix memory leak (entityTemplateMap accumulates stale refs)
		if (enemyManager) {
			enemyManager.clearPool();
		}
		if (propManager) {
			propManager.clearPool();
		}

		// Step 9: Unload current sublevel
		await this.unloadSublevel();

		// Step 10: Reset to target level and load the new sublevel
		this.levelId = targetLevel;
		if (propManager) {
			propManager.setLevelId(this.levelId);
		}
		setCurrentLevelId(this.levelId);
		await this.loadSublevel();
		this.initializeDoors();
		this.randomizeRestoreSpots();

		// Step 10b: Save template index after level selection (reset uses fresh random)
		this.fireAndForgetSave();

		// Step 11: Spawn props (awaited) and enemies (fire-and-forget)
		await this.spawnPropsAndWait();
		this.syncEnergyState();
		// Fire-and-forget: enemies spawn after their level-based grace period
		this.spawnEnemiesAndWait().catch((e) => {
			console.log(`[GamePhaseManager.performReset] Background enemy spawn failed: ${String(e)}`);
		});

		// Step 12: Teleport player to spawn (physics already disabled)
		const simController = this.findSimulationController(playerEntity);
		this.teleportPlayerToPoint(playerEntity, simController);

		// Step 13: Reset camera
		ThirdPersonCamera.get()?.resetCamera();

		// Step 14: Re-enable player physics
		if (updateManager) {
			updateManager.setActive(true);
		}

		// Step 15: Ensure backpack is expanded
		const backpackEntities = EntityService.findEntitiesWithComponent(HudGameBackpack);
		if (backpackEntities.length > 0) {
			const backpack = backpackEntities[0].getComponent(HudGameBackpack);
			if (backpack) {
				backpack.ensureExpanded();
			}
		}

		// Step 16: Hide loading screen
		this.hideLoadingScreen();

		// Step 17: Reset energy
		this.resetEnergy();

		// Step 18: Show level info panel and wait for player to close it
		await this.showLevelInfoAndWait();

		// Step 19: Open elevator doors and wait for them to fully open
		await this.openElevatorDoor();

		// Step 20: Show joystick and begin Exploration phase
		PlayerInputService.get().setJoystickVisible(true);
		this.startExploration();
		this.transitioning = false;
	}

	/**
	 * Orchestrates the full level transition in strict serial order.
	 * Each step completes before the next begins.
	 */
	private async performTransition(): Promise<void> {
		// Reset phase to Initialization so that the final startExploration() call
		// will detect a phase change and broadcast GamePhaseChangedEvent correctly.
		// Without this, currentPhase stays Exploration and transitionTo() short-circuits,
		// leaving PlayerMovementAbility.movementBlocked permanently true.
		this.currentPhase = GamePhase.Initialization;

		const targetLevel = this.levelId + 1;

		if (targetLevel > GamePhaseManager.MAX_LEVEL_INDEX) {
			this.transitioning = false;
			return;
		}

		// Step 1: Hide victory UI
		const victoryEntities = EntityService.findEntitiesWithName("HudPanelVictory");
		if (victoryEntities.length > 0) {
			const victoryUi = victoryEntities[0].getComponent(CustomUiComponent);
			if (victoryUi) {
				victoryUi.isVisible = false;
			}
		}

		// Step 2: Show loading UI and hide joystick
		this.showLoadingScreen();
		PlayerInputService.get().setJoystickVisible(false);

		// Step 3: Find player entity
		const players = EntityService.findEntitiesWithComponent(BasePlayerComponent);
		if (players.length === 0) {
			this.transitioning = false;
			return;
		}
		const playerEntity = players[0];

		// Step 4: Disable player physics simulation
		const updateManager = playerEntity.getComponent(CharacterUpdateManager);
		if (updateManager) {
			updateManager.setActive(false);
		}

		// Step 5: Reset player health and flashlight power to max for the new level
		const playerLogic = playerEntity.getComponent(PlayerLogic);
		if (playerLogic) {
			playerLogic.resetForNewLevel();
		}

		// Step 6: Clear player backpack data
		const playerPropManager = this.entity.getComponent(GamePlayerPropManager);
		if (playerPropManager) {
			playerPropManager.resetForLevelTransition(playerEntity);
		}

		// Step 7: Destroy all enemy instances
		const enemyManager = this.entity.getComponent(GameEnemyManager);
		if (enemyManager) {
			enemyManager.destroyAllEnemies();
		}

		// Step 8: Destroy all prop instances
		const propManager = this.entity.getComponent(GamePropManager);
		if (propManager) {
			propManager.destroyAllProps();
		}

		// Step 8b: Clear entity pools to fix memory leak (entityTemplateMap accumulates stale refs)
		if (enemyManager) {
			enemyManager.clearPool();
		}
		if (propManager) {
			propManager.clearPool();
		}

		// Step 9: Unload current sublevel
		await this.unloadSublevel();

		// Step 10: Increment levelId, sync to propManager, load next sublevel
		this.levelId = targetLevel;
		if (propManager) {
			propManager.setLevelId(this.levelId);
		}
		setCurrentLevelId(this.levelId);

		// Step 10b: Fire-and-forget save after level increment
		this.fireAndForgetSave();

		await this.loadSublevel();
		this.initializeDoors();
		this.randomizeRestoreSpots();

		// Step 11: Spawn props (awaited) and enemies (fire-and-forget)
		await this.spawnPropsAndWait();
		this.syncEnergyState();
		// Update maxEnergy immediately so HUD shows correct value before loading screen hides
		this.updateEnergyForNewLevel();
		// Fire-and-forget: enemies spawn after their level-based grace period
		this.spawnEnemiesAndWait().catch((e) => {
			console.log(`[GamePhaseManager.performTransition] Background enemy spawn failed: ${String(e)}`);
		});

		// Step 12: Teleport player to spawn point (physics already disabled)
		const simController = this.findSimulationController(playerEntity);
		this.teleportPlayerToPoint(playerEntity, simController);

		// Step 13: Reset camera
		ThirdPersonCamera.get()?.resetCamera();

		// Step 14: Re-enable player physics simulation
		if (updateManager) {
			updateManager.setActive(true);
		}

		// Step 15: Ensure backpack is expanded
		const backpackEntities = EntityService.findEntitiesWithComponent(HudGameBackpack);
		if (backpackEntities.length > 0) {
			const backpack = backpackEntities[0].getComponent(HudGameBackpack);
			if (backpack) {
				backpack.ensureExpanded();
			}
		}

		// Step 16: Hide loading screen
		this.hideLoadingScreen();

		// Step 17: Show level info panel and wait for player to close it
		await this.showLevelInfoAndWait();

		// Step 18: Open elevator doors and wait for them to fully open
		await this.openElevatorDoor();

		// Step 19: Show joystick now that doors are open and player can move
		PlayerInputService.get().setJoystickVisible(true);

		// Step 20: Begin the new level — transition to Exploration phase
		this.startExploration();
		this.transitioning = false;
	}
	// #endregion

	// #region Core Level Lifecycle Methods
	/**
	 * Initialize the first level on game start.
	 * Loads sublevel, spawns enemies/props, resets energy.
	 */
	private async initializeLevel(): Promise<void> {
		await this.loadLevelContent();
		this.resetEnergy();
	}

	/**
	 * Shared core: load sublevel → spawn props (awaited) → spawn enemies (background).
	 * Used by initializeLevel only.
	 * Enemy spawning runs in the background so the level-based delay
	 * (up to 100s on Level 1) does not block the initialization sequence.
	 */
	private async loadLevelContent(): Promise<void> {
		await this.loadSublevel();
		this.initializeDoors();
		this.randomizeRestoreSpots();
		await this.spawnPropsAndWait();
		// Fire-and-forget: enemies spawn after their level-based grace period
		// without blocking the init sequence from hiding the loading screen.
		this.spawnEnemiesAndWait().catch((e: unknown): void => {
			console.log(`[GamePhaseManager.loadLevelContent] Background enemy spawn failed: ${String(e)}`);
		});
	}
	// #endregion

	// #region Sequential Initialization Orchestrator
	/**
	 * Strict serial initialization sequence (runs on client only).
	 * Steps must execute in order — no parallel execution.
	 */
	private async runInitializationSequence(): Promise<void> {
		// Show loading screen and start fake progress
		this.showLoadingScreen();

		// Step 1: Wait for the player entity and its CharacterUpdateManager to be initialized
		const playerEntity = await this.waitForPlayerEntity();
		const updateManager = await this.waitForCharacterUpdateManagerInitialized(playerEntity);

		// Step 2: Hide joystick during initialization (player is frozen)
		PlayerInputService.get().setJoystickVisible(false);

		// Step 2b: Apply game_config.json values to all subsystems before spawning
		this.applyGameConfig(playerEntity);

		// Step 3: Load saved progress from SaveClient (or clear if debugClearSave)
		let savedDepotJson = "";
		const saveClient = this.findSaveClient();
		if (this.debugClearSave) {
			// Debug mode: skip loading, reset server-side save (fire-and-forget), use defaults
			if (saveClient) {
				saveClient.resetAsync().catch((e: unknown): void => {
					console.log(`[GamePhaseManager.runInitializationSequence] debugClearSave resetAsync failed: ${String(e)}`);
				});
			}
			this.levelId = 1;
			this.savedLevelTemplateIndex = -1;
		} else if (saveClient) {
			const saveData = await saveClient.loadAsync();
			if (saveData.success === true) {
				this.levelId = saveData.levelId;
				savedDepotJson = saveData.depotJson;
				this.savedLevelTemplateIndex = saveData.levelTemplateIndex;
			}
		}

		// Step 4: Apply debug level override if enabled (takes priority over save data)
		if (this.debugLevelEnable) {
			this.levelId = this.debugLevelId;
		}

		// Step 5: Sync level to prop manager
		const propManager = this.entity.getComponent(GamePropManager);
		if (propManager) {
			propManager.setLevelId(this.levelId);
		}
		setCurrentLevelId(this.levelId);

		// Step 6: Load level content (sublevel + enemies + props + reset energy)
		await this.initializeLevel();
		this.syncEnergyState();

		// Step 6b: Save current template index after level selection
		this.fireAndForgetSave();

		// Step 7: Restore depot from saved data (after sublevel is loaded)
		if (savedDepotJson.length > 0) {
			const depot = GameDepotManager.find();
			if (depot) {
				GamePhaseManager.deserializeDepot(depot, savedDepotJson);
			}
		}

		// Step 8: Teleport player to SpawnPoint
		const simController = this.findSimulationController(playerEntity);
		this.teleportPlayerToPoint(playerEntity, simController);

		// Step 9: Unfreeze player physics
		updateManager.setActive(true);

		// Step 10: Reset camera angles
		ThirdPersonCamera.get()?.resetCamera();

		// Step 11: Wait 1 second for scene to stabilize
		await this.delay(1000);

		// Step 12: Hide loading screen
		this.hideLoadingScreen();

		// Step 12b: Play cutscene on first entry (levelId === 1, not debug mode)
		if (this.levelId === 1 && !this.debugLevelEnable) {
			await this.playCutsceneAndWait();
		}

		// Step 13: Show level info panel and wait for player to close it
		await this.showLevelInfoAndWait();

		// Step 14: Open elevator doors and wait for them to fully open
		await this.openElevatorDoor();

		// Step 15: Wire HudPanelTips to dependent managers, then show joystick and start guide
		PlayerInputService.get().setJoystickVisible(true);

		const tipsEntities = EntityService.findEntitiesWithName("HudPanelTips");
		let tips: Maybe<HudPanelTips> = null;
		if (tipsEntities.length > 0) {
			tips = tipsEntities[0].getComponent(HudPanelTips);
		}

		const guideManager = this.entity.getComponent(GameGuideManager);
		if (guideManager && tips) {
			guideManager.setTips(tips);
		}

		const announcementEntities = EntityService.findEntitiesWithComponent(HudAnnouncementManager);
		if (announcementEntities.length > 0 && tips) {
			const announcer = announcementEntities[0].getComponent(HudAnnouncementManager);
			if (announcer) {
				announcer.setTips(tips);
			}
		}

		if (guideManager) {
			guideManager.playGuide().catch((e: unknown): void => {
				console.log(`[GamePhaseManager.runInitializationSequence] playGuide failed: ${String(e)}`);
			});
		}

		// Step 16: Complete initialization — transition to Exploration phase
		this.startExploration();
	}
	//#endregion

	// #region Initialization Helpers
	/** Maximum polling attempts before timeout (300 × 100ms = 30s) */
	private static readonly MAX_POLL_ATTEMPTS = 300;

	/** Poll until a player entity with BasePlayerComponent exists */
	private waitForPlayerEntity(): Promise<Entity> {
		return new Promise<Entity>((resolve, reject): void => {
			let attempts = 0;
			const check = (): void => {
				const players = EntityService.findEntitiesWithComponent(BasePlayerComponent);
				if (players.length > 0) {
					resolve(players[0]);
				} else {
					attempts++;
					if (attempts >= GamePhaseManager.MAX_POLL_ATTEMPTS) {
						console.error(`[GamePhaseManager.waitForPlayerEntity] Timed out after ${attempts} attempts (${attempts * GamePhaseManager.POLL_INTERVAL_MS}ms)`);
						reject(new Error('waitForPlayerEntity timed out'));
					} else {
						setTimeout((): void => {
							if (!this.entity.valid) { reject(new Error('entity destroyed')); return; }
							check();
						}, GamePhaseManager.POLL_INTERVAL_MS);
					}
				}
			};
			check();
		});
	}

	/** Poll until CharacterUpdateManager on the player is initialized */
	private waitForCharacterUpdateManagerInitialized(playerEntity: Entity): Promise<CharacterUpdateManager> {
		return new Promise<CharacterUpdateManager>((resolve, reject): void => {
			let attempts = 0;
			const check = (): void => {
				const mgr = playerEntity.getComponent(CharacterUpdateManager);
				if (mgr && mgr.isInitialized) {
					resolve(mgr);
				} else {
					attempts++;
					if (attempts >= GamePhaseManager.MAX_POLL_ATTEMPTS) {
						console.error(`[GamePhaseManager.waitForCharacterUpdateManagerInitialized] Timed out after ${attempts} attempts (${attempts * GamePhaseManager.POLL_INTERVAL_MS}ms)`);
						reject(new Error('waitForCharacterUpdateManagerInitialized timed out'));
					} else {
						setTimeout((): void => {
							if (!this.entity.valid) { reject(new Error('entity destroyed')); return; }
							check();
						}, GamePhaseManager.POLL_INTERVAL_MS);
					}
				}
			};
			check();
		});
	}

	/**
	 * Apply game_config.json values to all subsystems.
	 * Called once during initialization before spawning enemies/props.
	 */
	private applyGameConfig(playerEntity: Entity): void {
		// --- GameEnemyManager ---
		const enemyManager = this.entity.getComponent(GameEnemyManager);
		if (enemyManager) {
			enemyManager.baseDelay = config.enemySpawning.baseDelay;
			enemyManager.delayReduction = config.enemySpawning.delayReduction;
			enemyManager.spawnMultiplier = config.enemySpawning.spawnMultiplier;
			enemyManager.spawnBase = config.enemySpawning.spawnBase;

			// Store enemy AI config for post-spawn application
			enemyManager.cfgPatrolSpeed = config.enemyAI.patrolSpeed;
			enemyManager.cfgChaseSpeed = config.enemyAI.chaseSpeed;
			enemyManager.cfgArrivalThreshold = config.enemyAI.arrivalThreshold;
			enemyManager.cfgLoseChaseDist = config.enemyAI.loseChaseDist;
			enemyManager.cfgAttackRange = config.enemyAI.attackRange;
			enemyManager.cfgAttackDisengageRange = config.enemyAI.attackDisengageRange;
			enemyManager.cfgAttackCooldown = config.enemyAI.attackCooldown;
			enemyManager.cfgAttackDamage = config.enemyAI.attackDamage;

			// Store EnemyFov config
			enemyManager.cfgFovAngle = config.enemyFov.fovAngle;
			enemyManager.cfgDetectionRange = config.enemyFov.detectionRange;
		}

		// --- PlayerLogic ---
		const playerLogic = playerEntity.getComponent(PlayerLogic);
		if (playerLogic) {
			playerLogic.maxHealthValue = config.player.maxHealthValue;
			playerLogic.invulnerabilityDuration = config.player.invulnerabilityDuration;
			playerLogic.maxPowerValue = config.player.maxPowerValue;
			playerLogic.powerDrainRate = config.player.powerDrainRate;
		}

		// --- GamePropManager ---
		const propManager = this.entity.getComponent(GamePropManager);
		if (propManager) {
			propManager.maxTotalProps = config.props.maxTotalProps;
			propManager.spawnYOffset = config.props.spawnYOffset;
			propManager.propCountBase = config.props.propCountFormula.base;
			propManager.propCountPerLevel = config.props.propCountFormula.perLevel;
			propManager.energyDivisor = config.props.energyFormula.divisor;
		}

		// --- GamePlayerPropManager ---
		const playerPropManager = this.entity.getComponent(GamePlayerPropManager);
		if (playerPropManager) {
			playerPropManager.maxInventorySize = config.props.maxInventorySize;
		}

		// --- Elevator Energy ---
		this.elevatorEnergyBaseValue = config.elevatorEnergy.baseValue;

		// --- Reset player current values to match config overrides ---
		// PlayerLogic.onStart() already fired before applyGameConfig runs (timing:
		// waitForPlayerEntity resolves AFTER the player entity starts), so
		// currentPowerValue/currentHealthValue were initialized from the old
		// template-serialized maxPowerValue/maxHealthValue. Reset them now.
		if (playerLogic) {
			playerLogic.resetForNewLevel();
		}
	}

	/** Find the CharacterSimulationController on the player's simulated child entity */
	private findSimulationController(playerEntity: Entity): Maybe<CharacterSimulationController> {
		const children = playerEntity.getChildrenWithComponent(CharacterSimulationController, true);
		if (children.length > 0) {
			return children[0].getComponent(CharacterSimulationController);
		}
		return null;
	}

	/** Load the sublevel via GameLevelManager on the "Level" entity */
	private async loadSublevel(): Promise<void> {
		// Find the "Level" entity that has GameLevelManager
		const levelEntities = EntityService.findEntitiesWithName("Level");
		if (levelEntities.length === 0) {
			return;
		}

		const levelManager = levelEntities[0].getComponent(GameLevelManager);
		if (!levelManager) {
			return;
		}

		// If we have a saved template index, use it to load the specific template
		if (this.savedLevelTemplateIndex >= 0) {
			const templateIndex = this.savedLevelTemplateIndex;
			this.savedLevelTemplateIndex = -1; // Consume it so subsequent loads use random
			await levelManager.loadLevelWithTemplateIndex(this.levelId, templateIndex);
		} else {
			// Load the current levelId with random selection and wait until the sublevel is fully active
			await levelManager.loadLevel(this.levelId);
		}
	}

	/** Unload the sublevel via GameLevelManager on the "Level" entity */
	private async unloadSublevel(): Promise<void> {
		const levelEntities = EntityService.findEntitiesWithName("Level");
		if (levelEntities.length === 0) {
			return;
		}

		const levelManager = levelEntities[0].getComponent(GameLevelManager);
		if (!levelManager) {
			return;
		}

		await levelManager.unload();
	}

	/** Spawn enemies via GameEnemyManager (with level-based delay) and await completion */
	private async spawnEnemiesAndWait(): Promise<void> {
		const enemyManager = this.entity.getComponent(GameEnemyManager);
		if (!enemyManager) {
			return;
		}
		await enemyManager.spawnEnemiesWithDelay(this.levelId);
	}

	/** Spawn props via GamePropManager and await completion */
	private async spawnPropsAndWait(): Promise<void> {
		const propManager = this.entity.getComponent(GamePropManager);
		if (!propManager) {
			return;
		}
		await propManager.spawnPropsAtSpawnPoints();
	}

	/**
	 * Teleport the player to the SpawnPoint entity position.
	 * Uses resetToPosition() which clears all variable data to defaults and
	 * sets both characterRootTransform and simulatedTransform worldPosition.
	 * Must be called while physics is disabled (CharacterUpdateManager.setActive(false)).
	 */
	private teleportPlayerToPoint(playerEntity: Entity, simController: Maybe<CharacterSimulationController>): void {
		// Find the SpawnPoint entity in the scene
		const points = EntityService.findEntitiesWithName(GamePhaseManager.PLAYER_POINT_NAME);
		if (points.length === 0) {
			return;
		}

		const pointTransform = points[0].getComponent(TransformComponent);
		if (!pointTransform) {
			return;
		}

		const targetPos = pointTransform.worldPosition;
		const targetRot = pointTransform.worldRotation;

		// resetToPosition clears velocity, inputForce, desiredTranslation, sampledVelocity,
		// disableForcesForSingleFrame and teleports both characterRootTransform and simulatedTransform
		// to the target position and rotation.
		const simEntity = simController?.entity;
		if (simEntity) {
			const forceController = simEntity.getComponent(CharacterForceControllerBase);
			if (forceController) {
				forceController.resetToPosition(targetPos, targetRot);
			}
		}
	}

	/** Promise-based delay utility */
	private delay(ms: number): Promise<void> {
		return new Promise<void>((resolve): void => {
			setTimeout((): void => {
				if (!this.entity.valid) { resolve(); return; }
				resolve();
			}, ms);
		});
	}

	/** Find and open the elevator door via ElevatorDoorController. Returns a Promise that resolves when doors are fully open. */
	private async openElevatorDoor(): Promise<void> {
		const elevatorEntities = EntityService.findEntitiesWithComponent(ElevatorDoorController);
		if (elevatorEntities.length > 0) {
			const doorController = elevatorEntities[0].getComponent(ElevatorDoorController);
			if (doorController) {
				await doorController.openDoors();
			}
		}
	}

	/** Show the loading screen overlay and start fake progress */
	private showLoadingScreen(): void {
		const statusEntities = EntityService.findEntitiesWithName("HudGameLoading");
		if (statusEntities.length > 0) {
			const loading = statusEntities[0].getComponent(HudGameLoading);
			if (loading) {
				loading.show();
			}
		}
		GameAudio.stopRandomAmbient();
	}

	/** Trigger the loading screen finish animation and hide */
	private hideLoadingScreen(): void {
		const statusEntities = EntityService.findEntitiesWithName("HudGameLoading");
		if (statusEntities.length > 0) {
			const loading = statusEntities[0].getComponent(HudGameLoading);
			if (loading) {
				loading.hide();
			}
		}
		GameAudio.startRandomAmbient();
	}

	/**
	 * Calculate the energy requirement for a given level (1-based).
	 * Formula: baseValue × levelId²
	 */
	public getEnergyRequirementForLevel(levelId: number): number {
		const level = Math.max(1, levelId);
		return this.elevatorEnergyBaseValue * level * level;
	}

	/** Reset energy to zero and set maxEnergy for the current level. Used on game start and full resets. */
	private resetEnergy(): void {
		if (!this.debugEnergyEnable) {
			this.maxEnergy = this.getEnergyRequirementForLevel(this.levelId);
		}
		this.currentEnergy = 0;
		this.energyFullFired = false;
		this.sendEventLocally(ElevatorEnergyChangedEvent, new ElevatorEnergyChangedPayload(
			0,
			this.maxEnergy,
			0,
		));
	}

	/**
	 * Update maxEnergy for the new level WITHOUT resetting currentEnergy.
	 * Called after a level transition so the player keeps accumulated energy.
	 */
	private updateEnergyForNewLevel(): void {
		if (!this.debugEnergyEnable) {
			this.maxEnergy = this.getEnergyRequirementForLevel(this.levelId);
		}
		this.sendEventLocally(ElevatorEnergyChangedEvent, new ElevatorEnergyChangedPayload(
			this.currentEnergy,
			this.maxEnergy,
			0,
		));
	}
	// #endregion

	/** Randomize pre-placed HP/MP restore item spots for the current level. */
	private randomizeRestoreSpots(): void {
		const randomizer = this.entity.getComponent(PropSpotRandomizer);
		if (randomizer) {
			randomizer.randomizeSpots(this.levelId);
		}
	}

	/** Initialize door states in the current level via GameDoorManager after sublevel load. */
	private initializeDoors(): void {
		const doorManager = this.entity.getComponent(GameDoorManager);
		if (doorManager) {
			doorManager.initializeDoors();
			console.log("[GamePhaseManager] initializeDoors called");
		}
	}

	// #region Energy Management
	/**
	 * Sync the PropEnergyState shared module with current levelId and totalPropCount.
	 * Called after props are spawned so getTotalPropCount() returns accurate data.
	 */
	private syncEnergyState(): void {
		setCurrentLevelId(this.levelId);
		const propManager = this.entity.getComponent(GamePropManager);
		if (propManager) {
			const count = propManager.getTotalPropCount();
			setCurrentTotalPropCount(count > 0 ? count : 1);
		}
	}

	/**
	 * Add energy to the elevator. Energy can exceed maxEnergy (no cap).
	 * @returns The actual amount of energy added.
	 */
	public addEnergy(amount: number): number {
		if (amount <= 0) {
			return 0;
		}

		const before = this.currentEnergy;
		this.currentEnergy = this.currentEnergy + amount;
		const actualAdded = this.currentEnergy - before;

		if (actualAdded > 0) {
			this.sendEventLocally(ElevatorEnergyChangedEvent, new ElevatorEnergyChangedPayload(
				this.currentEnergy,
				this.maxEnergy,
				actualAdded,
			));

			// Check if energy just reached max — emit full event once (guarded)
			if (this.currentEnergy >= this.maxEnergy && !this.energyFullFired) {
				this.energyFullFired = true;
				this.sendEventLocally(ElevatorEnergyFullEvent, {
					dummy: 0,
				});
			}
		}

		return actualAdded;
	}

	/** Check if energy is at maximum */
	public isFull(): boolean {
		return this.currentEnergy >= this.maxEnergy;
	}
	// #endregion

	// #region Phase Transitions
	/** Transition to the Exploration phase. */
	public startExploration(): void {
		this.transitionTo(GamePhase.Exploration);
		EventService.sendLocally(AnnouncementElevatorArrivedEvent, { dummy: 0 });
	}

	/** Transition to the Settlement phase. */
	public startSettlement(): void {
		this.transitionTo(GamePhase.Settlement);
	}

	/**
	 * Internal transition logic. Sets the new phase and broadcasts
	 * the GamePhaseChangedEvent locally.
	 */
	private transitionTo(newPhase: GamePhase): void {
		if (this.currentPhase === newPhase) {
			return;
		}

		const previousPhase = this.currentPhase;
		this.currentPhase = newPhase;

		this.broadcastPhaseChange(previousPhase, newPhase);
	}

	/**
	 * Sends both the primary GamePhaseChangedEvent and the legacy
	 * GamePhaseChangedLocalEvent so all subscribers receive the notification.
	 */
	private broadcastPhaseChange(previousPhase: GamePhase, newPhase: GamePhase): void {
		EventService.sendLocally(GamePhaseChangedEvent, {
			previousPhase: previousPhase,
			newPhase: newPhase,
		});

		EventService.sendLocally(GamePhaseChangedLocalEvent, {
			previousPhase: previousPhase,
			newPhase: newPhase,
		});
	}
	// #endregion

	// #region Save/Load Integration
	/** Find the SaveClient component from the player entity in the scene */
	private findSaveClient(): Maybe<SaveClient> {
		const entities = EntityService.findEntitiesWithComponent(SaveClient);
		if (entities.length === 0) {
			return null;
		}
		return entities[0].getComponent(SaveClient);
	}

	/** The saved level template index from the last load, or -1 if none. Used during initialization only. */
	private savedLevelTemplateIndex: number = -1;

	/** Serialize the depot contents to a JSON string (icon excluded since it cannot be serialized) */
	private static serializeDepot(depot: GameDepotManager): string {
		const items = depot.getAllItems();
		const serialized: SerializedDepotSlot[] = [];
		for (let i = 0; i < items.length; i++) {
			const entry = items[i];
			serialized.push({
				index: entry.index,
				propName: entry.slot.propData.propName,
				weight: entry.slot.propData.weight,
				spawnWeight: entry.slot.propData.spawnWeight,
				usable: entry.slot.propData.usable,
				baseValue: entry.slot.propData.baseValue,
				useValue: entry.slot.propData.useValue,
				rarity: entry.slot.propData.rarity,
				category: entry.slot.propData.category,
			});
		}
		return JSON.stringify(serialized);
	}

	/** Deserialize a JSON string and populate the depot with prop data */
	private static deserializeDepot(depot: GameDepotManager, json: string): void {
		if (!json || json.length === 0) {
			return;
		}
		let parsed: SerializedDepotSlot[];
		try {
			parsed = JSON.parse(json) as SerializedDepotSlot[];
		} catch (e: unknown) {
			console.log(`[GamePhaseManager.deserializeDepot] Failed to parse depot JSON: ${String(e)}`);
			return;
		}
		// Build a runtime propName → icon map from live PropData entities in the scene
		const iconMap = GamePhaseManager.buildPropIconMap();
		depot.clearAll();
		for (let i = 0; i < parsed.length; i++) {
			const entry = parsed[i];
			const icon = iconMap.get(entry.propName) ?? null;
			const snapshot = new PropDataSnapshot(
				entry.propName,
				entry.weight,
				entry.spawnWeight,
				entry.usable,
				entry.baseValue,
				entry.rarity,
				entry.category,
				icon,
				entry.useValue,
			);
			depot.addItemAt(entry.index, snapshot);
		}
	}

	/**
	 * Scan all live entities with PropData and build a propName → icon map.
	 * Called during deserialization to resolve icons that cannot be serialized to JSON.
	 */
	private static buildPropIconMap(): Map<string, TextureAsset> {
		const map = new Map<string, TextureAsset>();
		const entities = EntityService.findEntitiesWithComponent(PropData);
		for (let i = 0; i < entities.length; i++) {
			const propData = entities[i].getComponent(PropData);
			if (!propData) {
				continue;
			}
			if (propData.propName.length === 0 || !propData.icon) {
				continue;
			}
			if (!map.has(propData.propName)) {
				map.set(propData.propName, propData.icon);
			}
		}
		return map;
	}

	/** Fire-and-forget save of current level and depot state */
	private fireAndForgetSave(): void {
		const saveClient = this.findSaveClient();
		if (!saveClient) {
			return;
		}
		const depot = GameDepotManager.find();
		let depotJson = "";
		if (depot) {
			depotJson = GamePhaseManager.serializeDepot(depot);
		}
		const templateIndex = this.getCurrentTemplateIndex();
		saveClient.saveAsync(this.levelId, depotJson, templateIndex).catch((e: unknown): void => {
			console.log(`[GamePhaseManager.fireAndForgetSave] ${String(e)}`);
		});
	}

	/** Get the current template index from GameLevelManager */
	private getCurrentTemplateIndex(): number {
		const levelEntities = EntityService.findEntitiesWithName("Level");
		if (levelEntities.length === 0) {
			return -1;
		}
		const levelManager = levelEntities[0].getComponent(GameLevelManager);
		if (!levelManager) {
			return -1;
		}
		return levelManager.getSelectedTemplateIndex();
	}

	// #endregion
}

