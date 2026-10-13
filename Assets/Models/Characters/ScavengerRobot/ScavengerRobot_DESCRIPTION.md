# ScavengerRobot — Asset Description

## Summary
A bipedal humanoid scavenger robot (拾荒机器人) generated via the PTC (Prompt-to-Character) pipeline.

## Visual Style
- Tall, lanky proportions assembled from salvaged and cobbled-together parts
- Corroded chassis with tangled cables and exposed wiring across the chest
- Flickering amber glowing optical sensors / eye lights
- Asymmetric limbs suggesting patchwork repairs from scavenged components
- Grimy, post-apocalyptic industrial aesthetic — corroded metals, worn surfaces

## Art Direction Context
Dark, moody, industrial/post-apocalyptic atmosphere. Corroded metals, grimy surfaces. 3D stylized.

## Generation Details
- **Pipeline:** PTC (meta-meshgen-avatar)
- **Concept Variation:** Lanky Junk Robot (Amber Eyes) — generated_1
- **Target Polycount:** 20,000
- **Source:** AI-generated concept art → rigged mesh

## Files
| File | Description |
|------|-------------|
| `ScavengerRobot_rigged_compute_graph.usdz` | Rigged mesh with embedded skeleton and baked material |
| `ScavengerRobot_DESCRIPTION.md` | This file |

## Notes
- Mesh is rigged (bipedal humanoid skeleton) but animations have NOT been retargeted yet.
- No templates, scripts, or scene entities have been modified.
- Ready for animation retargeting via `retarget_and_setup_character` when needed.
