# Abilities Module Guide

## Purpose

Abilities are the discrete locomotion actions — Jump and Dash — that extend the player's traversal options beyond flat ground movement. They are gated by the CharacterStateMachine: only one ability may be active at a time, and each has cooldown and condition checks before it can activate. The player experience governed here is the excitement of "expressing skill through the timing and sequencing of abilities."

## Design Intent

Jump and Dash should feel distinct but complementary. Jump provides vertical traversal with variable-height control (abort on release) and forgiveness windows (coyote time, jump buffer). Dash provides quick horizontal burst with cooldown pacing. Together they create a movement vocabulary that rewards practice.

## Module Keywords

- Jump, dash, impulse, cooldown, coyote time, jump buffer, state machine, ability gating

## Behaviors

- Jump: applies upward velocity impulse gated by grounded check and cooldown; abort on button release cancels upward momentum for variable height
- Jump buffer: records input slightly before landing so the jump fires on touchdown (currently in development)
- Coyote time: grace window after leaving a ledge where jump is still allowed (currently in development)
- Dash: fires a directional velocity burst in the character's current facing direction; timed duration with cooldown

## UI Rules

Layout: browse_focused
Appearance: yes
Items: Jump, Dash

## Gameplan Image Generation

Browse cards: clean render against dark background. Jump = character in mid-air parabola arc with upward arrow. Dash = character with horizontal speed lines and motion blur.
Style tiles: abstract energy graphic suggesting the ability type — electric arc for jump, blur streak for dash.

## Style & Art Direction

Neutral developer-preview style. Use physics diagram language: force vectors, arcs, trajectory lines.

## Content Rules

Each item corresponds to one ability class with its own tunable properties.

## Source Files

- scripts/components/ability/JumpAbility.ts — jumpImpulse, jumpBufferTime, coyoteTime, jumpCooldown
- scripts/components/ability/DashAbility.ts — dashDistance, dashDuration, dashCooldown
- scripts/controllers/CharacterStateMachine.ts — state gating for Jumping and Dashing states

## Quick Tune Properties

### Jump Impulse
- Type: numeric
- Source: JumpAbility — jumpImpulse (default 5.0)
- Action: prompt
- Keywords: jump height, impulse, vertical
- UI Type: slider (2.0–12.0, step 0.5)
- UI Group: quick_tune

### Dash Distance
- Type: numeric
- Source: DashAbility — dashDistance (default 5.0)
- Action: prompt
- Keywords: dash, distance, burst
- UI Type: slider (1.0–15.0, step 0.5)
- UI Group: quick_tune

## Category Tune Properties

### Jump Height Feel
- Keywords: jump, height, float
- Affects: jumpImpulse
- Suggested presets: Low, Medium, High
- UI Type: toggle_multisegment
- UI Group: Customize

### Dash Aggression
- Keywords: dash, speed, cooldown
- Affects: dashCooldown, dashDistance
- Suggested presets: Conservative, Standard, Aggressive
- UI Type: toggle_multisegment
- UI Group: Customize
