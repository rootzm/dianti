/**
 * HealthEvents - Shared event definitions, payloads, and interfaces for the health/damage system.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	LocalEvent,
	NetworkEvent,
	property,
	serializable,
} from "meta/worlds";

// #region DamageInfo Interface
/**
 * Information about damage being applied.
 * Extensible via index signature for custom properties.
 */
export interface DamageInfo {
	/** Base damage amount before modifiers */
	baseDamage: number;
	/** Optional damage type identifier (e.g., "fire", "poison", "physical") */
	damageType?: string;
	/** Entity that is the direct source of the damage (e.g., projectile, hazard) */
	source?: Entity;
	/** Entity that initiated the attack (e.g., player, enemy) */
	attacker?: Entity;
	/** If true, bypasses invulnerability frames */
	ignoreInvulnerability?: boolean;
	/** If true, indicates this is a critical hit */
	isCritical?: boolean;
	/** Optional knockback force multiplier */
	knockbackMultiplier?: number;
	/** Extensible properties for custom damage information */
	[key: string]: any;
}
// #endregion

// #region DamageResult Class
/**
 * Result information about damage that was applied.
 * Returned by takeDamage() to inform callers of the outcome.
 */
@serializable()
export class HealthSystemDamageResult {
	/** Final damage dealt after all modifiers and reductions */
	@property()
	public readonly actualDamage: number;

	/** Original damage amount before any modifiers */
	@property()
	public readonly baseDamage: number;

	/** Whether this damage killed the target */
	@property()
	public readonly wasFatal: boolean;

	/** Whether damage text should be displayed for this hit */
	@property()
	public readonly shouldDisplayText: boolean;

	/** Whether the damage was completely blocked (invulnerability or already dead) */
	@property()
	public readonly wasBlocked: boolean;

	/** Whether this was a critical hit */
	@property()
	public readonly wasCritical: boolean;

	constructor(
		actualDamage: number = 0,
		baseDamage: number = 0,
		wasFatal: boolean = false,
		shouldDisplayText: boolean = false,
		wasBlocked: boolean = false,
		wasCritical: boolean = false,
	) {
		this.actualDamage = actualDamage;
		this.baseDamage = baseDamage;
		this.wasFatal = wasFatal;
		this.shouldDisplayText = shouldDisplayText;
		this.wasBlocked = wasBlocked;
		this.wasCritical = wasCritical;
	}
}
// #endregion

// #region Event Payloads
/**
 * Payload for health damage events.
 * Contains target entity and damage result information.
 */
@serializable()
export class HealthSystemDamagedEventPayload {
	/** Entity that took damage */
	@property()
	public readonly targetEntity: Maybe<Entity> = null;

	/** Detailed information about the damage that was applied */
	@property()
	public readonly damageResult?: HealthSystemDamageResult;

	/** The player entity that originated this damage (if client-originated) */
	@property()
	public readonly originatingPlayerEntity?: Maybe<Entity> = null;
}
// #endregion

// #region Events
/**
 * Local event fired when an entity takes damage (client context only).
 * Use for client-side UI effects like damage text, hit sounds, and visual feedback.
 *
 * This event fires immediately on the client that dealt damage for instant feedback,
 * and is bridged from network events for other clients.
 */
export const OnHealthSystemDamagedLocalEvent = new LocalEvent(
	"OnHealthSystemDamagedLocal",
	HealthSystemDamagedEventPayload,
);

/**
 * Network event fired when an entity takes damage.
 * Broadcast to all clients for synchronized damage effects and game logic.
 *
 * Subscribe with { execution: ExecuteOn.Everywhere } to receive on all sides.
 */
export const OnHealthSystemDamagedNetworkEvent = new NetworkEvent(
	"OnHealthSystemDamagedNetwork",
	HealthSystemDamagedEventPayload,
);
// #endregion

// #region Player Death Event
/**
 * Payload broadcast locally when the player dies.
 * Carries the player entity for identification.
 */
export class PlayerDeathEventPayload {
	public readonly playerEntity: Maybe<Entity> = null;
}

/**
 * LocalEvent fired when the player's health reaches 0.
 * UI (HudPanelFail) and enemy AI subscribe to react to player death.
 */
export const PlayerDeathEvent = new LocalEvent<PlayerDeathEventPayload>(
	"PlayerDeathEvent",
	PlayerDeathEventPayload,
);
// #endregion

// #region Callback Types
/**
 * Callback types for HealthComponent instance events.
 * Use these with the onX() subscription methods.
 */
export type HealthSystemDamageTakenCallback = (damageInfo: DamageInfo, actualDamage: number) => void;
export type HealthSystemHealedCallback = (healAmount: number) => void;
export type HealthSystemHealthChangedCallback = (currentHealth: number, maxHealth: number) => void;
export type HealthSystemDeathCallback = (damageInfo?: DamageInfo) => void;
export type HealthSystemRevivedCallback = () => void;
// #endregion

// #region Interfaces
/**
 * Interface for objects that can take damage.
 * Implement this for custom damageable systems.
 */
export interface IHealthSystemDamageable {
	takeDamage(damageInfo: DamageInfo): HealthSystemDamageResult;
	heal(healAmount: number): number;
	readonly currentHealth: number;
	readonly maxHealth: number;
	readonly isDead: boolean;
	readonly isAlive: boolean;
}

/**
 * Interface for damage modifiers.
 * Implement this to create armor, resistances, or damage buffs.
 */
export interface IHealthSystemDamageModifier {
	modifyIncomingDamage(damage: number, damageInfo: DamageInfo): number;
}
// #endregion
