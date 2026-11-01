import { buildBillboard, buildSixPlaneImpostor, impostorLod3Part, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import type { Random } from '../random';
import type { Color3, MeshData, PartDef, Vec3 } from '../types';

export function addVec3( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];

}

export function subtractVec3( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];

}

export function scaleVec3( vector: Vec3, scale: number ): Vec3 {

	return [ vector[ 0 ] * scale, vector[ 1 ] * scale, vector[ 2 ] * scale ];

}

export function dotVec3( a: Vec3, b: Vec3 ): number {

	return a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];

}

export function crossVec3( a: Vec3, b: Vec3 ): Vec3 {

	return [
		a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ],
		a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ],
		a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ],
	];

}

export function normalizeVec3( vector: Vec3 ): Vec3 {

	const length = Math.hypot( vector[ 0 ], vector[ 1 ], vector[ 2 ] );

	if ( length === 0 || ! Number.isFinite( length ) ) {
		throw new RangeError( 'Expected a finite, non-zero vector' );
	}

	return [ vector[ 0 ] / length, vector[ 1 ] / length, vector[ 2 ] / length ];

}

function lerp( a: number, b: number, amount: number ): number {

	return a + ( b - a ) * amount;

}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function smoothstep( value: number ): number {

	const t = clamp( value, 0, 1 );
	return t * t * ( 3 - 2 * t );

}

export function getStylizedRootDepth( height: number ): number {

	return 0.3 * ( height / 7.55 );

}

export function createRootFlaredTrunkSpine(
	height: number,
	rootDepth: number,
	baseRadius: number,
	splitY: number,
	lean: Vec3 = [ 0, 0, 0 ],
): { spine: Vec3[]; radii: number[] } {

	const splitFraction = splitY / height;
	const fractions = [ - rootDepth / height, 0, 0.06, 0.2, splitFraction ];
	const spine: Vec3[] = [];
	const radii: number[] = [];

	for ( const fraction of fractions ) {

		const positiveFraction = Math.max( 0, fraction );
		const curve = positiveFraction * positiveFraction * ( 3 - 2 * positiveFraction ) + Math.sin( positiveFraction * Math.PI * 2 ) * 0.12;
		const bend = Math.sin( positiveFraction * Math.PI ) * 0.22;
		const radius = fraction <= 0.06
			? baseRadius * ( 1.6 - 0.6 * smoothstep( fraction / 0.06 ) )
			: baseRadius * ( 1 - 0.45 * smoothstep( ( fraction - 0.06 ) / ( splitFraction - 0.06 ) ) );

		spine.push( [ lean[ 0 ] * curve + lean[ 0 ] * bend, fraction * height, lean[ 2 ] * curve + lean[ 2 ] * bend ] );
		radii.push( Math.max( baseRadius * 0.42, radius ) );

	}

	return { spine, radii };

}

function sampleLimbCurve(
	points: readonly Vec3[],
	radii: readonly number[],
	samplesPerSegment = 3,
): { spine: Vec3[]; radii: number[] } {

	if ( points.length < 2 || radii.length !== points.length ) {
		throw new RangeError( 'A limb curve needs matching points and radii' );
	}

	const spine: Vec3[] = [];
	const sampledRadii: number[] = [];
	const segmentCount = points.length - 1;

	for ( let segment = 0; segment < segmentCount; segment ++ ) {

		const p0 = points[ Math.max( 0, segment - 1 ) ]!;
		const p1 = points[ segment ]!;
		const p2 = points[ segment + 1 ]!;
		const p3 = points[ Math.min( points.length - 1, segment + 2 ) ]!;

		for ( let sample = 0; sample < samplesPerSegment; sample ++ ) {

			const t = sample / samplesPerSegment;
			const t2 = t * t;
			const t3 = t2 * t;
			const point: Vec3 = [ 0, 0, 0 ];

			for ( let axis = 0; axis < 3; axis ++ ) {

				point[ axis ] = 0.5 * (
					2 * p1[ axis ]! + ( - p0[ axis ]! + p2[ axis ]! ) * t +
					( 2 * p0[ axis ]! - 5 * p1[ axis ]! + 4 * p2[ axis ]! - p3[ axis ]! ) * t2 +
					( - p0[ axis ]! + 3 * p1[ axis ]! - 3 * p2[ axis ]! + p3[ axis ]! ) * t3
				);

			}

			spine.push( point );
			sampledRadii.push( lerp( radii[ segment ]!, radii[ segment + 1 ]!, t ) );

		}

	}

	spine.push( [ ...points[ points.length - 1 ]! ] );
	sampledRadii.push( radii[ radii.length - 1 ]! );

	return { spine, radii: sampledRadii };

}

function appendMesh( target: MeshBuilder, source: MeshData, partIndex: number ): void {

	const remap: number[] = [];

	for ( let vertex = 0; vertex < source.positions.length / 3; vertex ++ ) {

		const offset3 = vertex * 3;
		const offset2 = vertex * 2;
		remap.push( target.addVertex(
			[ source.positions[ offset3 ]!, source.positions[ offset3 + 1 ]!, source.positions[ offset3 + 2 ]! ],
			[ source.normals[ offset3 ]!, source.normals[ offset3 + 1 ]!, source.normals[ offset3 + 2 ]! ],
			[ source.uvs[ offset2 ]!, source.uvs[ offset2 + 1 ]! ],
			[ source.colors[ offset3 ]!, source.colors[ offset3 + 1 ]!, source.colors[ offset3 + 2 ]! ],
			source.windWeight[ vertex ]!,
		) );

	}

	target.beginGroup( partIndex );
	for ( const group of source.groups ) {

		for ( let index = group.start; index < group.start + group.count; index += 3 ) {
			target.addTriangle( remap[ source.indices[ index ]! ]!, remap[ source.indices[ index + 1 ]! ]!, remap[ source.indices[ index + 2 ]! ]! );
		}

	}

}

export function addStylizedLimb(
	target: MeshBuilder,
	points: readonly Vec3[],
	radii: readonly number[],
	sides: number,
	partIndex: number,
	wind: ( t: number ) => number = ( t ) => t,
	samplesPerSegment = 3,
	flatEnd = false,
	uvDistanceScale = 1,
	uvOffset = 0,
): { spine: Vec3[]; radii: number[] } {

	const sampled = sampleLimbCurve( points, radii, samplesPerSegment );
	const local = new MeshBuilder();
	local.beginGroup( partIndex );
	const last = sampled.spine.length - 1;

	if ( flatEnd ) {

		// 先を平らな面で閉じる（短い枝が尖ってトゲに見えないように）。
		addTube( local, sampled.spine, sampled.radii, sides, { color: [ 1, 1, 1 ], wind, capEnd: true } );

	} else {

		// 枝先は細い輪のまま開けず、1 点に閉じる（輪 1 つ分の頂点が減り、形はほぼ同じ）。
		// 管は最後の 1 点を除いて作り、風の重みは元の点の並びと同じ値になるよう t を縮める。
		const tubeScale = ( last - 1 ) / last;
		addTube( local, sampled.spine.slice( 0, last ), sampled.radii.slice( 0, last ), sides, { color: [ 1, 1, 1 ], wind: ( t ) => wind( t * tubeScale ), capEnd: false } );
		const tangent = normalizeVec3( subtractVec3( sampled.spine[ last ]!, sampled.spine[ last - 1 ]! ) );
		const tip = local.addVertex( sampled.spine[ last ]!, tangent, [ 0.5, 1 ], [ 1, 1, 1 ], wind( 1 ) );

		for ( let side = 0; side < sides; side ++ ) {

			local.addTriangle( ( last - 1 ) * ( sides + 1 ) + side, ( last - 1 ) * ( sides + 1 ) + side + 1, tip );

		}

	}

	const mesh = local.build();
	const ringSize = sides + 1;
	const distances: number[] = [ 0 ];

	for ( let index = 1; index < sampled.spine.length; index ++ ) {
		distances.push( distances[ index - 1 ]! + Math.hypot( ...subtractVec3( sampled.spine[ index ]!, sampled.spine[ index - 1 ]! ) ) );
	}

	const meanRadius = sampled.radii.reduce( ( sum, radius ) => sum + radius, 0 ) / sampled.radii.length;
	const vScale = Math.max( meanRadius * Math.PI * 4, 1e-4 );

	for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {
		const ring = Math.min( sampled.spine.length - 1, Math.floor( vertex / ringSize ) );
		mesh.uvs[ vertex * 2 ] = mesh.uvs[ vertex * 2 ]! + uvOffset;
		mesh.uvs[ vertex * 2 + 1 ] = distances[ ring ]! / vScale * uvDistanceScale;
	}

	appendMesh( target, mesh, partIndex );
	return sampled;

}

export interface FoliageCardOptions {
	/** カード中心の深さ（ローブ半径 × 0.78 に対する比）の範囲。省略時は表面寄りに多く内側にも少し。 */
	depth?: [ number, number ];
	/** true ならテクスチャを 2×2 に分けた区画の 1 つだけを貼る（房を区画ごとに描いたテクスチャ用）。 */
	quadrant?: boolean;
	/** カードの向きを外向きからどれだけばらすか。省略時 0.9。小さいほど真横を向いたカードが減る。 */
	jitter?: number;
	/**
	 * 指定するとカードの上（v = 1）を塊の中心から外へ向け、この値だけ世界の上へ寄せて面に射影する。
	 * 射影が弱く、lobe.branch があるときは枝の始点から終点への向きをカードの上に使う。
	 * テクスチャの下に小枝の付け根を描いたとき、付け根が枝のある塊の内側を向く。省略時はカードの上を世界の上にそろえる。
	 */
	outwardUp?: number;
	/** テクスチャの小枝の付け根が、カード中心からカードの下へどれだけ離れているか（cardSize に対する比）。lobe.branch と outwardUp があるとき、付け根が枝の上に来るようにカードを動かす。 */
	rootOffset?: number;
}

export interface FoliageLobe {
	center: Vec3;
	radius: number;
	/** 軸ごとの縮尺。低木の平たいドームなどに使う。 */
	scale?: Vec3;
	/** 塊を支える枝の折れ線。2 点以上を指定すると outwardUp のカードの外向きと、射影が弱いときの枝方向を決める。 */
	branch?: Vec3[];
}

const MAX_OUTWARD_UP_CARD_NORMAL_Y = 0.7; // 上下どちらを向いても、カードを水平から約 45° 起こしておく（枝の高さに寝た板が横から見えないように）。
const MIN_OUTWARD_UP_TUFT_Y = 0.15; // 房の上向き成分を保つ最小値。

function randomUnitVector( random: Random ): Vec3 {

	const y = random.range( - 1, 1 );
	const angle = random.range( 0, Math.PI * 2 );
	const ring = Math.sqrt( 1 - y * y );
	return [ ring * Math.cos( angle ), y, ring * Math.sin( angle ) ];

}

function closestPointOnSegment( point: Vec3, start: Vec3, end: Vec3 ): Vec3 {

	const segment = subtractVec3( end, start );
	const lengthSquared = dotVec3( segment, segment );

	if ( lengthSquared <= 1e-12 ) {
		return start;
	}

	const amount = clamp( dotVec3( subtractVec3( point, start ), segment ) / lengthSquared, 0, 1 );
	return addVec3( start, scaleVec3( segment, amount ) );

}

function closestPointOnPolyline( point: Vec3, points: Vec3[] ): Vec3 {

	let nearest = closestPointOnSegment( point, points[ 0 ]!, points[ 1 ]! );
	const initialOffset = subtractVec3( point, nearest );
	let nearestDistanceSquared = dotVec3( initialOffset, initialOffset );

	for ( let index = 2; index < points.length; index ++ ) {

		const candidate = closestPointOnSegment( point, points[ index - 1 ]!, points[ index ]! );
		const offset = subtractVec3( point, candidate );
		const distanceSquared = dotVec3( offset, offset );

		if ( distanceSquared < nearestDistanceSquared ) {

			nearest = candidate;
			nearestDistanceSquared = distanceSquared;

		}

	}

	return nearest;

}

/**
 * 葉の房テクスチャを丸ごと貼った正方形カードで球状の塊を作る。法線はカードの向きではなく、
 * 塊と樹冠の中心から外向きにして、塊として陰影を付ける。
 */
export function addFoliageLobeCards(
	builder: MeshBuilder,
	random: Random,
	lobe: FoliageLobe,
	crownCenter: Vec3,
	crownRadius: number,
	count: number,
	cardSize: number,
	options: FoliageCardOptions = {},
): void {

	const scale = lobe.scale ?? [ 1, 1, 1 ];
	const goldenAngle = Math.PI * ( 3 - Math.sqrt( 5 ) );

	for ( let index = 0; index < count; index ++ ) {

		// 表面寄りに多く、内側にも少し置いて透けを防ぐ。
		const y = 1 - 2 * ( index + 0.5 ) / count;
		const ring = Math.sqrt( Math.max( 0, 1 - y * y ) );
		const angle = index * goldenAngle + random.range( - 0.3, 0.3 );
		const direction = normalizeVec3( [ ring * Math.cos( angle ) + random.range( - 0.15, 0.15 ), y * 0.85 + random.range( - 0.15, 0.15 ), ring * Math.sin( angle ) + random.range( - 0.15, 0.15 ) ] );
		const depth = options.depth === undefined ? 1 - 0.5 * random.next() * random.next() : random.range( options.depth[ 0 ], options.depth[ 1 ] );
		const offset = scaleVec3( direction, lobe.radius * depth * 0.78 );
		let center = addVec3( lobe.center, [ offset[ 0 ] * scale[ 0 ], offset[ 1 ] * scale[ 1 ], offset[ 2 ] * scale[ 2 ] ] );
		// 外向き寄りのランダムな向き。真横を向いたカードが輪郭から線として飛び出さないようにする。
		let cardNormal = normalizeVec3( addVec3( direction, scaleVec3( randomUnitVector( random ), options.jitter ?? 0.9 ) ) );

		if ( options.outwardUp !== undefined && Math.abs( cardNormal[ 1 ] ) > MAX_OUTWARD_UP_CARD_NORMAL_Y ) {

			let x = cardNormal[ 0 ];
			let z = cardNormal[ 2 ];
			let xzLength = Math.hypot( x, z );

			if ( xzLength <= 1e-6 ) {

				x = direction[ 0 ];
				z = direction[ 2 ];
				xzLength = Math.hypot( x, z );

				if ( xzLength <= 1e-6 ) {
					x = 1;
					z = 0;
					xzLength = 1;
				}

			}

			const xzScale = Math.sqrt( 1 - MAX_OUTWARD_UP_CARD_NORMAL_Y ** 2 ) / xzLength;
			cardNormal = [ x * xzScale, Math.sign( cardNormal[ 1 ] ) * MAX_OUTWARD_UP_CARD_NORMAL_Y, z * xzScale ];

		}

		const reference: Vec3 = Math.abs( cardNormal[ 1 ] ) > 0.9 ? [ 1, 0, 0 ] : [ 0, 1, 0 ];
		let right = scaleVec3( normalizeVec3( crossVec3( reference, cardNormal ) ), cardSize * 0.5 );
		let up = scaleVec3( normalizeVec3( crossVec3( cardNormal, right ) ), cardSize * 0.5 );

		if ( options.outwardUp !== undefined ) {

			// 外向き（＋上寄せ）を正規化して面へ射影する。射影が弱いときは枝先方向を使い、それも弱ければ既定の上を保つ。
			let outwardDirection = direction;
			let nearestBranchPoint: Vec3 | undefined;

			if ( lobe.branch !== undefined ) {

				nearestBranchPoint = closestPointOnPolyline( center, lobe.branch );
				const branchOutward = subtractVec3( center, nearestBranchPoint );

				if ( Math.hypot( ...branchOutward ) > 1e-8 ) {
					outwardDirection = normalizeVec3( branchOutward );
				}

			}

			const outward = normalizeVec3( addVec3( outwardDirection, [ 0, options.outwardUp, 0 ] ) );
			let inPlane = subtractVec3( outward, scaleVec3( cardNormal, dotVec3( outward, cardNormal ) ) );

			if ( Math.hypot( ...inPlane ) <= 0.2 && lobe.branch !== undefined ) {

				const branchDirection = subtractVec3( lobe.branch[ lobe.branch.length - 1 ]!, lobe.branch[ 0 ]! );

				if ( Math.hypot( ...branchDirection ) > 1e-8 ) {

					const normalizedBranchDirection = normalizeVec3( branchDirection );
					const branchInPlane = subtractVec3( normalizedBranchDirection, scaleVec3( cardNormal, dotVec3( normalizedBranchDirection, cardNormal ) ) );

					if ( Math.hypot( ...branchInPlane ) > 0.2 ) {
						inPlane = branchInPlane;
					}

				}

			}

			if ( Math.hypot( ...inPlane ) > 0.2 ) {

				up = scaleVec3( normalizeVec3( inPlane ), cardSize * 0.5 );
				right = scaleVec3( normalizeVec3( crossVec3( up, cardNormal ) ), cardSize * 0.5 );

			}

			if ( normalizeVec3( up )[ 1 ] < MIN_OUTWARD_UP_TUFT_Y ) {

				const worldUpInPlane = subtractVec3( [ 0, 1, 0 ], scaleVec3( cardNormal, cardNormal[ 1 ] ) );

				if ( Math.hypot( ...worldUpInPlane ) > 1e-6 ) {

					up = scaleVec3( normalizeVec3( worldUpInPlane ), cardSize * 0.5 );
					right = scaleVec3( normalizeVec3( crossVec3( up, cardNormal ) ), cardSize * 0.5 );

				}

			}

			if ( nearestBranchPoint !== undefined && options.rootOffset !== undefined ) {

				center = addVec3( nearestBranchPoint, scaleVec3( normalizeVec3( up ), options.rootOffset * cardSize ) );

			}

		}

		const corners: Vec3[] = [
			subtractVec3( subtractVec3( center, right ), up ),
			subtractVec3( addVec3( center, right ), up ),
			addVec3( addVec3( center, right ), up ),
			addVec3( subtractVec3( center, right ), up ),
		];
		let uvs: [ number, number ][] = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ];

		if ( options.quadrant === true ) {

			const quadrant = random.int( 0, 3 );
			const u = ( quadrant % 2 ) * 0.5;
			const v = Math.floor( quadrant / 2 ) * 0.5;
			uvs = [ [ u, v ], [ u + 0.5, v ], [ u + 0.5, v + 0.5 ], [ u, v + 0.5 ] ];

		}
		const indices = corners.map( ( corner, cornerIndex ) => {

			const lobeOffset = subtractVec3( corner, lobe.center );
			const fromLobe: Vec3 = [ lobeOffset[ 0 ] / ( lobe.radius * scale[ 0 ] ), lobeOffset[ 1 ] / ( lobe.radius * scale[ 1 ] ), lobeOffset[ 2 ] / ( lobe.radius * scale[ 2 ] ) ];
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

export function getMeshBoundsRadius( mesh: MeshData ): number {

	let radius = 0;
	for ( let index = 0; index < mesh.positions.length; index += 3 ) {
		radius = Math.max( radius, Math.hypot( mesh.positions[ index ]!, mesh.positions[ index + 2 ]! ) );
	}
	return radius;

}

// 頂点の高さの最大。
export function getMeshTop( mesh: MeshData ): number {

	let top = - Infinity;
	for ( let index = 1; index < mesh.positions.length; index += 3 ) top = Math.max( top, mesh.positions[ index ]! );
	return top;

}

export function scaleMeshPositions( positions: Float32Array, scale: number ): void {

	for ( let index = 0; index < positions.length; index ++ ) positions[ index ]! *= scale;

}

// stylized な木のパーツの並び: 0 樹皮、1 葉、2 LOD3 のインポスター、3 LOD4 のインポスター。
export const STYLIZED_IMPOSTOR_LOD3_PART_INDEX = 2;
export const STYLIZED_IMPOSTOR_PART_INDEX = 3;

// モミ（tree）と同じく、視線の角度によるディザの切り替えはせず全カードを常に描く。
// 板は裏向きの三角形を足して表として描く（upNormalCards）。両面描画だと裏から見た板の法線が下を向き、真っ黒になった。
export function createStylizedImpostorParts(): PartDef[] {

	return [
		{ ...impostorLod3Part(), impostorFade: false, upNormalCards: true, doubleSided: false },
		{ ...impostorPart(), impostorFade: false, upNormalCards: true, doubleSided: false },
	];

}

/**
 * LOD3 / LOD4 のインポスター（モミと同じ作り）。LOD3 は 6 方向の縦板＋真上の水平板、LOD4 は視線を向く縦板 1 枚＋真上の水平板。
 * 水平板は topHeight の高さに、そこでの LOD0 の広がりの大きさで置く。どちらも LOD0 から焼く。
 */
export function buildStylizedImpostorLods( lod0: MeshData, height: number, topHeight: number ): [ MeshData, MeshData ] {

	const radius = getMeshBoundsRadius( lod0 );
	return [
		buildSixPlaneImpostor( height, radius, STYLIZED_IMPOSTOR_LOD3_PART_INDEX, lod0, topHeight ),
		buildBillboard( { radius, height }, STYLIZED_IMPOSTOR_PART_INDEX, lod0, topHeight ),
	];

}
