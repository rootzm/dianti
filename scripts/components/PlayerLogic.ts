/**
 * PlayerLogicComponent - Manages player health, damage, healing, death/revival, and power (flashlight battery).
 *
 * Component Attachment: Player (PlayerCharacter template root entity)
 * Component Networking: Networked (health/power state owned by player client)
 * Component Ownership: Player (client-owned)
 *
 * Enemy damage crosses ownership boundary via RpcTakeDamage.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	Component,
	EventService,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	SoundComponent,
	SoundPlayInfo,
	SpotLightComponent,
	component,
	property,
	rpc,
	subscribe,
} from "meta/worlds";
import type {
	DamageInfo,
	IHealthSystemDamageModifier,
	IHealthSystemDamageable,
} from "../events/HealthEvents";
import {
	HealthSystemDamageResult,
	HealthSystemDamagedEventPayload,
	OnHealthSystemDamagedLocalEvent,
	OnHealthSystemDamagedNetworkEvent,
	PlayerDeathEvent,
} from "../events/HealthEvents";
import { SaveClient } from "../save/SaveClient";
import {
	GamePhase,
	GamePhaseChangedEvent,
} from "../events/GamePhaseEvents";
import type { GamePhaseChangedPayload } from "../events/GamePhaseEvents";
import {
	AnnouncementHpLowEvent,
	AnnouncementPowerLowEvent,
} from "../events/AnnouncementEvents";
import { CharacterUpdateManager } from "./update/CharacterUpdateManager";

export {
	HealthSystemDamageResult,
	OnHealthSystemDamagedLocalEvent,
	OnHealthSystemDamagedNetworkEvent
};
export type {
	DamageInfo, IHealthSystemDamageModifier, IHealthSystemDamageable
};

/** Callback signature for health/power change listeners. */
interface HealthPowerCallback {
	(current: number, max: number): void;
}

@component({
	description: "Player data manager - health, damage, healing, death/revival, power (flashlight)",
})
export class PlayerLogic extends Component {
	// #region Properties
	@property({minValue: 1, maxValue: 1000})
	public maxHealthValue: number = 100;

	@property()
	public invulnerabilityDuration: number = 0;

	@property()
	public showDamageText: boolean = false;

	@property({minValue: 1, maxValue: 1000})
	public maxPowerValue: number = 100;

	@property({minValue: 0, maxValue: 10})
	public powerDrainRate: number = 0.5;
	// #endregion

	// #region Internal state
	private currentHealthValue: number = 100;
	private currentPowerValue: number = 100;
	private deadFlag: boolean = false;
	private isCurrentlyInvulnerable: boolean = false;
	private invulnerabilityTimer: number = 0;
	private isFlashlightOn: boolean = true;
	private flashlightEntity: Maybe<Entity> = null;
	private healthCbs: HealthPowerCallback[] = [];
	private powerCbs: HealthPowerCallback[] = [];
	private sfxHurtSound: Maybe<SoundComponent> = null;
	private currentGamePhase: number = GamePhase.Initialization;
	// #endregion

	// #region Getters
	public get currentHealth(): number {
		return this.currentHealthValue;
	}

	public get maxHealth(): number {
		return this.maxHealthValue;
	}

	public get isDead(): boolean {
		return this.deadFlag;
	}

	public get isAlive(): boolean {
		return !this.deadFlag;
	}

	public get isInvulnerable(): boolean {
		return this.isCurrentlyInvulnerable;
	}

	public get currentPower(): number {
		return this.currentPowerValue;
	}

	public get maxPower(): number {
		return this.maxPowerValue;
	}

	public get flashlightActive(): boolean {
		return this.isFlashlightOn;
	}

	/**
	 * Toggle the flashlight on/off. Only works when there is remaining power.
	 * Returns the new state (true = on, false = off).
	 */
	public toggleFlashlight(): boolean {
		if (this.isFlashlightOn) {
			// Turn off
			this.isFlashlightOn = false;
			if (this.flashlightEntity) {
				const spotLight = this.flashlightEntity.getComponent(SpotLightComponent);
				if (spotLight) {
					spotLight.intensity = 0;
				}
			}
		} else {
			// Turn on only if there is power left
			if (this.currentPowerValue > 0) {
				this.isFlashlightOn = true;
				if (this.flashlightEntity) {
					const spotLight = this.flashlightEntity.getComponent(SpotLightComponent);
					if (spotLight) {
						spotLight.intensity = 10000;
					}
				}
			} else {
			}
		}
		return this.isFlashlightOn;
	}
	// #endregion

	// #region Callback registration
	public onHealthChanged(cb: HealthPowerCallback): () => void {
		this.healthCbs.push(cb);
		return (): void => {
			const i = this.healthCbs.indexOf(cb);
			if (i > -1) {
				this.healthCbs.splice(i, 1);
			}
		};
	}

	public onPowerChanged(cb: HealthPowerCallback): () => void {
		this.powerCbs.push(cb);
		return (): void => {
			const i = this.powerCbs.indexOf(cb);
			if (i > -1) {
				this.powerCbs.splice(i, 1);
			}
		};
	}
	// #endregion

	// #region RPC methods
	@rpc()
	public RpcTakeDamage(baseDamage: number, damageType: string, ignoreInvuln: boolean, isCrit: boolean, knockback: number): void {
		this.applyDamageOwner(baseDamage, ignoreInvuln, isCrit);
	}

	@rpc()
	public RpcDamaged(): void {
		/* hit effects hook */
	}
	// #endregion

	// #region Lifecycle
	@subscribe(GamePhaseChangedEvent, {execution: ExecuteOn.Everywhere})
	private onGamePhaseChanged(payload: GamePhaseChangedPayload): void {
		this.currentGamePhase = payload.newPhase;
	}

	@subscribe(OnHealthSystemDamagedNetworkEvent, {execution: ExecuteOn.Everywhere})
	private onNetworkHealthDamaged(payload: HealthSystemDamagedEventPayload): void {
		if (!NetworkingService.get().isPlayerContext()) {
			return;
		}
		if (payload.targetEntity !== this.entity) {
			return;
		}
		EventService.sendLocally(OnHealthSystemDamagedLocalEvent, payload);
	}

	@subscribe(OnEntityStartEvent, {execution: ExecuteOn.Everywhere})
	private onStart(): void {
		if (this.entity.isOwned()) {
			this.currentHealthValue = this.maxHealthValue;
			this.currentPowerValue = this.maxPowerValue;
			this.isFlashlightOn = true;

			const fl = this.entity.findChildrenWithName("Flashlight", true);
			if (fl.length > 0) {
				this.flashlightEntity = fl[0];
				const spotLight = fl[0].getComponent(SpotLightComponent);
				if (spotLight) {
					spotLight.intensity = 10000;
				}
			}

			this.healthCbs.forEach((cb: HealthPowerCallback): void => {
				cb(this.currentHealthValue, this.maxHealthValue);
			});
			this.powerCbs.forEach((cb: HealthPowerCallback): void => {
				cb(this.currentPowerValue, this.maxPowerValue);
			});

			// Cache SfxHurt sound component for damage audio
			const audioChildren = this.entity.findChildrenWithName("Audio", false);
			if (audioChildren.length > 0) {
				const sfxHurtEntities = audioChildren[0].findChildrenWithName("SfxHurt", false);
				if (sfxHurtEntities.length > 0) {
					this.sfxHurtSound = sfxHurtEntities[0].getComponent(SoundComponent);
				}
			}
			if (!this.sfxHurtSound) {
				// Fallback: search recursively from root
				const sfxDirect = this.entity.findChildrenWithName("SfxHurt", true);
				if (sfxDirect.length > 0) {
					this.sfxHurtSound = sfxDirect[0].getComponent(SoundComponent);
				}
			}
		}
	}

	@subscribe(OnWorldUpdateEvent, {execution: ExecuteOn.Owner})
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		const dt = payload.deltaTime;

		if (this.isCurrentlyInvulnerable) {
			this.invulnerabilityTimer -= dt;
			if (this.invulnerabilityTimer <= 0) {
				this.isCurrentlyInvulnerable = false;
			}
		}

		if (this.isFlashlightOn && this.currentPowerValue > 0 && this.currentGamePhase === GamePhase.Exploration) {
			const old = this.currentPowerValue;
			this.currentPowerValue = Math.max(0, this.currentPowerValue - this.powerDrainRate * dt);

			// Fire Power low announcement when crossing the 50% threshold
			const halfPower = this.maxPowerValue * 0.5;
			if (old > halfPower && this.currentPowerValue <= halfPower) {
				EventService.sendLocally(AnnouncementPowerLowEvent, { dummy: 0 });
			}

			if (Math.floor(old) !== Math.floor(this.currentPowerValue) || this.currentPowerValue <= 0) {
				this.powerCbs.forEach((cb: HealthPowerCallback): void => {
					cb(this.currentPowerValue, this.maxPowerValue);
				});
			}

			if (this.currentPowerValue <= 0) {
				this.isFlashlightOn = false;
				if (this.flashlightEntity) {
					const spotLight = this.flashlightEntity.getComponent(SpotLightComponent);
					if (spotLight) {
						spotLight.intensity = 0;
					}
				}
			}
		}
	}
	// #endregion

	// #region Public API
	public takeDamage(damageInfo: DamageInfo): HealthSystemDamageResult {
		if (this.entity.isOwned()) {
			return this.applyDamageOwner(
				damageInfo.baseDamage,
				damageInfo.ignoreInvulnerability ?? false,
				damageInfo.isCritical ?? false,
			);
		}

		this.RpcTakeDamage(
			damageInfo.baseDamage,
			damageInfo.damageType ?? "",
			damageInfo.ignoreInvulnerability ?? false,
			damageInfo.isCritical ?? false,
			damageInfo.knockbackMultiplier ?? 0,
		);
		return new HealthSystemDamageResult(damageInfo.baseDamage, damageInfo.baseDamage, false, this.showDamageText, false, false);
	}

	public heal(healAmount: number): number {
		if (this.deadFlag || healAmount <= 0) {
			return 0;
		}
		const old = this.currentHealthValue;
		this.currentHealthValue = Math.min(this.maxHealthValue, this.currentHealthValue + healAmount);
		const actual = this.currentHealthValue - old;
		if (actual > 0) {
			this.healthCbs.forEach((cb: HealthPowerCallback): void => {
				cb(this.currentHealthValue, this.maxHealthValue);
			});
		}
		return actual;
	}

	/**
	 * Add power (flashlight energy) by a given amount, clamped to maxPowerValue.
	 * Returns the actual amount added.
	 */
	public addPower(amount: number): number {
		if (amount <= 0) {
			return 0;
		}
		const old = this.currentPowerValue;
		this.currentPowerValue = Math.min(this.maxPowerValue, this.currentPowerValue + amount);
		const actual = this.currentPowerValue - old;
		if (actual > 0) {
			this.powerCbs.forEach((cb: HealthPowerCallback): void => {
				cb(this.currentPowerValue, this.maxPowerValue);
			});
		}
		return actual;
	}

	public die(): void {
		if (this.deadFlag) {
			return;
		}
		this.deadFlag = true;
		this.currentHealthValue = 0;
		console.log('[PlayerLogic] Player died - broadcasting death event');

		// Immediately reset save data on death so quitting without clicking restart
		// does not preserve stale progress (savedLevel=1, savedDepot=empty, savedLevelTemplateIndex=-1)
		const saveClient = this.entity.getComponent(SaveClient);
		if (saveClient) {
			console.log('[PlayerLogic] Resetting save data on death');
			saveClient.saveAsync(1, "", -1).catch((e: unknown): void => {
				console.log(`[PlayerLogic] Save reset on death failed: ${String(e)}`);
			});
		}

		// Disable player movement/physics
		const updateManager = this.entity.getComponent(CharacterUpdateManager);
		if (updateManager) {
			updateManager.setActive(false);
		}

		// Broadcast death event locally so UI and enemy AI can react
		EventService.sendLocally(PlayerDeathEvent, {
			playerEntity: this.entity,
		});
	}

	public revive(hp?: number): void {
		if (!this.deadFlag) {
			return;
		}
		this.deadFlag = false;
		this.currentHealthValue = hp ?? this.maxHealthValue;
		this.healthCbs.forEach((cb: HealthPowerCallback): void => {
			cb(this.currentHealthValue, this.maxHealthValue);
		});
	}

	/**
	 * Reset health and flashlight power to max. Used on level transition and game reset.
	 * Also revives the player if dead and re-enables the flashlight.
	 */
	public resetForNewLevel(): void {
		if (this.deadFlag) {
			this.deadFlag = false;
		}
		this.currentHealthValue = this.maxHealthValue;
		this.currentPowerValue = this.maxPowerValue;
		this.isFlashlightOn = true;
		if (this.flashlightEntity) {
			const spotLight = this.flashlightEntity.getComponent(SpotLightComponent);
			if (spotLight) {
				spotLight.intensity = 10000;
			}
		}
		this.healthCbs.forEach((cb: HealthPowerCallback): void => {
			cb(this.currentHealthValue, this.maxHealthValue);
		});
		this.powerCbs.forEach((cb: HealthPowerCallback): void => {
			cb(this.currentPowerValue, this.maxPowerValue);
		});
	}

	public setInvulnerable(dur: number): void {
		this.isCurrentlyInvulnerable = true;
		this.invulnerabilityTimer = dur;
	}

	/**
	 * Consume power by a given amount. Returns true if power was consumed, false if already depleted.
	 * Used by sprint and other systems that drain the power resource.
	 */
	public consumePower(amount: number): boolean {
		if (this.currentPowerValue <= 0 || amount <= 0) {
			return false;
		}
		const old = this.currentPowerValue;
		this.currentPowerValue = Math.max(0, this.currentPowerValue - amount);

		if (Math.floor(old) !== Math.floor(this.currentPowerValue) || this.currentPowerValue <= 0) {
			this.powerCbs.forEach((cb: HealthPowerCallback): void => {
				cb(this.currentPowerValue, this.maxPowerValue);
			});
		}

		return true;
	}

	public setMaxHealth(m: number, full: boolean = false): void {
		this.maxHealthValue = m;
		if (full) {
			this.currentHealthValue = m;
		} else {
			this.currentHealthValue = Math.min(this.currentHealthValue, m);
		}
		this.healthCbs.forEach((cb: HealthPowerCallback): void => {
			cb(this.currentHealthValue, this.maxHealthValue);
		});
	}
	// #endregion

	// #region Damage internals
	private applyDamageOwner(baseDmg: number, ignoreInv: boolean, crit: boolean): HealthSystemDamageResult {
		if (this.deadFlag) {
			return new HealthSystemDamageResult(0, baseDmg, false, this.showDamageText, true);
		}
		if (this.isCurrentlyInvulnerable && !ignoreInv) {
			return new HealthSystemDamageResult(0, baseDmg, false, this.showDamageText, true);
		}

		const hpBefore = this.currentHealthValue;
		const actual = Math.max(1, baseDmg);
		this.currentHealthValue = Math.max(0, this.currentHealthValue - actual);
		const fatal = this.currentHealthValue <= 0;

		// Fire HP low announcement when crossing the 50% threshold
		const halfHp = this.maxHealthValue * 0.5;
		if (hpBefore > halfHp && this.currentHealthValue <= halfHp) {
			EventService.sendLocally(AnnouncementHpLowEvent, { dummy: 0 });
		}

		// Play hurt sound effect
		if (this.sfxHurtSound) {
			this.sfxHurtSound.play(new SoundPlayInfo());
		}

		if (this.invulnerabilityDuration > 0) {
			this.setInvulnerable(this.invulnerabilityDuration);
		}

		this.healthCbs.forEach((cb: HealthPowerCallback): void => {
			cb(this.currentHealthValue, this.maxHealthValue);
		});

		if (fatal) {
			this.die();
		}

		const r = new HealthSystemDamageResult(actual, baseDmg, fatal, this.showDamageText, false, crit);
		EventService.sendGlobally(OnHealthSystemDamagedNetworkEvent, {
			targetEntity: this.entity,
			damageResult: r,
		});
		return r;
	}
	// #endregion
}
