import type { ColorRepresentation, LOD } from 'three';
import type { KTX2LoaderLike } from '../VegetationAsset';
import type { VegetationAsset } from '../VegetationAsset';
import { VegetationMesh } from '../VegetationMesh';
import { DEFAULT_BAMBOO_SHOOT_CORE_COLOR, DEFAULT_BAMBOO_SHOOT_HEIGHT, DEFAULT_BAMBOO_SHOOT_SHEATH_COLOR, generateBambooShootData, normalizeBambooShootGenerationOptions } from '../../core/trees/bambooShoot';
import type { BambooShootOptions } from '../../core/trees/bambooShoot';
import { colorHex, createSmallVegetationLOD, createVegetationAsset, generateVegetationAssetAsync } from '../meshShared';

export type BambooShootMeshOptions = Omit<BambooShootOptions, 'coreColor' | 'sheathColor'> & {
	lod?: number;
	coreColor?: ColorRepresentation;
	sheathColor?: ColorRepresentation;
	compressTextures?: boolean;
	ktx2Loader?: KTX2LoaderLike;
};

function normalizeOptions( options: BambooShootMeshOptions ) {

	const coreColor = colorHex( options.coreColor, DEFAULT_BAMBOO_SHOOT_CORE_COLOR );
	const sheathColor = colorHex( options.sheathColor, DEFAULT_BAMBOO_SHOOT_SHEATH_COLOR );
	return normalizeBambooShootGenerationOptions( {
		seed: options.seed,
		height: options.height,
		coreColor,
		sheathColor,
	}, { core: coreColor, sheath: sheathColor } );

}

export function generateBambooShoot( options: BambooShootMeshOptions = {} ): VegetationAsset {

	const normalized = normalizeOptions( options );
	return createVegetationAsset( generateBambooShootData( normalized.options ), normalized.colors, options );

}

/** 同期 API と同じ LOD0 データを返します。 */
export async function generateBambooShootAsync( options: BambooShootMeshOptions = {} ): Promise<VegetationAsset> {

	return generateVegetationAssetAsync( options, 'bamboo-shoot', normalizeOptions, generateBambooShoot );

}

export class BambooShootMesh extends VegetationMesh {

	constructor( options: BambooShootMeshOptions = {} ) {

		super( generateBambooShoot( options ), options.lod, true );

	}

	static createLOD( options: BambooShootMeshOptions = {}, distances?: number[] ): LOD {

		const height = options.height ?? DEFAULT_BAMBOO_SHOOT_HEIGHT;
		return createSmallVegetationLOD( () => generateBambooShoot( options ), distances, ( distance ) => distance * height / DEFAULT_BAMBOO_SHOOT_HEIGHT );

	}

}

export type { BambooShootOptions };
