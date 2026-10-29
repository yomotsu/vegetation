import { VegetationAsset } from './VegetationAsset';
import { VegetationMesh } from './VegetationMesh';
import { Color } from 'three';
import type { ColorRepresentation } from 'three';
import type { TreeOptions } from '../core/generators/tree';
import { generateTreeData } from '../core/generators/tree';
import type { RockOptions } from '../core/generators/rock';
import { generateRockData } from '../core/generators/rock';
import type { PebblesOptions } from '../core/generators/pebbles';
import { generatePebblesData } from '../core/generators/pebbles';
import type { GrassOptions } from '../core/generators/grass';
import { DEFAULT_BLADE_COLOR, generateGrassData } from '../core/generators/grass';
import type { FlowersOptions } from '../core/generators/flowers';
import { DEFAULT_FLOWERS_STEM_COLOR, DEFAULT_ALLIUM_CENTER_COLOR, DEFAULT_ALLIUM_PETAL_COLOR, DEFAULT_DAISY_CENTER_COLOR, DEFAULT_DAISY_PETAL_COLOR, DEFAULT_TULIP_CENTER_COLOR, DEFAULT_TULIP_PETAL_COLOR, generateFlowersData } from '../core/generators/flowers';
import { DEFAULT_LEAF_COLOR } from '../core/leafTexture';
import { DEFAULT_MOSS_COLOR } from '../core/rockTexture';
import { DEFAULT_BARK_COLOR } from '../core/barkTexture';
import { normalizeFlowersGenerationOptions, normalizeGrassGenerationOptions, normalizePebblesGenerationOptions, normalizeRockGenerationOptions, normalizeTreeGenerationOptions } from '../core/vegetationGeneration';
import type { VegetationWorkerKind } from '../worker/protocol';
import { disposeVegetationWorkers, requestVegetationWorker, VegetationWorkerUnavailableError } from '../worker/workerPool';
import type { LodLevel } from '../core/types';

export type TreeMeshOptions = Omit<TreeOptions, 'leafColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
};

export type RockMeshOptions = Omit<RockOptions, 'rockColor' | 'mossColor'> & {
	lod?: number;
	rockColor?: ColorRepresentation;
	mossColor?: ColorRepresentation;
};

export type PebblesMeshOptions = Omit<PebblesOptions, 'stoneColor' | 'mossColor'> & {
	lod?: number;
	stoneColor?: ColorRepresentation;
	mossColor?: ColorRepresentation;
};

export type GrassMeshOptions = Omit<GrassOptions, 'bladeColor'> & {
	lod?: number;
	bladeColor?: ColorRepresentation;
};

export type FlowersMeshOptions = Omit<FlowersOptions, 'petalColor' | 'centerColor' | 'stemColor'> & {
	lod?: number;
	petalColor?: ColorRepresentation;
	centerColor?: ColorRepresentation;
	stemColor?: ColorRepresentation;
};

function colorHex( color: ColorRepresentation | undefined, fallback: number ): number {

	return new Color( color ?? fallback ).getHex();

}

function workerOptions( options: object ): Record<string, number | boolean | string> {

	return Object.fromEntries( Object.entries( options ).filter( ( entry ): entry is [ string, number | boolean | string ] => typeof entry[ 1 ] === 'number' || typeof entry[ 1 ] === 'boolean' || typeof entry[ 1 ] === 'string' ) );

}

function normalizeTreeOptions( options: TreeMeshOptions ): ReturnType<typeof normalizeTreeGenerationOptions> {

	const leafColor = colorHex( options.leafColor, DEFAULT_LEAF_COLOR );
	return normalizeTreeGenerationOptions( {
		seed: options.seed,
		height: options.height,
		rootDepth: options.rootDepth,
		crownSize: options.crownSize,
		branchCount: options.branchCount,
		leafColor,
	}, {
		leaf: leafColor,
		bark: colorHex( options.barkColor, DEFAULT_BARK_COLOR ),
	} );

}

function normalizeRockOptions( options: RockMeshOptions ): ReturnType<typeof normalizeRockGenerationOptions> {

	return normalizeRockGenerationOptions( {
		seed: options.seed,
		size: options.size,
		roughness: options.roughness,
		flatness: options.flatness,
		weathering: options.weathering,
		burial: options.burial,
		closeBottom: options.closeBottom,
		rockColor: colorHex( options.rockColor, 0xffffff ),
		moss: options.moss,
		mossColor: colorHex( options.mossColor, DEFAULT_MOSS_COLOR ),
	}, { rock: colorHex( options.rockColor, 0xffffff ) } );

}

function normalizePebblesOptions( options: PebblesMeshOptions ): ReturnType<typeof normalizePebblesGenerationOptions> {

	return normalizePebblesGenerationOptions( {
		seed: options.seed,
		count: options.count,
		spread: options.spread,
		size: options.size,
		sizeVariation: options.sizeVariation,
		burial: options.burial,
		stoneColor: colorHex( options.stoneColor, 0xffffff ),
		moss: options.moss,
		mossColor: colorHex( options.mossColor, DEFAULT_MOSS_COLOR ),
	}, { stone: colorHex( options.stoneColor, 0xffffff ) } );

}

function normalizeGrassOptions( options: GrassMeshOptions ): ReturnType<typeof normalizeGrassGenerationOptions> {

	const bladeColor = colorHex( options.bladeColor, DEFAULT_BLADE_COLOR );
	return normalizeGrassGenerationOptions( {
		seed: options.seed,
		height: options.height,
		width: options.width,
		bladeColor,
	}, { blade: bladeColor } );

}

function normalizeFlowersOptions( options: FlowersMeshOptions ): ReturnType<typeof normalizeFlowersGenerationOptions> {

	const variety = options.variety ?? 'allium';
	const defaultPetalColor = variety === 'allium' ? DEFAULT_ALLIUM_PETAL_COLOR : variety === 'daisy' ? DEFAULT_DAISY_PETAL_COLOR : DEFAULT_TULIP_PETAL_COLOR;
	const defaultCenterColor = variety === 'allium' ? DEFAULT_ALLIUM_CENTER_COLOR : variety === 'daisy' ? DEFAULT_DAISY_CENTER_COLOR : DEFAULT_TULIP_CENTER_COLOR;
	return normalizeFlowersGenerationOptions( {
		seed: options.seed,
		variety,
		count: options.count,
		spread: options.spread,
		height: options.height,
		petalColor: colorHex( options.petalColor, defaultPetalColor ),
		centerColor: colorHex( options.centerColor, defaultCenterColor ),
		stemColor: colorHex( options.stemColor, DEFAULT_FLOWERS_STEM_COLOR ),
	} );

}

function workerRequest(
	kind: VegetationWorkerKind,
	options: object,
	colors: Record<string, number>,
	): { kind: VegetationWorkerKind; options: Record<string, number | boolean | string>; colors: Record<string, number>; impostorSize: number } {

	return { kind, options: workerOptions( options ), colors, impostorSize: 128 };

}

export function generateTree( options: TreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeTreeOptions( options );
	const data = generateTreeData( normalized.options );
	const colors = { leaf: options.leafColor ?? DEFAULT_LEAF_COLOR, ...( options.barkColor === undefined ? {} : { bark: options.barkColor } ) };

	return new VegetationAsset( data, colors );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateTreeAsync( options: TreeMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateTree( options ) );

	const normalized = normalizeTreeOptions( options );
	const request = workerRequest( 'tree', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `tree:${ normalized.options.seed ?? 1 }` ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generateTree( options );
		throw error;
	}

}

export class TreeMesh extends VegetationMesh {

	constructor( options: TreeMeshOptions = {} ) {

		super( generateTree( options ), options.lod, true );

	}

	static createLOD( options: TreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * ( options.height ?? 7.5 ) / 7.5 );
		const asset = generateTree( options );

		return VegetationMesh.fromAsset( asset, distances ?? defaultDistances, true );

	}

}

export function generateRock( options: RockMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeRockOptions( options );
	const color = new Color( options.rockColor ?? 0xffffff );
	const data = generateRockData( normalized.options );

	return new VegetationAsset( data, { rock: color } );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateRockAsync( options: RockMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateRock( options ) );

	const normalized = normalizeRockOptions( options );
	const request = workerRequest( 'rock', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `rock:${ normalized.options.seed ?? 1 }` ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generateRock( options );
		throw error;
	}

}

export class RockMesh extends VegetationMesh {

	constructor( options: RockMeshOptions = {} ) {

		super( generateRock( options ), options.lod, true );

	}

	static createLOD( options: RockMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * ( options.size ?? 6.4 ) / 6.4 );
		const asset = generateRock( options );

		return VegetationMesh.fromAsset( asset, distances ?? defaultDistances, true );

	}

}

export function generatePebbles( options: PebblesMeshOptions = {} ): VegetationAsset {

	const normalized = normalizePebblesOptions( options );
	const color = new Color( options.stoneColor ?? 0xffffff );
	const data = generatePebblesData( normalized.options );

	return new VegetationAsset( data, { stone: color } );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generatePebblesAsync( options: PebblesMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generatePebbles( options ) );

	const normalized = normalizePebblesOptions( options );
	const request = workerRequest( 'pebbles', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `pebbles:${ normalized.options.seed ?? 1 }` ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generatePebbles( options );
		throw error;
	}

}

export class PebblesMesh extends VegetationMesh {

	constructor( options: PebblesMeshOptions = {} ) {

		super( generatePebbles( options ), options.lod, true );

	}

	static createLOD( options: PebblesMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * ( options.spread ?? 1.6 ) / 1.6 );
		const asset = generatePebbles( options );

		return VegetationMesh.fromAsset( asset, distances ?? defaultDistances, true );

	}

}

export function generateGrass( options: GrassMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeGrassOptions( options );
	const data = generateGrassData( normalized.options );
	return new VegetationAsset( data, { blade: options.bladeColor ?? DEFAULT_BLADE_COLOR } );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateGrassAsync( options: GrassMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateGrass( options ) );

	const normalized = normalizeGrassOptions( options );
	const request = workerRequest( 'grass', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `grass:${ normalized.options.seed ?? 1 }` ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generateGrass( options );
		throw error;
	}

}

export class GrassMesh extends VegetationMesh {

	constructor( options: GrassMeshOptions = {} ) {

		super( generateGrass( options ), options.lod, true );

	}

	static createLOD( options: GrassMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const height = options.height ?? 0.45;
		const defaultDistances = [ 0, 1, 2, 4, 8 ].map( ( distance ) => distance * height / 0.45 );
		return VegetationMesh.fromAsset( generateGrass( options ), distances ?? defaultDistances, true );

	}

}

export function generateFlowers( options: FlowersMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeFlowersOptions( options );
	return new VegetationAsset( generateFlowersData( normalized.options ), {
		petal: normalized.options.petalColor!,
		stem: normalized.options.stemColor!,
	} );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateFlowersAsync( options: FlowersMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateFlowers( options ) );

	const normalized = normalizeFlowersOptions( options );
	const request = workerRequest( 'flowers', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `flowers:${ normalized.options.seed ?? 1 }` ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generateFlowers( options );
		throw error;
	}

}

export class FlowersMesh extends VegetationMesh {

	constructor( options: FlowersMeshOptions = {} ) {

		super( generateFlowers( options ), options.lod, true );

	}

	static createLOD( options: FlowersMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultHeight = options.height ?? ( options.variety === 'daisy' ? 0.285 : options.variety === 'tulip' ? 0.36 : 0.37 );
		const distancesForHeight = [ 0, 1, 2, 4, 8 ].map( ( distance ) => distance * defaultHeight / 0.43 );
		return VegetationMesh.fromAsset( generateFlowers( options ), distances ?? distancesForHeight, true );

	}

}

export type { FlowersOptions, LodLevel, PebblesOptions, RockOptions, TreeOptions };
export type { GrassOptions };
export { disposeVegetationWorkers };
