/**
 * FloatingRotateAnimation
 *
 * Applies a continuous up/down floating (sin wave) and Y-axis rotation effect
 * to the entity it is attached to. Ideal for collectibles, props, or any
 * object that needs an idle hover animation.
 *
 * Component Attachment: Scene Entity (any entity with a mesh, e.g. sm_guangbiao)
 * Component Networking: Local (visual effect only, no network sync needed)
 * Component Ownership: Not Networked
 */

import {
  Component,
  component,
  ExecuteOn,
  OnEntityStartEvent,
  OnWorldUpdateEvent,
  OnWorldUpdateEventPayload,
  property,
  Quaternion,
  subscribe,
  TransformComponent,
  Vec3,
} from 'meta/worlds';
import type {Maybe} from 'meta/worlds';

@component({description: 'Adds floating (sin wave) and Y-axis rotation animation to an entity.'})
export class FloatingRotateAnimation extends Component {
  /** Amplitude of the floating motion in meters */
  @property({isNetworked: false})
  floatAmplitude: number = 0.15;

  /** Speed of the floating motion (cycles per second) */
  @property({isNetworked: false})
  floatSpeed: number = 1.0;

  /** Rotation speed in degrees per second around Y axis */
  @property({isNetworked: false})
  rotateSpeed: number = 90.0;

  // --- Internal state (not networked) ---
  private transform: Maybe<TransformComponent> = null;
  private basePosition: Vec3 = Vec3.zero;
  private elapsedTime: number = 0;

  /**
   * Updates the base position used by the floating animation.
   * Call this when repositioning the marker externally so the float
   * animation centers on the new position instead of snapping back.
   */
  public setBasePosition(pos: Vec3): void {
    this.basePosition = pos;
    if (this.transform) {
      this.transform.localPosition = pos;
    }
  }

  @subscribe(OnEntityStartEvent, {execution: ExecuteOn.Everywhere})
  onStart() {
    this.transform = this.entity.getComponent(TransformComponent);
    if (this.transform) {
      this.basePosition = this.transform.localPosition;
    }
    console.log('[FloatingRotateAnimation] Started on entity');
  }

  @subscribe(OnWorldUpdateEvent, {execution: ExecuteOn.Everywhere})
  onUpdate(payload: OnWorldUpdateEventPayload) {
    if (!this.transform) {
      return;
    }

    const dt = payload.deltaTime;
    this.elapsedTime += dt;

    // Floating: sin wave on Y axis
    const yOffset = Math.sin(this.elapsedTime * this.floatSpeed * Math.PI * 2) * this.floatAmplitude;
    this.transform.localPosition = new Vec3(
      this.basePosition.x,
      this.basePosition.y + yOffset,
      this.basePosition.z,
    );

    // Rotation: continuous Y-axis spin
    const currentRotation = this.transform.localRotation;
    const rotationIncrement = Quaternion.fromEuler(new Vec3(0, this.rotateSpeed * dt, 0));
    this.transform.localRotation = Quaternion.mul(currentRotation, rotationIncrement);
  }
}
