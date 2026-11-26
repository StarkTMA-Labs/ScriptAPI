/**
 * Clamps a value between a minimum and maximum range.
 *
 * @param value - The value to be clamped.
 * @param min - The minimum value of the range.
 * @param max - The maximum value of the range.
 * @returns The clamped value, which will be between `min` and `max`.
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * Checks if a value is within a specified range.
 *
 * @param value - The value to check.
 * @param min - The minimum value of the range.
 * @param max - The maximum value of the range.
 * @returns `true` if the value is within the range [min, max], otherwise `false`.
 */
export function inRange(value: number, min: number, max: number): boolean {
	return value >= min && value <= max;
}
