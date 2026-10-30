export { VegetationAsset } from './three/VegetationAsset';
export type { KTX2LoaderLike, TextureCompressionReport, VegetationAssetOptions } from './three/VegetationAsset';
export { orientBillboardInstances, VegetationMesh } from './three/VegetationMesh';
export { disposeVegetationWorkers } from './three/meshShared';
export { FlowersMesh, GrassMesh, PebblesMesh, RockMesh, generateFlowers, generateFlowersAsync, generateGrass, generateGrassAsync, generatePebbles, generatePebblesAsync, generateRock, generateRockAsync } from './three/meshes';
export { TreeMesh, generateTree, generateTreeAsync } from './three/trees/fir';
export { BroadleafTreeMesh, generateBroadleafTree, generateBroadleafTreeAsync } from './three/trees/broadleaf';
export type {
	ColliderData,
	Color3,
	ImpostorView,
	LodLevel,
	MeshData,
	MeshGroup,
	PartDef,
	TextureData,
	TextureGeneratorDef,
	Vec3,
	VegetationData,
} from './core/types';
export type { FlowersMeshOptions, FlowersOptions, GrassMeshOptions, GrassOptions, PebblesMeshOptions, PebblesOptions, RockMeshOptions, RockOptions } from './three/meshes';
export type { TreeMeshOptions, TreeOptions } from './three/trees/fir';
export type { BroadleafTreeMeshOptions, BroadleafTreeOptions } from './three/trees/broadleaf';
