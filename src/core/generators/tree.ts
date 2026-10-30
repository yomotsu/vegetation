import { buildBillboard, buildSixPlaneImpostor, impostorLod3Part, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import { createBarkTexture, DEFAULT_BARK_COLOR } from '../barkTexture';
import { composeFirSprigTexture, createFirSprigTexture, DEFAULT_LEAF_COLOR, padTextureEdges } from '../leafTexture';
import { registerTextureRegenerator } from '../textureRegenerator';
import type { Color3, ColliderData, MeshData, PartDef, TextureData, TextureGeneratorDef, Vec3, VegetationData } from '../types';

export interface TreeOptions {
	seed?: number;
	height?: number;
	crownSize?: number;
	branchCount?: number;
	leafColor?: number;
}

interface Frond {
	base: Vec3;
	mid: Vec3;
	tip: Vec3;
	angle: number;
	widthDirection: Vec3;
	width: number;
	fold: number;
	radius: number;
	leader: boolean;
}

interface Tier {
	center: Vec3;
	fronds: Frond[];
	frondMesh: MeshData;
	rimRadius: number;
}

interface TreeLayout {
	height: number;
	rootDepth: number;
	trunkSpine: Vec3[];
	trunkRadii: number[];
	tiers: Tier[];
}

const barkColor: Color3 = [ 1, 1, 1 ];
const leafBrightness = 0.75;
const leafVertexColor: Color3 = [ 0.95 * leafBrightness, 0.95 * leafBrightness, 0.95 * leafBrightness ];
const referenceTreeHeight = 7.55;
const trunkTopFraction = 6.6 / referenceTreeHeight;
const barkPartIndex = 0;
const leafPartIndex = 1;
const impostorLod3PartIndex = 2;
const impostorPartIndex = 3;
const leafRingPartIndex = 4;
const frondsPerTier = 5;
const lodFrondFoldRatio = 0.16;
// お椀は縁でしか折れを表せないため、横からの葉の量が LOD0 と揃うよう大きめに持ち上げる。
const bowlFoldRatio = lodFrondFoldRatio * 3.5;
// Tree01 の測定値から幹の半径を設定します。
const trunkProfile = [
	[ - 0.2, 0.36 ],
	[ 0.1, 0.26 ],
	[ 0.3, 0.24 ],
	[ 0.7, 0.205 ],
	[ 1.4, 0.19 ],
	[ 2.4, 0.17 ],
	[ 3.5, 0.146 ],
	[ 4.3, 0.114 ],
	[ 5.2, 0.085 ],
	[ 5.9, 0.053 ],
	[ 6.6, 0.022 ],
] as const;
// Tree01 の測定値から各段の葉張りを設定します。
const frondSizeProfile = [
	[ 1.8, 2.2 ],
	[ 2.4, 2.6 ],
	[ 3.1, 2.1 ],
	[ 3.8, 2.0 ],
	[ 4.4, 1.8 ],
	[ 5.0, 1.6 ],
	[ 5.5, 1.4 ],
	[ 5.8, 1.4 ],
	[ 6.2, 1.2 ],
	[ 6.6, 1.0 ],
] as const;
// Tree01 の測定値から枝の傾きを補間します。
const frondPitchProfile = [
	[ 1.8 / 7.55, - 17, 9 ],
	[ 2.5 / 7.55, - 13, 13 ],
	[ 3.0 / 7.55, - 11, 15 ],
	[ 3.5 / 7.55, - 9, 17 ],
	[ 4.0 / 7.55, - 2, 24 ],
	[ 4.5 / 7.55, 10, 36 ],
	[ 5.0 / 7.55, 15, 41 ],
	[ 5.5 / 7.55, 23, 49 ],
	[ 6.0 / 7.55, 31, 56 ],
	[ 6.5 / 7.55, 51, 76 ],
] as const;

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function add( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];

}

function subtract( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];

}

function multiply( vector: Vec3, scalar: number ): Vec3 {

	return [ vector[ 0 ] * scalar, vector[ 1 ] * scalar, vector[ 2 ] * scalar ];

}

function normalize( vector: Vec3 ): Vec3 {

	const length = Math.hypot( vector[ 0 ], vector[ 1 ], vector[ 2 ] );

	if ( length === 0 || ! Number.isFinite( length ) ) {
		throw new RangeError( 'Expected a finite, non-zero vector' );
	}

	return [ vector[ 0 ] / length, vector[ 1 ] / length, vector[ 2 ] / length ];

}

// 斜面でも根元が浮かないよう、幹を樹高に比例した長さだけ y = 0 より下へ伸ばす。
function getRootDepth( height: number ): number {

	return 0.3 * ( height / referenceTreeHeight );

}

function getTrunkRadius( fraction: number, height: number ): number {

	const referenceY = clamp( fraction, 0, trunkTopFraction ) * referenceTreeHeight;
	const scale = height / referenceTreeHeight;

	for ( let index = 1; index < trunkProfile.length; index ++ ) {

		const lower = trunkProfile[ index - 1 ]!;
		const upper = trunkProfile[ index ]!;

		if ( referenceY <= upper[ 0 ] || index === trunkProfile.length - 1 ) {

			const amount = clamp( ( referenceY - lower[ 0 ] ) / ( upper[ 0 ] - lower[ 0 ] ), 0, 1 );

			return ( lower[ 1 ] + ( upper[ 1 ] - lower[ 1 ] ) * amount ) * scale;

		}

	}

	return trunkProfile[ trunkProfile.length - 1 ]![ 1 ] * scale;

}

function getFrondLength( height: number, y: number ): number {

	const referenceY = y / height * referenceTreeHeight;
	const scale = height / referenceTreeHeight;

	for ( let index = 1; index < frondSizeProfile.length; index ++ ) {

		const lower = frondSizeProfile[ index - 1 ]!;
		const upper = frondSizeProfile[ index ]!;

		if ( referenceY <= upper[ 0 ] || index === frondSizeProfile.length - 1 ) {

			const amount = clamp( ( referenceY - lower[ 0 ] ) / ( upper[ 0 ] - lower[ 0 ] ), 0, 1 );

			return ( lower[ 1 ] + ( upper[ 1 ] - lower[ 1 ] ) * amount ) * scale;

		}

	}

	return frondSizeProfile[ frondSizeProfile.length - 1 ]![ 1 ] * scale;

}

function getFrondPitch( height: number, y: number ): [ number, number ] {

	const fraction = y / height;

	for ( let index = 1; index < frondPitchProfile.length; index ++ ) {

		const lower = frondPitchProfile[ index - 1 ]!;
		const upper = frondPitchProfile[ index ]!;

		if ( fraction <= upper[ 0 ] || index === frondPitchProfile.length - 1 ) {

			const amount = clamp( ( fraction - lower[ 0 ] ) / ( upper[ 0 ] - lower[ 0 ] ), 0, 1 );

			return [
				lower[ 1 ] + ( upper[ 1 ] - lower[ 1 ] ) * amount,
				lower[ 2 ] + ( upper[ 2 ] - lower[ 2 ] ) * amount,
			];

		}

	}

	return [ 0, 0 ];

}

function getTrunkPoint( spine: Vec3[], height: number, fraction: number ): Vec3 {

	const targetY = clamp( fraction, 0, trunkTopFraction ) * height;

	for ( let i = 1; i < spine.length; i ++ ) {

		const previous = spine[ i - 1 ]!;
		const next = spine[ i ]!;

		if ( targetY <= next[ 1 ] ) {

			const amount = ( targetY - previous[ 1 ] ) / ( next[ 1 ] - previous[ 1 ] );

			return [
				previous[ 0 ] + ( next[ 0 ] - previous[ 0 ] ) * amount,
				targetY,
				previous[ 2 ] + ( next[ 2 ] - previous[ 2 ] ) * amount,
			];

		}

	}

	return [ ...spine[ spine.length - 1 ]! ];

}

function makeFrond( base: Vec3, angle: number, length: number, width: number, fold: number, firstPitch: number, secondPitch: number, radius: number, leader: boolean, horizontalScale: number ): Frond {

	const widthDirection: Vec3 = [ - Math.sin( angle ), 0, Math.cos( angle ) ];
	const firstLength = length * 0.4;
	const secondLength = length * 0.6;
	const firstRadians = firstPitch * Math.PI / 180;
	const secondRadians = secondPitch * Math.PI / 180;
	const mid = add( base, [
		Math.cos( angle ) * firstLength * Math.cos( firstRadians ) * horizontalScale,
		firstLength * Math.sin( firstRadians ),
		Math.sin( angle ) * firstLength * Math.cos( firstRadians ) * horizontalScale,
	] );
	const tip = add( mid, [
		Math.cos( angle ) * secondLength * Math.cos( secondRadians ) * horizontalScale,
		secondLength * Math.sin( secondRadians ),
		Math.sin( angle ) * secondLength * Math.cos( secondRadians ) * horizontalScale,
	] );

	return { base, mid, tip, angle, widthDirection, width, fold, radius, leader };

}

function makeTrunkSpine( height: number, lean: Vec3, segments: number ): { spine: Vec3[]; radii: number[] } {

	const spine: Vec3[] = [];
	const radii: number[] = [];

	for ( let i = 0; i <= segments; i ++ ) {

		const progress = i / segments;
		const fraction = progress * trunkTopFraction;
		const curve = progress * progress;

		spine.push( [ lean[ 0 ] * curve, fraction * height, lean[ 2 ] * curve ] );
		radii.push( getTrunkRadius( fraction, height ) );

	}

	return { spine, radii };

}

function createTreeLayout( seed: number, height: number, rootDepth: number, crownSize: number, branchCount: number ): TreeLayout {

	const random = createRandom( seed );
	const trunkLeanAngle = random.range( 0, Math.PI * 2 );
	const trunkLeanMagnitude = height * random.range( 0.004, 0.012 );
	const trunk = makeTrunkSpine( height, [ Math.cos( trunkLeanAngle ) * trunkLeanMagnitude, 0, Math.sin( trunkLeanAngle ) * trunkLeanMagnitude ], 12 );
	const tiers: Tier[] = [];
	const heightScale = height / referenceTreeHeight;
	const maximumRadius = heightScale * 2.42 * crownSize;
	const tierRotation = random.range( 0, Math.PI * 2 );

	for ( let tierIndex = 0; tierIndex < branchCount; tierIndex ++ ) {

		const tierRandom = random.fork( tierIndex + 1 );
		const t = branchCount === 1 ? 0.5 : tierIndex / ( branchCount - 1 );
		const tierY = height * ( ( 1.8 + t * ( 6.2 - 1.8 ) ) / referenceTreeHeight + tierRandom.range( - 0.004, 0.004 ) );
		const radiusProfile = 0.05 + 0.95 * Math.pow( 1 - t, 0.65 );
		const tierRadius = maximumRadius * radiusProfile * tierRandom.range( 0.987, 1.013 );
		const trunkPoint = getTrunkPoint( trunk.spine, height, tierY / height );
		const fronds: Frond[] = [];
		const angleOffset = tierRotation + tierIndex * 0.61803398875 + tierRandom.range( - 0.18, 0.18 );
		for ( let frondIndex = 0; frondIndex < frondsPerTier; frondIndex ++ ) {

			const branchRandom = tierRandom.fork( frondIndex + 101 );
			const angle = angleOffset + frondIndex / frondsPerTier * Math.PI * 2 + branchRandom.range( - 0.2, 0.2 );
			const startDistance = getTrunkRadius( tierY / height, height ) - heightScale * branchRandom.range( 0.015, 0.02 );
			const length = getFrondLength( height, tierY ) * branchRandom.range( 0.99, 1.01 );
			const width = length * 0.85 * branchRandom.range( 0.8, 1.2 ) * crownSize;
			const base = [ trunkPoint[ 0 ] + Math.cos( angle ) * startDistance, tierY, trunkPoint[ 2 ] + Math.sin( angle ) * startDistance ] as Vec3;
			const [ basePitch, tipPitch ] = getFrondPitch( height, tierY );
			const basePitchJitter = branchRandom.range( - 2, 2 );
			const tipPitchJitter = branchRandom.range( - 3, 3 );

			fronds.push( makeFrond( base, angle, length, width, 0.12 * branchRandom.range( 0.8, 1.2 ), basePitch + basePitchJitter, tipPitch + tipPitchJitter, tierRadius, false, crownSize ) );

		}

		if ( tierIndex === branchCount - 1 ) {

			const branchRandom = tierRandom.fork( 901 );
			const angle = angleOffset + Math.PI / 5;
			const leaderY = height * trunkTopFraction;
			const leaderPoint = getTrunkPoint( trunk.spine, height, leaderY / height );
			const base = leaderPoint;
			const fold = 0.12 * branchRandom.range( 0.8, 1.2 );
			const firstPitch = 60 + branchRandom.range( - 4, 4 );
			const secondPitch = 85 + branchRandom.range( - 2, 2 );
			const verticalFactor = 0.4 * Math.sin( firstPitch * Math.PI / 180 ) + 0.6 * Math.sin( secondPitch * Math.PI / 180 );
			const edgeLiftFactor = 0.85 * crownSize * fold;
			const length = Math.min( getFrondLength( height, leaderY ), ( height - leaderY ) / ( verticalFactor + edgeLiftFactor ) );
			const width = length * 0.85 * crownSize;

			fronds.push( makeFrond( base, angle, length, width, fold, firstPitch, secondPitch, tierRadius, true, crownSize ) );

		}

		const tier: Omit<Tier, 'frondMesh' | 'rimRadius'> = { center: trunkPoint, fronds };
		const frondMesh = createTierFrondMesh( tier );
		tiers.push( { ...tier, frondMesh, rimRadius: getTierRimRadius( tier, frondMesh ) } );

	}

	return {
		height,
		rootDepth,
		trunkSpine: trunk.spine,
		trunkRadii: trunk.radii,
		tiers,
	};

}

function getFrondWind( point: Vec3, frond: Frond ): number {

	const distance = Math.hypot( point[ 0 ], point[ 2 ] );

	return clamp( 0.5 + distance / Math.max( 0.02, frond.radius ) * 0.5, 0.5, 1 );

}

function getFrondVertexColor( radius: number, lateral: number ): Color3 {

	if ( lateral === 0.5 ) {

		return [ 1, 1, 1 ];

	}

	const tierLift = clamp( radius / 2.42, 0, 1 ) * 0.03;
	const green = ( 0.96 + tierLift ) * leafBrightness;

	return [ green, green, green ];

}

function getFrondMeanVertexColor( radius: number ): Color3 {

	const edgeColor = getFrondVertexColor( radius, 0 );
	const centerColor = getFrondVertexColor( radius, 0.5 );

	return [
		( edgeColor[ 0 ] + centerColor[ 0 ] ) * 0.5,
		( edgeColor[ 1 ] + centerColor[ 1 ] ) * 0.5,
		( edgeColor[ 2 ] + centerColor[ 2 ] ) * 0.5,
	];

}

function getFrondPoint( frond: Frond, t: number ): Vec3 {

	if ( t <= 0.4 ) {

		return add( frond.base, multiply( subtract( frond.mid, frond.base ), t / 0.4 ) );

	}

	return add( frond.mid, multiply( subtract( frond.tip, frond.mid ), ( t - 0.4 ) / 0.6 ) );

}

function getFrondAverageLine( frond: Frond ): [ Vec3, Vec3 ] {

	const sampleTimes = [ 0, 0.4, 1 ];
	const samplePoints = [ frond.base, frond.mid, frond.tip ];
	const meanTime = sampleTimes.reduce( ( total, value ) => total + value, 0 ) / sampleTimes.length;
	const meanPoint: Vec3 = [ 0, 0, 0 ];

	for ( const point of samplePoints ) {

		meanPoint[ 0 ] += point[ 0 ] / samplePoints.length;
		meanPoint[ 1 ] += point[ 1 ] / samplePoints.length;
		meanPoint[ 2 ] += point[ 2 ] / samplePoints.length;

	}

	let variance = 0;
	const covariance: Vec3 = [ 0, 0, 0 ];

	for ( let index = 0; index < sampleTimes.length; index ++ ) {

		const timeOffset = sampleTimes[ index ]! - meanTime;
		const point = samplePoints[ index ]!;

		variance += timeOffset * timeOffset;
		covariance[ 0 ] += timeOffset * ( point[ 0 ] - meanPoint[ 0 ] );
		covariance[ 1 ] += timeOffset * ( point[ 1 ] - meanPoint[ 1 ] );
		covariance[ 2 ] += timeOffset * ( point[ 2 ] - meanPoint[ 2 ] );

	}

	const slope = multiply( covariance, 1 / variance );
	const tip = add( frond.base, slope );
	tip[ 1 ] = Math.min( tip[ 1 ], frond.tip[ 1 ] );

	return [ frond.base, tip ];

}

interface LeafBowlTier {
	center: Vec3;
	fronds: Frond[];
	rimPoints: Vec3[];
	midPoints: Vec3[];
	rimRadius: number;
	color: Color3;
}

function getLeafBowlTier( layout: TreeLayout, tier: Tier, lod: 1 | 2 ): LeafBowlTier {

	const fronds = tier.fronds.filter( ( frond ) => ! frond.leader );
	const meanBaseY = fronds.reduce( ( total, frond ) => total + frond.base[ 1 ] / fronds.length, 0 );
	const center: Vec3 = [ tier.center[ 0 ], meanBaseY, tier.center[ 2 ] ];
	const color: Color3 = [ 0, 0, 0 ];
	const directionHeights: number[] = [];
	const rimPoints: Vec3[] = [];
	const midPoints = lod === 1 ? fronds.map( ( frond ) => getFrondPoint( frond, 0.4 ) ) : [];

	for ( const frond of fronds ) {

		const meanColor = getFrondMeanVertexColor( frond.radius );
		color[ 0 ] += meanColor[ 0 ] / fronds.length;
		color[ 1 ] += meanColor[ 1 ] / fronds.length;
		color[ 2 ] += meanColor[ 2 ] / fronds.length;
		const line = lod === 1 ? [ getFrondPoint( frond, 0.4 ), frond.tip ] as [ Vec3, Vec3 ] : getFrondAverageLine( frond );
		const start = line[ 0 ];
		const end = line[ 1 ];
		const startRadius = Math.hypot( start[ 0 ] - tier.center[ 0 ], start[ 2 ] - tier.center[ 2 ] );
		const horizontalLength = Math.hypot( end[ 0 ] - start[ 0 ], end[ 2 ] - start[ 2 ] );
		const amount = horizontalLength === 0 ? 0 : ( tier.rimRadius - startRadius ) / horizontalLength;

		directionHeights.push( Math.min( layout.height, start[ 1 ] + ( end[ 1 ] - start[ 1 ] ) * amount ) );

	}

	for ( let index = 0; index < fronds.length; index ++ ) {

		const frond = fronds[ index ]!;
		const next = ( index + 1 ) % fronds.length;
		const nextAngle = fronds[ next ]!.angle + ( next === 0 ? Math.PI * 2 : 0 );
		const angle = frond.angle;
		const midpointAngle = ( angle + nextAngle ) * 0.5;
		const directionHeight = directionHeights[ index ]!;
		// 葉と葉の間を持ち上げ、LOD0 の V 字の折れによる横からの厚みを残す。
		const foldHeight = ( frond.width + fronds[ next ]!.width ) * 0.5 * bowlFoldRatio;
		const midpointHeight = Math.min( layout.height, ( directionHeight + directionHeights[ next ]! ) * 0.5 + foldHeight );

		rimPoints.push( [ tier.center[ 0 ] + Math.cos( angle ) * tier.rimRadius, directionHeight, tier.center[ 2 ] + Math.sin( angle ) * tier.rimRadius ] );
		rimPoints.push( [ tier.center[ 0 ] + Math.cos( midpointAngle ) * tier.rimRadius, midpointHeight, tier.center[ 2 ] + Math.sin( midpointAngle ) * tier.rimRadius ] );

	}

	return { center, fronds, rimPoints, midPoints, rimRadius: tier.rimRadius, color };

}

// 段は横一列に並べる（1 段 128 px）。2 のべき乗の正方形に詰めると 1 段 64 px になり、LOD1/2 の枝葉がまばらに見えた。
// 1280×128 などの幅は 4 の倍数なので、ブロック圧縮にも使える。
function getLeafRingTileGrid( tierCount: number ): { columns: number; rows: number } {

	return { columns: Math.max( 1, tierCount ), rows: 1 };

}

function getLeafRingUv( tierIndex: number, tileColumns: number, tileRows: number, center: Vec3, radius: number, point: Vec3 ): [ number, number ] {

	const localU = 0.5 + ( point[ 0 ] - center[ 0 ] ) / ( 2 * radius );
	const localV = 0.5 + ( point[ 2 ] - center[ 2 ] ) / ( 2 * radius );
	const tileX = tierIndex % tileColumns;
	const tileY = Math.floor( tierIndex / tileColumns );

	return [ ( tileX + localU ) / tileColumns, ( tileY + localV ) / tileRows ];

}

function addLeafRingLod2( builder: MeshBuilder, layout: TreeLayout ): void {

	builder.beginGroup( leafRingPartIndex );
	const tileGrid = getLeafRingTileGrid( layout.tiers.length );

	for ( let tierIndex = 0; tierIndex < layout.tiers.length; tierIndex ++ ) {

		const tier = layout.tiers[ tierIndex ]!;
		const bowl = getLeafBowlTier( layout, tier, 2 );
		const frond = bowl.fronds[ 0 ]!;
		const centerIndex = builder.addVertex( bowl.center, [ 0, 1, 0 ], getLeafRingUv( tierIndex, tileGrid.columns, tileGrid.rows, tier.center, bowl.rimRadius, bowl.center ), bowl.color, getFrondWind( bowl.center, frond ) );
		const rimIndices = bowl.rimPoints.map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], getLeafRingUv( tierIndex, tileGrid.columns, tileGrid.rows, tier.center, bowl.rimRadius, point ), bowl.color, getFrondWind( point, bowl.fronds[ Math.floor( index / 2 ) ]! ) ) );

		for ( let index = 0; index < rimIndices.length; index ++ ) {

			const current = rimIndices[ index ]!;
			const next = rimIndices[ ( index + 1 ) % rimIndices.length ]!;
			builder.addTriangle( centerIndex, next, current );

		}

	}

}

function addLeafRingLod1( builder: MeshBuilder, layout: TreeLayout ): void {

	builder.beginGroup( leafRingPartIndex );
	const tileGrid = getLeafRingTileGrid( layout.tiers.length );

	for ( let tierIndex = 0; tierIndex < layout.tiers.length; tierIndex ++ ) {

		const tier = layout.tiers[ tierIndex ]!;
		const bowl = getLeafBowlTier( layout, tier, 1 );
		const frond = bowl.fronds[ 0 ]!;
		const centerIndex = builder.addVertex( bowl.center, [ 0, 1, 0 ], getLeafRingUv( tierIndex, tileGrid.columns, tileGrid.rows, tier.center, bowl.rimRadius, bowl.center ), bowl.color, getFrondWind( bowl.center, frond ) );
		const midIndices = bowl.midPoints.map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], getLeafRingUv( tierIndex, tileGrid.columns, tileGrid.rows, tier.center, bowl.rimRadius, point ), bowl.color, getFrondWind( point, bowl.fronds[ index ]! ) ) );
		const rimIndices = bowl.rimPoints.map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], getLeafRingUv( tierIndex, tileGrid.columns, tileGrid.rows, tier.center, bowl.rimRadius, point ), bowl.color, getFrondWind( point, bowl.fronds[ Math.floor( index / 2 ) ]! ) ) );

		for ( let index = 0; index < midIndices.length; index ++ ) {

			const current = midIndices[ index ]!;
			const next = midIndices[ ( index + 1 ) % midIndices.length ]!;
			builder.addTriangle( centerIndex, next, current );

			const rimCurrent = rimIndices[ index * 2 ]!;
			const rimMidpoint = rimIndices[ index * 2 + 1 ]!;
			const rimNext = rimIndices[ ( index * 2 + 2 ) % rimIndices.length ]!;
			builder.addTriangle( current, rimMidpoint, rimCurrent );
			builder.addTriangle( current, rimNext, rimMidpoint );
			builder.addTriangle( current, next, rimNext );

		}

	}

}

function addFrond( builder: MeshBuilder, frond: Frond, longitudinalSamples: number[] ): void {

	const inset = 1 / 512;
	const grid: number[][] = [];
	const lateralSamples = [ 0, 0.5, 1 ];

	for ( let row = 0; row < longitudinalSamples.length; row ++ ) {

		const t = longitudinalSamples[ row ]!;
		const center = getFrondPoint( frond, t );
		const indices: number[] = [];

		for ( let column = 0; column < lateralSamples.length; column ++ ) {

			const u = lateralSamples[ column ]!;
			const widthOffset = ( u - 0.5 ) * frond.width;
			const foldOffset = Math.abs( u * 2 - 1 ) * frond.width * frond.fold;
			const point = add( add( center, multiply( frond.widthDirection, widthOffset ) ), [ 0, foldOffset, 0 ] );
			const uv: [ number, number ] = [ inset + ( 1 - inset * 2 ) * u, t ];

			indices.push( builder.addVertex( point, [ 0, 1, 0 ], uv, getFrondVertexColor( frond.radius, u ), getFrondWind( point, frond ) ) );

		}

		grid.push( indices );

	}

	for ( let row = 0; row < grid.length - 1; row ++ ) {

		for ( let column = 0; column < grid[ row ]!.length - 1; column ++ ) {

			const a = grid[ row ]![ column ]!;
			const b = grid[ row ]![ column + 1 ]!;
			const c = grid[ row + 1 ]![ column ]!;
			const d = grid[ row + 1 ]![ column + 1 ]!;

			builder.addTriangle( a, b, c );
			builder.addTriangle( b, d, c );

		}

	}

}

function createTierFrondMesh( tier: Pick<Tier, 'fronds'> ): MeshData {

	const builder = new MeshBuilder();

	for ( const frond of tier.fronds ) {

		if ( frond.leader ) continue;
		addFrond( builder, frond, [ 0, 0.4, 1 ] );

	}

	return builder.build();

}

function getLeafRingCellSize( cells: number ): number {

	if ( cells > 4096 ) {
		throw new RangeError( 'Tree branchCount cannot exceed 4096 when creating leafRing' );
	}

	let size = 128;

	while ( cells * size > 4096 && size > 4 ) {
		size /= 2;
	}

	return size;

}

function getTierRimRadius( tier: Pick<Tier, 'center' | 'fronds'>, frondMesh = createTierFrondMesh( tier ) ): number {

	let maximumDistance = 0;

	for ( let vertex = 0; vertex < frondMesh.positions.length / 3; vertex ++ ) {

		const x = frondMesh.positions[ vertex * 3 ]! - tier.center[ 0 ];
		const z = frondMesh.positions[ vertex * 3 + 2 ]! - tier.center[ 2 ];
		maximumDistance = Math.max( maximumDistance, Math.hypot( x, z ) );

	}

	return maximumDistance / Math.cos( Math.PI / 10 );

}

function createLeafRingTexture( layout: TreeLayout, leafTexture: TextureData ): TextureData {

	const cellSize = getLeafRingCellSize( layout.tiers.length );
	const tileGrid = getLeafRingTileGrid( layout.tiers.length );
	const width = tileGrid.columns * cellSize;
	const height = tileGrid.rows * cellSize;
	const data = new Uint8Array( width * height * 4 );
	const worldXs = new Float64Array( cellSize );
	const worldZs = new Float64Array( cellSize );
	const depth = new Float32Array( cellSize * cellSize );
	const sample = new Uint8Array( 4 );
	const leafData = leafTexture.data;
	const leafWidth = leafTexture.width;
	const leafHeight = leafTexture.height;

	for ( let tierIndex = 0; tierIndex < layout.tiers.length; tierIndex ++ ) {

		const tier = layout.tiers[ tierIndex ]!;
		const frondMesh = tier.frondMesh;
		const rimRadius = tier.rimRadius;
		const tileX = ( tierIndex % tileGrid.columns ) * cellSize;
		const tileY = Math.floor( tierIndex / tileGrid.columns ) * cellSize;
		for ( let pixel = 0; pixel < cellSize; pixel ++ ) {
			worldXs[ pixel ] = tier.center[ 0 ] + ( ( pixel + 0.5 ) / cellSize - 0.5 ) * 2 * rimRadius;
			worldZs[ pixel ] = tier.center[ 2 ] + ( ( pixel + 0.5 ) / cellSize - 0.5 ) * 2 * rimRadius;
		}
		depth.fill( - Infinity );

		for ( let triangle = 0; triangle < frondMesh.indices.length; triangle += 3 ) {

			const firstIndex = frondMesh.indices[ triangle ]!;
			const secondIndex = frondMesh.indices[ triangle + 1 ]!;
			const thirdIndex = frondMesh.indices[ triangle + 2 ]!;
			const firstVertex = firstIndex * 3;
			const secondVertex = secondIndex * 3;
			const thirdVertex = thirdIndex * 3;
			const firstX = frondMesh.positions[ firstVertex ]!;
			const firstY = frondMesh.positions[ firstVertex + 1 ]!;
			const firstZ = frondMesh.positions[ firstVertex + 2 ]!;
			const secondX = frondMesh.positions[ secondVertex ]!;
			const secondY = frondMesh.positions[ secondVertex + 1 ]!;
			const secondZ = frondMesh.positions[ secondVertex + 2 ]!;
			const thirdX = frondMesh.positions[ thirdVertex ]!;
			const thirdY = frondMesh.positions[ thirdVertex + 1 ]!;
			const thirdZ = frondMesh.positions[ thirdVertex + 2 ]!;
			const firstU = frondMesh.uvs[ firstIndex * 2 ]!;
			const firstV = frondMesh.uvs[ firstIndex * 2 + 1 ]!;
			const secondU = frondMesh.uvs[ secondIndex * 2 ]!;
			const secondV = frondMesh.uvs[ secondIndex * 2 + 1 ]!;
			const thirdU = frondMesh.uvs[ thirdIndex * 2 ]!;
			const thirdV = frondMesh.uvs[ thirdIndex * 2 + 1 ]!;
			const denominator = ( secondZ - thirdZ ) * ( firstX - thirdX ) + ( thirdX - secondX ) * ( firstZ - thirdZ );

			if ( Math.abs( denominator ) < 1e-10 ) continue;

			const firstPixelX = ( ( firstX - tier.center[ 0 ] ) / ( 2 * rimRadius ) + 0.5 ) * cellSize - 0.5;
			const secondPixelX = ( ( secondX - tier.center[ 0 ] ) / ( 2 * rimRadius ) + 0.5 ) * cellSize - 0.5;
			const thirdPixelX = ( ( thirdX - tier.center[ 0 ] ) / ( 2 * rimRadius ) + 0.5 ) * cellSize - 0.5;
			const firstPixelY = ( ( firstZ - tier.center[ 2 ] ) / ( 2 * rimRadius ) + 0.5 ) * cellSize - 0.5;
			const secondPixelY = ( ( secondZ - tier.center[ 2 ] ) / ( 2 * rimRadius ) + 0.5 ) * cellSize - 0.5;
			const thirdPixelY = ( ( thirdZ - tier.center[ 2 ] ) / ( 2 * rimRadius ) + 0.5 ) * cellSize - 0.5;
			const minimumX = Math.max( 0, Math.floor( Math.min( firstPixelX, secondPixelX, thirdPixelX ) ) );
			const maximumX = Math.min( cellSize - 1, Math.ceil( Math.max( firstPixelX, secondPixelX, thirdPixelX ) ) );
			const minimumY = Math.max( 0, Math.floor( Math.min( firstPixelY, secondPixelY, thirdPixelY ) ) );
			const maximumY = Math.min( cellSize - 1, Math.ceil( Math.max( firstPixelY, secondPixelY, thirdPixelY ) ) );
			for ( let y = minimumY; y <= maximumY; y ++ ) {

				const worldZ = worldZs[ y ]!;
				const textureRowOffset = ( tileY + y ) * width + tileX;

				for ( let x = minimumX; x <= maximumX; x ++ ) {

					const worldX = worldXs[ x ]!;
					const firstWeight = ( ( secondZ - thirdZ ) * ( worldX - thirdX ) + ( thirdX - secondX ) * ( worldZ - thirdZ ) ) / denominator;
					const secondWeight = ( ( thirdZ - firstZ ) * ( worldX - thirdX ) + ( firstX - thirdX ) * ( worldZ - thirdZ ) ) / denominator;
					const thirdWeight = 1 - firstWeight - secondWeight;

					if ( firstWeight < - 1e-6 || secondWeight < - 1e-6 || thirdWeight < - 1e-6 ) continue;

					const height = firstWeight * firstY + secondWeight * secondY + thirdWeight * thirdY;
					const pixelIndex = y * cellSize + x;
					const sourceU = firstWeight * firstU + secondWeight * secondU + thirdWeight * thirdU;
					const sourceV = firstWeight * firstV + secondWeight * secondV + thirdWeight * thirdV;
					const textureIndex = ( textureRowOffset + x ) * 4;
					const textureX = clamp( clamp( sourceU, 0, 1 ) * leafWidth - 0.5, 0, leafWidth - 1 );
					const textureY = clamp( clamp( sourceV, 0, 1 ) * leafHeight - 0.5, 0, leafHeight - 1 );
					const textureX0 = Math.floor( textureX );
					const textureY0 = Math.floor( textureY );
					const textureX1 = Math.min( textureX0 + 1, leafWidth - 1 );
					const textureY1 = Math.min( textureY0 + 1, leafHeight - 1 );
					const xAmount = clamp( textureX - textureX0, 0, 1 );
					const yAmount = clamp( textureY - textureY0, 0, 1 );
					const topLeftIndex = ( textureY0 * leafWidth + textureX0 ) * 4;
					const topRightIndex = ( textureY0 * leafWidth + textureX1 ) * 4;
					const bottomLeftIndex = ( textureY1 * leafWidth + textureX0 ) * 4;
					const bottomRightIndex = ( textureY1 * leafWidth + textureX1 ) * 4;

					for ( let channel = 0; channel < 4; channel ++ ) {
						const topLeft = leafData[ topLeftIndex + channel ]!;
						const topRight = leafData[ topRightIndex + channel ]!;
						const bottomLeft = leafData[ bottomLeftIndex + channel ]!;
						const bottomRight = leafData[ bottomRightIndex + channel ]!;
						const top = topLeft + ( topRight - topLeft ) * xAmount;
						const bottom = bottomLeft + ( bottomRight - bottomLeft ) * xAmount;
						sample[ channel ] = Math.round( top + ( bottom - top ) * yAmount );
					}

					// 透明な葉の隙間が下の不透明な葉を消さないよう、不透明な面同士だけで高さを比べる。
					const sampleOpaque = sample[ 3 ]! >= 128;
					const currentOpaque = data[ textureIndex + 3 ]! >= 128;

					if ( sampleOpaque ? currentOpaque && height <= depth[ pixelIndex ]! : currentOpaque || sample[ 3 ]! <= data[ textureIndex + 3 ]! ) continue;

					depth[ pixelIndex ] = height;

					for ( let channel = 0; channel < 4; channel ++ ) {
						data[ textureIndex + channel ] = sample[ channel ]!;
					}

				}

			}

		}

	}

	const texture: TextureData = { width, height, data };
	padTextureEdges( texture, cellSize, layout.tiers.length );

	return texture;

}

function addFronds( builder: MeshBuilder, layout: TreeLayout, longitudinalSamples: number[] ): void {

	builder.beginGroup( leafPartIndex );

	for ( const tier of layout.tiers ) {

		for ( const frond of tier.fronds ) {

			addFrond( builder, frond, longitudinalSamples );

		}

	}

}

function getFrondUv( lateral: number, longitudinal: number ): [ number, number ] {

	const inset = 1 / 512;

	return [ inset + ( 1 - inset * 2 ) * lateral, longitudinal ];

}

function addFoldedFrondsLod1( builder: MeshBuilder, layout: TreeLayout ): void {

	builder.beginGroup( leafPartIndex );

	for ( const tier of layout.tiers ) {

		for ( const frond of tier.fronds ) {

			if ( ! frond.leader ) continue;

			const halfWidth = frond.width * 0.5;
			const foldHeight = frond.width * lodFrondFoldRatio;
			const baseFoldHeight = Math.min( foldHeight, layout.height - frond.base[ 1 ] );
			const tipFoldHeight = Math.min( foldHeight, layout.height - frond.tip[ 1 ] );
			const meanColor = getFrondMeanVertexColor( frond.radius );
			const rows: number[][] = [];

			for ( const t of [ 0, 0.4, 1 ] ) {

				const center = getFrondPoint( frond, t );
				const rowFoldHeight = Math.min( foldHeight, layout.height - center[ 1 ] );
				const leftFoldHeight = t === 0 ? baseFoldHeight : t === 1 ? tipFoldHeight : rowFoldHeight;
				const rightFoldHeight = t === 0 ? baseFoldHeight : t === 1 ? tipFoldHeight : rowFoldHeight;
				const leftPoint = add( add( center, multiply( frond.widthDirection, - halfWidth ) ), [ 0, leftFoldHeight, 0 ] );
				const rightPoint = add( add( center, multiply( frond.widthDirection, halfWidth ) ), [ 0, - rightFoldHeight, 0 ] );
				const left = builder.addVertex( leftPoint, [ 0, 1, 0 ], getFrondUv( 0, t ), meanColor, getFrondWind( leftPoint, frond ) );
				const right = builder.addVertex( rightPoint, [ 0, 1, 0 ], getFrondUv( 1, t ), meanColor, getFrondWind( rightPoint, frond ) );

				rows.push( [ left, right ] );

			}

			for ( let row = 0; row < rows.length - 1; row ++ ) {

				const a = rows[ row ]![ 0 ]!;
				const b = rows[ row ]![ 1 ]!;
				const c = rows[ row + 1 ]![ 0 ]!;
				const d = rows[ row + 1 ]![ 1 ]!;

				builder.addTriangle( a, b, c );
				builder.addTriangle( b, d, c );

			}

		}

	}

}

function addFoldedFrondsLod2( builder: MeshBuilder, layout: TreeLayout ): void {

	builder.beginGroup( leafPartIndex );

	for ( const tier of layout.tiers ) {

		for ( const frond of tier.fronds ) {

			if ( ! frond.leader ) continue;

			const tip = getFrondAverageLine( frond )[ 1 ];
			const halfWidth = frond.width * 0.5;
			const foldHeight = frond.width * lodFrondFoldRatio;
			const baseFoldHeight = Math.min( foldHeight, layout.height - frond.base[ 1 ] );
			const tipFoldHeight = Math.min( foldHeight, layout.height - tip[ 1 ] );
			const baseLeftPoint = add( add( frond.base, multiply( frond.widthDirection, - halfWidth ) ), [ 0, baseFoldHeight, 0 ] );
			const baseRightPoint = add( add( frond.base, multiply( frond.widthDirection, halfWidth ) ), [ 0, - baseFoldHeight, 0 ] );
			const tipLeftPoint = add( add( tip, multiply( frond.widthDirection, - halfWidth ) ), [ 0, tipFoldHeight, 0 ] );
			const tipRightPoint = add( add( tip, multiply( frond.widthDirection, halfWidth ) ), [ 0, - tipFoldHeight, 0 ] );
			const baseLeft = builder.addVertex( baseLeftPoint, [ 0, 1, 0 ], getFrondUv( 0, 0 ), getFrondMeanVertexColor( frond.radius ), getFrondWind( baseLeftPoint, frond ) );
			const baseRight = builder.addVertex( baseRightPoint, [ 0, 1, 0 ], getFrondUv( 1, 0 ), getFrondMeanVertexColor( frond.radius ), getFrondWind( baseRightPoint, frond ) );
			const tipLeft = builder.addVertex( tipLeftPoint, [ 0, 1, 0 ], getFrondUv( 0, 1 ), getFrondMeanVertexColor( frond.radius ), getFrondWind( tipLeftPoint, frond ) );
			const tipRight = builder.addVertex( tipRightPoint, [ 0, 1, 0 ], getFrondUv( 1, 1 ), getFrondMeanVertexColor( frond.radius ), getFrondWind( tipRightPoint, frond ) );

			builder.addTriangle( baseLeft, baseRight, tipLeft );
			builder.addTriangle( baseRight, tipRight, tipLeft );

		}

	}

}

function selectTrunkRings( layout: TreeLayout, indices: number[] ): { spine: Vec3[]; radii: number[] } {

	return {
		spine: indices.map( ( index ) => layout.trunkSpine[ index ]! ),
		radii: indices.map( ( index ) => layout.trunkRadii[ index ]! ),
	};

}

function scaleTrunkV( mesh: MeshData, trunkVertexCount: number ): void {

	for ( let vertex = 0; vertex < trunkVertexCount; vertex ++ ) {

		mesh.uvs[ vertex * 2 + 1 ] = mesh.uvs[ vertex * 2 + 1 ]! * 2.5;

	}

}

function closeTrunkTip( mesh: MeshData, ringCount: number, sides: number, tipNormal: Vec3 ): MeshData {

	const ringStride = sides + 1;
	const topStart = ( ringCount - 1 ) * ringStride;
	const topEnd = topStart + ringStride;
	const indices: number[] = [];
	const groups = [];

	mesh.normals[ topStart * 3 ] = tipNormal[ 0 ];
	mesh.normals[ topStart * 3 + 1 ] = tipNormal[ 1 ];
	mesh.normals[ topStart * 3 + 2 ] = tipNormal[ 2 ];
	mesh.uvs[ topStart * 2 ] = 0.5;
	mesh.uvs[ topStart * 2 + 1 ] = 1;

	for ( const group of mesh.groups ) {

		const start = indices.length;

		for ( let index = group.start; index < group.start + group.count; index += 3 ) {

			const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ].map( ( vertex ) => vertex >= topStart && vertex < topEnd ? topStart : vertex );

			if ( triangle[ 0 ] === triangle[ 1 ] || triangle[ 1 ] === triangle[ 2 ] || triangle[ 2 ] === triangle[ 0 ] ) {

				continue;

			}

			indices.push( triangle[ 0 ]!, triangle[ 1 ]!, triangle[ 2 ]! );

		}

		if ( indices.length > start ) {

			groups.push( { start, count: indices.length - start, partIndex: group.partIndex } );

		}

	}

	const usedVertices = new Set( indices );
	const vertexMap = new Map<number, number>();
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const colors: number[] = [];
	const windWeight: number[] = [];
	const impostorCard: number[] = [];

	for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {

		if ( ! usedVertices.has( vertex ) ) {

			continue;

		}

		vertexMap.set( vertex, positions.length / 3 );
		positions.push( mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! );
		normals.push( mesh.normals[ vertex * 3 ]!, mesh.normals[ vertex * 3 + 1 ]!, mesh.normals[ vertex * 3 + 2 ]! );
		uvs.push( mesh.uvs[ vertex * 2 ]!, mesh.uvs[ vertex * 2 + 1 ]! );
		colors.push( mesh.colors[ vertex * 3 ]!, mesh.colors[ vertex * 3 + 1 ]!, mesh.colors[ vertex * 3 + 2 ]! );
		windWeight.push( mesh.windWeight[ vertex ]! );
		impostorCard.push( mesh.impostorCard[ vertex ]! );

	}

	return {
		positions: new Float32Array( positions ),
		normals: new Float32Array( normals ),
		uvs: new Float32Array( uvs ),
		colors: new Float32Array( colors ),
		windWeight: new Float32Array( windWeight ),
		impostorCard: new Float32Array( impostorCard ),
		indices: new Uint32Array( indices.map( ( vertex ) => vertexMap.get( vertex )! ) ),
		groups,
	};

}

function addRootRing( spine: Vec3[], radii: number[], rootDepth: number ): { spine: Vec3[]; radii: number[] } {

	if ( rootDepth === 0 ) {

		return { spine, radii };

	}

	const ground = spine[ 0 ]!;

	return {
		spine: [ [ ground[ 0 ], - rootDepth, ground[ 2 ] ], ...spine ],
		radii: [ radii[ 0 ]!, ...radii ],
	};

}

function addPointedTrunk( builder: MeshBuilder, spine: Vec3[], radii: number[], sides: number, rootDepth: number ): number {

	const pointedRadii = [ ...radii ];
	pointedRadii[ pointedRadii.length - 1 ] = 0;
	addTube( builder, spine, pointedRadii, sides, {
		color: barkColor,
		wind: ( t ) => {
			const progress = rootDepth === 0 ? t : clamp( ( t * ( spine.length - 1 ) - 1 ) / ( spine.length - 2 ), 0, 1 );
			return progress * 0.3;
		},
		capEnd: false,
	} );

	return ( spine.length - 1 ) * ( sides + 1 ) + 1;

}

function buildLod0( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunk = selectTrunkRings( layout, [ 0, 1, 2, 3, 7, 10, 12 ] );
	const extendedTrunk = addRootRing( trunk.spine, trunk.radii, layout.rootDepth );
	builder.beginGroup( barkPartIndex );
	const trunkVertexCount = addPointedTrunk( builder, extendedTrunk.spine, extendedTrunk.radii, 7, layout.rootDepth );
	addFronds( builder, layout, [ 0, 0.4, 1 ] );
	const mesh = closeTrunkTip( builder.build(), extendedTrunk.spine.length, 7, normalize( subtract( trunk.spine[ trunk.spine.length - 1 ]!, trunk.spine[ trunk.spine.length - 2 ]! ) ) );

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildLod1( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunk = selectTrunkRings( layout, [ 0, 1, 3, 7, 10, 12 ] );
	const extendedTrunk = addRootRing( trunk.spine, trunk.radii, layout.rootDepth );
	builder.beginGroup( barkPartIndex );
	const trunkVertexCount = addPointedTrunk( builder, extendedTrunk.spine, extendedTrunk.radii, 6, layout.rootDepth );
	addLeafRingLod1( builder, layout );
	addFoldedFrondsLod1( builder, layout );
	const mesh = closeTrunkTip( builder.build(), extendedTrunk.spine.length, 6, normalize( subtract( trunk.spine[ trunk.spine.length - 1 ]!, trunk.spine[ trunk.spine.length - 2 ]! ) ) );

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildLod2( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunk = selectTrunkRings( layout, [ 0, 2, 6, 10, 12 ] );
	const extendedTrunk = addRootRing( trunk.spine, trunk.radii, layout.rootDepth );

	builder.beginGroup( barkPartIndex );
	const trunkVertexCount = addPointedTrunk( builder, extendedTrunk.spine, extendedTrunk.radii, 4, layout.rootDepth );
	addLeafRingLod2( builder, layout );
	addFoldedFrondsLod2( builder, layout );
	const mesh = closeTrunkTip( builder.build(), extendedTrunk.spine.length, 4, normalize( subtract( trunk.spine[ trunk.spine.length - 1 ]!, trunk.spine[ trunk.spine.length - 2 ]! ) ) );

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildCollider( layout: TreeLayout ): ColliderData {

	const fractions = [ 0, 0.425, 0.85 ];
	const trunk = fractions.map( ( fraction ) => getTrunkPoint( layout.trunkSpine, layout.height, fraction ) );
	const spine = layout.rootDepth === 0 ? trunk : [ [ trunk[ 0 ]![ 0 ], - layout.rootDepth, trunk[ 0 ]![ 2 ] ] as Vec3, ...trunk ];
	const radii = fractions.map( ( fraction ) => getTrunkRadius( fraction, layout.height ) );
	if ( layout.rootDepth > 0 ) {

		radii.unshift( radii[ 0 ]! );

	}
	const builder = new MeshBuilder();

	builder.beginGroup( barkPartIndex );
	addTube( builder, spine, radii, 8, { color: barkColor, wind: () => 0, capEnd: false } );

	const mesh = builder.build();

	return { positions: mesh.positions, indices: mesh.indices };

}

function getBoundsRadius( mesh: MeshData ): number {

	let radius = 0;

	for ( let i = 0; i < mesh.positions.length; i += 3 ) {

		radius = Math.max( radius, Math.hypot( mesh.positions[ i ]!, mesh.positions[ i + 2 ]! ) );

	}

	return radius;

}

function getLegacyLodProxyBoundsRadius( layout: TreeLayout ): number {

	let radius = 0;

	for ( const tier of layout.tiers ) {

		for ( const frond of tier.fronds ) {

			const halfWidth = frond.width * 0.5;
			const lod1Centers = [ 0, 0.4, 1 ].map( ( t ) => getFrondPoint( frond, t ) );
			const lod2Centers = [ frond.base, getFrondAverageLine( frond )[ 1 ] ];

			for ( const center of [ ...lod1Centers, ...lod2Centers ] ) {

				for ( const side of [ - 1, 1 ] ) {

					const widthOffset = multiply( frond.widthDirection, side * halfWidth );
					const point = add( add( center, widthOffset ), [ 0, 0, 0 ] );
					radius = Math.max( radius, Math.hypot( Math.fround( point[ 0 ] ), Math.fround( point[ 2 ] ) ) );

				}

			}

		}

	}

	return radius;

}

export function generateTreeData( options: TreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const leafColor = options.leafColor ?? DEFAULT_LEAF_COLOR;
	const height = options.height ?? 7.5;
	const crownSizeInput = options.crownSize ?? 1;
	const branchCount = options.branchCount ?? 10;

	if ( ! Number.isFinite( height ) || height <= 0 ) {
		throw new RangeError( 'Tree height must be a positive finite number' );
	}

	if ( ! Number.isFinite( crownSizeInput ) ) {
		throw new RangeError( 'Tree crownSize must be finite' );
	}

	if ( ! Number.isInteger( branchCount ) || branchCount < 1 ) {
		throw new RangeError( 'Tree branchCount must be a positive integer' );
	}
	getLeafRingCellSize( branchCount );

	const crownSize = clamp( crownSizeInput, 0.5, 1.5 );
	const rootDepth = getRootDepth( height );
	const layout = createTreeLayout( seed, height, rootDepth, crownSize, branchCount );
	const lod0 = buildLod0( layout );
	const lod1 = buildLod1( layout );
	const lod2 = buildLod2( layout );
	const parts: PartDef[] = [
		{
			name: 'bark',
			defaultColor: DEFAULT_BARK_COLOR,
			texture: 'bark',
			roughness: 0.85,
			specularIntensity: 0.014872,
			ior: 1.05,
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
		},
		{
			name: 'leaf',
			defaultColor: leafColor,
			texture: 'leaf',
			colorizesTexture: true,
			roughness: 0.95,
			specularIntensity: 0.014872,
			ior: 1.05,
			emissive: 0x000000,
			emissiveIntensity: 0,
			alphaTest: 0.5,
			// 三角形数を抑え、両側から一枚の折れ面を見せる。
			doubleSided: true,
			flatShading: false,
		},
		{ ...impostorLod3Part(), impostorFade: false },
		{ ...impostorPart(), impostorFade: false },
		{
			name: 'leafRing',
			defaultColor: leafColor,
			texture: 'leafRing',
			colorizesTexture: true,
			roughness: 0.95,
			specularIntensity: 0.014872,
			ior: 1.05,
			emissive: 0x000000,
			emissiveIntensity: 0,
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
		},
	];
	const leafTexture = createFirSprigTexture( seed, 256, true, leafColor );
	const textures = {
		bark: { ...createBarkTexture( seed ), wrap: 'repeat' as const },
		leaf: leafTexture,
		leafRing: createLeafRingTexture( layout, leafTexture ),
	};
	const lod0Bounds = { radius: getBoundsRadius( lod0 ), height };

	const lod3 = buildSixPlaneImpostor( height, lod0Bounds.radius, impostorLod3PartIndex, lod0, height * 0.25 );
	const bounds = { radius: Math.max( lod0Bounds.radius, getLegacyLodProxyBoundsRadius( layout ) ), height };
	const data: VegetationData = {
		kind: 'tree',
		parts: [ ...parts ],
		lods: [ lod0, lod1, lod2, lod3, buildBillboard( bounds, impostorPartIndex, lod0, height * 0.25 ) ],
		collider: buildCollider( layout ),
		textures,
		textureGenerators: {
			leaf: { type: 'tree-leaf', seed, size: 256 },
			leafRing: { type: 'tree-leaf-ring', seed, size: 256, height, crownSize, branchCount },
		},
		bounds,
	};

	return data;

}

function regenerateTreeLeafTextureData( existing: TextureData, generator: TextureGeneratorDef, color: number ): TextureData {

	if ( generator.type !== 'tree-leaf' || existing.colorFactors === undefined || existing.colorPixelIndices === undefined ) {
		throw new Error( 'Tree leaf texture cannot be regenerated' );
	}

	return composeFirSprigTexture( existing, color );

}

export function regenerateTreeLeafTexture( data: VegetationData, color: number ): void {

	const generator = data.textureGenerators?.leaf;
	const existing = data.textures.leaf;

	if ( generator === undefined || existing === undefined ) {
		throw new Error( 'Tree leaf texture cannot be regenerated' );
	}

	data.textures.leaf = regenerateTreeLeafTextureData( existing, generator, color );

}

registerTextureRegenerator( 'tree-leaf', regenerateTreeLeafTextureData );

function regenerateTreeLeafRingTextureData( existing: TextureData, generator: TextureGeneratorDef, color: number ): TextureData {

	if ( generator.type !== 'tree-leaf-ring' || generator.height === undefined || generator.crownSize === undefined || generator.branchCount === undefined ) {
		throw new Error( 'Tree leaf ring texture cannot be regenerated' );
	}

	const crownSize = clamp( generator.crownSize, 0.5, 1.5 );
	const layout = createTreeLayout( generator.seed, generator.height, getRootDepth( generator.height ), crownSize, generator.branchCount );
	const leafTexture = createFirSprigTexture( generator.seed, generator.size, true, color );
	const texture = createLeafRingTexture( layout, leafTexture );

	if ( existing.width !== texture.width || existing.height !== texture.height ) {
		throw new Error( 'Tree leaf ring texture dimensions changed during regeneration' );
	}

	return texture;

}

registerTextureRegenerator( 'tree-leaf-ring', regenerateTreeLeafRingTextureData );
