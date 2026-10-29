import { describe, expect, it } from 'vitest';
import { bakeImpostor, generateRockData, hexToLinear } from '../../src/core';
import type { MeshData } from '../../src/core';
import { getIdenticalVertexWeld, weldIdenticalVertices } from '../../src/core/rockGeometry';
import { withSharedRockTextures } from '../helpers/sharedRockTextures';

function floatBits( value: number, normalizeZero = false ): number {

	const float = new Float32Array( [ value ] );
	const bits = new Uint32Array( float.buffer )[ 0 ]!;
	return normalizeZero && ( bits & 0x7fffffff ) === 0 ? 0 : bits;

}

function vertexKey( mesh: MeshData, vertex: number ): string {

	const key: number[] = [];
	for ( const [ attribute, size ] of [ [ mesh.positions, 3 ], [ mesh.normals, 3 ], [ mesh.uvs, 2 ], [ mesh.colors, 3 ], [ mesh.windWeight, 1 ], [ mesh.impostorCard, 1 ] ] as const ) {

		for ( let item = 0; item < size; item ++ ) key.push( floatBits( attribute[ vertex * size + item ] ?? 0, attribute === mesh.normals ) );

	}
	return key.join( ':' );

}

function cornerStream( mesh: MeshData ): number[] {

	const stream: number[] = [];
	for ( const index of mesh.indices ) {
		for ( const [ attribute, size ] of [ [ mesh.positions, 3 ], [ mesh.normals, 3 ], [ mesh.uvs, 2 ], [ mesh.colors, 3 ] ] as const ) {
			for ( let item = 0; item < size; item ++ ) stream.push( floatBits( attribute[ index * size + item ]!, attribute === mesh.normals ) );
		}
	}
	return stream;

}

function unweld( mesh: MeshData ): MeshData {

	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const colors: number[] = [];
	const windWeight: number[] = [];
	const impostorCard: number[] = [];
	const indices = new Uint32Array( mesh.indices.length );

	for ( let corner = 0; corner < mesh.indices.length; corner ++ ) {

		const source = mesh.indices[ corner ]!;
		positions.push( ...mesh.positions.slice( source * 3, source * 3 + 3 ) );
		normals.push( ...mesh.normals.slice( source * 3, source * 3 + 3 ) );
		uvs.push( ...mesh.uvs.slice( source * 2, source * 2 + 2 ) );
		colors.push( ...mesh.colors.slice( source * 3, source * 3 + 3 ) );
		windWeight.push( mesh.windWeight[ source ]! );
		impostorCard.push( mesh.impostorCard[ source ] ?? 0 );
		indices[ corner ] = corner;

	}

	return {
		positions: new Float32Array( positions ),
		normals: new Float32Array( normals ),
		uvs: new Float32Array( uvs ),
		colors: new Float32Array( colors ),
		windWeight: new Float32Array( windWeight ),
		impostorCard: new Float32Array( impostorCard ),
		indices,
		groups: mesh.groups.map( ( group ) => ( { ...group } ) ),
	};

}

async function textureHash( bytes: Uint8Array ): Promise<string> {

	const data = bytes.slice();
	const digest = await globalThis.crypto.subtle.digest( 'SHA-256', data.buffer );
	return Array.from( new Uint8Array( digest ), ( value ) => value.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}

function getAttributeDuplicateCount( mesh: MeshData ): number {

	const keys = new Set<string>();
	for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) keys.add( vertexKey( mesh, vertex ) );
	return mesh.positions.length / 3 - keys.size;

}

describe( 'rock identical-vertex welding', () => {

	it( 'calculates the weld remap without mutating the mesh', () => {

		const mesh: MeshData = {
			positions: new Float32Array( [ 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 9, 9, 9 ] ),
			normals: new Float32Array( [ 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ] ),
			uvs: new Float32Array( [ 0, 0, 1, 0, 0, 1, 0, 0, 0.5, 0.5 ] ),
			colors: new Float32Array( [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 ] ),
			windWeight: new Float32Array( [ 0, 0, 0, 0, 0 ] ),
			impostorCard: new Float32Array( [ 0, 0, 0, 0, 0 ] ),
			indices: new Uint32Array( [ 0, 1, 2, 3, 2, 1 ] ),
			groups: [ { start: 0, count: 3, partIndex: 0 }, { start: 3, count: 3, partIndex: 1 } ],
		};
		const before = {
			positions: mesh.positions.slice(),
			normals: mesh.normals.slice(),
			uvs: mesh.uvs.slice(),
			colors: mesh.colors.slice(),
			windWeight: mesh.windWeight.slice(),
			impostorCard: mesh.impostorCard.slice(),
			indices: mesh.indices.slice(),
			groups: mesh.groups.map( ( group ) => ( { ...group } ) ),
		};

		const weld = getIdenticalVertexWeld( mesh );

		expect( weld.vertexRemap ).toEqual( new Uint32Array( [ 0, 1, 2, 0, 0 ] ) );
		expect( weld.uniqueVertices ).toEqual( [ 0, 1, 2 ] );
		expect( mesh ).toEqual( before );

	} );

	it( 'merges only fully identical referenced vertices, preserves order and groups', () => {

		const mesh: MeshData = {
			positions: new Float32Array( [ 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 9, 9, 9 ] ),
			normals: new Float32Array( [ 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ] ),
			uvs: new Float32Array( [ 0, 0, 1, 0, 0, 1, 0, 0, 0.5, 0.5 ] ),
			colors: new Float32Array( [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 ] ),
			windWeight: new Float32Array( [ 0, 0, 0, 0, 0 ] ),
			impostorCard: new Float32Array( [ 0, 0, 0, 0, 0 ] ),
			indices: new Uint32Array( [ 0, 1, 2, 3, 2, 1 ] ),
			groups: [ { start: 0, count: 3, partIndex: 0 }, { start: 3, count: 3, partIndex: 1 } ],
		};

		weldIdenticalVertices( mesh );

		expect( mesh.positions ).toEqual( new Float32Array( [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] ) );
		expect( mesh.indices ).toEqual( new Uint32Array( [ 0, 1, 2, 0, 2, 1 ] ) );
		expect( mesh.groups ).toEqual( [ { start: 0, count: 3, partIndex: 0 }, { start: 3, count: 3, partIndex: 1 } ] );

	} );

	it( 'keeps normal, UV, color, wind and impostor-card splits', () => {

		const mesh: MeshData = {
			positions: new Float32Array( [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ] ),
			normals: new Float32Array( [ 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ] ),
			uvs: new Float32Array( [ 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.5, 0 ] ),
			colors: new Float32Array( [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1 ] ),
			windWeight: new Float32Array( [ 0, 0, 0, 0, 0.5, 0 ] ),
			impostorCard: new Float32Array( [ 0, 0, 0, 0, 0, 1 ] ),
			indices: new Uint32Array( [ 0, 1, 2, 3, 4, 5 ] ),
			groups: [ { start: 0, count: 6, partIndex: 0 } ],
		};

		weldIdenticalVertices( mesh );

		expect( mesh.positions.length / 3 ).toBe( 6 );
		expect( mesh.indices ).toEqual( new Uint32Array( [ 0, 1, 2, 3, 4, 5 ] ) );

	} );

	it( 'normalizes only signed zero in normals when choosing duplicates', () => {

		const mesh: MeshData = {
			positions: new Float32Array( [ 0, 0, 0, 0, 0, 0, 0, 1, 0 ] ),
			normals: new Float32Array( [ 0, - 0, 1, 0, 0, 1, 0, 0, 1 ] ),
			uvs: new Float32Array( [ 0, 0, 0, 0, 1, 0 ] ),
			colors: new Float32Array( [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ] ),
			windWeight: new Float32Array( [ 0, 0, 0 ] ),
			impostorCard: new Float32Array( [ 0, 0, 0 ] ),
			indices: new Uint32Array( [ 0, 1, 2 ] ),
			groups: [ { start: 0, count: 3, partIndex: 0 } ],
		};

		weldIdenticalVertices( mesh );

		expect( mesh.positions.length / 3 ).toBe( 2 );
		expect( Object.is( mesh.normals[ 1 ], - 0 ) ).toBe( true );

		const positionZeros: MeshData = {
			positions: new Float32Array( [ 0, 0, 0, 0, - 0, 0, 0, 1, 0 ] ),
			normals: new Float32Array( [ 0, 0, 1, 0, 0, 1, 0, 0, 1 ] ),
			uvs: new Float32Array( [ 0, 0, 0, 0, 1, 0 ] ),
			colors: new Float32Array( [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ] ),
			windWeight: new Float32Array( [ 0, 0, 0 ] ),
			impostorCard: new Float32Array( [ 0, 0, 0 ] ),
			indices: new Uint32Array( [ 0, 1, 2 ] ),
			groups: [ { start: 0, count: 3, partIndex: 0 } ],
		};

		weldIdenticalVertices( positionZeros );

		expect( positionZeros.positions.length / 3 ).toBe( 3 );

	} );

	it( 'removes exact duplicate vertices from every LOD for seeds 1 to 50', () => {

		withSharedRockTextures( () => {

			for ( let seed = 1; seed <= 50; seed ++ ) {

				const data = generateRockData( { seed } );
				for ( let lod = 0; lod < data.lods.length; lod ++ ) {

					expect( data.lods[ lod ]!.impostorCard.length, `seed ${ seed } LOD${ lod } impostor-card count` ).toBe( data.lods[ lod ]!.positions.length / 3 );
					expect( getAttributeDuplicateCount( data.lods[ lod ]! ), `seed ${ seed } LOD${ lod }` ).toBe( 0 );

				}

			}

		} );

	}, 300000 );

	it( 'preserves per-corner position, normal, UV and color streams for seeds 1, 2 and 7', () => {

		withSharedRockTextures( () => {

			for ( const seed of [ 1, 2, 7 ] ) {

				const data = generateRockData( { seed } );
				for ( let lod = 0; lod < 4; lod ++ ) {

					const mesh = unweld( data.lods[ lod ]! );
					const before = cornerStream( mesh );
					weldIdenticalVertices( mesh );
					expect( cornerStream( mesh ), `seed ${ seed } LOD${ lod }` ).toEqual( before );

				}

			}

		} );

	}, 60000 );

	it( 'reduces the known LOD0 counts without changing bake outputs', async () => {

		const beforeCounts: Record<number, number> = { 1: 143, 2: 149, 3: 122, 7: 155, 42: 141 };
		const expectedTextureHashes: Record<number, { albedo: string; normal: string }> = {
			1: { albedo: '85d5ca46b16f0d1a235754ec5ceb8f0985b99ae6ac17ac137a1d039b5e0d2c57', normal: 'f70a3d177a9209e14114f3050647eb428bbfe8f41c0a58fc8e9e14ab5576cf58' },
			7: { albedo: '44b2e264d8e7ad8f18c5b5787a6edf753db1632d79e2880e62048c8b6ae1fc5a', normal: 'adbc99741c546656cab8fc2c36accf5a869a9f33882cfdd89ac26247adcec708' },
		};
		const expectedImpostorHash = '9209feb7c32f54a5db95272f4a893c2777082fc9cddc34327ee864060e12e03b';

		for ( const seed of [ 1, 2, 3, 7, 42 ] ) {

			const data = generateRockData( { seed } );
			expect( data.lods[ 0 ]!.positions.length / 3, `seed ${ seed } LOD0 reduction` ).toBeLessThan( beforeCounts[ seed ]! );

			if ( seed === 1 || seed === 7 ) {

				expect( { albedo: await textureHash( data.textures.albedo!.data ), normal: await textureHash( data.textures.normal!.data ) } ).toEqual( expectedTextureHashes[ seed ] );

				if ( seed === 1 ) {

					const color = data.parts.map( ( part ) => hexToLinear( part.defaultColor ) );
					const views = data.parts[ 1 ]!.impostorViews!;
					expect( await textureHash( bakeImpostor( data, color, 128, views ).data ) ).toBe( expectedImpostorHash );

				}

			}

		}

	} );

} );
