import {
  Color,
  Component,
  ExecuteOn,
  OnEntityStartEvent,
  OnWorldUpdateEvent,
  OnWorldUpdateEventPayload,
  PointLightComponent,
  VfxComponent,
  component,
  property,
  subscribe,
} from 'meta/worlds';
import type {Maybe} from 'meta/worlds';

// ============================================================
// Rarity Presets (configure via @property overrides on the entity):
//
// Common:    glowColor=Color(0.8, 0.8, 0.8, 1), glowIntensity=8,  glowScale=0.6, animationSpeed=0.8
// Rare:      glowColor=Color(0.2, 0.5, 1.0, 1), glowIntensity=12, glowScale=1.0, animationSpeed=1.0
// Epic:      glowColor=Color(0.7, 0.1, 1.0, 1), glowIntensity=18, glowScale=1.4, animationSpeed=1.2
// Legendary: glowColor=Color(1.0, 0.8, 0.0, 1), glowIntensity=24, glowScale=1.8, animationSpeed=2.0
// ============================================================

/**
 * GlowEffect - Combined VFX + PointLight pulsing glow for item rarity tiers.
 *
 * Component Attachment: Scene Entity (entity with VfxComponent + PointLightComponent)
 * Component Networking: Local (visual effect only, not replicated)
 * Component Ownership: Not Networked
 *
 * Controls both a VfxComponent (lens flare / starburst) and a PointLightComponent
 * (illumination halo). Animates VFX scale and light intensity/radius with a sine-wave
 * pulse. Set properties per-entity to create Common/Rare/Epic/Legendary glow tiers.
 *
 * Requires VfxComponent and PointLightComponent on the same entity.
 * The VfxComponent should have the "lens_flare" asset assigned.
 * VFX scriptable params used: "global_scale", "Strength"
 */
@component({description: 'Combined VFX + PointLight pulsing glow for item rarity tiers'})
export class GlowEffect extends Component {
  /** VFX size multiplier (base scale for the particle effect) */
  @property({isNetworked: false})
  glowScale: number = 1.0;

  /** Light and VFX tint color (applied to PointLight; lens_flare VFX does not support color) */
  @property({isNetworked: false})
  glowColor: Color = Color.white;

  /** Light intensity multiplier (base PointLight intensity) */
  @property({isNetworked: false})
  glowIntensity: number = 14.0;

  /** Light range/radius at peak */
  @property({isNetworked: false})
  glowRadius: number = 4.0;

  /** Pulse speed (cycles per second) */
  @property({isNetworked: false})
  animationSpeed: number = 0.3;

  /** Toggle pulse animation on/off. When false, glow stays static at base values. */
  @property({isNetworked: false})
  pulseEnabled: boolean = true;

  /** VFX loop duration in seconds. The VFX will restart every N seconds to ensure
   *  continuous particle emission even if the VFX asset has a finite lifetime.
   *  Set to 0 to disable auto-restart (only use if VFX asset loops internally). */
  @property({isNetworked: false})
  vfxLoopDuration: number = 0;

  // Cached references — set once in onStart, no per-frame allocation
  private light: Maybe<PointLightComponent> = null;
  private vfx: Maybe<VfxComponent> = null;
  private elapsedTime: number = 0;
  private vfxTimer: number = 0;

  @subscribe(OnEntityStartEvent, {execution: ExecuteOn.Everywhere})
  onStart() {
    this.light = this.entity.getComponent(PointLightComponent);
    this.vfx = this.entity.getComponent(VfxComponent);

    // Apply initial static values
    this.applyStaticValues();

    // Start VFX playback if not autoPlay
    if (this.vfx) {
      this.vfx.play(null);
    }

    console.log(
      '[GlowEffect] Started — PointLight:',
      this.light != null,
      '| VFX:',
      this.vfx != null,
    );
  }

  @subscribe(OnWorldUpdateEvent, {execution: ExecuteOn.Everywhere})
  onUpdate(payload: OnWorldUpdateEventPayload) {
    if (!this.light && !this.vfx) {
      return;
    }

    if (!this.pulseEnabled) {
      // Static mode — maintain base values
      this.applyStaticValues();
      return;
    }

    this.elapsedTime += payload.deltaTime;

    // VFX loop-restart: periodically restart VFX to ensure continuous emission
    if (this.vfx && this.vfxLoopDuration > 0) {
      this.vfxTimer += payload.deltaTime;
      if (this.vfxTimer >= this.vfxLoopDuration) {
        this.vfxTimer = 0;
        this.vfx.play(null);
      }
    }

    // Sine wave: oscillates 0..1 for smooth pulsing
    const t =
      Math.sin(this.elapsedTime * this.animationSpeed * Math.PI * 2) * 0.5 + 0.5;

    // --- PointLight pulse ---
    if (this.light) {
      // Pulse intensity between 30% and 100% of glowIntensity
      this.light.intensity = this.glowIntensity * (0.3 + t * 0.7);
      // Pulse radius between 50% and 100% of glowRadius
      this.light.maxRange = this.glowRadius * (0.5 + t * 0.5);
      // Keep color in sync
      this.light.color = this.glowColor;
    }

    // --- VFX pulse ---
    if (this.vfx) {
      // Pulse VFX scale between 70% and 100% of glowScale
      const vfxScale = this.glowScale * (0.7 + t * 0.3);
      this.vfx.setCustomParam('global_scale', vfxScale);
      // Pulse strength/intensity between 60% and 100%
      this.vfx.setCustomParam('Strength', 0.6 + t * 0.4);
    }
  }

  /** Apply base (non-animated) values to both light and VFX */
  private applyStaticValues(): void {
    if (this.light) {
      this.light.intensity = this.glowIntensity;
      this.light.maxRange = this.glowRadius;
      this.light.color = this.glowColor;
    }
    if (this.vfx) {
      this.vfx.setCustomParam('global_scale', this.glowScale);
      this.vfx.setCustomParam('Strength', 1.0);
    }
  }
}
