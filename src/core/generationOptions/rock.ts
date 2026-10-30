import { DEFAULT_MOSS_COLOR } from '../rockTexture';
import type { RockOptions } from '../generators/rock';
import type { NormalizedVegetationGeneration } from '../generationOptions';

export function normalizeRockGenerationOptions(
	options: RockOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<RockOptions> {

	const rockColor = colors.rock ?? options.rockColor ?? 0xffffff;
	const mossColor = options.mossColor ?? DEFAULT_MOSS_COLOR;
	return {
		options: {
			seed: options.seed,
			size: options.size,
			roughness: options.roughness,
			flatness: options.flatness,
			weathering: options.weathering,
			burial: options.burial,
			closeBottom: options.closeBottom,
			rockColor,
			moss: options.moss,
			mossColor,
		},
		colors: { rock: rockColor },
	};

}
