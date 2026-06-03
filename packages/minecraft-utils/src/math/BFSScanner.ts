import { Dimension, Vector3 } from "@minecraft/server";

export interface BFSScanOptions {
	/**
	 * Starting point of the search
	 */
	origin: Vector3;
	/**
	 * Dimension to search in
	 */
	dimension: Dimension;
	/**
	 * Defined bounds for the search space (AABB) relative to origin or absolute world coordinates.
	 * min/max should be absolute world coordinates.
	 */
	bounds: {
		minX: number;
		maxX: number;
		minY: number;
		maxY: number;
		minZ: number;
		maxZ: number;
	};
	/**
	 * Max total nodes to hold in queue/memory to prevent overflows
	 * @default 5000000
	 */
	maxSize?: number;
	/**
	 * Returns true if the BFS should continue traversing from this node's neighbors.
	 * e.g. "Is this block Air or Water?"
	 */
	shouldTraverse: (pos: Vector3, block: any) => boolean;
	/**
	 * Returns true if this node is considered a "result" or "hit".
	 * e.g. "Is this a solid block?"
	 */
	shouldCapture: (pos: Vector3, block: any) => boolean;
	/**
	 * Optional geometric constraint. If provided, must return >= 0 for valid points.
	 * Can return a 't' value or generic score to be passed to the result.
	 * If returns -1, the point is outside the constraint and ignored.
	 */
	constraint?: (pos: Vector3) => number;
	/**
	 * Operation budget per yield.
	 */
	opsPerYield: number;
	/**
	 * Callback when a valid result node is found.
	 */
	onResult: (result: BFSScannerResult) => void;
}

export interface BFSScannerResult {
	x: number;
	y: number;
	z: number;
	metadata: any;
}

export class BFSScanner {
	public static *scan(options: BFSScanOptions): Generator<void, void, unknown> {
		const {
			origin,
			dimension,
			bounds,
			maxSize = 5000000,
			shouldTraverse,
			shouldCapture,
			constraint,
			opsPerYield,
			onResult,
		} = options;

		const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;

		const sizeX = maxX - minX + 1;
		const sizeY = maxY - minY + 1;
		const sizeZ = maxZ - minZ + 1;

		const totalVolume = sizeX * sizeY * sizeZ;
		if (totalVolume > maxSize || totalVolume <= 0) {
			return;
		}

		// Optimized 3D visited array tracking every single block layer
		const visited = new Uint8Array(totalVolume);

		// 3D Row-Major Indexing: X changes fastest, then Y, then Z
		const getIdx = (x: number, y: number, z: number) => {
			return x - minX + (y - minY) * sizeX + (z - minZ) * sizeX * sizeY;
		};

		// Flat Int32 queue allocation for true 3D indexes
		let currentQueue = new Int32Array(8192);
		let queueRead = 0;
		let queueWrite = 0;

		const addToBFSQueue = (idx: number) => {
			if (queueWrite >= currentQueue.length) {
				const newQ = new Int32Array(currentQueue.length * 2);
				newQ.set(currentQueue);
				currentQueue = newQ;
			}
			currentQueue[queueWrite++] = idx;
		};

		// Seed 3D BFS
		const seedX = Math.floor(origin.x);
		const seedY = Math.floor(origin.y);
		const seedZ = Math.floor(origin.z);

		if (
			seedX >= minX &&
			seedX <= maxX &&
			seedY >= minY &&
			seedY <= maxY &&
			seedZ >= minZ &&
			seedZ <= maxZ
		) {
			const idx = getIdx(seedX, seedY, seedZ);
			visited[idx] = 1;
			addToBFSQueue(idx);
		}

		// Precompute linear offsets for 3D strides
		const strideX = 1;
		const strideY = sizeX;
		const strideZ = sizeX * sizeY;

		// True 6-way volumetric directions
		const directions = [
			{ x: 1, y: 0, z: 0, stride: strideX },
			{ x: -1, y: 0, z: 0, stride: -strideX },
			{ x: 0, y: 1, yDir: 1, z: 0, stride: strideY },
			{ x: 0, y: -1, yDir: -1, z: 0, stride: -strideY },
			{ x: 0, y: 0, z: 1, stride: strideZ },
			{ x: 0, y: 0, z: -1, stride: -strideZ },
		];

		let ops = 0;

		while (queueRead < queueWrite) {
			if (++ops >= opsPerYield) {
				ops = 0;
				yield;
			}

			const currIdx = currentQueue[queueRead++];

			// Volumetric un-packing matching row-major strides
			const lz = (currIdx / strideZ) | 0;
			const rem = currIdx % strideZ;
			const ly = (rem / strideY) | 0;
			const lx = rem % strideY;

			const wx = minX + lx;
			const wy = minY + ly;
			const wz = minZ + lz;

			for (let d = 0; d < 6; d++) {
				const dir = directions[d];

				const nx = lx + dir.x;
				if (nx < 0 || nx >= sizeX) continue;

				const ny = ly + (dir.yDir ?? dir.y);
				if (ny < 0 || ny >= sizeY) continue;

				const nz = lz + dir.z;
				if (nz < 0 || nz >= sizeZ) continue;

				const nIdx = currIdx + dir.stride;
				if (visited[nIdx]) continue;
				visited[nIdx] = 1;

				const worldPos = {
					x: wx + dir.x,
					y: wy + (dir.yDir ?? dir.y),
					z: wz + dir.z,
				};

				// Geometric Cone Constraints Evaluation
				let metadata: any = undefined;
				if (constraint) {
					const t = constraint({
						x: worldPos.x + 0.5,
						y: worldPos.y + 0.5,
						z: worldPos.z + 0.5,
					});
					if (t === -1) continue;
					metadata = t;
				}

				if (!dimension.isChunkLoaded(worldPos)) continue;
				const block = dimension.getBlock(worldPos);
				if (!block || !block.isValid) continue;

				if (shouldTraverse(worldPos, block)) {
					addToBFSQueue(nIdx);
				} else if (shouldCapture(worldPos, block)) {
					onResult({
						x: worldPos.x,
						y: worldPos.y,
						z: worldPos.z,
						metadata,
					});
				}
			}
		}
	}
}
