/**
 * @file EntityWrapper.ts
 * @description Generic base wrapper class encapsulating native Bedrock `@minecraft/server` Entity instances.
 * Provides property helpers, component accessors, tag events, effect delegations, damage routing,
 * and attributes backed by EntityAttributeDatabase.
 */

import {
	Entity,
	EntityHealthComponent,
	EntityInventoryComponent,
	EntityEquippableComponent,
	Vector3,
	Dimension,
	EntityDamageCause,
	Effect,
	EffectType,
} from "@minecraft/server";
import { getNamespace } from "../constants";
import { EntityAttributeDatabase } from "./EntityAttributeDatabase";
import type { EntityManager } from "./EntityManager";
import { AIGoal } from "./AIGoal";
import { AIGoalSystem } from "./AIGoalSystem";

export enum EntityEvents {
	WorldLoad = "worldLoad",
	PreTick = "preTick",
	PostTick = "postTick",
	EntityAdded = "entityAdded",
	EntityRemoved = "entityRemoved",
	Spawn = "spawn",
	Despawn = "despawn",
	Tick = "tick",
	Hurt = "hurt",
	Heal = "heal",
	Dying = "dying",
	Death = "death",
	TagAdded = "tagAdded",
	TagRemoved = "tagRemoved",
	ScriptEvent = "scriptEvent",
}

export class EntityWrapper<E extends Entity = Entity> {
	readonly entity: E;
	stateTick = 0;
	manager?: EntityManager<any>;
	aiGoalSystem: AIGoalSystem<this>;

	private attributeDB?: EntityAttributeDatabase;

	constructor(entity: E, manager?: EntityManager<any>) {
		this.entity = entity;
		this.manager = manager;
		this.aiGoalSystem = new AIGoalSystem(this);
	}

	private get db(): EntityAttributeDatabase {
		if (!this.attributeDB) {
			this.attributeDB = new EntityAttributeDatabase(this.entity);
		}
		return this.attributeDB;
	}

	// -------------------------------------------------------------------------
	// Core Delegated Properties
	// -------------------------------------------------------------------------
	get id(): string {
		return this.entity.id;
	}

	get typeId(): string {
		return this.entity.typeId;
	}

	get isValid(): boolean {
		return !!(this.entity && this.entity.isValid);
	}

	get location(): Vector3 {
		return this.entity.location;
	}

	get dimension(): Dimension {
		return this.entity.dimension;
	}

	get rotation() {
		return this.entity.getRotation();
	}

	// -------------------------------------------------------------------------
	// Component Accessors
	// -------------------------------------------------------------------------
	get healthComponent(): EntityHealthComponent | undefined {
		return this.entity.getComponent(EntityHealthComponent.componentId) as
			| EntityHealthComponent
			| undefined;
	}

	get inventoryComponent(): EntityInventoryComponent | undefined {
		return this.entity.getComponent(EntityInventoryComponent.componentId) as
			| EntityInventoryComponent
			| undefined;
	}

	get equippableComponent(): EntityEquippableComponent | undefined {
		return this.entity.getComponent(EntityEquippableComponent.componentId) as
			| EntityEquippableComponent
			| undefined;
	}

	getComponent<T>(componentId: string): T | undefined {
		return this.entity.getComponent(componentId) as T | undefined;
	}

	hasComponent(componentId: string): boolean {
		return this.entity.hasComponent(componentId);
	}

	// -------------------------------------------------------------------------
	// Dynamic & Namespaced Property Helpers
	// -------------------------------------------------------------------------
	getProperty<T = any>(propertyName: string): T | undefined {
		if (!this.isValid) return undefined;
		return this.entity.getProperty(propertyName) as T | undefined;
	}

	setProperty<T = any>(propertyName: string, value: T): void {
		if (!this.isValid) return;
		this.entity.setProperty(propertyName, value as any);
	}

	getDynamicProperty<T = any>(propertyName: string): T | undefined {
		if (!this.isValid) return undefined;
		return this.entity.getDynamicProperty(propertyName) as T | undefined;
	}

	setDynamicProperty<T = any>(propertyName: string, value: T): void {
		if (!this.isValid) return;
		this.entity.setDynamicProperty(propertyName, value as any);
	}

	getCustomProperty<T = any>(propertyName: string): T | undefined {
		if (!this.isValid) return undefined;
		const ns = getNamespace();
		const fullName = ns ? `${ns}:${propertyName}` : propertyName;
		return (this.entity.getProperty(fullName) ??
			this.entity.getDynamicProperty(fullName)) as T | undefined;
	}

	setCustomProperty<T = any>(propertyName: string, value: T): void {
		if (!this.isValid) return;
		const ns = getNamespace();
		const fullName = ns ? `${ns}:${propertyName}` : propertyName;
		try {
			this.entity.setProperty(fullName, value as any);
		} catch (e) {
			this.entity.setDynamicProperty(fullName, value as any);
		}
	}

	// -------------------------------------------------------------------------
	// Tag Helpers
	// -------------------------------------------------------------------------
	hasTag(tag: string): boolean {
		return this.isValid ? this.entity.hasTag(tag) : false;
	}

	addTag(tag: string): boolean {
		if (!this.isValid) return false;
		const added = this.entity.addTag(tag);
		if (added) {
			this.manager?.triggerEntityEvent(EntityEvents.TagAdded, this, tag);
		}
		return added;
	}

	removeTag(tag: string): boolean {
		if (!this.isValid) return false;
		const removed = this.entity.removeTag(tag);
		if (removed) {
			this.manager?.triggerEntityEvent(EntityEvents.TagRemoved, this, tag);
		}
		return removed;
	}

	getTags(): string[] {
		return this.isValid ? this.entity.getTags() : [];
	}

	// -------------------------------------------------------------------------
	// Native Health & Damage
	// -------------------------------------------------------------------------
	get health(): number {
		return this.healthComponent?.currentValue ?? 0;
	}

	set health(value: number) {
		if (this.healthComponent) {
			const maxHp = this.maxHealth;
			const clampedHp = Math.max(0, Math.min(value, maxHp > 0 ? maxHp : value));
			this.healthComponent.setCurrentValue(clampedHp);
		}
	}

	get maxHealth(): number {
		return this.healthComponent?.defaultValue ?? 20;
	}

	applyDamage(
		damageAmount: number,
		source?: Entity,
		cause?: EntityDamageCause | string,
	): void {
		if (!this.isValid || damageAmount <= 0) return;

		const currentHp = this.health;
		const newHp = Math.max(0, currentHp - damageAmount);
		this.health = newHp;

		this.manager?.triggerEntityEvent(
			EntityEvents.Hurt,
			this,
			damageAmount,
			source,
			cause,
		);

		if (newHp <= 0 && !this.hasTag("is_dead_handled")) {
			this.addTag("is_dead_handled");
			try {
				this.entity.triggerEvent("is_dying");
			} catch (e) {}
			this.manager?.triggerEntityEvent(EntityEvents.Dying, this);
		}
	}

	heal(healAmount: number, source?: Entity): void {
		if (!this.isValid || healAmount <= 0) return;
		const currentHp = this.health;
		const maxHp = this.maxHealth;
		const newHp = Math.min(maxHp, currentHp + healAmount);
		this.health = newHp;

		this.manager?.triggerEntityEvent(EntityEvents.Heal, this, healAmount, source);
	}

	// -------------------------------------------------------------------------
	// Native Bedrock Effect Delegations
	// -------------------------------------------------------------------------
	addEffect(
		effectType: EffectType | string,
		duration: number,
		options?: any,
	): Effect | undefined {
		if (!this.isValid) return undefined;
		return this.entity.addEffect(effectType as any, duration, options);
	}

	removeEffect(effectType: EffectType | string): boolean {
		if (!this.isValid) return false;
		return this.entity.removeEffect(effectType as any);
	}

	getEffect(effectType: EffectType | string): Effect | undefined {
		if (!this.isValid) return undefined;
		return this.entity.getEffect(effectType as any);
	}

	// -------------------------------------------------------------------------
	// Attribute Store (backed by EntityAttributeDatabase child of SimpleDatabase)
	// -------------------------------------------------------------------------
	setAttribute<T = any>(key: string, value: T): void {
		if (!this.isValid) return;
		this.db.setAttribute(key, value);
	}

	getAttribute<T = any>(key: string): T | undefined {
		if (!this.isValid) return undefined;
		return this.db.getAttribute<T>(key);
	}

	hasAttribute(key: string): boolean {
		if (!this.isValid) return false;
		return this.db.hasAttribute(key);
	}

	removeAttribute(key: string): boolean {
		if (!this.isValid) return false;
		if (this.db.hasAttribute(key)) {
			this.db.removeAttribute(key);
			return true;
		}
		return false;
	}

	getAllAttributes(): Record<string, any> {
		if (!this.isValid) return {};
		return this.db.getAllAttributes();
	}

	// -------------------------------------------------------------------------
	// AI Goal System Helpers
	// -------------------------------------------------------------------------
	addGoal(goal: AIGoal<this>): void {
		this.aiGoalSystem.addGoal(goal);
	}

	removeGoal(identifier: string): void {
		this.aiGoalSystem.removeGoal(identifier);
	}

	hasActiveGoal(identifier: string): boolean {
		return this.aiGoalSystem.hasActiveGoal(identifier);
	}

	getGoal(identifier: string): AIGoal<this> | undefined {
		return this.aiGoalSystem.getGoal(identifier);
	}

	// -------------------------------------------------------------------------
	// Tick Loop
	// -------------------------------------------------------------------------
	tick(): void {
		if (!this.isValid) return;
		this.stateTick++;
		this.aiGoalSystem.tick();
	}
}
