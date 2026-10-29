import { createRandom } from './random';
import { linearToSrgbByte } from './color';
import type { TextureData } from './types';

export const FLOWERS_TEXTURE_SIZE = 256;
const SHADE_LEVELS = 2048;
const SHADE_SCALE = ( SHADE_LEVELS - 1 ) / 2;
const shadeColorLut = new Uint8Array( SHADE_LEVELS * 256 );

for ( let channel = 0; channel < 256; channel ++ ) {
	const value = channel / 255;
	const linear = value <= 0.04045 ? value / 12.92 : ( ( value + 0.055 ) / 1.055 ) ** 2.4;
	for ( let shade = 0; shade < SHADE_LEVELS; shade ++ ) {
		const factor = shade / SHADE_SCALE;
		const output = linear * factor;
		const srgb = output <= 0.0031308 ? output * 12.92 : 1.055 * output ** ( 1 / 2.4 ) - 0.055;
		shadeColorLut[ shade * 256 + channel ] = Math.round( Math.max( 0, Math.min( 1, srgb ) ) * 255 );
	}
}

type Point = [ number, number ];

interface FlowerTextureShape {
	alpha: Uint8Array;
	shade: Float32Array;
	fixed: Uint8Array;
	fixedShade: Float32Array;
}

function shapeBuffer(): FlowerTextureShape {

	const count = FLOWERS_TEXTURE_SIZE * FLOWERS_TEXTURE_SIZE;
	return { alpha: new Uint8Array( count ), shade: new Float32Array( count ), fixed: new Uint8Array( count ), fixedShade: new Float32Array( count ) };

}

function composite( shape: FlowerTextureShape, pixel: number, coverage: number, shade: number ): void {

	if ( coverage <= 0 ) return;
	const previousAlpha = shape.alpha[ pixel ]! / 255;
	const alpha = coverage + previousAlpha * ( 1 - coverage );
	shape.shade[ pixel ] = ( shade * coverage + shape.shade[ pixel ]! * previousAlpha * ( 1 - coverage ) ) / alpha;
	shape.alpha[ pixel ] = Math.round( alpha * 255 );

}

function rasterPolygon( shape: FlowerTextureShape, points: Point[], shadeAt: ( x: number, y: number ) => number ): void {

	const minX = Math.max( 0, Math.floor( Math.min( ...points.map( ( point ) => point[ 0 ] ) ) - 1 ) );
	const maxX = Math.min( FLOWERS_TEXTURE_SIZE - 1, Math.ceil( Math.max( ...points.map( ( point ) => point[ 0 ] ) ) + 1 ) );
	const minY = Math.max( 0, Math.floor( Math.min( ...points.map( ( point ) => point[ 1 ] ) ) - 1 ) );
	const maxY = Math.min( FLOWERS_TEXTURE_SIZE - 1, Math.ceil( Math.max( ...points.map( ( point ) => point[ 1 ] ) ) + 1 ) );
	const samples = 4;
	const inverseSamples = 1 / samples;
	const coverage = new Float32Array( maxX - minX + 1 );
	const intersections: number[] = [];

	for ( let y = minY; y <= maxY; y ++ ) {
		coverage.fill( 0 );
		for ( let sy = 0; sy < samples; sy ++ ) {
			const scanY = y + ( sy + 0.5 ) / samples;
			intersections.length = 0;
			for ( let edge = 0; edge < points.length; edge ++ ) {
				const first = points[ edge ]!;
				const second = points[ ( edge + 1 ) % points.length ]!;
				if ( ( first[ 1 ] <= scanY && second[ 1 ] > scanY ) || ( second[ 1 ] <= scanY && first[ 1 ] > scanY ) ) {
					intersections.push( first[ 0 ] + ( scanY - first[ 1 ] ) / ( second[ 1 ] - first[ 1 ] ) * ( second[ 0 ] - first[ 0 ] ) );
				}
			}
			intersections.sort( ( first, second ) => first - second );
			for ( let pair = 0; pair + 1 < intersections.length; pair += 2 ) {
				const left = intersections[ pair ]!;
				const right = intersections[ pair + 1 ]!;
				for ( let x = Math.max( minX, Math.floor( left ) ); x <= Math.min( maxX, Math.ceil( right ) - 1 ); x ++ ) {
					const overlap = Math.max( 0, Math.min( x + 1, right ) - Math.max( x, left ) );
					coverage[ x - minX ] = coverage[ x - minX ]! + overlap * inverseSamples;
				}
			}
		}
		for ( let x = minX; x <= maxX; x ++ ) {
			if ( coverage[ x - minX ]! > 0 ) composite( shape, y * FLOWERS_TEXTURE_SIZE + x, coverage[ x - minX ]!, shadeAt( x + 0.5, y + 0.5 ) );
		}
	}

}

function rasterCircle( shape: FlowerTextureShape, centerX: number, centerY: number, radius: number, shade: number, fixed = false ): void {

	const points: Point[] = [];
	for ( let index = 0; index < 32; index ++ ) {
		const angle = index / 32 * Math.PI * 2;
		points.push( [ centerX + Math.cos( angle ) * radius, centerY + Math.sin( angle ) * radius ] );
	}
	rasterPolygon( shape, points, () => shade );
	if ( fixed ) {
		for ( let y = Math.max( 0, Math.floor( centerY - radius - 1 ) ); y <= Math.min( FLOWERS_TEXTURE_SIZE - 1, Math.ceil( centerY + radius + 1 ) ); y ++ ) {
			for ( let x = Math.max( 0, Math.floor( centerX - radius - 1 ) ); x <= Math.min( FLOWERS_TEXTURE_SIZE - 1, Math.ceil( centerX + radius + 1 ) ); x ++ ) {
				const pixel = y * FLOWERS_TEXTURE_SIZE + x;
				if ( shape.alpha[ pixel ] === 0 ) continue;
				if ( ( x + 0.5 - centerX ) ** 2 + ( y + 0.5 - centerY ) ** 2 <= radius * radius + radius ) {
					shape.fixed[ pixel ] = 1;
					shape.fixedShade[ pixel ] = shade;
				}
			}
		}
	}

}

function flowerTextureShape( variety: 'allium' | 'daisy', seed: number ): FlowerTextureShape {

	const shape = shapeBuffer();
	const random = createRandom( seed + 71 );

	if ( variety === 'allium' ) {
		const florets: Point[] = [ [ 128, 128 ] ];
		for ( let index = 0; index < 6; index ++ ) {
			const angle = index / 6 * Math.PI * 2 + random.range( - 0.12, 0.12 );
			const radius = random.range( 22, 26 );
			florets.push( [ 128 + Math.cos( angle ) * radius, 128 + Math.sin( angle ) * radius ] );
		}

		const centers: Point[] = [];
		for ( const [ centerX, centerY ] of florets ) {
			const outerRadius = random.range( 18, 20 );
			const halfWidth = outerRadius * 0.22;
			const rotation = random.range( - 0.2, 0.2 );
			centers.push( [ centerX, centerY ] );

			for ( let petal = 0; petal < 6; petal ++ ) {
				const angle = rotation + petal / 6 * Math.PI * 2;
				const sideX = - Math.sin( angle );
				const sideY = Math.cos( angle );
				const directionX = Math.cos( angle );
				const directionY = Math.sin( angle );
				const tipCenter = outerRadius - halfWidth * 0.72;
				const addPoint = ( distance: number, lateral: number ): Point => [ centerX + directionX * distance + sideX * lateral, centerY + directionY * distance + sideY * lateral ];
				const points: Point[] = [
					addPoint( 1, halfWidth * 0.24 ),
					addPoint( outerRadius * 0.34, halfWidth * 0.72 ),
					addPoint( tipCenter, halfWidth ),
				];

				for ( let step = 1; step <= 6; step ++ ) {
					const angleOnTip = Math.PI * 0.5 - step / 6 * Math.PI;
					points.push( addPoint( tipCenter + Math.cos( angleOnTip ) * halfWidth, Math.sin( angleOnTip ) * halfWidth ) );
				}

				points.push( addPoint( outerRadius * 0.34, - halfWidth * 0.72 ) );
				points.push( addPoint( 1, - halfWidth * 0.24 ) );
				rasterPolygon( shape, points, ( x, y ) => {
					const distance = ( x - centerX ) * directionX + ( y - centerY ) * directionY;
					const lateral = Math.abs( ( x - centerX ) * sideX + ( y - centerY ) * sideY );
					const petalShade = 0.93 + 0.12 * Math.min( 1, distance / outerRadius );
					const edgeShade = 0.12 * Math.min( 1, lateral / halfWidth );
					return petalShade - edgeShade;
				} );
			}
		}
		for ( const [ centerX, centerY ] of centers ) rasterCircle( shape, centerX, centerY, 2.2, 1.02, true );
	}
	else {
		const centerX = 128;
		const centerY = 128;
		const petals = 14;
		for ( let index = 0; index < petals; index ++ ) {
			const angle = index / petals * Math.PI * 2 + random.range( - 0.045, 0.045 );
			const innerRadius = 19 + random.range( - 2, 2 );
			const length = 82 + random.range( - 12, 12 );
			const halfWidth = length * random.range( 0.125, 0.16 );
			const sideX = - Math.sin( angle );
			const sideY = Math.cos( angle );
			const directionX = Math.cos( angle );
			const directionY = Math.sin( angle );
			const tipCenter = innerRadius + length - halfWidth * 0.65;
			const addPoint = ( distance: number, lateral: number ): Point => [ centerX + directionX * distance + sideX * lateral, centerY + directionY * distance + sideY * lateral ];
			const points: Point[] = [];
			points.push( addPoint( innerRadius, halfWidth * 0.16 ) );
			points.push( addPoint( innerRadius + 7, halfWidth * 0.66 ) );
			points.push( addPoint( tipCenter, halfWidth ) );
			for ( let step = 1; step <= 10; step ++ ) {
				const angleOnTip = Math.PI * 0.5 - step / 10 * Math.PI;
				points.push( addPoint( tipCenter + Math.cos( angleOnTip ) * halfWidth, Math.sin( angleOnTip ) * halfWidth ) );
			}
			points.push( addPoint( innerRadius + 7, - halfWidth * 0.66 ) );
			points.push( addPoint( innerRadius, - halfWidth * 0.16 ) );
			rasterPolygon( shape, points, ( x, y ) => 0.58 + 0.54 * Math.min( 1, Math.max( 0, ( Math.hypot( x - centerX, y - centerY ) - innerRadius ) / length ) ) );
		}
		rasterCircle( shape, centerX, centerY, 36, 0.68, true );
		rasterCircle( shape, centerX, centerY, 32, 0.84, true );
	}

	for ( let pixel = 0; pixel < shape.alpha.length; pixel ++ ) {
		if ( shape.alpha[ pixel ] === 0 ) shape.shade[ pixel ] = 1;
	}
	return shape;

}

function stemTextureShape( variety: 'allium' | 'daisy', seed: number ): FlowerTextureShape {

	const shape = shapeBuffer();
	const random = createRandom( seed + 113 );
	const halfWidth = FLOWERS_TEXTURE_SIZE * 0.5;

	for ( let variant = 0; variant < 2; variant ++ ) {
		const centerX = halfWidth * ( variant + 0.5 );
		const lean = random.range( - 2.5, 2.5 );
		const width = variety === 'daisy' ? 2.5 : 11;
		const stem: Point[] = [
			[ centerX - width, 1 ], [ centerX + width, 1 ],
			[ centerX + lean + width * 0.72, 255 ], [ centerX + lean - width * 0.72, 255 ],
		];
		rasterPolygon( shape, stem, ( x, y ) => 0.62 + 0.26 * Math.max( 0, Math.min( 1, y / 255 ) ) + ( Math.abs( x - centerX ) < 1 ? 0.06 : 0 ) );

		if ( variety === 'daisy' ) {
			for ( const level of [ 78, 154 ] ) {
				for ( const side of [ - 1, 1 ] ) {
					const startX = centerX + lean * level / 255;
					const length = variant === 0 ? 40 : 46;
					const drop = variant === 0 ? 28 : 32;
					const halfWidth = variant === 0 ? 5.5 : 6.2;
					const upper: Point[] = [];
					const lower: Point[] = [];
					for ( let step = 0; step <= 8; step ++ ) {
						const progress = step / 8;
						const centerLeafX = startX + side * length * progress;
						const centerLeafY = level - drop * progress * progress;
						const tangentX = side * length;
						const tangentY = - 2 * drop * progress;
						const tangentLength = Math.hypot( tangentX, tangentY );
						const normalX = - tangentY / tangentLength;
						const normalY = tangentX / tangentLength;
						const width = halfWidth * Math.sin( Math.PI * progress ) ** 0.85;
						upper.push( [ centerLeafX + normalX * width, centerLeafY + normalY * width ] );
						lower.push( [ centerLeafX - normalX * width, centerLeafY - normalY * width ] );
					}
					const leaf = [ ...upper, ...lower.reverse() ];
					rasterPolygon( shape, leaf, ( x, y ) => 0.72 + 0.2 * Math.max( 0, Math.min( 1, y / 255 ) ) );
				}
			}
		}
	}

	for ( let pixel = 0; pixel < shape.alpha.length; pixel ++ ) {
		if ( shape.alpha[ pixel ] === 0 ) shape.shade[ pixel ] = 1;
	}
	return shape;

}

function createColorPixels( shape: FlowerTextureShape, color: number, fixedColor: number ): TextureData {

	const colorData = [ ( color >>> 16 ) & 0xff, ( color >>> 8 ) & 0xff, color & 0xff ];
	const fixedColorData = [ ( fixedColor >>> 16 ) & 0xff, ( fixedColor >>> 8 ) & 0xff, fixedColor & 0xff ];
	const data = new Uint8Array( shape.alpha.length * 4 );
	const factors = shape.shade.slice();
	const indices: number[] = [];

	for ( let pixel = 0; pixel < shape.alpha.length; pixel ++ ) {
		const offset = pixel * 4;
		const fixed = shape.fixed[ pixel ] === 1;
		const shade = fixed ? shape.fixedShade[ pixel ]! : shape.shade[ pixel]!;
		const source = fixed ? fixedColorData : colorData;
		const shadeIndex = Math.max( 0, Math.min( SHADE_LEVELS - 1, Math.round( Math.max( 0, Math.min( 2, shade ) ) * SHADE_SCALE ) ) ) * 256;
		data[ offset ] = shadeColorLut[ shadeIndex + source[ 0 ]! ]!;
		data[ offset + 1 ] = shadeColorLut[ shadeIndex + source[ 1 ]! ]!;
		data[ offset + 2 ] = shadeColorLut[ shadeIndex + source[ 2 ]! ]!;
		data[ offset + 3 ] = shape.alpha[ pixel ]!;
		if ( ! fixed ) indices.push( pixel );
	}

	return {
		width: FLOWERS_TEXTURE_SIZE,
		height: FLOWERS_TEXTURE_SIZE,
		data,
		colorFactors: factors,
		colorPixelIndices: Uint32Array.from( indices ),
	};

}

export function createFlowersPetalTexture( seed: number, variety: 'allium' | 'daisy', petalColor: number, centerColor: number ): TextureData {

	return createColorPixels( flowerTextureShape( variety, seed ), petalColor, centerColor );

}

export function createFlowersStemTexture( seed: number, variety: 'allium' | 'daisy', stemColor: number ): TextureData {

	return createColorPixels( stemTextureShape( variety, seed ), stemColor, stemColor );

}

export function composeFlowersColor( texture: TextureData, color: number ): TextureData {

	if ( texture.colorFactors === undefined || texture.colorPixelIndices === undefined ) throw new Error( 'Flowers texture has no color-independent inputs' );
	const base = [ ( color >>> 16 ) & 0xff, ( color >>> 8 ) & 0xff, color & 0xff ];
	const data = texture.data.slice();
	for ( const pixel of texture.colorPixelIndices ) {
		const shade = texture.colorFactors[ pixel ]!;
		const offset = pixel * 4;
		const shadeIndex = Math.max( 0, Math.min( SHADE_LEVELS - 1, Math.round( Math.max( 0, Math.min( 2, shade ) ) * SHADE_SCALE ) ) ) * 256;
		data[ offset ] = shadeColorLut[ shadeIndex + base[ 0 ]! ]!;
		data[ offset + 1 ] = shadeColorLut[ shadeIndex + base[ 1 ]! ]!;
		data[ offset + 2 ] = shadeColorLut[ shadeIndex + base[ 2 ]! ]!;
	}
	return { ...texture, data };

}
