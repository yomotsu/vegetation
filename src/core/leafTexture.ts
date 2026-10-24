import { createRandom } from './random';
import type { TextureData } from './types';

type Rgb = [ number, number, number ];

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function lerp( a: number, b: number, amount: number ): number {

	return a + ( b - a ) * amount;

}

function getSprigWidthProfile( v: number ): number {

	const profile = Math.pow( Math.sin( Math.PI * clamp( v, 0, 1 ) ), 0.58 ) * ( 0.35 + 0.65 * v ) * Math.pow( 1 - v, 0.22 );

	return clamp( profile / 0.58, 0, 1 );

}

function setPixel( data: Uint8Array, width: number, x: number, y: number, color: Rgb, alpha = 255 ): void {

	if ( x < 0 || y < 0 || x >= width ) return;

	const offset = ( y * width + x ) * 4;

	data[ offset ] = color[ 0 ];
	data[ offset + 1 ] = color[ 1 ];
	data[ offset + 2 ] = color[ 2 ];
	data[ offset + 3 ] = alpha;

}

function drawStroke(
	data: Uint8Array,
	width: number,
	height: number,
	from: [ number, number ],
	to: [ number, number ],
	startWidth: number,
	endWidth: number,
	startColor: Rgb,
	endColor: Rgb,
): void {

	const dx = to[ 0 ] - from[ 0 ];
	const dy = to[ 1 ] - from[ 1 ];
	const lengthSquared = dx * dx + dy * dy;
	const radius = Math.max( startWidth, endWidth ) * 0.5 + 1;
	const minX = Math.max( 0, Math.floor( Math.min( from[ 0 ], to[ 0 ] ) - radius ) );
	const maxX = Math.min( width - 1, Math.ceil( Math.max( from[ 0 ], to[ 0 ] ) + radius ) );
	const minY = Math.max( 0, Math.floor( Math.min( from[ 1 ], to[ 1 ] ) - radius ) );
	const maxY = Math.min( height - 1, Math.ceil( Math.max( from[ 1 ], to[ 1 ] ) + radius ) );

	for ( let y = minY; y <= maxY; y ++ ) {

		for ( let x = minX; x <= maxX; x ++ ) {

			const amount = lengthSquared === 0 ? 0 : clamp( ( ( x - from[ 0 ] ) * dx + ( y - from[ 1 ] ) * dy ) / lengthSquared, 0, 1 );
			const closestX = from[ 0 ] + dx * amount;
			const closestY = from[ 1 ] + dy * amount;
			const lineWidth = lerp( startWidth, endWidth, amount );

			const distanceX = x - closestX;
			const distanceY = y - closestY;

			if ( distanceX * distanceX + distanceY * distanceY > lineWidth * lineWidth * 0.25 ) continue;

			setPixel( data, width, x, y, [
				Math.round( lerp( startColor[ 0 ], endColor[ 0 ], amount ) ),
				Math.round( lerp( startColor[ 1 ], endColor[ 1 ], amount ) ),
				Math.round( lerp( startColor[ 2 ], endColor[ 2 ], amount ) ),
			], 255 );

		}

	}

}

function getNeedleColor( random: ReturnType<typeof createRandom>, bright: boolean ): Rgb {

	const variation = random.range( 0.72, 1.25 );
	const base: Rgb = bright ? [ 35, 88, 10 ] : [ 9, 30, 3 ];

	return [
		Math.round( clamp( base[ 0 ] * variation + random.range( - 3, 4 ), 0, 255 ) ),
		Math.round( clamp( base[ 1 ] * variation + random.range( - 5, 7 ), 0, 255 ) ),
		Math.round( clamp( base[ 2 ] * variation + random.range( - 2, 3 ), 0, 255 ) ),
	];

}

function drawSprig( data: Uint8Array, width: number, size: number, seed: number ): void {

	const random = createRandom( seed );
	const center = size * 0.5;
	const stemPoints: [ number, number ][] = [];
	const nodeSpacing = Math.max( 2.2, size / 82 );

	for ( let y = size * 0.035; y <= size * 0.985; y += nodeSpacing ) {

		const v = y / size;
		const widthProfile = getSprigWidthProfile( v );
		const envelope = size * 0.31 * widthProfile;
		const curve = Math.sin( v * Math.PI * 1.3 + seed * 0.37 ) * size * 0.009;
		const stemX = center + curve;

		stemPoints.push( [ stemX, y ] );

		for ( const side of [ - 1, 1 ] ) {

			const needleCount = random.int( 3, 4 );

			for ( let needle = 0; needle < needleCount; needle ++ ) {

				const baseY = y + random.range( - 0.7, 0.7 );
				const rootX = stemX + random.range( - 0.9, 0.9 );
				const length = envelope * random.range( needle === 0 ? 0.65 : 0.42, needle === 0 ? 1.02 : 0.76 );
				const rise = length * random.range( 0.24, 0.48 );
				const curveX = side * length * random.range( 0.48, 0.7 );
				const curveY = rise * random.range( 0.42, 0.62 );
				const endX = rootX + side * length;
				const endY = Math.min( size - 1, baseY + rise );
				const midX = rootX + curveX;
				const midY = baseY + curveY;
				const dark = getNeedleColor( random, false );
				const bright = getNeedleColor( random, true );
				const stemWidth = random.range( 1.5, 2.8 );
				const tipWidth = random.range( 0.85, 1.35 );

				drawStroke( data, width, size, [ rootX, baseY ], [ midX, midY ], stemWidth, ( stemWidth + tipWidth ) * 0.5, dark, bright );
				drawStroke( data, width, size, [ midX, midY ], [ endX, endY ], ( stemWidth + tipWidth ) * 0.5, tipWidth, bright, bright );

			}

		}

	}

	for ( let i = 1; i < stemPoints.length; i ++ ) {

		const a = stemPoints[ i - 1 ]!;
		const b = stemPoints[ i ]!;

		drawStroke( data, width, size, a, b, 2.2, 1.4, [ 76, 49, 24 ], [ 92, 63, 31 ] );

	}

}

function drawCrownSilhouette( data: Uint8Array, width: number, size: number, tileOffset: number, seed: number ): void {

	for ( let y = 0; y < size; y ++ ) {

		const v = ( y + 0.5 ) / size;
		const radius = 0.49 * Math.pow( Math.max( 0, 1 - v ), 1.12 ) + 0.006;
		const tierRipple = Math.sin( v * Math.PI * 16 + seed * 0.23 ) * 0.012 + Math.sin( v * Math.PI * 31 + seed ) * 0.005;
		const edge = Math.max( 0, radius + tierRipple );

		for ( let x = 0; x < size; x ++ ) {

			const u = ( x + 0.5 ) / size;
			const variation = Math.sin( ( u * 31 + v * 7 + seed * 0.01 ) * Math.PI ) * 5;

			if ( Math.abs( u - 0.5 ) > edge ) continue;

			const shade = Math.round( clamp( 0.68 * ( 1 - v ) + 0.32 + variation / 255, 0.24, 0.98 ) );
			const offset = ( y * width + tileOffset + x ) * 4;

			data[ offset ] = Math.round( 18 + shade * 43 );
			data[ offset + 1 ] = Math.round( 48 + shade * 83 );
			data[ offset + 2 ] = Math.round( 8 + shade * 18 );
			data[ offset + 3 ] = 255;

		}

	}

}

export function createFirSprigTexture( seed: number, size = 256, includeCrownSilhouettes = true ): TextureData {

	if ( ! Number.isInteger( size ) || size < 1 ) {
		throw new RangeError( 'Texture size must be a positive integer' );
	}

	const width = size * 3;
	const data = new Uint8Array( width * size * 4 );

	for ( let i = 0; i < data.length; i += 4 ) {
		data[ i ] = 255;
		data[ i + 1 ] = 255;
		data[ i + 2 ] = 255;
	}

	drawSprig( data, width, size, seed );
	if ( includeCrownSilhouettes ) {

		drawCrownSilhouette( data, width, size, size, seed );
		drawCrownSilhouette( data, width, size, size * 2, seed + 1 );
	
	}

	return { width, height: size, data };

}

export function createLeafClusterTexture( seed: number, size = 256 ): TextureData {

	return createFirSprigTexture( seed, size );

}
