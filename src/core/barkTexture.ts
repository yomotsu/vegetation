import type { TextureData } from './types';

interface Knot {
	u: number;
	v: number;
	radiusU: number;
	radiusV: number;
}

function wrappedDistance( a: number, b: number ): number {

	const distance = Math.abs( a - b );

	return Math.min( distance, 1 - distance );

}

function hash( x: number, y: number, seed: number ): number {

	let value = Math.imul( x + 1, 0x45d9f3b ) ^ Math.imul( y + 1, 0x119de1f3 ) ^ seed;
	value = Math.imul( value ^ ( value >>> 16 ), 0x45d9f3b );

	return ( value >>> 0 ) / 4294967295;

}

function fade( value: number ): number {

	return value * value * ( 3 - 2 * value );

}

function valueNoise( u: number, v: number, cellsU: number, cellsV: number, seed: number ): number {

	const x = u * cellsU;
	const y = v * cellsV;
	const floorX = Math.floor( x );
	const floorY = Math.floor( y );
	const x0 = ( ( floorX % cellsU ) + cellsU ) % cellsU;
	const x1 = ( x0 + 1 ) % cellsU;
	const y0 = ( ( floorY % cellsV ) + cellsV ) % cellsV;
	const y1 = ( y0 + 1 ) % cellsV;
	const tx = fade( x - floorX );
	const ty = fade( y - floorY );
	const lower = hash( x0, y0, seed ) + ( hash( x1, y0, seed ) - hash( x0, y0, seed ) ) * tx;
	const upper = hash( x0, y1, seed ) + ( hash( x1, y1, seed ) - hash( x0, y1, seed ) ) * tx;

	return lower + ( upper - lower ) * ty;

}

function wrapIndex( value: number, size: number ): number {

	return ( ( value % size ) + size ) % size;

}

export function createBarkTexture( seed: number, size = 128 ): TextureData {

	if ( ! Number.isInteger( size ) || size < 1 ) {
		throw new RangeError( 'Texture size must be a positive integer' );
	}

	const seedValue = Math.floor( Math.abs( seed + 97 ) * 1000 ) >>> 0;
	const data = new Uint8Array( size * size * 4 );
	const planks = 10;
	const knots: Knot[] = [
		{ u: 0.24, v: 0.32, radiusU: 0.055, radiusV: 0.16 },
		{ u: 0.72, v: 0.73, radiusU: 0.045, radiusV: 0.13 },
		{ u: 0.91, v: 0.12, radiusU: 0.035, radiusV: 0.1 },
	];

	for ( let y = 0; y < size; y ++ ) {

		const v = y / size;

		for ( let x = 0; x < size; x ++ ) {

			const u = x / size;
			let grainWarp = ( valueNoise( u, v, 4, 10, seedValue + 17 ) - 0.5 ) * 0.075;
			let knotShade = 0;

			for ( const knot of knots ) {

				const du = wrappedDistance( u, knot.u ) / knot.radiusU;
				const dv = wrappedDistance( v, knot.v ) / knot.radiusV;
				const distanceSquared = du * du + dv * dv;
				const influence = Math.exp( - distanceSquared * 1.7 );

				knotShade -= influence * 26 + Math.exp( - distanceSquared * 8 ) * 8;
				grainWarp += ( knot.u - u ) * influence * 0.16;

			}

			const warpedU = u + grainWarp;
			const scaledPlank = warpedU * planks;
			const plankIndex = wrapIndex( Math.floor( scaledPlank ), planks );
			const plankPosition = scaledPlank - Math.floor( scaledPlank );
			const edgeDistance = Math.min( plankPosition, 1 - plankPosition );
			const plankTone = ( hash( plankIndex, 0, seedValue + 29 ) - 0.5 ) * 15;
			const blockRows = 12 + Math.floor( hash( plankIndex, 0, seedValue + 107 ) * 9 );
			const blockOffset = hash( plankIndex, 0, seedValue + 113 ) * 0.08;
			const blockRow = Math.floor( ( ( v + blockOffset ) % 1 ) * blockRows );
			const blockTone = ( hash( plankIndex, blockRow, seedValue + 101 ) - 0.5 ) * 20;
			const plankCrease = - Math.max( 0, 0.075 - edgeDistance ) * 80;
			const verticalGrain = ( valueNoise( warpedU, v, 36, 7, seedValue + 37 ) - 0.5 ) * 26;
			const horizontalGrain = ( valueNoise( warpedU, v, 12, 28, seedValue + 53 ) - 0.5 ) * 16;
			const localGrain = ( valueNoise( warpedU, v, 54, 22, seedValue + 71 ) - 0.5 ) * 8;
			const fineNoise = ( valueNoise( u, v, 96, 64, seedValue + 89 ) - 0.5 ) * 11;
			const value = plankTone + blockTone + plankCrease + verticalGrain + horizontalGrain + localGrain + fineNoise + knotShade;
			const offset = ( y * size + x ) * 4;

			data[ offset ] = Math.max( 0, Math.min( 255, Math.round( 67 + value ) ) );
			data[ offset + 1 ] = Math.max( 0, Math.min( 255, Math.round( 52 + value * 0.84 ) ) );
			data[ offset + 2 ] = Math.max( 0, Math.min( 255, Math.round( 27 + value * 0.62 ) ) );
			data[ offset + 3 ] = 255;

		}

	}

	return { width: size, height: size, data };

}
