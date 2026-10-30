import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_BUSH_BARK_COLOR, DEFAULT_BUSH_HEIGHT, DEFAULT_BUSH_LEAF_COLOR, generateBushData, normalizeBushGenerationOptions } from '../../core/trees/bush';
import type { BushOptions } from '../../core/trees/bush';
import { requestVegetationWorker, VegetationWorkerUnavailableError } from '../../worker/workerPool';
import { colorHex, vegetationAssetOptions, workerRequest } from '../meshShared';

export type BushMeshOptions = Omit<BushOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: BushMeshOptions ) {

	const leafColor = colorHex( options.leafColor, DEFAULT_BUSH_LEAF_COLOR );
	const barkColor = colorHex( options.barkColor, DEFAULT_BUSH_BARK_COLOR );
	return normalizeBushGenerationOptions( { seed: options.seed, height: options.height, leafColor, barkColor }, { leaf: leafColor, bark: barkColor } );

}

export function generateBush( options: BushMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return new VegetationAsset( generateBushData( normalized.options ), normalized.colors, 128, vegetationAssetOptions( options ) );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateBushAsync( options: BushMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateBush( options ) );

	const normalized = normalizeOptions( options );
	const request = workerRequest( 'bush', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `bush:${ normalized.options.seed ?? 1 }` ), vegetationAssetOptions( options ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generateBush( options );
		throw error;
	}

}

export class BushMesh extends VegetationMesh {

	constructor( options: BushMeshOptions = {} ) {

		super( generateBush( options ), options.lod, true );

	}

	static createLOD( options: BushMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultHeight = options.height ?? DEFAULT_BUSH_HEIGHT;
		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * defaultHeight / DEFAULT_BUSH_HEIGHT );
		return VegetationMesh.fromAsset( generateBush( options ), distances ?? defaultDistances, true );

	}

}

export type { BushOptions };
