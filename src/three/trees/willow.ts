import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import type { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_WILLOW_TREE_BARK_COLOR, DEFAULT_WILLOW_TREE_HEIGHT, DEFAULT_WILLOW_TREE_LEAF_COLOR, generateWillowTreeData, normalizeWillowTreeGenerationOptions } from '../../core/trees/willow';
import type { WillowTreeOptions } from '../../core/trees/willow';
import { createVegetationAsset, createVegetationLOD, generateVegetationAssetAsync, normalizeTreeMeshOptions } from '../meshShared';

export type WillowTreeMeshOptions = Omit<WillowTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: WillowTreeMeshOptions ) {

	return normalizeTreeMeshOptions<WillowTreeOptions>( options, {
		leaf: DEFAULT_WILLOW_TREE_LEAF_COLOR,
		bark: DEFAULT_WILLOW_TREE_BARK_COLOR,
	}, normalizeWillowTreeGenerationOptions );

}

export function generateWillowTree( options: WillowTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return createVegetationAsset( generateWillowTreeData( normalized.options ), normalized.colors, options );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateWillowTreeAsync( options: WillowTreeMeshOptions = {} ): Promise<VegetationAsset> {

	return generateVegetationAssetAsync( options, 'willow-tree', normalizeOptions, generateWillowTree );

}

export class WillowTreeMesh extends VegetationMesh {

	constructor( options: WillowTreeMeshOptions = {} ) {

		super( generateWillowTree( options ), options.lod, true );

	}

	static createLOD( options: WillowTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const height = options.height ?? DEFAULT_WILLOW_TREE_HEIGHT;
		return createVegetationLOD( () => generateWillowTree( options ), distances, ( distance ) => distance * height / DEFAULT_WILLOW_TREE_HEIGHT );

	}

}

export type { WillowTreeOptions };
