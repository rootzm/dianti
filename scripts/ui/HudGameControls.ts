/**
 * HudGameControls - HUD controller for game control buttons (flashlight toggle, sprint toggle, depot open).
 *
 * Component Attachment: Scene Entity (a dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * BtnFlash toggles the player's flashlight via PlayerLogicComponent.toggleFlashlight().
 * BtnAction toggles sprint mode, applying a speed multiplier and draining power per frame.
 * BtnOpenDepot opens the Depot panel when the player is near a depot crate.
 */

import type {
	Entity,
	Maybe,
} from "meta/worlds";
import {
	BasePlayerComponent,
	Component,
	CustomUiComponent,
	EntityService,
	ExecuteOn,
	OnEntityStartEvent,
	OnPlayerCreateEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	SoundComponent,
	SoundPlayInfo,
	Visibility,
	component,
	subscribe,
} from "meta/worlds";
import {
	OnClickBtnActionEvent,
	OnClickBtnFlashEvent,
	OnClickBtnOpenDepotEvent,
	OnClickBtnPickupEvent,
	OnClickBtnUseEvent,
} from "../../generated/view_models/HudGameControlsViewModel";
import { HudGameControlsViewModelExt } from "./HudGameControlsViewModelExt";
import { GameAudio } from "../game/GameAudio";
import { PlayerLogic } from "../components/PlayerLogic";
import { PlayerMovementAbility } from "../components/ability/PlayerMovementAbility";
import { DepotPanelToggleRequestEvent } from "../events/DepotEvents";
import {
	PropPromptConfirmPickupEvent,
	PropPromptHideEvent,
	PropPromptShowEvent,
	PropPromptShowPayload,
	PropUseButtonClickEvent,
	PropUseButtonHideEvent,
	PropUseButtonShowEvent,
	PropUseButtonShowPayload,
} from "../events/PropEvents";
import { calculatePropEnergyFromGameState } from "../props/PropEnergyHelper";

@component({
	description: "HUD controller for game control buttons (flashlight toggle, sprint toggle, depot open).",
})
export class HudGameControls extends Component {
	private static readonly SPRINT_SPEED_MULTIPLIER = 1.5;
	private static readonly SPRINT_POWER_DRAIN_RATE = 2.0;
	private static readonly SPRINT_INPUT_THRESHOLD = 0.1;

	private viewModel = new HudGameControlsViewModelExt();
	private playerLogic: Maybe<PlayerLogic> = null;
	private playerMovement: Maybe<PlayerMovementAbility> = null;
	private isSprinting: boolean = false;
	private isDoorInteraction: boolean = false;
	private sfxBtnFlash: Maybe<SoundComponent> = null;
	private sfxBtnDepot: Maybe<SoundComponent> = null;

	@subscribe(OnEntityStartEvent, {
		execution: ExecuteOn.Everywhere,
	})
	public onStart(): void {
		// Bind ViewModel to CustomUiComponent
		const uiComponent = this.entity.getComponent(CustomUiComponent);
		if (uiComponent) {
			uiComponent.dataContext = this.viewModel;
		} else {
			return;
		}

		// Cache SfxBtnFlash sound component from child entity
		const sfxChildren = this.entity.findChildrenWithName("SfxBtnFlash", true);
		if (sfxChildren.length > 0) {
			this.sfxBtnFlash = sfxChildren[0].getComponent(SoundComponent);
		}

		// Cache SfxBtnDepot sound component from child entity
		const sfxDepotChildren = this.entity.findChildrenWithName("SfxBtnDepot", true);
		if (sfxDepotChildren.length > 0) {
			this.sfxBtnDepot = sfxDepotChildren[0].getComponent(SoundComponent);
		}

		// Set initial icon state (flashlight on by default, sprint off / run icon visible)
		this.updateFlashlightIcon(true);
		this.updateSprintIcon(false);

		// Set initial depot button state (hidden by default)
		this.viewModel.showBtnOpenDepot = Visibility.Collapsed;

		// Set initial pickup button state (hidden by default)
		this.viewModel.showBtnPickup = Visibility.Collapsed;

		// Set initial use button state (hidden by default)
		this.viewModel.showBtnUse = Visibility.Collapsed;

		// Try to connect to player immediately
		const player = this.findLocalPlayer();
		if (player) {
			this.connectToPlayer(player);
		}
	}

	@subscribe(OnPlayerCreateEvent, {
		execution: ExecuteOn.Everywhere,
	})
	private onPlayerCreate(): void {
		if (this.playerLogic) {
			return;
		}
		const player = this.findLocalPlayer();
		if (player) {
			this.connectToPlayer(player);
		}
	}

	// #region Per-Frame Sprint Drain
	@subscribe(OnWorldUpdateEvent, {
		execution: ExecuteOn.Everywhere,
	})
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (!this.isSprinting || !this.playerLogic || !this.playerMovement) {
			return;
		}

		const input = this.playerMovement.getMovementInput();
		const inputMagnitude = Math.sqrt(input.x * input.x + input.y * input.y);
		if (inputMagnitude <= HudGameControls.SPRINT_INPUT_THRESHOLD) {
			return;
		}

		const drainAmount = HudGameControls.SPRINT_POWER_DRAIN_RATE * payload.deltaTime;
		const consumed = this.playerLogic.consumePower(drainAmount);
		if (!consumed || this.playerLogic.currentPower <= 0) {
			this.exitSprint();
		}
	}
	// #endregion

	// #region Button Events
	@subscribe(OnClickBtnFlashEvent)
	private onClickBtnFlash(): void {
		if (!this.playerLogic) {
			return;
		}

		// Play flashlight button SFX
		if (this.sfxBtnFlash) {
			this.sfxBtnFlash.play(new SoundPlayInfo());
		}

		const newState = this.playerLogic.toggleFlashlight();
		this.updateFlashlightIcon(newState);
	}

	@subscribe(OnClickBtnActionEvent)
	private onClickBtnAction(): void {
		GameAudio.playClick();
		if (!this.playerLogic || !this.playerMovement) {
			return;
		}

		if (this.isSprinting) {
			this.exitSprint();
		} else {
			this.enterSprint();
		}
	}

	@subscribe(OnClickBtnOpenDepotEvent)
	private onClickBtnOpenDepot(): void {
		if (this.sfxBtnDepot) {
			this.sfxBtnDepot.play(new SoundPlayInfo());
		}
		this.sendEventLocally(DepotPanelToggleRequestEvent, {});
	}
	// #endregion

	// #region Depot Button Visibility (listen to proximity events)
	@subscribe(PropPromptShowEvent, { execution: ExecuteOn.Everywhere })
	private onPropPromptShow(payload: PropPromptShowPayload): void {
		// Track whether this is a door interaction to suppress UI click sound
		this.isDoorInteraction = payload.isDoorInteraction;

		// Show depot button when the depot interaction prompt appears (player is near depot crate)
		if (payload.isDepotInteraction) {
			this.viewModel.showBtnOpenDepot = Visibility.Visible;
		} else {
			// Show pickup button for all other props and doors
			this.viewModel.showBtnPickup = Visibility.Visible;
			this.viewModel.btnPickupTextName = payload.text || "Pickup";
			if (payload.isDoorInteraction) {
				// Door interactions only show the text label, hide pickup details
				this.viewModel.showBtnPickupDetails = Visibility.Collapsed;
			} else {
				// Prop/item interactions show all pickup details
				this.viewModel.showBtnPickupDetails = Visibility.Visible;
				this.viewModel.btnPickupIcon = payload.icon;
				let powerText: string;
				if (payload.baseValue > 0) {
					const calculatedEnergy = calculatePropEnergyFromGameState(payload.baseValue);
					powerText = `+${calculatedEnergy}`;
				} else {
					powerText = "";
				}
				this.viewModel.btnPickupTextPower = powerText;
			}
		}
	}

	@subscribe(PropPromptHideEvent, { execution: ExecuteOn.Everywhere })
	private onPropPromptHide(): void {
		this.isDoorInteraction = false;
		this.viewModel.showBtnOpenDepot = Visibility.Collapsed;
		this.viewModel.showBtnPickup = Visibility.Collapsed;
	}

	// #endregion

	// #region Pickup Button Click
	@subscribe(OnClickBtnPickupEvent)
	private onClickBtnPickup(): void {
		if (this.viewModel.showBtnPickup !== Visibility.Visible) {
			return;
		}
		// Suppress generic UI click for door interactions (spatial door SFX plays from DoorLogic)
		if (!this.isDoorInteraction) {
			GameAudio.playClick();
		}
		this.sendEventLocally(PropPromptConfirmPickupEvent, {});
		// Hide the pickup button immediately after click
		this.viewModel.showBtnPickup = Visibility.Collapsed;
	}
	// #endregion

	// #region BtnUse (Use Item from Backpack)
	@subscribe(PropUseButtonShowEvent, { execution: ExecuteOn.Everywhere })
	private onUseButtonShow(payload: PropUseButtonShowPayload): void {
		this.viewModel.showBtnUse = Visibility.Visible;
		this.viewModel.btnUseIcon = payload.icon;
	}

	@subscribe(PropUseButtonHideEvent, { execution: ExecuteOn.Everywhere })
	private onUseButtonHide(): void {
		this.viewModel.showBtnUse = Visibility.Collapsed;
	}

	@subscribe(OnClickBtnUseEvent)
	private onClickBtnUse(): void {
		if (this.viewModel.showBtnUse !== Visibility.Visible) {
			return;
		}
		GameAudio.playClick();
		this.sendEventLocally(PropUseButtonClickEvent, {});
	}
	// #endregion

	// #region Sprint Logic
	private enterSprint(): void {
		if (!this.playerLogic || !this.playerMovement) {
			return;
		}
		if (this.playerLogic.currentPower <= 0) {
			return;
		}

		this.playerMovement.setSpeedMultiplier(HudGameControls.SPRINT_SPEED_MULTIPLIER);
		this.isSprinting = true;
		this.updateSprintIcon(true);
	}

	private exitSprint(): void {
		if (!this.playerMovement) {
			return;
		}

		this.playerMovement.setSpeedMultiplier(1.0);
		this.isSprinting = false;
		this.updateSprintIcon(false);
	}
	// #endregion

	// #region Player Connection
	private findLocalPlayer(): Maybe<Entity> {
		const players = EntityService.findEntitiesWithComponent(BasePlayerComponent);
		if (players.length > 0) {
			return players[0];
		}
		return null;
	}

	private connectToPlayer(playerEntity: Entity): void {
		this.playerLogic = playerEntity.getComponent(PlayerLogic);
		if (!this.playerLogic) {
			return;
		}

		this.playerMovement = playerEntity.getComponent(PlayerMovementAbility);

		// Sync icon with current flashlight state
		this.updateFlashlightIcon(this.playerLogic.flashlightActive);

		// Listen to power changes - if power runs out during sprint, auto-exit
		this.playerLogic.onPowerChanged((current: number, max: number): void => {
			if (current <= 0 && this.isSprinting) {
				this.exitSprint();
			}
			if (current <= 0 && this.playerLogic) {
				this.updateFlashlightIcon(false);
			}
		});

	}
	// #endregion

	// #region Icon Updates
	private updateFlashlightIcon(isOn: boolean): void {
		let onVisibility: Visibility;
		let offVisibility: Visibility;
		if (isOn) {
			onVisibility = Visibility.Visible;
			offVisibility = Visibility.Collapsed;
		} else {
			onVisibility = Visibility.Collapsed;
			offVisibility = Visibility.Visible;
		}
		this.viewModel.showIconFlashOn = onVisibility;
		this.viewModel.showIconFlashOff = offVisibility;
	}

	private updateSprintIcon(sprinting: boolean): void {
		let runVisibility: Visibility;
		let sprintVisibility: Visibility;
		if (sprinting) {
			runVisibility = Visibility.Collapsed;
			sprintVisibility = Visibility.Visible;
		} else {
			runVisibility = Visibility.Visible;
			sprintVisibility = Visibility.Collapsed;
		}
		this.viewModel.showActionRun = runVisibility;
		this.viewModel.showActionSprint = sprintVisibility;
	}
	// #endregion
}
