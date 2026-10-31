import { createRandom } from '../random';
import type { Random } from '../random';
import type { TextureData } from '../types';

export const LEAF_SPRAY_TEXTURE_SIZE = 512;
export const WILLOW_CANOPY_TEXTURE_SIZE = 256;
export const STYLIZED_BARK_TEXTURE_WIDTH = 256;
export const STYLIZED_BARK_TEXTURE_HEIGHT = 512;
export const FIR_FROND_TEXTURE_WIDTH = 512;
export const FIR_FROND_TEXTURE_HEIGHT = 1024;
export const FIR_FROND_MIDRIB_COLOR = 0x5c5446;

const defaultFirFrondColor = 0x3f8a55;
const frondRed = defaultFirFrondColor >> 16 & 0xff;
const frondGreen = defaultFirFrondColor >> 8 & 0xff;
const frondBlue = defaultFirFrondColor & 0xff;

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

// 楕円の葉を 1 枚、色（グレー）と法線マップへ描く。wrapY / wrapX なら上下 / 左右の端でつなげる（繰り返す画像用）。
function drawLeaf( color: Uint8Array, normal: Uint8Array, width: number, height: number, leaf: Leaf, wrapY = false, wrapX = false ): void {

	const cos = Math.cos( leaf.angle );
	const sin = Math.sin( leaf.angle );
	const tipX = leaf.x + cos * leaf.length;
	const tipY = leaf.y + sin * leaf.length;
	const lowX = Math.floor( Math.min( leaf.x, tipX ) - leaf.width );
	const highX = Math.ceil( Math.max( leaf.x, tipX ) + leaf.width );
	const minX = wrapX ? lowX : Math.max( leafMargin, lowX );
	const maxX = wrapX ? highX : Math.min( width - leafMargin - 1, highX );
	const lowY = Math.floor( Math.min( leaf.y, tipY ) - leaf.width );
	const highY = Math.ceil( Math.max( leaf.y, tipY ) + leaf.width );
	const minY = wrapY ? lowY : Math.max( leafMargin, lowY );
	const maxY = wrapY ? highY : Math.min( height - leafMargin - 1, highY );

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
			const offset = ( ( ( y % height ) + height ) % height * width + ( ( x % width ) + width ) % width ) * 4;
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

// size は房の大きさ、( cx, cy ) は房の中心。
function addTwigLeaves( random: Random, leaves: Leaf[], twigs: [ number, number, number, number ][], size: number, angle: number, reach: number, cx: number, cy: number ): void {

	const endX = cx + Math.cos( angle ) * reach;
	const endY = cy + Math.sin( angle ) * reach;
	twigs.push( [ cx, cy, endX, endY ] );
	const pairCount = 3;

	// 小枝に沿って左右に対生させ、先端に 1 枚。
	for ( let pair = 0; pair < pairCount; pair ++ ) {

		const t = 0.3 + 0.62 * pair / ( pairCount - 1 );
		const x = cx + Math.cos( angle ) * reach * t;
		const y = cy + Math.sin( angle ) * reach * t;

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

// 7 本の小枝と、中央の隙間を埋める 4 枚の葉。
function addLeafSpray( random: Random, leaves: Leaf[], twigs: [ number, number, number, number ][], size: number, cx: number, cy: number ): void {

	const twigCount = 7;
	const startAngle = random.range( 0, Math.PI * 2 );

	for ( let twig = 0; twig < twigCount; twig ++ ) {

		const angle = startAngle + twig / twigCount * Math.PI * 2 + random.range( - 0.2, 0.2 );
		addTwigLeaves( random, leaves, twigs, size, angle, size * random.range( 0.24, 0.28 ), cx, cy );

	}

	for ( let index = 0; index < 4; index ++ ) {

		const length = size * random.range( 0.12, 0.14 );
		leaves.push( { x: cx, y: cy, angle: startAngle + ( index + 0.5 ) / 4 * Math.PI * 2, length, width: length * 0.22, tone: random.range( 0.85, 1 ) } );

	}

}

/**
 * 中心から放射状に伸びる小枝に楕円の葉を対生させた房。色はグレー（マテリアル色を乗算）、
 * 法線マップは主脈で折れた葉と葉脈の溝。
 * sprayCount が 4 なら、2×2 の区画に房を 1 つずつ描く。全体を貼った大きなカードは房 4 つ分になり、
 * カードの枚数（頂点数）を減らせる。区画 1 つを貼れば房 1 つの小さなカードにもなる。
 */
export function createLeafSprayTextures( seed: number, size = LEAF_SPRAY_TEXTURE_SIZE, sprayCount: 1 | 4 = 1 ): { color: TextureData; normal: TextureData } {

	const random = createRandom( seed * 31 + 7 );

	if ( sprayCount === 1 ) {

		const leaves: Leaf[] = [];
		const twigs: [ number, number, number, number ][] = [];
		addLeafSpray( random, leaves, twigs, size, size * 0.5, size * 0.5 );
		const layer = renderLeafSpray( random, leaves, twigs, size, size * 0.0045 );
		return {
			color: { width: size, height: size, data: layer.color },
			normal: { width: size, height: size, data: layer.normal },
		};

	}

	// 2×2 の区画に房を 1 つずつ置く。房は 1 つだけ描き、90° ずつ回して（ときどき裏返して）各区画へ貼り込む。4 回描くより速い。
	// 大きなカードは全体を貼って房 4 つ、小さなカードは区画 1 つだけを貼って房 1 つにする。
	const sub = size / 2;
	const leaves: Leaf[] = [];
	const twigs: [ number, number, number, number ][] = [];
	addLeafSpray( random, leaves, twigs, sub, sub * 0.5, sub * 0.5 );
	const layer = renderLeafSpray( random, leaves, twigs, sub, sub * 0.0045 );
	const color = new Uint8Array( size * size * 4 );
	const normal = new Uint8Array( size * size * 4 );

	for ( let index = 0; index < size * size; index ++ ) {

		normal[ index * 4 ] = 128;
		normal[ index * 4 + 1 ] = 128;
		normal[ index * 4 + 2 ] = 255;
		normal[ index * 4 + 3 ] = 255;

	}

	for ( let spray = 0; spray < sprayCount; spray ++ ) {

		const originX = ( spray % 2 ) * sub;
		const originY = Math.floor( spray / 2 ) * sub;
		const flip = random.next() < 0.5;
		const last = sub - 1;

		for ( let sy = 0; sy < sub; sy ++ ) {

			for ( let sx = 0; sx < sub; sx ++ ) {

				const source = ( sy * sub + sx ) * 4;
				if ( layer.color[ source + 3 ]! === 0 ) continue;

				// 画素の位置と法線の xy を同じだけ回す（spray × 90°）。
				let u = sx;
				let v = sy;
				let nx = layer.normal[ source ]!;
				let ny = layer.normal[ source + 1 ]!;

				for ( let turn = 0; turn < spray; turn ++ ) {

					const nextU = last - v;
					v = u;
					u = nextU;
					const nextNx = 255 - ny;
					ny = nx;
					nx = nextNx;

				}

				if ( flip ) {

					u = last - u;
					nx = 255 - nx;

				}

				const target = ( ( originY + v ) * size + originX + u ) * 4;
				color[ target ] = layer.color[ source ]!;
				color[ target + 1 ] = layer.color[ source + 1 ]!;
				color[ target + 2 ] = layer.color[ source + 2 ]!;
				color[ target + 3 ] = 255;
				normal[ target ] = nx;
				normal[ target + 1 ] = ny;
				normal[ target + 2 ] = layer.normal[ source + 2 ]!;
				normal[ target + 3 ] = 255;

			}

		}

	}

	return {
		color: { width: size, height: size, data: color },
		normal: { width: size, height: size, data: normal },
	};

}

// 房の葉と小枝を size × size の画像へ描く。描く順はばらして重なりの上下を混ぜる。
function renderLeafSpray( random: Random, leaves: Leaf[], twigs: readonly [ number, number, number, number ][], size: number, twigRadius: number ): { color: Uint8Array; normal: Uint8Array } {

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

		for ( let step = 0; step <= steps; step ++ ) {

			const cx = ax + ( bx - ax ) * step / steps;
			const cy = ay + ( by - ay ) * step / steps;

			for ( let y = Math.floor( cy - twigRadius ); y <= Math.ceil( cy + twigRadius ); y ++ ) {

				for ( let x = Math.floor( cx - twigRadius ); x <= Math.ceil( cx + twigRadius ); x ++ ) {

					if ( Math.hypot( x - cx, y - cy ) > twigRadius ) continue;
					const offset = ( y * size + x ) * 4;
					color[ offset ] = 150;
					color[ offset + 1 ] = 140;
					color[ offset + 2 ] = 120;
					color[ offset + 3 ] = 255;

				}

			}

		}

	}

	for ( const leaf of leaves ) drawLeaf( color, normal, size, size, leaf );

	return { color, normal };

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

/**
 * 中心から放射状に伸びる小枝の先に、細い針葉を扇状に束ねた房。色はグレー（マテリアル色を乗算）、
 * 法線マップは針葉を細い円柱として丸める。
 */
export function createNeedleSprayTextures( seed: number, size = LEAF_SPRAY_TEXTURE_SIZE ): { color: TextureData; normal: TextureData } {

	const random = createRandom( seed * 43 + 11 );
	const color = new Uint8Array( size * size * 4 );
	const normal = new Uint8Array( size * size * 4 );

	for ( let index = 0; index < size * size; index ++ ) {

		normal[ index * 4 ] = 128;
		normal[ index * 4 + 1 ] = 128;
		normal[ index * 4 + 2 ] = 255;
		normal[ index * 4 + 3 ] = 255;

	}

	const drawSegment = ( ax: number, ay: number, bx: number, by: number, radius: number, value: number, twig: boolean ): void => {

		const dx = bx - ax;
		const dy = by - ay;
		const lengthSquared = dx * dx + dy * dy;
		const length = Math.sqrt( lengthSquared );
		const minX = Math.max( leafMargin, Math.floor( Math.min( ax, bx ) - radius ) );
		const maxX = Math.min( size - leafMargin - 1, Math.ceil( Math.max( ax, bx ) + radius ) );
		const minY = Math.max( leafMargin, Math.floor( Math.min( ay, by ) - radius ) );
		const maxY = Math.min( size - leafMargin - 1, Math.ceil( Math.max( ay, by ) + radius ) );

		for ( let y = minY; y <= maxY; y ++ ) {

			for ( let x = minX; x <= maxX; x ++ ) {

				const px = x + 0.5 - ax;
				const py = y + 0.5 - ay;
				const t = clamp( ( px * dx + py * dy ) / lengthSquared, 0, 1 );
				// 針葉は先へ向かって細くなる。
				const localRadius = twig ? radius : radius * ( 1 - t * 0.6 );
				const cross = ( px * dy - py * dx ) / length;
				const along = Math.hypot( px - dx * t, py - dy * t );
				if ( along > localRadius ) continue;
				const offset = ( y * size + x ) * 4;
				const across = clamp( cross / localRadius, - 1, 1 );
				// 針葉は先ほど明るい（小枝は一様）。
				const shade = twig ? value : value * Math.min( 1.1, 0.7 + 0.45 * t );
				const byte = Math.round( clamp( shade, 0, 1 ) * 235 );
				color[ offset ] = byte;
				color[ offset + 1 ] = twig ? Math.round( byte * 0.55 ) : byte;
				color[ offset + 2 ] = twig ? Math.round( byte * 0.4 ) : byte;
				color[ offset + 3 ] = 255;
				// 針葉の断面を半円として、幅方向へ法線を傾ける。
				const tilt = across * 0.8;
				encodeNormal( normal, offset, dy / length * tilt, - dx / length * tilt, Math.sqrt( Math.max( 0.2, 1 - tilt * tilt ) ) );

			}

		}

	};

	// 針葉の房（筆の穂先のように、付け根から前へ扇状に開く）。
	const drawTuft = ( x: number, y: number, angle: number, length: number, needleCount: number ): void => {

		for ( let needle = 0; needle < needleCount; needle ++ ) {

			// 中央に寄せた扇。両端の針葉ほど短い。
			const offset = ( random.next() + random.next() - 1 ) * 1.05;
			const needleAngle = angle + offset;
			const needleLength = length * random.range( 0.7, 1 ) * ( 1 - Math.abs( offset ) * 0.3 );
			// 付け根を少しずらして、房の根元を太くする。
			const back = random.range( 0, length * 0.12 );
			const x0 = x - Math.cos( angle ) * back;
			const y0 = y - Math.sin( angle ) * back;
			drawSegment( x0, y0, x0 + Math.cos( needleAngle ) * needleLength, y0 + Math.sin( needleAngle ) * needleLength, size * 0.0055, random.range( 0.7, 1 ), false );

		}

	};

	// 茶色い小枝がカードを下から上へ通り、左右互い違いに出た脇枝の先に房が付く。房と房の間に小枝と隙間が見える。
	// カードの上（v = 1、画像の下端の行）は世界の上に近いので、房は上向きの筆になる。付け根は縁から離して塊の中に隠す。
	const direction = Math.PI * 0.5 + random.range( - 0.35, 0.35 );
	const dx = Math.cos( direction );
	const dy = Math.sin( direction );
	const baseX = size * 0.5 - dx * size * 0.28;
	const baseY = size * 0.5 - dy * size * 0.28;
	const tipX = size * 0.5 + dx * size * 0.12;
	const tipY = size * 0.5 + dy * size * 0.12;
	const tufts: { x: number; y: number; angle: number; length: number }[] = [ { x: tipX, y: tipY, angle: direction, length: size * random.range( 0.26, 0.3 ) } ];
	const sideCount = 4;
	const branchlets: [ number, number, number, number ][] = [];

	for ( let side = 0; side < sideCount; side ++ ) {

		const t = 0.1 + side / sideCount * 0.78 + random.range( - 0.04, 0.04 );
		const fromX = baseX + ( tipX - baseX ) * t;
		const fromY = baseY + ( tipY - baseY ) * t;
		const sideAngle = direction + ( side % 2 === 0 ? 1 : - 1 ) * random.range( 0.75, 1.05 );
		// 付け根に近い脇枝ほど長く、房も大きい。
		const scale = 1.15 - side / sideCount * 0.35;
		const reach = size * random.range( 0.13, 0.17 ) * scale;
		const toX = fromX + Math.cos( sideAngle ) * reach;
		const toY = fromY + Math.sin( sideAngle ) * reach;
		branchlets.push( [ fromX, fromY, toX, toY ] );
		tufts.push( { x: toX, y: toY, angle: sideAngle, length: size * random.range( 0.2, 0.24 ) * scale } );

	}

	drawSegment( baseX, baseY, tipX, tipY, size * 0.008, 0.95, true );
	for ( const [ fromX, fromY, toX, toY ] of branchlets ) drawSegment( fromX, fromY, toX, toY, size * 0.0055, 0.95, true );
	for ( const tuft of tufts ) drawTuft( tuft.x, tuft.y, tuft.angle, tuft.length, 70 );

	return {
		color: { width: size, height: size, data: color },
		normal: { width: size, height: size, data: normal },
	};

}

// 枝の葉の片側の幅（最大を 1 とする割合）。付け根 (v = 0) から中ほどで最も広く、先端へ細る。
// 枝のジオメトリは左右の帯の幅をこれに合わせ、テクスチャの小枝もこの幅に収める。帯の u = 0.5 が枝、u = 0 / 1 が縁。
export function firFrondWidth( v: number ): number {

	const t = clamp( v, 0, 1 );
	// 実物のモミも stylized なモミも、小枝の長さは枝の途中でほぼ一定。付け根で少し短く、先端の 3 割で細る。
	return ( 0.88 + 0.12 * Math.min( 1, t / 0.15 ) ) * ( t < 0.7 ? 1 : 1 - 0.55 * ( t - 0.7 ) / 0.3 );

}

function firFrondOutlineHalfWidth( v: number ): number {

	if ( v <= 0 || v >= 1 ) return 0;
	return 0.5 * firFrondWidth( v );

}

// 1 本の針葉（tree の小枝テクスチャと同じ描き方）。付け根から先へ前方に反る 2 次曲線で、付け根が太く先へ細る。
// 色は付け根が暗く、前半で明るくなって後半は明るいまま。法線は太さ方向に丸める。
function drawFirNeedle(
	color: Uint8Array,
	normal: Uint8Array,
	colorFactors: Float32Array,
	width: number,
	height: number,
	root: [ number, number ],
	control: [ number, number ],
	tip: [ number, number ],
	rootWidth: number,
	tipWidth: number,
	factor: number,
): void {

	const segments = 4;
	let previous = root;

	for ( let segment = 1; segment <= segments; segment ++ ) {

		const amount = segment / segments;
		const inverse = 1 - amount;
		const point: [ number, number ] = [
			inverse * inverse * root[ 0 ] + 2 * inverse * amount * control[ 0 ] + amount * amount * tip[ 0 ],
			inverse * inverse * root[ 1 ] + 2 * inverse * amount * control[ 1 ] + amount * amount * tip[ 1 ],
		];
		const startAmount = ( segment - 1 ) / segments;
		const dx = point[ 0 ] - previous[ 0 ];
		const dy = point[ 1 ] - previous[ 1 ];
		const lengthSquared = Math.max( 1e-6, dx * dx + dy * dy );
		const length = Math.sqrt( lengthSquared );
		const tangentX = dx / length;
		const tangentY = dy / length;
		const startWidth = rootWidth + ( tipWidth - rootWidth ) * startAmount;
		const endWidth = rootWidth + ( tipWidth - rootWidth ) * amount;
		const radius = startWidth * 0.5 + 1;
		const minX = Math.max( 1, Math.floor( Math.min( previous[ 0 ], point[ 0 ] ) - radius ) );
		const maxX = Math.min( width - 2, Math.ceil( Math.max( previous[ 0 ], point[ 0 ] ) + radius ) );
		const minY = Math.max( 1, Math.floor( Math.min( previous[ 1 ], point[ 1 ] ) - radius ) );
		const maxY = Math.min( height - 2, Math.ceil( Math.max( previous[ 1 ], point[ 1 ] ) + radius ) );

		for ( let y = minY; y <= maxY; y ++ ) {

			for ( let x = minX; x <= maxX; x ++ ) {

				const px = x + 0.5 - previous[ 0 ];
				const py = y + 0.5 - previous[ 1 ];
				const local = clamp( ( px * dx + py * dy ) / lengthSquared, 0, 1 );
				const halfWidth = ( startWidth + ( endWidth - startWidth ) * local ) * 0.5;
				const offsetX = px - dx * local;
				const offsetY = py - dy * local;
				// 平方根を取らずに距離を比べる（画素ごとの処理が生成時間の大半を占める）。
				if ( offsetX * offsetX + offsetY * offsetY > halfWidth * halfWidth ) continue;

				const t = startAmount + ( amount - startAmount ) * local;
				const pixel = y * width + x;
				const offset = pixel * 4;
				const shade = factor * ( 0.58 + 0.42 * Math.min( 1, t * 2 ) );
				color[ offset ] = Math.round( Math.min( 255, frondRed * shade ) );
				color[ offset + 1 ] = Math.round( Math.min( 255, frondGreen * shade ) );
				color[ offset + 2 ] = Math.round( Math.min( 255, frondBlue * shade ) );
				color[ offset + 3 ] = 255;
				colorFactors[ pixel ] = shade;

				const across = clamp( ( px * tangentY - py * tangentX ) / Math.max( halfWidth, 1e-4 ), - 1, 1 );
				// 接線は長さ 1、傾きは 0.7 以下なので、この法線は正規化済み。
				const tilt = across * 0.7;
				normal[ offset ] = Math.round( ( tangentY * tilt * 0.5 + 0.5 ) * 255 );
				normal[ offset + 1 ] = Math.round( ( - tangentX * tilt * 0.5 + 0.5 ) * 255 );
				normal[ offset + 2 ] = Math.round( ( Math.sqrt( 1 - tilt * tilt ) * 0.5 + 0.5 ) * 255 );
				normal[ offset + 3 ] = 255;

			}

		}

		previous = point;

	}

}


function drawFirTwig( color: Uint8Array, colorFactors: Float32Array, width: number, height: number, from: [ number, number ], to: [ number, number ], startWidth: number, endWidth: number ): void {

	const dx = to[ 0 ] - from[ 0 ];
	const dy = to[ 1 ] - from[ 1 ];
	const lengthSquared = dx * dx + dy * dy;
	const radius = startWidth * 0.5 + 1;
	const minX = Math.max( 1, Math.floor( Math.min( from[ 0 ], to[ 0 ] ) - radius ) );
	const maxX = Math.min( width - 2, Math.ceil( Math.max( from[ 0 ], to[ 0 ] ) + radius ) );
	const minY = Math.max( 1, Math.floor( Math.min( from[ 1 ], to[ 1 ] ) - radius ) );
	const maxY = Math.min( height - 2, Math.ceil( Math.max( from[ 1 ], to[ 1 ] ) + radius ) );
	const midrib = [ FIR_FROND_MIDRIB_COLOR >> 16 & 0xff, FIR_FROND_MIDRIB_COLOR >> 8 & 0xff, FIR_FROND_MIDRIB_COLOR & 0xff ];

	for ( let y = minY; y <= maxY; y ++ ) {

		for ( let x = minX; x <= maxX; x ++ ) {

			const px = x + 0.5 - from[ 0 ];
			const py = y + 0.5 - from[ 1 ];
			const t = clamp( ( px * dx + py * dy ) / lengthSquared, 0, 1 );
			const offsetX = px - dx * t;
			const offsetY = py - dy * t;
			const distance = Math.sqrt( offsetX * offsetX + offsetY * offsetY );
			const strokeWidth = startWidth + ( endWidth - startWidth ) * t;
			if ( distance > strokeWidth * 0.5 ) continue;

			// 軸も丸く見えるよう、縁を少し暗くする。
			const shade = 1.08 - 0.3 * Math.pow( distance / ( strokeWidth * 0.5 ), 2 );
			const pixel = y * width + x;
			const offset = pixel * 4;
			color[ offset ] = Math.round( clamp( midrib[ 0 ]! * shade, 0, 255 ) );
			color[ offset + 1 ] = Math.round( clamp( midrib[ 1 ]! * shade, 0, 255 ) );
			color[ offset + 2 ] = Math.round( clamp( midrib[ 2 ]! * shade, 0, 255 ) );
			color[ offset + 3 ] = 255;
			colorFactors[ pixel ] = 0;

		}

	}

}

// 小枝は先へ向かって少し曲がる折れ線にし、両側に針葉を櫛状に並べる。小枝の先ほど針葉は短い。
function drawFirPinna(
	random: Random,
	color: Uint8Array,
	normal: Uint8Array,
	colorFactors: Float32Array,
	width: number,
	height: number,
	start: [ number, number ],
	angle: number,
	curl: number,
	length: number,
	needleLength: number,
	needleWidth: number,
	factor: number,
	twigs: [ number, number ][][],
): void {

	const segments = 4;
	const points: [ number, number ][] = [ start ];
	let direction = angle;

	for ( let segment = 0; segment < segments; segment ++ ) {

		const previous = points[ points.length - 1 ]!;
		points.push( [ previous[ 0 ] + Math.cos( direction ) * length / segments, previous[ 1 ] + Math.sin( direction ) * length / segments ] );
		direction += curl / segments;

	}

	// tree の小枝と同じく、針葉の間隔は太さより狭くして隣と重ねる。
	const spacing = needleWidth * 0.75;
	const count = Math.max( 3, Math.floor( length / spacing ) );

	for ( let needle = 0; needle < count; needle ++ ) {

		const s = ( needle + 0.6 ) / count;
		const segment = Math.min( segments - 1, Math.floor( s * segments ) );
		const local = s * segments - segment;
		const a = points[ segment ]!;
		const b = points[ segment + 1 ]!;
		const baseX = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * local;
		const baseY = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * local;
		const tangent = Math.atan2( b[ 1 ] - a[ 1 ], b[ 0 ] - a[ 0 ] );
		const forwardX = Math.cos( tangent );
		const forwardY = Math.sin( tangent );
		const taper = 1 - 0.55 * Math.pow( s, 1.4 );
		// 小枝の付け根では横へ広く開き（約 70°）、先ほど前を向く（約 15°）。
		const sweep = clamp( ( s - 0.1 ) / 0.8, 0, 1 );
		const spread = ( 70 - 55 * sweep * sweep * ( 3 - 2 * sweep ) ) * Math.PI / 180;

		for ( const side of [ - 1, 1 ] ) {

			const angle = spread + random.range( - 0.03, 0.03 );
			const reach = needleLength * taper * random.range( 0.85, 1.05 );
			const sideX = - forwardY * side;
			const sideY = forwardX * side;
			const out = Math.sin( angle ) * reach;
			const ahead = Math.cos( angle ) * reach;
			const tip: [ number, number ] = [ baseX + sideX * out + forwardX * ahead, baseY + sideY * out + forwardY * ahead ];
			// 曲線の制御点は横に 64%、前に 28%。付け根は横へ出て、先は前へ反る。
			const control: [ number, number ] = [ baseX + sideX * out * 0.64 + forwardX * ahead * 0.28, baseY + sideY * out * 0.64 + forwardY * ahead * 0.28 ];
			// 短い針葉も長さに合わせて細くし、縦横比を保つ。
			const rootWidth = Math.min( needleWidth * random.range( 0.92, 1 ), reach / 5.5 );
			drawFirNeedle( color, normal, colorFactors, width, height, [ baseX, baseY ], control, tip, rootWidth, rootWidth * 0.32, factor * random.range( 0.92, 1.08 ) );

		}

	}

	twigs.push( points );

}

/** 赤茶の中軸から互い違いに小枝を出し、小枝に先の丸い太い針葉を櫛状に付けた羽根形テクスチャ。 */
export function createFirFrondTextures( seed: number, color: number ): { color: TextureData; normal: TextureData } {

	const width = FIR_FROND_TEXTURE_WIDTH;
	const height = FIR_FROND_TEXTURE_HEIGHT;
	const pixels = width * height;
	const colorData = new Uint8Array( pixels * 4 );
	const normalData = new Uint8Array( pixels * 4 );
	const colorFactors = new Float32Array( pixels );
	const random = createRandom( seed * 67 + 13 );
	const centerX = width * 0.5;
	const needleWidth = width * 0.017;
	const twigs: [ number, number ][][] = [];

	// 平らな法線 (128, 128, 255, 255) で埋める。4 バイトずつまとめて書く（バイト順に依らないよう 1 画素分から複製する）。
	normalData.set( [ 128, 128, 255, 255 ] );
	new Uint32Array( normalData.buffer ).fill( new Uint32Array( normalData.buffer, 0, 1 )[ 0 ]! );

	// 小枝は左右で半間隔ずらした互い違い。先端側から描き、付け根側の小枝を上に重ねる。
	const pinnaCount = 13;
	const spacing = 0.8 / pinnaCount;
	const pinnae: { v: number; side: number }[] = [];
	for ( let index = 0; index < pinnaCount; index ++ ) {
		pinnae.push( { v: 0.07 + index * spacing, side: - 1 } );
		pinnae.push( { v: 0.07 + ( index + 0.5 ) * spacing, side: 1 } );
	}
	pinnae.sort( ( a, b ) => b.v - a.v );

	for ( const pinna of pinnae ) {

		const v = pinna.v + random.range( - 0.008, 0.008 );
		const start: [ number, number ] = [ centerX, v * height ];
		// 枝先は頂芽と 2 本の側芽の三叉になるよう、先端の小枝ほど中軸に沿わせる。
		const angle = Math.PI * 0.5 - pinna.side * ( ( v > 0.72 ? 0.82 - ( v - 0.72 ) * 3 : 0.82 ) + random.range( - 0.08, 0.08 ) );
		const curl = pinna.side * random.range( 0.15, 0.35 );
		const needleLength = width * 0.1 * random.range( 0.9, 1.1 );
		// 輪郭（板の六角形）に針葉の先まで収まる長さまで縮める。
		let length = width * 0.46 * random.range( 0.8, 1.05 );

		for ( let attempt = 0; attempt < 24; attempt ++ ) {

			const tipX = Math.abs( Math.cos( angle + curl * 0.5 ) ) * length;
			const tipV = v + Math.sin( angle + curl * 0.5 ) * length / height;
			const margin = needleLength * 0.45;
			if ( tipX + margin <= firFrondOutlineHalfWidth( tipV ) * width - 2 && tipX * 0.5 + margin <= firFrondOutlineHalfWidth( v + ( tipV - v ) * 0.5 ) * width - 2 ) break;
			length *= 0.9;

		}

		const factor = clamp( 0.88 + v * 0.1 + random.range( - 0.05, 0.05 ), 0.7, 1.05 );
		drawFirPinna( random, colorData, normalData, colorFactors, width, height, start, angle, curl, length, Math.min( needleLength, length * 0.5 ), needleWidth, factor, twigs );

	}

	// 先端は中軸の延長に直接針葉を付ける。
	drawFirPinna( random, colorData, normalData, colorFactors, width, height, [ centerX, height * 0.86 ], Math.PI * 0.5, 0, height * 0.1, width * 0.07, needleWidth, 1, twigs );

	for ( const points of twigs ) {

		for ( let index = 1; index < points.length; index ++ ) {
			const t = ( index - 1 ) / ( points.length - 1 );
			drawFirTwig( colorData, colorFactors, width, height, points[ index - 1 ]!, points[ index ]!, needleWidth * ( 0.42 - 0.22 * t ), needleWidth * ( 0.42 - 0.22 * ( t + 1 / ( points.length - 1 ) ) ) );
		}

	}

	// 中軸を最後に描き、葉の絵の上から赤茶を残す。
	drawFirTwig( colorData, colorFactors, width, height, [ centerX, height * 0.005 ], [ centerX, height * 0.95 ], needleWidth * 1.3, needleWidth * 0.4 );
	let colorPixelCount = 0;
	for ( let pixel = 0; pixel < pixels; pixel ++ ) if ( colorFactors[ pixel ]! > 0 ) colorPixelCount ++;
	const colorPixelIndices = new Uint32Array( colorPixelCount );
	for ( let pixel = 0, index = 0; pixel < pixels; pixel ++ ) if ( colorFactors[ pixel ]! > 0 ) colorPixelIndices[ index ++ ] = pixel;
	const texture: TextureData = { width, height, data: colorData, colorFactors, colorPixelIndices };

	return {
		color: composeFirFrondTexture( texture, color ),
		normal: { width, height, data: normalData },
	};

}

/** 針葉の画素だけを塗り直し、中軸と小枝の赤茶を保つ。 */
export function composeFirFrondTexture( texture: TextureData, color: number ): TextureData {

	if ( texture.colorFactors === undefined || texture.colorPixelIndices === undefined ) {
		throw new Error( 'Fir frond texture has no color-independent inputs' );
	}

	const data = texture.data.slice();
	const colorOffsets = texture.colorOffsets?.slice() ?? new Float32Array( texture.colorFactors.length * 3 );
	const defaultColor = [ defaultFirFrondColor >> 16 & 0xff, defaultFirFrondColor >> 8 & 0xff, defaultFirFrondColor & 0xff ];
	const targetColor = [ color >> 16 & 0xff, color >> 8 & 0xff, color & 0xff ];

	for ( const pixel of texture.colorPixelIndices ) {

		const factor = texture.colorFactors[ pixel ]!;
		const offset = pixel * 4;
		const colorOffset = pixel * 3;

		if ( texture.colorOffsets === undefined ) {
			for ( let channel = 0; channel < 3; channel ++ ) colorOffsets[ colorOffset + channel ] = texture.data[ offset + channel ]! - defaultColor[ channel ]! * factor;
		}

		for ( let channel = 0; channel < 3; channel ++ ) data[ offset + channel ] = Math.round( clamp( targetColor[ channel ]! * factor + colorOffsets[ colorOffset + channel ]!, 0, 255 ) );

	}

	return { ...texture, data, colorOffsets };

}

/**
 * ヤナギの釣り鐘形の葉の殻に巻く画像。尖った葉を左右に開いた「へ」の字に付け、それを縦に連ねた垂れ枝を横に並べる。
 * 垂れ枝は上端から始まり、長さと太さはばらばら（下端がぎざぎざになる）。殻の周りに巻くので左右の端はつなげる。
 * 色はグレー（マテリアル色を乗算）。
 */
export function createWillowCanopyTextures( seed: number, size = WILLOW_CANOPY_TEXTURE_SIZE ): { color: TextureData; normal: TextureData } {

	const random = createRandom( seed * 59 + 5 );
	const color = new Uint8Array( size * size * 4 );
	const normal = new Uint8Array( size * size * 4 );

	for ( let index = 0; index < size * size; index ++ ) {

		normal[ index * 4 ] = 128;
		normal[ index * 4 + 1 ] = 128;
		normal[ index * 4 + 2 ] = 255;
		normal[ index * 4 + 3 ] = 255;

	}

	const strandCount = 15;
	const top = size - leafMargin - 1;
	// 短い垂れ枝を先に描き、長いものを上に重ねる。
	const strands: { x: number; scale: number; length: number }[] = [];

	for ( let strand = 0; strand < strandCount; strand ++ ) {

		strands.push( {
			x: size * ( strand + random.range( 0.3, 0.7 ) ) / strandCount,
			scale: random.range( 0.8, 1.2 ),
			length: size * random.range( 0.5, 0.97 ),
		} );

	}

	strands.sort( ( a, b ) => a.length - b.length );
	const leaves: Leaf[] = [];

	for ( const strand of strands ) {

		const leafLength = size * 0.06 * strand.scale;
		const step = leafLength * 0.62;
		const sway = random.range( 0, Math.PI * 2 );
		let y = top - leafLength * 0.2;

		// 上から下へ、左右に開いた葉の対を連ねる。下ほど少し小さく、開きも狭くする。
		while ( top - y < strand.length - leafLength ) {

			const t = ( top - y ) / strand.length;
			const x = strand.x + Math.sin( t * Math.PI * 2 + sway ) * size * 0.006;
			const length = leafLength * ( 1 - 0.25 * t );
			const spread = random.range( 0.8, 0.95 ) * ( 1 - 0.2 * t );
			const tone = random.range( 0.72, 1 );

			for ( const side of [ - 1, 1 ] ) {

				leaves.push( { x, y, angle: - Math.PI / 2 + side * spread, length, width: length * random.range( 0.22, 0.26 ), tone: tone * random.range( 0.92, 1 ) } );

			}

			y -= step;

		}

		// 先端に下向きの 1 枚。
		const tipLength = leafLength * 0.8;
		leaves.push( { x: strand.x + Math.sin( Math.PI * 2 + sway ) * size * 0.006, y: y + tipLength * 0.3, angle: - Math.PI / 2, length: tipLength, width: tipLength * 0.3, tone: random.range( 0.8, 1 ) } );

	}

	for ( const leaf of leaves ) drawLeaf( color, normal, size, size, leaf, false, true );

	return {
		color: { width: size, height: size, data: color },
		normal: { width: size, height: size, data: normal },
	};

}
