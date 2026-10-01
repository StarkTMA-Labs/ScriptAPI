/**
 * @file SpatialTracker.ts
 * @description Grid-bucketed spatial index for `EntityWrapper` instances, attachable to any `EntityManager`.
 */

import { Vector2, Vector3 } from "@minecraft/server";
import { Trigonometry } from "../math";
import { EntityWrapper, EntityEvents } from "./EntityWrapper";
import type { EntityManager } from "./EntityManager";

export interface SpatialDistanceEntry<T> {
	entity: T;
	distance: number;
}

export interface SpatialRange {
	min?: number;
	max?: number;
}

/** Packs two cell coords into one int32 (16 bits each). Wrapping only merges far-apart cells; queries still filter by distance. */
function packGridKey(gridX: number, gridZ: number): number {
	return ((gridX & 0xffff) << 16) | (gridZ & 0xffff);
}

export class SpatialTracker<T extends EntityWrapper> {
	private readonly spatialGrid = new Map<number, Set<T>>();
	private readonly itemKeys = new WeakMap<T, number>();

	private readonly shift: number;
	public readonly gridSize: number;

	/** @param gridSize Cell size in blocks, rounded to a power of two. */
	constructor(gridSize: number = 64) {
		this.shift = Math.round(Math.log2(gridSize));
		this.gridSize = 1 << this.shift;
	}

	private getGridKey(x: number, z: number): number {
		return packGridKey(Math.floor(x) >> this.shift, Math.floor(z) >> this.shift);
	}

	attachTo(
		manager: EntityManager<T>,
		eventGroupId: string = "spatial_tracker",
	): void {
		const { event } = manager.registerEvents(eventGroupId);
		event.on(EntityEvents.PreTick, () => {
			for (const item of manager.getAllEntities()) {
				if (item.entity.isValid) this.track(item);
			}
		});
		event.on(EntityEvents.EntityRemoved, (item: T) => {
			this.untrack(item);
		});
	}

	track(item: T): void {
		const newKey = this.getGridKey(item.location.x, item.location.z);
		const currentKey = this.itemKeys.get(item);
		if (currentKey === newKey) return;

		if (currentKey !== undefined) {
			const oldBucket = this.spatialGrid.get(currentKey);
			if (oldBucket) {
				oldBucket.delete(item);
				if (oldBucket.size === 0) this.spatialGrid.delete(currentKey);
			}
		}

		let bucket = this.spatialGrid.get(newKey);
		if (!bucket) {
			bucket = new Set<T>();
			this.spatialGrid.set(newKey, bucket);
		}
		bucket.add(item);
		this.itemKeys.set(item, newKey);
	}

	untrack(item: T): void {
		const currentKey = this.itemKeys.get(item);
		if (currentKey === undefined) return;

		const bucket = this.spatialGrid.get(currentKey);
		if (bucket) {
			bucket.delete(item);
			if (bucket.size === 0) this.spatialGrid.delete(currentKey);
		}
		this.itemKeys.delete(item);
	}

	getEntitiesAtLocation(location: Vector3, range: number): SpatialDistanceEntry<T>[] {
		const results: SpatialDistanceEntry<T>[] = [];
		const shift = this.shift;
		const minX = Math.floor(location.x - range) >> shift;
		const maxX = Math.floor(location.x + range) >> shift;
		const minZ = Math.floor(location.z - range) >> shift;
		const maxZ = Math.floor(location.z + range) >> shift;
		const rangeSq = range * range;

		for (let x = minX; x <= maxX; x++) {
			for (let z = minZ; z <= maxZ; z++) {
				const bucket = this.spatialGrid.get(packGridKey(x, z));
				if (!bucket) continue;

				for (const item of bucket) {
					if (!item.entity.isValid) continue;

					const dx = item.location.x - location.x;
					const dy = item.location.y - location.y;
					const dz = item.location.z - location.z;
					const distSq = dx * dx + dy * dy + dz * dz;

					if (distSq <= rangeSq) {
						results.push({ entity: item, distance: Math.sqrt(distSq) });
					}
				}
			}
		}
		return results;
	}

	hasEntitiesAtLocation(location: Vector3, range: number): boolean {
		const shift = this.shift;
		const minX = Math.floor(location.x - range) >> shift;
		const maxX = Math.floor(location.x + range) >> shift;
		const minZ = Math.floor(location.z - range) >> shift;
		const maxZ = Math.floor(location.z + range) >> shift;
		const rangeSq = range * range;

		for (let x = minX; x <= maxX; x++) {
			for (let z = minZ; z <= maxZ; z++) {
				const bucket = this.spatialGrid.get(packGridKey(x, z));
				if (!bucket || bucket.size === 0) continue;

				for (const item of bucket) {
					if (!item.entity.isValid) continue;

					const dx = item.location.x - location.x;
					const dy = item.location.y - location.y;
					const dz = item.location.z - location.z;
					const distSq = dx * dx + dy * dy + dz * dz;

					if (distSq <= rangeSq) {
						return true;
					}
				}
			}
		}
		return false;
	}

	getEntitiesInFOV(
		rotation: Vector2 | number,
		location: Vector3,
		fov: number,
		range: SpatialRange = { min: 50, max: 256 },
	): SpatialDistanceEntry<T>[] {
		const results: SpatialDistanceEntry<T>[] = [];
		const minRange = range.min ?? 0;
		const maxRange = range.max ?? 256;
		const halfFOV = Trigonometry.radians(fov / 2);
		const minDot = Math.cos(halfFOV);

		const rotVec: Vector2 =
			typeof rotation === "number" ? { x: 0, y: rotation } : rotation;
		const sourceForward = Trigonometry.fromAngle(rotVec);

		for (const { entity, distance } of this.getEntitiesAtLocation(
			location,
			maxRange,
		)) {
			if (distance < minRange || distance > maxRange) continue;

			const invDist = 1 / distance;
			const dirX = (entity.location.x - location.x) * invDist;
			const dirY = (entity.location.y - location.y) * invDist;
			const dirZ = (entity.location.z - location.z) * invDist;
			const dot =
				sourceForward.x * dirX +
				sourceForward.y * dirY +
				sourceForward.z * dirZ;

			if (dot >= minDot) {
				results.push({ entity, distance });
			}
		}

		return results.sort((a, b) => a.distance - b.distance);
	}
}
