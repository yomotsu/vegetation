import type { MeshData } from '../../src/core';

/** Returns the narrowest 1-ring cone angle on any above-ground vertex. */
export function minimumRockApexAngle( mesh: Pick<MeshData, 'positions' | 'indices'> ): number {

	const groups = new Map<string, number>();
	const positions: [ number, number, number ][] = [];
	const vertexGroups = new Array<number>( mesh.positions.length / 3 );

	for ( let vertex = 0; vertex < vertexGroups.length; vertex ++ ) {

		const offset = vertex * 3;
		const point: [ number, number, number ] = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		const key = point.map( ( value ) => value.toFixed( 6 ) ).join( ',' );
		let group = groups.get( key );

		if ( group === undefined ) {

			group = positions.length;
			groups.set( key, group );
			positions.push( point );

		}

		vertexGroups[ vertex ] = group;

	}

	const neighbors = positions.map( () => new Set<number>() );

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const triangle = [ vertexGroups[ mesh.indices[ index ]! ]!, vertexGroups[ mesh.indices[ index + 1 ]! ]!, vertexGroups[ mesh.indices[ index + 2 ]! ]! ];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = triangle[ edge ]!;
			const second = triangle[ ( edge + 1 ) % 3 ]!;
			if ( first === second ) continue;
			neighbors[ first ]!.add( second );
			neighbors[ second ]!.add( first );

		}

	}

	let minimumAngle = 180;

	for ( let vertex = 0; vertex < positions.length; vertex ++ ) {

		const point = positions[ vertex ]!;
		const adjacent = neighbors[ vertex ]!;
		if ( point[ 1 ] <= 0 || adjacent.size < 3 ) continue;

		const average: [ number, number, number ] = [ 0, 0, 0 ];
		for ( const neighbor of adjacent ) {
			average[ 0 ] += positions[ neighbor ]![ 0 ]! / adjacent.size;
			average[ 1 ] += positions[ neighbor ]![ 1 ]! / adjacent.size;
			average[ 2 ] += positions[ neighbor ]![ 2 ]! / adjacent.size;
		}

		const axis: [ number, number, number ] = [ average[ 0 ] - point[ 0 ], average[ 1 ] - point[ 1 ], average[ 2 ] - point[ 2 ] ];
		const axisLength = Math.hypot( ...axis );
		if ( axisLength < 1e-8 ) continue;
		axis[ 0 ] /= axisLength;
		axis[ 1 ] /= axisLength;
		axis[ 2 ] /= axisLength;
		let widestHalfAngle = 0;

		for ( const neighbor of adjacent ) {
			const other = positions[ neighbor ]!;
			const ray: [ number, number, number ] = [ other[ 0 ] - point[ 0 ], other[ 1 ] - point[ 1 ], other[ 2 ] - point[ 2 ] ];
			const rayLength = Math.hypot( ...ray );
			if ( rayLength < 1e-8 ) continue;
			const cosine = Math.max( - 1, Math.min( 1, ( ray[ 0 ] * axis[ 0 ] + ray[ 1 ] * axis[ 1 ] + ray[ 2 ] * axis[ 2 ] ) / rayLength ) );
			widestHalfAngle = Math.max( widestHalfAngle, Math.acos( cosine ) );
		}

		minimumAngle = Math.min( minimumAngle, widestHalfAngle * 360 / Math.PI );

	}

	return minimumAngle;

}

export function minimumRockTriangleAngle( mesh: Pick<MeshData, 'positions' | 'indices'> ): number {

	let minimum = 180;

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const vertices = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];
		const points = vertices.map( ( vertex ) => [ mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! ] as [ number, number, number ] );
		if ( Math.max( points[ 0 ]![ 1 ], points[ 1 ]![ 1 ], points[ 2 ]![ 1 ] ) <= 0 ) continue;

		for ( let corner = 0; corner < 3; corner ++ ) {

			const first = points[ ( corner + 1 ) % 3 ]!;
			const second = points[ ( corner + 2 ) % 3 ]!;
			const origin = points[ corner ]!;
			const a: [ number, number, number ] = [ first[ 0 ] - origin[ 0 ], first[ 1 ] - origin[ 1 ], first[ 2 ] - origin[ 2 ] ];
			const b: [ number, number, number ] = [ second[ 0 ] - origin[ 0 ], second[ 1 ] - origin[ 1 ], second[ 2 ] - origin[ 2 ] ];
			const aLength = Math.hypot( ...a );
			const bLength = Math.hypot( ...b );
			if ( aLength < 1e-8 || bLength < 1e-8 ) continue;
			const cosine = Math.max( - 1, Math.min( 1, ( a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ] ) / ( aLength * bLength ) ) );
			const angle = Math.acos( cosine ) * 180 / Math.PI;

			minimum = Math.min( minimum, angle );

		}

	}

	return minimum;

}

export function minimumRockDihedralAngle( mesh: Pick<MeshData, 'positions' | 'indices'> ): number {

	const groups = new Map<string, number>();
	const positions: [ number, number, number ][] = [];
	const vertexGroups = new Array<number>( mesh.positions.length / 3 );

	for ( let vertex = 0; vertex < vertexGroups.length; vertex ++ ) {

		const offset = vertex * 3;
		const point: [ number, number, number ] = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		const key = point.map( ( value ) => value.toFixed( 6 ) ).join( ',' );
		let group = groups.get( key );

		if ( group === undefined ) {

			group = positions.length;
			groups.set( key, group );
			positions.push( point );

		}

		vertexGroups[ vertex ] = group;

	}

	const edges = new Map<string, { first: number; second: number; normals: [ number, number, number ][] }>();

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ].map( ( vertex ) => vertexGroups[ vertex ]! );
		const points = triangle.map( ( vertex ) => positions[ vertex ]! );
		const ab: [ number, number, number ] = [ points[ 1 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 1 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 1 ]![ 2 ] - points[ 0 ]![ 2 ] ];
		const ac: [ number, number, number ] = [ points[ 2 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 2 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 2 ]![ 2 ] - points[ 0 ]![ 2 ] ];
		const normal: [ number, number, number ] = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
		const length = Math.hypot( ...normal );
		if ( length < 1e-8 ) continue;
		for ( let axis = 0; axis < 3; axis ++ ) normal[ axis ]! /= length;

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = triangle[ edge ]!;
			const second = triangle[ ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			const record = edges.get( key ) ?? { first, second, normals: [] };
			record.normals.push( normal as [ number, number, number ] );
			edges.set( key, record );

		}

	}

	let minimum = 180;

	for ( const edge of edges.values() ) {

		if ( edge.normals.length !== 2 ) continue;
		if ( positions[ edge.first ]![ 1 ] <= 0 && positions[ edge.second ]![ 1 ] <= 0 ) continue;
		const first = edge.normals[ 0 ]!;
		const second = edge.normals[ 1 ]!;
		const dot = Math.max( - 1, Math.min( 1, first[ 0 ] * second[ 0 ] + first[ 1 ] * second[ 1 ] + first[ 2 ] * second[ 2 ] ) );
		minimum = Math.min( minimum, 180 - Math.acos( dot ) * 180 / Math.PI );

	}

	return minimum;

}

export function hasRockSelfIntersection( mesh: Pick<MeshData, 'positions' | 'indices'> ): boolean {

	const triangles: { vertices: number[]; points: [ number, number, number ][]; minimum: [ number, number, number ]; maximum: [ number, number, number ] }[] = [];

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const vertices = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];
		const points = vertices.map( ( vertex ) => [ mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! ] as [ number, number, number ] );
		triangles.push( {
			vertices,
			points,
			minimum: [ 0, 1, 2 ].map( ( axis ) => Math.min( ...points.map( ( point ) => point[ axis ]! ) ) ) as [ number, number, number ],
			maximum: [ 0, 1, 2 ].map( ( axis ) => Math.max( ...points.map( ( point ) => point[ axis ]! ) ) ) as [ number, number, number ],
		} );

	}

	const segmentCrossesTriangle = ( start: number[], end: number[], triangle: number[][] ): boolean => {

		const direction = [ end[ 0 ]! - start[ 0 ]!, end[ 1 ]! - start[ 1 ]!, end[ 2 ]! - start[ 2 ]! ];
		const edge1 = [ triangle[ 1 ]![ 0 ]! - triangle[ 0 ]![ 0 ]!, triangle[ 1 ]![ 1 ]! - triangle[ 0 ]![ 1 ]!, triangle[ 1 ]![ 2 ]! - triangle[ 0 ]![ 2 ]! ];
		const edge2 = [ triangle[ 2 ]![ 0 ]! - triangle[ 0 ]![ 0 ]!, triangle[ 2 ]![ 1 ]! - triangle[ 0 ]![ 1 ]!, triangle[ 2 ]![ 2 ]! - triangle[ 0 ]![ 2 ]! ];
		const cross = [ direction[ 1 ]! * edge2[ 2 ]! - direction[ 2 ]! * edge2[ 1 ]!, direction[ 2 ]! * edge2[ 0 ]! - direction[ 0 ]! * edge2[ 2 ]!, direction[ 0 ]! * edge2[ 1 ]! - direction[ 1 ]! * edge2[ 0 ]! ];
		const determinant = edge1[ 0 ]! * cross[ 0 ]! + edge1[ 1 ]! * cross[ 1 ]! + edge1[ 2 ]! * cross[ 2 ]!;
		if ( Math.abs( determinant ) < 1e-8 ) return false;
		const inverse = 1 / determinant;
		const offset = [ start[ 0 ]! - triangle[ 0 ]![ 0 ]!, start[ 1 ]! - triangle[ 0 ]![ 1 ]!, start[ 2 ]! - triangle[ 0 ]![ 2 ]! ];
		const u = ( offset[ 0 ]! * cross[ 0 ]! + offset[ 1 ]! * cross[ 1 ]! + offset[ 2 ]! * cross[ 2 ]! ) * inverse;
		if ( u <= 1e-6 || u >= 1 - 1e-6 ) return false;
		const q = [ offset[ 1 ]! * edge1[ 2 ]! - offset[ 2 ]! * edge1[ 1 ]!, offset[ 2 ]! * edge1[ 0 ]! - offset[ 0 ]! * edge1[ 2 ]!, offset[ 0 ]! * edge1[ 1 ]! - offset[ 1 ]! * edge1[ 0 ]! ];
		const v = ( direction[ 0 ]! * q[ 0 ]! + direction[ 1 ]! * q[ 1 ]! + direction[ 2 ]! * q[ 2 ]! ) * inverse;
		if ( v <= 1e-6 || u + v >= 1 - 1e-6 ) return false;
		const distance = ( edge2[ 0 ]! * q[ 0 ]! + edge2[ 1 ]! * q[ 1 ]! + edge2[ 2 ]! * q[ 2 ]! ) * inverse;

		return distance > 1e-6 && distance < 1 - 1e-6;

	};

	for ( let first = 0; first < triangles.length; first ++ ) {

		const a = triangles[ first ]!;

		for ( let second = first + 1; second < triangles.length; second ++ ) {

			const b = triangles[ second ]!;
			if ( a.points.some( ( first ) => b.points.some( ( second ) => Math.hypot( first[ 0 ] - second[ 0 ], first[ 1 ] - second[ 1 ], first[ 2 ] - second[ 2 ] ) < 1e-6 ) ) ) continue;
			if ( [ 0, 1, 2 ].some( ( axis ) => a.maximum[ axis ]! < b.minimum[ axis ]! - 1e-6 || b.maximum[ axis ]! < a.minimum[ axis ]! - 1e-6 ) ) continue;

			for ( let edge = 0; edge < 3; edge ++ ) {

				if ( segmentCrossesTriangle( a.points[ edge ]!, a.points[ ( edge + 1 ) % 3 ]!, b.points ) ) return true;
				if ( segmentCrossesTriangle( b.points[ edge ]!, b.points[ ( edge + 1 ) % 3 ]!, a.points ) ) return true;

			}

		}

	}

	return false;

}
