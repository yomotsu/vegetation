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
	const pixelScale = size / 256;
	const nodeSpacing = Math.max( 2.5, size / 30 );

	for ( let y = size * 0.035; y <= size * 0.985; y += nodeSpacing ) {

		const v = y / size;
		const widthProfile = getSprigWidthProfile( v );
		const envelope = size * 0.31 * widthProfile;
		const curve = Math.sin( v * Math.PI * 1.3 + seed * 0.37 ) * size * 0.009;
		const stemX = center + curve;

		stemPoints.push( [ stemX, y ] );

		for ( const side of [ - 1, 1 ] ) {

			const needleCount = random.next() < 0.18 ? 2 : 1;

			for ( let needle = 0; needle < needleCount; needle ++ ) {

				const baseY = y + random.range( - 1.2, 1.2 ) * pixelScale;
				const rootX = stemX + random.range( - 1.4, 1.4 ) * pixelScale;
				const length = envelope * random.range( needle === 0 ? 0.68 : 0.48, needle === 0 ? 1.02 : 0.82 );
				const rise = length * random.range( 0.24, 0.42 );
				const curveX = side * length * random.range( 0.42, 0.61 );
				const curveY = rise * random.range( 0.38, 0.54 );
				const endX = rootX + side * length;
				const endY = Math.min( size - 1, baseY + rise );
				const midX = rootX + curveX;
				const midY = baseY + curveY;
				const dark = getNeedleColor( random, false );
				const bright = getNeedleColor( random, true );
				const stemWidth = random.range( 13.5, 16.5 ) * pixelScale;
				const tipWidth = random.range( 2.4, 3.4 ) * pixelScale;

				drawStroke( data, width, size, [ rootX, baseY ], [ midX, midY ], stemWidth, ( stemWidth + tipWidth ) * 0.52, dark, bright );
				drawStroke( data, width, size, [ midX, midY ], [ endX, endY ], ( stemWidth + tipWidth ) * 0.52, tipWidth, bright, bright );

			}

		}

	}

	for ( let i = 1; i < stemPoints.length; i ++ ) {

		const a = stemPoints[ i - 1 ]!;
		const b = stemPoints[ i ]!;

		drawStroke( data, width, size, a, b, 2.2 * pixelScale, 1.4 * pixelScale, [ 76, 49, 24 ], [ 92, 63, 31 ] );

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

export function padTextureEdges( texture: TextureData ): void {

	const tileSize = texture.height;
	const tileCount = Math.floor( texture.width / tileSize );

	for ( let tile = 0; tile < tileCount; tile ++ ) {

		const tileOffset = tile * tileSize;
		const assigned = new Uint8Array( tileSize * tileSize );
		const queue = new Int32Array( tileSize * tileSize );
		let queueEnd = 0;

		for ( let y = 0; y < tileSize; y ++ ) {

			for ( let x = 0; x < tileSize; x ++ ) {

				const localIndex = y * tileSize + x;
				const textureIndex = ( y * texture.width + tileOffset + x ) * 4;

				if ( texture.data[ textureIndex + 3 ]! > 0 ) {

					assigned[ localIndex ] = 1;
					queue[ queueEnd ++ ] = localIndex;

				}

			}

		}

		if ( queueEnd === 0 ) continue;

		let queueStart = 0;

		while ( queueStart < queueEnd ) {

			const source = queue[ queueStart ++ ]!;
			const sourceX = source % tileSize;
			const sourceY = Math.floor( source / tileSize );
			const sourceTextureIndex = ( sourceY * texture.width + tileOffset + sourceX ) * 4;

			for ( const [ dx, dy ] of [ [ - 1, 0 ], [ 1, 0 ], [ 0, - 1 ], [ 0, 1 ] ] ) {

				const x = sourceX + dx!;
				const y = sourceY + dy!;

				if ( x < 0 || x >= tileSize || y < 0 || y >= tileSize ) continue;

				const neighbor = y * tileSize + x;

				if ( assigned[ neighbor ] !== 0 ) continue;

				assigned[ neighbor ] = 1;
				queue[ queueEnd ++ ] = neighbor;

				const textureIndex = ( y * texture.width + tileOffset + x ) * 4;

				texture.data[ textureIndex ] = texture.data[ sourceTextureIndex ]!;
				texture.data[ textureIndex + 1 ] = texture.data[ sourceTextureIndex + 1 ]!;
				texture.data[ textureIndex + 2 ] = texture.data[ sourceTextureIndex + 2 ]!;

			}

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
	padTextureEdges( { width, height: size, data } );

	return { width, height: size, data };

}

export function createLeafClusterTexture( seed: number, size = 256 ): TextureData {

	return createFirSprigTexture( seed, size );

}
