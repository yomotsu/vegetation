import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_BROADLEAF_TREE_BARK_COLOR, DEFAULT_BROADLEAF_TREE_HEIGHT, DEFAULT_BROADLEAF_TREE_LEAF_COLOR, generateBroadleafTreeData, normalizeBroadleafTreeGenerationOptions } from '../../core/trees/broadleaf';
import type { BroadleafTreeOptions } from '../../core/trees/broadleaf';
import { requestVegetationWorker, VegetationWorkerUnavailableError } from '../../worker/workerPool';
import { colorHex, vegetationAssetOptions, workerRequest } from '../meshShared';

export type BroadleafTreeMeshOptions = Omit<BroadleafTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: BroadleafTreeMeshOptions ) {

	const leafColor = colorHex( options.leafColor, DEFAULT_BROADLEAF_TREE_LEAF_COLOR );
	const barkColor = colorHex( options.barkColor, DEFAULT_BROADLEAF_TREE_BARK_COLOR );
	return normalizeBroadleafTreeGenerationOptions( { seed: options.seed, height: options.height, leafColor, barkColor }, { leaf: leafColor, bark: barkColor } );

}

export function generateBroadleafTree( options: BroadleafTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return new VegetationAsset( generateBroadleafTreeData( normalized.options ), normalized.colors, 128, vegetationAssetOptions( options ) );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateBroadleafTreeAsync( options: BroadleafTreeMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateBroadleafTree( options ) );

	const normalized = normalizeOptions( options );
	const request = workerRequest( 'broadleaf-tree', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `broadleaf-tree:${ normalized.options.seed ?? 1 }` ), vegetationAssetOptions( options ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generateBroadleafTree( options );
		throw error;
	}

}

export class BroadleafTreeMesh extends VegetationMesh {

	constructor( options: BroadleafTreeMeshOptions = {} ) {

		super( generateBroadleafTree( options ), options.lod, true );

	}

	static createLOD( options: BroadleafTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultHeight = options.height ?? DEFAULT_BROADLEAF_TREE_HEIGHT;
		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * defaultHeight / DEFAULT_BROADLEAF_TREE_HEIGHT );
		return VegetationMesh.fromAsset( generateBroadleafTree( options ), distances ?? defaultDistances, true );

	}

}

export type { BroadleafTreeOptions };
