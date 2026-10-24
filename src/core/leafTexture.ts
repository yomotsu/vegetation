import { createRandom } from './random';
import type { TextureData } from './types';

interface LeafShape {
	centerX: number;
	centerY: number;
	cosine: number;
	sine: number;
	halfLength: number;
	halfWidth: number;
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

		leaves.push( {
			centerX: random.range( 0.33, 0.67 ),
			centerY: random.range( 0.33, 0.67 ),
			cosine: Math.cos( angle ),
			sine: Math.sin( angle ),
			halfLength: random.range( 0.155, 0.23 ),
			halfWidth: random.range( 0.045, 0.075 ),
		} );

	}

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const u = ( x + 0.5 ) / size;
			const v = ( y + 0.5 ) / size;
			const offset = ( y * size + x ) * 4;
			const gray = random.int( 191, 255 );
			let opaque = false;

			for ( const leaf of leaves ) {

				const relativeX = u - leaf.centerX;
				const relativeY = v - leaf.centerY;
				const along = relativeX * leaf.sine + relativeY * leaf.cosine;
				const across = relativeX * leaf.cosine - relativeY * leaf.sine;
				const longitudinal = along / leaf.halfLength;

				if ( Math.abs( longitudinal ) > 1 ) continue;

				const pointedWidth = leaf.halfWidth * Math.sin( ( longitudinal + 1 ) * Math.PI * 0.5 ) ** 0.7;

				if ( Math.abs( across ) <= pointedWidth ) {

					opaque = true;
					break;

				}

			}

			data[ offset ] = gray;
			data[ offset + 1 ] = gray;
			data[ offset + 2 ] = gray;
			data[ offset + 3 ] = opaque ? 255 : 0;

		}

	}

	return { width: size, height: size, data };

}
