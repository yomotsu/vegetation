import { generateAllium, generateAlliumAsync, generateBluebell, generateBluebellAsync, generateCalla, generateCallaAsync, generateDaisy, generateDaisyAsync, generatePoppy, generatePoppyAsync, generatePrimrose, generatePrimroseAsync, generateTulip, generateTulipAsync, generateBroadleafTree, generateBroadleafTreeAsync, generateBush, generateBushAsync, generatePineTree, generatePineTreeAsync, generateFirTree, generateFirTreeAsync, generateWillowTree, generateWillowTreeAsync, generateBambooTree, generateBambooTreeAsync, generateBambooShoot, generateBambooShootAsync, generateGrass, generateGrassAsync, generatePebbles, generatePebblesAsync, generateRock, generateRockAsync } from '../src/index';
import type { AlliumMeshOptions, BluebellMeshOptions, CallaMeshOptions, DaisyMeshOptions, PoppyMeshOptions, PrimroseMeshOptions, TulipMeshOptions, BroadleafTreeMeshOptions, BushMeshOptions, PineTreeMeshOptions, FirTreeMeshOptions, WillowTreeMeshOptions, BambooTreeMeshOptions, BambooShootMeshOptions, GrassMeshOptions, PebblesMeshOptions, RockMeshOptions, VegetationAsset } from '../src/index';
import { DEFAULT_BROADLEAF_TREE_BARK_COLOR, DEFAULT_BROADLEAF_TREE_HEIGHT, DEFAULT_BROADLEAF_TREE_LEAF_COLOR } from '../src/core/trees/broadleaf';
import { DEFAULT_BUSH_BARK_COLOR, DEFAULT_BUSH_HEIGHT, DEFAULT_BUSH_LEAF_COLOR } from '../src/core/trees/bush';
import { DEFAULT_PINE_TREE_BARK_COLOR, DEFAULT_PINE_TREE_HEIGHT, DEFAULT_PINE_TREE_LEAF_COLOR } from '../src/core/trees/pine';
import { DEFAULT_FIR_TREE_BARK_COLOR, DEFAULT_FIR_TREE_HEIGHT, DEFAULT_FIR_TREE_LEAF_COLOR } from '../src/core/trees/fir';
import { DEFAULT_WILLOW_TREE_BARK_COLOR, DEFAULT_WILLOW_TREE_HEIGHT, DEFAULT_WILLOW_TREE_LEAF_COLOR } from '../src/core/trees/willow';
import { DEFAULT_BAMBOO_TREE_BARK_COLOR, DEFAULT_BAMBOO_TREE_HEIGHT, DEFAULT_BAMBOO_TREE_LEAF_COLOR } from '../src/core/trees/bamboo';
import { DEFAULT_BAMBOO_SHOOT_CORE_COLOR, DEFAULT_BAMBOO_SHOOT_HEIGHT, DEFAULT_BAMBOO_SHOOT_SHEATH_COLOR } from '../src/core/trees/bambooShoot';

export interface VegetationKind {
	group: string;
	name: string;
	/** Number of implemented LODs (missing runtime slots duplicate LOD0). */
	lodCount?: number;
	flowerVariety?: keyof typeof flowerPetalColorPresets;
	create: ( opts: Record<string, unknown> ) => VegetationAsset;
	createAsync: ( opts: Record<string, unknown> ) => Promise<VegetationAsset>;
	colorParts: string[];
	colorOptions: Record<string, string>;
	defaultColors: Record<string, string>;
	textureColors?: Record<string, string>;
	options: Record<string, number | boolean | string>;
}

export const leafColorPresets = {
	green: '#2f7d1f',
	'autumn red': '#b5361c',
	orange: '#d9781e',
	yellow: '#d8b62a',
};

export const grassColorPresets = {
	green: '#4b942b',
	'dry yellow': '#b8a64a',
	autumn: '#a86a2c',
};

export const flowerPetalColorPresets = {
	allium: { purple: '#8b5fbf', white: '#f1efe8', lavender: '#a98bd6', pink: '#e889b5', orange: '#d2600c' },
	daisy: { orange: '#d2600c', yellow: '#f2c230', red: '#c8352a', white: '#f1efe8' },
	tulip: { red: '#d8322a', yellow: '#f2c230', pink: '#ef7fa8', white: '#f4f1ea', orange: '#f07a28' },
	poppy: { red: '#d8281e', orange: '#f08a24', white: '#f4f1ea', pink: '#ef8fb0' },
	bluebell: { violet: '#7a5ad8', blue: '#4f7fe0', pink: '#ec90c0', white: '#f2f0f6' },
	calla: { white: '#f4f1e8', yellow: '#f2c94a', pink: '#ee9ab8', purple: '#6e3a8a' },
	primrose: { yellow: '#f2d24a', pink: '#f08ab8', purple: '#9a6ad8', white: '#f6f2e6' },
};

export const flowerVarietyDefaults = {
	allium: { count: 6, spread: 0.29, height: 0.37, petal: '#8b5fbf', centerColor: '#5c3d7a' },
	daisy: { count: 6, spread: 0.37, height: 0.285, petal: '#d2600c', centerColor: '#8a7414' },
	tulip: { count: 4, spread: 0.3, height: 0.36, petal: '#d8322a', centerColor: '#000000' },
	poppy: { count: 3, spread: 0.28, height: 0.42, petal: '#d8281e', centerColor: '#1e1a18' },
	bluebell: { count: 3, spread: 0.28, height: 0.36, petal: '#7a5ad8', centerColor: '#2f6f1e' },
	calla: { count: 3, spread: 0.3, height: 0.42, petal: '#f4f1e8', centerColor: '#f0c030' },
	primrose: { count: 4, spread: 0.26, height: 0.12, petal: '#f2d24a', centerColor: '#c0a020' },
};

function toColorHex( color: number ): string {

	return `#${ color.toString( 16 ).padStart( 6, '0' ) }`;

}

type FlowerCreator = {
	create: ( opts: Record<string, unknown> ) => VegetationAsset;
	createAsync: ( opts: Record<string, unknown> ) => Promise<VegetationAsset>;
};

const flowerCreators: Record<keyof typeof flowerPetalColorPresets, FlowerCreator> = {
	allium: {
		create: ( opts ) => generateAllium( opts as AlliumMeshOptions ),
		createAsync: ( opts ) => generateAlliumAsync( opts as AlliumMeshOptions ),
	},
	daisy: {
		create: ( opts ) => generateDaisy( opts as DaisyMeshOptions ),
		createAsync: ( opts ) => generateDaisyAsync( opts as DaisyMeshOptions ),
	},
	tulip: {
		create: ( opts ) => generateTulip( opts as TulipMeshOptions ),
		createAsync: ( opts ) => generateTulipAsync( opts as TulipMeshOptions ),
	},
	poppy: {
		create: ( opts ) => generatePoppy( opts as PoppyMeshOptions ),
		createAsync: ( opts ) => generatePoppyAsync( opts as PoppyMeshOptions ),
	},
	bluebell: {
		create: ( opts ) => generateBluebell( opts as BluebellMeshOptions ),
		createAsync: ( opts ) => generateBluebellAsync( opts as BluebellMeshOptions ),
	},
	calla: {
		create: ( opts ) => generateCalla( opts as CallaMeshOptions ),
		createAsync: ( opts ) => generateCallaAsync( opts as CallaMeshOptions ),
	},
	primrose: {
		create: ( opts ) => generatePrimrose( opts as PrimroseMeshOptions ),
		createAsync: ( opts ) => generatePrimroseAsync( opts as PrimroseMeshOptions ),
	},
};

function createFlowerKind( variety: keyof typeof flowerPetalColorPresets, name: string ): VegetationKind {

	const defaults = flowerVarietyDefaults[ variety ];
	return {
		group: 'Flowers',
		name,
		flowerVariety: variety,
		create: flowerCreators[ variety ].create,
		createAsync: flowerCreators[ variety ].createAsync,
		colorParts: [ 'petal', 'stem' ],
		colorOptions: { petal: 'petalColor', stem: 'stemColor' },
		defaultColors: { petal: defaults.petal, stem: '#2f6f1e', centerColor: defaults.centerColor },
		textureColors: { centerColor: defaults.centerColor },
		options: { seed: 1, count: defaults.count, spread: defaults.spread, height: defaults.height },
	};

}

export const kinds: VegetationKind[] = [
	{
		group: 'Trees',
		name: 'Broadleaf',
		create: ( opts ) => generateBroadleafTree( opts as BroadleafTreeMeshOptions ),
		createAsync: ( opts ) => generateBroadleafTreeAsync( opts as BroadleafTreeMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
		colorOptions: { leaf: 'leafColor', bark: 'barkColor' },
		defaultColors: { leaf: toColorHex( DEFAULT_BROADLEAF_TREE_LEAF_COLOR ), bark: toColorHex( DEFAULT_BROADLEAF_TREE_BARK_COLOR ) },
		options: { seed: 1, height: DEFAULT_BROADLEAF_TREE_HEIGHT },
	},
	{
		group: 'Plants',
		name: 'Bush',
		create: ( opts ) => generateBush( opts as BushMeshOptions ),
		createAsync: ( opts ) => generateBushAsync( opts as BushMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
		colorOptions: { leaf: 'leafColor', bark: 'barkColor' },
		defaultColors: { leaf: toColorHex( DEFAULT_BUSH_LEAF_COLOR ), bark: toColorHex( DEFAULT_BUSH_BARK_COLOR ) },
		options: { seed: 1, height: DEFAULT_BUSH_HEIGHT },
	},
	{
		group: 'Trees',
		name: 'Pine',
		create: ( opts ) => generatePineTree( opts as PineTreeMeshOptions ),
		createAsync: ( opts ) => generatePineTreeAsync( opts as PineTreeMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
		colorOptions: { leaf: 'leafColor', bark: 'barkColor' },
		defaultColors: { leaf: toColorHex( DEFAULT_PINE_TREE_LEAF_COLOR ), bark: toColorHex( DEFAULT_PINE_TREE_BARK_COLOR ) },
		options: { seed: 1, height: DEFAULT_PINE_TREE_HEIGHT },
	},
	{
		group: 'Trees',
		name: 'Fir',
		create: ( opts ) => generateFirTree( opts as FirTreeMeshOptions ),
		createAsync: ( opts ) => generateFirTreeAsync( opts as FirTreeMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
		colorOptions: { leaf: 'leafColor', bark: 'barkColor' },
		defaultColors: { leaf: toColorHex( DEFAULT_FIR_TREE_LEAF_COLOR ), bark: toColorHex( DEFAULT_FIR_TREE_BARK_COLOR ) },
		options: { seed: 1, height: DEFAULT_FIR_TREE_HEIGHT },
	},
	{
		group: 'Trees',
		name: 'Willow',
		create: ( opts ) => generateWillowTree( opts as WillowTreeMeshOptions ),
		createAsync: ( opts ) => generateWillowTreeAsync( opts as WillowTreeMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
		colorOptions: { leaf: 'leafColor', bark: 'barkColor' },
		defaultColors: { leaf: toColorHex( DEFAULT_WILLOW_TREE_LEAF_COLOR ), bark: toColorHex( DEFAULT_WILLOW_TREE_BARK_COLOR ) },
		options: { seed: 1, height: DEFAULT_WILLOW_TREE_HEIGHT },
	},
	{
		group: 'Trees',
		name: 'Bamboo',
		create: ( opts ) => generateBambooTree( opts as BambooTreeMeshOptions ),
		createAsync: ( opts ) => generateBambooTreeAsync( opts as BambooTreeMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
		colorOptions: { leaf: 'leafColor', bark: 'barkColor' },
		defaultColors: { leaf: toColorHex( DEFAULT_BAMBOO_TREE_LEAF_COLOR ), bark: toColorHex( DEFAULT_BAMBOO_TREE_BARK_COLOR ) },
		options: { seed: 1, height: DEFAULT_BAMBOO_TREE_HEIGHT },
	},
	{
		group: 'Trees',
		name: 'Bamboo Shoot',
		lodCount: 5,
		create: ( opts ) => generateBambooShoot( opts as BambooShootMeshOptions ),
		createAsync: ( opts ) => generateBambooShootAsync( opts as BambooShootMeshOptions ),
		colorParts: [ 'sheath', 'core' ],
		colorOptions: { sheath: 'sheathColor', core: 'coreColor' },
		defaultColors: { sheath: toColorHex( DEFAULT_BAMBOO_SHOOT_SHEATH_COLOR ), core: toColorHex( DEFAULT_BAMBOO_SHOOT_CORE_COLOR ) },
		options: { seed: 1, height: DEFAULT_BAMBOO_SHOOT_HEIGHT },
	},
	{
		group: 'Rocks',
		name: 'Rock',
		create: ( opts ) => generateRock( opts as RockMeshOptions ),
		createAsync: ( opts ) => generateRockAsync( opts as RockMeshOptions ),
		colorParts: [ 'rock' ],
		colorOptions: { rock: 'rockColor' },
		defaultColors: { rock: '#ffffff', mossColor: '#7cb83a' },
		textureColors: { mossColor: '#7cb83a' },
		options: {
			seed: 1,
			size: 6.4,
			roughness: 1.2,
			flatness: 0.04,
			weathering: 0.35,
			closeBottom: false,
			moss: 0,
		},
	},
	{
		group: 'Rocks',
		name: 'Pebbles',
		create: ( opts ) => generatePebbles( { ...opts as PebblesMeshOptions, stoneColor: '#ffffff' } ),
		createAsync: ( opts ) => generatePebblesAsync( opts as PebblesMeshOptions ),
		colorParts: [ 'stone' ],
		colorOptions: { stone: 'stoneColor' },
		defaultColors: { stone: '#ffffff', mossColor: '#7cb83a' },
		textureColors: { mossColor: '#7cb83a' },
		options: {
			seed: 1,
			count: 16,
			spread: 1.6,
			size: 0.32,
			sizeVariation: 0.48,
			burial: 0.48,
			moss: 0,
		},
	},
	{
		group: 'Plants',
		name: 'Grass',
		create: ( opts ) => generateGrass( opts as GrassMeshOptions ),
		createAsync: ( opts ) => generateGrassAsync( opts as GrassMeshOptions ),
		colorParts: [ 'blade' ],
		colorOptions: { blade: 'bladeColor' },
		defaultColors: { blade: '#4b942b' },
		options: {
			seed: 1,
			height: 0.45,
		},
	},
	createFlowerKind( 'allium', 'Allium' ),
	createFlowerKind( 'daisy', 'Daisy' ),
	createFlowerKind( 'tulip', 'Tulip' ),
	createFlowerKind( 'poppy', 'Poppy' ),
	createFlowerKind( 'bluebell', 'Bluebell' ),
	createFlowerKind( 'calla', 'Calla' ),
	createFlowerKind( 'primrose', 'Primrose' ),
];
