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
import { DEFAULT_LEAF_COLOR } from '../core/leafTexture';
import { DEFAULT_MOSS_COLOR } from '../core/rockTexture';
import { DEFAULT_BARK_COLOR } from '../core/barkTexture';
import { normalizePebblesGenerationOptions, normalizeRockGenerationOptions, normalizeTreeGenerationOptions } from '../core/vegetationGeneration';
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

function colorHex( color: ColorRepresentation | undefined, fallback: number ): number {

	return new Color( color ?? fallback ).getHex();

}

function workerOptions( options: object ): Record<string, number | boolean> {

	return Object.fromEntries( Object.entries( options ).filter( ( entry ): entry is [ string, number | boolean ] => entry[ 1 ] !== undefined ) );

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

function workerRequest(
	kind: VegetationWorkerKind,
	options: object,
	colors: Record<string, number>,
): { kind: VegetationWorkerKind; options: Record<string, number | boolean>; colors: Record<string, number>; impostorSize: number } {

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

export type { LodLevel, PebblesOptions, RockOptions, TreeOptions };
export { disposeVegetationWorkers };
