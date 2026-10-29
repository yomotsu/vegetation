import { createColorizedFlowerTexture, createFlowerTextureShape, rasterFlowerPolygon } from '../flowersTexture';
import { MeshBuilder } from '../meshBuilder';
import type { MeshData, TextureData } from '../types';
import type { FlowerPlacement } from './common';
import { setPartIndex } from './common';

// 実物のカラー（オランダカイウ）に合わせた形。
// 花: 1 枚の苞が筒状に巻いて上へ広がり、口は外へ反る。背の先端は尖って後ろへ反り返る。
// 葉: 葉柄はなく、根元から直接葉身が立ち上がる。根元は細く茎を包み、中ほどで最も広く、先が尖る。
// 横断面は茎の側へ丸く反り、茎の周りをやや包みこむ。

const SIZE = 128;
const STEM_WIDTH = 128;
const STEM_HEIGHT = 256;
// 茎テクスチャ内の葉の位置（画素）。縦 1 列に並べ、隣の葉の絵を拾わないようにする。
const LEAF_CENTER_X = 74;
const LEAF_HALF_WIDTH = 46;
const LEAF_ROWS = [ 4, 88, 172 ];
const LEAF_ROW_HEIGHT = 80;
// 葉が最も広い高さの割合。
const LEAF_WIDEST = 0.45;
// 花の長さ（茎の先端から花の上端まで）。
const FLOWER_LENGTH = 0.11;

export function createCallaPetalTexture( petalColor: number, centerColor: number ): TextureData {

	const shape = createFlowerTextureShape( SIZE, SIZE );
	// 苞（左 x 0〜96）: 下が細い筒、上へ広がり、上端の中央が尖る。y は上向き。
	const spathe: [ number, number ][] = [];
	const halfWidth = ( y: number ) => {
		const t = y / 104;
		return 6 + 40 * t ** 1.6;
	};
	for ( let y = 0; y <= 104; y += 8 ) spathe.push( [ 48 + halfWidth( y ), y ] );
	// 上端: 両肩から中央の尖った先へ。
	for ( let step = 1; step <= 8; step ++ ) {
		const t = step / 8;
		spathe.push( [ 48 + halfWidth( 104 ) * ( 1 - t ), 104 + 22 * Math.sin( t * Math.PI * 0.5 ) ** 1.5 ] );
	}
	for ( let step = 7; step >= 1; step -- ) {
		const t = step / 8;
		spathe.push( [ 48 - halfWidth( 104 ) * ( 1 - t ), 104 + 22 * Math.sin( t * Math.PI * 0.5 ) ** 1.5 ] );
	}
	for ( let y = 104; y >= 0; y -= 8 ) spathe.push( [ 48 - halfWidth( y ), y ] );
	rasterFlowerPolygon( shape, spathe, ( x, y ) => {
		const across = Math.min( 1, Math.abs( x - 48 ) / halfWidth( Math.min( 104, y ) ) );
		// 筒の奥（下）ほど暗く、口の縁へ明るい。中央の折り目と縁を少し暗く。
		const throat = Math.min( 1, y / 90 );
		return 0.55 + throat * 0.45 - across * across * 0.18 - Math.exp( - across * 30 ) * 0.06;
	} );
	// 肉穂（右 x 104〜119）: 黄色い棒。先が上。
	const spadix: [ number, number ][] = [ [ 107, 36 ], [ 116, 36 ], [ 117, 80 ], [ 115, 90 ], [ 111.5, 94 ], [ 108, 90 ], [ 106, 80 ] ];
	rasterFlowerPolygon( shape, spadix, ( x, y ) => 0.72 + ( y - 36 ) / 200 - Math.abs( x - 111.5 ) / 40, true );

	return createColorizedFlowerTexture( SIZE, SIZE, petalColor, shape.alpha, shape.shade, shape.fixed, centerColor, shape.fixedShade );

}

// 葉身の輪郭。根元（bottom）は細く、LEAF_WIDEST で最も広く、先端（top）が尖る。
function callaBladeOutline( bottom: number, top: number ): [ number, number ][] {

	const length = top - bottom;
	const right: [ number, number ][] = [];
	for ( let step = 0; step <= 14; step ++ ) {
		const t = step / 14;
		const width = t < LEAF_WIDEST
			? 5 + ( LEAF_HALF_WIDTH - 5 ) * Math.sin( t / LEAF_WIDEST * Math.PI * 0.5 ) ** 0.9
			: LEAF_HALF_WIDTH * ( 1 - ( ( t - LEAF_WIDEST ) / ( 1 - LEAF_WIDEST ) ) ** 1.4 );
		right.push( [ LEAF_CENTER_X + width, bottom + length * t ] );
	}
	const left = right.slice().reverse().map( ( [ x, y ] ): [ number, number ] => [ LEAF_CENTER_X * 2 - x, y ] );
	return [ ...right, ...left ];

}

export function createCallaStemTexture( stemColor: number ): TextureData {

	const shape = createFlowerTextureShape( STEM_WIDTH, STEM_HEIGHT );
	// 花茎（左端）。円柱の陰影。
	rasterFlowerPolygon( shape, [ [ 12, 0 ], [ 20, 0 ], [ 20, 256 ], [ 12, 256 ] ], ( x, y ) => 0.5 + y / STEM_HEIGHT * 0.3 + Math.max( 0, 1 - Math.abs( x - 16 ) / 4 ) * 0.2 );

	for ( const rowY of LEAF_ROWS ) {
		const bladeBottom = rowY;
		const bladeTop = rowY + LEAF_ROW_HEIGHT;
		// 葉身: 根元が暗く先へ明るい。中央の葉脈を暗く、縁を少し暗く。
		rasterFlowerPolygon( shape, callaBladeOutline( bladeBottom, bladeTop ), ( x, y ) => {
			const t = Math.max( 0, Math.min( 1, ( y - bladeBottom ) / ( bladeTop - bladeBottom ) ) );
			const across = Math.min( 1, Math.abs( x - LEAF_CENTER_X ) / LEAF_HALF_WIDTH );
			return 0.46 + t * 0.4 - across * across * 0.2 - Math.exp( - across * 40 ) * 0.14;
		} );
	}

	return createColorizedFlowerTexture( STEM_WIDTH, STEM_HEIGHT, stemColor, shape.alpha, shape.shade );

}

function addCallaStemCard( builder: MeshBuilder, plant: FlowerPlacement, yaw: number, segments: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const height = plant.height - FLOWER_LENGTH;
	const halfWidth = 0.006;
	const vertices: number[] = [];
	for ( let row = 0; row <= segments; row ++ ) {
		const progress = row / segments;
		const x = plant.x + plant.leanX * progress;
		const z = plant.z + plant.leanZ * progress;
		vertices.push(
			builder.addVertex( [ x - cosine * halfWidth, height * progress, z + sine * halfWidth ], [ 0, 1, 0 ], [ 0.08, progress ], [ 1, 1, 1 ], progress ),
			builder.addVertex( [ x + cosine * halfWidth, height * progress, z - sine * halfWidth ], [ 0, 1, 0 ], [ 0.16, progress ], [ 1, 1, 1 ], progress ),
		);
	}
	for ( let row = 0; row < segments; row ++ ) {
		const a = vertices[ row * 2 ]!;
		const b = vertices[ row * 2 + 1 ]!;
		builder.addTriangle( a, b, vertices[ row * 2 + 3 ]! );
		builder.addTriangle( a, vertices[ row * 2 + 3 ]!, vertices[ row * 2 + 2 ]! );
	}

}

// 苞のカード。背は高く、先が後ろへ反り返る。前は低く、口が外へ反る。
// 段: [ 高さの割合, 半幅 (m), 外への張り出し (m), v ]
const BACK_ROWS: [ number, number, number, number ][] = [
	[ 0, 0.007, 0, 0 ],
	[ 0.45, 0.02, - 0.004, 0.42 ],
	[ 0.8, 0.036, 0.002, 0.78 ],
	[ 1, 0.016, - 0.022, 0.98 ],
];
const FRONT_ROWS: [ number, number, number, number ][] = [
	[ 0, 0.007, 0, 0 ],
	[ 0.42, 0.02, 0.008, 0.42 ],
	[ 0.72, 0.035, 0.028, 0.78 ],
];

function addCallaFunnelCard( builder: MeshBuilder, plant: FlowerPlacement, yaw: number, back: boolean, lod: number ): void {

	const radialX = Math.cos( yaw );
	const radialZ = Math.sin( yaw );
	const tangentX = - radialZ;
	const tangentZ = radialX;
	const baseY = plant.height - FLOWER_LENGTH - 0.004;
	const allRows = back ? BACK_ROWS : FRONT_ROWS;
	const rows = lod === 0 ? allRows : [ allRows[ 0 ]!, allRows[ allRows.length - 1 ]! ];
	const vertices: number[][] = [];
	for ( const [ height, halfWidth, flare, v ] of rows ) {
		const y = baseY + ( FLOWER_LENGTH + 0.004 ) * height;
		const centerX = plant.x + plant.leanX + radialX * flare;
		const centerZ = plant.z + plant.leanZ + radialZ * flare;
		// テクスチャの苞は左 x 0〜96（u 0〜0.75）、中心 x 48。
		vertices.push( [
			builder.addVertex( [ centerX - tangentX * halfWidth, y, centerZ - tangentZ * halfWidth ], [ 0, 1, 0 ], [ 0.375 - halfWidth / 0.036 * 0.36, v ], [ 1, 1, 1 ], 0.88 + height * 0.12 ),
			builder.addVertex( [ centerX + tangentX * halfWidth, y, centerZ + tangentZ * halfWidth ], [ 0, 1, 0 ], [ 0.375 + halfWidth / 0.036 * 0.36, v ], [ 1, 1, 1 ], 0.88 + height * 0.12 ),
		] );
	}
	for ( let row = 0; row < vertices.length - 1; row ++ ) {
		const a = vertices[ row ]!;
		const b = vertices[ row + 1 ]!;
		builder.addTriangle( a[ 0 ]!, a[ 1 ]!, b[ 1 ]! );
		builder.addTriangle( a[ 0 ]!, b[ 1 ]!, b[ 0 ]! );
	}

}

function addCallaSpadix( builder: MeshBuilder, plant: FlowerPlacement, lod: number ): void {

	const baseY = plant.height - FLOWER_LENGTH * 0.835;
	const halfWidth = 0.005;
	const centerX = plant.x + plant.leanX;
	const centerZ = plant.z + plant.leanZ;
	const tangentX = - Math.sin( plant.yaw );
	const tangentZ = Math.cos( plant.yaw );
	const radialX = Math.cos( plant.yaw );
	const radialZ = Math.sin( plant.yaw );
	const left = builder.addVertex( [ centerX - tangentX * halfWidth, baseY, centerZ - tangentZ * halfWidth ], [ 0, 1, 0 ], [ 0.82, 0.28 ], [ 1, 1, 1 ], 0.9 );
	const right = builder.addVertex( [ centerX + tangentX * halfWidth, baseY, centerZ + tangentZ * halfWidth ], [ 0, 1, 0 ], [ 0.92, 0.28 ], [ 1, 1, 1 ], 0.9 );
	const tip = builder.addVertex( [ centerX + radialX * 0.003, plant.height - FLOWER_LENGTH * 0.21, centerZ + radialZ * 0.003 ], [ 0, 1, 0 ], [ 0.92, 0.73 ], [ 1, 1, 1 ], 1 );
	if ( lod === 0 ) {
		const back = builder.addVertex( [ centerX - radialX * 0.003, plant.height - FLOWER_LENGTH * 0.21, centerZ - radialZ * 0.003 ], [ 0, 1, 0 ], [ 0.82, 0.73 ], [ 1, 1, 1 ], 1 );
		builder.addTriangle( left, right, tip );
		builder.addTriangle( left, tip, back );
	} else builder.addTriangle( left, right, tip );

}

// 葉: 根元（2 頂点）→ 最も広い所（3 頂点）→ 先端（1 頂点）。
// 根元は茎のすぐ脇から立ち上がり、中ほどの左右の縁を茎の側へ寄せて、茎を包むように丸める。
function addCallaLeaf( builder: MeshBuilder, plant: FlowerPlacement, angle: number, scale: number, slot: number ): void {

	const radialX = Math.cos( angle );
	const radialZ = Math.sin( angle );
	const tangentX = - radialZ;
	const tangentZ = radialX;
	const length = 0.27 * scale;
	const halfWidth = 0.05 * scale;
	const rowY = LEAF_ROWS[ slot % LEAF_ROWS.length ]!;
	const u = ( pixels: number ) => ( LEAF_CENTER_X + pixels ) / STEM_WIDTH;
	const v = ( ratio: number ) => ( rowY + LEAF_ROW_HEIGHT * ratio ) / STEM_HEIGHT;
	const point = ( radial: number, side: number, height: number ): [ number, number, number ] => [
		plant.x + radialX * radial + tangentX * side,
		height,
		plant.z + radialZ * radial + tangentZ * side,
	];
	const pixelsPerMetre = LEAF_HALF_WIDTH / halfWidth;
	const baseHalf = 0.006 * scale;
	// 根元は茎のすぐ脇。
	const base = [
		builder.addVertex( point( 0.007, - baseHalf, 0.004 ), [ 0, 1, 0 ], [ u( - baseHalf * pixelsPerMetre ), v( 0 ) ], [ 1, 1, 1 ], 0.02 ),
		builder.addVertex( point( 0.007, baseHalf, 0.004 ), [ 0, 1, 0 ], [ u( baseHalf * pixelsPerMetre ), v( 0 ) ], [ 1, 1, 1 ], 0.02 ),
	];
	// 最も広い所: 中央は外へ出し、左右の縁は茎の側へ寄せて丸める。葉は約 65° で立ち上がる。
	const middleHeight = length * LEAF_WIDEST * 0.9;
	const middleRadial = length * LEAF_WIDEST * 0.42;
	const curl = halfWidth * 0.45;
	const middle = [
		builder.addVertex( point( middleRadial - curl, - halfWidth * 0.9, middleHeight + 0.006 ), [ 0, 1, 0 ], [ u( - LEAF_HALF_WIDTH ), v( LEAF_WIDEST ) ], [ 1, 1, 1 ], 0.3 ),
		builder.addVertex( point( middleRadial, 0, middleHeight ), [ 0, 1, 0 ], [ u( 0 ), v( LEAF_WIDEST ) ], [ 1, 1, 1 ], 0.3 ),
		builder.addVertex( point( middleRadial - curl, halfWidth * 0.9, middleHeight + 0.006 ), [ 0, 1, 0 ], [ u( LEAF_HALF_WIDTH ), v( LEAF_WIDEST ) ], [ 1, 1, 1 ], 0.3 ),
	];
	// 先端は外へ傾く。
	const tip = builder.addVertex( point( length * 0.48, 0, length * 0.86 ), [ 0, 1, 0 ], [ u( 0 ), v( 1 ) ], [ 1, 1, 1 ], 0.55 );
	builder.addTriangle( base[ 0 ]!, base[ 1 ]!, middle[ 1 ]! );
	builder.addTriangle( base[ 0 ]!, middle[ 1 ]!, middle[ 0 ]! );
	builder.addTriangle( base[ 1 ]!, middle[ 2 ]!, middle[ 1 ]! );
	builder.addTriangle( middle[ 0 ]!, middle[ 1 ]!, tip );
	builder.addTriangle( middle[ 1 ]!, middle[ 2 ]!, tip );

}

export function buildCallaPart( lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	const builder = new MeshBuilder();
	for ( const plant of plants ) {
		if ( part === 'petal' ) {
			addCallaFunnelCard( builder, plant, plant.yaw, true, lod );
			addCallaFunnelCard( builder, plant, plant.yaw + Math.PI * 0.5, false, lod );
			addCallaSpadix( builder, plant, lod );
		} else if ( lod === 0 ) {
			addCallaStemCard( builder, plant, plant.yaw, 2 );
			addCallaStemCard( builder, plant, plant.yaw + plant.crossAngle, 2 );
			for ( let leaf = 0; leaf < 3; leaf ++ ) addCallaLeaf( builder, plant, plant.yaw + 0.5 + leaf * Math.PI * 2 / 3, 1 - leaf * 0.08, leaf );
		} else {
			const stem = plant.height - FLOWER_LENGTH;
			const topX = plant.x + plant.leanX;
			const topZ = plant.z + plant.leanZ;
			const base = builder.addVertex( [ plant.x, 0, plant.z ], [ 0, 1, 0 ], [ 0.08, 0 ], [ 1, 1, 1 ], 0 );
			const left = builder.addVertex( [ topX - 0.004, stem, topZ ], [ 0, 1, 0 ], [ 0.08, 1 ], [ 1, 1, 1 ], 0.9 );
			const right = builder.addVertex( [ topX + 0.004, stem, topZ ], [ 0, 1, 0 ], [ 0.16, 1 ], [ 1, 1, 1 ], 0.9 );
			builder.addTriangle( base, left, right );
			const leafCount = lod === 1 ? 2 : 1;
			for ( let leaf = 0; leaf < leafCount; leaf ++ ) addCallaLeaf( builder, plant, plant.yaw + 0.5 + leaf * Math.PI, 0.95, leaf );
		}
	}
	return setPartIndex( builder.build(), part );

}
