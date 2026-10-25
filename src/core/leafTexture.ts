import { createRandom } from './random';
import type { TextureData } from './types';

type Rgb = [ number, number, number ];

const neighborOffsets: [ number, number ][] = [ [ - 1, 0 ], [ 1, 0 ], [ 0, - 1 ], [ 0, 1 ] ];
const leafLuminanceStops: [ number, number ][] = [ [ 18, 37 ], [ 31, 47 ], [ 59, 57 ], [ 85, 76 ], [ 91, 80 ] ];
const leafBrightnessStops: [ number, Rgb ][] = [
	[ 0.05, [ 0, 43, 0 ] ],
	[ 0.15, [ 0, 59, 0 ] ],
	[ 0.3, [ 0, 70, 0 ] ],
	[ 0.45, [ 0, 80, 0 ] ],
	[ 0.6, [ 0, 93, 0 ] ],
	[ 0.75, [ 8, 99, 0 ] ],
	[ 0.9, [ 28, 102, 8 ] ],
	[ 1, [ 45, 105, 15 ] ],
];

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function lerp( a: number, b: number, amount: number ): number {

	return a + ( b - a ) * amount;

}

function mixRgb( a: Rgb, b: Rgb, amount: number ): Rgb {

	amount = clamp( amount, 0, 1 );

	return [
		Math.round( lerp( a[ 0 ], b[ 0 ], amount ) ),
		Math.round( lerp( a[ 1 ], b[ 1 ], amount ) ),
		Math.round( lerp( a[ 2 ], b[ 2 ], amount ) ),
	];

}

function getSprigWidthProfile( v: number ): number {

	const profile = Math.pow( Math.sin( Math.PI * clamp( v, 0, 1 ) ), 0.58 ) * ( 0.35 + 0.65 * v ) * Math.pow( 1 - v, 0.22 );

	return clamp( profile / 0.58, 0, 1 );

}

function setPixel( data: Uint8Array, width: number, x: number, y: number, color: Rgb, alpha = 255 ): void {

	if ( x < 0 || y < 0 || x >= width ) return;
	if ( alpha <= 0 ) return;

	const offset = ( y * width + x ) * 4;
	const sourceAlpha = alpha / 255;
	const destinationAlpha = data[ offset + 3 ]! / 255;
	const outputAlpha = sourceAlpha + destinationAlpha * ( 1 - sourceAlpha );

	for ( let channel = 0; channel < 3; channel ++ ) {

		const destination = data[ offset + channel ]!;
		const output = color[ channel ]! * sourceAlpha + destination * destinationAlpha * ( 1 - sourceAlpha );

		data[ offset + channel ] = Math.round( output / outputAlpha );

	}

	data[ offset + 3 ] = Math.round( outputAlpha * 255 );

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
			const distance = Math.sqrt( distanceX * distanceX + distanceY * distanceY );
			const coverage = clamp( lineWidth * 0.5 + 0.5 - distance, 0, 1 );

			if ( coverage === 0 ) continue;

			setPixel( data, width, x, y, [
				Math.round( lerp( startColor[ 0 ], endColor[ 0 ], amount ) ),
				Math.round( lerp( startColor[ 1 ], endColor[ 1 ], amount ) ),
				Math.round( lerp( startColor[ 2 ], endColor[ 2 ], amount ) ),
			], Math.round( coverage * 255 ) );

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

function getLeafBrightness( v: number ): Rgb {

	let lowerIndex = 0;

	for ( let index = 1; index < leafBrightnessStops.length; index ++ ) {

		if ( v <= leafBrightnessStops[ index ]![ 0 ] ) {
			lowerIndex = index - 1;
			break;

		}

		lowerIndex = index - 1;

	}

	const lower = leafBrightnessStops[ lowerIndex ]!;
	const upper = leafBrightnessStops[ lowerIndex + 1 ]!;
	const amount = ( v - lower[ 0 ] ) / ( upper[ 0 ] - lower[ 0 ] );

	return [
		lerp( lower[ 1 ][ 0 ], upper[ 1 ][ 0 ], amount ),
		lerp( lower[ 1 ][ 1 ], upper[ 1 ][ 1 ], amount ),
		lerp( lower[ 1 ][ 2 ], upper[ 1 ][ 2 ], amount ),
	];

}

function matchLeafBrightnessRamp( data: Uint8Array, width: number, size: number ): void {

	for ( let y = 0; y < size; y ++ ) {

		const totals = [ 0, 0, 0 ];
		let count = 0;

		for ( let x = 0; x < size; x ++ ) {

			const offset = ( y * width + x ) * 4;
			const red = data[ offset ]!;
			const green = data[ offset + 1 ]!;
			const blue = data[ offset + 2 ]!;

			if ( data[ offset + 3 ]! < 128 || green <= red || green <= blue ) continue;

			for ( let channel = 0; channel < 3; channel ++ ) totals[ channel ]! += data[ offset + channel ]!;
			count ++;

		}

		if ( count === 0 ) continue;

		const target = getLeafBrightness( 1 - y / ( size - 1 ) );
		const scale = target.map( ( channel, index ) => channel / ( totals[ index ]! / count ) );

		for ( let x = 0; x < size; x ++ ) {

			const offset = ( y * width + x ) * 4;
			const red = data[ offset ]!;
			const green = data[ offset + 1 ]!;
			const blue = data[ offset + 2 ]!;

			if ( data[ offset + 3 ] === 0 || green <= red || green <= blue ) continue;

			for ( let channel = 0; channel < 3; channel ++ ) {

				data[ offset + channel ] = Math.round( clamp( data[ offset + channel ]! * scale[ channel ]!, 0, 255 ) );

			}

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
	const baseStemWidth = Math.max( 4, pixelScale * 9.6 );
	const tipStemWidth = Math.max( 0.9, pixelScale * 1.25 );
	const baseY = size - 1;
	const tipY = size * 0.19;
	const stemColor: Rgb = [ 67, 52, 27 ];
	const nodeSpacing = Math.max( 2.5, size / 30 );
	const segmentCount = Math.ceil( ( baseY - tipY ) / nodeSpacing );
	let previous: [ number, number ] | null = null;
	let previousWidth = baseStemWidth;

	for ( let index = 0; index <= segmentCount; index ++ ) {

		const amount = index / segmentCount;
		const y = lerp( baseY, tipY, amount );
		const v = y / size;
		const center = size * 0.5 + Math.sin( v * Math.PI * 1.3 + seed * 0.37 ) * size * 0.009;
		const point: [ number, number ] = [ center, y ];
		const strokeWidth = lerp( baseStemWidth, tipStemWidth, Math.pow( amount, 0.72 ) );

		if ( previous !== null ) drawStroke( data, width, size, previous, point, previousWidth, strokeWidth, stemColor, stemColor );

		previous = point;
		previousWidth = strokeWidth;

	}

}

type SprigNeedleGeometry = {
	v: number;
	tipward: number;
	angle: number;
	startAngle: number;
	endAngle: number;
	root: [ number, number ];
	control: [ number, number ];
	tip: [ number, number ];
	dark: Rgb;
	bright: Rgb;
	stemWidth: number;
	tipWidth: number;
};

function getNeedleAngle( from: [ number, number ], to: [ number, number ] ): number {

	return Math.atan2( Math.abs( to[ 0 ] - from[ 0 ] ), Math.max( 0, from[ 1 ] - to[ 1 ] ) ) * 180 / Math.PI;

}

function createSprigNeedleGeometry( size: number, seed: number ): SprigNeedleGeometry[] {

	const random = createRandom( seed );
	const center = size * 0.5;
	const stemPoints: [ number, number ][] = [];
	const needles: SprigNeedleGeometry[] = [];
	const pixelScale = size / 256;
	const nodeSpacing = Math.max( 2.5, size / 26 );

	for ( let y = size * 0.035; y <= size * 0.97; y += nodeSpacing ) {

		const v = y / size;
		const curve = Math.sin( v * Math.PI * 1.3 + seed * 0.37 ) * size * 0.009;
		const stemX = center + curve;

		stemPoints.push( [ stemX, y ] );

	}

	for ( const [ stemX, y ] of stemPoints ) {

		const v = y / size;
		const tipProgress = clamp( ( 0.97 - v ) / 0.935, 0, 1 );
		const widthProfile = getSprigWidthProfile( v );
		const envelope = size * 0.375 * widthProfile;

		for ( const side of [ - 1, 1 ] ) {

			const needleCount = random.next() < 0.12 ? 2 : 1;

			for ( let needle = 0; needle < needleCount; needle ++ ) {

				const baseY = y + random.range( - 1.2, 1.2 ) * pixelScale;
				const rootX = stemX + random.range( - 0.8, 0.8 ) * pixelScale;
				const tipTaper = v >= 0.4 ? 1 : 1 - 0.45 * Math.pow( clamp( ( 0.4 - v ) / 0.4, 0, 1 ), 0.8 );
				const requestedLength = envelope * tipTaper * random.range( needle === 0 ? 0.68 : 0.48, needle === 0 ? 1.02 : 0.82 );
				const sweep = clamp( ( tipProgress - 0.1 ) / 0.8, 0, 1 );
				const smoothSweep = sweep * sweep * ( 3 - 2 * sweep );
				const angle = lerp( 70, 15, smoothSweep ) + random.range( - 1.5, 1.5 );
				const radians = angle * Math.PI / 180;
				const length = Math.min( requestedLength, Math.max( 0, baseY - 1 ) / Math.cos( radians ) );
				const horizontalReach = length * Math.sin( radians );
				const rise = length * Math.cos( radians );
				const endX = rootX + side * horizontalReach;
				const endY = Math.max( 0, baseY - rise );
				const controlX = rootX + side * horizontalReach * 0.64 * random.range( 0.96, 1.04 );
				const controlY = Math.max( endY, baseY - rise * 0.28 * random.range( 0.96, 1.04 ) );
				const variation = random.range( 0.82, 1.18 );
				const dark = getNeedleColor( random, false, variation );
				const bright = getNeedleColor( random, true, variation );
				const stemWidth = random.range( 7.7, 10.7 ) * pixelScale * 1.45;
				const tipWidth = random.range( 2.4, 3.4 ) * pixelScale * 1.45;
				const root: [ number, number ] = [ rootX, baseY ];
				const control: [ number, number ] = [ controlX, controlY ];
				const tip: [ number, number ] = [ endX, endY ];

				needles.push( {
					v: 1 - baseY / size,
					tipward: baseY - endY,
					angle: getNeedleAngle( root, tip ),
					startAngle: getNeedleAngle( root, control ),
					endAngle: getNeedleAngle( control, tip ),
					root,
					control,
					tip,
					dark,
					bright,
					stemWidth,
					tipWidth,
				} );

			}

		}

	}

	return needles;

}

export function getFirSprigNeedleGeometry( seed: number, size = 256 ): ( Pick<SprigNeedleGeometry, 'v' | 'tipward' | 'angle' | 'startAngle' | 'endAngle'> & { midWidth: number } )[] {

	return createSprigNeedleGeometry( size, seed ).map( ( needle ) => ( {
		v: needle.v,
		tipward: needle.tipward,
		angle: needle.angle,
		startAngle: needle.startAngle,
		endAngle: needle.endAngle,
		midWidth: ( needle.stemWidth + needle.tipWidth ) * 0.5,
	} ) );

}

function drawSprig( data: Uint8Array, width: number, size: number, seed: number ): void {

	const needles = createSprigNeedleGeometry( size, seed );
	const curveSegments = 8;

	for ( const needle of needles ) {

		let previous = needle.root;
		let previousWidth = needle.stemWidth;

		for ( let segment = 1; segment <= curveSegments; segment ++ ) {

			const amount = segment / curveSegments;
			const inverse = 1 - amount;
			const point: [ number, number ] = [
				inverse * inverse * needle.root[ 0 ] + 2 * inverse * amount * needle.control[ 0 ] + amount * amount * needle.tip[ 0 ],
				inverse * inverse * needle.root[ 1 ] + 2 * inverse * amount * needle.control[ 1 ] + amount * amount * needle.tip[ 1 ],
			];
			const lineWidth = lerp( needle.stemWidth, needle.tipWidth, amount );
			const startColor = mixRgb( needle.dark, needle.bright, ( segment - 1 ) / ( curveSegments * 0.5 ) );
			const endColor = mixRgb( needle.dark, needle.bright, amount / 0.5 );

			drawStroke( data, width, size, previous, point, previousWidth, lineWidth, startColor, endColor );

			previous = point;
			previousWidth = lineWidth;

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

function flipTextureVertically( data: Uint8Array, width: number, height: number ): void {

	const rowLength = width * 4;
	const temporaryRow = new Uint8Array( rowLength );

	for ( let y = 0; y < Math.floor( height / 2 ); y ++ ) {

		const top = y * rowLength;
		const bottom = ( height - y - 1 ) * rowLength;

		temporaryRow.set( data.subarray( top, top + rowLength ) );
		data.copyWithin( top, bottom, bottom + rowLength );
		data.set( temporaryRow, bottom );

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
	matchLeafBrightnessRamp( data, width, size );
	softenSprigCenterline( data, width, size, seed );
	drawStem( data, width, size, seed );
	flipTextureVertically( data, width, size );
	if ( padEdges ) {

		padTextureEdges( { width, height: size, data } );

	}

	return { width, height: size, data };

}
