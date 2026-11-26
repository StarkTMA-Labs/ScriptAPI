import { Entity, world, World } from "@minecraft/server";

/**
 * DatabaseManager is a class that manages databases stored in Minecraft's world properties.
 * Currently only supports JSON databases.
 */
export class DatabaseManager {
	private static readonly DYNAMIC_PROP_MAX_LENGTH = 32767;
	private static readonly CHUNK_KEY = "__SPLIT__";

	private target: Entity | World;

	constructor(target: Entity | undefined) {
		if (target instanceof Entity) {
			this.target = target;
		} else {
			this.target = world;
		}
	}

	private isTargetValid(): boolean {
		if (this.target instanceof Entity) {
			return this.target.isValid;
		}
		return true;
	}

	/**
	 * Checks if a JSON database with the given name exists.
	 * @param databaseName The name of the database.
	 * @returns True if the database exists, false otherwise.
	 */
	hasJSONDatabase(databaseName: string) {
		if (!this.isTargetValid()) return false;
		try {
			return this.target.getDynamicProperty(databaseName) !== undefined;
		} catch {
			return false;
		}
	}

	/**
	 * Adds a new JSON database with the given name and data.
	 * @param databaseName The name of the database.
	 * @param database The data to be stored in the database.
	 */
	addJSONDatabase(databaseName: string, database: object) {
		if (!this.isTargetValid()) return;
		try {
			const jsonString = JSON.stringify(database);
			const existingProp = this.target.getDynamicProperty(databaseName) as
				| string
				| undefined;
			let existingChunks = 0;

			if (existingProp) {
				try {
					const propObj = JSON.parse(existingProp);
					if (
						propObj &&
						typeof propObj === "object" &&
						DatabaseManager.CHUNK_KEY in propObj
					) {
						existingChunks = propObj[DatabaseManager.CHUNK_KEY];
					}
				} catch {}
			}
			if (
				jsonString.length <= DatabaseManager.DYNAMIC_PROP_MAX_LENGTH ||
				jsonString.length === 0
			) {
				if (existingChunks > 0) {
					for (let i = 0; i < existingChunks; i++) {
						const partName = `${databaseName}_${i}`;
						this.target.setDynamicProperty(partName, undefined);
					}
				}
				this.target.setDynamicProperty(databaseName, jsonString);
			} else {
				const chunkSize = DatabaseManager.DYNAMIC_PROP_MAX_LENGTH;
				const chunkCount = Math.ceil(jsonString.length / chunkSize);
				if (existingChunks > 0) {
					for (let i = 0; i < existingChunks; i++) {
						const oldPartName = `${databaseName}_${i}`;
						this.target.setDynamicProperty(oldPartName, undefined);
					}
				}
				for (let i = 0; i < chunkCount; i++) {
					const start = i * chunkSize;
					const end = start + chunkSize;
					const chunk = jsonString.slice(start, end);
					const partName = `${databaseName}_${i}`;
					this.target.setDynamicProperty(partName, chunk);
				}
				const meta = { [DatabaseManager.CHUNK_KEY]: chunkCount };
				this.target.setDynamicProperty(databaseName, JSON.stringify(meta));
			}
		} catch {}
	}

	/**
	 * Removes a JSON database with the given name.
	 * @param databaseName The name of the database.
	 */
	removeJSONDatabase(databaseName: string) {
		if (!this.isTargetValid()) return;
		try {
			const propString = this.target.getDynamicProperty(databaseName) as
				| string
				| undefined;
			if (propString !== undefined) {
				try {
					const propObj = JSON.parse(propString);
					if (
						propObj &&
						typeof propObj === "object" &&
						DatabaseManager.CHUNK_KEY in propObj
					) {
						const chunkCount = propObj[DatabaseManager.CHUNK_KEY];
						for (let i = 0; i < chunkCount; i++) {
							const partName = `${databaseName}_${i}`;
							this.target.setDynamicProperty(partName, undefined);
						}
					}
				} catch {}
				this.target.setDynamicProperty(databaseName, undefined);
			}
		} catch {}
	}

	/**
	 * Retrieves a JSON database with the given name.
	 * @param databaseName The name of the database.
	 * @returns The data stored in the database.
	 * @throws An error if the database does not exist.
	 */
	getJSONDatabase(databaseName: string) {
		if (!this.isTargetValid()) {
			throw new Error("Target entity is invalid");
		}
		const propString = this.target.getDynamicProperty(databaseName) as
			| string
			| undefined;
		if (propString === undefined) {
			throw new Error("Database does not exist");
		}
		try {
			const propObj = JSON.parse(propString);
			if (
				propObj &&
				typeof propObj === "object" &&
				DatabaseManager.CHUNK_KEY in propObj
			) {
				const chunkCount: number = propObj[DatabaseManager.CHUNK_KEY];
				let combined = "";
				for (let i = 0; i < chunkCount; i++) {
					const partName = `${databaseName}_${i}`;
					const part = this.target.getDynamicProperty(partName) as
						| string
						| undefined;
					if (typeof part === "string") {
						combined += part;
					} else {
						combined += "";
					}
				}
				return JSON.parse(combined);
			} else {
				return JSON.parse(propString);
			}
		} catch {
			throw new Error("Failed to parse database JSON");
		}
	}
}
