/**
 * WallSconceFlickerComponent
 *
 * Makes a PointLight flicker at random intervals (5-8 seconds).
 * Each flicker event is a rapid burst of 3-5 on/off cycles (0.05s each phase),
 * dimming the light completely to 0 intensity during off phases.
 *
 * Component Attachment: Scene Entity (wall sconce template with a PointLight)
 * Component Networking: Local (visual effect only, no sync needed)
 * Component Ownership: Not Networked
 */
import type { Maybe } from "meta/worlds";
import {
	Component,
	ExecuteOn,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	PointLightComponent,
	WorldService,
	component,
	property,
	subscribe,
} from "meta/worlds";

@component()
export class WallSconceFlickerComponent extends Component {
	/** Base intensity of the light (restored after flicker) */
	@property({isNetworked: false})
	public baseIntensity: number = 8.0;

	/** Minimum interval between flicker bursts in seconds */
	@property({isNetworked: false})
	public minInterval: number = 5.0;

	/** Maximum interval between flicker bursts in seconds */
	@property({isNetworked: false})
	public maxInterval: number = 8.0;

	/** Duration of each on/off phase within a burst in seconds */
	@property({isNetworked: false})
	public flickerPhaseTime: number = 0.05;

	/** Intensity multiplier during flicker dim phase (0 = fully off) */
	@property({isNetworked: false})
	public flickerDimFactor: number = 0;

	// Internal state (not networked, local only)
	private light: Maybe<PointLightComponent> = null;
	private nextFlickerTime: number = 0;
	private isBursting: boolean = false;
	private burstTotalCycles: number = 0;
	private burstCurrentCycle: number = 0;
	private phaseEndTime: number = 0;
	private isDimPhase: boolean = false;

	@subscribe(OnEntityStartEvent, {execution: ExecuteOn.Everywhere})
	private onStart(): void {
		this.light = this.entity.getComponent(PointLightComponent);
		if (!this.light) {
			console.log("[WallSconceFlicker.onStart] No PointLightComponent found on entity");
			return;
		}
		// Store actual intensity from the light component
		this.baseIntensity = this.light.intensity;
		// Schedule first flicker
		this.nextFlickerTime = WorldService.get().getWorldTime() + this.getRandomInterval();
	}

	@subscribe(OnWorldUpdateEvent, {execution: ExecuteOn.Everywhere})
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		if (!this.light) {
			return;
		}

		const currentTime = WorldService.get().getWorldTime();

		if (this.isBursting) {
			// Currently in a rapid flicker burst
			if (currentTime >= this.phaseEndTime) {
				if (this.isDimPhase) {
					// Dim phase ended -> go bright
					this.light.intensity = this.baseIntensity;
					this.isDimPhase = false;
					this.burstCurrentCycle++;

					if (this.burstCurrentCycle >= this.burstTotalCycles) {
						// Burst complete, schedule next burst
						this.isBursting = false;
						this.nextFlickerTime = currentTime + this.getRandomInterval();
					} else {
						// More cycles remain, schedule next dim phase
						this.phaseEndTime = currentTime + this.flickerPhaseTime;
					}
				} else {
					// Bright phase ended -> go dim
					this.light.intensity = this.baseIntensity * this.flickerDimFactor;
					this.isDimPhase = true;
					this.phaseEndTime = currentTime + this.flickerPhaseTime;
				}
			}
		} else {
			// Waiting for next burst
			if (currentTime >= this.nextFlickerTime) {
				// Start a new burst: random 3-5 cycles
				this.burstTotalCycles = 3 + Math.floor(Math.random() * 3);
				this.burstCurrentCycle = 0;
				this.isBursting = true;
				this.isDimPhase = true;
				// Immediately go dim for the first phase
				this.light.intensity = this.baseIntensity * this.flickerDimFactor;
				this.phaseEndTime = currentTime + this.flickerPhaseTime;
			}
		}
	}

	private getRandomInterval(): number {
		return this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
	}
}
