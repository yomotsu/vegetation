import { createRandom } from '../random';
import type { Random } from '../random';
import type { TextureData } from '../types';

export const LEAF_SPRAY_TEXTURE_SIZE = 512;
export const WILLOW_CANOPY_TEXTURE_SIZE = 256;
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
				const shade = value * ( 0.82 + 0.18 * t );
				const byte = Math.round( clamp( shade, 0, 1 ) * 235 );
				color[ offset ] = twig ? Math.round( byte * 0.95 ) : byte;
				color[ offset + 1 ] = twig ? Math.round( byte * 0.8 ) : byte;
				color[ offset + 2 ] = twig ? Math.round( byte * 0.65 ) : byte;
				color[ offset + 3 ] = 255;
				// 針葉の断面を半円として、幅方向へ法線を傾ける。
				const tilt = across * 0.8;
				encodeNormal( normal, offset, dy / length * tilt, - dx / length * tilt, Math.sqrt( Math.max( 0.2, 1 - tilt * tilt ) ) );

			}

		}

	};

	// 小枝が放射状に出て先に針葉の房が付いたスプレーを、1 枚に 4 つずらして重ねる。
	// 大きなカード 1 枚で房が交差して見え、頂点を増やさずに塊が詰まって見える。
	const drawSpray = ( cx: number, cy: number, radius: number, twigCount: number ): void => {

		const startAngle = random.range( 0, Math.PI * 2 );
		const tufts: { x: number; y: number; angle: number; reach: number }[] = [];

		for ( let twig = 0; twig < twigCount; twig ++ ) {

			const angle = startAngle + twig / twigCount * Math.PI * 2 + random.range( - 0.25, 0.25 );
			const reach = radius * random.range( 0.3, 0.5 );
			tufts.push( { x: cx + Math.cos( angle ) * reach, y: cy + Math.sin( angle ) * reach, angle, reach } );

		}

		tufts.push( { x: cx, y: cy, angle: startAngle, reach: 0 } );

		for ( const tuft of tufts ) {

			if ( tuft.reach > 0 ) drawSegment( cx, cy, tuft.x, tuft.y, size * 0.005, 0.75, true );

		}

		for ( const tuft of tufts ) {

			const needleCount = tuft.reach === 0 ? 34 : 26;
			const spread = tuft.reach === 0 ? Math.PI : 0.95;

			for ( let needle = 0; needle < needleCount; needle ++ ) {

				const angle = tuft.angle + random.range( - spread, spread );
				const length = radius * random.range( 0.36, 0.5 ) * Math.min( 1, ( radius - tuft.reach ) / ( radius * 0.5 ) );
				const tone = random.range( 0.72, 1 );
				drawSegment( tuft.x, tuft.y, tuft.x + Math.cos( angle ) * length, tuft.y + Math.sin( angle ) * length, size * 0.0052, tone, false );

			}

		}

	};

	const sprayRadius = size * 0.25;
	const sprayAngle = random.range( 0, Math.PI * 2 );

	for ( let spray = 0; spray < 4; spray ++ ) {

		// 中心から少しずつ離して 4 方向へ。外側ほど小さくして、カードの縁で切れないようにする。
		const angle = sprayAngle + spray / 4 * Math.PI * 2 + random.range( - 0.3, 0.3 );
		const distance = size * random.range( 0.16, 0.21 );
		drawSpray( size * 0.5 + Math.cos( angle ) * distance, size * 0.5 + Math.sin( angle ) * distance, sprayRadius * random.range( 0.85, 1 ), 6 );

	}

	return {
		color: { width: size, height: size, data: color },
		normal: { width: size, height: size, data: normal },
	};

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
