import { buildBillboard, buildSixPlaneImpostor, getImpostorProjectionWindow, impostorLod3Part, impostorPart, LOD4_IMPOSTOR_VIEWS, yawImpostorView } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { weldIdenticalVertices } from '../rockGeometry';
import { registerTextureRegenerator, regenerateTexture } from '../textureRegenerator';
import { ALLIUM_HEAD_RISE, ALLIUM_HEAD_SIZE, ALLIUM_PLANT_CARD_TEXTURE_WIDTH, composeFlowersColor, createFlowersAlliumPlantCardTexture, createFlowersPetalTexture, createFlowersStemTexture, FLOWERS_PETAL_TEXTURE_SIZE, FLOWERS_STEM_TEXTURE_HEIGHT } from '../flowersTexture';
import { createRandom } from '../random';
import type { MeshData, PartDef, TextureData, TextureGeneratorDef, VegetationData } from '../types';
import { buildTulipPart, createTulipPetalTexture, createTulipPlantCardTexture, createTulipStemTexture, TULIP_BLOOM_HEIGHT, TULIP_PLANT_CARD_WIDTH } from '../flowers/tulip';
import { buildPoppyPart, createPoppyPetalTexture, createPoppyStemTexture } from '../flowers/poppy';
import { buildBluebellPart, createBluebellPetalTexture, createBluebellStemTexture } from '../flowers/bluebell';
import { buildCallaPart, buildCallaPlantCardPart, CALLA_PLANT_CARD_TEXTURE_WIDTH, createCallaPetalTexture, createCallaPlantCardTexture, createCallaStemTexture } from '../flowers/calla';
import { buildPrimroseDomePart, buildPrimrosePart, createPrimrosePetalTexture, createPrimroseStemTexture } from '../flowers/primrose';
import type { FlowerPlacement } from '../flowers/common';

export const DEFAULT_FLOWERS_STEM_COLOR = 0x2f6f1e;
export const DEFAULT_ALLIUM_PETAL_COLOR = 0xf1efe8;
export const DEFAULT_ALLIUM_CENTER_COLOR = 0x8a9670;
export const DEFAULT_DAISY_PETAL_COLOR = 0xd2600c;
export const DEFAULT_DAISY_CENTER_COLOR = 0x8a7414;
export const DEFAULT_FLOWERS_COUNT = 6;
export const DEFAULT_TULIP_PETAL_COLOR = 0xd8322a;
export const DEFAULT_TULIP_CENTER_COLOR = 0x000000;
export const DEFAULT_TULIP_COUNT = 4;
export const DEFAULT_POPPY_PETAL_COLOR = 0xd8281e;
export const DEFAULT_POPPY_CENTER_COLOR = 0x1e1a18;
export const DEFAULT_POPPY_COUNT = 3;
export const DEFAULT_POPPY_HEIGHT = 0.42;
export const DEFAULT_POPPY_SPREAD = 0.28;
export const DEFAULT_BLUEBELL_PETAL_COLOR = 0x7a5ad8;
// 花柄（釣り鐘と茎をつなぐ柄）の色。centerColor として焼き込む。
export const DEFAULT_BLUEBELL_CENTER_COLOR = 0x2f6f1e;
export const DEFAULT_BLUEBELL_COUNT = 3;
export const DEFAULT_BLUEBELL_HEIGHT = 0.36;
export const DEFAULT_BLUEBELL_SPREAD = 0.28;
export const DEFAULT_CALLA_PETAL_COLOR = 0xf4f1e8;
export const DEFAULT_CALLA_CENTER_COLOR = 0xf0c030;
export const DEFAULT_CALLA_COUNT = 3;
export const DEFAULT_CALLA_HEIGHT = 0.42;
export const DEFAULT_CALLA_SPREAD = 0.3;
export const DEFAULT_PRIMROSE_PETAL_COLOR = 0xf2d24a;
export const DEFAULT_PRIMROSE_CENTER_COLOR = 0xc0a020;
export const DEFAULT_PRIMROSE_COUNT = 4;
export const DEFAULT_PRIMROSE_HEIGHT = 0.12;
export const DEFAULT_PRIMROSE_SPREAD = 0.26;

export type FlowersVariety = 'allium' | 'daisy' | 'tulip' | 'poppy' | 'bluebell' | 'calla' | 'primrose';

export interface FlowersOptions {
	seed?: number;
	variety?: FlowersVariety;
	count?: number;
	spread?: number;
	height?: number;
	petalColor?: number;
	centerColor?: number;
	stemColor?: number;
}

function positive( value: number, name: string ): number {

	if ( ! Number.isFinite( value ) || value <= 0 ) throw new RangeError( `Flowers ${ name } must be a positive finite number` );
	return value;

}

function validateColor( value: number, name: string ): void {

	if ( ! Number.isInteger( value ) || value < 0 || value > 0xffffff ) throw new RangeError( `Flowers ${ name } must be a 24-bit integer` );

}

function createTrialPlacements( seed: number, count: number, spread: number, height: number, variety: FlowersVariety ): FlowerPlacement[] {

	const random = createRandom( seed + 149 );
	const flowerRadius = variety === 'calla' ? 0.12 : variety === 'primrose' ? 0.105 : variety === 'poppy' ? 0.065 : 0.05;
	const availableRadius = Math.max( 0, spread - flowerRadius );
	const minimumSpacing = Math.min( 0.12, availableRadius * 0.6 );
	const positions: [ number, number ][] = [];
	for ( let plant = 0; plant < count; plant ++ ) {
		let candidate: [ number, number ] = [ 0, 0 ];
		for ( let attempt = 0; attempt < 120; attempt ++ ) {
			const radius = availableRadius * Math.sqrt( random.next() );
			const angle = random.next() * Math.PI * 2;
			candidate = [ Math.cos( angle ) * radius, Math.sin( angle ) * radius ];
			if ( positions.every( ( position ) => Math.hypot( position[ 0 ] - candidate[ 0 ], position[ 1 ] - candidate[ 1 ] ) >= minimumSpacing ) ) break;
		}
		positions.push( candidate );
	}

	return positions.map( ( position, index ) => {
		const yaw = random.next() * Math.PI * 2;
		const crossAngle = 1.32 + random.next() * 0.5;
		const plantHeight = height * ( 0.97 + random.next() * 0.06 );
		const leanAngle = random.next() * Math.PI * 2;
		const leanFactor = variety === 'bluebell' ? random.range( 0.3, 0.42 ) : variety === 'poppy' ? random.range( 0.04, 0.11 ) : variety === 'calla' ? random.range( 0.01, 0.04 ) : variety === 'primrose' ? random.range( 0.08, 0.18 ) : random.range( 0.04, 0.12 );
		const lean = plantHeight * leanFactor;
		const headTilt = variety === 'poppy' ? random.range( 20, 30 ) * Math.PI / 180 : 0;
		const bud = variety === 'poppy' && ( count === 1 ? index === 0 : index === 1 || ( count >= 5 && index === 4 ) );
		return {
			x: position[ 0 ],
			z: position[ 1 ],
			yaw,
			crossAngle,
			height: plantHeight,
			leanX: Math.cos( leanAngle ) * lean,
			leanZ: Math.sin( leanAngle ) * lean,
			headTilt,
			headTiltYaw: variety === 'poppy' ? Math.PI * 1.5 : random.next() * Math.PI * 2,
			variant: Math.floor( random.next() * 2 ),
			bud,
		};
	} );

}

function createPlacements( seed: number, count: number, spread: number, height: number, variety: FlowersVariety ): FlowerPlacement[] {

	if ( variety === 'poppy' || variety === 'bluebell' || variety === 'calla' || variety === 'primrose' ) {
		return createTrialPlacements( seed, count, spread, height, variety );
	}

	const random = createRandom( seed + 149 );
	const flowerRadius = variety === 'allium' ? 0.12 : variety === 'daisy' ? 0.135 : 0.025;
	const availableRadius = Math.max( 0, spread - flowerRadius );
	const minimumSpacing = Math.min( 0.12, availableRadius * 0.6 );
	const positions: [ number, number ][] = [];

	for ( let plant = 0; plant < count; plant ++ ) {
		let candidate: [ number, number ] = [ 0, 0 ];
		let accepted = false;
		for ( let attempt = 0; attempt < 120; attempt ++ ) {
			const radius = availableRadius * Math.sqrt( random.next() );
			const angle = random.next() * Math.PI * 2;
			candidate = [ Math.cos( angle ) * radius, Math.sin( angle ) * radius ];
			if ( positions.every( ( position ) => Math.hypot( position[ 0 ] - candidate[ 0 ], position[ 1 ] - candidate[ 1 ] ) >= minimumSpacing ) ) {
				accepted = true;
				break;
			}
		}
		if ( ! accepted && positions.length > 0 ) {
			for ( let attempt = 0; attempt < 120; attempt ++ ) {
				const radius = availableRadius * Math.sqrt( random.next() );
				const angle = random.next() * Math.PI * 2;
				candidate = [ Math.cos( angle ) * radius, Math.sin( angle ) * radius ];
				if ( positions.every( ( position ) => Math.hypot( position[ 0 ] - candidate[ 0 ], position[ 1 ] - candidate[ 1 ] ) >= minimumSpacing * 0.65 ) ) break;
			}
		}
		positions.push( candidate );
	}

	return positions.map( ( position ) => {
		const yaw = random.next() * Math.PI * 2;
		const crossAngle = 1.32 + random.next() * 0.5;
		const plantHeight = height * ( 0.91 + random.next() * 0.18 );
		const leanAngle = random.next() * Math.PI * 2;
		// 参考 glTF の茎は、上端が高さの 8〜27%（daisy は 11〜35%）横へずれる。
		// チューリップの茎はほぼまっすぐ。
		const lean = ( variety === 'daisy' ? random.range( 0.11, 0.35 ) : variety === 'tulip' ? random.range( 0.03, 0.1 ) : random.range( 0.08, 0.27 ) ) * plantHeight;
		const headTilt = variety === 'daisy' ? random.range( 15, 35 ) * Math.PI / 180 : 0;
		const headTiltYaw = random.next() * Math.PI * 2;

		return {
			x: position[ 0 ],
			z: position[ 1 ],
			yaw,
			crossAngle,
			height: plantHeight,
			leanX: Math.cos( leanAngle ) * lean,
			leanZ: Math.sin( leanAngle ) * lean,
			headTilt,
			headTiltYaw,
			variant: Math.floor( random.next() * 2 ),
		};
	} );

}

const STEM_BEND_EXPONENT = 2.4;
const STEM_ROW_BIAS = 1.6;

function addVerticalCard(
	builder: MeshBuilder,
	placement: FlowerPlacement,
	width: number,
	bottom: number,
	top: number,
	yaw: number,
	segments: number,
	u0: number,
	u1: number,
	windAtBase = true,
): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const halfWidth = width * 0.5;
	const vertices: number[] = [];
	for ( let row = 0; row <= segments; row ++ ) {
		// 曲がりは上に集まるので、段も上に寄せる。
		const progress = 1 - ( 1 - row / segments ) ** STEM_ROW_BIAS;
		const y = bottom + ( top - bottom ) * progress;
		// 根元はほぼまっすぐで、上ほど強く曲がる（参考の茎の実測）。
		const bend = progress ** STEM_BEND_EXPONENT;
		const centerX = placement.x + placement.leanX * bend;
		const centerZ = placement.z + placement.leanZ * bend;
		const shiftX = cosine * halfWidth;
		const shiftZ = - sine * halfWidth;
		const wind = windAtBase ? progress : 1;
		vertices.push(
			builder.addVertex( [ centerX - shiftX, y, centerZ - shiftZ ], [ 0, 1, 0 ], [ u0, progress ], [ 1, 1, 1 ], wind ),
			builder.addVertex( [ centerX + shiftX, y, centerZ + shiftZ ], [ 0, 1, 0 ], [ u1, progress ], [ 1, 1, 1 ], wind ),
		);
	}

	for ( let row = 0; row < segments; row ++ ) {
		const a = vertices[ row * 2 ]!;
		const b = vertices[ row * 2 + 1 ]!;
		const c = vertices[ row * 2 + 3 ]!;
		const d = vertices[ row * 2 + 2 ]!;
		builder.addTriangle( a, b, c );
		builder.addTriangle( a, c, d );
	}

}

function addFlowerQuad( builder: MeshBuilder, placement: FlowerPlacement, width: number, height: number, yaw: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );
	const centerX = placement.x + placement.leanX;
	const centerY = placement.height + ALLIUM_HEAD_RISE;
	const centerZ = placement.z + placement.leanZ;
	const halfWidth = width * 0.5;
	const halfHeight = height * 0.5;
	const shiftX = cosine * halfWidth;
	const shiftZ = - sine * halfWidth;
	const vertices = [
		builder.addVertex( [ centerX - shiftX, centerY - halfHeight, centerZ - shiftZ ], [ 0, 1, 0 ], [ 0, 0 ], [ 1, 1, 1 ], 1 ),
		builder.addVertex( [ centerX + shiftX, centerY - halfHeight, centerZ + shiftZ ], [ 0, 1, 0 ], [ 1, 0 ], [ 1, 1, 1 ], 1 ),
		builder.addVertex( [ centerX + shiftX, centerY + halfHeight, centerZ + shiftZ ], [ 0, 1, 0 ], [ 1, 1 ], [ 1, 1, 1 ], 1 ),
		builder.addVertex( [ centerX - shiftX, centerY + halfHeight, centerZ - shiftZ ], [ 0, 1, 0 ], [ 0, 1 ], [ 1, 1, 1 ], 1 ),
	];

	builder.addTriangle( vertices[ 0 ]!, vertices[ 1 ]!, vertices[ 2 ]! );
	builder.addTriangle( vertices[ 0 ]!, vertices[ 2 ]!, vertices[ 3 ]! );

}

// 花の頭の深さ（直径に対する比）。参考 Flowers02 は直径 0.19 m で四隅が中心より 2〜3 cm 高い。
const DAISY_CUP_DEPTH = 0.2;
// 花の頭のカードの一辺。参考 Flowers02 は 0.157 m で、花の直径は約 0.14 m。
const DAISY_HEAD_SIZE = 0.16;
function addDaisyHead( builder: MeshBuilder, placement: FlowerPlacement, size: number ): void {

	const centerY = placement.height;
	const outerRadius = size / Math.SQRT2;
	const center = builder.addVertex( [ placement.x + placement.leanX, centerY, placement.z + placement.leanZ ], [ 0, 1, 0 ], [ 0.5, 0.5 ], [ 1, 1, 1 ], 1 );
	const corners: number[] = [];
	const uvs: [ number, number ][] = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ];

	for ( let corner = 0; corner < 4; corner ++ ) {
		const angle = Math.PI * 0.25 + corner * Math.PI * 0.5 + placement.yaw * 0.025;
		const x = Math.cos( angle ) * outerRadius;
		const z = Math.sin( angle ) * outerRadius;
		const tilt = ( x * Math.cos( placement.headTiltYaw ) + z * Math.sin( placement.headTiltYaw ) ) * Math.tan( placement.headTilt );
		// 参考と同じく四隅を持ち上げ、花びらが中心から弧を描くお椀形にする。
		const cup = size * DAISY_CUP_DEPTH;
		corners.push( builder.addVertex( [ placement.x + placement.leanX + x, centerY + tilt + cup, placement.z + placement.leanZ + z ], [ 0, 1, 0 ], uvs[ corner ]!, [ 1, 1, 1 ], 1 ) );
	}
	for ( let corner = 0; corner < 4; corner ++ ) builder.addTriangle( center, corners[ corner ]!, corners[ ( corner + 1 ) % 4 ]! );

}

function buildFlowersPart( variety: FlowersVariety, lod: number, plants: FlowerPlacement[], part: 'petal' | 'stem' ): MeshData {

	if ( variety === 'tulip' ) return buildTulipPart( lod, plants, part );
	if ( variety === 'poppy' ) return buildPoppyPart( lod, plants, part );
	if ( variety === 'bluebell' ) return buildBluebellPart( lod, plants, part );
	if ( variety === 'calla' ) return buildCallaPart( lod, plants, part );
	if ( variety === 'primrose' ) return buildPrimrosePart( lod, plants, part );

	const builder = new MeshBuilder();

	if ( part === 'petal' ) {
		for ( const placement of plants ) {
			if ( variety === 'daisy' ) {
				addDaisyHead( builder, placement, DAISY_HEAD_SIZE );
			}
			else if ( lod === 0 ) {
				addFlowerQuad( builder, placement, ALLIUM_HEAD_SIZE, ALLIUM_HEAD_SIZE, placement.yaw );
				addFlowerQuad( builder, placement, ALLIUM_HEAD_SIZE, ALLIUM_HEAD_SIZE, placement.yaw + placement.crossAngle );
			}
			else if ( lod === 1 ) {
				addFlowerQuad( builder, placement, ALLIUM_HEAD_SIZE, ALLIUM_HEAD_SIZE, placement.yaw + placement.crossAngle );
			}
			else {
				const width = 0.20;
				const y = placement.height - placement.height * 0.12;
				const halfWidth = width * 0.5;
				const angle = placement.yaw + placement.crossAngle;
				const cosine = Math.cos( angle );
				const sine = Math.sin( angle );
				const left = builder.addVertex( [ placement.x - cosine * halfWidth, y, placement.z + sine * halfWidth ], [ 0, 1, 0 ], [ 0, 0 ], [ 1, 1, 1 ], 1 );
				const right = builder.addVertex( [ placement.x + cosine * halfWidth, y, placement.z - sine * halfWidth ], [ 0, 1, 0 ], [ 1, 0 ], [ 1, 1, 1 ], 1 );
				const top = builder.addVertex( [ placement.x + placement.leanX, placement.height, placement.z + placement.leanZ ], [ 0, 1, 0 ], [ 0.5, 1 ], [ 1, 1, 1 ], 1 );
				builder.addTriangle( left, right, top );
			}
		}
	}
	else {
		for ( let index = 0; index < plants.length; index ++ ) {
			const placement = plants[ index ]!;
			const u0 = placement.variant * 0.5;
			const u1 = u0 + 0.5;
			// 茎は参考と同じく約 9 mm。daisy のカードは左右の葉（約 6 cm）が収まる幅にする。
			const stemWidth = variety === 'daisy' ? 0.15 : 0.03;
			if ( variety === 'daisy' && lod === 0 ) {
				addVerticalCard( builder, placement, stemWidth, 0, placement.height, placement.yaw, 4, u0, u1 );
				addVerticalCard( builder, placement, stemWidth, 0, placement.height, placement.yaw + placement.crossAngle, 4, ( 1 - placement.variant ) * 0.5, ( 1 - placement.variant ) * 0.5 + 0.5 );
			}
			else if ( variety === 'allium' && lod === 0 ) {
				addVerticalCard( builder, placement, stemWidth, 0, placement.height, placement.yaw, 3, u0, u1 );
				addVerticalCard( builder, placement, stemWidth, 0, placement.height, placement.yaw + placement.crossAngle, 3, ( 1 - placement.variant ) * 0.5, ( 1 - placement.variant ) * 0.5 + 0.5 );
			}
			else if ( variety === 'daisy' && lod === 1 ) {
				addVerticalCard( builder, placement, stemWidth, 0, placement.height, placement.yaw, 1, u0, u1 );
				addVerticalCard( builder, placement, stemWidth, 0, placement.height, placement.yaw + placement.crossAngle, 1, ( 1 - placement.variant ) * 0.5, ( 1 - placement.variant ) * 0.5 + 0.5 );
			}
			else if ( variety === 'allium' && lod === 1 ) {
				addVerticalCard( builder, placement, stemWidth, 0, placement.height, placement.yaw, 1, u0, u1 );
			}
			else {
				addVerticalCard( builder, placement, stemWidth, 0, placement.height, placement.yaw, 1, u0, u1 );
			}
		}
	}

	const mesh = builder.build();
	mesh.groups = mesh.groups.map( ( group ) => ( { ...group, partIndex: part === 'petal' ? 0 : 1 } ) );
	return mesh;

}

interface BentPlantCardOptions {
	width: number;
	maxCardHeight: number;
	top: ( placement: FlowerPlacement ) => number;
	stemHeight: ( placement: FlowerPlacement ) => number;
	headBottom: ( placement: FlowerPlacement, top: number ) => number;
	headAnchor: ( placement: FlowerPlacement, top: number, headBottom: number ) => number;
	splitSingleSegment?: boolean;
}

function buildBentPlantCardPart( plants: FlowerPlacement[], partIndex: number, segments: number, options: BentPlantCardOptions ): MeshData {

	const builder = new MeshBuilder();
	const uvSpanPerMeter = 1 / options.maxCardHeight;
	const halfWidth = options.width * 0.5;

	builder.beginGroup( partIndex );
	for ( const placement of plants ) {
		const top = options.top( placement );
		const stemHeight = options.stemHeight( placement );
		const headBottom = options.headBottom( placement, top );
		const headAnchor = options.headAnchor( placement, top, headBottom );
		const tipX = placement.x + placement.leanX;
		const tipZ = placement.z + placement.leanZ;
		for ( const yaw of [ placement.yaw, placement.yaw + placement.crossAngle ] ) {
			const shiftX = Math.cos( yaw ) * halfWidth;
			const shiftZ = - Math.sin( yaw ) * halfWidth;
			const rows: { y: number; centerX: number; centerZ: number; wind: number }[] = [];

			for ( let row = 0; row <= segments; row ++ ) {
				let y: number;
				let centerX: number;
				let centerZ: number;

				if ( row === segments ) {
					y = top;
					const previous = rows[ rows.length - 1 ]!;
					const headProgress = ( headAnchor - previous.y ) / ( top - previous.y );
					centerX = previous.centerX + ( tipX - previous.centerX ) / headProgress;
					centerZ = previous.centerZ + ( tipZ - previous.centerZ ) / headProgress;
				}
				else if ( row === segments - 1 && row > 0 ) {
					y = headBottom;
					const progress = Math.max( 0, Math.min( 1, y / stemHeight ) );
					const bend = progress ** STEM_BEND_EXPONENT;
					centerX = placement.x + placement.leanX * bend;
					centerZ = placement.z + placement.leanZ * bend;
				}
				else {
					const progress = row === 0 ? 0 : 1 - ( 1 - row / segments ) ** STEM_ROW_BIAS;
					y = stemHeight * progress;
					const bend = progress ** STEM_BEND_EXPONENT;
					centerX = placement.x + placement.leanX * bend;
					centerZ = placement.z + placement.leanZ * bend;
				}

				rows.push( { y, centerX, centerZ, wind: Math.max( 0, Math.min( 1, y / placement.height ) ) } );
			}

			const vertexRows = rows.map( ( row ) => {
				const v = 1 - ( top - row.y ) * uvSpanPerMeter;
				return [
					builder.addVertex( [ row.centerX - shiftX, row.y, row.centerZ - shiftZ ], [ 0, 1, 0 ], [ 0, v ], [ 1, 1, 1 ], row.wind ),
					builder.addVertex( [ row.centerX + shiftX, row.y, row.centerZ + shiftZ ], [ 0, 1, 0 ], [ 1, v ], [ 1, 1, 1 ], row.wind ),
				];
			} );

			for ( let row = 0; row < segments; row ++ ) {
				const a = vertexRows[ row ]![ 0 ]!;
				const b = vertexRows[ row ]![ 1 ]!;
				const c = vertexRows[ row + 1 ]![ 1 ]!;
				const d = vertexRows[ row + 1 ]![ 0 ]!;
				if ( options.splitSingleSegment === true && segments === 1 ) {
					const lower = rows[ row ]!;
					const upper = rows[ row + 1 ]!;
					const lowerV = 1 - ( top - lower.y ) * uvSpanPerMeter;
					const upperV = 1 - ( top - upper.y ) * uvSpanPerMeter;
					const midpoint = builder.addVertex(
						[ ( lower.centerX + upper.centerX ) * 0.5 + shiftX, ( lower.y + upper.y ) * 0.5, ( lower.centerZ + upper.centerZ ) * 0.5 + shiftZ ],
						[ 0, 1, 0 ],
						[ 1, ( lowerV + upperV ) * 0.5 ],
						[ 1, 1, 1 ],
						( lower.wind + upper.wind ) * 0.5,
					);
					builder.addTriangle( a, b, midpoint );
					builder.addTriangle( a, midpoint, c );
					builder.addTriangle( a, c, d );
				}
				else {
					builder.addTriangle( a, b, c );
					builder.addTriangle( a, c, d );
				}
			}
		}
	}
	return builder.build();

}

function buildAlliumPlantCardPart( plants: FlowerPlacement[], partIndex: number, segments: number ): MeshData {

	const halfWidth = ALLIUM_HEAD_SIZE * 0.5;
	const maxCardHeight = Math.max( ALLIUM_HEAD_SIZE, ...plants.map( ( plant ) => plant.height + ALLIUM_HEAD_RISE + halfWidth ) );
	return buildBentPlantCardPart( plants, partIndex, segments, {
		width: ALLIUM_HEAD_SIZE,
		maxCardHeight,
		top: ( plant ) => plant.height + ALLIUM_HEAD_RISE + halfWidth,
		stemHeight: ( plant ) => plant.height,
		headBottom: ( _plant, top ) => top - ALLIUM_HEAD_SIZE,
		headAnchor: ( _plant, _top, headBottom ) => headBottom + halfWidth,
	} );

}

function buildBluebellLod3Part( height: number, radius: number, partIndex: number ): MeshData {

	const builder = new MeshBuilder();
	const color: [ number, number, number ] = [ 1, 1, 1 ];
	const segments = 2;
	const planeRadius = radius * 0.995;
	const tileCount = BLUEBELL_LOD3_YAW_ANGLES.length;
	builder.beginGroup( partIndex );

	for ( let view = 0; view < BLUEBELL_LOD3_YAW_ANGLES.length; view ++ ) {
		const yaw = BLUEBELL_LOD3_YAW_ANGLES[ view ]!;
		const rightX = Math.cos( yaw );
		const rightZ = - Math.sin( yaw );
		const tileStart = view / tileCount;
		const tileEnd = ( view + 1 ) / tileCount;
		const rows: [ number, number ][] = [];
		for ( let row = 0; row <= segments; row ++ ) {
			const progress = row / segments;
			const y = height * progress;
			rows.push( [
				builder.addVertex( [ - rightX * planeRadius, y, - rightZ * planeRadius ], [ 0, 1, 0 ], [ tileStart, progress ], color, progress, 0 ),
				builder.addVertex( [ rightX * planeRadius, y, rightZ * planeRadius ], [ 0, 1, 0 ], [ tileEnd, progress ], color, progress, 0 ),
			] );
		}
		for ( let row = 0; row < segments; row ++ ) {
			const a = rows[ row ]![ 0 ];
			const b = rows[ row ]![ 1 ];
			const c = rows[ row + 1 ]![ 1 ];
			const d = rows[ row + 1 ]![ 0 ];
			builder.addTriangle( a, b, c );
			builder.addTriangle( a, c, d );
		}
	}

	return builder.build();

}

function buildTulipPlantCardPart( plants: FlowerPlacement[], partIndex: number, segments: number ): MeshData {

	const maxCardHeight = Math.max( ...plants.map( ( plant ) => plant.height ) );
	return buildBentPlantCardPart( plants, partIndex, segments, {
		width: TULIP_PLANT_CARD_WIDTH,
		maxCardHeight,
		top: ( plant ) => plant.height,
		stemHeight: ( plant ) => plant.height - TULIP_BLOOM_HEIGHT,
		headBottom: ( _plant, top ) => top - TULIP_BLOOM_HEIGHT,
		headAnchor: ( _plant, top ) => top,
		splitSingleSegment: segments === 1,
	} );

}

const ALLIUM_LOD3_YAW_ANGLES = [ 0, Math.PI / 2 ] as const;
const ALLIUM_LOD3_IMPOSTOR_VIEWS = ALLIUM_LOD3_YAW_ANGLES.map( yawImpostorView );
const ALLIUM_LOD4_IMPOSTOR_VIEWS = [ yawImpostorView( 0 ) ];
const BLUEBELL_LOD3_YAW_ANGLES = [ 0, Math.PI / 2 ] as const;
const BLUEBELL_LOD3_IMPOSTOR_VIEWS = BLUEBELL_LOD3_YAW_ANGLES.map( yawImpostorView );
const DAISY_LOD3_IMPOSTOR_VIEWS = [ ...ALLIUM_LOD3_IMPOSTOR_VIEWS, LOD4_IMPOSTOR_VIEWS[ 1 ] ] as const;
const PRIMROSE_LOD3_IMPOSTOR_VIEWS = [ LOD4_IMPOSTOR_VIEWS[ 1 ] ] as const;
// poppy の葉は縦カードの下部にだけ焼き、花の高さに置く上面カードには入れない。
const POPPY_TOP_IMPOSTOR_VIEW = { ...LOD4_IMPOSTOR_VIEWS[ 1 ], excludesBakeRanges: true };
const POPPY_LOD3_IMPOSTOR_VIEWS = [ ...ALLIUM_LOD3_IMPOSTOR_VIEWS, POPPY_TOP_IMPOSTOR_VIEW ];
const POPPY_LOD4_IMPOSTOR_VIEWS = [ LOD4_IMPOSTOR_VIEWS[ 0 ], POPPY_TOP_IMPOSTOR_VIEW ];

function combineParts( petal: MeshData, stem: MeshData ): MeshData {

	const vertexOffset = petal.positions.length / 3;
	const indices = new Uint32Array( petal.indices.length + stem.indices.length );
	indices.set( petal.indices );
	for ( let index = 0; index < stem.indices.length; index ++ ) indices[ petal.indices.length + index ] = stem.indices[ index ]! + vertexOffset;
	const groups = [ ...petal.groups.map( ( group ) => ( { ...group } ) ), ...stem.groups.map( ( group ) => ( { ...group, start: group.start + petal.indices.length } ) ) ];

	return {
		positions: Float32Array.from( [ ...petal.positions, ...stem.positions ] ),
		normals: Float32Array.from( [ ...petal.normals, ...stem.normals ] ),
		uvs: Float32Array.from( [ ...petal.uvs, ...stem.uvs ] ),
		colors: Float32Array.from( [ ...petal.colors, ...stem.colors ] ),
		windWeight: Float32Array.from( [ ...petal.windWeight, ...stem.windWeight ] ),
		impostorCard: Float32Array.from( [ ...petal.impostorCard, ...stem.impostorCard ] ),
		indices,
		groups,
	};

}

function meshGroupFootprint( mesh: MeshData, partIndex: number ): { minX: number; maxX: number; minZ: number; maxZ: number } | undefined {

	const group = mesh.groups.find( ( candidate ) => candidate.partIndex === partIndex );
	if ( group === undefined ) return undefined;
	const footprint = { minX: Infinity, maxX: - Infinity, minZ: Infinity, maxZ: - Infinity };
	for ( let index = group.start; index < group.start + group.count; index ++ ) {
		const vertex = mesh.indices[ index ]!;
		const x = mesh.positions[ vertex * 3 ]!;
		const z = mesh.positions[ vertex * 3 + 2 ]!;
		footprint.minX = Math.min( footprint.minX, x );
		footprint.maxX = Math.max( footprint.maxX, x );
		footprint.minZ = Math.min( footprint.minZ, z );
		footprint.maxZ = Math.max( footprint.maxZ, z );
	}
	return footprint;

}

function defaultColors( variety: FlowersVariety ): { petalColor: number; centerColor: number } {

	if ( variety === 'allium' ) return { petalColor: DEFAULT_ALLIUM_PETAL_COLOR, centerColor: DEFAULT_ALLIUM_CENTER_COLOR };
	if ( variety === 'daisy' ) return { petalColor: DEFAULT_DAISY_PETAL_COLOR, centerColor: DEFAULT_DAISY_CENTER_COLOR };
	if ( variety === 'tulip' ) return { petalColor: DEFAULT_TULIP_PETAL_COLOR, centerColor: DEFAULT_TULIP_CENTER_COLOR };
	if ( variety === 'poppy' ) return { petalColor: DEFAULT_POPPY_PETAL_COLOR, centerColor: DEFAULT_POPPY_CENTER_COLOR };
	if ( variety === 'bluebell' ) {
		// ブルーベルの centerColor は花柄（釣り鐘と茎をつなぐ柄）の色。
		return { petalColor: DEFAULT_BLUEBELL_PETAL_COLOR, centerColor: DEFAULT_BLUEBELL_CENTER_COLOR };
	}
	if ( variety === 'calla' ) return { petalColor: DEFAULT_CALLA_PETAL_COLOR, centerColor: DEFAULT_CALLA_CENTER_COLOR };
	return { petalColor: DEFAULT_PRIMROSE_PETAL_COLOR, centerColor: DEFAULT_PRIMROSE_CENTER_COLOR };

}

function setUpNormals( mesh: MeshData ): void {

	for ( let offset = 0; offset < mesh.normals.length; offset += 3 ) {
		mesh.normals[ offset ] = 0;
		mesh.normals[ offset + 1 ] = 1;
		mesh.normals[ offset + 2 ] = 0;
	}

}

export function generateFlowersData( options: FlowersOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const variety = options.variety ?? 'allium';
	if ( ! Number.isFinite( seed ) ) throw new RangeError( 'Flowers seed must be finite' );
	if ( ! [ 'allium', 'daisy', 'tulip', 'poppy', 'bluebell', 'calla', 'primrose' ].includes( variety ) ) throw new RangeError( 'Flowers variety is unsupported' );
	const count = options.count ?? ( variety === 'tulip' ? DEFAULT_TULIP_COUNT : variety === 'poppy' ? DEFAULT_POPPY_COUNT : variety === 'bluebell' ? DEFAULT_BLUEBELL_COUNT : variety === 'calla' ? DEFAULT_CALLA_COUNT : variety === 'primrose' ? DEFAULT_PRIMROSE_COUNT : DEFAULT_FLOWERS_COUNT );
	if ( ! Number.isInteger( count ) || count < 1 || count > DEFAULT_FLOWERS_COUNT ) throw new RangeError( 'Flowers count must be an integer from 1 to 6' );
	const defaults = defaultColors( variety );
	const defaultSpread = variety === 'allium' ? 0.29 : variety === 'daisy' ? 0.37 : variety === 'tulip' ? 0.3 : variety === 'poppy' ? DEFAULT_POPPY_SPREAD : variety === 'bluebell' ? DEFAULT_BLUEBELL_SPREAD : variety === 'calla' ? DEFAULT_CALLA_SPREAD : DEFAULT_PRIMROSE_SPREAD;
	const defaultHeight = variety === 'allium' ? 0.37 : variety === 'daisy' ? 0.285 : variety === 'tulip' ? 0.36 : variety === 'poppy' ? DEFAULT_POPPY_HEIGHT : variety === 'bluebell' ? DEFAULT_BLUEBELL_HEIGHT : variety === 'calla' ? DEFAULT_CALLA_HEIGHT : DEFAULT_PRIMROSE_HEIGHT;
	const spread = positive( options.spread ?? defaultSpread, 'spread' );
	const height = positive( options.height ?? defaultHeight, 'height' );
	const petalColor = options.petalColor ?? defaults.petalColor;
	const centerColor = options.centerColor ?? defaults.centerColor;
	const stemColor = options.stemColor ?? DEFAULT_FLOWERS_STEM_COLOR;
	validateColor( petalColor, 'petal color' );
	validateColor( centerColor, 'center color' );
	validateColor( stemColor, 'stem color' );
	const plants = createPlacements( seed, count, spread, height, variety );
	const poppyLeafIndexRanges: { start: number; count: number }[] = [];
	let poppyPetalIndexCount = 0;
	const lod0 = variety === 'allium'
		? buildAlliumPlantCardPart( plants, 2, 3 )
		: ( () => {
			const petal = buildFlowersPart( variety, 0, plants, 'petal' );
			const stem = variety === 'poppy'
				? buildPoppyPart( 0, plants, 'stem', poppyLeafIndexRanges )
				: buildFlowersPart( variety, 0, plants, 'stem' );
			poppyPetalIndexCount = petal.indices.length;
			return combineParts( petal, stem );
		} )();
	const poppyLeafBakeRanges = poppyLeafIndexRanges.map( ( range ) => ( { start: range.start + poppyPetalIndexCount, count: range.count } ) );
	const lod1 = variety === 'allium'
		? buildAlliumPlantCardPart( plants, 2, 2 )
		: variety === 'tulip'
			? buildTulipPlantCardPart( plants, 2, 2 )
			: variety === 'calla'
				? buildCallaPlantCardPart( plants, 2, 1 )
				: combineParts( buildFlowersPart( variety, 1, plants, 'petal' ), buildFlowersPart( variety, 1, plants, 'stem' ) );
	const maximumPlantHeight = Math.max( ...plants.map( ( plant ) => plant.height ) );
	const headRise = variety === 'allium'
		? ALLIUM_HEAD_SIZE * 0.5 + ALLIUM_HEAD_RISE
		: variety === 'daisy'
			? Math.max( ...plants.map( ( plant ) => DAISY_HEAD_SIZE * 0.5 * Math.tan( plant.headTilt ) ) ) + DAISY_HEAD_SIZE * DAISY_CUP_DEPTH
			: 0;
	let maximumGeometryHeight = - Infinity;
	if ( variety === 'poppy' || variety === 'bluebell' || variety === 'calla' || variety === 'primrose' ) {
		for ( let offset = 1; offset < lod0.positions.length; offset += 3 ) maximumGeometryHeight = Math.max( maximumGeometryHeight, lod0.positions[ offset ]! );
	}
	const boundsHeight = Number.isFinite( maximumGeometryHeight ) ? maximumGeometryHeight : maximumPlantHeight + headRise;
	const bounds = { radius: spread, height: boundsHeight };
	const primroseDomeFootprint = variety === 'primrose'
		? ( () => {
			const window = getImpostorProjectionWindow( bounds, lod0, LOD4_IMPOSTOR_VIEWS[ 1 ]! );
			return { minX: window.minRight, maxX: window.maxRight, minZ: - window.maxUp, maxZ: - window.minUp };
		} )()
		: null;
	const lod2 = variety === 'allium'
		? buildAlliumPlantCardPart( plants, 2, 1 )
		: variety === 'tulip'
			? buildTulipPlantCardPart( plants, 2, 1 )
			: variety === 'calla'
				? buildCallaPlantCardPart( plants, 2, 2 )
				: variety === 'primrose'
					? buildPrimroseDomePart( 2, 2, primroseDomeFootprint!, bounds.height, lod1.indices.length / 3 )
					: combineParts( buildFlowersPart( variety, 2, plants, 'petal' ), buildFlowersPart( variety, 2, plants, 'stem' ) );
	// 位置と属性がまったく同じ頂点は 1 つにまとめる（同じ絵を使う葉の付け根など）。
	for ( const mesh of [ lod0, lod1, lod2 ] ) weldIdenticalVertices( mesh );
	const hasPlantCard = variety === 'allium' || variety === 'tulip' || variety === 'calla';
	const lod3Index = hasPlantCard ? 3 : 2;
	const lod4Index = hasPlantCard ? 4 : 3;
	const daisyHeadHeight = variety === 'daisy' ? plants.reduce( ( sum, plant ) => sum + plant.height, 0 ) / plants.length : bounds.height * 0.25;
	const floweringPoppyHeights = plants.filter( ( plant ) => plant.bud !== true ).map( ( plant ) => plant.height );
	const poppyHeadHeight = variety === 'poppy'
		? ( floweringPoppyHeights.length > 0 ? floweringPoppyHeights : plants.map( ( plant ) => plant.height ) ).reduce( ( sum, plantHeight ) => sum + plantHeight, 0 ) / ( floweringPoppyHeights.length > 0 ? floweringPoppyHeights.length : plants.length )
		: bounds.height * 0.25;
	const poppyHeadFootprint = variety === 'poppy' ? meshGroupFootprint( lod0, 0 ) : undefined;
	const lod3Options = variety === 'allium'
		? { yawAngles: ALLIUM_LOD3_YAW_ANGLES, includeTopCard: false }
		: variety === 'daisy'
			? { yawAngles: ALLIUM_LOD3_YAW_ANGLES, includeTopCard: true }
			: variety === 'poppy'
				? { yawAngles: ALLIUM_LOD3_YAW_ANGLES, includeTopCard: true, ...( poppyHeadFootprint === undefined ? {} : { topFootprint: poppyHeadFootprint } ) }
				: variety === 'tulip'
					? { yawAngles: ALLIUM_LOD3_YAW_ANGLES, includeTopCard: false }
					: variety === 'calla'
						? { yawAngles: ALLIUM_LOD3_YAW_ANGLES, includeTopCard: false }
						: {};
	const lod3 = variety === 'bluebell'
		? buildBluebellLod3Part( bounds.height, bounds.radius, lod3Index )
		: variety === 'primrose'
		? buildPrimroseDomePart( 3, lod3Index, primroseDomeFootprint!, bounds.height, lod1.indices.length / 3 )
		: buildSixPlaneImpostor(
			bounds.height,
			bounds.radius,
			lod3Index,
			lod0,
			variety === 'daisy' ? daisyHeadHeight : variety === 'poppy' ? poppyHeadHeight : bounds.height * 0.25,
			lod3Options,
		);
	const lod4TopHeight = variety === 'daisy' ? daisyHeadHeight : variety === 'poppy' ? poppyHeadHeight : variety === 'primrose' ? bounds.height * 0.55 : bounds.height * 0.75;
	const includeLod4TopCard = variety !== 'allium' && variety !== 'tulip' && variety !== 'calla';
	const lod4 = buildBillboard( bounds, lod4Index, lod0, lod4TopHeight, includeLod4TopCard, variety === 'poppy' ? poppyHeadFootprint : undefined );
	if ( variety !== 'primrose' ) setUpNormals( lod3 );
	setUpNormals( lod4 );
	// allium / tulip / calla は petal / stem の色キーを残し、描画テクスチャを plantCard にまとめます。
	const petalPart: PartDef = {
		name: 'petal',
		defaultColor: petalColor,
		texture: variety === 'allium' ? null : 'petal',
		...( variety === 'allium' ? {} : { colorizesTexture: true } ),
		upNormalCards: true,
		roughness: 0.89,
		specularIntensity: 0.0149,
		ior: 1.05,
		alphaTest: 0.5,
		doubleSided: true,
		flatShading: false,
	};
	const stemPart: PartDef = {
		name: 'stem',
		defaultColor: stemColor,
		texture: variety === 'allium' ? null : 'stem',
		...( variety === 'allium' ? {} : { colorizesTexture: true } ),
		upNormalCards: true,
		roughness: 0.89,
		specularIntensity: 0.0149,
		ior: 1.05,
		alphaTest: 0.5,
		doubleSided: true,
		flatShading: false,
		...( variety === 'poppy' && poppyLeafBakeRanges.length > 0 ? { impostorBakeExcludeIndexRanges: poppyLeafBakeRanges } : {} ),
	};
	const plantCardPart: PartDef = {
		name: 'plantCard',
		defaultColor: 0xffffff,
		texture: 'plantCard',
		upNormalCards: true,
		roughness: petalPart.roughness,
		specularIntensity: petalPart.specularIntensity,
		ior: petalPart.ior,
		alphaTest: petalPart.alphaTest,
		doubleSided: true,
		flatShading: false,
	};
	// 交差カードは裏からも見えるので、両向きに足して上向き法線のまま照らす。
	const lod3Part = variety === 'primrose'
		// お椀は外側だけ描く。両面だと透けた隙間から奥の内側が外向き法線のまま見えて黒くなる。
		? { ...impostorLod3Part( PRIMROSE_LOD3_IMPOSTOR_VIEWS, false ), doubleSided: false }
		: variety === 'bluebell'
			? { ...impostorLod3Part( BLUEBELL_LOD3_IMPOSTOR_VIEWS, false ), upNormalCards: true }
		: variety === 'daisy' || variety === 'poppy'
			? { ...impostorLod3Part( variety === 'poppy' ? POPPY_LOD3_IMPOSTOR_VIEWS : DAISY_LOD3_IMPOSTOR_VIEWS, false ), upNormalCards: true }
			: variety === 'allium' || variety === 'tulip' || variety === 'calla'
				? { ...impostorLod3Part( ALLIUM_LOD3_IMPOSTOR_VIEWS, false ), upNormalCards: true }
				: { ...impostorLod3Part(), upNormalCards: true };
	const lod4Part = variety === 'allium' || variety === 'tulip' || variety === 'calla'
		? { ...impostorPart( ALLIUM_LOD4_IMPOSTOR_VIEWS, false ), upNormalCards: true }
		: variety === 'daisy' || variety === 'poppy' || variety === 'primrose'
			? { ...impostorPart( variety === 'poppy' ? POPPY_LOD4_IMPOSTOR_VIEWS : LOD4_IMPOSTOR_VIEWS, false ), upNormalCards: true }
			: { ...impostorPart(), upNormalCards: true };
	const parts = hasPlantCard ? [ petalPart, stemPart, plantCardPart, lod3Part, lod4Part ] : [ petalPart, stemPart, lod3Part, lod4Part ];
	const textures: Record<string, TextureData> = variety === 'allium'
		? {
			plantCard: createFlowersAlliumPlantCardTexture(
				seed,
				Math.max( ALLIUM_HEAD_SIZE, ...plants.map( ( plant ) => plant.height + ALLIUM_HEAD_RISE + ALLIUM_HEAD_SIZE * 0.5 ) ),
				petalColor,
				centerColor,
				stemColor,
			),
		}
		: variety === 'daisy'
			? {
				petal: createFlowersPetalTexture( seed, variety, petalColor, centerColor ),
				stem: createFlowersStemTexture( seed, variety, stemColor ),
			}
			: variety === 'tulip'
				? {
					petal: createTulipPetalTexture( petalColor ),
					stem: createTulipStemTexture( stemColor ),
					plantCard: createTulipPlantCardTexture( seed, Math.max( ...plants.map( ( plant ) => plant.height ) ), petalColor, stemColor ),
				}
				: variety === 'poppy'
					? { petal: createPoppyPetalTexture( seed, petalColor, centerColor ), stem: createPoppyStemTexture( stemColor ) }
					: variety === 'bluebell'
						? { petal: createBluebellPetalTexture( petalColor, centerColor ), stem: createBluebellStemTexture( stemColor ) }
						: variety === 'calla'
							? {
								petal: createCallaPetalTexture( petalColor, centerColor ),
								stem: createCallaStemTexture( stemColor ),
								plantCard: createCallaPlantCardTexture( Math.max( ...plants.map( ( plant ) => plant.height ) ), petalColor, centerColor, stemColor ),
							}
							: { petal: createPrimrosePetalTexture( seed, petalColor, centerColor ), stem: createPrimroseStemTexture( stemColor ) };

	return {
		kind: 'flowers',
		parts,
		lods: [
			lod0,
			lod1,
			lod2,
			lod3,
			lod4,
		],
		collider: null,
		textures,
		textureGenerators: {
			...( variety === 'allium' ? {} : {
				petal: { type: 'flowers-petal', seed, size: FLOWERS_PETAL_TEXTURE_SIZE, variety, fixedColor: centerColor },
				stem: { type: 'flowers-stem', seed, size: FLOWERS_STEM_TEXTURE_HEIGHT, variety },
			} ),
			...( variety === 'allium' ? {
				plantCard: {
					type: 'flowers-allium-plant-card',
					seed,
					size: ALLIUM_PLANT_CARD_TEXTURE_WIDTH,
					height: Math.max( ALLIUM_HEAD_SIZE, ...plants.map( ( plant ) => plant.height + ALLIUM_HEAD_RISE + ALLIUM_HEAD_SIZE * 0.5 ) ),
					variety: 'allium' as const,
					fixedColor: centerColor,
					petalColor,
					stemColor,
				},
			} : variety === 'tulip' ? {
				plantCard: {
					type: 'flowers-tulip-plant-card',
					seed,
					size: FLOWERS_PETAL_TEXTURE_SIZE,
					height: Math.max( ...plants.map( ( plant ) => plant.height ) ),
					variety: 'tulip' as const,
					petalColor,
					stemColor,
				},
			} : variety === 'calla' ? {
				plantCard: {
					type: 'flowers-calla-plant-card',
					seed,
					size: CALLA_PLANT_CARD_TEXTURE_WIDTH,
					height: Math.max( ...plants.map( ( plant ) => plant.height ) ),
					variety: 'calla' as const,
					fixedColor: centerColor,
					petalColor,
					stemColor,
				},
			} : {} ),
		},
		bounds,
	};

}

function regenerateFlowersTextureData( existing: TextureData, generator: TextureGeneratorDef, color: number ): TextureData {

	if ( ( generator.type !== 'flowers-petal' && generator.type !== 'flowers-stem' ) || existing.colorFactors === undefined || existing.colorPixelIndices === undefined ) {
		throw new Error( 'Flowers texture cannot be regenerated' );
	}
	return composeFlowersColor( existing, color );

}

function regenerateAlliumPlantCardTexture( _existing: TextureData, generator: TextureGeneratorDef ): TextureData {

	if ( generator.type !== 'flowers-allium-plant-card' || generator.height === undefined || generator.fixedColor === undefined || generator.petalColor === undefined || generator.stemColor === undefined ) {
		throw new Error( 'Allium plant-card texture cannot be regenerated' );
	}
	return createFlowersAlliumPlantCardTexture( generator.seed, generator.height, generator.petalColor, generator.fixedColor, generator.stemColor );

}

function regenerateTulipPlantCardTexture( _existing: TextureData, generator: TextureGeneratorDef ): TextureData {

	if ( generator.type !== 'flowers-tulip-plant-card' || generator.height === undefined || generator.petalColor === undefined || generator.stemColor === undefined ) {
		throw new Error( 'Tulip plant-card texture cannot be regenerated' );
	}
	return createTulipPlantCardTexture( generator.seed, generator.height, generator.petalColor, generator.stemColor );

}

function regenerateCallaPlantCardTexture( _existing: TextureData, generator: TextureGeneratorDef ): TextureData {

	if ( generator.type !== 'flowers-calla-plant-card' || generator.height === undefined || generator.fixedColor === undefined || generator.petalColor === undefined || generator.stemColor === undefined ) {
		throw new Error( 'Calla plant-card texture cannot be regenerated' );
	}
	return createCallaPlantCardTexture( generator.height, generator.petalColor, generator.fixedColor, generator.stemColor );

}

function regenerateAlliumPlantCardColor( data: VegetationData, channel: 'petalColor' | 'stemColor', color: number ): void {

	const generator = data.textureGenerators?.plantCard;
	if ( generator?.type !== 'flowers-allium-plant-card' || data.textures.plantCard === undefined ) return;
	generator[ channel ] = color;
	data.textures.plantCard = regenerateTexture( data, 'plantCard', color );

}

function regenerateTulipPlantCardColor( data: VegetationData, channel: 'petalColor' | 'stemColor', color: number ): void {

	const generator = data.textureGenerators?.plantCard;
	if ( generator?.type !== 'flowers-tulip-plant-card' || data.textures.plantCard === undefined ) return;
	generator[ channel ] = color;
	data.textures.plantCard = regenerateTexture( data, 'plantCard', color );

}

function regenerateCallaPlantCardColor( data: VegetationData, channel: 'petalColor' | 'stemColor', color: number ): void {

	const generator = data.textureGenerators?.plantCard;
	if ( generator?.type !== 'flowers-calla-plant-card' || data.textures.plantCard === undefined ) return;
	generator[ channel ] = color;
	data.textures.plantCard = regenerateTexture( data, 'plantCard', color );

}

export function regenerateFlowersPetalTexture( data: VegetationData, color: number ): void {

	if ( data.textureGenerators?.plantCard?.type === 'flowers-allium-plant-card' ) {
		regenerateAlliumPlantCardColor( data, 'petalColor', color );
		return;
	}
	if ( data.textureGenerators?.petal?.type !== 'flowers-petal' || data.textures.petal === undefined ) throw new Error( 'Flowers petal texture cannot be regenerated' );
	data.textures.petal = regenerateTexture( data, 'petal', color );
	if ( data.textureGenerators?.plantCard?.type === 'flowers-tulip-plant-card' ) regenerateTulipPlantCardColor( data, 'petalColor', color );
	if ( data.textureGenerators?.plantCard?.type === 'flowers-calla-plant-card' ) regenerateCallaPlantCardColor( data, 'petalColor', color );

}

export function regenerateFlowersStemTexture( data: VegetationData, color: number ): void {

	if ( data.textureGenerators?.plantCard?.type === 'flowers-allium-plant-card' ) {
		regenerateAlliumPlantCardColor( data, 'stemColor', color );
		return;
	}
	if ( data.textureGenerators?.stem?.type !== 'flowers-stem' || data.textures.stem === undefined ) throw new Error( 'Flowers stem texture cannot be regenerated' );
	data.textures.stem = regenerateTexture( data, 'stem', color );
	if ( data.textureGenerators?.plantCard?.type === 'flowers-tulip-plant-card' ) regenerateTulipPlantCardColor( data, 'stemColor', color );
	if ( data.textureGenerators?.plantCard?.type === 'flowers-calla-plant-card' ) regenerateCallaPlantCardColor( data, 'stemColor', color );

}

registerTextureRegenerator( 'flowers-petal', regenerateFlowersTextureData );
registerTextureRegenerator( 'flowers-stem', regenerateFlowersTextureData );
registerTextureRegenerator( 'flowers-allium-plant-card', regenerateAlliumPlantCardTexture );
registerTextureRegenerator( 'flowers-tulip-plant-card', regenerateTulipPlantCardTexture );
registerTextureRegenerator( 'flowers-calla-plant-card', regenerateCallaPlantCardTexture );
