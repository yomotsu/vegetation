import { createRandom } from './random';
import { linearToSrgbByte } from './color';
import type { TextureData } from './types';

// 参考 glTF は花 1 種につき 256×256 のアトラス 1 枚。花と茎を合わせて
// その画素数を超えないよう、花は 128×128、茎は 128×256 にする。
export const FLOWERS_PETAL_TEXTURE_SIZE = 128;
export const FLOWERS_STEM_TEXTURE_WIDTH = 128;
export const FLOWERS_STEM_TEXTURE_HEIGHT = 256;
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

export interface FlowerTextureShape {
	width: number;
	height: number;
	alpha: Uint8Array;
	shade: Float32Array;
	fixed: Uint8Array;
	fixedShade: Float32Array;
}

function shapeBuffer( width: number, height: number ): FlowerTextureShape {

	const count = width * height;
	return { width, height, alpha: new Uint8Array( count ), shade: new Float32Array( count ), fixed: new Uint8Array( count ), fixedShade: new Float32Array( count ) };

}

function clamp01( value: number ): number {

	return Math.max( 0, Math.min( 1, value ) );

}

function composite( shape: FlowerTextureShape, pixel: number, coverage: number, shade: number, fixed: boolean ): void {

	if ( coverage <= 0 ) return;
	const previousAlpha = shape.alpha[ pixel ]! / 255;
	const alpha = coverage + previousAlpha * ( 1 - coverage );
	shape.shade[ pixel ] = ( shade * coverage + shape.shade[ pixel ]! * previousAlpha * ( 1 - coverage ) ) / alpha;
	shape.alpha[ pixel ] = Math.round( alpha * 255 );
	// 上に重なった色付きの画素は、下の固定色（花芯）を覆う。
	if ( fixed ) {
		shape.fixed[ pixel ] = coverage >= 0.5 || shape.fixed[ pixel ] === 1 ? 1 : 0;
		shape.fixedShade[ pixel ] = shade;
	}
	else if ( coverage >= 0.5 ) {
		shape.fixed[ pixel ] = 0;
	}

}

function rasterPolygon( shape: FlowerTextureShape, points: Point[], shadeAt: ( x: number, y: number ) => number, fixed = false ): void {

	const minX = Math.max( 0, Math.floor( Math.min( ...points.map( ( point ) => point[ 0 ] ) ) - 1 ) );
	const maxX = Math.min( shape.width - 1, Math.ceil( Math.max( ...points.map( ( point ) => point[ 0 ] ) ) + 1 ) );
	const minY = Math.max( 0, Math.floor( Math.min( ...points.map( ( point ) => point[ 1 ] ) ) - 1 ) );
	const maxY = Math.min( shape.height - 1, Math.ceil( Math.max( ...points.map( ( point ) => point[ 1 ] ) ) + 1 ) );
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
			if ( coverage[ x - minX ]! > 0 ) composite( shape, y * shape.width + x, Math.min( 1, coverage[ x - minX ]! ), shadeAt( x + 0.5, y + 0.5 ), fixed );
		}
	}

}

function rasterCircle( shape: FlowerTextureShape, centerX: number, centerY: number, radius: number, shadeAt: ( distance: number ) => number, fixed = false ): void {

	const points: Point[] = [];
	for ( let index = 0; index < 32; index ++ ) {
		const angle = index / 32 * Math.PI * 2;
		points.push( [ centerX + Math.cos( angle ) * radius, centerY + Math.sin( angle ) * radius ] );
	}
	rasterPolygon( shape, points, ( x, y ) => shadeAt( Math.hypot( x - centerX, y - centerY ) / radius ), fixed );

}

// 中心から外へ伸びる花びら 1 枚。根元が細く、先が丸い。
function rasterPetal(
	shape: FlowerTextureShape,
	centerX: number,
	centerY: number,
	angle: number,
	innerRadius: number,
	outerRadius: number,
	halfWidth: number,
	shadeAt: ( along: number, across: number ) => number,
): void {

	const sideX = - Math.sin( angle );
	const sideY = Math.cos( angle );
	const directionX = Math.cos( angle );
	const directionY = Math.sin( angle );
	const tipCenter = outerRadius - halfWidth;
	const addPoint = ( distance: number, lateral: number ): Point => [ centerX + directionX * distance + sideX * lateral, centerY + directionY * distance + sideY * lateral ];
	const points: Point[] = [ addPoint( innerRadius, halfWidth * 0.2 ), addPoint( innerRadius + ( tipCenter - innerRadius ) * 0.35, halfWidth * 0.85 ) ];
	for ( let step = 0; step <= 8; step ++ ) {
		const angleOnTip = Math.PI * 0.5 - step / 8 * Math.PI;
		points.push( addPoint( tipCenter + Math.cos( angleOnTip ) * halfWidth, Math.sin( angleOnTip ) * halfWidth ) );
	}
	points.push( addPoint( innerRadius + ( tipCenter - innerRadius ) * 0.35, - halfWidth * 0.85 ), addPoint( innerRadius, - halfWidth * 0.2 ) );
	rasterPolygon( shape, points, ( x, y ) => {
		const along = clamp01( ( ( x - centerX ) * directionX + ( y - centerY ) * directionY - innerRadius ) / ( outerRadius - innerRadius ) );
		const across = Math.min( 1, Math.abs( ( x - centerX ) * sideX + ( y - centerY ) * sideY ) / halfWidth );
		return shadeAt( along, across );
	} );

}

function flowerTextureShape( variety: 'allium' | 'daisy', seed: number ): FlowerTextureShape {

	const size = FLOWERS_PETAL_TEXTURE_SIZE;
	const shape = shapeBuffer( size, size );
	const random = createRandom( seed + 71 );
	const center = size * 0.5;

	if ( variety === 'allium' ) {
		// 参考の花房: 6 弁の星形の小花が 7 つ重なり、芯は灰緑。
		// 奥の小花は暗く、手前（中央）ほど明るく描いて房の丸みを出す。
		const florets: { x: number; y: number; depth: number }[] = [];
		for ( let index = 0; index < 6; index ++ ) {
			const angle = index / 6 * Math.PI * 2 + random.range( - 0.15, 0.15 );
			const radius = random.range( 15, 18 );
			florets.push( { x: center + Math.cos( angle ) * radius, y: center + Math.sin( angle ) * radius * 0.85, depth: random.range( 0.72, 0.86 ) } );
		}
		florets.push( { x: center + random.range( - 2, 2 ), y: center + random.range( - 2, 2 ), depth: 1 } );

		for ( const floret of florets ) {
			const outerRadius = random.range( 11, 12.5 );
			const rotation = random.range( 0, Math.PI / 3 );
			for ( let petal = 0; petal < 6; petal ++ ) {
				// 花びらは根元が暗く先が明るい。縁も少し暗くする。
				rasterPetal( shape, floret.x, floret.y, rotation + petal / 6 * Math.PI * 2, 0.5, outerRadius, outerRadius * 0.14, ( along, across ) => floret.depth * ( 0.55 + 0.5 * along - 0.14 * across * across ) );
			}
			rasterCircle( shape, floret.x, floret.y, 2.1, ( distance ) => floret.depth * ( 1.05 - 0.35 * distance ), true );
		}
	}
	else {
		// 参考の花: 幅広の花びら 11 枚、花芯は直径の約 1/4。
		// 花びらは根元が暗く先が明るい。縁と中央の筋を少し暗くする。
		const petals = 11;
		const outerRadius = 55;
		const discRadius = 14;
		const rotation = random.next() * Math.PI * 2;
		for ( let index = 0; index < petals; index ++ ) {
			const angle = rotation + index / petals * Math.PI * 2 + random.range( - 0.06, 0.06 );
			const length = outerRadius * random.range( 0.88, 1 );
			const halfWidth = length * random.range( 0.15, 0.18 );
			const tone = random.range( 0.9, 1.04 );
			rasterPetal( shape, center, center, angle, discRadius * 0.6, length, halfWidth, ( along, across ) => {
				const groove = across < 0.18 ? 0.07 * ( 1 - along ) : 0;
				return tone * ( 0.62 + 0.46 * Math.sqrt( along ) - 0.32 * across * across - groove );
			} );
		}
		// 花芯: 外周がやや暗く、中央が明るい。
		rasterCircle( shape, center, center, discRadius, ( distance ) => distance > 0.82 ? 0.72 : 1.08 - 0.3 * distance, true );
	}

	for ( let pixel = 0; pixel < shape.alpha.length; pixel ++ ) {
		if ( shape.alpha[ pixel ] === 0 ) shape.shade[ pixel ] = 1;
	}
	return shape;

}

function stemTextureShape( variety: 'allium' | 'daisy', seed: number ): FlowerTextureShape {

	const width = FLOWERS_STEM_TEXTURE_WIDTH;
	const height = FLOWERS_STEM_TEXTURE_HEIGHT;
	const shape = shapeBuffer( width, height );
	const random = createRandom( seed + 113 );
	const variantWidth = width * 0.5;
	// 茎のカード幅（allium 0.03 m / daisy 0.15 m）に対して、太さ約 9 mm になる半幅。
	const stemHalfWidth = variety === 'daisy' ? 2 : 9.5;
	// 参考 Flowers02 の葉の高さ（下から）。茎ごとに左右 1 対ずつ 2 段。
	const leafLevels = [ [ 46, 156 ], [ 101, 216 ] ];

	for ( let variant = 0; variant < 2; variant ++ ) {
		const centerX = variantWidth * ( variant + 0.5 );
		const lean = random.range( - 0.8, 0.8 );
		const stem: Point[] = [
			[ centerX - stemHalfWidth, 0 ], [ centerX + stemHalfWidth, 0 ],
			[ centerX + lean + stemHalfWidth * 0.75, height ], [ centerX + lean - stemHalfWidth * 0.75, height ],
		];
		// 茎は円柱の陰影: 中央が明るく両端が暗い。根元ほど暗い。
		rasterPolygon( shape, stem, ( x, y ) => {
			const progress = y / height;
			const middle = centerX + lean * progress;
			const across = Math.min( 1, Math.abs( x - middle ) / ( stemHalfWidth * ( 1 - 0.25 * progress ) ) );
			return ( 0.66 + 0.32 * progress ) * ( 0.78 + 0.3 * ( 1 - across * across ) );
		} );

		if ( variety === 'daisy' ) {
			for ( const level of leafLevels[ variant ]! ) {
				for ( const side of [ - 1, 1 ] ) {
					const startX = centerX + lean * level / height;
					const length = random.range( 24, 28 );
					const rise = random.range( 6, 9 );
					const drop = random.range( 18, 24 );
					const leafHalfWidth = random.range( 2.6, 3.2 );
					const levelY = level + side * random.range( 0, 6 );
					const upper: Point[] = [];
					const lower: Point[] = [];
					// 葉は一度持ち上がってから垂れる弧。先は尖る。
					for ( let step = 0; step <= 10; step ++ ) {
						const progress = step / 10;
						const leafX = startX + side * length * progress;
						const leafY = levelY + rise * progress - drop * progress * progress * progress;
						const tangentX = side * length;
						const tangentY = rise - 3 * drop * progress * progress;
						const tangentLength = Math.hypot( tangentX, tangentY );
						const normalX = - tangentY / tangentLength;
						const normalY = tangentX / tangentLength;
						const leafWidth = leafHalfWidth * Math.sin( Math.PI * Math.min( 1, progress * 1.15 ) ) ** 0.7;
						upper.push( [ leafX + normalX * leafWidth, leafY + normalY * leafWidth ] );
						lower.push( [ leafX - normalX * leafWidth, leafY - normalY * leafWidth ] );
					}
					// 葉: 根元が暗く先が明るい。中央の筋を暗く。
					rasterPolygon( shape, [ ...upper, ...lower.reverse() ], ( x ) => {
						const progress = clamp01( Math.abs( x - startX ) / length );
						return 0.72 + 0.3 * progress;
					} );
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
		width: shape.width,
		height: shape.height,
		data,
		colorFactors: factors,
		colorPixelIndices: Uint32Array.from( indices ),
	};

}

export function createColorizedFlowerTexture(
	width: number,
	height: number,
	color: number,
	alpha: Uint8Array,
	shade: Float32Array,
	fixedMask?: Uint8Array,
	fixedColor = color,
	fixedShade: Float32Array = shade,
): TextureData {

	const colorData = [ ( color >>> 16 ) & 0xff, ( color >>> 8 ) & 0xff, color & 0xff ];
	const fixedColorData = [ ( fixedColor >>> 16 ) & 0xff, ( fixedColor >>> 8 ) & 0xff, fixedColor & 0xff ];
	const data = new Uint8Array( width * height * 4 );
	const indices: number[] = [];
	for ( let pixel = 0; pixel < width * height; pixel ++ ) {
		const fixed = fixedMask?.[ pixel ] === 1;
		const shadeValue = fixed ? fixedShade[ pixel ]! : shade[ pixel ]!;
		const shadeIndex = Math.max( 0, Math.min( SHADE_LEVELS - 1, Math.round( Math.max( 0, Math.min( 2, shadeValue ) ) * SHADE_SCALE ) ) ) * 256;
		const source = fixed ? fixedColorData : colorData;
		const offset = pixel * 4;
		data[ offset ] = shadeColorLut[ shadeIndex + source[ 0 ]! ]!;
		data[ offset + 1 ] = shadeColorLut[ shadeIndex + source[ 1 ]! ]!;
		data[ offset + 2 ] = shadeColorLut[ shadeIndex + source[ 2 ]! ]!;
		data[ offset + 3 ] = alpha[ pixel ]!;
		if ( ! fixed ) indices.push( pixel );
	}
	return { width, height, data, colorFactors: shade.slice(), colorPixelIndices: Uint32Array.from( indices ) };

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

export { shapeBuffer as createFlowerTextureShape, rasterPolygon as rasterFlowerPolygon, rasterCircle as rasterFlowerCircle };
