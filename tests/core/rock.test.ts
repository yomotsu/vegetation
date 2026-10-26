import { describe, expect, it } from 'vitest';
import { bakeImpostor, generateRockData, hexToLinear } from '../../src/core';
import type { MeshData } from '../../src/core';
import { validateMeshData } from '../helpers/validateMeshData';

function triangleCount( mesh: MeshData ): number {

	return mesh.indices.length / 3;

}

function vertexCount( mesh: MeshData ): number {

	return mesh.positions.length / 3;

}

function boundaryEdgeCount( positions: Float32Array, indices: Uint32Array ): number {

	const edges = new Map<string, number>();

	for ( let index = 0; index < indices.length; index += 3 ) {

		const triangle = [ indices[ index ]!, indices[ index + 1 ]!, indices[ index + 2 ]! ];

		for ( let edgeIndex = 0; edgeIndex < 3; edgeIndex ++ ) {

			const first = triangle[ edgeIndex ]!;
			const second = triangle[ ( edgeIndex + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			edges.set( key, ( edges.get( key ) ?? 0 ) + 1 );

		}

	}

	return [ ...edges.values() ].filter( ( count ) => count === 1 ).length;

}

function renderCoverage( data: ReturnType<typeof generateRockData>, lod: number, topDown = false ) {

	const source = data.lods[ lod ]!;
	const mesh = topDown
		? {
			...source,
			positions: Float32Array.from( source.positions, ( value, index ) => index % 3 === 1 ? source.positions[ index + 2 ]! + data.bounds.radius : index % 3 === 2 ? source.positions[ index - 1 ]! : value ),
			normals: Float32Array.from( source.normals, ( value, index ) => index % 3 === 1 ? source.normals[ index + 2 ]! : index % 3 === 2 ? source.normals[ index - 1 ]! : value ),
		}
		: source;
	const renderData = {
		...data,
		lods: [ mesh ],
		bounds: topDown ? { radius: data.bounds.radius, height: data.bounds.radius * 2 } : data.bounds,
	};

	return bakeImpostor( renderData, data.parts.map( ( part ) => hexToLinear( part.defaultColor ) ), 128, [ 0 ] );

}

function coverageIou( first: { width: number; data: Uint8Array }, second: { width: number; data: Uint8Array }, tolerance = 1 ): number {

	let intersection = 0;
	let union = 0;
	const height = first.data.length / 4 / first.width;
	const opaqueNear = ( image: { width: number; data: Uint8Array }, x: number, y: number ): boolean => {

		for ( let dy = - tolerance; dy <= tolerance; dy ++ ) {

			for ( let dx = - tolerance; dx <= tolerance; dx ++ ) {

				const sampleX = x + dx;
				const sampleY = y + dy;

				if ( sampleX < 0 || sampleX >= image.width || sampleY < 0 || sampleY >= height ) continue;
				if ( image.data[ ( sampleY * image.width + sampleX ) * 4 + 3 ]! > 0 ) return true;

			}

		}

		return false;

	};

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < first.width; x ++ ) {

			const firstOpaque = opaqueNear( first, x, y );
			const secondOpaque = opaqueNear( second, x, y );

			if ( firstOpaque && secondOpaque ) intersection ++;
			if ( firstOpaque || secondOpaque ) union ++;

		}

	}

	return intersection / union;

}

describe( 'procedural rock data', () => {

	it( 'builds five valid LODs with a six-plane impostor and a billboard', () => {

		const data = generateRockData( { seed: 4 } );

		expect( data.kind ).toBe( 'rock' );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( [ 'rock', 'impostor-lod3', 'impostor' ] );
		expect( triangleCount( data.lods[ 3 ]! ) ).toBe( 12 );
		expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 2 );
		for ( const mesh of data.lods ) validateMeshData( mesh );

	} );

	it( 'is deterministic for the same seed and changes shape for another seed', () => {

		const first = generateRockData( { seed: 23 } );
		const repeated = generateRockData( { seed: 23 } );
		const different = generateRockData( { seed: 24 } );

		expect( first.lods[ 0 ]!.positions ).toEqual( repeated.lods[ 0 ]!.positions );
		expect( first.textures.albedo!.data ).toEqual( repeated.textures.albedo!.data );
		expect( first.lods[ 0 ]!.positions ).not.toEqual( different.lods[ 0 ]!.positions );

	} );

	it( 'keeps the three shell LODs within vertex caps and strictly reduces triangle counts', () => {

		const lods = generateRockData( { seed: 1 } ).lods.slice( 0, 3 );

		expect( lods.map( vertexCount )[ 0 ] ).toBeLessThanOrEqual( 285 );
		expect( lods.map( vertexCount )[ 1 ] ).toBeLessThanOrEqual( 154 );
		expect( lods.map( vertexCount )[ 2 ] ).toBeLessThanOrEqual( 50 );
		expect( triangleCount( lods[ 0 ]! ) ).toBeGreaterThan( triangleCount( lods[ 1 ]! ) );
		expect( triangleCount( lods[ 1 ]! ) ).toBeGreaterThan( triangleCount( lods[ 2 ]! ) );

	} );

	it( 'unwraps longitude seams so shell triangles use a short U interval', () => {

		const data = generateRockData( { seed: 5 } );

		for ( const mesh of data.lods.slice( 0, 3 ) ) {

			for ( let index = 0; index < mesh.indices.length; index += 3 ) {

				const u0 = mesh.uvs[ mesh.indices[ index ]! * 2 ]!;
				const u1 = mesh.uvs[ mesh.indices[ index + 1 ]! * 2 ]!;
				const u2 = mesh.uvs[ mesh.indices[ index + 2 ]! * 2 ]!;
				const y0 = mesh.positions[ mesh.indices[ index ]! * 3 + 1 ]!;
				const y1 = mesh.positions[ mesh.indices[ index + 1 ]! * 3 + 1 ]!;
				const y2 = mesh.positions[ mesh.indices[ index + 2 ]! * 3 + 1 ]!;

				if ( Math.min( y0, y1, y2 ) < data.bounds.height * 0.08 || Math.max( y0, y1, y2 ) > data.bounds.height * 0.92 ) continue;

				expect( Math.max( u0, u1, u2 ) - Math.min( u0, u1, u2 ) ).toBeLessThanOrEqual( 0.5 );

			}

		}

	} );

	it( 'keeps LOD1 and LOD2 silhouettes close to LOD0 from the side and top', () => {

		const data = generateRockData( { seed: 7 } );

		for ( const topDown of [ false, true ] ) {

			const lod0 = renderCoverage( data, 0, topDown );

			for ( const lod of [ 1, 2 ] ) {

				const lodCoverage = renderCoverage( data, lod, topDown );
				expect( coverageIou( lod0, lodCoverage, 0 ) ).toBeGreaterThan( 0.65 );

			}

		}

	} );

	it( 'builds a closed LOD2-like collider under the reference limits', () => {

		const collider = generateRockData( { seed: 8 } ).collider!;

		expect( collider.positions.length / 3 ).toBeLessThanOrEqual( 50 );
		expect( collider.indices.length / 3 ).toBeLessThanOrEqual( 96 );
		expect( boundaryEdgeCount( collider.positions, collider.indices ) ).toBe( 0 );

	} );

	it( 'generates a grayscale-blue albedo and normalized tangent-space normal texture', () => {

		const data = generateRockData( { seed: 9 } );
		const part = data.parts[ 0 ]!;
		const albedo = data.textures[ part.texture! ]!;
		const normal = data.textures[ part.normalTexture! ]!;

		expect( part.roughness ).toBe( 0.9 );
		expect( part.flatShading ).toBe( true );
		expect( part.specularIntensity ).toBeCloseTo( 0.014872 );
		expect( part.ior ).toBeCloseTo( 1.05 );
		expect( albedo.width ).toBeGreaterThanOrEqual( 64 );
		expect( normal.data ).toHaveLength( normal.width * normal.height * 4 );

		let averageRed = 0;
		let averageGreen = 0;
		let averageBlue = 0;

		for ( let offset = 0; offset < albedo.data.length; offset += 4 ) {

			averageRed += albedo.data[ offset ]!;
			averageGreen += albedo.data[ offset + 1 ]!;
			averageBlue += albedo.data[ offset + 2 ]!;

		}

		const pixelCount = albedo.width * albedo.height;
		expect( averageBlue / pixelCount ).toBeGreaterThan( averageRed / pixelCount );
		expect( averageGreen / pixelCount ).toBeGreaterThan( averageRed / pixelCount );

		for ( let offset = 0; offset < normal.data.length; offset += 4 ) {

			const x = normal.data[ offset ]! / 127.5 - 1;
			const y = normal.data[ offset + 1 ]! / 127.5 - 1;
			const z = normal.data[ offset + 2 ]! / 127.5 - 1;
			expect( Math.hypot( x, y, z ) ).toBeGreaterThan( 0.98 );
			expect( Math.hypot( x, y, z ) ).toBeLessThan( 1.02 );
			expect( normal.data[ offset + 3 ] ).toBe( 255 );

		}

	} );

	it( 'responds to size and flatness and rejects invalid dimensions', () => {

		const round = generateRockData( { size: 6, flatness: 0 } );
		const flat = generateRockData( { size: 6, flatness: 1 } );
		expect( flat.bounds.height ).toBeLessThan( round.bounds.height );
		expect( generateRockData( { size: 8 } ).bounds.radius ).toBeGreaterThan( round.bounds.radius );
		expect( () => generateRockData( { size: 0 } ) ).toThrow( RangeError );
		expect( () => generateRockData( { roughness: Number.NaN } ) ).toThrow( RangeError );

	} );

	it( 'generates and textures within the 50 ms budget after warm-up', () => {

		generateRockData( { seed: 1 } );
		const samples: number[] = [];

		for ( let iteration = 0; iteration < 5; iteration ++ ) {

			const start = performance.now();
			generateRockData( { seed: iteration + 1 } );
			samples.push( performance.now() - start );

		}

		samples.sort( ( a, b ) => a - b );
		expect( samples[ 2 ] ).toBeLessThan( 50 );
		expect( samples[ 4 ] ).toBeLessThan( 50 );

	} );

} );
