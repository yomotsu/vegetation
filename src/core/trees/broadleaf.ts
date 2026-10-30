import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import type { Random } from '../random';
import type { Color3, ColliderData, MeshData, PartDef, Vec3, VegetationData } from '../types';
import type { NormalizedVegetationGeneration } from '../vegetationGeneration';
import { createBroadleafLeafTextures, createStylizedBarkTextures } from './broadleafTextures';
import { addStylizedLimb, addVec3, cloneMeshData, createRootFlaredTrunkSpine, crossVec3, getMeshBoundsRadius, getStylizedRootDepth, normalizeVec3, scaleVec3, subtractVec3 } from './stylized';

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

interface Lobe {
	center: Vec3;
	radius: number;
}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function randomUnitVector( random: Random ): Vec3 {

	const y = random.range( - 1, 1 );
	const angle = random.range( 0, Math.PI * 2 );
	const ring = Math.sqrt( 1 - y * y );
	return [ ring * Math.cos( angle ), y, ring * Math.sin( angle ) ];

}

// 樹冠は数個の球（ローブ）の集まり。頂上に 1 個、残りはその周りに少し低く並べる。
function createLobes( random: Random, height: number, crownCenter: Vec3, splitY: number ): Lobe[] {

	const lobes: Lobe[] = [];
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

function addLimbToLobe( builder: MeshBuilder, random: Random, base: Vec3, baseRadius: number, lobe: Lobe, height: number ): void {

	// 付け根から外へ出てから上へ曲がり、ローブの中心手前で終わる。
	const target = addVec3( lobe.center, [ random.range( - 0.2, 0.2 ) * lobe.radius, - lobe.radius * 0.15, random.range( - 0.2, 0.2 ) * lobe.radius ] );
	const offset = subtractVec3( target, base );
	const horizontal: Vec3 = [ offset[ 0 ], 0, offset[ 2 ] ];
	const points: Vec3[] = [
		base,
		addVec3( base, addVec3( scaleVec3( horizontal, 0.45 ), [ 0, offset[ 1 ] * 0.3, 0 ] ) ),
		addVec3( base, addVec3( scaleVec3( horizontal, 0.85 ), [ 0, offset[ 1 ] * 0.7, 0 ] ) ),
		target,
	];
	const radii = [ baseRadius, baseRadius * 0.75, baseRadius * 0.5, height * 0.008 ];
	addStylizedLimb( builder, points, radii, 6, barkPartIndex, ( t ) => 0.15 + t * 0.5 );

}

function addLeafCards( builder: MeshBuilder, random: Random, lobe: Lobe, crownCenter: Vec3, crownRadius: number, height: number ): void {

	const relativeSize = lobe.radius / ( height * 0.22 );
	const count = Math.round( 64 * relativeSize * relativeSize );
	const cardSize = lobe.radius * 1.05;
	const goldenAngle = Math.PI * ( 3 - Math.sqrt( 5 ) );

	for ( let index = 0; index < count; index ++ ) {

		// 表面寄りに多く、内側にも少し置いて透けを防ぐ。
		const y = 1 - 2 * ( index + 0.5 ) / count;
		const ring = Math.sqrt( Math.max( 0, 1 - y * y ) );
		const angle = index * goldenAngle + random.range( - 0.3, 0.3 );
		const direction = normalizeVec3( [ ring * Math.cos( angle ) + random.range( - 0.15, 0.15 ), y * 0.85 + random.range( - 0.15, 0.15 ), ring * Math.sin( angle ) + random.range( - 0.15, 0.15 ) ] );
		const depth = 1 - 0.5 * random.next() * random.next();
		const center = addVec3( lobe.center, scaleVec3( direction, lobe.radius * depth * 0.78 ) );
		// 外向き寄りのランダムな向き。真横を向いたカードが輪郭から線として飛び出さないようにする。
		const cardNormal = normalizeVec3( addVec3( direction, scaleVec3( randomUnitVector( random ), 0.9 ) ) );
		const reference: Vec3 = Math.abs( cardNormal[ 1 ] ) > 0.9 ? [ 1, 0, 0 ] : [ 0, 1, 0 ];
		const right = scaleVec3( normalizeVec3( crossVec3( reference, cardNormal ) ), cardSize * 0.5 );
		const up = scaleVec3( normalizeVec3( crossVec3( cardNormal, right ) ), cardSize * 0.5 );
		const corners: Vec3[] = [
			subtractVec3( subtractVec3( center, right ), up ),
			subtractVec3( addVec3( center, right ), up ),
			addVec3( addVec3( center, right ), up ),
			addVec3( subtractVec3( center, right ), up ),
		];
		const uvs: [ number, number ][] = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ];
		const indices = corners.map( ( corner, cornerIndex ) => {

			// 法線はカードの向きではなく、ローブと樹冠の中心から外向き（塊として陰影を付ける）。
			const fromLobe = scaleVec3( subtractVec3( corner, lobe.center ), 1 / lobe.radius );
			const fromCrown = scaleVec3( subtractVec3( corner, crownCenter ), 1 / crownRadius );
			const normal = normalizeVec3( addVec3( addVec3( fromLobe, scaleVec3( fromCrown, 0.5 ) ), [ 0, 0.15, 0 ] ) );
			const outside = clamp( Math.hypot( ...fromLobe ), 0, 1 );
			const brightness = clamp( 0.55 + 0.45 * outside, 0.5, 1 );
			const color: Color3 = [ brightness, brightness, brightness ];
			const wind = clamp( Math.hypot( corner[ 0 ], corner[ 2 ] ) / crownRadius, 0.2, 1 );
			return builder.addVertex( corner, normal, uvs[ cornerIndex ]!, color, wind );

		} );
		builder.addTriangle( indices[ 0 ]!, indices[ 1 ]!, indices[ 2 ]! );
		builder.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 3 ]! );

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
	addStylizedLimb( builder, trunk.spine, trunk.radii, 8, barkPartIndex, ( t ) => t * 0.08 );
	const trunkTop = trunk.spine[ trunk.spine.length - 1 ]!;
	const crownCenter: Vec3 = [ trunkTop[ 0 ] * 1.3, height * 0.68, trunkTop[ 2 ] * 1.3 ];
	const crownRadius = height * 0.42;
	const lobes = createLobes( random, height, crownCenter, splitY );
	const limbBase = addVec3( trunkTop, [ 0, - trunkRadius * 0.6, 0 ] );
	const limbRadius = trunk.radii[ trunk.radii.length - 1 ]! * 0.72;

	for ( const lobe of lobes ) addLimbToLobe( builder, random, limbBase, limbRadius, lobe, height );

	builder.beginGroup( leafPartIndex );
	for ( const lobe of lobes ) addLeafCards( builder, random, lobe, crownCenter, crownRadius, height );

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
	const leaf = createBroadleafLeafTextures( seed );
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
