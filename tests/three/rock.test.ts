import { DataTexture, MeshPhysicalMaterial, NoColorSpace, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import { RockMesh, generateRock } from '../../src/index';

function boundaryEdgeCountByPosition( mesh: { positions: Float32Array; indices: Uint32Array } ): number {

	const vertices = new Map<string, number>();
	const edges = new Map<string, number>();
	const getVertex = ( index: number ): number => {
		const key = `${ mesh.positions[ index * 3 ]!.toFixed( 6 ) },${ mesh.positions[ index * 3 + 1 ]!.toFixed( 6 ) },${ mesh.positions[ index * 3 + 2 ]!.toFixed( 6 ) }`;
		let vertex = vertices.get( key );
		if ( vertex === undefined ) {
			vertex = vertices.size;
			vertices.set( key, vertex );
		}
		return vertex;
	};

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {
		const triangle = [ getVertex( mesh.indices[ offset ]! ), getVertex( mesh.indices[ offset + 1 ]! ), getVertex( mesh.indices[ offset + 2 ]! ) ];
		for ( let edge = 0; edge < 3; edge ++ ) {
			const first = triangle[ edge ]!;
			const second = triangle[ ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			edges.set( key, ( edges.get( key ) ?? 0 ) + 1 );
		}
	}

	return [ ...edges.values() ].filter( ( count ) => count === 1 ).length;

}

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

	it( 'exports RockMesh and applies rockColor through mesh and billboard LODs', () => {

		const rock = new RockMesh( { seed: 3, rockColor: '#777777', lod: 2 } );
		const positions = rock.asset.geometries[ 0 ]!.getAttribute( 'position' ).array;
		expect( rock.asset.materials ).toHaveLength( 2 );
		expect( rock.asset.data.parts.map( ( part ) => part.name ) ).toEqual( [ 'rock', 'impostor' ] );

		expect( rock.lod ).toBe( 2 );
		expect( rock.asset.getColor( 'rock' ).getHex() ).toBe( 0x777777 );
		rock.setColor( 'rock', '#c0392b' );
		expect( rock.asset.getColor( 'rock' ).getHex() ).toBe( 0xc0392b );
		expect( rock.asset.geometries[ 0 ]!.getAttribute( 'position' ).array ).toBe( positions );

		rock.asset.dispose();

	} );

	it( 'passes closeBottom through RockMeshOptions', () => {

		const rock = new RockMesh( { seed: 1, closeBottom: true, burial: 0, lod: 3 } );
		for ( let lod = 0; lod <= 3; lod ++ ) {
			expect( boundaryEdgeCountByPosition( rock.asset.data.lods[ lod ]! ), `LOD${ lod }` ).toBe( 0 );
		}
		rock.asset.dispose();

	} );

} );
