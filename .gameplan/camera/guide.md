# Camera Module Guide

## Purpose

The Camera module provides the third-person orbit view that defines how the world is framed during play. It tracks the player, orbits using right-stick/mouse input, smooths rotation in angle-space to prevent quaternion flip artifacts, and avoids geometry clipping with a raycast-based collision state machine. The camera's forward vector is the authoritative input reference direction for all ground movement.

## Design Intent

The default configuration targets a behind-the-shoulder view that shows enough environment ahead for navigation decisions while keeping the player character visible and readable. Sensitivity, distance, pitch limits, and collision detection are all independently tunable.

## Module Keywords

- Camera, orbit, follow, third-person, smoothing, collision avoidance, field of view, pitch, yaw, sensitivity

## Behaviors

- Orbits behind the player at targetDistance units, at shoulderHeight above target
- Right-stick / mouse delta drives yaw and pitch; pitch is clamped to minPitch/maxPitch
- Angle-space smoothing via exponential decay prevents quaternion hemisphere-crossing during rapid rotation
- Collision avoidance: raycasts from target to desired camera position; state machine smooths transitions (Collided → WaitingToReturn → Returning)
- Camera activates in Custom mode via CameraService; re-activates on player create event

## UI Rules

Layout: browse_focused
Appearance: no
Items: Orbit & Position, Smoothing, Collision, Input & Sensitivity

## Gameplan Image Generation

Browse cards: top-down or side diagrams. Orbit & Position = overhead arc with distance annotation. Smoothing = waveform decay graph. Collision = raycast line hitting a wall with camera pullback indicator. Input & Sensitivity = controller icon with directional arrows.

## Style & Art Direction

Technical diagram style — clean lines, annotation markers, neutral background.

## Content Rules

Items correspond to the four distinct tunable concerns of ThirdPersonCamera.

## Source Files

- scripts/ThirdPersonCamera.ts — targetDistance, shoulderHeight, shoulderOffset, rotationSpeed, translationSpeed, mouseSensitivity, minPitch, maxPitch, defaultPitch, fieldOfView, enableCollision, collisionRadius
- scripts/Camera/PlayerCameraComponent.ts — camera entity binding

## Quick Tune Properties

### Camera Distance
- Type: numeric
- Source: ThirdPersonCamera — targetDistance (default 8)
- Action: prompt
- Keywords: distance, zoom, orbit
- UI Type: slider (3.0–15.0, step 0.5)
- UI Group: quick_tune

## Category Tune Properties

### Camera Style
- Keywords: close, standard, cinematic
- Affects: targetDistance, shoulderHeight, fieldOfView
- Suggested presets: Close, Standard, Cinematic
- UI Type: toggle_multisegment
- UI Group: Customize

### Collision Mode
- Keywords: collision, clip through, pullback
- Affects: enableCollision
- Suggested presets: Off, On
- UI Type: toggle_multisegment
- UI Group: Customize
