/**
 * @file PlayerWrapper.ts
 * @description Specialized Player wrapper extending `EntityWrapper<Player>`.
 * Manages player inputs (jump & sneak state machines), movement/ground state tracking, camera clears, and event triggers.
 */

import {
	Player,
	ButtonState,
	EquipmentSlot,
	InputButton,
	ItemStack,
	Vector3,
} from "@minecraft/server";
import { EntityWrapper, EntityEvents } from "./EntityWrapper";
import type { EntityManager } from "./EntityManager";

export enum PlayerEvents {
	// Unified Entity Events
	WorldLoad = "worldLoad",
	PreTick = "preTick",
	PostTick = "postTick",
	EntityAdded = "entityAdded",
	EntityRemoved = "entityRemoved",
	Tick = "tick",
	Hurt = "hurt",
	Heal = "heal",
	Dying = "dying",
	Death = "death",
	TagAdded = "tagAdded",
	TagRemoved = "tagRemoved",
	ScriptEvent = "scriptEvent",

	// Player Specific Input & Movement Events
	JumpStart = "jumpStart",
	JumpHold = "jumpHold",
	JumpEnd = "jumpEnd",
	SneakStart = "sneakStart",
	SneakHold = "sneakHold",
	SneakEnd = "sneakEnd",
	Land = "land",
}

export class PlayerWrapper extends EntityWrapper<Player> {
	jumpTick = 0;
	sneakTick = 0;
	wasOnGround = true;

	constructor(player: Player, manager?: EntityManager<any>) {
		super(player, manager);
		this.reset();
	}

	get player(): Player {
		return this.entity;
	}

	get isJumping(): boolean {
		return this.jumpTick > 0;
	}

	get isSneaking(): boolean {
		return this.sneakTick > 0;
	}

	get isOnGround(): boolean {
		return this.isValid ? this.player.isOnGround : true;
	}

	get isFalling(): boolean {
		if (!this.isValid) return false;
		return !this.player.isOnGround && this.velocity.y < 0;
	}

	get velocity(): Vector3 {
		return this.isValid ? this.player.getVelocity() : { x: 0, y: 0, z: 0 };
	}

	getEquippedItem(): ItemStack | undefined {
		return this.equippableComponent?.getEquipment(EquipmentSlot.Mainhand);
	}

	reset(): void {
		this.stateTick = 0;
		this.jumpTick = 0;
		this.sneakTick = 0;
		this.wasOnGround = true;
		try {
			this.player.camera.clear();
		} catch (e) {}
	}

	override tick(): void {
		super.tick();
		if (!this.isValid) return;

		let isJumpPressed = false;
		let isSneakPressed = false;

		try {
			const inputInfo = this.player.inputInfo;
			if (inputInfo) {
				isJumpPressed =
					inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
				isSneakPressed =
					inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed;
			}
		} catch (e) {
			// InputInfo might throw if permissions or camera modes lock input state
		}

		// --- Jump State Machine ---
		if (isJumpPressed) {
			if (this.jumpTick <= 0) {
				this.jumpTick = 1;
				this.manager?.triggerEntityEvent(PlayerEvents.JumpStart, this);
			} else {
				this.jumpTick++;
			}
			this.manager?.triggerEntityEvent(
				PlayerEvents.JumpHold,
				this,
				this.jumpTick,
			);
		} else {
			if (this.jumpTick > 0) {
				this.manager?.triggerEntityEvent(
					PlayerEvents.JumpEnd,
					this,
					this.jumpTick,
				);
			}
			this.jumpTick = 0;
		}

		// --- Sneak State Machine ---
		if (isSneakPressed) {
			if (this.sneakTick <= 0) {
				this.sneakTick = 1;
				this.manager?.triggerEntityEvent(PlayerEvents.SneakStart, this);
			} else {
				this.sneakTick++;
			}
			this.manager?.triggerEntityEvent(
				PlayerEvents.SneakHold,
				this,
				this.sneakTick,
			);
		} else {
			if (this.sneakTick > 0) {
				this.manager?.triggerEntityEvent(
					PlayerEvents.SneakEnd,
					this,
					this.sneakTick,
				);
			}
			this.sneakTick = 0;
		}

		// --- Ground & Landing State Machine ---
		const currentlyOnGround = this.isOnGround;
		if (currentlyOnGround && !this.wasOnGround) {
			this.manager?.triggerEntityEvent(PlayerEvents.Land, this);
		}
		this.wasOnGround = currentlyOnGround;
	}
}
