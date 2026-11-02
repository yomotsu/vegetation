import { MeshBuilder } from '../meshBuilder';
import { addCard, addTube } from '../primitives';
import { createRandom } from '../random';
import type { ColliderData, MeshData, PartDef, TextureData, Vec3, VegetationData } from '../types';
import type { NormalizedVegetationGeneration } from '../vegetationGeneration';
import { addStylizedLimb, buildStylizedImpostorLods, createStylizedImpostorParts, getMeshBoundsRadius, getMeshTop, getStylizedRootDepth, normalizeVec3 } from './stylized';

export interface BambooTreeOptions {
	seed?: number;
	height?: number;
	leafColor?: number;
	barkColor?: number;
}

export const DEFAULT_BAMBOO_TREE_HEIGHT = 8;
export const DEFAULT_BAMBOO_TREE_LEAF_COLOR = 0x70a94b;
export const DEFAULT_BAMBOO_TREE_BARK_COLOR = 0x477f48;

const barkPartIndex = 0;
const leafPartIndex = 1;
const bambooSprayTextureSize = 256;
const bambooSprayAtlasSize = bambooSprayTextureSize * 2;
const bambooSprayRootX = 24;
const bambooSprayRootY = 162;
const bambooSprayStemLength = 104;
const bambooSprayTiltPattern = [ 1, - 1 ] as const;

const bambooSprayVariantLayouts = [
	{ mainDrop: 30, sag: 24, lengthScale: 1, leaves: 12 },
	{ mainDrop: 50, sag: 6, lengthScale: 0.96, leaves: 11 },
	{ mainDrop: 18, sag: 30, lengthScale: 1.04, leaves: 12 },
	{ mainDrop: 62, sag: 18, lengthScale: 0.99, leaves: 11 },
] as const;

interface BambooNode {
	y: number;
	radius: number;
	center: Vec3;
}

interface BambooSpray {
	attachment: number;
	rotation: number;
	sideSign: - 1 | 1;
	roll: number;
	scale: number;
	shade: number;
	cardCount: number;
	variant: number;
}

interface BambooBranch {
	base: Vec3;
	middle: Vec3;
	tip: Vec3;
	radii: number[];
	azimuth: number;
	tier: number;
	pairIndex: number;
	sprays: BambooSpray[];
}

interface BambooMeshDetail {
	culmSides: number;
	branchSides: number;
	sprayRatio: number;
	keepAlternatingSecondary: boolean;
}

interface BambooCulmSection {
	y: number;
	radius: number;
	shade: number;
	uvV: number;
	nodeRing?: true;
}

const bambooLodDetails: readonly BambooMeshDetail[] = [
	{ culmSides: 6, branchSides: 3, sprayRatio: 1, keepAlternatingSecondary: false },
	{ culmSides: 6, branchSides: 3, sprayRatio: 0.72, keepAlternatingSecondary: false },
	{ culmSides: 5, branchSides: 3, sprayRatio: 0.46, keepAlternatingSecondary: true },
];

interface BambooCardAttachment {
	position: Vec3;
	axis: Vec3;
}

interface BambooSkeleton {
	height: number;
	rootDepth: number;
	baseRadius: number;
	lean: Vec3;
	culmTone: number;
	nodes: BambooNode[];
	branches: BambooBranch[];
}

function addVec3( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];

}

function scaleVec3( vector: Vec3, scale: number ): Vec3 {

	return [ vector[ 0 ] * scale, vector[ 1 ] * scale, vector[ 2 ] * scale ];

}

function lerpVec3( a: Vec3, b: Vec3, t: number ): Vec3 {

	return [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];

}

function culmCenterAt( skeleton: Pick<BambooSkeleton, 'height' | 'lean'>, y: number ): Vec3 {

	const t = Math.max( 0, Math.min( 1, y / skeleton.height ) );
	return [ skeleton.lean[ 0 ] * t, y, skeleton.lean[ 2 ] * t ];

}

function culmRadiusAt( height: number, baseRadius: number, y: number ): number {

	const t = Math.max( 0, Math.min( 1, y / height ) );
	const basalFlareProgress = Math.max( 0, Math.min( 1, y / ( height * 0.1 ) ) );
	const basalFlareEase = basalFlareProgress * basalFlareProgress * ( 3 - 2 * basalFlareProgress );
	const basalFlare = 1 + 0.12 * ( 1 - basalFlareEase );
	const taperLength = height * 0.5;
	const taperStart = height - taperLength;
	const taperT = Math.max( 0, Math.min( 1, ( y - taperStart ) / taperLength ) );
	const taperEase = taperT * taperT * ( 3 - 2 * taperT );
	const taperProgress = taperT * 0.12 + taperEase * 0.88;
	return baseRadius * ( 1 - 0.13 * t ) * ( 1 - 0.97 * taperProgress ) * basalFlare;

}

function getBasalFlareEndY( skeleton: Pick<BambooSkeleton, 'height' | 'nodes'> ): number {

	const nodeClearance = Math.min( skeleton.height * 0.006, 0.03 ) + 0.02;
	const candidates = [ 0.1, 0.09, 0.11, 0.08, 0.12 ].map( ( fraction ) => skeleton.height * fraction );
	return candidates.find( ( y ) => skeleton.nodes.every( ( node ) => Math.abs( node.y - y ) > nodeClearance ) ) ?? skeleton.height * 0.1;

}

function scaleMeshHeight( positions: Float32Array, scale: number ): void {

	for ( let index = 1; index < positions.length; index += 3 ) positions[ index ]! *= scale;

}

function assignBambooInternodeTextureV( profile: BambooCulmSection[] ): void {
	const nodes = profile.filter( ( section ) => section.nodeRing );
	if ( nodes.length === 0 ) {
		for ( const section of profile ) section.uvV = section.y * 2;
		return;
	}

	const uvAt = ( y: number ): number => {
		if ( nodes.length === 1 ) return nodes[ 0 ]!.uvV + ( y - nodes[ 0 ]!.y ) * 2;
		let upperIndex = nodes.findIndex( ( node ) => node.y >= y );
		if ( upperIndex === 0 ) upperIndex = 1;
		if ( upperIndex < 0 ) upperIndex = nodes.length - 1;
		const lower = nodes[ upperIndex - 1 ]!;
		const upper = nodes[ upperIndex ]!;
		const span = upper.y - lower.y;
		return lower.uvV + ( upper.uvV - lower.uvV ) * ( y - lower.y ) / span;
	};

	// Node rings anchor each repeated texture unit. Ground, basal-flare and tip
	// sections interpolate/extrapolate from those anchors instead of resetting V.
	for ( const section of profile ) {
		if ( ! section.nodeRing ) section.uvV = uvAt( section.y );
	}

}

function createBambooSkeleton( seed: number, height: number ): BambooSkeleton {

	const random = createRandom( seed );
	const rootDepth = getStylizedRootDepth( height );
	// Keep culm diameter independent of height. The old five-metre default produced
	// roughly this 13.5–16 cm diameter, and taller specimens gain tiers instead.
	const baseRadius = random.range( 0.0675, 0.08 );
	const bend = random.range( 0, Math.PI * 2 );
	const leanLength = height * random.range( 0.018, 0.04 );
	const lean: Vec3 = [ Math.cos( bend ) * leanLength, 0, Math.sin( bend ) * leanLength ];
	const culmTone = random.range( 0.94, 1.06 );
	const nodeDelta = Math.min( height * 0.006, 0.03 );
	const nodes: BambooNode[] = [];
	const nodeEnd = Math.max( 0, height - 0.34 );
	let nominalY = random.range( 0.34, 0.48 );

	while ( nominalY < nodeEnd ) {

		const jitter = random.range( - 0.045, 0.045 );
		const y = Math.max( 0.12, Math.min( nodeEnd, nominalY + jitter ) );
		const radius = culmRadiusAt( height, baseRadius, y );
		nodes.push( { y, radius, center: culmCenterAt( { height, lean }, y ) } );
		nominalY += random.range( 0.43, 0.56 );

	}

	const branches: BambooBranch[] = [];
	const foliageStart = height * 0.44;
	const foliageEnd = height - Math.min( 0.15, height * 0.025 );
	const upperNodes = nodes.filter( ( node ) => node.y >= foliageStart && node.y <= foliageEnd );
	let pairAzimuth = random.range( 0, Math.PI * 2 );
	const tierPhase = random.int( 0, 3 );
	let branchCurveIndex = 0;
	let branchCurvePattern = [ 1, - 1, 0 ];
	const reachPattern = [ 0.84, 1.14, 0.72, 1.04 ];

	for ( let tier = 0; tier < upperNodes.length; tier ++ ) {

		const node = upperNodes[ tier ]!;
		const relative = Math.max( 0, Math.min( 1, ( node.y - foliageStart ) / ( foliageEnd - foliageStart ) ) );
		const lowerClump = Math.exp( - 0.5 * Math.pow( ( relative - 0.4 ) / 0.12, 2 ) );
		const upperClump = 0.92 * Math.exp( - 0.5 * Math.pow( ( relative - 0.68 ) / 0.13, 2 ) );
		const terminalClump = 0.52 * Math.exp( - 0.5 * Math.pow( ( relative - 0.98 ) / 0.11, 2 ) );
		const clumpEnvelope = Math.max( 0.12, lowerClump, upperClump, terminalClump );
		const patternIndex = ( tier + tierPhase ) % reachPattern.length;
		pairAzimuth += Math.PI + random.range( - 0.26, 0.26 );
		const azimuth = pairAzimuth;
		const pairPolarity = ( tier + tierPhase ) % 2 === 0 ? 1 : - 1;
		const reachScale = reachPattern[ patternIndex ]! * random.range( 0.9, 1.12 );
		const primaryLength = ( 0.48 + clumpEnvelope * 0.9 ) * reachScale;
		const primaryRadius = random.range( 0.014, 0.021 ) * ( 1 - relative * 0.58 );
		const primaryAttachmentCount = relative < 0.18 ? 8 : relative > 0.94 ? 6 : relative > 0.82 ? 8 : clumpEnvelope > 0.7 ? 11 : 10;
		const pair = [
			{ azimuth: azimuth - pairPolarity * 0.2, yOffset: - 0.012, lengthScale: 1, radiusScale: 1, attachmentCount: primaryAttachmentCount, pairIndex: 0 },
			{ azimuth: azimuth + pairPolarity * 0.24, yOffset: 0.012, lengthScale: 0.74, radiusScale: 0.72, attachmentCount: Math.max( 4, Math.round( primaryAttachmentCount * 0.55 ) ), pairIndex: 1 },
		] as const;

		for ( const branchSpec of pair ) {

			const radial: Vec3 = [ Math.cos( branchSpec.azimuth ), 0, Math.sin( branchSpec.azimuth ) ];
			const lateral: Vec3 = [ - Math.sin( branchSpec.azimuth ), 0, Math.cos( branchSpec.azimuth ) ];
			const branchLength = primaryLength * branchSpec.lengthScale;
			const base = addVec3( node.center, addVec3( scaleVec3( radial, node.radius * 0.82 ), [ 0, branchSpec.yOffset, 0 ] ) );
			if ( branchCurveIndex % branchCurvePattern.length === 0 ) {
				branchCurvePattern = [ 1, - 1, 0 ];
				for ( let shuffle = branchCurvePattern.length - 1; shuffle > 0; shuffle -- ) {
					const swap = random.int( 0, shuffle );
					[ branchCurvePattern[ shuffle ], branchCurvePattern[ swap ] ] = [ branchCurvePattern[ swap ]!, branchCurvePattern[ shuffle ]! ];
				}
			}
			const curveSign = branchCurvePattern[ branchCurveIndex % branchCurvePattern.length ]!;
			branchCurveIndex ++;
			// Each seed gets both bow directions and near-straight branches. A stronger
			// control-point offset makes the plan-view curve visible without changing reach.
			const sideways = curveSign === 0 ? random.range( - 0.025, 0.025 ) : curveSign * random.range( 0.12, 0.2 );
			const middleCurve = random.range( 0.75, 0.82 );
			const rise = random.range( 0.08, 0.17 );
			const droop = random.range( 0.08, 0.17 ) * ( 0.55 + relative * 0.45 );
			const middle: Vec3 = addVec3( addVec3( base, scaleVec3( radial, branchLength * 0.5 ) ), addVec3( scaleVec3( lateral, branchLength * sideways * middleCurve ), [ 0, branchLength * rise, 0 ] ) );
			const tip: Vec3 = addVec3( addVec3( base, scaleVec3( radial, branchLength ) ), addVec3( scaleVec3( lateral, branchLength * sideways ), [ 0, branchLength * ( rise - droop ), 0 ] ) );
			const twigRadius = primaryRadius * branchSpec.radiusScale;
			const sprays: BambooBranch['sprays'] = [];
			for ( let sprayIndex = 0; sprayIndex < branchSpec.attachmentCount; sprayIndex ++ ) {
				const spacing = 0.84 / Math.max( 1, branchSpec.attachmentCount - 1 );
				const attachment = 0.08 + ( sprayIndex + 0.5 ) * spacing + random.range( - spacing * 0.18, spacing * 0.18 );
				const sideSign = ( tier + branchSpec.pairIndex + sprayIndex + tierPhase ) % 2 === 0 ? - 1 : 1;
				sprays.push( {
					attachment: Math.min( 0.96, Math.max( 0.08, attachment ) ),
					// Alternating offsets spread nearby spray roots into plan-view volume.
					rotation: sideSign * random.range( 0.2, 0.34 ),
					sideSign,
					roll: random.range( 0.95, 1.15 ),
					scale: random.range( 0.92, 1.08 ),
					shade: random.range( 0.76, 1.14 ),
					cardCount: 1,
					variant: ( tier * 3 + sprayIndex + tierPhase + branchSpec.pairIndex * 2 ) % 4,
				} );
			}

			// Keep the highest node's paired branch structure but leave its sprays
			// empty so the leader tip remains an open, leaf-free shoot.
			const visibleSprays = tier === upperNodes.length - 1 ? [] : sprays;
			branches.push( { base, middle, tip, radii: [ twigRadius, twigRadius * 0.62, twigRadius * 0.18 ], azimuth: branchSpec.azimuth, tier, pairIndex: branchSpec.pairIndex, sprays: visibleSprays } );

		}

	}

	const terminalAzimuth = upperNodes.length > 0
		? pairAzimuth + random.range( - 0.65, 0.65 )
		: random.range( 0, Math.PI * 2 );
	const terminalRadial: Vec3 = [ Math.cos( terminalAzimuth ), 0, Math.sin( terminalAzimuth ) ];
	const terminalBaseY = height - Math.min( 0.62, height * 0.1 );
	const terminalMiddleY = height - Math.min( 0.3, height * 0.05 );
	const terminalTipY = height - Math.min( 0.04, height * 0.01 );
	const terminalBaseRadius = culmRadiusAt( height, baseRadius, terminalBaseY );
	const terminalMiddleRadius = culmRadiusAt( height, baseRadius, terminalMiddleY );
	const terminalTipRadius = culmRadiusAt( height, baseRadius, terminalTipY );
	const terminalBase = addVec3( culmCenterAt( { height, lean }, terminalBaseY ), scaleVec3( terminalRadial, terminalBaseRadius * 0.8 ) );
	const terminalMiddle = addVec3( culmCenterAt( { height, lean }, terminalMiddleY ), scaleVec3( terminalRadial, terminalMiddleRadius + 0.035 ) );
	const terminalTip = addVec3( culmCenterAt( { height, lean }, terminalTipY ), scaleVec3( terminalRadial, terminalTipRadius + 0.09 ) );
	branches.push( {
		base: terminalBase,
		middle: terminalMiddle,
		tip: terminalTip,
		radii: [ 0.009, 0.0055, 0.0018 ],
		azimuth: terminalAzimuth,
		tier: upperNodes.length,
		pairIndex: 2,
		sprays: [],
	} );

	return { height, rootDepth, baseRadius, lean, culmTone, nodes, branches };

}

function addCulm( builder: MeshBuilder, skeleton: BambooSkeleton, sides: number ): void {

	builder.beginGroup( barkPartIndex );
	const delta = Math.min( skeleton.height * 0.006, 0.03 );
	const baseY = - skeleton.rootDepth;
	const profile: BambooCulmSection[] = [
		{ y: baseY, radius: skeleton.baseRadius * 1.12, shade: 0.84, uvV: 0 },
	];

	for ( const [ nodeIndex, node ] of skeleton.nodes.entries() ) {
		const middleY = Math.max( profile[ profile.length - 1 ]!.y + delta, Math.min( skeleton.height - delta, node.y ) );
		const radius = culmRadiusAt( skeleton.height, skeleton.baseRadius, middleY );
		const bandScale = [ 0.92, 1.04, 0.96, 1.08 ][ nodeIndex % 4 ]!;
		const bandShift = Math.sin( ( nodeIndex + 1 ) * 1.7 ) * Math.min( 0.002, delta * 0.08 );
		const bandY = middleY + bandShift;
		const rimRadius = 1.035 + Math.sin( nodeIndex * 1.9 ) * 0.004 + ( bandScale - 1 ) * 0.015;
		// One subtly raised axial ring gives each node a muted collar highlight.
		profile.push( { y: bandY, radius: radius * rimRadius, shade: 0.95, uvV: nodeIndex + 0.5, nodeRing: true } );

	}
	const basalFlareEndY = getBasalFlareEndY( skeleton );
	profile.push( { y: 0, radius: culmRadiusAt( skeleton.height, skeleton.baseRadius, 0 ), shade: 0.95, uvV: 0 } );
	profile.push( { y: basalFlareEndY, radius: culmRadiusAt( skeleton.height, skeleton.baseRadius, basalFlareEndY ), shade: 0.94, uvV: 0 } );
	profile.sort( ( a, b ) => a.y - b.y );

	// Internodes stay as single tapered spans between node sections. The final
	// positive-radius ring sits just below the leader point and forms an open tip.
	const leaderRingY = skeleton.height - Math.min( 0.04, skeleton.height * 0.01 );
	profile.push( { y: leaderRingY, radius: culmRadiusAt( skeleton.height, skeleton.baseRadius, leaderRingY ), shade: 0.9, uvV: skeleton.nodes.length } );
	assignBambooInternodeTextureV( profile );

	const rings: number[][] = [];
	for ( let ring = 0; ring < profile.length; ring ++ ) {
		const section = profile[ ring ]!;
		const center = culmCenterAt( skeleton, section.y );
		const t = Math.max( 0, section.y / skeleton.height );
		const tangent = normalizeVec3( [ skeleton.lean[ 0 ] / skeleton.height, 1, skeleton.lean[ 2 ] / skeleton.height ] );
		const indices: number[] = [];
		for ( let side = 0; side <= sides; side ++ ) {
			const angle = side % sides / sides * Math.PI * 2;
			const radial = normalizeVec3( [ Math.cos( angle ), 0, Math.sin( angle ) ] );
			const slope = radial[ 0 ] * tangent[ 0 ] + radial[ 2 ] * tangent[ 2 ];
			const normal = normalizeVec3( [ radial[ 0 ] - tangent[ 0 ] * slope, radial[ 1 ] - tangent[ 1 ] * slope, radial[ 2 ] - tangent[ 2 ] * slope ] );
			const position = addVec3( center, scaleVec3( radial, section.radius ) );
			const shade = section.shade * skeleton.culmTone * ( 1 - 0.025 * t );
			const color: [ number, number, number ] = section.nodeRing
				? [ shade * 2.2, shade * 2.3, shade * 0.9 ]
				: [ shade * 1.9, shade * 1.9, shade * 0.88 ];
			indices.push( builder.addVertex( position, normal, [ side / sides, section.uvV ], color, 0 ) );
		}
		rings.push( indices );
	}

	for ( let ring = 0; ring < rings.length - 1; ring ++ ) {
		for ( let side = 0; side < sides; side ++ ) {
			const a = rings[ ring ]![ side ]!;
			const b = rings[ ring ]![ side + 1 ]!;
			const c = rings[ ring + 1 ]![ side ]!;
			const d = rings[ ring + 1 ]![ side + 1 ]!;
			builder.addTriangle( a, c, b );
			builder.addTriangle( b, c, d );
		}
	}

	const topCenter = culmCenterAt( skeleton, skeleton.height );
	const leaderNormal = normalizeVec3( [ skeleton.lean[ 0 ] / skeleton.height, 1, skeleton.lean[ 2 ] / skeleton.height ] );
	const top = builder.addVertex( topCenter, leaderNormal, [ 2, 1 ], [ 0.86, 0.89, 0.72 ], 0 );
	const topRing = rings[ rings.length - 1 ]!;
	for ( let side = 0; side < sides; side ++ ) builder.addTriangle( top, topRing[ side + 1 ]!, topRing[ side ]! );

}

function createBambooBarkTexture(): TextureData {

	const width = 32;
	const height = 128;
	const data = new Uint8Array( width * height * 4 );
	const centerY = height / 2;

	for ( let y = 0; y < height; y ++ ) {
		for ( let x = 0; x < width; x ++ ) {
			const distance = Math.abs( y - centerY );
			const upperSide = y > centerY;
			const edge: [ number, number, number ] = upperSide ? [ 206, 212, 188 ] : [ 162, 174, 128 ];
			let color: [ number, number, number ];
			if ( distance <= 1 ) color = [ 255, 250, 205 ];
			else if ( distance < 4 ) {
				const transition = ( distance - 1 ) / 3;
				const eased = transition * transition * ( 3 - 2 * transition );
				color = [
					Math.round( 255 + ( edge[ 0 ] - 255 ) * eased ),
					Math.round( 250 + ( edge[ 1 ] - 250 ) * eased ),
					Math.round( 205 + ( edge[ 2 ] - 205 ) * eased ),
				];
			} else {
				const transitionRange = upperSide ? height - 1 - centerY - 4 : 28;
				const transition = Math.max( 0, Math.min( 1, ( distance - 4 ) / transitionRange ) );
				const eased = transition * transition * ( 3 - 2 * transition );
				const light = Math.round( edge[ 0 ] + ( 255 - edge[ 0 ] ) * eased );
				const green = Math.round( edge[ 1 ] + ( 255 - edge[ 1 ] ) * eased );
				const blue = Math.round( edge[ 2 ] + ( 255 - edge[ 2 ] ) * eased );
				color = [ light, green, blue ];
			}
			const offset = ( y * width + x ) * 4;
			data[ offset ] = color[ 0 ];
			data[ offset + 1 ] = color[ 1 ];
			data[ offset + 2 ] = color[ 2 ];
			data[ offset + 3 ] = 255;
		}
	}

	return { width, height, data, wrapS: 'clamp', wrapT: 'repeat' };

}

function rasterizeSprayPolygon(
	data: Uint8Array,
	size: number,
	polygon: readonly [ number, number ][],
	baseLight: number,
	greenLift = 8,
	blueOffset = - 12,
): void {

	const minimumY = Math.max( 0, Math.floor( Math.min( ...polygon.map( ( point ) => point[ 1 ] ) ) ) );
	const maximumY = Math.min( size - 1, Math.ceil( Math.max( ...polygon.map( ( point ) => point[ 1 ] ) ) ) );
	for ( let y = minimumY; y <= maximumY; y ++ ) {
		const scanY = y + 0.5;
		const intersections: number[] = [];
		for ( let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index ++ ) {
			const [ x0, y0 ] = polygon[ previous ]!;
			const [ x1, y1 ] = polygon[ index ]!;
			if ( ( y0 <= scanY && y1 > scanY ) || ( y1 <= scanY && y0 > scanY ) ) intersections.push( x0 + ( scanY - y0 ) * ( x1 - x0 ) / ( y1 - y0 ) );
		}
		intersections.sort( ( a, b ) => a - b );
		for ( let crossing = 0; crossing + 1 < intersections.length; crossing += 2 ) {
			const startX = Math.max( 0, Math.ceil( intersections[ crossing ]! - 0.5 ) );
			const endX = Math.min( size - 1, Math.floor( intersections[ crossing + 1 ]! - 0.5 ) );
			for ( let x = startX; x <= endX; x ++ ) {
				const offset = ( y * size + x ) * 4;
				const light = Math.min( 255, Math.round( baseLight + 18 * y / size ) );
				data[ offset ] = light;
				data[ offset + 1 ] = Math.min( 255, light + greenLift );
				data[ offset + 2 ] = Math.max( 0, light + blueOffset );
				data[ offset + 3 ] = 255;
			}
		}
	}

}

/** @internal The atlas painter uses this to place each blade on its twig's true left or right side. */
export function getBambooLeafDirection( tangentX: number, tangentY: number, sideSign: - 1 | 1, forward: number, jitter: number ): [ number, number ] {

	const tangentLength = Math.hypot( tangentX, tangentY ) || 1;
	const tangent: [ number, number ] = [ tangentX / tangentLength, tangentY / tangentLength ];
	const side: [ number, number ] = [ - tangent[ 1 ], tangent[ 0 ] ];
	const cosine = Math.cos( jitter );
	const sine = Math.sin( jitter );
	const rotatedSide: [ number, number ] = [ side[ 0 ] * cosine - side[ 1 ] * sine, side[ 0 ] * sine + side[ 1 ] * cosine ];
	const directionX = rotatedSide[ 0 ] * sideSign + tangent[ 0 ] * forward;
	const directionY = rotatedSide[ 1 ] * sideSign + tangent[ 1 ] * forward;
	const length = Math.hypot( directionX, directionY ) || 1;
	return [ directionX / length, directionY / length ];

}

/** @internal Later attachments aim farther toward the twig tip than early leaves. */
export function getBambooLeafForwardWeight( attachmentT: number, startT = 0, endT = 1 ): number {

	const progress = Math.max( 0, Math.min( 1, ( attachmentT - startT ) / Math.max( 1e-5, endT - startT ) ) );
	return 0.35 + progress * 1.3;

}

function createBambooLeafSprayTile( seed: number, variant: number ): Uint8Array {

	const size = bambooSprayTextureSize;
	const data = new Uint8Array( size * size * 4 );
	const layout = bambooSprayVariantLayouts[ variant ]!;
	const random = createRandom( seed * 53 + 19 + variant * 997 );
	const sidePhase = ( Math.abs( Math.trunc( seed ) ) + variant ) % 2;
	const twigSag = layout.sag * 0.45;
	const mainStemAt = ( t: number ): [ number, number ] => [ bambooSprayRootX + bambooSprayStemLength * t, bambooSprayRootY - layout.mainDrop * t - twigSag * Math.sin( Math.PI * t ) ];

	function drawTwig( start: [ number, number ], control: [ number, number ], end: [ number, number ], thickness: number, shade: number, greenLift = 8, blueOffset = - 12 ): void {
		const left: [ number, number ][] = [];
		const right: [ number, number ][] = [];
		for ( let step = 0; step <= 16; step ++ ) {
			const t = step / 16;
			const inverse = 1 - t;
			const x = inverse * inverse * start[ 0 ] + 2 * inverse * t * control[ 0 ] + t * t * end[ 0 ];
			const y = inverse * inverse * start[ 1 ] + 2 * inverse * t * control[ 1 ] + t * t * end[ 1 ];
			const tangentX = 2 * inverse * ( control[ 0 ] - start[ 0 ] ) + 2 * t * ( end[ 0 ] - control[ 0 ] );
			const tangentY = 2 * inverse * ( control[ 1 ] - start[ 1 ] ) + 2 * t * ( end[ 1 ] - control[ 1 ] );
			const tangentLength = Math.hypot( tangentX, tangentY ) || 1;
			const width = thickness * ( 1 - 0.98 * t );
			left.push( [ x - tangentY / tangentLength * width, y + tangentX / tangentLength * width ] );
			right.push( [ x + tangentY / tangentLength * width, y - tangentX / tangentLength * width ] );
		}
		rasterizeSprayPolygon( data, size, [ ...left, ...right.reverse() ], shade, greenLift, blueOffset );
	}

	const mainRoot = mainStemAt( 0 );
	const mainRootTangentY = - layout.mainDrop - twigSag * Math.PI;
	const mainRootTangentLength = Math.hypot( bambooSprayStemLength, mainRootTangentY ) || 1;
	const mainRootOverlap: [ number, number ] = [
		mainRoot[ 0 ] - 5 * bambooSprayStemLength / mainRootTangentLength,
		mainRoot[ 1 ] - 5 * mainRootTangentY / mainRootTangentLength,
	];
	drawTwig( mainRoot, mainStemAt( 0.5 ), mainStemAt( 1 ), 2.2, 145 );
	drawTwig(
		mainRootOverlap,
		[ ( mainRootOverlap[ 0 ] + mainRoot[ 0 ] ) * 0.5, ( mainRootOverlap[ 1 ] + mainRoot[ 1 ] ) * 0.5 ],
		mainRoot,
		2.2,
		145,
	);

	function drawBlade(
		baseX: number,
		baseY: number,
		direction: [ number, number ],
		length: number,
		width: number,
		shade: number,
		greenLift: number,
		blueOffset: number,
	): void {
		// Keep the computed twig-relative direction unchanged; re-aiming blades to
		// fit the atlas can make them point backward or sideways near the margins.
		const directionX = direction[ 0 ];
		const directionY = direction[ 1 ];
		const endX = baseX + directionX * length;
		const endY = baseY + directionY * length;
		const controlX = baseX + ( endX - baseX ) * 0.38 + Math.sign( directionX ) * 5;
		const controlY = baseY + ( endY - baseY ) * 0.68;
		const left: [ number, number ][] = [];
		const right: [ number, number ][] = [];
		for ( let step = 0; step <= 18; step ++ ) {
			const t = step / 18;
			const inverse = 1 - t;
			const x = inverse * inverse * baseX + 2 * inverse * t * controlX + t * t * endX;
			const y = inverse * inverse * baseY + 2 * inverse * t * controlY + t * t * endY;
			const tangentX = 2 * inverse * ( controlX - baseX ) + 2 * t * ( endX - controlX );
			const tangentY = 2 * inverse * ( controlY - baseY ) + 2 * t * ( endY - controlY );
			const tangentLength = Math.hypot( tangentX, tangentY ) || 1;
			// Narrow at the base, widest around one third of the blade, then
			// taper into a long acuminate tip rather than a short diamond point.
			const taper = t < 0.36 ? 0.11 + 0.89 * t / 0.36 : Math.pow( Math.max( 0, ( 1 - t ) / 0.64 ), 1.08 );
			const halfWidth = width * taper * ( 0.82 + 0.18 * Math.sin( Math.PI * t ) );
			const offsetX = - tangentY / tangentLength * halfWidth;
			const offsetY = tangentX / tangentLength * halfWidth;
			left.push( [ x + offsetX, y + offsetY ] );
			right.push( [ x - offsetX, y - offsetY ] );
		}
		rasterizeSprayPolygon( data, size, [ ...left, ...right.reverse() ], shade, greenLift, blueOffset );
		drawTwig( [ baseX, baseY ], [ controlX, controlY ], [ endX, endY ], 0.55, Math.max( 164, shade - 32 ), greenLift, blueOffset );
	}

	for ( let leaf = 0; leaf < layout.leaves; leaf ++ ) {
		const t = Math.max( 0.08, Math.min( 0.94, 0.1 + leaf / ( layout.leaves - 1 ) * 0.8 + random.range( - 0.025, 0.025 ) ) );
		const [ attachX, attachY ] = mainStemAt( t );
		const tangentX = bambooSprayStemLength;
		const tangentY = - layout.mainDrop - layout.sag * Math.PI * Math.cos( Math.PI * t );
		const tangentLength = Math.hypot( tangentX, tangentY ) || 1;
		const tangent: [ number, number ] = [ tangentX / tangentLength, tangentY / tangentLength ];
		const sideAxis: [ number, number ] = [ - tangent[ 1 ], tangent[ 0 ] ];
		const sideSign = ( leaf + sidePhase + variant ) % 2 === 0 ? - 1 : 1;
		const petioleLength = random.range( 3.2, 4.6 );
		const baseX = attachX + sideAxis[ 0 ] * sideSign * petioleLength;
		const baseY = attachY + sideAxis[ 1 ] * sideSign * petioleLength;
		const petioleStart: [ number, number ] = [ attachX - tangent[ 0 ] * 4, attachY - tangent[ 1 ] * 4 ];
		const midX = attachX + sideAxis[ 0 ] * sideSign * petioleLength * 0.52 + tangent[ 0 ] * 1.4;
		const midY = attachY + sideAxis[ 1 ] * sideSign * petioleLength * 0.52 + tangent[ 1 ] * 1.4;
		const forward = getBambooLeafForwardWeight( t, 0.08, 0.94 );
		const direction = getBambooLeafDirection( tangentX, tangentY, sideSign, forward, random.range( - 0.02, 0.02 ) );
		const ageProgress = Math.max( 0, Math.min( 1, ( t - 0.08 ) / ( 0.94 - 0.08 ) ) );
		const leafShade = 188 + ageProgress * 34 + random.range( - 2, 2 );
		const greenLift = 12 + ageProgress * 10;
		const blueOffset = - 14 - ageProgress * 16;
		// Extend the petiole several pixels into the blade base instead of capping it.
		const petioleEnd: [ number, number ] = [ baseX + direction[ 0 ] * 4, baseY + direction[ 1 ] * 4 ];
		drawTwig( petioleStart, [ midX, midY ], petioleEnd, 0.7, Math.max( 164, leafShade - 24 ), greenLift, blueOffset );
		drawBlade( baseX, baseY, direction, random.range( 86, 108 ) * layout.lengthScale, random.range( 5.8, 7.8 ), leafShade, greenLift, blueOffset );
	}

	return data;

}

function createBambooLeafSprayTexture( seed: number ): TextureData {

	const tileSize = bambooSprayTextureSize;
	const atlasSize = bambooSprayAtlasSize;
	const data = new Uint8Array( atlasSize * atlasSize * 4 );
	for ( let variant = 0; variant < bambooSprayVariantLayouts.length; variant ++ ) {
		const tile = createBambooLeafSprayTile( seed, variant );
		const tileX = variant % 2;
		const tileY = Math.floor( variant / 2 );
		for ( let y = 0; y < tileSize; y ++ ) {
			const source = y * tileSize * 4;
			const destination = ( ( tileY * tileSize + y ) * atlasSize + tileX * tileSize ) * 4;
			data.set( tile.subarray( source, source + tileSize * 4 ), destination );
		}
	}
	return { width: atlasSize, height: atlasSize, data, wrap: 'clamp' };

}

function branchPointAt( branch: BambooBranch, t: number ): Vec3 {

	return t <= 0.5 ? lerpVec3( branch.base, branch.middle, t * 2 ) : lerpVec3( branch.middle, branch.tip, ( t - 0.5 ) * 2 );

}

function branchTangentAt( branch: BambooBranch, t: number ): Vec3 {

	const before = branchPointAt( branch, Math.max( 0, t - 0.035 ) );
	const after = branchPointAt( branch, Math.min( 1, t + 0.035 ) );
	return normalizeVec3( [ after[ 0 ] - before[ 0 ], after[ 1 ] - before[ 1 ], after[ 2 ] - before[ 2 ] ] );

}

function branchRadiusAt( branch: BambooBranch, t: number ): number {

	return t <= 0.5
		? branch.radii[ 0 ]! + ( branch.radii[ 1 ]! - branch.radii[ 0 ]! ) * t * 2
		: branch.radii[ 1 ]! + ( branch.radii[ 2 ]! - branch.radii[ 1 ]! ) * ( t - 0.5 ) * 2;

}

const minimumSecondaryTubeLength = 0.28;
const minimumSecondaryTubeRadius = 0.014;

function getSprayBranchPath( branch: BambooBranch, spray: BambooSpray ): { base: Vec3; middle: Vec3; tip: Vec3; radius: number; cardAxis: Vec3 } {

	const base = branchPointAt( branch, spray.attachment );
	const before = branchPointAt( branch, Math.max( 0, spray.attachment - 0.035 ) );
	const after = branchPointAt( branch, Math.min( 1, spray.attachment + 0.035 ) );
	const axis = normalizeVec3( [ after[ 0 ] - before[ 0 ], 0, after[ 2 ] - before[ 2 ] ] );
	const side: Vec3 = [ - axis[ 2 ], 0, axis[ 0 ] ];
	const parentLength = Math.hypot( branch.tip[ 0 ] - branch.base[ 0 ], branch.tip[ 1 ] - branch.base[ 1 ], branch.tip[ 2 ] - branch.base[ 2 ] );
	const reach = parentLength * 0.26 * spray.scale;
	const forwardReach = parentLength * 0.06 * spray.scale;
	const curvedMiddle = addVec3(
		addVec3( base, addVec3( scaleVec3( side, spray.sideSign * reach * 0.56 ), scaleVec3( axis, forwardReach * 0.5 ) ) ),
		[ 0, reach * 0.09, 0 ],
	);
	const tip = addVec3(
		addVec3( base, addVec3( scaleVec3( side, spray.sideSign * reach ), scaleVec3( axis, forwardReach ) ) ),
		[ 0, reach * 0.18, 0 ],
	);
	// Keep the existing card orientation, but put the tube's middle section on
	// the base-to-tip chord so these small offshoots read as straighter twigs.
	const middle = lerpVec3( base, tip, 0.5 );
	const cardAxis = normalizeVec3( [ tip[ 0 ] - curvedMiddle[ 0 ], tip[ 1 ] - curvedMiddle[ 1 ], tip[ 2 ] - curvedMiddle[ 2 ] ] );
	const radius = branchRadiusAt( branch, spray.attachment ) * 0.9;
	return { base, middle, tip, radius, cardAxis };

}

function addSprayBranchIfLarge( builder: MeshBuilder, branch: BambooBranch, spray: BambooSpray, sides: number ): BambooCardAttachment {

	const parentAttachment = branchPointAt( branch, spray.attachment );
	const path = getSprayBranchPath( branch, spray );
	const length = Math.hypot( path.tip[ 0 ] - path.base[ 0 ], path.tip[ 1 ] - path.base[ 1 ], path.tip[ 2 ] - path.base[ 2 ] );
	if ( length < minimumSecondaryTubeLength || path.radius < minimumSecondaryTubeRadius ) return { position: parentAttachment, axis: branchTangentAt( branch, spray.attachment ) };

	addStylizedLimb( builder, [ path.base, path.middle, path.tip ], [ path.radius, path.radius * 0.62, path.radius * 0.18 ], sides, barkPartIndex, ( t ) => 0.35 + t * 0.65, 1, false, 0.01, 2 );
	return {
		position: path.tip,
		axis: path.cardAxis,
	};

}

function addSprayCards( builder: MeshBuilder, spray: BambooBranch['sprays'][ number ], attachment: BambooCardAttachment ): void {

	const rootU = bambooSprayRootX / bambooSprayTextureSize;
	const rootV = bambooSprayRootY / bambooSprayTextureSize;
	const yawFan = [ 0 ];
	const baseYaw = Math.atan2( attachment.axis[ 2 ], attachment.axis[ 0 ] );
	const pitch = Math.atan2( attachment.axis[ 1 ], Math.hypot( attachment.axis[ 0 ], attachment.axis[ 2 ] ) );

	for ( let plane = 0; plane < spray.cardCount; plane ++ ) {
		const yaw = baseYaw + spray.rotation + yawFan[ plane % yawFan.length ]!;
		const outward: Vec3 = [ Math.cos( yaw ) * Math.cos( pitch ), Math.sin( pitch ), Math.sin( yaw ) * Math.cos( pitch ) ];
		const tangent = normalizeVec3( [ outward[ 2 ], 0, - outward[ 0 ] ] );
		// Keep the shallow bank magnitude and alternate its sign around each branch.
		const tiltSign = bambooSprayTiltPattern[ plane % bambooSprayTiltPattern.length ]! * spray.sideSign;
		const bank = tiltSign * spray.roll;
		const right = outward;
		const verticalUp = normalizeVec3( [ - outward[ 0 ] * outward[ 1 ], 1 - outward[ 1 ] * outward[ 1 ], - outward[ 2 ] * outward[ 1 ] ] );
		const up = normalizeVec3( addVec3( scaleVec3( verticalUp, Math.cos( bank ) ), scaleVec3( tangent, Math.sin( bank ) ) ) );
		const variant = ( spray.variant + plane ) % bambooSprayVariantLayouts.length;
		const tileU = ( variant % 2 ) * 0.5;
		const tileV = Math.floor( variant / 2 ) * 0.5;
		// Keep blade dimensions botanical as the culm gains more tiers with height.
		const halfHeight = 0.6 * spray.scale;
		const halfWidth = 0.6 * spray.scale;
		const center = addVec3(
			attachment.position,
			addVec3(
				scaleVec3( right, ( 1 - 2 * rootU ) * halfWidth ),
				scaleVec3( up, ( 1 - 2 * rootV ) * halfHeight ),
			),
		);
		const tint = spray.shade;
		addCard( builder, center, scaleVec3( right, halfWidth ), scaleVec3( up, halfHeight ), [ tileU, tileV, tileU + 0.5, tileV + 0.5 ], [ 0, 1, 0 ], [ tint, tint * 1.06, tint * 0.88 ], 0.6 );
	}

}

function selectBambooSprays( sprays: BambooSpray[], ratio: number ): BambooSpray[] {
	const count = Math.max( 1, Math.round( sprays.length * ratio ) );
	if ( count >= sprays.length ) return sprays;
	const selected: BambooSpray[] = [];
	for ( let index = 0; index < count; index ++ ) selected.push( sprays[ Math.floor( ( index + 0.5 ) * sprays.length / count ) ]! );
	return selected;
}

function buildBambooMesh( skeleton: BambooSkeleton, detail: BambooMeshDetail ): MeshData {

	const builder = new MeshBuilder();
	const cardAttachments: { spray: BambooSpray; attachment: BambooCardAttachment }[] = [];
	addCulm( builder, skeleton, detail.culmSides );
	builder.beginGroup( barkPartIndex );

	for ( let index = 0; index < skeleton.branches.length; index ++ ) {
		const branch = skeleton.branches[ index ]!;
		if ( detail.keepAlternatingSecondary && branch.pairIndex === 1 && branch.tier % 2 !== 0 ) continue;
		addStylizedLimb( builder, [ branch.base, branch.middle, branch.tip ], branch.radii, detail.branchSides, barkPartIndex, ( t ) => 0.2 + t * 0.8, 1, false, 0.01, 2 );
		for ( const spray of selectBambooSprays( branch.sprays, detail.sprayRatio ) ) cardAttachments.push( { spray, attachment: addSprayBranchIfLarge( builder, branch, spray, detail.branchSides ) } );
	}

	builder.beginGroup( leafPartIndex );
	for ( const card of cardAttachments ) addSprayCards( builder, card.spray, card.attachment );

	return builder.build();

}

function buildCollider( skeleton: BambooSkeleton ): ColliderData {

	const builder = new MeshBuilder();
	builder.beginGroup( barkPartIndex );
	const bottom: Vec3 = [ 0, - skeleton.rootDepth, 0 ];
	const basalFlareEndY = getBasalFlareEndY( skeleton );
	const basalFlareEnd = culmCenterAt( skeleton, basalFlareEndY );
	const top = culmCenterAt( skeleton, skeleton.height );
	addTube( builder, [ bottom, [ 0, 0, 0 ], basalFlareEnd, top ], [
		skeleton.baseRadius * 1.12,
		culmRadiusAt( skeleton.height, skeleton.baseRadius, 0 ),
		culmRadiusAt( skeleton.height, skeleton.baseRadius, basalFlareEndY ),
		skeleton.baseRadius * 0.04,
	], 8, {
		color: [ 1, 1, 1 ],
		wind: () => 0,
		capEnd: true,
	} );
	const bottomCenter = builder.addVertex( bottom, [ 0, - 1, 0 ], [ 0.5, 0.5 ], [ 1, 1, 1 ], 0 );
	for ( let side = 0; side < 8; side ++ ) builder.addTriangle( bottomCenter, side, ( side + 1 ) % 8 );
	const mesh = builder.build();
	return { positions: mesh.positions, indices: mesh.indices };

}

export function generateBambooTreeData( options: BambooTreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? DEFAULT_BAMBOO_TREE_HEIGHT;
	const leafColor = options.leafColor ?? DEFAULT_BAMBOO_TREE_LEAF_COLOR;
	const barkColor = options.barkColor ?? DEFAULT_BAMBOO_TREE_BARK_COLOR;
	if ( ! Number.isFinite( height ) || height <= 0 ) throw new RangeError( 'Bamboo tree height must be a positive finite number' );

	const skeleton = createBambooSkeleton( seed, height );
	const built = bambooLodDetails.map( ( detail ) => buildBambooMesh( skeleton, detail ) );
	const lod0 = built[ 0 ]!;
	const collider = buildCollider( skeleton );
	const fit = height / getMeshTop( lod0 );
	// Use the LOD0 fit for every level so all variants share height and silhouette bounds.
	for ( const mesh of built ) scaleMeshHeight( mesh.positions, fit );
	scaleMeshHeight( collider.positions, fit );
	const lods: MeshData[] = [ lod0, built[ 1 ]!, built[ 2 ]!, ...buildStylizedImpostorLods( lod0, height, height * 0.68 ) ];
	const parts: PartDef[] = [
		{
			name: 'bark', defaultColor: barkColor, texture: 'bark',
			roughness: 0.88,
			alphaTest: 0, doubleSided: false, flatShading: false,
		},
		{
			name: 'leaf', defaultColor: leafColor, texture: 'leaf',
			roughness: 0.86,
			alphaTest: 0.5, upNormalCards: true, doubleSided: false, flatShading: false,
		},
		...createStylizedImpostorParts(),
	];

	return {
		kind: 'bamboo-tree',
		parts,
		lods,
		collider,
		textures: { bark: createBambooBarkTexture(), leaf: createBambooLeafSprayTexture( seed ) },
		bounds: { radius: getMeshBoundsRadius( lod0 ), height },
	};

}

export function normalizeBambooTreeGenerationOptions(
	options: BambooTreeOptions,
	colors: Record<string, number> = {},
): NormalizedVegetationGeneration<BambooTreeOptions> {

	const leafColor = colors.leaf ?? options.leafColor ?? DEFAULT_BAMBOO_TREE_LEAF_COLOR;
	const barkColor = colors.bark ?? options.barkColor ?? DEFAULT_BAMBOO_TREE_BARK_COLOR;
	return {
		options: { seed: options.seed, height: options.height ?? DEFAULT_BAMBOO_TREE_HEIGHT, leafColor, barkColor },
		colors: { leaf: leafColor, bark: barkColor },
	};

}
