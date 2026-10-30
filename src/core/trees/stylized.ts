import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import type { MeshData, Vec3 } from '../types';

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
): { spine: Vec3[]; radii: number[] } {

	const sampled = sampleLimbCurve( points, radii );
	const local = new MeshBuilder();
	local.beginGroup( partIndex );
	addTube( local, sampled.spine, sampled.radii, sides, { color: [ 1, 1, 1 ], wind, capEnd: false } );
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
