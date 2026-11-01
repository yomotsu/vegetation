import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import type { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_BAMBOO_TREE_BARK_COLOR, DEFAULT_BAMBOO_TREE_HEIGHT, DEFAULT_BAMBOO_TREE_LEAF_COLOR, generateBambooTreeData, normalizeBambooTreeGenerationOptions } from '../../core/trees/bamboo';
import type { BambooTreeOptions } from '../../core/trees/bamboo';
import { createVegetationAsset, createVegetationLOD, generateVegetationAssetAsync, normalizeTreeMeshOptions } from '../meshShared';

export type BambooTreeMeshOptions = Omit<BambooTreeOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: BambooTreeMeshOptions ) {

	return normalizeTreeMeshOptions<BambooTreeOptions>( options, {
		leaf: DEFAULT_BAMBOO_TREE_LEAF_COLOR,
		bark: DEFAULT_BAMBOO_TREE_BARK_COLOR,
	}, normalizeBambooTreeGenerationOptions );

}

export function generateBambooTree( options: BambooTreeMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return createVegetationAsset( generateBambooTreeData( normalized.options ), normalized.colors, options );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateBambooTreeAsync( options: BambooTreeMeshOptions = {} ): Promise<VegetationAsset> {

	return generateVegetationAssetAsync( options, 'bamboo-tree', normalizeOptions, generateBambooTree );

}

export class BambooTreeMesh extends VegetationMesh {

	constructor( options: BambooTreeMeshOptions = {} ) {

		super( generateBambooTree( options ), options.lod, true );

	}

	static createLOD( options: BambooTreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const height = options.height ?? DEFAULT_BAMBOO_TREE_HEIGHT;
		return createVegetationLOD( () => generateBambooTree( options ), distances, ( distance ) => distance * height / DEFAULT_BAMBOO_TREE_HEIGHT );

	}

}

export type { BambooTreeOptions };
