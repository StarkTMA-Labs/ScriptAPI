import { BranchDatabase } from "./database";
import { Level } from "./level";
import { levelState } from "./interfaces";
import { getNamespace } from "../constants";

class BranchManager {
	protected branchDatabase: BranchDatabase = BranchDatabase.getInstance();
	protected levels: Map<string, Level> = new Map();

	protected defaultActiveLevel: string | undefined;

	public identifier: string;
	public activeLevel: string | undefined;
	public levelState!: levelState;

	public levelTick!: number;
	public stateTick!: number;

	protected updateBranchState() {
		this.branchDatabase.updateObject({
			id: this.identifier,
			activeLevel: this.activeLevel,
			levelState: this.levelState,
			levelTick: this.levelTick,
			stateTick: this.stateTick,
		});
	}

	public resetBranch() {
		this.activeLevel = this.defaultActiveLevel;
		this.levelState = levelState.INIT_LEVEL;
		this.levelTick = 0;
		this.stateTick = 0;
		this.updateBranchState();
	}

	protected getBranchState() {
		const branchState = this.branchDatabase.getObject(this.identifier);

		if (!branchState) {
			this.resetBranch();
			return;
		}

		this.activeLevel = branchState.activeLevel;
		this.levelState = branchState.levelState;
		this.levelTick = branchState.levelTick;
		this.stateTick = branchState.stateTick;
	}

	constructor(name: string) {
		this.identifier = `${getNamespace()}:${name}`;
		this.getBranchState();
	}
}

export class Branch extends BranchManager {
	constructor(name: string) {
		super(name);
	}

	/**
	 * Get the level object by name
	 * @param levelName - The name of the level
	 * @returns The level object
	 * @example
	 * const level = branch.getLevel("level1");
	 */
	getLevel(levelName: string): Level | undefined {
		const level = this.levels.get(levelName);
		if (level) {
			return level;
		} else {
			console.warn(`Level not found, Error at Branch.getLevel(), ${levelName}`);
		}
	}

	getLevels() {
		return this.levels;
	}

	/**
	 * Get the active level object
	 * @returns The active level object
	 */
	getActiveLevel(): Level | undefined {
		if (this.activeLevel) {
			return this.levels.get(this.activeLevel);
		} else {
			console.warn("Active level is not set");
		}
	}

	jumpToLevel(levelIndex: string) {
		const levelId = this.identifier + "_" + levelIndex;
		const level = this.levels.get(levelId);

		if (level) {
			this.activeLevel = level.identifier;
			this.levelState = levelState.INIT_LEVEL;
			this.levelTick = 0;
			this.stateTick = 0;
			this.updateBranchState();
		} else {
			console.warn("Level not found: " + levelId);
		}
	}

	/**
	 * Add a level to the branch
	 * @param name - The name of the level
	 * @param activate - Whether to activate the level
	 * @returns The level object
	 */
	addLevel(name: string, default_active: boolean = false) {
		const levelId = `${this.identifier}_${name}`;
		const level = new Level(name, this.identifier, this.levels.size);
		this.levels.set(levelId, level);

		if (default_active) {
			this.defaultActiveLevel = levelId;
			this.updateBranchState();
		}
		return level;
	}

	tick() {
		if (this.activeLevel) {
			const level = this.levels.get(this.activeLevel)!;
			level.tick();

			this.getBranchState();
			this.levelTick++;
			this.stateTick++;

			// Progresses to the next level if it exists, the actual level states are handled in the level class
			if (this.levelState == levelState.COMPLETED) {
				const levelIDs = Array.from(this.levels.keys());
				const nextLevelID = levelIDs[levelIDs.indexOf(level.identifier) + 1];
				const nextLevel = this.levels.get(nextLevelID);

				this.activeLevel = nextLevelID ? nextLevelID : undefined;
				this.levelState = nextLevel ? levelState.INIT_LEVEL : levelState.COMPLETED;
				this.levelTick = 0;
				this.stateTick = 0;
			}
			this.updateBranchState();
		}
	}
}
