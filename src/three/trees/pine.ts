import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_PINE_TREE_BARK_COLOR, DEFAULT_PINE_TREE_HEIGHT, DEFAULT_PINE_TREE_LEAF_COLOR, generatePineTreeData, normalizePineTreeGenerationOptions } from '../../core/trees/pine';
import type { PineTreeOptions } from '../../core/trees/pine';
import { requestVegetationWorker, VegetationWorkerUnavailableError } from '../../worker/workerPool';
import { colorHex, vegetationAssetOptions, workerRequest } from '../meshShared';

export type PineTreeMeshOptions = Omit<PineTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: PineTreeMeshOptions ) {

	const leafColor = colorHex( options.leafColor, DEFAULT_PINE_TREE_LEAF_COLOR );
	const barkColor = colorHex( options.barkColor, DEFAULT_PINE_TREE_BARK_COLOR );
	return normalizePineTreeGenerationOptions( { seed: options.seed, height: options.height, leafColor, barkColor }, { leaf: leafColor, bark: barkColor } );

}

export function generatePineTree( options: PineTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return new VegetationAsset( generatePineTreeData( normalized.options ), normalized.colors, 128, vegetationAssetOptions( options ) );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generatePineTreeAsync( options: PineTreeMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generatePineTree( options ) );

	const normalized = normalizeOptions( options );
	const request = workerRequest( 'pine-tree', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `pine-tree:${ normalized.options.seed ?? 1 }` ), vegetationAssetOptions( options ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generatePineTree( options );
		throw error;
	}

}

export class PineTreeMesh extends VegetationMesh {

	constructor( options: PineTreeMeshOptions = {} ) {

		super( generatePineTree( options ), options.lod, true );

	}

	static createLOD( options: PineTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultHeight = options.height ?? DEFAULT_PINE_TREE_HEIGHT;
		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * defaultHeight / DEFAULT_PINE_TREE_HEIGHT );
		return VegetationMesh.fromAsset( generatePineTree( options ), distances ?? defaultDistances, true );

	}

}

export type { PineTreeOptions };
