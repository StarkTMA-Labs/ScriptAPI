import {
	Entity,
	EntityItemComponent,
	MolangVariableMap,
	RGBA,
	system,
	world,
} from "@minecraft/server";
import { MinecraftItemTypes } from "@minecraft/vanilla-data";
import { SimpleDatabase, SimpleObject } from "../database";
import { hexToRgba } from "../math";

interface EffectObject extends SimpleObject {
	amplifier: number;
	duration: number;
}

interface EffectConfig {
	id: string;
	color: string;
	sounds?: { ambient?: string; start?: string; end?: string };
	particleType?: string;
	excludedTypes?: string[];
	handler?: (entity: Entity, effect: EffectObject) => void;
	onAdd?: (entity: Entity, amplifier: number, duration: number) => void;
	onRemove?: (entity: Entity) => void;
}

interface Effect {
	readonly id: string;
	add(entity: Entity, amplifier: number, duration: number): void;
	remove(entity: Entity): void;
	has(entity: Entity): boolean;
}

interface EffectMessage {
	entity: string;
	effect?: string;
	amplifier?: number;
	duration?: number;
	origin?: string;
	ticks?: number;
	except?: string[];
}

const DEFAULT_EXCLUDED_TYPES = [
	"minecraft:item",
	"minecraft:arrow",
	"minecraft:xp_orb",
];
const EVENT_NAMESPACE = "starkeffects";
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

class EffectDatabase extends SimpleDatabase<EffectObject> {
	constructor(entity: Entity) {
		super("effects", entity, 1, 1);
	}
}

class EffectManager {
	private static instance: EffectManager;
	private configs = new Map<string, EffectConfig>();
	private tracked = new Map<string, Entity>();
	private databases = new Map<string, EffectDatabase>();
	private readonly origin = Math.random().toString(36).slice(2);

	static getInstance(): EffectManager {
		return (EffectManager.instance ??= new EffectManager());
	}

	private constructor() {}

	registerEffect(config: EffectConfig): Effect {
		const id = config.id;
		this.configs.set(id, config);
		return {
			id,
			add: (entity, amplifier, duration) =>
				this.addEffect(entity, id, amplifier, duration),
			remove: (entity) => this.removeEffect(entity, id),
			has: (entity) => this.hasEffect(entity, id),
		};
	}

	addEffect(entity: Entity, id: string, amplifier: number, duration: number): void {
		const config = this.configs.get(id);
		if (!config) {
			this.send("add", { entity: entity.id, effect: id, amplifier, duration });
			return;
		}
		if ((config.excludedTypes ?? DEFAULT_EXCLUDED_TYPES).includes(entity.typeId))
			return;
		config.onAdd?.(entity, amplifier, duration);

		const db = this.database(entity);
		const existing = db.getObject(id);
		const stronger =
			!existing ||
			amplifier > existing.amplifier ||
			(amplifier === existing.amplifier && duration > existing.duration);

		if (stronger) {
			db.updateObject({ id, amplifier, duration });
			db.forceSave();
			if (!existing) this.playSound(entity, config.sounds?.start);
		}
		this.tracked.set(entity.id, entity);
	}

	removeEffect(entity: Entity, id: string): void {
		const config = this.configs.get(id);
		if (!config) {
			this.send("remove", { entity: entity.id, effect: id });
			return;
		}

		const db = this.database(entity);
		const had = db.hasObject(id);
		db.removeObject(id);
		db.forceSave();
		if (had) this.end(entity, config);
		if (db.getAllObjects().length === 0) this.untrack(entity.id);
	}

	removeAllEffects(entity: Entity): void {
		const db = this.database(entity);
		const effects = db.getAllObjects();

		db.eraseAllObjects();
		db.forceSave();
		this.untrack(entity.id);
		for (const effect of effects) this.end(entity, this.configs.get(effect.id));
	}

	extendEffects(entity: Entity, ticks: number, except: string[] = []): void {
		this.extendLocal(entity, ticks, except);
		this.send("extend", { entity: entity.id, origin: this.origin, ticks, except });
	}

	hasEffect(entity: Entity, id: string): boolean {
		return this.database(entity).hasObject(id);
	}

	getEffects(entity: Entity): EffectObject[] {
		return this.database(entity).getAllObjects();
	}

	start(debug = false): void {
		system.afterEvents.scriptEventReceive.subscribe(
			(event) => this.receive(event.id, event.message),
			{
				namespaces: [EVENT_NAMESPACE],
			},
		);

		world.afterEvents.entitySpawn.subscribe(({ entity }) => this.track(entity));
		world.afterEvents.entityLoad.subscribe(({ entity }) => this.track(entity));
		world.afterEvents.playerJoin.subscribe(({ playerId }) =>
			this.track(world.getEntity(playerId)),
		);
		world.afterEvents.worldLoad.subscribe(() =>
			world.getAllPlayers().forEach((player) => this.track(player)),
		);
		world.afterEvents.entityDie.subscribe(({ deadEntity }) =>
			this.untrack(deadEntity.id),
		);
		world.afterEvents.itemCompleteUse.subscribe((event) => {
			if (event.itemStack.typeId === MinecraftItemTypes.MilkBucket)
				this.removeAllEffects(event.source);
		});

		system.runInterval(() => {
			if (debug) this.debug();
			for (const [id, entity] of this.tracked) {
				if (!entity.isValid) {
					this.untrack(id);
					continue;
				}
				this.tick(entity);
			}
		}, 1);
	}

	private tick(entity: Entity): void {
		const db = this.database(entity);
		const effects = db.getAllObjects();

		for (const effect of effects) {
			const config = this.configs.get(effect.id);
			config?.handler?.(entity, effect);

			const current = db.getObject(effect.id);
			if (!current) continue;

			if (system.currentTick % 40 === 0)
				this.playSound(entity, config?.sounds?.ambient, 0.5);
			if (system.currentTick % 20 === 0 && config)
				this.spawnParticle(entity, config);

			if (current.duration > 1) {
				db.updateObject({ ...current, duration: current.duration - 1 });
			} else {
				db.removeObject(effect.id);
				db.forceSave();
				this.end(entity, config);
			}
		}

		if (db.getAllObjects().length === 0) this.untrack(entity.id);
	}

	private database(entity: Entity): EffectDatabase {
		let db = this.databases.get(entity.id);
		if (!db) {
			db = new EffectDatabase(entity);
			this.databases.set(entity.id, db);
		}
		return db;
	}

	private track(entity: Entity | undefined): void {
		if (!entity?.isValid || entity.hasComponent(EntityItemComponent.componentId))
			return;
		if (this.database(entity).getAllObjects().length > 0)
			this.tracked.set(entity.id, entity);
	}

	private untrack(id: string): void {
		this.databases.delete(id);
		this.tracked.delete(id);
	}

	private end(entity: Entity, config: EffectConfig | undefined): void {
		this.playSound(entity, config?.sounds?.end);
		config?.onRemove?.(entity);
	}

	private playSound(
		entity: Entity,
		sound: string | undefined,
		volume?: number,
	): void {
		if (!sound) return;
		try {
			entity.dimension.playSound(
				sound,
				entity.location,
				volume === undefined ? undefined : { volume },
			);
		} catch {}
	}

	private spawnParticle(entity: Entity, config: EffectConfig): void {
		const variables = new MolangVariableMap();
		variables.setColorRGBA("color", hexToRgba(config.color) as RGBA);
		try {
			entity.dimension.spawnParticle(
				config.particleType ?? "minecraft:mobspell_emitter",
				{ ...entity.location, y: entity.location.y + 1 },
				variables,
			);
		} catch {}
	}

	private extendLocal(entity: Entity, ticks: number, except: string[]): void {
		if (!this.tracked.has(entity.id)) return;
		const db = this.database(entity);
		for (const effect of db.getAllObjects()) {
			const duration = effect.duration + ticks;
			if (!except.includes(effect.id) && duration > 0) {
				db.updateObject({ ...effect, duration });
			}
		}
	}

	private send(action: "add" | "remove" | "extend", message: EffectMessage): void {
		system.sendScriptEvent(`${EVENT_NAMESPACE}:${action}`, JSON.stringify(message));
	}

	private receive(eventId: string, raw: string): void {
		let message: EffectMessage;
		try {
			message = JSON.parse(raw);
		} catch {
			return;
		}
		const entity = world.getEntity(message.entity);
		if (!entity?.isValid) return;

		if (eventId === `${EVENT_NAMESPACE}:extend`) {
			if (message.origin !== this.origin) {
				this.extendLocal(entity, message.ticks ?? 0, message.except ?? []);
			}
			return;
		}
		if (!message.effect || !this.configs.has(message.effect)) return;

		if (eventId === `${EVENT_NAMESPACE}:add`) {
			this.addEffect(
				entity,
				message.effect,
				message.amplifier ?? 0,
				message.duration ?? 0,
			);
		} else if (eventId === `${EVENT_NAMESPACE}:remove`) {
			this.removeEffect(entity, message.effect);
		}
	}

	private debug(): void {
		for (const player of world.getAllPlayers()) {
			const effects = this.getEffects(player).sort(
				(a, b) => b.duration - a.duration,
			);
			if (effects.length === 0) {
				player.onScreenDisplay.setActionBar(
					"§8[§7Effects§8] §7No active effects",
				);
				continue;
			}

			const lines = effects.map((effect) => {
				const seconds = Math.ceil(effect.duration / 20);
				const time =
					seconds > 60
						? `§a${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`
						: seconds > 10
							? `§e${seconds}s`
							: `§c${seconds}s`;
				const name = effect.id
					.split("_")
					.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
					.join(" ");
				const amplifier = NUMERALS[effect.amplifier] ?? effect.amplifier + 1;
				return `§6${name}§r §7${amplifier}§r §8(${time}§8)§r`;
			});
			player.onScreenDisplay.setActionBar(
				`§8[§bActive Effects§8]§r\n${lines.join("\n")}`,
			);
		}
	}
}

const effectManager = EffectManager.getInstance();

export { EffectManager, effectManager, EffectObject, EffectConfig, Effect };
