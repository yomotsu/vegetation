import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import type { Random } from '../random';
import type { Color3, ColliderData, MeshData, PartDef, Vec3, VegetationData } from '../types';
import type { NormalizedVegetationGeneration } from '../vegetationGeneration';
import { createStylizedBarkTextures, createWillowCanopyTextures } from './stylizedTextures';
import { addStylizedLimb, addVec3, cloneMeshData, getMeshBoundsRadius, getStylizedRootDepth, normalizeVec3, scaleVec3, subtractVec3 } from './stylized';

export interface WillowTreeOptions {
	seed?: number;
	height?: number;
	leafColor?: number;
	barkColor?: number;
}

export const DEFAULT_WILLOW_TREE_HEIGHT = 7;
export const DEFAULT_WILLOW_TREE_LEAF_COLOR = 0x6cad3a;
export const DEFAULT_WILLOW_TREE_BARK_COLOR = 0x6f6a45;

const barkPartIndex = 0;
const leafPartIndex = 1;
// 木全体の頂点数の上限。葉の殻（釣り鐘形）は周 bellSegments 分割 × bellRows 行。
const maxVertexCount = 900;
const bellSegments = 8;
const bellRows = 5;
const bellVertexCount = ( bellSegments + 1 ) * bellRows - 1;

interface Branch {
	points: Vec3[];
	radii: number[];
	// 主枝か小枝か（葉の殻の大きさと置く順に使う）。
	main: boolean;
	// 管の周の分割数と、点の間の分割数。
	sides: number;
	samples: number;
}

function lerpVec3( a: Vec3, b: Vec3, t: number ): Vec3 {

	return [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];

}

// 太さをあまり変えずに分かれ目まで立ち上がる幹。根元は広がり、傾きながら大きく曲がる。
function createWillowTrunk( random: Random, height: number, radius: number, splitY: number ): { spine: Vec3[]; radii: number[] } {

	const rootDepth = getStylizedRootDepth( height );
	const split = splitY / height;
	const fractions = [ - rootDepth / height, 0, split * 0.15, split * 0.6, split ];
	const scales = [ 1.6, 1.6, 1.15, 1, 0.92 ];
	const leanAngle = random.range( 0, Math.PI * 2 );
	const lean = height * random.range( 0.05, 0.12 );
	// 傾きと直交する向きにも曲げ、くの字〜S 字にする。上端で戻り切らないようにする。
	const bendAngle = leanAngle + Math.PI / 2 * ( random.next() < 0.5 ? - 1 : 1 );
	const bend = height * random.range( 0.06, 0.1 );
	const spine: Vec3[] = [];
	const radii: number[] = [];

	for ( let index = 0; index < fractions.length; index ++ ) {

		const f = Math.max( 0, fractions[ index ]! ) / split;
		const sway = Math.sin( f * Math.PI * 0.75 ) * bend;
		spine.push( [
			Math.cos( leanAngle ) * lean * f * f + Math.cos( bendAngle ) * sway,
			fractions[ index ]! * height,
			Math.sin( leanAngle ) * lean * f * f + Math.sin( bendAngle ) * sway,
		] );
		radii.push( radius * scales[ index ]! );

	}

	return { spine, radii };

}

/**
 * 斜め上へ伸びてから外へ倒れ、先が下を向く弓なりの枝。向きを少しずつ揺らしてくねらせる。
 * elevation は鉛直からの角度。終わりには elevation + arch まで倒れる。
 */
function growArch( random: Random, start: Vec3, azimuth: number, elevation: number, arch: number, length: number, steps: number ): Vec3[] {

	const points: Vec3[] = [ start ];
	let position = start;
	let heading = azimuth;

	for ( let step = 1; step <= steps; step ++ ) {

		const s = step / steps;
		const angle = elevation + arch * Math.pow( s, 2 );
		heading += random.range( - 0.18, 0.18 );
		const direction: Vec3 = [ Math.sin( angle ) * Math.cos( heading ), Math.cos( angle ), Math.sin( angle ) * Math.sin( heading ) ];
		position = addVec3( position, scaleVec3( direction, length / steps * random.range( 0.85, 1.15 ) ) );
		points.push( position );

	}

	return points;

}

/**
 * 主枝 3〜4 本と、主枝ごとに小枝 1〜2 本。主枝の向きはばらばらにせず、幹の傾きの向きとその反対側の 2 方向にまとめる。
 * 最初の主枝は幹からそのまま続く 1 本の管にする。残りの主枝は分かれ目の少し下で幹の中から細めに生やし、
 * 幹に沿って立ち上がってから外へ曲げる。幹の外へ自然に分かれて見え、管同士が大きく重ならない。
 */
function createBranches( random: Random, height: number, trunk: { spine: Vec3[]; radii: number[] } ): Branch[] {

	const branches: Branch[] = [];
	const limbCount = random.int( 3, 4 );
	const top = trunk.spine[ trunk.spine.length - 1 ]!;
	const lower = trunk.spine[ trunk.spine.length - 2 ]!;
	const topRadius = trunk.radii[ trunk.radii.length - 1 ]!;
	const trunkUp = normalizeVec3( subtractVec3( top, lower ) );
	const root = trunk.spine[ 1 ]!;
	const leanAngle = Math.atan2( top[ 2 ] - root[ 2 ], top[ 0 ] - root[ 0 ] );
	const directions = [ leanAngle, leanAngle + Math.PI + random.range( - 0.5, 0.5 ) ];

	for ( let limb = 0; limb < limbCount; limb ++ ) {

		// 偶数番目は傾きの向き（最初は幹の続き）、奇数番目は反対側。同じ向きの 2 本目は少しずらす。
		const azimuth = directions[ limb % 2 ]! + ( limb < 2 ? random.range( - 0.15, 0.15 ) : random.range( 0.35, 0.6 ) * ( random.next() < 0.5 ? - 1 : 1 ) );
		const outward: Vec3 = [ Math.cos( azimuth ), 0, Math.sin( azimuth ) ];
		const length = height * random.range( 0.42, 0.62 );
		let points: Vec3[];
		let radii: number[];

		if ( limb === 0 ) {

			// 幹の続き。幹の上端から横へ倒れていく。
			const arch = growArch( random, top, azimuth, random.range( 0.35, 0.7 ), random.range( 0.9, 1.3 ), length, 3 );
			points = [ ...trunk.spine, ...arch.slice( 1 ) ];
			radii = [ ...trunk.radii, ...arch.slice( 1 ).map( ( _, index ) => topRadius * 0.85 * ( 1 - 0.85 * Math.pow( ( index + 1 ) / ( arch.length - 1 ), 0.7 ) ) ) ];

		} else {

			// 分かれ目の少し下、幹の軸から生やす。幹の向きに沿って半径分ほど立ち上がり、外へ出る。
			const base = lerpVec3( lower, top, random.range( 0.55, 0.75 ) );
			const radius = topRadius * random.range( 0.62, 0.72 );
			const emerge = addVec3( addVec3( top, scaleVec3( trunkUp, topRadius * 0.6 ) ), scaleVec3( outward, topRadius * 0.9 ) );
			const arch = growArch( random, emerge, azimuth, random.range( 0.5, 1.05 ), random.range( 0.8, 1.3 ), length, 3 );
			points = [ base, ...arch ];
			radii = points.map( ( _, index ) => index === 0 ? radius : radius * ( 1 - 0.85 * Math.pow( ( index - 1 ) / ( points.length - 2 ), 0.7 ) ) );

		}

		// 幹の続きの枝は太いので周の分割を多めにする。
		branches.push( { points, radii, main: true, sides: limb === 0 ? 7 : 5, samples: 2 } );

		// 主枝の途中から出る小枝。主枝より立ってから外へ倒れる。
		const twigCount = random.int( 1, 2 );
		const firstArch = points.length - 3;

		for ( let twig = 0; twig < twigCount; twig ++ ) {

			const index = firstArch + Math.floor( random.range( 0, 2 ) );
			const origin = points[ index ]!;
			const side = ( twig % 2 === 0 ? 1 : - 1 ) * random.range( 0.6, 1.3 );
			const twigPoints = growArch( random, origin, azimuth + side, random.range( 0.2, 0.6 ), random.range( 1.3, 1.9 ), height * random.range( 0.2, 0.32 ), 3 );
			const baseRadius = radii[ index ]! * 0.55;
			branches.push( {
				points: twigPoints,
				radii: twigPoints.map( ( _, point ) => baseRadius * ( 1 - 0.75 * point / ( twigPoints.length - 1 ) ) ),
				main: false,
				sides: 4,
				samples: 1,
			} );

		}

	}

	return branches;

}

/**
 * 釣り鐘形の葉の殻。頂上は少し平たい半球、そこから下は少し裾の広がる筒で、底は開いている。
 * 垂れ枝の画像を周りに巻き（周に repeats 回）、頂上から裾へ貼る。法線は殻の中心と樹冠の中心から外向き（球から転写した形）。
 */
function addCanopyBell( builder: MeshBuilder, random: Random, center: Vec3, radius: number, sideHeight: number, crownCenter: Vec3, crownRadius: number ): void {

	const domeHeight = radius * 0.8;
	// 行: 頂点、半球の途中、赤道、筒の途中、裾。
	const profile: [ number, number ][] = [
		[ 0, domeHeight ],
		[ Math.sin( Math.PI / 4 ) * radius, Math.cos( Math.PI / 4 ) * domeHeight ],
		[ radius, 0 ],
		[ radius * 1.06, - sideHeight * 0.5 ],
		[ radius * 1.14, - sideHeight ],
	];
	const along = [ 0 ];
	for ( let row = 1; row < bellRows; row ++ ) along.push( along[ row - 1 ]! + Math.hypot( profile[ row ]![ 0 ] - profile[ row - 1 ]![ 0 ], profile[ row ]![ 1 ] - profile[ row - 1 ]![ 1 ] ) );
	const meridian = along[ bellRows - 1 ]!;
	// 葉の縦横比がそろうよう、周の長さと頂上から裾までの長さの比で巻く回数を決める。
	const repeats = Math.max( 2, Math.round( 1.3 * Math.PI * 2 * radius / meridian ) );
	const startAngle = random.range( 0, Math.PI * 2 );
	// 列ごとに半径を少し揺らして、まん丸に見えないようにする。
	const wobble: number[] = [];
	for ( let column = 0; column < bellSegments; column ++ ) wobble.push( random.range( 0.92, 1.08 ) );
	const rows: number[][] = [];

	for ( let row = 0; row < bellRows; row ++ ) {

		const [ ringRadius, y ] = profile[ row ]!;
		const indices: number[] = [];
		// 下ほど暗くする（殻の内側と裾の陰）。
		const shade = 0.62 + 0.38 * ( 1 - along[ row ]! / meridian );
		const color: Color3 = [ shade, shade, shade ];

		// 頂点の行は扇の要なので、継ぎ目の重複列は要らない。
		for ( let column = 0; column <= ( row === 0 ? bellSegments - 1 : bellSegments ); column ++ ) {

			const angle = startAngle + column / bellSegments * Math.PI * 2;
			const scale = row === 0 ? 1 : wobble[ column % bellSegments ]!;
			const position: Vec3 = [ center[ 0 ] + Math.cos( angle ) * ringRadius * scale, center[ 1 ] + y, center[ 2 ] + Math.sin( angle ) * ringRadius * scale ];
			const fromBell: Vec3 = [ Math.cos( angle ) * ringRadius / radius, Math.max( y / domeHeight, - 0.2 ), Math.sin( angle ) * ringRadius / radius ];
			const fromCrown = scaleVec3( subtractVec3( position, crownCenter ), 1 / crownRadius );
			const normal = normalizeVec3( addVec3( addVec3( fromBell, scaleVec3( fromCrown, 0.5 ) ), [ 0, 0.2, 0 ] ) );
			// 頂点の行は列ごとに u をずらし、三角形の扇にする。
			const u = repeats * ( column + ( row === 0 ? 0.5 : 0 ) ) / bellSegments;
			const wind = 0.2 + 0.8 * along[ row ]! / meridian;
			indices.push( builder.addVertex( position, normal, [ u, 1 - along[ row ]! / meridian ], color, wind ) );

		}

		rows.push( indices );

	}

	for ( let row = 1; row < bellRows; row ++ ) {

		for ( let column = 0; column < bellSegments; column ++ ) {

			const a = rows[ row - 1 ]![ column ]!;
			const b = rows[ row - 1 ]![ column + 1 ]!;
			const c = rows[ row ]![ column ]!;
			const d = rows[ row ]![ column + 1 ]!;
			if ( row === 1 ) builder.addTriangle( a, c, d );
			else {

				builder.addTriangle( a, c, d );
				builder.addTriangle( a, d, b );

			}

		}

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

export function generateWillowTreeData( options: WillowTreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? DEFAULT_WILLOW_TREE_HEIGHT;
	const leafColor = options.leafColor ?? DEFAULT_WILLOW_TREE_LEAF_COLOR;
	const barkColor = options.barkColor ?? DEFAULT_WILLOW_TREE_BARK_COLOR;

	if ( ! Number.isFinite( height ) || height <= 0 ) {
		throw new RangeError( 'Willow tree height must be a positive finite number' );
	}

	const random = createRandom( seed );
	const splitY = height * random.range( 0.22, 0.34 );
	// 太い幹。ぐねっと曲げる。
	const trunkRadius = height * 0.075;
	const trunk = createWillowTrunk( random, height, trunkRadius, splitY );
	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	// 幹は最初の主枝と 1 本の管になる。
	const branches = createBranches( random, height, trunk );
	for ( const branch of branches ) addStylizedLimb( builder, branch.points, branch.radii, branch.sides, barkPartIndex, ( t ) => t * 0.5, branch.samples );

	const axis = trunk.spine[ trunk.spine.length - 1 ]!;
	let crownRadius = 0;
	for ( const branch of branches ) for ( const point of branch.points ) crownRadius = Math.max( crownRadius, Math.hypot( point[ 0 ] - axis[ 0 ], point[ 2 ] - axis[ 2 ] ) );
	const crownCenter: Vec3 = [ axis[ 0 ], height * 0.65, axis[ 2 ] ];
	builder.beginGroup( leafPartIndex );
	// 葉の殻（釣り鐘）を、主枝の先 → 小枝の先 → 主枝の途中の順に置く。木全体の頂点数が maxVertexCount に収まる数だけ。
	const bellCount = Math.floor( ( maxVertexCount - builder.vertexCount ) / bellVertexCount );
	const mains = branches.filter( ( branch ) => branch.main );
	const places: { center: Vec3; radius: number }[] = [];

	for ( const branch of [ ...mains, ...branches.filter( ( branch ) => ! branch.main ) ] ) {

		// 枝の後半でいちばん高い所と枝先の間に置く。枝先が下へ垂れても殻が枝の上に乗る。
		const tip = branch.points[ branch.points.length - 1 ]!;
		let highest = tip;
		for ( const point of branch.points.slice( Math.floor( branch.points.length / 2 ) ) ) if ( point[ 1 ] > highest[ 1 ] ) highest = point;
		const radius = height * ( branch.main ? random.range( 0.15, 0.19 ) : random.range( 0.11, 0.15 ) );
		places.push( { center: [ ( highest[ 0 ] + tip[ 0 ] ) * 0.5, highest[ 1 ] + radius * 0.05, ( highest[ 2 ] + tip[ 2 ] ) * 0.5 ], radius } );

	}

	for ( const branch of mains ) {

		// 主枝の途中には少し小さな殻を、枝より少し上に。
		const point = branch.points[ branch.points.length - 3 ]!;
		const radius = height * random.range( 0.11, 0.14 );
		places.push( { center: addVec3( point, [ 0, radius * 0.4, 0 ] ), radius } );

	}

	for ( const { center, radius } of places.slice( 0, bellCount ) ) {

		// 裾は地面から樹高の 1〜4 割の高さ。短すぎる殻にはしない。
		const sideHeight = Math.max( radius * 0.8, center[ 1 ] - height * random.range( 0.1, 0.4 ) );
		addCanopyBell( builder, random, center, radius, sideHeight, crownCenter, crownRadius );


	}

	const lod0 = builder.build();
	const collider = buildCollider( trunk.spine, trunk.radii );
	// 上端を height に合わせる。
	let top = 0;
	for ( let index = 1; index < lod0.positions.length; index += 3 ) top = Math.max( top, lod0.positions[ index ]! );
	const fit = height / top;
	for ( let index = 0; index < lod0.positions.length; index ++ ) lod0.positions[ index ]! *= fit;
	for ( let index = 0; index < collider.positions.length; index ++ ) collider.positions[ index ]! *= fit;

	const bark = createStylizedBarkTextures( seed );
	const leaf = createWillowCanopyTextures( seed );
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
		kind: 'willow-tree',
		parts,
		lods,
		collider,
		textures: {
			bark: bark.color,
			barkNormal: bark.normal,
			// 周りに巻くので横は繰り返し、縦は頂上から裾まで 1 回。
			leaf: { ...leaf.color, wrapS: 'repeat', wrapT: 'clamp' },
			leafNormal: { ...leaf.normal, wrapS: 'repeat', wrapT: 'clamp' },
		},
		bounds: { radius: getMeshBoundsRadius( lod0 ), height },
	};

}

export function normalizeWillowTreeGenerationOptions(
	options: WillowTreeOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<WillowTreeOptions> {

	const leafColor = colors.leaf ?? options.leafColor ?? DEFAULT_WILLOW_TREE_LEAF_COLOR;
	const barkColor = colors.bark ?? options.barkColor ?? DEFAULT_WILLOW_TREE_BARK_COLOR;
	return {
		options: {
			seed: options.seed,
			height: options.height ?? DEFAULT_WILLOW_TREE_HEIGHT,
			leafColor,
			barkColor,
		},
		colors: { leaf: leafColor, bark: barkColor },
	};

}
