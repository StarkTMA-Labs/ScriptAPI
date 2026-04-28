import {
	CustomComponentParameters,
	Dimension,
	Entity,
	EntityItemComponent,
	ItemComponentConsumeEvent,
	MolangVariableMap,
	Player,
	RGBA,
	StartupEvent,
	system,
	Vector3,
	world,
} from "@minecraft/server";
import { MinecraftItemTypes } from "@minecraft/vanilla-data";
import { getNamespace } from "../constants";
import { SimpleDatabase, SimpleObject } from "../database";

// ============================= Types =========================================

interface EffectObject extends SimpleObject {
	id: string; // effectType
	namespace: string;
	effectType: string;
	amplifier: number;
	duration: number;
	color: RGBA;
}

class EffectDatabase extends SimpleDatabase<EffectObject> {
	constructor(entity: Entity) {
		super("effects", entity, 1);
	}
}

interface EffectConfig {
	effectType: string;
	color: RGBA;
	sounds?: { ambient?: string; start?: string; end?: string };
	particleType?: string;
	handler: (entity: Entity, effect: EffectObject) => void;
}

interface PotionConfig {
	effectKey: string;
	namespace: string;
	effectId: number;
	handler: (
		entity: Entity,
		amplifier: number,
		duration: number,
		color: RGBA,
	) => void;
	splashRange?: number;
	lingeringMaxRadius?: number;
	lingeringLifetime?: number;
	lingeringDurationMultiplier?: number;
}

interface PotionItemParams {
	amplifier: number;
	duration: number;
	potion_color: [number, number, number, number];
}

interface AreaEffectCloud {
	id: string;
	dimension: string;
	location: Vector3;
	color: RGBA;
	amplifier: number;
	duration: number;
	currentRadius: number;
	maxRadius: number;
	createdTick: number;
	maxLifetime: number;
	affectedEntities: Set<string>;
	handler: (
		entity: Entity,
		amplifier: number,
		duration: number,
		color: RGBA,
	) => void;
}

// ============================= EffectManager =================================

class EffectManager {
	private static instance: EffectManager;
	private effectConfigs = new Map<string, EffectConfig>();
	private potionConfigs = new Map<string, PotionConfig>();
	private areaEffectClouds = new Map<string, AreaEffectCloud>();
	private cloudIdCounter = 0;
	private trackedEntities = new Map<string, Entity>();
	// Entity databases: entityId -> EffectDatabase
	private entityDatabases = new Map<string, EffectDatabase>();

	static getInstance(): EffectManager {
		if (!EffectManager.instance) {
			EffectManager.instance = new EffectManager();
		}
		return EffectManager.instance;
	}

	private constructor() {}

	// ============================= Database Helpers ==========================

	// Get or create database for an entity
	private getEntityDatabase(entity: Entity): EffectDatabase {
		let db = this.entityDatabases.get(entity.id);
		if (!db) {
			db = new EffectDatabase(entity);
			this.entityDatabases.set(entity.id, db);
		}
		return db;
	}

	private getEffect(entity: Entity, effectType: string): EffectObject | null {
		const db = this.getEntityDatabase(entity);
		return db.getObject(effectType) || null;
	}

	private getAllEffects(entity: Entity): EffectObject[] {
		const db = this.getEntityDatabase(entity);
		return db.getAllObjects();
	}

	// Check if entity has any active effects and should be tracked
	private hasActiveEffects(entity: Entity): boolean {
		const db = this.getEntityDatabase(entity);
		return db.getAllObjects().length > 0;
	}

	private debug() {
		for (const player of world.getAllPlayers()) {
			const effects = this.getAllEffects(player);

			if (effects.length === 0) {
				player.onScreenDisplay.setActionBar(
					"§8[§7Effects§8] §7No active effects",
				);
				continue;
			}

			const effectMap = new Map<string, EffectObject>();
			for (const effect of effects) {
				const existing = effectMap.get(effect.effectType);
				if (!existing || effect.duration > existing.duration) {
					effectMap.set(effect.effectType, effect);
				}
			}

			const sorted = Array.from(effectMap.values()).sort(
				(a, b) => b.duration - a.duration,
			);
			const display = sorted.map((effect) => {
				const seconds = Math.ceil(effect.duration / 20);
				const minutes = Math.floor(seconds / 60);
				const remainingSeconds = seconds % 60;
				const timeString =
					seconds > 60
						? `§a${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
						: seconds > 10
							? `§e${seconds}s`
							: `§c${seconds}s`;
				const name = effect.effectType
					.split("_")
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
					.join(" ");
				const amp =
					[
						"I",
						"II",
						"III",
						"IV",
						"V",
						"VI",
						"VII",
						"VIII",
						"IX",
						"X",
					][effect.amplifier] || effect.amplifier + 1;
				return `§6${name}§r §7${amp}§r §8(${timeString}§8)§r`;
			});
			player.onScreenDisplay.setActionBar(
				`§8[§bActive Effects§8]§r\n${display.join("\n")}`,
			);
		}
	}

	// ============================= Effect API ================================

	registerEffect(config: EffectConfig) {
		this.effectConfigs.set(config.effectType, config);
		return {
			addEffect: (
				entity: Entity,
				amplifier: number,
				durationTicks: number,
			) => {
				this.addEffect(
					entity,
					config.effectType,
					amplifier,
					durationTicks,
				);
			},
			removeEffect: (entity: Entity) => {
				this.removeEffect(entity, config.effectType);
			},
			applyEffect: config.handler,
		};
	}

	addEffect(
		entity: Entity,
		effectType: string,
		amplifier: number,
		duration: number,
	): void {
		const config = this.effectConfigs.get(effectType);
		const db = this.getEntityDatabase(entity);
		const existing = db.getObject(effectType);

		// Determine which effect to keep (stronger one)
		if (
			!existing ||
			amplifier > existing.amplifier ||
			(amplifier === existing.amplifier && duration > existing.duration)
		) {
			const effect: EffectObject = {
				id: effectType,
				namespace: getNamespace(),
				effectType,
				amplifier,
				duration,
				color: config?.color || { red: 1, green: 1, blue: 1, alpha: 1 },
			};
			db.updateObject(effect);

			// Play start sound only for new effects
			if (!existing && config?.sounds?.start) {
				try {
					entity.dimension.playSound(
						config.sounds.start,
						entity.location,
					);
				} catch {}
			}
		}

		// Track entity for effect updates
		this.trackedEntities.set(entity.id, entity);
	}

	removeEffect(entity: Entity, effectType: string): void {
		const db = this.getEntityDatabase(entity);
		const hasEffect = db.hasObject(effectType);
		const config = this.effectConfigs.get(effectType);

		// Remove from database
		db.removeObject(effectType);

		// Play end sound only if effect existed
		if (hasEffect && config?.sounds?.end) {
			try {
				entity.dimension.playSound(config.sounds.end, entity.location);
			} catch {}
		}

		// Untrack entity if no effects remain
		if (!this.hasActiveEffects(entity)) {
			this.entityDatabases.delete(entity.id);
			this.trackedEntities.delete(entity.id);
		}
	}

	removeAllEffects(entity: Entity): void {
		const db = this.getEntityDatabase(entity);
		const effects = db.getAllObjects();

		entity
			.getTags()
			.filter((tag) => tag.startsWith("starkeffects|pause_effect"))
			.forEach((tag) => entity.removeTag(tag));

		// Play end sounds for each effect
		for (const effect of effects) {
			const config = this.effectConfigs.get(effect.effectType);
			if (config?.sounds?.end) {
				try {
					entity.dimension.playSound(
						config.sounds.end,
						entity.location,
					);
				} catch {}
			}
		}

		// Clear database and untrack
		db.eraseAllObjects();
		this.entityDatabases.delete(entity.id);
		this.trackedEntities.delete(entity.id);
	}

	hasEffect(entity: Entity, effectType: string): boolean {
		const db = this.getEntityDatabase(entity);
		return db.hasObject(effectType);
	}

	getEffects(entity: Entity): EffectObject[] {
		const db = this.getEntityDatabase(entity);
		return db.getAllObjects();
	}

	// ============================= Potion API ================================

	registerPotion(config: PotionConfig) {
		const fullConfig: PotionConfig = {
			splashRange: 4,
			lingeringMaxRadius: 3,
			lingeringLifetime: 600,
			lingeringDurationMultiplier: 0.25,
			...config,
		};
		this.potionConfigs.set(
			`${config.namespace}:${config.effectKey}`,
			fullConfig,
		);
		return { handler: config.handler };
	}

	// ============================= System ====================================

	start(startup?: StartupEvent, debug?: boolean): void {
		if (startup) {
			for (const [, config] of this.potionConfigs.entries()) {
				const componentId = `${config.namespace}:${config.effectKey}_potion_effect`;
				startup.itemComponentRegistry.registerCustomComponent(
					componentId,
					{
						onConsume: (event, params) => {
							const p = params.params as PotionItemParams;
							const color: RGBA = {
								red: p.potion_color[0],
								green: p.potion_color[1],
								blue: p.potion_color[2],
								alpha: p.potion_color[3],
							};
							config.handler(
								event.source,
								p.amplifier,
								p.duration * 20,
								color,
							);
						},
					},
				);
			}

			world.afterEvents.projectileHitBlock.subscribe((event) =>
				this.handleProjectileHit(event.projectile),
			);
			world.afterEvents.projectileHitEntity.subscribe((event) =>
				this.handleProjectileHit(event.projectile),
			);
		}

		system.runInterval(() => {
			//if (debug) {
			//	this.debug();
			//}
			// Process effects on tracked entities only
			for (const [entityId, entity] of this.trackedEntities.entries()) {
				if (!entity.isValid) {
					this.entityDatabases.delete(entityId);
					this.trackedEntities.delete(entityId);
					continue;
				}

				const allTags = entity.getTags();
				const pauseEffects = allTags.filter((tag) =>
					tag.startsWith(`starkeffects|pause_effect`),
				);

				const db = this.getEntityDatabase(entity);
				const effects = db.getAllObjects();

				if (effects.length === 0) {
					this.entityDatabases.delete(entityId);
					this.trackedEntities.delete(entityId);
					continue;
				}

				// Store original durations to detect handler modifications
				const originalDurations = new Map<string, number>();
				for (const effect of effects) {
					originalDurations.set(effect.effectType, effect.duration);
				}

				// Apply handlers and update effects
				for (const effect of effects) {
					const config = this.effectConfigs.get(effect.effectType);

					// Run effect handler
					if (config?.handler) {
						config.handler(entity, effect);
					}

					// Get current effect from database (handler may have modified it)
					const currentEffect = db.getObject(effect.effectType);
					if (!currentEffect) continue;

					// Check if handler modified the duration
					const originalDuration = originalDurations.get(
						effect.effectType,
					)!;
					if (currentEffect.duration !== originalDuration) {
						// Handler modified it, skip countdown
						continue;
					}

					// Play ambient sounds
					if (
						config?.sounds?.ambient &&
						system.currentTick % 40 === 0
					) {
						try {
							entity.dimension.playSound(
								config.sounds.ambient,
								entity.location,
								{ volume: 0.5 },
							);
						} catch {}
					}

					// Spawn particles
					if (system.currentTick % 20 === 0) {
						const loc = {
							...entity.location,
							y: entity.location.y + 1,
						};
						const variables = new MolangVariableMap();
						variables.setColorRGBA("color", currentEffect.color);
						try {
							entity.dimension.spawnParticle(
								config?.particleType ||
									"minecraft:mobspell_emitter",
								loc,
								variables,
							);
						} catch {}
					}

					if (pauseEffects.length > 0) {
						const excludeEffects = pauseEffects.map(
							(tag) => tag.split("|")[2],
						);
						if (!excludeEffects.includes(effect.effectType))
							continue;
					}

					// Countdown duration
					const newDuration = currentEffect.duration - 1;
					if (newDuration > 0) {
						db.updateObject({
							...currentEffect,
							duration: newDuration,
						});
					} else {
						db.removeObject(effect.effectType);
						if (config?.sounds?.end) {
							try {
								entity.dimension.playSound(
									config.sounds.end,
									entity.location,
								);
							} catch {}
						}
					}
				}

				// Untrack if no effects remain
				if (!this.hasActiveEffects(entity)) {
					this.entityDatabases.delete(entityId);
					this.trackedEntities.delete(entityId);
				}
			}

			for (const cloud of this.areaEffectClouds.values()) {
				this.updateCloud(cloud);
			}
		}, 1);

		// Track entities that spawn with active effects
		world.afterEvents.entitySpawn.subscribe((event) => {
			if (!event.entity || !event.entity.isValid) return;
			if (event.entity.hasComponent(EntityItemComponent.componentId))
				return;

			if (this.hasActiveEffects(event.entity)) {
				this.trackedEntities.set(event.entity.id, event.entity);
			}
		});

		world.afterEvents.playerJoin.subscribe((event) => {
			const player = world.getEntity(event.playerId) as Player;
			if (this.hasActiveEffects(player)) {
				this.trackedEntities.set(player.id, player);
			}
		});

		// Clean up when entities die
		world.afterEvents.entityDie.subscribe((event) => {
			this.entityDatabases.delete(event.deadEntity.id);
			this.trackedEntities.delete(event.deadEntity.id);
		});

		world.afterEvents.itemCompleteUse.subscribe((event) => {
			if (event.itemStack.typeId === MinecraftItemTypes.MilkBucket) {
				this.removeAllEffects(event.source);
			}
		});

		world.afterEvents.worldLoad.subscribe(() => {
			world.getAllPlayers().forEach((player) => {
				if (this.hasActiveEffects(player)) {
					this.trackedEntities.set(player.id, player);
				}
			});
		});
	}

	// ============================= Potion Projectiles ========================

	private handleProjectileHit(projectile: Entity): void {
		const configs = Array.from(this.potionConfigs.values());

		for (const config of configs) {
			if (projectile.typeId !== `${config.namespace}:potion_projectile`)
				continue;

			const effectId = projectile.getProperty(
				`${config.namespace}:effect_id`,
			) as number;
			if (effectId !== config.effectId) continue;

			const potionType = projectile.getProperty(
				`${config.namespace}:type`,
			) as number;

			if (potionType === 1) {
				this.handleSplash(projectile, config);
			} else if (potionType === 2) {
				this.handleLingering(projectile, config);
			} else {
				projectile.remove();
			}
			return;
		}
	}

	private handleSplash(projectile: Entity, config: PotionConfig): void {
		const location = {
			...projectile.location,
			y: projectile.location.y + 0.1,
		};
		const color = this.getColorFromEntity(projectile, config.namespace);
		const amplifier = projectile.getProperty(
			`${config.namespace}:amplifier`,
		) as number;
		const duration =
			(projectile.getProperty(`${config.namespace}:duration`) as number) *
			20;

		const variables = new MolangVariableMap();
		variables.setFloat("splash_range", config.splashRange!);
		variables.setFloat("splash_power", 1);
		variables.setColorRGBA("color", color);
		projectile.dimension.spawnParticle(
			"minecraft:splash_spell_emitter",
			location,
			variables,
		);

		const nearbyEntities = projectile.dimension.getEntities({
			excludeTypes: ["minecraft:item", "minecraft:arrow"],
			location: projectile.location,
			maxDistance: config.splashRange!,
		});

		for (const entity of nearbyEntities) {
			if (entity.id !== projectile.id) {
				config.handler(entity, amplifier, duration, color);
			}
		}

		projectile.remove();
	}

	private handleLingering(projectile: Entity, config: PotionConfig): void {
		const location = {
			...projectile.location,
			y: projectile.location.y + 0.1,
		};
		const color = this.getColorFromEntity(projectile, config.namespace);
		const amplifier = projectile.getProperty(
			`${config.namespace}:amplifier`,
		) as number;
		const duration =
			(projectile.getProperty(`${config.namespace}:duration`) as number) *
			20;

		const cloud: AreaEffectCloud = {
			id: `aoe_cloud_${this.cloudIdCounter++}`,
			dimension: projectile.dimension.id,
			location,
			color,
			amplifier,
			duration,
			currentRadius: config.lingeringMaxRadius!,
			maxRadius: config.lingeringMaxRadius!,
			createdTick: system.currentTick,
			maxLifetime: config.lingeringLifetime!,
			affectedEntities: new Set<string>(),
			handler: config.handler,
		};

		this.areaEffectClouds.set(cloud.id, cloud);
		projectile.remove();
	}

	private updateCloud(cloud: AreaEffectCloud): void {
		const dimension = world.getDimension(cloud.dimension);
		const age = system.currentTick - cloud.createdTick;
		const ageProgress = Math.min(age / cloud.maxLifetime, 1);

		cloud.currentRadius = Math.max(0, cloud.maxRadius * (1 - ageProgress));

		if (age >= cloud.maxLifetime || cloud.currentRadius <= 0) {
			this.areaEffectClouds.delete(cloud.id);
			return;
		}

		const variables = new MolangVariableMap();
		variables.setFloat("cloud_lifetime", cloud.maxLifetime / 20);
		variables.setFloat("cloud_radius", cloud.currentRadius);
		variables.setFloat(
			"particle_multiplier",
			cloud.currentRadius / cloud.maxRadius,
		);
		variables.setColorRGBA("color", cloud.color);
		dimension.spawnParticle(
			"minecraft:mobspell_lingering",
			cloud.location,
			variables,
		);

		if (age < 20) return;

		const nearbyEntities = dimension.getEntities({
			location: cloud.location,
			maxDistance: cloud.currentRadius + 1,
			excludeTypes: [
				"minecraft:item",
				"minecraft:arrow",
				"minecraft:xp_orb",
			],
		});

		for (const entity of nearbyEntities) {
			if (cloud.affectedEntities.has(entity.id)) continue;

			cloud.handler(
				entity,
				cloud.amplifier,
				Math.floor(cloud.duration),
				cloud.color,
			);
			cloud.currentRadius = Math.max(0, cloud.currentRadius - 0.5);
			cloud.maxLifetime = Math.max(0, cloud.maxLifetime - 100);
			cloud.affectedEntities.add(entity.id);

			system.runTimeout(() => {
				cloud.affectedEntities.delete(entity.id);
			}, 60);
		}
	}

	private getColorFromEntity(entity: Entity, namespace: string): RGBA {
		return {
			red: entity.getProperty(`${namespace}:color_r`) as number,
			green: entity.getProperty(`${namespace}:color_g`) as number,
			blue: entity.getProperty(`${namespace}:color_b`) as number,
			alpha: entity.getProperty(`${namespace}:color_a`) as number,
		};
	}
}

const effectManager = EffectManager.getInstance();

export {
	EffectManager,
	effectManager,
	EffectObject,
	EffectConfig,
	PotionConfig,
};
