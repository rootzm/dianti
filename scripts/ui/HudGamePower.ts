/**
 * HudGamePower - HUD controller showing current elevator energy vs needed energy.
 *
 * Component Attachment: Scene Entity (a dedicated HUD entity with CustomUiComponent)
 * Component Networking: Local (UI is client-side only)
 * Component Ownership: Not Networked
 *
 * Subscribes to ElevatorEnergyChangedEvent to keep textCur/textNeed in sync
 * with the ElevatorEnergyManager state.
 */

import {
	Component,
	CustomUiComponent,
	EntityService,
	ExecuteOn,
	OnEntityStartEvent,
	component,
	subscribe,
} from "meta/worlds";
import { HudGamePowerViewModel } from '../../generated/view_models/HudGamePowerViewModel';
import {
	ElevatorEnergyChangedEvent,
	ElevatorEnergyChangedPayload,
} from '../events/GamePhaseEvents';
import { GamePhaseManager } from '../game/GamePhaseManager';

@component({ description: "HUD displaying current elevator energy and energy needed." })
export class HudGamePower extends Component {
	private viewModel = new HudGamePowerViewModel();

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	onStart(): void {
		// Bind ViewModel to CustomUiComponent
		const uiComp = this.entity.getComponent(CustomUiComponent);
		if (uiComp) {
			uiComp.dataContext = this.viewModel;
		} else {
			return;
		}

		// Read initial state from ElevatorEnergyManager
		this.tryReadInitialEnergy();
	}

	/**
	 * Attempt to read current energy from ElevatorEnergyManager.
	 * If the manager isn't available yet (race condition at startup),
	 * retry after a short delay.
	 */
	private tryReadInitialEnergy(): void {
		const elevatorEntities = EntityService.findEntitiesWithComponent(GamePhaseManager);
		if (elevatorEntities.length > 0) {
			const mgr = elevatorEntities[0].getComponent(GamePhaseManager);
			if (mgr) {
				this.updateDisplay(mgr.currentEnergy, mgr.maxEnergy);
				return;
			}
		}

		// Manager not found yet — retry after 500ms to handle startup ordering
		setTimeout(() => {
			if (!this.entity.valid) return;
			const retryEntities = EntityService.findEntitiesWithComponent(GamePhaseManager);
			if (retryEntities.length > 0) {
				const mgr = retryEntities[0].getComponent(GamePhaseManager);
				if (mgr) {
					this.updateDisplay(mgr.currentEnergy, mgr.maxEnergy);
					return;
				}
			}
			// Still not found — show defaults
			this.updateDisplay(0, 0);
		}, 500);
	}

	/**
	 * Listen for energy changes from ElevatorEnergyManager.
	 */
	@subscribe(ElevatorEnergyChangedEvent, { execution: ExecuteOn.Everywhere })
	onEnergyChanged(payload: ElevatorEnergyChangedPayload): void {
		this.updateDisplay(payload.currentEnergy, payload.maxEnergy);
	}

	/**
	 * Update the ViewModel text properties.
	 */
	private updateDisplay(current: number, max: number): void {
		this.viewModel.textCur = `${Math.floor(current)}`;
		this.viewModel.textNeed = `${Math.floor(max)}`;
	}
}
