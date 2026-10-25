export { hexToLinear, linearToSrgbByte } from './core/color';
export { createNoise3D } from './core/noise';
export { createRandom } from './core/random';
export type { Random } from './core/random';
export { VegetationAsset } from './three/VegetationAsset';
export { orientBillboardInstances, VegetationMesh } from './three/VegetationMesh';
export { TreeMesh, generateTree } from './three/meshes';
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
export type { TreeMeshOptions, TreeOptions } from './three/meshes';
