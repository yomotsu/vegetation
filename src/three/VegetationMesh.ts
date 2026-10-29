import { BufferAttribute, BufferGeometry, FrontSide, InstancedMesh, LOD, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import type { Camera, Color, ColorRepresentation } from 'three';
import type { LodLevel } from '../core/types';
import { createBidirectionalCardGeometry } from './grassCardGeometry';
import { VegetationAsset } from './VegetationAsset';
import type { VegetationMaterial } from './impostorMaterialFactory';

const up = new Vector3( 0, 1, 0 );

function createEmptyGeometry( source: BufferGeometry ): BufferGeometry {

	const geometry = new BufferGeometry();
	const attributes: [ string, number ][] = [ [ 'position', 3 ], [ 'normal', 3 ], [ 'uv', 2 ], [ 'impostorCard', 1 ] ];

	for ( const [ name, itemSize ] of attributes ) {

		geometry.setAttribute( name, new BufferAttribute( new Float32Array( itemSize ), itemSize ) );

	}

	geometry.setDrawRange( 0, 0 );
	geometry.boundingSphere = source.boundingSphere?.clone() ?? null;

	return geometry;

}

function createBillboardPlaneGeometry( source: BufferGeometry, planeIndex: number ): BufferGeometry {

	const geometry = new BufferGeometry();
	const attributes = [ 'position', 'normal', 'uv', 'color', 'windWeight', 'impostorCard' ];

	for ( const name of attributes ) {

		const attribute = source.getAttribute( name );

		if ( attribute !== undefined ) {

			geometry.setAttribute( name, attribute );

		}

	}

	const index = source.getIndex()!;
	const start = planeIndex * 6;
	geometry.setIndex( new BufferAttribute( index.array.slice( start, start + 6 ), 1 ) );
	geometry.boundingSphere = source.boundingSphere?.clone() ?? null;

	return geometry;

}

function createImpostorCardGeometry( source: BufferGeometry, cardId: number ): BufferGeometry {

	const geometry = new BufferGeometry();
	const attributes = [ 'position', 'normal', 'uv', 'color', 'windWeight', 'impostorCard' ];

	for ( const name of attributes ) {

		const attribute = source.getAttribute( name );

		if ( attribute !== undefined ) {

			geometry.setAttribute( name, attribute );

		}

	}

	const cards = source.getAttribute( 'impostorCard' );
	const indices = source.getIndex()!;
	const selected: number[] = [];

	for ( let index = 0; index < indices.count; index += 3 ) {

		if ( cards.getX( indices.getX( index ) ) === cardId ) {

			selected.push( indices.getX( index ), indices.getX( index + 1 ), indices.getX( index + 2 ) );

		}

	}

	geometry.setIndex( new BufferAttribute( new Uint32Array( selected ), 1 ) );
	geometry.boundingSphere = source.boundingSphere?.clone() ?? null;

	return geometry;

}

/** 水平カードの UV も一緒に回るため、各 LOD4 インスタンス全体を yaw 回転します。 */
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
export class VegetationMesh extends Mesh<BufferGeometry, VegetationMaterial> {

	private partMeshes: Mesh<BufferGeometry, VegetationMaterial>[] = [];
	private readonly ownedGeometries: BufferGeometry[] = [];
	private readonly ownedMaterials: VegetationMaterial[] = [];
	private shadowCast = false;
	private shadowReceive = false;
	private readonly ownsAsset: boolean;
	private readonly emptyGeometry: BufferGeometry | null;
	private disposed = false;

	declare castShadow: boolean;
	declare receiveShadow: boolean;

	readonly asset: VegetationAsset;
	readonly lod: LodLevel;

	constructor( asset: VegetationAsset, lod = 0, ownsAsset = false ) {

		const level = Math.floor( Math.max( 0, Math.min( 4, Number.isFinite( lod ) ? lod : 0 ) ) ) as LodLevel;
		const parts = asset.getParts( level );
		const first = parts[ 0 ];

		if ( first === undefined ) {
			throw new Error( `Vegetation LOD ${ level } has no parts` );
		}

		const firstPartIndex = asset.data.lods[ level ]!.groups[ 0 ]!.partIndex;
		const firstPartDefinition = asset.data.parts[ firstPartIndex ]!;
		const isCameraFacingBillboard = level === 4 && ( firstPartDefinition.impostorViews !== undefined || firstPartDefinition.impostorYawAngles !== undefined );
		const isGrassCard = asset.data.kind === 'grass';
		const cardAttribute = first.geometry.getAttribute( 'impostorCard' );
		const hasHorizontalCard = level === 3 && cardAttribute !== undefined && Array.from( cardAttribute.array ).some( ( card ) => card === 1 );
		const splitCards = isCameraFacingBillboard || hasHorizontalCard;
		const rootGeometry = splitCards
			? createEmptyGeometry( first.geometry )
			: isGrassCard ? createBidirectionalCardGeometry( first.geometry ) : first.geometry;
		const rootMaterial = isGrassCard ? first.material.clone() : first.material;
		if ( isGrassCard ) rootMaterial.side = FrontSide;
		super( rootGeometry, rootMaterial );
		this.asset = asset;
		this.lod = level;
		this.ownsAsset = ownsAsset;
		this.emptyGeometry = splitCards ? rootGeometry : null;
		if ( isGrassCard ) {
			this.ownedGeometries.push( rootGeometry );
			this.ownedMaterials.push( rootMaterial );
		}
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
						if ( mesh !== this ) mesh.castShadow = value && mesh.userData.impostorCard !== 1;
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
		if ( splitCards ) {

			const part = parts[ 0 ]!;
			const billboardGeometry = isCameraFacingBillboard ? createBillboardPlaneGeometry( part.geometry, 0 ) : createImpostorCardGeometry( part.geometry, 0 );
			const topCardGeometry = isCameraFacingBillboard ? createBillboardPlaneGeometry( part.geometry, 1 ) : createImpostorCardGeometry( part.geometry, 1 );
			const billboard = new Mesh( billboardGeometry, part.material );
			const topCard = new Mesh( topCardGeometry, part.material );
			const cameraPosition = new Vector3();
			billboard.name = part.part;
			topCard.name = part.part;
			topCard.userData.impostorCard = 1;
			billboard.castShadow = this.shadowCast;
			billboard.receiveShadow = this.shadowReceive;
			topCard.castShadow = false;
			topCard.receiveShadow = this.shadowReceive;
			const shadowCameras = new WeakSet<Camera>();
			const inverseWorldMatrix = new Matrix4();
			if ( isCameraFacingBillboard ) {

				billboard.onBeforeShadow = ( renderer, object, camera, shadowCamera ) => {

					shadowCameras.add( shadowCamera );

				};

				billboard.onAfterShadow = ( renderer, object, camera, shadowCamera ) => {

					shadowCameras.delete( shadowCamera );

				};

				billboard.onBeforeRender = ( renderer, scene, camera ) => {

					if ( shadowCameras.has( camera ) ) {
						return;
					}

					cameraPosition.setFromMatrixPosition( camera.matrixWorld );
					inverseWorldMatrix.copy( this.matrixWorld ).invert();
					cameraPosition.applyMatrix4( inverseWorldMatrix );
					billboard.rotation.set( 0, Math.atan2( cameraPosition.x, cameraPosition.z ), 0 );
					billboard.updateMatrixWorld( true );

				};

			}
			this.add( billboard );
			this.add( topCard );
			this.partMeshes.push( billboard, topCard );
			this.ownedGeometries.push( billboardGeometry, topCardGeometry );

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

	get parts(): Mesh<BufferGeometry, VegetationMaterial>[] {

		return [ ...this.partMeshes ];

	}

	get collider(): BufferGeometry | null {

		return this.asset.collider;

	}

	getColor( part: string ): Color {

		return this.asset.getColor( part );

	}

	setColor( part: string, color: ColorRepresentation ): void {

		this.asset.setColor( part, color );

	}

	dispose(): void {

		if ( this.disposed ) {
			return;
		}

		this.disposed = true;
		this.emptyGeometry?.dispose();
		for ( const geometry of this.ownedGeometries ) {

			geometry.dispose();

		}
		for ( const material of this.ownedMaterials ) material.dispose();

		if ( this.ownsAsset ) {
			this.asset.dispose();
		}

	}

	static fromAsset( asset: VegetationAsset, distances: number[], ownsAsset = false ): LOD {

		if ( distances.length !== 5 ) {

			throw new RangeError( 'Expected five LOD distances' );

		}

		const lod = new LOD();

		for ( let level = 0; level < 5; level ++ ) {

			lod.addLevel( new VegetationMesh( asset, level, ownsAsset ), distances[ level ]! );

		}

		return lod;

	}

}

export type { LodLevel };
