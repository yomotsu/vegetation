import { MeshBuilder } from '../meshBuilder';
import type { MeshData } from '../types';

export interface FlowerPlacement {
	x: number;
	z: number;
	yaw: number;
	crossAngle: number;
	height: number;
	leanX: number;
	leanZ: number;
	headTilt: number;
	headTiltYaw: number;
	variant: number;
}

export function addStemCard( builder: MeshBuilder, plant: FlowerPlacement, width: number, yaw: number, segments: number, bottom = 0, top = plant.height ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const halfWidth = width * 0.5;
	const vertices: number[] = [];
	for ( let row = 0; row <= segments; row ++ ) {
		const progress = 1 - ( 1 - row / segments ) ** 1.6;
		const y = bottom + ( top - bottom ) * progress;
		const bend = progress ** 2.4;
		const centerX = plant.x + plant.leanX * bend;
		const centerZ = plant.z + plant.leanZ * bend;
		const wind = top === plant.height ? progress : progress * top / plant.height;
		vertices.push(
			builder.addVertex( [ centerX - cosine * halfWidth, y, centerZ + sine * halfWidth ], [ 0, 1, 0 ], [ 0, progress ], [ 1, 1, 1 ], wind ),
			builder.addVertex( [ centerX + cosine * halfWidth, y, centerZ - sine * halfWidth ], [ 0, 1, 0 ], [ 1, progress ], [ 1, 1, 1 ], wind ),
		);
	}
	for ( let row = 0; row < segments; row ++ ) {
		const a = vertices[ row * 2 ]!;
		const b = vertices[ row * 2 + 1 ]!;
		builder.addTriangle( a, b, vertices[ row * 2 + 3 ]! );
		builder.addTriangle( a, vertices[ row * 2 + 3 ]!, vertices[ row * 2 + 2 ]! );
	}

}

export function addQuad( builder: MeshBuilder, points: [ number, number, number ][], uvs: [ number, number ][] = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ], wind = 1 ): void {

	const vertices = points.map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], uvs[ index ]!, [ 1, 1, 1 ], wind ) );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 2 ]! );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 2 ]!, vertices[ 3 ]! );

}

export function setPartIndex( mesh: MeshData, part: 'petal' | 'stem' ): MeshData {

	mesh.groups = mesh.groups.map( ( group ) => ( { ...group, partIndex: part === 'petal' ? 0 : 1 } ) );
	return mesh;

}

