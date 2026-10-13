/**
 * DoorLogic - Central door brain managing state machine, health, vertical slide animation,
 * and NavMesh obstacle toggling.
 *
 * Component Attachment: Scene Entity (the door's root/pivot entity in the level template)
 * Component Networking: Local (no networking — doors are level-local)
 * Component Ownership: Not Networked
 *
 * Entity hierarchy expected:
 *   DoorRoot (this component + PhysicsBody StaticCollision + ColliderBox as air wall)
 *     └─ sm_menban (door mesh child — slides vertically for open/close)
 *
 * States:
 *   Closed — collider enabled, NavMesh obstacle active, interactable (player can open)
 *   Open   — collider disabled, NavMesh obstacle inactive, interactable (player can close), invulnerable
 *   Broken — collider disabled, NavMesh obstacle inactive, NOT interactable, mesh rotated horizontal
 *
 * Animation: script-driven Y translation on sm_menban (slide down = open, slide up = close).
 * Broken animation: X rotation on DoorRoot to ~85° to simulate fallen door.
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	component,
	EventService,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	PhysicsBodyComponent,
	property,
	Quaternion,
	SoundComponent,
	SoundPlayInfo,
	subscribe,
	TransformComponent,
	Vec3,
} from "meta/worlds";
import {
	DoorDamagedEvent,
	DoorDamagedPayload,
	DoorState,
	DoorStateChangedEvent,
	DoorStateChangedPayload,
} from "../events/DoorEvents";
import type { DamageInfo } from "../events/HealthEvents";
import { HealthSystemDamageResult } from "../events/HealthEvents";

@component({
	description: "Door state machine — manages Open/Closed/Broken states, health, vertical slide animation, and NavMesh blocking",
})
export class DoorLogic extends Component {
	// #region Constants
	private static readonly BROKEN_PITCH_DEG = 85;
	private static readonly ANIM_DURATION = 0.5;
	// #endregion

	// #region Properties
	/** Maximum health points for this door. */
	@property({ minValue: 1, maxValue: 500 })
	public maxHp: number = 80;

	/** Current health points. */
	@property()
	public currentHp: number = 80;

	/** Current door state (serialized so GameDoorManager can set initial state). */
	@property()
	public doorState: DoorState = DoorState.Closed;

	/** How far the door mesh slides down on Y when opening (in metres). */
	@property({ minValue: 0.5, maxValue: 10 })
	public slideDistance: number = 2.5;
	// #endregion

	// #region Internal state
	private cachedTransform: Maybe<TransformComponent> = null;
	private cachedDoorMeshTransform: Maybe<TransformComponent> = null;
	private physicsBody: Maybe<PhysicsBodyComponent> = null;
	private sfxDoorOpen: Maybe<SoundComponent> = null;
	private sfxDoorClose: Maybe<SoundComponent> = null;

	/** Cached initial local position of sm_menban (closed position). */
	private closedPosition: Vec3 = Vec3.zero;
	/** Computed open position (closedPosition minus slideDistance on Y). */
	private openPosition: Vec3 = Vec3.zero;

	/** Animation progress 0..1 */
	private animProgress: number = 0;
	/** Whether currently animating */
	private isAnimating: boolean = false;
	/** Target progress (1 = open, 0 = closed) */
	private animTarget: number = 0;
	/** Whether the broken fall animation is playing */
	private isBrokenAnimating: boolean = false;
	private brokenAnimProgress: number = 0;

	/** Closed rotation (identity — 0° Y) for broken animation baseline. */
	private readonly closedRotation: Quaternion = Quaternion.identity;
	/** Broken rotation (85° X — fallen flat). */
	private readonly brokenRotation: Quaternion = Quaternion.fromEuler(new Vec3(DoorLogic.BROKEN_PITCH_DEG, 0, 0));
	// #endregion

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	public onStart(): void {
		this.cachedTransform = this.entity.getComponent(TransformComponent);
		this.physicsBody = this.entity.getComponent(PhysicsBodyComponent);

		// Find the sm_menban child entity and cache its transform
		const children = this.entity.getChildren();
		for (const child of children) {
			if (child.name === "sm_menban") {
				this.cachedDoorMeshTransform = child.getComponent(TransformComponent);
				break;
			}
		}

		if (!this.cachedDoorMeshTransform) {
			console.log("[DoorLogic.onStart] Could not find sm_menban child entity");
			return;
		}

		// Cache SfxDoorOpen and SfxDoorClose sound components from child entities
		const sfxOpenChildren = this.entity.findChildrenWithName("SfxDoorOpen");
		if (sfxOpenChildren.length > 0) {
			this.sfxDoorOpen = sfxOpenChildren[0].getComponent(SoundComponent);
		}
		const sfxCloseChildren = this.entity.findChildrenWithName("SfxDoorClose");
		if (sfxCloseChildren.length > 0) {
			this.sfxDoorClose = sfxCloseChildren[0].getComponent(SoundComponent);
		}

		// Cache closed and open positions
		this.closedPosition = this.cachedDoorMeshTransform.localPosition;
		this.openPosition = this.closedPosition.sub(new Vec3(0, this.slideDistance, 0));

		// Apply initial state visuals
		this.applyStateImmediate(this.doorState);
	}

	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Everywhere })
	public onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (this.isAnimating) {
			this.updateOpenCloseAnimation(payload.deltaTime);
		}
		if (this.isBrokenAnimating) {
			this.updateBrokenAnimation(payload.deltaTime);
		}
	}
	// #endregion

	// #region Animation
	private updateOpenCloseAnimation(dt: number): void {
		if (!this.cachedDoorMeshTransform) {
			return;
		}

		const speed = 1.0 / DoorLogic.ANIM_DURATION;
		if (this.animTarget > this.animProgress) {
			this.animProgress = Math.min(this.animTarget, this.animProgress + speed * dt);
		} else {
			this.animProgress = Math.max(this.animTarget, this.animProgress - speed * dt);
		}

		// Lerp between closed and open positions
		this.cachedDoorMeshTransform.localPosition = Vec3.lerp(this.closedPosition, this.openPosition, this.animProgress);

		// Animation complete
		if (Math.abs(this.animProgress - this.animTarget) < 0.001) {
			this.isAnimating = false;
			this.animProgress = this.animTarget;

			// When closing completes, enable collider
			if (this.animTarget === 0 && this.doorState === DoorState.Closed) {
				this.setCollisionEnabled(true);
			}
		}
	}

	private updateBrokenAnimation(dt: number): void {
		if (!this.cachedTransform) {
			return;
		}

		const speed = 1.0 / DoorLogic.ANIM_DURATION;
		this.brokenAnimProgress = Math.min(1.0, this.brokenAnimProgress + speed * dt);

		// Slerp from closed to broken (fallen) on the parent pivot
		const rotation = Quaternion.slerp(this.closedRotation, this.brokenRotation, this.brokenAnimProgress);
		this.cachedTransform.localRotation = rotation;

		if (this.brokenAnimProgress >= 1.0) {
			this.isBrokenAnimating = false;
		}
	}
	// #endregion

	// #region State Management
	/**
	 * Apply state visuals immediately (no animation). Used on start and by GameDoorManager.
	 */
	public applyStateImmediate(state: DoorState): void {
		this.doorState = state;

		if (state === DoorState.Broken) {
			if (this.cachedTransform) {
				this.cachedTransform.localRotation = this.brokenRotation;
			}
			this.animProgress = 0;
			this.setCollisionEnabled(false);
			return;
		}

		if (!this.cachedDoorMeshTransform) {
			return;
		}

		if (state === DoorState.Closed) {
			this.cachedDoorMeshTransform.localPosition = this.closedPosition;
			this.animProgress = 0;
			this.setCollisionEnabled(true);
		} else if (state === DoorState.Open) {
			this.cachedDoorMeshTransform.localPosition = this.openPosition;
			this.animProgress = 1;
			this.setCollisionEnabled(false);
		}
	}

	/**
	 * Toggle door between Open and Closed. Called by DoorTriggerZone on player interaction.
	 * Does nothing if door is Broken.
	 */
	public toggleDoor(): void {
		if (this.doorState === DoorState.Broken) {
			return;
		}

		if (this.doorState === DoorState.Closed) {
			this.openDoor();
		} else if (this.doorState === DoorState.Open) {
			this.closeDoor();
		}
	}

	/** Animate door to open position. */
	public openDoor(): void {
		if (this.doorState === DoorState.Broken || this.doorState === DoorState.Open) {
			return;
		}

		this.doorState = DoorState.Open;
		this.animTarget = 1;
		this.isAnimating = true;

		// Disable collision immediately on open
		this.setCollisionEnabled(false);

		// Play door open SFX (client-only)
		if (!NetworkingService.get().isServerContext() && this.sfxDoorOpen) {
			this.sfxDoorOpen.play(new SoundPlayInfo());
		}

		this.broadcastStateChange();
		console.log("[DoorLogic.openDoor] Opened");
	}

	/** Animate door to closed position. Enables collision immediately (air wall). */
	public closeDoor(): void {
		if (this.doorState === DoorState.Broken || this.doorState === DoorState.Closed) {
			return;
		}

		this.doorState = DoorState.Closed;
		this.animTarget = 0;
		this.isAnimating = true;

		// Enable collision immediately on close start (requirement: air wall blocks immediately)
		this.setCollisionEnabled(true);

		// Play door close SFX (client-only)
		if (!NetworkingService.get().isServerContext() && this.sfxDoorClose) {
			this.sfxDoorClose.play(new SoundPlayInfo());
		}

		this.broadcastStateChange();
		console.log("[DoorLogic.closeDoor] Closed, air wall active");
	}

	/** Transition to Broken state. Called when HP reaches 0. */
	private transitionToBroken(): void {
		this.doorState = DoorState.Broken;
		this.isAnimating = false;

		// Start broken fall animation
		this.isBrokenAnimating = true;
		this.brokenAnimProgress = 0;

		// Disable collision — broken door has no collision volume
		this.setCollisionEnabled(false);

		this.broadcastStateChange();
		console.log("[DoorLogic.transitionToBroken] Broken, no collision, no interaction");
	}
	// #endregion

	// #region Health / Damage
	/**
	 * Apply damage to this door. Returns a DamageResult.
	 * Only damages if door is Closed. Open doors are invulnerable.
	 */
	public takeDamage(damageInfo: DamageInfo): HealthSystemDamageResult {
		// Open doors are invulnerable
		if (this.doorState === DoorState.Open) {
			return new HealthSystemDamageResult(0, damageInfo.baseDamage, false, false, true, false);
		}

		// Broken doors can't take more damage
		if (this.doorState === DoorState.Broken) {
			return new HealthSystemDamageResult(0, damageInfo.baseDamage, false, false, true, false);
		}

		const actual = Math.max(1, damageInfo.baseDamage);
		this.currentHp = Math.max(0, this.currentHp - actual);
		const fatal = this.currentHp <= 0;

		// Broadcast damage event
		EventService.sendLocally(DoorDamagedEvent, new DoorDamagedPayload(
			this.entity,
			this.currentHp,
			this.maxHp,
		));

		if (fatal) {
			this.transitionToBroken();
		}

		return new HealthSystemDamageResult(actual, damageInfo.baseDamage, fatal, false, false, false);
	}
	// #endregion

	// #region Collision / NavMesh Obstacle
	private setCollisionEnabled(enabled: boolean): void {
		if (this.physicsBody) {
			this.physicsBody.collisionEnabled = enabled;
		}
	}
	// #endregion

	// #region Public Getters
	/** Whether this door can be interacted with (not Broken). */
	public get isInteractable(): boolean {
		return this.doorState !== DoorState.Broken;
	}

	/** Whether door is currently closed (blocks pathfinding and movement). */
	public get isClosed(): boolean {
		return this.doorState === DoorState.Closed;
	}

	/** Whether door is broken (destroyed). */
	public get isBroken(): boolean {
		return this.doorState === DoorState.Broken;
	}

	/** Whether door is open (invulnerable, passable). */
	public get isOpen(): boolean {
		return this.doorState === DoorState.Open;
	}
	// #endregion

	// #region Helpers
	private broadcastStateChange(): void {
		EventService.sendLocally(DoorStateChangedEvent, new DoorStateChangedPayload(
			this.entity,
			this.doorState,
		));
	}
	// #endregion
}
