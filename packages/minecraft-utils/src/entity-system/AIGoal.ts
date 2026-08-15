/**
 * @file AIGoal.ts
 * @description Abstract base class representing an AI behavior goal.
 */

export abstract class AIGoal<T> {
	static readonly Identifier: string = "custom:base_ai_goal";

	public priority: number;
	public maxDuration: number = -1;
	public activeTicks: number = 0;
	public chance: number = 1.0;

	protected cooldownTicksRemaining = 0;
	protected cooldownTicks: number = 0;
	protected debug: boolean = false;

	constructor(
		priority: number,
		maxDuration: number = -1,
		chance: number = 1.0,
		cooldownTicks: number = 100,
		debug: boolean = false,
	) {
		this.priority = priority;
		this.maxDuration = maxDuration;
		this.chance = chance;
		this.cooldownTicks = cooldownTicks;
		this.debug = debug;
	}

	abstract execute(entity: T): Generator<void, void, void>;

	start(): void {
		this.activeTicks = 0;
	}

	onEnd(entity: T): void {
		this.cooldownTicksRemaining = this.cooldownTicks;
		this.activeTicks = 0;
	}

	shouldExecute(entity: T): boolean {
		if (this.activeTicks > 0) {
			if (this.maxDuration > -1 && this.activeTicks >= this.maxDuration) {
				this.onEnd(entity);
				return false;
			}
			return true;
		}

		if (this.cooldownTicks > 0 && this.cooldownTicksRemaining > 0) {
			this.cooldownTicksRemaining--;
			return false;
		}
		if (this.chance < 1.0 && Math.random() > this.chance) return false;

		return true;
	}

	get identifier(): string {
		return (this.constructor as typeof AIGoal).Identifier;
	}
}
