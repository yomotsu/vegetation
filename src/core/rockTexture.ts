import type { TextureData } from './types';

type NoiseSampler = ( u: number, v: number ) => number;

interface NoiseField extends NoiseSampler {
	atPixel( x: number, y: number ): number;
}

interface PixelAxisSamples {
	x0: Uint16Array;
	x1: Uint16Array;
	tx: Float32Array;
	y0: Uint16Array;
	y1: Uint16Array;
	ty: Float32Array;
}

interface RockTexturePair {
	albedo: TextureData;
	normal: TextureData;
}

const pixelAxisCache = new Map<string, PixelAxisSamples>();
const textureCache = new Map<string, RockTexturePair>();

function getPixelAxisSamples( columns: number, rows: number, size: number ): PixelAxisSamples {

	const key = `${ columns }x${ rows }@${ size }`;
	const cached = pixelAxisCache.get( key );
	if ( cached !== undefined ) return cached;

	const x0 = new Uint16Array( size );
	const x1 = new Uint16Array( size );
	const tx = new Float32Array( size );
	const y0 = new Uint16Array( size );
	const y1 = new Uint16Array( size );
	const ty = new Float32Array( size );

	for ( let index = 0; index < size; index ++ ) {

		const gridX = index / size * columns;
		const gridY = index / size * rows;
		const floorX = Math.floor( gridX );
		const floorY = Math.floor( gridY );

		x0[ index ] = floorX;
		x1[ index ] = ( floorX + 1 ) % columns;
		tx[ index ] = smoothstep( 0, 1, gridX - floorX );
		y0[ index ] = floorY;
		y1[ index ] = ( floorY + 1 ) % rows;
		ty[ index ] = smoothstep( 0, 1, gridY - floorY );

	}

	const samples = { x0, x1, tx, y0, y1, ty };
	pixelAxisCache.set( key, samples );
	if ( pixelAxisCache.size > 32 ) pixelAxisCache.delete( pixelAxisCache.keys().next().value! );

	return samples;

}

function copyTextureData( texture: TextureData ): TextureData {

	return { ...texture, data: texture.data.slice() };

}

function copyTexturePair( textures: RockTexturePair ): RockTexturePair {

	return { albedo: copyTextureData( textures.albedo ), normal: copyTextureData( textures.normal ) };

}

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

function createPeriodicNoise( seed: number, columns: number, rows: number, size: number ): NoiseField {

	const values = new Float32Array( columns * rows );

	for ( let y = 0; y < rows; y ++ ) {

		for ( let x = 0; x < columns; x ++ ) {

			values[ y * columns + x ] = hashGrid( seed, x, y );

		}

	}

	const sample = ( u: number, v: number ): number => {

		const gridX = u * columns;
		const gridY = v * rows;
		const x = Math.floor( gridX );
		const y = Math.floor( gridY );
		const nextX = ( x + 1 ) % columns;
		const nextY = ( y + 1 ) % rows;
		const amountX = smoothstep( 0, 1, gridX - x );
		const amountY = smoothstep( 0, 1, gridY - y );
		const top = values[ y * columns + x ]! * ( 1 - amountX ) + values[ y * columns + nextX ]! * amountX;
		const bottom = values[ nextY * columns + x ]! * ( 1 - amountX ) + values[ nextY * columns + nextX ]! * amountX;

		return top * ( 1 - amountY ) + bottom * amountY;

	};
	const { x0, x1, tx, y0, y1, ty } = getPixelAxisSamples( columns, rows, size );

	const atPixel = ( x: number, y: number ): number => {

		const topOffset = y0[ y ]! * columns;
		const bottomOffset = y1[ y ]! * columns;
		const firstX = x0[ x ]!;
		const secondX = x1[ x ]!;
		const amountX = tx[ x ]!;
		const amountY = ty[ y ]!;
		const top = values[ topOffset + firstX ]! * ( 1 - amountX ) + values[ topOffset + secondX ]! * amountX;
		const bottom = values[ bottomOffset + firstX ]! * ( 1 - amountX ) + values[ bottomOffset + secondX ]! * amountX;

		return top * ( 1 - amountY ) + bottom * amountY;

	};

	return Object.assign( sample, { atPixel } );

}

function createPeriodicNoise1D( seed: number, columns: number ): ( value: number ) => number {

	const values = new Float32Array( columns );

	for ( let x = 0; x < columns; x ++ ) {

		values[ x ] = hashGrid( seed, x, 0 );

	}

	return ( value: number ): number => {

		const grid = value * columns;
		const index = Math.floor( grid );
		const next = ( index + 1 ) % columns;
		const amount = smoothstep( 0, 1, grid - index );

		return values[ index ]! * ( 1 - amount ) + values[ next ]! * amount;

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

function createFineCracks( seed: number, dominantAngle: number, detailMask: NoiseSampler ): CrackSegment[] {

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
		const inverseWidthSquared = 1 / ( segment.width * segment.width );
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
					const deltaX = u - startU - deltaU * projection;
					const deltaY = v - segment.v0 - deltaV * projection;
					const distance = ( deltaX * deltaX + deltaY * deltaY ) * inverseWidthSquared;
					const index = y * size + ( ( x % size ) + size ) % size;

					distances[ index ] = Math.min( distances[ index ]!, distance );

				}

			}

		}

	}

	return distances;

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

export function createRockTextures( seed: number, size = 1024 ): { albedo: TextureData; normal: TextureData } {

	const textureKey = `${ Math.floor( Math.abs( seed ) * 1000 ) }:${ size }`;
	const cachedTextures = textureCache.get( textureKey );

	if ( cachedTextures !== undefined ) {

		textureCache.delete( textureKey );
		textureCache.set( textureKey, cachedTextures );

		return copyTexturePair( cachedTextures );

	}

	const seedOffset = Math.floor( Math.abs( seed ) * 1000 ) + 419;
	const random = createRandom( seed );
	const directions: [ number, number ][] = [ [ 1, 0 ], [ 0, 1 ], [ 1, 1 ], [ 1, - 1 ], [ 2, 1 ], [ 2, - 1 ], [ 1, 2 ], [ 1, - 2 ] ];
	const direction = directions[ Math.floor( random() * directions.length ) ]!;
	const dominantAngle = Math.atan2( - direction[ 0 ], direction[ 1 ] );
	const bandCount = 3 + Math.floor( random() * 3 );
	const broadNoise = createPeriodicNoise( seedOffset + 13, 4, 4, size );
	const mediumNoise = createPeriodicNoise( seedOffset + 29, 9, 9, size );
	const warpNoise = createPeriodicNoise( seedOffset + 47, 3, 3, size );
	const bandNoise = createPeriodicNoise1D( seedOffset + 61, bandCount );
	const fineBandNoise = createPeriodicNoise1D( seedOffset + 73, bandCount * 5 );
	const grainNoise = createPeriodicNoise( seedOffset + 89, 80, 80, size );
	const fineGrainNoise = createPeriodicNoise( seedOffset + 101, 128, 128, size );
	const detailMaskNoise = createPeriodicNoise( seedOffset + 113, 3, 3, size );
	const streakNoise = createPeriodicNoise( seedOffset + 127, 24, 72, size );
	const detailMask = ( u: number, v: number ): number => smoothstep( - 0.25, 0.5, detailMaskNoise( u, v ) + 1 );
	const cracks = createFineCracks( seed, dominantAngle, detailMask );
	const crackDistances = createCrackDistanceMap( size, cracks );
	const heightMap = new Float32Array( size * size );
	const albedoData = new Uint8Array( size * size * 4 );
	const normalData = new Uint8Array( size * size * 4 );

	for ( let y = 0; y < size; y ++ ) {

		const v = y / size;
		const poleFade = smoothstep( 0, 0.075, v ) * smoothstep( 0, 0.075, 1 - v );

		for ( let x = 0; x < size; x ++ ) {

			const u = x / size;
			const warp = warpNoise.atPixel( x, y );
			const phase = fract( ( direction[ 0 ] * u + direction[ 1 ] * v ) * bandCount + warp * 0.09 );
			const strata = bandNoise( phase ) * 0.82 + fineBandNoise( fract( phase * 3 + warp * 0.24 ) ) * 0.18;
			const broad = broadNoise.atPixel( x, y );
			const medium = mediumNoise.atPixel( x, y );
			const grain = grainNoise.atPixel( x, y ) * 0.68 + fineGrainNoise.atPixel( x, y ) * 0.32;
			const detail = smoothstep( - 0.25, 0.5, detailMaskNoise.atPixel( x, y ) + 1 );
			const localizedStrata = strata * ( 0.2 + detail * 0.8 );
			const along = fract( direction[ 0 ] * u + direction[ 1 ] * v + warp * 0.015 );
			const across = fract( - direction[ 1 ] * u + direction[ 0 ] * v + warp * 0.02 );
			const fineStreak = ( 1 - smoothstep( 0.2, 0.75, streakNoise( along, across ) + 1 ) ) * detail;
			const crackDistance = Math.sqrt( crackDistances[ y * size + x ]! );
			const crack = 1 - smoothstep( 0.48, 1.25, crackDistance );
			const crackHalo = 1 - smoothstep( 1.2, 3.2, crackDistance );
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

		const topRow = ( y === 0 ? size - 1 : y - 1 ) * size;
		const middleRow = y * size;
		const bottomRow = ( y + 1 === size ? 0 : y + 1 ) * size;

		for ( let x = 0; x < size; x ++ ) {

			const index = y * size + x;
			const left = x === 0 ? size - 1 : x - 1;
			const right = x + 1 === size ? 0 : x + 1;
			const topLeft = heightMap[ topRow + left ]!;
			const topCenter = heightMap[ topRow + x ]!;
			const topRight = heightMap[ topRow + right ]!;
			const middleLeft = heightMap[ middleRow + left ]!;
			const middleRight = heightMap[ middleRow + right ]!;
			const bottomLeft = heightMap[ bottomRow + left ]!;
			const bottomCenter = heightMap[ bottomRow + x ]!;
			const bottomRight = heightMap[ bottomRow + right ]!;
			const gradientX = ( topRight + 2 * middleRight + bottomRight - topLeft - 2 * middleLeft - bottomLeft ) / 8;
			const gradientY = ( bottomLeft + 2 * bottomCenter + bottomRight - topLeft - 2 * topCenter - topRight ) / 8;
			const normalX = - gradientX * size * 0.2;
			const normalY = - gradientY * size * 0.2;
			const inverseLength = 1 / Math.hypot( normalX, normalY, 1 );

			normalData[ index * 4 ] = Math.round( ( normalX * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 1 ] = Math.round( ( normalY * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 2 ] = Math.round( ( inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 3 ] = 255;

		}

	}

	const textures: RockTexturePair = {
		albedo: { width: size, height: size, data: albedoData, wrap: 'repeat' },
		normal: { width: size, height: size, data: normalData, wrap: 'repeat' },
	};
	textureCache.set( textureKey, copyTexturePair( textures ) );
	if ( textureCache.size > 4 ) textureCache.delete( textureCache.keys().next().value! );

	return textures;

}
