import { BufferGeometry, LOD, Mesh } from 'three';
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

	} );

	it( 'clamps LOD values to integers from zero through four', () => {

		expect( new TreeMesh( { seed: 1, lod: 9 } ).lod ).toBe( 4 );
		expect( new TreeMesh( { seed: 1, lod: - 1 } ).lod ).toBe( 0 );
		expect( new TreeMesh( { seed: 1, lod: 2.5 } ).lod ).toBe( 2 );

	} );

	it( 'shares materials between meshes using the same asset', () => {

		const asset = generateTree( { seed: 1 } );
		const first = new VegetationMesh( asset );
		const second = new VegetationMesh( asset, 1 );

		first.setColor( 'leaf', 0xff0000 );

		expect( first.material[ 1 ] ).toBe( second.material[ 1 ] );
		expect( first.material[ 1 ]!.color.r ).toBeCloseTo( 1 );
		expect( first.material[ 1 ]!.color.g ).toBeCloseTo( 0 );
		expect( second.material[ 1 ]!.color.b ).toBeCloseTo( 0 );
		expect( ( first.material[ 2 ]!.map as { image: { data: Uint8Array } } ).image.data ).toBe( ( second.material[ 2 ]!.map as { image: { data: Uint8Array } } ).image.data );

	} );

	it( 'creates five LOD levels with shared materials and scaled default distances', () => {

		const lod = TreeMesh.createLOD( { seed: 1, height: 12 } );
		const levels = lod.levels;

		expect( lod ).toBeInstanceOf( LOD );
		expect( levels ).toHaveLength( 5 );
		expect( levels.map( ( level ) => level.distance ) ).toEqual( [ 0, 30, 60, 120, 240 ] );
		expect( levels.every( ( level ) => ( level.object as VegetationMesh ).material === ( levels[ 0 ]!.object as VegetationMesh ).material ) ).toBe( true );
		expect( levels.map( ( level ) => ( level.object as VegetationMesh ).lod ) ).toEqual( [ 0, 1, 2, 3, 4 ] );

	} );

	it( 'applies leafColor and exposes the leaf texture', () => {

		const mesh = new TreeMesh( { seed: 1, leafColor: 0xff0000 } );

		expect( mesh.asset ).toBeInstanceOf( VegetationAsset );
		expect( mesh.asset.getColor( 'leaf' ).r ).toBeCloseTo( 1 );
		expect( mesh.material[ 1 ]!.map ).not.toBeNull();

	} );

} );
