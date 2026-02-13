/**
 * Level calculation using logarithmic formula.
 * Level = floor(log10(totalEXP + 1) * 10)
 *
 * Examples:
 * - 0 EXP = Level 0
 * - 1-8 EXP = Level 0-9
 * - 9 EXP = Level 9
 * - 10-99 EXP = Level 10-19
 * - 100 EXP = Level 20 (attestation bonus)
 * - 1000 EXP = Level 30
 * - 10000 EXP = Level 40
 */

/**
 * Calculate level from total EXP using logarithmic formula.
 * @param totalEXP - The total experience points
 * @returns The calculated level (minimum 0)
 */
export function calculateLevel(totalEXP: number): number {
  if (totalEXP < 0) return 0;
  return Math.floor(Math.log10(totalEXP + 1) * 10);
}

/**
 * Calculate minimum EXP needed to reach a specific level (inverse calculation).
 * @param level - The target level
 * @returns The minimum EXP required for that level
 */
export function getExpForLevel(level: number): number {
  if (level <= 0) return 0;
  // Inverse of: level = floor(log10(exp + 1) * 10)
  // level / 10 = log10(exp + 1)
  // 10^(level/10) = exp + 1
  // exp = 10^(level/10) - 1
  return Math.ceil(Math.pow(10, level / 10) - 1);
}

/**
 * Rate limit tier based on level.
 */
export type LevelTier = 'LEVEL_0_5' | 'LEVEL_6_15' | 'LEVEL_16_30' | 'LEVEL_31';

/**
 * Get rate limit tier based on level.
 * @param level - The current level
 * @returns The rate limit tier identifier
 */
export function getLevelTier(level: number): LevelTier {
  if (level <= 5) return 'LEVEL_0_5';
  if (level <= 15) return 'LEVEL_6_15';
  if (level <= 30) return 'LEVEL_16_30';
  return 'LEVEL_31';
}

/**
 * EXP thresholds for rate limit tiers.
 * These represent the minimum EXP needed to enter each tier.
 */
export const LEVEL_THRESHOLDS = {
  LEVEL_0_5: 0, // 0 EXP
  LEVEL_6_15: 4, // ~4 EXP to reach level 6
  LEVEL_16_30: 40, // ~40 EXP to reach level 16
  LEVEL_31: 1259, // ~1259 EXP to reach level 31
} as const;

/**
 * Get progress within current level (0.0 to 1.0).
 * @param totalEXP - The total experience points
 * @returns Progress percentage towards next level
 */
export function getLevelProgress(totalEXP: number): number {
  if (totalEXP < 0) return 0;

  const currentLevel = calculateLevel(totalEXP);
  const currentLevelExp = getExpForLevel(currentLevel);
  const nextLevelExp = getExpForLevel(currentLevel + 1);

  if (nextLevelExp <= currentLevelExp) return 1;

  return (totalEXP - currentLevelExp) / (nextLevelExp - currentLevelExp);
}
