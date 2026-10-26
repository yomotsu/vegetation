import { generateRock, generateTree } from '../src/index';
import type { RockMeshOptions, TreeMeshOptions, VegetationAsset } from '../src/index';

export interface VegetationKind {
	name: string;
	create: ( opts: Record<string, unknown> ) => VegetationAsset;
	colorParts: string[];
	options: Record<string, number>;
}

export const leafColorPresets = {
	green: '#2f7d1f',
	'autumn red': '#b5361c',
	orange: '#d9781e',
	yellow: '#d8b62a',
};

export const kinds: VegetationKind[] = [
	{
		name: 'Tree',
		create: ( opts ) => generateTree( opts as TreeMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
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
		colorParts: [ 'rock' ],
		options: {
			seed: 1,
			size: 6.4,
			roughness: 1.2,
			flatness: 0.04,
		},
	},
];
