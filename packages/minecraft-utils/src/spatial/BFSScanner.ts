import { Block, Dimension, Vector3 } from "@minecraft/server";
import { VolumeScanResult } from "./VolumeScanResult";

export interface BFSScanOptions {
	origin: Vector3;
	dimension: Dimension;
	bounds: {
		minX: number;
		maxX: number;
		minY: number;
		maxY: number;
		minZ: number;
		maxZ: number;
	};
	resolution?: number;
	maxSize?: number;
	opsPerYield: number;
	scanResult?: VolumeScanResult;
	forceRescan?: boolean;
	shouldTraverse: (pos: Vector3, block: Block | undefined) => boolean;
	shouldCapture: (pos: Vector3, block: Block | undefined) => boolean;
	constraint?: (pos: Vector3) => number;
	onResult?: (result: BFSScannerResult) => void;
}

export interface BFSScannerResult {
	x: number;
	y: number;
	z: number;
	metadata: any;
}

/**
 * Fast, dynamically expandable 1D integer queue without array-shift overhead.
 */
class IndexQueue {
	private buffer = new Int32Array(8192);
	private read = 0;
	private write = 0;

	public push(index: number): void {
		if (this.write >= this.buffer.length) {
			const expandedBuffer = new Int32Array(this.buffer.length * 2);
			expandedBuffer.set(this.buffer);
			this.buffer = expandedBuffer;
		}
		this.buffer[this.write++] = index;
	}

	public pop(): number {
		return this.buffer[this.read++];
	}

	public get hasItems(): boolean {
		return this.read < this.write;
	}
}

export class BFSScanner {
	private static globalScanResults = new Map<string, VolumeScanResult>();

	public static getGlobalResult(
		dimensionId: string,
		resolution: number = 1,
	): VolumeScanResult {
		let result = this.globalScanResults.get(dimensionId);
		if (!result) {
			result = new VolumeScanResult(resolution);
			this.globalScanResults.set(dimensionId, result);
		}
		return result;
	}

	public static clearGlobalResult(dimensionId: string): void {
		this.globalScanResults.delete(dimensionId);
	}

	/**
	 * Scans a 3D volume using a breadth-first search flood-fill.
	 * Optimized for zero heap allocations in the tight loop.
	 */
	public static *scan(options: BFSScanOptions): Generator<void, void, unknown> {
		// ------------------------------------------------------------------
		// Step 1: Extract options and precalculate grid dimensions & volume
		// ------------------------------------------------------------------
		const {
			origin,
			dimension,
			bounds,
			resolution = 1,
			maxSize = 5000000,
			shouldTraverse,
			shouldCapture,
			constraint,
			opsPerYield,
			onResult,
			scanResult,
			forceRescan = false,
		} = options;

		const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;

		const sizeX = Math.ceil((maxX - minX + 1) / resolution);
		const sizeY = Math.ceil((maxY - minY + 1) / resolution);
		const sizeZ = Math.ceil((maxZ - minZ + 1) / resolution);

		const totalVolume = sizeX * sizeY * sizeZ;
		if (totalVolume > maxSize || totalVolume <= 0) return;
		// ------------------------------------------------------------------
		// Step 2: Precalculate 1D memory strides and neighbor offsets
		// ------------------------------------------------------------------
		const strideX = 1;
		const strideY = sizeX;
		const strideZ = sizeX * sizeY;

		// 6 orthogonal directions in flattened 1D index and 3D coordinate deltas
		const deltaX = [1, -1, 0, 0, 0, 0];
		const deltaY = [0, 0, 1, -1, 0, 0];
		const deltaZ = [0, 0, 0, 0, 1, -1];
		const strideOffsets = [strideX, -strideX, strideY, -strideY, strideZ, -strideZ];

		// ------------------------------------------------------------------
		// Step 3: Allocate flat visited array, queue, and reusable vector
		// ------------------------------------------------------------------
		const visited = new Uint8Array(totalVolume);
		const queue = new IndexQueue();

		// Reusable mutable vector instance to avoid any per-node heap allocation
		const currentWorldPos: Vector3 = { x: 0, y: 0, z: 0 };
		const resultPayload: BFSScannerResult = { x: 0, y: 0, z: 0, metadata: 1 };
		// ------------------------------------------------------------------
		// Step 4: Validate and initialize seed node (fail early if invalid)
		// ------------------------------------------------------------------
		const seedGridX = Math.floor((Math.floor(origin.x) - minX) / resolution);
		const seedGridY = Math.floor((Math.floor(origin.y) - minY) / resolution);
		const seedGridZ = Math.floor((Math.floor(origin.z) - minZ) / resolution);

		const isSeedInBounds =
			seedGridX >= 0 &&
			seedGridX < sizeX &&
			seedGridY >= 0 &&
			seedGridY < sizeY &&
			seedGridZ >= 0 &&
			seedGridZ < sizeZ;

		if (!isSeedInBounds) return;

		currentWorldPos.x = minX + seedGridX * resolution;
		currentWorldPos.y = minY + seedGridY * resolution;
		currentWorldPos.z = minZ + seedGridZ * resolution;

		// Fail early if seed chunk is not loaded or block is invalid
		if (!dimension.isChunkLoaded(currentWorldPos)) return;

		const seedBlock = dimension.getBlock(currentWorldPos);
		if (!seedBlock || !seedBlock.isValid) return;

		let seedMetadata: any = undefined;
		if (constraint) {
			const constraintValue = constraint({
				x: currentWorldPos.x + 0.5,
				y: currentWorldPos.y + 0.5,
				z: currentWorldPos.z + 0.5,
			});
			if (constraintValue === -1) {
				return;
			}
			seedMetadata = constraintValue;
		}

		const seedIndex = seedGridX + seedGridY * strideY + seedGridZ * strideZ;
		visited[seedIndex] = 1;

		if (shouldCapture(currentWorldPos, seedBlock)) {
			const finalMetadata = seedMetadata ?? 1;
			scanResult?.set(
				currentWorldPos.x,
				currentWorldPos.y,
				currentWorldPos.z,
				finalMetadata,
			);
			if (onResult) {
				resultPayload.x = currentWorldPos.x;
				resultPayload.y = currentWorldPos.y;
				resultPayload.z = currentWorldPos.z;
				resultPayload.metadata = finalMetadata;
				onResult(resultPayload);
			}
		}

		if (shouldTraverse(currentWorldPos, seedBlock)) {
			queue.push(seedIndex);
		}

		// ------------------------------------------------------------------
		// Step 5: Execute BFS loop with cooperative yielding
		// ------------------------------------------------------------------
		let operationsCount = 0;

		while (queue.hasItems) {
			// Yield control to Minecraft tick thread if operation threshold is reached
			if (++operationsCount >= opsPerYield) {
				operationsCount = 0;
				yield;
			}

			const currentIndex = queue.pop();

			// Unpack flat 1D index into primitive local coordinates
			const localZ = (currentIndex / strideZ) | 0;
			const sliceRemainder = currentIndex % strideZ;
			const localY = (sliceRemainder / strideY) | 0;
			const localX = sliceRemainder % strideY;

			// --------------------------------------------------------------
			// Step 6: Expand 6 orthogonal neighbors using stride arithmetic
			// --------------------------------------------------------------
			for (let step = 0; step < 6; step++) {
				const nextX = localX + deltaX[step];
				if (nextX < 0 || nextX >= sizeX) continue;

				const nextY = localY + deltaY[step];
				if (nextY < 0 || nextY >= sizeY) continue;

				const nextZ = localZ + deltaZ[step];
				if (nextZ < 0 || nextZ >= sizeZ) continue;

				// Fast stride-based neighbor index lookup
				const neighborIndex = currentIndex + strideOffsets[step];
				if (visited[neighborIndex]) continue;
				visited[neighborIndex] = 1;

				currentWorldPos.x = minX + nextX * resolution;
				currentWorldPos.y = minY + nextY * resolution;
				currentWorldPos.z = minZ + nextZ * resolution;

				// Cache hit check: skip expensive dimension queries if already scanned
				if (
					scanResult?.has(
						currentWorldPos.x,
						currentWorldPos.y,
						currentWorldPos.z,
					) &&
					!forceRescan
				) {
					queue.push(neighborIndex);
					continue;
				}

				// Mathematical boundary/constraint filter
				let neighborMetadata: any = undefined;
				if (constraint) {
					const constraintValue = constraint({
						x: currentWorldPos.x + 0.5,
						y: currentWorldPos.y + 0.5,
						z: currentWorldPos.z + 0.5,
					});
					if (constraintValue === -1) continue;
					neighborMetadata = constraintValue;
				}

				// Minecraft Bedrock world safety checks
				if (!dimension.isChunkLoaded(currentWorldPos)) continue;
				const block = dimension.getBlock(currentWorldPos);
				if (!block || !block.isValid) continue;

				// Capture match callback and result storage
				if (shouldCapture(currentWorldPos, block)) {
					const finalMetadata = neighborMetadata ?? 1;
					scanResult?.set(
						currentWorldPos.x,
						currentWorldPos.y,
						currentWorldPos.z,
						finalMetadata,
					);
					if (onResult) {
						resultPayload.x = currentWorldPos.x;
						resultPayload.y = currentWorldPos.y;
						resultPayload.z = currentWorldPos.z;
						resultPayload.metadata = finalMetadata;
						onResult(resultPayload);
					}
				}

				// Enqueue neighbor if passable
				if (shouldTraverse(currentWorldPos, block)) {
					queue.push(neighborIndex);
				}
			}
		}
	}
}
