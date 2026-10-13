import { Component, component, property } from "meta/worlds";
import type { Maybe } from "meta/worlds";
import { HudPanelTips } from '../ui/HudPanelTips';

/**
 * GameGuideManager - Manages in-game tips and guidance text.
 *
 * Component Attachment: Scene Entity (Systems)
 * Component Networking: Local
 * Component Ownership: Not Networked
 */
@component()
export class GameGuideManager extends Component {
	@property()
	tipsText: readonly string[] = [];

	private hudPanelTips: Maybe<HudPanelTips> = null;

	/** Receive the HudPanelTips reference from the initialization orchestrator. */
	public setTips(tips: HudPanelTips): void {
		this.hudPanelTips = tips;
	}

	/**
	 * Plays through all tips sequentially with delays between them.
	 * Waits 1 second, then for each tip: shows it for 3s (via HudPanelTips.showText),
	 * waits for it to hide, then waits 1 second before the next.
	 */
	public async playGuide(): Promise<void> {
		if (!this.hudPanelTips) {
			console.log('[GameGuideManager.playGuide] Could not find HudPanelTips component in scene');
			return;
		}

		if (this.tipsText.length === 0) {
			return;
		}

		// Wait 1 second before starting
		await this.delay(1000);

		for (let i = 0; i < this.tipsText.length; i++) {
			const text = this.tipsText[i];

			// Show the tip and wait for it to auto-hide (3 seconds)
			await this.hudPanelTips.showText(text);

			// Wait 1 second before showing the next tip (skip delay after the last one)
			if (i < this.tipsText.length - 1) {
				await this.delay(1000);
			}
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise<void>((resolve: () => void): void => {
			setTimeout((): void => {
				if (!this.entity.valid) { resolve(); return; }
				resolve();
			}, ms);
		});
	}
}
