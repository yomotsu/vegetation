import { createNoise3D } from './noise';
import type { TextureData } from './types';

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function smoothstep( minimum: number, maximum: number, value: number ): number {

	const amount = clamp( ( value - minimum ) / ( maximum - minimum ), 0, 1 );

	return amount * amount * ( 3 - 2 * amount );

}

function getRockDirection( u: number, v: number ): [ number, number, number ] {

	const theta = u * Math.PI * 2;
	const phi = ( v - 0.5 ) * Math.PI;
	const latitude = Math.cos( phi );

	return [ latitude * Math.cos( theta ), Math.sin( phi ), latitude * Math.sin( theta ) ];

}

export function createRockTextures( seed: number, size = 256 ): { albedo: TextureData; normal: TextureData } {

	const noise = createNoise3D( seed + 419 );
	const noiseOffset = [ ( seed * 13.7 ) % 61, ( seed * 27.1 ) % 73, ( seed * 41.9 ) % 89 ];
	const heightMap = new Float32Array( size * size );
	const albedoData = new Uint8Array( size * size * 4 );
	const normalData = new Uint8Array( size * size * 4 );

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const direction = getRockDirection( x / size, y / size );
			const broad = noise( direction[ 0 ] * 2.2 + noiseOffset[ 0 ]!, direction[ 1 ] * 2.2 + noiseOffset[ 1 ]!, direction[ 2 ] * 2.2 + noiseOffset[ 2 ]! );
			const flow = noise( direction[ 0 ] * 2.9 - noiseOffset[ 2 ]!, direction[ 1 ] * 2.9 + noiseOffset[ 0 ]!, direction[ 2 ] * 2.9 - noiseOffset[ 1 ]! );
			const brush = noise( direction[ 0 ] * 5.4 + noiseOffset[ 1 ]!, direction[ 1 ] * 5.4 - noiseOffset[ 2 ]!, direction[ 2 ] * 5.4 + noiseOffset[ 0 ]! );
			const phase = ( direction[ 1 ] * 4.35 + flow * 0.68 + broad * 0.16 ) * Math.PI * 2;
			const strata = Math.sin( phase * 0.58 + broad * 0.16 );
			const crack = 1 - smoothstep( 0.008, 0.035, Math.abs( Math.sin( phase * 0.5 ) ) );
			const tone = 0.5 + broad * 0.27 + brush * 0.15 + strata * 0.34 - crack * 0.34;
			const index = y * size + x;
			const colorTone = clamp( tone, 0, 1 );

			heightMap[ index ] = broad * 0.012 + strata * 0.014 + brush * 0.003 - crack * 0.0025;
			albedoData[ index * 4 ] = Math.round( clamp( 64 + colorTone * 32, 0, 255 ) );
			albedoData[ index * 4 + 1 ] = Math.round( clamp( 79 + colorTone * 32, 0, 255 ) );
			albedoData[ index * 4 + 2 ] = Math.round( clamp( 86 + colorTone * 32, 0, 255 ) );
			albedoData[ index * 4 + 3 ] = 255;

		}

	}

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const index = y * size + x;
			const left = heightMap[ y * size + ( x + size - 1 ) % size ]!;
			const right = heightMap[ y * size + ( x + 1 ) % size ]!;
			const down = heightMap[ Math.max( 0, y - 1 ) * size + x ]!;
			const up = heightMap[ Math.min( size - 1, y + 1 ) * size + x ]!;
			const normalX = - ( right - left ) * size * 0.6;
			const normalY = - ( up - down ) * size * 0.6;
			const inverseLength = 1 / Math.hypot( normalX, normalY, 1 );

			normalData[ index * 4 ] = Math.round( ( normalX * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 1 ] = Math.round( ( normalY * inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 2 ] = Math.round( ( inverseLength * 0.5 + 0.5 ) * 255 );
			normalData[ index * 4 + 3 ] = 255;

		}

	}

	return {
		albedo: { width: size, height: size, data: albedoData, wrapS: 'repeat', wrapT: 'clamp' },
		normal: { width: size, height: size, data: normalData, wrapS: 'repeat', wrapT: 'clamp' },
	};

}
