import { RGB, RGBA, Vector2, Vector3, VectorXZ } from "@minecraft/server";

/**
 * Converts a hex color string to an RGBA object.
 *
 * @param hex - The hex color string, which can be in the formats #RGB, #RGBA, #RRGGBB, or #RRGGBBAA.
 * @returns An object containing the red, green, blue, and alpha components as numbers between 0 and 1.
 * @throws Error if the hex string is invalid.
 */
export function hexToRgba(
	hex: string,
	stripAlpha: boolean = false,
): RGB | RGBA {
	if (
		!/^#([a-fA-F0-9]{4}|[a-fA-F0-9]{8}|[a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(
			hex,
		)
	) {
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
		(normalized.length === 8
			? parseInt(normalized.substring(6, 8), 16)
			: 255) / 255;

	if (stripAlpha) {
		return { red, green, blue };
	}
	return { red, green, blue, alpha };
}

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

/**
 * A utility class for performing operations on 3D vectors.
 */
export class Vector {
	static apply<T extends Vector3 | Vector2 | VectorXZ>(
		v: T,
		fn: (component: number) => any,
	): T {
		const result: any = { x: fn(v.x) };
		if ("y" in v) result.y = fn(v.y);
		if ("z" in v) result.z = fn(v.z);
		return result as T;
	}

	static add<T extends Vector3 | Vector2 | VectorXZ>(
		v1: T,
		...vectors: T[]
	): T {
		const result = Vector.copy(v1);
		for (const v of vectors) {
			result.x += v.x;
			if ("y" in result && "y" in v) {
				result.y += v.y;
			}
			if ("z" in result && "z" in v) {
				result.z += v.z;
			}
		}
		return result;
	}

	static subtract<T extends Vector3 | Vector2 | VectorXZ>(
		v1: T,
		...vectors: T[]
	): T {
		const result = Vector.copy(v1);
		for (const v of vectors) {
			result.x -= v.x;
			if ("y" in result && "y" in v) {
				result.y -= v.y;
			}
			if ("z" in result && "z" in v) {
				result.z -= v.z;
			}
		}
		return result;
	}

	static scalarDivide<T extends Vector3 | Vector2 | VectorXZ>(
		v: T,
		scalar: number,
	): T {
		return Vector.apply(v, (component) => component / scalar);
	}

	static scalarMultiply<T extends Vector3 | Vector2 | VectorXZ>(
		v: T,
		scalar: number,
	): T {
		return Vector.apply(v, (component) => component * scalar);
	}

	static dot<T extends Vector3 | Vector2 | VectorXZ>(v1: T, v2: T): number {
		let result = v1.x * v2.x;
		if ("y" in v1 && "y" in v2) result += v1.y * v2.y;
		if ("z" in v1 && "z" in v2) result += v1.z * v2.z;
		return result;
	}

	static magnitude(v: Vector3 | Vector2 | VectorXZ): number {
		let sumOfSquares = v.x * v.x;
		if ("y" in v) sumOfSquares += v.y * v.y;
		if ("z" in v) sumOfSquares += v.z * v.z;
		return Math.sqrt(sumOfSquares);
	}

	static normalize<T extends Vector3 | Vector2 | VectorXZ>(v: T): T {
		const mag = Vector.magnitude(v);
		if (mag === 0) return v;
		return Vector.scalarDivide(v, mag);
	}

	static distance<T extends Vector3 | Vector2 | VectorXZ>(
		v1: T,
		v2: T,
	): number {
		const diff = Vector.subtract(v1, v2);
		return Vector.magnitude(diff);
	}

	static stringify<T extends Vector3 | Vector2 | VectorXZ>(v: T): string {
		let result = `${v.x}`;
		if ("y" in v) result += ` ${v.y}`;
		if ("z" in v) result += ` ${v.z}`;
		return result;
	}

	static rotateVector(vector: Vector3, rotationDegrees: number): Vector3 {
		const rad = Trigonometry.radians(rotationDegrees);
		const sin = Math.sin(rad);
		const cos = Math.cos(rad);
		return {
			x: vector.x * cos + vector.z * sin,
			y: vector.y,
			z: vector.x * sin + vector.z * cos,
		};
	}

	static new(x: number, y: number): Vector2;
	static new(x: number, y: number, z: number): Vector3;
	static new(x: number, y: number, z?: number) {
		if (z === undefined) {
			return { x, y } as Vector2;
		} else {
			return { x, y, z } as Vector3;
		}
	}

	static copy<T>(vector: T): T {
		return { ...vector };
	}
}

export class Trigonometry {
	/** Creates a unit vector from an angle in degrees.
	 *
	 * @param rotation - The angle in degrees.
	 * @returns A unit vector representing the direction of the angle.
	 */
	static fromAngle(rotation: number): Vector2;
	/** Creates a unit vector from a 2D angle in degrees (pitch and yaw).
	 *
	 * @param rotation - The 2D angle (pitch and yaw) in degrees.
	 * @returns A unit vector representing the direction of the angle.
	 */
	static fromAngle(rotation: Vector2): Vector3;

	static fromAngle(rotation: number | Vector2): Vector2 | Vector3 {
		if (typeof rotation === "number") {
			const rad = Trigonometry.radians(rotation);
			return { x: -Math.sin(rad), y: Math.cos(rad) } as Vector2;
		} else {
			const yawRad = Trigonometry.radians(rotation.y);
			const pitchRad = Trigonometry.radians(rotation.x);
			return {
				x: -Math.sin(yawRad) * Math.cos(pitchRad),
				y: Math.sin(pitchRad),
				z: Math.cos(yawRad) * Math.cos(pitchRad),
			} as Vector3;
		}
	}

	/** Converts an angle in degrees to radians.
	 *
	 * @param degrees - The angle in degrees to be converted.
	 * @returns The angle in radians.
	 */
	static radians(degrees: number): number {
		return degrees * (Math.PI / 180);
	}

	/**
	 * Converts an angle in radians to degrees.
	 *
	 * @param radians - The angle in radians to be converted.
	 * @returns The angle in degrees.
	 */
	static degrees(radians: number): number {
		return radians * (180 / Math.PI);
	}

	/**
	 * Converts an angle in degrees to its signed equivalent in the range [-180, 180].
	 * @param angle - The angle in degrees to be converted.
	 * @returns The signed angle in degrees, normalized to the range [-180, 180].
	 */
	static signedAngle(degrees: number): number {
		const wrapped = ((degrees % 360) + 360) % 360;
		return wrapped > 180 ? wrapped - 360 : wrapped;
	}

	/**
	 * Converts an angle in degrees to its unsigned equivalent in the range [0, 360].
	 *
	 * @param angle - The angle in degrees to be converted.
	 * @returns The unsigned angle in degrees, normalized to the range [0, 360].
	 */
	static unsignedAngle(degrees: number): number {
		return ((degrees % 360) + 360) % 360;
	}

	/** Calculates the shortest arc between two angles in degrees.
	 *
	 * @param from - The starting angle in degrees.
	 * @param to - The target angle in degrees.
	 * @returns The shortest arc from the starting angle to the target angle in degrees.
	 */

	static shortestArc(from: number, to: number): number {
		return -this.signedAngle((to - from + 360) % 360);
	}
}

export * from "./BFSScanner";
export * from "./Perlin2D";
