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
