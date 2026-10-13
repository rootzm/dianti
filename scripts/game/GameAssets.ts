import type { Maybe } from "meta/worlds";
import { TextureAsset } from "meta/worlds";

/**
 * GameAssets - Centralized texture asset manager.
 *
 * Component Attachment: N/A (static utility class)
 * Component Networking: N/A
 * Component Ownership: N/A
 *
 * Maintains a map of URL paths to pre-loaded TextureAsset instances.
 * Call GameAssets.init() once at startup, then use GameAssets.get(url) to retrieve assets.
 */
export class GameAssets {
	private static readonly FONT_1: TextureAsset = new TextureAsset("@Assets/UI/bmfont/font_1.png");
	private static readonly FONT_2: TextureAsset = new TextureAsset("@Assets/UI/bmfont/font_2.png");

	// Eye sprite atlas texture
	private static readonly EYE_ATLAS_TEXTURE: TextureAsset = new TextureAsset("@Assets/UI/anim/eye.png");

	// Charge flash sprite atlas textures
	private static readonly CHARGE_FLASH_1_TEXTURE: TextureAsset = new TextureAsset("@Assets/UI/anim/charge_flash_1.png");
	private static readonly CHARGE_FLASH_2_TEXTURE: TextureAsset = new TextureAsset("@Assets/UI/anim/charge_flash_2.png");
	private static readonly CHARGE_FLASH_3_TEXTURE: TextureAsset = new TextureAsset("@Assets/UI/anim/charge_flash_3.png");
	private static readonly CHARGE_FLASH_4_TEXTURE: TextureAsset = new TextureAsset("@Assets/UI/anim/charge_flash_4.png");
	private static readonly CHARGE_FLASH_5_TEXTURE: TextureAsset = new TextureAsset("@Assets/UI/anim/charge_flash_5.png");
	private static readonly CHARGE_FLASH_BALL_TEXTURE: TextureAsset = new TextureAsset("@Assets/UI/anim/charge_flash_ball.png");

	private static assets: Map<string, TextureAsset> = new Map();
	private static initialized: boolean = false;

	/**
	 * Initialize all game texture assets.
	 * Call this once during game startup.
	 */
	public static init(): void {
		if (GameAssets.initialized) {
			return;
		}
		GameAssets.assets.set("Assets/UI/bmfont/font_1.png", GameAssets.FONT_1);
		GameAssets.assets.set("Assets/UI/bmfont/font_2.png", GameAssets.FONT_2);
		GameAssets.assets.set("Assets/UI/anim/charge_flash_1.png", GameAssets.CHARGE_FLASH_1_TEXTURE);
		GameAssets.assets.set("Assets/UI/anim/charge_flash_2.png", GameAssets.CHARGE_FLASH_2_TEXTURE);
		GameAssets.assets.set("Assets/UI/anim/charge_flash_3.png", GameAssets.CHARGE_FLASH_3_TEXTURE);
		GameAssets.assets.set("Assets/UI/anim/charge_flash_4.png", GameAssets.CHARGE_FLASH_4_TEXTURE);
		GameAssets.assets.set("Assets/UI/anim/charge_flash_5.png", GameAssets.CHARGE_FLASH_5_TEXTURE);
		GameAssets.assets.set("Assets/UI/anim/charge_flash_ball.png", GameAssets.CHARGE_FLASH_BALL_TEXTURE);

		GameAssets.initialized = true;
	}

	/**
	 * Get the eye atlas TextureAsset (Assets/UI/anim/eye.png).
	 */
	public static getEyeAtlasTexture(): TextureAsset {
		return GameAssets.EYE_ATLAS_TEXTURE;
	}

	/**
	 * Get the charge_flash_1 atlas TextureAsset (Assets/UI/anim/charge_flash_1.png).
	 */
	public static getChargeFlash1Texture(): TextureAsset {
		return GameAssets.CHARGE_FLASH_1_TEXTURE;
	}

	/**
	 * Get the charge_flash_2 atlas TextureAsset (Assets/UI/anim/charge_flash_2.png).
	 */
	public static getChargeFlash2Texture(): TextureAsset {
		return GameAssets.CHARGE_FLASH_2_TEXTURE;
	}

	/**
	 * Get the charge_flash_3 atlas TextureAsset (Assets/UI/anim/charge_flash_3.png).
	 */
	public static getChargeFlash3Texture(): TextureAsset {
		return GameAssets.CHARGE_FLASH_3_TEXTURE;
	}

	/**
	 * Get the charge_flash_4 atlas TextureAsset (Assets/UI/anim/charge_flash_4.png).
	 */
	public static getChargeFlash4Texture(): TextureAsset {
		return GameAssets.CHARGE_FLASH_4_TEXTURE;
	}

	/**
	 * Get the charge_flash_5 atlas TextureAsset (Assets/UI/anim/charge_flash_5.png).
	 */
	public static getChargeFlash5Texture(): TextureAsset {
		return GameAssets.CHARGE_FLASH_5_TEXTURE;
	}

	/**
	 * Get the charge_flash_ball atlas TextureAsset (Assets/UI/anim/charge_flash_ball.png).
	 */
	public static getChargeFlashBallTexture(): TextureAsset {
		return GameAssets.CHARGE_FLASH_BALL_TEXTURE;
	}

	/**
	 * Get the font_2 TextureAsset (Assets/UI/bmfont/font_2.png).
	 */
	public static getFont2Texture(): TextureAsset {
		return GameAssets.FONT_2;
	}

	/**
	 * Get a TextureAsset by its URL path.
	 * @param url - The project-relative path (e.g. "Assets/UI/bmfont/font_1.png")
	 * @returns The TextureAsset, or null if not registered.
	 */
	public static get(url: string): Maybe<TextureAsset> {
		const asset: Maybe<TextureAsset> = GameAssets.assets.get(url) ?? null;
		return asset;
	}
}
