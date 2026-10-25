import { BufferGeometry, InstancedMesh, LOD, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import type { Camera, ColorRepresentation, MeshStandardMaterial } from 'three';
import type { LodLevel } from '../core/types';
import { VegetationAsset } from './VegetationAsset';

const up = new Vector3( 0, 1, 0 );

function createEmptyGeometry( source: BufferGeometry ): BufferGeometry {

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', source.getAttribute( 'position' ) );
	geometry.setIndex( [] );
	geometry.setDrawRange( 0, 0 );
	geometry.boundingSphere = source.boundingSphere?.clone() ?? null;

	return geometry;

}

/** InstancedMesh の各 LOD4 行列をカメラへ向け、位置とスケールを保ちます。 */
export function orientBillboardInstances( mesh: InstancedMesh, camera: Camera ): void {

	mesh.updateWorldMatrix( true, false );
	camera.updateWorldMatrix( true, false );
	const cameraPosition = camera.getWorldPosition( new Vector3() );
	const localCameraPosition = mesh.worldToLocal( cameraPosition );
	const matrix = new Matrix4();
	const position = new Vector3();
	const scale = new Vector3();
	const rotation = new Quaternion();

	for ( let index = 0; index < mesh.count; index ++ ) {

		mesh.getMatrixAt( index, matrix );
		matrix.decompose( position, rotation, scale );
		rotation.setFromAxisAngle( up, Math.atan2( localCameraPosition.x - position.x, localCameraPosition.z - position.z ) );
		matrix.compose( position, rotation, scale );
		mesh.setMatrixAt( index, matrix );

	}

	mesh.instanceMatrix.needsUpdate = true;

}

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

		super( level === 4 ? createEmptyGeometry( first.geometry ) : first.geometry, first.material );
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
		if ( level === 4 ) {

			const part = parts[ 0 ]!;
			const billboard = new Mesh( part.geometry, part.material );
			const cameraPosition = new Vector3();
			billboard.name = part.part;
			billboard.castShadow = this.shadowCast;
			billboard.receiveShadow = this.shadowReceive;
			billboard.onBeforeRender = ( renderer, scene, camera ) => {

				camera.updateWorldMatrix( true, false );
				this.updateWorldMatrix( true, false );
				camera.getWorldPosition( cameraPosition );
				this.worldToLocal( cameraPosition );
				billboard.rotation.set( 0, Math.atan2( cameraPosition.x, cameraPosition.z ), 0 );
				billboard.updateMatrixWorld( true );

			};
			this.add( billboard );
			this.partMeshes.push( billboard );

		} else {

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
