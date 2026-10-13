# Third-Person Controller Archetype

## Genre Definition

Players control a character from an orbiting third-person camera, moving through space using camera-relative input with physics-based locomotion and discrete abilities like jumping and dashing. The core fantasy is responsive, fluid movement — the satisfaction comes from how the character *feels* to control, not from combat or puzzle-solving. This archetype underpins action-adventure, platformer, and exploration games where traversal is the primary experience.

## Reference Games

- **Super Mario Odyssey** — camera-relative locomotion with discrete grounded abilities that layer naturally onto physics
- **Ratchet & Clank** — third-person orbit camera with tight ability gating via a rule-based state machine

## Session Length

A single session lasts anywhere from 5 minutes (quick movement test) to several hours depending on the game built on top of the template. Sessions end when the player quits or the scene is unloaded. Players typically run multiple short iteration sessions during development.

## Required Modules

- **movement** — Translates camera-relative thumbstick/keyboard input into world-space velocity with acceleration curves. Without this, the character cannot respond to player input and the core traversal fantasy collapses entirely.
- **camera** — Orbits behind the character and provides a forward reference direction for movement. Without the camera, movement input has no reference frame and cannot be resolved into world-space directions.
- **abilities** — Jump and dash extend movement into three dimensions and add moment-to-moment decision-making. Without abilities, the character is limited to flat ground traversal, losing the defining "feel" of a third-person controller.
- **physics** — Integrates gravity, friction, and mass to make motion feel grounded and physically plausible. Without physics, abilities produce teleport-style displacements rather than arcs and momentum carries.
- **statemachine** — Prevents ability overlap and gates transitions so only one locomotion state is active at a time. Without this, simultaneous jump and dash inputs corrupt physics state and create unrecoverable character positions.

## Optional Modules

- **animation** — Drives an animator graph with speed, grounded, and jump variables to provide visual feedback; the controller functions without it but feels lifeless.
- **audio** — Footstep and ability sounds reinforce movement feel; purely additive to gameplay.
- **vfx** — Particles and trails amplify ability impacts visually without affecting physics or state logic.

## Excluded Modules

- **inventory** — Managing items shifts focus from movement mastery to resource management, changing the genre to action-RPG.
- **combat** — Attack abilities introduce targeting and hitboxes that conflict with the pure movement state machine design.
- **hud_objectives** — Overlay quest markers and mission text assume a narrative game layer not present in a pure controller template.

## Design Patterns

These patterns define the genre. Removing any of them results in a fundamentally different game type.

### Camera-Relative Input Resolution
Movement direction is derived from the camera's forward vector, not the character's facing direction. This decouples what the player *sees* from where the character *points*, enabling natural exploration. Without this, the controller becomes tank-controls where the character must rotate before moving forward.

### Physics-Layered Abilities
Jump and dash are impulses applied on top of the continuous physics simulation — they inherit existing momentum rather than replacing velocity. This produces emergent interactions (momentum carry, mid-air redirects) that feel natural. Without physics layering, abilities feel like discrete teleports disconnected from movement.

### Exclusive State Transitions
Exactly one locomotion state is active at any moment. Transitions are gated by conditions (grounded check, cooldown ready) and the state machine prevents re-entry or simultaneous activation. Without exclusivity, ability overlaps corrupt velocity and create gameplay-breaking edge cases.

### Acceleration Curves
Ground movement ramps up and down over configurable durations rather than snapping to target speed. This gives the character perceived weight and momentum. Without curves, movement feels slippery or robotic depending on the raw speed value.

## Common Pitfalls

- **Jump impulse vs. gravity mismatch** — Setting jump impulse without tuning gravity results in either floaty infinite-feeling jumps or instant gravity snaps; always tune both together.
- **Missing coyote time** — Without a grace window after walking off a ledge, players perceive the jump as "not responding" and blame input lag even when timing was correct.
- **Camera collision radius too small** — A collision sphere that is too tight allows the camera to clip through thin walls; test against the thinnest geometry in the project.
- **Dash interrupting jump arc** — If the dash state is reachable from Jumping, players can cancel mid-arc and launch in unexpected directions; gate dash to Movement-only unless explicitly desired.
- **Input dead zone misaligned with acceleration threshold** — The slide direction lock threshold and controller dead zone must be tuned together; a threshold below the dead zone means direction never locks.
- **Acceleration time too long for camera sensitivity** — High acceleration time combined with high camera rotation speed makes the character lag behind camera turns, feeling disconnected from input.

## Visual Style Expectations

- Character silhouette reads clearly against all background types at the default camera distance
- Ground contact is visually communicated (shadow blob or ground indicator) to support landing judgment
- Jump and dash each have distinct visual signatures so players know the ability activated
- Camera maintains enough height clearance to preview terrain 2-3 character lengths ahead
- Motion blur or trail effects are optional but must not obscure the character's current position
- UI overlays stay in screen corners to keep the center gameplay area unobstructed
