import { createRandom } from './random';
import { hexToLinear, linearToSrgbByte } from './color';
import type { TextureData } from './types';

export const GRASS_TEXTURE_SIZE = 256;

const BLADES_PER_CARD = 14;
const CARD_EDGE_INSET = GRASS_TEXTURE_SIZE * 0.015;
const ROOT_SHADE = 0.45;
const NORMAL_SPREAD = 0.9;
const curveSegments = 10;
const SHADE_LUT_LEVELS = 2048;
const SHADE_LUT_SCALE = ( SHADE_LUT_LEVELS - 1 ) / 2;
const shadeColorLut = new Uint8Array( SHADE_LUT_LEVELS * 256 );

for ( let channel = 0; channel < 256; channel ++ ) {

	const linear = hexToLinear( channel << 16 )[ 0 ];
	for ( let shadeIndex = 0; shadeIndex < SHADE_LUT_LEVELS; shadeIndex ++ ) {
		shadeColorLut[ shadeIndex * 256 + channel ] = linearToSrgbByte( linear * shadeIndex / SHADE_LUT_SCALE );
	}

}

interface GrassTextureShape {
	alpha: Uint8Array;
	shade: Float32Array;
	facing: Float32Array;
	normal: Uint8Array;
	colorPixelIndices: Uint32Array;
}

interface BladeShape {
	points: [ number, number ][];
	rootY: number;
	tipY: number;
	shade: number;
	facing: number;
}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function toShadeIndex( factor: number ): number {

	return Math.round( clamp( factor, 0, 2 ) * SHADE_LUT_SCALE );

}

function quadratic( a: [ number, number ], b: [ number, number ], c: [ number, number ], t: number ): [ number, number ] {

	const inverse = 1 - t;
	return [ inverse * inverse * a[ 0 ] + 2 * inverse * t * b[ 0 ] + t * t * c[ 0 ], inverse * inverse * a[ 1 ] + 2 * inverse * t * b[ 1 ] + t * t * c[ 1 ] ];

}

function createBladeShape( random: ReturnType<typeof createRandom> ): BladeShape {

	const inset = CARD_EDGE_INSET;
	const maximumHalfWidth = GRASS_TEXTURE_SIZE * 0.044;
	const rootX = inset + maximumHalfWidth + random.range( 0, GRASS_TEXTURE_SIZE - inset * 2 - maximumHalfWidth * 2 );
	const halfWidth = GRASS_TEXTURE_SIZE * random.range( 0.022, 0.044 );
	const tipX = clamp( rootX + random.range( - 0.25, 0.25 ) * ( GRASS_TEXTURE_SIZE - inset * 2 ), inset + maximumHalfWidth, GRASS_TEXTURE_SIZE - inset - maximumHalfWidth );
	const rootY = inset;
	const height = ( GRASS_TEXTURE_SIZE - inset * 2 ) * random.range( 0.5, 1 );
	const tipY = rootY + height;
	const bulgeSide = random.next() < 0.5 ? - 1 : 1;
	const midX = ( rootX + tipX ) * 0.5 + bulgeSide * random.range( 0.015, 0.06 ) * GRASS_TEXTURE_SIZE;
	const midY = ( rootY + tipY ) * 0.5;
	const leftRoot: [ number, number ] = [ rootX - halfWidth, rootY ];
	const leftControl: [ number, number ] = [ midX - halfWidth * 0.6, midY ];
	const rightRoot: [ number, number ] = [ rootX + halfWidth, rootY ];
	const rightControl: [ number, number ] = [ midX + halfWidth * 0.6, midY ];
	const tip: [ number, number ] = [ tipX, tipY ];
	const points: [ number, number ][] = [];

	for ( let segment = 0; segment <= curveSegments; segment ++ ) points.push( quadratic( leftRoot, leftControl, tip, segment / curveSegments ) );
	for ( let segment = curveSegments - 1; segment >= 0; segment -- ) points.push( quadratic( rightRoot, rightControl, tip, segment / curveSegments ) );

	const lean = ( tipX - rootX ) / Math.max( 1, height );
	const facing = clamp( lean * 0.9 + random.range( - 0.2, 0.2 ), - 0.5, 0.5 );

	return { points, rootY, tipY, shade: random.range( 0.78, 1 ), facing };

}

function rasterizeBlade( shape: BladeShape, alpha: Uint8Array, shade: Float32Array, facing: Float32Array, scratch: Float32Array ): void {

	let minX = GRASS_TEXTURE_SIZE;
	let maxX = 0;
	let minY = GRASS_TEXTURE_SIZE;
	let maxY = 0;

	for ( const point of shape.points ) {
		minX = Math.min( minX, point[ 0 ] );
		maxX = Math.max( maxX, point[ 0 ] );
		minY = Math.min( minY, point[ 1 ] );
		maxY = Math.max( maxY, point[ 1 ] );
	}

	minX = Math.max( 0, Math.floor( minX - 1 ) );
	maxX = Math.min( GRASS_TEXTURE_SIZE - 1, Math.ceil( maxX + 1 ) );
	minY = Math.max( 0, Math.floor( minY - 1 ) );
	maxY = Math.min( GRASS_TEXTURE_SIZE - 1, Math.ceil( maxY + 1 ) );

	for ( let y = minY; y <= maxY; y ++ ) scratch.fill( 0, y * GRASS_TEXTURE_SIZE + minX, y * GRASS_TEXTURE_SIZE + maxX + 1 );

	const intersections = new Float32Array( shape.points.length );

	for ( let y = minY; y <= maxY; y ++ ) {
		for ( let sample = 0; sample < 4; sample ++ ) {
			const scanY = y + ( sample + 0.5 ) * 0.25;
			let intersectionCount = 0;

			for ( let edge = 0; edge < shape.points.length; edge ++ ) {
				const first = shape.points[ edge ]!;
				const second = shape.points[ ( edge + 1 ) % shape.points.length ]!;
				if ( ( first[ 1 ] <= scanY && second[ 1 ] > scanY ) || ( second[ 1 ] <= scanY && first[ 1 ] > scanY ) ) {
					intersections[ intersectionCount ++ ] = first[ 0 ] + ( scanY - first[ 1 ] ) / ( second[ 1 ] - first[ 1 ] ) * ( second[ 0 ] - first[ 0 ] );
				}
			}

			if ( intersectionCount < 2 ) continue;
			let left = intersections[ 0 ]!;
			let right = intersections[ 1 ]!;
			if ( left > right ) [ left, right ] = [ right, left ];
			const firstX = Math.max( minX, Math.floor( left ) );
			const lastX = Math.min( maxX, Math.ceil( right ) - 1 );

			for ( let x = firstX; x <= lastX; x ++ ) {
				const overlap = Math.max( 0, Math.min( x + 1, right ) - Math.max( x, left ) ) * 0.25;
				if ( overlap > 0 ) scratch[ y * GRASS_TEXTURE_SIZE + x ] = scratch[ y * GRASS_TEXTURE_SIZE + x ]! + overlap;
			}
		}
	}

	for ( let y = minY; y <= maxY; y ++ ) {
		const progress = clamp( ( y + 0.5 - shape.rootY ) / ( shape.tipY - shape.rootY ), 0, 1 );
		const bladeShade = shape.shade * ( ROOT_SHADE + ( 1 - ROOT_SHADE ) * progress );

		for ( let x = minX; x <= maxX; x ++ ) {
			const pixel = y * GRASS_TEXTURE_SIZE + x;
			const coverage = scratch[ pixel ]!;
			if ( coverage <= 0 ) continue;

			const oldAlpha = alpha[ pixel ]! / 255;
			const outAlpha = coverage + oldAlpha * ( 1 - coverage );
			const previousWeight = oldAlpha * ( 1 - coverage );
			shade[ pixel ] = ( bladeShade * coverage + shade[ pixel ]! * previousWeight ) / outAlpha;
			facing[ pixel ] = ( shape.facing * coverage + facing[ pixel ]! * previousWeight ) / outAlpha;
			alpha[ pixel ] = Math.round( outAlpha * 255 );
		}
	}

}

function createGrassTextureShape( seed: number ): GrassTextureShape {

	const pixelCount = GRASS_TEXTURE_SIZE * GRASS_TEXTURE_SIZE;
	const alpha = new Uint8Array( pixelCount );
	const shade = new Float32Array( pixelCount );
	const facing = new Float32Array( pixelCount );
	const random = createRandom( seed );
	const scratch = new Float32Array( pixelCount );

	for ( let blade = 0; blade < BLADES_PER_CARD; blade ++ ) rasterizeBlade( createBladeShape( random ), alpha, shade, facing, scratch );

	let shadeSum = 0;
	let shadeCount = 0;
	for ( let pixel = 0; pixel < pixelCount; pixel ++ ) {
		if ( alpha[ pixel ]! < 102 ) continue;
		shadeSum += shade[ pixel ]!;
		shadeCount ++;
	}

	const shadeScale = shadeCount === 0 ? 1 : shadeCount / shadeSum;
	for ( let pixel = 0; pixel < pixelCount; pixel ++ ) {

		// 透明部には平均色を入れて、ミップで輪郭が黒くならないようにする。
		shade[ pixel ] = alpha[ pixel ] === 0 ? 1 : shade[ pixel ]! * shadeScale;

	}

	const normal = new Uint8Array( pixelCount * 4 );
	const colorPixelIndices = new Uint32Array( pixelCount );

	for ( let pixel = 0; pixel < pixelCount; pixel ++ ) {
		const offset = pixel * 4;
		if ( alpha[ pixel ] === 0 ) {
			normal[ offset ] = 128;
			normal[ offset + 1 ] = 128;
			normal[ offset + 2 ] = 255;
		} else {
			const normalX = facing[ pixel ]! * 2 * NORMAL_SPREAD;
			const normalZ = Math.sqrt( Math.max( 0, 1 - normalX * normalX ) );
			normal[ offset ] = Math.round( ( normalX * 0.5 + 0.5 ) * 255 );
			normal[ offset + 1 ] = 128;
			normal[ offset + 2 ] = Math.round( ( normalZ * 0.5 + 0.5 ) * 255 );
		}
		normal[ offset + 3 ] = 255;
		colorPixelIndices[ pixel ] = pixel;
	}

	return { alpha, shade, facing, normal, colorPixelIndices };

}

export function createGrassBladeTextures( seed: number, color: number ): { blade: TextureData; normal: TextureData } {

	const shape = createGrassTextureShape( seed );
	const pixelCount = GRASS_TEXTURE_SIZE * GRASS_TEXTURE_SIZE;
	const colorData = new Uint8Array( pixelCount * 4 );
	const baseRed = ( color >>> 16 ) & 0xff;
	const baseGreen = ( color >>> 8 ) & 0xff;
	const baseBlue = color & 0xff;

	for ( let pixel = 0; pixel < pixelCount; pixel ++ ) {
		const offset = pixel * 4;
		const lutOffset = toShadeIndex( shape.shade[ pixel ]! ) * 256;
		colorData[ offset ] = shadeColorLut[ lutOffset + baseRed ]!;
		colorData[ offset + 1 ] = shadeColorLut[ lutOffset + baseGreen ]!;
		colorData[ offset + 2 ] = shadeColorLut[ lutOffset + baseBlue ]!;
		colorData[ offset + 3 ] = shape.alpha[ pixel ]!;
	}

	return {
		blade: {
			width: GRASS_TEXTURE_SIZE,
			height: GRASS_TEXTURE_SIZE,
			data: colorData,
			colorFactors: shape.shade,
			colorPixelIndices: shape.colorPixelIndices,
		},
		normal: {
			width: GRASS_TEXTURE_SIZE,
			height: GRASS_TEXTURE_SIZE,
			data: shape.normal,
		},
	};

}

export function composeGrassBladeTexture( texture: TextureData, color: number ): TextureData {

	if ( texture.colorFactors === undefined || texture.colorPixelIndices === undefined ) {
		throw new Error( 'Grass blade texture has no color-independent inputs' );
	}

	const data = texture.data.slice();
	const base: [ number, number, number ] = [ ( color >>> 16 ) & 0xff, ( color >>> 8 ) & 0xff, color & 0xff ];

	for ( const pixel of texture.colorPixelIndices ) {
		const lutOffset = toShadeIndex( texture.colorFactors[ pixel ]! ) * 256;
		const offset = pixel * 4;
		data[ offset ] = shadeColorLut[ lutOffset + base[ 0 ] ]!;
		data[ offset + 1 ] = shadeColorLut[ lutOffset + base[ 1 ] ]!;
		data[ offset + 2 ] = shadeColorLut[ lutOffset + base[ 2 ] ]!;
	}

	return { ...texture, data };

}
