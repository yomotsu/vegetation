import { DataTexture, LOD, Mesh, MeshPhysicalMaterial, NoColorSpace, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import { PebblesMesh, generatePebbles } from '../../src/index';

describe( 'pebble meshes', () => {

	it( 'wraps the core cluster in a textured physical material with no collider', () => {

		const asset = generatePebbles( { seed: 3, count: 20, stoneColor: '#777777' } );
		const material = asset.materials[ 0 ]! as MeshPhysicalMaterial;

		expect( asset.data.kind ).toBe( 'pebbles' );
		expect( asset.collider ).toBeNull();
		expect( asset.data.parts[ 0 ]!.name ).toBe( 'stone' );
		expect( asset.getColor( 'stone' ).getHex() ).toBe( 0x777777 );
		expect( material ).toBeInstanceOf( MeshPhysicalMaterial );
		expect( material.roughness ).toBe( 0.9 );
		expect( material.metalness ).toBe( 0 );
		expect( material.specularIntensity ).toBeCloseTo( 0.014872 );
		expect( material.ior ).toBeCloseTo( 1.05 );
		expect( material.map ).toBeInstanceOf( DataTexture );
		expect( material.map!.colorSpace ).toBe( SRGBColorSpace );
		expect( material.normalMap ).toBeInstanceOf( DataTexture );
		expect( material.normalMap!.colorSpace ).toBe( NoColorSpace );

		asset.dispose();

	} );

	it( 'exports PebblesMesh and applies stoneColor and setColor to billboard views', () => {

		const mesh = new PebblesMesh( { seed: 7, stoneColor: '#777777', lod: 4 } );
		const billboard = mesh.asset.materials[ 2 ]!.map as DataTexture;
		const originalPixels = billboard.image.data!.slice();

		expect( mesh ).toBeInstanceOf( Mesh );
		expect( mesh.lod ).toBe( 4 );
		expect( mesh.collider ).toBeNull();
		expect( mesh.asset.getColor( 'stone' ).getHex() ).toBe( 0x777777 );
		mesh.setColor( 'stone', '#c0392b' );
		expect( mesh.asset.getColor( 'stone' ).getHex() ).toBe( 0xc0392b );
		expect( billboard.image.data ).not.toEqual( originalPixels );

		mesh.dispose();

	} );

	it( 'creates five owned LOD levels scaled from cluster spread', () => {

		const lod = PebblesMesh.createLOD( { seed: 4, spread: 3.2 } );

		expect( lod ).toBeInstanceOf( LOD );
		expect( lod.levels ).toHaveLength( 5 );
		expect( lod.levels.map( ( level ) => level.distance ) ).toEqual( [ 0, 30, 60, 120, 240 ] );
		expect( lod.levels.map( ( level ) => ( level.object as PebblesMesh ).lod ) ).toEqual( [ 0, 1, 2, 3, 4 ] );

		for ( const level of lod.levels ) ( level.object as PebblesMesh ).dispose();

	} );

} );
