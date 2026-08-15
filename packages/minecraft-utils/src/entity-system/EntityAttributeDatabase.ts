/**
 * @file EntityAttributeDatabase.ts
 * @description Persistent entity attribute database child class extending SimpleDatabase.
 */

import { Entity } from "@minecraft/server";
import { SimpleDatabase, SimpleObject } from "../database";

export interface AttributeEntry extends SimpleObject {
	id: string;
	value: any;
}

export class EntityAttributeDatabase extends SimpleDatabase<AttributeEntry> {
	constructor(targetEntity: Entity) {
		super("entity_attributes", targetEntity, 1, 20 * 5);
	}

	setAttribute(key: string, value: any): void {
		this.updateObject({ id: key, value });
	}

	getAttribute<T = any>(key: string): T | undefined {
		const entry = this.getObject(key);
		return entry ? (entry.value as T) : undefined;
	}

	hasAttribute(key: string): boolean {
		return this.hasObject(key);
	}

	removeAttribute(key: string): void {
		this.removeObject(key);
	}

	getAllAttributes(): Record<string, any> {
		const result: Record<string, any> = {};
		for (const entry of this.getAllObjects()) {
			result[entry.id] = entry.value;
		}
		return result;
	}
}
