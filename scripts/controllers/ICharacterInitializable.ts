/**
 * ICharacterInitializable - Abstract base class for character sub-systems
 * that require initialization with the character's entity hierarchy.
 *
 * Component Attachment: Character root or simulated entity
 * Component Networking: Varies by subclass
 * Component Ownership: Varies by subclass
 *
 * characterRootEntity: The root entity of the character. Owns the root
 *   transform. Components here include: character abilities (jump, movement,
 *   dash, etc.), CharacterStateMachine, AnimationController.
 *
 * characterSimulatedEntity: The entity that runs the character's physics
 *   simulation (normally a child of characterRootEntity). Components here
 *   include: CharacterControllerBase, CharacterForceControllerBase,
 *   WorldsGroundInfoComponent, PhysicsBodyComponent, Colliders.
 */

import type { Entity } from "meta/worlds";
import { Component } from "meta/worlds";

export abstract class ICharacterInitializable extends Component {
	public abstract initialize(characterRootEntity: Entity, characterSimulatedEntity: Entity): void;
}
