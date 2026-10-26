import { describe, expect, it } from 'vitest';
import { bakeImpostor, generateRockData, hexToLinear } from '../../src/core';
import type { MeshData } from '../../src/core';
import { createRockTextures } from '../../src/core/rockTexture';
import { sampleOutlineRadius } from '../helpers/meshOutline';
import { withSharedRockTextures } from '../helpers/sharedRockTextures';
import { validateMeshData } from '../helpers/validateMeshData';
import { topCardCoverageIou } from '../helpers/topCardCoverage';
import { minimumRockApexAngle } from '../helpers/rockSharpness';

function triangleCount( mesh: MeshData ): number {

	return mesh.indices.length / 3;

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

function getShapeMetrics( mesh: MeshData ): { ratio: number; sideWallVerticality: number; roundness: number } {

	const dimensions = getAboveGroundDimensions( mesh );
	const ratio = dimensions.height / Math.max( dimensions.width, dimensions.depth );
	const roundness = Math.min( dimensions.width, dimensions.depth ) / Math.max( dimensions.width, dimensions.depth );
	const sideWalls: number[] = [];

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const first = mesh.indices[ index ]! * 3;
		const second = mesh.indices[ index + 1 ]! * 3;
		const third = mesh.indices[ index + 2 ]! * 3;
		const firstY = mesh.positions[ first + 1 ]!;
		const secondY = mesh.positions[ second + 1 ]!;
		const thirdY = mesh.positions[ third + 1 ]!;
		const centerY = ( firstY + secondY + thirdY ) / 3;

		if ( centerY <= 0 || centerY >= dimensions.height * 0.85 ) continue;

		const abX = mesh.positions[ second ]! - mesh.positions[ first ]!;
		const abY = secondY - firstY;
		const abZ = mesh.positions[ second + 2 ]! - mesh.positions[ first + 2 ]!;
		const acX = mesh.positions[ third ]! - mesh.positions[ first ]!;
		const acY = thirdY - firstY;
		const acZ = mesh.positions[ third + 2 ]! - mesh.positions[ first + 2 ]!;
		const normalY = Math.abs( abZ * acX - abX * acZ );
		const normalLength = Math.hypot( abY * acZ - abZ * acY, normalY, abX * acY - abY * acX ) || 1;

		sideWalls.push( 1 - normalY / normalLength );

	}

	sideWalls.sort( ( first, second ) => first - second );

	return {
		ratio,
		sideWallVerticality: sideWalls[ Math.floor( ( sideWalls.length - 1 ) * 0.9 ) ]!,
		roundness,
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

function hashBytes( data: Uint8Array ): number {

	let hash = 2166136261;
	for ( let index = 0; index < data.length; index ++ ) hash = Math.imul( hash ^ data[ index ]!, 16777619 );
	return hash >>> 0;

}

function percentile( data: Uint8Array, channel: number, amount: number ): number {

	const values: number[] = [];

	for ( let offset = channel; offset < data.length; offset += 4 ) {

		values.push( data[ offset ]! );

	}

	values.sort( ( a, b ) => a - b );

	return values[ Math.floor( ( values.length - 1 ) * amount ) ]!;

}

function meanNeighborDelta( data: Uint8Array, width: number, height: number, step = 1 ): number {

	let delta = 0;
	let samples = 0;

	for ( let y = 0; y < height; y += step ) {

		for ( let x = 0; x < width; x += step ) {

			const index = ( y * width + x ) * 4;
			const right = ( y * width + ( x + step ) % width ) * 4;
			const down = Math.min( y + step, height - 1 ) * width * 4 + x * 4;

			for ( let channel = 0; channel < 3; channel ++ ) {

				delta += Math.abs( data[ index + channel ]! - data[ right + channel ]! );
				delta += Math.abs( data[ index + channel ]! - data[ down + channel ]! );
				samples += 2;

			}

		}

	}

	return delta / samples;

}

function tileTextureContrasts( data: Uint8Array, width: number, tileSize: number ): number[] {

	const tileCount = width / tileSize;
	const totals = new Float64Array( tileCount * tileCount );
	const counts = new Uint32Array( tileCount * tileCount );
	const luminanceAt = ( x: number, y: number ): number => {

		const offset = ( y * width + x ) * 4;
		return ( data[ offset ]! + data[ offset + 1 ]! + data[ offset + 2 ]! ) / 3;

	};

	for ( let y = 0; y < width; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			const tileX = Math.floor( x / tileSize );
			const tileY = Math.floor( y / tileSize );
			const tile = tileY * tileCount + tileX;
			const current = luminanceAt( x, y );

			if ( x + 1 < ( tileX + 1 ) * tileSize ) {
				totals[ tile ]! += Math.abs( current - luminanceAt( x + 1, y ) );
				counts[ tile ]! ++;
			}

			if ( y + 1 < ( tileY + 1 ) * tileSize ) {
				totals[ tile ]! += Math.abs( current - luminanceAt( x, y + 1 ) );
				counts[ tile ]! ++;
			}

		}

	}

	return Array.from( totals, ( total, index ) => total / counts[ index ]! );

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

function darkPixelComponents( data: Uint8Array, width: number, threshold: number ): { coverage: number; count: number; largest: number; span: number } {

	const pixelCount = width * width;
	const visited = new Uint8Array( pixelCount );
	const queue = new Int32Array( pixelCount );
	let darkPixels = 0;
	let count = 0;
	let largest = 0;
	let span = 0;

	for ( let index = 0; index < pixelCount; index ++ ) {

		const offset = index * 4;
		const luminance = ( data[ offset ]! + data[ offset + 1 ]! + data[ offset + 2 ]! ) / 3;

		if ( luminance < threshold ) darkPixels ++;

	}

	for ( let start = 0; start < pixelCount; start ++ ) {

		const startOffset = start * 4;
		const startLuminance = ( data[ startOffset ]! + data[ startOffset + 1 ]! + data[ startOffset + 2 ]! ) / 3;

		if ( visited[ start ] || startLuminance >= threshold ) continue;

		let readIndex = 0;
		let writeIndex = 0;
		let minimumX = width;
		let maximumX = 0;
		let minimumY = width;
		let maximumY = 0;
		queue[ writeIndex ++ ] = start;
		visited[ start ] = 1;

		while ( readIndex < writeIndex ) {

			const index = queue[ readIndex ++ ]!;
			const x = index % width;
			const y = Math.floor( index / width );
			minimumX = Math.min( minimumX, x );
			maximumX = Math.max( maximumX, x );
			minimumY = Math.min( minimumY, y );
			maximumY = Math.max( maximumY, y );
			const neighbors = [
				y > 0 ? index - width : - 1,
				y + 1 < width ? index + width : - 1,
				x > 0 ? index - 1 : - 1,
				x + 1 < width ? index + 1 : - 1,
			];

			for ( const neighbor of neighbors ) {

				if ( neighbor < 0 || visited[ neighbor ] ) continue;

				const offset = neighbor * 4;
				const luminance = ( data[ offset ]! + data[ offset + 1 ]! + data[ offset + 2 ]! ) / 3;

				if ( luminance < threshold ) {

					visited[ neighbor ] = 1;
					queue[ writeIndex ++ ] = neighbor;

				}

			}

		}

		largest = Math.max( largest, writeIndex );
		span = Math.max( span, Math.hypot( maximumX - minimumX + 1, maximumY - minimumY + 1 ) / width );
		if ( writeIndex >= 20 * pixelCount / ( 256 * 256 ) ) count ++;

	}

	return { coverage: darkPixels / pixelCount, count, largest: largest / pixelCount, span };

}

function getSurfaceStats( mesh: MeshData ): { relief: number; percentileRelief: number; spacing: number } {

	const groups = new Map<string, number>();
	const vertexGroups = new Int32Array( vertexCount( mesh ) );
	const positions: [ number, number, number ][] = [];
	const neighbors: Set<number>[] = [];

	for ( let vertex = 0; vertex < vertexGroups.length; vertex ++ ) {

		const offset = vertex * 3;
		const position: [ number, number, number ] = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		const key = position.map( ( value ) => value.toFixed( 6 ) ).join( ',' );
		let group = groups.get( key );

		if ( group === undefined ) {

			group = positions.length;
			groups.set( key, group );
			positions.push( position );
			neighbors.push( new Set<number>() );

		}

		vertexGroups[ vertex ] = group;

	}

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const first = vertexGroups[ mesh.indices[ index ]! ]!;
		const second = vertexGroups[ mesh.indices[ index + 1 ]! ]!;
		const third = vertexGroups[ mesh.indices[ index + 2 ]! ]!;
		neighbors[ first ]!.add( second );
		neighbors[ first ]!.add( third );
		neighbors[ second ]!.add( first );
		neighbors[ second ]!.add( third );
		neighbors[ third ]!.add( first );
		neighbors[ third ]!.add( second );

	}

	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];

	for ( const position of positions ) {

		for ( let axis = 0; axis < 3; axis ++ ) {

			minimum[ axis ] = Math.min( minimum[ axis ]!, position[ axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, position[ axis ]! );

		}

	}

	const size = Math.max( maximum[ 0 ]! - minimum[ 0 ]!, maximum[ 1 ]! - minimum[ 1 ]!, maximum[ 2 ]! - minimum[ 2 ]! );
	const deviations: number[] = [];
	const spacings: number[] = [];

	for ( let vertex = 0; vertex < positions.length; vertex ++ ) {

		const adjacent = [ ...neighbors[ vertex ]! ];
		const average: [ number, number, number ] = [ 0, 0, 0 ];

		for ( const neighbor of adjacent ) {

			average[ 0 ] += positions[ neighbor ]![ 0 ] / adjacent.length;
			average[ 1 ] += positions[ neighbor ]![ 1 ] / adjacent.length;
			average[ 2 ] += positions[ neighbor ]![ 2 ] / adjacent.length;
			spacings.push( Math.hypot(
				positions[ vertex ]![ 0 ] - positions[ neighbor ]![ 0 ],
				positions[ vertex ]![ 1 ] - positions[ neighbor ]![ 1 ],
				positions[ vertex ]![ 2 ] - positions[ neighbor ]![ 2 ],
			) / size );

		}

		deviations.push( Math.hypot(
			positions[ vertex ]![ 0 ] - average[ 0 ],
			positions[ vertex ]![ 1 ] - average[ 1 ],
			positions[ vertex ]![ 2 ] - average[ 2 ],
		) / size );

	}

	spacings.sort( ( first, second ) => first - second );
	deviations.sort( ( first, second ) => first - second );

	return {
		relief: deviations.reduce( ( total, value ) => total + value, 0 ) / deviations.length,
		percentileRelief: deviations[ Math.floor( ( deviations.length - 1 ) * 0.95 ) ]!,
		spacing: spacings[ Math.floor( spacings.length / 2 ) ]!,
	};

}

// LOD0の隣接頂点平均からの距離を最大寸法で割って全頂点平均し、隣接辺長の中央値も測定した。
const ROCK_SURFACE_STATS = [
	{ seed: 1, relief: 0.04701, spacing: 0.17087 },
	{ seed: 2, relief: 0.03807, spacing: 0.16114 },
];

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

function expectGroundPerimeter( mesh: MeshData, size: number, seed: number, lod: number ): number[] {

	const outline: number[] = [];

	for ( let sample = 0; sample < 72; sample ++ ) {

		const angle = sample / 72 * Math.PI * 2;
		const groundRadius = sampleOutlineRadius( mesh, 0, angle );
		const skirtRadius = sampleOutlineRadius( mesh, - 0.02 * size, angle );
		expect( groundRadius, `seed ${ seed } LOD${ lod } y=0 outline sample ${ sample }` ).toBeGreaterThan( 0 );
		expect( skirtRadius, `seed ${ seed } LOD${ lod } below-ground outline sample ${ sample }` ).toBeGreaterThanOrEqual( groundRadius * 0.65 );
		outline.push( groundRadius );

	}

	return outline;

}

function renderCoverage( data: ReturnType<typeof generateRockData>, lod: number, topDown = false ) {

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

	it( 'keeps every rock LOD grounded around its full footprint', () => {

		withSharedRockTextures( () => {

			const seeds = [ 341810, ...Array.from( { length: 200 }, ( _, index ) => index + 1 ), 987654321, 2147483647, - 1987654321 ];

			for ( const seed of seeds ) {

				const data = generateRockData( { seed, size: 6.4 } );
				const lod0Outline = expectGroundPerimeter( data.lods[ 0 ]!, 6.4, seed, 0 );

				for ( let lod = 1; lod <= 3; lod ++ ) {

					const outline = expectGroundPerimeter( data.lods[ lod ]!, 6.4, seed, lod );

					if ( lod === 3 ) {

						for ( let sample = 0; sample < outline.length; sample ++ ) {
							expect( Math.abs( outline[ sample ]! - lod0Outline[ sample ]! ), `seed ${ seed } LOD3 footprint sample ${ sample }` ).toBeLessThanOrEqual( 6.4 * 0.2 );
						}

					}

				}

			}

		} );

	}, 120000 );

	it( 'keeps above-ground rock vertices broader than a 100 degree cone', () => {

		withSharedRockTextures( () => {

			const seeds = [ ...Array.from( { length: 300 }, ( _, index ) => index + 1 ), 341810, 987654321, 2147483647, - 1987654321 ];

			for ( const seed of seeds ) {

				const lods = generateRockData( { seed, size: 6.4 } ).lods;

				for ( let lod = 0; lod <= 3; lod ++ ) {

					const angle = minimumRockApexAngle( lods[ lod ]! );
					expect( angle, `seed ${ seed } LOD${ lod } narrowest vertex cone` ).toBeGreaterThanOrEqual( 100 );

				}

			}

		} );

	}, 180000 );

	it( 'builds mesh LOD0–3 with an open LOD3 base and keeps LOD4 as a billboard', () => {

		const data = generateRockData( { seed: 4 } );

		expect( data.kind ).toBe( 'rock' );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( [ 'rock', 'impostor' ] );
		expect( Object.keys( data.textures ) ).toEqual( [ 'albedo', 'normal' ] );
		expect( vertexCount( data.lods[ 3 ]! ) ).toBeGreaterThanOrEqual( 12 );
		expect( vertexCount( data.lods[ 3 ]! ) ).toBeLessThanOrEqual( 16 );
		expect( vertexCount( data.lods[ 4 ]! ) ).toBe( 8 );
		expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 4 );
		expect( data.lods[ 4 ]!.groups[ 0 ]!.partIndex ).toBe( 1 );
		expect( boundaryEdgeCount( data.lods[ 3 ]!.positions, data.lods[ 3 ]!.indices ) ).toBe( 8 );
		for ( const mesh of data.lods.slice( 0, 3 ) ) {

			const minimumY = Math.min( ...Array.from( mesh.positions ).filter( ( _, index ) => index % 3 === 1 ) );
			for ( let index = 0; index < mesh.indices.length; index += 3 ) {
				const y = [ 0, 1, 2 ].map( ( corner ) => mesh.positions[ mesh.indices[ index + corner ]! * 3 + 1 ]! );
				expect( y.every( ( value ) => value <= minimumY + 1e-6 ) ).toBe( false );
			}

		}
		for ( let lod = 0; lod < data.lods.length - 1; lod ++ ) {

			expect( vertexCount( data.lods[ lod ]! ) ).toBeGreaterThan( vertexCount( data.lods[ lod + 1 ]! ) );
			expect( triangleCount( data.lods[ lod ]! ) ).toBeGreaterThan( triangleCount( data.lods[ lod + 1 ]! ) );

		}
		for ( const mesh of data.lods ) validateMeshData( mesh );

	} );

	it( 'matches the top-down LOD4 coverage to LOD0', () => {

		for ( const seed of [ 1, 4, 7 ] ) {

			const data = generateRockData( { seed } );

			expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 4 );
			expect( vertexCount( data.lods[ 4 ]! ) ).toBe( 8 );
			expect( triangleCount( data.lods[ 3 ]! ) ).toBeGreaterThan( triangleCount( data.lods[ 4 ]! ) );
			expect( topCardCoverageIou( data ) ).toBeGreaterThanOrEqual( 0.6 );

		}

	} );

	it( 'is deterministic for the same seed and changes shape for another seed', () => {

		const first = generateRockData( { seed: 23 } );
		const repeated = generateRockData( { seed: 23 } );
		const different = generateRockData( { seed: 24 } );

		expect( first.lods[ 0 ]!.positions ).toEqual( repeated.lods[ 0 ]!.positions );
		expect( hashBytes( first.textures.albedo!.data ) ).toBe( hashBytes( repeated.textures.albedo!.data ) );
		expect( first.lods[ 0 ]!.positions ).not.toEqual( different.lods[ 0 ]!.positions );

	} );

	it( 'keeps rock vertex tint uniform to prevent diagonal interpolation bands', () => {

		for ( const seed of [ 1, 2 ] ) {

			const data = generateRockData( { seed } );
			expect( meshColorSpread( data.lods[ 0 ]! ) ).toBeLessThan( 0.001 );

		}

	} );

	it( 'keeps the three shell LODs within vertex caps and strictly reduces triangle counts', () => {

		for ( const seed of [ 1, 2, 3 ] ) {

			const lods = generateRockData( { seed } ).lods;
			const vertices = lods.slice( 0, 3 ).map( vertexCount );
			const triangles = lods.map( triangleCount );
			expect( vertices[ 0 ] ).toBeLessThanOrEqual( 130 );
			expect( vertices[ 1 ] ).toBeLessThanOrEqual( 56 );
			expect( vertices[ 2 ] ).toBeLessThanOrEqual( 36 );
			expect( vertices[ 0 ] ).toBeGreaterThan( vertices[ 1 ]! );
			expect( vertices[ 1 ] ).toBeGreaterThan( vertices[ 2 ]! );
			for ( let lod = 0; lod < triangles.length - 1; lod ++ ) {

				expect( triangles[ lod ] ).toBeGreaterThan( triangles[ lod + 1 ]! );

			}

		}

	} );

	it( 'matches tuned LOD0 relief and bump spacing', () => {

		for ( const reference of ROCK_SURFACE_STATS ) {

			const mesh = generateRockData( { seed: reference.seed } ).lods[ 0 ]!;
			const stats = getSurfaceStats( mesh );

			expect( vertexCount( mesh ) ).toBeLessThanOrEqual( 130 );
			expect( stats.relief ).toBeGreaterThanOrEqual( reference.relief * 0.7 );
			expect( stats.relief ).toBeLessThanOrEqual( reference.relief * 1.4 );
			expect( stats.spacing ).toBeGreaterThanOrEqual( reference.spacing * 0.7 );
			expect( stats.spacing ).toBeLessThanOrEqual( reference.spacing * 1.4 );

		}

	} );

	it( 'keeps seed 2 relief as gentle bumps instead of stacked ledges', () => {

		const stats = getSurfaceStats( generateRockData( { seed: 2 } ).lods[ 0 ]! );

		expect( stats.percentileRelief ).toBeLessThan( 0.09 );

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

	it( 'keeps averaged rock vertex tint free of height gradients', () => {

		const data = generateRockData( { seed: 9 } );
		const mesh = data.lods[ 0 ]!;
		let upperColor = 0;
		let upperCount = 0;
		let lowerColor = 0;
		let lowerCount = 0;
		let minimumColor = Infinity;

		for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

			const color = mesh.colors[ vertex * 3 ]!;
			const y = mesh.positions[ vertex * 3 + 1 ]!;
			minimumColor = Math.min( minimumColor, color );

			if ( y > data.bounds.height * 0.7 ) {

				upperColor += color;
				upperCount ++;

			} else if ( y > 0 && y < data.bounds.height * 0.35 ) {

				lowerColor += color;
				lowerCount ++;

			}

		}

		expect( upperCount ).toBeGreaterThan( 0 );
		expect( lowerCount ).toBeGreaterThan( 0 );
		expect( upperColor / upperCount ).toBeCloseTo( lowerColor / lowerCount, 5 );
		expect( minimumColor ).toBeLessThan( 0.98 );
		expect( minimumColor ).toBeGreaterThan( 0.9 );

	} );

	it( 'uses a rounded seed 1 mound and varied silhouettes across seeds 2–5', () => {

		const samples = Array.from( { length: 5 }, ( _, index ) => getShapeMetrics( generateRockData( { seed: index + 1 } ).lods[ 0 ]! ) );
		const defaultRock = samples[ 0 ]!;
		const lowElongatedRock = samples.slice( 1 ).some( ( sample ) => sample.ratio < 0.65 && sample.roundness < 0.94 );
		const shapeSignatures = new Set( samples.slice( 1 ).map( ( sample ) => `${ sample.ratio.toFixed( 2 ) },${ sample.roundness.toFixed( 2 ) }` ) );

		for ( const sample of samples ) {

			expect( sample.ratio ).toBeGreaterThan( 0.3 );
			expect( sample.ratio ).toBeLessThan( 0.9 );
			expect( sample.sideWallVerticality ).toBeLessThan( 0.97 );
			expect( sample.roundness ).toBeGreaterThan( 0.77 );

		}

		expect( defaultRock.ratio ).toBeGreaterThanOrEqual( 0.55 );
		expect( defaultRock.ratio ).toBeLessThanOrEqual( 0.85 );
		expect( defaultRock.sideWallVerticality ).toBeLessThan( 0.9 );
		expect( defaultRock.roundness ).toBeGreaterThan( 0.77 );
		expect( lowElongatedRock ).toBe( true );
		expect( shapeSignatures.size ).toBeGreaterThanOrEqual( 3 );

	} );

	it( 'uses reference-like chunky and low silhouettes across default seeds', () => {

		withSharedRockTextures( () => {

			const samples = Array.from( { length: 12 }, ( _, index ) => {

				const data = generateRockData( { seed: index + 1 } );
				const dimensions = getAboveGroundDimensions( data.lods[ 0 ]! );

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

			expect( seedOne.ratio ).toBeGreaterThan( 0.55 );
			expect( seedOne.ratio ).toBeLessThan( 0.85 );
			expect( seedTwo.ratio ).toBeGreaterThan( 0.3 );
			expect( seedTwo.ratio ).toBeLessThan( 0.8 );
			expect( chunky.length ).toBeGreaterThanOrEqual( 2 );
			expect( low.length ).toBeGreaterThanOrEqual( 4 );
			expect( groundVertices ).toBeGreaterThanOrEqual( 8 );

			for ( const sample of samples ) {

				const horizontalAspect = Math.max( sample.dimensions.width, sample.dimensions.depth ) / Math.min( sample.dimensions.width, sample.dimensions.depth );
				expect( sample.ratio ).toBeLessThan( 1 );
				expect( horizontalAspect ).toBeLessThan( 1.4 );

			}

		} );

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

	it( 'matches salted above-ground size profiles and validates burial', () => {

		const rockOne = generateRockData( { seed: 1 } );
		const rockTwo = generateRockData( { seed: 2 } );
		const rockOneBounds = getAboveGroundDimensions( rockOne.lods[ 0 ]! );
		const rockTwoBounds = getAboveGroundDimensions( rockTwo.lods[ 0 ]! );

		expect( rockOneBounds.width ).toBeGreaterThanOrEqual( 5.4 );
		expect( rockOneBounds.width ).toBeLessThanOrEqual( 7.2 );
		expect( rockOneBounds.depth ).toBeGreaterThanOrEqual( 5.8 );
		expect( rockOneBounds.depth ).toBeLessThanOrEqual( 6.8 );
		expect( rockOneBounds.height ).toBeGreaterThanOrEqual( 3.3 );
		expect( rockOneBounds.height ).toBeLessThanOrEqual( 4.9 );
		expect( rockTwoBounds.width ).toBeGreaterThanOrEqual( 11.5 );
		expect( rockTwoBounds.width ).toBeLessThanOrEqual( 13 );
		expect( rockTwoBounds.depth ).toBeGreaterThanOrEqual( 10 );
		expect( rockTwoBounds.depth ).toBeLessThanOrEqual( 11.5 );
		expect( rockTwoBounds.height ).toBeGreaterThanOrEqual( 3.8 );
		expect( rockTwoBounds.height ).toBeLessThanOrEqual( 4.6 );
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

	it( 'keeps the low-poly LOD3 silhouette close to LOD0 from the side and top', () => {

		const data = generateRockData( { seed: 7 } );

		for ( const topDown of [ false, true ] ) {

			const lod0 = renderCoverage( data, 0, topDown );
			const lod = 3;

			const lodCoverage = renderCoverage( data, lod, topDown );
			const coverage = coverageIou( lod0, lodCoverage, 0 );
			expect( coverage, `LOD${ lod } ${ topDown ? 'top' : 'side' } coverage` ).toBeGreaterThanOrEqual( 0.75 );

			if ( ! topDown ) {

				const sourceColor = meanOpaqueRgb( lod0.data );
				const farColor = meanOpaqueRgb( lodCoverage.data );

				for ( let channel = 0; channel < 3; channel ++ ) {
					expect( Math.abs( sourceColor[ channel ]! - farColor[ channel ]! ), `LOD3 channel ${ channel } mean color` ).toBeLessThanOrEqual( 8 );
				}

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
		expect( meanNeighborDelta( albedo.data, albedo.width, albedo.height, albedo.width / 256 ) ).toBeLessThan( 2 );
		expect( meanNeighborDelta( albedo.data, albedo.width, albedo.height, albedo.width / 256 ) ).toBeGreaterThan( 0.6 );
		expect( rowStripeAmplitude( albedo.data, albedo.width, albedo.height, 5 ) ).toBeLessThan( 2.5 );
		expect( percentile( albedo.data, 0, 0.1 ) ).toBeLessThan( 75 );
		expect( percentile( albedo.data, 0, 0.9 ) ).toBeGreaterThan( 87 );
		expect( percentile( normal.data, 0, 0.9 ) - percentile( normal.data, 0, 0.1 ) ).toBeGreaterThan( 12 );
		expect( normalMean[ 2 ] ).toBeGreaterThan( 220 );
		expect( normalMean[ 2 ] ).toBeLessThan( 254 );

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

		let minimumNormalLength = Infinity;
		let maximumNormalLength = 0;
		let transparentNormalPixels = 0;

		for ( let offset = 0; offset < normal.data.length; offset += 4 ) {

			const x = normal.data[ offset ]! / 127.5 - 1;
			const y = normal.data[ offset + 1 ]! / 127.5 - 1;
			const z = normal.data[ offset + 2 ]! / 127.5 - 1;
			const length = Math.hypot( x, y, z );
			minimumNormalLength = Math.min( minimumNormalLength, length );
			maximumNormalLength = Math.max( maximumNormalLength, length );
			if ( normal.data[ offset + 3 ] !== 255 ) transparentNormalPixels ++;

		}

		expect( minimumNormalLength ).toBeGreaterThan( 0.98 );
		expect( maximumNormalLength ).toBeLessThan( 1.02 );
		expect( transparentNormalPixels ).toBe( 0 );

	} );

	it( 'keeps normalized rock features at 512 and 1024 pixels', () => {

		const defaultTextures = createRockTextures( 9 );
		const reference = createRockTextures( 9, 256 );
		const mediumResolution = createRockTextures( 9, 512 );
		let mediumAlbedoError = 0;
		let mediumNormalError = 0;
		let highAlbedoError = 0;
		let highNormalError = 0;
		let samples = 0;

		expect( defaultTextures.albedo.width ).toBe( 1024 );
		expect( defaultTextures.normal.width ).toBe( 1024 );
		expect( mediumResolution.albedo.width ).toBe( 512 );

		for ( let y = 8; y < 248; y += 8 ) {

			for ( let x = 8; x < 248; x += 8 ) {

				const lowOffset = ( y * 256 + x ) * 4;
				const mediumOffset = ( y * 2 * 512 + x * 2 ) * 4;
				const highOffset = ( y * 4 * 1024 + x * 4 ) * 4;

				for ( let channel = 0; channel < 3; channel ++ ) {

					mediumAlbedoError += Math.abs( reference.albedo.data[ lowOffset + channel ]! - mediumResolution.albedo.data[ mediumOffset + channel ]! );
					mediumNormalError += Math.abs( reference.normal.data[ lowOffset + channel ]! - mediumResolution.normal.data[ mediumOffset + channel ]! );
					highAlbedoError += Math.abs( reference.albedo.data[ lowOffset + channel ]! - defaultTextures.albedo.data[ highOffset + channel ]! );
					highNormalError += Math.abs( reference.normal.data[ lowOffset + channel ]! - defaultTextures.normal.data[ highOffset + channel ]! );

				}

				samples ++;

			}

		}

		expect( mediumAlbedoError / ( samples * 3 ) ).toBeLessThan( 2 );
		expect( mediumNormalError / ( samples * 3 ) ).toBeLessThan( 3 );
		expect( highAlbedoError / ( samples * 3 ) ).toBeLessThan( 2 );
		expect( highNormalError / ( samples * 3 ) ).toBeLessThan( 5 );

	} );

	it( 'uses one non-repeating stone surface with localized dark detail', () => {

		const textures = createRockTextures( 9 );
		const rock = generateRockData( { seed: 9 } );
		const darkRegions = darkPixelComponents( textures.albedo.data, textures.albedo.width, 68 );
		let edgeDifference = 0;

		expect( textures.albedo.wrap ).toBe( 'repeat' );
		expect( textures.normal.wrap ).toBe( 'repeat' );

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

		expect( darkRegions.coverage ).toBeGreaterThan( 0.002 );
		expect( darkRegions.coverage ).toBeLessThan( 0.06 );
		expect( darkRegions.count ).toBeLessThanOrEqual( 20 );
		expect( darkRegions.largest ).toBeLessThan( 0.025 );
		expect( meanEdgeDifference ).toBeLessThan( 3 );

		const mesh = rock.lods[ 0 ]!;
		const uValues = Array.from( mesh.uvs ).filter( ( _, index ) => index % 2 === 0 );
		const vValues = Array.from( mesh.uvs ).filter( ( _, index ) => index % 2 === 1 );
		const uRange = Math.max( ...uValues ) - Math.min( ...uValues );
		const vRange = Math.max( ...vValues ) - Math.min( ...vValues );

		expect( uRange ).toBeGreaterThanOrEqual( 0.9 );
		expect( uRange ).toBeLessThanOrEqual( 1.5 );
		expect( vRange ).toBeGreaterThanOrEqual( 0.45 );
		expect( vRange ).toBeLessThanOrEqual( 1.1 );

	} );

	it( 'localizes fine stone detail and avoids bold long cracks', () => {

		const rockOne = createRockTextures( 1 );
		const textures = createRockTextures( 2 );
		const contrasts = tileTextureContrasts( textures.albedo.data, textures.albedo.width, textures.albedo.width / 8 ).sort( ( first, second ) => first - second );
		const quietContrast = contrasts.slice( 0, 16 ).reduce( ( total, value ) => total + value, 0 ) / 16;
		const detailedContrast = contrasts.slice( - 16 ).reduce( ( total, value ) => total + value, 0 ) / 16;
		const rockOneDarkRegions = darkPixelComponents( rockOne.albedo.data, rockOne.albedo.width, 68 );
		const darkRegions = darkPixelComponents( textures.albedo.data, textures.albedo.width, 68 );

		expect( detailedContrast ).toBeGreaterThan( quietContrast * 1.2 );
		expect( rockOneDarkRegions.span ).toBeLessThan( 0.12 );
		expect( darkRegions.largest ).toBeLessThan( 0.01 );
		expect( darkRegions.span ).toBeLessThan( 0.12 );

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
			generateRockData( { seed: 1 } );
			samples.push( performance.now() - start );

		}

		samples.sort( ( a, b ) => a - b );
		expect( samples[ 2 ] ).toBeLessThan( 50 );
		expect( samples[ 4 ] ).toBeLessThan( 50 );

	} );

} );
