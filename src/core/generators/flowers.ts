import { buildBillboard, buildSixPlaneImpostor, impostorLod3Part, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { registerTextureRegenerator, regenerateTexture } from '../textureRegenerator';
import { composeFlowersColor, createFlowersPetalTexture, createFlowersStemTexture, FLOWERS_PETAL_TEXTURE_SIZE, FLOWERS_STEM_TEXTURE_HEIGHT } from '../flowersTexture';
import { createRandom } from '../random';
import type { MeshData, PartDef, TextureData, TextureGeneratorDef, VegetationData } from '../types';
import { buildTulipPart, createTulipPetalTexture, createTulipStemTexture } from '../flowers/tulip';
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

export type FlowersVariety = 'allium' | 'daisy' | 'tulip';

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

function createPlacements( seed: number, count: number, spread: number, height: number, variety: FlowersVariety ): FlowerPlacement[] {

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
// allium の花房のカード。参考の花房は幅約 11 cm で、茎の先が房の下寄りに入る。
const ALLIUM_HEAD_SIZE = 0.24;
const ALLIUM_HEAD_RISE = 0.035;

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

function defaultColors( variety: FlowersVariety ): { petalColor: number; centerColor: number } {

	if ( variety === 'allium' ) return { petalColor: DEFAULT_ALLIUM_PETAL_COLOR, centerColor: DEFAULT_ALLIUM_CENTER_COLOR };
	if ( variety === 'daisy' ) return { petalColor: DEFAULT_DAISY_PETAL_COLOR, centerColor: DEFAULT_DAISY_CENTER_COLOR };
	return { petalColor: DEFAULT_TULIP_PETAL_COLOR, centerColor: DEFAULT_TULIP_CENTER_COLOR };

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
	if ( variety !== 'allium' && variety !== 'daisy' && variety !== 'tulip' ) throw new RangeError( 'Flowers variety is unsupported' );
	const count = options.count ?? ( variety === 'tulip' ? DEFAULT_TULIP_COUNT : DEFAULT_FLOWERS_COUNT );
	if ( ! Number.isInteger( count ) || count < 1 || count > DEFAULT_FLOWERS_COUNT ) throw new RangeError( 'Flowers count must be an integer from 1 to 6' );
	const defaults = defaultColors( variety );
	const spread = positive( options.spread ?? ( variety === 'allium' ? 0.29 : variety === 'daisy' ? 0.37 : 0.3 ), 'spread' );
	const height = positive( options.height ?? ( variety === 'allium' ? 0.37 : variety === 'daisy' ? 0.285 : 0.36 ), 'height' );
	const petalColor = options.petalColor ?? defaults.petalColor;
	const centerColor = options.centerColor ?? defaults.centerColor;
	const stemColor = options.stemColor ?? DEFAULT_FLOWERS_STEM_COLOR;
	validateColor( petalColor, 'petal color' );
	validateColor( centerColor, 'center color' );
	validateColor( stemColor, 'stem color' );
	const plants = createPlacements( seed, count, spread, height, variety );
	const lod0 = combineParts( buildFlowersPart( variety, 0, plants, 'petal' ), buildFlowersPart( variety, 0, plants, 'stem' ) );
	const lod1 = combineParts( buildFlowersPart( variety, 1, plants, 'petal' ), buildFlowersPart( variety, 1, plants, 'stem' ) );
	const lod2 = combineParts( buildFlowersPart( variety, 2, plants, 'petal' ), buildFlowersPart( variety, 2, plants, 'stem' ) );
	const maximumPlantHeight = Math.max( ...plants.map( ( plant ) => plant.height ) );
	const headRise = variety === 'allium'
		? ALLIUM_HEAD_SIZE * 0.5 + ALLIUM_HEAD_RISE
		: variety === 'daisy'
			? Math.max( ...plants.map( ( plant ) => DAISY_HEAD_SIZE * 0.5 * Math.tan( plant.headTilt ) ) ) + DAISY_HEAD_SIZE * DAISY_CUP_DEPTH
			: 0;
	const bounds = { radius: spread, height: maximumPlantHeight + headRise };
	const lod3Index = 2;
	const lod4Index = 3;
	const lod3 = buildSixPlaneImpostor( bounds.height, bounds.radius, lod3Index, lod0, bounds.height * 0.25 );
	const lod4 = buildBillboard( bounds, lod4Index, lod0, bounds.height * 0.75 );
	setUpNormals( lod3 );
	setUpNormals( lod4 );
	const petalPart: PartDef = {
		name: 'petal',
		defaultColor: petalColor,
		texture: 'petal',
		colorizesTexture: true,
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
		texture: 'stem',
		colorizesTexture: true,
		upNormalCards: true,
		roughness: 0.89,
		specularIntensity: 0.0149,
		ior: 1.05,
		alphaTest: 0.5,
		doubleSided: true,
		flatShading: false,
	};
	const lod3Part = impostorLod3Part();
	const lod4Part = impostorPart();
	const parts = [ petalPart, stemPart, lod3Part, lod4Part ];
	const textures = variety === 'allium' || variety === 'daisy'
		? {
			petal: createFlowersPetalTexture( seed, variety, petalColor, centerColor ),
			stem: createFlowersStemTexture( seed, variety, stemColor ),
		}
		: { petal: createTulipPetalTexture( petalColor ), stem: createTulipStemTexture( stemColor ) };

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
			petal: { type: 'flowers-petal', seed, size: FLOWERS_PETAL_TEXTURE_SIZE, variety, fixedColor: centerColor },
			stem: { type: 'flowers-stem', seed, size: FLOWERS_STEM_TEXTURE_HEIGHT, variety },
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

export function regenerateFlowersPetalTexture( data: VegetationData, color: number ): void {

	if ( data.textureGenerators?.petal?.type !== 'flowers-petal' || data.textures.petal === undefined ) throw new Error( 'Flowers petal texture cannot be regenerated' );
	data.textures.petal = regenerateTexture( data, 'petal', color );

}

export function regenerateFlowersStemTexture( data: VegetationData, color: number ): void {

	if ( data.textureGenerators?.stem?.type !== 'flowers-stem' || data.textures.stem === undefined ) throw new Error( 'Flowers stem texture cannot be regenerated' );
	data.textures.stem = regenerateTexture( data, 'stem', color );

}

registerTextureRegenerator( 'flowers-petal', regenerateFlowersTextureData );
registerTextureRegenerator( 'flowers-stem', regenerateFlowersTextureData );
