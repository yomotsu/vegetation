import {
	Camera,
	BufferGeometry,
	DynamicDrawUsage,
	Group,
	InstancedMesh,
	Matrix4,
	Quaternion,
	StaticDrawUsage,
	Vector3,
} from 'three';
import { createRandom, orientBillboardInstances } from '../src/index';
import type { VegetationAsset } from '../src/index';
import { setPreviewShadowFlags } from './rendering';
import { createGrassScatter } from './grassScatter';

const lodDistances = [ 12, 24, 42, 65 ];
const up = new Vector3( 0, 1, 0 );

interface ScatterPosition {
	position: Vector3;
	rotation: Quaternion;
	scale: number;
	variant: number;
}

interface ScatterBatch {
	lod: number;
	part: string;
	variant: number;
	billboard: boolean;
	active: boolean;
	mesh: InstancedMesh;
}

export interface ScatterController {
	group: Group;
	update: ( camera: Camera, time: number ) => number;
	dispose: () => void;
}

export function createScatter( input: VegetationAsset | VegetationAsset[], requestedCount = 2000, seed = 1 ): ScatterController {

	const count = Number.isFinite( requestedCount ) ? Math.max( 0, Math.floor( requestedCount ) ) : 2000;
	const assets = ( Array.isArray( input ) ? input : [ input ] ).slice( 0, 4 );
	if ( assets.length > 0 && assets.every( ( asset ) => asset.data.kind === 'grass' ) ) return createGrassScatter( assets, seed );

	const random = createRandom( seed );
	const group = new Group();
	const batches: ScatterBatch[] = [];
	const batchesByLodAndVariant: ScatterBatch[][] = Array.from( { length: assets.length * 5 }, () => [] );
	const emptyGeometries: BufferGeometry[] = [];
	const positions: ScatterPosition[] = [];
	const cameraPosition = new Vector3();
	const matrix = new Matrix4();
	const scale = new Vector3();
	let lastUpdate = - Infinity;
	let triangles = 0;

	for ( let index = 0; index < count; index ++ ) {

		positions.push( {
			position: new Vector3( random.range( - 50, 50 ), 0, random.range( - 50, 50 ) ),
			rotation: new Quaternion().setFromAxisAngle( up, random.range( 0, Math.PI * 2 ) ),
			scale: random.range( 0.82, 1.18 ),
			variant: random.int( 0, assets.length - 1 ),
		} );

	}

	for ( let variant = 0; variant < assets.length; variant ++ ) {

		const asset = assets[ variant ]!;

		for ( let lod = 0; lod < 5; lod ++ ) {

			const parts = asset.getParts( lod );

			for ( const definition of asset.data.parts ) {

				const part = parts.find( ( candidate ) => candidate.part === definition.name );
				let geometry: BufferGeometry;

				if ( part === undefined ) {
					geometry = new BufferGeometry();
					emptyGeometries.push( geometry );
				} else {
					geometry = part.geometry;
				}

				const mesh = new InstancedMesh( geometry, asset.materials[ asset.data.parts.indexOf( definition ) ]!, count );
				mesh.count = 0;
				mesh.visible = false;
				mesh.frustumCulled = false;
				setPreviewShadowFlags( mesh );
				mesh.instanceMatrix.setUsage( lod === 4 ? DynamicDrawUsage : StaticDrawUsage );
				mesh.userData.lod = lod;
				mesh.userData.part = definition.name;
				mesh.userData.variant = variant;
				group.add( mesh );

				const batch = {
					lod,
					part: definition.name,
					variant,
					billboard: definition.impostorViews !== undefined || definition.impostorYawAngles !== undefined,
					active: part !== undefined,
					mesh,
				};
				batches.push( batch );
				batchesByLodAndVariant[ variant * 5 + lod ]!.push( batch );

			}

		}

	}

	function update( camera: Camera, time: number ): number {

		if ( time - lastUpdate < 500 ) {

			for ( const batch of batches ) {

				if ( batch.lod === 4 && batch.billboard && batch.mesh.visible && batch.mesh.count > 0 ) orientBillboardInstances( batch.mesh, camera );

			}

			return triangles;

		}

		lastUpdate = time;

		for ( const batch of batches ) {

			batch.mesh.count = 0;
			batch.mesh.visible = false;

		}

		camera.getWorldPosition( cameraPosition );

		for ( const instance of positions ) {

			const distance = cameraPosition.distanceTo( instance.position );
			let lod = lodDistances.findIndex( ( limit ) => distance < limit );
			if ( lod === - 1 ) lod = 4;

			const batchList = batchesByLodAndVariant[ instance.variant * 5 + lod ]!.filter( ( batch ) => batch.active );
			matrix.compose( instance.position, instance.rotation, scale.setScalar( instance.scale ) );

			for ( const batch of batchList ) {

				batch.mesh.setMatrixAt( batch.mesh.count, matrix );
				batch.mesh.count ++;

			}

		}

		triangles = 0;

		for ( const batch of batches ) {

			batch.mesh.visible = batch.mesh.count > 0;
			if ( batch.mesh.count > 0 ) batch.mesh.instanceMatrix.needsUpdate = true;
			if ( batch.lod === 4 && batch.billboard && batch.mesh.count > 0 ) orientBillboardInstances( batch.mesh, camera );
			triangles += batch.mesh.count * ( batch.mesh.geometry.getIndex()?.count ?? 0 ) / 3;

		}

		return triangles;

	}

	function dispose(): void {

		for ( const batch of batches ) batch.mesh.dispose();
		group.clear();
		for ( const geometry of emptyGeometries ) geometry.dispose();
		batches.length = 0;
		emptyGeometries.length = 0;
		positions.length = 0;

	}

	return { group, update, dispose };

}
