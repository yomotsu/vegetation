import {
	BufferGeometry,
	DataTexture,
	ClampToEdgeWrapping,
	DoubleSide,
	LinearFilter,
	LinearMipmapLinearFilter,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	RepeatWrapping,
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
		expect( asset.materials[ 0 ] ).toBeInstanceOf( MeshPhysicalMaterial );
		expect( asset.materials[ 1 ] ).toBeInstanceOf( MeshPhysicalMaterial );
		expect( asset.materials[ 2 ] ).toBeInstanceOf( MeshStandardMaterial );
		expect( asset.materials[ 0 ] ).toMatchObject( { specularIntensity: 0.014872, ior: 1.05 } );
		expect( asset.materials[ 1 ] ).toMatchObject( { specularIntensity: 0.014872, ior: 1.05 } );
		expect( asset.materials[ 1 ]!.side ).toBe( DoubleSide );
		expect( asset.collider ).toBeInstanceOf( BufferGeometry );

	} );

	it( 'selects physical materials only for parts that define physical settings', () => {

		const asset = generateTree( { seed: 1 } );
		delete asset.data.parts[ 0 ]!.specularIntensity;
		delete asset.data.parts[ 0 ]!.ior;
		delete asset.data.parts[ 1 ]!.specularIntensity;

		const genericAsset = new VegetationAsset( asset.data );

		expect( genericAsset.materials[ 0 ] ).not.toBeInstanceOf( MeshPhysicalMaterial );
		expect( genericAsset.materials[ 1 ] ).toBeInstanceOf( MeshPhysicalMaterial );
		expect( genericAsset.materials[ 1 ] ).toMatchObject( { ior: 1.05, specularIntensity: 1 } );
		expect( genericAsset.materials[ 2 ] ).not.toBeInstanceOf( MeshPhysicalMaterial );

		genericAsset.dispose();
		asset.dispose();

	} );

	it( 'creates single-part geometries for every LOD and preserves total triangle counts', () => {

		const asset = generateTree( { seed: 1 } );
		const partsByLod = asset.geometries.map( ( _, lod ) => asset.getParts( lod ) );

		expect( partsByLod.map( ( parts ) => parts.length ) ).toEqual( [ 2, 2, 2, 2, 1 ] );
		expect( partsByLod[ 0 ]!.map( ( part ) => part.part ) ).toEqual( [ 'bark', 'leaf' ] );
		expect( partsByLod[ 4 ]!.map( ( part ) => part.part ) ).toEqual( [ 'impostor' ] );

		for ( const [ lod, parts ] of partsByLod.entries() ) {

			const source = asset.geometries[ lod ]!;
			const sourceTriangleCount = source.getIndex()!.count / 3;

			expect( parts.every( ( part ) => part.geometry.groups.length === 1 ) ).toBe( true );
			expect( parts.every( ( part ) => part.geometry.groups[ 0 ]!.materialIndex === asset.data.parts.findIndex( ( definition ) => definition.name === part.part ) ) ).toBe( true );
			expect( parts.reduce( ( total, part ) => total + part.geometry.getIndex()!.count / 3, 0 ) ).toBe( sourceTriangleCount );
			expect( parts.every( ( part ) => part.geometry.getAttribute( 'position' ) === source.getAttribute( 'position' ) ) ).toBe( true );
			expect( asset.getParts( lod ) ).toBe( parts );

		}

	} );

	it( 'preserves leaf vertex colors and enables them on the LOD0 leaf material', () => {

		const asset = generateTree( { seed: 1 } );
		const leaf = asset.getParts( 0 ).find( ( part ) => part.part === 'leaf' )!;
		const sourceColors = asset.data.lods[ 0 ]!.colors;
		const leafColors = leaf.geometry.getAttribute( 'color' );

		expect( leafColors.array ).toEqual( sourceColors );
		expect( leaf.material.vertexColors ).toBe( true );
		expect( leaf.material.color.getHex() ).toBe( 0xd2d2d2 );

	} );

	it( 'creates bark and leaf data textures with bottom-origin sRGB sampling', () => {

		const asset = generateTree( { seed: 1 } );
		const barkMaterial = asset.materials[ 0 ]!;
		const leafMaterial = asset.materials[ 1 ]!;
		const impostorMaterial = asset.materials[ 2 ]!;
		const barkTexture = barkMaterial.map as DataTexture;
		const leafTexture = leafMaterial.map as DataTexture;
		const impostorTexture = impostorMaterial.map as DataTexture;

		expect( barkTexture ).toBeInstanceOf( DataTexture );
		expect( leafTexture ).toBeInstanceOf( DataTexture );
		expect( impostorTexture ).toBeInstanceOf( DataTexture );
		expect( asset.data.parts[ 0 ]!.texture ).toBe( 'bark' );
		expect( asset.data.textures.bark ).toBeDefined();

		for ( const texture of [ barkTexture, leafTexture, impostorTexture ] ) {

			expect( texture.flipY ).toBe( false );
			expect( texture.colorSpace ).toBe( SRGBColorSpace );
			expect( texture.magFilter ).toBe( LinearFilter );
			expect( texture.minFilter ).toBe( LinearMipmapLinearFilter );
			expect( texture.generateMipmaps ).toBe( true );
			expect( texture.version ).toBeGreaterThan( 0 );

		}
		expect( barkTexture.wrapS ).toBe( RepeatWrapping );
		expect( barkTexture.wrapT ).toBe( RepeatWrapping );
		expect( leafTexture.wrapS ).toBe( ClampToEdgeWrapping );
		expect( leafTexture.wrapT ).toBe( ClampToEdgeWrapping );
		expect( impostorTexture.wrapS ).toBe( ClampToEdgeWrapping );
		expect( impostorTexture.wrapT ).toBe( ClampToEdgeWrapping );

		expect( leafMaterial.alphaTest ).toBe( 0.5 );
		expect( leafMaterial.roughness ).toBe( 0.95 );
		expect( leafMaterial.emissive.getHex() ).toBe( 0x000000 );
		expect( leafMaterial.emissiveIntensity ).toBe( 0 );
		expect( barkMaterial.roughness ).toBe( 0.85 );
		expect( leafMaterial.alphaToCoverage ).toBe( false );
		expect( leafMaterial.transparent ).toBe( false );
		expect( impostorMaterial.alphaTest ).toBe( 0.5 );
		expect( impostorMaterial.alphaToCoverage ).toBe( false );
		expect( impostorMaterial.transparent ).toBe( false );
		expect( impostorMaterial.vertexColors ).toBe( false );
		expect( impostorMaterial.roughness ).toBe( 1 );
		expect( impostorMaterial.metalness ).toBe( 0 );

	} );

	it( 'uses part and texture settings without inferring them from names', () => {

		const asset = generateTree( { seed: 1 } );

		asset.data.parts[ 0 ]!.name = 'wood';
		delete asset.data.parts[ 0 ]!.roughness;
		asset.data.parts[ 1 ]!.name = 'needles';
		delete asset.data.parts[ 1 ]!.roughness;
		delete asset.data.textures.bark!.wrap;

		const genericAsset = new VegetationAsset( asset.data );
		const barkTexture = genericAsset.materials[ 0 ]!.map as DataTexture;
		const leafTexture = genericAsset.materials[ 1 ]!.map as DataTexture;

		expect( genericAsset.materials[ 0 ]!.roughness ).toBe( 1 );
		expect( genericAsset.materials[ 1 ]!.roughness ).toBe( 1 );
		expect( genericAsset.materials[ 1 ]!.emissive.getHex() ).toBe( 0x000000 );
		expect( genericAsset.materials[ 1 ]!.emissiveIntensity ).toBe( 0 );
		expect( barkTexture.wrapS ).toBe( ClampToEdgeWrapping );
		expect( barkTexture.wrapT ).toBe( ClampToEdgeWrapping );
		expect( leafTexture.wrapS ).toBe( ClampToEdgeWrapping );
		expect( leafTexture.wrapT ).toBe( ClampToEdgeWrapping );

		genericAsset.dispose();
		asset.dispose();

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
