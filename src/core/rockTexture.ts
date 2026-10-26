import type { TextureData } from './types';

type NoiseField = ( u: number, v: number ) => number;

interface CrackSegment {
	u0: number;
	v0: number;
	u1: number;
	v1: number;
	width: number;
}

interface CrackPoint {
	u: number;
	v: number;
}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function fract( value: number ): number {

	return value - Math.floor( value );

}

function smoothstep( minimum: number, maximum: number, value: number ): number {

	const amount = clamp( ( value - minimum ) / ( maximum - minimum ), 0, 1 );

	return amount * amount * ( 3 - 2 * amount );

}

function createRandom( seed: number ): () => number {

	let state = ( Math.floor( Math.abs( seed ) * 1000 ) + 0x6d2b79f5 ) >>> 0;

	return () => {

		state = ( state + 0x6d2b79f5 ) >>> 0;
		let value = state;
		value = Math.imul( value ^ value >>> 15, value | 1 );
		value ^= value + Math.imul( value ^ value >>> 7, value | 61 );

		return ( ( value ^ value >>> 14 ) >>> 0 ) / 4294967296;

	};

}

function hashGrid( seed: number, x: number, y: number ): number {

	let value = ( seed ^ Math.imul( x + 1, 0x9e3779b1 ) ^ Math.imul( y + 1, 0x85ebca6b ) ) >>> 0;
	value = Math.imul( value ^ value >>> 16, 0x7feb352d );
	value = Math.imul( value ^ value >>> 15, 0x846ca68b );
	value ^= value >>> 16;

	return value / 2147483648 - 1;

}

function createPeriodicNoise( seed: number, columns: number, rows: number ): NoiseField {

	const values = new Float32Array( columns * rows );

	for ( let y = 0; y < rows; y ++ ) {

		for ( let x = 0; x < columns; x ++ ) {

			values[ y * columns + x ] = hashGrid( seed, x, y );

		}

	}

	return ( u: number, v: number ): number => {

		const gridX = u * columns;
		const gridY = v * rows;
		const x = Math.floor( gridX );
		const y = Math.floor( gridY );
		const nextX = ( x + 1 ) % columns;
		const nextY = ( y + 1 ) % rows;
		const amountX = smoothstep( 0, 1, gridX - x );
		const amountY = smoothstep( 0, 1, gridY - y );
		const top = values[ ( y % rows ) * columns + x % columns ]! * ( 1 - amountX ) + values[ ( y % rows ) * columns + nextX ]! * amountX;
		const bottom = values[ nextY * columns + x % columns ]! * ( 1 - amountX ) + values[ nextY * columns + nextX ]! * amountX;

		return top * ( 1 - amountY ) + bottom * amountY;

	};

}

function addCrackPath(
	segments: CrackSegment[],
	start: CrackPoint,
	angle: number,
	length: number,
	steps: number,
	width: number,
	random: () => number,
): CrackPoint[] {

	const points = [ start ];
	let point = start;
	let direction = angle;

	for ( let step = 0; step < steps; step ++ ) {

		direction += ( random() - 0.5 ) * 0.95;
		const next = {
			u: point.u + Math.cos( direction ) * length / steps,
			v: point.v + Math.sin( direction ) * length / steps,
		};

		segments.push( { u0: point.u, v0: point.v, u1: next.u, v1: next.v, width } );
		points.push( next );
		point = next;

	}

	return points;

}

function createFineCracks( seed: number, dominantAngle: number, detailMask: NoiseField ): CrackSegment[] {

	const random = createRandom( seed + 907 );
	const segments: CrackSegment[] = [];
	const count = 150;

	for ( let index = 0; index < count; index ++ ) {

		const start = { u: random(), v: 0.12 + random() * 0.76 };
		if ( detailMask( start.u, start.v ) < 0.28 ) continue;
		const angle = dominantAngle + ( random() - 0.5 ) * 1.5;
		const width = 0.0035 + random() * 0.002;
		const length = 0.025 + random() * 0.045;
		const points = addCrackPath( segments, start, angle, length, 2 + Math.floor( random() * 3 ), width, random );

		if ( random() < 0.46 ) {

			const branchIndex = Math.floor( random() * ( points.length - 1 ) );
			const branchStart = points[ branchIndex ]!;
			const branchAngle = angle + ( random() < 0.5 ? - 1 : 1 ) * ( 0.55 + random() * 0.55 );

			addCrackPath( segments, branchStart, branchAngle, 0.012 + random() * 0.022, 2 + Math.floor( random() * 2 ), width * 0.78, random );

		}

	}

	return segments;

}

function createCrackDistanceMap( size: number, segments: CrackSegment[] ): Float32Array {

	const distances = new Float32Array( size * size );
	distances.fill( Infinity );

	for ( const segment of segments ) {

		const deltaU = segment.u1 - segment.u0;
		const deltaV = segment.v1 - segment.v0;
		const lengthSquared = deltaU * deltaU + deltaV * deltaV;
		const margin = segment.width * 3.5;

		for ( const shift of [ - 1, 0, 1 ] ) {

			const startU = segment.u0 + shift;
			const endU = segment.u1 + shift;
			const minimumX = Math.floor( ( Math.min( startU, endU ) - margin ) * size );
			const maximumX = Math.ceil( ( Math.max( startU, endU ) + margin ) * size );
			const minimumY = Math.max( 0, Math.floor( ( Math.min( segment.v0, segment.v1 ) - margin ) * size ) );
			const maximumY = Math.min( size - 1, Math.ceil( ( Math.max( segment.v0, segment.v1 ) + margin ) * size ) );

			for ( let y = minimumY; y <= maximumY; y ++ ) {

				for ( let x = minimumX; x <= maximumX; x ++ ) {

					const u = x / size;
					const v = y / size;
					const projection = clamp( ( ( u - startU ) * deltaU + ( v - segment.v0 ) * deltaV ) / lengthSquared, 0, 1 );
					const distance = Math.hypot( u - startU - deltaU * projection, v - segment.v0 - deltaV * projection ) / segment.width;
					const index = y * size + ( ( x % size ) + size ) % size;

					distances[ index ] = Math.min( distances[ index ]!, distance );

				}

			}

		}

	}

	return distances;

}

function sampleHeight( heightMap: Float32Array, size: number, x: number, y: number ): number {

	const wrappedX = ( x + size ) % size;
	const wrappedY = ( y + size ) % size;

	return heightMap[ wrappedY * size + wrappedX ]!;

}

function matchAlbedoMean( data: Uint8Array, pixelCount: number ): void {

	const target = [ 80.31, 95.08, 102.47 ];
	const total = [ 0, 0, 0 ];

	for ( let offset = 0; offset < data.length; offset += 4 ) {

		total[ 0 ]! += data[ offset ]!;
		total[ 1 ]! += data[ offset + 1 ]!;
		total[ 2 ]! += data[ offset + 2 ]!;

	}

	const adjustment = total.map( ( value, channel ) => target[ channel ]! - value / pixelCount );

	for ( let offset = 0; offset < data.length; offset += 4 ) {

		data[ offset ] = Math.round( clamp( data[ offset ]! + adjustment[ 0 ]!, 0, 255 ) );
		data[ offset + 1 ] = Math.round( clamp( data[ offset + 1 ]! + adjustment[ 1 ]!, 0, 255 ) );
		data[ offset + 2 ] = Math.round( clamp( data[ offset + 2 ]! + adjustment[ 2 ]!, 0, 255 ) );

	}

}

export function createRockTextures( seed: number, size = 256 ): { albedo: TextureData; normal: TextureData } {

	const seedOffset = Math.floor( Math.abs( seed ) * 1000 ) + 419;
	const random = createRandom( seed );
	const directions: [ number, number ][] = [ [ 1, 0 ], [ 0, 1 ], [ 1, 1 ], [ 1, - 1 ], [ 2, 1 ], [ 2, - 1 ], [ 1, 2 ], [ 1, - 2 ] ];
	const direction = directions[ Math.floor( random() * directions.length ) ]!;
	const dominantAngle = Math.atan2( - direction[ 0 ], direction[ 1 ] );
	const bandCount = 3 + Math.floor( random() * 3 );
	const broadNoise = createPeriodicNoise( seedOffset + 13, 4, 4 );
	const mediumNoise = createPeriodicNoise( seedOffset + 29, 9, 9 );
	const warpNoise = createPeriodicNoise( seedOffset + 47, 3, 3 );
	const bandNoise = createPeriodicNoise( seedOffset + 61, bandCount, 1 );
	const fineBandNoise = createPeriodicNoise( seedOffset + 73, bandCount * 5, 1 );
	const grainNoise = createPeriodicNoise( seedOffset + 89, 80, 80 );
	const fineGrainNoise = createPeriodicNoise( seedOffset + 101, 128, 128 );
	const detailMaskNoise = createPeriodicNoise( seedOffset + 113, 3, 3 );
	const streakNoise = createPeriodicNoise( seedOffset + 127, 24, 72 );
	const detailMask = ( u: number, v: number ): number => smoothstep( - 0.25, 0.5, detailMaskNoise( u, v ) + 1 );
	const cracks = createFineCracks( seed, dominantAngle, detailMask );
	const crackDistances = createCrackDistanceMap( size, cracks );
	const heightMap = new Float32Array( size * size );
	const albedoData = new Uint8Array( size * size * 4 );
	const normalData = new Uint8Array( size * size * 4 );

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const u = x / size;
			const v = y / size;
			const warp = warpNoise( u, v );
			const phase = fract( ( direction[ 0 ] * u + direction[ 1 ] * v ) * bandCount + warp * 0.09 );
			const strata = bandNoise( phase, 0.5 ) * 0.82 + fineBandNoise( fract( phase * 3 + warp * 0.24 ), 0.5 ) * 0.18;
			const broad = broadNoise( u, v );
			const medium = mediumNoise( u, v );
			const grain = grainNoise( u, v ) * 0.68 + fineGrainNoise( u, v ) * 0.32;
			const detail = detailMask( u, v );
			const localizedStrata = strata * ( 0.2 + detail * 0.8 );
			const along = fract( direction[ 0 ] * u + direction[ 1 ] * v + warp * 0.015 );
			const across = fract( - direction[ 1 ] * u + direction[ 0 ] * v + warp * 0.02 );
			const fineStreak = ( 1 - smoothstep( 0.2, 0.75, streakNoise( along, across ) + 1 ) ) * detail;
			const crackDistance = crackDistances[ y * size + x ]!;
			const crack = 1 - smoothstep( 0.48, 1.25, crackDistance );
			const crackHalo = 1 - smoothstep( 1.2, 3.2, crackDistance );
			const poleFade = smoothstep( 0, 0.075, v ) * smoothstep( 0, 0.075, 1 - v );
			const fineCrack = crack * poleFade * detail;
			const fineCrackHalo = crackHalo * poleFade * detail;
			const brightness = broad * 15 + medium * 5.6 + localizedStrata * 2.2 + grain * 5.1 - fineStreak * 6 - fineCrack * 18 - fineCrackHalo * 3;
			const index = y * size + x;

			heightMap[ index ] = broad * 0.06 + medium * 0.025 + localizedStrata * 0.007 + grain * 0.005 - fineStreak * 0.003 - fineCrack * 0.025 - fineCrackHalo * 0.004;
			albedoData[ index * 4 ] = Math.round( clamp( 80 + brightness * 0.96, 0, 255 ) );
			albedoData[ index * 4 + 1 ] = Math.round( clamp( 95 + brightness, 0, 255 ) );
			albedoData[ index * 4 + 2 ] = Math.round( clamp( 102 + brightness * 1.04, 0, 255 ) );
			albedoData[ index * 4 + 3 ] = 255;

		}

	}

	matchAlbedoMean( albedoData, size * size );

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const index = y * size + x;
			const gradientX = (
				sampleHeight( heightMap, size, x + 1, y - 1 ) +
				2 * sampleHeight( heightMap, size, x + 1, y ) +
				sampleHeight( heightMap, size, x + 1, y + 1 ) -
				sampleHeight( heightMap, size, x - 1, y - 1 ) -
				2 * sampleHeight( heightMap, size, x - 1, y ) -
				sampleHeight( heightMap, size, x - 1, y + 1 )
			) / 8;
			const gradientY = (
				sampleHeight( heightMap, size, x - 1, y + 1 ) +
				2 * sampleHeight( heightMap, size, x, y + 1 ) +
				sampleHeight( heightMap, size, x + 1, y + 1 ) -
				sampleHeight( heightMap, size, x - 1, y - 1 ) -
				2 * sampleHeight( heightMap, size, x, y - 1 ) -
				sampleHeight( heightMap, size, x + 1, y - 1 )
			) / 8;
			const normalX = - gradientX * size * 0.2;
			const normalY = - gradientY * size * 0.2;
			const inverseLength = 1 / Math.hypot( normalX, normalY, 1 );

			normalData[ index * 4 ] = Math.round( ( normalX * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 1 ] = Math.round( ( normalY * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 2 ] = Math.round( ( inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 3 ] = 255;

		}

	}

	return {
		albedo: { width: size, height: size, data: albedoData, wrap: 'repeat' },
		normal: { width: size, height: size, data: normalData, wrap: 'repeat' },
	};

}
