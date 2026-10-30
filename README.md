# vegetation

Procedural stylized trees, rocks, pebbles, grass and flowers for [three.js](https://threejs.org/).

Every asset is generated from a seed and has five LODs (LOD0–LOD3 meshes and an LOD4 billboard impostor) with procedural textures. Trees, rocks and pebbles also include collider meshes; grass and flowers do not. Rocks and pebbles can grow moss. Generation can run in Web Workers so the page keeps rendering. Works with `WebGLRenderer` and `WebGPURenderer`.

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

`TreeMesh.createLOD`, `RockMesh.createLOD`, `PebblesMesh.createLOD`, `GrassMesh.createLOD` and `FlowersMesh.createLOD` accept an optional second argument with the switch distances (five numbers, metres).

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
| `burial` | `0.48` | Fraction of the height sunk below the ground (0–1). |
| `stoneColor` | `0xffffff` | Stone tint. |
| `moss` | `0` | Moss coverage (0–1). |
| `mossColor` | `0x7cb83a` | Moss color. |
| `lod` | `0` | LOD level for `PebblesMesh`. |

### Grass — `GrassMesh`, `generateGrass`, `generateGrassAsync`

| Option | Default | Description |
| --- | --- | --- |
| `seed` | `1` | Random seed. |
| `height` | `0.45` | Blade height in metres. |
| `width` | `1.125 × height` | Blade width in metres. |
| `bladeColor` | `0x4b942b` | Blade color. |
| `lod` | `0` | LOD level for `GrassMesh`. |

### Flowers — `FlowersMesh`, `generateFlowers`, `generateFlowersAsync`

| Option | Default | Description |
| --- | --- | --- |
| `seed` | `1` | Random seed. |
| `variety` | `'allium'` | `'allium'`, `'daisy'`, `'tulip'`, `'poppy'`, `'bluebell'`, `'calla'` or `'primrose'`. |
| `count` | Varies by variety | Number of flowers (1–6). |
| `spread` | Varies by variety | Scatter radius in metres. |
| `height` | Varies by variety | Flower height in metres. |
| `petalColor` | Varies by variety | Petal color. |
| `centerColor` | Varies by variety | Center or flower stalk color, depending on variety. |
| `stemColor` | `0x2f6f1e` | Stem color. |
| `lod` | `0` | LOD level for `FlowersMesh`. |

## VegetationAsset

The `generate*` functions (and their async versions) return a `VegetationAsset`, which owns the geometries, materials and textures of all LODs. Share one asset across many meshes or instances.

| Member | Description |
| --- | --- |
| `geometries[ lod ]` | `BufferGeometry` for each LOD (0–4). |
| `materials` | Materials, one per part. |
| `collider` | Low-poly collider `BufferGeometry`, or `null`. |
| `getParts( lod )` | `{ part, geometry, material }[]` for building one mesh or `InstancedMesh` per part. |
| `setColor( part, color )` / `setColors( colors )` | Re-tint a part such as `'leaf'`, `'bark'`, `'blade'`, `'petal'`, `'rock'` or `'stone'`. |
| `getColor( part )` | Current color of a part. |
| `dispose()` | Free GPU resources. |

`new VegetationMesh( asset, lod, ownsAsset )` shows one LOD of an asset; with `ownsAsset = true` it disposes the asset together with the mesh. `VegetationMesh.fromAsset( asset, distances )` builds a `THREE.LOD`.

For instanced LOD4 billboards, call `orientBillboardInstances( instancedMesh, camera )` each frame so the cards face the camera.

### Optional runtime UASTC textures

UASTC texture compression is opt-in. Pass your own Three.js `KTX2Loader`, after calling `detectSupport( renderer )`, in the options for a `*Mesh`, `generate*` or `generate*Async` call. The RGBA `DataTexture`s remain visible while encoding and transcoding run; each compressed texture replaces its RGBA texture when ready. Colour changes and impostor rebakes schedule a new worker encode, and results from older requests are discarded.

```js
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { VegetationMesh, generateTreeAsync } from 'vegetation';

const ktx2Loader = new KTX2Loader();
ktx2Loader.detectSupport( renderer );

const asset = await generateTreeAsync( { seed: 7, ktx2Loader } );
scene.add( new VegetationMesh( asset, 0 ) );

function disposeVegetation() {
	asset.dispose();
	ktx2Loader.dispose();
}
```

The compressed GPU texture uses about **one quarter of RGBA8 memory** with 16-byte 4×4 formats such as ASTC, BC7, and ETC2 RGBA, including mip levels. Opaque ETC2 RGB uses 8 bytes per 4×4 block (about one eighth); an RGBA8 fallback has no GPU memory reduction. The format is selected by your `KTX2Loader` based on renderer support: ASTC, BC7, ETC2, or RGBA8 fallback. UASTC encoding and KTX2 packing run as one task per texture in the existing worker pool; if workers are unavailable, mipmap and alpha preparation yield every 8 KiB, encoding yields after every 16 4×4 blocks, and KTX2 packing yields every 64 KiB. The KTX2 transcoder is loaded and owned by your `KTX2Loader`; the vegetation library does not include or import it. The RGBA `DataTexture` GPU storage is released when its compressed replacement arrives, while its CPU pixels remain available for color changes. Without `ktx2Loader`, textures remain RGBA8 `DataTexture`s.

Opaque colour textures use UASTC mode 5; alpha-tested textures use mode 13 with a binary alpha channel. Mips retain their coverage-preserving filter, then alpha is thresholded to 0 or 255 at each level before encoding. This keeps the `alphaTest` cut-out mask exact after RGBA32, BC7 and ETC2 transcodes. Normal maps use UASTC mode 5 with a linear transfer function and `NoColorSpace`; X, Y and Z remain in RGB.

## Core data API

`vegetation/core` exposes only the data generators and their types, without a three.js dependency. `generateTreeData`, `generateRockData`, `generatePebblesData`, `generateGrassData` and `generateFlowersData` return `VegetationData` with typed arrays for positions, normals, UVs and indices per LOD, texture pixels and collider data. Their option types are `TreeOptions`, `RockOptions`, `PebblesOptions`, `GrassOptions` and `FlowersOptions`; shared data types include `VegetationData`, `MeshData`, `PartDef`, `TextureData` and `ColliderData`. Use it to bake assets offline or to feed another engine.

```js
import { generateRockData } from 'vegetation/core';
import type { RockOptions, VegetationData } from 'vegetation/core';

const options: RockOptions = { seed: 7 };
const data: VegetationData = generateRockData( options );
console.log( data.lods[ 0 ].positions.length / 3, 'vertices' );
```

## Public entry points

`vegetation` exports the five `*Mesh` classes, the corresponding `generate*` and `generate*Async` functions, `VegetationAsset`, `VegetationMesh`, `orientBillboardInstances`, `disposeVegetationWorkers`, and the option and data types. Internal utilities such as random-number generators, color conversion helpers and impostor material registration are not part of the public API.

`vegetation/webgpu` is a side-effect entry point with no named exports. Import it once to register the WebGPU impostor materials.

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
