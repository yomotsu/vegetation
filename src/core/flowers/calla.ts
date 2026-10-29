import { compositeFlowersTextureRegion, createColorizedFlowerTexture, createFlowerTextureShape, rasterFlowerPolygon } from '../flowersTexture';
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
export const CALLA_PLANT_CARD_TEXTURE_WIDTH = SIZE;
export const CALLA_PLANT_CARD_WIDTH = 0.1;
export const CALLA_PLANT_CARD_FOLIAGE_WIDTH = 0.38;
// 茎テクスチャ内の葉の位置（画素）。縦 1 列に並べ、隣の葉の絵を拾わないようにする。
const LEAF_CENTER_X = 74;
const LEAF_HALF_WIDTH = 46;
const LEAF_ROWS = [ 4, 88, 172 ];
const LEAF_ROW_HEIGHT = 80;
const PLANT_CARD_LEAF_PROJECTION_SCALE = 1.23;
// 葉が最も広い高さの割合。
const LEAF_WIDEST = 0.45;
// 花の長さ（茎の先端から花の上端まで）。
export const CALLA_FLOWER_LENGTH = 0.11;
export const CALLA_PLANT_CARD_FOLIAGE_HEIGHT = STEM_HEIGHT;
export const CALLA_PLANT_CARD_FLOWER_Y = CALLA_PLANT_CARD_FOLIAGE_HEIGHT;
export const CALLA_PLANT_CARD_FLOWER_HEIGHT = Math.round( CALLA_FLOWER_LENGTH * CALLA_PLANT_CARD_TEXTURE_WIDTH / CALLA_PLANT_CARD_WIDTH );
export const CALLA_PLANT_CARD_TEXTURE_HEIGHT = CALLA_PLANT_CARD_FLOWER_Y + CALLA_PLANT_CARD_FLOWER_HEIGHT;

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
	const height = plant.height - CALLA_FLOWER_LENGTH;
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
	const baseY = plant.height - CALLA_FLOWER_LENGTH - 0.004;
	const allRows = back ? BACK_ROWS : FRONT_ROWS;
	const rows = lod === 0 ? allRows : [ allRows[ 0 ]!, allRows[ allRows.length - 1 ]! ];
	const vertices: number[][] = [];
	for ( const [ height, halfWidth, flare, v ] of rows ) {
		const y = baseY + ( CALLA_FLOWER_LENGTH + 0.004 ) * height;
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

	const baseY = plant.height - CALLA_FLOWER_LENGTH * 0.835;
	const halfWidth = 0.005;
	const centerX = plant.x + plant.leanX;
	const centerZ = plant.z + plant.leanZ;
	const tangentX = - Math.sin( plant.yaw );
	const tangentZ = Math.cos( plant.yaw );
	const radialX = Math.cos( plant.yaw );
	const radialZ = Math.sin( plant.yaw );
	const left = builder.addVertex( [ centerX - tangentX * halfWidth, baseY, centerZ - tangentZ * halfWidth ], [ 0, 1, 0 ], [ 0.82, 0.28 ], [ 1, 1, 1 ], 0.9 );
	const right = builder.addVertex( [ centerX + tangentX * halfWidth, baseY, centerZ + tangentZ * halfWidth ], [ 0, 1, 0 ], [ 0.92, 0.28 ], [ 1, 1, 1 ], 0.9 );
	const tip = builder.addVertex( [ centerX + radialX * 0.003, plant.height - CALLA_FLOWER_LENGTH * 0.21, centerZ + radialZ * 0.003 ], [ 0, 1, 0 ], [ 0.92, 0.73 ], [ 1, 1, 1 ], 1 );
	if ( lod === 0 ) {
		const back = builder.addVertex( [ centerX - radialX * 0.003, plant.height - CALLA_FLOWER_LENGTH * 0.21, centerZ - radialZ * 0.003 ], [ 0, 1, 0 ], [ 0.82, 0.73 ], [ 1, 1, 1 ], 1 );
		builder.addTriangle( left, right, tip );
		builder.addTriangle( left, tip, back );
	} else builder.addTriangle( left, right, tip );

}

/** 交差 2 枚のカード面に合わせて、茎と葉を投影したテクスチャを作ります。 */
function createCallaPlantCardFoliageTexture( referenceStemHeight: number, stemColor: number ): TextureData {

	const shape = createFlowerTextureShape( SIZE, STEM_HEIGHT );
	const tileWidth = SIZE / 2;
	for ( let tile = 0; tile < 2; tile ++ ) {
		const tileStart = tile * tileWidth;
		const tileCenter = tileStart + tileWidth * 0.5;
		const stemHalfWidth = 0.006 / CALLA_PLANT_CARD_FOLIAGE_WIDTH * tileWidth;
		rasterFlowerPolygon( shape, [
			[ tileCenter - stemHalfWidth, 0 ],
			[ tileCenter + stemHalfWidth, 0 ],
			[ tileCenter + stemHalfWidth, STEM_HEIGHT ],
			[ tileCenter - stemHalfWidth, STEM_HEIGHT ],
		], ( _x, y ) => 0.5 + y / STEM_HEIGHT * 0.3 + Math.max( 0, 1 - Math.abs( _x - tileCenter ) / stemHalfWidth ) * 0.2 );

		const planeAngle = tile === 0 ? 0 : - Math.PI * 0.5;
		const planeX = Math.cos( planeAngle );
		const planeZ = Math.sin( planeAngle );
		for ( let leaf = 0; leaf < 3; leaf ++ ) {
			const scale = 1 - leaf * 0.08;
			const angle = 0.5 + leaf * Math.PI * 2 / 3;
			const radialX = Math.cos( angle );
			const radialZ = Math.sin( angle );
			const tangentX = - radialZ;
			const tangentZ = radialX;
			const length = 0.27 * scale;
			const leafHalfWidth = 0.05 * scale;
			const baseHalfWidth = 0.006 * scale;
			const point = ( radial: number, side: number, y: number ): [ number, number, number ] => [
				radialX * radial + tangentX * side,
				y,
				radialZ * radial + tangentZ * side,
			];
			const base = [
				point( 0.007, - baseHalfWidth, 0.004 * scale ),
				point( 0.007, baseHalfWidth, 0.004 * scale ),
			];
			const middleHeight = length * LEAF_WIDEST * 0.9;
			const middleRadial = length * LEAF_WIDEST * 0.42;
			const curl = leafHalfWidth * 0.45;
			const middle = [
				point( middleRadial - curl, - leafHalfWidth * 0.9, middleHeight + 0.006 ),
				point( middleRadial, 0, middleHeight ),
				point( middleRadial - curl, leafHalfWidth * 0.9, middleHeight + 0.006 ),
			];
			const tip = point( length * 0.48, 0, length * 0.86 );
			const triangles = [
				[ base[ 0 ]!, base[ 1 ]!, middle[ 1 ]! ],
				[ base[ 0 ]!, middle[ 1 ]!, middle[ 0 ]! ],
				[ base[ 1 ]!, middle[ 2 ]!, middle[ 1 ]! ],
				[ middle[ 0 ]!, middle[ 1 ]!, tip ],
				[ middle[ 1 ]!, middle[ 2 ]!, tip ],
			];
			for ( const triangle of triangles ) {
				const projected = triangle.map( ( vertex ): [ number, number ] => {
					const across = ( vertex[ 0 ] * planeX + vertex[ 2 ] * planeZ ) * PLANT_CARD_LEAF_PROJECTION_SCALE;
					return [ tileCenter + across / CALLA_PLANT_CARD_FOLIAGE_WIDTH * tileWidth, vertex[ 1 ] / referenceStemHeight * STEM_HEIGHT ];
				} );
				rasterFlowerPolygon( shape, projected, ( _x, y ) => 0.5 + Math.max( 0, Math.min( 1, y / STEM_HEIGHT ) ) * 0.38 );
			}
		}
	}

	return createColorizedFlowerTexture( SIZE, STEM_HEIGHT, stemColor, shape.alpha, shape.shade );

}

/** 茎・葉と花を含む、calla LOD1/2 共通の縦カード用アトラスを作ります。 */
export function createCallaPlantCardTexture( maxCardHeight: number, petalColor: number, centerColor: number, stemColor: number ): TextureData {

	const width = CALLA_PLANT_CARD_TEXTURE_WIDTH;
	const height = CALLA_PLANT_CARD_TEXTURE_HEIGHT;
	const texture = new Uint8Array( width * height * 4 );
	const petalTexture = createCallaPetalTexture( petalColor, centerColor );
	const referenceStemHeight = Math.max( 0.001, maxCardHeight - CALLA_FLOWER_LENGTH );
	const foliageTexture = createCallaPlantCardFoliageTexture( referenceStemHeight, stemColor );
	// 2 枚のカード面ごとに LOD0 の葉を投影し、細い茎も同じ帯へ焼きます。
	compositeFlowersTextureRegion( texture, width, height, foliageTexture, 0, 0, SIZE, STEM_HEIGHT, 0, 0, SIZE, STEM_HEIGHT );
	compositeFlowersTextureRegion( texture, width, height, petalTexture, 0, 0, 96, petalTexture.height, 16, CALLA_PLANT_CARD_FLOWER_Y, 96, CALLA_PLANT_CARD_FLOWER_HEIGHT );
	compositeFlowersTextureRegion( texture, width, height, petalTexture, 104, 0, 16, petalTexture.height, 56, CALLA_PLANT_CARD_FLOWER_Y, 16, CALLA_PLANT_CARD_FLOWER_HEIGHT );

	return { width, height, data: texture, wrap: 'clamp' };

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

/** LOD1/2 は共有カード画像へ葉を投影し、花の実寸を保つ別クワッドを重ねます。 */
export function buildCallaPlantCardPart( plants: FlowerPlacement[], partIndex: number, lod: 1 | 2 ): MeshData {

	const builder = new MeshBuilder();
	const foliageHalfWidth = CALLA_PLANT_CARD_FOLIAGE_WIDTH * 0.5;
	const textureHeight = CALLA_PLANT_CARD_TEXTURE_HEIGHT;
	const referenceStemHeight = Math.max( 0.001, ...plants.map( ( plant ) => plant.height - CALLA_FLOWER_LENGTH ) );

	builder.beginGroup( partIndex );
	for ( const plant of plants ) {
		const stemHeight = plant.height - CALLA_FLOWER_LENGTH;
		const cardYaws = [ - plant.yaw, - plant.yaw + Math.PI * 0.5 ];
		for ( let card = 0; card < cardYaws.length; card ++ ) {
			const yaw = cardYaws[ card ]!;
			const cosine = Math.cos( yaw );
			const sine = Math.sin( yaw );
			const topCenterX = plant.x + plant.leanX;
			const topCenterZ = plant.z + plant.leanZ;
			const tileStart = card * 0.5;
			const tileEnd = tileStart + 0.5;
			const foliageV = stemHeight / referenceStemHeight * STEM_HEIGHT / textureHeight;
			const foliage = [
				builder.addVertex( [ plant.x - cosine * foliageHalfWidth, 0, plant.z + sine * foliageHalfWidth ], [ 0, 1, 0 ], [ tileStart, 0 ], [ 1, 1, 1 ], 0 ),
				builder.addVertex( [ plant.x + cosine * foliageHalfWidth, 0, plant.z - sine * foliageHalfWidth ], [ 0, 1, 0 ], [ tileEnd, 0 ], [ 1, 1, 1 ], 0 ),
				builder.addVertex( [ topCenterX + cosine * foliageHalfWidth, stemHeight, topCenterZ - sine * foliageHalfWidth ], [ 0, 1, 0 ], [ tileEnd, foliageV ], [ 1, 1, 1 ], stemHeight / plant.height ),
				builder.addVertex( [ topCenterX - cosine * foliageHalfWidth, stemHeight, topCenterZ + sine * foliageHalfWidth ], [ 0, 1, 0 ], [ tileStart, foliageV ], [ 1, 1, 1 ], stemHeight / plant.height ),
			];
			builder.addTriangle( foliage[ 0 ]!, foliage[ 1 ]!, foliage[ 2 ]! );
			builder.addTriangle( foliage[ 0 ]!, foliage[ 2 ]!, foliage[ 3 ]! );

			if ( lod === 1 ) {
				builder.beginGroup( 1 );
				addCallaStemCard( builder, plant, yaw, 1 );
				builder.beginGroup( partIndex );
			}

			const flowerHalfWidth = CALLA_PLANT_CARD_WIDTH * 0.5;
			const flower = [
				builder.addVertex( [ topCenterX - cosine * flowerHalfWidth, stemHeight, topCenterZ + sine * flowerHalfWidth ], [ 0, 1, 0 ], [ 16 / SIZE, CALLA_PLANT_CARD_FLOWER_Y / textureHeight ], [ 1, 1, 1 ], stemHeight / plant.height ),
				builder.addVertex( [ topCenterX + cosine * flowerHalfWidth, stemHeight, topCenterZ - sine * flowerHalfWidth ], [ 0, 1, 0 ], [ 112 / SIZE, CALLA_PLANT_CARD_FLOWER_Y / textureHeight ], [ 1, 1, 1 ], stemHeight / plant.height ),
				builder.addVertex( [ topCenterX + cosine * flowerHalfWidth, plant.height, topCenterZ - sine * flowerHalfWidth ], [ 0, 1, 0 ], [ 112 / SIZE, 1 ], [ 1, 1, 1 ], 1 ),
				builder.addVertex( [ topCenterX - cosine * flowerHalfWidth, plant.height, topCenterZ + sine * flowerHalfWidth ], [ 0, 1, 0 ], [ 16 / SIZE, 1 ], [ 1, 1, 1 ], 1 ),
			];
			builder.addTriangle( flower[ 0 ]!, flower[ 1 ]!, flower[ 2 ]! );
			builder.addTriangle( flower[ 0 ]!, flower[ 2 ]!, flower[ 3 ]! );
		}
	}

	return builder.build();

}

export function buildCallaPart( lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	const builder = new MeshBuilder();
	for ( const plant of plants ) {
		if ( part === 'petal' ) {
			addCallaFunnelCard( builder, plant, plant.yaw, true, lod );
			addCallaFunnelCard( builder, plant, plant.yaw + Math.PI * 0.5, false, lod );
			addCallaSpadix( builder, plant, lod );
		} else if ( lod === 0 ) {
			// 花茎はまっすぐなので 1 段でよい（中段の頂点は直線上で形に効かない）。
			addCallaStemCard( builder, plant, plant.yaw, 1 );
			addCallaStemCard( builder, plant, plant.yaw + plant.crossAngle, 1 );
			for ( let leaf = 0; leaf < 3; leaf ++ ) addCallaLeaf( builder, plant, plant.yaw + 0.5 + leaf * Math.PI * 2 / 3, 1 - leaf * 0.08, leaf );
		} else if ( lod === 1 ) {
			// LOD1 の独立茎カードもまっすぐな交差 2 枚。葉は plantCard テクスチャに描く。
			addCallaStemCard( builder, plant, - plant.yaw, 1 );
			addCallaStemCard( builder, plant, - plant.yaw + Math.PI * 0.5, 1 );
		}
	}
	return setPartIndex( builder.build(), part );

}
