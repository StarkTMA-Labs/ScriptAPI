import { Vector3, StructureRotation } from "@minecraft/server";
import { snapYawToGrid } from "./grid";
import { Trigonometry } from "../math";

class StructuresManager {
	static getRotationEnum(angle: number, offset?: number): StructureRotation {
		const diff = snapYawToGrid(Trigonometry.unsignedAngle(angle - (offset ?? 0)));

		if (Math.abs(diff - 90) < Number.EPSILON) return StructureRotation.Rotate90;
		if (Math.abs(diff - 180) < Number.EPSILON) return StructureRotation.Rotate180;
		if (Math.abs(diff - 270) < Number.EPSILON) return StructureRotation.Rotate270;
		return StructureRotation.None;
	}

	static rotateStructure(
		structureSize: Vector3,
		rotationDegrees: number,
		targetPosition: Vector3,
	): { location: Vector3; rotation: StructureRotation; endLocation: Vector3 } {
		const rotation = this.getRotationEnum(rotationDegrees);

		const normalizedRot = ((Math.round(rotationDegrees) % 360) + 360) % 360;

		let rotatedCenterOffset = { x: 0, y: 0, z: 0 };

		const cx = Math.floor(structureSize.x / 2);
		const cz = Math.floor(structureSize.z / 2);

		switch (normalizedRot) {
			case 0:
				rotatedCenterOffset = {
					x: cx,
					y: 0,
					z: cz,
				};
				break;
			case 90:
				rotatedCenterOffset = {
					x: cz,
					y: 0,
					z: structureSize.x - 1 - cx,
				};
				break;
			case 180:
				rotatedCenterOffset = {
					x: structureSize.x - 1 - cx,
					y: 0,
					z: structureSize.z - 1 - cz,
				};
				break;
			case 270:
				rotatedCenterOffset = {
					x: structureSize.z - 1 - cz,
					y: 0,
					z: cx,
				};
				break;
		}

		const location = {
			x: targetPosition.x - rotatedCenterOffset.x,
			y: targetPosition.y - rotatedCenterOffset.y,
			z: targetPosition.z - rotatedCenterOffset.z,
		};
		const endLocation = {
			x: location.x + structureSize.x,
			y: location.y + structureSize.y,
			z: location.z + structureSize.z,
		};

		return { location, rotation, endLocation };
	}
}

export { StructuresManager };
