import {
	BufferGeometry,
	DataTexture,
	DoubleSide,
	LinearFilter,
	LinearMipmapLinearFilter,
	MeshStandardMaterial,
	SRGBColorSpace,
} from 'three';
import { describe, expect, it } from 'vitest';
import { generateTree } from '../../src/three/meshes';
import { VegetationAsset } from '../../src/three/VegetationAsset';

describe( 'VegetationAsset', () => {

	it( 'builds all LOD geometries, per-part materials, and a collider', () => {

		const asset = generateTree( { seed: 1 } );

		expect( asset.geometries ).toHaveLength( 5 );
		expect( asset.geometries[ 0 ] ).toBeInstanceOf( BufferGeometry );
		expect( asset.geometries[ 0 ]!.getAttribute( 'windWeight' ) ).toBeDefined();
		expect( asset.geometries[ 0 ]!.getAttribute( 'windWeight' ).itemSize ).toBe( 1 );
		expect( asset.geometries[ 0 ]!.boundingSphere ).not.toBeNull();
		expect( asset.geometries[ 0 ]!.groups.map( ( group ) => group.materialIndex ) ).toEqual( [ 0, 1 ] );
		expect( asset.materials ).toHaveLength( 3 );
		expect( asset.materials[ 0 ] ).toBeInstanceOf( MeshStandardMaterial );
		expect( asset.materials[ 1 ]!.side ).toBe( DoubleSide );
		expect( asset.collider ).toBeInstanceOf( BufferGeometry );

	} );

	it( 'creates a single-part geometry for every LOD group', () => {

		const asset = generateTree( { seed: 1 } );
		const parts = asset.getParts( 0 );
		const sourceTriangleCount = asset.geometries[ 0 ]!.getIndex()!.count / 3;

		expect( parts.map( ( part ) => part.part ) ).toEqual( [ 'bark', 'leaf' ] );
		expect( parts.every( ( part ) => part.geometry.groups.length === 1 ) ).toBe( true );
		expect( parts.every( ( part ) => part.geometry.groups[ 0 ]!.materialIndex === asset.data.parts.findIndex( ( definition ) => definition.name === part.part ) ) ).toBe( true );
		expect( parts.reduce( ( total, part ) => total + part.geometry.getIndex()!.count / 3, 0 ) ).toBe( sourceTriangleCount );
		expect( asset.getParts( 0 ) ).toBe( parts );

	} );

	it( 'uses bottom-origin sRGB data textures with mipmaps and alpha-tested materials', () => {

		const asset = generateTree( { seed: 1 } );
		const leafMaterial = asset.materials[ 1 ]!;
		const impostorMaterial = asset.materials[ 2 ]!;
		const leafTexture = leafMaterial.map as DataTexture;
		const impostorTexture = impostorMaterial.map as DataTexture;

		expect( leafTexture ).toBeInstanceOf( DataTexture );
		expect( impostorTexture ).toBeInstanceOf( DataTexture );

		for ( const texture of [ leafTexture, impostorTexture ] ) {

			expect( texture.flipY ).toBe( false );
			expect( texture.colorSpace ).toBe( SRGBColorSpace );
			expect( texture.magFilter ).toBe( LinearFilter );
			expect( texture.minFilter ).toBe( LinearMipmapLinearFilter );
			expect( texture.generateMipmaps ).toBe( true );
			expect( texture.version ).toBeGreaterThan( 0 );

		}

		expect( leafMaterial.alphaTest ).toBe( 0.5 );
		expect( leafMaterial.alphaToCoverage ).toBe( false );
		expect( leafMaterial.transparent ).toBe( false );
		expect( impostorMaterial.alphaTest ).toBe( 0.5 );
		expect( impostorMaterial.alphaToCoverage ).toBe( false );
		expect( impostorMaterial.transparent ).toBe( false );
		expect( impostorMaterial.vertexColors ).toBe( false );
		expect( impostorMaterial.roughness ).toBe( 1 );
		expect( impostorMaterial.metalness ).toBe( 0 );

	} );

	it( 'updates an impostor texture when a part color changes and rejects unknown parts', () => {

		const asset = generateTree( { seed: 1 } );
		const texture = asset.materials[ 2 ]!.map as DataTexture;
		const originalPixels = texture.image.data!.slice();

		asset.setColor( 'leaf', 0xff0000 );

		expect( asset.getColor( 'leaf' ).r ).toBeCloseTo( 1 );
		expect( asset.getColor( 'leaf' ).g ).toBeCloseTo( 0 );
		expect( texture.image.data ).not.toEqual( originalPixels );
		expect( () => asset.setColor( 'nope', 0 ) ).toThrow();

	} );

	it( 'disposes safely more than once', () => {

		const asset = generateTree( { seed: 1 } );

		expect( () => {

			asset.dispose();
			asset.dispose();

		} ).not.toThrow();

	} );

} );
