import { createRandom } from './random';
import type { TextureData } from './types';

interface LeafShape {
	centerX: number;
	centerY: number;
	cosine: number;
	sine: number;
	halfLength: number;
	halfWidth: number;
	baseGray: number;
}

export function createLeafClusterTexture( seed: number, size = 128 ): TextureData {

	if ( ! Number.isInteger( size ) || size < 1 ) {
		throw new RangeError( 'Texture size must be a positive integer' );
	}

	const random = createRandom( seed );
	const data = new Uint8Array( size * size * 4 );
	const leaves: LeafShape[] = [];

	for ( let i = 0; i < 20; i ++ ) {

		const angle = random.range( - Math.PI, Math.PI );
		const halfLength = random.range( 0.15, 0.18 );
		let centerX = random.range( 0.07, 0.93 );
		let centerY = random.range( 0.07, 0.93 );

		for ( let attempt = 0; attempt < 12; attempt ++ ) {

			if ( leaves.every( ( leaf ) => Math.hypot( centerX - leaf.centerX, centerY - leaf.centerY ) >= 0.13 ) ) {

				break;

			}

			centerX = random.range( 0.07, 0.93 );
			centerY = random.range( 0.07, 0.93 );

		}

		leaves.push( {
			centerX,
			centerY,
			cosine: Math.cos( angle ),
			sine: Math.sin( angle ),
			halfLength,
			halfWidth: halfLength / random.range( 1.65, 1.95 ),
			baseGray: random.int( 191, 225 ),
		} );

	}

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const u = ( x + 0.5 ) / size;
			const v = ( y + 0.5 ) / size;
			const offset = ( y * size + x ) * 4;
			let gray = 191;
			let opaque = false;

			for ( const leaf of leaves ) {

				const relativeX = u - leaf.centerX;
				const relativeY = v - leaf.centerY;
				const along = relativeX * leaf.sine + relativeY * leaf.cosine;
				const across = relativeX * leaf.cosine - relativeY * leaf.sine;
				const longitudinal = along / leaf.halfLength;

				if ( Math.abs( longitudinal ) > 1 ) {

					continue;

				}

				const pointedWidth = leaf.halfWidth * Math.sin( ( longitudinal + 1 ) * Math.PI * 0.5 ) ** 0.7;

				if ( pointedWidth > 0 && Math.abs( across ) <= pointedWidth ) {

					opaque = true;
					const crossGradient = 1 - Math.abs( across ) / pointedWidth;
					const lengthGradient = 1 - longitudinal * longitudinal;
					const brightness = leaf.baseGray + ( 255 - leaf.baseGray ) * ( 0.12 + lengthGradient * 0.58 + crossGradient * 0.3 );
					gray = Math.max( gray, Math.min( 255, Math.round( brightness ) ) );

				}

			}

			data[ offset ] = opaque ? gray : 255;
			data[ offset + 1 ] = opaque ? gray : 255;
			data[ offset + 2 ] = opaque ? gray : 255;
			data[ offset + 3 ] = opaque ? 255 : 0;

		}

	}

	return { width: size, height: size, data };

}
