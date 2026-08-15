/**
 * @file EventGroup.ts
 * @description Event pub/sub mechanism supporting typed event callbacks for wrapped entities and players.
 */

export type EventCallback<T = any> = (target: T, ...args: any[]) => void;
export type EventType = string;

export class EventGroup<T = any> {
	private callbacks = new Map<EventType, EventCallback<T>[]>();

	constructor(initialEvents?: EventType[]) {
		if (initialEvents) {
			initialEvents.forEach((event) => {
				this.callbacks.set(event, []);
			});
		}
	}

	/**
	 * Registers an event listener callback for the specified event type.
	 */
	on(type: EventType, callback: EventCallback<T>): this {
		if (!this.callbacks.has(type)) {
			this.callbacks.set(type, []);
		}
		this.callbacks.get(type)!.push(callback);
		return this;
	}

	/**
	 * Registers a one-time event listener callback that automatically unregisters after first trigger.
	 */
	once(type: EventType, callback: EventCallback<T>): this {
		const onceWrapper: EventCallback<T> = (target: T, ...args: any[]) => {
			this.off(type, onceWrapper);
			callback(target, ...args);
		};
		return this.on(type, onceWrapper);
	}

	/**
	 * Removes an event listener callback.
	 */
	off(type: EventType, callback: EventCallback<T>): this {
		const callbacks = this.callbacks.get(type);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
		return this;
	}

	/**
	 * Triggers all registered callbacks for the specified event type.
	 */
	trigger(type: EventType, target: T, ...args: any[]): void {
		const callbacks = this.callbacks.get(type);
		if (callbacks) {
			for (const cb of callbacks) {
				try {
					cb(target, ...args);
				} catch (error) {
					console.warn(
						`[EventGroup] Error executing event callback for '${type}': ${error}`,
					);
				}
			}
		}
	}

	/**
	 * Clears all callbacks for a specific event type, or all event types if omitted.
	 */
	clear(type?: EventType): void {
		if (type) {
			this.callbacks.delete(type);
		} else {
			this.callbacks.clear();
		}
	}
}
