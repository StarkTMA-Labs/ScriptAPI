import {
	BlockInventoryComponent,
	BlockPermutation,
	Entity,
	EntityEquippableComponent,
	EntityInventoryComponent,
	EquipmentSlot,
	ItemStack,
	StructureSaveMode,
	world,
} from "@minecraft/server";

export function restoreInventory(entity: Entity, id: string) {
	const blockLocation = entity.dimension.getBlockFromRay(entity.location, {
		x: 0,
		y: -1,
		z: 0,
	})!.block.location;
	blockLocation.y++;
	const blockLocation2 = { ...blockLocation, y: blockLocation.y + 1 };

	const savedStructure = world.structureManager.get(id);
	if (!savedStructure) return;

	world.structureManager.place(savedStructure, entity.dimension, blockLocation, {
		waterlogged: false,
	});
	world.structureManager.delete(id);

	const block = entity.dimension.getBlock(blockLocation)!;
	const block2 = entity.dimension.getBlock(blockLocation2)!;

	const equipment = entity.getComponent(
		EntityEquippableComponent.componentId,
	) as EntityEquippableComponent;
	const invComponent = entity.getComponent(
		EntityInventoryComponent.componentId,
	) as EntityInventoryComponent;
	const blockInventory = block.getComponent(
		BlockInventoryComponent.componentId,
	) as BlockInventoryComponent;
	const blockInventory2 = block2.getComponent(
		BlockInventoryComponent.componentId,
	) as BlockInventoryComponent;

	const slots = Object.values(EquipmentSlot);
	slots.forEach((slot) => {
		equipment.setEquipment(
			slot,
			blockInventory.container!.getItem(slots.indexOf(slot))!,
		);
	});

	Array(41)
		.fill(0)
		.forEach((_, i) => {
			if (i < invComponent.container!.size) {
				if (i < 9) {
					// First chest: starts filling from slot 5
					blockInventory.container!.moveItem(
						i + 5,
						i,
						invComponent.container!,
					);
				} else {
					// Second chest: adjusts index for 0-26 range starting from slot 0
					blockInventory2.container!.moveItem(
						i - 9,
						i,
						invComponent.container!,
					);
				}
			}
		});

	blockInventory.container!.clearAll();
	blockInventory2.container!.clearAll();
	block.setPermutation(BlockPermutation.resolve("minecraft:air"));
	block2.setPermutation(BlockPermutation.resolve("minecraft:air"));
}

export function saveInventory(
	entity: Entity,
	id: string,
	clearAll: boolean = false,
): number {
	const blockLocation = entity.dimension.getTopmostBlock(entity.location)!.location;
	blockLocation.y++;
	const blockLocation2 = { ...blockLocation, y: blockLocation.y + 1 };

	const block = entity.dimension.getBlock(blockLocation)!;
	const block2 = entity.dimension.getBlock(blockLocation2)!;

	block.setPermutation(BlockPermutation.resolve("minecraft:air"));
	block2.setPermutation(BlockPermutation.resolve("minecraft:air"));
	block.setPermutation(BlockPermutation.resolve("minecraft:chest"));
	block2.setPermutation(BlockPermutation.resolve("minecraft:chest"));

	const equipment = entity.getComponent(
		EntityEquippableComponent.componentId,
	) as EntityEquippableComponent;
	const invComponent = entity.getComponent(
		EntityInventoryComponent.componentId,
	) as EntityInventoryComponent;
	const blockInventory = block.getComponent(
		BlockInventoryComponent.componentId,
	) as BlockInventoryComponent;
	const blockInventory2 = block2.getComponent(
		BlockInventoryComponent.componentId,
	) as BlockInventoryComponent;

	const itemCount =
		invComponent.container!.size - invComponent.container!.emptySlotsCount;

	Object.values(EquipmentSlot).forEach((slot) => {
		if (clearAll) {
			equipment.setEquipment(slot);
		}
		blockInventory.container!.addItem(
			equipment.getEquipment(slot) ?? new ItemStack("minecraft:air", 1),
		);
	});

	if (clearAll) {
	}

	Array(41)
		.fill(0)
		.forEach((_, i) => {
			if (i < invComponent.container!.size) {
				if (i < 9) {
					// First chest: starts filling from slot 5
					invComponent.container!.moveItem(
						i,
						5 + i,
						blockInventory.container!,
					);
				} else {
					// Second chest: adjusts index for 0-26 range starting from slot 0
					invComponent.container!.moveItem(
						i,
						i - 9,
						blockInventory2.container!,
					);
				}
				if (clearAll) {
					invComponent.container!.setItem(i);
				}
			}
		});

	world.structureManager.delete(id);
	world.structureManager.createFromWorld(
		id,
		entity.dimension,
		blockLocation,
		blockLocation2,
		{
			saveMode: StructureSaveMode.World,
		},
	);

	blockInventory.container!.clearAll();
	blockInventory2.container!.clearAll();

	block.setPermutation(BlockPermutation.resolve("minecraft:air"));
	block2.setPermutation(BlockPermutation.resolve("minecraft:air"));

	return itemCount;
}
