/**
 * Animation - Sprite sheet frame animation renderer for DrawingSurface.
 *
 * Component Attachment: N/A (utility class, not a component)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Initializes from a TexturePacker JSON atlas + PNG texture.
 * Sprite naming convention: pic_${index}.png (index starts from 1).
 */

import type {
	DrawingCommandsBuilder,
	ImageBrushOptions,
} from "meta/worlds";
import {
	ImageBrush,
	Stretch,
	TextureAsset,
} from "meta/worlds";

/** A single frame's region within the sprite sheet. */
interface FrameRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** TexturePacker JSON frame entry (subset of fields we use). */
interface TexturePackerFrame {
	frame: FrameRect;
}

/** TexturePacker JSON format (hash-based). */
interface TexturePackerData {
	frames: Record<string, TexturePackerFrame>;
}

/**
 * Sequence-frame animation backed by a TexturePacker sprite sheet.
 *
 * Usage:
 *   const anim = new Animation(jsonData, sheetTexture);
 *   anim.setFrame(3);           // jump to frame 3
 *   anim.render(builder, x, y, width, height);
 */
export class Animation {
	private readonly texture: TextureAsset;
	private readonly frames: FrameRect[];
	private currentFrame: number = 0;

	/**
	 * @param json  Parsed TexturePacker JSON object.
	 * @param texture  The corresponding .png loaded as a TextureAsset.
	 */
	constructor(json: TexturePackerData, texture: TextureAsset) {
		this.texture = texture;
		this.frames = [];

		// Infer total frame count by scanning for pic_1.png, pic_2.png, ...
		let index = 1;
		while (true) {
			const key = `pic_${index}.png`;
			const entry = json.frames[key];
			if (!entry) {
				break;
			}
			this.frames.push(entry.frame);
			index++;
		}
	}

	/** Total number of frames in this animation. */
	public get totalFrames(): number {
		return this.frames.length;
	}

	/** Current frame index (0-based internally, but API is 1-based). */
	public get frameIndex(): number {
		return this.currentFrame + 1;
	}

	/**
	 * Set the current frame (1-based index matching sprite naming).
	 * Clamped to [1, totalFrames].
	 */
	public setFrame(oneBasedIndex: number): void {
		if (this.frames.length === 0) {
			return;
		}
		const clamped = Math.max(1, Math.min(oneBasedIndex, this.frames.length));
		this.currentFrame = clamped - 1;
	}

	/**
	 * Advance to the next frame, looping back to 1 after the last frame.
	 */
	public nextFrame(): void {
		if (this.frames.length === 0) {
			return;
		}
		this.currentFrame = (this.currentFrame + 1) % this.frames.length;
	}

	/**
	 * Render the current frame into the given rectangular area,
	 * filling the entire width × height (Stretch.Fill).
	 *
	 * @param builder  The DrawingCommandsBuilder to draw into.
	 * @param x        Left edge of the destination rectangle.
	 * @param y        Top edge of the destination rectangle.
	 * @param width    Width of the destination rectangle.
	 * @param height   Height of the destination rectangle.
	 */
	public render(
		builder: DrawingCommandsBuilder,
		x: number,
		y: number,
		width: number,
		height: number,
	): void {
		if (this.frames.length === 0) {
			return;
		}

		const frame = this.frames[this.currentFrame];

		const options: ImageBrushOptions = {
			sourceRect: {
				x: frame.x,
				y: frame.y,
				width: frame.w,
				height: frame.h,
			},
			stretch: Stretch.Fill,
		};

		const brush = new ImageBrush(this.texture, options);
		builder.drawRect(brush, null, {
			x: x,
			y: y,
			width: width,
			height: height,
		});
	}
}
