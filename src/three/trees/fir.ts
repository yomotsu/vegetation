import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_FIR_TREE_BARK_COLOR, DEFAULT_FIR_TREE_HEIGHT, DEFAULT_FIR_TREE_LEAF_COLOR, generateFirTreeData, normalizeFirTreeGenerationOptions } from '../../core/trees/fir';
import type { FirTreeOptions } from '../../core/trees/fir';
import { requestVegetationWorker, VegetationWorkerUnavailableError } from '../../worker/workerPool';
import { colorHex, vegetationAssetOptions, workerRequest } from '../meshShared';

export type FirTreeMeshOptions = Omit<FirTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: FirTreeMeshOptions ) {

	const leafColor = colorHex( options.leafColor, DEFAULT_FIR_TREE_LEAF_COLOR );
	const barkColor = colorHex( options.barkColor, DEFAULT_FIR_TREE_BARK_COLOR );
	return normalizeFirTreeGenerationOptions( { seed: options.seed, height: options.height, leafColor, barkColor }, { leaf: leafColor, bark: barkColor } );

}

export function generateFirTree( options: FirTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return new VegetationAsset( generateFirTreeData( normalized.options ), normalized.colors, 128, vegetationAssetOptions( options ) );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateFirTreeAsync( options: FirTreeMeshOptions = {} ): Promise<VegetationAsset> {

	if ( typeof Worker === 'undefined' ) return Promise.resolve().then( () => generateFirTree( options ) );

	const normalized = normalizeOptions( options );
	const request = workerRequest( 'fir-tree', normalized.options, normalized.colors );
	try {
		return VegetationAsset.fromPrepared( await requestVegetationWorker( request, `fir-tree:${ normalized.options.seed ?? 1 }` ), vegetationAssetOptions( options ) );
	} catch ( error ) {
		if ( error instanceof VegetationWorkerUnavailableError ) return generateFirTree( options );
		throw error;
	}

}

export class FirTreeMesh extends VegetationMesh {

	constructor( options: FirTreeMeshOptions = {} ) {

		super( generateFirTree( options ), options.lod, true );

	}

	static createLOD( options: FirTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultHeight = options.height ?? DEFAULT_FIR_TREE_HEIGHT;
		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * defaultHeight / DEFAULT_FIR_TREE_HEIGHT );
		return VegetationMesh.fromAsset( generateFirTree( options ), distances ?? defaultDistances, true );

	}

}

export type { FirTreeOptions };
