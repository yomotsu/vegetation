import { generateTree } from '../src/index';
import type { TreeMeshOptions, VegetationAsset } from '../src/index';

export interface VegetationKind {
	name: string;
	create: ( opts: Record<string, unknown> ) => VegetationAsset;
	colorParts: string[];
	options: Record<string, number>;
}

export const kinds: VegetationKind[] = [
	{
		name: 'Tree',
		create: ( opts ) => generateTree( opts as TreeMeshOptions ),
		colorParts: [ 'leaf', 'bark' ],
		options: {
			seed: 1,
			height: 6,
			crownSize: 1,
			branchCount: 6,
		},
	},
];
