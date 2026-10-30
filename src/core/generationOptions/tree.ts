import { DEFAULT_BARK_COLOR } from '../barkTexture';
import { DEFAULT_LEAF_COLOR } from '../leafTexture';
import type { TreeOptions } from '../generators/tree';
import type { NormalizedVegetationGeneration } from '../generationOptions';

export function normalizeTreeGenerationOptions(
	options: TreeOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<TreeOptions> {

	const leafColor = colors.leaf ?? options.leafColor ?? DEFAULT_LEAF_COLOR;
	const barkColor = colors.bark ?? DEFAULT_BARK_COLOR;
	return {
		options: {
			seed: options.seed,
			height: options.height ?? 7.5,
			crownSize: options.crownSize,
			branchCount: options.branchCount,
			leafColor,
		},
		colors: { bark: barkColor, leaf: leafColor },
	};

}
