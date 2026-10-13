# Locomotion Guide

## Purpose
Locomotion covers everything about how the player character physically moves: ground speed and acceleration, aerial control during jumps, and the dash burst ability. Together these three subsystems define the spatial vocabulary available to the player — how far, how fast, and how fluidly they can navigate the world.

## Design Intent
Ground movement should feel immediately responsive but not instant — acceleration curves give it the sense of real weight. Air control should be noticeably reduced compared to ground, preserving jump arc commitment. Dash should be decisive and brief, with the cooldown as the primary balancing lever.

## Module Keywords
- Type: browse_focused
- Domain: ability, locomotion
- Items: ground_movement, aerial_movement, dash

## Behaviors
- MovementAbility computes camera-relative direction from CameraService each frame and integrates it through AccelerationCurve to produce per-frame deltas.
- JumpAbility applies a vertical velocity impulse on activation; abort path cancels upward velocity on button release for variable height.
- DashAbility calculates dashSpeed = dashDistance / dashDuration and applies a directional moveDelta each frame for the duration.

## UI Rules
- Layout: browse_focused
- Appearance: no
- Items: ground_movement, aerial_movement, dash

## Gameplan Image Generation
- Item images: clean dark background, diagrammatic motion arrows, character silhouette mid-motion, blueprint/prototype aesthetic
- ground_movement: character running forward with velocity vectors, side view, cinematic
- aerial_movement: character at jump apex with arc trajectory shown, mid-air pose
- dash: character in dash burst with motion blur and directional speed lines

## Style & Art Direction
Prototype/blueprint aesthetic: dark neutral backgrounds, white/cyan motion lines and arrows, clean geometric character silhouette. No stylized art applied yet — this is a blank-slate template.

## Content Rules
- Each browse item must correspond to one of the three ability classes
- Tune controls must reference actual @property() fields from the source files

## Source Files
- `scripts/components/ability/MovementAbility.ts` — ground locomotion, acceleration curves, strafe mode
- `scripts/components/ability/JumpAbility.ts` — jump impulse, coyote time, jump buffer, cooldown
- `scripts/components/ability/DashAbility.ts` — dash distance, duration, cooldown
- `scripts/utils/AccelerationCurve.ts` — acceleration/deceleration curve logic for ground movement
- `scripts/utils/GraceTimer.ts` — coyote time implementation
- `scripts/utils/InputBuffer.ts` — jump buffering implementation
- `scripts/utils/Cooldown.ts` — cooldown timer for jump and dash

## Quick Tune Properties

### moveSpeed
- Type: number
- Source: MovementAbility.moveSpeed (default: 5.0)
- Action: prompt
- Keywords: speed, ground, locomotion
- UI Type: slider (0.5–15.0, step 0.5)
- UI Group: tune

### accelerationTime
- Type: number
- Source: MovementAbility.accelerationTime (default: 0.1)
- Action: prompt
- Keywords: acceleration, ramp-up, feel
- UI Type: slider (0.0–1.0, step 0.05)
- UI Group: tune

### airControlFactor
- Type: number
- Source: MovementAbility.airControlFactor (default: 2.0)
- Action: prompt
- Keywords: air control, aerial, factor
- UI Type: slider (1.0–5.0, step 0.25)
- UI Group: tune

### decelerationFactor
- Type: number
- Source: MovementAbility.decelerationFactor (default: 2.0)
- Action: prompt
- Keywords: deceleration, stop, braking
- UI Type: slider (0.5–5.0, step 0.25)
- UI Group: tune

### jumpImpulse
- Type: number
- Source: JumpAbility.jumpImpulse (default: 5.0)
- Action: prompt
- Keywords: jump, height, impulse
- UI Type: slider (1.0–15.0, step 0.5)
- UI Group: tune

### jumpCooldown
- Type: number (ms)
- Source: JumpAbility.jumpCooldown (default: 200)
- Action: prompt
- Keywords: jump, cooldown, timing
- UI Type: slider (0–1000, step 50)
- UI Group: tune

### dashDistance
- Type: number
- Source: DashAbility.dashDistance (default: 5.0)
- Action: prompt
- Keywords: dash, distance, reach
- UI Type: slider (1.0–15.0, step 0.5)
- UI Group: tune

### dashDuration
- Type: number
- Source: DashAbility.dashDuration (default: 0.2)
- Action: prompt
- Keywords: dash, duration, speed
- UI Type: slider (0.05–1.0, step 0.05)
- UI Group: tune

### dashCooldown
- Type: number
- Source: DashAbility.dashCooldown (default: 1.0)
- Action: prompt
- Keywords: dash, cooldown, availability
- UI Type: slider (0.1–5.0, step 0.1)
- UI Group: tune

## Category Tune Properties

### movementStyle
- Keywords: acceleration, responsiveness
- Affects: accelerationTime, airControlFactor, decelerationFactor
- Suggested presets: Snappy (fast acceleration, low air control), Balanced (default values), Floaty (slow acceleration, high air control)
- UI Type: toggle_multisegment
- UI Group: customize

### dashMode
- Keywords: dash, frequency, reach
- Affects: dashDistance, dashDuration, dashCooldown
- Suggested presets: Quick Burst (short distance, short cooldown), Standard (default), Long Lunge (large distance, long cooldown)
- UI Type: toggle_multisegment
- UI Group: customize

### jumpStyle
- Keywords: jump, height, variable
- Affects: jumpImpulse, jumpCooldown
- Suggested presets: Low Hop (low impulse), Standard Jump (default), High Leap (high impulse)
- UI Type: toggle_multisegment
- UI Group: customize
