import { Color } from 'three';
import type { ColorRepresentation, LOD } from 'three';
import { VegetationAsset } from './VegetationAsset';
import type { VegetationAssetOptions } from './VegetationAsset';
import { VegetationMesh } from './VegetationMesh';
import type { VegetationData } from '../core/types';
import type { NormalizedVegetationGeneration } from '../core/generationOptions';
import type { VegetationWorkerKind } from '../worker/protocol';
import { disposeVegetationWorkers as disposeVegetationWorkerPool, requestVegetationWorker, VegetationWorkerUnavailableError } from '../worker/workerPool';
import { disposeInternalKTX2Loaders } from './ktx2Loader';

const TREE_LOD_DISTANCES = [ 0, 15, 30, 60, 120 ];
const SMALL_VEGETATION_LOD_DISTANCES = [ 0, 1, 2, 4, 8 ];

interface NormalizedWorkerOptions {
	options: object;
	colors: Record<string, number>;
}

interface TreeColorOptions {
	seed?: number;
	height?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
}

interface TreeGenerationOptions {
	seed?: number;
	height?: number;
	leafColor?: number;
	barkColor?: number;
}

export function vegetationAssetOptions( options: Pick<VegetationAssetOptions, 'compressTextures' | 'ktx2Loader'> ): VegetationAssetOptions {

	return { compressTextures: options.compressTextures, ktx2Loader: options.ktx2Loader };

}

export function colorHex( color: ColorRepresentation | undefined, fallback: number ): number {

	return new Color( color ?? fallback ).getHex();

}

export function normalizeTreeMeshOptions<Options extends TreeGenerationOptions>(
	options: TreeColorOptions,
	defaultColors: { leaf: number; bark: number },
	normalize: ( options: Options, colors: Record<string, number> ) => NormalizedVegetationGeneration<Options>,
): NormalizedVegetationGeneration<Options> {

	const leafColor = colorHex( options.leafColor, defaultColors.leaf );
	const barkColor = colorHex( options.barkColor, defaultColors.bark );
	return normalize( {
		seed: options.seed,
		height: options.height,
		leafColor,
		barkColor,
	} as Options, { leaf: leafColor, bark: barkColor } );

}

export function workerOptions( options: object ): Record<string, number | boolean | string> {

	return Object.fromEntries( Object.entries( options ).filter( ( entry ): entry is [ string, number | boolean | string ] => typeof entry[ 1 ] === 'number' || typeof entry[ 1 ] === 'boolean' || typeof entry[ 1 ] === 'string' ) );

}

export function workerRequest(
	kind: VegetationWorkerKind,
	options: object,
	colors: Record<string, number>,
): { kind: VegetationWorkerKind; options: Record<string, number | boolean | string>; colors: Record<string, number>; impostorSize: number } {

	return { kind, options: workerOptions( options ), colors, impostorSize: 128 };

}

export function createVegetationAsset(
	data: VegetationData,
	colors: Record<string, ColorRepresentation>,
	options: Pick<VegetationAssetOptions, 'compressTextures' | 'ktx2Loader'>,
): VegetationAsset {

	return new VegetationAsset( data, colors, 128, vegetationAssetOptions( options ) );

}

export async function generateVegetationAssetAsync<Options extends Pick<VegetationAssetOptions, 'compressTextures' | 'ktx2Loader'>>(
	options: Options,
	kind: VegetationWorkerKind,
	normalize: ( options: Options ) => NormalizedWorkerOptions,
	generate: ( options: Options ) => VegetationAsset,
): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generate( options ) );

	const normalized = normalize( options );
	const request = workerRequest( kind, normalized.options, normalized.colors );
	try {
		const prepared = await requestVegetationWorker( request, `${ kind }:${ request.options.seed ?? 1 }` );
		return VegetationAsset.fromPrepared( prepared, vegetationAssetOptions( options ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generate( options );
		throw error;
	}

}

export function createVegetationLOD(
	generate: () => VegetationAsset,
	distances: number[] | undefined,
	scaleDistance: ( distance: number ) => number,
	baseDistances: readonly number[] = TREE_LOD_DISTANCES,
): LOD {

	return VegetationMesh.fromAsset( generate(), distances ?? baseDistances.map( scaleDistance ), true );

}

export function createSmallVegetationLOD( generate: () => VegetationAsset, distances: number[] | undefined, scaleDistance: ( distance: number ) => number ): LOD {

	return createVegetationLOD( generate, distances, scaleDistance, SMALL_VEGETATION_LOD_DISTANCES );

}

export function disposeVegetationWorkers(): void {

	disposeVegetationWorkerPool();
	disposeInternalKTX2Loaders();

}
