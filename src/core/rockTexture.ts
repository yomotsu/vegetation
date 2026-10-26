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
			const broad = noise( direction[ 0 ] * 1.4 + noiseOffset[ 0 ]!, direction[ 1 ] * 1.4 + noiseOffset[ 1 ]!, direction[ 2 ] * 1.4 + noiseOffset[ 2 ]! );
			const middle = noise( direction[ 0 ] * 3.6 - noiseOffset[ 2 ]!, direction[ 1 ] * 3.6 + noiseOffset[ 0 ]!, direction[ 2 ] * 3.6 - noiseOffset[ 1 ]! );
			const detail = noise( direction[ 0 ] * 8.5 + noiseOffset[ 1 ]!, direction[ 1 ] * 8.5 - noiseOffset[ 2 ]!, direction[ 2 ] * 8.5 + noiseOffset[ 0 ]! );
			const layerHeight = direction[ 1 ] + middle * 0.05 + broad * 0.015;
			const phase = layerHeight * Math.PI * 2 * 2.6 + detail * 0.12;
			const strata = Math.cos( phase );
			const crackDistance = Math.abs( Math.sin( phase * 0.5 + middle * 0.08 ) );
			const layerVisibility = smoothstep( - 0.2, 0.35, detail );
			const crackLine = 1 - smoothstep( 0.008, 0.028, crackDistance );
			const crack = crackLine * layerVisibility;
			const fractureDistance = Math.abs( middle );
			const fractureLine = 1 - smoothstep( 0.02, 0.065, fractureDistance );
			const fracture = fractureLine * ( 0.5 + smoothstep( - 0.2, 0.3, detail ) * 0.5 );
			const edgeHighlight = 1 - smoothstep( 0.025, 0.09, Math.abs( fractureDistance - 0.1 ) );
			const layerHighlight = ( 1 - smoothstep( 0.025, 0.085, Math.abs( crackDistance - 0.09 ) ) ) * layerVisibility;
			const brightness = broad * 16 + middle * 12 + detail * 8 + strata * ( 0.8 + layerVisibility * 1.4 ) - crack * 6 - fracture * 6 + edgeHighlight * 2 + layerHighlight;
			const index = y * size + x;

			heightMap[ index ] = broad * 0.027 + middle * 0.018 + strata * 0.006 + detail * 0.0075 - crack * 0.002 - fracture * 0.004 + edgeHighlight * 0.001;
			albedoData[ index * 4 ] = Math.round( clamp( 82 + brightness * 0.94, 0, 255 ) );
			albedoData[ index * 4 + 1 ] = Math.round( clamp( 98 + brightness, 0, 255 ) );
			albedoData[ index * 4 + 2 ] = Math.round( clamp( 105 + brightness * 1.05, 0, 255 ) );
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
