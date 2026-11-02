import { MeshBuilder } from '../meshBuilder';
import { createRandom } from '../random';
import { buildBillboard, buildSixPlaneImpostor, LOD3_IMPOSTOR_VIEWS, LOD4_IMPOSTOR_VIEWS, impostorLod3Part, impostorPart } from '../impostor';
import { getMeshBoundsRadius } from './stylized';
import { addTube } from '../primitives';
import type { ColliderData, MeshData, PartDef, TextureData, Vec3, VegetationData } from '../types';
import type { NormalizedVegetationGeneration } from '../vegetationGeneration';

export interface BambooShootOptions {
	seed?: number;
	height?: number;
	coreColor?: number;
	sheathColor?: number;
}

export const DEFAULT_BAMBOO_SHOOT_HEIGHT = 0.3;
export const DEFAULT_BAMBOO_SHOOT_CORE_COLOR = 0x9bb347;
export const DEFAULT_BAMBOO_SHOOT_SHEATH_COLOR = 0x806c64;

const corePartIndex = 0;
const sheathPartIndex = 1;
const overlapPartIndex = 2;
const sproutPartIndex = 3;
const crownPartIndex = 4;
const impostorLod3PartIndex = 5;
const impostorLod4PartIndex = 6;
const lod3ImpostorViews = LOD3_IMPOSTOR_VIEWS.slice( 0, 6 );
const sproutTint: Vec3 = [ 0.82, 1.06, 0.65 ];
const sproutBrownTransitionTint: Vec3 = [ 0.82, 0.6, 1.3 ];
const coreSides = 6;
const coreProfile = [
	[ - 0.1, 1 ],
	[ 0, 1 ],
	[ 0.18, 0.99 ],
	[ 0.42, 0.95 ],
	[ 0.62, 0.82 ],
	[ 0.78, 0.6 ],
	[ 0.9, 0.35 ],
	[ 0.97, 0.12 ],
	[ 1, 0 ],
] as const;

interface BambooShootLodDetail {
	coreRingIndices: readonly number[];
	innerSkinRingIndices: readonly number[];
	sheathTierIndices: readonly number[];
	sheathProgressRows: readonly number[];
	sheathAngleSegments: number;
	sheathBoundarySamples: number;
	greenSkinRows: readonly number[];
	apexProfile: readonly ( readonly [ number, number ] )[];
}

const defaultSheathTiers = [
	{ tip: 0.46, amplitude: 0.105 },
	{ tip: 0.6, amplitude: 0.105 },
	{ tip: 0.73, amplitude: 0.1 },
	{ tip: 0.85, amplitude: 0.095 },
	{ tip: 0.91, amplitude: 0.045 },
] as const;

const bambooShootLodDetails: readonly BambooShootLodDetail[] = [
	{
		coreRingIndices: [],
		innerSkinRingIndices: [],
		sheathTierIndices: [ 0, 1, 2, 3, 4 ],
		sheathProgressRows: [ 0, 0.68, 1 ],
		sheathAngleSegments: 12,
		sheathBoundarySamples: 128,
		greenSkinRows: [ 0.9, 0.95, 0.97 ],
		apexProfile: [ [ 0, 0.24 ], [ 0.25, 0.26 ], [ 0.67, 0.16 ], [ 1, 0.003 ] ],
	},
	{
		coreRingIndices: [],
		innerSkinRingIndices: [],
		sheathTierIndices: [ 0, 1, 2, 3, 4 ],
		sheathProgressRows: [ 0, 0.5, 1 ],
		sheathAngleSegments: 6,
		sheathBoundarySamples: 64,
		greenSkinRows: [ 0.9, 0.925, 0.95, 0.97 ],
		apexProfile: [ [ 0, 0.24 ], [ 0.33, 0.26 ], [ 0.67, 0.16 ], [ 1, 0.003 ] ],
	},
	{
		coreRingIndices: [],
		innerSkinRingIndices: [],
		sheathTierIndices: [ 0, 2, 4 ],
		sheathProgressRows: [ 0, 1 ],
		sheathAngleSegments: 6,
		sheathBoundarySamples: 32,
		greenSkinRows: [ 0.9, 0.97 ],
		apexProfile: [ [ 0, 0.24 ], [ 0.5, 0.2 ], [ 1, 0.003 ] ],
	},
];

function clamp01( value: number ): number {

	return Math.max( 0, Math.min( 1, value ) );

}

function smoothstep( value: number ): number {

	const t = clamp01( value );
	return t * t * ( 3 - 2 * t );

}

function normalize3( value: Vec3 ): Vec3 {

	const length = Math.hypot( value[ 0 ], value[ 1 ], value[ 2 ] ) || 1;
	return [ value[ 0 ] / length, value[ 1 ] / length, value[ 2 ] / length ];

}

function shootCenterAt( lean: Vec3, height: number, y: number ): Vec3 {

	const t = clamp01( y / height );
	return [ lean[ 0 ] * t, y, lean[ 2 ] * t ];

}

function shootRadiusAt( baseRadius: number, t: number ): number {

	const clamped = Math.max( coreProfile[ 0 ][ 0 ], Math.min( 1, t ) );
	let upper = coreProfile.findIndex( ( point ) => point[ 0 ] >= clamped );
	if ( upper <= 0 ) return baseRadius * coreProfile[ 0 ][ 1 ];
	const a = coreProfile[ upper - 1 ]!;
	const b = coreProfile[ upper ]!;
	const fraction = smoothstep( ( clamped - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] ) );
	return baseRadius * ( a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * fraction );

}

function shootMeshRadiusAt( baseRadius: number, t: number ): number {

	const clamped = Math.max( coreProfile[ 0 ][ 0 ], Math.min( 1, t ) );
	let upper = coreProfile.findIndex( ( point ) => point[ 0 ] >= clamped );
	if ( upper <= 0 ) return baseRadius * coreProfile[ 0 ][ 1 ];
	const a = coreProfile[ upper - 1 ]!;
	const b = coreProfile[ upper ]!;
	const fraction = ( clamped - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] );
	return baseRadius * ( a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * fraction );

}

function sheathBoundaryAt( meanT: number, theta: number, phase: number, amplitude: number, irregularity: number ): number {

	return clamp01( meanT + amplitude * Math.cos( theta - phase ) + 0.008 * Math.sin( 2 * theta + irregularity ) );

}

interface BambooShootSheathLayer {
	tipT: number;
	amplitude: number;
	phase: number;
	variation: number;
}

function hexBoundaryRadius( radius: number, theta: number ): number {

	const sector = Math.PI / 3;
	const wrapped = ( theta % sector + sector ) % sector;
	return radius * Math.cos( Math.PI / 6 ) / Math.cos( wrapped - Math.PI / 6 );

}

function sheathSurfaceOffset(
	baseRadius: number,
	t: number,
	theta: number,
	layers: readonly BambooShootSheathLayer[],
	irregularity: number,
): number {

	// Keep clipped lower edges on the shared height/angle boundary. The
	// exposed upper-edge flare is added separately from panel progress below.
	const ridge = Math.min( 1, layers.reduce( ( sum, layer ) => {
		const boundary = sheathBoundaryAt( layer.tipT, theta, layer.phase, layer.amplitude, irregularity );
		return sum + Math.exp( - Math.pow( ( t - boundary ) / 0.025, 2 ) );
	}, 0 ) );
	return baseRadius * ( 0.021 + 0.006 * clamp01( t ) + 0.018 * ridge );

}

function sheathColumnsAt(
	layers: readonly BambooShootSheathLayer[],
	irregularity: number,
	baseSegments: number,
	boundarySamples: number,
): number[] {

	const angles = new Set<number>();
	const segmentAngle = baseSegments === 12 ? Math.PI / 6 : Math.PI * 2 / baseSegments;
	for ( let step = 0; step <= baseSegments; step ++ ) angles.add( Math.round( step * segmentAngle * 1e8 ) / 1e8 );

	for ( let a = 0; a < layers.length; a ++ ) {
		for ( let b = a + 1; b < layers.length; b ++ ) {

			const boundaryDifference = ( theta: number ) => {
				const left = layers[ a ]!;
				const right = layers[ b ]!;
				return sheathBoundaryAt( left.tipT, theta, left.phase, left.amplitude, irregularity ) -
					sheathBoundaryAt( right.tipT, theta, right.phase, right.amplitude, irregularity );
			};
			let previousAngle = 0;
			let previousValue = boundaryDifference( previousAngle );

			for ( let sample = 1; sample <= boundarySamples; sample ++ ) {

				const angle = sample / boundarySamples * Math.PI * 2;
				const value = boundaryDifference( angle );
				if ( previousValue * value < 0 ) {
					let low = previousAngle;
					let high = angle;
					let lowValue = previousValue;
					for ( let iteration = 0; iteration < 22; iteration ++ ) {
						const middle = ( low + high ) * 0.5;
						const middleValue = boundaryDifference( middle );
						if ( lowValue * middleValue <= 0 ) high = middle;
						else { low = middle; lowValue = middleValue; }
					}
					const crossing = ( low + high ) * 0.5;
					if ( crossing > 1e-6 && crossing < Math.PI * 2 - 1e-6 ) angles.add( Math.round( crossing * 1e8 ) / 1e8 );
				}
				previousAngle = angle;
				previousValue = value;

			}

		}
	}

	return [ ... angles ].sort( ( a, b ) => a - b );

}

function addShootCore( builder: MeshBuilder, height: number, baseRadius: number, lean: Vec3, detail: BambooShootLodDetail ): void {

	builder.beginGroup( corePartIndex );
	if ( detail.coreRingIndices.length === 0 ) return;
	const rings: number[][] = [];

	for ( const profileIndex of detail.coreRingIndices ) {

		const [ t, radiusScale ] = coreProfile[ profileIndex ]!;
		const y = t * height;
		const radius = baseRadius * radiusScale;
		const center = shootCenterAt( lean, height, y );
		const coreColor: Vec3 = t < 0.1
			? [ 1.12, 0.72, 0.54 ]
			: t < 0.82
				? [ 0.74, 0.7, 0.46 ]
				: [ 0, 1, 2 ].map( ( channel ) => {
					const start = [ 0.74, 0.7, 0.46 ][ channel ]!;
					return start + ( sproutTint[ channel ]! - start ) * smoothstep( ( t - 0.82 ) / 0.18 );
				} ) as Vec3;
		const ring: number[] = [];

		for ( let side = 0; side < coreSides; side ++ ) {

			const angle = side / coreSides * Math.PI * 2;
			const dr = ( shootRadiusAt( baseRadius, t + 0.004 ) - shootRadiusAt( baseRadius, t - 0.004 ) ) / ( height * 0.008 );
			const normal = normalize3( [ Math.cos( angle ), - dr, Math.sin( angle ) ] );
			const position: Vec3 = [ center[ 0 ] + Math.cos( angle ) * radius, y, center[ 2 ] + Math.sin( angle ) * radius ];
			ring.push( builder.addVertex( position, normal, [ side / coreSides, clamp01( t ) ], coreColor, 0 ) );

		}

		rings.push( ring );

	}

	for ( let ringIndex = 0; ringIndex < rings.length - 1; ringIndex ++ ) {

		const lower = rings[ ringIndex ]!;
		const upper = rings[ ringIndex + 1 ]!;
		for ( let side = 0; side < coreSides; side ++ ) {
			const next = ( side + 1 ) % coreSides;
			builder.addTriangle( lower[ side ]!, upper[ side ]!, upper[ next ]! );
			builder.addTriangle( lower[ side ]!, upper[ next ]!, lower[ next ]! );
		}

	}

	const tipCenter = shootCenterAt( lean, height, height );
	const tip = builder.addVertex( tipCenter, [ 0, 1, 0 ], [ 0.5, 1 ], sproutTint, 0 );
	const lastRing = rings[ rings.length - 1 ]!;
	for ( let side = 0; side < coreSides; side ++ ) builder.addTriangle( lastRing[ side ]!, tip, lastRing[ ( side + 1 ) % coreSides ]! );

}

function addApexSproutSleeve( builder: MeshBuilder, height: number, baseRadius: number, lean: Vec3, detail: BambooShootLodDetail ): void {

	builder.beginGroup( crownPartIndex );
	const sleeveLength = Math.min( 0.16, height * 0.28 );
	const sleeveStart = height - sleeveLength / 3;
	const sleeveProfile = detail.apexProfile.map( ( [ fraction, radiusScale ] ) => [ sleeveStart + sleeveLength * fraction, radiusScale ] as const );
	const rows: number[][] = [];
	const sides = 6;

	for ( let rowIndex = 0; rowIndex < sleeveProfile.length - 1; rowIndex ++ ) {

		const [ y, radiusScale ] = sleeveProfile[ rowIndex ]!;
		const rowT = rowIndex / ( sleeveProfile.length - 1 );
		const center = shootCenterAt( lean, height, y );
		const radius = baseRadius * radiusScale;
		const row: number[] = [];

		for ( let side = 0; side < sides; side ++ ) {

			const u = side / sides;
			const angle = u * Math.PI * 2;
			const normal: Vec3 = normalize3( [ Math.cos( angle ), 0.22, Math.sin( angle ) ] );
		const position: Vec3 = [ center[ 0 ] + Math.cos( angle ) * radius, y, center[ 2 ] + Math.sin( angle ) * radius ];
			row.push( builder.addVertex( position, normal, [ u, rowT ], sproutTint, 0 ) );

		}

		rows.push( row );

	}

	for ( let row = 0; row < rows.length - 1; row ++ ) {

		const lower = rows[ row ]!;
		const upper = rows[ row + 1 ]!;
		for ( let side = 0; side < sides; side ++ ) {
			const next = ( side + 1 ) % sides;
			builder.addTriangle( lower[ side ]!, upper[ side ]!, upper[ next ]! );
			builder.addTriangle( lower[ side ]!, upper[ next ]!, lower[ next ]! );
		}
	}
	const lastRing = rows[ rows.length - 1 ]!;
	const tipY = sleeveProfile[ sleeveProfile.length - 1 ]![ 0 ];
	const tipCenter = shootCenterAt( lean, height, tipY );
	const tip = builder.addVertex( tipCenter, [ 0, 1, 0 ], [ 0.5, 1 ], sproutTint, 0 );
	for ( let side = 0; side < sides; side ++ ) builder.addTriangle( lastRing[ side ]!, tip, lastRing[ ( side + 1 ) % sides ]! );

}

function sheathColorAt( t: number, variation: number ): Vec3 {

	const colorStops: readonly [ number, Vec3 ][] = [
		[ 0, [ 2.8, 3.6, 4.0 ] ],
		[ 0.22, [ 2.7, 3.4, 3.75 ] ],
		[ 0.52, [ 2.45, 2.8, 3.0 ] ],
		[ 0.8, [ 1.55, 1.9, 2.1 ] ],
		[ 1, [ 1.2, 1.6, 1.9 ] ],
	];
	let upper = colorStops.findIndex( ( stop ) => stop[ 0 ] >= t );
	if ( upper <= 0 ) upper = 1;
	const [ startT, startColor ] = colorStops[ upper - 1 ]!;
	const [ endT, endColor ] = colorStops[ upper ]!;
	const mix = smoothstep( ( t - startT ) / ( endT - startT ) );
	return [ 0, 1, 2 ].map( ( channel ) =>
		( startColor[ channel ]! + ( endColor[ channel ]! - startColor[ channel ]! ) * mix ) * variation,
	) as Vec3;

}

function createBambooShootCoreTexture( seed: number ): TextureData {

	const size = 256;
	const data = new Uint8Array( size * size * 4 );
	const random = createRandom( seed ^ 0x2c9277b5 );

	for ( let y = 0; y < size; y ++ ) {
		for ( let x = 0; x < size; x ++ ) {

			const u = x / size;
			const v = y / size;
			const bandPhase = ( v * 3 + u ) % 1;
			const contact = Math.exp( - Math.pow( bandPhase / 0.045, 2 ) ) * 0.2;
			const rim = Math.exp( - Math.pow( ( bandPhase - 0.075 ) / 0.035, 2 ) ) * 0.075;
			const fiber = Math.sin( ( u * 31 + Math.sin( v * 9 + seed ) * 0.015 ) * Math.PI * 2 ) * 3;
			const grain = random.range( - 2, 2 ) + fiber;
			const offset = ( y * size + x ) * 4;
			const baseMix = smoothstep( v / 0.2 );
			const base: Vec3 = [
				236 + ( 232 - 236 ) * baseMix,
				220 + ( 240 - 220 ) * baseMix,
				180 + ( 204 - 180 ) * baseMix,
			];
			const shadow: Vec3 = [ 130, 140, 82 ];
			const highlight: Vec3 = [ 255, 250, 207 ];

			for ( let channel = 0; channel < 3; channel ++ ) {
				const shaded = base[ channel ]! + ( shadow[ channel ]! - base[ channel ]! ) * contact + ( highlight[ channel ]! - base[ channel ]! ) * rim;
				data[ offset + channel ] = Math.max( 0, Math.min( 255, Math.round( shaded + grain ) ) );
			}

			data[ offset + 3 ] = 255;

		}
	}

	return { width: size, height: size, data, wrapS: 'repeat', wrapT: 'clamp' };

}

function createBambooShootSheathTexture( seed: number ): TextureData {

	const size = 256;
	const data = new Uint8Array( size * size * 4 );
	const random = createRandom( seed ^ 0x51f15e );

	for ( let y = 0; y < size; y ++ ) {

		const v = y / ( size - 1 );
		const warmMix = smoothstep( v / 0.62 );
		const darkMix = smoothstep( ( v - 0.48 ) / 0.52 );

		for ( let x = 0; x < size; x ++ ) {

			const u = x / ( size - 1 );
			const fiber = Math.sin( ( u * 29 + Math.sin( v * 8 + seed * 0.13 ) * 0.012 ) * Math.PI * 2 ) * 1.7;
			const warmFiber = Math.sin( ( u * 17 - v * 2 + seed * 0.09 ) * Math.PI * 2 );
			const grain = random.range( - 1.5, 1.5 ) + fiber;
			const offset = ( y * size + x ) * 4;
			const pale: Vec3 = [ 236, 231, 224 ];
			const tan: Vec3 = [ 202, 165, 140 ];
			const brown: Vec3 = [ 136, 98, 80 ];
			const channels = [ 0, 1, 2 ].map( ( channel ) =>
				pale[ channel ]! + ( tan[ channel ]! - pale[ channel ]! ) * warmMix + ( brown[ channel ]! - tan[ channel ]! ) * darkMix + warmFiber * ( channel === 0 ? 2.1 : channel === 1 ? 1.4 : 0 ),
			);

			for ( let channel = 0; channel < 3; channel ++ ) {
				const mottling = Math.sin( ( u * 8 + v * 3 + seed * 0.07 ) * Math.PI * 2 ) * 1.4;
				const value = channels[ channel ]! + grain + mottling;
				data[ offset + channel ] = Math.max( 0, Math.min( 255, Math.round( value ) ) );
			}

			data[ offset + 3 ] = 255;

		}

	}

	return { width: size, height: size, data, wrap: 'clamp', wrapS: 'clamp', wrapT: 'clamp' };

}

function createBambooShootOverlapTexture( seed: number ): TextureData {

	const size = 256;
	const data = new Uint8Array( size * size * 4 );
	const random = createRandom( seed ^ 0x4a10cde );

	for ( let y = 0; y < size; y ++ ) {
		for ( let x = 0; x < size; x ++ ) {

			const u = x / ( size - 1 );
			const v = y / ( size - 1 );
			// Broad contact shading distinguishes the newly exposed inner sheath
			// without drawing a crisp outline along its diagonal rim.
			const contact = ( 1 - smoothstep( v / 0.24 ) ) * 0.06;
			const upperShade = smoothstep( ( v - 0.78 ) / 0.22 ) * 0.012;
			const fiber = Math.sin( ( u * 27 + Math.sin( v * 9 + seed * 0.11 ) * 0.012 ) * Math.PI * 2 ) * 1.4;
			const grain = random.range( - 2, 2 ) + fiber;
			const offset = ( y * size + x ) * 4;
			const pale: Vec3 = [ 236, 231, 224 ];
			const tan: Vec3 = [ 202, 165, 140 ];
			const brown: Vec3 = [ 136, 98, 80 ];
			const warmMix = smoothstep( v / 0.62 );
			const darkMix = smoothstep( ( v - 0.48 ) / 0.52 );
			const base = [ 0, 1, 2 ].map( ( channel ) =>
				pale[ channel ]! + ( tan[ channel ]! - pale[ channel ]! ) * warmMix + ( brown[ channel ]! - tan[ channel ]! ) * darkMix,
			);
			const shadow: Vec3 = [ 112, 101, 98 ];

			for ( let channel = 0; channel < 3; channel ++ ) {
				const value = base[ channel ]! + ( shadow[ channel ]! - base[ channel ]! ) * contact + ( shadow[ channel ]! - base[ channel ]! ) * upperShade + grain;
				data[ offset + channel ] = Math.max( 0, Math.min( 255, Math.round( value ) ) );
			}

			data[ offset + 3 ] = 255;

		}
	}

	return { width: size, height: size, data, wrap: 'clamp', wrapS: 'clamp', wrapT: 'clamp' };

}

function createBambooShootSproutTexture( seed: number ): TextureData {

	const size = 256;
	const data = new Uint8Array( size * size * 4 );
	const random = createRandom( seed ^ 0x7151b );
	const leaves = Array.from( { length: 8 }, () => ( {
		baseU: random.range( 0.02, 0.98 ),
		baseV: random.range( 0.02, 0.25 ),
		tipV: random.range( 0.68, 0.99 ),
		lean: random.range( - 0.18, 0.18 ),
		curve: random.range( - 0.06, 0.06 ),
		width: random.range( 7, 10 ),
		shade: random.range( 0.98, 1.05 ),
	} ) );

	for ( const leaf of leaves ) {

		const baseY = Math.floor( leaf.baseV * size );
		const tipY = Math.floor( leaf.tipV * size );

		for ( let y = baseY; y <= tipY; y ++ ) {

			const progress = ( y - baseY ) / Math.max( 1, tipY - baseY );
			const centerU = leaf.baseU + leaf.lean * progress + leaf.curve * Math.sin( progress * Math.PI );
			const bladeWidth = leaf.width * Math.pow( Math.sin( progress * Math.PI ), 0.76 );
			const centerX = centerU * size;
			const alpha = progress < 0.025 || progress > 0.975 ? 190 : 255;

			for ( let x = Math.floor( centerX - bladeWidth - 1 ); x <= Math.ceil( centerX + bladeWidth + 1 ); x ++ ) {

				const dx = Math.abs( x - centerX );
				if ( dx > bladeWidth + 1 ) continue;
				const wrappedX = ( x % size + size ) % size;
				const offset = ( y * size + wrappedX ) * 4;
				const edge = clamp01( bladeWidth + 1 - dx );
				const midrib = dx < 1.15 ? 1.03 : 0.98;
				const age = 0.94 + 0.06 * progress;
				const tone = Math.min( 255, Math.round( 255 * leaf.shade * age * midrib ) );
				data[ offset ] = tone;
				data[ offset + 1 ] = tone;
				data[ offset + 2 ] = tone;
				data[ offset + 3 ] = Math.max( data[ offset + 3 ]!, Math.round( alpha * edge ) );

			}

		}

	}

	return { width: size, height: size, data, wrap: 'repeat', wrapS: 'repeat', wrapT: 'clamp' };

}

function addSheathBud( builder: MeshBuilder, base: Vec3, direction: Vec3, length: number, rootBurial: number ): void {

	const axis = normalize3( direction );
	const root: Vec3 = [ base[ 0 ] - axis[ 0 ] * rootBurial, base[ 1 ] - axis[ 1 ] * rootBurial, base[ 2 ] - axis[ 2 ] * rootBurial ];
	const totalLength = length + rootBurial;
	const side = normalize3( [ - axis[ 2 ], 0, axis[ 0 ] ] );
	const other = normalize3( [ axis[ 1 ] * side[ 2 ] - axis[ 2 ] * side[ 1 ], axis[ 2 ] * side[ 0 ] - axis[ 0 ] * side[ 2 ], axis[ 0 ] * side[ 1 ] - axis[ 1 ] * side[ 0 ] ] );
	const rings: number[][] = [];

	for ( const ring of [ { t: 0, radius: 0.002 }, { t: 0.58, radius: 0.00095 } ] ) {

		const center: Vec3 = [ root[ 0 ] + axis[ 0 ] * totalLength * ring.t, root[ 1 ] + axis[ 1 ] * totalLength * ring.t, root[ 2 ] + axis[ 2 ] * totalLength * ring.t ];
		const indices: number[] = [];
		for ( let corner = 0; corner < 4; corner ++ ) {
			const angle = corner / 4 * Math.PI * 2;
			const offset: Vec3 = [ ( side[ 0 ] * Math.cos( angle ) * 3 + other[ 0 ] * Math.sin( angle ) ) * ring.radius, ( side[ 1 ] * Math.cos( angle ) * 3 + other[ 1 ] * Math.sin( angle ) ) * ring.radius, ( side[ 2 ] * Math.cos( angle ) * 3 + other[ 2 ] * Math.sin( angle ) ) * ring.radius ];
			const normal = normalize3( [ offset[ 0 ] + axis[ 0 ] * 0.18, offset[ 1 ] + axis[ 1 ] * 0.18, offset[ 2 ] + axis[ 2 ] * 0.18 ] );
			indices.push( builder.addVertex( [ center[ 0 ] + offset[ 0 ], center[ 1 ] + offset[ 1 ], center[ 2 ] + offset[ 2 ] ], normal, [ 0.5 + Math.cos( angle ) * 0.25, ring.t ], sproutTint, 0 ) );
		}
		rings.push( indices );

	}

	const tip: Vec3 = [ root[ 0 ] + axis[ 0 ] * totalLength, root[ 1 ] + axis[ 1 ] * totalLength, root[ 2 ] + axis[ 2 ] * totalLength ];
	const tipIndex = builder.addVertex( tip, axis, [ 0.5, 1 ], sproutTint, 0 );
	for ( let corner = 0; corner < 4; corner ++ ) {
		const next = ( corner + 1 ) % 4;
		builder.addTriangle( rings[ 0 ]![ corner ]!, rings[ 1 ]![ corner ]!, rings[ 1 ]![ next ]! );
		builder.addTriangle( rings[ 0 ]![ corner ]!, rings[ 1 ]![ next ]!, rings[ 0 ]![ next ]! );
		builder.addTriangle( rings[ 1 ]![ corner ]!, tipIndex, rings[ 1 ]![ next ]! );
	}

}

function addSheaths( builder: MeshBuilder, random: ReturnType<typeof createRandom>, height: number, baseRadius: number, lean: Vec3, detail: BambooShootLodDetail ): void {

	// The inner skin is the continuous body. Outer skins are clipped to the
	// exposed area above the exact polyline boundary of the preceding layers;
	// no hidden panel faces extend through the visible outer shell.
	builder.beginGroup( sheathPartIndex );
	const skinRows: number[][] = [];
	const skinVariation = random.range( 0.96, 1.04 );

	for ( const row of detail.innerSkinRingIndices ) {

		const t = coreProfile[ row ]![ 0 ];
		const rowIndices: number[] = [];
		for ( let side = 0; side < coreSides; side ++ ) {

			const u = side / coreSides;
			const angle = u * Math.PI * 2;
			const y = t * height;
			const center = shootCenterAt( lean, height, y );
			const coreRadius = shootRadiusAt( baseRadius, t );
			const radial = coreRadius * 0.97;
			const dr = ( shootRadiusAt( baseRadius, t + 0.004 ) - shootRadiusAt( baseRadius, t - 0.004 ) ) / ( height * 0.008 );
			const normal = normalize3( [ Math.cos( angle ), - dr, Math.sin( angle ) ] );
			const color = sheathColorAt( clamp01( t ), skinVariation );
			rowIndices.push( builder.addVertex( [ center[ 0 ] + Math.cos( angle ) * radial, y, center[ 2 ] + Math.sin( angle ) * radial ], normal, [ u, clamp01( ( t + 0.1 ) / 1.06 ) ], color, 0 ) );

		}
		skinRows.push( rowIndices );

	}

	for ( let row = 0; row < skinRows.length - 1; row ++ ) {
		const lower = skinRows[ row ]!;
		const upper = skinRows[ row + 1 ]!;
		for ( let side = 0; side < coreSides; side ++ ) {
			const next = ( side + 1 ) % coreSides;
			builder.addTriangle( lower[ side ]!, upper[ side ]!, upper[ next ]! );
			builder.addTriangle( lower[ side ]!, upper[ next ]!, lower[ next ]! );
		}
	}
	builder.beginGroup( sproutPartIndex );
	const greenSkinRows: number[][] = [];
	for ( const t of detail.greenSkinRows ) {
		const progress = smoothstep( ( t - 0.9 ) / 0.07 );
		const color = [ 0, 1, 2 ].map( ( channel ) =>
			sproutBrownTransitionTint[ channel ]! + ( sproutTint[ channel ]! - sproutBrownTransitionTint[ channel ]! ) * progress,
		) as Vec3;
		const y = t * height;
		const center = shootCenterAt( lean, height, y );
		const radius = shootRadiusAt( baseRadius, t ) * 0.97;
		const row: number[] = [];
		for ( let side = 0; side < coreSides; side ++ ) {
			const u = side / coreSides;
			const angle = u * Math.PI * 2;
			const dr = ( shootRadiusAt( baseRadius, t + 0.004 ) - shootRadiusAt( baseRadius, t - 0.004 ) ) / ( height * 0.008 );
			const normal = normalize3( [ Math.cos( angle ), - dr, Math.sin( angle ) ] );
			row.push( builder.addVertex( [ center[ 0 ] + Math.cos( angle ) * radius, y, center[ 2 ] + Math.sin( angle ) * radius ], normal, [ u, t ], color, 0 ) );
		}
		greenSkinRows.push( row );
	}
	for ( let row = 0; row < greenSkinRows.length - 1; row ++ ) {
		const lower = greenSkinRows[ row ]!;
		const upper = greenSkinRows[ row + 1 ]!;
		for ( let side = 0; side < coreSides; side ++ ) {
			const next = ( side + 1 ) % coreSides;
			builder.addTriangle( lower[ side ]!, upper[ side ]!, upper[ next ]! );
			builder.addTriangle( lower[ side ]!, upper[ next ]!, lower[ next ]! );
		}
	}
	const greenSkinTop = greenSkinRows[ greenSkinRows.length - 1 ]!;
	const sheathTip = shootCenterAt( lean, height, height );
	const sheathTipIndex = builder.addVertex( sheathTip, [ 0, 1, 0 ], [ 0.5, 1 ], sproutTint, 0 );
	for ( let side = 0; side < coreSides; side ++ ) {
		const next = ( side + 1 ) % coreSides;
		builder.addTriangle( greenSkinTop[ side ]!, sheathTipIndex, greenSkinTop[ next ]! );
	}

	builder.beginGroup( overlapPartIndex );
	let boundaryPhase = 0;
	const seamPhase = random.range( - Math.PI, Math.PI );
	const allLayers: BambooShootSheathLayer[] = defaultSheathTiers.map( ( tier ) => {

		const layer = {
			tipT: tier.tip + random.range( - 0.006, 0.006 ),
			amplitude: tier.amplitude,
			phase: boundaryPhase,
			variation: random.range( 0.98, 1.02 ),
		};
		boundaryPhase += Math.PI + random.range( - 0.035, 0.035 );
		return layer;

	} );
	const layers = detail.sheathTierIndices.map( ( index, order ) => ( {
		... allLayers[ index ]!,
		// When LOD2 skips two source tiers, re-space retained phases so the
		// visible rims continue to alternate instead of repeating one slope.
		phase: allLayers[ index ]!.phase + ( order - index ) * Math.PI,
	} ) );
	const angles = sheathColumnsAt( layers, seamPhase, detail.sheathAngleSegments, detail.sheathBoundarySamples );
	const verticalUnderlap = 0.014;

	for ( let sheath = 0; sheath < layers.length; sheath ++ ) {

		const layer = layers[ sheath ]!;
		const panelRows: number[][] = [];
		const lowerEdges: number[] = [];
		const upperEdges: number[] = [];
		let budBase: Vec3 | null = null;
		let budDirection: Vec3 = [ 0, 1, 0 ];
		let highestTip = - Infinity;

		for ( let column = 0; column < angles.length; column ++ ) {
			const theta = angles[ column ]!;
			const top = sheathBoundaryAt( layer.tipT, theta, layer.phase, layer.amplitude, seamPhase );
			const lower = sheath === 0
				? - 0.15
				: Math.max( ... layers.slice( 0, sheath ).map( ( outer ) => sheathBoundaryAt( outer.tipT, theta, outer.phase, outer.amplitude, seamPhase ) ) ) - verticalUnderlap;
			lowerEdges.push( lower );
			upperEdges.push( Math.max( lower, top ) );
		}

		for ( let row = 0; row < detail.sheathProgressRows.length; row ++ ) {

			const rowIndices: number[] = [];
			for ( let column = 0; column < angles.length; column ++ ) {

				const theta = angles[ column ]!;
				const u = theta / ( Math.PI * 2 );
				const progress = detail.sheathProgressRows[ row ]!;
				const t = lowerEdges[ column ]! + ( upperEdges[ column ]! - lowerEdges[ column ]! ) * progress;
				const y = t * height;
				const center = shootCenterAt( lean, height, y );
			const coreRadius = hexBoundaryRadius( shootMeshRadiusAt( baseRadius, t ), theta );
				const upperThirdFlare = 0.035 * smoothstep( ( progress - 2 / 3 ) / ( 1 / 3 ) );
				const radial = coreRadius + sheathSurfaceOffset( baseRadius, t, theta, layers, seamPhase ) + baseRadius * upperThirdFlare;
				const normal = normalize3( [ Math.cos( theta ) * 0.96, 0.22 + 0.2 * progress, Math.sin( theta ) * 0.96 ] );
				const vertexColor = sheathColorAt( clamp01( progress ), layer.variation );
				const vertexPosition: Vec3 = [ center[ 0 ] + Math.cos( theta ) * radial, y, center[ 2 ] + Math.sin( theta ) * radial ];
				rowIndices.push( builder.addVertex( vertexPosition, normal, [ u, progress ], vertexColor, 0 ) );

				if ( row === detail.sheathProgressRows.length - 1 && upperEdges[ column ]! > lowerEdges[ column ]! && t > highestTip ) {
					highestTip = t;
					budBase = vertexPosition;
				budDirection = [ Math.cos( theta ) * 0.28, 0.92, Math.sin( theta ) * 0.28 ];
				}

			}

			panelRows.push( rowIndices );

		}

		for ( let row = 0; row < panelRows.length - 1; row ++ ) {
			const lower = panelRows[ row ]!;
			const upper = panelRows[ row + 1 ]!;
			for ( let column = 0; column < angles.length - 1; column ++ ) {
				if ( upperEdges[ column ]! <= lowerEdges[ column ]! && upperEdges[ column + 1 ]! <= lowerEdges[ column + 1 ]! ) continue;
				builder.addTriangle( lower[ column ]!, upper[ column ]!, upper[ column + 1 ]! );
				builder.addTriangle( lower[ column ]!, upper[ column + 1 ]!, lower[ column + 1 ]! );
			}
		}

		if ( budBase ) {

			builder.beginGroup( sproutPartIndex );
			const budLength = random.range( 0.024, 0.038 );
			addSheathBud( builder, budBase, budDirection, budLength, Math.min( 0.008, budLength * 0.25 ) );
			builder.beginGroup( overlapPartIndex );

		}

	}

}

function buildBambooShootMesh( seed: number, height: number, detail: BambooShootLodDetail ): { mesh: MeshData; baseRadius: number; lean: Vec3 } {

	const random = createRandom( seed );
	const baseRadius = random.range( 0.064, 0.068 );
	const leanAngle = random.range( 0, Math.PI * 2 );
	const leanLength = random.range( 0.018, 0.026 );
	const lean: Vec3 = [ Math.cos( leanAngle ) * leanLength, 0, Math.sin( leanAngle ) * leanLength ];
	const builder = new MeshBuilder();
	addShootCore( builder, height, baseRadius * 0.95, lean, detail );
	addSheaths( builder, random, height, baseRadius, lean, detail );
	addApexSproutSleeve( builder, height, baseRadius, lean, detail );
	return { mesh: builder.build(), baseRadius, lean };

}

function buildBambooShootCollider( baseRadius: number, height: number ): ColliderData {

	const builder = new MeshBuilder();
	const sides = 8;
	const bottomY = - 0.1;
	const bottom: Vec3 = [ 0, bottomY, 0 ];
	const top: Vec3 = [ 0, height, 0 ];
	addTube( builder, [ bottom, top ], [ baseRadius, baseRadius ], sides, {
		color: [ 1, 1, 1 ],
		wind: () => 0,
		capEnd: true,
	} );
	const bottomCenter = builder.addVertex( bottom, [ 0, - 1, 0 ], [ 0.5, 0.5 ], [ 1, 1, 1 ], 0 );
	for ( let side = 0; side < sides; side ++ ) builder.addTriangle( bottomCenter, ( side + 1 ) % sides, side );
	const mesh = builder.build();
	return { positions: mesh.positions, indices: mesh.indices };

}

function insetLod3TopUvs( mesh: MeshData ): MeshData {

	// The impostor atlas is a 4 × 2 grid at 128 px per view by default. The
	// topmost raster rows contain isolated apex pixels; crop ten texels so
	// they do not form a detached strip along the six card tops.
	const uvs = mesh.uvs.slice();
	const topInset = 10 / ( 128 * 2 );
	for ( let view = 0; view < 6; view ++ ) {
		for ( const corner of [ 2, 3 ] ) uvs[ ( view * 4 + corner ) * 2 + 1 ]! -= topInset;
	}
	return { ... mesh, uvs };

}

export function generateBambooShootData( options: BambooShootOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? DEFAULT_BAMBOO_SHOOT_HEIGHT;
	const coreColor = options.coreColor ?? DEFAULT_BAMBOO_SHOOT_CORE_COLOR;
	const sheathColor = options.sheathColor ?? DEFAULT_BAMBOO_SHOOT_SHEATH_COLOR;
	if ( ! Number.isFinite( height ) || height <= 0 ) throw new RangeError( 'Bamboo shoot height must be a positive finite number' );

	const lod0Build = buildBambooShootMesh( seed, height, bambooShootLodDetails[ 0 ]! );
	const crownLength = Math.min( 0.16, height * 0.28 );
	const crownExtension = crownLength * 2 / 3;
	const lod0 = lod0Build.mesh;
	const lod1 = buildBambooShootMesh( seed, height, bambooShootLodDetails[ 1 ]! ).mesh;
	const lod2 = buildBambooShootMesh( seed, height, bambooShootLodDetails[ 2 ]! ).mesh;
	const visualHeight = height + Math.max( crownExtension, 0.038 );
	const radius = getMeshBoundsRadius( lod0 );
	const lod3CardHeight = Math.max( 0.001, visualHeight - 0.006 );
	const lod3 = insetLod3TopUvs( buildSixPlaneImpostor( lod3CardHeight, radius, impostorLod3PartIndex, lod0, height * 0.78, { includeTopCard: false } ) );
	const lod4 = buildBillboard( { radius, height: visualHeight }, impostorLod4PartIndex, lod0, height * 0.78 );
	const lods: MeshData[] = [ lod0, lod1, lod2, lod3, lod4 ];
	const parts: PartDef[] = [
		{
			name: 'core',
			defaultColor: coreColor,
			texture: 'bark',
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
		},
		{
			name: 'sheath',
			defaultColor: sheathColor,
			texture: 'sheath',
			alphaTest: 0,
			doubleSided: true,
			flatShading: false,
		},
		{
			name: 'overlap',
			defaultColor: sheathColor,
			texture: 'overlap',
			alphaTest: 0,
			doubleSided: true,
			flatShading: false,
		},
		{
			name: 'sprout',
			defaultColor: coreColor,
			texture: null,
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
		},
		{
			name: 'apex-leaves',
			defaultColor: coreColor,
			texture: 'sprout',
			alphaTest: 0.42,
			doubleSided: true,
			flatShading: false,
		},
		{ ...impostorLod3Part( lod3ImpostorViews, false ), upNormalCards: true, doubleSided: false },
		{ ...impostorPart( LOD4_IMPOSTOR_VIEWS, false ), upNormalCards: true, doubleSided: false },
	];

	return {
		kind: 'bamboo-shoot',
		parts,
		lods,
		collider: buildBambooShootCollider( lod0Build.baseRadius, height ),
		textures: {
			bark: createBambooShootCoreTexture( seed ),
			sheath: createBambooShootSheathTexture( seed ),
			overlap: createBambooShootOverlapTexture( seed ),
			sprout: createBambooShootSproutTexture( seed ),
		},
		bounds: { radius, height: visualHeight },
	};

}

export function normalizeBambooShootGenerationOptions(
	options: BambooShootOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<BambooShootOptions> {

	const coreColor = colors.core ?? options.coreColor ?? DEFAULT_BAMBOO_SHOOT_CORE_COLOR;
	const sheathColor = colors.sheath ?? options.sheathColor ?? DEFAULT_BAMBOO_SHOOT_SHEATH_COLOR;
	return {
		options: {
			seed: options.seed,
			height: options.height ?? DEFAULT_BAMBOO_SHOOT_HEIGHT,
			coreColor,
			sheathColor,
		},
		colors: { core: coreColor, sheath: sheathColor },
	};

}
