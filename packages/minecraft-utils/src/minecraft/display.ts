import { Player, world } from "@minecraft/server";

export function displayActionbar(player: Player | undefined, ...message: any) {
	const text = message.join(" ");
	let target;
	let selector;
	target = player && player.isValid ? player : world.getDimension("overworld");
	selector = player ? `@s` : `@a`;
	target.runCommand(`title ${selector} actionbar ${JSON.stringify(text)}`);
}
