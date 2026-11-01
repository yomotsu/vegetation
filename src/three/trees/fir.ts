import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import type { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_FIR_TREE_BARK_COLOR, DEFAULT_FIR_TREE_HEIGHT, DEFAULT_FIR_TREE_LEAF_COLOR, generateFirTreeData, normalizeFirTreeGenerationOptions } from '../../core/trees/fir';
import type { FirTreeOptions } from '../../core/trees/fir';
import { createVegetationAsset, createVegetationLOD, generateVegetationAssetAsync, normalizeTreeMeshOptions } from '../meshShared';

export type FirTreeMeshOptions = Omit<FirTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: FirTreeMeshOptions ) {

	return normalizeTreeMeshOptions<FirTreeOptions>( options, {
		leaf: DEFAULT_FIR_TREE_LEAF_COLOR,
		bark: DEFAULT_FIR_TREE_BARK_COLOR,
	}, normalizeFirTreeGenerationOptions );

}

export function generateFirTree( options: FirTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return createVegetationAsset( generateFirTreeData( normalized.options ), normalized.colors, options );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateFirTreeAsync( options: FirTreeMeshOptions = {} ): Promise<VegetationAsset> {

	return generateVegetationAssetAsync( options, 'fir-tree', normalizeOptions, generateFirTree );

}

export class FirTreeMesh extends VegetationMesh {

	constructor( options: FirTreeMeshOptions = {} ) {

		super( generateFirTree( options ), options.lod, true );

	}

	static createLOD( options: FirTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const height = options.height ?? DEFAULT_FIR_TREE_HEIGHT;
		return createVegetationLOD( () => generateFirTree( options ), distances, ( distance ) => distance * height / DEFAULT_FIR_TREE_HEIGHT );

	}

}

export type { FirTreeOptions };
