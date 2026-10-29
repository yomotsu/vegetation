import { describe, expect, it } from 'vitest';
import { DEFAULT_BLADE_COLOR, generateGrassData, regenerateGrassBladeTexture } from '../../src/core/generators/grass';
import { GRASS_TEXTURE_SIZE } from '../../src/core/grassTexture';
import type { MeshData } from '../../src/core/types';
import { areByteIdentical, areStructurallyByteIdentical } from '../helpers/byteIdentical';
import { validateMeshData } from '../helpers/validateMeshData';

function meanNormalY( mesh: MeshData ): number {

	let total = 0;
	for ( let index = 1; index < mesh.normals.length; index += 3 ) total += mesh.normals[ index ]!;
	return total / ( mesh.normals.length / 3 );

}

function meanLuminance( texture: { width: number; height: number; data: Uint8Array }, minY: number, maxY: number ): number {

	let total = 0;
	let count = 0;
	for ( let y = minY; y < maxY; y ++ ) {
		for ( let x = 0; x < texture.width; x ++ ) {
			const offset = ( y * texture.width + x ) * 4;
			if ( texture.data[ offset + 3 ]! < 128 ) continue;
			total += texture.data[ offset ]! * 0.2126 + texture.data[ offset + 1 ]! * 0.7152 + texture.data[ offset + 2 ]! * 0.0722;
			count ++;
		}
	}
	return total / count;

}

describe( 'grass core generator', () => {

	it( 'creates one valid card with five byte-identical LODs and no collider', () => {

		const options = { seed: 17, height: 0.45 };
		const first = generateGrassData( options );
		const second = generateGrassData( options );

		expect( first.kind ).toBe( 'grass' );
		expect( first.collider ).toBeNull();
		expect( first.lods ).toHaveLength( 5 );
		expect( first.parts.map( ( part ) => part.name ) ).toEqual( [ 'blade' ] );
		expect( first.parts[ 0 ]!.defaultColor ).toBe( DEFAULT_BLADE_COLOR );
		expect( first.bounds.height ).toBe( 0.45 );
		expect( first.bounds.radius ).toBeCloseTo( 0.45 * 1.125 / 2 );

		for ( let lod = 0; lod < 5; lod ++ ) {

			const mesh = first.lods[ lod ]!;
			validateMeshData( mesh );
			expect( mesh.positions.length / 3 ).toBe( 4 );
			expect( mesh.indices.length / 3 ).toBe( 2 );
			expect( mesh.groups ).toEqual( [ { start: 0, count: 6, partIndex: 0 } ] );
			expect( areStructurallyByteIdentical( mesh, first.lods[ 0 ] ) ).toBe( true );
			expect( areStructurallyByteIdentical( mesh, second.lods[ lod ] ) ).toBe( true );

		}

		const expectedPositions = [ - 0.253125, 0, 0, 0.253125, 0, 0, 0.253125, 0.45, 0, - 0.253125, 0.45, 0 ];
		first.lods[ 0 ]!.positions.forEach( ( value, index ) => expect( value ).toBeCloseTo( expectedPositions[ index ]!, 6 ) );

	} );

	it( 'uses a seeded 14-blade texture, alpha antialiasing, and varying normals', () => {

		const first = generateGrassData( { seed: 9 } );
		const repeated = generateGrassData( { seed: 9 } );
		const otherSeed = generateGrassData( { seed: 10 } );
		const albedo = first.textures.blade!;
		const normal = first.textures[ 'blade-normal' ]!;
		const alphaValues = new Set<number>();
		const normalValues = new Set<number>();
		let coveredPixels = 0;
		let visibleShade = 0;
		let visibleShadePixels = 0;
		let transparentPixel = - 1;

		expect( albedo.width ).toBe( GRASS_TEXTURE_SIZE );
		expect( albedo.height ).toBe( GRASS_TEXTURE_SIZE );
		expect( albedo.colorFactors ).toHaveLength( GRASS_TEXTURE_SIZE * GRASS_TEXTURE_SIZE );
		expect( albedo.colorPixelIndices ).toHaveLength( GRASS_TEXTURE_SIZE * GRASS_TEXTURE_SIZE );
		expect( normal.width ).toBe( albedo.width );
		expect( normal.height ).toBe( albedo.height );
		expect( areByteIdentical( albedo.data, repeated.textures.blade!.data ) ).toBe( true );
		expect( areByteIdentical( albedo.data, otherSeed.textures.blade!.data ) ).toBe( false );

		for ( let offset = 3; offset < albedo.data.length; offset += 4 ) {
			alphaValues.add( albedo.data[ offset ]! );
			if ( albedo.data[ offset ]! > 0 ) coveredPixels ++;
			if ( albedo.data[ offset ] === 0 && transparentPixel < 0 ) transparentPixel = Math.floor( offset / 4 );
			if ( albedo.data[ offset ]! >= 102 ) {
				visibleShade += albedo.colorFactors![ Math.floor( offset / 4 ) ]!;
				visibleShadePixels ++;
			}
		}
		for ( let offset = 0; offset < normal.data.length; offset += 4 ) normalValues.add( normal.data[ offset ]! );

		expect( [ ...alphaValues ].some( ( alpha ) => alpha > 0 && alpha < 255 ) ).toBe( true );
		expect( normalValues.size ).toBeGreaterThan( 2 );
		expect( coveredPixels ).toBeGreaterThan( 1000 );
		expect( visibleShade / visibleShadePixels ).toBeCloseTo( 1, 2 );
		expect( [ albedo.data[ transparentPixel * 4 ], albedo.data[ transparentPixel * 4 + 1 ], albedo.data[ transparentPixel * 4 + 2 ] ] ).toEqual( [ 75, 148, 43 ] );
		expect( meanLuminance( albedo, Math.floor( GRASS_TEXTURE_SIZE * 0.04 ), Math.floor( GRASS_TEXTURE_SIZE * 0.14 ) ) )
			.toBeLessThan( meanLuminance( albedo, Math.floor( GRASS_TEXTURE_SIZE * 0.43 ), Math.floor( GRASS_TEXTURE_SIZE * 0.55 ) ) );
		expect( first.textureGenerators!.blade!.seed ).toBe( 9 );

	} );

	it( 'keeps card roots fixed, tips fully wind-weighted, and mesh normals terrain-facing', () => {

		const mesh = generateGrassData( { seed: 3 } ).lods[ 0 ]!;
		expect( [ ...mesh.windWeight ] ).toEqual( [ 0, 0, 1, 1 ] );
		expect( meanNormalY( mesh ) ).toBeGreaterThan( 0.5 );
		expect( [ ...mesh.normals ].filter( ( _, index ) => index % 3 === 1 ).every( ( value ) => value > 0.99 ) ).toBe( true );

	} );

	it( 'regenerates blade color from cached shade factors without changing geometry or normals', () => {

		const data = generateGrassData( { seed: 4 } );
		const geometry = data.lods.map( ( mesh ) => mesh.positions.slice() );
		const normal = data.textures[ 'blade-normal' ]!.data.slice();
		const changedColor = 0xb8a64a;
		regenerateGrassBladeTexture( data, changedColor );
		const fresh = generateGrassData( { seed: 4, bladeColor: changedColor } );

		expect( areByteIdentical( data.textures.blade!.data, fresh.textures.blade!.data ) ).toBe( true );
		expect( areByteIdentical( data.textures[ 'blade-normal' ]!.data, normal ) ).toBe( true );
		for ( let lod = 0; lod < geometry.length; lod ++ ) expect( areByteIdentical( data.lods[ lod ]!.positions, geometry[ lod ]! ) ).toBe( true );

	} );

	it( 'keeps generation including texture creation under 50 ms', () => {

		const coldStart = performance.now();
		generateGrassData( { seed: 1 } );
		const cold = performance.now() - coldStart;
		const timings: number[] = [];
		for ( let run = 0; run < 10; run ++ ) {
			const start = performance.now();
			generateGrassData( { seed: run + 1 } );
			timings.push( performance.now() - start );
		}
		timings.sort( ( first, second ) => first - second );
		const median = ( timings[ 4 ]! + timings[ 5 ]! ) * 0.5;
		console.log( `generateGrassData: cold ${ cold.toFixed( 2 ) } ms, warm median ${ median.toFixed( 2 ) } ms` );
		expect( cold ).toBeLessThan( 50 );
		expect( median ).toBeLessThan( 50 );

	} );

	it( 'accepts a custom card width and rejects invalid dimensions and seeds', () => {

		const custom = generateGrassData( { height: 0.5, width: 0.4 } );
		expect( custom.bounds.radius ).toBeCloseTo( 0.2 );
		expect( custom.lods[ 0 ]!.positions[ 0 ] ).toBeCloseTo( - 0.2 );
		expect( () => generateGrassData( { height: 0 } ) ).toThrow( RangeError );
		expect( () => generateGrassData( { width: 0 } ) ).toThrow( RangeError );
		expect( () => generateGrassData( { seed: Infinity } ) ).toThrow( RangeError );

	} );

} );
