import { Vector2, Vector3 } from "@minecraft/server";
import { Trigonometry } from "../math";

/**
 * Snaps an angle to the nearest grid size.
 *
 * @param angle - The angle in degrees to be snapped.
 * @returns The snapped unsigned angle in degrees.
 */
export function snapYawToGrid(angle: number): number {
	const gridSize = 90;
	// Round to nearest grid step, then normalize into [0, 360)
	const snapped = Math.round(Trigonometry.unsignedAngle(angle) / gridSize) * gridSize;
	return ((snapped % 360) + 360) % 360;
}

/**
 * Snaps a vector to the nearest integer coordinates.
 *
 * @param v - The vector to be snapped.
 * @returns A new vector with each component rounded to the nearest integer.
 */
export function snapLocationToGrid(
	location: Vector3,
	yaw: Vector2,
	gridSize: number = 1,
): Vector3 {
	const snappedYaw = snapYawToGrid(yaw.y);

	return {
		x: Math.floor(location.x / gridSize) * gridSize,
		y: Math.floor(location.y / gridSize) * gridSize,
		z: Math.floor(location.z / gridSize) * gridSize,
	};
}
