archetype: third_person_controller

## Core Idea

summary: Physics-based third-person controller template — fluid, responsive movement as a blank canvas.

A modular, extensible third-person character controller built for Meta Horizon Studio. The template provides all the foundational systems — camera-relative locomotion, jump arcs, dash bursts, physics integration, and a rule-based state machine — so developers can build any movement-focused game on top without writing controller infrastructure from scratch. The player fantasy is "satisfying, responsive movement that feels great before content is added."

## Gameplay

summary: Move, jump, and dash through space using camera-relative controls and physics momentum.

- **Move** — Camera-relative thumbstick/keyboard input drives ground locomotion with smooth acceleration
- **Jump** — Ground-gated impulse launches the character upward; variable height on release
- **Dash** — Burst movement in facing direction with cooldown; gated to ground state
- **Land** — Physics restores ground contact; coyote time and jump buffer smooth transitions

## Mechanics

summary: Kinematic physics, acceleration curves, and a state machine create predictable, tunable movement feel.

The KinematicForceController integrates gravity, friction, and mass every frame, while MovementAbility applies acceleration curves on top of that to produce smooth ramp-up and ramp-down. The CharacterStateMachine enforces exclusive state ownership — Movement, Jumping, Dashing — so no two abilities run simultaneously. The ThirdPersonCamera orbits the player using angle-space smoothing to prevent quaternion flip artifacts, and its forward vector is the reference direction for all input resolution.

## Game Feel

summary: Weighty, grounded, responsive — like a blank canvas that already feels good to move around in.

The default configuration targets a "light action-adventure" feel: fast enough to feel responsive, weighted enough to feel physical. Tuning gravity and jump impulse together controls airtime. Acceleration time controls snappiness. The state machine's coyote time and jump buffer windows smooth over timing imprecision so the controller feels forgiving without feeling floaty.

## Inspiration

- **Super Mario Odyssey** — gold standard for camera-relative controls that feel natural on first play
- **Ratchet & Clank** — ability gating via state machine without sacrificing responsiveness
- **Uncharted** — smooth acceleration curves that make traversal feel cinematic even without animation polish

## Visual Identity

Art direction not yet established — this is a blank-slate template. Image generation should use clean, neutral visuals: solid-color or gradient backgrounds, simple geometric shapes, developer-friendly grey-box aesthetic. Keywords: neutral, clean, modular, technical, 3D blueprint, grey-box prototype, developer template, soft lighting, studio preview.

Image Generation Keywords: clean studio render, neutral grey background, soft ambient lighting, technical blueprint aesthetic, developer prototype, 3D wireframe accent, meta horizon studio style

## Modules

- **Movement** — How the player character navigates the world on the ground
  includes: movement

- **Abilities** — The discrete actions (jump, dash) that extend traversal into three dimensions
  includes: abilities, statemachine

- **Camera** — The orbiting view that frames the player and provides the input reference direction
  includes: camera

- **Physics** — The underlying force simulation that makes motion feel grounded and physical
  includes: physics

- **Animation** — How the character's visual state reflects its locomotion state
  includes: animation

- **World** — Scene composition, lighting, and environment placeholder for template projects
  includes: environment, lighting

## Relationships

- Movement reads Camera's forward vector every frame to resolve input direction; the two modules are tightly coupled at runtime
- Abilities use Physics velocity to build on top of existing momentum (dash inherits horizontal speed, jump adds vertical impulse)
- StateMachine gates Abilities — jump and dash can only activate from Movement state; they self-transition back to Movement on completion
- Animation reads StateMachine state and Movement speed every frame to drive animator graph variables
- Physics provides ground contact info that Movement (air control factor) and StateMachine (grounded check) both depend on
