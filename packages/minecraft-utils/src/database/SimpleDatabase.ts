import { Entity, system } from "@minecraft/server";
import { getNamespace } from "../constants";
import { DatabaseManager } from "./DatabaseManager";
import { SimpleObject } from "./interfaces";

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
export class SimpleDatabase<T extends SimpleObject> {
	private mainDB: DatabaseManager;
	private localDB: T[];
	private targetEntity?: Entity;

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
		if (target instanceof Entity) {
			this.targetEntity = target;
		}

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
			if (this.targetEntity && !this.targetEntity.isValid) return;
			if (this.pendingChanges >= this.SAVE_THRESHOLD) {
				this.save();
			}
		}, this.SAVE_INTERVAL);

		system.beforeEvents.shutdown.subscribe(() => {
			if (this.targetEntity && !this.targetEntity.isValid) return;
			this.save();
		});
	}

	/**
	 * Immediately saves the local database to the main database.
	 */
	private save() {
		this.pendingChanges = 0;
		if (this.targetEntity && !this.targetEntity.isValid) return;
		try {
			this.mainDB.addJSONDatabase(this.databaseName, this.localDB);
		} catch {}
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
		// Directly manipulate localDB to avoid routing through overridable addObject/removeObject,
		// which would cause subclasses (e.g. ForceSaveDatabase) to emit multiple saves including
		// one intermediate save where the object is removed but not yet re-added.
		this.localDB = this.localDB.filter((o) => o.id !== object.id);
		this.localDB.push(object);
		this.pendingChanges++;
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
