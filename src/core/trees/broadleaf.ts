import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import type { Random } from '../random';
import type { ColliderData, MeshData, PartDef, Vec3, VegetationData } from '../types';
import type { NormalizedVegetationGeneration } from '../vegetationGeneration';
import { createLeafSprayTextures, createStylizedBarkTextures, LEAF_SPRAY_TEXTURE_SIZE } from './stylizedTextures';
import { addFoliageLobeCards, addStylizedLimb, addVec3, cloneMeshData, createRootFlaredTrunkSpine, getMeshBoundsRadius, getStylizedRootDepth, normalizeVec3, scaleVec3, subtractVec3 } from './stylized';
import type { FoliageLobe } from './stylized';

export interface BroadleafTreeOptions {
	seed?: number;
	height?: number;
	leafColor?: number;
	barkColor?: number;
}

export const DEFAULT_BROADLEAF_TREE_HEIGHT = 6;
export const DEFAULT_BROADLEAF_TREE_LEAF_COLOR = 0x4f9a2a;
export const DEFAULT_BROADLEAF_TREE_BARK_COLOR = 0x8a7350;

const barkPartIndex = 0;
const leafPartIndex = 1;
const innerCardCount = 50;
const outerCardCount = 56;

// 樹冠は数個の球（ローブ）の集まり。頂上に 1 個、残りはその周りに少し低く並べる。
function createLobes( random: Random, height: number, crownCenter: Vec3, splitY: number ): FoliageLobe[] {

	const lobes: FoliageLobe[] = [];
	const topRadius = height * random.range( 0.22, 0.25 );
	lobes.push( { center: [ crownCenter[ 0 ] + random.range( - 0.04, 0.04 ) * height, height - topRadius * 0.92, crownCenter[ 2 ] + random.range( - 0.04, 0.04 ) * height ], radius: topRadius } );
	const sideCount = random.int( 2, 4 );
	const startAngle = random.range( 0, Math.PI * 2 );

	for ( let index = 0; index < sideCount; index ++ ) {

		const angle = startAngle + index / sideCount * Math.PI * 2 + random.range( - 0.35, 0.35 );
		const radius = height * random.range( 0.17, 0.21 );
		const distance = height * random.range( 0.2, 0.25 );
		const y = Math.max( splitY + radius * 0.75, crownCenter[ 1 ] - height * random.range( 0.02, 0.09 ) );
		lobes.push( { center: [ crownCenter[ 0 ] + Math.cos( angle ) * distance, y, crownCenter[ 2 ] + Math.sin( angle ) * distance ], radius } );

	}

	return lobes;

}

// 付け根から外へ出てから上へ曲がり、ローブの中心手前で終わる曲線（付け根は含まない）。
function limbCurveToLobe( random: Random, base: Vec3, lobe: FoliageLobe ): Vec3[] {

	const target = addVec3( lobe.center, [ random.range( - 0.2, 0.2 ) * lobe.radius, - lobe.radius * 0.15, random.range( - 0.2, 0.2 ) * lobe.radius ] );
	const offset = subtractVec3( target, base );
	const horizontal: Vec3 = [ offset[ 0 ], 0, offset[ 2 ] ];
	return [
		addVec3( base, addVec3( scaleVec3( horizontal, 0.45 ), [ 0, offset[ 1 ] * 0.3, 0 ] ) ),
		addVec3( base, addVec3( scaleVec3( horizontal, 0.85 ), [ 0, offset[ 1 ] * 0.7, 0 ] ) ),
		target,
	];

}

/**
 * 幹と枝。頂上のローブへの枝は幹からそのまま続く 1 本の管にする。
 * ほかの枝は分かれ目の少し下で幹の中から細めに生やし、幹に沿って少し立ち上がってから外へ出す。
 * 幹の外へ自然に分かれて見え、管同士の重なりは付け根の短い区間だけになる。
 */
function addTrunkAndLimbs( builder: MeshBuilder, random: Random, trunk: { spine: Vec3[]; radii: number[] }, lobes: readonly FoliageLobe[], height: number ): void {

	const top = trunk.spine[ trunk.spine.length - 1 ]!;
	const lower = trunk.spine[ trunk.spine.length - 2 ]!;
	const topRadius = trunk.radii[ trunk.radii.length - 1 ]!;
	const trunkUp = normalizeVec3( subtractVec3( top, lower ) );
	const tipRadius = height * 0.008;
	const leader = limbCurveToLobe( random, top, lobes[ 0 ]! );
	addStylizedLimb( builder, [ ...trunk.spine, ...leader ], [ ...trunk.radii, topRadius * 0.8, topRadius * 0.55, tipRadius ], 7, barkPartIndex, ( t ) => t * 0.5, 2 );

	for ( const lobe of lobes.slice( 1 ) ) {

		const outward = normalizeVec3( [ lobe.center[ 0 ] - top[ 0 ], 0, lobe.center[ 2 ] - top[ 2 ] ] );
		const base = addVec3( lower, scaleVec3( subtractVec3( top, lower ), random.range( 0.6, 0.75 ) ) );
		const emerge = addVec3( addVec3( top, scaleVec3( trunkUp, topRadius * 0.9 ) ), scaleVec3( outward, topRadius * 0.7 ) );
		const radius = topRadius * random.range( 0.6, 0.7 );
		const curve = limbCurveToLobe( random, emerge, lobe );
		// 外へ出た後の曲がりは 1 点で足りる（頂点数の節約）。
		addStylizedLimb( builder, [ base, emerge, curve[ 1 ]!, curve[ 2 ]! ], [ radius, radius * 0.95, radius * 0.55, tipRadius ], 5, barkPartIndex, ( t ) => 0.15 + t * 0.5, 2 );

	}

}

function buildCollider( spine: readonly Vec3[], radii: readonly number[] ): ColliderData {

	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	addTube( builder, [ spine[ 0 ]!, spine[ 1 ]!, spine[ spine.length - 1 ]! ], [ radii[ 0 ]!, radii[ 1 ]!, radii[ radii.length - 1 ]! ], 8, {
		color: [ 1, 1, 1 ],
		wind: () => 0,
		capEnd: false,
	} );
	const mesh = builder.build();
	return { positions: mesh.positions, indices: mesh.indices };

}

export function generateBroadleafTreeData( options: BroadleafTreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? DEFAULT_BROADLEAF_TREE_HEIGHT;
	const leafColor = options.leafColor ?? DEFAULT_BROADLEAF_TREE_LEAF_COLOR;
	const barkColor = options.barkColor ?? DEFAULT_BROADLEAF_TREE_BARK_COLOR;

	if ( ! Number.isFinite( height ) || height <= 0 ) {
		throw new RangeError( 'Tree height must be a positive finite number' );
	}

	const random = createRandom( seed );
	const splitY = height * random.range( 0.36, 0.44 );
	const lean: Vec3 = [ random.range( - 0.03, 0.03 ) * height, 0, random.range( - 0.03, 0.03 ) * height ];
	const trunkRadius = height * 0.05;
	const trunk = createRootFlaredTrunkSpine( height, getStylizedRootDepth( height ), trunkRadius, splitY, lean );
	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	const trunkTop = trunk.spine[ trunk.spine.length - 1 ]!;
	const crownCenter: Vec3 = [ trunkTop[ 0 ] * 1.3, height * 0.68, trunkTop[ 2 ] * 1.3 ];
	const crownRadius = height * 0.42;
	const lobes = createLobes( random, height, crownCenter, splitY );
	addTrunkAndLimbs( builder, random, trunk, lobes, height );

	builder.beginGroup( leafPartIndex );
	// 木全体のカード枚数を一定にし、ローブの大きさ（半径の 2 乗）に応じて配分する。
	// 内側は房 4 つの大きなカードで少ない枚数で埋め、表面は房 1 つの小さなカードにして輪郭で板が目立たないようにする。
	const totalWeight = lobes.reduce( ( sum, lobe ) => sum + lobe.radius * lobe.radius, 0 );

	for ( const lobe of lobes ) {

		const share = lobe.radius * lobe.radius / totalWeight;
		addFoliageLobeCards( builder, random, lobe, crownCenter, crownRadius, Math.round( innerCardCount * share ), lobe.radius * 2.3, { depth: [ 0.35, 0.8 ] } );
		addFoliageLobeCards( builder, random, lobe, crownCenter, crownRadius, Math.round( outerCardCount * share ), lobe.radius * 1.15, { depth: [ 0.9, 1.1 ], quadrant: true } );

	}

	const lod0 = builder.build();
	const collider = buildCollider( trunk.spine, trunk.radii );
	// 葉カードの角が樹高を超えるので、全体を一様に縮めて上端を height に合わせる。
	let top = 0;
	for ( let index = 1; index < lod0.positions.length; index += 3 ) top = Math.max( top, lod0.positions[ index ]! );
	const fit = height / top;
	for ( let index = 0; index < lod0.positions.length; index ++ ) lod0.positions[ index ]! *= fit;
	for ( let index = 0; index < collider.positions.length; index ++ ) collider.positions[ index ]! *= fit;
	const bounds = { radius: getMeshBoundsRadius( lod0 ), height };
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
	];
	// LOD0 の形が決まるまで、LOD1〜4 は LOD0 の複製にしておく。
	const lods: MeshData[] = [ lod0, cloneMeshData( lod0 ), cloneMeshData( lod0 ), cloneMeshData( lod0 ), cloneMeshData( lod0 ) ];

	return {
		kind: 'broadleaf-tree',
		parts,
		lods,
		collider,
		textures: {
			bark: bark.color,
			barkNormal: bark.normal,
			leaf: leaf.color,
			leafNormal: leaf.normal,
		},
		bounds,
	};

}

export function normalizeBroadleafTreeGenerationOptions(
	options: BroadleafTreeOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<BroadleafTreeOptions> {

	const leafColor = colors.leaf ?? options.leafColor ?? DEFAULT_BROADLEAF_TREE_LEAF_COLOR;
	const barkColor = colors.bark ?? options.barkColor ?? DEFAULT_BROADLEAF_TREE_BARK_COLOR;
	return {
		options: {
			seed: options.seed,
			height: options.height ?? DEFAULT_BROADLEAF_TREE_HEIGHT,
			leafColor,
			barkColor,
		},
		colors: { leaf: leafColor, bark: barkColor },
	};

}
