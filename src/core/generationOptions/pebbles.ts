import { DEFAULT_MOSS_COLOR } from '../rockTexture';
import type { PebblesOptions } from '../generators/pebbles';
import type { NormalizedVegetationGeneration } from '../generationOptions';

export function normalizePebblesGenerationOptions(
	options: PebblesOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<PebblesOptions> {

	const stoneColor = colors.stone ?? options.stoneColor ?? 0xffffff;
	const mossColor = options.mossColor ?? DEFAULT_MOSS_COLOR;
	return {
		options: {
			seed: options.seed,
			count: options.count,
			spread: options.spread,
			size: options.size,
			sizeVariation: options.sizeVariation,
			burial: options.burial,
			stoneColor,
			moss: options.moss,
			mossColor,
		},
		colors: { stone: stoneColor },
	};

}
