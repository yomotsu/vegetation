import { generateFlowers, generateFlowersAsync, generateGrass, generateGrassAsync, generatePebbles, generatePebblesAsync, generateRock, generateRockAsync, generateTree, generateTreeAsync } from '../src/index';
import type { FlowersMeshOptions, GrassMeshOptions, PebblesMeshOptions, RockMeshOptions, TreeMeshOptions, VegetationAsset } from '../src/index';

export interface VegetationKind {
	name: string;
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
	allium: { white: '#f1efe8', lavender: '#a98bd6', pink: '#e889b5', orange: '#d2600c' },
	daisy: { orange: '#d2600c', yellow: '#f2c230', red: '#c8352a', white: '#f1efe8' },
	tulip: { red: '#d8322a', yellow: '#f2c230', pink: '#ef7fa8', white: '#f4f1ea', orange: '#f07a28' },
	poppy: { red: '#d8281e', orange: '#f08a24', white: '#f4f1ea', pink: '#ef8fb0' },
	bluebell: { violet: '#7a5ad8', blue: '#4f7fe0', pink: '#ec90c0', white: '#f2f0f6' },
	calla: { white: '#f4f1e8', yellow: '#f2c94a', pink: '#ee9ab8', purple: '#6e3a8a' },
	primrose: { yellow: '#f2d24a', pink: '#f08ab8', purple: '#9a6ad8', white: '#f6f2e6' },
};

export const flowerVarietyDefaults = {
	allium: { count: 6, spread: 0.29, height: 0.37, petal: '#f1efe8', centerColor: '#8a9670' },
	daisy: { count: 6, spread: 0.37, height: 0.285, petal: '#d2600c', centerColor: '#8a7414' },
	tulip: { count: 4, spread: 0.3, height: 0.36, petal: '#d8322a', centerColor: '#000000' },
	poppy: { count: 3, spread: 0.28, height: 0.42, petal: '#d8281e', centerColor: '#1e1a18' },
	bluebell: { count: 3, spread: 0.28, height: 0.36, petal: '#7a5ad8', centerColor: '#2f6f1e' },
	calla: { count: 3, spread: 0.3, height: 0.42, petal: '#f4f1e8', centerColor: '#f0c030' },
	primrose: { count: 4, spread: 0.26, height: 0.12, petal: '#f2d24a', centerColor: '#c0a020' },
};

export const kinds: VegetationKind[] = [
	{
		name: 'Tree',
		create: ( opts ) => generateTree( opts as TreeMeshOptions ),
		createAsync: ( opts ) => generateTreeAsync( opts as TreeMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
		colorOptions: { leaf: 'leafColor', bark: 'barkColor' },
		defaultColors: { leaf: '#2f7d1f', bark: '#6b4c32' },
		options: {
			seed: 1,
			height: 7.5,
			rootDepth: 0.3 * ( 7.5 / 7.55 ),
			crownSize: 1,
			branchCount: 10,
		},
	},
	{
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
			burial: 0.4,
			moss: 0,
		},
	},
	{
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
	{
		name: 'Flowers',
		create: ( opts ) => generateFlowers( opts as FlowersMeshOptions ),
		createAsync: ( opts ) => generateFlowersAsync( opts as FlowersMeshOptions ),
		colorParts: [ 'petal', 'stem' ],
		colorOptions: { petal: 'petalColor', stem: 'stemColor' },
		defaultColors: { petal: '#f1efe8', stem: '#2f6f1e', centerColor: '#8a9670' },
		textureColors: { centerColor: '#8a9670' },
		options: {
			seed: 1,
			variety: 'allium',
			count: 6,
			spread: 0.29,
			height: 0.37,
		},
	},
];
