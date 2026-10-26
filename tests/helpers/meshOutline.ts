export interface OutlineMesh {
	positions: Float32Array;
	indices: Uint32Array;
}

export function sampleOutlineRadius( mesh: OutlineMesh, height: number, angle: number, center: [ number, number ] = [ 0, 0 ] ): number {

	const direction = [ Math.cos( angle ), Math.sin( angle ) ];
	let maximum = - Infinity;

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const points: [ number, number ][] = [];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = mesh.indices[ index + edge ]! * 3;
			const second = mesh.indices[ index + ( edge + 1 ) % 3 ]! * 3;
			const firstY = mesh.positions[ first + 1 ]! - height;
			const secondY = mesh.positions[ second + 1 ]! - height;

			if ( Math.abs( firstY ) < 1e-7 ) points.push( [ mesh.positions[ first ]! - center[ 0 ], mesh.positions[ first + 2 ]! - center[ 1 ] ] );
			if ( ( firstY < 0 && secondY > 0 ) || ( firstY > 0 && secondY < 0 ) ) {

				const amount = - firstY / ( secondY - firstY );
				points.push( [
					mesh.positions[ first ]! + ( mesh.positions[ second ]! - mesh.positions[ first ]! ) * amount - center[ 0 ],
					mesh.positions[ first + 2 ]! + ( mesh.positions[ second + 2 ]! - mesh.positions[ first + 2 ]! ) * amount - center[ 1 ],
				] );

			}

		}

		const unique = points.filter( ( point, pointIndex ) => points.findIndex( ( other ) => Math.hypot( point[ 0 ] - other[ 0 ], point[ 1 ] - other[ 1 ] ) < 1e-7 ) === pointIndex );
		if ( unique.length < 2 ) continue;

		let firstPoint = unique[ 0 ]!;
		let secondPoint = unique[ 1 ]!;
		let longest = 0;

		for ( let firstIndex = 0; firstIndex < unique.length; firstIndex ++ ) {

			for ( let secondIndex = firstIndex + 1; secondIndex < unique.length; secondIndex ++ ) {

				const distance = Math.hypot( unique[ firstIndex ]![ 0 ] - unique[ secondIndex ]![ 0 ], unique[ firstIndex ]![ 1 ] - unique[ secondIndex ]![ 1 ] );
				if ( distance > longest ) {
					longest = distance;
					firstPoint = unique[ firstIndex ]!;
					secondPoint = unique[ secondIndex ]!;
				}

			}

		}

		const edge: [ number, number ] = [ secondPoint[ 0 ] - firstPoint[ 0 ], secondPoint[ 1 ] - firstPoint[ 1 ] ];
		const denominator = direction[ 0 ]! * edge[ 1 ] - direction[ 1 ]! * edge[ 0 ];

		if ( Math.abs( denominator ) < 1e-8 ) {

			if ( Math.abs( firstPoint[ 0 ] * direction[ 1 ]! - firstPoint[ 1 ] * direction[ 0 ]! ) < 1e-7 ) {
				maximum = Math.max( maximum, firstPoint[ 0 ] * direction[ 0 ]! + firstPoint[ 1 ] * direction[ 1 ]!, secondPoint[ 0 ] * direction[ 0 ]! + secondPoint[ 1 ]! * direction[ 1 ]! );
			}

			continue;

		}

		const distance = ( firstPoint[ 0 ] * edge[ 1 ] - firstPoint[ 1 ] * edge[ 0 ] ) / denominator;
		const amount = ( firstPoint[ 0 ] * direction[ 1 ]! - firstPoint[ 1 ] * direction[ 0 ]! ) / denominator;
		if ( distance >= 0 && amount >= - 1e-7 && amount <= 1 + 1e-7 ) maximum = Math.max( maximum, distance );

	}

	return maximum;

}

export function splitConnectedComponents( mesh: OutlineMesh ): OutlineMesh[] {

	const vertexCount = mesh.positions.length / 3;
	const parents = Array.from( { length: vertexCount }, ( _, index ) => index );
	const find = ( index: number ): number => {
		while ( parents[ index ] !== index ) {
			parents[ index ] = parents[ parents[ index ]! ]!;
			index = parents[ index ]!;
		}
		return index;
	};

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const first = find( mesh.indices[ index ]! );
		for ( let edge = 1; edge < 3; edge ++ ) {
			const other = find( mesh.indices[ index + edge ]! );
			parents[ other ] = first;
		}

	}

	const components = new Map<number, { vertices: Map<number, number>; indices: number[] }>();

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const root = find( mesh.indices[ index ]! );
		let component = components.get( root );
		if ( component === undefined ) {
			component = { vertices: new Map(), indices: [] };
			components.set( root, component );
		}

		for ( let corner = 0; corner < 3; corner ++ ) {

			const vertex = mesh.indices[ index + corner ]!;
			let mapped = component.vertices.get( vertex );
			if ( mapped === undefined ) {
				mapped = component.vertices.size;
				component.vertices.set( vertex, mapped );
			}
			component.indices.push( mapped );

		}

	}

	return [ ...components.values() ].map( ( component ) => {

		const positions = new Float32Array( component.vertices.size * 3 );
		for ( const [ vertex, mapped ] of component.vertices ) {
			positions.set( mesh.positions.slice( vertex * 3, vertex * 3 + 3 ), mapped * 3 );
		}

		return { positions, indices: Uint32Array.from( component.indices ) };

	} );

}
