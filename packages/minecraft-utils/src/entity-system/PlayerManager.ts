/**
 * @file PlayerManager.ts
 * @description Specialized manager extending `EntityManager<PlayerWrapper>` for managing player instances.
 */

import { world, Player } from "@minecraft/server";
import { PlayerWrapper } from "./PlayerWrapper";
import { EntityManager } from "./EntityManager";

export abstract class PlayerManager<
	T extends PlayerWrapper = PlayerWrapper,
> extends EntityManager<T> {
	protected constructor(tickInterval?: number) {
		super(tickInterval ?? 1);

		world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
			const existing = this.getEntity(player.id);
			if (initialSpawn || !existing) {
				this.addEntity(player);
			} else {
				existing.reset();
			}
		});

		world.afterEvents.playerLeave.subscribe(({ playerId }) => {
			this.removeEntity(playerId);
		});
	}

	protected override shouldManageEntity(entity: any): boolean {
		return entity instanceof Player;
	}

	protected override onWorldLoad(): void {
		world.getAllPlayers().forEach((player) => this.addEntity(player));
	}

	getAllPlayers(): T[] {
		return this.getAllEntities();
	}

	getPlayer(id: string): T | undefined {
		return this.getEntity(id);
	}

	addPlayer(player: Player): void {
		this.addEntity(player);
	}

	removePlayer(id: string): void {
		this.removeEntity(id);
	}
}
