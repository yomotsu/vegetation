import { createColorizedFlowerTexture, createFlowerTextureShape, rasterFlowerPolygon } from '../flowersTexture';
import { MeshBuilder } from '../meshBuilder';
import type { MeshData, TextureData } from '../types';
import type { FlowerPlacement } from './common';
import { setPartIndex } from './common';

const SIZE = 128;
const STEM_WIDTH = 128;
const STEM_HEIGHT = 256;
// 茎テクスチャ内の葉の位置（画素）。縦 1 列に並べ、UV を広げても隣の葉の絵を拾わないようにする。
const LEAF_CENTER_X = 74;
const LEAF_HALF_WIDTH = 12;
const LEAF_ROWS = [ 4, 88, 172 ];
const LEAF_ROW_HEIGHT = 80;
const LEAF_WIDEST = 0.4;
// 最後の釣り鐘は茎の先端に付ける（茎だけで終わらない）。
const BELL_PROGRESS = [ 0.64, 0.73, 0.82, 0.91, 1 ];
// 釣り鐘のカードの高さ。上の約 45% が花柄。
const BELL_CARD_HEIGHT = 0.07;
const HOOK_START = 0.7;
const HOOK_REACH = 0.06;
const HOOK_DROP = 0.035;

// 釣り鐘のカード: 上に花柄（centerColor の固定色）、下に口を下へ向けた釣り鐘。
// テクスチャの y は上向き（v = 1 がカードの上端 = 茎への付け根）。
export function createBluebellPetalTexture( petalColor: number, pedicelColor: number ): TextureData {

	const shape = createFlowerTextureShape( SIZE, SIZE );

	// 花柄: 付け根（上端中央）から少し外へ弧を描いて釣り鐘の頭へ。
	const pedicel: [ number, number ][] = [];
	const pedicelPath = ( t: number ): [ number, number ] => [ 64 + Math.sin( t * Math.PI ) * 7, 128 - t * 58 ];
	for ( let step = 0; step <= 8; step ++ ) {
		const [ x, y ] = pedicelPath( step / 8 );
		pedicel.push( [ x - 2, y ] );
	}
	for ( let step = 8; step >= 0; step -- ) {
		const [ x, y ] = pedicelPath( step / 8 );
		pedicel.push( [ x + 2, y ] );
	}
	rasterFlowerPolygon( shape, pedicel, ( x ) => 0.8 + ( 1 - Math.min( 1, Math.abs( x - 66 ) / 4 ) ) * 0.15, true );

	// 釣り鐘: 頭（y = 72）が細く、口（y = 12 付近）が広がる。口の縁は波打つ。
	const bell: [ number, number ][] = [];
	const halfWidth = ( y: number ) => {
		const t = ( 74 - y ) / 58;
		return 7 + t * t * 9 + ( t > 0.82 ? ( t - 0.82 ) * 30 : 0 );
	};
	for ( let y = 74; y >= 16; y -= 4 ) bell.push( [ 64 + halfWidth( y ), y ] );
	for ( let step = 0; step <= 10; step ++ ) {
		const x = 64 + halfWidth( 16 ) - step / 10 * halfWidth( 16 ) * 2;
		bell.push( [ x, 12 - Math.abs( Math.sin( step / 10 * Math.PI * 2.5 ) ) * 4 ] );
	}
	for ( let y = 16; y <= 74; y += 4 ) bell.push( [ 64 - halfWidth( y ), y ] );
	rasterFlowerPolygon( shape, bell, ( x, y ) => {
		const depth = Math.max( 0, Math.min( 1, ( 74 - y ) / 62 ) );
		const across = Math.min( 1, Math.abs( x - 64 ) / halfWidth( Math.max( 16, y ) ) );
		// 頭が暗く口へ明るい。縁は暗く、口の縁は明るい。
		return 0.5 + depth * 0.38 + ( y < 18 ? 0.12 : 0 ) - across * across * 0.22;
	} );

	return createColorizedFlowerTexture( SIZE, SIZE, petalColor, shape.alpha, shape.shade, shape.fixed, pedicelColor, shape.fixedShade );

}

export function createBluebellStemTexture( stemColor: number ): TextureData {

	const shape = createFlowerTextureShape( STEM_WIDTH, STEM_HEIGHT );
	rasterFlowerPolygon( shape, [ [ 10, 0 ], [ 18, 0 ], [ 18, 256 ], [ 10, 256 ] ], ( x, y ) => 0.46 + y / STEM_HEIGHT * 0.4 + Math.max( 0, 1 - Math.abs( x - 14 ) / 4 ) * 0.22 );

	// 細長い葉（縦 1 列）。根元は細く、LEAF_WIDEST で最も広く、先が尖る。根元（下端）が茎の根元。
	for ( const rowY of LEAF_ROWS ) {
		const width = ( t: number ) => t < LEAF_WIDEST
			? 1.5 + ( LEAF_HALF_WIDTH - 1.5 ) * t / LEAF_WIDEST
			: LEAF_HALF_WIDTH * ( 1 - ( t - LEAF_WIDEST ) / ( 1 - LEAF_WIDEST ) ) ** 0.8;
		const points: [ number, number ][] = [];
		for ( let step = 0; step <= 10; step ++ ) points.push( [ LEAF_CENTER_X + width( step / 10 ), rowY + step / 10 * LEAF_ROW_HEIGHT ] );
		for ( let step = 10; step >= 0; step -- ) points.push( [ LEAF_CENTER_X - width( step / 10 ), rowY + step / 10 * LEAF_ROW_HEIGHT ] );
		rasterFlowerPolygon( shape, points, ( x, y ) => {
			const progress = Math.max( 0, Math.min( 1, ( y - rowY ) / LEAF_ROW_HEIGHT ) );
			const across = Math.min( 1, Math.abs( x - LEAF_CENTER_X ) / Math.max( 1.5, width( progress ) ) );
			return 0.45 + progress * 0.42 - across * across * 0.24 - Math.exp( - across * 30 ) * 0.1;
		} );
	}

	return createColorizedFlowerTexture( STEM_WIDTH, STEM_HEIGHT, stemColor, shape.alpha, shape.shade );

}

function bluebellSpine( plant: FlowerPlacement, progress: number ): [ number, number, number ] {

	// 上の 30% で、株の傾く向きへ鉤形に曲げて先を少し垂らす（羊飼いの杖の形）。
	const lean = progress ** 1.5;
	const leanLength = Math.hypot( plant.leanX, plant.leanZ ) || 1;
	const hookProgress = progress > HOOK_START ? ( progress - HOOK_START ) / ( 1 - HOOK_START ) : 0;
	const hook = hookProgress * hookProgress * HOOK_REACH;
	const drop = hookProgress ** 3 * HOOK_DROP;
	return [
		plant.x + plant.leanX * lean + plant.leanX / leanLength * hook,
		plant.height * progress - drop,
		plant.z + plant.leanZ * lean + plant.leanZ / leanLength * hook,
	];

}

// 茎カードの段（上に寄せる）。
const STEM_SEGMENTS = 3;

function stemRowProgress( row: number ): number {

	return 1 - ( 1 - row / STEM_SEGMENTS ) ** 1.5;

}

// 実際に描かれる茎（段のあいだは直線）の上の点。曲線上の点を使うと、
// 曲線が折れ線より外にふくらむぶん、花柄の先が茎からはみ出す。
function stemPolylinePoint( plant: FlowerPlacement, progress: number ): [ number, number, number ] {

	for ( let row = 0; row < STEM_SEGMENTS; row ++ ) {
		const start = stemRowProgress( row );
		const end = stemRowProgress( row + 1 );
		if ( progress <= end || row === STEM_SEGMENTS - 1 ) {
			const t = Math.max( 0, Math.min( 1, ( progress - start ) / ( end - start ) ) );
			const a = bluebellSpine( plant, start );
			const b = bluebellSpine( plant, end );
			return [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];
		}
	}
	return bluebellSpine( plant, 1 );

}

function addBluebellStemCard( builder: MeshBuilder, plant: FlowerPlacement, yaw: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const halfWidth = 0.0045;
	const segments = STEM_SEGMENTS;
	const vertices: number[] = [];
	for ( let row = 0; row <= segments; row ++ ) {
		const progress = stemRowProgress( row );
		const [ x, y, z ] = bluebellSpine( plant, progress );
		vertices.push(
			builder.addVertex( [ x - cosine * halfWidth, y, z + sine * halfWidth ], [ 0, 1, 0 ], [ 0.08, progress ], [ 1, 1, 1 ], progress ),
			builder.addVertex( [ x + cosine * halfWidth, y, z - sine * halfWidth ], [ 0, 1, 0 ], [ 0.15, progress ], [ 1, 1, 1 ], progress ),
		);
	}
	for ( let row = 0; row < segments; row ++ ) {
		const a = vertices[ row * 2 ]!;
		const b = vertices[ row * 2 + 1 ]!;
		builder.addTriangle( a, b, vertices[ row * 2 + 3 ]! );
		builder.addTriangle( a, vertices[ row * 2 + 3 ]!, vertices[ row * 2 + 2 ]! );
	}

}

function addBluebell( builder: MeshBuilder, plant: FlowerPlacement, progress: number, yaw: number, lod: number ): void {

	const [ x, attachY, z ] = stemPolylinePoint( plant, progress );
	// 花柄の先を茎に少し差し込む。
	const y = attachY - 0.003;
	const width = 0.055;
	const height = BELL_CARD_HEIGHT;
	const radialX = Math.cos( yaw );
	const radialZ = Math.sin( yaw );
	const points: [ number, number, number ][] = [
		[ x - radialZ * width * 0.5, y, z + radialX * width * 0.5 ],
		[ x + radialZ * width * 0.5, y, z - radialX * width * 0.5 ],
		[ x + radialZ * width * 0.5, y - height, z - radialX * width * 0.5 ],
		[ x - radialZ * width * 0.5, y - height, z + radialX * width * 0.5 ],
	];
	if ( lod > 0 ) {
		const vertices = points.slice( 0, 3 ).map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], [ index === 1 ? 1 : 0, index >= 2 ? 0 : 1 ], [ 1, 1, 1 ], 1 ) );
		builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 2 ]! );
		return;
	}
	const vertices = points.map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], [ index === 1 || index === 2 ? 1 : 0, index >= 2 ? 0 : 1 ], [ 1, 1, 1 ], 1 ) );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 2 ]! );
	if ( lod === 0 ) builder.addTriangle( vertices[ 0 ]!, vertices[ 2 ]!, vertices[ 3 ]! );

}

// 葉: 茎の根元 → 最も広い所（左右）→ 先端のひし形。絵の根元を茎の根元に合わせる。
function addBluebellLeaf( builder: MeshBuilder, plant: FlowerPlacement, angle: number, length: number, slot = 0 ): void {

	const radialX = Math.cos( angle );
	const radialZ = Math.sin( angle );
	const tangentX = - radialZ;
	const tangentZ = radialX;
	const halfWidth = 0.011;
	// 葉の絵がひし形の縁で切れないよう、カードと UV を絵の幅の 2 倍に広げる。
	const span = 2;
	const tipX = plant.x + radialX * length;
	const tipZ = plant.z + radialZ * length;
	const middleX = plant.x + radialX * length * LEAF_WIDEST;
	const middleZ = plant.z + radialZ * length * LEAF_WIDEST;
	const rowY = LEAF_ROWS[ slot % LEAF_ROWS.length ]!;
	const u = ( pixels: number ) => ( LEAF_CENTER_X + pixels ) / STEM_WIDTH;
	const v = ( ratio: number ) => ( rowY + LEAF_ROW_HEIGHT * ratio ) / STEM_HEIGHT;
	const vertices = [
		builder.addVertex( [ plant.x, 0.006, plant.z ], [ 0, 1, 0 ], [ u( 0 ), v( 0 ) ], [ 1, 1, 1 ], 0.02 ),
		builder.addVertex( [ middleX - tangentX * halfWidth * span, length * 0.3, middleZ - tangentZ * halfWidth * span ], [ 0, 1, 0 ], [ u( - LEAF_HALF_WIDTH * span ), v( LEAF_WIDEST ) ], [ 1, 1, 1 ], 0.34 ),
		builder.addVertex( [ tipX, length * 0.34, tipZ ], [ 0, 1, 0 ], [ u( 0 ), v( 1 ) ], [ 1, 1, 1 ], 0.48 ),
		builder.addVertex( [ middleX + tangentX * halfWidth * span, length * 0.3, middleZ + tangentZ * halfWidth * span ], [ 0, 1, 0 ], [ u( LEAF_HALF_WIDTH * span ), v( LEAF_WIDEST ) ], [ 1, 1, 1 ], 0.34 ),
	];
	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 2 ]! );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 2 ]!, vertices[ 3 ]! );

}

export function buildBluebellPart( lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	const builder = new MeshBuilder();
	for ( const plant of plants ) {
		if ( part === 'petal' ) {
			const bellCount = lod === 2 ? 3 : BELL_PROGRESS.length;
			for ( let bell = 0; bell < bellCount; bell ++ ) addBluebell( builder, plant, BELL_PROGRESS[ bell ]!, plant.yaw + bell * 0.31, lod );
		} else if ( lod === 0 ) {
			addBluebellStemCard( builder, plant, plant.yaw );
			addBluebellStemCard( builder, plant, plant.yaw + plant.crossAngle );
			for ( let leaf = 0; leaf < 3; leaf ++ ) addBluebellLeaf( builder, plant, plant.yaw + leaf * Math.PI * 2 / 3, plant.height * ( 0.58 + ( leaf % 2 ) * 0.04 ), leaf );
		} else {
			const end = bluebellSpine( plant, 1 );
			const base = bluebellSpine( plant, 0 );
			const left = builder.addVertex( base, [ 0, 1, 0 ], [ 0.08, 0 ], [ 1, 1, 1 ], 0 );
			const right = builder.addVertex( [ end[ 0 ], end[ 1 ], end[ 2 ] + 0.015 ], [ 0, 1, 0 ], [ 0.15, 1 ], [ 1, 1, 1 ], 1 );
			const tip = builder.addVertex( end, [ 0, 1, 0 ], [ 0.08, 1 ], [ 1, 1, 1 ], 1 );
			builder.addTriangle( left, right, tip );
			if ( lod === 1 ) {
				addBluebellLeaf( builder, plant, plant.yaw, plant.height * 0.4 );
				addBluebellLeaf( builder, plant, plant.yaw + Math.PI, plant.height * 0.4, 1 );
			} else addBluebellLeaf( builder, plant, plant.yaw, plant.height * 0.4 );
		}
	}
	return setPartIndex( builder.build(), part );

}
