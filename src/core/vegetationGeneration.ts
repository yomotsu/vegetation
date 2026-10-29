import { DEFAULT_BARK_COLOR } from './barkTexture';
import { DEFAULT_LEAF_COLOR } from './leafTexture';
import { DEFAULT_MOSS_COLOR } from './rockTexture';
import { DEFAULT_BLADE_COLOR } from './generators/grass';
import type { PebblesOptions } from './generators/pebbles';
import type { GrassOptions } from './generators/grass';
import type { RockOptions } from './generators/rock';
import type { TreeOptions } from './generators/tree';
import { DEFAULT_ALLIUM_CENTER_COLOR, DEFAULT_ALLIUM_PETAL_COLOR, DEFAULT_BLUEBELL_CENTER_COLOR, DEFAULT_BLUEBELL_COUNT, DEFAULT_BLUEBELL_HEIGHT, DEFAULT_BLUEBELL_PETAL_COLOR, DEFAULT_BLUEBELL_SPREAD, DEFAULT_CALLA_CENTER_COLOR, DEFAULT_CALLA_COUNT, DEFAULT_CALLA_HEIGHT, DEFAULT_CALLA_PETAL_COLOR, DEFAULT_CALLA_SPREAD, DEFAULT_DAISY_CENTER_COLOR, DEFAULT_DAISY_PETAL_COLOR, DEFAULT_FLOWERS_COUNT, DEFAULT_FLOWERS_STEM_COLOR, DEFAULT_POPPY_CENTER_COLOR, DEFAULT_POPPY_COUNT, DEFAULT_POPPY_HEIGHT, DEFAULT_POPPY_PETAL_COLOR, DEFAULT_POPPY_SPREAD, DEFAULT_PRIMROSE_CENTER_COLOR, DEFAULT_PRIMROSE_COUNT, DEFAULT_PRIMROSE_HEIGHT, DEFAULT_PRIMROSE_PETAL_COLOR, DEFAULT_PRIMROSE_SPREAD, DEFAULT_TULIP_CENTER_COLOR, DEFAULT_TULIP_COUNT, DEFAULT_TULIP_PETAL_COLOR } from './generators/flowers';
import type { FlowersOptions, FlowersVariety } from './generators/flowers';

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
	const defaults: Record<FlowersVariety, { count: number; spread: number; height: number; petal: number; center: number }> = {
		allium: { count: DEFAULT_FLOWERS_COUNT, spread: 0.29, height: 0.37, petal: DEFAULT_ALLIUM_PETAL_COLOR, center: DEFAULT_ALLIUM_CENTER_COLOR },
		daisy: { count: DEFAULT_FLOWERS_COUNT, spread: 0.37, height: 0.285, petal: DEFAULT_DAISY_PETAL_COLOR, center: DEFAULT_DAISY_CENTER_COLOR },
		tulip: { count: DEFAULT_TULIP_COUNT, spread: 0.3, height: 0.36, petal: DEFAULT_TULIP_PETAL_COLOR, center: DEFAULT_TULIP_CENTER_COLOR },
		poppy: { count: DEFAULT_POPPY_COUNT, spread: DEFAULT_POPPY_SPREAD, height: DEFAULT_POPPY_HEIGHT, petal: DEFAULT_POPPY_PETAL_COLOR, center: DEFAULT_POPPY_CENTER_COLOR },
		bluebell: { count: DEFAULT_BLUEBELL_COUNT, spread: DEFAULT_BLUEBELL_SPREAD, height: DEFAULT_BLUEBELL_HEIGHT, petal: DEFAULT_BLUEBELL_PETAL_COLOR, center: DEFAULT_BLUEBELL_CENTER_COLOR },
		calla: { count: DEFAULT_CALLA_COUNT, spread: DEFAULT_CALLA_SPREAD, height: DEFAULT_CALLA_HEIGHT, petal: DEFAULT_CALLA_PETAL_COLOR, center: DEFAULT_CALLA_CENTER_COLOR },
		primrose: { count: DEFAULT_PRIMROSE_COUNT, spread: DEFAULT_PRIMROSE_SPREAD, height: DEFAULT_PRIMROSE_HEIGHT, petal: DEFAULT_PRIMROSE_PETAL_COLOR, center: DEFAULT_PRIMROSE_CENTER_COLOR },
	};
	const flowerDefaults = defaults[ variety ];
	const defaultPetalColor = flowerDefaults.petal;
	// bluebell に花芯はなく、centerColor は生成時に使わない。
	const defaultCenterColor = flowerDefaults.center;
	const petalColor = colors.petal ?? options.petalColor ?? defaultPetalColor;
	const stemColor = colors.stem ?? options.stemColor ?? DEFAULT_FLOWERS_STEM_COLOR;
	const centerColor = options.centerColor ?? defaultCenterColor;

	return {
		options: {
			seed: options.seed,
			variety,
			count: options.count ?? flowerDefaults.count,
			spread: options.spread ?? flowerDefaults.spread,
			height: options.height ?? flowerDefaults.height,
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
