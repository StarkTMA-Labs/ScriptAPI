import {
	system,
	world,
	Player,
	ButtonState,
	EntityEquippableComponent,
	EntityInventoryComponent,
	EquipmentSlot,
	InputButton,
	ItemStack,
} from "@minecraft/server";

type EventCallback<T = CustomPlayer> = (player: T) => void;
type PlayerEventType = CustomPlayerEvents | string;

enum CustomPlayerEvents {
	Tick = "tick",
	JumpStart = "jumpStart",
	JumpHold = "jumpHold",
	JumpEnd = "jumpEnd",
	SneakStart = "sneakStart",
	SneakHold = "sneakHold",
	SneakEnd = "sneakEnd",
}

class EventGroup<T = CustomPlayer> {
	private callbacks = new Map<PlayerEventType, EventCallback<T>[]>();

	constructor() {
		// Initialize with core events
		Object.values(CustomPlayerEvents).forEach((event) => {
			this.callbacks.set(event, []);
		});
	}

	private run(callbacks: EventCallback<T>[], player: T) {
		for (const cb of callbacks) cb(player);
	}

	trigger(type: PlayerEventType, player: T) {
		const callbacks = this.callbacks.get(type);
		if (callbacks) {
			this.run(callbacks, player);
		}
	}

	on(type: PlayerEventType, callback: EventCallback<T>) {
		if (!this.callbacks.has(type)) {
			this.callbacks.set(type, []);
		}
		this.callbacks.get(type)!.push(callback);
	}

	// Simple way to remove listeners
	off(type: PlayerEventType, callback: EventCallback<T>) {
		const callbacks = this.callbacks.get(type);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
	}
}

class CustomPlayer {
	player: Player;
	stateTick = 0;
	JumpTick = 0;
	SneakTick = 0;

	constructor(player: Player) {
		this.player = player;
		this.reset();
	}

	get equippableComponent() {
		return this.player.getComponent(
			EntityEquippableComponent.componentId,
		) as EntityEquippableComponent;
	}

	get inventoryComponent() {
		return this.player.getComponent(
			EntityInventoryComponent.componentId,
		) as EntityInventoryComponent;
	}

	getEquippedItem(): ItemStack | undefined {
		return this.equippableComponent.getEquipment(EquipmentSlot.Mainhand);
	}

	reset() {
		this.stateTick = 0;
		this.JumpTick = 0;
		this.player.camera.clear();
	}

	tick() {
		this.stateTick++;

		if (
			this.player.inputInfo.getButtonState(InputButton.Jump) ===
			ButtonState.Pressed
		) {
			this.JumpTick++;
		} else if (this.JumpTick > 0) {
			this.JumpTick = -1;
		} else {
			this.JumpTick = 0;
		}

		if (
			this.player.inputInfo.getButtonState(InputButton.Sneak) ===
			ButtonState.Pressed
		) {
			this.SneakTick++;
		} else if (this.SneakTick > 0) {
			this.SneakTick = -1;
		} else {
			this.SneakTick = 0;
		}
	}
}

abstract class PlayerManager<T extends CustomPlayer = CustomPlayer> {
	private players = new Map<string, T>();
	private events = new Map<string, EventGroup<T>>();

	protected constructor(tick?: number) {
		world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
			const id = player.id;
			const existing = this.getPlayer(id);

			if (initialSpawn || !existing) {
				this.addPlayer(player);
			} else {
				existing.reset();
			}
		});

		world.afterEvents.playerLeave.subscribe(({ playerId }) => {
			this.removePlayer(playerId);
		});

		world.afterEvents.worldLoad.subscribe(() => {
			world.getAllPlayers().forEach((player) => this.addPlayer(player));
			system.runInterval(() => {
				this.tick();
			}, tick ?? 1);
		});
	}

	protected abstract createPlayerManager(player: Player): T;

	getAllPlayers(): T[] {
		return Array.from(this.players.values());
	}

	getPlayer(id: string) {
		return this.players.get(id);
	}

	removePlayer(id: string) {
		this.players.delete(id);
	}

	addPlayer(player: Player) {
		if (this.players.has(player.id)) return;
		this.players.set(player.id, this.createPlayerManager(player));
	}

	registerEvents(eventID: string) {
		const eventGroup = new EventGroup<T>();
		this.events.set(eventID, eventGroup);
		return { event: eventGroup };
	}

	getEvents(eventID: string) {
		return this.events.get(eventID);
	}

	tick() {
		const allPlayers = this.getAllPlayers();
		for (const manager of allPlayers) {
			const { player } = manager;

			if (!player.isValid) continue;

			manager.tick();
			this.events.forEach((eventGroup) => {
				eventGroup.trigger(CustomPlayerEvents.Tick, manager);
			});
		}
	}
}

export { CustomPlayerEvents, CustomPlayer, PlayerManager, EventGroup };
