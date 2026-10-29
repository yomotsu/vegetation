export { hexToLinear, linearToSrgbByte } from './core/color';
export { impostorCardWeights } from './core/impostorFade';
export { createNoise3D } from './core/noise';
export { createRandom } from './core/random';
export type { Random } from './core/random';
export { VegetationAsset } from './three/VegetationAsset';
export { orientBillboardInstances, VegetationMesh } from './three/VegetationMesh';
export { registerImpostorMaterialFactory } from './three/impostorMaterialFactory';
export type { VegetationMaterial } from './three/impostorMaterialFactory';
export { GrassMesh, PebblesMesh, RockMesh, TreeMesh, disposeVegetationWorkers, generateGrass, generateGrassAsync, generatePebbles, generatePebblesAsync, generateRock, generateRockAsync, generateTree, generateTreeAsync } from './three/meshes';
export type {
	ColliderData,
	Color3,
	LodLevel,
	MeshData,
	MeshGroup,
	PartDef,
	TextureData,
	TextureGeneratorDef,
	VegetationData,
} from './core/types';
export type { GrassMeshOptions, GrassOptions, PebblesMeshOptions, PebblesOptions, RockMeshOptions, RockOptions, TreeMeshOptions, TreeOptions } from './three/meshes';
