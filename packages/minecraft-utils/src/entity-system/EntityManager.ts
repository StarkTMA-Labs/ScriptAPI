/**
 * @file EntityManager.ts
 * @description Abstract manager class managing collections of `EntityWrapper` instances.
 * Dispatches entity and manager lifecycle events across all registered `EventGroup` instances.
 */

import { system, world, Entity } from "@minecraft/server";
import { EntityWrapper, EntityEvents } from "./EntityWrapper";
import { EventGroup } from "./EventGroup";

export abstract class EntityManager<T extends EntityWrapper = EntityWrapper> {
	private entities = new Map<string, T>();
	private events = new Map<string, EventGroup<T>>();

	protected constructor(tickInterval: number = 1) {
		world.afterEvents.entitySpawn.subscribe(({ entity }) => {
			if (this.shouldManageEntity(entity)) {
				this.addEntity(entity);
			}
		});

		world.afterEvents.entityRemove.subscribe(({ removedEntityId }) => {
			this.removeEntity(removedEntityId);
		});

		world.afterEvents.worldLoad.subscribe(() => {
			this.onWorldLoad();
			this.triggerEntityEvent(EntityEvents.WorldLoad, this as any);
			system.runInterval(() => {
				this.tick();
			}, tickInterval);
		});
	}

	/** Factory method creating specialized wrapper subclass instance */
	protected abstract createEntityWrapper(entity: Entity): T;

	/** Predicate determining whether an entity should be managed by this manager */
	protected shouldManageEntity(entity: Entity): boolean {
		return !!(entity && entity.isValid);
	}

	getAllEntities(): T[] {
		return Array.from(this.entities.values());
	}

	getEntity(id: string): T | undefined {
		return this.entities.get(id);
	}

	addEntity(entity: Entity): T | undefined {
		if (this.entities.has(entity.id)) {
			return this.entities.get(entity.id);
		}

		const wrapper = this.createEntityWrapper(entity);
		wrapper.manager = this;
		this.entities.set(entity.id, wrapper);

		this.triggerEntityEvent(EntityEvents.EntityAdded, wrapper);
		this.triggerEntityEvent(EntityEvents.Spawn, wrapper);
		return wrapper;
	}

	removeEntity(id: string): void {
		const wrapper = this.entities.get(id);
		if (wrapper) {
			this.triggerEntityEvent(EntityEvents.EntityRemoved, wrapper);
			this.triggerEntityEvent(EntityEvents.Despawn, wrapper);
			this.entities.delete(id);
		}
	}

	/**
	 * Dispatches an event across all registered EventGroup instances.
	 */
	triggerEntityEvent(eventType: string, target: any, ...args: any[]): void {
		this.events.forEach((eventGroup) => {
			eventGroup.trigger(eventType, target, ...args);
		});
	}

	/**
	 * Registers or retrieves a named EventGroup for event dispatches.
	 */
	registerEvents(eventID: string): { event: EventGroup<T> } {
		let eventGroup = this.events.get(eventID);
		if (!eventGroup) {
			eventGroup = new EventGroup<T>(Object.values(EntityEvents));
			this.events.set(eventID, eventGroup);
		}
		return { event: eventGroup };
	}

	getEvents(eventID: string): EventGroup<T> | undefined {
		return this.events.get(eventID);
	}

	tick(): void {
		this.triggerEntityEvent(EntityEvents.PreTick, this as any);

		const all = this.getAllEntities();
		for (const wrapper of all) {
			if (!wrapper.isValid) {
				this.removeEntity(wrapper.id);
				continue;
			}

			wrapper.tick();
			this.triggerEntityEvent(EntityEvents.Tick, wrapper);
		}

		this.triggerEntityEvent(EntityEvents.PostTick, this as any);
	}

	// Optional Hook Method for Subclasses
	protected onWorldLoad(): void {}
}
