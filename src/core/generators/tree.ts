import { createNoise3D } from '../noise';
import { buildBillboard, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import type { Color3, ColliderData, MeshData, TextureData, Vec3, VegetationData } from '../types';
import { createLeafClusterTexture } from '../leafTexture';

export interface TreeOptions {
	seed?: number;
	height?: number;
	crownSize?: number;
	branchCount?: number;
}

interface LeafCard {
	center: Vec3;
	right: Vec3;
	up: Vec3;
	uvRotation: number;
	uvFlip: boolean;
}

interface LeafCluster {
	center: Vec3;
	radius: number;
	cards: LeafCard[];
	lod0CardCount: number;
}

interface BranchLayout {
	spine: Vec3[];
	radii: number[];
	cluster: LeafCluster;
	junctionCluster: LeafCluster;
	childJunctionCluster: LeafCluster;
	childSpine: Vec3[];
	childRadii: number[];
	childCluster: LeafCluster;
}

interface TreeLayout {
	height: number;
	trunkSpine: Vec3[];
	trunkRadii: number[];
	branches: BranchLayout[];
	crownFillers: LeafCluster[];
	apex: LeafCluster;
	firstBranchRatio: number;
}

const trunkFractions = [ 0, 0.09, 0.23, 0.4, 0.57, 0.73, 0.86 ];
const barkColor: Color3 = [ 1, 1, 1 ];

function add( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];

}

function subtract( a: Vec3, b: Vec3 ): Vec3 {

	return [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];

}

function multiply( vector: Vec3, scalar: number ): Vec3 {

	return [ vector[ 0 ] * scalar, vector[ 1 ] * scalar, vector[ 2 ] * scalar ];

}

function cross( a: Vec3, b: Vec3 ): Vec3 {

	return [
		a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ],
		a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ],
		a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ],
	];

}

function dot( a: Vec3, b: Vec3 ): number {

	return a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];

}

function normalize( vector: Vec3 ): Vec3 {

	const length = Math.hypot( vector[ 0 ], vector[ 1 ], vector[ 2 ] );

	if ( length === 0 || ! Number.isFinite( length ) ) {
		throw new RangeError( 'Expected a finite, non-zero vector' );
	}

	return [ vector[ 0 ] / length, vector[ 1 ] / length, vector[ 2 ] / length ];

}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function createLeafAtlas( leafTexture: TextureData ): TextureData {

	const width = leafTexture.width * 2;
	const height = leafTexture.height;
	const data = new Uint8Array( width * height * 4 );
	const repeats = 4;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < leafTexture.width; x ++ ) {

			const source = ( y * leafTexture.width + x ) * 4;
			const target = ( y * width + x ) * 4;

			data[ target ] = leafTexture.data[ source ]!;
			data[ target + 1 ] = leafTexture.data[ source + 1 ]!;
			data[ target + 2 ] = leafTexture.data[ source + 2 ]!;
			data[ target + 3 ] = leafTexture.data[ source + 3 ]!;

		}

		for ( let x = 0; x < leafTexture.width; x ++ ) {

			const u = ( x + 0.5 ) / leafTexture.width;
			const v = ( y + 0.5 ) / height;
			const offsetX = ( u - 0.5 ) * 2;
			const offsetY = ( v - 0.5 ) * 2;
			const angle = Math.atan2( offsetY, offsetX );
			const edge = 0.97 + Math.sin( angle * 11 ) * 0.018 + Math.cos( angle * 17 ) * 0.012;
			const inside = offsetX * offsetX + offsetY * offsetY <= edge * edge;
			const sampleX = Math.floor( ( u * repeats % 1 ) * leafTexture.width );
			const sampleY = Math.floor( ( v * repeats % 1 ) * leafTexture.height );
			const sample = ( sampleY * leafTexture.width + sampleX ) * 4;
			const target = ( y * width + leafTexture.width + x ) * 4;
			const gray = leafTexture.data[ sample + 3 ] === 255 ? Math.max( 191, leafTexture.data[ sample ]! - 24 ) : 232;

			data[ target ] = inside ? gray : 255;
			data[ target + 1 ] = inside ? gray : 255;
			data[ target + 2 ] = inside ? gray : 255;
			data[ target + 3 ] = inside ? 255 : 0;

		}

	}

	return { width, height, data };

}

function getTrunkPoint( spine: Vec3[], fraction: number ): Vec3 {

	const targetY = spine[ 0 ]![ 1 ] + ( spine[ spine.length - 1 ]![ 1 ] - spine[ 0 ]![ 1 ] ) * fraction / 0.86;

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

function interpolateRadius( radii: number[], fraction: number ): number {

	const target = clamp( fraction, 0, trunkFractions[ trunkFractions.length - 1 ]! );

	for ( let i = 1; i < trunkFractions.length; i ++ ) {

		if ( target <= trunkFractions[ i ]! ) {

			const firstFraction = trunkFractions[ i - 1 ]!;
			const amount = ( target - firstFraction ) / ( trunkFractions[ i ]! - firstFraction );

			return radii[ i - 1 ]! + ( radii[ i ]! - radii[ i - 1 ]! ) * amount;

		}

	}

	return radii[ radii.length - 1 ]!;

}

function domeProfile( fraction: number ): number {

	const normalized = clamp( ( fraction - 0.34 ) / 0.64, 0, 1 );
	const distance = Math.abs( normalized - 0.52 ) / 0.52;

	return 0.48 + 0.52 * Math.sqrt( Math.max( 0, 1 - distance * distance ) );

}

function createLeafCluster(
	random: ReturnType<typeof createRandom>,
	id: number,
	center: Vec3,
	radius: number,
	height: number,
): LeafCluster {

	const cardRandom = random.fork( 700 + id );
	const clusterCenter: Vec3 = [ ...center ];
	const cards: LeafCard[] = [];
	const lod0CardCount = 10;
	const canonicalNormals: Vec3[] = [
		[ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ],
		[ 1, 0, 0 ], [ 0, 0, 1 ], [ - 1, 0, 0 ], [ 0, 0, - 1 ],
	];

	for ( let i = 0; i < lod0CardCount; i ++ ) {

		const directionY = cardRandom.range( - 1, 1 );
		const directionAngle = cardRandom.range( 0, Math.PI * 2 );
		const directionRadius = Math.sqrt( 1 - directionY * directionY );
		const offset = multiply( [ Math.cos( directionAngle ) * directionRadius, directionY, Math.sin( directionAngle ) * directionRadius ], radius * cardRandom.range( 0.02, 0.14 ) );
		const normalY = cardRandom.range( - 1, 1 );
		const normalAngle = cardRandom.range( 0, Math.PI * 2 );
		const normalRadius = Math.sqrt( 1 - normalY * normalY );
		const randomNormal: Vec3 = [ Math.cos( normalAngle ) * normalRadius, normalY, Math.sin( normalAngle ) * normalRadius ];
		const faceNormal = i < canonicalNormals.length ? canonicalNormals[ i ]! : normalize(
			add( normalize( offset ), multiply( randomNormal, 0.28 ) ),
		);
		const reference: Vec3 = Math.abs( faceNormal[ 1 ] ) > 0.92 ? [ 1, 0, 0 ] : [ 0, 1, 0 ];
		let rightDirection = normalize( cross( faceNormal, reference ) );
		let upDirection = normalize( cross( rightDirection, faceNormal ) );

		if ( i < lod0CardCount ) {

			const rotation = cardRandom.range( - Math.PI, Math.PI );
			const cosine = Math.cos( rotation );
			const sine = Math.sin( rotation );

			[ rightDirection, upDirection ] = [
				add( multiply( rightDirection, cosine ), multiply( upDirection, sine ) ),
				add( multiply( upDirection, cosine ), multiply( rightDirection, - sine ) ),
			];

		}

		const halfWidth = radius * cardRandom.range( 0.86, 0.92 );
		const halfHeight = radius * cardRandom.range( 0.86, 0.92 );

		cards.push( {
			center: add( clusterCenter, offset ),
			right: multiply( rightDirection, halfWidth ),
			up: multiply( upDirection, halfHeight ),
			uvRotation: cardRandom.int( 0, 3 ),
			uvFlip: cardRandom.int( 0, 1 ) === 1,
		} );

	}

	let highestCardY = - Infinity;

	for ( const card of cards ) {

		highestCardY = Math.max( highestCardY, card.center[ 1 ] + Math.abs( card.right[ 1 ] ) + Math.abs( card.up[ 1 ] ) );

	}

	const verticalShift = Math.max( 0, highestCardY - height * 0.99 );
	clusterCenter[ 1 ] -= verticalShift;

	for ( const card of cards ) {

		card.center[ 1 ] -= verticalShift;

	}

	return { center: clusterCenter, radius, cards, lod0CardCount };

}

function createTreeLayout( seed: number, height: number, crownSize: number, branchCount: number ): TreeLayout {

	const random = createRandom( seed );
	const noise = createNoise3D( seed );
	const trunkSpine = trunkFractions.map( ( fraction ) => {
		const curve = fraction * fraction;
		const x = ( noise( 10.3 + fraction * 2.2, 4.1, 0.7 ) - noise( 10.3, 4.1, 0.7 ) ) * height * 0.035 * curve;
		const z = ( noise( 3.7, 12.9 + fraction * 2.4, 8.2 ) - noise( 3.7, 12.9, 8.2 ) ) * height * 0.035 * curve;

		return [ x, height * fraction, z ] as Vec3;
	} );
	const trunkRadii = [ 0.073 * 1.6, 0.06, 0.047, 0.037, 0.03, 0.024, 0.018 ].map( ( radius ) => radius * height );
	const branches: BranchLayout[] = [];
	const baseAngle = random.range( 0, Math.PI * 2 );

	for ( let i = 0; i < branchCount; i ++ ) {

		const branchRandom = random.fork( i + 1 );
		const fraction = branchCount === 1 ? 0.66 : 0.54 + i / ( branchCount - 1 ) * 0.24;
		const startFraction = clamp( fraction + branchRandom.range( - 0.012, 0.012 ), 0.4, 0.85 );
		const branchDome = domeProfile( startFraction );
		const angle = baseAngle + i / branchCount * Math.PI * 2 + branchRandom.range( - 0.12, 0.12 );
		const direction: Vec3 = [ Math.cos( angle ), 0, Math.sin( angle ) ];
		const start = getTrunkPoint( trunkSpine, startFraction );
		const length = height * crownSize * branchRandom.range( 0.125, 0.15 ) * branchDome;
		const end = add( start, [ direction[ 0 ] * length, height * branchRandom.range( 0.018, 0.036 ), direction[ 2 ] * length ] );
		const middle = add( start, [ direction[ 0 ] * length * 0.55, ( end[ 1 ] - start[ 1 ] ) * 0.46, direction[ 2 ] * length * 0.55 ] );
		const branchSpine = [ start, middle, end ];
		const branchRadii = [ interpolateRadius( trunkRadii, startFraction ) * 0.78, height * 0.010 * crownSize, height * 0.0055 * crownSize ];
		const clusterRadius = height * crownSize * branchRandom.range( 0.185, 0.2 ) * branchDome;
		const clusterCenter: Vec3 = [ end[ 0 ], Math.min( height - clusterRadius, end[ 1 ] ), end[ 2 ] ];
		const mainCluster = createLeafCluster( random, i * 4, clusterCenter, clusterRadius, height );
		const junctionRadius = height * crownSize * branchRandom.range( 0.165, 0.18 ) * domeProfile( middle[ 1 ] / height );
		const junctionCluster = createLeafCluster( random, i * 4 + 1, middle, junctionRadius, height );

		const childAngle = angle + ( i % 2 === 0 ? 0.5 : - 0.5 );
		const childDirection: Vec3 = [ Math.cos( childAngle ), 0, Math.sin( childAngle ) ];
		const childStart = add( start, [ direction[ 0 ] * length * 0.58, ( end[ 1 ] - start[ 1 ] ) * 0.58, direction[ 2 ] * length * 0.58 ] );
		const childLength = height * crownSize * branchRandom.range( 0.1, 0.125 ) * domeProfile( childStart[ 1 ] / height );
		const childEnd = add( childStart, [
			childDirection[ 0 ] * childLength,
			height * branchRandom.range( 0.018, 0.05 ),
			childDirection[ 2 ] * childLength,
		] );
		const childMiddle = add( childStart, [
			childDirection[ 0 ] * childLength * 0.52,
			( childEnd[ 1 ] - childStart[ 1 ] ) * 0.48,
			childDirection[ 2 ] * childLength * 0.52,
		] );
		const childJunctionRadius = height * crownSize * 0.15 * domeProfile( childMiddle[ 1 ] / height );
		const childJunctionCluster = createLeafCluster( random, i * 4 + 2, childMiddle, childJunctionRadius, height );
		const childSpine = [ childStart, childMiddle, childEnd ];
		const childRadii = [ height * 0.009 * crownSize, height * 0.006 * crownSize, height * 0.0035 * crownSize ];
		const childRadius = height * crownSize * branchRandom.range( 0.175, 0.19 ) * domeProfile( childEnd[ 1 ] / height );
		const childCenter: Vec3 = [ childEnd[ 0 ], Math.min( height - childRadius, childEnd[ 1 ] ), childEnd[ 2 ] ];
		const childCluster = createLeafCluster( random, i * 4 + 3, childCenter, childRadius, height );

		branches.push( {
			spine: branchSpine,
			radii: branchRadii,
			cluster: mainCluster,
			junctionCluster,
			childJunctionCluster,
			childSpine,
			childRadii,
			childCluster,
		} );

	}

	const crownFillers = [ 0.48, 0.56, 0.64, 0.72, 0.8 ].map( ( fraction, index ) => {

		const center = getTrunkPoint( trunkSpine, fraction );
		const radius = height * crownSize * ( 0.13 + index * 0.002 ) * domeProfile( fraction );

		return createLeafCluster( random, branchCount * 4 + 10 + index, center, radius, height );

	} );

	const apexRadius = height * crownSize * 0.19 * domeProfile( 0.84 );
	const trunkTop = trunkSpine[ trunkSpine.length - 1 ]!;
	const apexCenter: Vec3 = [ trunkTop[ 0 ], height - apexRadius, trunkTop[ 2 ] ];
	const apex = createLeafCluster( random, branchCount * 4 + 5, apexCenter, apexRadius, height );

	return {
		height,
		trunkSpine,
		trunkRadii,
		branches,
		crownFillers,
		apex,
		firstBranchRatio: Math.min( ...branches.map( ( branch ) => branch.spine[ 0 ]![ 1 ] / height ) ),
	};

}

function addBranchMeshes( builder: MeshBuilder, branches: BranchLayout[], sides: number, includeChildren: boolean ): void {

	for ( const branch of branches ) {

		addTube( builder, branch.spine, branch.radii, sides, {
			color: barkColor,
			wind: ( t ) => 0.3 + t * 0.4,
			capEnd: true,
		} );

		if ( includeChildren ) {

			addTube( builder, branch.childSpine, branch.childRadii, sides, {
				color: barkColor,
				wind: ( t ) => 0.42 + t * 0.28,
				capEnd: true,
			} );

		}

	}

}

function addReducedMainBranches( builder: MeshBuilder, branches: BranchLayout[], sides: number ): void {

	for ( const branch of branches ) {

		addTube( builder, [ branch.spine[ 0 ]!, branch.spine[ 2 ]! ], [ branch.radii[ 0 ]!, branch.radii[ 2 ]! ], sides, {
			color: barkColor,
			wind: ( t ) => 0.3 + t * 0.4,
			capEnd: true,
		} );

	}

}

function addLeafCard( builder: MeshBuilder, card: LeafCard, cluster: LeafCluster, height: number, uvRegion: [ number, number ] = [ 0, 0.5 ], fixedWinding = false ): void {

	const corners = [
		add( add( card.center, multiply( card.right, - 1 ) ), multiply( card.up, - 1 ) ),
		add( add( card.center, card.right ), multiply( card.up, - 1 ) ),
		add( add( card.center, card.right ), card.up ),
		add( add( card.center, multiply( card.right, - 1 ) ), card.up ),
	];
	const uvs = [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ].map( ( uv ) => {

		let u = card.uvFlip ? 1 - uv[ 0 ]! : uv[ 0 ]!;
		let v = uv[ 1 ]!;

		for ( let i = 0; i < card.uvRotation; i ++ ) {

			[ u, v ] = [ v, 1 - u ];

		}

		return [ uvRegion[ 0 ] + u * uvRegion[ 1 ], v ] as [ number, number ];

	} );
	const normals = corners.map( ( corner ) => normalize( subtract( corner, cluster.center ) ) );
	const cardOffset = subtract( card.center, cluster.center );
	const averageNormal = normals.reduce( ( sum, normal ) => add( sum, normal ), [ 0, 0, 0 ] as Vec3 );
	const outward = Math.hypot( cardOffset[ 0 ], cardOffset[ 1 ], cardOffset[ 2 ] ) < cluster.radius * 0.05 ? averageNormal : cardOffset;
	const frontNormal = normalize( cross( card.right, card.up ) );
	const reverseWinding = fixedWinding ? false : dot( frontNormal, outward ) < 0;
	const indices = corners.map( ( corner, i ) => {

		const distance = Math.hypot( corner[ 0 ] - cluster.center[ 0 ], corner[ 1 ] - cluster.center[ 1 ], corner[ 2 ] - cluster.center[ 2 ] ) / cluster.radius;
		const vertical = ( corner[ 1 ] - cluster.center[ 1 ] ) / cluster.radius;
		const shade = clamp( 0.72 + clamp( distance, 0, 1.2 ) * 0.18 + vertical * ( vertical < 0 ? 0.1 : 0.14 ), 0.6, 1 );
		const vertexColor: Color3 = [ shade, shade, shade ];
		const wind = 0.7 + clamp( ( corner[ 1 ] / height - 0.35 ) / 0.65, 0, 1 ) * 0.3;

		return builder.addVertex( corner, normals[ i ]!, uvs[ i ]!, vertexColor, wind );
	} );

	if ( reverseWinding ) {

		builder.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 1 ]! );
		builder.addTriangle( indices[ 0 ]!, indices[ 3 ]!, indices[ 2 ]! );

	} else {

		builder.addTriangle( indices[ 0 ]!, indices[ 1 ]!, indices[ 2 ]! );
		builder.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 3 ]! );

	}

}

function addClusterLeaves( builder: MeshBuilder, clusters: LeafCluster[], cardsPerCluster: number | 'lod0', height: number ): void {

	builder.beginGroup( 1 );

	for ( const cluster of clusters ) {

		const count = cardsPerCluster === 'lod0' ? cluster.lod0CardCount : cardsPerCluster;

		for ( let i = 0; i < count; i ++ ) {

			addLeafCard( builder, cluster.cards[ i ]!, cluster, height );

		}

	}

}

function getAllClusters( layout: TreeLayout ): LeafCluster[] {

	return [
		...layout.branches.flatMap( ( branch ) => [ branch.cluster, branch.junctionCluster, branch.childJunctionCluster, branch.childCluster ] ),
		...layout.crownFillers,
		layout.apex,
	];

}

/** @internal クラウン領域をテストで測るための境界。 */
export function getTreeCrownBounds( options: TreeOptions = {} ): { minX: number; minY: number; maxX: number; maxY: number } {

	const height = options.height ?? 6;
	const crownSize = clamp( options.crownSize ?? 1, 0.5, 1.5 );
	const layout = createTreeLayout( options.seed ?? 1, height, crownSize, options.branchCount ?? 6 );
	const bounds = { minX: Infinity, minY: Infinity, maxX: - Infinity, maxY: - Infinity };

	for ( const cluster of getAllClusters( layout ) ) {

		bounds.minX = Math.min( bounds.minX, cluster.center[ 0 ] - cluster.radius );
		bounds.minY = Math.min( bounds.minY, cluster.center[ 1 ] - cluster.radius );
		bounds.maxX = Math.max( bounds.maxX, cluster.center[ 0 ] + cluster.radius );
		bounds.maxY = Math.max( bounds.maxY, cluster.center[ 1 ] + cluster.radius );

	}

	return bounds;

}

function buildLod0( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );
	addTube( builder, layout.trunkSpine, layout.trunkRadii, 7, {
		color: barkColor,
		wind: ( t ) => t * 0.3,
		capEnd: true,
	} );
	addBranchMeshes( builder, layout.branches, 4, true );
	addClusterLeaves( builder, getAllClusters( layout ), 'lod0', layout.height );

	return builder.build();

}

function buildLod1( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );
	addTube( builder, layout.trunkSpine, layout.trunkRadii, 5, {
		color: barkColor,
		wind: ( t ) => t * 0.3,
		capEnd: true,
	} );
	addBranchMeshes( builder, layout.branches, 4, false );
	addClusterLeaves( builder, getAllClusters( layout ), 6, layout.height );

	return builder.build();

}

function buildLod2( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );
	const trunkIndices = [ 0, 2, 4, 6 ];
	const trunkSpine = trunkIndices.map( ( index ) => layout.trunkSpine[ index ]! );
	const trunkRadii = trunkIndices.map( ( index ) => layout.trunkRadii[ index ]! );

	addTube( builder, trunkSpine, trunkRadii, 4, {
		color: barkColor,
		wind: ( t ) => t * 0.3,
		capEnd: true,
	} );
	addReducedMainBranches( builder, layout.branches, 3 );
	addClusterLeaves( builder, getAllClusters( layout ), 3, layout.height );

	return builder.build();

}

function getLeafLayoutBounds( clusters: LeafCluster[] ): [ number, number, number, number, number, number ] {

	const bounds: [ number, number, number, number, number, number ] = [ Infinity, Infinity, Infinity, - Infinity, - Infinity, - Infinity ];

	for ( const cluster of clusters ) {

		for ( const card of cluster.cards.slice( 0, cluster.lod0CardCount ) ) {

			for ( const x of [ - 1, 1 ] ) {

				for ( const y of [ - 1, 1 ] ) {

					const corner = add( add( card.center, multiply( card.right, x ) ), multiply( card.up, y ) );

					for ( let axis = 0; axis < 3; axis ++ ) {

						bounds[ axis ] = Math.min( bounds[ axis ]!, corner[ axis ]! );
						bounds[ axis + 3 ] = Math.max( bounds[ axis + 3 ]!, corner[ axis ]! );

					}

				}

			}

		}

	}

	return bounds;

}

function buildLod3( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunkTop = clamp( layout.firstBranchRatio + 0.08, 0.44, 0.86 );
	const trunkSpine = [ layout.trunkSpine[ 0 ]!, layout.trunkSpine[ 3 ]!, getTrunkPoint( layout.trunkSpine, trunkTop ) ];
	const trunkRadii = [ layout.trunkRadii[ 0 ]!, layout.trunkRadii[ 3 ]!, interpolateRadius( layout.trunkRadii, trunkTop ) ];

	builder.beginGroup( 0 );
	addTube( builder, trunkSpine, trunkRadii, 3, {
		color: barkColor,
		wind: ( t ) => t * 0.3,
		capEnd: true,
	} );

	const canopyClusters = getAllClusters( layout );
	const [ minX, minY, minZ, maxX, maxY, maxZ ] = getLeafLayoutBounds( canopyClusters );
	const center: Vec3 = [ ( minX + maxX ) * 0.5, ( minY + maxY ) * 0.5, ( minZ + maxZ ) * 0.5 ];
	const width = maxX - minX;
	const height = maxY - minY;
	const depth = maxZ - minZ;
	const silhouette: LeafCluster = { center, radius: Math.max( width, height, depth ) * 0.5, cards: [], lod0CardCount: 0 };

	builder.beginGroup( 1 );

	const cardAxes: [ Vec3, number ][] = [
		[ [ 0, 0, 1 ], width * 0.47 ],
		[ [ - 1, 0, 0 ], depth * 0.47 ],
		[ [ Math.SQRT1_2, 0, Math.SQRT1_2 ], Math.max( width, depth ) * 0.47 ],
	];
	const cards = cardAxes.map( ( [ normal, halfWidth ], index ): LeafCard => ( {
		center,
		right: [ normal[ 2 ] * halfWidth, 0, - normal[ 0 ] * halfWidth ],
		up: [ 0, height * 0.47, 0 ],
		uvRotation: index,
		uvFlip: false,
	} ) );

	for ( const card of cards ) {

		addLeafCard( builder, card, silhouette, layout.height, [ 0.5, 0.5 ], true );

	}

	return builder.build();

}

function buildCollider( layout: TreeLayout ): ColliderData {

	const fraction = layout.firstBranchRatio;
	const colliderSpine = [
		getTrunkPoint( layout.trunkSpine, 0 ),
		getTrunkPoint( layout.trunkSpine, fraction * 0.5 ),
		getTrunkPoint( layout.trunkSpine, fraction ),
	];
	const colliderRadii = [ 0, fraction * 0.5, fraction ].map( ( value ) => interpolateRadius( layout.trunkRadii, value ) );
	const builder = new MeshBuilder();

	builder.beginGroup( 0 );
	addTube( builder, colliderSpine, colliderRadii, 8, {
		color: barkColor,
		wind: () => 0,
		capEnd: true,
	} );

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

export function generateTreeData( options: TreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? 6;
	const crownSizeInput = options.crownSize ?? 1;
	const branchCount = options.branchCount ?? 6;

	if ( ! Number.isFinite( height ) || height <= 0 ) {

		throw new RangeError( 'Tree height must be a positive finite number' );

	}

	if ( ! Number.isFinite( crownSizeInput ) ) {

		throw new RangeError( 'Tree crownSize must be finite' );

	}
	const crownSize = clamp( crownSizeInput, 0.5, 1.5 );

	if ( ! Number.isInteger( branchCount ) || branchCount < 1 ) {

		throw new RangeError( 'Tree branchCount must be a positive integer' );

	}

	const layout = createTreeLayout( seed, height, crownSize, branchCount );
	const leafTexture = createLeafAtlas( createLeafClusterTexture( seed ) );
	const lod0 = buildLod0( layout );
	const lod1 = buildLod1( layout );
	const lod2 = buildLod2( layout );
	const lod3 = buildLod3( layout );
	const bounds = { radius: Math.max( ...[ lod0, lod1, lod2, lod3 ].map( getBoundsRadius ) ), height };
	const parts = [
		{
			name: 'bark',
			defaultColor: 0x6b4a32,
			texture: null,
			alphaTest: 0,
			doubleSided: false,
			flatShading: true,
		},
		{
			name: 'leaf',
			defaultColor: 0x5a8f3a,
			texture: 'leaf',
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
		},
		impostorPart(),
	] as const;
	const textures = { leaf: leafTexture };
	const data: VegetationData = {
		kind: 'tree',
		parts: [ ...parts ],
		lods: [ lod0, lod1, lod2, lod3, buildBillboard( bounds, parts.length - 1 ) ],
		collider: buildCollider( layout ),
		textures,
		bounds,
	};

	return data;

}
