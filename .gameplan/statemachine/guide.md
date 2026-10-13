# StateMachine Guide

## Purpose
The StateMachine module defines the three character states (Movement, Jumping, Dashing) and the rules governing transitions between them. It is the central coordinator that ensures only valid ability combinations can activate simultaneously.

## Design Intent
State gating is what makes the controller feel intentional rather than chaotic. The transition rules should be strict enough to prevent ability conflicts but permissive enough to feel responsive. The Movement state is the default anchor; Jump and Dash are accessible from it and return to it automatically.

## Module Keywords
- Type: system
- Concerns: states, transitions, transition conditions, state gating

## Behaviors
- Movement state: default state, runs MovementAbility.update() each frame
- Jumping state: entered from Movement when jump.canActivate() is true; returns to Movement when jump completes
- Dashing state: entered from Movement when dash.canActivate() is true; returns to Movement when dash completes
- Transition requests: requestStateChange queues a transition; state fires canEnter check before switching

## UI Rules
Layout: browse_focused
Appearance: no
Items: Movement State, Jumping State, Dashing State

## Gameplan Image Generation
- Browse cards: dark background, abstract state machine diagrams
- Movement State card: ground plane with character node highlighted, idle→walk→run arc
- Jumping State card: jump arc with entry/exit arrows, transition condition labels
- Dashing State card: dash burst arrow with cooldown ring and transition arrows

## Style & Art Direction
Technical blueprint style. No art direction established.

## Content Rules
- States correspond exactly to StateId constants in CharacterStateMachine.ts: Movement, Jumping, Dashing
- Transition conditions are code-level (not tunable parameters); Customize controls shape behavior presets

## Source Files
- `scripts/controllers/CharacterStateMachine.ts` — all state definitions, transition rules, handleJumpClick/handleDashClick/handleJumpRelease
- `scripts/controllers/StateMachineBase.ts` — base state machine framework
- `scripts/config/StateConfigs.ts` — GroundedStateConfig, AirborneStateConfig interfaces
- `scripts/config/TransitionRules.ts` — transition rule definitions
- `scripts/config/ActionEvents.ts` — action event constants

## Quick Tune Properties
No parameters from this module are in overview quick_tune (state machine logic is not directly numeric).

## Category Tune Properties
No direct numeric tune properties. Behavior is shaped through Customize presets.
