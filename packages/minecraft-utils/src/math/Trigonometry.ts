import { Vector2, Vector3 } from "@minecraft/server";

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
