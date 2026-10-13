// @generated - Character Controller Scripts v4 (modified: distance LOD optimization)
/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 *
 * @format
 */

import {
	ColliderComponent,
	Component,
	component,
	property,
	Service,
	TransformComponent,
	Vec3,
	type SphereCastInput,
	type RayCastInput,
	CastMode,
	CollisionLayerMask,
	PhysicsService,
	PlayerService,
	SceneCastOutput,
	SceneHitData,
} from "meta/worlds";
import type { Entity } from "meta/worlds";

// Default radius for sphere cast, also used as Y offset for castOrigin
const DEFAULT_RADIUS = 0.3;

// Defaults for contact material properties — match the ColliderComponent
// defaults and the @property initializers below. Used to reset the contact
// fields when a frame produces no cast hit (or the hit has no
// ColliderComponent), so consumers never see stale friction/restitution
// from a previous frame's hit.
const DEFAULT_CONTACT_STATIC_FRICTION = 0.5;
const DEFAULT_CONTACT_DYNAMIC_FRICTION = 0.5;
const DEFAULT_CONTACT_RESTITUTION = 0.1;

/**
 * The GroundInfoComponent provides ground detection functionality using
 * distance-based physics LOD: a sphere cast for entities near any player
 * (full precision on edges and slopes) and a cheaper raycast for distant
 * entities. It automatically updates every frame via OnWorldUpdateEvent.
 */
@component()
export class WorldsGroundInfoComponent extends Component {
	private physicsService = Service.inject(PhysicsService);

	// Cached cosine value of slope limit, updated when slopeLimit changes
	private slopeLimitCosValue: number = 0.70710678118;

	// Cached players list for distance LOD check (refreshed periodically)
	private cachedPlayers: Entity[] = [];
	private playerCacheTimestamp: number = 0;
	private static readonly PLAYER_CACHE_INTERVAL_MS = 2000;

	/**
	 * Whether the component is enabled or not.
	 */
	@property()
	enabled: boolean = true;

	/**
	 * Distance threshold (meters) for physics LOD.
	 * Entities farther than this from all players use a cheaper raycast
	 * instead of the full sphere cast for ground detection.
	 */
	@property()
	distanceLodThreshold: number = 15;

	/**
	 * Distance for the ground detection casts.
	 */
	@property()
	castDistance: number = 5;

	/**
	 * Radius for the fallback sphere cast.
	 */
	@property()
	castRadius: number = DEFAULT_RADIUS;

	/**
	 * The cast origin offset in local space relative to the entity's transform.
	 * This is transformed by the entity's world rotation and added to world position.
	 * Typically set to a point inside the entity (e.g., at hip height in local Y).
	 */
	@property()
	castOrigin: Vec3 = new Vec3(0, DEFAULT_RADIUS, 0);

	/**
	 * The direction of the ground detection cast.
	 * Defaults to Vec3.down for ground detection.
	 */
	@property()
	castDirection: Vec3 = Vec3.down;

	/**
	 * The distance from the castOrigin to the entity's bottom (feet).
	 * This value is subtracted from hit.distance to compute the actual
	 * distance from the entity's bottom to the ground.
	 */
	@property()
	castOriginDepth: number = 0;

	/**
	 * Maximum slope angle in degrees that counts as valid ground.
	 */
	@property()
	slopeLimit: number = 45.0;

	/**
	 * Maximum ground distance to consider the character as grounded.
	 */
	@property()
	groundedThreshold: number = 0.1;

	/**
	 * The up vector used for ground normal comparison.
	 */
	@property()
	upVector: Vec3 = Vec3.up;

	/**
	 * Whether the hit is a ground or not.
	 * - if the hit is a wall (slopLimit), this will be false.
	 *
	 * * it doesn't mean the character is grounded when it's true, which just means the hit is a ground.
	 * - isGrounded also requires the hit distance to be less than the groundedThreshold.
	 */
	@property()
	isGroundHit: boolean = false;

	/**
	 * Whether the character is grounded or not.
	 */
	@property()
	isGrounded: boolean = false;

	/**
	 * Collision layer mask used to filter which layers the casts interact with.
	 * The "property()" doesn't really work right now for pure TS layerMask fields.
	 * The only functional layerMask property that works right now has a ***C++ backed custom UI***.
	 * we will leave this as is -- you should populate its value from TS.
	 * @sdkHidden
	 */
	collisionLayerMask: CollisionLayerMask = CollisionLayerMask.AllLayers;

	@property()
	groundDistance: number = 999999999;

	/**
	 * Static friction coefficient of the collider hit by the most recent cast.
	 * Populated whenever the cast hits a collider with a ColliderComponent;
	 * reset to the ColliderComponent default (0.5) at the start of every
	 * detection pass that produces no usable hit, so consumers never observe
	 * stale values from a prior frame.
	 */
	@property()
	contactStaticFriction: number = DEFAULT_CONTACT_STATIC_FRICTION;

	/**
	 * Dynamic friction coefficient of the collider hit by the most recent cast.
	 * Populated whenever the cast hits a collider with a ColliderComponent;
	 * reset to the ColliderComponent default (0.5) at the start of every
	 * detection pass that produces no usable hit, so consumers never observe
	 * stale values from a prior frame.
	 */
	@property()
	contactDynamicFriction: number = DEFAULT_CONTACT_DYNAMIC_FRICTION;

	/**
	 * Restitution (bounciness) of the collider hit by the most recent cast.
	 * Populated whenever the cast hits a collider with a ColliderComponent;
	 * reset to the ColliderComponent default (0.1) at the start of every
	 * detection pass that produces no usable hit, so consumers never observe
	 * stale values from a prior frame.
	 */
	@property()
	contactRestitution: number = DEFAULT_CONTACT_RESTITUTION;

	/**
	 * The last valid ground hit data when isGroundHit was true.
	 * @sdkHidden
	 */
	lastGoodGroundHit: SceneHitData = new SceneHitData();

	/**
	 * Raw hit result from the most recent sphere cast.
	 * @sdkHidden
	 */
	rawHit: SceneCastOutput = new SceneCastOutput();

	/**
	 * Timestamp (ms) of the last time isGrounded was true.
	 * @sdkHidden
	 */
	private lastGroundedTimestamp: number = 0;

	private isUpdating = false;

	/**
	 * Updates the cached slope limit cosine value.
	 * Call this after changing slopeLimit.
	 */
	updateSlopeLimitCos(): void {
		this.slopeLimitCosValue = Math.cos((this.slopeLimit * Math.PI) / 180.0);
	}

	public update(): void {
		if (this.isUpdating || !this.enabled) {
			return;
		}
		this.isUpdating = true;
		this.performGroundDetection().catch(() => {
		}).finally(() => {
			this.isUpdating = false;
		});
	}

	/**
	 * Checks if the character was grounded within the given distance threshold.
	 */
	public isNearlyGrounded(groundedThreshold: number): boolean {
		return (
			this.rawHit.hasHitSomething && this.groundDistance <= groundedThreshold
		);
	}

	/**
	 * Checks if any player is within the distance LOD threshold.
	 * Uses a time-based cache for the player list to avoid querying every frame.
	 */
	private isAnyPlayerNearby(transform: TransformComponent | null): boolean {
		if (transform === null) {
			return true; // No transform = can't compute distance, use full detection
		}

		// Refresh player cache periodically
		const now = Date.now();
		if (now - this.playerCacheTimestamp > WorldsGroundInfoComponent.PLAYER_CACHE_INTERVAL_MS) {
			this.cachedPlayers = PlayerService.get().getAllPlayers();
			this.playerCacheTimestamp = now;
		}

		if (this.cachedPlayers.length === 0) {
			return false; // No players = use cheap raycast
		}

		const entityPos = transform.worldPosition;
		const thresholdSq = this.distanceLodThreshold * this.distanceLodThreshold;

		for (const player of this.cachedPlayers) {
			const playerTransform = player.getComponent(TransformComponent);
			if (playerTransform === null) {
				continue;
			}
			const playerPos = playerTransform.worldPosition;
			const dx = playerPos.x - entityPos.x;
			const dy = playerPos.y - entityPos.y;
			const dz = playerPos.z - entityPos.z;
			const distSq = dx * dx + dy * dy + dz * dz;
			if (distSq <= thresholdSq) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Performs ground detection using a downward cast.
	 * Uses sphere cast for nearby entities (full precision) and raycast for
	 * distant entities (cheaper, sufficient for basic ground detection).
	 *
	 * Async-safety: this method never mutates `this.*` before the cast resolves.
	 * All derived state (rawHit, isGroundHit, isGrounded, groundDistance,
	 * lastGoodGroundHit, contact friction/restitution) is computed into locals
	 * and then committed atomically after the `await`. External readers that
	 * run while this function is awaiting therefore see consistent
	 * previous-frame values rather than partially-updated state.
	 */
	async performGroundDetection(): Promise<void> {
		// Compute actual cast center: transform castOrigin by entity's world transform
		const transform = this.entity.getComponent(TransformComponent);
		let center: Vec3;
		if (transform !== null) {
			// Transform castOrigin by world rotation, then add world position
			const rotatedOrigin = transform.worldRotation.mulVec3(this.castOrigin);
			center = transform.worldPosition.add(rotatedOrigin);
		} else {
			center = this.castOrigin;
		}

		// Distance LOD: determine if any player is within threshold
		const useFullDetection = this.isAnyPlayerNearby(transform);

		let rawHit: SceneCastOutput;
		if (useFullDetection) {
			// Full sphere cast for nearby entities (more accurate on edges/slopes)
			const sphereCastInput: SphereCastInput = {
				radius: this.castRadius,
				center: center,
				distance: this.castDistance,
				dir: this.castDirection,
				mode: CastMode.ClosestHit,
				collisionLayerMask: this.collisionLayerMask,
				excludeEntity: this.entity,
			};
			rawHit = await this.physicsService.sphereCast(sphereCastInput);
		} else {
			// Cheaper raycast for distant entities
			const rayCastInput: RayCastInput = {
				origin: center,
				distance: this.castDistance,
				dir: this.castDirection,
				mode: CastMode.ClosestHit,
				collisionLayerMask: this.collisionLayerMask,
				excludeEntity: this.entity,
			};
			rawHit = await this.physicsService.rayCast(rayCastInput);
		}

		// Compute new state into locals.
		let contactStaticFriction = DEFAULT_CONTACT_STATIC_FRICTION;
		let contactDynamicFriction = DEFAULT_CONTACT_DYNAMIC_FRICTION;
		let contactRestitution = DEFAULT_CONTACT_RESTITUTION;
		let isGroundHit = false;
		let isGrounded = false;
		let groundDistance = 999999999;
		let lastGoodGroundHit: SceneHitData | null = null;

		if (rawHit.hasHitSomething && rawHit.hits && rawHit.hits.length > 0) {
			const hit = rawHit.hits[0];

			// Populate contact material properties from the hit collider.
			// Done before the slope check so wall/non-ground hits also surface
			// their material values.
			const collider = hit.shapeEntity?.getComponent(ColliderComponent);
			if (collider) {
				contactStaticFriction = collider.materialStaticFriction;
				contactDynamicFriction = collider.materialDynamicFriction;
				contactRestitution = collider.materialRestitution;
			}

			const hitNormal = hit.normal;
			const dotProduct =
				hitNormal.x * this.upVector.x +
				hitNormal.y * this.upVector.y +
				hitNormal.z * this.upVector.z;

			// hit.distance for a sphere cast is the distance the sphere center
			// travelled before contact. Subtract castOriginDepth to get the
			// distance from the entity's feet to the ground.
			groundDistance = hit.distance - this.castOriginDepth;

			if (dotProduct >= this.slopeLimitCosValue) {
				isGroundHit = true;
				lastGoodGroundHit = hit;
				isGrounded = groundDistance <= this.groundedThreshold;
			}
		}

		// Atomic commit: assign all derived state in one synchronous block so no
		// external reader can see a partially-updated GroundInfoComponent.
		this.rawHit = rawHit;
		this.isGroundHit = isGroundHit;
		this.isGrounded = isGrounded;
		this.groundDistance = groundDistance;
		this.contactStaticFriction = contactStaticFriction;
		this.contactDynamicFriction = contactDynamicFriction;
		this.contactRestitution = contactRestitution;
		// Only update lastGoodGroundHit when we actually have a new valid ground
		// hit, so consumers can fall back to the most recent good normal when the
		// character is briefly airborne.
		if (lastGoodGroundHit !== null) {
			this.lastGoodGroundHit = lastGoodGroundHit;
		}

		if (isGrounded) {
			this.lastGroundedTimestamp = Date.now();
		}
	}
}
