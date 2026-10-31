export { VegetationAsset } from './three/VegetationAsset';
export type { KTX2LoaderLike, TextureCompressionReport, VegetationAssetOptions } from './three/VegetationAsset';
export { orientBillboardInstances, VegetationMesh } from './three/VegetationMesh';
export { disposeVegetationWorkers } from './three/meshShared';
export { FlowersMesh, GrassMesh, PebblesMesh, RockMesh, generateFlowers, generateFlowersAsync, generateGrass, generateGrassAsync, generatePebbles, generatePebblesAsync, generateRock, generateRockAsync } from './three/meshes';
export { BroadleafTreeMesh, generateBroadleafTree, generateBroadleafTreeAsync } from './three/trees/broadleaf';
export { BushMesh, generateBush, generateBushAsync } from './three/trees/bush';
export { PineTreeMesh, generatePineTree, generatePineTreeAsync } from './three/trees/pine';
export { FirTreeMesh, generateFirTree, generateFirTreeAsync } from './three/trees/fir';
export { WillowTreeMesh, generateWillowTree, generateWillowTreeAsync } from './three/trees/willow';
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
export type { BroadleafTreeMeshOptions, BroadleafTreeOptions } from './three/trees/broadleaf';
export type { BushMeshOptions, BushOptions } from './three/trees/bush';
export type { PineTreeMeshOptions, PineTreeOptions } from './three/trees/pine';
export type { FirTreeMeshOptions, FirTreeOptions } from './three/trees/fir';
export type { WillowTreeMeshOptions, WillowTreeOptions } from './three/trees/willow';
