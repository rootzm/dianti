/**
 * BMFont - Bitmap Font rendering using DrawingCommandsBuilder API.
 *
 * Parses BMFont .fnt format (text or JSON) glyph data and renders text
 * by drawing sub-regions of the font atlas texture using ImageBrush with sourceRect.
 *
 * Usage:
 * 1. Create a BMFont instance with your atlas TextureAsset and glyph data.
 * 2. Call drawText() with a DrawingCommandsBuilder to render text.
 *
 * This module is NOT a @component — it is a utility class consumed by
 * game renderers that already own a DrawingCommandsBuilder.
 */

import {
	Color,
	CoordinateType,
	DrawingCommandsBuilder,
	ImageBrush,
	Stretch,
	TextureAsset,
} from "meta/worlds";

// #region BMFont Data Types
/** Describes a single glyph (character) in the BMFont atlas. */
export interface BMFontGlyph {
	/** Character code (Unicode code point). */
	readonly id: number;
	/** X position of glyph in the atlas texture (pixels). */
	readonly x: number;
	/** Y position of glyph in the atlas texture (pixels). */
	readonly y: number;
	/** Width of the glyph region in the atlas (pixels). */
	readonly width: number;
	/** Height of the glyph region in the atlas (pixels). */
	readonly height: number;
	/** Horizontal offset when rendering the glyph (pixels). */
	readonly xoffset: number;
	/** Vertical offset when rendering the glyph (pixels). */
	readonly yoffset: number;
	/** How far to advance the cursor after this glyph (pixels). */
	readonly xadvance: number;
	/** Page index (for multi-page atlases). */
	readonly page: number;
}

/** Kerning pair information. */
export interface BMFontKerning {
	/** First character code. */
	readonly first: number;
	/** Second character code. */
	readonly second: number;
	/** Horizontal adjustment in pixels. */
	readonly amount: number;
}

/** Font-level metrics from the BMFont "common" block. */
export interface BMFontCommon {
	/** Line height (distance between baselines) in pixels. */
	readonly lineHeight: number;
	/** Distance from top of line to the baseline in pixels. */
	readonly base: number;
	/** Width of the atlas texture in pixels. */
	readonly scaleW: number;
	/** Height of the atlas texture in pixels. */
	readonly scaleH: number;
	/** Number of texture pages. */
	readonly pages: number;
}

/** Complete BMFont data structure. */
export interface BMFontData {
	readonly common: BMFontCommon;
	readonly glyphs: ReadonlyArray<BMFontGlyph>;
	readonly kernings?: ReadonlyArray<BMFontKerning>;
}
// #endregion

export enum BMTextAlign {
	Left = 0,
	Center = 1,
	Right = 2,
}

// #region Options
export interface BMFontDrawOptions {
	/** Scale factor applied to glyphs (default: 1.0). Overridden by fontSize if provided. */
	readonly scale?: number;
	/**
	 * Desired font size in pixels. When provided, scale is computed as
	 * fontSize / lineHeight, overriding the scale parameter.
	 */
	readonly fontSize?: number;
	/** Tint color applied to glyphs (default: white / no tint). Uses SolidBrush overlay. */
	readonly color?: Color;
	/** Horizontal text alignment within the given bounds width (default: Left). */
	readonly align?: BMTextAlign;
	/** Maximum width in pixels before wrapping. 0 = no wrap (default: 0). */
	readonly maxWidth?: number;
	/** Extra spacing between characters in pixels (default: 0). */
	readonly letterSpacing?: number;
	/** Extra spacing between lines in pixels (default: 0). */
	readonly lineSpacing?: number;
	/** Horizontal pixel offset applied to the entire draw origin (default: 0). */
	readonly offsetX?: number;
	/** Vertical pixel offset applied to the entire draw origin (default: 0). */
	readonly offsetY?: number;
}
// #endregion

// #region JSON Parser Input Types
/** Raw character entry from BMFont JSON export. */
export interface BMFontJSONChar {
	readonly id?: number;
	readonly x?: number;
	readonly y?: number;
	readonly width?: number;
	readonly height?: number;
	readonly xoffset?: number;
	readonly yoffset?: number;
	readonly xadvance?: number;
	readonly page?: number;
}

/** Raw kerning entry from BMFont JSON export. */
export interface BMFontJSONKerning {
	readonly first?: number;
	readonly second?: number;
	readonly amount?: number;
}

/** Raw common block from BMFont JSON export. */
export interface BMFontJSONCommon {
	readonly lineHeight?: number;
	readonly base?: number;
	readonly scaleW?: number;
	readonly scaleH?: number;
	readonly pages?: number;
}

/** Top-level structure of a BMFont JSON export. */
export interface BMFontJSONData {
	readonly common?: BMFontJSONCommon;
	readonly chars?: ReadonlyArray<BMFontJSONChar>;
	readonly kernings?: ReadonlyArray<BMFontJSONKerning>;
}
// #endregion

/**
 * BMFont renders bitmap font text onto a DrawingCommandsBuilder canvas.
 *
 * Each glyph is drawn as an ImageBrush with a sourceRect pointing at the
 * correct sub-region of the font atlas texture. This leverages the GPU for
 * efficient texture sampling without creating per-glyph textures.
 */
export class BMFont {
	private readonly atlas: TextureAsset;
	private readonly common: BMFontCommon;
	private readonly glyphMap: Map<number, BMFontGlyph> = new Map();
	private readonly kerningMap: Map<number, number> = new Map();

	/**
	 * @param atlas - The font atlas TextureAsset (sprite sheet containing all glyphs).
	 * @param data - Parsed BMFont data with glyph metrics.
	 */
	public constructor(atlas: TextureAsset, data: BMFontData) {
		this.atlas = atlas;
		this.common = data.common;

		// Index glyphs by character id for O(1) lookup
		for (const glyph of data.glyphs) {
			this.glyphMap.set(glyph.id, glyph);
		}

		// Index kerning pairs: encode pair as (first << 16 | second)
		if (data.kernings) {
			for (const k of data.kernings) {
				const key = (k.first << 16) | k.second;
				this.kerningMap.set(key, k.amount);
			}
		}
	}

	/** Returns the line height of this font (unscaled). */
	public get lineHeight(): number {
		return this.common.lineHeight;
	}

	/** Returns the baseline offset (unscaled). */
	public get base(): number {
		return this.common.base;
	}

	/**
	 * Measures the width of a string in pixels (before scaling).
	 * Does not account for line wrapping.
	 */
	public measureTextWidth(text: string, letterSpacing: number = 0): number {
		let width = 0;
		let prevCharCode = 0;

		for (let i = 0; i < text.length; i++) {
			const charCode = text.charCodeAt(i);
			const glyph = this.glyphMap.get(charCode);
			if (!glyph) {
				prevCharCode = charCode;
				continue;
			}

			// Apply kerning
			if (prevCharCode !== 0) {
				width += this.getKerning(prevCharCode, charCode);
			}

			width += glyph.xadvance + letterSpacing;
			prevCharCode = charCode;
		}

		return width;
	}

	/**
	 * Draws text onto the provided DrawingCommandsBuilder.
	 *
	 * @param builder - The DrawingCommandsBuilder to draw onto.
	 * @param text - The string to render.
	 * @param x - X position of the text origin (pixels).
	 * @param y - Y position of the text origin (pixels).
	 * @param options - Optional rendering parameters (scale, color, align, etc.).
	 */
	public drawText(
		builder: DrawingCommandsBuilder,
		text: string,
		x: number,
		y: number,
		options?: BMFontDrawOptions,
	): void {
		let scale = 1.0;
		if (options?.fontSize != null && this.common.lineHeight > 0) {
			scale = options.fontSize / this.common.lineHeight;
		} else if (options?.scale != null) {
			scale = options.scale;
		}

		let align = BMTextAlign.Left;
		if (options?.align != null) {
			align = options.align;
		}

		let maxWidth = 0;
		if (options?.maxWidth != null) {
			maxWidth = options.maxWidth;
		}

		let letterSpacing = 0;
		if (options?.letterSpacing != null) {
			letterSpacing = options.letterSpacing;
		}

		let lineSpacing = 0;
		if (options?.lineSpacing != null) {
			lineSpacing = options.lineSpacing;
		}

		let offsetX = 0;
		if (options?.offsetX != null) {
			offsetX = options.offsetX;
		}

		let offsetY = 0;
		if (options?.offsetY != null) {
			offsetY = options.offsetY;
		}

		// Apply global offsets to draw origin
		x = x + offsetX;
		y = y + offsetY;

		// Split text into lines (respecting explicit newlines and optional word-wrap)
		const lines = this.splitLines(text, maxWidth, letterSpacing);

		const scaledLineHeight = (this.common.lineHeight + lineSpacing) * scale;

		let cursorY = y;

		for (const line of lines) {
			// Compute horizontal offset based on alignment
			const lineWidth = this.measureTextWidth(line, letterSpacing) * scale;
			let cursorX = x;

			if (align === BMTextAlign.Center && maxWidth > 0) {
				cursorX = x + (maxWidth - lineWidth) / 2;
			} else if (align === BMTextAlign.Right && maxWidth > 0) {
				cursorX = x + (maxWidth - lineWidth);
			}

			// Render each glyph in the line
			this.drawLine(builder, line, cursorX, cursorY, scale, letterSpacing);

			cursorY += scaledLineHeight;
		}
	}

	// #region Private Helpers
	private drawLine(
		builder: DrawingCommandsBuilder,
		line: string,
		startX: number,
		startY: number,
		scale: number,
		letterSpacing: number,
	): void {
		let cursorX = startX;
		let prevCharCode = 0;

		for (let i = 0; i < line.length; i++) {
			const charCode = line.charCodeAt(i);
			const glyph = this.glyphMap.get(charCode);

			if (!glyph) {
				// Skip unknown characters (could substitute a fallback glyph)
				prevCharCode = charCode;
				continue;
			}

			// Apply kerning adjustment
			if (prevCharCode !== 0) {
				cursorX += this.getKerning(prevCharCode, charCode) * scale;
			}

			// Only draw if the glyph has a visible region
			if (glyph.width > 0 && glyph.height > 0) {
				const destX = cursorX + glyph.xoffset * scale;
				const destY = startY + glyph.yoffset * scale;
				const destW = glyph.width * scale;
				const destH = glyph.height * scale;

				// Create an ImageBrush that samples the glyph sub-region from the atlas
				const glyphBrush = new ImageBrush(this.atlas, {
					sourceRect: {
						x: glyph.x,
						y: glyph.y,
						width: glyph.width,
						height: glyph.height,
					},
					stretch: Stretch.Fill,
					coordinateType: CoordinateType.Absolute,
				});

				// Draw the glyph as a filled rectangle with the atlas sub-region
				builder.drawRect(glyphBrush, null, {
					x: destX,
					y: destY,
					width: destW,
					height: destH,
				});
			}

			// Advance cursor
			cursorX += (glyph.xadvance + letterSpacing) * scale;
			prevCharCode = charCode;
		}
	}

	private getKerning(first: number, second: number): number {
		const key = (first << 16) | second;
		return this.kerningMap.get(key) ?? 0;
	}

	/**
	 * Splits text into lines, respecting explicit '\n' characters
	 * and optionally wrapping at maxWidth.
	 */
	private splitLines(text: string, maxWidth: number, letterSpacing: number): string[] {
		// First split by explicit newlines
		const explicitLines = text.split("\n");

		if (maxWidth <= 0) {
			return explicitLines;
		}

		// Word-wrap each line
		const result: string[] = [];

		for (const line of explicitLines) {
			if (this.measureTextWidth(line, letterSpacing) <= maxWidth) {
				result.push(line);
				continue;
			}

			// Word-wrap
			const words = line.split(" ");
			let currentLine = "";

			for (const word of words) {
				let testLine: string;
				if (currentLine.length === 0) {
					testLine = word;
				} else {
					testLine = `${currentLine} ${word}`;
				}
				const testWidth = this.measureTextWidth(testLine, letterSpacing);

				if (testWidth <= maxWidth) {
					currentLine = testLine;
				} else {
					if (currentLine.length > 0) {
						result.push(currentLine);
					}
					currentLine = word;
				}
			}

			if (currentLine.length > 0) {
				result.push(currentLine);
			}
		}

		return result;
	}
	// #endregion

	// #region Static Parser Utilities
	/**
	 * Parses BMFont text format (.fnt) data into a BMFontData structure.
	 *
	 * Expected format (AngelCode BMFont text export):
	 *   common lineHeight=32 base=26 scaleW=256 scaleH=256 pages=1 ...
	 *   char id=65 x=0 y=0 width=20 height=30 xoffset=1 yoffset=2 xadvance=22 page=0 ...
	 *   kerning first=65 second=86 amount=-2
	 */
	public static parseBMFontText(fntContent: string): BMFontData {
		const lines = fntContent.split("\n");

		let common: BMFontCommon = {
			lineHeight: 0,
			base: 0,
			scaleW: 0,
			scaleH: 0,
			pages: 1,
		};

		const glyphs: BMFontGlyph[] = [];
		const kernings: BMFontKerning[] = [];

		for (const rawLine of lines) {
			const line = rawLine.trim();

			if (line.startsWith("common ")) {
				common = {
					lineHeight: BMFont.extractInt(line, "lineHeight"),
					base: BMFont.extractInt(line, "base"),
					scaleW: BMFont.extractInt(line, "scaleW"),
					scaleH: BMFont.extractInt(line, "scaleH"),
					pages: BMFont.extractInt(line, "pages"),
				};
				if (common.pages === 0) {
					common = {
						...common,
						pages: 1,
					};
				}
			} else if (line.startsWith("char ")) {
				glyphs.push({
					id: BMFont.extractInt(line, "id"),
					x: BMFont.extractInt(line, "x"),
					y: BMFont.extractInt(line, "y"),
					width: BMFont.extractInt(line, "width"),
					height: BMFont.extractInt(line, "height"),
					xoffset: BMFont.extractInt(line, "xoffset"),
					yoffset: BMFont.extractInt(line, "yoffset"),
					xadvance: BMFont.extractInt(line, "xadvance"),
					page: BMFont.extractInt(line, "page"),
				});
			} else if (line.startsWith("kerning ")) {
				kernings.push({
					first: BMFont.extractInt(line, "first"),
					second: BMFont.extractInt(line, "second"),
					amount: BMFont.extractInt(line, "amount"),
				});
			}
		}

		return {
			common: common,
			glyphs: glyphs,
			kernings: kernings,
		};
	}

	/** Extracts an integer value from a BMFont text line by key name. */
	private static extractInt(line: string, key: string): number {
		const pattern = `${key}=`;
		const startIdx = line.indexOf(pattern);
		if (startIdx === -1) {
			return 0;
		}
		const valueStart = startIdx + pattern.length;
		let valueEnd = line.indexOf(" ", valueStart);
		if (valueEnd === -1) {
			valueEnd = line.length;
		}
		const parsed = parseInt(line.substring(valueStart, valueEnd), 10);
		if (isNaN(parsed)) {
			return 0;
		}
		return parsed;
	}

	/**
	 * Parses BMFont JSON format data into a BMFontData structure.
	 *
	 * Accepts the common JSON BMFont export format where glyphs are
	 * stored as an array of objects with id, x, y, width, height, etc.
	 */
	public static parseBMFontJSON(json: BMFontJSONData): BMFontData {
		let lineHeight = 0;
		if (json.common?.lineHeight != null) {
			lineHeight = json.common.lineHeight;
		}

		let base = 0;
		if (json.common?.base != null) {
			base = json.common.base;
		}

		let scaleW = 0;
		if (json.common?.scaleW != null) {
			scaleW = json.common.scaleW;
		}

		let scaleH = 0;
		if (json.common?.scaleH != null) {
			scaleH = json.common.scaleH;
		}

		let pages = 1;
		if (json.common?.pages != null) {
			pages = json.common.pages;
		}

		const common: BMFontCommon = {
			lineHeight: lineHeight,
			base: base,
			scaleW: scaleW,
			scaleH: scaleH,
			pages: pages,
		};

		const chars = json.chars ?? [];
		const glyphs: BMFontGlyph[] = chars.map((c: BMFontJSONChar): BMFontGlyph => {
			return {
				id: c.id ?? 0,
				x: c.x ?? 0,
				y: c.y ?? 0,
				width: c.width ?? 0,
				height: c.height ?? 0,
				xoffset: c.xoffset ?? 0,
				yoffset: c.yoffset ?? 0,
				xadvance: c.xadvance ?? 0,
				page: c.page ?? 0,
			};
		});

		const rawKernings = json.kernings ?? [];
		const kernings: BMFontKerning[] = rawKernings.map((k: BMFontJSONKerning): BMFontKerning => {
			return {
				first: k.first ?? 0,
				second: k.second ?? 0,
				amount: k.amount ?? 0,
			};
		});

		return {
			common: common,
			glyphs: glyphs,
			kernings: kernings,
		};
	}
	// #endregion
}
