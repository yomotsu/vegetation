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

export interface Noise3DGridBounds {
	minimum: [ number, number, number ];
	maximum: [ number, number, number ];
}

const gradientVectors: readonly ( readonly [ number, number, number ] )[] = [
	[ 0.70710678, 0.70710678, 0 ], [ - 0.70710678, 0.70710678, 0 ], [ 0.70710678, - 0.70710678, 0 ], [ - 0.70710678, - 0.70710678, 0 ],
	[ 0.70710678, 0, 0.70710678 ], [ - 0.70710678, 0, 0.70710678 ], [ 0.70710678, 0, - 0.70710678 ], [ - 0.70710678, 0, - 0.70710678 ],
	[ 0, 0.70710678, 0.70710678 ], [ 0, - 0.70710678, 0.70710678 ], [ 0, 0.70710678, - 0.70710678 ], [ 0, - 0.70710678, - 0.70710678 ],
];

export function createGradientNoise3D( seed: number, gridBounds?: Noise3DGridBounds ): ( x: number, y: number, z: number ) => number {

	const normalizedSeed = Math.floor( Math.abs( seed ) * 1000 ) >>> 0;
	let minimum: [ number, number, number ] | undefined;
	let sizeX = 0;
	let sizeY = 0;
	let sizeZ = 0;
	let strideX = 0;
	let strideY = 0;
	let gradients: Uint8Array | undefined;
	if ( gridBounds !== undefined ) {

		minimum = gridBounds.minimum;
		sizeX = gridBounds.maximum[ 0 ] - minimum[ 0 ] + 1;
		sizeY = gridBounds.maximum[ 1 ] - minimum[ 1 ] + 1;
		sizeZ = gridBounds.maximum[ 2 ] - minimum[ 2 ] + 1;
		strideY = sizeZ;
		strideX = sizeY * sizeZ;
		gradients = new Uint8Array( sizeX * sizeY * sizeZ );
		for ( let x = gridBounds.minimum[ 0 ]; x <= gridBounds.maximum[ 0 ]; x ++ ) {
			for ( let y = gridBounds.minimum[ 1 ]; y <= gridBounds.maximum[ 1 ]; y ++ ) {
				let index = ( x - minimum[ 0 ] ) * strideX + ( y - minimum[ 1 ] ) * strideY;
				for ( let z = gridBounds.minimum[ 2 ]; z <= gridBounds.maximum[ 2 ]; z ++ ) gradients[ index ++ ] = Math.floor( ( hash3( x, y, z, normalizedSeed ) + 1 ) * 6 ) % 12;
			}
		}

	}
	const gradientAt = ( x: number, y: number, z: number ): readonly [ number, number, number ] => {

		const index = gradients === undefined ? Math.floor( ( hash3( x, y, z, normalizedSeed ) + 1 ) * 6 ) % 12 : gradients[ ( x - minimum![ 0 ]! ) * strideX + ( y - minimum![ 1 ]! ) * strideY + z - minimum![ 2 ]! ]!;
		return gradientVectors[ index ]!;

	};
	const dot = ( x: number, y: number, z: number, dx: number, dy: number, dz: number ): number => {

		const gradient = gradientAt( x, y, z );
		return gradient[ 0 ] * dx + gradient[ 1 ] * dy + gradient[ 2 ] * dz;

	};

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
		const x00 = lerp( dot( x0, y0, z0, x - x0, y - y0, z - z0 ), dot( x1, y0, z0, x - x1, y - y0, z - z0 ), tx );
		const x10 = lerp( dot( x0, y1, z0, x - x0, y - y1, z - z0 ), dot( x1, y1, z0, x - x1, y - y1, z - z0 ), tx );
		const x01 = lerp( dot( x0, y0, z1, x - x0, y - y0, z - z1 ), dot( x1, y0, z1, x - x1, y - y0, z - z1 ), tx );
		const x11 = lerp( dot( x0, y1, z1, x - x0, y - y1, z - z1 ), dot( x1, y1, z1, x - x1, y - y1, z - z1 ), tx );

		return lerp( lerp( x00, x10, ty ), lerp( x01, x11, ty ), tz ) * 1.5;

	};

}

export function createNoise3D( seed: number, gridBounds?: Noise3DGridBounds ): ( x: number, y: number, z: number ) => number {

	const normalizedSeed = Math.floor( Math.abs( seed ) * 1000 ) >>> 0;
	if ( gridBounds !== undefined ) {

		const minimum = gridBounds.minimum;
		const maximum = gridBounds.maximum;
		const sizeX = maximum[ 0 ] - minimum[ 0 ] + 1;
		const sizeY = maximum[ 1 ] - minimum[ 1 ] + 1;
		const sizeZ = maximum[ 2 ] - minimum[ 2 ] + 1;
		const values = new Float64Array( sizeX * sizeY * sizeZ );
		const strideY = sizeZ;
		const strideX = sizeY * sizeZ;
		for ( let x = minimum[ 0 ]; x <= maximum[ 0 ]; x ++ ) {
			for ( let y = minimum[ 1 ]; y <= maximum[ 1 ]; y ++ ) {
				let index = ( x - minimum[ 0 ] ) * strideX + ( y - minimum[ 1 ] ) * strideY;
				for ( let z = minimum[ 2 ]; z <= maximum[ 2 ]; z ++ ) values[ index ++ ] = hash3( x, y, z, normalizedSeed );
			}
		}

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
			const index = ( x0 - minimum[ 0 ] ) * strideX + ( y0 - minimum[ 1 ] ) * strideY + z0 - minimum[ 2 ];
			const x00 = lerp( values[ index ]!, values[ index + strideX ]!, tx );
			const x10 = lerp( values[ index + strideY ]!, values[ index + strideX + strideY ]!, tx );
			const x01 = lerp( values[ index + 1 ]!, values[ index + strideX + 1 ]!, tx );
			const x11 = lerp( values[ index + strideY + 1 ]!, values[ index + strideX + strideY + 1 ]!, tx );
			const y0Value = lerp( x00, x10, ty );
			const y1Value = lerp( x01, x11, ty );

			return lerp( y0Value, y1Value, tz );

		};

	}

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
