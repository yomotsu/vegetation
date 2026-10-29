import { BufferGeometry, InstancedMesh, LOD, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RockMesh, TreeMesh, generateTree } from '../../src/three/meshes';
import { orientBillboardInstances, VegetationMesh } from '../../src/three/VegetationMesh';
import { VegetationAsset } from '../../src/three/VegetationAsset';

function meanTextureColorAtV( texture: { width: number; height: number; data: Uint8Array }, v: number ): [ number, number, number ] {

	const y = Math.round( v * ( texture.height - 1 ) );
	const channels = [ 0, 0, 0 ];
	let count = 0;

	for ( let x = 16; x < texture.height - 16; x ++ ) {

		const offset = ( y * texture.width + x ) * 4;

		if ( texture.data[ offset + 3 ]! < 128 ) {

			continue;

		}

		for ( let channel = 0; channel < 3; channel ++ ) channels[ channel ]! += texture.data[ offset + channel ]!;
		count ++;

	}

	return channels.map( ( channel ) => channel / count ) as [ number, number, number ];

}

function textureLuminance( color: [ number, number, number ] ): number {

	return color[ 0 ] * 0.2126 + color[ 1 ] * 0.7152 + color[ 2 ] * 0.0722;

}

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

	it( 'exposes part colors and disposes assets owned by generated meshes', () => {

		const mesh = new TreeMesh( { seed: 1 } );
		const disposeAsset = vi.spyOn( mesh.asset, 'dispose' );

		expect( mesh.getColor( 'leaf' ).getHex() ).toBe( 0x2f7d1f );
		mesh.setColor( 'leaf', 0xc0392b );
		expect( mesh.getColor( 'leaf' ).getHex() ).toBe( 0xc0392b );
		expect( mesh.getColor( 'leafRing' ).getHex() ).toBe( 0xc0392b );

		mesh.dispose();
		expect( disposeAsset ).toHaveBeenCalledOnce();

	} );

	it( 'reports bark as brown and uses barkColor as a material tint', () => {

		const defaultTree = new TreeMesh( { seed: 1 } );
		const customTree = new TreeMesh( { seed: 1, barkColor: '#855537' } );

		expect( defaultTree.getColor( 'bark' ).getHex() ).toBe( 0x6b4c32 );
		expect( customTree.getColor( 'bark' ).getHex() ).toBe( 0x855537 );
		expect( customTree.asset.materials[ 0 ]!.color.getHex() ).toBe( 0x855537 );

		defaultTree.dispose();
		customTree.dispose();

	} );

	it( 'disposes assets owned by generated rock meshes and rock LOD sets', () => {

		const rock = new RockMesh( { seed: 1, size: 1 } );
		const rockDispose = vi.spyOn( rock.asset, 'dispose' );
		rock.dispose();
		expect( rockDispose ).toHaveBeenCalledOnce();

		const lod = RockMesh.createLOD( { seed: 1, size: 1 } );
		const asset = ( lod.levels[ 0 ]!.object as VegetationMesh ).asset;
		const lodDispose = vi.spyOn( asset, 'dispose' );
		( lod.levels[ 0 ]!.object as VegetationMesh ).dispose();
		expect( lodDispose ).toHaveBeenCalledOnce();

	} );

	it( 'uses a private, non-drawing LOD4 root geometry with shader attributes', () => {

		const asset = generateTree( { seed: 1 } );
		const mesh = new VegetationMesh( asset, 4 );
		const emptyGeometry = mesh.geometry;
		const disposeGeometry = vi.fn();
		const disposeAsset = vi.spyOn( asset, 'dispose' );

		emptyGeometry.addEventListener( 'dispose', disposeGeometry );
		expect( emptyGeometry.getAttribute( 'position' ) ).toBeDefined();
		expect( emptyGeometry.getAttribute( 'uv' ) ).toBeDefined();
		expect( emptyGeometry.getAttribute( 'impostorCard' ) ).toBeDefined();
		expect( emptyGeometry.getIndex() ).toBeNull();
		expect( emptyGeometry.drawRange.count ).toBe( 0 );
		expect( emptyGeometry ).not.toBe( mesh.parts[ 0 ]!.geometry );

		mesh.dispose();

		expect( disposeGeometry ).toHaveBeenCalledOnce();
		expect( disposeAsset ).not.toHaveBeenCalled();
		asset.dispose();

	} );

	it( 'turns only the LOD4 side quad toward the camera, and toward the light for shadows', () => {

		const asset = generateTree( { seed: 1 } );
		const mesh = new VegetationMesh( asset, 4 );
		const camera = new PerspectiveCamera();
		mesh.position.set( 3, 1, - 2 );
		mesh.rotation.y = 0.4;
		mesh.updateMatrixWorld( true );
		camera.position.copy( mesh.localToWorld( new Vector3( 10, 2, 0 ) ) );
		camera.updateMatrixWorld( true );
		const part = mesh.parts[ 0 ]!;
		const topCard = mesh.parts[ 1 ]!;
		const shadowCamera = new PerspectiveCamera();
		shadowCamera.position.copy( mesh.localToWorld( new Vector3( 0, 5, - 10 ) ) );
		shadowCamera.updateMatrixWorld( true );

		part.onBeforeShadow( undefined as never, undefined as never, camera, shadowCamera, part.geometry, undefined as never, undefined as never );

		expect( Math.abs( part.rotation.y ) ).toBeCloseTo( Math.PI );
		expect( part.modelViewMatrix.equals( new Matrix4().multiplyMatrices( shadowCamera.matrixWorldInverse, part.matrixWorld ) ) ).toBe( true );

		part.onAfterShadow( undefined as never, undefined as never, camera, shadowCamera, part.geometry, undefined as never, undefined as never );

		part.onBeforeRender( undefined as never, undefined as never, camera, part.geometry, part.material, undefined as never );

		expect( mesh.rotation.y ).toBeCloseTo( 0.4 );
		expect( part.rotation.y ).toBeCloseTo( Math.PI / 2 );
		expect( topCard.rotation.y ).toBe( 0 );
		expect( topCard.geometry.getIndex()!.count ).toBe( 6 );

		asset.dispose();

	} );

	it( 'orients instanced billboards while preserving position and scale', () => {

		const geometry = new BufferGeometry();
		const material = new MeshStandardMaterial();
		const mesh = new InstancedMesh( geometry, material, 1 );
		const matrix = new Matrix4();
		const position = new Vector3( 2, 0, - 1 );
		const scale = new Vector3( 1.5, 1.5, 1.5 );
		const rotation = new Quaternion().setFromAxisAngle( new Vector3( 0, 1, 0 ), 0.7 );
		const camera = new PerspectiveCamera();

		matrix.compose( position, rotation, scale );
		mesh.setMatrixAt( 0, matrix );
		camera.position.set( 10, 0, 4 );
		camera.updateMatrixWorld( true );
		orientBillboardInstances( mesh, camera );
		mesh.getMatrixAt( 0, matrix );
		matrix.decompose( position, rotation, scale );
		const facing = new Vector3( 0, 0, 1 ).applyQuaternion( rotation );
		const expected = new Vector3( 10, 0, 4 ).sub( position ).setY( 0 ).normalize();

		expect( position.toArray() ).toEqual( [ 2, 0, - 1 ] );
		expect( scale.x ).toBeCloseTo( 1.5 );
		expect( scale.y ).toBeCloseTo( 1.5 );
		expect( scale.z ).toBeCloseTo( 1.5 );
		expect( facing.x ).toBeCloseTo( expected.x );
		expect( facing.z ).toBeCloseTo( expected.z );

		geometry.dispose();
		material.dispose();
		mesh.dispose();

	} );

	it( 'shares per-part materials between meshes and applies setColor to every part mesh', () => {

		const asset = generateTree( { seed: 1 } );
		const first = new VegetationMesh( asset );
		const second = new VegetationMesh( asset, 1 );
		const impostorTexture = asset.materials[ 3 ]!.map as { image: { data: Uint8Array } };
		const originalPixels = impostorTexture.image.data.slice();

		first.setColor( 'leaf', 0xff0000 );

		const firstLeaf = first.parts.find( ( part ) => part.name === 'leaf' )!;
		const secondLeaf = second.parts.find( ( part ) => part.name === 'leaf' )!;
		expect( firstLeaf.material ).toBe( secondLeaf.material );
		expect( ( firstLeaf.material as MeshStandardMaterial ).color.getHex() ).toBe( 0xffffff );
		expect( asset.getColor( 'leaf' ).getHex() ).toBe( 0xff0000 );
		expect( impostorTexture.image.data ).not.toEqual( originalPixels );
		expect( ( first.parts[ 0 ]!.material as MeshStandardMaterial ) ).toBe( asset.materials[ 0 ] );
		expect( ( firstLeaf.material as MeshStandardMaterial ) ).toBe( asset.materials[ 1 ] );

	} );

	it( 'creates owned per-part LOD levels scaled from the real default tree height', () => {

		const lod = TreeMesh.createLOD( { seed: 1 } );
		const levels = lod.levels;
		const asset = ( levels[ 0 ]!.object as VegetationMesh ).asset;

		expect( lod ).toBeInstanceOf( LOD );
		expect( levels ).toHaveLength( 5 );
		expect( levels.map( ( level ) => level.distance ) ).toEqual( [ 0, 15, 30, 60, 120 ] );
		expect( levels.every( ( level ) => ( level.object as VegetationMesh ).parts.every( ( part ) => part.material === asset.materials[ asset.data.parts.findIndex( ( definition ) => definition.name === part.name ) ] ) ) ).toBe( true );
		expect( levels.map( ( level ) => ( level.object as VegetationMesh ).parts.length ) ).toEqual( [ 2, 3, 3, 2, 2 ] );
		expect( levels.every( ( level ) => ( level.object as VegetationMesh ).parts.every( ( part ) => Array.isArray( part.material ) === false ) ) ).toBe( true );
		expect( levels.map( ( level ) => ( level.object as VegetationMesh ).lod ) ).toEqual( [ 0, 1, 2, 3, 4 ] );
		const disposeAsset = vi.spyOn( asset, 'dispose' );
		( levels[ 4 ]!.object as VegetationMesh ).dispose();
		expect( disposeAsset ).toHaveBeenCalledOnce();

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

		const mesh = new TreeMesh( { seed: 1, leafColor: '#c0392b' } );
		const leafTexture = mesh.asset.data.textures.leaf!;
		const base = meanTextureColorAtV( leafTexture, 0.05 );
		const tip = meanTextureColorAtV( leafTexture, 0.9 );

		expect( mesh.asset ).toBeInstanceOf( VegetationAsset );
		expect( mesh.asset.getColor( 'leaf' ).getHex() ).toBe( 0xc0392b );
		expect( mesh.parts.find( ( part ) => part.name === 'leaf' )!.material ).toBe( mesh.asset.materials[ 1 ] );
		expect( ( mesh.parts.find( ( part ) => part.name === 'leaf' )!.material as MeshStandardMaterial ).map ).not.toBeNull();
		expect( textureLuminance( base ) ).toBeLessThan( textureLuminance( tip ) );

		for ( const v of [ 0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1 ] ) {

			const color = meanTextureColorAtV( leafTexture, v );
			expect( color[ 0 ] ).toBeGreaterThan( color[ 1 ] );

		}

		const repeated = new TreeMesh( { seed: 1, leafColor: '#c0392b' } );
		expect( repeated.asset.data.textures.leaf!.data ).toEqual( leafTexture.data );

	} );

} );
