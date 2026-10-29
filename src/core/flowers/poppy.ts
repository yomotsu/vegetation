import { createColorizedFlowerTexture, createFlowerTextureShape, rasterFlowerCircle, rasterFlowerPolygon } from '../flowersTexture';
import { MeshBuilder } from '../meshBuilder';
import type { MeshData, TextureData } from '../types';
import type { FlowerPlacement } from './common';
import { setPartIndex } from './common';

const TEXTURE_SIZE = 128;
const STEM_WIDTH = 128;
const STEM_HEIGHT = 256;
const LEAF_CARD_SPAN = 2;
// 茎テクスチャ内の葉の位置（画素）。ジオメトリの UV もこれから求める。
// 葉は縦 1 列に並べ、UV を広げても隣の葉の絵を拾わないようにする。
const POPPY_LEAVES = [
	{ x: 66, y: 15, w: 17, h: 86, lean: - 0.12 },
	{ x: 66, y: 143, w: 17, h: 86, lean: 0.1 },
];
const BUD_CENTER_X = 116;
const BUD_CENTER_Y = 128;
const BUD_LENGTH = 0.045;
const BUD_WIDTH = 0.026;

function radialPetal( centerX: number, centerY: number, angle: number, inner: number, outer: number, halfWidth: number ): [ number, number ][] {

	const directionX = Math.cos( angle );
	const directionY = Math.sin( angle );
	const sideX = - directionY;
	const sideY = directionX;
	const point = ( radius: number, width: number ): [ number, number ] => [ centerX + directionX * radius + sideX * width, centerY + directionY * radius + sideY * width ];
	const tip = outer - halfWidth * 0.78;
	const points = [ point( inner, - halfWidth * 0.35 ), point( inner + 4, - halfWidth * 0.9 ), point( tip - 2, - halfWidth ) ];
	for ( let step = 0; step <= 8; step ++ ) {
		const cap = - Math.PI * 0.5 + step / 8 * Math.PI;
		points.push( point( tip + Math.cos( cap ) * halfWidth, Math.sin( cap ) * halfWidth ) );
	}
	points.push( point( inner + 4, halfWidth * 0.9 ), point( inner, halfWidth * 0.35 ) );
	return points;

}

export function createPoppyPetalTexture( seed: number, petalColor: number, centerColor: number ): TextureData {

	const shape = createFlowerTextureShape( TEXTURE_SIZE, TEXTURE_SIZE );
	const centerX = 43;
	const centerY = 64;
	const rotation = ( seed % 31 ) * 0.003;
	for ( let petal = 0; petal < 4; petal ++ ) {
		const angle = rotation + petal * Math.PI * 0.5 + 0.18;
		const directionX = Math.cos( angle );
		const directionY = Math.sin( angle );
		const sideX = - directionY;
		const sideY = directionX;
		rasterFlowerPolygon( shape, radialPetal( centerX, centerY, angle, 3, 34 + ( petal % 2 ) * 2, 20 ), ( x, y ) => {
			const along = Math.max( 0, Math.min( 1, ( ( x - centerX ) * directionX + ( y - centerY ) * directionY - 3 ) / 33 ) );
			const across = Math.min( 1, Math.abs( ( x - centerX ) * sideX + ( y - centerY ) * sideY ) / 20 );
			return 0.42 + along * 0.58 - across * across * 0.21 - Math.exp( - across * 28 ) * 0.08;
		} );
	}

	// 芯と雄しべの輪は固定色で焼き込む。
	rasterFlowerCircle( shape, centerX, centerY, 8, ( distance ) => 0.86 - distance * 0.18, true );
	for ( let stamen = 0; stamen < 10; stamen ++ ) {
		const angle = stamen / 10 * Math.PI * 2 + rotation;
		rasterFlowerCircle( shape, centerX + Math.cos( angle ) * 10, centerY + Math.sin( angle ) * 10, 1.7, () => 1.08, true );
	}

	return createColorizedFlowerTexture( TEXTURE_SIZE, TEXTURE_SIZE, petalColor, shape.alpha, shape.shade, shape.fixed, centerColor, shape.fixedShade );

}

export function createPoppyStemTexture( stemColor: number ): TextureData {

	const shape = createFlowerTextureShape( STEM_WIDTH, STEM_HEIGHT );
	rasterFlowerPolygon( shape, [ [ 10, 0 ], [ 15, 0 ], [ 14, 255 ], [ 9, 255 ] ], ( x, y ) => 0.49 + y / STEM_HEIGHT * 0.28 + Math.max( 0, 1 - Math.abs( x - 12 ) / 3 ) * 0.22 );
	// うつむいた緑のつぼみ（右端の空き）。上が付け根。
	const budPoints: [ number, number ][] = [];
	for ( let step = 0; step < 16; step ++ ) {
		const angle = step / 16 * Math.PI * 2;
		const radiusX = 8.5 * ( 1 - 0.18 * Math.max( 0, Math.sin( angle ) ) );
		budPoints.push( [ BUD_CENTER_X + Math.cos( angle ) * radiusX, BUD_CENTER_Y + Math.sin( angle ) * 15 ] );
	}
	rasterFlowerPolygon( shape, budPoints, ( x, y ) => {
		const across = Math.min( 1, Math.abs( x - BUD_CENTER_X ) / 8.5 );
		return 0.5 + ( BUD_CENTER_Y + 15 - y ) / 30 * 0.32 - across * across * 0.22;
	} );

	for ( const leaf of POPPY_LEAVES ) {
		const points: [ number, number ][] = [];
		for ( let step = 0; step <= 8; step ++ ) {
			const progress = step / 8;
			const x = leaf.x + leaf.lean * ( progress - 0.5 ) * leaf.h;
			const lobing = 0.76 + 0.24 * Math.cos( progress * Math.PI * 6 );
			const width = Math.sin( Math.PI * progress ) ** 0.65 * leaf.w * lobing;
			points.push( [ x + width, leaf.y + progress * leaf.h ] );
		}
		for ( let step = 8; step >= 0; step -- ) {
			const progress = step / 8;
			const x = leaf.x + leaf.lean * ( progress - 0.5 ) * leaf.h;
			const lobing = 0.76 + 0.24 * Math.cos( progress * Math.PI * 6 );
			const width = Math.sin( Math.PI * progress ) ** 0.65 * leaf.w * lobing;
			points.push( [ x - width, leaf.y + progress * leaf.h ] );
		}
		rasterFlowerPolygon( shape, points, ( x, y ) => {
			const progress = Math.max( 0, Math.min( 1, ( y - leaf.y ) / leaf.h ) );
			const across = Math.min( 1, Math.abs( x - leaf.x - leaf.lean * ( progress - 0.5 ) * leaf.h ) / leaf.w );
			return 0.43 + progress * 0.43 - across * across * 0.26 - Math.exp( - across * 32 ) * 0.1;
		} );
	}

	return createColorizedFlowerTexture( STEM_WIDTH, STEM_HEIGHT, stemColor, shape.alpha, shape.shade );

}

function poppySpine( plant: FlowerPlacement, progress: number ): [ number, number, number ] {

	const curve = progress ** 2.4;
	// つぼみの茎は先で横へ曲がり、少し垂れる。
	const hookProgress = plant.bud && progress > 0.8 ? ( progress - 0.8 ) / 0.2 : 0;
	const hook = hookProgress ** 0.8 * 0.035;
	const drop = hookProgress ** 2.2 * 0.045;
	return [ plant.x + plant.leanX * curve - Math.cos( plant.yaw ) * hook, plant.height * progress - drop, plant.z + plant.leanZ * curve - Math.sin( plant.yaw ) * hook ];

}

function addPoppyStemCard( builder: MeshBuilder, plant: FlowerPlacement, yaw: number, segments: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const halfWidth = 0.004;
	const vertices: number[] = [];
	for ( let row = 0; row <= segments; row ++ ) {
		const progress = 1 - ( 1 - row / segments ) ** 1.4;
		const [ x, y, z ] = poppySpine( plant, progress );
		vertices.push(
			builder.addVertex( [ x - cosine * halfWidth, y, z + sine * halfWidth ], [ 0, 1, 0 ], [ 0.07, progress ], [ 1, 1, 1 ], progress ),
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

function addPoppyLeaf( builder: MeshBuilder, plant: FlowerPlacement, angle: number, slot: number ): void {

	const radialX = Math.cos( angle );
	const radialZ = Math.sin( angle );
	const tangentX = - radialZ;
	const tangentZ = radialX;
	const length = 0.12;
	// 葉の絵がひし形の縁で切れないよう、カードと UV を絵の幅の 2 倍に広げる。
	const halfWidth = 0.025 * LEAF_CARD_SPAN;
	const baseX = plant.x;
	const baseZ = plant.z;
	const centerX = baseX + radialX * length * 0.56;
	const centerZ = baseZ + radialZ * length * 0.56;
	const tipX = baseX + radialX * length;
	const tipZ = baseZ + radialZ * length;
	// 葉の絵の下端中央が茎の根元に来るよう、絵の位置から UV を求める。
	const leaf = POPPY_LEAVES[ slot % POPPY_LEAVES.length ]!;
	const centerU = leaf.x / STEM_WIDTH;
	const halfU = leaf.w / STEM_WIDTH * LEAF_CARD_SPAN;
	const baseV = leaf.y / STEM_HEIGHT;
	const tipV = ( leaf.y + leaf.h ) / STEM_HEIGHT;
	const middleV = baseV + ( tipV - baseV ) * 0.56;
	const vertices = [
		builder.addVertex( [ baseX, 0.012, baseZ ], [ 0, 1, 0 ], [ centerU - leaf.lean * 0.5 * leaf.h / STEM_WIDTH, baseV ], [ 1, 1, 1 ], 0.04 ),
		builder.addVertex( [ centerX - tangentX * halfWidth, 0.028, centerZ - tangentZ * halfWidth ], [ 0, 1, 0 ], [ centerU - halfU, middleV ], [ 1, 1, 1 ], 0.22 ),
		builder.addVertex( [ tipX, 0.018, tipZ ], [ 0, 1, 0 ], [ centerU + leaf.lean * 0.5 * leaf.h / STEM_WIDTH, tipV ], [ 1, 1, 1 ], 0.12 ),
		builder.addVertex( [ centerX + tangentX * halfWidth, 0.028, centerZ + tangentZ * halfWidth ], [ 0, 1, 0 ], [ centerU + halfU, middleV ], [ 1, 1, 1 ], 0.22 ),
	];
	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 2 ]! );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 2 ]!, vertices[ 3 ]! );

}

// うつむいた緑のつぼみ。茎の先から下へ垂らす（茎のパーツ）。
function addPoppyBudCard( builder: MeshBuilder, plant: FlowerPlacement, lod: number, yaw: number ): void {

	const [ topX, topY, topZ ] = poppySpine( plant, 1 );
	const sideX = Math.cos( yaw );
	const sideZ = Math.sin( yaw );
	const half = BUD_WIDTH * 0.5;
	const u0 = ( BUD_CENTER_X - 9 ) / STEM_WIDTH;
	const u1 = ( BUD_CENTER_X + 9 ) / STEM_WIDTH;
	const vTop = ( BUD_CENTER_Y + 15 ) / STEM_HEIGHT;
	const vBottom = ( BUD_CENTER_Y - 15 ) / STEM_HEIGHT;
	// 付け根を茎の先に少し重ねて、離れて見えないようにする。
	const attachY = topY + 0.004;
	const vertices = [
		builder.addVertex( [ topX - sideX * half, attachY, topZ - sideZ * half ], [ 0, 1, 0 ], [ u0, vTop ], [ 1, 1, 1 ], 1 ),
		builder.addVertex( [ topX + sideX * half, attachY, topZ + sideZ * half ], [ 0, 1, 0 ], [ u1, vTop ], [ 1, 1, 1 ], 1 ),
		builder.addVertex( [ topX + sideX * half, attachY - BUD_LENGTH, topZ + sideZ * half ], [ 0, 1, 0 ], [ u1, vBottom ], [ 1, 1, 1 ], 1 ),
		builder.addVertex( [ topX - sideX * half, attachY - BUD_LENGTH, topZ - sideZ * half ], [ 0, 1, 0 ], [ u0, vBottom ], [ 1, 1, 1 ], 1 ),
	];
	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 2 ]! );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 2 ]!, vertices[ 3 ]! );

}

// うつむいた緑のつぼみ。曲がった茎の先から下へ垂らす（茎のパーツ）。
function addPoppyBud( builder: MeshBuilder, plant: FlowerPlacement, lod: number ): void {

	addPoppyBudCard( builder, plant, lod, plant.yaw );
	if ( lod === 0 ) addPoppyBudCard( builder, plant, lod, plant.yaw + Math.PI * 0.5 );

}

function addPoppyHead( builder: MeshBuilder, plant: FlowerPlacement, lod: number ): void {

	if ( plant.bud ) return;
	// 花の中心は茎の先に置く（低く置くと茎が花を突き抜ける）。
	const [ centerX, centerY, centerZ ] = poppySpine( plant, 1 );
	const center = [ centerX, centerY, centerZ ] as [ number, number, number ];

	if ( lod !== 0 ) {
		const left = builder.addVertex( [ center[ 0 ] - 0.04, centerY, center[ 2 ] ], [ 0, 1, 0 ], [ 0.05, 0.2 ], [ 1, 1, 1 ], 1 );
		const right = builder.addVertex( [ center[ 0 ] + 0.04, centerY, center[ 2 ] ], [ 0, 1, 0 ], [ 0.63, 0.2 ], [ 1, 1, 1 ], 1 );
		const tip = builder.addVertex( [ center[ 0 ], centerY + 0.018, center[ 2 ] ], [ 0, 1, 0 ], [ 0.34, 0.82 ], [ 1, 1, 1 ], 1 );
		builder.addTriangle( left, right, tip );
		return;
	}

	const radius = 0.063;
	const centerVertex = builder.addVertex( center, [ 0, 1, 0 ], [ 0.34, 0.5 ], [ 1, 1, 1 ], 1 );
	const corners: number[] = [];
	for ( let corner = 0; corner < 4; corner ++ ) {
		const angle = Math.PI * 0.25 + corner * Math.PI * 0.5 + plant.yaw * 0.02;
		const x = Math.cos( angle ) * radius;
		const z = Math.sin( angle ) * radius;
		const tilt = ( x * Math.cos( plant.headTiltYaw ) + z * Math.sin( plant.headTiltYaw ) ) * Math.tan( plant.headTilt );
		corners.push( builder.addVertex( [ center[ 0 ] + x, centerY + tilt + 0.02, center[ 2 ] + z ], [ 0, 1, 0 ], [ 0.02 + ( corner === 1 || corner === 2 ? 0.62 : 0 ), 0.2 + ( corner >= 2 ? 0.62 : 0 ) ], [ 1, 1, 1 ], 1 ) );
	}
	for ( let corner = 0; corner < 4; corner ++ ) builder.addTriangle( centerVertex, corners[ corner ]!, corners[ ( corner + 1 ) % 4 ]! );

}

export function buildPoppyPart( lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	const builder = new MeshBuilder();
	for ( const plant of plants ) {
		if ( part === 'petal' ) {
			addPoppyHead( builder, plant, lod );
		} else {
			const segments = lod === 0 ? 3 : 1;
			addPoppyStemCard( builder, plant, plant.yaw, segments );
			addPoppyStemCard( builder, plant, plant.yaw + plant.crossAngle, segments );
			if ( plant.bud ) addPoppyBud( builder, plant, lod );
			const leafCount = lod === 0 ? 6 : lod === 1 ? 3 : 1;
			for ( let leaf = 0; leaf < leafCount; leaf ++ ) addPoppyLeaf( builder, plant, plant.yaw + leaf / leafCount * Math.PI * 2, leaf );
		}
	}
	return setPartIndex( builder.build(), part );

}
