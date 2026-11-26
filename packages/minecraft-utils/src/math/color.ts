import { RGB, RGBA } from "@minecraft/server";

/**
 * Converts a hex color string to an RGBA object.
 *
 * @param hex - The hex color string, which can be in the formats #RGB, #RGBA, #RRGGBB, or #RRGGBBAA.
 * @returns An object containing the red, green, blue, and alpha components as numbers between 0 and 1.
 * @throws Error if the hex string is invalid.
 */
export function hexToRgba(hex: string, stripAlpha: boolean = false): RGB | RGBA {
	if (!/^#([a-fA-F0-9]{4}|[a-fA-F0-9]{8}|[a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(hex)) {
		throw new Error("Invalid hex color");
	}

	let normalized = hex.slice(1);
	if (normalized.length === 3 || normalized.length === 4) {
		normalized = normalized
			.split("")
			.map((c) => c + c)
			.join("");
	}

	const red = parseInt(normalized.substring(0, 2), 16) / 255;
	const green = parseInt(normalized.substring(2, 4), 16) / 255;
	const blue = parseInt(normalized.substring(4, 6), 16) / 255;
	const alpha =
		(normalized.length === 8 ? parseInt(normalized.substring(6, 8), 16) : 255) /
		255;

	if (stripAlpha) {
		return { red, green, blue };
	}
	return { red, green, blue, alpha };
}
