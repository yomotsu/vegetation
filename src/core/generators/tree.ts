import { bakeImpostor, buildBillboard, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { addTube } from '../primitives';
import { createRandom } from '../random';
import { createBarkTexture } from '../barkTexture';
import { createFirSprigTexture } from '../leafTexture';
import type { Color3, ColliderData, MeshData, PartDef, TextureData, Vec3, VegetationData } from '../types';

export interface TreeOptions {
	seed?: number;
	height?: number;
	crownSize?: number;
	branchCount?: number;
}

interface Frond {
	center: Vec3;
	right: Vec3;
	forward: Vec3;
	radius: number;
}

interface Tier {
	y: number;
	radius: number;
	fronds: Frond[];
}

interface TreeLayout {
	height: number;
	trunkSpine: Vec3[];
	trunkRadii: number[];
	tiers: Tier[];
	fronds: Frond[];
	firstTierY: number;
}

interface CrownBounds {
	minX: number;
	minY: number;
	minZ: number;
	maxX: number;
	maxY: number;
	maxZ: number;
}

const barkColor: Color3 = [ 1, 1, 1 ];
const leafColor: Color3 = [ 1, 1, 1 ];
const trunkTopFraction = 0.98;
const frondsPerTier = 37;
const branchesPerTier = 12;
const trunkProfile = [ 0.35, 0.3, 0.255, 0.22, 0.19, 0.16, 0.135, 0.112, 0.094, 0.078, 0.064, 0.05, 0.035 ];

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

function getTrunkProfileIndex( fraction: number ): number {

	return clamp( fraction / trunkTopFraction, 0, 1 ) * ( trunkProfile.length - 1 );

}

function getTrunkRadius( fraction: number, height: number ): number {

	const profileIndex = getTrunkProfileIndex( fraction );
	const lowerIndex = Math.floor( profileIndex );
	const upperIndex = Math.min( trunkProfile.length - 1, lowerIndex + 1 );
	const amount = profileIndex - lowerIndex;
	const scale = height / 7.5;

	return ( trunkProfile[ lowerIndex ]! + ( trunkProfile[ upperIndex ]! - trunkProfile[ lowerIndex ]! ) * amount ) * scale;

}

function getTrunkPoint( layout: TreeLayout, fraction: number ): Vec3 {

	const targetY = clamp( fraction, 0, trunkTopFraction ) * layout.height;

	for ( let i = 1; i < layout.trunkSpine.length; i ++ ) {

		const previous = layout.trunkSpine[ i - 1 ]!;
		const next = layout.trunkSpine[ i ]!;

		if ( targetY <= next[ 1 ] ) {

			const amount = ( targetY - previous[ 1 ] ) / ( next[ 1 ] - previous[ 1 ] );

			return [
				previous[ 0 ] + ( next[ 0 ] - previous[ 0 ] ) * amount,
				targetY,
				previous[ 2 ] + ( next[ 2 ] - previous[ 2 ] ) * amount,
			];

		}

	}

	return [ ...layout.trunkSpine[ layout.trunkSpine.length - 1 ]! ];

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
	const maximumRadius = height / 7.5 * 2.42 * crownSize;
	const tierRotation = random.range( 0, Math.PI * 2 );

	for ( let tierIndex = 0; tierIndex < branchCount; tierIndex ++ ) {

		const tierRandom = random.fork( tierIndex + 1 );
		const t = branchCount === 1 ? 0.5 : tierIndex / ( branchCount - 1 );
		const tierY = height * ( 0.193 + t * 0.774 + tierRandom.range( - 0.004, 0.004 ) );
		const radiusProfile = 0.035 + 0.965 * Math.pow( 1 - t, 1.12 );
		const tierRadius = maximumRadius * radiusProfile * tierRandom.range( 0.987, 1.013 );
		const trunkPoint = getTrunkPoint( { height, trunkSpine: trunk.spine, trunkRadii: trunk.radii, tiers: [], fronds: [], firstTierY: tierY }, tierY / height );
		const fronds: Frond[] = [];
		const angleOffset = tierRotation + tierIndex * 0.61803398875 + tierRandom.range( - 0.085, 0.085 );

		for ( let frondIndex = 0; frondIndex < frondsPerTier; frondIndex ++ ) {

			const branchIndex = frondIndex % branchesPerTier;
			const segmentIndex = Math.floor( frondIndex / branchesPerTier );
			const branchRandom = tierRandom.fork( branchIndex + 101 );
			const frondRandom = tierRandom.fork( frondIndex + 401 );
			const angle = angleOffset + branchIndex / branchesPerTier * Math.PI * 2 + branchRandom.range( - 0.045, 0.045 );
			const startFractions = [ 0, 0.18, 0.38, 0.58 ];
			const startDistance = tierRadius * startFractions[ segmentIndex ]! * branchRandom.range( 0.97, 1.03 );
			const targetDistance = tierRadius * frondRandom.range( 0.96, 1.02 );
			const length = Math.max( tierRadius * 0.08, targetDistance - startDistance );
			const droopFactor = branchRandom.range( 0.09, 0.2 );
			const start: Vec3 = [
				trunkPoint[ 0 ] + Math.cos( angle ) * startDistance,
				tierY - startDistance * droopFactor,
				trunkPoint[ 2 ] + Math.sin( angle ) * startDistance,
			];
			const end: Vec3 = [ start[ 0 ] + Math.cos( angle ) * length, start[ 1 ] - length * droopFactor, start[ 2 ] + Math.sin( angle ) * length ];
			const forward = multiply( subtract( end, start ), 0.5 );
			const roll = frondRandom.range( - 0.38, 0.38 );
			const rightDirection = [ - Math.sin( angle ) * Math.sin( roll ), Math.cos( roll ), Math.cos( angle ) * Math.sin( roll ) ] as Vec3;
			const halfWidth = length * frondRandom.range( 0.14, 0.19 );
			const right = multiply( rightDirection, halfWidth );
			const center = add( add( start, forward ), [ 0, frondRandom.range( - 0.006, 0.006 ) * height, 0 ] );

			fronds.push( { center, right, forward, radius: tierRadius } );

		}

		tiers.push( { y: tierY, radius: tierRadius, fronds } );

	}

	return {
		height,
		trunkSpine: trunk.spine,
		trunkRadii: trunk.radii,
		tiers,
		fronds: tiers.flatMap( ( tier ) => tier.fronds ),
		firstTierY: Math.min( ...tiers.map( ( tier ) => tier.y ) ),
	};

}

function getFrondCorners( frond: Frond ): Vec3[] {

	return [
		add( subtract( frond.center, frond.right ), multiply( frond.forward, - 1 ) ),
		add( add( frond.center, frond.right ), multiply( frond.forward, - 1 ) ),
		add( add( frond.center, frond.right ), frond.forward ),
		add( subtract( frond.center, frond.right ), frond.forward ),
	];

}

function getLeafBounds( fronds: Frond[] ): CrownBounds {

	const bounds: CrownBounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: - Infinity, maxY: - Infinity, maxZ: - Infinity };

	for ( const frond of fronds ) {

		for ( const point of getFrondCorners( frond ) ) {

			bounds.minX = Math.min( bounds.minX, point[ 0 ] );
			bounds.minY = Math.min( bounds.minY, point[ 1 ] );
			bounds.minZ = Math.min( bounds.minZ, point[ 2 ] );
			bounds.maxX = Math.max( bounds.maxX, point[ 0 ] );
			bounds.maxY = Math.max( bounds.maxY, point[ 1 ] );
			bounds.maxZ = Math.max( bounds.maxZ, point[ 2 ] );

		}

	}

	return bounds;

}

function getFrondWind( point: Vec3, frond: Frond ): number {

	const distance = Math.hypot( point[ 0 ], point[ 2 ] );

	return clamp( 0.5 + distance / Math.max( 0.02, frond.radius ) * 0.5, 0.5, 1 );

}

function addFrond( builder: MeshBuilder, frond: Frond ): void {

	const corners = getFrondCorners( frond );
	const inset = 1 / 1536;
	const uvs: [ number, number ][] = [ [ inset, 0 ], [ 1 / 3 - inset, 0 ], [ 1 / 3 - inset, 1 ], [ inset, 1 ] ];
	const indices = corners.map( ( point, index ) => builder.addVertex( point, [ 0, 1, 0 ], uvs[ index ]!, leafColor, getFrondWind( point, frond ) ) );

	builder.addTriangle( indices[ 0 ]!, indices[ 1 ]!, indices[ 2 ]! );
	builder.addTriangle( indices[ 0 ]!, indices[ 2 ]!, indices[ 3 ]! );

}

function addFronds( builder: MeshBuilder, layout: TreeLayout, frondsPerTierAtLod: number ): void {

	builder.beginGroup( 1 );

	for ( const tier of layout.tiers ) {

		const count = Math.min( frondsPerTierAtLod, tier.fronds.length );

		for ( let index = 0; index < count; index ++ ) {

			const sourceIndex = Math.floor( index * tier.fronds.length / count );

			addFrond( builder, tier.fronds[ sourceIndex ]! );

		}

	}

}

function scaleTrunkV( mesh: MeshData, trunkVertexCount: number ): void {

	for ( let vertex = 0; vertex < trunkVertexCount; vertex ++ ) {

		mesh.uvs[ vertex * 2 + 1 ] = mesh.uvs[ vertex * 2 + 1 ]! * 2.5;

	}

}

function buildLod0( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );
	addTube( builder, layout.trunkSpine, layout.trunkRadii, 7, { color: barkColor, wind: ( t ) => t * 0.3, capEnd: false } );
	const trunkVertexCount = layout.trunkSpine.length * 7;
	addFronds( builder, layout, frondsPerTier );

	const mesh = builder.build();

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildLod1( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	builder.beginGroup( 0 );
	addTube( builder, layout.trunkSpine, layout.trunkRadii, 5, { color: barkColor, wind: ( t ) => t * 0.3, capEnd: false } );
	const trunkVertexCount = layout.trunkSpine.length * 5;
	addFronds( builder, layout, 18 );

	const mesh = builder.build();

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildLod2( layout: TreeLayout ): MeshData {

	const builder = new MeshBuilder();
	const spineIndices = [ 0, 2, 4, 6, 8, 10, 12 ];
	const trunkSpine = spineIndices.map( ( index ) => layout.trunkSpine[ index ]! );
	const trunkRadii = spineIndices.map( ( index ) => layout.trunkRadii[ index ]! );

	builder.beginGroup( 0 );
	addTube( builder, trunkSpine, trunkRadii, 4, { color: barkColor, wind: ( t ) => t * 0.3, capEnd: false } );
	const trunkVertexCount = trunkSpine.length * 4;
	addFronds( builder, layout, 9 );

	const mesh = builder.build();

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

				texture.data[ target ] = 31;
				texture.data[ target + 1 ] = 83;
				texture.data[ target + 2 ] = 12;
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

}

function buildLod3( layout: TreeLayout, radius: number ): MeshData {

	const builder = new MeshBuilder();
	const trunkFractions = [ 0, 0.17, 0.34, 0.51, 0.68, 0.85 ];
	const trunkSpine = trunkFractions.map( ( fraction ) => getTrunkPoint( layout, fraction ) );
	const trunkRadii = trunkFractions.map( ( fraction ) => getTrunkRadius( fraction, layout.height ) );

	builder.beginGroup( 0 );
	addTube( builder, trunkSpine, trunkRadii, 3, { color: barkColor, wind: ( t ) => t * 0.3, capEnd: false } );
	const trunkVertexCount = trunkSpine.length * 3;
	builder.beginGroup( 1 );
	addSilhouetteCard( builder, 0, 0, 0, layout.height, radius, 0, 1 );
	addSilhouetteCard( builder, 0, 0, 0, layout.height, radius, Math.PI * 1.5, 2 );

	const mesh = builder.build();

	scaleTrunkV( mesh, trunkVertexCount );

	return mesh;

}

function buildCollider( layout: TreeLayout ): ColliderData {

	const fractions = [ 0, 0.425, 0.85 ];
	const spine = fractions.map( ( fraction ) => getTrunkPoint( layout, fraction ) );
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

/** @internal クラウン領域をテストで測るための境界。 */
export function getTreeCrownBounds( options: TreeOptions = {} ): { minX: number; minY: number; maxX: number; maxY: number } {

	const height = options.height ?? 7.5;
	const crownSize = clamp( options.crownSize ?? 1, 0.5, 1.5 );
	const branchCount = options.branchCount ?? 8;
	const layout = createTreeLayout( options.seed ?? 1, height, crownSize, branchCount );
	const crown = getLeafBounds( layout.fronds );

	return { minX: crown.minX, minY: crown.minY, maxX: crown.maxX, maxY: crown.maxY };

}

export function generateTreeData( options: TreeOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const height = options.height ?? 7.5;
	const crownSizeInput = options.crownSize ?? 1;
	const branchCount = options.branchCount ?? 8;

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
			alphaTest: 0,
			doubleSided: false,
			flatShading: true,
		},
		{
			name: 'leaf',
			defaultColor: 0xffffff,
			texture: 'leaf',
			alphaTest: 0.5,
			doubleSided: true,
			flatShading: false,
		},
		impostorPart(),
	];
	const textures = {
		bark: createBarkTexture( seed ),
		leaf: createFirSprigTexture( seed, 256, false ),
	};
	const lod0Bounds = { radius: getBoundsRadius( lod0 ), height };
	const silhouette = bakeLeafSilhouette( lod0, textures.leaf, parts, lod0Bounds );

	updateCrownAtlas( textures.leaf, silhouette );

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
