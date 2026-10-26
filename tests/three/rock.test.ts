import { DataTexture, MeshPhysicalMaterial, NoColorSpace, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import { RockMesh, generateRock } from '../../src/index';

describe( 'rock meshes', () => {

	it( 'uses reference physical material settings and a linear normal map', () => {

		const rock = generateRock( { seed: 1 } );
		const material = rock.materials[ 0 ]! as MeshPhysicalMaterial;

		expect( material ).toBeInstanceOf( MeshPhysicalMaterial );
		expect( material.roughness ).toBe( 0.9 );
		expect( material.metalness ).toBe( 0 );
		expect( material.specularIntensity ).toBeCloseTo( 0.014872 );
		expect( material.ior ).toBeCloseTo( 1.05 );
		expect( material.map ).toBeInstanceOf( DataTexture );
		expect( material.map!.colorSpace ).toBe( SRGBColorSpace );
		expect( material.normalMap ).toBeInstanceOf( DataTexture );
		expect( material.normalMap!.colorSpace ).toBe( NoColorSpace );

		rock.dispose();

	} );

	it( 'exports RockMesh and applies rockColor and setColor through all LODs', () => {

		const rock = new RockMesh( { seed: 3, rockColor: '#777777', lod: 2 } );
		const positions = rock.asset.geometries[ 0 ]!.getAttribute( 'position' ).array;
		const billboard = rock.asset.materials[ 2 ]!.map as DataTexture;
		const originalPixels = billboard.image.data!.slice();

		expect( rock.lod ).toBe( 2 );
		expect( rock.asset.getColor( 'rock' ).getHex() ).toBe( 0x777777 );
		rock.setColor( 'rock', '#c0392b' );
		expect( rock.asset.getColor( 'rock' ).getHex() ).toBe( 0xc0392b );
		expect( billboard.image.data ).not.toEqual( originalPixels );
		expect( rock.asset.geometries[ 0 ]!.getAttribute( 'position' ).array ).toBe( positions );

		rock.asset.dispose();

	} );

} );
