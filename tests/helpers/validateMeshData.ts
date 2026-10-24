import type { MeshData } from '../../src/core/types';

export function validateMeshData( mesh: MeshData ): void {

	const vertexCount = mesh.positions.length / 3;

	if ( mesh.positions.length % 3 !== 0 ) throw new Error( 'positions length must be divisible by 3' );
	if ( mesh.normals.length !== mesh.positions.length ) throw new Error( 'normals length must match positions' );
	if ( mesh.uvs.length !== vertexCount * 2 ) throw new Error( 'uvs length must match vertex count' );
	if ( mesh.colors.length !== vertexCount * 3 ) throw new Error( 'colors length must match vertex count' );
	if ( mesh.windWeight.length !== vertexCount ) throw new Error( 'windWeight length must match vertex count' );
	if ( mesh.indices.length % 3 !== 0 ) throw new Error( 'indices length must be divisible by 3' );

	const attributes = [ mesh.positions, mesh.normals, mesh.uvs, mesh.colors, mesh.windWeight ];

	for ( const attribute of attributes ) {

		for ( let i = 0; i < attribute.length; i ++ ) {

			if ( Number.isNaN( attribute[ i ] ) ) throw new Error( 'mesh attributes must not contain NaN' );

		}

	}

	for ( let i = 0; i < mesh.normals.length; i += 3 ) {

		const length = Math.hypot( mesh.normals[ i ]!, mesh.normals[ i + 1 ]!, mesh.normals[ i + 2 ]! );

		if ( length < 0.99 || length > 1.01 ) throw new Error( 'normal length must be between 0.99 and 1.01' );

	}

	for ( let i = 0; i < mesh.windWeight.length; i ++ ) {

		const wind = mesh.windWeight[ i ]!;

		if ( wind < 0 || wind > 1 ) throw new Error( 'windWeight must be between 0 and 1' );

	}

	for ( let i = 0; i < mesh.indices.length; i ++ ) {

		if ( mesh.indices[ i ]! >= vertexCount ) throw new Error( 'index is outside the vertex range' );

	}

	let expectedStart = 0;

	for ( const group of mesh.groups ) {

		if ( ! Number.isInteger( group.start ) || ! Number.isInteger( group.count ) || group.count <= 0 ) {

			throw new Error( 'groups must have positive integer ranges' );

		}

		if ( Number.isNaN( group.partIndex ) ) throw new Error( 'group partIndex must not be NaN' );
		if ( group.start !== expectedStart ) throw new Error( 'groups must cover the index range without gaps or overlaps' );

		expectedStart += group.count;

	}

	if ( expectedStart !== mesh.indices.length ) throw new Error( 'groups must cover the full index range' );

}
