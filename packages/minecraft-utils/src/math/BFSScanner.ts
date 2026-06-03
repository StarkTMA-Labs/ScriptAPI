import { Dimension, Vector3 } from "@minecraft/server";

export class VolumeScanResult {
	private static readonly CHUNK_SIZE = 16;
	private static readonly CHUNK_MASK = 0xf;
	private static readonly CHUNK_SHIFT = 4;
	private static readonly CHUNK_VOLUME = 4096;

	private readonly chunks = new Map<string, Float64Array>();

	public set(x: number, y: number, z: number, metadata: number = 1): void {
		const cx = Math.floor(x);
		const cy = Math.floor(y);
		const cz = Math.floor(z);

		const chunkX = cx >> VolumeScanResult.CHUNK_SHIFT;
		const chunkY = cy >> VolumeScanResult.CHUNK_SHIFT;
		const chunkZ = cz >> VolumeScanResult.CHUNK_SHIFT;
		const key = `${chunkX},${chunkY},${chunkZ}`;

		let chunk = this.chunks.get(key);
		if (!chunk) {
			chunk = new Float64Array(VolumeScanResult.CHUNK_VOLUME).fill(NaN);
			this.chunks.set(key, chunk);
		}

		const localX = cx & VolumeScanResult.CHUNK_MASK;
		const localY = cy & VolumeScanResult.CHUNK_MASK;
		const localZ = cz & VolumeScanResult.CHUNK_MASK;
		const index =
			(localZ << (VolumeScanResult.CHUNK_SHIFT * 2)) |
			(localY << VolumeScanResult.CHUNK_SHIFT) |
			localX;

		chunk[index] = metadata;
	}

	public get(x: number, y: number, z: number): number | undefined {
		const cx = Math.floor(x);
		const cy = Math.floor(y);
		const cz = Math.floor(z);

		const chunkX = cx >> VolumeScanResult.CHUNK_SHIFT;
		const chunkY = cy >> VolumeScanResult.CHUNK_SHIFT;
		const chunkZ = cz >> VolumeScanResult.CHUNK_SHIFT;
		const key = `${chunkX},${chunkY},${chunkZ}`;

		const chunk = this.chunks.get(key);
		if (!chunk) return undefined;

		const localX = cx & VolumeScanResult.CHUNK_MASK;
		const localY = cy & VolumeScanResult.CHUNK_MASK;
		const localZ = cz & VolumeScanResult.CHUNK_MASK;
		const index =
			(localZ << (VolumeScanResult.CHUNK_SHIFT * 2)) |
			(localY << VolumeScanResult.CHUNK_SHIFT) |
			localX;

		const val = chunk[index];
		return Number.isNaN(val) ? undefined : val;
	}

	public has(x: number, y: number, z: number): boolean {
		return this.get(x, y, z) !== undefined;
	}

	public clear(): void {
		this.chunks.clear();
	}

	public getRandomPosition(
		center?: Vector3,
		minRadius?: number,
		maxRadius?: number,
		filter?: (pos: Vector3, meta: number) => boolean,
	): Vector3 | undefined {
		if (this.chunks.size === 0) return undefined;

		const keys = Array.from(this.chunks.keys());
		const rSqMax = maxRadius ? maxRadius * maxRadius : Infinity;
		const rSqMin = minRadius ? minRadius * minRadius : 0;

		for (let attempt = 0; attempt < 50; attempt++) {
			const randomKey = keys[Math.floor(Math.random() * keys.length)];
			const chunk = this.chunks.get(randomKey)!;
			const [cxStr, cyStr, czStr] = randomKey.split(",");
			const chunkX = parseInt(cxStr);
			const chunkY = parseInt(cyStr);
			const chunkZ = parseInt(czStr);

			for (let i = 0; i < 10; i++) {
				const localX = Math.floor(Math.random() * VolumeScanResult.CHUNK_SIZE);
				const localY = Math.floor(Math.random() * VolumeScanResult.CHUNK_SIZE);
				const localZ = Math.floor(Math.random() * VolumeScanResult.CHUNK_SIZE);

				const index =
					(localZ << (VolumeScanResult.CHUNK_SHIFT * 2)) |
					(localY << VolumeScanResult.CHUNK_SHIFT) |
					localX;
				const meta = chunk[index];

				if (!Number.isNaN(meta)) {
					const x = (chunkX << VolumeScanResult.CHUNK_SHIFT) + localX;
					const y = (chunkY << VolumeScanResult.CHUNK_SHIFT) + localY;
					const z = (chunkZ << VolumeScanResult.CHUNK_SHIFT) + localZ;
					const pos = { x, y, z };

					if (center) {
						const dx = x - center.x;
						const dy = y - center.y;
						const dz = z - center.z;
						const distSq = dx * dx + dy * dy + dz * dz;
						if (distSq > rSqMax || distSq < rSqMin) continue;
					}

					if (filter && !filter(pos, meta)) continue;

					return pos;
				}
			}
		}
		return undefined;
	}

	public findPath(
		start: Vector3,
		goal: Vector3,
		maxNodes: number = 1500,
		simplify: boolean = true,
	): Vector3[] | undefined {
		const startX = Math.floor(start.x);
		const startY = Math.floor(start.y);
		const startZ = Math.floor(start.z);
		const goalX = Math.floor(goal.x);
		const goalY = Math.floor(goal.y);
		const goalZ = Math.floor(goal.z);

		if (!this.has(goalX, goalY, goalZ)) return undefined;

		if (startX === goalX && startY === goalY && startZ === goalZ) {
			return [{ x: goalX, y: goalY, z: goalZ }];
		}

		const toKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
		const startKey = toKey(startX, startY, startZ);
		const goalKey = toKey(goalX, goalY, goalZ);

		const heuristic = (x: number, y: number, z: number) =>
			Math.abs(x - goalX) + Math.abs(y - goalY) + Math.abs(z - goalZ);

		type AStarNode = { x: number; y: number; z: number; f: number; g: number };
		const openSet: AStarNode[] = [];
		const gScore = new Map<string, number>();
		const cameFrom = new Map<string, string>();
		const closed = new Set<string>();

		gScore.set(startKey, 0);
		openSet.push({
			x: startX,
			y: startY,
			z: startZ,
			g: 0,
			f: heuristic(startX, startY, startZ),
		});

		const directions = [
			{ x: 1, y: 0, z: 0 },
			{ x: -1, y: 0, z: 0 },
			{ x: 0, y: 1, z: 0 },
			{ x: 0, y: -1, z: 0 },
			{ x: 0, y: 0, z: 1 },
			{ x: 0, y: 0, z: -1 },
		];

		let nodesExpanded = 0;

		while (openSet.length > 0) {
			if (nodesExpanded++ > maxNodes) return undefined;

			let bestIdx = 0;
			for (let i = 1; i < openSet.length; i++) {
				if (openSet[i].f < openSet[bestIdx].f) bestIdx = i;
			}
			const current = openSet.splice(bestIdx, 1)[0];

			const ck = toKey(current.x, current.y, current.z);
			if (closed.has(ck)) continue;
			closed.add(ck);

			if (ck === goalKey) {
				const path: Vector3[] = [];
				let node = goalKey;
				while (cameFrom.has(node)) {
					const [px, py, pz] = node.split(",").map(Number);
					path.push({ x: px, y: py, z: pz });
					node = cameFrom.get(node)!;
				}
				path.reverse();

				if (path.length <= 2 || !simplify) return path;

				const simplified: Vector3[] = [path[0]];
				for (let i = 1; i < path.length - 1; i++) {
					const prev = simplified[simplified.length - 1];
					const curr = path[i];
					const next = path[i + 1];
					if (
						Math.sign(curr.x - prev.x) !== Math.sign(next.x - curr.x) ||
						Math.sign(curr.y - prev.y) !== Math.sign(next.y - curr.y) ||
						Math.sign(curr.z - prev.z) !== Math.sign(next.z - curr.z)
					) {
						simplified.push(curr);
					}
				}
				simplified.push(path[path.length - 1]);
				return simplified;
			}

			for (const dir of directions) {
				const nx = current.x + dir.x;
				const ny = current.y + dir.y;
				const nz = current.z + dir.z;
				const nk = toKey(nx, ny, nz);

				if (closed.has(nk)) continue;
				if (!this.has(nx, ny, nz)) continue;

				const ng = current.g + 1;
				const existing = gScore.get(nk);
				if (existing !== undefined && existing <= ng) continue;

				gScore.set(nk, ng);
				cameFrom.set(nk, ck);
				openSet.push({
					x: nx,
					y: ny,
					z: nz,
					g: ng,
					f: ng + heuristic(nx, ny, nz),
				});
			}
		}

		return undefined;
	}
}

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
	maxSize?: number;
	shouldTraverse: (pos: Vector3, block: any) => boolean;
	shouldCapture: (pos: Vector3, block: any) => boolean;
	constraint?: (pos: Vector3) => number;
	opsPerYield: number;
	onResult?: (result: BFSScannerResult) => void;
	/**
	 * Stateful memory object. If provided, scanned nodes are persisted here.
	 */
	scanResult?: VolumeScanResult;
	/**
	 * If false, skips processing blocks already recorded in the scanResult.
	 * @default false
	 */
	forceRescan?: boolean;
}

export interface BFSScannerResult {
	x: number;
	y: number;
	z: number;
	metadata: any;
}

export class BFSScanner {
	private static globalScanResults = new Map<string, VolumeScanResult>();

	public static getGlobalResult(dimensionId: string): VolumeScanResult {
		if (!this.globalScanResults.has(dimensionId)) {
			this.globalScanResults.set(dimensionId, new VolumeScanResult());
		}
		return this.globalScanResults.get(dimensionId)!;
	}

	public static clearGlobalResult(dimensionId: string): void {
		this.globalScanResults.delete(dimensionId);
	}

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
			scanResult,
			forceRescan = false,
		} = options;

		const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;

		const sizeX = maxX - minX + 1;
		const sizeY = maxY - minY + 1;
		const sizeZ = maxZ - minZ + 1;

		const totalVolume = sizeX * sizeY * sizeZ;
		if (totalVolume > maxSize || totalVolume <= 0) {
			return;
		}

		const visited = new Uint8Array(totalVolume);

		const getIdx = (x: number, y: number, z: number) => {
			return x - minX + (y - minY) * sizeX + (z - minZ) * sizeX * sizeY;
		};

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

		const strideX = 1;
		const strideY = sizeX;
		const strideZ = sizeX * sizeY;

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

				const alreadyScanned = scanResult?.has(
					worldPos.x,
					worldPos.y,
					worldPos.z,
				);
				if (alreadyScanned && !forceRescan) {
					addToBFSQueue(nIdx);
					continue;
				}

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
					if (scanResult)
						scanResult.set(worldPos.x, worldPos.y, worldPos.z, 0);
					addToBFSQueue(nIdx);
				} else if (shouldCapture(worldPos, block)) {
					const finalMeta = metadata ?? 1;
					if (scanResult)
						scanResult.set(worldPos.x, worldPos.y, worldPos.z, finalMeta);
					if (onResult) {
						onResult({
							x: worldPos.x,
							y: worldPos.y,
							z: worldPos.z,
							metadata: finalMeta,
						});
					}
				}
			}
		}
	}
}
