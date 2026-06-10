import { PlayerObject, BranchObject } from "./interfaces";
import { SimpleDatabase } from "../database";

export class BranchDatabase extends SimpleDatabase<BranchObject> {
	protected static instance: BranchDatabase;
	private constructor() {
		super("branchDatabase", undefined, 1, 1);
	}

	static getInstance(): BranchDatabase {
		if (!BranchDatabase.instance) {
			BranchDatabase.instance = new BranchDatabase();
		}
		return BranchDatabase.instance;
	}
}

export class PlayerDatabase extends SimpleDatabase<PlayerObject> {
	protected static instance: PlayerDatabase;
	private constructor() {
		super("playerDatabase", undefined, 1, 1);
	}

	static getInstance(): PlayerDatabase {
		if (!PlayerDatabase.instance) {
			PlayerDatabase.instance = new PlayerDatabase();
		}
		return PlayerDatabase.instance;
	}
}
