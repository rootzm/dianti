/**
 * AnalyticsEvents - LocalEvent definitions for analytics tracking.
 *
 * Component Attachment: N/A (event definitions file)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Minimal events fired from existing systems so the AnalyticsManager
 * can track high-frequency actions without polling.
 */

import {
	LocalEvent,
	property,
	serializable,
} from "meta/worlds";

// #region EnemyFrozenEvent
@serializable()
export class EnemyFrozenEventPayload {
	@property()
	public readonly dummy: number = 0;
}

/**
 * Fired locally each time an enemy is frozen by the flashlight.
 * Emitted from PlayerFlashLight when freezeByFlashlight() succeeds.
 */
export const EnemyFrozenEvent = new LocalEvent<EnemyFrozenEventPayload>(
	"Analytics_EnemyFrozen",
	EnemyFrozenEventPayload,
);
// #endregion

// #region OvertimeDamageTickEvent
@serializable()
export class OvertimeDamageTickEventPayload {
	@property()
	public readonly dummy: number = 0;
}

/**
 * Fired locally each time the countdown penalty ticks (once per second after timer expires).
 * Emitted from HudGameCountdownController.applyPeriodicDamage().
 */
export const OvertimeDamageTickEvent = new LocalEvent<OvertimeDamageTickEventPayload>(
	"Analytics_OvertimeDamageTick",
	OvertimeDamageTickEventPayload,
);
// #endregion
