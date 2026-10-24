import { createRandom } from './random';
import type { TextureData } from './types';

type Rgb = [ number, number, number ];

const neighborOffsets: [ number, number ][] = [ [ - 1, 0 ], [ 1, 0 ], [ 0, - 1 ], [ 0, 1 ] ];
const leafLuminanceStops: [ number, number ][] = [ [ 18, 37 ], [ 31, 48 ], [ 59, 57 ], [ 85, 75 ], [ 91, 80 ] ];

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

function getNeedleColor( random: ReturnType<typeof createRandom>, bright: boolean, variation: number ): Rgb {

	const base: Rgb = bright ? [ 35, 88, 10 ] : [ 9, 30, 3 ];

	return [
		Math.round( clamp( base[ 0 ] * variation + random.range( - 3, 4 ), 0, 255 ) ),
		Math.round( clamp( base[ 1 ] * variation + random.range( - 5, 7 ), 0, 255 ) ),
		Math.round( clamp( base[ 2 ] * variation + random.range( - 2, 3 ), 0, 255 ) ),
	];

}

function mapLeafLuminance( luminance: number ): number {

	for ( let index = 1; index < leafLuminanceStops.length; index ++ ) {

		const lower = leafLuminanceStops[ index - 1 ]!;
		const upper = leafLuminanceStops[ index ]!;

		if ( luminance <= upper[ 0 ] || index === leafLuminanceStops.length - 1 ) {

			const amount = ( luminance - lower[ 0 ] ) / ( upper[ 0 ] - lower[ 0 ] );

			return lower[ 1 ] + ( upper[ 1 ] - lower[ 1 ] ) * amount;

		}

	}

	return luminance;

}

function matchLeafColorDistribution( data: Uint8Array, width: number, size: number ): void {

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const offset = ( y * width + x ) * 4;
			const red = data[ offset ]!;
			const green = data[ offset + 1 ]!;
			const blue = data[ offset + 2 ]!;

			if ( data[ offset + 3 ] === 0 || green <= red || green <= blue ) continue;

			const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
			const scale = mapLeafLuminance( luminance ) / luminance;

			data[ offset ] = Math.round( clamp( red * scale, 0, 255 ) );
			data[ offset + 1 ] = Math.round( clamp( green * scale, 0, 255 ) );
			data[ offset + 2 ] = Math.round( clamp( blue * scale - 2, 0, 255 ) );

		}

	}

}

function softenSprigCenterline( data: Uint8Array, width: number, size: number, seed: number ): void {

	const sideOffsets = [ - 10, - 9, - 8, - 7, - 6, - 5, - 4, 4, 5, 6, 7, 8, 9, 10 ];

	for ( let y = 1; y < size - 1; y ++ ) {

		const center = size * 0.5 + Math.sin( y / size * Math.PI * 1.3 + seed * 0.37 ) * size * 0.009;
		const centerX = Math.round( center );
		const sideColor = [ 0, 0, 0 ];
		let sideCount = 0;

		for ( const sideOffset of sideOffsets ) {

			const x = centerX + sideOffset;

			if ( x < 0 || x >= size ) continue;

			const offset = ( y * width + x ) * 4;

			if ( data[ offset + 3 ]! < 128 ) continue;

			for ( let channel = 0; channel < 3; channel ++ ) sideColor[ channel ]! += data[ offset + channel ]!;
			sideCount ++;

		}

		if ( sideCount === 0 ) continue;

		for ( let x = centerX - 4; x <= centerX + 4; x ++ ) {

			if ( x < 0 || x >= size ) continue;

			const offset = ( y * width + x ) * 4;

			if ( data[ offset + 3 ]! < 128 ) continue;

			for ( let channel = 0; channel < 3; channel ++ ) {

				data[ offset + channel ] = Math.round( lerp( data[ offset + channel ]!, sideColor[ channel ]! / sideCount, 0.95 ) );

			}

		}

	}

}

function drawStem( data: Uint8Array, width: number, size: number, seed: number ): void {

	const pixelScale = size / 256;
	const stemWidth = Math.max( 1.8, pixelScale * 3.2 );
	const baseStemWidth = Math.max( 1.2, pixelScale * 1.6 );
	const stemColor: Rgb = [ 58, 50, 22 ];
	const nodeSpacing = Math.max( 2.5, size / 30 );
	let previous: [ number, number ] | null = null;

	for ( let y = 0; y <= size * 1.02; y += nodeSpacing ) {

		const v = y / size;
		const center = size * 0.5 + Math.sin( v * Math.PI * 1.3 + seed * 0.37 ) * size * 0.009;
		const point: [ number, number ] = [ center, y ];
		const strokeWidth = y < size * 0.46 ? baseStemWidth : stemWidth;

		if ( previous !== null ) drawStroke( data, width, size, previous, point, strokeWidth, strokeWidth * 0.8, stemColor, stemColor );

		previous = point;

	}

}

function drawSprig( data: Uint8Array, width: number, size: number, seed: number ): void {

	const random = createRandom( seed );
	const center = size * 0.5;
	const stemPoints: [ number, number ][] = [];
	const pixelScale = size / 256;
	const nodeSpacing = Math.max( 2.5, size / 30 );

	for ( let y = size * 0.035; y <= size * 0.985; y += nodeSpacing ) {

		const v = y / size;
		const curve = Math.sin( v * Math.PI * 1.3 + seed * 0.37 ) * size * 0.009;
		const stemX = center + curve;

		stemPoints.push( [ stemX, y ] );

	}

	for ( const [ stemX, y ] of stemPoints ) {

		const v = y / size;
		const widthProfile = getSprigWidthProfile( v );
		const envelope = size * 0.31 * widthProfile;

		for ( const side of [ - 1, 1 ] ) {

			const needleCount = random.next() < 0.18 ? 2 : 1;

			for ( let needle = 0; needle < needleCount; needle ++ ) {

				const baseY = y + random.range( - 1.2, 1.2 ) * pixelScale;
				const rootX = stemX + random.range( - 0.8, 0.8 ) * pixelScale;
				const length = envelope * random.range( needle === 0 ? 0.68 : 0.48, needle === 0 ? 1.02 : 0.82 );
				const rise = length * random.range( 0.24, 0.42 );
				const curveX = side * length * random.range( 0.42, 0.61 );
				const curveY = rise * random.range( 0.38, 0.54 );
				const endX = rootX + side * length;
				const endY = Math.min( size - 1, baseY + rise );
				const midX = rootX + curveX;
				const midY = baseY + curveY;
				const variation = random.range( 0.82, 1.18 );
				const dark = getNeedleColor( random, false, variation );
				const bright = getNeedleColor( random, true, variation );
				const stemWidth = random.range( 8, 11 ) * pixelScale;
				const tipWidth = random.range( 2.4, 3.4 ) * pixelScale;

				drawStroke( data, width, size, [ rootX, baseY ], [ midX, midY ], stemWidth, ( stemWidth + tipWidth ) * 0.52, dark, bright );
				drawStroke( data, width, size, [ midX, midY ], [ endX, endY ], ( stemWidth + tipWidth ) * 0.52, tipWidth, bright, bright );

			}

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

			for ( const [ dx, dy ] of neighborOffsets ) {

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

export function createFirSprigTexture( seed: number, size = 256, padEdges = true ): TextureData {

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
	matchLeafColorDistribution( data, width, size );
	softenSprigCenterline( data, width, size, seed );
	drawStem( data, width, size, seed );
	if ( padEdges ) {

		padTextureEdges( { width, height: size, data } );

	}

	return { width, height: size, data };

}
