# Movement Module Guide

## Purpose

Movement controls how the player character translates across the ground in response to thumbstick or keyboard input. It reads the camera's forward vector to produce camera-relative world-space velocity and applies an acceleration curve so speed ramps up and down smoothly. The player experience this module governs is the "ground feel" — snappy vs. weighty, tight vs. drifty.

## Design Intent

Default values target a light action-adventure feel: fast enough to cover ground quickly, with enough acceleration ramp to feel physical rather than instantaneous. Designers building on this template should tune moveSpeed and accelerationTime together before adjusting anything else.

## Module Keywords

- Locomotion, ground movement, camera-relative, acceleration, damping, strafe, input

## Behaviors

- Camera-relative input: right = camera right, forward = camera forward flattened to XZ plane
- Acceleration curve: ramps from 0 to moveSpeed over accelerationTime seconds when starting, decelerates at decelerationFactor×accelerationTime when stopping or changing direction >90°
- Air control: airControlFactor multiplies accelerationTime while airborne (higher = harder to steer mid-air)
- Slide direction lock: optional feature that freezes the movement direction once input exceeds slideDirectionLockThreshold, preventing drift
- Strafe mode: character faces camera forward instead of movement direction

## UI Rules

Layout: browse_focused
Appearance: yes
Items: Ground Locomotion, Air Control, Rotation, Slide Direction Lock

## Gameplan Image Generation

Browse cards: clean isometric renders on a dark background. Ground Locomotion = character footprint trail arrows on ground plane. Air Control = character with curved trajectory arc in air. Rotation = character with rotation arrow indicator. Slide Direction Lock = straight trajectory beam with lock icon.
Style tiles: abstract motion graphics showing movement style — speed lines, momentum vectors.

## Style & Art Direction

Neutral developer-preview style for all movement cards. Use directional arrows and abstract physics diagrams as visual language.

## Content Rules

Each browse item maps to a distinct tunable concern within MovementAbility.

## Source Files

- scripts/components/ability/MovementAbility.ts — moveSpeed, rotationSpeed, enableAcceleration, accelerationTime, airControlFactor, decelerationFactor, useForceAsInputs, strafeMode, slideDirectionLockEnabled, slideDirectionLockThreshold
- scripts/utils/AccelerationCurve.ts — acceleration interpolation logic

## Quick Tune Properties

### Move Speed
- Type: numeric
- Source: MovementAbility — moveSpeed (default 5.0)
- Action: prompt
- Keywords: speed, locomotion, ground
- UI Type: slider (1.0–15.0, step 0.5)
- UI Group: quick_tune

## Category Tune Properties

### Movement Style
- Keywords: kinematic vs force-based, physics mode
- Affects: useForceAsInputs
- Suggested presets: Kinematic, Force-Based
- UI Type: toggle_multisegment
- UI Group: Customize
- Notes: Kinematic is the default — instant position delta. Force-Based is physics-simulated with momentum.

### Strafe Mode
- Keywords: strafe, facing, rotation
- Affects: strafeMode
- Suggested presets: Off, On
- UI Type: toggle_multisegment
- UI Group: Customize
- Notes: On = character faces camera forward; Off = character faces movement direction.

### Slide Direction Lock
- Keywords: direction lock, drift prevention
- Affects: slideDirectionLockEnabled
- Suggested presets: Off, On
- UI Type: toggle_multisegment
- UI Group: Customize
