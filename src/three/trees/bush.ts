import type { ColorRepresentation } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import type { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_BUSH_BARK_COLOR, DEFAULT_BUSH_HEIGHT, DEFAULT_BUSH_LEAF_COLOR, generateBushData, normalizeBushGenerationOptions } from '../../core/trees/bush';
import type { BushOptions } from '../../core/trees/bush';
import { createVegetationAsset, createVegetationLOD, generateVegetationAssetAsync, normalizeTreeMeshOptions } from '../meshShared';

export type BushMeshOptions = Omit<BushOptions, 'leafColor' | 'barkColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: BushMeshOptions ) {

	return normalizeTreeMeshOptions<BushOptions>( options, {
		leaf: DEFAULT_BUSH_LEAF_COLOR,
		bark: DEFAULT_BUSH_BARK_COLOR,
	}, normalizeBushGenerationOptions );

}

export function generateBush( options: BushMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return createVegetationAsset( generateBushData( normalized.options ), normalized.colors, options );

}

/** 同期 API と同じ生成結果を返します。 */
export async function generateBushAsync( options: BushMeshOptions = {} ): Promise<VegetationAsset> {

	return generateVegetationAssetAsync( options, 'bush', normalizeOptions, generateBush );

}

export class BushMesh extends VegetationMesh {

	constructor( options: BushMeshOptions = {} ) {

		super( generateBush( options ), options.lod, true );

	}

	static createLOD( options: BushMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const height = options.height ?? DEFAULT_BUSH_HEIGHT;
		return createVegetationLOD( () => generateBush( options ), distances, ( distance ) => distance * height / DEFAULT_BUSH_HEIGHT );

	}

}

export type { BushOptions };
