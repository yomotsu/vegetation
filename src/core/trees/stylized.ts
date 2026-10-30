import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import type { Random } from '../random';
import type { Color3, MeshData, Vec3 } from '../types';

export function addVec3( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];

}

export function subtractVec3( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];

}

export function scaleVec3( vector: Vec3, scale: number ): Vec3 {

	return [ vector[ 0 ] * scale, vector[ 1 ] * scale, vector[ 2 ] * scale ];

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
): { spine: Vec3[]; radii: number[] } {

	const sampled = sampleLimbCurve( points, radii, samplesPerSegment );
	const local = new MeshBuilder();
	local.beginGroup( partIndex );
	// 枝先は細い輪のまま開けず、1 点に閉じる（輪 1 つ分の頂点が減り、形はほぼ同じ）。
	// 管は最後の 1 点を除いて作り、風の重みは元の点の並びと同じ値になるよう t を縮める。
	const last = sampled.spine.length - 1;
	const tubeScale = ( last - 1 ) / last;
	addTube( local, sampled.spine.slice( 0, last ), sampled.radii.slice( 0, last ), sides, { color: [ 1, 1, 1 ], wind: ( t ) => wind( t * tubeScale ), capEnd: false } );
	const tangent = normalizeVec3( subtractVec3( sampled.spine[ last ]!, sampled.spine[ last - 1 ]! ) );
	const tip = local.addVertex( sampled.spine[ last ]!, tangent, [ 0.5, 1 ], [ 1, 1, 1 ], wind( 1 ) );

	for ( let side = 0; side < sides; side ++ ) {

		local.addTriangle( ( last - 1 ) * ( sides + 1 ) + side, ( last - 1 ) * ( sides + 1 ) + side + 1, tip );

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
		mesh.uvs[ vertex * 2 + 1 ] = distances[ ring ]! / vScale;
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
}

export interface FoliageLobe {
	center: Vec3;
	radius: number;
	/** 軸ごとの縮尺。低木の平たいドームなどに使う。 */
	scale?: Vec3;
}

function randomUnitVector( random: Random ): Vec3 {

	const y = random.range( - 1, 1 );
	const angle = random.range( 0, Math.PI * 2 );
	const ring = Math.sqrt( 1 - y * y );
	return [ ring * Math.cos( angle ), y, ring * Math.sin( angle ) ];

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
		const center = addVec3( lobe.center, [ offset[ 0 ] * scale[ 0 ], offset[ 1 ] * scale[ 1 ], offset[ 2 ] * scale[ 2 ] ] );
		// 外向き寄りのランダムな向き。真横を向いたカードが輪郭から線として飛び出さないようにする。
		const cardNormal = normalizeVec3( addVec3( direction, scaleVec3( randomUnitVector( random ), options.jitter ?? 0.9 ) ) );
		const reference: Vec3 = Math.abs( cardNormal[ 1 ] ) > 0.9 ? [ 1, 0, 0 ] : [ 0, 1, 0 ];
		const right = scaleVec3( normalizeVec3( crossVec3( reference, cardNormal ) ), cardSize * 0.5 );
		const up = scaleVec3( normalizeVec3( crossVec3( cardNormal, right ) ), cardSize * 0.5 );
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

export function cloneMeshData( mesh: MeshData ): MeshData {

	return {
		positions: mesh.positions.slice(),
		normals: mesh.normals.slice(),
		uvs: mesh.uvs.slice(),
		colors: mesh.colors.slice(),
		windWeight: mesh.windWeight.slice(),
		impostorCard: mesh.impostorCard.slice(),
		indices: mesh.indices.slice(),
		groups: mesh.groups.map( ( group ) => ( { ...group } ) ),
	};

}
