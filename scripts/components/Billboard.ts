/**
 * Billboard Component
 *
 * Makes the attached entity always face the camera (billboarding behavior).
 * Also provides a public API for setting text on its child Text entity's WorldTextComponent.
 *
 * Component Attachment: Scene Entity (any entity that should always face the camera)
 * Component Networking: Local (visual-only, no network sync needed)
 * Component Ownership: Not Networked
 */
import type { Maybe } from 'meta/worlds';
import {
	CameraService,
	Color,
	Component,
	ExecuteOn,
	NetworkingService,
	OnEntityStartEvent,
	OnWorldUpdateEvent,
	OnWorldUpdateEventPayload,
	TransformComponent,
	Vec3,
	WorldTextComponent,
	component,
	subscribe,
} from 'meta/worlds';

@component({ description: "Makes the entity always face the camera (billboard behavior). Exposes setText/setColor API for child WorldTextComponent." })
export class Billboard extends Component {
	private cachedTransform: Maybe<TransformComponent> = null;
	private get transform(): Maybe<TransformComponent> {
		return (this.cachedTransform ??= this.entity.getComponent(TransformComponent));
	}

	private cachedWorldText: Maybe<WorldTextComponent> = null;
	private get worldText(): Maybe<WorldTextComponent> {
		return this.cachedWorldText;
	}

	@subscribe(OnEntityStartEvent, { execution: ExecuteOn.Everywhere })
	private onStart(): void {
		// Eagerly resolve transform reference
		this.cachedTransform = this.entity.getComponent(TransformComponent);

		// Find the Text child entity with WorldTextComponent
		const textChildren = this.entity.findChildrenWithName('Text', true);
		if (textChildren.length > 0) {
			this.cachedWorldText = textChildren[0].getComponent(WorldTextComponent);
		}
	}

	@subscribe(OnWorldUpdateEvent, { execution: ExecuteOn.Everywhere })
	private onUpdate(payload: OnWorldUpdateEventPayload): void {
		// Billboard is a visual effect — only run on clients
		if (NetworkingService.get().isServerContext()) {
			return;
		}
		if (!this.transform) {
			return;
		}

		const cameraPos = CameraService.get().position;
		this.transform.lookAt(cameraPos, Vec3.up);
	}

	// #region Public API
	/**
	 * Sets the displayed text on the child WorldTextComponent.
	 * Call from client-side code (WorldTextComponent is a local visual).
	 */
	public setText(text: string): void {
		if (this.cachedWorldText) this.cachedWorldText.text = text;
	}

	/**
	 * Sets the text color on the child WorldTextComponent.
	 * Call from client-side code.
	 */
	public setColor(color: Color): void {
		if (this.cachedWorldText) this.cachedWorldText.color = color;
	}

	/**
	 * Sets the font size on the child WorldTextComponent.
	 * Call from client-side code.
	 */
	public setFontSize(size: number): void {
		if (this.cachedWorldText) this.cachedWorldText.fontSize = size;
	}

	/**
	 * Returns whether the Billboard has a valid WorldTextComponent reference.
	 */
	public hasText(): boolean {
		return this.cachedWorldText !== null;
	}
	// #endregion
}
