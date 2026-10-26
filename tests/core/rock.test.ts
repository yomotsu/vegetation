import { describe, expect, it } from 'vitest';
import { bakeImpostor, generateRockData, hexToLinear } from '../../src/core';
import type { MeshData } from '../../src/core';
import { createRockTextures } from '../../src/core/rockTexture';
import { validateMeshData } from '../helpers/validateMeshData';

function triangleCount( mesh: MeshData ): number {

	return mesh.indices.length / 3;

}

function vertexCount( mesh: MeshData ): number {

	return mesh.positions.length / 3;

}

function getDimensions( mesh: MeshData ): { width: number; height: number; depth: number } {

	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];

	for ( let index = 0; index < mesh.positions.length; index += 3 ) {

		for ( let axis = 0; axis < 3; axis ++ ) {

			minimum[ axis ] = Math.min( minimum[ axis ]!, mesh.positions[ index + axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, mesh.positions[ index + axis ]! );

		}

	}

	return {
		width: maximum[ 0 ]! - minimum[ 0 ]!,
		height: maximum[ 1 ]! - minimum[ 1 ]!,
		depth: maximum[ 2 ]! - minimum[ 2 ]!,
	};

}

function getAboveGroundDimensions( mesh: MeshData ): { width: number; height: number; depth: number; minimumY: number } {

	const points: [ number, number, number ][] = [];
	const addPoint = ( index: number ): void => {

		const offset = index * 3;
		points.push( [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ] );

	};

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = triangle[ edge ]!;
			const second = triangle[ ( edge + 1 ) % 3 ]!;
			const firstOffset = first * 3;
			const secondOffset = second * 3;
			const firstY = mesh.positions[ firstOffset + 1 ]!;
			const secondY = mesh.positions[ secondOffset + 1 ]!;

			if ( firstY >= 0 ) addPoint( first );

			if ( ( firstY < 0 && secondY > 0 ) || ( firstY > 0 && secondY < 0 ) ) {

				const amount = - firstY / ( secondY - firstY );
				points.push( [
					mesh.positions[ firstOffset ]! + ( mesh.positions[ secondOffset ]! - mesh.positions[ firstOffset ]! ) * amount,
					0,
					mesh.positions[ firstOffset + 2 ]! + ( mesh.positions[ secondOffset + 2 ]! - mesh.positions[ firstOffset + 2 ]! ) * amount,
				] );

			}

		}

	}

	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];

	for ( const point of points ) {

		for ( let axis = 0; axis < 3; axis ++ ) {

			minimum[ axis ] = Math.min( minimum[ axis ]!, point[ axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, point[ axis ]! );

		}

	}

	return {
		width: maximum[ 0 ]! - minimum[ 0 ]!,
		height: maximum[ 1 ]!,
		depth: maximum[ 2 ]! - minimum[ 2 ]!,
		minimumY: minimum[ 1 ]!,
	};

}

function meanRgb( data: Uint8Array ): [ number, number, number ] {

	const mean: [ number, number, number ] = [ 0, 0, 0 ];
	const pixelCount = data.length / 4;

	for ( let offset = 0; offset < data.length; offset += 4 ) {

		mean[ 0 ] += data[ offset ]!;
		mean[ 1 ] += data[ offset + 1 ]!;
		mean[ 2 ] += data[ offset + 2 ]!;

	}

	return mean.map( ( value ) => value / pixelCount ) as [ number, number, number ];

}

function percentile( data: Uint8Array, channel: number, amount: number ): number {

	const values: number[] = [];

	for ( let offset = channel; offset < data.length; offset += 4 ) {

		values.push( data[ offset ]! );

	}

	values.sort( ( a, b ) => a - b );

	return values[ Math.floor( ( values.length - 1 ) * amount ) ]!;

}

function meanNeighborDelta( data: Uint8Array, width: number, height: number ): number {

	let delta = 0;
	let samples = 0;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			const index = ( y * width + x ) * 4;
			const right = ( y * width + ( x + 1 ) % width ) * 4;
			const down = Math.min( y + 1, height - 1 ) * width * 4 + x * 4;

			for ( let channel = 0; channel < 3; channel ++ ) {

				delta += Math.abs( data[ index + channel ]! - data[ right + channel ]! );
				delta += Math.abs( data[ index + channel ]! - data[ down + channel ]! );
				samples += 2;

			}

		}

	}

	return delta / samples;

}

function rowStripeAmplitude( data: Uint8Array, width: number, height: number, cycles: number ): number {

	const rows = new Float64Array( height );
	let overall = 0;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			const offset = ( y * width + x ) * 4;
			const luminance = ( data[ offset ]! + data[ offset + 1 ]! + data[ offset + 2 ]! ) / 3;
			rows[ y ] = rows[ y ]! + luminance / width;
			overall += luminance / ( width * height );

		}

	}

	let cosine = 0;
	let sine = 0;

	for ( let y = 0; y < rows.length; y ++ ) {

		const angle = y / height * Math.PI * 2 * cycles;
		cosine += ( rows[ y ]! - overall ) * Math.cos( angle );
		sine += ( rows[ y ]! - overall ) * Math.sin( angle );

	}

	return Math.hypot( cosine, sine ) * 2 / height;

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

	it( 'uses shared smooth normals for each shell LOD', () => {

		const data = generateRockData( { seed: 6 } );

		expect( data.parts[ 0 ]!.flatShading ).toBe( false );

		for ( const mesh of data.lods.slice( 0, 3 ) ) {

			expect( vertexCount( mesh ) ).toBeLessThan( triangleCount( mesh ) * 2 );

			const normalsByPosition = new Map<string, number[]>();

			for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

				const offset = vertex * 3;
				const positionKey = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ].map( ( value ) => value.toFixed( 6 ) ).join( ',' );
				const normal = [ mesh.normals[ offset ]!, mesh.normals[ offset + 1 ]!, mesh.normals[ offset + 2 ]! ];
				const existing = normalsByPosition.get( positionKey );

				if ( existing !== undefined ) {
					expect( normal[ 0 ] ).toBeCloseTo( existing[ 0 ]!, 5 );
					expect( normal[ 1 ] ).toBeCloseTo( existing[ 1 ]!, 5 );
					expect( normal[ 2 ] ).toBeCloseTo( existing[ 2 ]!, 5 );
				} else {
					normalsByPosition.set( positionKey, normal );
				}

			}

		}

	} );

	it( 'uses reference-like chunky and low silhouettes across default seeds', () => {

		const samples = Array.from( { length: 12 }, ( _, index ) => {

			const data = generateRockData( { seed: index + 1 } );
			const dimensions = getDimensions( data.lods[ 0 ]! );

			return {
				data,
				dimensions,
				ratio: dimensions.height / Math.max( dimensions.width, dimensions.depth ),
			};

		} );
		const chunky = samples.filter( ( sample ) => sample.ratio > 0.65 );
		const low = samples.filter( ( sample ) => sample.ratio < 0.55 );
		const seedOne = samples[ 0 ]!;
		const seedTwo = samples[ 1 ]!;
		let groundVertices = 0;

		for ( let index = 1; index < seedTwo.data.lods[ 0 ]!.positions.length; index += 3 ) {

			if ( seedTwo.data.lods[ 0 ]!.positions[ index ]! <= 0.01 ) groundVertices ++;

		}

		expect( seedOne.ratio ).toBeGreaterThan( 0.65 );
		expect( seedOne.ratio ).toBeLessThan( 1 );
		expect( seedTwo.ratio ).toBeGreaterThan( 0.3 );
		expect( seedTwo.ratio ).toBeLessThan( 0.55 );
		expect( chunky.length ).toBeGreaterThanOrEqual( 4 );
		expect( low.length ).toBeGreaterThanOrEqual( 4 );
		expect( groundVertices ).toBeGreaterThanOrEqual( 8 );

		for ( const sample of samples ) {

			const horizontalAspect = Math.max( sample.dimensions.width, sample.dimensions.depth ) / Math.min( sample.dimensions.width, sample.dimensions.depth );
			expect( sample.ratio ).toBeLessThan( 1 );
			expect( horizontalAspect ).toBeLessThan( 1.3 );

		}

	} );

	it( 'sinks a seeded lower section below ground while keeping a shallow skirt', () => {

		for ( const seed of [ 1, 2, 7, 12 ] ) {

			const buried = generateRockData( { seed } );
			const full = generateRockData( { seed, burial: 0 } );
			const visible = getAboveGroundDimensions( buried.lods[ 0 ]! );
			const minimumY = Math.min( ...Array.from( buried.lods[ 0 ]!.positions ).filter( ( _, index ) => index % 3 === 1 ) );
			const burialRatio = 1 - buried.bounds.height / full.bounds.height;

			expect( burialRatio ).toBeGreaterThanOrEqual( 0.4 );
			expect( burialRatio ).toBeLessThanOrEqual( 0.55 );
			expect( visible.minimumY ).toBe( 0 );
			expect( buried.bounds.height ).toBeCloseTo( visible.height, 5 );
			expect( minimumY ).toBeGreaterThanOrEqual( - full.bounds.height * 0.151 );
			expect( minimumY ).toBeLessThan( 0 );
			expect( Math.min( ...Array.from( buried.collider!.positions ).filter( ( _, index ) => index % 3 === 1 ) ) ).toBeGreaterThanOrEqual( - full.bounds.height * 0.151 );

		}

		const unburied = generateRockData( { seed: 1, burial: 0 } );
		const quarterBuried = generateRockData( { seed: 1, burial: 0.2 } );
		expect( quarterBuried.bounds.height / unburied.bounds.height ).toBeCloseTo( 0.8, 1 );

	} );

	it( 'matches the reference above-ground size profiles and validates burial', () => {

		const rockOne = generateRockData( { seed: 1 } );
		const rockTwo = generateRockData( { seed: 2 } );
		const rockOneBounds = getAboveGroundDimensions( rockOne.lods[ 0 ]! );
		const rockTwoBounds = getAboveGroundDimensions( rockTwo.lods[ 0 ]! );

		expect( rockOneBounds.width ).toBeGreaterThanOrEqual( 5.4 );
		expect( rockOneBounds.width ).toBeLessThanOrEqual( 7.2 );
		expect( rockOneBounds.depth ).toBeGreaterThanOrEqual( 5.5 );
		expect( rockOneBounds.height ).toBeGreaterThanOrEqual( 3.3 );
		expect( rockOneBounds.height ).toBeLessThanOrEqual( 4.9 );
		expect( rockTwoBounds.width ).toBeGreaterThanOrEqual( 8.2 );
		expect( rockTwoBounds.width ).toBeLessThanOrEqual( 10.5 );
		expect( rockTwoBounds.depth ).toBeGreaterThanOrEqual( 7.9 );
		expect( rockTwoBounds.depth ).toBeLessThanOrEqual( 10.9 );
		expect( rockTwoBounds.height ).toBeGreaterThanOrEqual( 2.8 );
		expect( rockTwoBounds.height ).toBeLessThanOrEqual( 4.2 );
		expect( () => generateRockData( { burial: - 0.01 } ) ).toThrow( RangeError );
		expect( () => generateRockData( { burial: 1.01 } ) ).toThrow( RangeError );
		expect( () => generateRockData( { burial: Number.NaN } ) ).toThrow( RangeError );

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
		expect( part.flatShading ).toBe( false );
		expect( part.specularIntensity ).toBeCloseTo( 0.014872 );
		expect( part.ior ).toBeCloseTo( 1.05 );
		expect( albedo.width ).toBeGreaterThanOrEqual( 64 );
		expect( normal.data ).toHaveLength( normal.width * normal.height * 4 );
		const albedoMean = meanRgb( albedo.data );
		const normalMean = meanRgb( normal.data );

		expect( Math.abs( albedoMean[ 0 ] - 80.31 ) ).toBeLessThanOrEqual( 8 );
		expect( Math.abs( albedoMean[ 1 ] - 95.08 ) ).toBeLessThanOrEqual( 8 );
		expect( Math.abs( albedoMean[ 2 ] - 102.47 ) ).toBeLessThanOrEqual( 8 );
		expect( meanNeighborDelta( albedo.data, albedo.width, albedo.height ) ).toBeLessThan( 2 );
		expect( meanNeighborDelta( albedo.data, albedo.width, albedo.height ) ).toBeGreaterThan( 0.6 );
		expect( rowStripeAmplitude( albedo.data, albedo.width, albedo.height, 5 ) ).toBeLessThan( 2.5 );
		expect( percentile( albedo.data, 0, 0.1 ) ).toBeLessThan( 72 );
		expect( percentile( albedo.data, 0, 0.9 ) ).toBeGreaterThan( 88 );
		expect( percentile( normal.data, 0, 0.9 ) - percentile( normal.data, 0, 0.1 ) ).toBeGreaterThan( 35 );
		expect( normalMean[ 2 ] ).toBeGreaterThan( 220 );
		expect( normalMean[ 2 ] ).toBeLessThan( 246 );

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

	it( 'uses repeat-wrapped plate textures with reference crack coverage and UV density', () => {

		const textures = createRockTextures( 9 );
		const rock = generateRockData( { seed: 9 } );
		const lowPixels = [ 0, 0, 0 ];
		let lowPixelCount = 0;
		let edgeDifference = 0;

		expect( textures.albedo.wrap ).toBe( 'repeat' );
		expect( textures.normal.wrap ).toBe( 'repeat' );

		for ( let offset = 0; offset < textures.albedo.data.length; offset += 4 ) {

			const luminance = ( textures.albedo.data[ offset ]! + textures.albedo.data[ offset + 1 ]! + textures.albedo.data[ offset + 2 ]! ) / 3;

			if ( luminance >= 80 ) continue;

			lowPixelCount ++;
			lowPixels[ 0 ]! += textures.albedo.data[ offset ]!;
			lowPixels[ 1 ]! += textures.albedo.data[ offset + 1 ]!;
			lowPixels[ 2 ]! += textures.albedo.data[ offset + 2 ]!;

		}

		const lowPixelCoverage = lowPixelCount / ( textures.albedo.width * textures.albedo.height );
		const lowPixelMean = lowPixels.map( ( value ) => value / lowPixelCount );

		for ( let position = 0; position < textures.albedo.width; position ++ ) {

			const top = position * 4;
			const bottom = ( ( textures.albedo.height - 1 ) * textures.albedo.width + position ) * 4;
			const left = position * textures.albedo.width * 4;
			const right = left + ( textures.albedo.width - 1 ) * 4;

			for ( let channel = 0; channel < 3; channel ++ ) {

				edgeDifference += Math.abs( textures.albedo.data[ top + channel ]! - textures.albedo.data[ bottom + channel ]! );
				edgeDifference += Math.abs( textures.albedo.data[ left + channel ]! - textures.albedo.data[ right + channel ]! );

			}

		}

		const meanEdgeDifference = edgeDifference / ( textures.albedo.width * 6 );

		expect( lowPixelCoverage ).toBeGreaterThanOrEqual( 0.075 );
		expect( lowPixelCoverage ).toBeLessThanOrEqual( 0.14 );
		expect( meanEdgeDifference ).toBeLessThan( 3 );
		expect( Math.abs( lowPixelMean[ 0 ]! - 65.52 ) ).toBeLessThanOrEqual( 8 );
		expect( Math.abs( lowPixelMean[ 1 ]! - 77.95 ) ).toBeLessThanOrEqual( 8 );
		expect( Math.abs( lowPixelMean[ 2 ]! - 84.21 ) ).toBeLessThanOrEqual( 8 );

		const mesh = rock.lods[ 0 ]!;
		const uValues = Array.from( mesh.uvs ).filter( ( _, index ) => index % 2 === 0 );
		const vValues = Array.from( mesh.uvs ).filter( ( _, index ) => index % 2 === 1 );
		const uRange = Math.max( ...uValues ) - Math.min( ...uValues );
		const vRange = Math.max( ...vValues ) - Math.min( ...vValues );

		expect( uRange ).toBeGreaterThanOrEqual( 1.5 );
		expect( uRange ).toBeLessThanOrEqual( 2.5 );
		expect( vRange ).toBeGreaterThanOrEqual( 1.5 );
		expect( vRange ).toBeLessThanOrEqual( 2.5 );

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
