# Code Style Guide

> ⚠️ 需要严谨执行，代码质量牢记在心！

This document summarizes the coding conventions observed in the project, inferred from actual source files.

---

## 1. Naming Conventions

### Classes & Components
- Component classes: `PascalCase`, suffixed with purpose descriptor (e.g. `EnemyLogic`, `PropBaseComponent`, `ElevatorDoorController`, `GamePhaseManager`)
- Serializable payload classes: `PascalCase` + `Payload` suffix (e.g. `PropPickedUpPayload`, `GamePhaseChangedPayload`)
- Abstract base classes: `PascalCase`, may use `I` prefix for interface-like abstracts (e.g. `ICharacterInitializable`)
- Utility classes: `PascalCase`, no suffix (e.g. `Cooldown`, `GraceTimer`)

### Enums
- Enum names: `PascalCase` (e.g. `EnemyAIState`, `PropRarity`, `PropCategory`, `DoorState`)
- Enum members: `PascalCase` (e.g. `Patrol = 0`, `Rarity1 = 0`, `Weapon = 0`)
- Always explicitly numbered starting from 0

### Events
- Event constants: `PascalCase` + `Event` suffix (e.g. `GamePhaseChangedEvent`, `PropPickedUpEvent`, `ElevatorEnergyFullEvent`)
- Event string identifiers: `PascalPrefix_ActionName` format (e.g. `'ElevatorEnergy_Changed'`, `'PropSystem_PropPickedUp'`)

### Variables & Properties
- `@property()` fields: `camelCase` (e.g. `patrolSpeed`, `attackCooldown`, `propName`)
- Private fields: `camelCase` (e.g. `doorState`, `chaseTarget`)
- **No underscores in variable or function names** — underscores are forbidden in all variable names, function/method names, and parameter names. This includes leading underscores (e.g. `_transform` is forbidden) and mid-word underscores (e.g. `chase_target` is forbidden). Use `camelCase` exclusively.
- Lazy-getter backing fields: use a `cached` prefix instead of `_` (e.g. `cachedTransform`, `cachedMeshComponent`)
- Constants: declared as static class members using `public static readonly` / `protected static readonly` / `private static readonly`, NOT as module-level `const`. Naming uses `UPPER_SNAKE_CASE` (e.g. `private static readonly CHASE_REPATH_INTERVAL = 0.5`, `public static readonly PREPARATION_DURATION_S = 3`)
- Object literal constants: also declared as `static readonly` class members in `UPPER_SNAKE_CASE` (e.g. `public static readonly RARITY_DISPLAY_NAMES = { ... }`, `private static readonly CATEGORY_MAX_STACK = { ... }`)

### State IDs
- `const` object with string literal values: `PascalCase` members (e.g. `StateId = { Movement: 'Movement', Jumping: 'Jumping' }`)

---

## 2. Access Modifiers & Type Annotations

### Access Modifiers (Required)
- **All class members** (fields, methods, getters/setters) MUST have an explicit access modifier: `public`, `protected`, or `private`
- No implicit public — always spell it out

### Return Type Annotations (Required)
- **All functions** MUST have an explicit return type annotation — including arrow functions
- Examples:
  ```typescript
  public getScore(): number { return this.score; }
  private calculateDamage(base: number): number { return base * this.multiplier; }
  const double = (n: number): number => n * 2;
  ```

### Arrow Function Parameter Types (Required)
- **All arrow function parameters** MUST have explicit type annotations
- Example:
  ```typescript
  const filter = (entity: Entity): boolean => {
    return entity.valid;
  };
  const onHit = (damage: number, source: Entity): void => {
    /* ... */
  };
  ```

### Arrow Function Body (Required)
- Arrow function bodies MUST always use curly braces `{}` with the body on a new line
- Implicit return (no braces) is **forbidden** — always use explicit `return` inside braces
- Example:
  ```typescript
  // ❌ Forbidden — implicit return without braces
  const double = (n: number): number => n * 2;
  items.filter((item: Entity): boolean => item.valid);

  // ✅ Correct — braces with explicit return on new line
  const double = (n: number): number => {
    return n * 2;
  };
  items.filter((item: Entity): boolean => {
    return item.valid;
  });
  ```

---

## 3. Type Usage

### Declaration Placement — Interfaces & Types at the Top
- `interface` definitions MUST be placed at the top of the file (after `import` statements, before `class` / `function` and other implementation code)
- `type` definitions MUST be placed at the top of the file (after `import` statements, before `class` / `function` and other implementation code)

### Function Parameter Types — No Inline Object Types
- When a function parameter is an object type, it MUST be defined as a named `interface` — inline object types are forbidden
- Example:
  ```typescript
  // ❌ Forbidden — inline object type
  function draw(options: { x: number, y: number }): void {}

  // ✅ Correct — define an interface
  interface DrawOptions {
    x: number;
    y: number;
  }
  function draw(options: DrawOptions): void {}
  ```

### `Maybe<T>` over `undefined`
- Nullable references use `Maybe<T>` (which resolves to `T | null`)
- Initialized to `null`, never `undefined`
- Example: `private chaseTarget: Maybe<Entity> = null;`

### Imports
- Type-only imports via `import type { ... }` (e.g. `import type { Entity, Maybe } from 'meta/worlds'`)
- Value imports in a separate statement (e.g. `import { Component, component, ... } from 'meta/worlds'`)
- Local project imports use relative paths (e.g. `import { EnemyFov } from './EnemyFov'`)

### Null safety
- **Prefer non-null assertion (`!`)** when you are confident a value is non-null — reduces unnecessary `if` guards and optional chaining
- Use `getComponentOrThrow()` when the component is guaranteed to exist
- Reserve optional chaining (`?.`) and nullish coalescing (`??`) for genuinely uncertain cases where the value may legitimately be null at runtime
- Example:
  ```typescript
  // ❌ Unnecessary guard — we know transform exists on this entity
  const t = this.entity.getComponent(TransformComponent);
  if (t) {
    t.worldPosition = pos;
  }

  // ✅ Correct — use non-null assertion when certain
  const t = this.entity.getComponent(TransformComponent)!;
  t.worldPosition = pos;
  ```

---

## 4. Import Style

### Ordering (observed pattern)
1. `import type { ... } from 'meta/worlds';` — type-only imports first
2. `import { ... } from 'meta/worlds';` — value imports from the engine SDK
3. Local project imports — relative paths, grouped by feature area

### Multi-member imports
- Alphabetically sorted within the braces (observed in most files)
- One import per source module (no duplicate source paths)

### Spacing between imports
- **No blank lines** between consecutive `import` statements — the entire import block is kept compact with no extra whitespace
- A single blank line separates the import block from the rest of the file

### Unused imports
- **All unused imports must be removed** — never leave an import that is not referenced in the file

### Dead Code Removal
- **All unused variables, interfaces, types, and functions must be removed** — never leave declarations that are not referenced anywhere in the file
- This includes unused local variables, unused parameters (remove or prefix with `_` only if required by an interface contract), unused class fields, unused interfaces, and unused type aliases

### Line formatting
- **Single import item (exactly 1)** → keep on one line
- **Multiple import items (2 or more)** → MUST expand to multi-line, one item per line, with trailing comma

```typescript
// Single item — one line
import { TextureAsset } from 'meta/worlds';

// Multiple items — expand to multi-line
import {
  TextureAsset,
  Color,
  ImageBrush,
} from 'meta/worlds';
```

---

## 5. Comments & Documentation

### File-level JSDoc
Every component file starts with a block comment containing:
```
/**
 * ComponentName - Brief one-line description.
 *
 * Component Attachment: Where this attaches (Player, Scene Entity, Spawned Entity)
 * Component Networking: Local | Networked
 * Component Ownership: Not Networked | Client | Server
 *
 * Detailed behavior description (multi-paragraph if complex).
 */
```

### Section separators
- **Forbidden**: `// ========= xxx =========` style separators (or any variation using repeated `=`, `-`, `─`, `*`, `#` characters as horizontal rules)
- For groups of closely related code within a class, use `#region` / `#endregion`:
  ```typescript
  // #region State Management
  // ... related fields and methods ...
  // #endregion
  ```
- No blank line after `// #region xxx` — code starts immediately on the next line
- No blank line before `// #endregion` — code ends immediately on the previous line
- Only use regions when the grouped code has a strong logical relationship (e.g. all lifecycle methods, all physics helpers, all event handlers for one feature)
- Do not over-region — a class with 3 methods doesn't need regions

### Inline comments
- `/** JSDoc comment */` for `@property()` fields and public methods
- `// Single-line comment` for brief implementation notes
- Comments explain *why*, not *what* — implementation notes describe intent, edge cases, and fallback behavior

### Console logging
- Format: `[ClassName.functionName] Message` (e.g. `[EnemyLogic.updateState] Patrol -> Chase: player detected`)
- **Only log on errors** — do not log initialization, state transitions, or normal operations
- Never log in per-frame update loops (avoids console spam)

---

## 6. Formatting Preferences

### Indentation
- **Tabs** for indentation — spaces are forbidden
- Consistency within a single file is required

### Quotes
- **Double quotes** (`"`) for all strings — imports, string literals, event names, object keys where applicable

### String Construction
- **Template literals** (backticks) are required when embedding expressions or building multi-part strings
- String concatenation using `+` is **forbidden** — use template literals instead:
  ```typescript
  // ❌ Forbidden — string concatenation
  const msg = "[" + className + "] " + action + " triggered";

  // ✅ Correct — template literal
  const msg = `[${className}] ${action} triggered`;
  ```

### Semicolons
- **Always** present at end of statements

### Object Literals — Multi-Line & No Shorthand
- Object literals (including variable assignments and function arguments) MUST be expanded to multi-line — single-line object literals are forbidden
- Property shorthand is forbidden — always use explicit `key: value` form, even when the variable name matches the property name
- Example:
  ```typescript
  // ❌ Forbidden — single-line object
  const pos = { x: 1, y: 2 };

  // ✅ Correct — multi-line object
  const pos = {
    x: 1,
    y: 2,
  };

  // ❌ Forbidden — property shorthand
  const obj = { name, age };

  // ✅ Correct — explicit key: value
  const obj = {
    name: name,
    age: age,
  };

  // ❌ Forbidden — inline object as function argument
  spawn({ position: pos, rotation: rot });

  // ✅ Correct — multi-line object as function argument
  spawn({
    position: pos,
    rotation: rot,
  });
  ```

### Blank Lines
- **Delete all meaningless blank lines** — consecutive blank lines, blank lines at the start/end of a block, and blank lines that add no readability value must be removed
- Keep meaningful blank lines that separate distinct logical paragraphs within a method or class (e.g. between initialization and loop logic, between setup and event wiring)
- No blank line after `// #region xxx` — code follows immediately
- No blank line before `// #endregion` — code precedes immediately
- Example:
  ```typescript
  // #region Lifecycle
  @subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
  public onStart(): void {
    this.initRefs();
  }
  // #endregion

  // #region Movement
  private updateMovement(dt: number): void {
    const speed = this.baseSpeed * dt;

    // Separate logical block — blank line is meaningful
    const direction = this.getDirection();
    this.applyForce(direction, speed);
  }
  // #endregion
  ```

### Trailing commas
- Present in multi-line parameter lists and object literals

### Braces
- Opening brace on same line (K&R style): `if (condition) {`
- **All `if`, `else`, `for`, `while` blocks MUST use braces** — even for single-statement bodies
- **Body MUST be on a new line** — never on the same line as the condition
- Example:
  ```typescript
  // ❌ Forbidden — no braces
  if (!valid) return;

  // ❌ Forbidden — body on same line as condition
  if (!valid) { return; }

  // ✅ Correct — braces + body on new line
  if (!valid) {
  	return;
  }
  ```
- Empty bodies avoided; guard clauses return early

### Line length
- No strict limit observed, but lines generally stay under ~120 characters
- Long strings broken with template literals or concatenation

---

## 7. Control Flow Rules

### No Ternary Operator
- The ternary operator (`? :`) is **forbidden**
- Use `if / else` instead:
  ```typescript
  // ❌ Forbidden
  const label = isActive ? 'On' : 'Off';

  // ✅ Correct
  let label: string;
  if (isActive) {
    label = 'On';
  } else {
    label = 'Off';
  }
  ```

### No Switch/Case
- `switch` / `case` statements are **forbidden**
- Use `if / else if / else` chains instead:
  ```typescript
  // ❌ Forbidden
  switch (state) {
    case State.Idle: doIdle(); break;
    case State.Run: doRun(); break;
    default: doFallback(); break;
  }

  // ✅ Correct
  if (state === State.Idle) {
    doIdle();
  } else if (state === State.Run) {
    doRun();
  } else {
    doFallback();
  }
  ```

### Early Return / Break / Continue — No `||` Shorthand
- When an `if` handles `return`, `break`, or `continue`, do NOT use `||` as a shorthand conditional
- Use explicit `if` / `else if` blocks:
  ```typescript
  // ❌ Forbidden
  !entity.valid || return;
  condition || continue;

  // ✅ Correct
  if (!entity.valid) {
    return;
  }

  if (!condition) {
    continue;
  }
  ```

### Strict Equality
- **Always use `===` and `!==`** — loose equality (`==`, `!=`) is forbidden
- **Exception**: `!= null` is permitted (and preferred) when narrowing both `null` and `undefined` simultaneously — typically after optional chaining (`?.`) where the result may be `undefined`
- Example:
  ```typescript
  // ❌ Forbidden — loose equality
  if (state == State.Idle) { /* ... */ }

  // ✅ Correct — strict equality
  if (state === State.Idle) { /* ... */ }

  // ✅ Exception — narrowing null + undefined after optional chaining
  const comp = entity.parent?.getComponent(TransformComponent);
  if (comp != null) {
    comp.worldPosition = pos;
  }
  ```

---

## 8. Architecture Preferences

### No Module-Level Functions in Class Files
- If a file contains any `class` declaration, **all functions must be class members** (instance methods or `static` methods)
- Module-level (top-level / free-standing) function declarations and function expressions are **forbidden** in files that contain a class
- This includes named functions (`function foo() {}`), arrow function constants (`const foo = () => {}`), and exported function helpers
- If a utility function is needed, make it a `private static` or `public static` method on the relevant class
- Example:
  ```typescript
  // ❌ Forbidden — module-level function in a file with a class
  function clampAngle(angle: number): number {
    return angle % 360;
  }

  @component()
  export class MyController extends Component {
    // ...
  }

  // ✅ Correct — function is a static class member
  @component()
  export class MyController extends Component {
    private static clampAngle(angle: number): number {
      return angle % 360;
    }
  }
  ```
- **Exception**: module-level `const` declarations that are not functions (e.g. event instances `new LocalEvent(...)`, enum-like objects, numeric/string constants) remain permitted as they are covered by the constants rule in §1

### File organization
- One primary exported class/component per file
- Config/constants in dedicated `*Config.ts` files
- Events in dedicated `*Events.ts` files (avoids circular dependencies)
- Utilities in `scripts/utils/` — plain classes, no `@component()` decorator

### Component access pattern (lazy getter)
```typescript
private cachedTransform: Maybe<TransformComponent> = null;
private get transform(): Maybe<TransformComponent> {
    return (this.cachedTransform ??= this.entity.getComponent(TransformComponent));
}
```

### Event-driven communication
- Cross-script communication via `LocalEvent` declarations in shared event files
- Payload classes are `@serializable()` with `readonly` properties
- Event constants exported from `*Events.ts` files to avoid circular imports

### State machines
- Enum-based state (numeric values starting at 0)
- State transitions in a dedicated `updateStateTransitions()` method
- Debug display updated on every transition

### Subscription pattern
- Always specify `{ execution: ExecuteOn.Everywhere }` explicitly
- `OnEntityStartEvent` for initialization
- Cache component references in `onStart()`, not in constructors
- Player list cached and refreshed via `OnPlayerCreateEvent`/`OnPlayerDestroyEvent`

### Data separation
- Config constants (display names, weights, limits) in dedicated config files
- Enums shared between components live in config or event files
- No inline magic numbers — all thresholds as named constants or `@property()` fields

### Async / Promise Usage
- **Forbidden**: marking a function `async` or declaring return type `Promise<T>` when the function body contains NO `await` expression
- If a method is purely synchronous (no `await` inside), it MUST return `void` (or the appropriate synchronous type), NOT `Promise<void>`
- Only use `async` when the function genuinely awaits asynchronous operations
- Example:
  ```typescript
  // ❌ Forbidden — no await inside, so async is misleading
  public async destroyAll(): Promise<void> {
    for (const e of this.entities) {
      e.destroy();
    }
  }

  // ✅ Correct — synchronous body, synchronous signature
  public destroyAll(): void {
    for (const e of this.entities) {
      e.destroy();
    }
  }

  // ✅ Correct — genuinely async (has await)
  public async loadLevel(index: number): Promise<void> {
    await this.sublevel.activate();
  }
  ```

### Error handling
- **Unawaited Promises MUST have `.catch()`** — any Promise that is not `await`ed must chain a `.catch()` that logs the error (using the `[ClassName.functionName]` format)
- **Catch parameters MUST be typed `: unknown` and wrapped with `String()` in template literals** — TypeScript infers catch parameters as `unknown`; embedding them directly in a template string triggers ESLint's "Invalid type 'unknown' of template literal expression" error. Always annotate with `: unknown` and use `String(error)`:
  ```typescript
  // CORRECT
  .catch((error: unknown): void => {
    console.log(`[ClassName.method] ${String(error)}`);
  });

  // Also correct for try/catch
  try { /* ... */ } catch (e: unknown) {
    console.log(`[ClassName.method] ${String(e)}`);
  }
  ```
- Warning logs for missing components/entities (non-fatal, graceful degradation)
- Guard clauses (`if (!ref) return;`) at top of methods

---

## 9. `@property()` Conventions

- Always provide `minValue`/`maxValue` for numeric tunable properties
- Use `{isNetworked: false}` for local-only properties (especially UI/editor references)
- Default values always explicitly set
- Entity references typed as `Maybe<Entity>` with default `null`

---

## 10. Export Conventions

- Enums: always `export enum`
- Event constants: always `export const`
- Payload classes: always `export class` with `@serializable()`
- Components: always `export class` with `@component()`
- Internal helper functions/types: not exported (private to file)
- Re-exports for backwards compatibility where APIs moved between files
