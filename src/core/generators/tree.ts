import { createNoise3D } from '../noise';
import { buildBillboard, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import type { Color3, ColliderData, MeshData, Vec3, VegetationData } from '../types';
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
	childSpine: Vec3[];
	childRadii: number[];
	childCluster: LeafCluster;
}

interface TreeLayout {
	height: number;
	trunkSpine: Vec3[];
	trunkRadii: number[];
	branches: BranchLayout[];
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

	const scaled = clamp( fraction / 0.86, 0, 1 ) * ( radii.length - 1 );
	const first = Math.floor( scaled );
	const amount = scaled - first;

	return radii[ first ]! + ( radii[ Math.min( radii.length - 1, first + 1 ) ]! - radii[ first ]! ) * amount;

}

function createLeafCluster(
	random: ReturnType<typeof createRandom>,
	id: number,
	center: Vec3,
	radius: number,
): LeafCluster {

	const cardRandom = random.fork( 700 + id );
	const cards: LeafCard[] = [];
	const lod0CardCount = cardRandom.int( 13, 14 );

	for ( let i = 0; i < 14; i ++ ) {

		const directionY = cardRandom.range( - 1, 1 );
		const directionAngle = cardRandom.range( 0, Math.PI * 2 );
		const directionRadius = Math.sqrt( 1 - directionY * directionY );
		const offset = multiply( [ Math.cos( directionAngle ) * directionRadius, directionY, Math.sin( directionAngle ) * directionRadius ], radius * cardRandom.range( 0.02, 0.24 ) );
		const normalY = cardRandom.range( - 1, 1 );
		const normalAngle = cardRandom.range( 0, Math.PI * 2 );
		const normalRadius = Math.sqrt( 1 - normalY * normalY );
		const faceNormal = [ Math.cos( normalAngle ) * normalRadius, normalY, Math.sin( normalAngle ) * normalRadius ] as Vec3;
		const reference: Vec3 = Math.abs( faceNormal[ 1 ] ) > 0.92 ? [ 1, 0, 0 ] : [ 0, 1, 0 ];
		const rightDirection = normalize( cross( faceNormal, reference ) );
		const upDirection = normalize( cross( rightDirection, faceNormal ) );
		const halfWidth = radius * cardRandom.range( 0.36, 0.5 );
		const halfHeight = radius * cardRandom.range( 0.42, 0.57 );

		cards.push( {
			center: add( center, offset ),
			right: multiply( rightDirection, halfWidth ),
			up: multiply( upDirection, halfHeight ),
		} );

	}

	return { center, radius, cards, lod0CardCount };

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
	const trunkRadii = [ 0.073, 0.06, 0.047, 0.037, 0.03, 0.024, 0.018 ].map( ( radius ) => radius * height );
	const branches: BranchLayout[] = [];
	const baseAngle = random.range( 0, Math.PI * 2 );

	for ( let i = 0; i < branchCount; i ++ ) {

		const branchRandom = random.fork( i + 1 );
		const fraction = branchCount === 1 ? 0.66 : 0.54 + i / ( branchCount - 1 ) * 0.24;
		const startFraction = clamp( fraction + branchRandom.range( - 0.012, 0.012 ), 0.4, 0.85 );
		const angle = baseAngle + i / branchCount * Math.PI * 2 + branchRandom.range( - 0.12, 0.12 );
		const direction: Vec3 = [ Math.cos( angle ), 0, Math.sin( angle ) ];
		const start = getTrunkPoint( trunkSpine, startFraction );
		const length = height * crownSize * branchRandom.range( 0.115, 0.14 );
		const end = add( start, [ direction[ 0 ] * length, height * branchRandom.range( 0.018, 0.036 ), direction[ 2 ] * length ] );
		const middle = add( start, [ direction[ 0 ] * length * 0.55, ( end[ 1 ] - start[ 1 ] ) * 0.46, direction[ 2 ] * length * 0.55 ] );
		const branchSpine = [ start, middle, end ];
		const branchRadii = [ interpolateRadius( trunkRadii, startFraction ) * 0.78, height * 0.010 * crownSize, height * 0.0055 * crownSize ];
		const clusterRadius = height * crownSize * branchRandom.range( 0.15, 0.166 );
		const clusterCenter: Vec3 = [ end[ 0 ], Math.min( height - clusterRadius, end[ 1 ] ), end[ 2 ] ];
		const mainCluster = createLeafCluster( random, i * 2, clusterCenter, clusterRadius );

		const childAngle = angle + ( i % 2 === 0 ? 0.5 : - 0.5 );
		const childDirection: Vec3 = [ Math.cos( childAngle ), 0, Math.sin( childAngle ) ];
		const childStart = add( start, [ direction[ 0 ] * length * 0.58, ( end[ 1 ] - start[ 1 ] ) * 0.58, direction[ 2 ] * length * 0.58 ] );
		const childLength = height * crownSize * branchRandom.range( 0.12, 0.145 );
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
		const childSpine = [ childStart, childMiddle, childEnd ];
		const childRadii = [ height * 0.009 * crownSize, height * 0.006 * crownSize, height * 0.0035 * crownSize ];
		const childRadius = height * crownSize * branchRandom.range( 0.145, 0.16 );
		const childCenter: Vec3 = [ childEnd[ 0 ], Math.min( height - childRadius, childEnd[ 1 ] ), childEnd[ 2 ] ];
		const childCluster = createLeafCluster( random, i * 2 + 1, childCenter, childRadius );

		branches.push( {
			spine: branchSpine,
			radii: branchRadii,
			cluster: mainCluster,
			childSpine,
			childRadii,
			childCluster,
		} );

	}

	const apexRadius = height * crownSize * 0.17;
	const trunkTop = trunkSpine[ trunkSpine.length - 1 ]!;
	const apexCenter: Vec3 = [ trunkTop[ 0 ], height - apexRadius, trunkTop[ 2 ] ];
	const apex = createLeafCluster( random, branchCount * 2 + 4, apexCenter, apexRadius );

	return {
		height,
		trunkSpine,
		trunkRadii,
		branches,
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

function addLeafCard( builder: MeshBuilder, card: LeafCard, cluster: LeafCluster, height: number ): void {

	const corners = [
		add( add( card.center, multiply( card.right, - 1 ) ), multiply( card.up, - 1 ) ),
		add( add( card.center, card.right ), multiply( card.up, - 1 ) ),
		add( add( card.center, card.right ), card.up ),
		add( add( card.center, multiply( card.right, - 1 ) ), card.up ),
	];
	const uvs: [ number, number ][] = [ [ 0.16, 0.16 ], [ 0.84, 0.16 ], [ 0.84, 0.84 ], [ 0.16, 0.84 ] ];
	const indices = corners.map( ( corner, i ) => {
		const normal = normalize( subtract( corner, cluster.center ) );
		const shade = 0.6 + clamp( ( corner[ 1 ] - cluster.center[ 1 ] ) / cluster.radius, 0, 1 ) * 0.4;
		const vertexColor: Color3 = [ shade, shade, shade ];
		const wind = 0.7 + clamp( ( corner[ 1 ] / height - 0.35 ) / 0.65, 0, 1 ) * 0.3;

		return builder.addVertex( corner, normal, uvs[ i ]!, vertexColor, wind );
	} );

	builder.addTriangle( indices[ 0 ]!, indices[ 1 ]!, indices[ 2 ]! );
	builder.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 3 ]! );

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

function buildLod0( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );
	addTube( builder, layout.trunkSpine, layout.trunkRadii, 7, {
		color: barkColor,
		wind: ( t ) => t * 0.3,
		capEnd: true,
	} );
	addBranchMeshes( builder, layout.branches, 4, true );
	addClusterLeaves( builder, [ ...layout.branches.flatMap( ( branch ) => [ branch.cluster, branch.childCluster ] ), layout.apex ], 'lod0', layout.height );

	return builder.build();

}

function buildLod1( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	addTube( builder, layout.trunkSpine, layout.trunkRadii, 5, {
		color: barkColor,
		wind: ( t ) => t * 0.3,
		capEnd: true,
	} );
	addBranchMeshes( builder, layout.branches, 4, false );
	addClusterLeaves( builder, [ ...layout.branches.map( ( branch ) => branch.cluster ), layout.apex ], 6, layout.height );

	return builder.build();

}

function buildLod2( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunkIndices = [ 0, 2, 4, 6 ];
	const trunkSpine = trunkIndices.map( ( index ) => layout.trunkSpine[ index ]! );
	const trunkRadii = trunkIndices.map( ( index ) => layout.trunkRadii[ index ]! );

	addTube( builder, trunkSpine, trunkRadii, 4, {
		color: barkColor,
		wind: ( t ) => t * 0.3,
		capEnd: true,
	} );
	addReducedMainBranches( builder, layout.branches, 3 );
	addClusterLeaves( builder, [ ...layout.branches.map( ( branch ) => branch.cluster ), layout.apex ], 3, layout.height );

	return builder.build();

}

function selectLod3Clusters( layout: TreeLayout ): LeafCluster[] {

	const childClusters = layout.branches.map( ( branch ) => branch.childCluster );
	const cardCount = Math.max( 4, Math.min( 6, layout.branches.length ) );

	if ( childClusters.length >= cardCount ) {

		return Array.from( { length: cardCount }, ( _, i ) => childClusters[ Math.floor( ( i + 0.5 ) * childClusters.length / cardCount ) ]! );

	}

	const clusters = [ ...childClusters ];

	for ( const branch of layout.branches ) {

		if ( clusters.length >= cardCount ) break;

		clusters.push( branch.cluster );

	}

	if ( clusters.length < cardCount ) clusters.push( layout.apex );

	while ( clusters.length < cardCount ) {

		clusters.push( clusters[ 0 ]! );

	}

	return clusters;

}

function buildLod3( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunkIndices = [ 0, 3, 6 ];
	const trunkSpine = trunkIndices.map( ( index ) => layout.trunkSpine[ index ]! );
	const trunkRadii = trunkIndices.map( ( index ) => layout.trunkRadii[ index ]! );

	builder.beginGroup( 0 );
	addTube( builder, trunkSpine, trunkRadii, 3, {
		color: barkColor,
		wind: ( t ) => t * 0.3,
		capEnd: true,
	} );

	const canopyClusters = [ ...layout.branches.flatMap( ( branch ) => [ branch.cluster, branch.childCluster ] ), layout.apex ];
	let canopyMinY = Infinity;
	let canopyMaxY = - Infinity;

	for ( const cluster of canopyClusters ) {

		canopyMinY = Math.min( canopyMinY, cluster.center[ 1 ] - cluster.radius );
		canopyMaxY = Math.max( canopyMaxY, cluster.center[ 1 ] + cluster.radius );

	}

	const uvs: [ number, number ][] = [ [ 0.16, 0.16 ], [ 0.84, 0.16 ], [ 0.84, 0.84 ], [ 0.16, 0.84 ] ];

	builder.beginGroup( 1 );

	for ( const cluster of selectLod3Clusters( layout ) ) {

		const angle = Math.atan2( cluster.center[ 2 ], cluster.center[ 0 ] );
		const bottom = Math.max( canopyMinY, cluster.center[ 1 ] - cluster.radius * 1.12 );
		const top = Math.min( canopyMaxY, cluster.center[ 1 ] + cluster.radius * 1.12 );
		const cardCenter: Vec3 = [ cluster.center[ 0 ] * 0.9, ( bottom + top ) * 0.5, cluster.center[ 2 ] * 0.9 ];
		const right: Vec3 = [ Math.cos( angle ) * cluster.radius * 1.5, 0, Math.sin( angle ) * cluster.radius * 1.5 ];
		const up: Vec3 = [ 0, ( top - bottom ) * 0.5, 0 ];
		const corners = [
			add( add( cardCenter, multiply( right, - 1 ) ), multiply( up, - 1 ) ),
			add( add( cardCenter, right ), multiply( up, - 1 ) ),
			add( add( cardCenter, right ), up ),
			add( add( cardCenter, multiply( right, - 1 ) ), up ),
		];
		const indices = corners.map( ( corner, i ) => {
			const shade = 0.6 + clamp( ( corner[ 1 ] - canopyMinY ) / ( canopyMaxY - canopyMinY ), 0, 1 ) * 0.4;
			const color: Color3 = [ shade, shade, shade ];

			return builder.addVertex( corner, normalize( subtract( corner, cluster.center ) ), uvs[ i ]!, color, 0.9 );
		} );

		builder.addTriangle( indices[ 0 ]!, indices[ 1 ]!, indices[ 2 ]! );
		builder.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 3 ]! );

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
	const crownSize = options.crownSize ?? 1;
	const branchCount = options.branchCount ?? 6;

	if ( ! Number.isFinite( height ) || height <= 0 ) {
		throw new RangeError( 'Tree height must be a positive finite number' );
	}

	if ( ! Number.isFinite( crownSize ) || crownSize < 0.5 || crownSize > 1.5 ) {
		throw new RangeError( 'Tree crownSize must be between 0.5 and 1.5' );
	}

	if ( ! Number.isInteger( branchCount ) || branchCount < 1 ) {
		throw new RangeError( 'Tree branchCount must be a positive integer' );
	}

	const layout = createTreeLayout( seed, height, crownSize, branchCount );
	const lod0 = buildLod0( layout );
	const lod1 = buildLod1( layout );
	const lod2 = buildLod2( layout );
	const lod3 = buildLod3( layout );
	const bounds = { radius: getBoundsRadius( lod0 ), height };
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
	const textures = { leaf: createLeafClusterTexture( seed ) };
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
