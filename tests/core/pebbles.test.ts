import { describe, expect, it } from 'vitest';
import { bakeImpostor, generatePebblesData, hexToLinear } from '../../src/core';
import type { MeshData } from '../../src/core';
import { createRockTextures } from '../../src/core/rockTexture';
import { validateMeshData } from '../helpers/validateMeshData';

function triangleCount( mesh: MeshData ): number {

	return mesh.indices.length / 3;

}

function vertexCount( mesh: MeshData ): number {

	return mesh.positions.length / 3;

}

function meshColorSpread( mesh: MeshData ): number {

	let minimum = Infinity;
	let maximum = - Infinity;

	for ( const color of mesh.colors ) {

		minimum = Math.min( minimum, color );
		maximum = Math.max( maximum, color );

	}

	return maximum - minimum;

}

function hashBytes( data: Uint8Array ): number {

	let hash = 2166136261;
	for ( let index = 0; index < data.length; index ++ ) hash = Math.imul( hash ^ data[ index ]!, 16777619 );
	return hash >>> 0;

}

function renderCoverage( data: ReturnType<typeof generatePebblesData>, lod: number, topDown = false ) {

	const source = data.lods[ lod ]!;
	const mesh = topDown
		? {
			...source,
			positions: Float32Array.from( source.positions, ( value, index ) => index % 3 === 1 ? source.positions[ index + 2 ]! + data.bounds.radius : index % 3 === 2 ? source.positions[ index - 1 ]! : value ),
			normals: Float32Array.from( source.normals, ( value, index ) => index % 3 === 1 ? source.normals[ index + 2 ]! : index % 3 === 2 ? source.normals[ index - 1 ]! : value ),
		}
		: source;
	const renderData = {
		...data,
		lods: [ mesh ],
		bounds: topDown ? { radius: data.bounds.radius, height: data.bounds.radius * 2 } : data.bounds,
	};

	return bakeImpostor( renderData, data.parts.map( ( part ) => hexToLinear( part.defaultColor ) ), 128, [ 0 ] );

}

function coverageIou( first: { width: number; data: Uint8Array }, second: { width: number; data: Uint8Array }, tolerance = 0 ): number {

	let intersection = 0;
	let union = 0;
	const height = first.data.length / 4 / first.width;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < first.width; x ++ ) {

			let firstOpaque = false;
			let secondOpaque = false;

			for ( let dy = - tolerance; dy <= tolerance; dy ++ ) {

				for ( let dx = - tolerance; dx <= tolerance; dx ++ ) {

					const sampleX = x + dx;
					const sampleY = y + dy;
					if ( sampleX < 0 || sampleX >= first.width || sampleY < 0 || sampleY >= height ) continue;
					if ( first.data[ ( sampleY * first.width + sampleX ) * 4 + 3 ]! > 0 ) firstOpaque = true;
					if ( second.data[ ( sampleY * second.width + sampleX ) * 4 + 3 ]! > 0 ) secondOpaque = true;

				}

			}

			if ( firstOpaque && secondOpaque ) intersection ++;
			if ( firstOpaque || secondOpaque ) union ++;

		}

	}

	return intersection / union;

}

describe( 'procedural pebbles data', () => {

	it( 'builds five valid LODs with shared stone textures and no collider', () => {

		const data = generatePebblesData( { seed: 4 } );

		expect( data.kind ).toBe( 'pebbles' );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( [ 'stone', 'impostor-lod3', 'impostor' ] );
		expect( data.parts[ 0 ]!.texture ).toBe( 'albedo' );
		expect( data.parts[ 0 ]!.normalTexture ).toBe( 'normal' );
		expect( data.parts[ 0 ]!.flatShading ).toBe( false );
		expect( data.collider ).toBeNull();
		expect( data.textures.albedo!.width ).toBe( 1024 );
		expect( data.textures.albedo!.height ).toBe( 1024 );
		expect( data.textures.normal!.width ).toBe( 1024 );
		expect( vertexCount( data.lods[ 0 ]! ) ).toBeLessThanOrEqual( 128 );
		expect( triangleCount( data.lods[ 3 ]! ) ).toBe( 12 );
		expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 2 );
		expect( hashBytes( data.textures.albedo!.data ) ).toBe( hashBytes( createRockTextures( 4 ).albedo.data ) );
		expect( hashBytes( data.textures.normal!.data ) ).toBe( hashBytes( createRockTextures( 4 ).normal.data ) );
		for ( const mesh of data.lods ) validateMeshData( mesh );

	} );

	it( 'is deterministic for a seed and changes the cluster for another seed', () => {

		const first = generatePebblesData( { seed: 23 } );
		const repeated = generatePebblesData( { seed: 23 } );
		const different = generatePebblesData( { seed: 24 } );

		expect( first.lods[ 0 ]!.positions ).toEqual( repeated.lods[ 0 ]!.positions );
		expect( first.lods[ 0 ]!.indices ).toEqual( repeated.lods[ 0 ]!.indices );
		expect( hashBytes( first.textures.albedo!.data ) ).toBe( hashBytes( repeated.textures.albedo!.data ) );
		expect( first.lods[ 0 ]!.positions ).not.toEqual( different.lods[ 0 ]!.positions );

	} );

	it( 'keeps pebble vertex tint uniform to prevent diagonal interpolation bands', () => {

		const data = generatePebblesData( { seed: 2 } );
		expect( meshColorSpread( data.lods[ 0 ]! ) ).toBeLessThan( 0.001 );

	} );

	it( 'keeps default vertex budgets near the requested LOD targets with decreasing triangle counts', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generatePebblesData( { seed } );
			const lods = data.lods.slice( 0, 3 );
			const vertices = lods.map( vertexCount );
			const allVertices = data.lods.map( vertexCount );
			const triangles = data.lods.map( triangleCount );

			expect( vertices[ 0 ] ).toBeLessThanOrEqual( 128 );
			expect( vertices[ 1 ] ).toBeGreaterThanOrEqual( 88 );
			expect( vertices[ 1 ] ).toBeLessThanOrEqual( 104 );
			expect( vertices[ 2 ] ).toBeGreaterThanOrEqual( 80 );
			expect( vertices[ 2 ] ).toBeLessThanOrEqual( 104 );
			if ( seed === 1 ) expect( vertices ).toEqual( [ 128, 104, 96 ] );
			for ( let lod = 0; lod < allVertices.length - 1; lod ++ ) {

				expect( allVertices[ lod ] ).toBeGreaterThan( allVertices[ lod + 1 ]! );

			}

			expect( triangles[ 0 ] ).toBeGreaterThan( triangles[ 1 ]! );
			expect( triangles[ 1 ] ).toBeGreaterThan( triangles[ 2 ]! );
			expect( triangles[ 2 ] ).toBeGreaterThan( triangles[ 3 ]! );
			expect( triangles[ 3 ] ).toBeGreaterThan( triangles[ 4 ]! );

		}

		const maximumCount = generatePebblesData( { count: 30 } );
		expect( vertexCount( maximumCount.lods[ 0 ]! ) ).toBeLessThanOrEqual( 240 );
		expect( vertexCount( maximumCount.lods[ 1 ]! ) ).toBeLessThanOrEqual( 210 );
		expect( vertexCount( maximumCount.lods[ 2 ]! ) ).toBeLessThanOrEqual( 180 );

	} );

	it( 'keeps side and top coverage close across the stone LODs', () => {

		const data = generatePebblesData( { seed: 7 } );

		for ( const topDown of [ false, true ] ) {

			const lod0 = renderCoverage( data, 0, topDown );
			for ( const lod of [ 1, 2 ] ) {

				const coverage = coverageIou( lod0, renderCoverage( data, lod, topDown ), 1 );
				expect( coverage, `LOD${ lod } ${ topDown ? 'top' : 'side' } coverage` ).toBeGreaterThan( 0.65 );

			}

		}

	} );

	it( 'responds to count, spread, and size while validating dimensions and color', () => {

		const small = generatePebblesData( { seed: 5, count: 12, spread: 0.8, size: 0.16, stoneColor: 0x123456 } );
		const large = generatePebblesData( { seed: 5, count: 30, spread: 2.2, size: 0.32 } );

		expect( vertexCount( large.lods[ 0 ]! ) ).toBeGreaterThan( vertexCount( small.lods[ 0 ]! ) );
		expect( large.bounds.radius ).toBeGreaterThan( small.bounds.radius );
		expect( small.parts[ 0 ]!.defaultColor ).toBe( 0x123456 );
		expect( () => generatePebblesData( { count: 3 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { count: 31 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { spread: 0 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { size: - 1 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { stoneColor: - 1 } ) ).toThrow( RangeError );

	} );

	it( 'sinks stones below the ground while keeping their cluster low', () => {

		const data = generatePebblesData( { seed: 8 } );
		let minimumY = Infinity;
		let maximumY = - Infinity;

		for ( let index = 1; index < data.lods[ 0 ]!.positions.length; index += 3 ) {

			minimumY = Math.min( minimumY, data.lods[ 0 ]!.positions[ index ]! );
			maximumY = Math.max( maximumY, data.lods[ 0 ]!.positions[ index ]! );

		}

		expect( minimumY ).toBeLessThan( 0 );
		expect( maximumY ).toBeGreaterThan( 0 );
		expect( data.bounds.height ).toBeGreaterThanOrEqual( 0.23 );
		expect( data.bounds.height ).toBeLessThanOrEqual( 0.4 );
		expect( data.bounds.radius ).toBeGreaterThanOrEqual( 1.4 );
		expect( data.bounds.radius ).toBeLessThanOrEqual( 2 );

	} );

} );
