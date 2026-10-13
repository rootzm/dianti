/**
 * GuideMarkerManager - Dual-module guide system (Level0Guide + GlobalGuide).
 *
 * Component Attachment: Scene Entity (Systems)
 * Component Networking: Local
 * Component Ownership: Not Networked
 *
 * Level0Guide (levelId === 1 only, Exploration phase):
 *   Step1: marker at elevator entrance -> advance on waypoint reached
 *   Step2: marker at item room -> advance when inside trigger AND prop picked up
 *   Step3: marker at door -> hide when inside trigger AND door opened
 *
 * GlobalGuide (all levels, Exploration phase):
 *   Step4: inventory full -> show marker at CommitPowerTrigger, repeatable
 *   Step5: elevator energy full -> show marker at PassTrigger
 *   Priority: Step5 > Step4 (only one marker at a time)
 */

import {
	Component,
	EntityService,
	ExecuteOn,
	NetworkMode,
	TemplateAsset,
	TransformComponent,
	Vec3,
	WorldService,
	component,
	property,
	subscribe,
} from 'meta/worlds';
import type { Entity, Maybe } from 'meta/worlds';

import { FloatingRotateAnimation } from '../../Assets/Model/sm_guangbiao/FloatingRotateAnimation';
import { GuideWaypointTrigger } from '../components/GuideWaypointTrigger';
import { DoorState, DoorStateChangedEvent } from '../events/DoorEvents';
import type { DoorStateChangedPayload } from '../events/DoorEvents';
import { GamePhase, GamePhaseChangedEvent, ElevatorEnergyFullEvent } from '../events/GamePhaseEvents';
import type { GamePhaseChangedPayload, ElevatorEnergyFullPayload } from '../events/GamePhaseEvents';
import { GuideWaypointReachedEvent, GuideWaypointExitEvent } from '../events/GuideEvents';
import type { GuideWaypointReachedPayload, GuideWaypointExitPayload } from '../events/GuideEvents';
import { PropPickedUpEvent, PropInventoryChangedEvent } from '../events/PropEvents';
import type { PropPickedUpPayload, PropInventoryChangedPayload } from '../events/PropEvents';
import { GamePhaseManager } from './GamePhaseManager';
import { GamePlayerPropManager } from './GamePlayerPropManager';

/** Level0 waypoint positions */
const STEP1_POS = new Vec3(-7.44147, 1.98531, 1.26849);
const STEP2_POS = new Vec3(-12.5756, 1.98531, -0.195137);
const STEP3_POS = new Vec3(-15.3859, 1.98531, -9.20092);

enum GuideStep {
	Inactive = 0,
	Step1 = 1,
	Step2 = 2,
	Step3 = 3,
	Step4 = 4,
	Step5 = 5,
	Complete = 6,
}

@component()
export class GuideMarkerManager extends Component {
	// --- Template asset for dynamic spawn fallback ---
	@property()
	fxCursorTemplate: TemplateAsset = new TemplateAsset('@Assets/Templates/VFX/FX_cursor.hstf');

	// --- State ---
	private isSpawning: boolean = false;
	private playerInsideTrigger: boolean = false;
	private currentStep: GuideStep = GuideStep.Inactive;
	private isLevel0: boolean = false;
	private level0Complete: boolean = false;
	private globalGuideInitialized: boolean = false;

	// --- Lock flags to eliminate order dependency (Bug 1 & 2 fix) ---
	private step2PropPickedUp: boolean = false;
	private step3DoorOpened: boolean = false;

	// --- Cached references ---
	private markerEntity: Maybe<Entity> = null;
	private markerAnimation: Maybe<FloatingRotateAnimation> = null;
	private triggerTransform: Maybe<TransformComponent> = null;
	private triggerBaseScale: Vec3 = Vec3.zero;
	private commitTriggerWorldPos: Vec3 = Vec3.zero;
	private passTriggerWorldPos: Vec3 = Vec3.zero;

	// =========================================================================
	// PHASE CHANGE: Initialize guides when Exploration starts
	// =========================================================================
	@subscribe(GamePhaseChangedEvent, { execution: ExecuteOn.Everywhere })
	async onPhaseChanged(payload: GamePhaseChangedPayload): Promise<void> {
		if (payload.newPhase !== GamePhase.Exploration) {
			return;
		}

		// Reset state for new exploration phase
		this.playerInsideTrigger = false;
		this.currentStep = GuideStep.Inactive;
		this.step2PropPickedUp = false;
		this.step3DoorOpened = false;

		// Check if level 0
		const phaseManagers = EntityService.findEntitiesWithComponent(GamePhaseManager);
		if (phaseManagers.length === 0) {
			console.log('[GuideMarkerManager] GamePhaseManager not found');
			return;
		}
		const phaseManager = phaseManagers[0].getComponent(GamePhaseManager);
		if (!phaseManager) {
			return;
		}

		this.isLevel0 = phaseManager.levelId === 1;

		// Find marker entity, spawn if not found
		if (!this.markerEntity) {
			await this.findOrSpawnMarkerEntity();
		}
		if (!this.markerEntity) {
			console.log('[GuideMarkerManager] Marker entity not found even after spawn attempt');
			return;
		}

		// Find trigger positions for GlobalGuide
		this.findTriggerPositions();

		// Initialize Level0Guide if applicable
		if (this.isLevel0 && !this.level0Complete) {
			console.log('[GuideMarkerManager] Level0Guide starting');
			this.advanceToStep(GuideStep.Step1);
		} else {
			// Hide marker initially for GlobalGuide-only levels
			this.hideMarker();
		}

		// Mark GlobalGuide as initialized (listens on all levels)
		this.globalGuideInitialized = true;
		console.log('[GuideMarkerManager] GlobalGuide initialized');
	}

	// =========================================================================
	// WAYPOINT REACHED: player entered trigger
	// =========================================================================
	@subscribe(GuideWaypointReachedEvent, { execution: ExecuteOn.Everywhere })
	onWaypointReached(_payload: GuideWaypointReachedPayload): void {
		this.playerInsideTrigger = true;
		console.log('[GuideMarkerManager] playerInsideTrigger = true');

		switch (this.currentStep) {
			case GuideStep.Step1:
				// Level0: Step1 advance on reach
				this.advanceToStep(GuideStep.Step2);
				break;
			case GuideStep.Step2:
				// Level0: Step2 - player entered trigger, try advance
				this.tryAdvanceStep2();
				break;
			case GuideStep.Step3:
				// Level0: Step3 - player entered trigger, try advance
				this.tryAdvanceStep3();
				break;
			case GuideStep.Step4:
			case GuideStep.Step5:
				// GlobalGuide: reaching waypoint hides the marker
				console.log(`[GuideMarkerManager] GlobalGuide step ${this.currentStep} reached, hiding marker`);
				this.hideMarker();
				this.currentStep = GuideStep.Inactive;
				break;
			default:
				break;
		}
	}

	// =========================================================================
	// WAYPOINT EXIT: player left trigger
	// =========================================================================
	@subscribe(GuideWaypointExitEvent, { execution: ExecuteOn.Everywhere })
	onWaypointExit(_payload: GuideWaypointExitPayload): void {
		this.playerInsideTrigger = false;
		console.log('[GuideMarkerManager] playerInsideTrigger = false');
	}

	// =========================================================================
	// PROP PICKED UP: Level0 Step2 condition
	// =========================================================================
	@subscribe(PropPickedUpEvent, { execution: ExecuteOn.Everywhere })
	onPropPickedUp(_payload: PropPickedUpPayload): void {
		if (this.currentStep !== GuideStep.Step2) {
			return;
		}
		this.step2PropPickedUp = true;
		console.log('[GuideMarkerManager] step2PropPickedUp = true');
		this.tryAdvanceStep2();
	}

	// =========================================================================
	// INVENTORY CHANGED: GlobalGuide Step4 condition
	// =========================================================================
	@subscribe(PropInventoryChangedEvent, { execution: ExecuteOn.Everywhere })
	onInventoryChanged(payload: PropInventoryChangedPayload): void {
		if (!this.globalGuideInitialized) {
			return;
		}
		if (payload.changeType !== 'add') {
			return;
		}

		// Step5 has higher priority — don't override it
		if (this.currentStep === GuideStep.Step5) {
			return;
		}

		// Check if inventory is full
		const playerEntity = payload.playerEntity;
		if (!playerEntity) {
			return;
		}

		const propManagers = EntityService.findEntitiesWithComponent(GamePlayerPropManager);
		if (propManagers.length === 0) {
			return;
		}
		const propManager = propManagers[0].getComponent(GamePlayerPropManager);
		if (!propManager) {
			return;
		}

		if (propManager.isInventoryFull(playerEntity)) {
			console.log('[GuideMarkerManager] GlobalGuide Step4: inventory full, showing marker at CommitPowerTrigger');
			this.setTriggerScaleFactor(1.0);
			this.showMarkerAt(this.commitTriggerWorldPos);
			this.currentStep = GuideStep.Step4;
		}
	}

	// =========================================================================
	// ELEVATOR ENERGY FULL: GlobalGuide Step5 trigger
	// =========================================================================
	@subscribe(ElevatorEnergyFullEvent, { execution: ExecuteOn.Everywhere })
	onEnergyFull(_payload: ElevatorEnergyFullPayload): void {
		if (!this.globalGuideInitialized) {
			return;
		}

		console.log('[GuideMarkerManager] GlobalGuide Step5: energy full, showing marker at PassTrigger');
		// Step5 overrides Step4 (higher priority)
		this.setTriggerScaleFactor(1.0);
		this.showMarkerAt(this.passTriggerWorldPos);
		this.currentStep = GuideStep.Step5;
	}

	// =========================================================================
	// DOOR STATE CHANGED: Level0 Step3 condition
	// =========================================================================
	@subscribe(DoorStateChangedEvent, { execution: ExecuteOn.Everywhere })
	onDoorStateChanged(payload: DoorStateChangedPayload): void {
		if (this.currentStep !== GuideStep.Step3) {
			return;
		}
		if (payload.newState === DoorState.Open) {
			this.step3DoorOpened = true;
			console.log('[GuideMarkerManager] step3DoorOpened = true');
			this.tryAdvanceStep3();
		}
	}

	// =========================================================================
	// PRIVATE HELPERS
	// =========================================================================

	// --- Try-advance methods (Bug 1 & 2 fix: order-independent) ---

	private tryAdvanceStep2(): void {
		if (this.currentStep === GuideStep.Step2 && this.playerInsideTrigger && this.step2PropPickedUp) {
			console.log('[GuideMarkerManager] Level0 Step2 complete (inside trigger + prop picked up)');
			this.advanceToStep(GuideStep.Step3);
		}
	}

	private tryAdvanceStep3(): void {
		if (this.currentStep === GuideStep.Step3 && this.playerInsideTrigger && this.step3DoorOpened) {
			console.log('[GuideMarkerManager] Level0 Step3 complete (inside trigger + door opened)');
			this.hideMarker();
			this.level0Complete = true;
			this.currentStep = GuideStep.Inactive;
		}
	}

	private advanceToStep(step: GuideStep): void {
		this.currentStep = step;
		this.playerInsideTrigger = false; // Reset when moving to new position
		console.log(`[GuideMarkerManager] Advancing to step ${step}`);

		// Dynamically resize trigger: Step2/Step3 use 3x scale (effective 4.5m), others use 1x (1.5m)
		if (step === GuideStep.Step2 || step === GuideStep.Step3) {
			this.setTriggerScaleFactor(3.0);
		} else {
			this.setTriggerScaleFactor(1.0);
		}

		switch (step) {
			case GuideStep.Step1:
				this.showMarkerAt(STEP1_POS);
				break;
			case GuideStep.Step2:
				this.showMarkerAt(STEP2_POS);
				break;
			case GuideStep.Step3:
				this.showMarkerAt(STEP3_POS);
				break;
			default:
				break;
		}
	}

	private showMarkerAt(pos: Vec3): void {
		if (!this.markerEntity) {
			return;
		}
		this.markerEntity.enabledSelf = true;
		if (this.markerAnimation) {
			this.markerAnimation.setBasePosition(pos);
		}
	}

	private hideMarker(): void {
		if (this.markerEntity) {
			this.markerEntity.enabledSelf = false;
			console.log('[GuideMarkerManager] Marker hidden');
		}
	}

	/** Scale the trigger collider entity relative to its base scale */
	private setTriggerScaleFactor(factor: number): void {
		if (!this.triggerTransform || this.triggerBaseScale.equals(Vec3.zero)) {
			return;
		}
		const newScale = new Vec3(
			this.triggerBaseScale.x * factor,
			this.triggerBaseScale.y * factor,
			this.triggerBaseScale.z * factor,
		);
		this.triggerTransform.localScale = newScale;
		console.log(`[GuideMarkerManager] Trigger scale factor set to ${factor}`);
	}

	private async findOrSpawnMarkerEntity(): Promise<void> {
		// First try to find an existing entity with GuideWaypointTrigger
		const triggerEntities = EntityService.findEntitiesWithComponent(GuideWaypointTrigger);
		if (triggerEntities.length > 0) {
			this.cacheMarkerFromEntity(triggerEntities[0]);
			return;
		}

		// No existing instance found — spawn from template
		if (this.isSpawning) {
			console.log('[GuideMarkerManager] Already spawning marker, skipping duplicate');
			return;
		}
		this.isSpawning = true;
		console.log('[GuideMarkerManager] No marker found in scene, spawning FX_cursor template');

		try {
			const spawnedEntity = await WorldService.get().spawnTemplate({
				templateAsset: this.fxCursorTemplate,
				networkMode: NetworkMode.LocalOnly,
				position: Vec3.zero,
				rotation: null,
				scale: null,
				parent: null,
				serverOwned: false,
			});

			// Disable immediately so it doesn't flash before showMarkerAt is called
			spawnedEntity.enabledSelf = false;
			console.log('[GuideMarkerManager] FX_cursor spawned successfully');

			// Cache from spawned entity hierarchy
			this.cacheMarkerFromEntity(spawnedEntity);

			// If ancestor walk didn't find it, check children
			if (!this.markerEntity) {
				this.cacheMarkerFromChildren(spawnedEntity);
			}

			// Final fallback: use the spawned root directly
			if (!this.markerEntity) {
				this.markerEntity = spawnedEntity;
				this.markerAnimation = spawnedEntity.getComponent(FloatingRotateAnimation);
				console.log('[GuideMarkerManager] Using spawned root as marker entity (fallback)');
			}
		} catch (err) {
			console.log(`[GuideMarkerManager] Failed to spawn FX_cursor: ${err}`);
		} finally {
			this.isSpawning = false;
		}
	}

	private cacheMarkerFromEntity(triggerEntity: Entity): void {
		// Cache the trigger collider's transform for dynamic radius scaling
		const triggerTf = triggerEntity.getComponent(TransformComponent);
		if (triggerTf) {
			this.triggerTransform = triggerTf;
			this.triggerBaseScale = triggerTf.localScale;
			console.log(`[GuideMarkerManager] Cached trigger base scale: ${this.triggerBaseScale.toString()}`);
		}

		// Walk ancestors to find FloatingRotateAnimation
		for (const ancestor of triggerEntity.getAncestors()) {
			if (ancestor.getComponent(FloatingRotateAnimation)) {
				this.markerEntity = ancestor;
				this.markerAnimation = ancestor.getComponent(FloatingRotateAnimation);
				console.log('[GuideMarkerManager] Found marker entity via ancestor');
				return;
			}
		}

		// Fallback: check trigger entity itself
		if (triggerEntity.getComponent(FloatingRotateAnimation)) {
			this.markerEntity = triggerEntity;
			this.markerAnimation = triggerEntity.getComponent(FloatingRotateAnimation);
			console.log('[GuideMarkerManager] Found marker entity (trigger itself)');
		} else {
			// Last fallback: use first ancestor
			const ancestors = triggerEntity.getAncestors();
			if (ancestors.length > 0) {
				this.markerEntity = ancestors[0];
				this.markerAnimation = ancestors[0].getComponent(FloatingRotateAnimation);
				console.log('[GuideMarkerManager] Using first ancestor as marker entity');
			}
		}
	}

	private cacheMarkerFromChildren(root: Entity): void {
		const children = root.getChildren();
		for (const child of children) {
			if (child.getComponent(FloatingRotateAnimation)) {
				this.markerEntity = child;
				this.markerAnimation = child.getComponent(FloatingRotateAnimation);
				console.log('[GuideMarkerManager] Found marker entity via child');
				return;
			}
			// Check grandchildren
			for (const grandchild of child.getChildren()) {
				if (grandchild.getComponent(FloatingRotateAnimation)) {
					this.markerEntity = grandchild;
					this.markerAnimation = grandchild.getComponent(FloatingRotateAnimation);
					console.log('[GuideMarkerManager] Found marker entity via grandchild');
					return;
				}
			}
		}
	}

	private findTriggerPositions(): void {
		const commitEntities = EntityService.findEntitiesWithName('CommitPowerTrigger');
		if (commitEntities.length > 0) {
			const t = commitEntities[0].getComponent(TransformComponent);
			if (t) {
				this.commitTriggerWorldPos = t.worldPosition;
				console.log(`[GuideMarkerManager] CommitPowerTrigger pos: ${this.commitTriggerWorldPos.toString()}`);
			}
		} else {
			console.log('[GuideMarkerManager] CommitPowerTrigger entity not found');
		}

		const passEntities = EntityService.findEntitiesWithName('PassTrigger');
		if (passEntities.length > 0) {
			const t = passEntities[0].getComponent(TransformComponent);
			if (t) {
				this.passTriggerWorldPos = t.worldPosition;
				console.log(`[GuideMarkerManager] PassTrigger pos: ${this.passTriggerWorldPos.toString()}`);
			}
		} else {
			console.log('[GuideMarkerManager] PassTrigger entity not found');
		}
	}
}
