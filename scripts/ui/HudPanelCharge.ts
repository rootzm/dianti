/**
 * HudPanelCharge - Controller for the charge panel with eye and charge flash animations.
 *
 * Component Attachment: Scene Entity (a dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Binds the HudPanelChargeViewModel to the CustomUiComponent data context.
 * Plays sprite-sheet animations at 0.075s per frame on DrawingSurfaces.
 * When the panel becomes visible, syncs player backpack data to the 5 slots.
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	CustomUiComponent,
	DrawingCommandsBuilder,
	DrawingCommandsVersion,
	EntityService,
	ExecuteOn,
	NetworkingService,
	OnEntityCreateEvent,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	PlayerService,
	Service,
	SoundComponent,
	SoundPlayInfo,
	TextureAsset,
	Visibility,
	component,
	subscribe
} from "meta/worlds";
import {
	OnClickBtnChargeEvent,
	OnClickBtnCloseEvent,
	OnClickBtnItem1Event,
	OnClickBtnItem2Event,
	OnClickBtnItem3Event,
	OnClickBtnItem4Event,
	OnClickBtnItem5Event,
} from "../../generated/view_models/HudPanelChargeViewModel";
import { CHARGE_FLASH_1_ATLAS } from "../assets/charge_flash_1_atlas";
import { CHARGE_FLASH_2_ATLAS } from "../assets/charge_flash_2_atlas";
import { CHARGE_FLASH_3_ATLAS } from "../assets/charge_flash_3_atlas";
import { CHARGE_FLASH_4_ATLAS } from "../assets/charge_flash_4_atlas";
import { CHARGE_FLASH_5_ATLAS } from "../assets/charge_flash_5_atlas";
import { CHARGE_FLASH_BALL_ATLAS } from "../assets/charge_flash_ball_atlas";
import { EYE_ATLAS } from "../assets/eye_atlas";

import {
	ElevatorSafeZoneEnteredEvent,
	ElevatorSafeZoneExitedEvent,
	ElevatorSafeZonePlayerPayload,
} from "../events/ElevatorEnergyEvents";
import {
	ElevatorEnergyFullEvent,
} from "../events/GamePhaseEvents";
import { GameAssets } from "../game/GameAssets";
import { GameAudio } from "../game/GameAudio";
import { GamePhaseManager } from "../game/GamePhaseManager";
import { GamePlayerPropManager } from "../game/GamePlayerPropManager";
import { calculatePropEnergyFromGameState } from "../props/PropEnergyHelper";
import { Animation } from "./Animation";
import { HudPanelChargeViewModelExt } from "./HudPanelChargeViewModelExt";

// #region Controller
@component({ description: "Controller for the charge panel with eye and charge flash animations." })
export class HudPanelCharge extends Component {
	private static readonly MAX_CHARGE_PANEL_SLOTS = 5;
	private static readonly FRAME_INTERVAL = 0.075;
	private static readonly EYE_RENDER_WIDTH = 756;
	private static readonly EYE_RENDER_HEIGHT = 310;
	private static readonly FLASH_1_WIDTH = 560;
	private static readonly FLASH_1_HEIGHT = 313;
	private static readonly FLASH_2_WIDTH = 333;
	private static readonly FLASH_2_HEIGHT = 333;
	private static readonly FLASH_3_WIDTH = 198;
	private static readonly FLASH_3_HEIGHT = 221;
	private static readonly FLASH_4_WIDTH = 324;
	private static readonly FLASH_4_HEIGHT = 260;
	private static readonly FLASH_5_WIDTH = 509;
	private static readonly FLASH_5_HEIGHT = 382;
	private static readonly FLASH_BALL_WIDTH = 280;
	private static readonly FLASH_BALL_HEIGHT = 280;

	private viewModel = new HudPanelChargeViewModelExt();
	private uiComponent: Maybe<CustomUiComponent> = null;
	private wasVisible: boolean = false;

	/** Cached SoundComponent for the single charge SFX (plays on every charge action) */
	private sfxCharge: Maybe<SoundComponent> = null;

	/** Cached SoundComponent for the charge-done SFX (plays when energy reaches elevator requirement) */
	private sfxChargeDone: Maybe<SoundComponent> = null;

	/** Set of currently selected charge slot indices (supports multi-selection) */
	private selectedChargeSlots: Set<number> = new Set();

	/** Charge animation state: 'idle' | 'playingFlash' | 'playingBall' */
	private chargeAnimState: string = "idle";
	/** Set of flash animation indices currently playing simultaneously */
	private activeFlashIndices: Set<number> = new Set();
	/** Per-slot frame counters for simultaneously playing flash animations */
	private flashFrameCounts: Map<number, number> = new Map();
	/** Frame counter for the ball animation */
	private chargeFrameCount: number = 0;
	/** Elapsed time for charge animation frame ticking */
	private chargeElapsed: number = 0;
	private animEye: Maybe<Animation> = null;
	private animChargeFlash1: Maybe<Animation> = null;
	private animChargeFlash2: Maybe<Animation> = null;
	private animChargeFlash3: Maybe<Animation> = null;
	private animChargeFlash4: Maybe<Animation> = null;
	private animChargeFlash5: Maybe<Animation> = null;
	private animChargeFlashBall: Maybe<Animation> = null;
	private readonly builderEye = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private readonly builderFlash1 = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private readonly builderFlash2 = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private readonly builderFlash3 = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private readonly builderFlash4 = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private readonly builderFlash5 = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private readonly builderFlashBall = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private elapsed: number = 0;

	//#region Lifecycle
	@subscribe(OnEntityCreateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onCreate(): void {
		this.uiComponent = this.entity.getComponent(CustomUiComponent);
		if (this.uiComponent) {
			this.uiComponent.dataContext = this.viewModel;
			this.uiComponent.isVisible = false;
		}
	}

	@subscribe(OnEntityStartEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onStart(): void {
		// Find the single SfxCharge child entity and cache its SoundComponent
		const sfxChargeEntities = this.entity.findChildrenWithName("SfxCharge", true);
		if (sfxChargeEntities.length > 0) {
			this.sfxCharge = sfxChargeEntities[0].getComponent(SoundComponent);
		} else {
			// Fallback: try SfxCharge1 for backward compatibility
			const sfxCharge1 = this.entity.findChildrenWithName("SfxCharge1", true);
			if (sfxCharge1.length > 0) {
				this.sfxCharge = sfxCharge1[0].getComponent(SoundComponent);
			}
		}

		// Find and cache the SfxChargeDone sound (plays when energy reaches requirement)
		const sfxDoneEntities = this.entity.findChildrenWithName("SfxChargeDone", true);
		if (sfxDoneEntities.length > 0) {
			this.sfxChargeDone = sfxDoneEntities[0].getComponent(SoundComponent);
		}


		// Initialize all animations from atlas data + textures
		this.animEye = new Animation(EYE_ATLAS, GameAssets.getEyeAtlasTexture());
		this.animChargeFlash1 = new Animation(CHARGE_FLASH_1_ATLAS, GameAssets.getChargeFlash1Texture());
		this.animChargeFlash2 = new Animation(CHARGE_FLASH_2_ATLAS, GameAssets.getChargeFlash2Texture());
		this.animChargeFlash3 = new Animation(CHARGE_FLASH_3_ATLAS, GameAssets.getChargeFlash3Texture());
		this.animChargeFlash4 = new Animation(CHARGE_FLASH_4_ATLAS, GameAssets.getChargeFlash4Texture());
		this.animChargeFlash5 = new Animation(CHARGE_FLASH_5_ATLAS, GameAssets.getChargeFlash5Texture());
		this.animChargeFlashBall = new Animation(CHARGE_FLASH_BALL_ATLAS, GameAssets.getChargeFlashBallTexture());

		// Render the first frame immediately for all animations
		this.renderAllFrames();
	}
	//#endregion

	@subscribe(OnClickBtnCloseEvent, { execution: ExecuteOn.Everywhere })
	private onClickBtnClose(): void {
		GameAudio.playClick();
		if (this.uiComponent) {
			this.uiComponent.isVisible = false;
		}
	}

	

	// #region Charge Button
	@subscribe(OnClickBtnChargeEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onClickBtnCharge(): void {
		if (this.selectedChargeSlots.size === 0 || this.chargeAnimState !== "idle") {
			return;
		}

		this.chargeAnimState = "playingFlash";
		this.chargeElapsed = 0;
		this.activeFlashIndices.clear();
		this.flashFrameCounts.clear();

		this.viewModel.showInteractionBlocker =Visibility.Visible;

		// Play the single charge SFX once for the entire charge action
		if (this.sfxCharge) {
			this.sfxCharge.play(new SoundPlayInfo());
		}

		for (const slotIndex of this.selectedChargeSlots) {
			const flashAnim = this.getFlashAnimByIndex(slotIndex);
			if (flashAnim) {
				flashAnim.setFrame(1);
				this.activeFlashIndices.add(slotIndex);
				this.flashFrameCounts.set(slotIndex, 0);
				this.setFlashVisibility(slotIndex,Visibility.Visible);
				this.renderFlashByIndex(slotIndex);
			}
		}
	}

	private getFlashAnimByIndex(index: number): Maybe<Animation> {
		if (index === 0) {
			return this.animChargeFlash1;
		} else if (index === 1) {
			return this.animChargeFlash2;
		} else if (index === 2) {
			return this.animChargeFlash3;
		} else if (index === 3) {
			return this.animChargeFlash4;
		} else if (index === 4) {
			return this.animChargeFlash5;
		}
		return null;
	}

	private setFlashVisibility(index: number, visibility: Visibility): void {
		if (index === 0) {
			this.viewModel.showAnimChargeFlash1 = visibility;
		} else if (index === 1) {
			this.viewModel.showAnimChargeFlash2 = visibility;
		} else if (index === 2) {
			this.viewModel.showAnimChargeFlash3 = visibility;
		} else if (index === 3) {
			this.viewModel.showAnimChargeFlash4 = visibility;
		} else if (index === 4) {
			this.viewModel.showAnimChargeFlash5 = visibility;
		}
	}

	private renderFlashByIndex(index: number): void {
		if (index === 0) {
			this.renderFlash1Frame();
		} else if (index === 1) {
			this.renderFlash2Frame();
		} else if (index === 2) {
			this.renderFlash3Frame();
		} else if (index === 3) {
			this.renderFlash4Frame();
		} else if (index === 4) {
			this.renderFlash5Frame();
		}
	}

	private advanceChargeAnimation(): void {
		if (this.chargeAnimState === "playingFlash") {
			const completedSlots: number[] = [];

			for (const slotIndex of this.activeFlashIndices) {
				const flashAnim = this.getFlashAnimByIndex(slotIndex);
				if (!flashAnim) {
					completedSlots.push(slotIndex);
					continue;
				}

				flashAnim.nextFrame();
				const count = (this.flashFrameCounts.get(slotIndex) ?? 0) + 1;
				this.flashFrameCounts.set(slotIndex, count);
				this.renderFlashByIndex(slotIndex);

				if (count >= flashAnim.totalFrames) {
					completedSlots.push(slotIndex);
				}
			}

			for (const slot of completedSlots) {
				this.setFlashVisibility(slot,Visibility.Collapsed);
				this.activeFlashIndices.delete(slot);
				this.flashFrameCounts.delete(slot);
			}

			if (this.activeFlashIndices.size === 0) {
				let totalEnergy = 0;
				const localPlayer = Service.get(PlayerService).getLocalPlayer();
				if (localPlayer) {
					const inventoryEntities = EntityService.findEntitiesWithComponent(GamePlayerPropManager);
					if (inventoryEntities.length > 0) {
						const inventory = inventoryEntities[0].getComponent(GamePlayerPropManager);
						if (inventory) {
							for (const slotIndex of this.selectedChargeSlots) {
								const slotData = inventory.getSlot(localPlayer, slotIndex);
								if (slotData) {
									totalEnergy += calculatePropEnergyFromGameState(slotData.baseValue);
								}
							}

							for (const slotIndex of this.selectedChargeSlots) {
								inventory.removePropAtSlot(localPlayer, slotIndex);
							}
						}
					}
				}

				if (totalEnergy > 0) {
					const elevatorEntities = EntityService.findEntitiesWithComponent(GamePhaseManager);
					if (elevatorEntities.length > 0) {
						const energyMgr = elevatorEntities[0].getComponent(GamePhaseManager);
						if (energyMgr) {
							energyMgr.addEnergy(totalEnergy);
						}
					}
				}

				this.selectedChargeSlots.clear();
				this.updateChargeSlotSelection();

				this.syncBackpackToSlots();

				this.chargeAnimState = "playingBall";
				this.chargeFrameCount = 0;

				if (this.animChargeFlashBall) {
					this.animChargeFlashBall.setFrame(1);
				}
				this.viewModel.showAnimChargeFlashBall =Visibility.Visible;
				this.renderFlashBallFrame();
			}
		} else if (this.chargeAnimState === "playingBall") {
			if (!this.animChargeFlashBall) {
				this.chargeAnimState = "idle";
				return;
			}

			this.animChargeFlashBall.nextFrame();
			this.chargeFrameCount++;
			this.renderFlashBallFrame();

			if (this.chargeFrameCount >= this.animChargeFlashBall.totalFrames) {
				this.viewModel.showAnimChargeFlashBall =Visibility.Collapsed;
				this.chargeAnimState = "idle";

				this.viewModel.showInteractionBlocker =Visibility.Collapsed;
			}
		}
	}
	// #endregion

	// #region Item Slot Selection
	@subscribe(OnClickBtnItem1Event, { execution: ExecuteOn.Everywhere })
	private onClickItem1(): void {
		this.handleChargeSlotClick(0);
	}

	@subscribe(OnClickBtnItem2Event, { execution: ExecuteOn.Everywhere })
	private onClickItem2(): void {
		this.handleChargeSlotClick(1);
	}

	@subscribe(OnClickBtnItem3Event, { execution: ExecuteOn.Everywhere })
	private onClickItem3(): void {
		this.handleChargeSlotClick(2);
	}

	@subscribe(OnClickBtnItem4Event, { execution: ExecuteOn.Everywhere })
	private onClickItem4(): void {
		this.handleChargeSlotClick(3);
	}

	@subscribe(OnClickBtnItem5Event, { execution: ExecuteOn.Everywhere })
	private onClickItem5(): void {
		this.handleChargeSlotClick(4);
	}

	private handleChargeSlotClick(slotIndex: number): void {
		const hasItem = this.slotHasItem(slotIndex);
		if (!hasItem) {
			return;
		}

		GameAudio.playClick();

		if (this.selectedChargeSlots.has(slotIndex)) {
			this.selectedChargeSlots.delete(slotIndex);
		} else {
			this.selectedChargeSlots.add(slotIndex);
		}

		this.updateChargeSlotSelection();
	}

	private slotHasItem(slotIndex: number): boolean {
		if (slotIndex === 0) {
			return this.viewModel.showIcon1 === Visibility.Visible;
		} else if (slotIndex === 1) {
			return this.viewModel.showIcon2 === Visibility.Visible;
		} else if (slotIndex === 2) {
			return this.viewModel.showIcon3 === Visibility.Visible;
		} else if (slotIndex === 3) {
			return this.viewModel.showIcon4 === Visibility.Visible;
		} else if (slotIndex === 4) {
			return this.viewModel.showIcon5 === Visibility.Visible;
		}
		return false;
	}

	private updateChargeSlotSelection(): void {
		let show1: Visibility;
		if (this.selectedChargeSlots.has(0)) {
			show1 = Visibility.Visible;
		} else {
			show1 = Visibility.Collapsed;
		}
		this.viewModel.show1Select = show1;
		let show2: Visibility;
		if (this.selectedChargeSlots.has(1)) {
			show2 = Visibility.Visible;
		} else {
			show2 = Visibility.Collapsed;
		}
		this.viewModel.show2Select = show2;
		let show3: Visibility;
		if (this.selectedChargeSlots.has(2)) {
			show3 = Visibility.Visible;
		} else {
			show3 = Visibility.Collapsed;
		}
		this.viewModel.show3Select = show3;
		let show4: Visibility;
		if (this.selectedChargeSlots.has(3)) {
			show4 = Visibility.Visible;
		} else {
			show4 = Visibility.Collapsed;
		}
		this.viewModel.show4Select = show4;
		let show5: Visibility;
		if (this.selectedChargeSlots.has(4)) {
			show5 = Visibility.Visible;
		} else {
			show5 = Visibility.Collapsed;
		}
		this.viewModel.show5Select = show5;
	}
	// #endregion

	@subscribe(ElevatorSafeZoneEnteredEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onSafeZoneEntered(payload: ElevatorSafeZonePlayerPayload): void {
		if (this.uiComponent) {
			this.uiComponent.isVisible = true;
		}
	}

	@subscribe(ElevatorSafeZoneExitedEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onSafeZoneExited(payload: ElevatorSafeZonePlayerPayload): void {
		if (this.uiComponent) {
			this.uiComponent.isVisible = false;
		}
	}

	@subscribe(ElevatorEnergyFullEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onElevatorEnergyFull(): void {
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		if (this.sfxChargeDone) {
			this.sfxChargeDone.play(new SoundPlayInfo());
		}
	}

	@subscribe(OnWorldUpdateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (!this.animEye) {
			return;
		}

		let isVisible: boolean;
		if (this.uiComponent) {
			isVisible = this.uiComponent.isVisible;
		} else {
			isVisible = false;
		}
		if (isVisible && !this.wasVisible) {
			this.syncBackpackToSlots();
		}
		this.wasVisible = isVisible;

		this.elapsed += payload.deltaTime;
		if (this.elapsed >= HudPanelCharge.FRAME_INTERVAL) {
			this.elapsed -= HudPanelCharge.FRAME_INTERVAL;
			this.animEye.nextFrame();
			this.renderEyeFrame();

			if (!isVisible) {
				this.animChargeFlash1!.nextFrame();
				this.animChargeFlash2!.nextFrame();
				this.animChargeFlash3!.nextFrame();
				this.animChargeFlash4!.nextFrame();
				this.animChargeFlash5!.nextFrame();
				this.animChargeFlashBall!.nextFrame();
				this.renderFlash1Frame();
				this.renderFlash2Frame();
				this.renderFlash3Frame();
				this.renderFlash4Frame();
				this.renderFlash5Frame();
				this.renderFlashBallFrame();
			}
		}

		if (this.chargeAnimState !== "idle") {
			this.chargeElapsed += payload.deltaTime;
			if (this.chargeElapsed >= HudPanelCharge.FRAME_INTERVAL) {
				this.chargeElapsed -= HudPanelCharge.FRAME_INTERVAL;
				this.advanceChargeAnimation();
			}
		}
	}

	// #region Backpack Sync
	private syncBackpackToSlots(): void {
		const localPlayer = Service.get(PlayerService).getLocalPlayer();
		if (!localPlayer) {
			this.clearAllChargeSlots();
			return;
		}

		const inventoryEntities = EntityService.findEntitiesWithComponent(GamePlayerPropManager);
		if (inventoryEntities.length === 0) {
			this.clearAllChargeSlots();
			return;
		}

		const inventory = inventoryEntities[0].getComponent(GamePlayerPropManager);
		if (!inventory) {
			this.clearAllChargeSlots();
			return;
		}

		const slots = inventory.getPlayerSlots(localPlayer);

		for (let i = 0; i < HudPanelCharge.MAX_CHARGE_PANEL_SLOTS; i++) {
			const slotItem = slots[i] ?? null;

			if (slotItem) {
				const icon = slotItem.icon;
				const energy = calculatePropEnergyFromGameState(slotItem.baseValue);
				const displayText = energy > 0 ? `${energy}` : "";
				this.setChargeSlot(i, icon, displayText,Visibility.Collapsed,Visibility.Visible);
			} else {
				this.setChargeSlot(i, null, "",Visibility.Visible,Visibility.Collapsed);
			}
		}

		this.selectedChargeSlots.clear();
		this.updateChargeSlotSelection();

		this.viewModel.showAnimChargeFlash1 =Visibility.Collapsed;
		this.viewModel.showAnimChargeFlash2 =Visibility.Collapsed;
		this.viewModel.showAnimChargeFlash3 =Visibility.Collapsed;
		this.viewModel.showAnimChargeFlash4 =Visibility.Collapsed;
		this.viewModel.showAnimChargeFlash5 =Visibility.Collapsed;
		this.viewModel.showAnimChargeFlashBall =Visibility.Collapsed;

		this.viewModel.showInteractionBlocker =Visibility.Collapsed;
	}

	private setChargeSlot(index: number, icon: Maybe<TextureAsset>, text: string, showBlank: Visibility, showIcon: Visibility): void {
		if (index === 0) {
			this.viewModel.Icon1 = icon;
			this.viewModel.Text1 = text;
			this.viewModel.showBlank1 = showBlank;
			this.viewModel.showIcon1 = showIcon;
		} else if (index === 1) {
			this.viewModel.Icon2 = icon;
			this.viewModel.Text2 = text;
			this.viewModel.showBlank2 = showBlank;
			this.viewModel.showIcon2 = showIcon;
		} else if (index === 2) {
			this.viewModel.Icon3 = icon;
			this.viewModel.Text3 = text;
			this.viewModel.showBlank3 = showBlank;
			this.viewModel.showIcon3 = showIcon;
		} else if (index === 3) {
			this.viewModel.Icon4 = icon;
			this.viewModel.Text4 = text;
			this.viewModel.showBlank4 = showBlank;
			this.viewModel.showIcon4 = showIcon;
		} else if (index === 4) {
			this.viewModel.Icon5 = icon;
			this.viewModel.Text5 = text;
			this.viewModel.showBlank5 = showBlank;
			this.viewModel.showIcon5 = showIcon;
		}
	}

	private clearAllChargeSlots(): void {
		for (let i = 0; i < HudPanelCharge.MAX_CHARGE_PANEL_SLOTS; i++) {
			this.setChargeSlot(i, null, "",Visibility.Visible,Visibility.Collapsed);
		}
		this.selectedChargeSlots.clear();
		this.updateChargeSlotSelection();
	}
	// #endregion

	private renderAllFrames(): void {
		this.renderEyeFrame();
		this.renderFlash1Frame();
		this.renderFlash2Frame();
		this.renderFlash3Frame();
		this.renderFlash4Frame();
		this.renderFlash5Frame();
		this.renderFlashBallFrame();
	}

	private renderEyeFrame(): void {
		if (!this.animEye) {
			return;
		}
		this.builderEye.clear();
		this.animEye.render(this.builderEye, 0, 0, HudPanelCharge.EYE_RENDER_WIDTH, HudPanelCharge.EYE_RENDER_HEIGHT);
		this.viewModel.drawCommandsAnimEye = this.builderEye.build();
	}

	private renderFlash1Frame(): void {
		if (!this.animChargeFlash1) {
			return;
		}
		this.builderFlash1.clear();
		this.animChargeFlash1.render(this.builderFlash1, 0, 0, HudPanelCharge.FLASH_1_WIDTH, HudPanelCharge.FLASH_1_HEIGHT);
		this.viewModel.drawCommandsAnimChargeFlash1 = this.builderFlash1.build();
	}

	private renderFlash2Frame(): void {
		if (!this.animChargeFlash2) {
			return;
		}
		this.builderFlash2.clear();
		this.animChargeFlash2.render(this.builderFlash2, 0, 0, HudPanelCharge.FLASH_2_WIDTH, HudPanelCharge.FLASH_2_HEIGHT);
		this.viewModel.drawCommandsAnimChargeFlash2 = this.builderFlash2.build();
	}

	private renderFlash3Frame(): void {
		if (!this.animChargeFlash3) {
			return;
		}
		this.builderFlash3.clear();
		this.animChargeFlash3.render(this.builderFlash3, 0, 0, HudPanelCharge.FLASH_3_WIDTH, HudPanelCharge.FLASH_3_HEIGHT);
		this.viewModel.drawCommandsAnimChargeFlash3 = this.builderFlash3.build();
	}

	private renderFlash4Frame(): void {
		if (!this.animChargeFlash4) {
			return;
		}
		this.builderFlash4.clear();
		this.animChargeFlash4.render(this.builderFlash4, 0, 0, HudPanelCharge.FLASH_4_WIDTH, HudPanelCharge.FLASH_4_HEIGHT);
		this.viewModel.drawCommandsAnimChargeFlash4 = this.builderFlash4.build();
	}

	private renderFlash5Frame(): void {
		if (!this.animChargeFlash5) {
			return;
		}
		this.builderFlash5.clear();
		this.animChargeFlash5.render(this.builderFlash5, 0, 0, HudPanelCharge.FLASH_5_WIDTH, HudPanelCharge.FLASH_5_HEIGHT);
		this.viewModel.drawCommandsAnimChargeFlash5 = this.builderFlash5.build();
	}

	private renderFlashBallFrame(): void {
		if (!this.animChargeFlashBall) {
			return;
		}
		this.builderFlashBall.clear();
		this.animChargeFlashBall.render(this.builderFlashBall, 0, 0, HudPanelCharge.FLASH_BALL_WIDTH, HudPanelCharge.FLASH_BALL_HEIGHT);
		this.viewModel.drawCommandsAnimChargeFlashBall = this.builderFlashBall.build();
	}
}
// #endregion
