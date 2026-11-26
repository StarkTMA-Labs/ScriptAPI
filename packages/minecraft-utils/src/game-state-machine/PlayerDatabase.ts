import { PlayerObject } from "./interfaces";
import { SimpleDatabase } from "../database";

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
