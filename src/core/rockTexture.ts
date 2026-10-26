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
	const offset = [ ( seed * 13.7 ) % 61, ( seed * 27.1 ) % 73, ( seed * 41.9 ) % 89 ];
	const heightMap = new Float32Array( size * size );
	const albedoData = new Uint8Array( size * size * 4 );
	const normalData = new Uint8Array( size * size * 4 );

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const direction = getRockDirection( x / size, y / size );
			const broad = noise( direction[ 0 ] * 1.8 + offset[ 0 ]!, direction[ 1 ] * 1.8 + offset[ 1 ]!, direction[ 2 ] * 1.8 + offset[ 2 ]! );
			const medium = noise( direction[ 0 ] * 5.2 - offset[ 2 ]!, direction[ 1 ] * 5.2 + offset[ 0 ]!, direction[ 2 ] * 5.2 - offset[ 1 ]! );
			const strata = noise(
				direction[ 0 ] * 4.4 + offset[ 2 ]!,
				direction[ 1 ] * 15 + offset[ 0 ]! + medium * 1.8,
				direction[ 2 ] * 4.4 - offset[ 1 ]!,
			);
			const fracture = noise( direction[ 0 ] * 13 + offset[ 1 ]!, direction[ 1 ] * 16 - offset[ 2 ]!, direction[ 2 ] * 13 + offset[ 0 ]! );
			const grain = noise( direction[ 0 ] * 58 + offset[ 2 ]!, direction[ 1 ] * 58 - offset[ 0 ]!, direction[ 2 ] * 58 + offset[ 1 ]! );
			const crackDistance = Math.abs( fracture );
			const crack = 1 - smoothstep( 0.035, 0.095, crackDistance );
			const crackEdge = smoothstep( 0.075, 0.12, crackDistance ) * ( 1 - smoothstep( 0.15, 0.22, crackDistance ) );
			const brightness = broad * 21 + medium * 10 + strata * 5 + grain * 1.2 - crack * 9 + crackEdge * 1.8;
			const index = y * size + x;

			heightMap[ index ] = broad * 0.022 + medium * 0.014 + strata * 0.007 + grain * 0.0008 - crack * 0.0018 + crackEdge * 0.001;
			albedoData[ index * 4 ] = Math.round( clamp( 82 + brightness * 0.93, 0, 255 ) );
			albedoData[ index * 4 + 1 ] = Math.round( clamp( 96 + brightness, 0, 255 ) );
			albedoData[ index * 4 + 2 ] = Math.round( clamp( 103 + brightness * 1.05, 0, 255 ) );
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
			const latitude = y / ( size - 1 );
			const poleFade = smoothstep( 0, 0.04, latitude ) * smoothstep( 0, 0.04, 1 - latitude );
			const normalX = - ( right - left ) * size * 0.65 * poleFade;
			const normalY = - ( up - down ) * size * 0.65 * poleFade;
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
