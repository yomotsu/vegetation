import { MeshBuilder } from '../meshBuilder';
import { createRandom } from '../random';
import type { Random } from '../random';
import type { MeshData, PartDef, Vec3, VegetationData } from '../types';
import type { NormalizedVegetationGeneration } from '../vegetationGeneration';
import { createLeafSprayTextures, createStylizedBarkTextures, LEAF_SPRAY_TEXTURE_SIZE } from './stylizedTextures';
import { addFoliageLobeCards, addStylizedLimb, buildStylizedImpostorLods, createStylizedImpostorParts, getMeshBoundsRadius, getMeshTop } from './stylized';
import type { FoliageLobe } from './stylized';

export interface BushOptions {
	seed?: number;
	height?: number;
	leafColor?: number;
	barkColor?: number;
}

export const DEFAULT_BUSH_HEIGHT = 1.3;
export const DEFAULT_BUSH_LEAF_COLOR = 0x55a02e;
export const DEFAULT_BUSH_BARK_COLOR = 0x6e5a40;

const barkPartIndex = 0;
const leafPartIndex = 1;

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

// 平たいドームを中央に 1 個、その周りに低いドームを 2〜3 個。どれも地面に接する。
function createBushLobes( random: Random, height: number ): FoliageLobe[] {

	const mainRadius = height * random.range( 0.52, 0.58 );
	const lobes: FoliageLobe[] = [ {
		center: [ random.range( - 0.04, 0.04 ) * height, height * 0.5, random.range( - 0.04, 0.04 ) * height ],
		radius: mainRadius,
		scale: [ 1.3, 0.82, 1.3 ],
	} ];
	const sideCount = random.int( 2, 3 );
	const startAngle = random.range( 0, Math.PI * 2 );

	for ( let index = 0; index < sideCount; index ++ ) {

		const angle = startAngle + index / sideCount * Math.PI * 2 + random.range( - 0.4, 0.4 );
		const radius = height * random.range( 0.36, 0.42 );
		// 中央のドームに寄せて重ね、全体を丸くまとめる。
		const distance = height * random.range( 0.42, 0.52 );
		lobes.push( {
			center: [ Math.cos( angle ) * distance, radius * 0.72, Math.sin( angle ) * distance ],
			radius,
			scale: [ 1.15, 0.8, 1.15 ],
		} );

	}

	return lobes;

}

function addStems( builder: MeshBuilder, random: Random, height: number, lobes: readonly FoliageLobe[], detail: BushDetail ): void {

	const stemCount = random.int( 5, 7 );

	for ( let index = 0; index < stemCount; index ++ ) {

		const lobe = lobes[ index % lobes.length ]!;
		const base: Vec3 = [ random.range( - 0.06, 0.06 ) * height, - height * 0.03, random.range( - 0.06, 0.06 ) * height ];
		const angle = random.range( 0, Math.PI * 2 );
		const reach = lobe.radius * random.range( 0.1, 0.4 );
		const tip: Vec3 = [
			lobe.center[ 0 ] + Math.cos( angle ) * reach,
			lobe.center[ 1 ] + lobe.radius * random.range( 0, 0.3 ),
			lobe.center[ 2 ] + Math.sin( angle ) * reach,
		];
		// 根元から外へ開いてから立ち上がる。
		const points: Vec3[] = [
			base,
			[ base[ 0 ] + ( tip[ 0 ] - base[ 0 ] ) * 0.45, tip[ 1 ] * 0.3, base[ 2 ] + ( tip[ 2 ] - base[ 2 ] ) * 0.45 ],
			tip,
		];
		const radius = height * random.range( 0.016, 0.022 );
		// 茎はほぼ葉に隠れるので、周 4 分割・区間 2 分割で足りる。LOD2 では描かない（乱数は同じだけ使う）。
		if ( detail.stemSides > 0 ) addStylizedLimb( builder, points, [ radius, radius * 0.7, radius * 0.3 ], detail.stemSides, barkPartIndex, ( t ) => t * 0.6, detail.stemSamples );

	}

}

interface BushDetail {
	// 茎の周と点の間の分割数（0 なら茎を描かない）。
	stemSides: number;
	stemSamples: number;
	// 内側の房 4 つのカードと表面の房 1 つのカードの枚数・大きさ（ドーム半径に対する比）。
	innerCards: number;
	innerSize: number;
	outerCards: number;
	outerSize: number;
}

// LOD1 / LOD2 は枚数を減らした分だけカードを大きくし、覆う量を保つ。LOD2 は大きなカードだけで茎もない。
const lodDetails: BushDetail[] = [
	{ stemSides: 4, stemSamples: 2, innerCards: 30, innerSize: 1.7, outerCards: 46, outerSize: 0.95 },
	{ stemSides: 3, stemSamples: 1, innerCards: 22, innerSize: 1.95, outerCards: 20, outerSize: 1.25 },
	{ stemSides: 0, stemSamples: 1, innerCards: 18, innerSize: 2.3, outerCards: 0, outerSize: 0 },
];

function buildBushMesh( seed: number, height: number, detail: BushDetail ): MeshData {

	const random = createRandom( seed );
	const lobes = createBushLobes( random, height );
	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	addStems( builder, random, height, lobes, detail );
	const crownCenter: Vec3 = [ 0, height * 0.45, 0 ];
	const crownRadius = height * 0.8;
	builder.beginGroup( leafPartIndex );

	// 木全体のカード枚数を一定にし、ドームの大きさ（半径の 2 乗）に応じて配分する。
	// 内側は房 4 つの大きなカードで少ない枚数で埋め、表面は房 1 つの小さなカードにして輪郭で板が目立たないようにする。
	// カードの向きはドームの面に沿うよう外向きに寄せ、表面のカードは少し内側に置く。角が外へ飛び出すと板の集まりに見えた。
	const totalWeight = lobes.reduce( ( sum, lobe ) => sum + lobe.radius * lobe.radius, 0 );

	for ( const lobe of lobes ) {

		const share = lobe.radius * lobe.radius / totalWeight;
		addFoliageLobeCards( builder, random, lobe, crownCenter, crownRadius, Math.round( detail.innerCards * share ), lobe.radius * detail.innerSize, { depth: [ 0.3, 0.7 ], jitter: 0.35 } );
		if ( detail.outerCards > 0 ) addFoliageLobeCards( builder, random, lobe, crownCenter, crownRadius, Math.round( detail.outerCards * share ), lobe.radius * detail.outerSize, { depth: [ 0.8, 1 ], quadrant: true, jitter: 0.4 } );

	}

	return builder.build();

}

export function generateBushData( options: BushOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? DEFAULT_BUSH_HEIGHT;
	const leafColor = options.leafColor ?? DEFAULT_BUSH_LEAF_COLOR;
	const barkColor = options.barkColor ?? DEFAULT_BUSH_BARK_COLOR;

	if ( ! Number.isFinite( height ) || height <= 0 ) {
		throw new RangeError( 'Bush height must be a positive finite number' );
	}

	// LOD0〜2 は同じ形（同じ乱数の並び）から、分割数と葉の枚数だけ変えて作る。高さ合わせの倍率は LOD0 に合わせて共通にする。
	const meshes = lodDetails.map( ( detail ) => buildBushMesh( seed, height, detail ) );
	const lod0 = meshes[ 0 ]!;
	const fit = height / getMeshTop( lod0 );

	for ( const mesh of meshes ) {

		// 地面に近いほど暗くする（地面との接地感）。葉カードの角が高さを超えるので上端を height に合わせる。
		for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {

			for ( let axis = 0; axis < 3; axis ++ ) mesh.positions[ vertex * 3 + axis ]! *= fit;
			const shade = 0.6 + 0.4 * clamp( mesh.positions[ vertex * 3 + 1 ]! / ( height * 0.45 ), 0, 1 );
			for ( let channel = 0; channel < 3; channel ++ ) mesh.colors[ vertex * 3 + channel ]! *= shade;

		}

	}

	const bark = createStylizedBarkTextures( seed );
	const leaf = createLeafSprayTextures( seed, LEAF_SPRAY_TEXTURE_SIZE, 4 );
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
	// LOD3 / LOD4 はモミと同じインポスター。水平板はドームの中ほどの高さに置く。
	const lods: MeshData[] = [ lod0, meshes[ 1 ]!, meshes[ 2 ]!, ...buildStylizedImpostorLods( lod0, height, height * 0.45 ) ];

	return {
		kind: 'bush',
		parts,
		lods,
		collider: null,
		textures: {
			bark: bark.color,
			barkNormal: bark.normal,
			leaf: leaf.color,
			leafNormal: leaf.normal,
		},
		bounds: { radius: getMeshBoundsRadius( lod0 ), height },
	};

}

export function normalizeBushGenerationOptions(
	options: BushOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<BushOptions> {

	const leafColor = colors.leaf ?? options.leafColor ?? DEFAULT_BUSH_LEAF_COLOR;
	const barkColor = colors.bark ?? options.barkColor ?? DEFAULT_BUSH_BARK_COLOR;
	return {
		options: {
			seed: options.seed,
			height: options.height ?? DEFAULT_BUSH_HEIGHT,
			leafColor,
			barkColor,
		},
		colors: { leaf: leafColor, bark: barkColor },
	};

}
