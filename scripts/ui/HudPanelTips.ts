/**
 * HudPanelTips - HUD controller for tips panel with BMFont text rendering.
 *
 * Component Attachment: Scene Entity (a dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 */

import type { Maybe } from "meta/worlds";
import {
	Component,
	CustomUiComponent,
	DrawingCommandsBuilder,
	DrawingCommandsVersion,
	ExecuteOn,
	OnEntityCreateEvent,
	OnEntityStartEvent,
	component,
	subscribe
} from "meta/worlds";
import { FONT_2_FNT } from "../assets/font_2";
import { GameAssets } from "../game/GameAssets";
import { BMFont } from "./BMFont";
import { HudPanelTipsViewModelExt } from "./HudPanelTipsViewModelExt";

// #region Controller
@component({
	description: "HUD for tips panel with BMFont text rendered on DrawingSurface.",
})
export class HudPanelTips extends Component {
	private static readonly SURFACE_WIDTH = 1920;
	private static readonly FONT_SIZE = 50;
	private static readonly LETTER_SPACING = 2;
	private static readonly DEFAULT_DURATION_MS = 3000;

	private viewModel = new HudPanelTipsViewModelExt();
	private uiComponent: Maybe<CustomUiComponent> = null;
	private builder = new DrawingCommandsBuilder({ version: DrawingCommandsVersion.Version2 });
	private bmFont: Maybe<BMFont> = null;
	private queue: Array<{text: string; durationMs: number; resolve: () => void}> = [];
	private isProcessing: boolean = false;

	// #region Lifecycle
	@subscribe(OnEntityCreateEvent, {
		execution: ExecuteOn.Everywhere
	})
	private onCreate(): void {
		// Bind ViewModel to CustomUiComponent
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
		// Get font_2 texture from GameAssets
		const fontTexture = GameAssets.getFont2Texture();
		if (!fontTexture) {
			return;
		}

		// Parse font_2 data and create BMFont instance
		const fontData = BMFont.parseBMFontText(FONT_2_FNT);
		this.bmFont = new BMFont(fontTexture, fontData);
	}
	// #endregion

	// #region Public API
	/**
	 * Shows the tips panel with the given text for the specified duration, then auto-hides.
	 * Returns a Promise that resolves when THIS specific tip finishes displaying.
	 * Multiple calls are queued and displayed sequentially (FIFO).
	 * @param text The text to display.
	 * @param durationMs Display duration in milliseconds (defaults to 3000).
	 */
	public showText(text: string, durationMs?: number): Promise<void> {
		const duration = durationMs !== undefined ? durationMs : HudPanelTips.DEFAULT_DURATION_MS;
		return new Promise<void>((resolve: () => void): void => {
			this.queue.push({text, durationMs: duration, resolve});
			if (!this.isProcessing) {
				this.processQueue();
			}
		});
	}

	private processQueue(): void {
		if (this.queue.length === 0) {
			this.isProcessing = false;
			return;
		}
		this.isProcessing = true;
		const entry = this.queue.shift()!;
		this.renderText(entry.text);
		if (this.uiComponent) {
			this.uiComponent.isVisible = true;
		}
		setTimeout(() => {
			if (!this.entity.valid) return;
			if (this.uiComponent) {
				this.uiComponent.isVisible = false;
			}
			entry.resolve();
			this.processQueue();
		}, entry.durationMs);
	}
	// #endregion

	// #region Rendering
	/**
	 * Renders the given text onto the drawCommandsText DrawingSurface using BMFont.
	 * Text is horizontally centered on the 1920-wide DrawingSurface.
	 */
	private renderText(text: string): void {
		if (!this.bmFont) {
			return;
		}

		this.builder.clear();

		// Calculate scale from fontSize
		const scale = HudPanelTips.FONT_SIZE / this.bmFont.lineHeight;

		// Measure the actual rendered text width (unscaled) then apply scale
		const unscaledWidth = this.bmFont.measureTextWidth(text, HudPanelTips.LETTER_SPACING);
		const scaledTextWidth = unscaledWidth * scale;

		// Compute centered x position on the 1920-wide surface
		const centeredX = (HudPanelTips.SURFACE_WIDTH - scaledTextWidth) / 2;

		this.bmFont.drawText(this.builder, text, centeredX, 0, {
			fontSize: HudPanelTips.FONT_SIZE,
			letterSpacing: HudPanelTips.LETTER_SPACING,
			offsetY: 80,
		});
		this.viewModel.drawCommandsText = this.builder.build();

		// Set width to actual rendered text width + 150px padding
		this.viewModel.width = scaledTextWidth + 150;
	}
	// #endregion
}
// #endregion
