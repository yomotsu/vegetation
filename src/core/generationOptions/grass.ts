import { DEFAULT_BLADE_COLOR } from '../generators/grass';
import type { GrassOptions } from '../generators/grass';
import type { NormalizedVegetationGeneration } from '../generationOptions';

export function normalizeGrassGenerationOptions(
	options: GrassOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<GrassOptions> {

	const bladeColor = colors.blade ?? options.bladeColor ?? DEFAULT_BLADE_COLOR;
	return {
		options: {
			seed: options.seed,
			height: options.height,
			width: options.width,
			bladeColor,
		},
		colors: { blade: bladeColor },
	};

}
