import type { TextureData } from './types';

function wrappedDistance( a: number, b: number ): number {

	const distance = Math.abs( a - b );

	return Math.min( distance, 1 - distance );

}

export function createBarkTexture( seed: number, size = 256 ): TextureData {

	if ( ! Number.isInteger( size ) || size < 1 ) {
		throw new RangeError( 'Texture size must be a positive integer' );
	}

	const seedValue = Math.floor( Math.abs( seed + 97 ) * 1000 ) >>> 0;
	const data = new Uint8Array( size * size * 4 );
	const knots = [
		{ u: 0.24, v: 0.32, radiusU: 0.055, radiusV: 0.16 },
		{ u: 0.72, v: 0.73, radiusU: 0.045, radiusV: 0.13 },
		{ u: 0.91, v: 0.12, radiusU: 0.035, radiusV: 0.1 },
	];

	for ( let y = 0; y < size; y ++ ) {

		const v = y / size;

		for ( let x = 0; x < size; x ++ ) {

			const u = x / size;
			let knot = 0;
			let grainWarp = 0;

			for ( const item of knots ) {

				const du = wrappedDistance( u, item.u ) / item.radiusU;
				const dv = wrappedDistance( v, item.v ) / item.radiusV;
				const distanceSquared = du * du + dv * dv;
				const influence = 1 / ( 1 + distanceSquared * 0.55 );

				if ( distanceSquared < 9 ) {

					knot += Math.sin( distanceSquared * 5.5 ) * 13 / ( 1 + distanceSquared * 0.25 ) - 14 / ( 1 + distanceSquared * 3 );
					grainWarp += ( u - item.u ) * influence * 2.5;

				}

			}

			const broadGrain = Math.sin( ( u * 9 + 0.04 * Math.sin( v * Math.PI * 2 + u * 6 + seedValue * 0.00001 ) + grainWarp ) * Math.PI * 2 ) * 9;
			const wave = Math.sin( ( u * 21 + 0.022 * Math.sin( v * Math.PI * 2 + u * 12 + seedValue * 0.00002 ) + grainWarp ) * Math.PI * 2 ) * 10;
			const narrowGrain = Math.sin( ( u * 47 + 0.012 * Math.sin( v * Math.PI * 4 + u * 9 ) + grainWarp ) * Math.PI * 2 ) * 4;
			let hash = Math.imul( x + 1, 0x45d9f3b ) ^ Math.imul( y + 1, 0x119de1f3 ) ^ seedValue;
			hash = Math.imul( hash ^ ( hash >>> 16 ), 0x45d9f3b );
			const noise = ( ( hash >>> 0 ) / 4294967295 - 0.5 ) * 6;
			const value = broadGrain + wave + narrowGrain + knot + noise;
			const offset = ( y * size + x ) * 4;

			data[ offset ] = Math.max( 0, Math.min( 255, Math.round( 70 + value ) ) );
			data[ offset + 1 ] = Math.max( 0, Math.min( 255, Math.round( 55 + value * 0.84 ) ) );
			data[ offset + 2 ] = Math.max( 0, Math.min( 255, Math.round( 29 + value * 0.46 ) ) );
			data[ offset + 3 ] = 255;

		}

	}

	return { width: size, height: size, data };

}
