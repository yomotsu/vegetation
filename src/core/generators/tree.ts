import { bakeImpostor, buildBillboard, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import { createBarkTexture } from '../barkTexture';
import { createFirSprigTexture, padTextureEdges } from '../leafTexture';
import type { Color3, ColliderData, MeshData, PartDef, TextureData, Vec3, VegetationData } from '../types';

export interface TreeOptions {
	seed?: number;
	height?: number;
	crownSize?: number;
	branchCount?: number;
}

interface Frond {
	base: Vec3;
	mid: Vec3;
	tip: Vec3;
	widthDirection: Vec3;
	width: number;
	fold: number;
	radius: number;
	leader: boolean;
}

interface Tier {
	fronds: Frond[];
}

interface TreeLayout {
	height: number;
	trunkSpine: Vec3[];
	trunkRadii: number[];
	tiers: Tier[];
}

const barkColor: Color3 = [ 1, 1, 1 ];
const leafBrightness = 0.75;
const leafColor: Color3 = [ 0, 0.95 * leafBrightness, 0 ];
const referenceTreeHeight = 7.55;
const trunkTopFraction = 6.6 / referenceTreeHeight;
const frondsPerTier = 5;
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

	return { base, mid, tip, widthDirection, width, fold, radius, leader };

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

function createTreeLayout( seed: number, height: number, crownSize: number, branchCount: number ): TreeLayout {

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

		tiers.push( { fronds } );

	}

	return {
		height,
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

	if ( lateral === 0.5 ) return [ 1, 1, 1 ];

	const tierLift = clamp( radius / 2.42, 0, 1 ) * 0.03;
	const green = ( 0.96 + tierLift ) * leafBrightness;

	return [ 0, green, 0 ];

}

function addFrond( builder: MeshBuilder, frond: Frond, longitudinalSamples: number[] ): void {

	const lateralSamples = [ 0, 0.5, 1 ];
	const inset = 1 / 1536;
	const grid: number[][] = [];

	for ( let row = 0; row < longitudinalSamples.length; row ++ ) {

		const t = longitudinalSamples[ row ]!;
		const center = t <= 0.4 ? add( frond.base, multiply( subtract( frond.mid, frond.base ), t / 0.4 ) ) : add( frond.mid, multiply( subtract( frond.tip, frond.mid ), ( t - 0.4 ) / 0.6 ) );
		const indices: number[] = [];

		for ( let column = 0; column < lateralSamples.length; column ++ ) {

			const u = lateralSamples[ column ]!;
			const widthOffset = ( u - 0.5 ) * frond.width;
			const foldOffset = Math.abs( u * 2 - 1 ) * frond.width * frond.fold;
			const point = add( add( center, multiply( frond.widthDirection, widthOffset ) ), [ 0, foldOffset, 0 ] );
			const uv: [ number, number ] = [ inset + ( 1 / 3 - inset * 2 ) * u, t ];

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

function addFronds( builder: MeshBuilder, layout: TreeLayout, frondsPerTierAtLod: number, longitudinalSamples: number[] ): void {

	builder.beginGroup( 1 );

	for ( const tier of layout.tiers ) {

		const leader = tier.fronds.find( ( frond ) => frond.leader );
		const regularFronds = tier.fronds.filter( ( frond ) => ! frond.leader );
		const count = Math.min( frondsPerTierAtLod, regularFronds.length );

		for ( let index = 0; index < count; index ++ ) {

			const sourceIndex = Math.floor( index * regularFronds.length / count );

			addFrond( builder, regularFronds[ sourceIndex ]!, longitudinalSamples );

		}

		if ( leader !== undefined ) addFrond( builder, leader, longitudinalSamples );

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

	const topStart = ( ringCount - 1 ) * sides;
	const topEnd = topStart + sides;
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

			if ( triangle[ 0 ] === triangle[ 1 ] || triangle[ 1 ] === triangle[ 2 ] || triangle[ 2 ] === triangle[ 0 ] ) continue;

			indices.push( triangle[ 0 ]!, triangle[ 1 ]!, triangle[ 2 ]! );

		}

		if ( indices.length > start ) groups.push( { start, count: indices.length - start, partIndex: group.partIndex } );

	}

	const usedVertices = new Set( indices );
	const vertexMap = new Map<number, number>();
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const colors: number[] = [];
	const windWeight: number[] = [];

	for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {

		if ( ! usedVertices.has( vertex ) ) continue;

		vertexMap.set( vertex, positions.length / 3 );
		positions.push( mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! );
		normals.push( mesh.normals[ vertex * 3 ]!, mesh.normals[ vertex * 3 + 1 ]!, mesh.normals[ vertex * 3 + 2 ]! );
		uvs.push( mesh.uvs[ vertex * 2 ]!, mesh.uvs[ vertex * 2 + 1 ]! );
		colors.push( mesh.colors[ vertex * 3 ]!, mesh.colors[ vertex * 3 + 1 ]!, mesh.colors[ vertex * 3 + 2 ]! );
		windWeight.push( mesh.windWeight[ vertex ]! );

	}

	return {
		positions: new Float32Array( positions ),
		normals: new Float32Array( normals ),
		uvs: new Float32Array( uvs ),
		colors: new Float32Array( colors ),
		windWeight: new Float32Array( windWeight ),
		indices: new Uint32Array( indices.map( ( vertex ) => vertexMap.get( vertex )! ) ),
		groups,
	};

}

function addPointedTrunk( builder: MeshBuilder, spine: Vec3[], radii: number[], sides: number ): number {

	const pointedRadii = [ ...radii ];
	pointedRadii[ pointedRadii.length - 1 ] = 0;
	addTube( builder, spine, pointedRadii, sides, { color: barkColor, wind: ( t ) => t * 0.3, capEnd: false } );

	return ( spine.length - 1 ) * sides + 1;

}

function buildLod0( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunk = selectTrunkRings( layout, [ 0, 1, 2, 3, 7, 10, 12 ] );
	builder.beginGroup( 0 );
	const trunkVertexCount = addPointedTrunk( builder, trunk.spine, trunk.radii, 7 );
	addFronds( builder, layout, frondsPerTier, [ 0, 0.4, 1 ] );
	const mesh = closeTrunkTip( builder.build(), trunk.spine.length, 7, normalize( subtract( trunk.spine[ trunk.spine.length - 1 ]!, trunk.spine[ trunk.spine.length - 2 ]! ) ) );

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildLod1( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunk = selectTrunkRings( layout, [ 0, 1, 2, 3, 7, 10, 11, 12 ] );
	builder.beginGroup( 0 );
	const trunkVertexCount = addPointedTrunk( builder, trunk.spine, trunk.radii, 5 );
	addFronds( builder, layout, 4, [ 0, 1 ] );
	const mesh = closeTrunkTip( builder.build(), trunk.spine.length, 5, normalize( subtract( trunk.spine[ trunk.spine.length - 1 ]!, trunk.spine[ trunk.spine.length - 2 ]! ) ) );

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildLod2( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const trunk = selectTrunkRings( layout, [ 0, 2, 6, 10, 12 ] );

	builder.beginGroup( 0 );
	const trunkVertexCount = addPointedTrunk( builder, trunk.spine, trunk.radii, 4 );
	addFronds( builder, layout, 2, [ 0, 1 ] );
	const mesh = closeTrunkTip( builder.build(), trunk.spine.length, 4, normalize( subtract( trunk.spine[ trunk.spine.length - 1 ]!, trunk.spine[ trunk.spine.length - 2 ]! ) ) );

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function bakeLeafSilhouette( lod0: MeshData, texture: TextureData, parts: PartDef[], bounds: { radius: number; height: number } ): TextureData {

	const leafGroup = lod0.groups.find( ( group ) => group.partIndex === 1 );

	if ( leafGroup === undefined ) {
		throw new Error( 'Expected an LOD0 leaf group' );
	}

	const leafOnlyMesh = { ...lod0, groups: [ leafGroup ] };
	const data: VegetationData = {
		kind: 'tree',
		parts,
		lods: [ leafOnlyMesh ],
		collider: null,
		textures: { leaf: texture },
		bounds,
	};

	return bakeImpostor( data, parts.map( () => [ 1, 1, 1 ] ), Math.max( 1, Math.floor( texture.height / 2 ) ) );

}

function updateCrownAtlas( texture: TextureData, silhouette: TextureData ): void {

	const tileSize = texture.height;
	const sourceSize = silhouette.height;

	for ( let view = 0; view < 2; view ++ ) {

		for ( let y = 0; y < tileSize; y ++ ) {

			for ( let x = 0; x < tileSize; x ++ ) {

				const sourceX = Math.floor( x / tileSize * sourceSize );
				const sourceY = Math.floor( y / tileSize * sourceSize );
				const source = ( sourceY * silhouette.width + view * sourceSize + sourceX ) * 4;
				const target = ( y * texture.width + ( view + 1 ) * tileSize + x ) * 4;
				const alpha = silhouette.data[ source + 3 ]!;

				texture.data[ target ] = 0;
				texture.data[ target + 1 ] = 83;
				texture.data[ target + 2 ] = 0;
				texture.data[ target + 3 ] = alpha >= 128 ? 255 : 0;

			}

		}

	}

}

function addSilhouetteCard( builder: MeshBuilder, centerX: number, centerZ: number, bottomY: number, topY: number, radius: number, angle: number, tileIndex: number ): void {

	const right: Vec3 = [ Math.cos( angle ) * radius, 0, Math.sin( angle ) * radius ];
	const center: Vec3 = [ centerX, ( bottomY + topY ) * 0.5, centerZ ];
	const up: Vec3 = [ 0, ( topY - bottomY ) * 0.5, 0 ];
	const corners = [
		add( subtract( center, right ), multiply( up, - 1 ) ),
		add( add( center, right ), multiply( up, - 1 ) ),
		add( add( center, right ), up ),
		add( subtract( center, right ), up ),
	];
	const inset = 1 / 1536;
	const tileStart = tileIndex / 3;
	const tileEnd = ( tileIndex + 1 ) / 3;
	const uvs: [ number, number ][] = [ [ tileStart + inset, 0 ], [ tileEnd - inset, 0 ], [ tileEnd - inset, 1 ], [ tileStart + inset, 1 ] ];
	const indices = corners.map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], uvs[ index ]!, leafColor, 0.5 + clamp( point[ 1 ] / ( topY || 1 ), 0, 1 ) * 0.5 ) );

	builder.addTriangle( indices[ 0 ]!, indices[ 1 ]!, indices[ 2 ]! );
	builder.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 3 ]! );
	builder.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 1 ]! );
	builder.addTriangle( indices[ 0 ]!, indices[ 3 ]!, indices[ 2 ]! );

}

function buildLod3( layout: TreeLayout, radius: number ): MeshData {

	const builder = new MeshBuilder();
	const trunkFractions = [ 0, 0.17, 0.34, 0.51, 0.68, trunkTopFraction ];
	const trunkSpine = trunkFractions.map( ( fraction ) => getTrunkPoint( layout.trunkSpine, layout.height, fraction ) );
	const trunkRadii = trunkFractions.map( ( fraction ) => getTrunkRadius( fraction, layout.height ) );

	builder.beginGroup( 0 );
	const trunkVertexCount = addPointedTrunk( builder, trunkSpine, trunkRadii, 3 );
	builder.beginGroup( 1 );
	addSilhouetteCard( builder, 0, 0, 0, layout.height, radius, 0, 1 );
	addSilhouetteCard( builder, 0, 0, 0, layout.height, radius, Math.PI * 1.5, 2 );

	const mesh = closeTrunkTip( builder.build(), trunkSpine.length, 3, normalize( subtract( trunkSpine[ trunkSpine.length - 1 ]!, trunkSpine[ trunkSpine.length - 2 ]! ) ) );

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildCollider( layout: TreeLayout ): ColliderData {

	const fractions = [ 0, 0.425, 0.85 ];
	const spine = fractions.map( ( fraction ) => getTrunkPoint( layout.trunkSpine, layout.height, fraction ) );
	const radii = fractions.map( ( fraction ) => getTrunkRadius( fraction, layout.height ) );
	const builder = new MeshBuilder();

	builder.beginGroup( 0 );
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

export function generateTreeData( options: TreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? 7.5;
	const crownSizeInput = options.crownSize ?? 1;
	const branchCount = options.branchCount ?? 15;

	if ( ! Number.isFinite( height ) || height <= 0 ) {
		throw new RangeError( 'Tree height must be a positive finite number' );
	}

	if ( ! Number.isFinite( crownSizeInput ) ) {
		throw new RangeError( 'Tree crownSize must be finite' );
	}

	if ( ! Number.isInteger( branchCount ) || branchCount < 1 ) {
		throw new RangeError( 'Tree branchCount must be a positive integer' );
	}

	const crownSize = clamp( crownSizeInput, 0.5, 1.5 );
	const layout = createTreeLayout( seed, height, crownSize, branchCount );
	const lod0 = buildLod0( layout );
	const lod1 = buildLod1( layout );
	const lod2 = buildLod2( layout );
	const parts: PartDef[] = [
		{
			name: 'bark',
			defaultColor: 0xffffff,
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
			defaultColor: 0xd2d2d2,
			texture: 'leaf',
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
		impostorPart(),
	];
	const textures = {
		bark: { ...createBarkTexture( seed ), wrap: 'repeat' as const },
		leaf: createFirSprigTexture( seed, 256, false ),
	};
	const lod0Bounds = { radius: getBoundsRadius( lod0 ), height };
	const silhouette = bakeLeafSilhouette( lod0, textures.leaf, parts, lod0Bounds );

	updateCrownAtlas( textures.leaf, silhouette );
	padTextureEdges( textures.leaf );

	const lod3 = buildLod3( layout, lod0Bounds.radius );
	const bounds = { radius: Math.max( lod0Bounds.radius, getBoundsRadius( lod1 ), getBoundsRadius( lod2 ), getBoundsRadius( lod3 ) ), height };
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
