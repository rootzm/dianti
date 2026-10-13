/**
 * HudGameHpPower - HUD controller for HP and Power display using BMFont DrawingSurface.
 *
 * Component Attachment: Scene Entity (a dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Displays HP and Power as bitmap-font rendered numbers on DrawingSurface canvases.
 * Subscribes to PlayerLogicComponent.onHealthChanged and onPowerChanged callbacks.
 */

import type { Entity, Maybe } from "meta/worlds";
import {
	BasePlayerComponent,
	Component,
	CustomUiComponent,
	DrawingCommandData,
	DrawingCommandsBuilder,
	DrawingCommandsVersion,
	EntityService,
	ExecuteOn,
	OnEntityStartEvent,
	OnPlayerCreateEvent,
	TextureAsset,
	component,
	property,
	subscribe,
} from "meta/worlds";
import { HudGameHpPowerViewModelExt } from "./HudGameHpPowerViewModelExt";
import { FONT_1_FNT } from "../assets/font_1";
import { PlayerLogic } from "../components/PlayerLogic";
import { BMFont } from "./BMFont";

// #region Controller
@component({
	description: "HUD for HP and Power display using BMFont rendered on DrawingSurface.",
})
export class HudGameHpPower extends Component {
	/** Font atlas texture for HP display */
	@property()
	private fontAtlasHp: Maybe<TextureAsset> = null;

	/** Font atlas texture for Power display */
	@property()
	private fontAtlasPower: Maybe<TextureAsset> = null;

	// Pre-allocated builders to avoid per-frame allocation
	private readonly builderHp = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private readonly builderPower = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });

	private viewModel = new HudGameHpPowerViewModelExt();
	private bmFontHp: Maybe<BMFont> = null;
	private bmFontPower: Maybe<BMFont> = null;
	private healthComponent: Maybe<PlayerLogic> = null;
	private unsubscribeHealth: Maybe<() => void> = null;
	private unsubscribePower: Maybe<() => void> = null;

	// #region Lifecycle
	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	private onStart(): void {
		// Bind ViewModel to CustomUiComponent
		const uiComponent = this.entity.getComponent(CustomUiComponent);
		if (uiComponent) {
			uiComponent.dataContext = this.viewModel;
		} else {
			return;
		}

		// Initialize BMFont instances
		const fontData = BMFont.parseBMFontText(FONT_1_FNT);
		if (this.fontAtlasHp) {
			this.bmFontHp = new BMFont(this.fontAtlasHp, fontData);
		} else {
		}
		if (this.fontAtlasPower) {
			this.bmFontPower = new BMFont(this.fontAtlasPower, fontData);
		} else {
		}
		if (!this.bmFontHp && !this.bmFontPower) {
			return;
		}

		// Connect to player
		const player = this.findLocalPlayer();
		if (player) {
			this.connectToPlayer(player);
		} else {
		}
	}

	@subscribe(OnPlayerCreateEvent, { execution: ExecuteOn.Everywhere })
	private onPlayerCreate(): void {
		if (this.healthComponent) {
			return;
		}
		const player = this.findLocalPlayer();
		if (player) {
			this.connectToPlayer(player);
		}
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
		this.healthComponent = playerEntity.getComponent(PlayerLogic);
		if (!this.healthComponent) {
			return;
		}

		// Initial render
		this.renderHp(this.healthComponent.currentHealth, this.healthComponent.maxHealth);
		this.renderPower(this.healthComponent.currentPower, this.healthComponent.maxPower);

		// Subscribe to changes
		this.unsubscribeHealth = this.healthComponent.onHealthChanged(
			(current: number, max: number): void => {
				this.renderHp(current, max);
			},
		);

		this.unsubscribePower = this.healthComponent.onPowerChanged(
			(current: number, max: number): void => {
				this.renderPower(current, max);
			},
		);

	}
	// #endregion

	// #region Rendering
	/** DrawingSurface height as defined in HudGameHpPower.xaml */
	private static readonly SURFACE_HEIGHT = 100;
	private static readonly FONT_SIZE_LARGE = 60;
	private static readonly FONT_SIZE_SMALL = 36;
	private static readonly LETTER_SPACING = 2;

	/** Compute vertically centered offsetY for the large font */
	private computeCenteredOffsetY(): number {
		return (HudGameHpPower.SURFACE_HEIGHT - HudGameHpPower.FONT_SIZE_LARGE) / 2;
	}

	/**
	 * Fixed x offset for the suffix part: 150px.
	 */
	private computeSuffixOffsetX(): number {
		return 150;
	}

	private renderHp(current: number, max: number): void {
		if (!this.bmFontHp) {
			return;
		}
		const currentText = `${Math.ceil(current)}`;
		const suffixText = `/${Math.ceil(max)}`;
		const offsetY = this.computeCenteredOffsetY();
		const suffixX = this.computeSuffixOffsetX();

		this.builderHp.clear();
		// Draw current value (large font)
		this.bmFontHp.drawText(this.builderHp, currentText, 0, 0, {
			fontSize: HudGameHpPower.FONT_SIZE_LARGE,
			letterSpacing: HudGameHpPower.LETTER_SPACING,
			offsetX: 0,
			offsetY: offsetY,
		});
		// Draw "/max" (small font), top-aligned with large text, fixed x position (+5 offset down)
		this.bmFontHp.drawText(this.builderHp, suffixText, 0, 0, {
			fontSize: HudGameHpPower.FONT_SIZE_SMALL,
			letterSpacing: HudGameHpPower.LETTER_SPACING,
			offsetX: suffixX,
			offsetY: offsetY + 5,
		});
		this.viewModel.drawCommandsTextHp = this.builderHp.build();
	}

	private renderPower(current: number, max: number): void {
		if (!this.bmFontPower) {
			return;
		}
		const currentText = `${Math.ceil(current)}`;
		const suffixText = `/${Math.ceil(max)}`;
		const offsetY = this.computeCenteredOffsetY();
		const suffixX = this.computeSuffixOffsetX();

		this.builderPower.clear();
		// Draw current value (large font)
		this.bmFontPower.drawText(this.builderPower, currentText, 0, 0, {
			fontSize: HudGameHpPower.FONT_SIZE_LARGE,
			letterSpacing: HudGameHpPower.LETTER_SPACING,
			offsetX: 0,
			offsetY: offsetY,
		});
		// Draw "/max" (small font), top-aligned with large text, fixed x position (+5 offset down)
		this.bmFontPower.drawText(this.builderPower, suffixText, 0, 0, {
			fontSize: HudGameHpPower.FONT_SIZE_SMALL,
			letterSpacing: HudGameHpPower.LETTER_SPACING,
			offsetX: suffixX,
			offsetY: offsetY + 5,
		});
		this.viewModel.drawCommandsTextPower = this.builderPower.build();
	}
	// #endregion
}
// #endregion
