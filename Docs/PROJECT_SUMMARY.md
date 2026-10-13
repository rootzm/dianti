# Base AI Template - Project Summary

## Overview

A third-person character controller template with camera-relative movement, physics-based locomotion, and animation integration. Features a modular, component-based architecture with a rule-based state machine for character states.

The template uses a **two-entity hierarchy** — a CharacterRootEntity and a CharacterSimulatedEntity — that separates logical character state from physics simulation, enabling runtime hot-swapping of the simulated body.

## Scene (`space.hstf`)

- **StartingWorld** - Scene root entity
- **Floor** - 50x50 unit white plane with static collision at origin
- **SpawnPoint1** - Default player spawn location at (-5, 0.315, 0) with SpawnPoint component (engine handles default spawning automatically)
- **Systems** - Entity hosting GamePhaseManager, GameEnemyManager, GamePropManager, GamePlayerPropManager, GameDepotManager, GameGuideManager, HudGuideUsableItemServer, and GameDoorManager
- **Directional Light** - Scene lighting at (0, 10, 0)
- **Camera** - Input-driven third-person camera with ThirdPersonCamera script (right stick/mouse controls yaw/pitch, collision avoidance, angle-space smoothing)
- **PropSpawnPoints** - Parent entity with 8 child spawn point entities (SpawnPoint_1–SpawnPoint_8) at floor-level positions spread across the playable area. PropManager spawns one prop at each child entity's position.
- **PatrolPoints** - Parent entity with 5 child waypoint entities (Point1–Point5) spread around the play area at positions (±8, 0, ±8) and (0,0,0), used by EnemyLogic for random patrol navigation
- **NavMesh** - Navigation mesh entity for enemy pathfinding. Baked from scene geometry so enemies navigate around walls and obstacles instead of moving in straight lines. Auto-discovered by EnemyLogic at runtime.

## Player Template (`Templates/PlayerCharacter.hstf`)

The player is a fully-featured character controller with modular components for movement, physics, animation, and state management, split across two entities.

### Entity Hierarchy

```
PlayerCharacter (CharacterRootEntity)
├── SimulatedBody (CharacterSimulatedEntity)
│   └── Collider — Capsule collider (radius: 0.3, height: 1.2)
└── Visuals — Character mesh with AnimatorComponent and animation clips
```

### CharacterRootEntity (`PlayerCharacter`)

The root entity that other systems refer to as "the character". Owns the root transform. All gameplay-logic and high-level controller components live here.

| Component / Script | Purpose |
|--------------------|---------|
| `BasePlayerComponent` | Marks entity as client-owned player |
| `PlayerLogicComponent` | Player data and health manager. Owns all health state and logic directly (max 100 HP, takeDamage RPC with cross-ownership support, healing, invulnerability, death/revival, damage modifiers). HudGame subscribes to onHealthChanged() for UI updates. |
| `CharacterUpdateManager` | Orchestrates all subsystems in correct update order; supports runtime hot-swap of the simulated body via `swapSimulatedEntity()` |
| `CharacterStateMachine` | Rule-based state machine (Movement, Jumping, Dashing) |
| `PlayerMovementAbility` | Player-specific movement: binary switch-like control (instant run on input, instant stop on release, no walk state); always faces camera horizontal forward direction |
| `JumpAbility` | Jump physics with impulse, coyote time, jump buffering, and cooldown |
| `DashAbility` | Dash ability with directional dash |
| `AnimationController` | Drives animator graph variables (`Speed`, `IsGrounded`, `IsRecentlyGrounded`, `IsJumping`, `MovementDirectionYaw`); uses `@property()` bridge to replicate animation state from server to all clients; references Visuals entity for `AnimatorComponent` |
| `PlayerActionController` | Input handler with dead zone filtering |
| `PlayerFlashLight` | Flashlight cone detection — each frame checks enemies with `enableStopByFlashLight=true` against the camera-forward spotlight cone (distance → angle → async raycast LOS); freezes enemies that enter the cone instantly via `EnemyLogic.freezeByFlashlight()`. Enemies leaving the cone enter a 1-second grace period before being resumed via `EnemyLogic.resumeFromFlashlight()`; re-entering the cone within that window cancels the timer and keeps the enemy frozen. Flashlight-off or `GamePhase.Settlement` releases all frozen and pending enemies immediately. Enemy list cached on `EnemySpawnCompleteEvent`; cache cleared on `GamePhase.Settlement`. |

### CharacterSimulatedEntity (`SimulatedBody`)

The entity that runs the character's physics simulation, normally a child of the CharacterRootEntity. All physics-related components live here to keep physics self-contained and hot-swappable.

| Component / Script | Purpose |
|--------------------|---------|
| `CharacterSimulationController` | Toggles all simulation components (`WorldsGroundInfoComponent`, `CharacterForceControllerBase`, `PhysicsBodyComponent`) as a unit via `setActive()`; monitors its `enabled` property each frame so it can be toggled from the editor UI; used by `CharacterUpdateManager` for auto-discovery and body swapping |
| `PhysicsBodyComponent` | Physics simulation (mass: 10, locked rotation) |
| `KinematicCharacterComponent` | Kinematic character controller (height: 1.75, step offset: 0.5, slope limit: 45°) |
| `CharacterForceControllerBase` | Abstract force controller base (one concrete subclass is active at a time) |
| `KinematicForceController` | Kinematic physics forces (gravity, friction, collision response via KCC move-delta) |
| `DynamicForceController` | Rigid-body physics forces via `PhysicsBodyComponent` (for simulation-style characters) |
| `WorldsGroundInfoComponent` | Ground detection via raycast with sphere-cast fallback |

### Visuals Entity

- ScavengerRobot character mesh (`Models/Characters/ScavengerRobot/ScavengerRobot_rigged_compute_graph.usdz`) with `AnimatorComponent`
- Animgraph: `Models/Characters/ScavengerRobot/ScavengerRobot.animgraph` (cloned and retargeted from Standard_Character.animgraph)
- Rotated 180° on Y-axis for proper orientation
- Animation sockets: RightHand (hand_r_socket), LeftHand (hand_l_socket), Back (spineUpper_joint), Head (head_joint)

**Animation Clips (13 total, retargeted to ScavengerRobot skeleton):**
- Idle
- Walk: Fwd, Back, Left, Right
- Run: Fwd, Back, Left, Right
- Jump: Start, Loop, Land
- Attack

## Enemy Spawn Manager

A client-local script that spawns enemies from the EnemyCharacter template at designated spawn point positions. Each client independently spawns its own set of local enemies.

- **Attached to**: ServerSystems entity (runs on all clients via ExecuteOn.Everywhere)
- **Spawns**: EnemyCharacter template instances as LocalOnly entities (each client has its own independent copy)
- **Spawn points**: Reads positions from child entities of the "Enemy" entity in the scene. Spawns one enemy per spawn point.
- **Configurable properties**: `enemyTemplates` (readonly TemplateAsset[] — randomly selects one template per enemy spawn)
- **Behavior**: On start (client-side only), finds all children of the "Enemy" parent entity and spawns one local enemy at each spawn point's world position and rotation. Server skips spawning since local-only enemies are not needed there.
- **Script**: `scripts/components/EnemySpawnManager.ts`

## Game Phase System

A client-local state machine that manages the game loop phases. Each client runs its own phase progression independently with no server involvement. A LocalEvent is broadcast on every transition so other scripts can react.

- **Phases**: Initialization → Exploration → Settlement (loops Explore→Settle after first run)
- **Initialization phase** (one-time at game start): Runs a strict serial async orchestrator that: (1) waits for player entity and freezes it (disables CharacterSimulationController), (2) applies game_config.json values to all subsystems (enemy spawning, enemy AI, player, props, elevator energy), (3) loads saved progress or applies debug overrides, (4) loads the sublevel and waits until active, (5) spawns enemies via GameEnemyManager, (6) spawns props via GamePropManager, (7) resets elevator energy to 0 with level-appropriate maxEnergy, (8) teleports player to the SpawnPoint entity in the scene, (9) unfreezes player, hides loading screen, opens elevator doors, and transitions directly to Exploration.
- **Energy requirements**: Level-dependent via `getEnergyRequirementForLevel()`: configurable per level (defaults: level 1 = 200, level 2 = 1000, level 3+ = (levelId - 1) × multiplier). Values loaded from game_config.json. On level transition, energy is NOT reset — only maxEnergy updates. On full game reset (death/restart), energy resets to 0.
- **Sublevel loading**: The scene (space.hstf) is empty — actual level content lives in sublevels. The Level entity has BOTH a `SublevelComponent` and a `GameLevelManager` on the same entity. GameLevelManager holds multiple @property TemplateAsset references (level0–level3) for different level templates. Level selection algorithm (levelId is 1-based): levelId 1 → level0 (fixed), levelId >= 2 → random from level1–level3 (no consecutive repeats).
- **Attached to**: Systems entity (runs on all clients via ExecuteOn.Everywhere; orchestrator runs on player client only)
- **Script**: `scripts/game/GamePhaseManager.ts`
- **Events file**: `scripts/game/GamePhaseEvents.ts` — exports `GamePhase` enum, `GamePhaseChangedEvent`, `GamePhaseChangedPayload`, `EnemySpawnCompleteEvent`, `PropSpawnCompleteEvent`
- **Public methods**: `startExploration()`, `startSettlement()`, `addEnergy(amount)`
- **Spawn orchestration**: GamePhaseManager directly calls `GameEnemyManager.spawnEnemiesAtAllPoints()` and `GamePropManager.spawnPropsAtSpawnPoints()` after the sublevel loads (both are truly async and await all spawns before returning). Neither manager auto-spawns on start — initial spawning is orchestrated by GamePhaseManager.
- **Level reset flow**: On LevelTransitionRequestEvent, increments level index and broadcasts LevelResetEvent. Both managers handle re-spawning on level reset via their LevelResetEvent subscribers.
- **Player teleport**: After sublevel loads, finds the `SpawnPoint` entity (in space.hstf) and teleports the player's simulated body + root to that position/rotation. Disables forces for one frame and resets acceleration to prevent sliding.

## Key Architecture Concepts

### ICharacterInitializable Interface

All character sub-systems implement `ICharacterInitializable`, which provides:

```typescript
initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void
```

This two-entity initialization pattern lets each sub-system acquire its dependencies from the correct entity:
- **From CharacterRootEntity**: `TransformComponent`, `MovementAbility`, `JumpAbility`, `DashAbility`, `CharacterStateMachine`, `AnimationController`
- **From CharacterSimulatedEntity**: `CharacterForceControllerBase`, `WorldsGroundInfoComponent`, `PhysicsBodyComponent`, `CharacterControllerBase` (KCC), colliders

### Runtime Body Swapping

`CharacterUpdateManager.swapSimulatedEntity()` allows hot-swapping the simulated body at runtime. This enables the character to change its physics shape, motion model, or behavior dynamically (e.g., switching from a humanoid to a ball).

The swap flow:
1. Deactivates the previous force controller and ground info (`enabled = false`)
2. Acquires new sub-system references from the new simulated entity
3. Re-initializes all sub-systems via `ICharacterInitializable.initialize()`
4. Activates the new force controller and ground info (`enabled = true`)

If no `characterSimulatedEntity` is explicitly set, `CharacterUpdateManager` auto-discovers it by searching children for a `CharacterSimulationController`. It selects the first child whose `CharacterSimulationController` is enabled, disables all other children's controllers, and falls back to `this.entity` (root) if no enabled controller is found.

### Transform Synchronization

Because the simulated entity is a child, the force controller syncs transforms after physics:
- `CharacterForceControllerBase.syncCharacterTransform()` copies the simulated entity's world position back to the root entity, then re-writes it to the simulated entity (to avoid parent–child offset drift).
- `KinematicForceController` also syncs rotation; `DynamicForceController` leaves rotation to the physics engine.

### Force Controller Selection

Only one force controller should be active at a time on the simulated entity:

| Controller | Use Case | Physics Model |
|-----------|----------|---------------|
| `KinematicForceController` | Standard character control (predictable, responsive) | Fakes physics via manual integration + KCC `addMoveDelta` |
| `DynamicForceController` | Simulation-style (rolling, tumbling, bouncing) | Delegates to `PhysicsBodyComponent` rigid-body dynamics |

## Key Systems

### Update Order (`CharacterUpdateManager.onWorldUpdate`)

Each frame, subsystems are updated in this order:
1. `WorldsGroundInfoComponent.update()` — ground detection
2. `CharacterForceControllerBase.update(dt)` — physics integration
3. `CharacterStateMachine.update(dt)` — state transitions & ability updates
4. `AnimationController.update()` — sync animation graph variables
5. Registered callbacks

### Input System
- Uses `IInputProvider` interface for input abstraction
- Dead zone processing with configurable thresholds

**⚠️ Input UI Not Implemented:** Movement works via joystick/mouse, but **Jump and Dash abilities have no input UI** — HUD buttons need to be added before players can trigger them.

### Movement Features
- Camera-relative movement (forward input = camera's forward direction)
- Player always faces camera forward direction (rotating the camera rotates the player character) via `PlayerMovementAbility`
- Enemies rotate toward movement direction when moving via `EnemyMovementAbility`
- Player uses binary (switch-like) movement: joystick push = instant run speed, release = instant stop. No walk state — Speed jumps directly past walk animation threshold to avoid flicker. Acceleration curve and legacy damping are disabled for the player.
- Enemies retain smooth acceleration/deceleration curves (base `MovementAbility` behavior)
- Air control with configurable multiplier
- Slide direction lock mechanics
- Runtime speed multiplier support (used by sprint system: 1.5x when sprinting)
- Force-based input mode (for dynamic characters)
- Sprint toggle: HUD button switches between run/sprint states. Sprinting applies 1.5x speed multiplier and drains power at 2.0/s when moving. Auto-reverts to run when power is depleted.

### State Machine
- States: `Movement`, `Jumping`, `Dashing`
- Priority-ordered transition rules
- Context-aware (ground state, time in state)
- Extensible with custom states and rules
- Actions (jump, dash) are blocked during non-Exploration game phases; unlocked when Exploration begins

### Ground Detection (`WorldsGroundInfoComponent`)
- Two-phase detection: raycast first, sphere-cast fallback
- Configurable slope limit, grounded threshold, cast distance
- Provides `isGrounded`, `isGroundHit`, `groundDistance`, `lastGoodGroundHit`
- Can be enabled/disabled for body swapping

## Key Files

**Core Scripts:**
- `scripts/ThirdPersonCamera.ts` - Input-driven third-person camera (right stick/mouse yaw/pitch, collision, angle-space smoothing)
- `scripts/controllers/CharacterStateMachine.ts` - State machine (Movement, Jumping, Dashing)
- `scripts/controllers/PlayerActionController.ts` - Player input handling
- `scripts/controllers/EnemyActionController.ts` - Movement execution layer for enemies
- `scripts/components/EnemyLogic.ts` - Central enemy AI brain (patrol/chase, waypoint navigation)
- `scripts/components/EnemyFov.ts` - FOV cone detection with LOS raycast
- `scripts/controllers/AnimationController.ts` - Animation driver
- `scripts/controllers/ICharacterInitializable.ts` - Two-entity initialization interface

**Component Scripts:**
- `scripts/components/update/CharacterUpdateManager.ts` - Update orchestration & body swapping
- `scripts/components/ability/MovementAbility.ts` - Abstract base class for movement logic with acceleration, air control, slide mechanics
- `scripts/components/ability/PlayerMovementAbility.ts` - Player subclass: always faces camera horizontal forward
- `scripts/components/ability/EnemyMovementAbility.ts` - Enemy subclass: rotates toward movement direction
- `scripts/components/ability/JumpAbility.ts` - Jump ability with coyote time, buffering, cooldown
- `scripts/components/ability/DashAbility.ts` - Dash ability
- `scripts/controllers/CharacterForceControllerBase.ts` - Abstract force controller base class
- `scripts/controllers/KinematicForceController.ts` - Kinematic physics forces
- `scripts/controllers/DynamicForceController.ts` - Rigid-body physics forces
- `scripts/components/physics/CharacterSimulationController.ts` - Simulation activation toggle for the CharacterSimulatedEntity
- `scripts/components/physics/WorldsGroundInfoComponent.ts` - Ground detection

**Utilities:**
- `scripts/utils/AccelerationCurve.ts` - Smooth acceleration
- `scripts/utils/DeadZone.ts` - Input dead zone processing
- `scripts/utils/InputBuffer.ts` - Input buffering
- `scripts/utils/GraceTimer.ts` - Coyote time grace period
- `scripts/utils/Cooldown.ts` - Cooldown timer

## Enemy Template (`Templates/EnemyCharacter.hstf`)

A server-owned enemy character template using the same two-entity hierarchy and physics setup as the PlayerCharacter, but driven by AI instead of player input.

### Entity Hierarchy

```
EnemyCharacter (CharacterRootEntity)
├── KinematicCharacter (CharacterSimulatedEntity, networkable)
│   └── Collider — Capsule collider (radius: 0.3, length: 1.05)
└── Visuals — Placeholder for enemy mesh/animations
    ├── Head_Socket — Animation socket (Head bone)
    │   └── AlertIndicator — Red exclamation mark mesh (starts disabled, toggled by EnemyActionController)
    ├── RightHand_Socket, LeftHand_Socket, Back_Socket
```

### Components on Root Entity

| Component / Script | Purpose |
|--------------------|---------|
| `CharacterUpdateManager` | Orchestrates subsystems (references KinematicCharacter child) |
| `CharacterStateMachine` | State machine (Movement, Jumping, Dashing) |
| `AnimationController` | Drives animator variables (references Visuals child); uses `@property()` bridge to replicate animation state from server to all clients |
| `EnemyMovementAbility` | Enemy-specific movement: rotates toward movement direction when moving (original behavior) |
| `JumpAbility` | Jump physics |
| `EnemyLogic` | Central AI brain — patrol/chase state, random waypoint navigation, coordinates EnemyFov + EnemyActionController |
| `EnemyActionController` | Movement execution layer — receives input from EnemyLogic |
| `EnemyFov` | FOV cone detection (fovAngle, detectionRange, LOS raycast) |

### Components on KinematicCharacter (SimulatedEntity)

| Component / Script | Purpose |
|--------------------|---------| 
| `CharacterSimulationController` | Toggles all simulation components as a unit; used by CharacterUpdateManager for auto-discovery |
| `KinematicCharacterPlatformComponent` | Kinematic character controller (center: y=0.825, height: 1.65, radius: 0.3, slopeLimit: 45°, stepOffset: 0.5) |
| `PhysicsBodyComponent` | Physics body (DynamicCollider, Kinematic drive mode, mass: 10, locked rotation axes X/Z) |
| `KinematicForceController` | Kinematic physics forces (gravity, friction, collision response via KCC move-delta) |
| `WorldsGroundInfoComponent` | Ground detection via raycast with sphere-cast fallback |

### EnemyLogic (Central Brain)

The central enemy AI controller that manages state transitions and coordinates EnemyFov and EnemyActionController. Uses NavMesh pathfinding to navigate around walls and obstacles.

- **States**: Patrol, Chase, Attack, WaitAtDoor, AttackDoor, Stop
- **NavMesh Integration**: Auto-discovers `NavMeshComponent` in the scene on start. Uses `NavMeshComponent.findPath()` to compute obstacle-avoiding waypoints. Falls back to straight-line movement if no NavMesh is found or path computation fails.
- **Patrol behavior**: Reads patrol waypoints from a "PatrolPoints" scene entity (5 child waypoints spread around the play area). On start, picks a random point and requests a NavMesh path to it. Follows the path waypoints sequentially. On arrival, picks another random point and re-paths. Cycles indefinitely.
- **Chase behavior**: When EnemyFov reports a visible player (Alert state with clear LOS), interrupts patrol and chases that player. Re-paths every 1.2s to track moving targets. Does NOT chase players who are in elevator safe zones.
- **Distance-based AI LOD**: Enemies beyond 15m from the nearest player throttle expensive AI ticks (FOV checks, state transitions, stuck detection, pathfinding requests) to once every 0.5s. Path-following movement still runs every frame for smooth visuals. Enemies within 15m run full-rate AI.
- **WaitAtDoor behavior**: When the chase target enters an elevator safe zone, the enemy paths toward the player's last known position, stops at the nearest navigable point (elevator door), waits 3 seconds, then returns to Patrol.
- **AttackDoor behavior**: When stuck in Chase state near a closed door (detected via stuck detection: <0.3m movement in 2.5s), finds the nearest closed door within 4m, approaches it, faces it, and attacks it on cooldown (using attackDamage/attackCooldown). Transitions back to Patrol when the door breaks or opens.
- **Lose chase**: Returns to patrol (picks a new random waypoint) when the player exceeds `loseChaseDist` or LOS is lost.
- **FOV filtering**: Before running FOV detection, filters out players who are in safe zones (elevator) so detection never triggers on safe players.
- **Alert indicator**: Toggles a red exclamation mark above the enemy's head on chase start/stop.
- **Configurable properties**: `patrolSpeed` (0.5), `chaseSpeed` (1.0), `arrivalThreshold` (1.0), `loseChaseDist` (15), `movementDisabled`, `attackDamage` (5), `attackCooldown` (2s), `attackRange` (2)
- Runs on server, uses `ExecuteOn.Owner`
- Player list cached and refreshed on join/leave events

### EnemyFov (Detection Only)

A standalone FOV cone detection component that determines whether a player entity is within the enemy's detection cone based on angle, range, and line-of-sight raycast occlusion.

- **Configurable properties**: `fovAngle` (default 120°), `detectionRange` (default 12), `showDebug`, `isDetecting`
- Exposes async `getNearestVisiblePlayerAsync()` and sync `isEntityInFov()` methods
- Detection states: Idle, AlertOccluded (in cone but blocked), Alert (clear LOS)
- Does NOT contain any state decision logic — purely detection

### EnemyActionController (Movement Execution Only)

A thin movement execution layer that receives Vec2 movement input from EnemyLogic and passes it through to the CharacterStateMachine.

- Does NOT contain any AI decision logic (patrol/chase)
- Exposes `applyMovementInput(input: Vec2)` for EnemyLogic to call
- Has a `movementDisabled` property for stun/cutscene overrides

## Prop Energy Calculation

Prop energy displayed in all UI panels (backpack, charge panel, depot) uses a unified formula:

`energy = max(1, floor(baseValue × levelId² / (totalPropCount × 6)))`

- `baseValue = 0` always displays as empty (no energy text rendered).
- The calculation scales with level progression (levelId is 1-based) and the number of props in the current level.
- **PropConfig.ts** exports `calculatePropEnergy(baseValue, levelId, totalPropCount)` — the pure formula function.
- **PropEnergyState.ts** — a no-import shared state module holding `currentLevelId` and `currentTotalPropCount`. GamePhaseManager writes to it via `setCurrentLevelId` / `setCurrentTotalPropCount` after props spawn.
- **PropEnergyHelper.ts** — imports from PropEnergyState and PropConfig; exports `calculatePropEnergyFromGameState(baseValue)` for UI consumption. All three UI files (HudGameBackpack, HudPanelCharge, HudPanelDepot) call this function when populating slot displays.
- **GamePhaseManager** calls `syncEnergyState()` (which updates both levelId and totalPropCount in PropEnergyState) in all three level lifecycle paths: initialization, level transition, and game reset — always after `spawnPropsAndWait()` resolves.

## Door System (`scripts/components/DoorLogic.ts`, `scripts/components/DoorTriggerZone.ts`, `scripts/game/GameDoorManager.ts`)

A level door system allowing players to open/close doors and enemies to break them down. Doors are self-contained within the DoorFrame template — all level instances automatically inherit the full door system.

### DoorFrame Template (`Assets/Templates/DoorFrame.hstf`)

A self-contained door template with the following entity hierarchy:

```
DoorFrame (root — TransformPlatformComponent only)
├── SM_chuansongmen — door frame mesh (chuansongmen_01.fbx instance)
└── DoorPivot — hinge entity (offset x=-0.9 for left-edge pivot)
    ├── Components: PhysicsBody (StaticCollision), ColliderBox (air wall), DoorLogic
    ├── sm_menban — door panel mesh (sm_menban.fbx instance, y=1.2 offset)
    ├── TriggerZone — proximity detection (PhysicsBody Trigger, ColliderBox 1.5m, DoorTriggerZone)
    ├── SfxDoorOpen — spatial sound entity (SoundPlatformComponent → sfx_door_open.mp3)
    └── SfxDoorClose — spatial sound entity (SoundPlatformComponent → sfx_door_close.mp3)
```

- **Used in levels**: level_0, level_1, level_2, level_3, level_5 (all chuansongmen_01 instances replaced)
- **Automatic discovery**: GameDoorManager finds all doors via `EntityService.findEntitiesWithComponent(DoorLogic)` — works automatically for all template instances

### Door States
- **Closed** — collision enabled (blocks players and enemies), health at max, interactable by player
- **Open** — collision disabled, invulnerable to enemy damage, interactable (player can close it)
- **Broken** — collision disabled, mesh rotated 85° on X-axis (fallen flat), not interactable, permanent

### DoorLogic Component
- Attached to the DoorPivot entity (the entity that rotates)
- Manages the Closed/Open/Broken state machine with script-driven rotation animation (0.5s slerp)
- Open animation: Y-axis rotation 0°→90°; Broken animation: X-axis rotation 0°→85° (fallen)
- Collision is immediately toggled on state change (no wait for animation to finish)
- Each door has configurable `maxHp` (default 80); only Closed doors can take damage
- Fires `DoorStateChangedEvent` and `DoorDamagedEvent` (LocalEvent) on state transitions

### DoorTriggerZone Component
- Attached to TriggerZone entity (child of DoorPivot — so getAncestors() finds DoorLogic)
- Detects player proximity via `OnTriggerEnterEvent`/`OnTriggerExitEvent` (walks ancestors for `BasePlayerComponent`)
- Shows the shared `PropPromptShowEvent` interaction prompt (same pattern as DepotCrateInteraction)
- On `PropPromptConfirmPickupEvent`: calls `DoorLogic.toggleDoor()` to open or close

### GameDoorManager Component
- Attached to the `Systems` entity in `space.hstf` (co-located with GamePhaseManager)
- `initializeDoors()` — called by `GamePhaseManager` after every sublevel load (initial start, level transition, level reset) — finds all `DoorLogic` entities and randomizes states: 70% Closed, 20% Open, 10% Broken
- `resetAllDoors()` — resets all doors to Closed with full HP (available for cleanup)
- Events file: `scripts/events/DoorEvents.ts` — exports `DoorState` enum, `DoorStateChangedEvent`, `DoorDamagedEvent`

## Prop System (`scripts/props/`)

A modular prop system providing a foundation for item management in the world.

- **PropConfig.ts**: Defines `PropRarity` enum (Rarity1–Rarity5, values 0–4), `PropCategory` enum (Weapon, Armor, Consumable, Material, Quest), and configuration constants (display names: "Rarity 1"–"Rarity 5", drop weights: 60/30/10/5/2, max stack sizes).
- **PropBase.ts** (`PropData`): Base component for all props. Properties: `weight`, `baseValue`, `rarity`, `category`, `description`, `iconName`. Attached to any prop entity (server-owned, networked).
- **PropManager.ts** (`GamePropManager`): Singleton manager that registers, queries, and filters props by rarity/category. Dynamically spawns props at designated spawn point positions at game start (client-side, LocalOnly). Spawn points are child entities of the "PropPoints" parent entity — each spawn point produces exactly one prop. If spawn points exceed total props, extras remain empty. Uses unified weighted random selection: reads PropData.spawnWeight from each template to determine spawn probability (no rarity-based distribution). Total props scale with level (10 + level*4, max 40). Properties: `propTemplates` (TemplateAsset[] indexed by rarity tier). Provides `refreshRegistry()`, `registerProp()`, `unregisterProp()`, `getByRarity()`, `getByCategory()`, `getByRarityAndCategory()`, `findByName()`. Attached to ServerSystems entity.
- **PropPickupHandler.ts** (`PropPickupHandler`): Handles prop pickup on the prop entity. The prop's PhysicsBody is set to Trigger type with a larger collider for detection range. On pickup, the prop is disabled (not destroyed) for pool reuse. All props use unified Manual pickup:
  - **Manual**: When a player enters the trigger zone, a 2D screen-space HUD prompt appears (via LocalEvent to HudPickupPromptController). Clicking the prompt collects and destroys the prop. Prompt hides when the player exits the zone.
  - On pickup, emits `PropPickedUpEvent` (LocalEvent) with a `PropDataSnapshot` payload so `GamePlayerPropManager` can track the collected prop.
- **PropEvents.ts**: Shared event definitions to avoid circular imports. Defines `PropDataSnapshot` (@serializable snapshot of prop properties), `PropPickedUpEvent` (LocalEvent fired on pickup), and `PropInventoryChangedEvent` (NetworkEvent broadcast on inventory changes).
- **GamePlayerPropManager.ts** (`GamePlayerPropManager`): Manages the player-prop inventory relationship with full CRUD operations. Attached to ServerSystems (server-owned). Listens for `PropPickedUpEvent` to automatically add props on pickup. Broadcasts `PropInventoryChangedEvent` (NetworkEvent) to all clients on changes.
  - **Create**: `addProp(player, propData, quantity)` — adds a prop snapshot; stacks duplicates by name+category; enforces `maxInventorySize` (default 50) and `maxCarryWeight` (default 100).
  - **Delete**: `removeProp(player, propName, category, quantity)`, `clearInventory(player)` — removes quantity or clears all.
  - **Update**: `updateQuantity(player, propName, category, newQuantity)` — sets exact quantity.
  - **Read**: `getPlayerInventory(player)`, `hasProp(player, name, category)`, `getPropQuantity(player, name, category)`, `getByRarity(player, rarity)`, `getByCategory(player, category)`, `getInventoryCount(player)`, `getPlayerWeight(player)`, `getPlayerTotalValue(player)`.

## Prop Energy Calculation

All UI panels displaying prop energy values (backpack slots, charge panel, depot panel) use a unified energy formula instead of showing the raw baseValue:

`energy = max(1, floor(baseValue × levelId² / (totalPropCount × 6)))`

- `baseValue = 0` displays as empty (no energy text).
- Energy scales with level progression (levelId is 1-based) and the total number of props available in the current level.
- GamePhaseManager updates the shared energy state (levelId and totalPropCount) after props are spawned in all three level lifecycle paths: initialization, level transition, and game reset.
- UI files call `calculatePropEnergyFromGameState(baseValue)` to get the display value.

## Pickup Prompt HUD

A 2D screen-space HUD that shows a pickup prompt at the bottom-center of the screen when the local player is near a manual-pickup prop. Hidden when out of range.

- **Entity**: HudPickupPrompt (child of root in space.hstf)
- **XAML**: `Assets/Hud/HudPickupPrompt.xaml`
- **Script**: `scripts/ui/HudPickupPromptViewModel.ts` (HudPickupPromptViewModel + HudPickupPromptController)
- **Trigger**: Subscribes to `PropPromptShowEvent` / `PropPromptHideEvent` (LocalEvents emitted by PropPickupHandler when player enters/exits trigger range)
- **Layout**: Hand icon (51x37, left) + prop item background (80x80, right) + name bar with lineBg.png (220x30, bottom center showing prop name)
- **Image assets**: `Assets/UI/game/hand.png`, `Assets/UI/game/propItemBgS.png`, `Assets/UI/game/lineBg.png`
- **Behavior**: Shown when player enters trigger range of a Manual prop, hidden when player leaves or picks it up
- **Click-to-pickup**: The entire prompt is clickable (Button with Command binding). When the player taps/clicks the prompt, it emits `PropPromptConfirmPickupEvent` (LocalEvent). `PropPickupHandler` subscribes to this event to execute the pickup, emit `PropPickedUpEvent`, and destroy the prop. 

## Pickup Notification HUD

A brief notification that appears in the top-left corner of the screen when the player picks up an item, showing the item name and description. Auto-hides after 3.5 seconds.

- **Entity**: HudPickupNotification (child of root in space.hstf)
- **XAML**: `Assets/Hud/HudPickupNotification.xaml`
- **Script**: `scripts/ui/HudPickupNotificationViewModel.ts` (HudPickupNotificationViewModel + HudPickupNotificationController)
- **Trigger**: Subscribes to `PropPickedUpEvent` (LocalEvent emitted by PropPickupHandler on pickup) and `PropConsumedEvent` (LocalEvent emitted by HudGameBackpackController on item use)
- **Displays**: Item name on pickup; "消耗：物品名称" on consume
- **Behavior**: Shows on pickup, auto-hides after 3.5s. Multiple pickups reset the timer and update the displayed item.

## Backpack HUD

A bottom-center backpack panel showing the player's inventory slots and bag icon with a collapsible toggle. Slots display collected prop icons and names. Supports item selection with description, "使用" (use) action, and "存入" (store to depot) action.

- **Entity**: HudGameBackpack (child of root in space.hstf)
- **XAML**: `Assets/Hud/HudGameBackpack.xaml`
- **Script**: `scripts/ui/HudGameBackpack.ts` (HudGameBackpackViewModel + HudGameBackpackController)
- **Layout**: 5 inventory slots (120x120 each, horizontal row) + bagTop.png button (above) + bag.png (106x116) on the right. Each slot shows the prop's icon (65x65, centered) and name (bottom) when filled.
- **Quality frames**: Each filled slot overlays a per-rarity NineSliceImage frame (white/green/blue/purple/gold for Rarity1–5) sourced from `Assets/UI/hud_game/backpack_frame_quality_*.png`. Hidden when the slot is empty.
- **Image assets**: `Assets/UI/game/propItemBgNS.png` (default slot background, 9-slice), `Assets/UI/game/propItemBgS.png` (selected slot background), `Assets/UI/game/bag.png`, `Assets/UI/game/bagTop.png`, `Assets/UI/hud_game/backpack_frame_quality_{white,green,blue,purple,gold}.png`
- **Icon mapping**: Icons display via ImageBrush bound to TextureAsset properties.
- **Pickup integration**: Subscribes to `PropInventoryChangedEvent`. On 'add' change, fills the next empty slot (left-to-right) with the prop's icon and name.
- **Selection state**: Clicking a filled slot selects it (background swaps to propItemBgS.png). Only one slot can be selected at a time. Clicking the already-selected slot deselects it. Selected slot shows the prop's description text above and "使用" button below. Empty slots cannot be selected. Selection is cleared when backpack is collapsed.
- **Use item**: Clicking the "使用" button removes the selected item from GamePlayerPropManager (calls removeProp), shows a "消耗：物品名称" notification in the top-left (same style/position as pickup notification, auto-hides after 3.5s), and updates the backpack slots (shifts remaining items to fill the gap). 
- **Store to depot**: Clicking the "存入" button (visible only when a slot is selected) transfers the selected item from the player's backpack into the depot (DepotManager.addItem). Shows "仓库已满" notification if the depot is full, or "存入：物品名称" on success.
- **Toggle behavior**: Clicking bagTop.png toggles the 5 inventory slots between collapsed (hidden) and expanded (visible). Default state is expanded.
- **Animation**: Staggered reveal/hide with 80ms delay between slots. Expand: right-to-left (slot 4 first). Collapse: left-to-right (slot 0 first).

## Countdown Timer HUD

A top-center ScreenSpace HUD that displays a MM:SS countdown during each Exploration phase. When the timer reaches zero it fires `AnnouncementCountdownEndEvent` once and then applies a periodic penalty every 1 second: drains 1 power per tick while the player has power remaining, then drains 1 HP per tick once power is depleted.

- **Entity**: HudGameCountdown (child of Hud entity in space.hstf, id: e315339d-ab01-44f1-96cb-85762c7c0068)
- **XAML**: `Assets/Hud/HudGameCountdown.xaml` — countdown background image + clock icon + TextBlock bound to `textTime`
- **Script**: `scripts/ui/HudGameCountdown.ts` (HudGameCountdownViewModel + HudGameCountdownController)
- **Duration**: 600 seconds (10:00) per level, configurable via `COUNTDOWN_DURATION_S` constant
- **Damage**: `damagePerTick` @property (default 10, range 1–50); applied every 1.5 s after expiry via `PlayerLogic.takeDamage()`
- **Phase integration**: Resets and starts on `GamePhaseChangedEvent` → `GamePhase.Exploration`; pauses on all other phases
- **Expiry event**: Fires `AnnouncementCountdownEndEvent` (LocalEvent, once per countdown) which `HudAnnouncementManager` routes to a tips announcement
- **Image assets**: `Assets/UI/hud_game/countdownBg.png`, `Assets/UI/hud_game/countdownClock.png`

## Cutscene System

A fullscreen animated intro cutscene that plays once on the very first game load (levelId === 1, debug mode off). Seven storyboard images fade in/hold/fade out in sequence, synchronized to background music. A skip button (top-right) lets the player bypass the sequence.

- **Entity**: HudCutscene (child of Hud entity in space.hstf, id: bac1148c-d228-4950-b1d4-6c2c2b11f4e8)
- **Audio child**: CutsceneBgm (child of HudCutscene, NonSpatial SoundPlatformComponent)
- **XAML**: `Assets/Hud/HudCutscene.xaml` — fullscreen Grid with black background, 7 stacked Images bound to opacity1–opacity7, skip Button bound to `events.OnClickBtnSkip`
- **ViewModel**: `scripts/ui/HudCutsceneViewModel.ts` — 7 opacity properties + `OnClickBtnSkip` UiEvent
- **Controller**: `scripts/ui/HudCutscene.ts` — timeline state machine driven by `OnWorldUpdateEvent`; each image has hardcoded fadeInStart/fadeInEnd/holdEnd/fadeOutEnd keyframes. Total duration: 45.73 s. Client-side only (server context skipped). Fires `CutsceneFinishedEvent` (LocalEvent) on completion or skip.
- **Events**: `scripts/events/CutsceneEvents.ts` — `CutsceneFinishedEvent` (LocalEvent) + `CutsceneFinishedPayload`
- **Flow integration**: `GamePhaseManager.playCutsceneAndWait()` inserts the cutscene between Step 12 (hideLoadingScreen) and Step 13 (showLevelInfoAndWait) in `runInitializationSequence()`, guarded by `this.levelId === 1 && !this.debugLevelEnable`. Not called in `performTransition` or `performReset`.

## Loading Screen HUD

A full-screen black loading overlay with centered "Loading..." text. Implemented as a ScreenSpace Custom UI panel.

- **Entity**: HudLoading (child of Hud entity in space.hstf)
- **XAML**: `Assets/Hud/HudLoading.xaml`
- **Script**: `scripts/ui/HudLoadingViewModel.ts` (HudLoadingViewModel + HudLoadingController)
- **Visibility**: Controlled via `HudLoadingController.setVisible(true/false)` or by toggling `CustomUiComponent.isVisible`
- **Blocking**: `isBlocking=true` (disables player locomotion while visible)

## Depot System (`scripts/depot/`)

## Player Death & Fail Panel

When the player's health reaches 0, the death system activates:

1. **PlayerLogicComponent** sets `isDead = true`, disables movement via `CharacterUpdateManager.setActive(false)`, and broadcasts `PlayerDeathEvent` (LocalEvent).
2. **EnemyLogic** filters out dead players from FOV detection and stops chasing/attacking dead targets (returns to Patrol).
3. **HudPanelFail** listens for `PlayerDeathEvent`, displays the fail panel with current floor number (levelId, which is 1-based) and elevator energy, and provides a RESTART button.
4. **RESTART button** fires `LevelResetEvent`. `GamePhaseManager` subscribes to it and performs a full reset: revives the player, destroys all enemies/props, unloads sublevel, reloads level 1, teleports player to spawn, and restarts the game phases.

- **Entity**: HudPanelFail (child of root in space.hstf)
- **XAML**: `Assets/Hud/HudPanelFail.xaml` (binds textFloor, textPower, OnClickBtnRestart)
- **Script**: `scripts/ui/HudPanelFail.ts`
- **Event**: `PlayerDeathEvent` defined in `scripts/events/HealthEvents.ts`

## Announcement/Broadcast System (`scripts/events/AnnouncementEvents.ts`, `scripts/ui/HudAnnouncementManager.ts`)

A client-local system that displays timed text announcements via `HudPanelTips` and plays corresponding audio effects in response to game events. Announcements are queued in FIFO order so simultaneous triggers play sequentially.

- **Events**: 7 `LocalEvent`s defined in `AnnouncementEvents.ts` — `AnnouncementElevatorArrivedEvent`, `AnnouncementHpLowEvent`, `AnnouncementPowerLowEvent`, `AnnouncementEnergyFullEvent`, `AnnouncementEnergyInsufficientEvent`, `AnnouncementChargeDoneEvent`, `AnnouncementCountdownEndEvent`. All share a single `AnnouncementPayload (@serializable)`.
- **HudAnnouncementManager**: Scene entity component that subscribes to all 7 events, enqueues entries, and processes them one at a time. Each announcement shows text via `HudPanelTips.showText()` for 5 seconds and plays audio from a named child `SoundComponent` entity. HP-low and Power-low announcements are suppressed after the first fire per floor; both flags reset when the game phase transitions to `Exploration`.
- **Triggers**: `GamePhaseManager.startExploration()` fires elevator-arrived; `PlayerLogic` fires HP-low/Power-low on threshold crossings; `ElevatorCommitPowerTrigger` fires energy-full or energy-insufficient on player entry; `HudPanelCharge` fires charge-done when the ball animation completes. `AnnouncementCountdownEndEvent` is fired by `HudGameCountdownController` when the per-level countdown reaches zero.
- **HudPanelTips**: `showText(text, durationMs?)` now accepts an optional duration (default 3000 ms). Returns a `Promise<void>` that resolves after the panel auto-hides, enabling sequential announcement chaining.

## Save/Load System (`scripts/save/`)

A server-authoritative save/load system that persists player progress (level and depot state) across sessions using PlayerVariables.

- **SaveServer.ts** (`SaveServer`): Server-side component attached to a scene entity (e.g., ServerSystems). Listens for global NetworkEvents from clients to save or load data. Writes/reads PlayerVariables (`savedLevel` as NUMBER, `savedDepot` as STRING/JSON object). Responds to load requests by broadcasting a targeted NetworkEvent back to the requesting player.
- **SaveClient.ts** (`SaveClient`): Client-side component attached to the player entity. Exposes `requestSave(levelId, depotJson)` and `requestLoad()` public methods. Filters server responses by local player and emits `SaveLoadResultEvent` (LocalEvent) for external scripts to subscribe to.
- **PlayerVariables**: `savedLevel` (NUMBER) stores the last saved level ID; `savedDepot` (STRING) stores depot state as a JSON string.
- **Events**: `SaveRequestSaveEvent`, `SaveRequestLoadEvent` (client→server), `SaveLoadResponseEvent` (server→client broadcast), `SaveLoadResultEvent` (local, for external subscribers on the client).

## Depot System (`scripts/depot/`)

A global singleton depot/warehouse manager for storing props in a shared 12-slot storage. Unlike the player backpack (which supports stacking), the depot treats every item as occupying one independent slot — no stacking.

- **DepotManager.ts** (`DepotManager`): Singleton class (not a Component). Access via `DepotManager.getInstance()`. Compatible with `PropDataSnapshot` from the prop system.
  - **Max capacity**: 12 slots, each slot holds exactly one prop.
  - **No stacking**: Identical items occupy separate slots.
  - **Create**: `addItem(propData)` (first empty slot), `addItemAt(index, propData)` (specific slot).
  - **Delete**: `removeItemAt(index)`, `removeItemByIconName(iconName)`, `clearAll()`.
  - **Update**: `updateItem(index, newPropData)`, `swapItems(indexA, indexB)`.
  - **Read**: `getItem(index)`, `getAllItems()`, `findByIconName(iconName)`, `findByCategory(category)`, `findByRarity(rarity)`, `hasItem(iconName)`.
  - **Capacity queries**: `getMaxSlots()`, `getOccupiedCount()`, `getEmptyCount()`, `isFull()`, `isEmpty()`.

## Depot HUD

A centered overlay panel showing the depot's 12 storage slots in a 6x2 grid. Opened/closed via a "仓库" toggle button in the bottom-right corner. Selecting a slot shows item details (name, rarity, description) and a "取出" (withdraw) button at the bottom of the panel.

- **Entity**: HudDepot (child of Hud entity in space.hstf)
- **XAML**: `Assets/Hud/HudDepot.xaml`
- **Script**: `scripts/ui/HudDepot.ts` (HudDepotViewModel + HudDepotController)
- **Layout**: Semi-transparent backdrop + centered 820x540 panel with dark background. 6x2 grid of slots, each showing prop icon (64x64) and name. Details panel below the grid shows selected item's name, rarity, description, and a "取出" button.
- **Toggle**: "仓库" button (bottom-right, always visible) opens/closes the panel. Close "✕" button in the panel header also closes it.
- **Data source**: Reads from `DepotManager.getInstance()` on each open (refreshes all 12 slots).
- **Selection**: Clicking a filled slot selects it (background swaps to propItemBgS.png), showing details. Clicking again deselects. Only one slot selected at a time.
- **Withdraw to backpack**: Clicking the "取出" button in the detail panel transfers the selected item from the depot into the player's backpack (GamePlayerPropManager.addProp). Shows "背包已满" notification if the backpack is full, or "取出：物品名称" on success.
- **External event**: Other scripts can fire `DepotToggleRequestEvent` (LocalEvent from HudDepot.ts) to programmatically open/close the depot panel.
- **Image assets**: Reuses `Assets/UI/game/propItemBgNS.png`, `propItemBgS.png`, `infoBg.png`, and prop icons from the backpack system.

## Additional Templates

**Elevator** (`Assets/Templates/Elevator.hstf`):
- Elevator model with double sliding doors controlled by `ElevatorDoorController` script
- Doors slide outward from center (left door -X, right door +X) and slide back together to close
- Configurable properties: slideDistance, slideSpeed, openDuration, autoLoop, loopInterval
- Door entity references (leftDoor, rightDoor) must be assigned to the correct mesh sub-entities
- Script: `scripts/components/Elevator.ts`
- **Safe Zone**: Contains a `SafeZoneTrigger` child entity (PhysicsBody Trigger + ColliderBox) that marks players as safe from enemy pursuit when inside. Uses `ElevatorSafeZone` component (`scripts/components/ElevatorSafeZone.ts`).
- **NavMesh Blocker**: Contains a `NavMeshBlocker` child entity with NavMeshObstacleComponent that carves a box out of the NavMesh, preventing enemies from pathing into the elevator interior.
- **Enemy behavior when player enters elevator**: Enemy stops chasing, moves to the nearest navigable point by the elevator door, waits 3 seconds, then returns to patrol. FOV detection is suppressed for safe players.
- **Depot Crate Interaction**: The `OldShippingCrate_02a` entity has a child `TriggerZone` (PhysicsBody Trigger + ColliderBox) that detects player proximity. When the player enters, a HUD prompt appears (hand.png + "打开" text via the existing HudPickupPrompt system). Clicking the prompt fires `DepotToggleRequestEvent` to open the Depot UI panel. Script: `scripts/depot/DepotCrateInteraction.ts`.

**Primitive templates** available in `Templates/Primitives/`:
- Cone, Cube, Cylinder, Disc, Plane, Prism, Pyramid, Sphere, Torus, Wedge

## Tutorial Guide Marker System

A waypoint-based visual guide for level_0 (first floor) that moves the sm_guangbiao glowing marker through key objectives to teach new players the game loop.

- **Entity**: sm_guangbiao (spawned as part of the level_0 template) — a floating, rotating marker with FloatingRotateAnimation
- **Script**: `scripts/game/GuideMarkerManager.ts` (attached to Systems entity in space.hstf)
- **Activation**: Only on level_0 (levelId === 1), triggered by GamePhaseChangedEvent entering Exploration phase
- **Guide steps**:
  1. Marker appears at elevator entrance — guides player out of the elevator
  2. Player reaches marker → moves to room center — guides player to pick up a prop
  3. Player reaches marker → moves to CommitPowerTrigger position — guides player to submit energy
  4. Elevator energy full (ElevatorEnergyFullEvent) → moves to PassTrigger position — guides player to the next level
  5. Player reaches PassTrigger → marker hidden, guide complete
- **Detection**: Trigger-volume based — `FX_cursor.hstf` contains a `TriggerCollider` child entity (PhysicsBody Trigger + ColliderSphere radius 1.5m) with `GuideWaypointTrigger` script. On player entry, `GuideWaypointReachedEvent` (LocalEvent) fires and `GuideMarkerManager` advances the guide step. GoToCommit step advances via `ElevatorEnergyFullEvent` instead of the trigger.
- **Discovery**: `GuideMarkerManager` finds the marker entity via `EntityService.findEntitiesWithComponent(GuideWaypointTrigger)` then walks ancestors to find the `FloatingRotateAnimation` root

## Game Configuration (`game_config.json`)

A centralized JSON configuration file at the project root that defines tunable parameters for all major game subsystems. Loaded by `GamePhaseManager` during initialization (before any spawning occurs) and applied to each subsystem.

- **enemySpawning**: GameEnemyManager spawn timing (baseDelay, delayReduction, spawnMultiplier, spawnBase)
- **enemyAI**: EnemyLogic behavior parameters (patrolSpeed, chaseSpeed, arrivalThreshold, loseChaseDist, attackRange, attackDisengageRange, attackCooldown, attackDamage) — applied to each enemy after spawn
- **enemyFov**: EnemyFov detection cone (fovAngle, detectionRange) — applied to each enemy after spawn
- **player**: PlayerLogic health/power settings (maxHealthValue, invulnerabilityDuration, maxPowerValue, powerDrainRate)
- **props**: GamePropManager/GamePlayerPropManager item system (maxInventorySize, maxTotalProps, spawnYOffset, propCountFormula, energyFormula)
- **elevatorEnergy**: GamePhaseManager energy requirements per level (baseValue × levelId², baseValue=256)
