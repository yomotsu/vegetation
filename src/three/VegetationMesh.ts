import { LOD, Mesh } from 'three';
import type { BufferGeometry, ColorRepresentation, MeshStandardMaterial } from 'three';
import type { LodLevel } from '../core/types';
import { VegetationAsset } from './VegetationAsset';

/** LOD の各パーツを単一マテリアルの Mesh として構成します。 */
export class VegetationMesh extends Mesh<BufferGeometry, MeshStandardMaterial> {

	private partMeshes: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
	private shadowCast = false;
	private shadowReceive = false;

	declare castShadow: boolean;
	declare receiveShadow: boolean;

	readonly asset: VegetationAsset;
	readonly lod: LodLevel;

	constructor( asset: VegetationAsset, lod = 0 ) {

		const level = Math.floor( Math.max( 0, Math.min( 4, Number.isFinite( lod ) ? lod : 0 ) ) ) as LodLevel;
		const parts = asset.getParts( level );
		const first = parts[ 0 ];

		if ( first === undefined ) {
			throw new Error( `Vegetation LOD ${ level } has no parts` );
		}

		super( first.geometry, first.material );
		this.asset = asset;
		this.lod = level;
		this.name = first.part;
		const castShadow = this.castShadow;
		const receiveShadow = this.receiveShadow;

		Object.defineProperties( this, {
			castShadow: {
				configurable: true,
				enumerable: true,
				get: () => this.shadowCast,
				set: ( value: boolean ) => {
					this.shadowCast = value;
					for ( const mesh of this.partMeshes ) {
						if ( mesh !== this ) mesh.castShadow = value;
					}
				},
			},
			receiveShadow: {
				configurable: true,
				enumerable: true,
				get: () => this.shadowReceive,
				set: ( value: boolean ) => {
					this.shadowReceive = value;
					for ( const mesh of this.partMeshes ) {
						if ( mesh !== this ) mesh.receiveShadow = value;
					}
				},
			},
		} );

		this.castShadow = castShadow;
		this.receiveShadow = receiveShadow;
		this.partMeshes.push( this );

		for ( const part of parts.slice( 1 ) ) {

			const mesh = new Mesh( part.geometry, part.material );
			mesh.name = part.part;
			mesh.castShadow = this.shadowCast;
			mesh.receiveShadow = this.shadowReceive;
			this.add( mesh );
			this.partMeshes.push( mesh );

		}

	}

	get parts(): Mesh<BufferGeometry, MeshStandardMaterial>[] {

		return [ ...this.partMeshes ];

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
