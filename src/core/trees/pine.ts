import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import type { Random } from '../random';
import type { ColliderData, MeshData, PartDef, Vec3, VegetationData } from '../types';
import type { NormalizedVegetationGeneration } from '../vegetationGeneration';
import { createNeedleSprayTextures, createStylizedBarkTextures } from './stylizedTextures';
import { addFoliageLobeCards, addStylizedLimb, addVec3, buildStylizedImpostorLods, createStylizedImpostorParts, getMeshBoundsRadius, getMeshTop, getStylizedRootDepth, scaleMeshPositions } from './stylized';
import type { FoliageLobe } from './stylized';

export interface PineTreeOptions {
	seed?: number;
	height?: number;
	leafColor?: number;
	barkColor?: number;
}

export const DEFAULT_PINE_TREE_HEIGHT = 9;
export const DEFAULT_PINE_TREE_LEAF_COLOR = 0x3f8a4c;
export const DEFAULT_PINE_TREE_BARK_COLOR = 0xb8653a;

const barkPartIndex = 0;
const leafPartIndex = 1;
const needleTextureSize = 256;

interface Branch {
	base: Vec3;
	tip: Vec3;
	radius: number;
	lobes: FoliageLobe[];
}

function lerpVec3( a: Vec3, b: Vec3, t: number ): Vec3 {

	return [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];

}

// 幹は真っすぐ高く、ゆるく S 字に曲がる。
function createTrunk( random: Random, height: number ): { spine: Vec3[]; radii: number[] } {

	const rootDepth = getStylizedRootDepth( height );
	const baseRadius = height * random.range( 0.032, 0.038 );
	const bendAngle = random.range( 0, Math.PI * 2 );
	const bend = height * random.range( 0.015, 0.04 );
	const fractions = [ - rootDepth / height, 0, 0.04, 0.2, 0.4, 0.6, 0.78, 0.92 ];
	const spine: Vec3[] = [];
	const radii: number[] = [];

	for ( const fraction of fractions ) {

		const f = Math.max( 0, fraction );
		const sway = Math.sin( f * Math.PI * 1.4 ) * bend;
		spine.push( [ Math.cos( bendAngle ) * sway, fraction * height, Math.sin( bendAngle ) * sway ] );
		const flare = fraction <= 0.04 ? 1.35 - 0.35 * Math.max( 0, fraction ) / 0.04 : 1;
		radii.push( baseRadius * flare * ( 1 - 0.78 * f ) );

	}

	return { spine, radii };

}

function trunkPoint( spine: readonly Vec3[], y: number ): { point: Vec3; index: number } {

	for ( let index = 1; index < spine.length; index ++ ) {

		if ( spine[ index ]![ 1 ] >= y ) {

			const lower = spine[ index - 1 ]!;
			const upper = spine[ index ]!;
			return { point: lerpVec3( lower, upper, ( y - lower[ 1 ] ) / ( upper[ 1 ] - lower[ 1 ] ) ), index };

		}

	}

	return { point: [ ...spine[ spine.length - 1 ]! ], index: spine.length - 1 };

}

// 樹冠の下端から頂上まで枝を段に出し、枝先に平たい塊を付ける。上ほど枝は短い。
function createBranches( random: Random, height: number, spine: readonly Vec3[], radii: readonly number[] ): Branch[] {

	const branches: Branch[] = [];
	const crownBase = height * random.range( 0.45, 0.55 );
	const count = random.int( 10, 13 );
	let angle = random.range( 0, Math.PI * 2 );

	for ( let index = 0; index < count; index ++ ) {

		const t = ( index + random.range( - 0.3, 0.3 ) ) / ( count - 1 );
		const y = crownBase + ( height * 0.86 - crownBase ) * Math.min( 1, Math.max( 0, t ) );
		angle += Math.PI * 2 * 0.382 + random.range( - 0.4, 0.4 );
		const { point, index: spineIndex } = trunkPoint( spine, y );
		const trunkRadius = radii[ Math.max( 0, spineIndex - 1 ) ]!;
		const relative = ( y - crownBase ) / ( height - crownBase );
		const length = height * random.range( 0.13, 0.2 ) * ( 1.05 - relative * 0.55 );
		const tip: Vec3 = [ point[ 0 ] + Math.cos( angle ) * length, y + length * random.range( 0.15, 0.45 ), point[ 2 ] + Math.sin( angle ) * length ];
		const lobeRadius = height * random.range( 0.1, 0.13 ) * ( 1.05 - relative * 0.35 );
		// 塊は枝先に 1 個だけ。小さな塊は割り当てるカードが少なく、浮いて見えた。
		const lobes: FoliageLobe[] = [ { center: addVec3( tip, [ 0, lobeRadius * 0.25, 0 ] ), radius: lobeRadius, scale: [ 1.45, 0.62, 1.45 ] } ];

		branches.push( { base: point, tip, radius: trunkRadius * 0.42, lobes } );

	}

	// 頂上の塊。
	const top = spine[ spine.length - 1 ]!;
	const topRadius = height * random.range( 0.08, 0.1 );
	branches.push( { base: top, tip: [ top[ 0 ], height - topRadius * 0.9, top[ 2 ] ], radius: radii[ radii.length - 1 ]!, lobes: [ { center: [ top[ 0 ], height - topRadius * 0.9, top[ 2 ] ], radius: topRadius, scale: [ 1.1, 0.85, 1.1 ] } ] } );

	return branches;

}

// 樹冠の下に残る枯れ枝。横へ伸びてから先が上へ反り、先へ向かって細くなる。尖らせず、折れた先は平らに閉じる。
function addStubs( builder: MeshBuilder, random: Random, height: number, spine: readonly Vec3[], radii: readonly number[], sides: number ): void {

	const count = random.int( 2, 4 );

	for ( let index = 0; index < count; index ++ ) {

		const y = height * random.range( 0.28, 0.46 );
		const { point, index: spineIndex } = trunkPoint( spine, y );
		const angle = random.range( 0, Math.PI * 2 );
		const length = height * random.range( 0.07, 0.12 );
		const radius = radii[ Math.max( 0, spineIndex - 1 ) ]! * random.range( 0.2, 0.28 );
		const rise = random.range( 0.2, 0.8 );
		// 先へ行くほど横へ少し曲げる（向きは乱数を増やさず rise から決める）。
		const bend = ( rise - 0.5 ) * 1.2;
		const along = ( distance: number, turn: number, up: number ): Vec3 => [
			point[ 0 ] + Math.cos( angle + bend * turn ) * length * distance,
			y + length * up,
			point[ 2 ] + Math.sin( angle + bend * turn ) * length * distance,
		];
		const points = [ point, along( 0.38, 0.1, - 0.04 ), along( 0.72, 0.45, 0.01 + rise * 0.07 ), along( 0.95, 1, 0.08 + rise * 0.27 ) ];
		// sides が 0 なら描かない（乱数は同じだけ使う）。
		if ( sides > 0 ) addStylizedLimb( builder, points, [ radius, radius * 0.72, radius * 0.5, radius * 0.34 ], sides, barkPartIndex, () => 0, 1, true );

	}

}

function buildCollider( spine: readonly Vec3[], radii: readonly number[] ): ColliderData {

	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	addTube( builder, [ spine[ 0 ]!, spine[ 3 ]!, spine[ spine.length - 2 ]! ], [ radii[ 0 ]!, radii[ 3 ]!, radii[ radii.length - 2 ]! ], 8, {
		color: [ 1, 1, 1 ],
		wind: () => 0,
		capEnd: false,
	} );
	const mesh = builder.build();
	return { positions: mesh.positions, indices: mesh.indices };

}

interface PineDetail {
	trunkSides: number;
	trunkSamples: number;
	// 枝と折れた枝の跡の周の分割数（0 なら描かない）。
	branchSides: number;
	stubSides: number;
	// 葉カードの枚数と大きさ（塊の半径に対する比）。
	cards: number;
	cardSize: number;
}

// LOD1 / LOD2 は枚数を減らした分だけカードを大きくし、覆う量を保つ。LOD2 は葉に隠れる枝を描かない。
const lodDetails: PineDetail[] = [
	{ trunkSides: 7, trunkSamples: 2, branchSides: 4, stubSides: 5, cards: 154, cardSize: 2.1 },
	{ trunkSides: 5, trunkSamples: 1, branchSides: 3, stubSides: 4, cards: 80, cardSize: 2.7 },
	{ trunkSides: 4, trunkSamples: 1, branchSides: 0, stubSides: 0, cards: 46, cardSize: 3.3 },
];

function buildPineMesh( seed: number, height: number, detail: PineDetail ): { mesh: MeshData; trunk: { spine: Vec3[]; radii: number[] } } {

	const random = createRandom( seed );
	const trunk = createTrunk( random, height );
	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	addStylizedLimb( builder, trunk.spine, trunk.radii, detail.trunkSides, barkPartIndex, ( t ) => t * 0.1, detail.trunkSamples );
	addStubs( builder, random, height, trunk.spine, trunk.radii, detail.stubSides );
	const branches = createBranches( random, height, trunk.spine, trunk.radii );

	for ( const branch of detail.branchSides > 0 ? branches.slice( 0, - 1 ) : [] ) {

		const middle = lerpVec3( branch.base, branch.tip, 0.5 );
		middle[ 1 ] -= ( branch.tip[ 1 ] - branch.base[ 1 ] ) * 0.25;
		// 枝は葉にほぼ隠れるので、周の分割は少なく、曲線の分割なしで足りる。
		addStylizedLimb( builder, [ branch.base, middle, branch.tip ], [ branch.radius, branch.radius * 0.7, branch.radius * 0.35 ], detail.branchSides, barkPartIndex, ( t ) => 0.2 + t * 0.6, 1 );

	}

	const crownCenter: Vec3 = [ trunk.spine[ 5 ]![ 0 ], height * 0.72, trunk.spine[ 5 ]![ 2 ] ];
	const crownRadius = height * 0.3;
	builder.beginGroup( leafPartIndex );
	// 木全体のカード枚数を一定にし、塊の大きさ（半径の 2 乗）に応じて配分する。1 枚を大きくして覆う面積を保つ。
	const lobes = branches.flatMap( ( branch ) => branch.lobes );
	const totalWeight = lobes.reduce( ( sum, lobe ) => sum + lobe.radius * lobe.radius, 0 );
	// カードは塊の面に沿う向きに寄せて少し内側に置く。真横を向いたカードの角が塊の外へ飛び出すと板の集まりに見える。
	// 房の付け根（テクスチャの下）が枝のある塊の内側を向くよう、カードの上を外向きにする。
	for ( const lobe of lobes ) addFoliageLobeCards( builder, random, lobe, crownCenter, crownRadius, Math.round( detail.cards * lobe.radius * lobe.radius / totalWeight ), lobe.radius * detail.cardSize, { depth: [ 0.55, 0.95 ], jitter: 0.4, outwardUp: 0.5 } );

	return { mesh: builder.build(), trunk };

}

export function generatePineTreeData( options: PineTreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? DEFAULT_PINE_TREE_HEIGHT;
	const leafColor = options.leafColor ?? DEFAULT_PINE_TREE_LEAF_COLOR;
	const barkColor = options.barkColor ?? DEFAULT_PINE_TREE_BARK_COLOR;

	if ( ! Number.isFinite( height ) || height <= 0 ) {
		throw new RangeError( 'Pine tree height must be a positive finite number' );
	}

	// LOD0〜2 は同じ形（同じ乱数の並び）から、分割数と葉の枚数だけ変えて作る。高さ合わせの倍率は LOD0 に合わせて共通にする。
	const built = lodDetails.map( ( detail ) => buildPineMesh( seed, height, detail ) );
	const lod0 = built[ 0 ]!.mesh;
	const collider = buildCollider( built[ 0 ]!.trunk.spine, built[ 0 ]!.trunk.radii );
	// 葉カードの角が樹高を超えるので、全体を一様に縮めて上端を height に合わせる。
	const fit = height / getMeshTop( lod0 );
	for ( const { mesh } of built ) scaleMeshPositions( mesh.positions, fit );
	scaleMeshPositions( collider.positions, fit );

	const bark = createStylizedBarkTextures( seed );
	const leaf = createNeedleSprayTextures( seed, needleTextureSize );
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
			roughness: 0.85,
			alphaTest: 0.5,
			// 裏向きの三角形を足し、外向きの法線のまま両面を描く。
			upNormalCards: true,
			doubleSided: false,
			flatShading: false,
		},
		...createStylizedImpostorParts(),
	];
	// LOD3 / LOD4 はモミと同じインポスター。水平板は樹冠の中ほどの高さに置く。
	const lods: MeshData[] = [ lod0, built[ 1 ]!.mesh, built[ 2 ]!.mesh, ...buildStylizedImpostorLods( lod0, height, height * 0.65 ) ];

	return {
		kind: 'pine-tree',
		parts,
		lods,
		collider,
		textures: {
			bark: bark.color,
			barkNormal: bark.normal,
			leaf: leaf.color,
			leafNormal: leaf.normal,
		},
		bounds: { radius: getMeshBoundsRadius( lod0 ), height },
	};

}

export function normalizePineTreeGenerationOptions(
	options: PineTreeOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<PineTreeOptions> {

	const leafColor = colors.leaf ?? options.leafColor ?? DEFAULT_PINE_TREE_LEAF_COLOR;
	const barkColor = colors.bark ?? options.barkColor ?? DEFAULT_PINE_TREE_BARK_COLOR;
	return {
		options: {
			seed: options.seed,
			height: options.height ?? DEFAULT_PINE_TREE_HEIGHT,
			leafColor,
			barkColor,
		},
		colors: { leaf: leafColor, bark: barkColor },
	};

}
