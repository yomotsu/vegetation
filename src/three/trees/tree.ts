import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_BARK_COLOR } from '../../core/barkTexture';
import { DEFAULT_LEAF_COLOR } from '../../core/leafTexture';
import { generateTreeData } from '../../core/generators/tree';
import type { TreeOptions } from '../../core/generators/tree';
import { normalizeTreeGenerationOptions } from '../../core/generationOptions/tree';
import { requestVegetationWorker, VegetationWorkerUnavailableError } from '../../worker/workerPool';
import { colorHex, vegetationAssetOptions, workerRequest } from '../meshShared';

export type TreeMeshOptions = Omit<TreeOptions, 'leafColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: TreeMeshOptions ) {

	const leafColor = colorHex( options.leafColor, DEFAULT_LEAF_COLOR );
	const barkColor = colorHex( options.barkColor, DEFAULT_BARK_COLOR );
	return normalizeTreeGenerationOptions( {
		seed: options.seed,
		height: options.height,
		crownSize: options.crownSize,
		branchCount: options.branchCount,
		leafColor,
	}, { leaf: leafColor, bark: barkColor } );

}

export function generateTree( options: TreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return new VegetationAsset( generateTreeData( normalized.options ), normalized.colors, 128, vegetationAssetOptions( options ) );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateTreeAsync( options: TreeMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateTree( options ) );

	const normalized = normalizeOptions( options );
	const request = workerRequest( 'tree', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `tree:${ normalized.options.seed ?? 1 }` ), vegetationAssetOptions( options ) );
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

		const defaultHeight = options.height ?? 7.5;
		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * defaultHeight / 7.5 );
		return VegetationMesh.fromAsset( generateTree( options ), distances ?? defaultDistances, true );

	}

}

export type { TreeOptions };
