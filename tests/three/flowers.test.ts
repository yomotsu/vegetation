import { FrontSide, LOD, Mesh, MeshPhysicalMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { FlowersMesh, generateFlowers, generateFlowersAsync } from '../../src/index';
import { areByteIdentical, areStructurallyByteIdentical } from '../helpers/byteIdentical';

describe( 'flowers three.js API', () => {

	it( 'exports FlowersMesh with split textured parts and owned up-normal cards', () => {

		const asset = generateFlowers( { seed: 3, variety: 'daisy' } );
		const mesh = new FlowersMesh( { seed: 3, variety: 'daisy', lod: 0 } );

		expect( mesh ).toBeInstanceOf( Mesh );
		expect( mesh.collider ).toBeNull();
		expect( asset.data.parts.slice( 0, 2 ).map( ( part ) => part.name ) ).toEqual( [ 'petal', 'stem' ] );
		expect( asset.data.parts.slice( 0, 2 ).every( ( part ) => part.colorizesTexture && part.upNormalCards ) ).toBe( true );
		expect( asset.materials.slice( 0, 2 ).every( ( material ) => material instanceof MeshPhysicalMaterial ) ).toBe( true );
		expect( mesh.parts.map( ( part ) => part.name ) ).toEqual( [ 'petal', 'stem' ] );
		expect( mesh.parts.every( ( part ) => part.material.side === FrontSide ) ).toBe( true );
		expect( mesh.parts.every( ( part ) => part.geometry.getIndex()!.count > asset.getParts( 0 ).find( ( source ) => source.part === part.name )!.geometry.getIndex()!.count ) ).toBe( true );
		asset.dispose();
		mesh.dispose();

	} );

	it( 'regenerates petal and stem colors without replacing geometry, and creates five LODs', () => {

		const mesh = new FlowersMesh( { seed: 6, petalColor: '#f2c230', stemColor: '#2f6f1e' } );
		const positions = mesh.asset.geometries.map( ( geometry ) => geometry.getAttribute( 'position' ).array.slice() );
		const oldPetal = ( mesh.asset.materials[ 0 ]!.map!.image as { data: Uint8Array } ).data.slice();
		mesh.setColor( 'petal', '#a98bd6' );
		mesh.setColor( 'stem', '#81603d' );
		expect( mesh.getColor( 'petal' ).getHex() ).toBe( 0xa98bd6 );
		expect( areByteIdentical( ( mesh.asset.materials[ 0 ]!.map!.image as { data: Uint8Array } ).data, oldPetal ) ).toBe( false );
		expect( mesh.asset.geometries.map( ( geometry ) => geometry.getAttribute( 'position' ).array ) ).toEqual( positions );

		const lod = FlowersMesh.createLOD( { seed: 6 } );
		expect( lod ).toBeInstanceOf( LOD );
		expect( lod.levels.map( ( level ) => ( level.object as FlowersMesh ).lod ) ).toEqual( [ 0, 1, 2, 3, 4 ] );
		for ( const level of lod.levels ) ( level.object as FlowersMesh ).dispose();
		mesh.dispose();

	} );

	it( 'keeps asynchronous generation byte-identical when workers are unavailable', async () => {

		const originalWorker = globalThis.Worker;
		Object.defineProperty( globalThis, 'Worker', { configurable: true, value: undefined } );
		try {
			for ( const variety of [ 'allium', 'daisy', 'tulip', 'poppy', 'bluebell', 'calla', 'primrose' ] as const ) {
				const synchronous = generateFlowers( { seed: 11, variety, petalColor: '#a98bd6', centerColor: '#b9cf6a' } );
				const asynchronous = await generateFlowersAsync( { seed: 11, variety, petalColor: '#a98bd6', centerColor: '#b9cf6a' } );
				expect( areStructurallyByteIdentical( asynchronous.data, synchronous.data ) ).toBe( true );
				expect( areStructurallyByteIdentical( asynchronous.materials[ 0 ]!.map!.image, synchronous.materials[ 0 ]!.map!.image ) ).toBe( true );
				synchronous.dispose();
				asynchronous.dispose();
			}
		} finally {
			Object.defineProperty( globalThis, 'Worker', { configurable: true, value: originalWorker } );
		}

	}, 30000 );

	it( 'keeps generation, texture creation, and impostor baking under 50 ms per variety', () => {

		for ( const variety of [ 'allium', 'daisy', 'tulip', 'poppy', 'bluebell', 'calla', 'primrose' ] as const ) {
			const start = performance.now();
			const asset = generateFlowers( { seed: 1, variety } );
			const elapsed = performance.now() - start;
			console.log( `generateFlowers ${ variety }: ${ elapsed.toFixed( 2 ) } ms` );
			expect( elapsed ).toBeLessThan( 50 );
			asset.dispose();
		}

	} );

} );
