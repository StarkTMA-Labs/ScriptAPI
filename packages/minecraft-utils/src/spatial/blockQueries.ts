import { Block, Dimension, Entity, Vector3 } from "@minecraft/server";
import { Vector } from "../math";

export function getBlocksInASphere(
	centerBlock: Block | Entity,
	radius: number,
	innerRadius?: number,
) {
	if (centerBlock) {
		if (centerBlock instanceof Block && !centerBlock.isValid) return [];
		let center = centerBlock.location;
		let blocks: Block[] = [];
		for (let x = center.x - radius; x < center.x + radius; x++) {
			for (let y = center.y - radius; y < center.y + radius; y++) {
				for (let z = center.z - radius; z < center.z + radius; z++) {
					try {
						let block = centerBlock.dimension.getBlock({
							x: x,
							y: y,
							z: z,
						});
						if (
							block &&
							block.isValid &&
							!block.isAir &&
							!block.permutation.matches("minecraft:bedrock") &&
							!block.permutation.matches("minecraft:barrier")
						) {
							const distance = Vector.magnitude(
								Vector.subtract(center, block.location),
							);
							if (
								distance <= radius &&
								(!innerRadius || distance >= innerRadius)
							) {
								blocks.push(block);
							}
						}
					} catch (e) {}
				}
			}
		}
		return blocks;
	}
	return [];
}

export function getBlocksInRadius(
	dimension: Dimension,
	location: Vector3,
	radius: number,
) {
	if (!dimension.isChunkLoaded(location)) return [];
	let blocks: Block[] = [];
	for (let x = location.x - radius; x < location.x + radius; x++) {
		for (let y = location.y - radius; y < location.y + radius; y++) {
			for (let z = location.z - radius; z < location.z + radius; z++) {
				try {
					let block = dimension.getBlock({ x: x, y: y, z: z });
					if (block && block.isValid && !block.isAir) {
						blocks.push(block);
					}
				} catch (e) {}
			}
		}
	}
	return blocks;
}
