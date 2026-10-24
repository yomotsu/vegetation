import { BufferGeometry, LOD, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { TreeMesh, generateTree } from '../../src/three/meshes';
import { VegetationMesh } from '../../src/three/VegetationMesh';
import { VegetationAsset } from '../../src/three/VegetationAsset';

describe( 'tree meshes', () => {

	it( 'creates a mesh with a collider and wind weights', () => {

		const mesh = new TreeMesh( { seed: 1 } );

		expect( mesh ).toBeInstanceOf( Mesh );
		expect( mesh.lod ).toBe( 0 );
		expect( mesh.collider ).toBeInstanceOf( BufferGeometry );
		expect( mesh.geometry.getAttribute( 'windWeight' ) ).toBeDefined();
		expect( mesh.parts ).toHaveLength( 2 );
		expect( mesh.parts[ 0 ] ).toBe( mesh );
		expect( mesh.parts.map( ( part ) => part.name ) ).toEqual( [ 'bark', 'leaf' ] );
		expect( mesh.parts.every( ( part ) => Array.isArray( part.material ) === false ) ).toBe( true );
		expect( mesh.parts[ 1 ] ).toBeInstanceOf( Mesh );

	} );

	it( 'clamps LOD values to integers from zero through four', () => {

		expect( new TreeMesh( { seed: 1, lod: 9 } ).lod ).toBe( 4 );
		expect( new TreeMesh( { seed: 1, lod: - 1 } ).lod ).toBe( 0 );
		expect( new TreeMesh( { seed: 1, lod: 2.5 } ).lod ).toBe( 2 );

	} );

	it( 'shares per-part materials between meshes and applies setColor to every part mesh', () => {

		const asset = generateTree( { seed: 1 } );
		const first = new VegetationMesh( asset );
		const second = new VegetationMesh( asset, 1 );
		const impostorTexture = asset.materials[ 2 ]!.map as { image: { data: Uint8Array } };
		const originalPixels = impostorTexture.image.data.slice();

		first.setColor( 'leaf', 0xff0000 );

		const firstLeaf = first.parts.find( ( part ) => part.name === 'leaf' )!;
		const secondLeaf = second.parts.find( ( part ) => part.name === 'leaf' )!;
		expect( firstLeaf.material ).toBe( secondLeaf.material );
		expect( ( firstLeaf.material as MeshStandardMaterial ).color.r ).toBeCloseTo( 1 );
		expect( ( firstLeaf.material as MeshStandardMaterial ).color.g ).toBeCloseTo( 0 );
		expect( ( secondLeaf.material as MeshStandardMaterial ).color.b ).toBeCloseTo( 0 );
		expect( impostorTexture.image.data ).not.toEqual( originalPixels );
		expect( ( first.parts[ 0 ]!.material as MeshStandardMaterial ) ).toBe( asset.materials[ 0 ] );
		expect( ( firstLeaf.material as MeshStandardMaterial ) ).toBe( asset.materials[ 1 ] );

	} );

	it( 'creates five per-part LOD levels with shared materials and scaled default distances', () => {

		const lod = TreeMesh.createLOD( { seed: 1, height: 12 } );
		const levels = lod.levels;
		const asset = ( levels[ 0 ]!.object as VegetationMesh ).asset;

		expect( lod ).toBeInstanceOf( LOD );
		expect( levels ).toHaveLength( 5 );
		expect( levels.map( ( level ) => level.distance ) ).toEqual( [ 0, 30, 60, 120, 240 ] );
		expect( levels.every( ( level ) => ( level.object as VegetationMesh ).parts.every( ( part ) => part.material === asset.materials[ asset.data.parts.findIndex( ( definition ) => definition.name === part.name ) ] ) ) ).toBe( true );
		expect( levels.map( ( level ) => ( level.object as VegetationMesh ).parts.length ) ).toEqual( [ 2, 2, 2, 2, 1 ] );
		expect( levels.every( ( level ) => ( level.object as VegetationMesh ).parts.every( ( part ) => Array.isArray( part.material ) === false ) ) ).toBe( true );
		expect( levels.map( ( level ) => ( level.object as VegetationMesh ).lod ) ).toEqual( [ 0, 1, 2, 3, 4 ] );

	} );

	it( 'propagates shadow flags to all part meshes', () => {

		const mesh = new TreeMesh( { seed: 1 } );

		mesh.castShadow = true;
		mesh.receiveShadow = true;

		expect( mesh.parts.every( ( part ) => part.castShadow ) ).toBe( true );
		expect( mesh.parts.every( ( part ) => part.receiveShadow ) ).toBe( true );

		mesh.castShadow = false;
		mesh.receiveShadow = false;

		expect( mesh.parts.every( ( part ) => part.castShadow === false ) ).toBe( true );
		expect( mesh.parts.every( ( part ) => part.receiveShadow === false ) ).toBe( true );

	} );

	it( 'applies leafColor and exposes the leaf texture', () => {

		const mesh = new TreeMesh( { seed: 1, leafColor: 0xff0000 } );

		expect( mesh.asset ).toBeInstanceOf( VegetationAsset );
		expect( mesh.asset.getColor( 'leaf' ).r ).toBeCloseTo( 1 );
		expect( mesh.parts.find( ( part ) => part.name === 'leaf' )!.material ).toBe( mesh.asset.materials[ 1 ] );
		expect( ( mesh.parts.find( ( part ) => part.name === 'leaf' )!.material as MeshStandardMaterial ).map ).not.toBeNull();

	} );

} );
