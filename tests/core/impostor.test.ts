import { describe, expect, it } from 'vitest';
import { buildBillboard, bakeImpostor, impostorPart, LOD4_IMPOSTOR_VIEWS } from '../../src/core/impostor';
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

function createUpperCornerMesh(): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );

	const front = [
		[ 0.2, 0.65, 0.3 ],
		[ 0.4, 0.65, 0.3 ],
		[ 0.4, 0.85, 0.3 ],
		[ 0.2, 0.85, 0.3 ],
	] as Vec3[];
	const side = [
		[ 0.3, 0.65, 0.2 ],
		[ 0.3, 0.65, 0.4 ],
		[ 0.3, 0.85, 0.4 ],
		[ 0.3, 0.85, 0.2 ],
	] as Vec3[];

	for ( const [ points, normal ] of [ [ front, [ 0, 0, 1 ] ], [ side, [ 1, 0, 0 ] ] ] as [ Vec3[], Vec3 ][] ) {

		const first = builder.addVertex( points[ 0 ]!, normal, [ 0, 0 ], white, 0 );
		builder.addVertex( points[ 1 ]!, normal, [ 1, 0 ], white, 0 );
		builder.addVertex( points[ 2 ]!, normal, [ 1, 1 ], white, 0 );
		builder.addVertex( points[ 3 ]!, normal, [ 0, 1 ], white, 0 );
		builder.addTriangle( first, first + 1, first + 2 );
		builder.addTriangle( first, first + 2, first + 3 );

	}

	return builder.build();

}

function createSteppedFootprintMesh(): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );

	const low = [
		builder.addVertex( [ - 1, 0.1, - 1 ], [ 0, 1, 0 ], [ 0, 0 ], white, 0 ),
		builder.addVertex( [ 1, 0.1, - 1 ], [ 0, 1, 0 ], [ 1, 0 ], white, 0 ),
		builder.addVertex( [ 1, 0.1, 1 ], [ 0, 1, 0 ], [ 1, 1 ], white, 0 ),
		builder.addVertex( [ - 1, 0.1, 1 ], [ 0, 1, 0 ], [ 0, 1 ], white, 0 ),
	];
	builder.addTriangle( low[ 0 ]!, low[ 1 ]!, low[ 2 ]! );
	builder.addTriangle( low[ 0 ]!, low[ 2 ]!, low[ 3 ]! );

	const upper = [
		builder.addVertex( [ - 0.25, 0.75, - 0.3 ], [ 0, 1, 0 ], [ 0, 0 ], white, 0 ),
		builder.addVertex( [ 0.25, 0.75, - 0.3 ], [ 0, 1, 0 ], [ 1, 0 ], white, 0 ),
		builder.addVertex( [ 0.25, 0.75, 0.3 ], [ 0, 1, 0 ], [ 1, 1 ], white, 0 ),
		builder.addVertex( [ - 0.25, 0.75, 0.3 ], [ 0, 1, 0 ], [ 0, 1 ], white, 0 ),
	];
	builder.addTriangle( upper[ 0 ]!, upper[ 1 ]!, upper[ 2 ]! );
	builder.addTriangle( upper[ 0 ]!, upper[ 2 ]!, upper[ 3 ]! );

	return builder.build();

}

function createTexturedQuadMesh(): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );

	const first = builder.addVertex( [ - 0.4, 0.1, 0.2 ], [ 0, 0, 1 ], [ 0, 0 ], white, 0 );
	builder.addVertex( [ 0.4, 0.1, 0.2 ], [ 0, 0, 1 ], [ 0, 1 ], white, 0 );
	builder.addVertex( [ 0.4, 0.9, 0.2 ], [ 0, 0, 1 ], [ 1, 1 ], white, 0 );
	builder.addVertex( [ - 0.4, 0.9, 0.2 ], [ 0, 0, 1 ], [ 1, 0 ], white, 0 );
	builder.addTriangle( first, first + 1, first + 2 );
	builder.addTriangle( first, first + 2, first + 3 );

	return builder.build();

}

function createGridMesh(): MeshData {

	const builder = new MeshBuilder();
	const columns = 32;
	const rows = 16;
	builder.beginGroup( 0 );

	for ( let row = 0; row < rows; row ++ ) {

		for ( let column = 0; column < columns; column ++ ) {

			const x0 = - 0.4 + column / columns * 0.8;
			const x1 = - 0.4 + ( column + 1 ) / columns * 0.8;
			const y0 = 0.05 + row / rows * 0.9;
			const y1 = 0.05 + ( row + 1 ) / rows * 0.9;
			const first = builder.addVertex( [ x0, y0, 0.2 ], [ 0, 0, 1 ], [ 0, 0 ], white, 0 );
			builder.addVertex( [ x1, y0, 0.2 ], [ 0, 0, 1 ], [ 1, 0 ], white, 0 );
			builder.addVertex( [ x1, y1, 0.2 ], [ 0, 0, 1 ], [ 1, 1 ], white, 0 );
			builder.addVertex( [ x0, y1, 0.2 ], [ 0, 0, 1 ], [ 0, 1 ], white, 0 );
			builder.addTriangle( first, first + 1, first + 2 );
			builder.addTriangle( first, first + 2, first + 3 );

		}

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

	it( 'builds a side and top billboard plane with four triangles and valid attributes', () => {

		const mesh = buildBillboard( { radius: 0.5, height: 1 }, 2 );

		expect( mesh.indices.length / 3 ).toBe( 4 );
		expect( mesh.positions.length / 3 ).toBe( 8 );
		expect( mesh.uvs ).toEqual( new Float32Array( [ 0, 0, 0.5, 0, 0.5, 1, 0, 1, 0.5, 0, 1, 0, 1, 1, 0.5, 1 ] ) );
		expect( Array.from( mesh.normals.slice( 12, 24 ) ) ).toEqual( [ 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0 ] );
		validateMeshData( mesh );

		for ( let i = 1; i < mesh.positions.length; i += 3 ) {

			expect( mesh.positions[ i ] ).toBeGreaterThanOrEqual( 0 );
			expect( mesh.positions[ i ] ).toBeLessThanOrEqual( 1 );

		}

	} );

	it( 'sizes the top card from the LOD0 footprint at its height', () => {

		const mesh = buildBillboard( { radius: 1, height: 1 }, 2, createSteppedFootprintMesh(), 0.5 );

		expect( mesh.positions.slice( 12, 24 ) ).toEqual( new Float32Array( [
			- 0.25, 0.5, 0.3,
			0.25, 0.5, 0.3,
			0.25, 0.5, - 0.3,
			- 0.25, 0.5, - 0.3,
		] ) );

	} );

	it( 'bakes a generic top-down direction into the second LOD4 atlas tile', () => {

		const data = createVegetationData( createBoxMesh() );
		const texture = bakeImpostor( data, [ white ], 32, LOD4_IMPOSTOR_VIEWS );
		const topTile = 32;
		let opaque = 0;

		for ( let y = 0; y < 32; y ++ ) {

			for ( let x = 0; x < 32; x ++ ) {

				if ( texture.data[ ( y * texture.width + topTile + x ) * 4 + 3 ] === 255 ) {

					opaque ++;

				}

			}

		}

		expect( texture.width ).toBe( 64 );
		expect( texture.height ).toBe( 32 );
		expect( opaque ).toBeGreaterThan( 0 );

	} );

	it( 'bakes a +Z view into one atlas tile and uses the supplied part color', () => {

		const data = createVegetationData( createBoxMesh() );
		const red = bakeImpostor( data, [ [ 1, 0, 0 ] ], 32, [ 0 ] );
		const centerPixel = ( 16 * red.width + 16 ) * 4;

		expect( red.width ).toBe( 32 );
		expect( red.height ).toBe( 32 );
		expect( red.data[ centerPixel + 3 ] ).toBe( 255 );
		expect( red.data[ centerPixel ] ).toBeGreaterThan( red.data[ centerPixel + 1 ]! );
		expect( red.data[ centerPixel ] ).toBeGreaterThan( red.data[ centerPixel + 2 ]! );
		expect( red.data[ 3 ] ).toBe( 0 );
		const blue = bakeImpostor( data, [ [ 0, 0, 1 ] ], 32 );
		const bluePixel = ( 16 * blue.width + 16 ) * 4;

		expect( blue.data[ bluePixel + 2 ] ).toBeGreaterThan( blue.data[ bluePixel ]! );

	} );

	it( 'keeps ground at row zero and projects +X and +Z to their correct sides', () => {

		const texture = bakeImpostor( createVegetationData( createUpperCornerMesh() ), [ white ], 32 );
		const opaquePixels: [ number, number ][] = [];

		for ( let y = 0; y < texture.height; y ++ ) {

			for ( let x = 0; x < texture.width; x ++ ) {

				if ( texture.data[ ( y * texture.width + x ) * 4 + 3 ] === 255 ) {

					opaquePixels.push( [ x, y ] );

				}

			}

		}

		const leftView = opaquePixels.filter( ( [ x ] ) => x < 32 );
		const rightView = opaquePixels.filter( ( [ x ] ) => x >= 32 );

		expect( leftView.length ).toBeGreaterThan( 0 );
		expect( rightView.length ).toBeGreaterThan( 0 );
		expect( leftView.every( ( [ x, y ] ) => x > 16 && y >= 16 ) ).toBe( true );
		expect( rightView.every( ( [ x, y ] ) => x < 48 && x - 32 < 16 && y >= 16 ) ).toBe( true );

	} );

	it( 'alpha-tests a transparent texel in a 2x2 part texture', () => {

		const data = createVegetationData( createTexturedQuadMesh() );
		data.parts[ 0 ]!.texture = 'leaf';
		data.parts[ 0 ]!.alphaTest = 0.5;
		data.textures.leaf = {
			width: 2,
			height: 2,
			data: new Uint8Array( [
				255, 255, 255, 0, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255,
			] ),
		};

		const texture = bakeImpostor( data, [ white ], 32 );
		const alphaAt = ( x: number, y: number ) => texture.data[ ( y * texture.width + x ) * 4 + 3 ];

		expect( alphaAt( 8, 8 ) ).toBe( 0 );
		expect( alphaAt( 24, 8 ) ).toBe( 255 );
		expect( alphaAt( 8, 24 ) ).toBe( 255 );
		expect( alphaAt( 24, 24 ) ).toBe( 255 );

	} );

	it( 'bakes a 1,024-triangle mesh at size 128 in under 10 ms after warm-up', () => {

		const data = createVegetationData( createGridMesh() );

		bakeImpostor( data, [ white ], 128 );

		const start = performance.now();
		bakeImpostor( data, [ white ], 128 );
		const elapsed = performance.now() - start;

		expect( elapsed ).toBeLessThan( 10 );

	} );

	it( 'defines the impostor material part', () => {

		expect( impostorPart() ).toEqual( {
			name: 'impostor',
			defaultColor: 0xffffff,
			texture: 'impostor',
			impostorViews: LOD4_IMPOSTOR_VIEWS,
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
		} );

	} );

} );
