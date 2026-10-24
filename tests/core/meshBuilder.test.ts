import { describe, expect, it } from 'vitest';
import type { MeshData } from '../../src/core/types';
import { MeshBuilder } from '../../src/core/meshBuilder';
import { validateMeshData } from '../helpers/validateMeshData';

function createTriangle(): MeshData {
	const builder = new MeshBuilder();

	for ( let i = 0; i < 3; i ++ ) {

		builder.addVertex( [ i, 0, 0 ], [ 0, 1, 0 ], [ 0, 0 ], [ 1, 1, 1 ], 0 );

	}

	builder.beginGroup( 0 );
	builder.addTriangle( 0, 1, 2 );

	return builder.build();

}

describe( 'MeshBuilder', () => {

	it( 'keeps vertex attributes and builds contiguous part groups', () => {

		const builder = new MeshBuilder();

		builder.addVertex( [ 0, 0, 0 ], [ 0, 1, 0 ], [ 0, 0 ], [ 0.1, 0.2, 0.3 ], 0.25 );
		builder.addVertex( [ 1, 0, 0 ], [ 0, 1, 0 ], [ 1, 0 ], [ 0.4, 0.5, 0.6 ], 0.5 );
		builder.addVertex( [ 0, 1, 0 ], [ 0, 1, 0 ], [ 0, 1 ], [ 0.7, 0.8, 0.9 ], 0.75 );
		builder.addVertex( [ 1, 1, 0 ], [ 0, 1, 0 ], [ 1, 1 ], [ 1, 1, 1 ], 1 );
		builder.beginGroup( 0 );
		builder.addTriangle( 0, 1, 2 );
		builder.addTriangle( 1, 3, 2 );
		builder.beginGroup( 1 );
		builder.addTriangle( 0, 2, 3 );

		const mesh = builder.build();

		expect( builder.triangleCount ).toBe( 3 );
		expect( mesh.windWeight ).toEqual( new Float32Array( [ 0.25, 0.5, 0.75, 1 ] ) );
		expect( mesh.colors ).toEqual( new Float32Array( [ 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1, 1 ] ) );
		expect( mesh.groups ).toEqual( [
			{ start: 0, count: 6, partIndex: 0 },
			{ start: 6, count: 3, partIndex: 1 },
		] );
		validateMeshData( mesh );

	} );

	it( 'validates malformed attribute lengths', () => {

		const mesh = createTriangle();

		expect( () => validateMeshData( { ...mesh, normals: new Float32Array( 2 ) } ) ).toThrow();

	} );

	it( 'validates NaN values', () => {

		const mesh = createTriangle();
		const positions = mesh.positions.slice();

		positions[ 0 ] = Number.NaN;

		expect( () => validateMeshData( { ...mesh, positions } ) ).toThrow();

	} );

	it( 'validates indices outside the vertex range', () => {

		const mesh = createTriangle();

		expect( () => validateMeshData( { ...mesh, indices: new Uint32Array( [ 0, 1, 3 ] ) } ) ).toThrow();

	} );

	it( 'validates non-unit normals', () => {

		const mesh = createTriangle();
		const normals = mesh.normals.slice();

		normals[ 0 ] = 0;
		normals[ 1 ] = 0;
		normals[ 2 ] = 0;

		expect( () => validateMeshData( { ...mesh, normals } ) ).toThrow();

	} );

	it( 'validates wind weights outside the unit interval', () => {

		const mesh = createTriangle();
		const windWeight = mesh.windWeight.slice();

		windWeight[ 0 ] = 1.1;

		expect( () => validateMeshData( { ...mesh, windWeight } ) ).toThrow();

	} );

	it( 'validates groups that do not cover the index range', () => {

		const mesh = createTriangle();

		expect( () => validateMeshData( { ...mesh, groups: [] } ) ).toThrow();

	} );

} );
