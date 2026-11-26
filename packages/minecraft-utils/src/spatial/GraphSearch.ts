export interface Visit<T> {
	node: T;
	previous?: Visit<T>;
	depth: number;
}

/** Breadth-first search over any graph, described by how to find a node's neighbours and how to tell nodes apart. */
export class GraphSearch<T> {
	constructor(
		readonly neighboursOf: (node: T) => Iterable<T>,
		readonly keyOf: (node: T) => string,
	) {}

	*breadthFirst(start: T, maxNodes = Infinity): Generator<Visit<T>> {
		const seenKeys = new Set([this.keyOf(start)]);
		const queue: Visit<T>[] = [{ node: start, depth: 0 }];
		for (let i = 0; i < queue.length; i++) {
			const visit = queue[i];
			yield visit;
			for (const node of this.neighboursOf(visit.node)) {
				const key = this.keyOf(node);
				if (seenKeys.has(key) || seenKeys.size >= maxNodes) continue;
				seenKeys.add(key);
				queue.push({ node, previous: visit, depth: visit.depth + 1 });
			}
		}
	}

	/** The visits from the start to this one, in order. */
	static pathTo<T>(visit: Visit<T>): Visit<T>[] {
		const path: Visit<T>[] = [];
		for (let step: Visit<T> | undefined = visit; step; step = step.previous) path.unshift(step);
		return path;
	}
}
