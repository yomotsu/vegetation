import { createColorizedFlowerTexture, createFlowerTextureShape, rasterFlowerCircle, rasterFlowerPolygon } from '../flowersTexture';
import { MeshBuilder } from '../meshBuilder';
import type { MeshData, TextureData } from '../types';
import type { FlowerPlacement } from './common';
import { setPartIndex } from './common';

const SIZE = 128;
const STEM_WIDTH = 128;
const STEM_HEIGHT = 256;

function primrosePetal( centerX: number, centerY: number, angle: number, outerRadius: number, halfWidth: number ): [ number, number ][] {

	const directionX = Math.cos( angle );
	const directionY = Math.sin( angle );
	const sideX = - directionY;
	const sideY = directionX;
	const point = ( radius: number, across: number ): [ number, number ] => [ centerX + directionX * radius + sideX * across, centerY + directionY * radius + sideY * across ];
	const tip = outerRadius - halfWidth * 0.72;
	const points = [ point( 1.5, - halfWidth * 0.38 ), point( tip, - halfWidth ) ];
	for ( let step = 0; step <= 6; step ++ ) {
		const cap = - Math.PI * 0.5 + step / 6 * Math.PI;
		points.push( point( tip + Math.cos( cap ) * halfWidth, Math.sin( cap ) * halfWidth ) );
	}
	points.push( point( tip, halfWidth ), point( 1.5, halfWidth * 0.38 ) );
	return points;

}

export function createPrimrosePetalTexture( seed: number, petalColor: number, centerColor: number ): TextureData {

	const shape = createFlowerTextureShape( SIZE, SIZE );
	const centers = [ [ 36, 46 ], [ 75, 42 ], [ 54, 75 ], [ 91, 78 ], [ 25, 93 ] ];
	for ( let flower = 0; flower < centers.length; flower ++ ) {
		const [ centerX, centerY ] = centers[ flower ]!;
		const rotation = seed * 0.11 + flower * 0.19;
		for ( let petal = 0; petal < 5; petal ++ ) {
			const angle = rotation + petal * Math.PI * 2 / 5;
			const directionX = Math.cos( angle );
			const directionY = Math.sin( angle );
			const sideX = - directionY;
			const sideY = directionX;
			rasterFlowerPolygon( shape, primrosePetal( centerX!, centerY!, angle, 17 + ( petal % 2 ), 6.2 ), ( x, y ) => {
				const along = Math.max( 0, Math.min( 1, ( ( x - centerX! ) * directionX + ( y - centerY! ) * directionY ) / 17 ) );
				const across = Math.min( 1, Math.abs( ( x - centerX! ) * sideX + ( y - centerY! ) * sideY ) / 6.2 );
				return 0.56 + Math.sqrt( along ) * 0.44 - across * across * 0.22 - ( along < 0.18 ? 0.08 : 0 );
			} );
		}
		rasterFlowerCircle( shape, centerX!, centerY!, 2.8, ( distance ) => 0.76 + 0.3 * ( 1 - distance ), true );
	}

	return createColorizedFlowerTexture( SIZE, SIZE, petalColor, shape.alpha, shape.shade, shape.fixed, centerColor, shape.fixedShade );

}

export function createPrimroseStemTexture( stemColor: number ): TextureData {

	const shape = createFlowerTextureShape( STEM_WIDTH, STEM_HEIGHT );
	// 茎と花柄: 根元の 1 本から、花房へ向かって 5 本の花柄が扇形に分かれる（左端 x 1〜17）。
	rasterFlowerPolygon( shape, [ [ 7, 0 ], [ 11, 0 ], [ 10.5, 96 ], [ 7.5, 96 ] ], ( x, y ) => 0.46 + y / STEM_HEIGHT * 0.3 + Math.max( 0, 1 - Math.abs( x - 9 ) / 2 ) * 0.2 );
	for ( let shoot = 0; shoot < 5; shoot ++ ) {
		const topX = 2.5 + shoot * 3.25;
		const topY = 250 - ( shoot % 2 ) * 14;
		rasterFlowerPolygon( shape, [ [ 8.4, 90 ], [ 9.6, 90 ], [ topX + 0.5, topY ], [ topX - 0.5, topY ] ], ( x, y ) => {
			const t = ( y - 90 ) / ( topY - 90 );
			const middle = 9 + ( topX - 9 ) * t;
			return 0.52 + t * 0.3 + Math.max( 0, 1 - Math.abs( x - middle ) / 0.7 ) * 0.14;
		} );
	}

	const leaves = [
		{ x: 40, y: 7, w: 15, h: 67, lean: - 0.1 },
		{ x: 86, y: 7, w: 15, h: 67, lean: 0.12 },
		{ x: 40, y: 91, w: 15, h: 67, lean: 0.14 },
		{ x: 86, y: 91, w: 15, h: 67, lean: - 0.12 },
		{ x: 40, y: 175, w: 15, h: 67, lean: 0.1 },
		{ x: 86, y: 175, w: 15, h: 67, lean: - 0.1 },
	];
	for ( const leaf of leaves ) {
		const points: [ number, number ][] = [];
		for ( let step = 0; step <= 10; step ++ ) {
			const progress = step / 10;
			const center = leaf.x + leaf.lean * progress * leaf.h;
			const width = Math.sin( Math.PI * progress ) ** 0.65 * leaf.w;
			points.push( [ center + width, leaf.y + progress * leaf.h ] );
		}
		for ( let step = 10; step >= 0; step -- ) {
			const progress = step / 10;
			const center = leaf.x + leaf.lean * progress * leaf.h;
			const width = Math.sin( Math.PI * progress ) ** 0.65 * leaf.w;
			points.push( [ center - width, leaf.y + progress * leaf.h ] );
		}
		rasterFlowerPolygon( shape, points, ( x, y ) => {
			const progress = Math.max( 0, Math.min( 1, ( y - leaf.y ) / leaf.h ) );
			const across = Math.min( 1, Math.abs( x - leaf.x - leaf.lean * progress * leaf.h ) / leaf.w );
			return 0.43 + progress * 0.45 - across * across * 0.26 - Math.exp( - across * 26 ) * 0.13;
		} );
	}

	return createColorizedFlowerTexture( STEM_WIDTH, STEM_HEIGHT, stemColor, shape.alpha, shape.shade );

}

// 花のお椀の深さ（m）、花房の半径と傾き。
const PRIMROSE_CUP_DEPTH = 0.012;
const PRIMROSE_CLUSTER_RADIUS = 0.045;
const PRIMROSE_CLUSTER_TILT = 0.45;

function addPrimroseStemCard( builder: MeshBuilder, plant: FlowerPlacement, yaw: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	// 花柄の扇が花房まで届くよう、幅を花房に合わせ、高さを花房の中ほどまで伸ばす。
	const halfWidth = 0.016;
	const height = plant.height * 0.31 + 0.002 + PRIMROSE_CUP_DEPTH * 0.8;
	const vertices: number[] = [];
	for ( let row = 0; row <= 1; row ++ ) {
		const progress = row;
		const x = plant.x + plant.leanX * progress * 0.04;
		const z = plant.z + plant.leanZ * progress * 0.04;
		vertices.push(
			builder.addVertex( [ x - cosine * halfWidth * ( 0.1 + 0.9 * progress ), height * progress, z + sine * halfWidth * progress ], [ 0, 1, 0 ], [ progress === 0 ? 7 / STEM_WIDTH : 1 / STEM_WIDTH, progress ], [ 1, 1, 1 ], progress ),
			builder.addVertex( [ x + cosine * halfWidth * ( 0.1 + 0.9 * progress ), height * progress, z - sine * halfWidth * progress ], [ 0, 1, 0 ], [ progress === 0 ? 11 / STEM_WIDTH : 17 / STEM_WIDTH, progress ], [ 1, 1, 1 ], progress ),
		);
	}
	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 3 ]! );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 3 ]!, vertices[ 2 ]! );

}

function addPrimroseLeaf( builder: MeshBuilder, plant: FlowerPlacement, angle: number, slot: number ): void {

	const radialX = Math.cos( angle );
	const radialZ = Math.sin( angle );
	const tangentX = - radialZ;
	const tangentZ = radialX;
	const baseX = plant.x + radialX * 0.008;
	const baseZ = plant.z + radialZ * 0.008;
	const tipX = plant.x + radialX * 0.105;
	const tipZ = plant.z + radialZ * 0.105;
	const sideX = tangentX * 0.03;
	const sideZ = tangentZ * 0.03;
	const centerX = plant.x + radialX * 0.06;
	const centerZ = plant.z + radialZ * 0.06;
	const cells: [ number, number, number, number ][] = [ [ 0.19, 0.02, 0.43, 0.29 ], [ 0.55, 0.02, 0.79, 0.29 ], [ 0.19, 0.36, 0.43, 0.63 ], [ 0.55, 0.36, 0.79, 0.63 ], [ 0.19, 0.69, 0.43, 0.96 ], [ 0.55, 0.69, 0.79, 0.96 ] ];
	const cell = cells[ slot % cells.length ]!;
	const vertices = [
		builder.addVertex( [ baseX - sideX * 0.12, 0.014, baseZ - sideZ * 0.12 ], [ 0, 1, 0 ], [ cell[ 0 ], cell[ 1 ] ], [ 1, 1, 1 ], 0.05 ),
		builder.addVertex( [ centerX - sideX, 0.047, centerZ - sideZ ], [ 0, 1, 0 ], [ cell[ 0 ], cell[ 3 ] ], [ 1, 1, 1 ], 0.24 ),
		builder.addVertex( [ tipX, 0.026, tipZ ], [ 0, 1, 0 ], [ cell[ 2 ], cell[ 3 ] ], [ 1, 1, 1 ], 0.15 ),
		builder.addVertex( [ centerX + sideX, 0.047, centerZ + sideZ ], [ 0, 1, 0 ], [ cell[ 2 ], cell[ 1 ] ], [ 1, 1, 1 ], 0.24 ),
	];
	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 2 ]! );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 2 ]!, vertices[ 3 ]! );

}


function addPrimroseCluster( builder: MeshBuilder, plant: FlowerPlacement, lod: number ): void {

	const centerY = plant.height * 0.31 + 0.002;
	const radius = PRIMROSE_CLUSTER_RADIUS;
	if ( lod === 2 ) {
		const left = builder.addVertex( [ plant.x - radius, centerY, plant.z ], [ 0, 1, 0 ], [ 0, 0.1 ], [ 1, 1, 1 ], 1 );
		const right = builder.addVertex( [ plant.x + radius, centerY, plant.z ], [ 0, 1, 0 ], [ 1, 0.1 ], [ 1, 1, 1 ], 1 );
		const top = builder.addVertex( [ plant.x, centerY + 0.005, plant.z + radius ], [ 0, 1, 0 ], [ 0.5, 1 ], [ 1, 1, 1 ], 1 );
		builder.addTriangle( left, right, top );
		return;
	}
	// 中心を低く、四隅を持ち上げたお椀形（daisy と同じ 5 頂点）。
	const corners = [
		[ plant.x - radius, centerY, plant.z ],
		[ plant.x, centerY, plant.z - radius ],
		[ plant.x + radius, centerY, plant.z ],
		[ plant.x, centerY, plant.z + radius ],
	] as [ number, number, number ][];
	for ( const point of corners ) point[ 1 ] = centerY + PRIMROSE_CUP_DEPTH + ( ( point[ 0 ]! - plant.x ) * Math.cos( plant.yaw ) + ( point[ 2 ]! - plant.z ) * Math.sin( plant.yaw ) ) * PRIMROSE_CLUSTER_TILT;
	const uv: [ number, number ][] = [ [ 0, 0 ], [ 0, 1 ], [ 1, 1 ], [ 1, 0 ] ];
	if ( lod !== 0 ) {
		// LOD1 は平らな 4 頂点のカード（頂点数の上限のため）。
		const flat = corners.map( ( point, index ) => builder.addVertex( [ point[ 0 ], point[ 1 ] - PRIMROSE_CUP_DEPTH * 0.5, point[ 2 ] ], [ 0, 1, 0 ], uv[ index ]!, [ 1, 1, 1 ], 1 ) );
		builder.addTriangle( flat[ 0 ]!, flat[ 1 ]!, flat[ 2 ]! );
		builder.addTriangle( flat[ 0 ]!, flat[ 2 ]!, flat[ 3 ]! );
		return;
	}
	const center = builder.addVertex( [ plant.x, centerY, plant.z ], [ 0, 1, 0 ], [ 0.5, 0.5 ], [ 1, 1, 1 ], 1 );
	const vertices = corners.map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], uv[ index ]!, [ 1, 1, 1 ], 1 ) );
	for ( let corner = 0; corner < 4; corner ++ ) builder.addTriangle( center, vertices[ corner ]!, vertices[ ( corner + 1 ) % 4 ]! );

}

export function buildPrimrosePart( lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	const builder = new MeshBuilder();
	for ( const plant of plants ) {
		if ( part === 'petal' ) {
			addPrimroseCluster( builder, plant, lod );
		} else if ( lod === 0 ) {
			addPrimroseStemCard( builder, plant, plant.yaw );
			addPrimroseStemCard( builder, plant, plant.yaw + plant.crossAngle );
			for ( let leaf = 0; leaf < 6; leaf ++ ) addPrimroseLeaf( builder, plant, plant.yaw + leaf * Math.PI / 3, leaf );
		} else {
			const height = plant.height * 0.31;
			const base = builder.addVertex( [ plant.x, 0, plant.z ], [ 0, 1, 0 ], [ 0.08, 0 ], [ 1, 1, 1 ], 0 );
			const left = builder.addVertex( [ plant.x - 0.003, height, plant.z ], [ 0, 1, 0 ], [ 0.08, 1 ], [ 1, 1, 1 ], 0.7 );
			const right = builder.addVertex( [ plant.x + 0.003, height, plant.z ], [ 0, 1, 0 ], [ 0.14, 1 ], [ 1, 1, 1 ], 0.7 );
			builder.addTriangle( base, left, right );
			const leafCount = lod === 1 ? 3 : 1;
			for ( let leaf = 0; leaf < leafCount; leaf ++ ) addPrimroseLeaf( builder, plant, plant.yaw + leaf * 2 * Math.PI / leafCount, leaf );
		}
	}
	return setPartIndex( builder.build(), part );

}
