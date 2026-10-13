# Animation Module Guide

## Purpose

The Animation module bridges the character's locomotion state machine and the animator graph, driving visual state based on runtime values. It sets graph variables (Speed, IsGrounded, IsJumping, MovementDirectionYaw) every frame so the AnimGraph can blend between idle, run, jump, and land animations. The player experience it governs is the visual responsiveness of the character — how immediately the body reacts to input.

## Design Intent

The animation system is designed to be passive: it reads state, sets variables, and fires transition triggers. The AnimGraph itself owns the blend logic. Designers configure groundedThreshold to tune when the "recently grounded" blend kicks in for landing smoothing.

## Module Keywords

- Animation, animator, graph variables, blend, locomotion, grounded, jump trigger

## Behaviors

- Speed variable: set to horizontal velocity magnitude every frame
- IsGrounded: set from state machine ground contact check
- IsRecentlyGrounded: uses configurable groundedThreshold for landing blend
- IsJumping: true while in Jumping state
- MovementDirectionYaw: relative angle between camera-relative movement direction and character facing (for strafe blending)
- JumpTrigger: fires as a one-shot transition trigger on JumpStartedEvent

## UI Rules

Layout: browse_focused
Appearance: no
Items: Graph Variables, Landing Blend

## Gameplan Image Generation

Browse cards: clean animation curve diagrams. Graph Variables = a simple state machine diagram with labeled arcs. Landing Blend = a timing curve showing grounded threshold.

## Style & Art Direction

Technical diagram style. Neutral background.

## Content Rules

Items map to the two independently tunable concerns in AnimationController.

## Source Files

- scripts/controllers/AnimationController.ts — animatorEntity, groundedThreshold
- scripts/controllers/CharacterStateMachine.ts — StateId, isGrounded, isNearlyGrounded

## Quick Tune Properties

### Grounded Threshold
- Type: numeric
- Source: AnimationController — groundedThreshold (default 0.8)
- Action: prompt
- Keywords: grounded, landing, blend
- UI Type: slider (0.1–1.5, step 0.05)
- UI Group: quick_tune

## Category Tune Properties

### Grounded Blend Window
- Keywords: landing blend, grounded threshold, transition
- Affects: groundedThreshold
- Suggested presets: Tight, Standard, Generous
- UI Type: toggle_multisegment
- UI Group: Customize
