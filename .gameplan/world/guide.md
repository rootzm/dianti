# World Module Guide

## Purpose

The World module covers the scene environment and lighting configuration — the stage on which the controller performs. For this template project, the world is currently a grey-box placeholder floor with default lighting. This module lets designers quickly set up or iterate on the environment's visual feel without touching gameplay systems.

## Design Intent

Because this is a blank-slate template, the World module prioritizes flexibility over opinionation. There is no established art direction — this module is the primary place to define and iterate on visual identity as a game is built on top of the template.

## Module Keywords

- Scene, environment, lighting, floor, skybox, atmosphere, placeholder, grey-box

## Behaviors

- Floor plane with default material (checker.png placeholder)
- Default ambient lighting from scene root
- Shadow configuration via Scene Shadow Provisional component

## UI Rules

Layout: browse_focused
Appearance: yes
Items: Environment, Lighting

## Gameplan Image Generation

Browse cards: clean renders of environment elements. Environment = flat plane with horizon, neutral sky. Lighting = scene with directional light angle and shadow visualization.
Style tiles: mood renders showing different overall visual treatment options for the blank template scene.

## Style & Art Direction

Blank canvas — no established palette. Style tiles should suggest three distinct starting-point directions a developer might choose (e.g., stylized, realistic, low-poly).

## Content Rules

Items represent the two major environment concerns in this template scene.

## Source Files

- space.hstf — scene template with floor and root entity
- floor.material — floor material configuration
- checker.png — placeholder floor texture

## Quick Tune Properties

No quick-tune properties defined yet (world is a template placeholder).

## Category Tune Properties

### Visual Style
- Keywords: style, aesthetic, theme
- Affects: materials, skybox, lighting
- Suggested presets: Stylized, Realistic, Low-Poly
- UI Type: toggle_multisegment
- UI Group: Customize
