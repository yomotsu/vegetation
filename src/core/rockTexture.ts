import { createNoise3D } from './noise';
import type { TextureData } from './types';

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function getRockDirection( u: number, v: number ): [ number, number, number ] {

	const theta = u * Math.PI * 2;
	const phi = ( v - 0.5 ) * Math.PI;
	const latitude = Math.cos( phi );

	return [ latitude * Math.cos( theta ), Math.sin( phi ), latitude * Math.sin( theta ) ];

}

export function createRockTextures( seed: number, size = 256 ): { albedo: TextureData; normal: TextureData } {

	const noise = createNoise3D( seed + 419 );
	const heightMap = new Float32Array( size * size );
	const albedoData = new Uint8Array( size * size * 4 );
	const normalData = new Uint8Array( size * size * 4 );

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const direction = getRockDirection( x / size, y / size );
			const broad = noise( direction[ 0 ] * 4, direction[ 1 ] * 4, direction[ 2 ] * 4 );
			const medium = noise( direction[ 0 ] * 15, direction[ 1 ] * 15, direction[ 2 ] * 15 );
			const grain = noise( direction[ 0 ] * 43, direction[ 1 ] * 43, direction[ 2 ] * 43 );
			const height = broad * 0.024 + medium * 0.01 + grain * 0.003;
			const index = y * size + x;
			const colorNoise = broad * 0.58 + medium * 0.3 + grain * 0.12;
			const base = 94 + colorNoise * 25;

			heightMap[ index ] = height;
			albedoData[ index * 4 ] = Math.round( clamp( base - 14, 0, 255 ) );
			albedoData[ index * 4 + 1 ] = Math.round( clamp( base - 1, 0, 255 ) );
			albedoData[ index * 4 + 2 ] = Math.round( clamp( base + 6, 0, 255 ) );
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
