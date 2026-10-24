function fade( value: number ): number {

	return value * value * value * ( value * ( value * 6 - 15 ) + 10 );

}

function lerp( a: number, b: number, t: number ): number {

	return a + ( b - a ) * t;

}

function hash3( x: number, y: number, z: number, seed: number ): number {

	let hash = seed ^ Math.imul( x, 0x8da6b343 );

	hash = Math.imul( hash ^ Math.imul( y, 0xd8163841 ), 0x7feb352d );
	hash = Math.imul( hash ^ Math.imul( z, 0xcb1ab31f ), 0x846ca68b );
	hash ^= hash >>> 16;

	return ( hash >>> 0 ) / 2147483648 - 1;

}

export function createNoise3D( seed: number ): ( x: number, y: number, z: number ) => number {

	const normalizedSeed = Math.floor( Math.abs( seed ) * 1000 ) >>> 0;

	return ( x, y, z ) => {

		const x0 = Math.floor( x );
		const y0 = Math.floor( y );
		const z0 = Math.floor( z );
		const x1 = x0 + 1;
		const y1 = y0 + 1;
		const z1 = z0 + 1;
		const tx = fade( x - x0 );
		const ty = fade( y - y0 );
		const tz = fade( z - z0 );
		const x00 = lerp( hash3( x0, y0, z0, normalizedSeed ), hash3( x1, y0, z0, normalizedSeed ), tx );
		const x10 = lerp( hash3( x0, y1, z0, normalizedSeed ), hash3( x1, y1, z0, normalizedSeed ), tx );
		const x01 = lerp( hash3( x0, y0, z1, normalizedSeed ), hash3( x1, y0, z1, normalizedSeed ), tx );
		const x11 = lerp( hash3( x0, y1, z1, normalizedSeed ), hash3( x1, y1, z1, normalizedSeed ), tx );
		const y0Value = lerp( x00, x10, ty );
		const y1Value = lerp( x01, x11, ty );

		return lerp( y0Value, y1Value, tz );

	};

}
