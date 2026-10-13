/**
 * PropConfig - Defines rarity and category enums, plus related configuration
 * constants for the prop system.
 *
 * Component Attachment: N/A (configuration file, no component)
 * Component Networking: N/A
 * Component Ownership: N/A
 */

export enum PropRarity {
	Rarity1 = 0,
	Rarity2 = 1,
	Rarity3 = 2,
	Rarity4 = 3,
	Rarity5 = 4,
}

export enum PropCategory {
	Weapon = 0,
	Armor = 1,
	Consumable = 2,
	Material = 3,
	Quest = 4,
}

/**
 * Calculate the energy value of a prop using the formula:
 * energy = max(1, floor(baseValue × (levelId+1)² / (totalPropCount × 6)))
 *
 * @param baseValue - The prop's raw base value
 * @param levelId - Current level ID from GamePhaseManager (1-based)
 * @param totalPropCount - Total prop count for the level from GamePropManager
 * @returns The calculated energy value (minimum 1), or 0 if baseValue is 0
 */
export function calculatePropEnergy(baseValue: number, levelId: number, totalPropCount: number): number {
	if (baseValue <= 0) {
		return 0;
	}
	const safeTotalPropCount = totalPropCount > 0 ? totalPropCount : 1;
	const levelFactor = Math.pow(levelId, 2);
	const rawEnergy = baseValue * levelFactor / safeTotalPropCount * 6;
	return Math.max(1, Math.floor(rawEnergy));
}

/** Holds all configuration constants for the prop system. */
export class PropConstants {
	/** Display names for each rarity tier */
	public static readonly RARITY_DISPLAY_NAMES: Record<number, string> = {
		[PropRarity.Rarity1]: "Rarity 1",
		[PropRarity.Rarity2]: "Rarity 2",
		[PropRarity.Rarity3]: "Rarity 3",
		[PropRarity.Rarity4]: "Rarity 4",
		[PropRarity.Rarity5]: "Rarity 5",
	};

	/** Display names for each category */
	public static readonly CATEGORY_DISPLAY_NAMES: Record<number, string> = {
		[PropCategory.Weapon]: "Weapon",
		[PropCategory.Armor]: "Armor",
		[PropCategory.Consumable]: "Consumable",
		[PropCategory.Material]: "Material",
		[PropCategory.Quest]: "Quest",
	};

	/** Drop-weight multipliers per rarity (higher = more common) */
	public static readonly RARITY_DROP_WEIGHTS: Record<number, number> = {
		[PropRarity.Rarity1]: 60,
		[PropRarity.Rarity2]: 30,
		[PropRarity.Rarity3]: 10,
		[PropRarity.Rarity4]: 5,
		[PropRarity.Rarity5]: 2,
	};

	/** Maximum stack size per category (0 = not stackable) */
	public static readonly CATEGORY_MAX_STACK: Record<number, number> = {
		[PropCategory.Weapon]: 1,
		[PropCategory.Armor]: 1,
		[PropCategory.Consumable]: 99,
		[PropCategory.Material]: 999,
		[PropCategory.Quest]: 1,
	};
}
