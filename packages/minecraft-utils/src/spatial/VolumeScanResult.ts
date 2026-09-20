import { Vector3 } from "@minecraft/server";
import { AStarPathfinder, PathfindingGrid } from "./Pathfinder";

interface ChunkEntry {
	chunkX: number;
	chunkY: number;
	chunkZ: number;
	/**
	 * Bitmask holding 4,096 voxels (16x16x16) as 1 bit per voxel.
	 * 4096 / 32 = 128 unsigned 32-bit integers = 512 bytes per chunk.
	 */
	bits: Uint32Array;
}

/**
 * Sparse 3D occupancy grid grouped into 16x16x16 chunks.
 * Uses 1-bit-per-voxel bitmasks: each chunk takes only 512 bytes (64x less RAM than Float64Array).
 */
export class VolumeScanResult implements PathfindingGrid {
	private static readonly CHUNK_SIZE = 16;
	private static readonly CHUNK_MASK = 0xf;
	private static readonly CHUNK_SHIFT = 4;
	private static readonly BITMASK_WORDS = 128; // 4096 / 32

	// Fast 64-bit integer hash map to avoid string key allocations
	private readonly chunkMap = new Map<bigint, ChunkEntry>();

	// Direct array of active chunks for O(1) random selection
	private readonly chunkList: ChunkEntry[] = [];

	// 1-element MRU spatial locality cache
	private lastKey: bigint = -1n;
	private lastChunk: ChunkEntry | undefined = undefined;

	constructor(public readonly resolution: number = 1) {}

	/**
	 * Converts world coordinate to discrete grid coordinate.
	 */
	private toGridCoordinate(worldCoord: number): number {
		return Math.floor(worldCoord / this.resolution);
	}

	/**
	 * Packs 3D chunk coordinates into a unique 64-bit integer key.
	 * Supports coordinates between -1,000,000 and +1,000,000.
	 */
	private static toChunkKey(chunkX: number, chunkY: number, chunkZ: number): bigint {
		const uX = BigInt((chunkX + 1000000) & 0x1fffff);
		const uY = BigInt((chunkY + 1000000) & 0x1fffff);
		const uZ = BigInt((chunkZ + 1000000) & 0x1fffff);
		return (uX << 42n) | (uY << 21n) | uZ;
	}

	/**
	 * Computes the 1D voxel index inside a 16x16x16 chunk: (localZ * 256) + (localY * 16) + localX.
	 */
	private static toVoxelIndex(
		localX: number,
		localY: number,
		localZ: number,
	): number {
		return (localZ << 8) | (localY << 4) | localX;
	}

	/**
	 * Retrieves an existing chunk or creates a new one lazily.
	 */
	private getOrCreateChunk(
		chunkX: number,
		chunkY: number,
		chunkZ: number,
	): ChunkEntry {
		const key = VolumeScanResult.toChunkKey(chunkX, chunkY, chunkZ);

		if (this.lastKey === key && this.lastChunk !== undefined) {
			return this.lastChunk;
		}

		let entry = this.chunkMap.get(key);
		if (!entry) {
			const bits = new Uint32Array(VolumeScanResult.BITMASK_WORDS);
			entry = { chunkX, chunkY, chunkZ, bits };
			this.chunkMap.set(key, entry);
			this.chunkList.push(entry);
		}

		this.lastKey = key;
		this.lastChunk = entry;
		return entry;
	}

	/**
	 * Retrieves a chunk if it exists (returns undefined without allocating).
	 */
	private getChunk(
		chunkX: number,
		chunkY: number,
		chunkZ: number,
	): ChunkEntry | undefined {
		const key = VolumeScanResult.toChunkKey(chunkX, chunkY, chunkZ);

		if (this.lastKey === key && this.lastChunk !== undefined) {
			return this.lastChunk;
		}

		const entry = this.chunkMap.get(key);
		if (entry) {
			this.lastKey = key;
			this.lastChunk = entry;
		}
		return entry;
	}

	/**
	 * Marks the voxel at the given world coordinate as occupied.
	 */
	public set(
		worldX: number,
		worldY: number,
		worldZ: number,
		metadata: number = 1,
	): void {
		const gridX = this.toGridCoordinate(worldX);
		const gridY = this.toGridCoordinate(worldY);
		const gridZ = this.toGridCoordinate(worldZ);

		const chunkX = gridX >> VolumeScanResult.CHUNK_SHIFT;
		const chunkY = gridY >> VolumeScanResult.CHUNK_SHIFT;
		const chunkZ = gridZ >> VolumeScanResult.CHUNK_SHIFT;

		const chunk = this.getOrCreateChunk(chunkX, chunkY, chunkZ);

		const localX = gridX & VolumeScanResult.CHUNK_MASK;
		const localY = gridY & VolumeScanResult.CHUNK_MASK;
		const localZ = gridZ & VolumeScanResult.CHUNK_MASK;
		const voxelIndex = VolumeScanResult.toVoxelIndex(localX, localY, localZ);

		// Bitmask set: word = voxelIndex / 32 (>> 5), bit = voxelIndex % 32 (& 31)
		chunk.bits[voxelIndex >> 5] |= 1 << (voxelIndex & 31);
	}

	/**
	 * Reads voxel occupancy: returns 1 if occupied, undefined otherwise.
	 */
	public get(worldX: number, worldY: number, worldZ: number): number | undefined {
		const gridX = this.toGridCoordinate(worldX);
		const gridY = this.toGridCoordinate(worldY);
		const gridZ = this.toGridCoordinate(worldZ);

		const chunkX = gridX >> VolumeScanResult.CHUNK_SHIFT;
		const chunkY = gridY >> VolumeScanResult.CHUNK_SHIFT;
		const chunkZ = gridZ >> VolumeScanResult.CHUNK_SHIFT;

		const chunk = this.getChunk(chunkX, chunkY, chunkZ);
		if (!chunk) return undefined;

		const localX = gridX & VolumeScanResult.CHUNK_MASK;
		const localY = gridY & VolumeScanResult.CHUNK_MASK;
		const localZ = gridZ & VolumeScanResult.CHUNK_MASK;
		const voxelIndex = VolumeScanResult.toVoxelIndex(localX, localY, localZ);

		// Bitmask test: check if the bit is 1
		const isOccupied =
			(chunk.bits[voxelIndex >> 5] & (1 << (voxelIndex & 31))) !== 0;
		return isOccupied ? 1 : undefined;
	}

	/**
	 * Fast presence check: returns true if the coordinate is occupied.
	 */
	public has(worldX: number, worldY: number, worldZ: number): boolean {
		const gridX = this.toGridCoordinate(worldX);
		const gridY = this.toGridCoordinate(worldY);
		const gridZ = this.toGridCoordinate(worldZ);

		const chunkX = gridX >> VolumeScanResult.CHUNK_SHIFT;
		const chunkY = gridY >> VolumeScanResult.CHUNK_SHIFT;
		const chunkZ = gridZ >> VolumeScanResult.CHUNK_SHIFT;

		const chunk = this.getChunk(chunkX, chunkY, chunkZ);
		if (!chunk) return false;

		const localX = gridX & VolumeScanResult.CHUNK_MASK;
		const localY = gridY & VolumeScanResult.CHUNK_MASK;
		const localZ = gridZ & VolumeScanResult.CHUNK_MASK;
		const voxelIndex = VolumeScanResult.toVoxelIndex(localX, localY, localZ);

		return (chunk.bits[voxelIndex >> 5] & (1 << (voxelIndex & 31))) !== 0;
	}

	/**
	 * Clears all stored chunk data.
	 */
	public clear(): void {
		this.chunkMap.clear();
		this.chunkList.length = 0;
		this.lastKey = -1n;
		this.lastChunk = undefined;
	}

	/**
	 * Picks a random occupied position with optional radius and predicate filter.
	 */
	public getRandomPosition(
		center?: Vector3,
		minRadius?: number,
		maxRadius?: number,
		filter?: (pos: Vector3, meta: number) => boolean,
	): Vector3 | undefined {
		const totalChunks = this.chunkList.length;
		if (totalChunks === 0) return undefined;

		const maxRadiusSq = maxRadius ? maxRadius * maxRadius : Infinity;
		const minRadiusSq = minRadius ? minRadius * minRadius : 0;
		const halfResolutionOffset = Math.floor(this.resolution / 2);

		for (let attempt = 0; attempt < 50; attempt++) {
			const randomChunkIndex = (Math.random() * totalChunks) | 0;
			const chunk = this.chunkList[randomChunkIndex];
			const baseWorldX = chunk.chunkX << VolumeScanResult.CHUNK_SHIFT;
			const baseWorldY = chunk.chunkY << VolumeScanResult.CHUNK_SHIFT;
			const baseWorldZ = chunk.chunkZ << VolumeScanResult.CHUNK_SHIFT;

			for (let sample = 0; sample < 10; sample++) {
				const localX = (Math.random() * VolumeScanResult.CHUNK_SIZE) | 0;
				const localY = (Math.random() * VolumeScanResult.CHUNK_SIZE) | 0;
				const localZ = (Math.random() * VolumeScanResult.CHUNK_SIZE) | 0;

				const voxelIndex = VolumeScanResult.toVoxelIndex(
					localX,
					localY,
					localZ,
				);
				const isOccupied =
					(chunk.bits[voxelIndex >> 5] & (1 << (voxelIndex & 31))) !== 0;

				if (isOccupied) {
					const voxelGridX = baseWorldX + localX;
					const voxelGridY = baseWorldY + localY;
					const voxelGridZ = baseWorldZ + localZ;

					const worldX = voxelGridX * this.resolution + halfResolutionOffset;
					const worldY = voxelGridY * this.resolution;
					const worldZ = voxelGridZ * this.resolution + halfResolutionOffset;

					if (center) {
						const deltaX = worldX - center.x;
						const deltaY = worldY - center.y;
						const deltaZ = worldZ - center.z;
						const distanceSq =
							deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
						if (distanceSq > maxRadiusSq || distanceSq < minRadiusSq) {
							continue;
						}
					}

					const sampledPosition: Vector3 = {
						x: worldX,
						y: worldY,
						z: worldZ,
					};
					if (filter && !filter(sampledPosition, 1)) {
						continue;
					}

					return sampledPosition;
				}
			}
		}

		return undefined;
	}

	/**
	 * Finds a 3D path through the scanned volume using A*.
	 */
	public findPath(
		start: Vector3,
		goal: Vector3,
		maxNodes: number = 1500,
		simplify: boolean = true,
	): Vector3[] | undefined {
		return AStarPathfinder.findPath(this, start, goal, maxNodes, simplify);
	}
}
