# vegetation

Procedural stylized trees, rocks and pebbles for [three.js](https://threejs.org/).

Every asset is generated from a seed and comes with five levels of detail (LOD0–LOD3 meshes and an LOD4 billboard impostor), procedural textures, and a collider mesh. Rocks and pebbles can grow moss. Generation can run in Web Workers so the page keeps rendering. Works with `WebGLRenderer` and `WebGPURenderer`.

## Install

```sh
npm install vegetation three
```

`three` (r170 or later) is a peer dependency.

## Quick start

```js
import { RockMesh, TreeMesh } from 'vegetation';

const tree = new TreeMesh( { seed: 3, height: 8 } );
scene.add( tree );

const rock = new RockMesh( { seed: 7, size: 4, moss: 0.4 } );
rock.position.set( 6, 0, 0 );
scene.add( rock );
```

### Automatic LOD switching

```js
import { RockMesh } from 'vegetation';

// Returns a THREE.LOD that switches LOD0–LOD4 by camera distance.
const lod = RockMesh.createLOD( { seed: 7 } );
scene.add( lod );
```

`TreeMesh.createLOD`, `RockMesh.createLOD` and `PebblesMesh.createLOD` accept an optional second argument with the switch distances (five numbers, metres).

### Generate without blocking the page

The `*Async` functions build the asset in a pool of module Web Workers and resolve with a `VegetationAsset`. The result is byte-identical to the synchronous API. Without Worker support (Node.js, SSR, tests) they fall back to the synchronous path.

```js
import { VegetationMesh, generateRockAsync, disposeVegetationWorkers } from 'vegetation';

const asset = await generateRockAsync( { seed: 7, moss: 0.5 } );
scene.add( new VegetationMesh( asset, 0, true ) );

// When you no longer need to generate anything:
disposeVegetationWorkers();
```

Your bundler must support `new Worker( new URL( '...', import.meta.url ), { type: 'module' } )`; Vite, webpack 5 and Rollup-based setups do.

### WebGPU

When rendering with `WebGPURenderer`, import the WebGPU entry once. It registers node materials for the LOD4 impostor fade.

```js
import 'vegetation/webgpu';
```

With `WebGPURenderer` shadows, build one mesh per part with `asset.getParts( lod )` instead of combining `asset.geometries[ lod ]` with the material array.

## Species and options

All options are optional.

### Tree — `TreeMesh`, `generateTree`, `generateTreeAsync`

| Option | Default | Description |
| --- | --- | --- |
| `seed` | `1` | Random seed. |
| `height` | `7.5` | Tree height in metres. The trunk also extends below `y = 0` by a length that scales with the height. |
| `crownSize` | `1` | Crown width multiplier. |
| `branchCount` | `10` | Number of branch tiers. |
| `leafColor` | `0x2f7d1f` | Leaf color. |
| `barkColor` | `0x6b4c32` | Bark color. |
| `lod` | `0` | LOD level for `TreeMesh`. |

### Rock — `RockMesh`, `generateRock`, `generateRockAsync`

| Option | Default | Description |
| --- | --- | --- |
| `seed` | `1` | Random seed. |
| `size` | `6.4` | Horizontal size in metres. |
| `roughness` | `1.2` | Shape irregularity (0–1.5). |
| `flatness` | `0.04` | How flat the rock is (0–1). |
| `weathering` | `0.25` | Rounding of convex corners (0–1). |
| `burial` | varies by seed | Fraction of the height sunk below the ground (0–1). |
| `closeBottom` | `false` | Build a fully detailed, closed underside instead of omitting the buried bottom. |
| `rockColor` | `0xffffff` | Stone tint. |
| `moss` | `0` | Moss coverage (0–1). Moss grows on up-facing surfaces, along the ground line and in hollows. |
| `mossColor` | `0x7cb83a` | Moss color. |
| `lod` | `0` | LOD level for `RockMesh`. |

### Pebbles — `PebblesMesh`, `generatePebbles`, `generatePebblesAsync`

| Option | Default | Description |
| --- | --- | --- |
| `seed` | `1` | Random seed. |
| `count` | `16` | Number of pebbles. |
| `spread` | `1.56` | Scatter radius in metres. |
| `size` | `0.22` | Average pebble size in metres. |
| `sizeVariation` | `0.8` | Size variation (0–0.9). |
| `burial` | `0.4` | Fraction of the height sunk below the ground (0–1). |
| `stoneColor` | `0xffffff` | Stone tint. |
| `moss` | `0` | Moss coverage (0–1). |
| `mossColor` | `0x7cb83a` | Moss color. |
| `lod` | `0` | LOD level for `PebblesMesh`. |

## VegetationAsset

`generateTree`, `generateRock` and `generatePebbles` (and their async versions) return a `VegetationAsset`, which owns the geometries, materials and textures of all LODs. Share one asset across many meshes or instances.

| Member | Description |
| --- | --- |
| `geometries[ lod ]` | `BufferGeometry` for each LOD (0–4). |
| `materials` | Materials, one per part. |
| `collider` | Low-poly collider `BufferGeometry`, or `null`. |
| `getParts( lod )` | `{ part, geometry, material }[]` for building one mesh or `InstancedMesh` per part. |
| `setColor( part, color )` / `setColors( colors )` | Re-tint a part (`'leaf'`, `'bark'`, `'rock'`, `'stone'`). |
| `getColor( part )` | Current color of a part. |
| `dispose()` | Free GPU resources. |

`new VegetationMesh( asset, lod, ownsAsset )` shows one LOD of an asset; with `ownsAsset = true` it disposes the asset together with the mesh. `VegetationMesh.fromAsset( asset, distances )` builds a `THREE.LOD`.

For instanced LOD4 billboards, call `orientBillboardInstances( instancedMesh, camera )` each frame so the cards face the camera.

## Core data API

`vegetation/core` exposes the generators without any three.js dependency: `generateTreeData`, `generateRockData` and `generatePebblesData` return plain typed arrays (positions, normals, UVs, indices per LOD, texture pixels and collider data). Use it to bake assets offline or to feed another engine.

```js
import { generateRockData } from 'vegetation/core';

const data = generateRockData( { seed: 7 } );
console.log( data.lods[ 0 ].positions.length / 3, 'vertices' );
```

## Development

```sh
npm install
npm run demo          # WebGL demo
npm run demo:webgpu   # WebGPU demo
npm test
npm run build
```

## License

MIT
