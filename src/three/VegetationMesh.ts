import { LOD, Mesh } from 'three';
import type { BufferGeometry, ColorRepresentation, MeshStandardMaterial } from 'three';
import type { LodLevel } from '../core/types';
import { VegetationAsset } from './VegetationAsset';

export class VegetationMesh extends Mesh<BufferGeometry, MeshStandardMaterial[]> {

	readonly asset: VegetationAsset;
	readonly lod: LodLevel;

	constructor( asset: VegetationAsset, lod = 0 ) {

		const level = Math.floor( Math.max( 0, Math.min( 4, Number.isFinite( lod ) ? lod : 0 ) ) ) as LodLevel;
		super( asset.geometries[ level ]!, asset.materials );
		this.asset = asset;
		this.lod = level;

	}

	get collider(): BufferGeometry | null {

		return this.asset.collider;

	}

	setColor( part: string, color: ColorRepresentation ): void {

		this.asset.setColor( part, color );

	}

	static fromAsset( asset: VegetationAsset, distances: number[] ): LOD {

		if ( distances.length !== 5 ) {

			throw new RangeError( 'Expected five LOD distances' );

		}

		const lod = new LOD();

		for ( let level = 0; level < 5; level ++ ) {

			lod.addLevel( new VegetationMesh( asset, level ), distances[ level ]! );

		}

		return lod;

	}

}

export type { LodLevel };
