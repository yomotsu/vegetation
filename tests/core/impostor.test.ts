import { describe, expect, it } from 'vitest';
import { buildBillboard, bakeImpostor, impostorPart } from '../../src/core/impostor';
import { MeshBuilder } from '../../src/core/meshBuilder';
import type { MeshData, VegetationData, Vec3 } from '../../src/core/types';
import { validateMeshData } from '../helpers/validateMeshData';

const white: [ number, number, number ] = [ 1, 1, 1 ];

function createBoxMesh(): MeshData {

	const builder = new MeshBuilder();
	let vertexOffset = 0;
	const faces: { points: Vec3[]; normal: Vec3 }[] = [
		{
			points: [ [ - 0.4, 0, 0.4 ], [ 0.4, 0, 0.4 ], [ 0.4, 1, 0.4 ], [ - 0.4, 1, 0.4 ] ],
			normal: [ 0, 0, 1 ],
		},
		{
			points: [ [ 0.4, 0, - 0.4 ], [ - 0.4, 0, - 0.4 ], [ - 0.4, 1, - 0.4 ], [ 0.4, 1, - 0.4 ] ],
			normal: [ 0, 0, - 1 ],
		},
		{
			points: [ [ 0.4, 0, 0.4 ], [ 0.4, 0, - 0.4 ], [ 0.4, 1, - 0.4 ], [ 0.4, 1, 0.4 ] ],
			normal: [ 1, 0, 0 ],
		},
		{
			points: [ [ - 0.4, 0, - 0.4 ], [ - 0.4, 0, 0.4 ], [ - 0.4, 1, 0.4 ], [ - 0.4, 1, - 0.4 ] ],
			normal: [ - 1, 0, 0 ],
		},
		{
			points: [ [ - 0.4, 1, 0.4 ], [ 0.4, 1, 0.4 ], [ 0.4, 1, - 0.4 ], [ - 0.4, 1, - 0.4 ] ],
			normal: [ 0, 1, 0 ],
		},
		{
			points: [ [ - 0.4, 0, - 0.4 ], [ 0.4, 0, - 0.4 ], [ 0.4, 0, 0.4 ], [ - 0.4, 0, 0.4 ] ],
			normal: [ 0, - 1, 0 ],
		},
	];

	builder.beginGroup( 0 );

	for ( const face of faces ) {

		const first = vertexOffset;

		for ( let i = 0; i < 4; i ++ ) {

			builder.addVertex( face.points[ i ]!, face.normal, [ i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0 ], white, 0 );

		}

		vertexOffset += 4;

		builder.addTriangle( first, first + 1, first + 2 );
		builder.addTriangle( first, first + 2, first + 3 );

	}

	return builder.build();

}

function createVegetationData( mesh: MeshData ): VegetationData {

	return {
		kind: 'test',
		parts: [ {
			name: 'bark',
			defaultColor: 0xffffff,
			texture: null,
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
		} ],
		lods: [ mesh, mesh, mesh, mesh, mesh ],
		collider: null,
		textures: {},
		bounds: { radius: 0.5, height: 1 },
	};

}

describe( 'impostor generation', () => {

	it( 'builds two crossed billboard planes with four triangles and valid attributes', () => {

		const mesh = buildBillboard( { radius: 0.5, height: 1 }, 2 );

		expect( mesh.indices.length / 3 ).toBe( 4 );
		validateMeshData( mesh );

		for ( let i = 1; i < mesh.positions.length; i += 3 ) {

			expect( mesh.positions[ i ] ).toBeGreaterThanOrEqual( 0 );
			expect( mesh.positions[ i ] ).toBeLessThanOrEqual( 1 );

		}

	} );

	it( 'bakes a +Z view into the left atlas half and uses the supplied part color', () => {

		const data = createVegetationData( createBoxMesh() );
		const red = bakeImpostor( data, [ [ 1, 0, 0 ] ], 32 );
		const centerPixel = ( 16 * red.width + 16 ) * 4;

		expect( red.width ).toBe( 64 );
		expect( red.height ).toBe( 32 );
		expect( red.data[ centerPixel + 3 ] ).toBe( 255 );
		expect( red.data[ centerPixel ] ).toBeGreaterThan( red.data[ centerPixel + 1 ]! );
		expect( red.data[ centerPixel ] ).toBeGreaterThan( red.data[ centerPixel + 2 ]! );
		expect( red.data[ 3 ] ).toBe( 0 );
		expect( red.data[ ( 16 * red.width + 48 ) * 4 + 3 ] ).toBe( 255 );

		const blue = bakeImpostor( data, [ [ 0, 0, 1 ] ], 32 );
		const bluePixel = ( 16 * blue.width + 16 ) * 4;

		expect( blue.data[ bluePixel + 2 ] ).toBeGreaterThan( blue.data[ bluePixel ]! );

	} );

	it( 'defines the impostor material part', () => {

		expect( impostorPart() ).toEqual( {
			name: 'impostor',
			defaultColor: 0xffffff,
			texture: 'impostor',
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
		} );

	} );

} );
