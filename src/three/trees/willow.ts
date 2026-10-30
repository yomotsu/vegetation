import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_WILLOW_TREE_BARK_COLOR, DEFAULT_WILLOW_TREE_HEIGHT, DEFAULT_WILLOW_TREE_LEAF_COLOR, generateWillowTreeData, normalizeWillowTreeGenerationOptions } from '../../core/trees/willow';
import type { WillowTreeOptions } from '../../core/trees/willow';
import { requestVegetationWorker, VegetationWorkerUnavailableError } from '../../worker/workerPool';
import { colorHex, vegetationAssetOptions, workerRequest } from '../meshShared';

export type WillowTreeMeshOptions = Omit<WillowTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: WillowTreeMeshOptions ) {

	const leafColor = colorHex( options.leafColor, DEFAULT_WILLOW_TREE_LEAF_COLOR );
	const barkColor = colorHex( options.barkColor, DEFAULT_WILLOW_TREE_BARK_COLOR );
	return normalizeWillowTreeGenerationOptions( { seed: options.seed, height: options.height, leafColor, barkColor }, { leaf: leafColor, bark: barkColor } );

}

export function generateWillowTree( options: WillowTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return new VegetationAsset( generateWillowTreeData( normalized.options ), normalized.colors, 128, vegetationAssetOptions( options ) );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateWillowTreeAsync( options: WillowTreeMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateWillowTree( options ) );

	const normalized = normalizeOptions( options );
	const request = workerRequest( 'willow-tree', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `willow-tree:${ normalized.options.seed ?? 1 }` ), vegetationAssetOptions( options ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generateWillowTree( options );
		throw error;
	}

}

export class WillowTreeMesh extends VegetationMesh {

	constructor( options: WillowTreeMeshOptions = {} ) {

		super( generateWillowTree( options ), options.lod, true );

	}

	static createLOD( options: WillowTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultHeight = options.height ?? DEFAULT_WILLOW_TREE_HEIGHT;
		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * defaultHeight / DEFAULT_WILLOW_TREE_HEIGHT );
		return VegetationMesh.fromAsset( generateWillowTree( options ), distances ?? defaultDistances, true );

	}

}

export type { WillowTreeOptions };
