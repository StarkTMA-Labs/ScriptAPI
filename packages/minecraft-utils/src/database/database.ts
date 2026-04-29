import { Entity, system, world, World } from "@minecraft/server";
import { SimpleObject } from "./interfaces";
import { getNamespace } from "../constants";

/**
 * DatabaseManager is a class that manages databases stored in Minecraft's world properties.
 * Currently only supports JSON databases.
 */
class DatabaseManager {
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

	/**
	 * Checks if a JSON database with the given name exists.
	 * @param databaseName The name of the database.
	 * @returns True if the database exists, false otherwise.
	 */
	hasJSONDatabase(databaseName: string) {
		return this.target.getDynamicProperty(databaseName) !== undefined;
	}

	/**
	 * Adds a new JSON database with the given name and data.
	 * @param databaseName The name of the database.
	 * @param database The data to be stored in the database.
	 */
	addJSONDatabase(databaseName: string, database: object) {
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
	}

	/**
	 * Removes a JSON database with the given name.
	 * @param databaseName The name of the database.
	 */
	removeJSONDatabase(databaseName: string) {
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
	}

	/**
	 * Retrieves a JSON database with the given name.
	 * @param databaseName The name of the database.
	 * @returns The data stored in the database.
	 * @throws An error if the database does not exist.
	 */
	getJSONDatabase(databaseName: string) {
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

/**
 * SimpleDatabase is a base class for databases that store custom objects with an id property.
 * It provides methods for adding, updating, removing and retrieving objects from the database.
 * A singleton pattern is used to ensure that only one instance of the database exists.
 *
 * @example
 * class MyDatabase extends SimpleDatabase<PlayerObject> {
 * 	protected static instance: MyDatabase;
 * 	constructor() {
 * 		super("myDatabase", undefined);
 * 	}
 *
 * 	static getInstance(): MyDatabase {
 * 		if (!MyDatabase.instance) {
 * 			MyDatabase.instance = new MyDatabase();
 * 		}
 * 		return MyDatabase.instance;
 * 	}
 */
class SimpleDatabase<T extends SimpleObject> {
	private mainDB: DatabaseManager;
	private localDB: T[];

	private pendingChanges = 0;

	protected SAVE_INTERVAL = 20 * 5;
	protected SAVE_THRESHOLD = 20;

	protected databaseName: string;

	/**
	 * The constructor initializes the local database and syncs it with the main database.
	 * @param databaseName The name of the database.
	 * @param target The target entity to store the database in. If undefined, the database is stored in the world.
	 */
	protected constructor(
		databaseName: string,
		target?: Entity | undefined,
		saveThreshold?: number,
		saveInterval?: number,
	) {
		this.databaseName = `${getNamespace()}:${databaseName}`;
		this.mainDB = new DatabaseManager(target);

		if (saveThreshold !== undefined) {
			this.SAVE_THRESHOLD = saveThreshold;
		}
		if (saveInterval !== undefined) {
			this.SAVE_INTERVAL = saveInterval;
		}

		if (this.mainDB.hasJSONDatabase(this.databaseName)) {
			this.localDB = this.getMainDB();
		} else {
			this.localDB = [];
			this.save();
		}

		system.runInterval(() => {
			if (this.pendingChanges > this.SAVE_THRESHOLD) {
				this.save();
			}
		}, this.SAVE_INTERVAL);

		system.beforeEvents.shutdown.subscribe(() => {
			system.run(() => this.save());
		});
	}

	/**
	 * Immediately saves the local database to the main database.
	 */
	private save() {
		this.pendingChanges = 0;
		this.mainDB.addJSONDatabase(this.databaseName, this.localDB);
	}

	/**
	 * Retrieves the main database.
	 * @private
	 * @returns The main database.
	 */
	private getMainDB() {
		return this.mainDB.getJSONDatabase(this.databaseName);
	}

	forceSave() {
		this.save();
	}

	/**
	 * Adds an object to the local database and updates the main database.
	 * @param object The object to be added.
	 */
	addObject(object: T): void {
		this.localDB.push(object);
		this.pendingChanges++;
	}

	/**
	 * Updates an object in the local database and the main database.
	 * If the object does not exist, it is added.
	 * @param object The object to be updated.
	 */
	updateObject(object: T): void {
		if (this.hasObject(object.id)) {
			this.removeObject(object.id);
		}
		this.addObject(object);
	}

	/**
	 * Checks if an object with the given id exists in the local database.
	 * @param id The id of the object.
	 * @returns True if the object exists, false otherwise.
	 */
	hasObject(id: string): boolean {
		return this.localDB.find((object) => object.id === id) !== undefined;
	}

	/**
	 * Retrieves an object with the given id from the local database.
	 * @param id The id of the object.
	 * @returns The object if it exists, undefined otherwise.
	 */
	getObject(id: string): T | undefined {
		return this.localDB.find((object) => object.id === id);
	}

	/**
	 * Removes an object with the given id from the local database and updates the main database.
	 * @param id The id of the object.
	 */
	removeObject(id: string): void {
		this.localDB = this.localDB.filter((object) => object.id !== id);
		this.pendingChanges++;
	}

	/**
	 * Retrieves all objects from the local database.
	 * @returns An array of all objects in the local database.
	 */
	getAllObjects(): T[] {
		return this.localDB;
	}

	/**
	 * Removes all objects from the local database and updates the main database.
	 */
	eraseAllObjects(): void {
		this.localDB = [];
		this.pendingChanges++;
	}

	/**
	 * Iterates over all objects in the local database.
	 * @param callback The function to be called for each object.
	 */
	forEach(callback: (object: SimpleObject, index: number) => void): void {
		this.localDB.forEach((object, index) => callback(object, index));
	}
}

export { SimpleDatabase, SimpleObject };
