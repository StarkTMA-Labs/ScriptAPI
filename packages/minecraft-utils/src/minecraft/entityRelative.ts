import { Entity, Player, Vector3 } from "@minecraft/server";
import { Trigonometry } from "../math";

export function getRelativeMovementDirection(player: Player, round: boolean): Vector3 {
	const playerYaw = Trigonometry.radians(player.getRotation().y);
	const { sin, cos } = { sin: Math.sin(playerYaw), cos: Math.cos(playerYaw) };

	const playerMovement = player.inputInfo.getMovementVector();

	const dx = -sin * playerMovement.y + cos * playerMovement.x;
	const dz = cos * playerMovement.y + sin * playerMovement.x;

	if (round) {
		return { x: Math.round(dx), y: 0, z: Math.round(dz) };
	}
	return { x: dx, y: 0, z: dz };
}

export function getPositionRelative(
	entity: Entity,
	offset: Vector3,
	ignorePitch?: boolean,
): Vector3 {
	const rotation = entity.getRotation();
	const yaw = Trigonometry.radians(rotation.y);
	const pitch = ignorePitch ? 0 : Trigonometry.radians(rotation.x);

	// Apply 3D rotation: pitch around X-axis, then yaw around Y-axis
	const cosPitch = Math.cos(pitch);
	const sinPitch = Math.sin(pitch);
	const cosYaw = Math.cos(yaw);
	const sinYaw = Math.sin(yaw);

	// Rotate offset vector by pitch and yaw
	const x =
		entity.location.x +
		offset.x * cosPitch * cosYaw -
		offset.y * sinPitch * cosYaw -
		offset.z * sinYaw;
	const y = entity.location.y - offset.z * sinPitch + offset.y * cosPitch;
	const z =
		entity.location.z +
		offset.x * cosPitch * sinYaw -
		offset.y * sinPitch * sinYaw +
		offset.z * cosYaw;

	return { x, y, z };
}
