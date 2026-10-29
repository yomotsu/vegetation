import { describe, expect, it } from 'vitest';
import { bakeImpostor, generatePebblesData, generateRockData, hexToLinear } from '../../src/core';
import { createRockEdgeHighlightMap, createRockMossSurfaceSamples } from '../../src/core/rockTexture';
import { buildConvexHullFaces, buildRockHullMeshWithChamfers, createRockHullShape, isRockScoopInterior } from '../../src/core/rockGeometry';
import type { MeshData, VegetationData } from '../../src/core';

function hashBytes( data: Uint8Array ): number {

	let hash = 2166136261;
	for ( let index = 0; index < data.length; index ++ ) hash = Math.imul( hash ^ data[ index ]!, 16777619 );
	return hash >>> 0;

}

function hashMesh( mesh: MeshData ): number {

	let hash = 2166136261;
	for ( const array of [ mesh.positions, mesh.normals, mesh.uvs, mesh.colors, mesh.windWeight, mesh.impostorCard, mesh.indices ] ) {
		const bytes = new Uint8Array( array.buffer, array.byteOffset, array.byteLength );
		for ( let index = 0; index < bytes.length; index ++ ) hash = Math.imul( hash ^ bytes[ index ]!, 16777619 );
	}
	for ( const group of mesh.groups ) for ( const value of [ group.start, group.count, group.partIndex ] ) hash = Math.imul( hash ^ value, 16777619 );
	return hash >>> 0;

}

function hashData( data: VegetationData ): number[] {

	const meshes = data.lods.map( hashMesh );
	const albedo = hashBytes( data.textures.albedo!.data );
	const normal = hashBytes( data.textures.normal!.data );
	const baked = bakeImpostor( data, data.parts.map( ( part ) => hexToLinear( part.defaultColor ) ), 64 );
	return [ ...meshes, albedo, normal, hashBytes( baked.data ) ];

}

function coverageFraction( samples: ReturnType<typeof createRockMossSurfaceSamples> ): number {

	let coverage = 0;
	let valid = 0;
	for ( let pixel = 0; pixel < samples.coverage.length; pixel ++ ) {
		if ( samples.valid[ pixel ] === 0 ) continue;
		coverage += samples.coverage[ pixel ]!;
		valid ++;
	}

	return coverage / valid;

}

function mossSurfaceStats( samples: ReturnType<typeof createRockMossSurfaceSamples>, groundY = 0 ): { meanNormalY: number; baseFraction: number; midFraction: number; ridgeFraction: number; nonRidgeFraction: number } {

	let mossyCount = 0;
	let meanNormalY = 0;
	let maximumY = groundY;
	for ( let pixel = 0; pixel < samples.valid.length; pixel ++ ) {
		if ( samples.valid[ pixel ] !== 0 ) maximumY = Math.max( maximumY, samples.positions[ pixel * 3 + 1 ]! );
	}
	const aboveGroundHeight = maximumY - groundY;
	let baseCount = 0;
	let baseMossy = 0;
	let midCount = 0;
	let midMossy = 0;
	const edgeValues: number[] = [];
	for ( let pixel = 0; pixel < samples.coverage.length; pixel ++ ) {
		if ( samples.valid[ pixel ] === 0 ) continue;
		const normalY = samples.normals[ pixel * 3 + 1 ]!;
		const height = ( samples.positions[ pixel * 3 + 1 ]! - groundY ) / aboveGroundHeight;
		const mossy = samples.coverage[ pixel ]! > 0.5;
		const verticalFace = normalY >= - 0.08 && normalY <= 0.25;
		if ( mossy ) {
			mossyCount ++;
			meanNormalY += normalY;
		}
		if ( verticalFace && height >= 0 && height <= 0.15 ) {
			baseCount ++;
			if ( mossy ) baseMossy ++;
		}
		if ( verticalFace && height >= 0.35 && height <= 0.65 ) {
			midCount ++;
			if ( mossy ) midMossy ++;
		}
		if ( samples.edgeHighlights[ pixel ]! > 0 ) edgeValues.push( samples.edgeHighlights[ pixel ]! );
	}
	const ridgeThreshold = edgeValues.sort( ( first, second ) => second - first )[ Math.max( 0, Math.floor( edgeValues.length * 0.1 ) ) ] ?? Infinity;
	let ridgeCount = 0;
	let ridgeMossy = 0;
	let nonRidgeCount = 0;
	let nonRidgeMossy = 0;
	for ( let pixel = 0; pixel < samples.coverage.length; pixel ++ ) {
		if ( samples.valid[ pixel ] === 0 ) continue;
		const ridge = samples.edgeHighlights[ pixel ]! >= ridgeThreshold && samples.edgeHighlights[ pixel ]! > 0;
		if ( ridge ) {
			ridgeCount ++;
			if ( samples.coverage[ pixel ]! > 0.5 ) ridgeMossy ++;
		} else {
			nonRidgeCount ++;
			if ( samples.coverage[ pixel ]! > 0.5 ) nonRidgeMossy ++;
		}
	}

	return {
		meanNormalY: mossyCount > 0 ? meanNormalY / mossyCount : Number.NaN,
		baseFraction: baseMossy / baseCount,
		midFraction: midMossy / midCount,
		ridgeFraction: ridgeMossy / ridgeCount,
		nonRidgeFraction: nonRidgeMossy / nonRidgeCount,
	};

}

function getRockSurfaceContext( seed: number, burial: number, closeBottom: boolean ): { shape: ReturnType<typeof createRockHullShape>; verticalOffset: number; ridgeUvSegments: ReturnType<typeof buildRockHullMeshWithChamfers>['ridgeUvSegments'] } {

	const size = 6.4;
	const shape = createRockHullShape( seed + 62, size, 1.2, 0.04, closeBottom );
	const hullFaces = buildConvexHullFaces( shape.points );
	const chamfered = buildRockHullMeshWithChamfers( shape, hullFaces, size * 0.04, 0.25 );
	let minimumY = Infinity;
	let maximumY = - Infinity;
	for ( let offset = 1; offset < chamfered.mesh.positions.length; offset += 3 ) {
		minimumY = Math.min( minimumY, chamfered.mesh.positions[ offset ]! );
		maximumY = Math.max( maximumY, chamfered.mesh.positions[ offset ]! );
	}
	const groundOffset = - minimumY;
	const fullHeight = maximumY + groundOffset;

	return { shape, verticalOffset: groundOffset - burial * fullHeight, ridgeUvSegments: chamfered.ridgeUvSegments };

}

function pebbleTintStrength( data: VegetationData, baseline: VegetationData ): number {

	const colors = data.lods[ 0 ]!.colors;
	const baselineColors = baseline.lods[ 0 ]!.colors;
	let difference = 0;
	for ( let index = 0; index < colors.length; index ++ ) difference += baselineColors[ index ]! - colors[ index ]!;

	return difference / colors.length;

}

function pebbleTintStats( data: VegetationData, baseline: VegetationData ): { meanNormalY: number; highFraction: number; lowFraction: number } {

	const mesh = data.lods[ 0 ]!;
	const baselineColors = baseline.lods[ 0 ]!.colors;
	let mossyCount = 0;
	let meanNormalY = 0;
	let highCount = 0;
	let highMossy = 0;
	let lowCount = 0;
	let lowMossy = 0;
	for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {
		const offset = vertex * 3;
		const mossy = baselineColors[ offset ]! - mesh.colors[ offset ]! > 0.02;
		const normalY = mesh.normals[ offset + 1 ]!;
		if ( mossy ) {
			mossyCount ++;
			meanNormalY += normalY;
		}
		if ( normalY > 0.7 ) {
			highCount ++;
			if ( mossy ) highMossy ++;
		}
		if ( normalY >= 0.05 && normalY <= 0.4 ) {
			lowCount ++;
			if ( mossy ) lowMossy ++;
		}
	}

	return {
		meanNormalY: mossyCount > 0 ? meanNormalY / mossyCount : Number.NaN,
		highFraction: highMossy / highCount,
		lowFraction: lowMossy / lowCount,
	};

}

function longestAxisAlignedEdgeRun( mask: Float32Array, size: number, valid?: Uint8Array ): number {

	let longest = 0;
	for ( let x = 0; x < size; x ++ ) {
		let run = 0;
		for ( let y = 0; y < size; y ++ ) {
			const leftPixel = y * size + ( x === 0 ? size - 1 : x - 1 );
			const rightPixel = y * size + x;
			if ( valid !== undefined && ( valid[ leftPixel ] === 0 || valid[ rightPixel ] === 0 ) ) {
				run = 0;
				continue;
			}
			const left = mask[ leftPixel ]! > 0.5;
			const right = mask[ rightPixel ]! > 0.5;
			if ( left !== right ) {
				run ++;
				longest = Math.max( longest, run );
			} else run = 0;
		}
	}
	for ( let y = 0; y < size; y ++ ) {
		let run = 0;
		for ( let x = 0; x < size; x ++ ) {
			const topPixel = ( y === 0 ? 0 : y - 1 ) * size + x;
			const bottomPixel = y * size + x;
			if ( valid !== undefined && ( valid[ topPixel ] === 0 || valid[ bottomPixel ] === 0 ) ) {
				run = 0;
				continue;
			}
			const top = mask[ topPixel ]! > 0.5;
			const bottom = mask[ bottomPixel ]! > 0.5;
			if ( top !== bottom ) {
				run ++;
				longest = Math.max( longest, run );
			} else run = 0;
		}
	}

	return longest;

}

function hashGrid( seed: number, x: number, y: number ): number {

	let value = ( seed ^ Math.imul( x + 1, 0x9e3779b1 ) ^ Math.imul( y + 1, 0x85ebca6b ) ) >>> 0;
	value = Math.imul( value ^ value >>> 16, 0x7feb352d );
	value = Math.imul( value ^ value >>> 15, 0x846ca68b );
	value ^= value >>> 16;

	return value / 2147483648 - 1;

}

function legacyPeriodicNoise( seed: number, columns: number, rows: number, size: number ): ( x: number, y: number ) => number {

	const values = new Float32Array( columns * rows );
	for ( let y = 0; y < rows; y ++ ) for ( let x = 0; x < columns; x ++ ) values[ y * columns + x ] = hashGrid( seed, x, y );
	const smooth = ( value: number ): number => value * value * ( 3 - 2 * value );

	return ( pixelX, pixelY ) => {
		const gridX = pixelX / size * columns;
		const gridY = pixelY / size * rows;
		const x = Math.floor( gridX );
		const y = Math.floor( gridY );
		const nextX = ( x + 1 ) % columns;
		const nextY = ( y + 1 ) % rows;
		const amountX = smooth( gridX - x );
		const amountY = smooth( gridY - y );
		const top = values[ y * columns + x ]! * ( 1 - amountX ) + values[ y * columns + nextX ]! * amountX;
		const bottom = values[ nextY * columns + x ]! * ( 1 - amountX ) + values[ nextY * columns + nextX ]! * amountX;

		return top * ( 1 - amountY ) + bottom * amountY;
	};

}

function legacyMossMask( seed: number, amount: number, samples: ReturnType<typeof createRockMossSurfaceSamples> ): Float32Array {

	const size = Math.sqrt( samples.coverage.length );
	const broad = legacyPeriodicNoise( seed + 241, 5, 4, size );
	const warp = legacyPeriodicNoise( seed + 257, 3, 5, size );
	const fringe = legacyPeriodicNoise( seed + 271, 36, 32, size );
	const threshold = 0.29 - amount * 0.31;
	const smooth = ( minimum: number, maximum: number, value: number ): number => {
		const t = Math.max( 0, Math.min( 1, ( value - minimum ) / ( maximum - minimum ) ) );
		return t * t * ( 3 - 2 * t );
	};
	const mask = new Float32Array( samples.coverage.length );
	for ( let pixel = 0; pixel < mask.length; pixel ++ ) {
		if ( samples.valid[ pixel ] === 0 ) continue;
		const normalY = samples.normals[ pixel * 3 + 1 ]!;
		const orientation = smooth( - 0.18, 0.3, normalY );
		const height = samples.positions[ pixel * 3 + 1 ]!;
		const groundFade = smooth( 0.015, 0.11, height );
		if ( orientation <= 0 || groundFade <= 0 ) continue;
		const x = pixel % size;
		const y = Math.floor( pixel / size );
		const signal = 0.5 + broad( x, y ) * 0.32 + warp( x, y ) * 0.15 + fringe( x, y ) * 0.09;
		mask[ pixel ] = smooth( threshold - 0.045, threshold + 0.035, signal ) * orientation * groundFade;
	}

	return mask;

}

const LEGACY_HASHES: Record<string, number[]> = {
	'rock-1-false': [ 2947095016, 902703993, 574403876, 3551582965, 2567358744, 4031996057, 4152750107, 1253275383 ],
	'rock-1-true': [ 1164806856, 2272477206, 1662950396, 2400116814, 624741428, 378107146, 3861561435, 3727479295 ],
	'pebbles-1': [ 2884446334, 3769415892, 4209299559, 649758491, 3747391364, 1066383599, 2760055396, 1447801153 ],
	'rock-7-false': [ 3660015649, 915934756, 4291103540, 4014911667, 2734196444, 3556486320, 720126648, 4202908968 ],
	'rock-7-true': [ 457172542, 934053832, 3542311523, 755101775, 1412895948, 782868935, 1810882878, 2529114653 ],
	'pebbles-7': [ 2031530908, 2057917093, 1885556615, 1708705815, 2266779516, 2271095016, 691380086, 1887968553 ],
};

describe( 'moss texture option', () => {

	for ( const seed of [ 1, 7 ] ) {
		for ( const closeBottom of [ false, true ] ) {
			it( `keeps Rock seed ${ seed } closeBottom=${ closeBottom } bit-identical when moss is zero`, () => {

				const base = generateRockData( { seed, closeBottom } );
				const mossZero = generateRockData( { seed, closeBottom, moss: 0 } );
				expect( hashData( base ), `rock seed ${ seed }, closeBottom ${ closeBottom }` ).toEqual( LEGACY_HASHES[ `rock-${ seed }-${ closeBottom }` ] );
				expect( hashData( mossZero ) ).toEqual( LEGACY_HASHES[ `rock-${ seed }-${ closeBottom }` ] );

			}, 30000 );
		}
		it( `keeps Pebbles seed ${ seed } bit-identical when moss is zero`, () => {

			const base = generatePebblesData( { seed } );
			const mossZero = generatePebblesData( { seed, moss: 0 } );
			expect( hashData( base ), `pebbles seed ${ seed }` ).toEqual( LEGACY_HASHES[ `pebbles-${ seed }` ] );
			expect( hashData( mossZero ) ).toEqual( LEGACY_HASHES[ `pebbles-${ seed }` ] );

		}, 30000 );
	}

	it( 'grows moss coverage monotonically at every amount for both rock seeds and pebbles', () => {

		const amounts = [ 0, 0.25, 0.5, 0.75, 1 ];
		for ( const seed of [ 1, 7 ] ) {
			const rock = generateRockData( { seed, closeBottom: true } );
			const coverage = amounts.map( ( amount ) => coverageFraction( createRockMossSurfaceSamples( seed * 1000 + 419, 128, amount, rock.lods[ 0 ], 0, - 0.15 ) ) );
			expect( coverage[ 0 ] ).toBe( 0 );
			for ( let index = 1; index < coverage.length; index ++ ) expect( coverage[ index ], `rock seed ${ seed }: ${ coverage.join( ', ' ) }` ).toBeGreaterThan( coverage[ index - 1 ]! );
		}

		const pebbleBaseline = generatePebblesData( { seed: 1 } );
		const pebbleTint = amounts.map( ( amount ) => pebbleTintStrength( generatePebblesData( { seed: 1, moss: amount } ), pebbleBaseline ) );
		expect( pebbleTint[ 0 ] ).toBe( 0 );
		for ( let index = 1; index < pebbleTint.length; index ++ ) expect( pebbleTint[ index ], `pebbles seed 1: ${ pebbleTint.join( ', ' ) }` ).toBeGreaterThan( pebbleTint[ index - 1 ]! );

	}, 30000 );

	it( 'concentrates rock moss on upward faces and excludes the underside and buried surface', () => {

		const baseline = generateRockData( { seed: 1, closeBottom: true, burial: 0.4 } );
		const context = getRockSurfaceContext( 1, 0.4, true );
		const ridgeMap = createRockEdgeHighlightMap( context.ridgeUvSegments, 256, 6.4 );
		const samples = createRockMossSurfaceSamples( 1419, 256, 0.5, baseline.lods[ 0 ], 0, - 0.15, context, context.ridgeUvSegments, ridgeMap );
		const stats = mossSurfaceStats( samples );
		let strongestNormalBlend = 0;
		let patchPixels = 0;
		let clumpPixels = 0;
		for ( let pixel = 0; pixel < samples.valid.length; pixel ++ ) {
			if ( samples.valid[ pixel ] === 0 ) continue;
			strongestNormalBlend = Math.max( strongestNormalBlend, Math.abs( samples.upFacing[ pixel ]! - samples.normals[ pixel * 3 + 1 ]! ) );
			if ( samples.coverage[ pixel ]! > 0.9 ) {
				patchPixels ++;
				if ( samples.clumps[ pixel ]! > 0.5 ) clumpPixels ++;
			}
		}
		const clumpFraction = clumpPixels / patchPixels;
		expect( strongestNormalBlend ).toBeGreaterThan( 0.05 );
		expect( clumpFraction ).toBeGreaterThanOrEqual( 0.1 );
		expect( clumpFraction ).toBeLessThanOrEqual( 0.6 );
		expect( stats.meanNormalY ).toBeGreaterThanOrEqual( 0.3 );
		expect( stats.ridgeFraction ).toBeLessThan( stats.nonRidgeFraction / 3 );
		expect( stats.baseFraction ).toBeGreaterThanOrEqual( stats.midFraction * 2 );
		for ( let pixel = 0; pixel < samples.coverage.length; pixel ++ ) {
			if ( samples.valid[ pixel ] === 0 ) continue;
			const normalY = samples.normals[ pixel * 3 + 1 ]!;
			const positionY = samples.positions[ pixel * 3 + 1 ]!;
			const position: [ number, number, number ] = [ samples.positions[ pixel * 3 ]!, positionY, samples.positions[ pixel * 3 + 2 ]! ];
			if ( positionY <= 0 || ( normalY < - 0.15 && ! isRockScoopInterior( position, context.shape, context.verticalOffset ) ) ) expect( samples.coverage[ pixel ] ).toBe( 0 );
		}

		const mossed = generateRockData( { seed: 1, closeBottom: true, moss: 0.5 } );
		const colors = mossed.parts.map( ( part ) => hexToLinear( part.defaultColor ) );
		expect( hashBytes( bakeImpostor( mossed, colors, 64 ).data ) ).not.toBe( hashBytes( bakeImpostor( baseline, colors, 64 ).data ) );

		const pebbleBaseline = generatePebblesData( { seed: 1, burial: 0.4 } );
		const pebbleMoss = generatePebblesData( { seed: 1, burial: 0.4, moss: 0.5 } );
		const pebbleStats = pebbleTintStats( pebbleMoss, pebbleBaseline );
		expect( pebbleStats.meanNormalY ).toBeGreaterThanOrEqual( 0.6 );
		expect( pebbleStats.highFraction ).toBeGreaterThan( 0 );
		expect( pebbleStats.highFraction ).toBeGreaterThanOrEqual( pebbleStats.lowFraction * 4 );
		for ( let vertex = 0; vertex < pebbleMoss.lods[ 0 ]!.positions.length / 3; vertex ++ ) {
			const offset = vertex * 3;
			const normalY = pebbleMoss.lods[ 0 ]!.normals[ offset + 1 ]!;
			const positionY = pebbleMoss.lods[ 0 ]!.positions[ offset + 1 ]!;
			if ( normalY < - 0.15 || positionY <= 0 ) expect( pebbleMoss.lods[ 0 ]!.colors[ offset ] ).toBe( pebbleBaseline.lods[ 0 ]!.colors[ offset ] );
		}

	}, 30000 );

	it( 'keeps moss albedo in the reference mid-green range', () => {

		const baseline = generateRockData( { seed: 1, closeBottom: true, burial: 0.4 } );
		const context = getRockSurfaceContext( 1, 0.4, true );
		const ridgeMap = createRockEdgeHighlightMap( context.ridgeUvSegments, 1024, 6.4 );
		const samples = createRockMossSurfaceSamples( 1419, 1024, 0.5, baseline.lods[ 0 ]!, 0, - 0.15, context, context.ridgeUvSegments, ridgeMap );
		const mossed = generateRockData( { seed: 1, closeBottom: true, burial: 0.4, moss: 0.5 } );
		const texture = mossed.textures.albedo!;
		const sums = [ 0, 0, 0 ];
		const baseSums = [ 0, 0, 0 ];
		const clumpSums = [ 0, 0, 0 ];
		let count = 0;
		let baseCount = 0;
		let clumpCount = 0;
		for ( const pixel of samples.activePixels ) {
			if ( samples.coverage[ pixel ]! <= 0.5 && samples.clumps[ pixel ]! <= 0.5 ) continue;
			const offset = pixel * 4;
			for ( let channel = 0; channel < 3; channel ++ ) sums[ channel ] = sums[ channel ]! + texture.data[ offset + channel ]!;
			count ++;
			if ( samples.coverage[ pixel ]! > 0.8 && samples.clumps[ pixel ]! <= 0.5 ) {
				for ( let channel = 0; channel < 3; channel ++ ) baseSums[ channel ] = baseSums[ channel ]! + texture.data[ offset + channel ]!;
				baseCount ++;
			}
			if ( samples.clumps[ pixel ]! > 0.5 ) {
				for ( let channel = 0; channel < 3; channel ++ ) clumpSums[ channel ] = clumpSums[ channel ]! + texture.data[ offset + channel ]!;
				clumpCount ++;
			}
		}
		const mean = sums.map( ( value ) => Math.round( value / count ) );
		const baseMean = baseSums.map( ( value ) => Math.round( value / baseCount ) );
		const clumpMean = clumpSums.map( ( value ) => Math.round( value / clumpCount ) );
		expect( count ).toBeGreaterThan( 0 );
		expect( baseCount ).toBeGreaterThan( 0 );
		expect( clumpCount ).toBeGreaterThan( 0 );
		expect( baseMean[ 1 ] ).toBeLessThan( clumpMean[ 1 ]! );
		expect( clumpMean[ 1 ] ).toBeGreaterThan( baseMean[ 1 ]! * 1.1 );
		expect( mean[ 0 ] ).toBeGreaterThanOrEqual( 75 );
		expect( mean[ 0 ] ).toBeLessThanOrEqual( 170 );
		expect( mean[ 1 ] ).toBeGreaterThanOrEqual( 110 );
		expect( mean[ 1 ] ).toBeLessThanOrEqual( 190 );
		expect( mean[ 2 ] ).toBeGreaterThanOrEqual( 30 );
		expect( mean[ 2 ] ).toBeLessThanOrEqual( 90 );

	}, 30000 );

	it( 'keeps the 3D moss edge free of long axis-aligned runs', () => {

		const rock = generateRockData( { seed: 1, closeBottom: true } );
		const samples = createRockMossSurfaceSamples( 1419, 1024, 0.7, rock.lods[ 0 ], 0, - 0.15 );
		// 地面との接地線（地面に隠れる）での切れ目は数えない。
		const aboveGround = Uint8Array.from( samples.valid, ( value, pixel ) => value !== 0 && samples.positions[ pixel * 3 + 1 ]! > samples.diameter * 0.01 ? 1 : 0 );
		const fixedRun = longestAxisAlignedEdgeRun( samples.coverage, 1024, aboveGround );
		const v1Run = longestAxisAlignedEdgeRun( legacyMossMask( 1419, 0.7, samples ), 1024, aboveGround );
		expect( fixedRun ).toBeLessThanOrEqual( 24 );
		expect( v1Run ).toBeGreaterThan( fixedRun );

	}, 30000 );

	it( 'validates moss amount and color and stays deterministic', () => {

		expect( () => generateRockData( { moss: - 0.01 } ) ).toThrow( RangeError );
		expect( () => generateRockData( { moss: 1.01 } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { moss: Number.NaN } ) ).toThrow( RangeError );
		expect( () => generatePebblesData( { mossColor: 0x1000000 } ) ).toThrow( RangeError );
		const first = generatePebblesData( { seed: 4, moss: 0.7, mossColor: 0x5a7a2e } );
		const repeated = generatePebblesData( { seed: 4, moss: 0.7, mossColor: 0x5a7a2e } );
		const alternateColor = generatePebblesData( { seed: 4, moss: 0.7, mossColor: 0x3f6c34 } );
		const bare = generatePebblesData( { seed: 4 } );
		expect( hashMesh( first.lods[ 0 ]! ) ).toBe( hashMesh( repeated.lods[ 0 ]! ) );
		expect( hashMesh( first.lods[ 0 ]! ) ).not.toBe( hashMesh( alternateColor.lods[ 0 ]! ) );
		const colors = first.parts.map( ( part ) => hexToLinear( part.defaultColor ) );
		expect( hashBytes( bakeImpostor( first, colors, 64 ).data ) ).not.toBe( hashBytes( bakeImpostor( bare, colors, 64 ).data ) );

	}, 30000 );

} );
