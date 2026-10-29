import { DataTexture, DoubleSide, FrontSide, LOD, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import { GrassMesh, generateGrass, generateGrassAsync } from '../../src/index';
import { areByteIdentical, areStructurallyByteIdentical } from '../helpers/byteIdentical';

describe( 'grass three.js API', () => {

	it( 'wraps one card in owned textured standard materials and keeps the collider empty', () => {

		const asset = generateGrass( { seed: 2, bladeColor: '#b8a64a' } );
		const material = asset.materials[ 0 ]! as MeshStandardMaterial;
		const albedo = material.map as DataTexture;
		const normal = material.normalMap as DataTexture;

		expect( asset.data.kind ).toBe( 'grass' );
		expect( asset.collider ).toBeNull();
		expect( asset.data.parts ).toHaveLength( 1 );
		expect( asset.data.parts[ 0 ] ).toMatchObject( { name: 'blade', colorizesTexture: true, alphaTest: 0.45, doubleSided: true, roughness: 0.9 } );
		expect( asset.data.parts[ 0 ]!.impostorViews ).toBeUndefined();
		expect( asset.getColor( 'blade' ).getHex() ).toBe( 0xb8a64a );
		expect( material ).toBeInstanceOf( MeshStandardMaterial );
		expect( material.side ).toBe( DoubleSide );
		expect( material.map ).toBeInstanceOf( DataTexture );
		expect( material.normalMap ).toBeInstanceOf( DataTexture );
		expect( albedo.colorSpace ).toBe( SRGBColorSpace );
		expect( normal.colorSpace ).toBe( NoColorSpace );
		expect( material.color.getHex() ).toBe( 0xffffff );
		expect( asset.geometries.map( ( geometry ) => geometry.getAttribute( 'position' ).count ) ).toEqual( [ 4, 4, 4, 4, 4 ] );

		asset.dispose();

	} );

	it( 'exports GrassMesh, regenerates color without geometry changes, and creates five plain card LODs', () => {

		const mesh = new GrassMesh( { seed: 6, bladeColor: '#4b942b', lod: 2 } );
		const positions = mesh.asset.geometries.map( ( geometry ) => geometry.getAttribute( 'position' ).array.slice() );
		const albedo = mesh.asset.materials[ 0 ]!.map!.image as { data: Uint8Array };
		const oldColorData = albedo.data.slice();

		expect( mesh ).toBeInstanceOf( Mesh );
		expect( mesh.lod ).toBe( 2 );
		expect( mesh.collider ).toBeNull();
		expect( mesh.parts ).toHaveLength( 1 );
		expect( mesh.geometry.getAttribute( 'position' ).count ).toBe( 4 );
		expect( mesh.geometry.getIndex()!.count ).toBe( 12 );
		expect( [ ...mesh.geometry.getIndex()!.array ] ).toEqual( [ 0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2 ] );
		expect( mesh.material.side ).toBe( FrontSide );
		mesh.setColor( 'blade', '#a86a2c' );
		expect( mesh.asset.getColor( 'blade' ).getHex() ).toBe( 0xa86a2c );
		expect( areByteIdentical( ( mesh.asset.materials[ 0 ]!.map!.image as { data: Uint8Array } ).data, oldColorData ) ).toBe( false );
		expect( mesh.asset.geometries.map( ( geometry ) => geometry.getAttribute( 'position' ).array ) ).toEqual( positions );

		const lod = GrassMesh.createLOD( { seed: 6 } );
		expect( lod ).toBeInstanceOf( LOD );
		expect( lod.levels ).toHaveLength( 5 );
		expect( lod.levels.map( ( level ) => ( level.object as GrassMesh ).lod ) ).toEqual( [ 0, 1, 2, 3, 4 ] );
		expect( lod.levels.every( ( level ) => ( level.object as GrassMesh ).parts.length === 1 ) ).toBe( true );
		mesh.dispose();
		mesh.dispose();
		for ( const level of lod.levels ) ( level.object as GrassMesh ).dispose();

	} );

	it( 'keeps asynchronous generation byte-identical when workers are unavailable', async () => {

		const originalWorker = globalThis.Worker;
		Object.defineProperty( globalThis, 'Worker', { configurable: true, value: undefined } );
		try {
			const synchronous = generateGrass( { seed: 11, height: 0.5, width: 0.54, bladeColor: '#b8a64a' } );
			const asynchronous = await generateGrassAsync( { seed: 11, height: 0.5, width: 0.54, bladeColor: '#b8a64a' } );
			expect( areStructurallyByteIdentical( asynchronous.data, synchronous.data ) ).toBe( true );
			expect( areStructurallyByteIdentical( asynchronous.materials[ 0 ]!.map!.image, synchronous.materials[ 0 ]!.map!.image ) ).toBe( true );
			synchronous.dispose();
			asynchronous.dispose();
		} finally {
			Object.defineProperty( globalThis, 'Worker', { configurable: true, value: originalWorker } );
		}

	}, 30000 );

} );
