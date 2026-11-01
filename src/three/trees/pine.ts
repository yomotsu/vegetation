import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import type { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_PINE_TREE_BARK_COLOR, DEFAULT_PINE_TREE_HEIGHT, DEFAULT_PINE_TREE_LEAF_COLOR, generatePineTreeData, normalizePineTreeGenerationOptions } from '../../core/trees/pine';
import type { PineTreeOptions } from '../../core/trees/pine';
import { createVegetationAsset, createVegetationLOD, generateVegetationAssetAsync, normalizeTreeMeshOptions } from '../meshShared';

export type PineTreeMeshOptions = Omit<PineTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: PineTreeMeshOptions ) {

	return normalizeTreeMeshOptions<PineTreeOptions>( options, {
		leaf: DEFAULT_PINE_TREE_LEAF_COLOR,
		bark: DEFAULT_PINE_TREE_BARK_COLOR,
	}, normalizePineTreeGenerationOptions );

}

export function generatePineTree( options: PineTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return createVegetationAsset( generatePineTreeData( normalized.options ), normalized.colors, options );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generatePineTreeAsync( options: PineTreeMeshOptions = {} ): Promise<VegetationAsset> {

	return generateVegetationAssetAsync( options, 'pine-tree', normalizeOptions, generatePineTree );

}

export class PineTreeMesh extends VegetationMesh {

	constructor( options: PineTreeMeshOptions = {} ) {

		super( generatePineTree( options ), options.lod, true );

	}

	static createLOD( options: PineTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const height = options.height ?? DEFAULT_PINE_TREE_HEIGHT;
		return createVegetationLOD( () => generatePineTree( options ), distances, ( distance ) => distance * height / DEFAULT_PINE_TREE_HEIGHT );

	}

}

export type { PineTreeOptions };
