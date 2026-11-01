import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import type { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_BROADLEAF_TREE_BARK_COLOR, DEFAULT_BROADLEAF_TREE_HEIGHT, DEFAULT_BROADLEAF_TREE_LEAF_COLOR, generateBroadleafTreeData, normalizeBroadleafTreeGenerationOptions } from '../../core/trees/broadleaf';
import type { BroadleafTreeOptions } from '../../core/trees/broadleaf';
import { createVegetationAsset, createVegetationLOD, generateVegetationAssetAsync, normalizeTreeMeshOptions } from '../meshShared';

export type BroadleafTreeMeshOptions = Omit<BroadleafTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: BroadleafTreeMeshOptions ) {

	return normalizeTreeMeshOptions<BroadleafTreeOptions>( options, {
		leaf: DEFAULT_BROADLEAF_TREE_LEAF_COLOR,
		bark: DEFAULT_BROADLEAF_TREE_BARK_COLOR,
	}, normalizeBroadleafTreeGenerationOptions );

}

export function generateBroadleafTree( options: BroadleafTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return createVegetationAsset( generateBroadleafTreeData( normalized.options ), normalized.colors, options );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateBroadleafTreeAsync( options: BroadleafTreeMeshOptions = {} ): Promise<VegetationAsset> {

	return generateVegetationAssetAsync( options, 'broadleaf-tree', normalizeOptions, generateBroadleafTree );

}

export class BroadleafTreeMesh extends VegetationMesh {

	constructor( options: BroadleafTreeMeshOptions = {} ) {

		super( generateBroadleafTree( options ), options.lod, true );

	}

	static createLOD( options: BroadleafTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const height = options.height ?? DEFAULT_BROADLEAF_TREE_HEIGHT;
		return createVegetationLOD( () => generateBroadleafTree( options ), distances, ( distance ) => distance * height / DEFAULT_BROADLEAF_TREE_HEIGHT );

	}

}

export type { BroadleafTreeOptions };
