# @starktma/minecraft-utils

TypeScript utilities for the Minecraft Bedrock Script API. Each module is its own import path.

| Import path | Contents |
| --- | --- |
| `@starktma/minecraft-utils` | `setNamespace`, `getNamespace` |
| `@starktma/minecraft-utils/math` | `Vector`, `Trigonometry`, `clamp`, `inRange`, `hexToRgba`, `Perlin2D` |
| `@starktma/minecraft-utils/spatial` | `GraphSearch`, `BFSScanner`, `VolumeScanResult`, `AStarPathfinder`, `getBlocksInASphere`, `getBlocksInRadius` |
| `@starktma/minecraft-utils/minecraft` | `EffectManager`, `StructuresManager`, inventory save/restore, entity-relative positions, grid snapping, `displayActionbar` |
| `@starktma/minecraft-utils/database` | `SimpleDatabase`, `SimpleObject` |
| `@starktma/minecraft-utils/entity-system` | `EntityWrapper`, `PlayerWrapper`, `EntityManager`, `PlayerManager`, `AIGoal`, `AIGoalSystem`, `EventGroup`, `SpatialTracker`, `EntityAttributeDatabase` |
| `@starktma/minecraft-utils/game-state-machine` | `stateMachine`, `mainBranch`, `mainLevel0` |

## Source layout

```
src/
  constants.ts            namespace configuration
  math/                   Vector, Trigonometry, numbers, color, Perlin2D
  spatial/                graph search, volume scanning, pathfinding, block queries
  minecraft/              EffectManager, StructuresManager, inventory, entityRelative, grid, display
  database/               DatabaseManager, SimpleDatabase, interfaces
  entity-system/          entity and player wrappers, managers, AI goals, spatial tracking
  game-state-machine/     StateMachine, Branch, Level, BranchDatabase, PlayerDatabase, interfaces
```

Files that hold one class are named after it in PascalCase. Files that hold a group of functions use camelCase. Each module's `index.ts` only re-exports.

## Namespace

Identifiers, database keys and event names are prefixed with a namespace, `starktma` by default. Set yours once, before anything else from the package runs:

```typescript
import { setNamespace } from "@starktma/minecraft-utils";

setNamespace("myproject");
```

## database

`SimpleDatabase<T>` stores objects with an `id` in a dynamic property of the world, or of an entity. `DatabaseManager` handles the JSON serialisation and splits values that exceed the dynamic property size limit.

```typescript
import { Vector3 } from "@minecraft/server";
import { SimpleDatabase, SimpleObject } from "@starktma/minecraft-utils/database";

interface Home extends SimpleObject {
	location: Vector3;
}

class Homes extends SimpleDatabase<Home> {
	private static instance: Homes | undefined;

	private constructor() {
		super("homes");
	}

	static get(): Homes {
		return (Homes.instance ??= new Homes());
	}
}
```

The constructor reads the world, so create the instance after the world has loaded.

## spatial

`GraphSearch` is a breadth-first search over any graph. You give it how to find a node's neighbours and how to tell nodes apart, and each visit carries its depth and the visit it came from.

```typescript
import { GraphSearch } from "@starktma/minecraft-utils/spatial";

const search = new GraphSearch<Pipe>(
	(pipe) => pipe.connectedPipes,
	(pipe) => Vector.stringify(pipe.location),
);
for (const visit of search.breadthFirst(start, 512)) {
	visit.node;
	visit.depth;
	GraphSearch.pathTo(visit);
}
```

`BFSScanner` is a low-level flood fill over a bounded block volume, written to avoid allocations, and meant to run inside `system.runJob`.

## game-state-machine

Manages branches, levels and player states for maps and add-ons. It is still under development.

```typescript
import { stateMachine } from "@starktma/minecraft-utils/game-state-machine";

const branch = stateMachine.createBranch("myCustomBranch");
const level1 = branch.addLevel("level1", true);

level1.events.onPlayerJoinLevel((player) => {
	// ...
});
```

- **StateMachine:** branches, levels and player states.
- **Branch:** a pathway holding several levels.
- **Level:** one level with its own lifecycle and events.
- **BranchDatabase, PlayerDatabase:** persistent branch and player data.
