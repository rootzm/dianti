# 项目提示词汇总 (Prompts Summary)

本文档汇总了项目中所有的"提示词"内容，包括游戏内显示给玩家的文本和用于生成资源的AI描述/prompt。

---

## 1. 游戏内提示文本 (In-Game Prompt Text)

### 1.1 HUD 提示面板 (Tips Panel)

通过 `GameGuideManager.tipsText` 属性配置，在游戏开始时依次显示给玩家。每条提示显示3秒后自动隐藏。

| 提示内容 | 来源文件 |
|---------|---------|
| （通过编辑器配置 `tipsText` 属性，内容为字符串数组） | `scripts/game/GameGuideManager.ts` |
| 默认渲染测试文本: `"hello world !"` | `scripts/ui/HudPanelTips.ts` (第68行) |

> **注意**: `tipsText` 是一个 `@property()` 数组，实际内容在模板/场景编辑器中设置，代码中未硬编码具体提示内容。

---

### 1.2 道具拾取提示 (Prop Pickup Prompts)

玩家靠近道具时显示的交互提示按钮。

| 提示内容 | 触发条件 | 来源文件 |
|---------|---------|---------|
| 道具名称 (propName) + 图标 + 能量值 | 玩家进入手动拾取道具触发区 | `scripts/props/PropPickupHandler.ts` (第107-110行) |
| `"Open"` + 手型图标 (`hand.png`) | 玩家靠近仓库箱子 | `scripts/depot/DepotCrateInteraction.ts` (第55-57行) |

---

### 1.3 通知消息 (Notification Messages)

通过 `PropTransferNotifyEvent` 发送的短消息通知。

| 消息内容 | 触发条件 | 来源文件 |
|---------|---------|---------|
| `"Backpack Full"` | 背包已满时尝试拾取道具 | `scripts/props/PropPickupHandler.ts` (第94、161、219行) |
| `"Depot Full"` | 仓库已满时尝试存入道具 | `scripts/ui/HudGameBackpack.ts` (第340行) |
| `"Stored: ${data.propName}"` | 成功将道具存入仓库 | `scripts/ui/HudGameBackpack.ts` (第368行) |

---

### 1.4 道具使用通知 (Prop Consumed Event)

通过 `PropConsumedEvent` 触发，用于通知 HUD 显示"使用了某道具"。

| 消息格式 | 触发条件 | 来源文件 |
|---------|---------|---------|
| `propName` (道具名称) | 玩家使用背包中的道具 | `scripts/ui/HudGameBackpack.ts` (第292-293行) |

---

### 1.5 仓库管理器消息 (Depot Manager Messages)

内部操作结果消息（非直接显示给玩家）。

| 消息内容 | 触发条件 | 来源文件 |
|---------|---------|---------|
| `"Depot is full (X slots occupied)."` | 仓库已满 | `scripts/depot/DepotManager.ts` (第72行) |
| `"Added \"X\" to slot Y."` | 添加道具成功 | `scripts/depot/DepotManager.ts` (第84、114行) |
| `"Invalid slot index: X."` | 无效槽位索引 | `scripts/depot/DepotManager.ts` (第96、178行) |
| `"Slot X is already occupied by \"Y\"."` | 槽位已被占用 | `scripts/depot/DepotManager.ts` (第102行) |
| `"Slot X is empty, nothing to update."` | 尝试更新空槽位 | `scripts/depot/DepotManager.ts` (第184行) |
| `"Updated slot X to \"Y\"."` | 更新槽位成功 | `scripts/depot/DepotManager.ts` (第197行) |
| `"Swapped slots X and Y."` | 交换槽位成功 | `scripts/depot/DepotManager.ts` (第220行) |
| `"Invalid slot index(es): X, Y."` | 交换无效索引 | `scripts/depot/DepotManager.ts` (第209行) |

---

### 1.6 UI 按钮/面板文本 (UI Button/Panel Text)

| 文本/功能 | 面板 | 来源文件 |
|---------|------|---------|
| RESTART 按钮 | 失败面板 (HudPanelFail) | `scripts/ui/HudPanelFail.ts` |
| 当前楼层数 (`textFloor`) | 失败面板 | `scripts/ui/HudPanelFail.ts` (第66行) |
| 当前能量 (`textPower`) | 失败面板 | `scripts/ui/HudPanelFail.ts` (第67行) |
| WIN! + Next 按钮 | 胜利面板 (HudVictory) | `scripts/ui/HudVictory.ts` |
| 充能 (Charge) 按钮 | 充能面板 (HudPanelCharge) | `scripts/ui/HudPanelCharge.ts` |
| 关闭 (Close) 按钮 | 充能面板、仓库面板 | `scripts/ui/HudPanelCharge.ts`, `scripts/ui/HudPanelDepot.ts` |
| 手电筒开/关图标切换 | 控制面板 (HudGameControls) | `scripts/ui/HudGameControls.ts` |
| 冲刺/跑步图标切换 | 控制面板 | `scripts/ui/HudGameControls.ts` |
| 道具拾取按钮 (图标+名称+能量值) | 控制面板 | `scripts/ui/HudGameControls.ts` (第193-196行) |

---

### 1.7 道具默认名称 (Prop Default Names)

| 默认名称 | 来源文件 |
|---------|---------|
| `"Unknown Prop"` | `scripts/props/PropBase.ts` (第30行) |

---

### 1.8 道具分类显示名 (Category/Rarity Display Names)

| 类别 | 显示名 | 来源文件 |
|------|--------|---------|
| Rarity1 | `"Rarity 1"` | `scripts/props/PropConfig.ts` (第28行) |
| Rarity2 | `"Rarity 2"` | `scripts/props/PropConfig.ts` (第29行) |
| Rarity3 | `"Rarity 3"` | `scripts/props/PropConfig.ts` (第30行) |
| Weapon | `"Weapon"` | `scripts/props/PropConfig.ts` (第35行) |
| Armor | `"Armor"` | `scripts/props/PropConfig.ts` (第36行) |
| Consumable | `"Consumable"` | `scripts/props/PropConfig.ts` (第37行) |
| Material | `"Material"` | `scripts/props/PropConfig.ts` (第38行) |
| Quest | `"Quest"` | `scripts/props/PropConfig.ts` (第39行) |

---

## 2. 资源生成提示词 (Asset Generation Prompts)

### 2.1 角色模型 - ScavengerRobot (拾荒机器人)

| 属性 | 内容 |
|------|------|
| **生成管线** | PTC (Prompt-to-Character / meta-meshgen-avatar) |
| **概念变体** | Lanky Junk Robot (Amber Eyes) — generated_1 |
| **目标面数** | 20,000 |
| **视觉描述** | A bipedal humanoid scavenger robot (拾荒机器人). Tall, lanky proportions assembled from salvaged and cobbled-together parts. Corroded chassis with tangled cables and exposed wiring across the chest. Flickering amber glowing optical sensors / eye lights. Asymmetric limbs suggesting patchwork repairs from scavenged components. Grimy, post-apocalyptic industrial aesthetic — corroded metals, worn surfaces. |
| **美术方向** | Dark, moody, industrial/post-apocalyptic atmosphere. Corroded metals, grimy surfaces. 3D stylized. |
| **来源文件** | `Assets/Models/Characters/ScavengerRobot/ScavengerRobot_DESCRIPTION.md` |

---

### 2.2 AI生成的环境模型

以下模板位于 `Assets/Model/AImodel/`，根据文件名推断生成时使用的描述：

| 模型名称 | 推断的生成描述 | 来源路径 |
|---------|--------------|---------|
| ConstructionCrate | 建筑工地板条箱 | `Assets/Model/AImodel/ConstructionCrate.hstf` |
| CorrugatedWallPanel | 波纹金属墙板 | `Assets/Model/AImodel/CorrugatedWallPanel.hstf` |
| MetalHoldingStand | 金属支架/托架 | `Assets/Model/AImodel/MetalHoldingStand.hstf` |
| PipeCluster | 管道集群 | `Assets/Model/AImodel/PipeCluster.hstf` |
| PipeGroupVertical | 垂直管道组 | `Assets/Model/AImodel/PipeGroupVertical.hstf` |
| ShippingContainer | 集装箱/货柜 | `Assets/Model/AImodel/ShippingContainer.hstf` |
| WallSconce | 壁灯 | `Assets/Model/AImodel/WallSconce.hstf` |
| WallSconce_shanshuo | 闪烁壁灯 | `Assets/Model/AImodel/WallSconce_shanshuo.hstf` |

> **注意**: 这些模型的原始AI生成prompt未保存在项目中，上述描述是根据文件名推断的。

---

### 2.3 VFX 特效模型

| 模型名称 | 推断的生成描述 | 来源路径 |
|---------|--------------|---------|
| ElectricSparks | 电火花特效 | `Assets/Model/texiao/ElectricSparks.hstf` |

---

### 2.4 游戏道具模板

以下为游戏内道具的模板资产：

| 道具名称 | 用途 | 来源路径 |
|---------|------|---------|

---

## 3. 美术方向文档 (Art Direction)

| 状态 | 内容 | 来源文件 |
|------|------|---------|
| 未正式定义 | 项目尚未建立统一的美术方向文档 | `Docs/ART_DIRECTION.md` |
| 参考风格 | Dark, moody, industrial/post-apocalyptic (从ScavengerRobot推断) | `Assets/Models/Characters/ScavengerRobot/ScavengerRobot_DESCRIPTION.md` |

---

## 4. 图标资源映射 (Icon Asset Registry)

代码中使用的图标资源路径：

| 图标键名 | 资源路径 | 用途 | 来源文件 |
|---------|---------|------|---------|
| `hand.png` | `@Assets/UI/hud_game/hand.png` | 手型交互图标 | `scripts/ui/HudGameControls.ts` |

---

*文档生成时间: 基于项目当前代码状态*
