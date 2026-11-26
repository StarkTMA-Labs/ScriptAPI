import { BranchObject } from "./interfaces";
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
