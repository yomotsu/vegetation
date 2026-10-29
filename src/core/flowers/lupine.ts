import { createRandom } from '../random';
import { createColorizedFlowerTexture } from '../flowersTexture';
import { MeshBuilder } from '../meshBuilder';
import type { MeshData, TextureData } from '../types';
import type { FlowerPlacement } from './common';
import { addQuad, addStemCard, setPartIndex } from './common';

const SIZE = 128;

function addSpikeCard( builder: MeshBuilder, plant: FlowerPlacement, yaw: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const base = plant.height * 0.55;
	const centerX = plant.x + plant.leanX;
	const centerZ = plant.z + plant.leanZ;
	const rows = [
		{ y: base, halfWidth: 0.036, v: 0, wind: 0.68 },
		{ y: plant.height * 0.84, halfWidth: 0.03, v: 0.64, wind: 0.9 },
	];
	const vertices: number[] = [];
	for ( const row of rows ) {
		vertices.push(
			builder.addVertex( [ centerX - cosine * row.halfWidth, row.y, centerZ + sine * row.halfWidth ], [ 0, 1, 0 ], [ 0, row.v ], [ 1, 1, 1 ], row.wind ),
			builder.addVertex( [ centerX + cosine * row.halfWidth, row.y, centerZ - sine * row.halfWidth ], [ 0, 1, 0 ], [ 1, row.v ], [ 1, 1, 1 ], row.wind ),
		);
	}
	const tip = builder.addVertex( [ centerX, plant.height, centerZ ], [ 0, 1, 0 ], [ 0.5, 1 ], [ 1, 1, 1 ], 1 );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 3 ]! );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 3 ]!, vertices[ 2 ]! );
	builder.addTriangle( vertices[ 2 ]!, vertices[ 3 ]!, tip );

}

function addSpikeTriangle( builder: MeshBuilder, plant: FlowerPlacement, yaw: number, scale: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const centerX = plant.x + plant.leanX;
	const centerZ = plant.z + plant.leanZ;
	const bottom = plant.height * 0.55;
	const halfWidth = 0.034 * scale;
	const a = builder.addVertex( [ centerX - cosine * halfWidth, bottom, centerZ + sine * halfWidth ], [ 0, 1, 0 ], [ 0, 0 ], [ 1, 1, 1 ], 0.68 );
	const b = builder.addVertex( [ centerX + cosine * halfWidth, bottom, centerZ - sine * halfWidth ], [ 0, 1, 0 ], [ 1, 0 ], [ 1, 1, 1 ], 0.68 );
	const tip = builder.addVertex( [ centerX, plant.height, centerZ ], [ 0, 1, 0 ], [ 0.5, 1 ], [ 1, 1, 1 ], 1 );
	builder.addTriangle( a, b, tip );

}

function addRosetteCard( builder: MeshBuilder, plant: FlowerPlacement, yaw: number ): void {

	const radialX = Math.cos( yaw );
	const radialZ = Math.sin( yaw );
	const sideX = - radialZ * 0.018;
	const sideZ = radialX * 0.018;
	const centerX = plant.x;
	const centerZ = plant.z;
	const points: [ number, number, number ][] = [
		[ centerX - sideX, 0.018, centerZ - sideZ ],
		[ centerX + radialX * 0.14 - sideX * 0.35, 0.028, centerZ + radialZ * 0.14 - sideZ * 0.35 ],
		[ centerX + radialX * 0.14 + sideX * 0.35, 0.028, centerZ + radialZ * 0.14 + sideZ * 0.35 ],
		[ centerX + sideX, 0.018, centerZ + sideZ ],
	];
	addQuad( builder, points, undefined, 0.12 );

}

export function buildLupinePart( lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	const builder = new MeshBuilder();
	for ( const plant of plants ) {
		if ( part === 'petal' ) {
			if ( lod === 0 ) {
				addSpikeCard( builder, plant, plant.yaw );
				addSpikeCard( builder, plant, plant.yaw + Math.PI * 0.5 );
			} else if ( lod === 1 ) {
				addSpikeTriangle( builder, plant, plant.yaw, 1 );
				addSpikeTriangle( builder, plant, plant.yaw + Math.PI * 0.5, 1 );
			} else {
				addSpikeTriangle( builder, plant, plant.yaw, 0.8 );
			}
		} else if ( lod === 0 ) {
			addStemCard( builder, plant, 0.15, plant.yaw, 2, 0, plant.height * 0.55 );
			// 2 枚とも同じ段数で同じ曲線に沿わせる（段数が違うと茎が 2 本に見える）。
			addStemCard( builder, plant, 0.15, plant.yaw + Math.PI * 0.5, 2, 0, plant.height * 0.55 );
			addRosetteCard( builder, plant, plant.yaw );
			addRosetteCard( builder, plant, plant.yaw + Math.PI * 0.5 );
		} else {
			addStemCard( builder, plant, 0.15, plant.yaw, 1, 0, plant.height * 0.55 );
			if ( lod === 1 ) addRosetteCard( builder, plant, plant.yaw );
		}
	}
	return setPartIndex( builder.build(), part );

}

function drawEllipse( alpha: Uint8Array, shade: Float32Array, fixed: Uint8Array, fixedShade: Float32Array, cx: number, cy: number, rx: number, ry: number, base: number, centerColor = false ): void {

	for ( let y = Math.max( 0, Math.floor( cy - ry - 1 ) ); y <= Math.min( SIZE - 1, Math.ceil( cy + ry + 1 ) ); y ++ ) {
		for ( let x = Math.max( 0, Math.floor( cx - rx - 1 ) ); x <= Math.min( SIZE - 1, Math.ceil( cx + rx + 1 ) ); x ++ ) {
			const distance = Math.hypot( ( x + 0.5 - cx ) / rx, ( y + 0.5 - cy ) / ry );
			if ( distance > 1 ) continue;
			const pixel = y * SIZE + x;
			alpha[ pixel ] = 255;
			const highlight = Math.max( 0, Math.min( 1, ( cy - ( y + 0.5 ) ) / ry ) );
			shade[ pixel ] = Math.max( shade[ pixel ]!, base + highlight * 0.24 - distance * 0.08 );
			if ( centerColor && Math.hypot( ( x + 0.5 - cx ) / rx, ( y + 0.5 - cy ) / ry ) < 0.2 ) {
				fixed[ pixel ] = 1;
				fixedShade[ pixel ] = 0.9;
			}
		}
	}

}

export function createLupinePetalTexture( seed: number, color: number, centerColor: number ): TextureData {

	const alpha = new Uint8Array( SIZE * SIZE );
	const shade = new Float32Array( SIZE * SIZE );
	const fixed = new Uint8Array( SIZE * SIZE );
	const fixedShade = new Float32Array( SIZE * SIZE );
	const random = createRandom( seed + 841 );
	// 穂はカード幅いっぱいの円錐。小花を段ごとに詰め、段を半分ずつずらす。
	const rows = 15;
	for ( let row = 0; row < rows; row ++ ) {
		const progress = row / ( rows - 1 );
		const spread = 104 * ( 1 - progress ) ** 0.85;
		const count = Math.max( 1, Math.round( spread / 11 ) + 1 );
		const y = 8 + row * 7.6;
		for ( let floret = 0; floret < count; floret ++ ) {
			const offset = count === 1 ? 0 : ( ( floret + ( row % 2 ) * 0.5 ) / count - 0.5 ) * spread;
			const x = 64 + offset + random.range( - 1.5, 1.5 );
			const size = 1 - progress * 0.45;
			drawEllipse( alpha, shade, fixed, fixedShade, x, y + random.range( - 1, 1 ), 7.5 * size, 5.2 * size, ( 0.48 + progress * 0.4 ) * random.range( 0.92, 1.05 ), true );
		}
	}
	return createColorizedFlowerTexture( SIZE, SIZE, color, alpha, shade, fixed, centerColor, fixedShade );

}

export function createLupineStemTexture( color: number ): TextureData {

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
		for ( let x = 60; x <= 67; x ++ ) paint( x, y, 0.48 + Math.max( 0, 1 - Math.abs( x - 63.5 ) / 4 ) * 0.36 + y / height * 0.12 );
	}
	// 根元の掌状葉を細い小葉で描く。
	for ( let leaflet = 0; leaflet < 7; leaflet ++ ) {
		const angle = leaflet / 6 * Math.PI * 0.9 - Math.PI * 0.45;
		const length = 26 + ( leaflet % 3 ) * 2;
		for ( let step = 0; step < length; step ++ ) {
			const progress = step / length;
			const x = Math.round( 64 + Math.sin( angle ) * progress * length );
			const y = Math.round( 30 + Math.cos( angle ) * progress * length * 0.45 );
			paint( x, y, 0.52 + progress * 0.4 );
			paint( x - 1, y, 0.47 + progress * 0.4 );
			paint( x + 1, y, 0.47 + progress * 0.4 );
		}
	}
	return createColorizedFlowerTexture( width, height, color, alpha, shade, fixed, color, fixedShade );

}

