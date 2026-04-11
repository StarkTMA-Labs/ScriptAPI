import { Block, Dimension, Vector3, system } from "@minecraft/server";

/**
 * Defines the shape of the scanning area.
 */
export type ScanShape = "cube" | "sphere" | "cylinder";

/**
 * Configuration for the BFS Scan.
 */
export interface ScanConfig {
	/** The starting point of the scan. */
	center: Vector3;
	/** The geometric shape to constrain the scan. */
	shape: ScanShape;
	/**
	 * Dimensions of the scan area.
	 * - For 'cube': x, y, z represent the half-extents (radius) along each axis.
	 * - For 'sphere': x represents the radius.
	 * - For 'cylinder': x represents the radius, y represents the half-height.
	 */
	geometryDimensions: Vector3;
	/**
	 * A function that determines if a block is valid for the scan.
	 * The BFS will only traverse to blocks for which this returns true.
	 */
	blockFilter: (block: Block) => boolean;
	/**
	 * Maximum number of blocks to visit to prevent infinite loops or lag.
	 * Defaults to 10000.
	 */
	maxIterations?: number;
	/**
	 * If true, previously scanned blocks will be re-evaluated and updated.
	 * If false, existing values in the provided ScanResult will be preserved and used to skip expensive checks.
	 * Defaults to false.
	 */
	forceRescan?: boolean;
	/**
	 * Number of iterations to process before yielding to the event loop.
	 * Defaults to 100.
	 */
	yieldInterval?: number;
}

/**
 * Represents the result of a scan, stored as an optimized chunked heightmap.
 * Allows for infinite expansion without reallocation.
 */
export class ScanResult {
	// Chunk size (16x16 cells)
	private static readonly CHUNK_SIZE = 16;
	private static readonly CHUNK_MASK = 0xf;
	private static readonly CHUNK_SHIFT = 4;
	private static readonly SENTINEL = -2147483648;

	// Cell size (8x8 blocks)
	public static readonly CELL_SIZE = 8;
	private static readonly CELL_SHIFT = 3; // 2^3 = 8

	// Map of chunk key "chunkX,chunkZ" -> Int32Array(256)
	private readonly chunks: Map<string, Int32Array> = new Map();

	constructor() {}

	/**
	 * Updates the height at the given coordinates if the new Y is higher.
	 * @param x Absolute X coordinate
	 * @param z Absolute Z coordinate
	 * @param y Absolute Y coordinate
	 */
	public updateHeight(x: number, z: number, y: number): void {
		// Convert world coords to cell coords
		const cellX = x >> ScanResult.CELL_SHIFT;
		const cellZ = z >> ScanResult.CELL_SHIFT;

		const chunkX = cellX >> ScanResult.CHUNK_SHIFT;
		const chunkZ = cellZ >> ScanResult.CHUNK_SHIFT;
		const key = `${chunkX},${chunkZ}`;

		let chunk = this.chunks.get(key);
		if (!chunk) {
			chunk = new Int32Array(
				ScanResult.CHUNK_SIZE * ScanResult.CHUNK_SIZE,
			).fill(ScanResult.SENTINEL);
			this.chunks.set(key, chunk);
		}

		const localX = cellX & ScanResult.CHUNK_MASK;
		const localZ = cellZ & ScanResult.CHUNK_MASK;
		const index = (localZ << ScanResult.CHUNK_SHIFT) | localX;

		if (y > chunk[index]) {
			chunk[index] = y;
		}
	}

	/**
	 * Retrieves the highest Y coordinate found at the given X, Z.
	 * @param x Absolute X coordinate
	 * @param z Absolute Z coordinate
	 * @returns The Y coordinate, or undefined if no block was scanned at this location.
	 */
	public getHeight(x: number, z: number): number | undefined {
		const cellX = x >> ScanResult.CELL_SHIFT;
		const cellZ = z >> ScanResult.CELL_SHIFT;

		const chunkX = cellX >> ScanResult.CHUNK_SHIFT;
		const chunkZ = cellZ >> ScanResult.CHUNK_SHIFT;
		const key = `${chunkX},${chunkZ}`;

		const chunk = this.chunks.get(key);
		if (!chunk) return undefined;

		const localX = cellX & ScanResult.CHUNK_MASK;
		const localZ = cellZ & ScanResult.CHUNK_MASK;
		const index = (localZ << ScanResult.CHUNK_SHIFT) | localX;

		const val = chunk[index];
		return val === ScanResult.SENTINEL ? undefined : val;
	}

	/**
	 * Checks if a location has a valid height recorded.
	 */
	public hasHeight(x: number, z: number): boolean {
		return this.getHeight(x, z) !== undefined;
	}

	/**
	 * Clears all scan data.
	 */
	public clear(): void {
		this.chunks.clear();
	}

	/**
	 * Returns a random valid position from the scanned area.
	 * @param center Optional center position to constrain the random pick.
	 * @param minRadius Optional minimum radius from center.
	 * @param maxRadius Optional maximum radius from center.
	 * @param filter Optional filter function to validate the position.
	 * @returns A Vector3 with the position, or undefined if no data exists.
	 */
	public getRandomPosition(
		center?: Vector3,
		minRadius?: number,
		maxRadius?: number,
		filter?: (pos: Vector3) => boolean,
	): Vector3 | undefined {
		if (this.chunks.size === 0) return undefined;

		let keys = Array.from(this.chunks.keys());

		// Optimization: Filter chunks if center/maxRadius provided
		if (center && maxRadius) {
			// Convert center/radius to chunk coords
			// Radius in blocks -> Radius in chunks?
			// Max radius in blocks.
			// Chunk size in blocks = 16 * 8 = 128.
			const chunkSizeInBlocks =
				ScanResult.CHUNK_SIZE * ScanResult.CELL_SIZE;
			const minChunkX =
				(center.x - maxRadius) >>
				(ScanResult.CHUNK_SHIFT + ScanResult.CELL_SHIFT);
			const maxChunkX =
				(center.x + maxRadius) >>
				(ScanResult.CHUNK_SHIFT + ScanResult.CELL_SHIFT);
			const minChunkZ =
				(center.z - maxRadius) >>
				(ScanResult.CHUNK_SHIFT + ScanResult.CELL_SHIFT);
			const maxChunkZ =
				(center.z + maxRadius) >>
				(ScanResult.CHUNK_SHIFT + ScanResult.CELL_SHIFT);

			keys = keys.filter((key) => {
				const [cxStr, czStr] = key.split(",");
				const cx = parseInt(cxStr);
				const cz = parseInt(czStr);
				return (
					cx >= minChunkX &&
					cx <= maxChunkX &&
					cz >= minChunkZ &&
					cz <= maxChunkZ
				);
			});
		}

		if (keys.length === 0) return undefined;

		const tryFind = (enforceMin: boolean) => {
			for (let attempt = 0; attempt < 20; attempt++) {
				const randomKey = keys[Math.floor(Math.random() * keys.length)];
				const chunk = this.chunks.get(randomKey)!;
				const [chunkXStr, chunkZStr] = randomKey.split(",");
				const chunkX = parseInt(chunkXStr);
				const chunkZ = parseInt(chunkZStr);

				for (let i = 0; i < 5; i++) {
					const localX = Math.floor(
						Math.random() * ScanResult.CHUNK_SIZE,
					);
					const localZ = Math.floor(
						Math.random() * ScanResult.CHUNK_SIZE,
					);
					const index = (localZ << ScanResult.CHUNK_SHIFT) | localX;
					const y = chunk[index];

					if (y !== ScanResult.SENTINEL) {
						// Convert back to world coordinates (first coordinate of the cell)
						const cellX =
							(chunkX << ScanResult.CHUNK_SHIFT) + localX;
						const cellZ =
							(chunkZ << ScanResult.CHUNK_SHIFT) + localZ;
						const x = cellX << ScanResult.CELL_SHIFT;
						const z = cellZ << ScanResult.CELL_SHIFT;
						const pos = { x, y, z };

						if (center && maxRadius) {
							const dx = x - center.x;
							const dz = z - center.z;
							const distSq = dx * dx + dz * dz;
							if (distSq > maxRadius * maxRadius) continue;
							if (
								enforceMin &&
								minRadius &&
								distSq < minRadius * minRadius
							)
								continue;
						}

						if (filter && !filter(pos)) continue;

						return pos;
					}
				}
			}
			return undefined;
		};

		// First attempt: Respect minRadius
		let pos = tryFind(true);

		// Second attempt: If failed and minRadius was requested, find the farthest available position
		if (!pos && minRadius && center) {
			// Sort keys by distance from center (descending)
			keys.sort((a, b) => {
				const [axStr, azStr] = a.split(",");
				const [bxStr, bzStr] = b.split(",");
				const ax = parseInt(axStr);
				const az = parseInt(azStr);
				const bx = parseInt(bxStr);
				const bz = parseInt(bzStr);

				0.0; // Approximate distance using chunk coordinates
				const cx =
					center.x >>
					(ScanResult.CHUNK_SHIFT + ScanResult.CELL_SHIFT);
				const cz =
					center.z >>
					(ScanResult.CHUNK_SHIFT + ScanResult.CELL_SHIFT);

				const distA = (ax - cx) ** 2 + (az - cz) ** 2;
				const distB = (bx - cx) ** 2 + (bz - cz) ** 2;

				return distB - distA;
			});

			for (const key of keys) {
				const chunk = this.chunks.get(key)!;
				const [chunkXStr, chunkZStr] = key.split(",");
				const chunkX = parseInt(chunkXStr);
				const chunkZ = parseInt(chunkZStr);

				let maxDistSq = -1;
				let bestPos: Vector3 | undefined;

				for (let i = 0; i < chunk.length; i++) {
					const y = chunk[i];
					if (y !== ScanResult.SENTINEL) {
						const localX = i & ScanResult.CHUNK_MASK;
						const localZ = i >> ScanResult.CHUNK_SHIFT;

						const cellX =
							(chunkX << ScanResult.CHUNK_SHIFT) + localX;
						const cellZ =
							(chunkZ << ScanResult.CHUNK_SHIFT) + localZ;
						const x = cellX << ScanResult.CELL_SHIFT;
						const z = cellZ << ScanResult.CELL_SHIFT;
						const pos = { x, y, z };

						if (filter && !filter(pos)) continue;

						const dx = x - center.x;
						const dz = z - center.z;
						const distSq = dx * dx + dz * dz;

						if (distSq > maxDistSq) {
							maxDistSq = distSq;
							bestPos = pos;
						}
					}
				}

				if (bestPos) {
					pos = bestPos;
					break;
				}
			}
		}

		return pos;
	}
}

/**
 * A highly optimized BFS Scanner using the Singleton pattern.
 */
export class BFSScanner {
	private static instance: BFSScanner;

	// Reusable vector to avoid allocation during getBlock
	private tempPos: Vector3 = { x: 0, y: 0, z: 0 };

	// Directions: North, South, East, West (Scaled by CELL_SIZE)
	private readonly directions = [
		{ x: ScanResult.CELL_SIZE, y: 0, z: 0 },
		{ x: -ScanResult.CELL_SIZE, y: 0, z: 0 },
		{ x: 0, y: 0, z: ScanResult.CELL_SIZE },
		{ x: 0, y: 0, z: -ScanResult.CELL_SIZE },
	];

	// Global storage for scan results per dimension
	private globalScanResults: Map<string, ScanResult> = new Map();

	private constructor() {}

	/**
	 * Gets the singleton instance of the BFSScanner.
	 */
	public static getInstance(): BFSScanner {
		if (!BFSScanner.instance) {
			BFSScanner.instance = new BFSScanner();
		}
		return BFSScanner.instance;
	}

	/**
	 * Retrieves the global scan result for a specific dimension.
	 * @param dimensionId The identifier of the dimension (e.g., "minecraft:overworld").
	 */
	public getScanResult(dimensionId: string): ScanResult {
		if (!this.globalScanResults.has(dimensionId)) {
			this.globalScanResults.set(dimensionId, new ScanResult());
		}
		return this.globalScanResults.get(dimensionId)!;
	}

	/**
	 * Performs the BFS scan asynchronously.
	 * @param dimension The dimension to scan in.
	 * @param config The scan configuration.
	 * @param existingResult Optional existing ScanResult to update/continue from.
	 * @returns A Generator resolving to the updated ScanResult.
	 */
	public *scan(
		dimension: Dimension,
		config: ScanConfig,
		existingResult?: ScanResult,
	): Generator<void, ScanResult, void> {
		const {
			center,
			shape,
			geometryDimensions,
			blockFilter,
			maxIterations = 10000,
			forceRescan = false,
			yieldInterval = 100,
		} = config;
		const result = existingResult || new ScanResult();

		// Optimization: Use Int32Array for queue to save memory compared to standard Array
		// Initial size 1000 * 3 coordinates. Will grow if needed.
		let queueCapacity = 3000;
		let queue = new Int32Array(queueCapacity);
		let qHead = 0;
		let qTail = 0;

		const pushToQueue = (x: number, y: number, z: number) => {
			if (qTail + 3 >= queueCapacity) {
				// Grow queue
				const newCapacity = queueCapacity * 2;
				const newQueue = new Int32Array(newCapacity);
				newQueue.set(queue);
				queue = newQueue;
				queueCapacity = newCapacity;
			}
			queue[qTail++] = x;
			queue[qTail++] = y;
			queue[qTail++] = z;
		};

		// Start at center, aligned to cell grid
		const startX =
			Math.floor(center.x / ScanResult.CELL_SIZE) * ScanResult.CELL_SIZE;
		const startY = Math.floor(center.y);
		const startZ =
			Math.floor(center.z / ScanResult.CELL_SIZE) * ScanResult.CELL_SIZE;

		pushToQueue(startX, startY, startZ);

		// Optimization: Use a Map<number, Set<number>> for visited coordinates
		// Key: (cellX & 0xffff) | ((cellZ & 0xffff) << 16), Value: Set of y coordinates
		const visitedXZ = new Map<number, Set<number>>();

		const markVisited = (x: number, y: number, z: number) => {
			const cellX = x >> 3; // Divide by 8
			const cellZ = z >> 3;
			const key = (cellX & 0xffff) | ((cellZ & 0xffff) << 16);
			let ySet = visitedXZ.get(key);
			if (!ySet) {
				ySet = new Set();
				visitedXZ.set(key, ySet);
			}
			ySet.add(y);
		};

		const isVisited = (x: number, y: number, z: number): boolean => {
			const cellX = x >> 3;
			const cellZ = z >> 3;
			const key = (cellX & 0xffff) | ((cellZ & 0xffff) << 16);
			const ySet = visitedXZ.get(key);
			return ySet ? ySet.has(y) : false;
		};

		markVisited(startX, startY, startZ);

		// Pre-calculate squared radius for distance checks
		const rSq = geometryDimensions.x * geometryDimensions.x;

		let iterations = 0;
		let processedSinceYield = 0;

		while (qHead < qTail) {
			if (iterations++ > maxIterations) break;

			// Yield to event loop periodically
			if (processedSinceYield++ >= yieldInterval) {
				processedSinceYield = 0;
				yield;
			}

			const cx = queue[qHead++];
			const cy = queue[qHead++];
			const cz = queue[qHead++];

			// Check if already scanned
			const alreadyScanned = result.hasHeight(cx, cz);

			let shouldProcessNeighbors = false;

			if (alreadyScanned && !forceRescan) {
				// Optimization: Skip expensive block checks.
				// We assume if it's in the result, it was valid.
				// We MUST process neighbors to reach the edge of the known area.
				shouldProcessNeighbors = true;
			} else {
				// Not scanned or forced rescan: Do the expensive check
				this.tempPos.x = cx;
				this.tempPos.y = cy;
				this.tempPos.z = cz;

				// Geometry Check (Fastest)
				if (
					!this.isWithinShape(
						cx,
						cy,
						cz,
						center,
						shape,
						geometryDimensions,
						rSq,
					)
				) {
					continue;
				}

				let isValid = true;
				// Check 8x8 volume
				try {
					for (let dx = 0; dx < ScanResult.CELL_SIZE; dx++) {
						for (let dz = 0; dz < ScanResult.CELL_SIZE; dz++) {
							this.tempPos.x = cx + dx;
							this.tempPos.z = cz + dz;
							const block = dimension.getBlock(this.tempPos);
							if (!block || !blockFilter(block)) {
								isValid = false;
								break;
							}
						}
						if (!isValid) break;
					}
				} catch (e) {
					isValid = false;
				}

				if (isValid) {
					result.updateHeight(cx, cz, cy);
					shouldProcessNeighbors = true;
				}
			}

			if (shouldProcessNeighbors) {
				for (const dir of this.directions) {
					const nx = cx + dir.x;
					const ny = cy + dir.y;
					const nz = cz + dir.z;

					// Check geometry for neighbors before adding to queue to save iterations
					if (
						!this.isWithinShape(
							nx,
							ny,
							nz,
							center,
							shape,
							geometryDimensions,
							rSq,
						)
					) {
						continue;
					}

					if (isVisited(nx, ny, nz)) continue;

					markVisited(nx, ny, nz);
					pushToQueue(nx, ny, nz);
				}
			}
		}
		// console.warn(`Scan finished. Iterations: ${iterations}, Queue: ${qTail/3}, Result Chunks: ${result['chunks'].size}`);

		return result;
	}

	private getCoordKey(x: number, y: number, z: number): string {
		return `${x},${y},${z}`;
	}

	private isWithinShape(
		x: number,
		y: number,
		z: number,
		center: Vector3,
		shape: ScanShape,
		dims: Vector3,
		rSq: number,
	): boolean {
		const dx = x - center.x;
		const dy = y - center.y;
		const dz = z - center.z;

		switch (shape) {
			case "cube":
				return (
					Math.abs(dx) <= dims.x &&
					Math.abs(dy) <= dims.y &&
					Math.abs(dz) <= dims.z
				);
			case "sphere":
				return dx * dx + dy * dy + dz * dz <= rSq;
			case "cylinder":
				// Cylinder assumed vertical (Y-axis)
				return dx * dx + dz * dz <= rSq && Math.abs(dy) <= dims.y;
			default:
				return false;
		}
	}
}
