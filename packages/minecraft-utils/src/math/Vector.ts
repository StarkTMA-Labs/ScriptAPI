import { Vector2, Vector3, VectorXZ } from "@minecraft/server";
import { Trigonometry } from "./Trigonometry";

/**
 * A utility class for performing operations on 3D vectors.
 */
export class Vector {
	static apply<T extends Vector3 | Vector2 | VectorXZ>(
		v: T,
		fn: (component: number) => any,
	): T {
		const result: any = { x: fn(v.x) };
		if ("y" in v) result.y = fn(v.y);
		if ("z" in v) result.z = fn(v.z);
		return result as T;
	}

	static add<T extends Vector3 | Vector2 | VectorXZ>(v1: T, ...vectors: T[]): T {
		const result = Vector.copy(v1);
		for (const v of vectors) {
			result.x += v.x;
			if ("y" in result && "y" in v) {
				result.y += v.y;
			}
			if ("z" in result && "z" in v) {
				result.z += v.z;
			}
		}
		return result;
	}

	static subtract<T extends Vector3 | Vector2 | VectorXZ>(v1: T, ...vectors: T[]): T {
		const result = Vector.copy(v1);
		for (const v of vectors) {
			result.x -= v.x;
			if ("y" in result && "y" in v) {
				result.y -= v.y;
			}
			if ("z" in result && "z" in v) {
				result.z -= v.z;
			}
		}
		return result;
	}

	static scalarDivide<T extends Vector3 | Vector2 | VectorXZ>(
		v: T,
		scalar: number,
	): T {
		return Vector.apply(v, (component) => component / scalar);
	}

	static scalarMultiply<T extends Vector3 | Vector2 | VectorXZ>(
		v: T,
		scalar: number,
	): T {
		return Vector.apply(v, (component) => component * scalar);
	}

	static dot<T extends Vector3 | Vector2 | VectorXZ>(v1: T, v2: T): number {
		let result = v1.x * v2.x;
		if ("y" in v1 && "y" in v2) result += v1.y * v2.y;
		if ("z" in v1 && "z" in v2) result += v1.z * v2.z;
		return result;
	}

	static magnitude(v: Vector3 | Vector2 | VectorXZ): number {
		let sumOfSquares = v.x * v.x;
		if ("y" in v) sumOfSquares += v.y * v.y;
		if ("z" in v) sumOfSquares += v.z * v.z;
		return Math.sqrt(sumOfSquares);
	}

	static normalize<T extends Vector3 | Vector2 | VectorXZ>(v: T): T {
		const mag = Vector.magnitude(v);
		if (mag === 0) return v;
		return Vector.scalarDivide(v, mag);
	}

	static distance<T extends Vector3 | Vector2 | VectorXZ>(v1: T, v2: T): number {
		const diff = Vector.subtract(v1, v2);
		return Vector.magnitude(diff);
	}

	static stringify<T extends Vector3 | Vector2 | VectorXZ>(v: T): string {
		let result = `${v.x}`;
		if ("y" in v) result += ` ${v.y}`;
		if ("z" in v) result += ` ${v.z}`;
		return result;
	}

	static rotateVector(vector: Vector3, rotationDegrees: number): Vector3 {
		const rad = Trigonometry.radians(rotationDegrees);
		const sin = Math.sin(rad);
		const cos = Math.cos(rad);
		return {
			x: vector.x * cos + vector.z * sin,
			y: vector.y,
			z: vector.x * sin + vector.z * cos,
		};
	}

	static new(x: number, y: number): Vector2;
	static new(x: number, y: number, z: number): Vector3;
	static new(x: number, y: number, z?: number) {
		if (z === undefined) {
			return { x, y } as Vector2;
		} else {
			return { x, y, z } as Vector3;
		}
	}

	static copy<T>(vector: T): T {
		return { ...vector };
	}
}
