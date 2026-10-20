import { Vector3 } from "@minecraft/server";

export interface PathfindingGrid {
	has(worldX: number, worldY: number, worldZ: number): boolean;
	resolution: number;
	/** When true, only the 4 horizontal (X/Z) neighbors are expanded. */
	flat?: boolean;
}

/**
 * Fast binary min-heap priority queue for A* search nodes.
 * O(log N) push and pop, avoiding linear array scans and splice overhead.
 */
class MinBinaryHeap {
	private keys: number[] = [];
	private fScores: number[] = [];
	private size: number = 0;

	public push(key: number, fScore: number): void {
		let index = this.size++;
		this.keys[index] = key;
		this.fScores[index] = fScore;

		// Bubble up
		while (index > 0) {
			const parentIndex = (index - 1) >> 1;
			if (this.fScores[index] < this.fScores[parentIndex]) {
				this.swap(index, parentIndex);
				index = parentIndex;
			} else {
				break;
			}
		}
	}

	public pop(): number | undefined {
		if (this.size === 0) return undefined;

		const minKey = this.keys[0];
		const lastIndex = --this.size;
		this.keys[0] = this.keys[lastIndex];
		this.fScores[0] = this.fScores[lastIndex];

		// Sink down
		let index = 0;
		const half = this.size >> 1;
		while (index < half) {
			const leftChild = (index << 1) + 1;
			const rightChild = leftChild + 1;
			let bestChild = leftChild;

			if (
				rightChild < this.size &&
				this.fScores[rightChild] < this.fScores[leftChild]
			) {
				bestChild = rightChild;
			}

			if (this.fScores[bestChild] < this.fScores[index]) {
				this.swap(index, bestChild);
				index = bestChild;
			} else {
				break;
			}
		}

		return minKey;
	}

	public get length(): number {
		return this.size;
	}

	private swap(i: number, j: number): void {
		const tempKey = this.keys[i];
		this.keys[i] = this.keys[j];
		this.keys[j] = tempKey;

		const tempScore = this.fScores[i];
		this.fScores[i] = this.fScores[j];
		this.fScores[j] = tempScore;
	}
}

/**
 * High-performance 3D A* pathfinder and path simplifier.
 */
export class AStarPathfinder {
	/**
	 * 6 orthogonal 3D search directions (4 horizontal first so `flat` grids can check 0..3).
	 */
	private static readonly DIRECTION_DELTAS = [
		{ dx: 1, dy: 0, dz: 0 },
		{ dx: -1, dy: 0, dz: 0 },
		{ dx: 0, dy: 0, dz: 1 },
		{ dx: 0, dy: 0, dz: -1 },
		{ dx: 0, dy: 1, dz: 0 },
		{ dx: 0, dy: -1, dz: 0 },
	];

	/**
	 * Packs 3D grid coordinates into a 53-bit safe integer key to avoid string or BigInt allocations.
	 * Supports X/Z grid coordinates in [-524288, +524287] and Y grid coordinates in [-4096, +4095].
	 */
	private static toGridKey(gridX: number, gridY: number, gridZ: number): number {
		const uX = (gridX + 524288) & 0xfffff;
		const uZ = (gridZ + 524288) & 0xfffff;
		const uY = (gridY + 4096) & 0x1fff;
		return uX * 0x200000000 + uZ * 0x2000 + uY;
	}

	/**
	 * Unpacks a 53-bit safe integer key back into 3D grid coordinates.
	 */
	private static fromGridKey(key: number): {
		gridX: number;
		gridY: number;
		gridZ: number;
	} {
		const uY = key & 0x1fff;
		const rem = (key - uY) / 0x2000;
		const uZ = rem & 0xfffff;
		const uX = (rem - uZ) / 0x100000;
		return {
			gridX: uX - 524288,
			gridY: uY - 4096,
			gridZ: uZ - 524288,
		};
	}

	/**
	 * Manhattan distance heuristic on 3D grid coordinates.
	 */
	private static getManhattanDistance(
		fromX: number,
		fromY: number,
		fromZ: number,
		toX: number,
		toY: number,
		toZ: number,
	): number {
		return Math.abs(fromX - toX) + Math.abs(fromY - toY) + Math.abs(fromZ - toZ);
	}

	/**
	 * Simplifies a 3D path by removing collinear intermediate waypoints.
	 */
	public static simplifyPath(path: Vector3[]): Vector3[] {
		if (path.length <= 2) return path;

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

	/**
	 * Finds a 3D path between two points within a grid-compatible space using A*.
	 */
	public static findPath(
		grid: PathfindingGrid,
		start: Vector3,
		goal: Vector3,
		maxNodes: number = 1500,
		simplify: boolean = true,
	): Vector3[] | undefined {
		const resolution = grid.resolution;
		const startGridX = Math.floor(start.x / resolution);
		const startGridY = Math.floor(start.y / resolution);
		const startGridZ = Math.floor(start.z / resolution);

		const goalGridX = Math.floor(goal.x / resolution);
		const goalGridY = Math.floor(goal.y / resolution);
		const goalGridZ = Math.floor(goal.z / resolution);

		// Early out: goal must exist in the grid
		if (
			!grid.has(
				goalGridX * resolution,
				goalGridY * resolution,
				goalGridZ * resolution,
			)
		) {
			return undefined;
		}

		// Trivial case: start is already at the goal
		if (
			startGridX === goalGridX &&
			startGridY === goalGridY &&
			startGridZ === goalGridZ
		) {
			return [{ x: goal.x, y: goal.y, z: goal.z }];
		}

		const startKey = this.toGridKey(startGridX, startGridY, startGridZ);
		const goalKey = this.toGridKey(goalGridX, goalGridY, goalGridZ);

		const openHeap = new MinBinaryHeap();
		const gScores = new Map<number, number>();
		const cameFrom = new Map<number, number>();
		const closedSet = new Set<number>();

		gScores.set(startKey, 0);
		const initialH = this.getManhattanDistance(
			startGridX,
			startGridY,
			startGridZ,
			goalGridX,
			goalGridY,
			goalGridZ,
		);
		openHeap.push(startKey, initialH);

		let expandedCount = 0;
		const halfResolutionOffset = Math.floor(resolution / 2);
		const dirCount = grid.flat ? 4 : 6;

		while (openHeap.length > 0) {
			if (expandedCount++ > maxNodes) {
				return undefined;
			}

			const currentKey = openHeap.pop()!;
			if (closedSet.has(currentKey)) {
				continue;
			}
			closedSet.add(currentKey);

			// Goal reached: reconstruct path
			if (currentKey === goalKey) {
				const path: Vector3[] = [];
				let traceKey: number | undefined = goalKey;

				while (traceKey !== undefined) {
					const { gridX, gridY, gridZ } = this.fromGridKey(traceKey);
					path.push({
						x: gridX * resolution + halfResolutionOffset,
						y: gridY * resolution,
						z: gridZ * resolution + halfResolutionOffset,
					});
					traceKey = cameFrom.get(traceKey);
				}

				path.reverse();
				return simplify ? this.simplifyPath(path) : path;
			}

			const {
				gridX: currentX,
				gridY: currentY,
				gridZ: currentZ,
			} = this.fromGridKey(currentKey);
			const currentG = gScores.get(currentKey)!;
			const tentativeG = currentG + 1;

			// Expand adjacent neighbors
			for (let i = 0; i < dirCount; i++) {
				const dir = this.DIRECTION_DELTAS[i];
				const nextX = currentX + dir.dx;
				const nextY = currentY + dir.dy;
				const nextZ = currentZ + dir.dz;
				const neighborKey = this.toGridKey(nextX, nextY, nextZ);

				if (closedSet.has(neighborKey)) continue;

				const existingG = gScores.get(neighborKey);
				if (existingG !== undefined) {
					if (existingG <= tentativeG) continue;
				} else if (
					!grid.has(
						nextX * resolution,
						nextY * resolution,
						nextZ * resolution,
					)
				) {
					closedSet.add(neighborKey);
					continue;
				}

				gScores.set(neighborKey, tentativeG);
				cameFrom.set(neighborKey, currentKey);

				const h = this.getManhattanDistance(
					nextX,
					nextY,
					nextZ,
					goalGridX,
					goalGridY,
					goalGridZ,
				);
				openHeap.push(neighborKey, tentativeG + h);
			}
		}

		return undefined;
	}
}
