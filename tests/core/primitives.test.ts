import { describe, expect, it } from 'vitest';
import { MeshBuilder } from '../../src/core/meshBuilder';
import { addCard, addRockShell, addTube } from '../../src/core/primitives';
import { validateMeshData } from '../helpers/validateMeshData';

const color: [ number, number, number ] = [ 0.3, 0.5, 0.2 ];

function dot( a: [ number, number, number ], b: [ number, number, number ] ): number {

	return a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];

}

function normalize( vector: [ number, number, number ] ): [ number, number, number ] {

	const length = Math.hypot( vector[ 0 ], vector[ 1 ], vector[ 2 ] );

	return [ vector[ 0 ] / length, vector[ 1 ] / length, vector[ 2 ] / length ];

}

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

	it( 'uses displaced geometry for smooth rock normals', () => {

		const builder = new MeshBuilder();

		addRockShell( builder, 2, ( direction ) => 1 + direction[ 0 ] * 0.5, {
			color: () => color,
			center: [ 0, 0, 0 ],
			scale: [ 1, 1, 1 ],
			flat: false,
		} );

		const mesh = builder.build();
		const normal: [ number, number, number ] = [ mesh.normals[ 0 ]!, mesh.normals[ 1 ]!, mesh.normals[ 2 ]! ];
		const position: [ number, number, number ] = [ mesh.positions[ 0 ]!, mesh.positions[ 1 ]!, mesh.positions[ 2 ]! ];
		const ellipsoidNormal = normalize( position );

		expect( Math.abs( dot( normal, ellipsoidNormal ) ) ).toBeLessThan( 0.999 );

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

	it( 'duplicates the tube seam with UV coordinates from zero through one', () => {

		const builder = new MeshBuilder();

		addTube( builder, [ [ 0, 0, 0 ], [ 0, 1, 0 ] ], [ 0.2, 0.1 ], 6, {
			color,
			wind: () => 0,
			capEnd: false,
		} );

		const mesh = builder.build();
		const seamDuplicate = 6;

		expect( mesh.uvs[ 0 ] ).toBe( 0 );
		expect( mesh.uvs[ seamDuplicate * 2 ] ).toBe( 1 );
		expect( mesh.positions.slice( 0, 3 ) ).toEqual( mesh.positions.slice( seamDuplicate * 3, seamDuplicate * 3 + 3 ) );
		expect( mesh.normals.slice( 0, 3 ) ).toEqual( mesh.normals.slice( seamDuplicate * 3, seamDuplicate * 3 + 3 ) );

	} );

	it( 'keeps tube frames aligned across the x/z tangent crossover', () => {

		const spine: [ number, number, number ][] = [ [ 0, 0, 0 ] ];

		for ( let i = 1; i < 25; i ++ ) {

			const theta = 0.4 + i * 0.032;
			const direction: [ number, number, number ] = [ Math.cos( theta ), 0.9, Math.sin( theta ) ];
			const previous = spine[ spine.length - 1 ]!;

			spine.push( [
				previous[ 0 ] + direction[ 0 ] * 0.1,
				previous[ 1 ] + direction[ 1 ] * 0.1,
				previous[ 2 ] + direction[ 2 ] * 0.1
			] );

		}

		const sides = 6;
		const builder = new MeshBuilder();

		addTube( builder, spine, spine.map( () => 0.1 ), sides, {
			color,
			wind: () => 0,
			capEnd: false,
		} );

		const mesh = builder.build();
		const firstRingU = spine.map( ( point, ring ) => normalize( [
			mesh.positions[ ring * ( sides + 1 ) * 3 ]! - point[ 0 ],
			mesh.positions[ ring * ( sides + 1 ) * 3 + 1 ]! - point[ 1 ],
			mesh.positions[ ring * ( sides + 1 ) * 3 + 2 ]! - point[ 2 ],
		] ) );

		for ( let i = 1; i < firstRingU.length; i ++ ) {

			expect( dot( firstRingU[ i - 1 ]!, firstRingU[ i ]! ) ).toBeGreaterThan( 0.9 );

		}

	} );

	it( 'tilts tube normals along the tangent when the radius tapers', () => {

		const builder = new MeshBuilder();

		addTube( builder, [ [ 0, 0, 0 ], [ 0, 1, 0 ], [ 0, 2, 0 ] ], [ 0.5, 0.3, 0.1 ], 6, {
			color,
			wind: () => 0,
			capEnd: false,
		} );

		const mesh = builder.build();
		const firstNormal: [ number, number, number ] = [ mesh.normals[ 0 ]!, mesh.normals[ 1 ]!, mesh.normals[ 2 ]! ];

		expect( Math.abs( firstNormal[ 1 ] ) ).toBeGreaterThan( 0.05 );

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
