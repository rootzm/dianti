# Physics Module Guide

## Purpose

The Physics module governs the underlying force simulation that makes character movement feel grounded and physical. It integrates gravity, friction, mass, and restitution every frame via the KinematicForceController, producing a velocity and position delta that the CharacterControllerBase applies. The player experience it governs is the sense of weight — how much the character "hangs" in the air, how quickly it slides, and whether it ever bounces.

## Design Intent

Default values target a grounded, predictable feel appropriate for action games: moderate gravity, no bounce, standard friction. Adjusting gravity and maxFallSpeed together controls how "floaty" or "heavy" the controller feels. Friction and restitution are advanced tuning knobs primarily useful for special surface types.

## Module Keywords

- Gravity, mass, friction, restitution, fall speed, kinematic, force integration

## Behaviors

- Gravity applied every frame as a constant downward acceleration (configurable magnitude and direction)
- Friction applied when grounded: combines character staticFriction with surface contactStaticFriction via frictionCombineMode
- Restitution applied on ground contact if restitution > 0: character bounces with combined coefficient
- maxFallSpeed caps downward velocity to prevent tunneling through thin floors
- Mass scales all forces; a higher mass requires larger impulses to achieve the same result

## UI Rules

Layout: browse_focused
Appearance: no
Items: Gravity & Fall, Friction, Mass & Restitution

## Gameplan Image Generation

Browse cards: physics diagram style. Gravity & Fall = downward arrow with velocity cap line. Friction = surface contact diagram with friction force vector. Mass & Restitution = weight icon and bounce arc.

## Style & Art Direction

Technical diagram style with physics notation. Neutral dark background.

## Content Rules

Items correspond to the three independently tunable physics domains in KinematicForceController.

## Source Files

- scripts/controllers/KinematicForceController.ts — staticFriction, dynamicFriction, restitution, frictionCombineMode, restitutionCombineMode
- scripts/controllers/CharacterForceControllerBase.ts — gravity, maxFallSpeed, mass

## Quick Tune Properties

### Gravity Strength
- Type: numeric
- Source: CharacterForceControllerBase — gravity.y (negated; default 9.8)
- Action: prompt
- Keywords: gravity, fall, weight
- UI Type: slider (4.0–20.0, step 0.5)
- UI Group: quick_tune

## Category Tune Properties

### Physics Feel
- Keywords: gravity, weight, float
- Affects: gravity, maxFallSpeed
- Suggested presets: Light, Standard, Heavy
- UI Type: toggle_multisegment
- UI Group: Customize

### Surface Friction
- Keywords: friction, slide, grip
- Affects: staticFriction, frictionCombineMode
- Suggested presets: Slippery, Normal, Grippy
- UI Type: toggle_multisegment
- UI Group: Customize
