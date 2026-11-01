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
import { FirTreeMesh, RockMesh } from 'vegetation';

const tree = new FirTreeMesh( { seed: 3, height: 6 } );
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

`FirTreeMesh.createLOD`, `RockMesh.createLOD`, `PebblesMesh.createLOD`, `GrassMesh.createLOD`, and each flower mesh's `createLOD` accept an optional second argument with the switch distances (five numbers, metres).

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

### Fir — `FirTreeMesh`, `generateFirTree`, `generateFirTreeAsync`

| Option | Default | Description |
| --- | --- | --- |
| `seed` | `1` | Random seed. |
| `height` | `6` | Tree height in metres. The trunk also extends below `y = 0` by a length that scales with the height. |
| `leafColor` | `0x4b6c56` | Needle color. The twigs keep their own grey-brown color. |
| `barkColor` | `0x9a9183` | Bark color. |
| `lod` | `0` | LOD level for `FirTreeMesh`. |

### Bamboo — `BambooTreeMesh`, `generateBambooTree`, `generateBambooTreeAsync`

| Option | Default | Description |
| --- | --- | --- |
| `seed` | `1` | Random seed. |
| `height` | `8` | Tree height in metres. The single culm extends a little below `y = 0`; taller trees gain naturally spaced upper tiers while keeping culm and leaf size stable. |
| `leafColor` | `0x70a94b` | Leaf blade color. |
| `barkColor` | `0x477f48` | Culm and node color. |
| `lod` | `0` | LOD level for `BambooTreeMesh`. |

Bamboo uses an 8 m default height, a segmented single culm, paired upper-node branches, and a 512-pixel atlas of seed-selected leaf sprays. Its culm diameter and individual leaf size stay stable as height adds upper tiers. LOD1 preserves the culm and node silhouette while reducing sprays; LOD2 also thins branch detail; LOD3/4 use the shared six-plane and camera-facing impostors. The demo supports Bamboo LOD selection and compare view.

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

### Flowers

Use a class for each flower type, just as for the tree types:

```js
import { TulipMesh, generateBluebellAsync } from 'vegetation';

const tulips = new TulipMesh( { seed: 3, count: 4, petalColor: 0xd8322a } );
const bluebells = await generateBluebellAsync( { seed: 8 } );
```

The available pairs are `AlliumMesh` / `generateAllium`, `DaisyMesh` / `generateDaisy`, `TulipMesh` / `generateTulip`, `PoppyMesh` / `generatePoppy`, `BluebellMesh` / `generateBluebell`, `CallaMesh` / `generateCalla`, and `PrimroseMesh` / `generatePrimrose`. Each also has a `generate*Async` function and an options type named `*MeshOptions`.

`FlowersMesh`, `generateFlowers`, and `generateFlowersAsync` remain available as generic APIs. Set `variety` to choose a type when using them.

| Option | Default | Description |
| --- | --- | --- |
| `seed` | `1` | Random seed. |
| `variety` | `'allium'` | Generic API only: `'allium'`, `'daisy'`, `'tulip'`, `'poppy'`, `'bluebell'`, `'calla'` or `'primrose'`. |
| `count` | Varies by type | Number of flowers (1–6). |
| `spread` | Varies by type | Scatter radius in metres. |
| `height` | Varies by type | Flower height in metres. |
| `petalColor` | Varies by type | Petal color. |
| `centerColor` | Varies by type | Center or flower stalk color, depending on type. |
| `stemColor` | `0x2f6f1e` | Stem color. |
| `lod` | `0` | LOD level for the selected flower mesh. |

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

### Runtime UASTC textures

UASTC texture compression is on by default. The library starts encoding texture data in its shared worker pool and keeps the RGBA `DataTexture`s visible until a renderer is available and the compressed replacement is ready. A `VegetationMesh` registers its renderer automatically on its first render. For an asset used only through `getParts()` and `InstancedMesh`, call `asset.setRenderer( renderer )` once after the renderer is initialized. Color changes and impostor rebakes schedule a new worker encode, and results from older requests are discarded.

Pass `compressTextures: false` to a `*Mesh`, `generate*`, `generate*Async`, or `VegetationAsset` constructor to keep its textures as RGBA:

```js
import { generateFirTreeAsync } from 'vegetation';

const asset = await generateFirTreeAsync( { seed: 7, compressTextures: false } );
```

With the default internal compression, environments without Web Workers (including Node.js, SSR, and test environments) keep RGBA textures. A caller-owned loader can still use the sliced main-thread fallback. No transcoder files are fetched until an encoded texture is parsed by a renderer-backed `KTX2Loader`. The library creates and shares its own loader per renderer, calls `detectSupport( renderer )` automatically, and disposes those loaders from `disposeVegetationWorkers()`.

```js
import { VegetationMesh, generateFirTreeAsync, disposeVegetationWorkers } from 'vegetation';

const asset = await generateFirTreeAsync( { seed: 7 } );
scene.add( new VegetationMesh( asset ) ); // renderer is registered on the first render

// For InstancedMesh parts, call this once after renderer initialization:
asset.setRenderer( renderer );

asset.dispose();
disposeVegetationWorkers();
```

The first transcode downloads Three.js's `basis_transcoder.js` and `basis_transcoder.wasm`, resolved by `KTX2Loader` relative to its module URL. The Basis transcoder converts the universal UASTC data into the GPU format selected for the renderer. With Three.js r186 the two files total about **585 kB raw / 260 kB gzip**. Your bundler or server must make both files available at those resolved URLs. If you need to choose their location, create and pass your own loader after calling `setTranscoderPath()` and `detectSupport( renderer )`:

```js
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { generateFirTreeAsync } from 'vegetation';

const ktx2Loader = new KTX2Loader()
	.setTranscoderPath( '/assets/basis/' )
	.detectSupport( renderer );
const asset = await generateFirTreeAsync( { seed: 7, ktx2Loader } );
```

The loader module also imports `ktx-parse` and `zstddec` as normal Three.js modules, which your app bundler resolves or serves. This package keeps Three and those module paths external, so their code is not embedded in vegetation's published bundle. Passing your own loader takes precedence over the internal loader. Dispose a caller-owned loader yourself.

The compressed GPU texture uses about **one quarter of RGBA8 memory** with 16-byte 4×4 formats such as ASTC, BC7, and ETC2 RGBA, including mip levels. Opaque ETC2 RGB uses 8 bytes per 4×4 block (about one eighth); an RGBA8 fallback has no GPU memory reduction. The format is selected by `KTX2Loader` based on renderer support: ASTC, BC7, ETC2, or RGBA8 fallback. UASTC encoding and KTX2 packing run as one task per texture in the existing worker pool; when an explicitly supplied loader is used without Workers, mipmap and alpha preparation yield every 8 KiB, encoding yields after every 16 4×4 blocks, and KTX2 packing yields every 64 KiB. The RGBA `DataTexture` GPU storage is released when its compressed replacement arrives, while its CPU pixels remain available for color changes.

Opaque colour textures use UASTC mode 5; alpha-tested textures use mode 13 with a binary alpha channel. Mips retain their coverage-preserving filter, then alpha is thresholded to 0 or 255 at each level before encoding. This keeps the `alphaTest` cut-out mask exact after RGBA32, BC7 and ETC2 transcodes. Normal maps use UASTC mode 5 with a linear transfer function and `NoColorSpace`; X, Y and Z remain in RGB.

## Core data API

`vegetation/core` exposes only the data generators and their types, without a three.js dependency. `generateFirTreeData`, `generateBambooTreeData`, `generateRockData`, `generatePebblesData`, `generateGrassData` and `generateFlowersData` return `VegetationData` with typed arrays for positions, normals, UVs and indices per LOD, texture pixels and collider data. Their option types are `FirTreeOptions`, `BambooTreeOptions`, `RockOptions`, `PebblesOptions`, `GrassOptions` and `FlowersOptions`; shared data types include `VegetationData`, `MeshData`, `PartDef`, `TextureData` and `ColliderData`. Use it to bake assets offline or to feed another engine.

```js
import { generateRockData } from 'vegetation/core';
import type { RockOptions, VegetationData } from 'vegetation/core';

const options: RockOptions = { seed: 7 };
const data: VegetationData = generateRockData( options );
console.log( data.lods[ 0 ].positions.length / 3, 'vertices' );
```

## Public entry points

`vegetation` exports the vegetation `*Mesh` classes, corresponding `generate*` and `generate*Async` functions, `VegetationAsset`, `VegetationMesh`, `orientBillboardInstances`, `disposeVegetationWorkers`, and the option and data types. Internal utilities such as random-number generators, color conversion helpers and impostor material registration are not part of the public API.

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
