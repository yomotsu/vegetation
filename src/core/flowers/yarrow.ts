import { createRandom } from '../random';
import { createColorizedFlowerTexture } from '../flowersTexture';
import { MeshBuilder } from '../meshBuilder';
import type { MeshData, TextureData } from '../types';
import type { FlowerPlacement } from './common';
import { addStemCard, setPartIndex } from './common';

const SIZE = 128;
const YARROW_DOME = 0.025;

function addYarrowHead( builder: MeshBuilder, plant: FlowerPlacement ): void {

	const half = 0.05;
	// 中央を持ち上げたドーム形（四隅より約 2.5 cm 高い）。平たい皿に見えないようにする。
	const centerY = plant.height + YARROW_DOME;
	const cosine = Math.cos( plant.yaw );
	const sine = Math.sin( plant.yaw );
	const center = builder.addVertex( [ plant.x + plant.leanX, centerY, plant.z + plant.leanZ ], [ 0, 1, 0 ], [ 0.5, 0.5 ], [ 1, 1, 1 ], 1 );
	const corners: number[] = [];
	const uvs: [ number, number ][] = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ];
	for ( let corner = 0; corner < 4; corner ++ ) {
		const x = ( corner === 0 || corner === 3 ? - half : half ) * cosine - ( corner < 2 ? - half : half ) * sine;
		const z = ( corner === 0 || corner === 3 ? - half : half ) * sine + ( corner < 2 ? - half : half ) * cosine;
		const tilt = ( x * Math.cos( plant.headTiltYaw ) + z * Math.sin( plant.headTiltYaw ) ) * Math.tan( plant.headTilt );
		corners.push( builder.addVertex( [ plant.x + plant.leanX + x, plant.height + tilt, plant.z + plant.leanZ + z ], [ 0, 1, 0 ], uvs[ corner ]!, [ 1, 1, 1 ], 1 ) );
	}
	for ( let corner = 0; corner < 4; corner ++ ) builder.addTriangle( center, corners[ corner ]!, corners[ ( corner + 1 ) % 4 ]! );

}

export function buildYarrowPart( lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	const builder = new MeshBuilder();
	for ( const plant of plants ) {
		if ( part === 'petal' ) addYarrowHead( builder, plant );
		else if ( lod === 0 ) {
			addStemCard( builder, plant, 0.14, plant.yaw, 3 );
			addStemCard( builder, plant, 0.14, plant.yaw + Math.PI * 0.5, 3 );
		} else if ( lod === 1 ) {
			addStemCard( builder, plant, 0.14, plant.yaw, 1 );
			addStemCard( builder, plant, 0.14, plant.yaw + Math.PI * 0.5, 1 );
		} else {
			addStemCard( builder, plant, 0.14, plant.yaw, 1 );
		}
	}
	return setPartIndex( builder.build(), part );

}

function paintFloret( alpha: Uint8Array, shade: Float32Array, cx: number, cy: number, angle: number, length: number, width: number, value: number ): void {

	const lowX = Math.max( 0, Math.floor( cx - length - width - 1 ) );
	const highX = Math.min( SIZE - 1, Math.ceil( cx + length + width + 1 ) );
	const lowY = Math.max( 0, Math.floor( cy - length - width - 1 ) );
	const highY = Math.min( SIZE - 1, Math.ceil( cy + length + width + 1 ) );
	const cosine = Math.cos( angle );
	const sine = Math.sin( angle );
	for ( let y = lowY; y <= highY; y ++ ) {
		for ( let x = lowX; x <= highX; x ++ ) {
			const dx = x + 0.5 - cx;
			const dy = y + 0.5 - cy;
			const along = dx * cosine + dy * sine;
			const across = - dx * sine + dy * cosine;
			const distance = ( along / length ) ** 2 + ( across / width ) ** 2;
			if ( distance > 1 ) continue;
			const pixel = y * SIZE + x;
			alpha[ pixel ] = 255;
			shade[ pixel ] = Math.max( shade[ pixel ]!, value + ( 1 - distance ) * 0.16 );
		}
	}

}

export function createYarrowPetalTexture( seed: number, color: number, centerColor: number ): TextureData {

	const alpha = new Uint8Array( SIZE * SIZE );
	const shade = new Float32Array( SIZE * SIZE );
	const fixed = new Uint8Array( SIZE * SIZE );
	const fixedShade = new Float32Array( SIZE * SIZE );
	const random = createRandom( seed + 916 );
	const centers: [ number, number, number ][] = [ [ 0, 0, 0 ] ];
	for ( let ring = 1; ring <= 3; ring ++ ) {
		const count = ring === 1 ? 8 : ring === 2 ? 12 : 14;
		const radius = ring * 16;
		for ( let index = 0; index < count; index ++ ) {
			const angle = index / count * Math.PI * 2 + ring * 0.22 + random.range( - 0.08, 0.08 );
			const distance = radius + random.range( - 2, 2 );
			centers.push( [ 64 + Math.cos( angle ) * distance, 64 + Math.sin( angle ) * distance, ring ] );
		}
	}
	for ( let y = 0; y < SIZE; y ++ ) {
		for ( let x = 0; x < SIZE; x ++ ) {
			const distance = Math.hypot( x + 0.5 - 64, y + 0.5 - 64 );
			const angle = Math.atan2( y + 0.5 - 64, x + 0.5 - 64 );
			const radius = 56 + Math.sin( angle * 5 + 0.7 ) * 1.1 + Math.sin( angle * 9 + 1.4 ) * 0.45;
			if ( distance > radius ) continue;
			const pixel = y * SIZE + x;
			alpha[ pixel ] = 255;
			shade[ pixel ] = 0.46 + Math.min( 0.17, distance / 57 * 0.17 );
		}
	}
	for ( const [ cx, cy, ring ] of centers ) {
		const depth = ring / 3;
		const base = 0.76 - depth * 0.1 + random.range( - 0.08, 0.06 );
		for ( let petal = 0; petal < 5; petal ++ ) {
			const angle = petal / 5 * Math.PI * 2 + random.range( - 0.05, 0.05 );
			paintFloret( alpha, shade, cx + Math.cos( angle ) * 3.3, cy + Math.sin( angle ) * 3.3, angle, 4.2, 1.85, base );
		}
		for ( let y = Math.floor( cy - 1.5 ); y <= Math.ceil( cy + 1.5 ); y ++ ) {
			for ( let x = Math.floor( cx - 1.5 ); x <= Math.ceil( cx + 1.5 ); x ++ ) {
				if ( x < 0 || x >= SIZE || y < 0 || y >= SIZE || Math.hypot( x + 0.5 - cx, y + 0.5 - cy ) > 1.6 ) continue;
				const pixel = y * SIZE + x;
				alpha[ pixel ] = 255;
				fixed[ pixel ] = 1;
				fixedShade[ pixel ] = 1.05;
			}
		}
	}
	for ( let y = 0; y < SIZE; y ++ ) {
		for ( let x = 0; x < SIZE; x ++ ) {
			const dx = x + 0.5 - 64;
			const dy = y + 0.5 - 64;
			const angle = Math.atan2( dy, dx );
			const radius = 56 + Math.sin( angle * 5 + 0.7 ) * 1.1 + Math.sin( angle * 9 + 1.4 ) * 0.45;
			if ( Math.hypot( dx, dy ) <= radius ) continue;
			const pixel = y * SIZE + x;
			alpha[ pixel ] = 0;
			fixed[ pixel ] = 0;
		}
	}
	return createColorizedFlowerTexture( SIZE, SIZE, color, alpha, shade, fixed, centerColor, fixedShade );

}

export function createYarrowStemTexture( color: number ): TextureData {

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
		for ( let x = 60; x <= 67; x ++ ) paint( x, y, 0.5 + Math.max( 0, 1 - Math.abs( x - 63.5 ) / 4 ) * 0.35 + y / height * 0.12 );
	}
	for ( let leaf = 0; leaf < 3; leaf ++ ) {
		const startY = 38 + leaf * 26;
		const direction = leaf % 2 === 0 ? - 1 : 1;
		const length = 42 + leaf * 4;
		for ( let step = 0; step <= length; step ++ ) {
			const progress = step / length;
			const x = 64 + direction * progress * length * 0.9;
			const y = startY + progress * length * 0.34;
			paint( Math.round( x ), Math.round( y ), 0.45 + progress * 0.42 );
			for ( const side of [ - 1, 1 ] ) {
				for ( let leaflet = 1; leaflet <= 3; leaflet ++ ) {
					const lx = Math.round( x + direction * leaflet * 2.2 );
					const ly = Math.round( y + side * leaflet * 2.4 );
					paint( lx, ly, 0.42 + progress * 0.42 );
					paint( lx + direction, ly, 0.4 + progress * 0.4 );
				}
			}
		}
	}
	return createColorizedFlowerTexture( width, height, color, alpha, shade, fixed, color, fixedShade );

}

