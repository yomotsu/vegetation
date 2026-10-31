import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import type { Random } from '../random';
import type { ColliderData, MeshData, PartDef, TextureData, TextureGeneratorDef, Vec3, VegetationData } from '../types';
import type { NormalizedVegetationGeneration } from '../vegetationGeneration';
import { registerTextureRegenerator } from '../textureRegenerator';
import { composeFirFrondTexture, createFirFrondTextures, createStylizedBarkTextures, FIR_FROND_TEXTURE_WIDTH, firFrondWidth, STYLIZED_BARK_TEXTURE_HEIGHT, STYLIZED_BARK_TEXTURE_WIDTH } from './stylizedTextures';
import { addStylizedLimb, crossVec3, normalizeVec3, buildStylizedImpostorLods, createStylizedImpostorParts, getMeshBoundsRadius, getMeshTop, getStylizedRootDepth, scaleMeshPositions } from './stylized';

export interface FirTreeOptions {
	seed?: number;
	height?: number;
	leafColor?: number;
	barkColor?: number;
}

export const DEFAULT_FIR_TREE_HEIGHT = 6;
export const DEFAULT_FIR_TREE_LEAF_COLOR = 0x4b6c56;
export const DEFAULT_FIR_TREE_BARK_COLOR = 0x9a9183;

const barkPartIndex = 0;
const leafPartIndex = 1;
interface FirTrunk {
	spine: Vec3[];
	radii: number[];
}

interface FirFrond {
	y: number;
	angle: number;
	length: number;
	// 枝の中心線: 付け根の下向きの傾き (dip) と、先へ向かって上へ反る量 (lift)。
	dip: number;
	lift: number;
	bend: number;
	// 左右の葉の帯を水平から下げる角度。
	tent: number;
	position: number;
	filler: boolean;
}

interface FirDetail {
	trunkSides: number;
	trunkSamples: number;
	// 枝の本数の上限（頂上の傘は別）。
	maxFronds: number;
	rows: number[];
	widthScale: number;
}

// 幹は細くまっすぐ伸ばし、先端だけわずかに揺らす。
function createTrunk( random: Random, height: number ): FirTrunk {

	const rootDepth = getStylizedRootDepth( height );
	const baseRadius = height * random.range( 0.019, 0.023 );
	const bendAngle = random.range( 0, Math.PI * 2 );
	const bend = height * random.range( 0.006, 0.018 );
	const fractions = [ - rootDepth / height, 0, 0.04, 0.18, 0.36, 0.55, 0.73, 0.9 ];
	const spine: Vec3[] = [];
	const radii: number[] = [];

	for ( const fraction of fractions ) {

		const f = Math.max( 0, fraction );
		const sway = Math.sin( f * Math.PI * 1.35 ) * bend;
		spine.push( [ Math.cos( bendAngle ) * sway, fraction * height, Math.sin( bendAngle ) * sway ] );
		const flare = fraction <= 0.04 ? 1.3 - 0.3 * Math.max( 0, fraction ) / 0.04 : 1;
		radii.push( baseRadius * flare * ( 1 - 0.78 * f ) );

	}

	return { spine, radii };

}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.min( maximum, Math.max( minimum, value ) );

}

function lerpVec3( a: Vec3, b: Vec3, t: number ): Vec3 {

	return [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];

}

function trunkPoint( spine: readonly Vec3[], y: number ): Vec3 {

	for ( let index = 1; index < spine.length; index ++ ) {

		if ( spine[ index ]![ 1 ] >= y ) {
			const lower = spine[ index - 1 ]!;
			const upper = spine[ index ]!;
			return lerpVec3( lower, upper, ( y - lower[ 1 ] ) / ( upper[ 1 ] - lower[ 1 ] ) );
		}

	}

	return [ ...spine[ spine.length - 1 ]! ];

}

function createFirFronds( seed: number, height: number ): FirFrond[] {

	const random = createRandom( seed * 79 + 17 );
	const fronds: FirFrond[] = [];
	const tierCount = random.int( 12, 14 );
	const tierStep = 1 / ( tierCount - 1 );
	let tierAngle = random.range( 0, Math.PI * 2 );

	// 枝は高さの不揃いな段（輪生）にまとめて出す。段ごとに枝の数・向き・長さを偏らせ、どの方向から見ても同じにならないようにする。
	for ( let tier = 0; tier < tierCount; tier ++ ) {

		const position = clamp( tier * tierStep + random.range( - 0.3, 0.3 ) * tierStep, 0, 1 );
		const y = height * ( 0.28 + position * 0.6 );
		const count = position > 0.75 ? random.int( 4, 6 ) : random.int( 6, 7 );
		const tierSize = random.range( 0.85, 1.12 );
		// 段の中で片側の枝を長くする。
		const lopsided = random.range( 0, Math.PI * 2 );
		tierAngle += random.range( 0.6, 2.2 );

		for ( let branch = 0; branch < count; branch ++ ) {

			const angle = tierAngle + branch / count * Math.PI * 2 + random.range( - 0.4, 0.4 );
			const side = 1 + 0.2 * Math.cos( angle - lopsided );
			fronds.push( {
				y: y + height * random.range( - 0.012, 0.012 ),
				angle,
				length: height * ( 0.125 + 0.275 * ( 1 - position ) ) * tierSize * side * random.range( 0.85, 1.1 ),
				// 幹からやや下向きに出て、先はやや上を向く。
				dip: random.range( 0.35, 0.55 ),
				lift: random.range( 0.28, 0.4 ),
				bend: random.range( - 0.15, 0.15 ),
				tent: random.range( 0.5, 0.75 ),
				position,
				filler: false,
			} );

		}

		// 枝の間を埋める短い枝。
		const fillerCount = position > 0.75 ? 1 : 2;
		for ( let filler = 0; filler < fillerCount; filler ++ ) {

			const angle = tierAngle + ( filler + 0.5 ) / fillerCount * Math.PI * 2 + random.range( - 0.5, 0.5 );
			fronds.push( {
				y: y - height * random.range( 0.015, 0.035 ),
				angle,
				length: height * ( 0.125 + 0.275 * ( 1 - position ) ) * tierSize * random.range( 0.55, 0.75 ),
				dip: random.range( 0.4, 0.6 ),
				lift: random.range( 0.25, 0.38 ),
				bend: random.range( - 0.2, 0.2 ),
				tent: random.range( 0.55, 0.8 ),
				position,
				filler: true,
			} );

		}

	}

	return fronds;

}

// LOD ごとの頂点数に収めるため、枝の本数に上限を設ける。超えた分は隙間埋めの枝から間引き、
// 足りなければ主な枝を全体から等間隔に間引く（短い枝から消すと上の段が抜けて幹が見えた）。
function thinFirFronds( fronds: readonly FirFrond[], maxFronds: number ): readonly FirFrond[] {

	let result = fronds;
	const fillers = result.filter( ( frond ) => frond.filler );
	const fillerExcess = Math.min( fillers.length, result.length - maxFronds );
	if ( fillerExcess > 0 ) {

		const removed = new Set( fillers.filter( ( frond, index ) => Math.floor( ( index + 1 ) * fillerExcess / fillers.length ) > Math.floor( index * fillerExcess / fillers.length ) ) );
		result = result.filter( ( frond ) => ! removed.has( frond ) );

	}

	const mainExcess = result.length - maxFronds;
	if ( mainExcess > 0 ) {

		const mains = result.filter( ( frond ) => ! frond.filler );
		const removed = new Set( mains.filter( ( frond, index ) => Math.floor( ( index + 1 ) * mainExcess / mains.length ) > Math.floor( index * mainExcess / mains.length ) ) );
		result = result.filter( ( frond ) => ! removed.has( frond ) );

	}

	return result;

}

// 1 本の枝。中心線は幹から下向きに出て先で上へ反る。葉は枝を稜線にした左右 2 枚の帯で、両側へ斜め下に垂らす（枝の周りに葉が付く）。
// 帯には羽根テクスチャの左右の半分を貼る（u = 0.5 が枝、u = 0 / 1 が縁）。帯の幅は firFrondWidth に合わせ、絵の小枝と同じ形にする。
// sharedBase を渡すと、付け根の中央の頂点を枝どうしで共有する（同じ点から出る頂上の傘で重複させない）。
function addFirFrond( builder: MeshBuilder, base: Vec3, frond: FirFrond, rows: readonly number[], widthScale: number, referenceLength: number, sharedBase?: { index: number } ): void {

	const radial: Vec3 = [ Math.cos( frond.angle ), 0, Math.sin( frond.angle ) ];
	const lateral: Vec3 = [ - Math.sin( frond.angle ), 0, Math.cos( frond.angle ) ];
	const length = frond.length;
	const pointAt = ( t: number ): Vec3 => {

		const out = length * t;
		const up = length * ( - frond.dip * t + frond.lift * t * t );
		const side = length * frond.bend * t * t;
		return [
			base[ 0 ] + radial[ 0 ] * out + lateral[ 0 ] * side,
			base[ 1 ] + up,
			base[ 2 ] + radial[ 2 ] * out + lateral[ 2 ] * side,
		];

	};
	// 片側の最大幅。テクスチャの片側（幅 256 px = 長さの 0.25 倍）を横に 1.05 倍まで伸ばして貼る。
	// 短い枝は帯の幅を少し狭める（同じ幅だと上の段が平たい皿のように見えた）。
	const maxWidth = referenceLength * 0.25 * 1.05 * widthScale * Math.pow( Math.min( 1, length / referenceLength ), 0.35 );
	// テクスチャはいちばん長い枝 1 本分。短い枝はその先端側だけを同じ縮尺で貼り、どの枝でも針葉の大きさをそろえる。
	const startV = 1 - Math.min( 1, length / referenceLength );
	const cosTent = Math.cos( frond.tent );
	const sinTent = Math.sin( frond.tent );
	const indices: [ number, number, number ][] = [];

	for ( const t of rows ) {

		const center = pointAt( t );
		const ahead = pointAt( Math.min( 1, t + 0.02 ) );
		const behind = pointAt( Math.max( 0, t - 0.02 ) );
		const tangent = normalizeVec3( [ ahead[ 0 ] - behind[ 0 ], ahead[ 1 ] - behind[ 1 ], ahead[ 2 ] - behind[ 2 ] ] );
		const across = normalizeVec3( crossVec3( [ 0, 1, 0 ], tangent ) );
		const shade = 0.75 + 0.25 * t;
		const wind = Math.min( 1, 0.2 + t * 0.8 );
		const v = startV + ( 1 - startV ) * t;
		const width = maxWidth * firFrondWidth( v );
		const row: number[] = [];

		for ( const sign of [ 1, 0, - 1 ] ) {

			const position: Vec3 = sign === 0 ? center : [
				center[ 0 ] + across[ 0 ] * sign * width * cosTent,
				center[ 1 ] - width * sinTent,
				center[ 2 ] + across[ 2 ] * sign * width * cosTent,
			];
			// 法線は帯の面の上向き（稜線は真上）。屋根の両面が上から光を受ける。
			const normal = normalizeVec3( sign === 0 ? [ 0, 1, 0 ] : [ across[ 0 ] * sign * sinTent * 0.8, cosTent + 0.3, across[ 2 ] * sign * sinTent * 0.8 ] );
			if ( sign === 0 && t === rows[ 0 ] && sharedBase !== undefined && sharedBase.index >= 0 ) {
				row.push( sharedBase.index );
				continue;
			}

			const index = builder.addVertex( position, normal, [ 0.5 - sign * 0.5, v ], [ shade, shade, shade ], wind );
			if ( sign === 0 && t === rows[ 0 ] && sharedBase !== undefined ) sharedBase.index = index;
			row.push( index );

		}

		indices.push( row as [ number, number, number ] );

	}

	for ( let index = 1; index < indices.length; index ++ ) {

		const previous = indices[ index - 1 ]!;
		const current = indices[ index ]!;
		builder.addTriangle( previous[ 0 ], current[ 0 ], current[ 1 ] );
		builder.addTriangle( previous[ 0 ], current[ 1 ], previous[ 1 ] );
		builder.addTriangle( previous[ 1 ], current[ 1 ], current[ 2 ] );
		builder.addTriangle( previous[ 1 ], current[ 2 ], previous[ 2 ] );

	}

}

const lodDetails: FirDetail[] = [
	// LOD0 は 800 頂点未満（幹 50 + 枝 58 本 × 12 + 頂上の傘 4 本 × 12）。LOD1 / LOD2 は pine と同じく LOD0 の約 0.55 / 0.25 倍。
	// 枝を減らした分は帯を広げて覆う量を保つ。
	{ trunkSides: 6, trunkSamples: 1, maxFronds: 58, rows: [ 0, 0.35, 0.7, 1 ], widthScale: 1.1 },
	{ trunkSides: 5, trunkSamples: 1, maxFronds: 40, rows: [ 0, 0.5, 1 ], widthScale: 1.23 },
	{ trunkSides: 4, trunkSamples: 1, maxFronds: 25, rows: [ 0, 1 ], widthScale: 1.42 },
];

function buildFirMesh( height: number, trunk: FirTrunk, fronds: readonly FirFrond[], detail: FirDetail ): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	addStylizedLimb( builder, trunk.spine, trunk.radii, detail.trunkSides, barkPartIndex, ( t ) => t * 0.08, detail.trunkSamples );
	builder.beginGroup( leafPartIndex );
	const referenceLength = fronds.reduce( ( longest, frond ) => Math.max( longest, frond.length ), 0 );

	for ( const frond of thinFirFronds( fronds, detail.maxFronds ) ) {

		addFirFrond( builder, trunkPoint( trunk.spine, frond.y ), frond, detail.rows, detail.widthScale, referenceLength );

	}

	// 頂上は幹の先から四方へ出る短い枝の小さな傘。
	const top = trunk.spine[ trunk.spine.length - 1 ]!;
	const capBase = { index: - 1 };
	for ( let cap = 0; cap < 4; cap ++ ) {

		const angle = cap / 4 * Math.PI * 2 + 0.4;
		addFirFrond( builder, [ top[ 0 ], top[ 1 ] + height * 0.03, top[ 2 ] ], { y: top[ 1 ], angle, length: height * 0.07, dip: 0.6, lift: 0.2, bend: 0, tent: 0.7, position: 1, filler: false }, detail.rows, detail.widthScale, referenceLength, capBase );

	}

	return builder.build();

}

function buildCollider( trunk: FirTrunk ): ColliderData {

	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	addTube( builder, [ trunk.spine[ 0 ]!, trunk.spine[ 3 ]!, trunk.spine[ 5 ]!, trunk.spine[ trunk.spine.length - 1 ]! ], [ trunk.radii[ 0 ]!, trunk.radii[ 3 ]!, trunk.radii[ 5 ]!, trunk.radii[ trunk.radii.length - 1 ]! ], 8, {
		color: [ 1, 1, 1 ],
		wind: () => 0,
		capEnd: false,
	} );
	const mesh = builder.build();
	return { positions: mesh.positions, indices: mesh.indices };

}

function regenerateFirFrondTexture( existing: TextureData, generator: TextureGeneratorDef, color: number ): TextureData {

	if ( generator.type !== 'fir-frond' || existing.colorFactors === undefined || existing.colorPixelIndices === undefined ) {
		throw new Error( 'Fir frond texture cannot be regenerated' );
	}

	return composeFirFrondTexture( existing, color );

}

registerTextureRegenerator( 'fir-frond', regenerateFirFrondTexture );

export function generateFirTreeData( options: FirTreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? DEFAULT_FIR_TREE_HEIGHT;
	const leafColor = options.leafColor ?? DEFAULT_FIR_TREE_LEAF_COLOR;
	const barkColor = options.barkColor ?? DEFAULT_FIR_TREE_BARK_COLOR;

	if ( ! Number.isFinite( height ) || height <= 0 ) {
		throw new RangeError( 'Fir tree height must be a positive finite number' );
	}

	const trunk = createTrunk( createRandom( seed ), height );
	const fronds = createFirFronds( seed, height );
	const built = lodDetails.map( ( detail ) => buildFirMesh( height, trunk, fronds, detail ) );
	const lod0 = built[ 0 ]!;
	const collider = buildCollider( trunk );
	const fit = height / getMeshTop( lod0 );
	for ( const mesh of built ) scaleMeshPositions( mesh.positions, fit );
	scaleMeshPositions( collider.positions, fit );

	// 幹は大半が葉に隠れるので、樹皮は他の木の半分の解像度で足りる（生成時間の予算のため）。
	const bark = createStylizedBarkTextures( seed, STYLIZED_BARK_TEXTURE_WIDTH / 2, STYLIZED_BARK_TEXTURE_HEIGHT / 2 );
	const leaf = createFirFrondTextures( seed, leafColor );
	const parts: PartDef[] = [
		{
			name: 'bark',
			defaultColor: barkColor,
			texture: 'bark',
			normalTexture: 'barkNormal',
			roughness: 0.9,
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
		},
		{
			name: 'leaf',
			defaultColor: leafColor,
			texture: 'leaf',
			normalTexture: 'leafNormal',
			colorizesTexture: true,
			roughness: 0.85,
			alphaTest: 0.5,
			upNormalCards: true,
			doubleSided: false,
			flatShading: false,
		},
		...createStylizedImpostorParts(),
	];
	// LOD3 / LOD4 の水平板は tree と同じく一番下の葉の近く（少し上）に置く。
	const leafGroup = lod0.groups.find( ( group ) => group.partIndex === leafPartIndex )!;
	let lowestLeaf = Infinity;
	for ( let index = leafGroup.start; index < leafGroup.start + leafGroup.count; index ++ ) lowestLeaf = Math.min( lowestLeaf, lod0.positions[ lod0.indices[ index ]! * 3 + 1 ]! );
	const lods: MeshData[] = [ lod0, built[ 1 ]!, built[ 2 ]!, ...buildStylizedImpostorLods( lod0, height, lowestLeaf + height * 0.03 ) ];

	return {
		kind: 'fir-tree',
		parts,
		lods,
		collider,
		textures: { bark: bark.color, barkNormal: bark.normal, leaf: leaf.color, leafNormal: leaf.normal },
		textureGenerators: { leaf: { type: 'fir-frond', seed, size: FIR_FROND_TEXTURE_WIDTH } },
		bounds: { radius: getMeshBoundsRadius( lod0 ), height },
	};

}

export function normalizeFirTreeGenerationOptions(
	options: FirTreeOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<FirTreeOptions> {

	const leafColor = colors.leaf ?? options.leafColor ?? DEFAULT_FIR_TREE_LEAF_COLOR;
	const barkColor = colors.bark ?? options.barkColor ?? DEFAULT_FIR_TREE_BARK_COLOR;
	return {
		options: {
			seed: options.seed,
			height: options.height ?? DEFAULT_FIR_TREE_HEIGHT,
			leafColor,
			barkColor,
		},
		colors: { leaf: leafColor, bark: barkColor },
	};

}
