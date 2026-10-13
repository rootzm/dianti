---
name: creating-trigger-volumes
description: Base_AI_Template-specific overrides for creating-trigger-volumes. Loads in addition to the master skill at //arvr/apps/hsr/editor/libraries/edit/genai/assets/scripts/Assistant/skills/creating-trigger-volumes/. Documents the player template's nested PhysicsBody hierarchy so detection scripts attach to the correct sub-entity.
include: as_needed
agents:
  - scripting
  - scripting_verification
---

# Creating Trigger Volumes — Base_AI_Template Overrides

This skill is **additive** to the shipped `creating-trigger-volumes` skill. Read the master skill first, then apply the project-specific corrections below.

## Player Template: PhysicsBody Lives on a Sub-Entity

`Base_AI_Template/Templates/PlayerCharacter.hstf` does **not** put `PhysicsBodyComponent` on the root entity. Hierarchy:

```
PlayerCharacter           (root) ← scripts like PlayerActionController live here
├── Visuals               (mesh, animations, sockets)
└── KinematicCharacter    ← PhysicsBodyComponent (DynamicCollider, driveMode=Kinematic)
    └── Collider          (ColliderCapsuleComponent: axis=Y, length=1.05, radius=0.30)
```

`OnTriggerEnterEvent` has `ListenerTarget.Entity` and fires only on the entity that owns the `PhysicsBodyComponent`. It does **not** bubble to ancestors. So:

### Where to attach `TriggerVolumeDetection` subclasses

**Attach to `KinematicCharacter`**, NOT to the `PlayerCharacter` root. Use `get_scene_hierarchy` and confirm the entity name before calling `add_component_to_entity`.

### Where to attach player-side RPC handlers (e.g. for teleport)

**Recommended (primary path): attach the RPC component to the `PlayerCharacter` root and walk ancestors from the trigger.** The player root behaves as a Networkable entity at runtime — it hosts `BasePlayerPlatformComponent` and the player spawning system gives the player root implicit network ownership at spawn time. Empirically (verified by an Anvil A/B test against `Base_AI_Template`), `@rpc` calls dispatched to a component on the `PlayerCharacter` root execute on the owning client without any editor toggle. The `KinematicCharacter` sub-entity has no comparable implicit-Networkable mechanism, so attaching the RPC to the root is the path that works as-shipped.

Because the `entity` argument passed to `TriggerVolume.onEntityEntered(entity)` is the **detection script's host** (`KinematicCharacter`, not the player root), the trigger handler must walk ancestors to find the root-attached RPC component:

```typescript
protected override onEntityEntered(entity: Entity): void {
  let teleportRpc = entity.getComponent(PlayerTeleportRpc);
  if (!teleportRpc) {
    for (const ancestor of entity.getAncestors()) {
      teleportRpc = ancestor.getComponent(PlayerTeleportRpc);
      if (teleportRpc) break;
    }
  }
  if (!teleportRpc) return;
  // ... use teleportRpc
}
```

**Alternative: co-locate the RPC on `KinematicCharacter`.** Skips the ancestor walk but requires the user (or the agent, with editor access) to explicitly add `NetworkableTemplateEntityAttribute` to `KinematicCharacter` (sub-entities do not inherit the player root's implicit-Networkable behavior). Choose this only when the user has explicitly confirmed the sub-entity is Networkable, or has agreed to set it. Without that confirmation, default to the recommended path.

## Networkable: As-Shipped State

`Base_AI_Template/Templates/PlayerCharacter.hstf` ships with `attributes: []` on **every** entity — no `NetworkableTemplateEntityAttribute` is explicitly set anywhere in the template. The player root nonetheless behaves as Networkable at runtime via the implicit-via-`BasePlayerPlatformComponent` mechanism described above; the sub-entities (`KinematicCharacter`, `Collider`, `Visuals`, sockets) do not.

`OnTriggerEnterEvent` is a native physics event and fires regardless of `Networkable` — the `KinematicCharacter` sub-entity does not need any Networkable attribute for trigger detection to work.

## Validation Checklist (Base_AI_Template-specific)

- [ ] `get_scene_hierarchy` of `Templates/PlayerCharacter.hstf` shows `KinematicCharacter` as the `PhysicsBodyComponent` host
- [ ] Detection script (`PlayerTriggerVolumeDetection` or similar) is attached to `KinematicCharacter`, NOT to the `PlayerCharacter` root
- [ ] Player-side RPC components (`PlayerTeleportRpc`, etc.) are attached to the `PlayerCharacter` root AND the trigger handler walks ancestors to find them
- [ ] OR (alternative path only) RPC components are on `KinematicCharacter` AND that sub-entity has been explicitly set to `Networkable=true` (via `NetworkableTemplateEntityAttribute`) in the editor

## Why This Override Exists

The master skill's Step 2.1 says "attach to the root entity of the detecting template." That guidance produces silently-broken triggers on `Base_AI_Template`'s `PlayerCharacter` because the root has no collider — `OnTriggerEnterEvent` never reaches a root-attached subscription. This override documents the actual hierarchy so the agent picks the correct attachment target.
