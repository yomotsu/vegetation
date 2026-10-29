import { DEFAULT_BARK_COLOR } from './barkTexture';
import { DEFAULT_LEAF_COLOR } from './leafTexture';
import { DEFAULT_MOSS_COLOR } from './rockTexture';
import { DEFAULT_BLADE_COLOR } from './generators/grass';
import type { PebblesOptions } from './generators/pebbles';
import type { GrassOptions } from './generators/grass';
import type { RockOptions } from './generators/rock';
import type { TreeOptions } from './generators/tree';
import { DEFAULT_ALLIUM_CENTER_COLOR, DEFAULT_ALLIUM_PETAL_COLOR, DEFAULT_DAISY_CENTER_COLOR, DEFAULT_DAISY_PETAL_COLOR, DEFAULT_FLOWERS_STEM_COLOR, DEFAULT_TULIP_CENTER_COLOR, DEFAULT_TULIP_PETAL_COLOR } from './generators/flowers';
import type { FlowersOptions } from './generators/flowers';

export interface NormalizedVegetationGeneration<Options> {
	options: Options;
	colors: Record<string, number>;
}

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

export function normalizeFlowersGenerationOptions(
	options: FlowersOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<FlowersOptions> {

	const variety = options.variety ?? 'allium';
	const defaultPetalColor = variety === 'allium' ? DEFAULT_ALLIUM_PETAL_COLOR : variety === 'daisy' ? DEFAULT_DAISY_PETAL_COLOR : DEFAULT_TULIP_PETAL_COLOR;
	const defaultCenterColor = variety === 'allium' ? DEFAULT_ALLIUM_CENTER_COLOR : variety === 'daisy' ? DEFAULT_DAISY_CENTER_COLOR : DEFAULT_TULIP_CENTER_COLOR;
	const petalColor = colors.petal ?? options.petalColor ?? defaultPetalColor;
	const stemColor = colors.stem ?? options.stemColor ?? DEFAULT_FLOWERS_STEM_COLOR;
	const centerColor = options.centerColor ?? defaultCenterColor;

	return {
		options: {
			seed: options.seed,
			variety,
			count: options.count,
			spread: options.spread,
			height: options.height,
			petalColor,
			centerColor,
			stemColor,
		},
		colors: { petal: petalColor, stem: stemColor },
	};

}

export function normalizeTreeGenerationOptions(
	options: TreeOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<TreeOptions> {

	const leafColor = colors.leaf ?? options.leafColor ?? DEFAULT_LEAF_COLOR;

	return {
		options: {
			seed: options.seed,
			height: options.height,
			rootDepth: options.rootDepth,
			crownSize: options.crownSize,
			branchCount: options.branchCount,
			leafColor,
		},
		colors: {
			bark: colors.bark ?? DEFAULT_BARK_COLOR,
			leaf: leafColor,
		},
	};

}

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
