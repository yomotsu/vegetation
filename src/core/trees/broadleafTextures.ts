import { createRandom } from '../random';
import type { Random } from '../random';
import type { TextureData } from '../types';

export const BROADLEAF_LEAF_TEXTURE_SIZE = 512;
export const STYLIZED_BARK_TEXTURE_WIDTH = 256;
export const STYLIZED_BARK_TEXTURE_HEIGHT = 512;

const leafMargin = 4;

interface Leaf {
	x: number;
	y: number;
	angle: number;
	length: number;
	width: number;
	tone: number;
}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

// 両端がとがった楕円の葉。u は付け根 0 → 先端 1、戻り値は半幅（0〜1）。
function leafHalfWidth( u: number ): number {

	if ( u <= 0 || u >= 1 ) return 0;
	return Math.pow( Math.sin( Math.PI * Math.pow( u, 0.85 ) ), 0.9 );

}

function encodeNormal( data: Uint8Array, offset: number, x: number, y: number, z: number ): void {

	const length = Math.hypot( x, y, z );
	data[ offset ] = Math.round( ( x / length * 0.5 + 0.5 ) * 255 );
	data[ offset + 1 ] = Math.round( ( y / length * 0.5 + 0.5 ) * 255 );
	data[ offset + 2 ] = Math.round( ( z / length * 0.5 + 0.5 ) * 255 );
	data[ offset + 3 ] = 255;

}

function addTwigLeaves( random: Random, leaves: Leaf[], twigs: [ number, number, number, number ][], size: number, angle: number, reach: number ): void {

	const center = size * 0.5;
	const endX = center + Math.cos( angle ) * reach;
	const endY = center + Math.sin( angle ) * reach;
	twigs.push( [ center, center, endX, endY ] );
	const pairCount = 3;

	// 小枝に沿って左右に対生させ、先端に 1 枚。
	for ( let pair = 0; pair < pairCount; pair ++ ) {

		const t = 0.3 + 0.62 * pair / ( pairCount - 1 );
		const x = center + Math.cos( angle ) * reach * t;
		const y = center + Math.sin( angle ) * reach * t;

		for ( const side of [ - 1, 1 ] ) {

			const length = size * random.range( 0.13, 0.155 ) * ( 0.85 + t * 0.3 );
			leaves.push( {
				x,
				y,
				angle: angle + side * random.range( 0.7, 0.95 ),
				length,
				width: length * random.range( 0.2, 0.24 ),
				tone: random.range( 0.82, 1 ),
			} );

		}

	}

	const tipLength = size * random.range( 0.14, 0.16 );
	leaves.push( { x: endX, y: endY, angle: angle + random.range( - 0.15, 0.15 ), length: tipLength, width: tipLength * 0.22, tone: random.range( 0.86, 1 ) } );

}

/**
 * 中心から放射状に伸びる小枝に楕円の葉を対生させた房。色はグレー（マテリアル色を乗算）、
 * 法線マップは主脈で折れた葉と葉脈の溝。
 */
export function createBroadleafLeafTextures( seed: number, size = BROADLEAF_LEAF_TEXTURE_SIZE ): { color: TextureData; normal: TextureData } {

	const random = createRandom( seed * 31 + 7 );
	const leaves: Leaf[] = [];
	const twigs: [ number, number, number, number ][] = [];
	const twigCount = 7;
	const startAngle = random.range( 0, Math.PI * 2 );

	for ( let twig = 0; twig < twigCount; twig ++ ) {

		const angle = startAngle + twig / twigCount * Math.PI * 2 + random.range( - 0.2, 0.2 );
		addTwigLeaves( random, leaves, twigs, size, angle, size * random.range( 0.24, 0.28 ) );

	}

	// 中央の隙間を埋める葉。
	for ( let index = 0; index < 4; index ++ ) {

		const length = size * random.range( 0.12, 0.14 );
		leaves.push( { x: size * 0.5, y: size * 0.5, angle: startAngle + ( index + 0.5 ) / 4 * Math.PI * 2, length, width: length * 0.22, tone: random.range( 0.85, 1 ) } );

	}

	// 描く順をばらし、重なりの上下を混ぜる。
	for ( let index = leaves.length - 1; index > 0; index -- ) {

		const other = random.int( 0, index );
		const swap = leaves[ index ]!;
		leaves[ index ] = leaves[ other ]!;
		leaves[ other ] = swap;

	}

	const color = new Uint8Array( size * size * 4 );
	const normal = new Uint8Array( size * size * 4 );

	for ( let index = 0; index < size * size; index ++ ) {

		normal[ index * 4 ] = 128;
		normal[ index * 4 + 1 ] = 128;
		normal[ index * 4 + 2 ] = 255;
		normal[ index * 4 + 3 ] = 255;

	}

	for ( const [ ax, ay, bx, by ] of twigs ) {

		const length = Math.hypot( bx - ax, by - ay );
		const steps = Math.ceil( length );
		const radius = size * 0.0045;

		for ( let step = 0; step <= steps; step ++ ) {

			const cx = ax + ( bx - ax ) * step / steps;
			const cy = ay + ( by - ay ) * step / steps;

			for ( let y = Math.floor( cy - radius ); y <= Math.ceil( cy + radius ); y ++ ) {

				for ( let x = Math.floor( cx - radius ); x <= Math.ceil( cx + radius ); x ++ ) {

					if ( Math.hypot( x - cx, y - cy ) > radius ) continue;
					const offset = ( y * size + x ) * 4;
					color[ offset ] = 150;
					color[ offset + 1 ] = 140;
					color[ offset + 2 ] = 120;
					color[ offset + 3 ] = 255;

				}

			}

		}

	}

	for ( const leaf of leaves ) {

		const cos = Math.cos( leaf.angle );
		const sin = Math.sin( leaf.angle );
		const tipX = leaf.x + cos * leaf.length;
		const tipY = leaf.y + sin * leaf.length;
		const minX = Math.max( leafMargin, Math.floor( Math.min( leaf.x, tipX ) - leaf.width ) );
		const maxX = Math.min( size - leafMargin - 1, Math.ceil( Math.max( leaf.x, tipX ) + leaf.width ) );
		const minY = Math.max( leafMargin, Math.floor( Math.min( leaf.y, tipY ) - leaf.width ) );
		const maxY = Math.min( size - leafMargin - 1, Math.ceil( Math.max( leaf.y, tipY ) + leaf.width ) );

		for ( let y = minY; y <= maxY; y ++ ) {

			for ( let x = minX; x <= maxX; x ++ ) {

				const dx = x + 0.5 - leaf.x;
				const dy = y + 0.5 - leaf.y;
				const u = ( dx * cos + dy * sin ) / leaf.length;
				const v = ( - dx * sin + dy * cos ) / leaf.width;
				const half = leafHalfWidth( u );
				if ( Math.abs( v ) >= half ) continue;

				const across = v / half;
				// 側脈: 主脈から先端側へ斜めに走る溝。
				const veinPhase = ( ( u * 7 - Math.abs( across ) * 1.6 ) % 1 + 1 ) % 1;
				const vein = u > 0.08 && u < 0.88 && Math.abs( across ) < 0.85 ? Math.max( 0, 1 - Math.abs( veinPhase - 0.5 ) * 10 ) : 0;
				const midrib = Math.abs( v ) < 0.06 ? 1 - Math.abs( v ) / 0.06 : 0;
				const edge = 1 - Math.abs( across );
				const value = leaf.tone * ( 0.84 + 0.16 * clamp( u * 1.4, 0, 1 ) ) * ( 1 - vein * 0.06 ) * ( 1 - midrib * 0.12 ) * ( edge < 0.1 ? 0.9 : 1 );
				const offset = ( y * size + x ) * 4;
				const byte = Math.round( clamp( value, 0, 1 ) * 235 );
				color[ offset ] = byte;
				color[ offset + 1 ] = byte;
				color[ offset + 2 ] = byte;
				color[ offset + 3 ] = 255;

				// 主脈で山折りにし、葉脈は浅い溝にする。葉の座標から画像の座標へ戻す。
				const fold = Math.sign( across ) * 0.35 * ( 1 - edge * 0.4 );
				const veinSlope = vein * 0.25 * Math.sign( veinPhase - 0.5 );
				const localX = - veinSlope * 0.3;
				const localY = fold + veinSlope;
				encodeNormal( normal, offset, localX * cos - localY * sin, localX * sin + localY * cos, 1 );

			}

		}

	}

	return {
		color: { width: size, height: size, data: color },
		normal: { width: size, height: size, data: normal },
	};

}

/**
 * 縦に長い溝が揺れながら走る手描き風の樹皮。上下左右にタイルする。色はグレー寄り
 * （マテリアル色を乗算）、法線マップは溝の高さから作る。
 */
export function createStylizedBarkTextures(
	seed: number,
	width = STYLIZED_BARK_TEXTURE_WIDTH,
	height = STYLIZED_BARK_TEXTURE_HEIGHT,
): { color: TextureData; normal: TextureData } {

	const random = createRandom( seed * 17 + 3 );
	const grooveCount = random.int( 6, 7 );
	const grooves: { x: number; waves: { k: number; amplitude: number; phase: number }[]; width: number; breakPhase: number; breakCount: number }[] = [];

	for ( let index = 0; index < grooveCount; index ++ ) {

		grooves.push( {
			x: ( index + random.range( - 0.25, 0.25 ) ) / grooveCount,
			waves: [ 1, 2, 3 ].map( ( k ) => ( { k, amplitude: random.range( 0.004, 0.014 ) / k, phase: random.range( 0, Math.PI * 2 ) } ) ),
			width: random.range( 0.014, 0.024 ),
			breakPhase: random.range( 0, Math.PI * 2 ),
			breakCount: random.int( 1, 3 ),
		} );

	}

	// 溝の間を流れる細い繊維。高さの差は小さくする。
	const strandCount = 18;
	const strands: { x: number; amplitude: number; phase: number; k: number; depth: number }[] = [];

	for ( let index = 0; index < strandCount; index ++ ) {

		strands.push( { x: random.next(), amplitude: random.range( 0.004, 0.012 ), phase: random.range( 0, Math.PI * 2 ), k: random.int( 1, 3 ), depth: random.range( 0.15, 0.35 ) } );

	}

	const heightField = new Float32Array( width * height );

	// 溝と繊維の中心・幅は行ごとに決まるので、先に求めてから画素を埋める。
	const centers = new Float32Array( grooveCount + strandCount );
	const halfWidths = new Float32Array( grooveCount + strandCount );
	const depths = new Float32Array( grooveCount + strandCount );

	for ( let y = 0; y < height; y ++ ) {

		const v = y / height;

		for ( let index = 0; index < grooveCount; index ++ ) {

			const entry = grooves[ index ]!;
			let center = entry.x;
			for ( const wave of entry.waves ) center += Math.sin( v * Math.PI * 2 * wave.k + wave.phase ) * wave.amplitude;
			// 溝はところどころで細くなって途切れる。
			const pinch = clamp( ( 0.55 + 0.45 * Math.sin( v * Math.PI * 2 * entry.breakCount + entry.breakPhase ) ) * 1.4, 0, 1 );
			centers[ index ] = center;
			halfWidths[ index ] = entry.width * pinch;
			depths[ index ] = 1;

		}

		for ( let index = 0; index < strandCount; index ++ ) {

			const strand = strands[ index ]!;
			centers[ grooveCount + index ] = strand.x + Math.sin( v * Math.PI * 2 * strand.k + strand.phase ) * strand.amplitude;
			halfWidths[ grooveCount + index ] = 0.008;
			depths[ grooveCount + index ] = strand.depth;

		}

		for ( let x = 0; x < width; x ++ ) {

			const u = x / width;
			let groove = 0;

			for ( let index = 0; index < centers.length; index ++ ) {

				const halfWidth = halfWidths[ index ]!;
				if ( halfWidth <= 0.002 ) continue;
				let distance = u - centers[ index ]!;
				distance -= Math.round( distance );
				const t = Math.abs( distance ) / halfWidth;
				if ( t < 1 ) groove = Math.max( groove, ( 1 - t * t ) * depths[ index ]! );

			}

			heightField[ y * width + x ] = 1 - groove;

		}

	}

	const color = new Uint8Array( width * height * 4 );
	const normal = new Uint8Array( width * height * 4 );
	const strength = 2.2;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			const index = y * width + x;
			const left = heightField[ y * width + ( x + width - 1 ) % width ]!;
			const right = heightField[ y * width + ( x + 1 ) % width ]!;
			const down = heightField[ ( ( y + height - 1 ) % height ) * width + x ]!;
			const up = heightField[ ( ( y + 1 ) % height ) * width + x ]!;
			encodeNormal( normal, index * 4, ( left - right ) * strength, ( down - up ) * strength, 1 );
			const groove = 1 - heightField[ index ]!;
			const value = groove > 0.6 ? 0.55 : groove > 0.4 ? 0.68 : groove > 0.12 ? 0.8 : 0.88;
			color[ index * 4 ] = Math.round( value * 255 );
			color[ index * 4 + 1 ] = Math.round( value * 0.98 * 255 );
			color[ index * 4 + 2 ] = Math.round( value * 0.95 * 255 );
			color[ index * 4 + 3 ] = 255;

		}

	}

	return {
		color: { width, height, data: color, wrap: 'repeat' },
		normal: { width, height, data: normal, wrap: 'repeat' },
	};

}
