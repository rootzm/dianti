/**
 * EnemyMovementAbility - Enemy-specific movement ability.
 *
 * Component Attachment: Enemy root entity (EnemyCharacter template)
 * Component Networking: Local (runs on server, server-owned entity)
 * Component Ownership: Server
 *
 * Extends MovementAbility with the original rotation behavior:
 * Only rotates toward movement direction when moving (in non-strafe mode).
 * When standing still, maintains current facing direction.
 *
 * Includes wall-sliding logic: when the enemy's movement is blocked by a wall,
 * the desired velocity is projected onto the wall surface so the enemy slides
 * along it instead of getting stuck.
 */

import type { Entity } from "meta/worlds";
import {
	CharacterCollisionFlags,
	component,
	Quaternion,
	Vec3,
} from "meta/worlds";
import { MovementAbility } from "./MovementAbility";

interface MovementInput {
	x: number;
	y: number;
}

@component({
	description: "Enemy movement ability - rotates toward movement direction when moving, with wall sliding",
})
export class EnemyMovementAbility extends MovementAbility {
	// #region Constants
	/** Minimum magnitude threshold for meaningful movement */
	private static readonly WALL_SLIDE_MIN_DESIRED = 0.001;
	/** If actual displacement is less than this fraction of desired, movement is considered blocked */
	private static readonly WALL_SLIDE_BLOCK_RATIO = 0.7;
	/** Minimum blocked component magnitude to compute a valid wall normal */
	private static readonly WALL_SLIDE_MIN_BLOCKED = 0.0001;
	/** How quickly wall normal fades when no longer blocked (0 = instant, 1 = never) */
	private static readonly WALL_NORMAL_PERSISTENCE = 0.0;
	// #endregion

	// #region Wall-sliding state
	private lastFramePosition: Vec3 = Vec3.zero;
	private lastFrameDesiredVelocity: Vec3 = Vec3.zero;
	private hasLastFrameData: boolean = false;
	private wallNormal: Vec3 = Vec3.zero;
	private wallSlideActive: boolean = false;
	// #endregion

	public override initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void {
		super.initialize(characterRootEntity, characterSimulatedEntity);
		this.hasLastFrameData = false;
		this.wallSlideActive = false;
		this.wallNormal = Vec3.zero;
	}

	/**
	 * Override camera-relative movement interpretation for enemies.
	 * EnemyLogic encodes world-space directions as Vec2:
	 *   input.x = world +X direction
	 *   input.y = -world Z direction (i.e. negated Z)
	 * We convert back to world-space Vec3 directly, bypassing camera-relative logic.
	 */
	protected calculateMovementDirection(normalizedInput: MovementInput): Vec3 {
		return new Vec3(normalizedInput.x, 0, -normalizedInput.y);
	}

	/**
	 * Override update to add wall-sliding detection and correction.
	 * Flow:
	 * 1. Detect if last frame's movement was blocked (compare desired vs actual displacement)
	 * 2. Run normal movement via super.update(dt)
	 * 3. If wall sliding is active, add a corrective slide delta
	 * 4. Record state for next frame's detection
	 */
	public override update(dt: number): void {
		if (!this.kcc || dt <= 0.0001) {
			super.update(dt);
			return;
		}

		// Step 1: Detect wall collision from previous frame
		const currentPos = this.kcc.simulatedPosition;
		this.detectWallFromLastFrame(currentPos, dt);

		// Step 2: Run normal movement (this calls addMoveDelta internally)
		super.update(dt);

		// Step 3: If wall sliding is active, add corrective slide delta
		if (this.wallSlideActive) {
			this.applyWallSlideCorrection(dt);
		}

		// Step 4: Record state for next frame
		this.lastFramePosition = currentPos;
		this.lastFrameDesiredVelocity = this.getDesiredVelocity();
		this.hasLastFrameData = true;
	}

	/**
	 * Detect if the previous frame's movement was blocked by comparing
	 * desired displacement with actual displacement, using collisionFlags as confirmation.
	 */
	private detectWallFromLastFrame(currentPos: Vec3, dt: number): void {
		if (!this.hasLastFrameData || !this.kcc) {
			return;
		}

		// Check if the KCC reported a side collision last frame
		const hasSideCollision = (this.kcc.collisionFlags & CharacterCollisionFlags.CollisionSides) !== 0;

		if (!hasSideCollision) {
			this.wallSlideActive = false;
			return;
		}

		// Compute horizontal actual displacement from last frame (scalar)
		const actualDx = currentPos.x - this.lastFramePosition.x;
		const actualDz = currentPos.z - this.lastFramePosition.z;

		// Compute what we wanted horizontally last frame (scalar)
		const desiredDx = this.lastFrameDesiredVelocity.x * dt;
		const desiredDz = this.lastFrameDesiredVelocity.z * dt;

		const desiredMag = Math.sqrt(desiredDx * desiredDx + desiredDz * desiredDz);
		if (desiredMag < EnemyMovementAbility.WALL_SLIDE_MIN_DESIRED) {
			this.wallSlideActive = false;
			return;
		}

		const actualMag = Math.sqrt(actualDx * actualDx + actualDz * actualDz);

		// If actual movement is significantly less than desired, we're blocked
		if (actualMag < desiredMag * EnemyMovementAbility.WALL_SLIDE_BLOCK_RATIO) {
			// Compute approximate wall normal from the blocked component
			const blockedX = desiredDx - actualDx;
			const blockedZ = desiredDz - actualDz;
			const blockedMag = Math.sqrt(blockedX * blockedX + blockedZ * blockedZ);

			if (blockedMag > EnemyMovementAbility.WALL_SLIDE_MIN_BLOCKED) {
				const invBlockedMag = 1.0 / blockedMag;
				this.wallNormal = new Vec3(blockedX * invBlockedMag, 0, blockedZ * invBlockedMag);
				this.wallSlideActive = true;
			} else {
				this.wallSlideActive = false;
			}
		} else {
			this.wallSlideActive = false;
		}
	}

	/**
	 * Project the current frame's desired velocity onto the wall surface
	 * and add it as an additional move delta.
	 */
	private applyWallSlideCorrection(dt: number): void {
		if (!this.kcc) {
			return;
		}

		const desiredVel = this.getDesiredVelocity();
		const hMagSq = desiredVel.x * desiredVel.x + desiredVel.z * desiredVel.z;

		if (hMagSq < EnemyMovementAbility.WALL_SLIDE_MIN_DESIRED * EnemyMovementAbility.WALL_SLIDE_MIN_DESIRED) {
			return;
		}

		// Check if we're moving into the wall (dot product using scalars)
		const dotIntoWall = desiredVel.x * this.wallNormal.x + desiredVel.z * this.wallNormal.z;
		if (dotIntoWall <= 0) {
			return;
		}

		// Project desired velocity onto the wall surface (remove the wall-ward component)
		const slideX = desiredVel.x - this.wallNormal.x * dotIntoWall;
		const slideZ = desiredVel.z - this.wallNormal.z * dotIntoWall;
		const slideDeltaX = slideX * dt;
		const slideDeltaZ = slideZ * dt;

		if (slideDeltaX * slideDeltaX + slideDeltaZ * slideDeltaZ > 0.00001) {
			this.kcc.addMoveDelta(new Vec3(slideDeltaX, 0, slideDeltaZ));
		}
	}

	/**
	 * Enemy rotation: rotate toward movement direction when moving.
	 * In strafe mode, face camera forward instead. When standing still,
	 * maintain current horizontal facing.
	 */
	protected applyRotation(movementDirection: Vec3, inputMagnitude: number): void {
		if (
			inputMagnitude > 0.01 &&
			movementDirection.magnitudeSquared() > 0.01
		) {
			let targetDirection: Vec3;
			if (this.strafeMode) {
				targetDirection = this.getCameraHorizontalForward();
			} else {
				targetDirection = movementDirection.normalize();
			}
			const targetRotation = Quaternion.lookRotation(
				targetDirection,
				Vec3.up,
			);
			const rotationLerp = 0.1 * this.rotationSpeed;
			this.transformComponent.worldRotation = this.transformComponent.worldRotation
				.slerp(targetRotation, rotationLerp)
				.normalize();
		} else {
			const currentForward =
				this.transformComponent.worldRotation.mulVec3(Vec3.forward);
			const flatForward = new Vec3(currentForward.x, 0, currentForward.z);

			if (flatForward.magnitudeSquared() > 0.0001) {
				this.transformComponent.worldRotation = Quaternion.lookRotation(
					flatForward.normalize(),
					Vec3.up,
				);
			}
		}
	}
}
