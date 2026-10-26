import { describe, expect, it } from 'vitest';
import { bakeImpostor, generatePebblesData, hexToLinear } from '../../src/core';
import type { MeshData } from '../../src/core';
import { createRockTextures } from '../../src/core/rockTexture';
import { validateMeshData } from '../helpers/validateMeshData';
import { sampleOutlineRadius, splitConnectedComponents } from '../helpers/meshOutline';
import { withSharedRockTextures } from '../helpers/sharedRockTextures';
import { topCardCoverageIou } from '../helpers/topCardCoverage';
import { minimumRockApexAngle } from '../helpers/rockSharpness';

function triangleCount( mesh: MeshData ): number {

	return mesh.indices.length / 3;

}

function boundaryEdgeCount( mesh: Pick<MeshData, 'positions' | 'indices'> ): number {

	const edges = new Map<string, number>();
	for ( let index = 0; index < mesh.indices.length; index += 3 ) {
		for ( let edge = 0; edge < 3; edge ++ ) {
			const first = mesh.indices[ index + edge ]!;
			const second = mesh.indices[ index + ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			edges.set( key, ( edges.get( key ) ?? 0 ) + 1 );
		}
	}

	return [ ...edges.values() ].filter( ( count ) => count === 1 ).length;

}

function vertexCount( mesh: MeshData ): number {

	return mesh.positions.length / 3;

}

function meshColorSpread( mesh: MeshData ): number {

	let minimum = Infinity;
	let maximum = - Infinity;

	for ( const color of mesh.colors ) {

		minimum = Math.min( minimum, color );
		maximum = Math.max( maximum, color );

	}

	return maximum - minimum;

}

function hashBytes( data: Uint8Array ): number {

	let hash = 2166136261;
	for ( let index = 0; index < data.length; index ++ ) hash = Math.imul( hash ^ data[ index ]!, 16777619 );
	return hash >>> 0;

}

function meanOpaqueRgb( data: Uint8Array ): [ number, number, number ] {

	const mean: [ number, number, number ] = [ 0, 0, 0 ];
	let pixels = 0;

	for ( let offset = 0; offset < data.length; offset += 4 ) {

		if ( data[ offset + 3 ] === 0 ) continue;

		mean[ 0 ] += data[ offset ]!;
		mean[ 1 ] += data[ offset + 1 ]!;
		mean[ 2 ] += data[ offset + 2 ]!;
		pixels ++;

	}

	return mean.map( ( value ) => value / pixels ) as [ number, number, number ];

}

function renderCoverage( data: ReturnType<typeof generatePebblesData>, lod: number, topDown = false ) {

	const source = data.lods[ lod ]!;
	const mesh = topDown
		? {
			...source,
			positions: Float32Array.from( source.positions, ( value, index ) => index % 3 === 1 ? - source.positions[ index + 1 ]! + data.bounds.radius : index % 3 === 2 ? source.positions[ index - 1 ]! : value ),
			normals: Float32Array.from( source.normals, ( value, index ) => index % 3 === 1 ? - source.normals[ index + 1 ]! : index % 3 === 2 ? source.normals[ index - 1 ]! : value ),
		}
		: source;
	const renderData = {
		...data,
		lods: [ mesh ],
		bounds: topDown ? { radius: data.bounds.radius, height: data.bounds.radius * 2 } : data.bounds,
	};

	return bakeImpostor( renderData, data.parts.map( ( part ) => hexToLinear( part.defaultColor ) ), 128, [ 0 ] );

}

function coverageIou( first: { width: number; data: Uint8Array }, second: { width: number; data: Uint8Array }, tolerance = 0 ): number {

	let intersection = 0;
	let union = 0;
	const height = first.data.length / 4 / first.width;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < first.width; x ++ ) {

			let firstOpaque = false;
			let secondOpaque = false;

			for ( let dy = - tolerance; dy <= tolerance; dy ++ ) {

				for ( let dx = - tolerance; dx <= tolerance; dx ++ ) {

					const sampleX = x + dx;
					const sampleY = y + dy;
					if ( sampleX < 0 || sampleX >= first.width || sampleY < 0 || sampleY >= height ) continue;
					if ( first.data[ ( sampleY * first.width + sampleX ) * 4 + 3 ]! > 0 ) firstOpaque = true;
					if ( second.data[ ( sampleY * second.width + sampleX ) * 4 + 3 ]! > 0 ) secondOpaque = true;

				}

			}

			if ( firstOpaque && secondOpaque ) intersection ++;
			if ( firstOpaque || secondOpaque ) union ++;

		}

	}

	return intersection / union;

}

describe( 'procedural pebbles data', () => {

	it( 'keeps each above-ground pebble vertex broad across all mesh LODs', () => {

		withSharedRockTextures( () => {

			const seeds = [ ...Array.from( { length: 300 }, ( _, index ) => index + 1 ), 341810, 987654321, 2147483647, - 1987654321 ];

			for ( const seed of seeds ) {

				const lods = generatePebblesData( { seed } ).lods;

				for ( let lod = 0; lod <= 3; lod ++ ) {

					for ( const [ stone, component ] of splitConnectedComponents( lods[ lod ]! ).entries() ) {

						const angle = minimumRockApexAngle( component );
						expect( angle, `seed ${ seed } LOD${ lod } pebble ${ stone } narrowest vertex cone` ).toBeGreaterThanOrEqual( 100 );

					}

				}

			}

		} );

	}, 180000 );

	it( 'keeps every far pebble grounded around its full footprint', () => {

		withSharedRockTextures( () => {

			const size = 0.32;
			const seeds = [ 341810, ...Array.from( { length: 200 }, ( _, index ) => index + 1 ), 987654321, 2147483647, - 1987654321 ];

			for ( const seed of seeds ) {

				const mesh = generatePebblesData( { seed, size } ).lods[ 3 ]!;

				for ( const [ componentIndex, component ] of splitConnectedComponents( mesh ).entries() ) {

					const center: [ number, number ] = [ 0, 0 ];
					for ( let offset = 0; offset < component.positions.length; offset += 3 ) {
						center[ 0 ] += component.positions[ offset ]! / ( component.positions.length / 3 );
						center[ 1 ] += component.positions[ offset + 2 ]! / ( component.positions.length / 3 );
					}

					for ( let sample = 0; sample < 36; sample ++ ) {

						const angle = sample / 36 * Math.PI * 2;
						const groundRadius = sampleOutlineRadius( component, 0, angle, center );
						const skirtRadius = sampleOutlineRadius( component, - 0.02 * size, angle, center );
						expect( groundRadius, `seed ${ seed } pebble ${ componentIndex } y=0 sample ${ sample }` ).toBeGreaterThan( 0 );
						expect( skirtRadius, `seed ${ seed } pebble ${ componentIndex } below-ground sample ${ sample }` ).toBeGreaterThanOrEqual( groundRadius * 0.85 );

					}

				}

			}

		} );

	}, 120000 );

	it( 'uses a coverage-preserving subset of tiny stones for LOD3', () => {

		const data = generatePebblesData( { seed: 7 } );
		const components = splitConnectedComponents( data.lods[ 3 ]! );

		expect( components.length ).toBe( 15 );
		for ( const component of components ) {

			const count = component.positions.length / 3;
			expect( count ).toBeGreaterThanOrEqual( 4 );
			expect( count ).toBeLessThanOrEqual( 6 );
			expect( boundaryEdgeCount( component ) ).toBeGreaterThan( 0 );

		}
		expect( vertexCount( data.lods[ 2 ]! ) ).toBeGreaterThan( vertexCount( data.lods[ 3 ]! ) );
		expect( triangleCount( data.lods[ 2 ]! ) ).toBeGreaterThan( triangleCount( data.lods[ 3 ]! ) );

	} );

	it( 'builds mesh LOD0–3 with an open far mesh and keeps LOD4 as a billboard', () => {

		const data = generatePebblesData( { seed: 4 } );

		expect( data.kind ).toBe( 'pebbles' );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( [ 'stone', 'impostor' ] );
		expect( data.parts[ 0 ]!.texture ).toBe( 'albedo' );
		expect( data.parts[ 0 ]!.normalTexture ).toBe( 'normal' );
		expect( data.parts[ 0 ]!.flatShading ).toBe( false );
		expect( data.collider ).toBeNull();
		expect( data.textures.albedo!.width ).toBe( 1024 );
		expect( data.textures.albedo!.height ).toBe( 1024 );
		expect( data.textures.normal!.width ).toBe( 1024 );
		expect( vertexCount( data.lods[ 0 ]! ) ).toBeLessThanOrEqual( 128 );
		expect( vertexCount( data.lods[ 3 ]! ) ).toBeGreaterThan( vertexCount( data.lods[ 4 ]! ) );
		expect( vertexCount( data.lods[ 3 ]! ) ).toBeLessThanOrEqual( 90 );
		expect( vertexCount( data.lods[ 4 ]! ) ).toBe( 8 );
		expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 4 );
		expect( data.lods[ 4 ]!.groups[ 0 ]!.partIndex ).toBe( 1 );
		expect( triangleCount( data.lods[ 3 ]! ) ).toBeGreaterThan( triangleCount( data.lods[ 4 ]! ) );
		expect( Object.keys( data.textures ) ).toEqual( [ 'albedo', 'normal' ] );
		expect( hashBytes( data.textures.albedo!.data ) ).toBe( hashBytes( createRockTextures( 4 ).albedo.data ) );
		expect( hashBytes( data.textures.normal!.data ) ).toBe( hashBytes( createRockTextures( 4 ).normal.data ) );
		for ( const mesh of data.lods ) validateMeshData( mesh );

	} );

	it( 'matches the top-down LOD4 coverage to LOD0', () => {

		for ( const seed of [ 1, 4, 7 ] ) {

			const data = generatePebblesData( { seed } );

			expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 4 );
			expect( vertexCount( data.lods[ 4 ]! ) ).toBe( 8 );
			expect( data.lods[ 4 ]!.positions[ 13 ] ).toBeCloseTo( data.bounds.height * 0.25, 5 );
			expect( triangleCount( data.lods[ 3 ]! ) ).toBeGreaterThan( triangleCount( data.lods[ 4 ]! ) );
			expect( topCardCoverageIou( data ) ).toBeGreaterThanOrEqual( 0.6 );

		}

	} );

	it( 'is deterministic for a seed and changes the cluster for another seed', () => {

		const first = generatePebblesData( { seed: 23 } );
		const repeated = generatePebblesData( { seed: 23 } );
		const different = generatePebblesData( { seed: 24 } );

		expect( first.lods[ 0 ]!.positions ).toEqual( repeated.lods[ 0 ]!.positions );
		expect( first.lods[ 0 ]!.indices ).toEqual( repeated.lods[ 0 ]!.indices );
		expect( hashBytes( first.textures.albedo!.data ) ).toBe( hashBytes( repeated.textures.albedo!.data ) );
		expect( first.lods[ 0 ]!.positions ).not.toEqual( different.lods[ 0 ]!.positions );

	} );

	it( 'keeps pebble vertex tint uniform to prevent diagonal interpolation bands', () => {

		const data = generatePebblesData( { seed: 2 } );
		expect( meshColorSpread( data.lods[ 0 ]! ) ).toBeLessThan( 0.001 );

	} );

	it( 'keeps default vertex budgets near the requested LOD targets with decreasing triangle counts', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const data = generatePebblesData( { seed } );
			const lods = data.lods.slice( 0, 3 );
			const vertices = lods.map( vertexCount );
			const allVertices = data.lods.map( vertexCount );
			const triangles = data.lods.map( triangleCount );

			expect( vertices[ 0 ] ).toBeLessThanOrEqual( 128 );
			expect( vertices[ 1 ] ).toBeGreaterThanOrEqual( 88 );
			expect( vertices[ 1 ] ).toBeLessThanOrEqual( 104 );
			expect( vertices[ 2 ] ).toBeGreaterThanOrEqual( 80 );
			expect( vertices[ 2 ] ).toBeLessThanOrEqual( 104 );
			if ( seed === 1 ) expect( vertices ).toEqual( [ 128, 104, 96 ] );
			for ( let lod = 0; lod < allVertices.length - 1; lod ++ ) {

				expect( allVertices[ lod ] ).toBeGreaterThan( allVertices[ lod + 1 ]! );

			}

			expect( triangles[ 0 ] ).toBeGreaterThan( triangles[ 1 ]! );
			expect( triangles[ 1 ] ).toBeGreaterThan( triangles[ 2 ]! );
			expect( triangles[ 2 ] ).toBeGreaterThan( triangles[ 3 ]! );
			expect( triangles[ 3 ] ).toBeGreaterThan( triangles[ 4 ]! );

		}

		const maximumCount = generatePebblesData( { count: 30 } );
		expect( vertexCount( maximumCount.lods[ 0 ]! ) ).toBeLessThanOrEqual( 240 );
		expect( vertexCount( maximumCount.lods[ 1 ]! ) ).toBeLessThanOrEqual( 210 );
		expect( vertexCount( maximumCount.lods[ 2 ]! ) ).toBeLessThanOrEqual( 180 );

	} );

	it( 'keeps side and top coverage across low-poly cluster LODs', () => {

		const data = generatePebblesData( { seed: 7 } );

		for ( const topDown of [ false, true ] ) {

			const lod0 = renderCoverage( data, 0, topDown );
			for ( const lod of [ 3 ] ) {

				const lodCoverage = renderCoverage( data, lod, topDown );
				const coverage = coverageIou( lod0, lodCoverage, 1 );
				expect( coverage, `LOD${ lod } ${ topDown ? 'top' : 'side' } coverage` ).toBeGreaterThanOrEqual( 0.55 );

				if ( ! topDown ) {

					const sourceColor = meanOpaqueRgb( lod0.data );
					const farColor = meanOpaqueRgb( lodCoverage.data );

					for ( let channel = 0; channel < 3; channel ++ ) {
						expect( Math.abs( sourceColor[ channel ]! - farColor[ channel ]! ), `LOD3 channel ${ channel } mean color: ${ sourceColor[ channel ] } vs ${ farColor[ channel ] }` ).toBeLessThanOrEqual( 8 );
					}

				}

			}

		}

	} );

	it( 'matches the visible LOD0 mean color within eight channels at far distances', () => {

		withSharedRockTextures( () => {

			for ( const seed of [ 1, 7, 341810 ] ) {

				const data = generatePebblesData( { seed } );
				const sourceColor = meanOpaqueRgb( renderCoverage( data, 0 ).data );
				const farColor = meanOpaqueRgb( renderCoverage( data, 3 ).data );

				for ( let channel = 0; channel < 3; channel ++ ) {
					expect( Math.abs( sourceColor[ channel ]! - farColor[ channel ]! ), `seed ${ seed } channel ${ channel } mean color` ).toBeLessThanOrEqual( 8 );
				}

			}

		} );

	} );

	it( 'responds to count, spread, and size while validating dimensions and color', () => {

		const small = generatePebblesData( { seed: 5, count: 12, spread: 0.8, size: 0.16, stoneColor: 0x123456 } );
		const large = generatePebblesData( { seed: 5, count: 30, spread: 2.2, size: 0.32 } );

		expect( vertexCount( large.lods[ 0 ]! ) ).toBeGreaterThan( vertexCount( small.lods[ 0 ]! ) );
		expect( large.bounds.radius ).toBeGreaterThan( small.bounds.radius );
		expect( small.parts[ 0 ]!.defaultColor ).toBe( 0x123456 );
		expect( () => generatePebblesData( { count: 3 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { count: 31 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { spread: 0 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { size: - 1 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { stoneColor: - 1 } ) ).toThrow( RangeError );

	} );

	it( 'sinks stones below the ground while keeping their cluster low', () => {

		const data = generatePebblesData( { seed: 8 } );
		let minimumY = Infinity;
		let maximumY = - Infinity;

		for ( let index = 1; index < data.lods[ 0 ]!.positions.length; index += 3 ) {

			minimumY = Math.min( minimumY, data.lods[ 0 ]!.positions[ index ]! );
			maximumY = Math.max( maximumY, data.lods[ 0 ]!.positions[ index ]! );

		}

		expect( minimumY ).toBeLessThan( 0 );
		expect( maximumY ).toBeGreaterThan( 0 );
		expect( data.bounds.height ).toBeGreaterThanOrEqual( 0.23 );
		expect( data.bounds.height ).toBeLessThanOrEqual( 0.4 );
		expect( data.bounds.radius ).toBeGreaterThanOrEqual( 1.4 );
		expect( data.bounds.radius ).toBeLessThanOrEqual( 2 );

	} );

} );
