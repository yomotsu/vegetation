import { describe, expect, it } from 'vitest';
import { MeshBuilder } from '../../src/core/meshBuilder';
import { addCard, addRockShell, addTube } from '../../src/core/primitives';
import { validateMeshData } from '../helpers/validateMeshData';

const color: [ number, number, number ] = [ 0.3, 0.5, 0.2 ];

describe( 'procedural mesh primitives', () => {

	it.each( [ 1, 2, 5 ] )( 'subdivides an icosahedral shell at frequency %i', ( frequency ) => {

		const builder = new MeshBuilder();

		addRockShell( builder, frequency, () => 1, {
			color: () => color,
			center: [ 0, 0, 0 ],
			scale: [ 1, 0.8, 1.2 ],
			flat: false,
		} );

		const mesh = builder.build();

		expect( builder.triangleCount ).toBe( 20 * frequency * frequency );
		validateMeshData( mesh );

	} );

	it( 'creates flat shaded rock faces with duplicated face vertices', () => {

		const builder = new MeshBuilder();

		addRockShell( builder, 1, () => 1, {
			color: () => color,
			center: [ 0, 0, 0 ],
			scale: [ 1, 1, 1 ],
			flat: true,
		} );

		const mesh = builder.build();

		expect( mesh.positions.length / 3 ).toBe( 60 );
		for ( let i = 0; i < mesh.normals.length; i += 9 ) {

			expect( mesh.normals.slice( i, i + 3 ) ).toEqual( mesh.normals.slice( i + 3, i + 6 ) );
			expect( mesh.normals.slice( i, i + 3 ) ).toEqual( mesh.normals.slice( i + 6, i + 9 ) );

		}
		validateMeshData( mesh );

	} );

	it( 'creates a tube with two segments and six sides', () => {

		const builder = new MeshBuilder();

		addTube( builder, [ [ 0, 0, 0 ], [ 0, 1, 0 ], [ 0, 2, 0 ] ], [ 0.2, 0.15, 0.1 ], 6, {
			color,
			wind: ( t ) => t,
			capEnd: false,
		} );

		const mesh = builder.build();

		expect( builder.triangleCount ).toBe( 24 );
		expect( mesh.windWeight ).toContain( 0.5 );
		validateMeshData( mesh );

	} );

	it( 'appends tube indices after vertices already in the builder', () => {

		const builder = new MeshBuilder();

		builder.addVertex( [ 0, 0, 0 ], [ 0, 0, 1 ], [ 0, 0 ], color, 0 );
		builder.addVertex( [ 1, 0, 0 ], [ 0, 0, 1 ], [ 1, 0 ], color, 0 );
		builder.addVertex( [ 0, 1, 0 ], [ 0, 0, 1 ], [ 0, 1 ], color, 0 );
		builder.addTriangle( 0, 1, 2 );
		builder.beginGroup( 1 );
		addTube( builder, [ [ 0, 0, 0 ], [ 0, 1, 0 ] ], [ 0.2, 0.1 ], 3, {
			color,
			wind: () => 0,
			capEnd: false,
		} );

		const mesh = builder.build();

		expect( mesh.indices[ 3 ] ).toBe( 3 );
		validateMeshData( mesh );

	} );

	it( 'creates a capped tube with unit normals', () => {

		const builder = new MeshBuilder();

		addTube( builder, [ [ 0, 0, 0 ], [ 0, 1, 0 ] ], [ 0.2, 0.1 ], 5, {
			color,
			wind: () => 0,
			capEnd: true,
		} );

		const mesh = builder.build();

		expect( builder.triangleCount ).toBe( 15 );
		validateMeshData( mesh );

	} );

	it( 'creates a card using geometric or supplied face normals', () => {

		for ( const normal of [ null, [ 0, 0, 2 ] as [ number, number, number ] ] ) {

			const builder = new MeshBuilder();

			addCard( builder, [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1, 1 ], normal, color, 0.4 );

			const mesh = builder.build();

			expect( builder.triangleCount ).toBe( 2 );
			expect( mesh.windWeight ).toEqual( new Float32Array( [ 0.4, 0.4, 0.4, 0.4 ] ) );
			validateMeshData( mesh );

		}

	} );

} );
