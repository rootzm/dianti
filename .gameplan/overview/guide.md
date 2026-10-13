# Overview Module Guide

## Purpose

The Overview provides a high-level dashboard for the Base_AI_Template project — a bird's-eye view of all modules, identity pillars, and global quick-tune parameters. It serves as the starting point for any designer opening the gameplan.

## Design Intent

Keep the overview focused on navigation and project identity. Deep tuning lives inside individual modules. Quick-tune sliders here should cover the one or two parameters a developer adjusts first when setting up a new game on top of the template.

## Module Keywords

- Dashboard, navigation, identity, quick-tune, global
- Third-person controller, blank canvas, modular

## UI Rules

Layout: overview
Appearance: no

## Gameplan Image Generation

Header banner: wide cinematic shot of a single humanoid character silhouette standing on a flat plane, viewed from low angle, neutral grey-box aesthetic, clean studio lighting, soft blue-grey gradient sky, developer preview feel.
Category cards: each card uses a top-down or isometric icon-style render of the module's subject matter against a dark neutral background.

## Style & Art Direction

Neutral developer-template aesthetic. No established theme yet. Use clean geometric shapes and soft studio lighting. Avoid any game-specific palette — this is a blank canvas.

## Content Rules

No item lists. Overview only shows project identity and navigation tiles.

## Source Files

- scripts/ThirdPersonControllerInputAligned.ts — main entry point, wires all subsystems
- scripts/controllers/CharacterStateMachine.ts — state machine overview
- scripts/controllers/CharacterUpdateManager.ts — update loop orchestration

## Quick Tune Properties

### Move Speed
- Type: numeric
- Source: scripts/components/ability/MovementAbility.ts — moveSpeed
- Action: prompt
- Keywords: speed, locomotion, movement
- UI Type: slider (1.0–15.0, step 0.5)
- UI Group: quick_tune

### Jump Impulse
- Type: numeric
- Source: scripts/components/ability/JumpAbility.ts — jumpImpulse
- Action: prompt
- Keywords: jump, height, impulse
- UI Type: slider (2.0–12.0, step 0.5)
- UI Group: quick_tune

### Camera Distance
- Type: numeric
- Source: scripts/ThirdPersonCamera.ts — targetDistance
- Action: prompt
- Keywords: camera, distance, zoom
- UI Type: slider (3.0–15.0, step 0.5)
- UI Group: quick_tune

### Gravity
- Type: numeric
- Source: scripts/controllers/CharacterForceControllerBase.ts — gravity.y (negated)
- Action: prompt
- Keywords: gravity, fall speed, physics
- UI Type: slider (4.0–20.0, step 0.5)
- UI Group: quick_tune
