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
import { registerTextureRegenerator } from '../../src/core/textureRegenerator';
import { generateTreeData } from '../../src/core/generators/tree';

function meanTextureColor( texture: { width: number; height: number; data: Uint8Array } ): [ number, number, number ] {

	const channels = [ 0, 0, 0 ];
	let count = 0;

	for ( let y = 0; y < texture.height; y ++ ) {

		for ( let x = 0; x < texture.width; x ++ ) {

			const offset = ( y * texture.width + x ) * 4;
			if ( texture.data[ offset + 3 ]! < 128 ) {

				continue;

			}

			for ( let channel = 0; channel < 3; channel ++ ) channels[ channel ]! += texture.data[ offset + channel ]!;
			count ++;

		}

	}

	return channels.map( ( channel ) => channel / count ) as [ number, number, number ];

}

function haveEqualBytes( first: Uint8Array, second: Uint8Array ): boolean {

	if ( first.length !== second.length ) {
		return false;
	}

	for ( let index = 0; index < first.length; index ++ ) {

		if ( first[ index ] !== second[ index ] ) {
			return false;
		}

	}

	return true;

}

describe( 'VegetationAsset', () => {

	it( 'builds all LOD geometries, per-part materials, and a collider', () => {

		const asset = generateTree( { seed: 1 } );

		expect( asset.geometries ).toHaveLength( 5 );
		expect( asset.geometries[ 0 ] ).toBeInstanceOf( BufferGeometry );
		expect( asset.geometries[ 0 ]!.getAttribute( 'windWeight' ) ).toBeDefined();
		expect( asset.geometries[ 0 ]!.getAttribute( 'windWeight' ).itemSize ).toBe( 1 );
		expect( asset.geometries[ 0 ]!.boundingSphere ).not.toBeNull();
		expect( asset.geometries[ 0 ]!.groups.map( ( group ) => group.materialIndex ) ).toEqual( [ 0, 1 ] );
		expect( asset.materials ).toHaveLength( 4 );
		expect( asset.materials[ 0 ] ).toBeInstanceOf( MeshStandardMaterial );
		expect( asset.materials[ 0 ] ).toBeInstanceOf( MeshPhysicalMaterial );
		expect( asset.materials[ 1 ] ).toBeInstanceOf( MeshPhysicalMaterial );
		expect( asset.materials[ 2 ] ).toBeInstanceOf( MeshStandardMaterial );
		expect( asset.materials[ 3 ] ).toBeInstanceOf( MeshStandardMaterial );
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
		expect( genericAsset.materials[ 3 ] ).not.toBeInstanceOf( MeshPhysicalMaterial );

		genericAsset.dispose();
		asset.dispose();

	} );

	it( 'creates single-part geometries for every LOD and preserves total triangle counts', () => {

		const asset = generateTree( { seed: 1 } );
		const partsByLod = asset.geometries.map( ( _, lod ) => asset.getParts( lod ) );

		expect( partsByLod.map( ( parts ) => parts.length ) ).toEqual( [ 2, 2, 2, 1, 1 ] );
		expect( partsByLod[ 0 ]!.map( ( part ) => part.part ) ).toEqual( [ 'bark', 'leaf' ] );
		expect( partsByLod[ 3 ]!.map( ( part ) => part.part ) ).toEqual( [ 'impostor-lod3' ] );
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
		expect( leaf.material.color.getHex() ).toBe( 0xffffff );
		expect( asset.getColor( 'leaf' ).getHex() ).toBe( 0x2f7d1f );

	} );

	it( 'creates bark, leaf, and impostor textures with bottom-origin sRGB sampling', () => {

		const asset = generateTree( { seed: 1 } );
		const barkMaterial = asset.materials[ 0 ]!;
		const leafMaterial = asset.materials[ 1 ]!;
		const impostorLod3Material = asset.materials[ 2 ]!;
		const impostorMaterial = asset.materials[ 3 ]!;
		const barkTexture = barkMaterial.map as DataTexture;
		const leafTexture = leafMaterial.map as DataTexture;
		const impostorTexture = impostorMaterial.map as DataTexture;
		const impostorLod3Texture = impostorLod3Material.map as DataTexture;

		expect( barkTexture ).toBeInstanceOf( DataTexture );
		expect( leafTexture ).toBeInstanceOf( DataTexture );
		expect( leafTexture.image.width ).toBe( 256 );
		expect( leafTexture.image.height ).toBe( 256 );
		expect( impostorTexture ).toBeInstanceOf( DataTexture );
		expect( impostorTexture.image.width ).toBe( 128 * 2 );
		expect( impostorTexture.image.height ).toBe( 128 );
		expect( impostorLod3Texture.image.width ).toBe( 128 * 6 );
		expect( impostorLod3Texture.image.height ).toBe( 128 );
		expect( asset.data.parts[ 0 ]!.texture ).toBe( 'bark' );
		expect( asset.data.parts[ 0 ]!.defaultColor ).toBe( 0x6b4c32 );
		expect( barkMaterial.color.getHex() ).toBe( 0x6b4c32 );
		expect( asset.getColor( 'bark' ).getHex() ).toBe( 0x6b4c32 );
		expect( asset.data.textures.bark ).toBeDefined();

		for ( const texture of [ barkTexture, leafTexture, impostorTexture, impostorLod3Texture ] ) {

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

	it( 'does not mutate input texture data when constructor colors trigger regeneration', () => {

		const data = generateTreeData( { seed: 1 } );
		const inputPixels = data.textures.leaf!.data.slice();
		const asset = new VegetationAsset( data, { leaf: '#c0392b' } );

		expect( data.textures.leaf!.data ).toEqual( inputPixels );
		expect( asset.data.textures.leaf!.data ).not.toEqual( inputPixels );

		asset.dispose();

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

	it( 'regenerates a colorized texture and impostor without rebuilding geometry', () => {

		const asset = generateTree( { seed: 1 } );
		const leafTexture = asset.materials[ 1 ]!.map as DataTexture;
		const impostorLod3Texture = asset.materials[ 2 ]!.map as DataTexture;
		const impostorTexture = asset.materials[ 3 ]!.map as DataTexture;
		const originalLeafPixels = leafTexture.image.data!.slice();
		const originalImpostorPixels = impostorTexture.image.data!.slice();
		const originalLod3Pixels = impostorLod3Texture.image.data!.slice();
		const positions = asset.geometries[ 0 ]!.getAttribute( 'position' ).array;
		const originalLeafData = leafTexture.image.data;
		const lod3Impostor = asset.getParts( 3 )[ 0 ]!;
		const lod4Impostor = asset.getParts( 4 )[ 0 ]!;
		let topTileChanged = false;

		asset.setColor( 'leaf', '#c0392b' );

		expect( asset.getColor( 'leaf' ).getHex() ).toBe( 0xc0392b );
		expect( asset.materials[ 1 ]!.color.getHex() ).toBe( 0xffffff );
		expect( leafTexture.image.data ).not.toBe( originalLeafData );
		expect( leafTexture.image.data ).not.toEqual( originalLeafPixels );
		expect( meanTextureColor( asset.data.textures.leaf! )[ 0 ] ).toBeGreaterThan( meanTextureColor( asset.data.textures.leaf! )[ 1 ] );
		expect( impostorLod3Texture.image.data ).not.toEqual( originalLod3Pixels );
		expect( lod3Impostor.material.map ).toBe( impostorLod3Texture );
		expect( impostorTexture.image.data ).not.toEqual( originalImpostorPixels );
		for ( let y = 0; y < impostorTexture.image.height && ! topTileChanged; y ++ ) {

			for ( let x = impostorTexture.image.width / 2; x < impostorTexture.image.width; x ++ ) {

				const offset = ( y * impostorTexture.image.width + x ) * 4;

				if ( impostorTexture.image.data![ offset ] !== originalImpostorPixels[ offset ] ) {

					topTileChanged = true;
					break;

				}

			}

		}
		expect( topTileChanged ).toBe( true );
		expect( lod4Impostor.material.map ).toBe( impostorTexture );
		expect( asset.geometries[ 0 ]!.getAttribute( 'position' ).array ).toBe( positions );
		expect( () => asset.setColor( 'nope', 0 ) ).toThrow();

	} );

	it( 'disposes safely more than once', () => {

		const asset = generateTree( { seed: 1 } );

		expect( () => {

			asset.dispose();
			asset.dispose();

		} ).not.toThrow();

	} );

	it( 'dispatches color regeneration by the texture generator type', () => {

		registerTextureRegenerator( 'asset-test-color', ( texture, _generator, color ) => {

			const data = texture.data.slice();

			for ( let offset = 0; offset < data.length; offset += 4 ) {

				data[ offset ] = ( color >>> 16 ) & 0xff;

			}

			return { ...texture, data };

		} );
		const data = generateTreeData( { seed: 1 } );
		data.textureGenerators!.leaf!.type = 'asset-test-color';
		const asset = new VegetationAsset( data );

		expect( () => asset.setColor( 'leaf', 0xc0392b ) ).not.toThrow();
		expect( asset.data.textures.leaf!.data[ 0 ] ).toBe( 0xc0 );

		asset.dispose();

	} );

	it( 'creates impostor textures only for texture keys referenced by parts', () => {

		const data = generateTreeData( { seed: 1 } );
		data.parts = data.parts.filter( ( part ) => part.texture !== 'impostor' && part.texture !== 'impostor-lod3' );
		data.lods = data.lods.map( ( mesh ) => ( {
			...mesh,
			groups: mesh.groups.filter( ( group ) => group.partIndex < data.parts.length ),
		} ) );
		const asset = new VegetationAsset( data );
		const internals = asset as unknown as { impostorTextures: Map<string, DataTexture> };

		expect( internals.impostorTextures.size ).toBe( 0 );

		asset.dispose();

	} );

	it( 'does not rebake impostors when a changed part is absent from the source LOD', () => {

		const data = generateTreeData( { seed: 1 } );
		data.parts.push( {
			name: 'unused',
			defaultColor: 0xffffff,
			texture: null,
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
		} );
		const asset = new VegetationAsset( data );
		const impostor = asset.materials[ 3 ]!.map as DataTexture;
		const originalPixels = impostor.image.data;
		const originalVersion = impostor.version;

		asset.setColor( 'unused', 0xff0000 );

		expect( impostor.image.data ).toBe( originalPixels );
		expect( impostor.version ).toBe( originalVersion );

		asset.dispose();

	} );

	it( 'keeps source texture buffers unchanged while recoloring an asset', () => {

		const data = generateTreeData( { seed: 1 } );
		const originalPixels = data.textures.leaf!.data.slice();
		const asset = new VegetationAsset( data );

		asset.setColor( 'leaf', 0xc0392b );

		expect( data.textures.leaf!.data ).toEqual( originalPixels );
		expect( asset.data.textures.leaf!.data ).not.toEqual( originalPixels );

		asset.dispose();

	} );

	it( 'recolors leaf pixels identically to construction and restores the default bytes', () => {

		const asset = generateTree( { seed: 1 } );
		const defaultPixels = asset.data.textures.leaf!.data.slice();
		const constructed = generateTree( { seed: 1, leafColor: '#c0392b' } );

		asset.setColor( 'leaf', '#c0392b' );
		expect( haveEqualBytes( asset.data.textures.leaf!.data, constructed.data.textures.leaf!.data ) ).toBe( true );

		asset.setColor( 'leaf', 0x2f7d1f );
		expect( haveEqualBytes( asset.data.textures.leaf!.data, defaultPixels ) ).toBe( true );

		asset.dispose();
		constructed.dispose();

	} );

	it( 'batches changed colors into one impostor rebake and skips no-op color sets', () => {

		const asset = generateTree( { seed: 1 } );
		const impostor = asset.materials[ 2 ]!.map as DataTexture;
		const initialVersion = impostor.version;

		asset.setColors( { leaf: '#c0392b', bark: '#855537' } );

		expect( asset.getColor( 'leaf' ).getHex() ).toBe( 0xc0392b );
		expect( asset.getColor( 'bark' ).getHex() ).toBe( 0x855537 );
		expect( impostor.version ).toBe( initialVersion + 1 );

		const changedVersion = impostor.version;
		asset.setColors( { leaf: '#c0392b', bark: '#855537' } );

		expect( impostor.version ).toBe( changedVersion );

		asset.dispose();

	} );

} );
