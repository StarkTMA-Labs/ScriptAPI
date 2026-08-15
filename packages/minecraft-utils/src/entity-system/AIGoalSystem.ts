/**
 * @file AIGoalSystem.ts
 * @description Priority-based AI goal selector and tick executor system.
 */

import { system } from "@minecraft/server";
import { AIGoal } from "./AIGoal";

export class AIGoalSystem<T> {
	public goals: AIGoal<T>[] = [];
	private activeGoals: Map<string, AIGoal<T>> = new Map();
	private entity: T;

	constructor(entity: T, goals: AIGoal<T>[] = []) {
		this.entity = entity;
		this.goals = goals;
	}

	addGoal(goal: AIGoal<T>): void {
		this.goals.push(goal);
	}

	removeGoal(identifier: string): void {
		this.goals = this.goals.filter((g) => g.identifier !== identifier);
		if (this.activeGoals.has(identifier)) {
			const goal = this.activeGoals.get(identifier)!;
			this.activeGoals.delete(identifier);
			goal.onEnd(this.entity);
		}
	}

	hasActiveGoal(identifier: string): boolean {
		return this.activeGoals.has(identifier);
	}

	getGoal(identifier: string): AIGoal<T> | undefined {
		return this.goals.find((g) => g.identifier === identifier);
	}

	tick(): void {
		this.goals.sort((a, b) => a.priority - b.priority);

		const groupedGoals = new Map<number, AIGoal<T>[]>();

		for (const goal of this.goals) {
			if (!goal.shouldExecute(this.entity)) {
				this.activeGoals.delete(goal.identifier);
				continue;
			}

			const priority = goal.priority;
			const group = groupedGoals.get(priority);

			if (group) {
				group.push(goal);
			} else {
				groupedGoals.set(priority, [goal]);
			}
		}

		for (const goals of groupedGoals.values()) {
			if (!goals.some((g) => this.activeGoals.has(g.identifier))) {
				const selected = goals[Math.floor(Math.random() * goals.length)];
				selected.start();
				this.activeGoals.set(selected.identifier, selected);
			}
		}

		this.activeGoals.forEach((goal) => {
			if (goal.maxDuration > -1 && goal.activeTicks >= goal.maxDuration) {
				this.activeGoals.delete(goal.identifier);
				goal.onEnd(this.entity);
				return;
			}
			goal.activeTicks++;
			system.runJob(goal.execute(this.entity));
		});
	}
}
