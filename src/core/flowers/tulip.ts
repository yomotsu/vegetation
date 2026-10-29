import { createColorizedFlowerTexture } from '../flowersTexture';
import { MeshBuilder } from '../meshBuilder';
import type { MeshData, TextureData } from '../types';
import type { FlowerPlacement } from './common';
import { setPartIndex } from './common';

const SIZE = 128;

// 花の高さ。参考の形: 付け根からすぐ丸く膨らみ、高さの約 40% で最も太く、口へ少しすぼめる卵形。
const BLOOM_HEIGHT = 0.06;
// 花びらの段: [ 高さの割合, 中心からの張り出し (m), 半幅 (m), v ]
const PETAL_ROWS: [ number, number, number, number ][] = [
	[ 0, 0.006, 0.013, 0 ],
	[ 0.4, 0.024, 0.026, 0.45 ],
	[ 1, 0.017, 0.022, 1 ],
];

function addTulipPetal( builder: MeshBuilder, plant: FlowerPlacement, angle: number ): void {

	const radialX = Math.cos( angle );
	const radialZ = Math.sin( angle );
	const tangentX = - radialZ;
	const tangentZ = radialX;
	const baseY = plant.height - BLOOM_HEIGHT;
	const rows = PETAL_ROWS.map( ( [ heightRatio, offset, halfWidth, v ] ) => {
		const centerX = plant.x + plant.leanX + radialX * offset;
		const centerZ = plant.z + plant.leanZ + radialZ * offset;
		const y = baseY + BLOOM_HEIGHT * heightRatio;
		const wind = 0.82 + 0.18 * heightRatio;
		return [
			builder.addVertex( [ centerX - tangentX * halfWidth, y, centerZ - tangentZ * halfWidth ], [ 0, 1, 0 ], [ 0, v ], [ 1, 1, 1 ], wind ),
			builder.addVertex( [ centerX + tangentX * halfWidth, y, centerZ + tangentZ * halfWidth ], [ 0, 1, 0 ], [ 1, v ], [ 1, 1, 1 ], wind ),
		];
	} );
	for ( let row = 0; row < rows.length - 1; row ++ ) {
		const [ a, b ] = rows[ row ]!;
		const [ d, c ] = rows[ row + 1 ]!;
		builder.addTriangle( a!, b!, c! );
		builder.addTriangle( a!, c!, d! );
	}

}

function addTulipPetalTriangle( builder: MeshBuilder, plant: FlowerPlacement, angle: number, scale: number ): void {

	const radialX = Math.cos( angle );
	const radialZ = Math.sin( angle );
	const tangentX = - radialZ;
	const tangentZ = radialX;
	const baseY = plant.height - BLOOM_HEIGHT;
	const cx = plant.x + plant.leanX;
	const cz = plant.z + plant.leanZ;
	const halfWidth = 0.016 * scale;
	const left = builder.addVertex( [ cx - tangentX * halfWidth, baseY, cz - tangentZ * halfWidth ], [ 0, 1, 0 ], [ 0, 0 ], [ 1, 1, 1 ], 0.82 );
	const right = builder.addVertex( [ cx + tangentX * halfWidth, baseY, cz + tangentZ * halfWidth ], [ 0, 1, 0 ], [ 1, 0 ], [ 1, 1, 1 ], 0.82 );
	const tip = builder.addVertex( [ cx + radialX * 0.013 * scale, plant.height, cz + radialZ * 0.013 * scale ], [ 0, 1, 0 ], [ 0.5, 1 ], [ 1, 1, 1 ], 1 );
	builder.addTriangle( left, right, tip );

}

function addTulipStemCard( builder: MeshBuilder, plant: FlowerPlacement, yaw: number, segments: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const height = plant.height - BLOOM_HEIGHT;
	const vertices: number[] = [];
	for ( let row = 0; row <= segments; row ++ ) {
		const progress = 1 - ( 1 - row / segments ) ** 1.6;
		const bend = progress ** 2.4;
		const x = plant.x + plant.leanX * bend;
		const z = plant.z + plant.leanZ * bend;
		const halfWidth = 0.0045;
		vertices.push(
			builder.addVertex( [ x - cosine * halfWidth, height * progress, z + sine * halfWidth ], [ 0, 1, 0 ], [ 0.47, progress ], [ 1, 1, 1 ], progress ),
			builder.addVertex( [ x + cosine * halfWidth, height * progress, z - sine * halfWidth ], [ 0, 1, 0 ], [ 0.53, progress ], [ 1, 1, 1 ], progress ),
		);
	}
	for ( let row = 0; row < segments; row ++ ) {
		const a = vertices[ row * 2 ]!;
		const b = vertices[ row * 2 + 1 ]!;
		builder.addTriangle( a, b, vertices[ row * 2 + 3 ]! );
		builder.addTriangle( a, vertices[ row * 2 + 3 ]!, vertices[ row * 2 + 2 ]! );
	}

}

function addTulipLeaf( builder: MeshBuilder, plant: FlowerPlacement, side: number ): void {

	const angle = plant.yaw + ( side === 0 ? - 0.65 : Math.PI + 0.65 );
	const radialX = Math.cos( angle );
	const radialZ = Math.sin( angle );
	const length = Math.max( 0.22, ( plant.height - 0.06 ) * 0.74 );
	const baseX = plant.x;
	const baseZ = plant.z;
	const base = builder.addVertex( [ baseX, 0.025, baseZ ], [ 0, 1, 0 ], [ side === 0 ? 0.46 : 0.54, 0.12 ], [ 1, 1, 1 ], 0.08 );
	const outer = builder.addVertex( [ baseX + radialX * 0.055, length * 0.69, baseZ + radialZ * 0.055 ], [ 0, 1, 0 ], [ side === 0 ? 0.18 : 0.82, 0.63 ], [ 1, 1, 1 ], 0.69 );
	const tip = builder.addVertex( [ baseX + radialX * 0.035, length, baseZ + radialZ * 0.035 ], [ 0, 1, 0 ], [ side === 0 ? 0.28 : 0.72, 0.79 ], [ 1, 1, 1 ], 0.82 );
	builder.addTriangle( base, outer, tip );

}

function addTulipStemTriangle( builder: MeshBuilder, plant: FlowerPlacement ): void {

	const height = plant.height - 0.06;
	const a = builder.addVertex( [ plant.x - 0.004, 0, plant.z ], [ 0, 1, 0 ], [ 0.47, 0 ], [ 1, 1, 1 ], 0 );
	const b = builder.addVertex( [ plant.x + 0.004, 0, plant.z ], [ 0, 1, 0 ], [ 0.53, 0 ], [ 1, 1, 1 ], 0 );
	const tip = builder.addVertex( [ plant.x + plant.leanX, height, plant.z + plant.leanZ ], [ 0, 1, 0 ], [ 0.5, 1 ], [ 1, 1, 1 ], 1 );
	builder.addTriangle( a, b, tip );

}

export function buildTulipPart( lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	const builder = new MeshBuilder();
	for ( const plant of plants ) {
		if ( part === 'petal' ) {
			for ( let petal = 0; petal < 3; petal ++ ) {
				const angle = plant.yaw + petal / 3 * Math.PI * 2;
				if ( lod === 0 ) addTulipPetal( builder, plant, angle );
				else addTulipPetalTriangle( builder, plant, angle, lod === 1 ? 1 : 0.82 );
			}
		} else if ( lod === 0 ) {
			// 同じ曲線に沿った茎カードを 2 枚交差させる（直線の茎を重ねると 2 本に見える）。
			addTulipStemCard( builder, plant, plant.yaw, 2 );
			addTulipStemCard( builder, plant, plant.yaw + plant.crossAngle, 2 );
			addTulipLeaf( builder, plant, 0 );
			addTulipLeaf( builder, plant, 1 );
		} else {
			addTulipStemTriangle( builder, plant );
			if ( lod === 1 ) addTulipLeaf( builder, plant, 0 );
		}
	}
	return setPartIndex( builder.build(), part );

}

export function createTulipPetalTexture( color: number ): TextureData {

	const alpha = new Uint8Array( SIZE * SIZE );
	const shade = new Float32Array( SIZE * SIZE );
	for ( let y = 0; y < SIZE; y ++ ) {
		const progress = y / ( SIZE - 1 );
		const halfWidth = progress < 0.8 ? 61 * ( 0.62 + 0.38 * Math.sin( Math.min( 1, progress / 0.45 ) * Math.PI * 0.5 ) ) : 61 * Math.sqrt( Math.max( 0, 1 - ( ( progress - 0.8 ) / 0.2 ) ** 2 ) );
		for ( let x = 0; x < SIZE; x ++ ) {
			const distance = Math.abs( x + 0.5 - SIZE * 0.5 );
			if ( distance > halfWidth + 1 ) continue;
			const pixel = y * SIZE + x;
			const edge = Math.max( 0, Math.min( 1, halfWidth - distance ) );
			alpha[ pixel ] = Math.round( Math.min( 1, edge ) * 255 );
			const rim = progress > 0.88 ? ( progress - 0.88 ) * 2.5 : 0;
			const centerLine = Math.exp( - ( ( distance / 2.5 ) ** 2 ) ) * 0.2;
			const edgeShade = distance > halfWidth * 0.78 ? 0.14 : 0;
			shade[ pixel ] = Math.max( 0.3, 0.52 + progress * 0.37 + rim - centerLine - edgeShade );
		}
	}
	return createColorizedFlowerTexture( SIZE, SIZE, color, alpha, shade );

}

export function createTulipStemTexture( color: number ): TextureData {

	const width = 128;
	const height = 256;
	const alpha = new Uint8Array( width * height );
	const shade = new Float32Array( width * height );
	const fixed = new Uint8Array( width * height );
	const fixedShade = new Float32Array( width * height );
	const paint = ( x: number, y: number, value: number ) => {
		if ( x < 0 || x >= width || y < 0 || y >= height ) return;
		const pixel = y * width + x;
		alpha[ pixel ] = 255;
		shade[ pixel ] = Math.max( shade[ pixel ]!, value );
	};
	for ( let y = 0; y < height; y ++ ) {
		for ( let x = 61; x <= 66; x ++ ) paint( x, y, 0.48 + Math.max( 0, 1 - Math.abs( x - 63.5 ) / 3.5 ) * 0.38 + y / height * 0.12 );
	}
	for ( const side of [ - 1, 1 ] ) {
		const originX = 64;
		const originY = 30;
		const length = 133;
		for ( let step = 0; step <= length; step ++ ) {
			const progress = step / length;
			const centerX = originX + side * progress * 39;
			const centerY = originY + progress * 120;
			const halfWidth = 1 + Math.sin( progress * Math.PI ) * 10;
			for ( let across = - halfWidth; across <= halfWidth; across ++ ) {
				paint( Math.round( centerX + across ), Math.round( centerY ), 0.48 + progress * 0.42 - Math.abs( across ) / halfWidth * 0.1 );
			}
		}
	}
	return createColorizedFlowerTexture( width, height, color, alpha, shade, fixed, color, fixedShade );

}

