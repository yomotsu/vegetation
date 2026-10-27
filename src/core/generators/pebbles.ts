import { buildBillboard, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { createNoise3D } from '../noise';
import { applyRockSurfaceShading, buildConvexRockMesh, buildRockMeshFromFaces, buildRockShell, createRockRadiusFunction, createRockRandom, getBounds, getProjectedMeshOutline, liftMesh, limitRockPeakSharpness, recomputeSmoothNormals, sinkMesh } from '../rockGeometry';
import { createRockTextures } from '../rockTexture';
import type { Color3, MeshData, PartDef, Vec3, VegetationData } from '../types';

const DEFAULT_COUNT = 16;
const MAX_COUNT = 30;
const MAX_LOD0_VERTICES = 240;
const FAR_PEBBLE_COLOR_FACTOR = 0.66;
const PEBBLES_SEED_SALT = 173;

export interface PebblesOptions {
	seed?: number;
	count?: number;
	spread?: number;
	size?: number;
	sizeVariation?: number;
	/** 地中に沈める全体高の割合（0〜1）。 */
	burial?: number;
	stoneColor?: number;
}

interface MeshBounds {
	minimum: Vec3;
	maximum: Vec3;
}

interface PebblePlacement {
	x: number;
	z: number;
	yaw: number;
	size: number;
	aspect: number;
	depthAspect: number;
	verticalAspect: number;
	seed: number;
	roughness: number;
}

function getMeshBounds( mesh: MeshData ): MeshBounds {

	const minimum: Vec3 = [ Infinity, Infinity, Infinity ];
	const maximum: Vec3 = [ - Infinity, - Infinity, - Infinity ];

	for ( let offset = 0; offset < mesh.positions.length; offset += 3 ) {

		for ( let axis = 0; axis < 3; axis ++ ) {

			minimum[ axis ] = Math.min( minimum[ axis ]!, mesh.positions[ offset + axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, mesh.positions[ offset + axis ]! );

		}

	}

	return { minimum, maximum };

}

function scaleMesh( mesh: MeshData, scale: Vec3 ): void {

	for ( let offset = 0; offset < mesh.positions.length; offset += 3 ) {

		for ( let axis = 0; axis < 3; axis ++ ) {

			mesh.positions[ offset + axis ] = mesh.positions[ offset + axis ]! * scale[ axis ]!;

		}

	}

}

function rotateMesh( mesh: MeshData, yaw: number ): void {

	const cosine = Math.cos( yaw );
	const sine = Math.sin( yaw );

	for ( let offset = 0; offset < mesh.positions.length; offset += 3 ) {

		const x = mesh.positions[ offset ]!;
		const z = mesh.positions[ offset + 2 ]!;
		mesh.positions[ offset ] = x * cosine - z * sine;
		mesh.positions[ offset + 2 ] = x * sine + z * cosine;

	}

}

function selectPebbleVertices( mesh: MeshData, count: number, prioritizeFootprint = false ): Vec3[] {

	const unique = new Map<string, Vec3>();

	for ( let offset = 0; offset < mesh.positions.length; offset += 3 ) {

		const position: Vec3 = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		const key = position.map( ( value ) => value.toFixed( 6 ) ).join( ',' );
		unique.set( key, position );

	}

	const positions = [ ...unique.values() ];
	if ( positions.length <= count ) return positions;

	const bounds = getMeshBounds( mesh );
	const selected = new Set<number>();

	for ( const axis of prioritizeFootprint ? [ 0, 2 ] : [ 0, 1, 2 ] ) {

		let minimum = 0;
		let maximum = 0;

		for ( let index = 1; index < positions.length; index ++ ) {

			if ( positions[ index ]![ axis ]! < positions[ minimum ]![ axis ]! ) minimum = index;
			if ( positions[ index ]![ axis ]! > positions[ maximum ]![ axis ]! ) maximum = index;

		}

		selected.add( minimum );
		selected.add( maximum );

	}

	if ( prioritizeFootprint ) {

		let highest = 0;
		for ( let index = 1; index < positions.length; index ++ ) {

			if ( positions[ index ]![ 1 ]! > positions[ highest ]![ 1 ]! ) highest = index;

		}

		selected.add( highest );

		let lowest = 0;
		for ( let index = 1; index < positions.length; index ++ ) {

			if ( positions[ index ]![ 1 ]! < positions[ lowest ]![ 1 ]! ) lowest = index;

		}

		selected.add( lowest );

	}

	const center: Vec3 = [
		( bounds.minimum[ 0 ] + bounds.maximum[ 0 ] ) * 0.5,
		( bounds.minimum[ 1 ] + bounds.maximum[ 1 ] ) * 0.5,
		( bounds.minimum[ 2 ] + bounds.maximum[ 2 ] ) * 0.5,
	];
	while ( selected.size < count ) {

		let best = - 1;
		let bestSpacing = - Infinity;

		for ( let candidate = 0; candidate < positions.length; candidate ++ ) {

			if ( selected.has( candidate ) ) continue;

			let spacing = Infinity;
			const position = positions[ candidate ]!;
			const candidateDirection: Vec3 = [ position[ 0 ] - center[ 0 ], prioritizeFootprint ? 0 : position[ 1 ] - center[ 1 ], position[ 2 ] - center[ 2 ] ];
			const candidateLength = Math.hypot( candidateDirection[ 0 ], candidateDirection[ 1 ], candidateDirection[ 2 ] );
			if ( candidateLength < 1e-8 ) continue;

			for ( const index of selected ) {

				const other = positions[ index ]!;
				const otherDirection: Vec3 = [ other[ 0 ] - center[ 0 ], prioritizeFootprint ? 0 : other[ 1 ] - center[ 1 ], other[ 2 ] - center[ 2 ] ];
				const otherLength = Math.hypot( otherDirection[ 0 ], otherDirection[ 1 ], otherDirection[ 2 ] );
				if ( otherLength < 1e-8 ) continue;
				const dot = ( candidateDirection[ 0 ] * otherDirection[ 0 ] + candidateDirection[ 1 ] * otherDirection[ 1 ] + candidateDirection[ 2 ] * otherDirection[ 2 ] ) / ( candidateLength * otherLength );
				spacing = Math.min( spacing, 1 - dot );

			}

			if ( spacing > bestSpacing ) {

				best = candidate;
				bestSpacing = spacing;

			}

		}

		if ( best < 0 ) break;
		selected.add( best );

	}

	return [ ...selected ].sort( ( first, second ) => first - second ).map( ( index ) => positions[ index ]! );

}

function createPebbleRadiusFunction( seed: number, roughness: number, detailScale: number ): ( direction: Vec3 ) => number {

	const noise = createNoise3D( seed + 431 );
	const random = createRockRandom( seed + 967 );
	const offset = [ random() * 97, random() * 97, random() * 97 ];

	return ( direction: Vec3 ): number => {

		const coarse = noise( direction[ 0 ] * 1.6 + offset[ 0 ]!, direction[ 1 ] * 1.6 + offset[ 1 ]!, direction[ 2 ] * 1.6 + offset[ 2 ]! );
		const broad = noise( direction[ 0 ] * 2.4 + offset[ 2 ]!, direction[ 1 ] * 2.4 - offset[ 0 ]!, direction[ 2 ] * 2.4 + offset[ 1 ]! );

		return Math.max( 0.86, Math.min( 1.14, 1 + ( coarse * 0.14 + broad * 0.04 ) * roughness * detailScale ) );

	};

}

function appendPebble( builder: MeshBuilder, mesh: MeshData, placement: PebblePlacement, burial: number, alreadyGrounded = false, bandLimitWeight = 0.3 ): void {

	if ( ! alreadyGrounded ) {

		const minimumY = Math.min( ...Array.from( mesh.positions ).filter( ( _, index ) => index % 3 === 1 ) );
		const maximumY = Math.max( ...Array.from( mesh.positions ).filter( ( _, index ) => index % 3 === 1 ) );
		const fullHeight = maximumY - minimumY;

		liftMesh( mesh, - minimumY );
		sinkMesh( mesh, burial * fullHeight, - Math.min( burial, 0.15 ) * fullHeight );

	}

	limitRockPeakSharpness( mesh, bandLimitWeight );

	const vertices: number[] = [];
	builder.beginGroup( 0 );

	for ( let vertex = 0; vertex < mesh.positions.length / 3; vertex ++ ) {

		const offset = vertex * 3;
		const x = mesh.positions[ offset ]!;
		const y = mesh.positions[ offset + 1 ]!;
		const z = mesh.positions[ offset + 2 ]!;
		const position: Vec3 = [ placement.x + x, y, placement.z + z ];
		const normal: Vec3 = [ mesh.normals[ offset ]!, mesh.normals[ offset + 1 ]!, mesh.normals[ offset + 2 ]! ];
		const uv: [ number, number ] = [ mesh.uvs[ vertex * 2 ]!, mesh.uvs[ vertex * 2 + 1 ]! ];
		const color: Color3 = [ mesh.colors[ offset ]!, mesh.colors[ offset + 1 ]!, mesh.colors[ offset + 2 ]! ];
		vertices.push( builder.addVertex( position, normal, uv, color, mesh.windWeight[ vertex ]! ) );

	}

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		builder.addTriangle( vertices[ mesh.indices[ index ]! ]!, vertices[ mesh.indices[ index + 1 ]! ]!, vertices[ mesh.indices[ index + 2 ]! ]! );

	}

}

function createPlacements( seed: number, count: number, spread: number, size: number, sizeVariation: number ): PebblePlacement[] {

	const random = createRockRandom( seed + PEBBLES_SEED_SALT );
	const placements: PebblePlacement[] = [];

	for ( let index = 0; index < count; index ++ ) {

		const angle = random() * Math.PI * 2;
		const distance = Math.sqrt( random() ) * spread;
		const sizeScale = 1 - sizeVariation + random() * sizeVariation * 2;

		placements.push( {
			x: Math.cos( angle ) * distance,
			z: Math.sin( angle ) * distance,
			yaw: random() * Math.PI * 2,
			size: size * sizeScale,
			aspect: 0.76 + random() * 0.48,
			depthAspect: 0.76 + random() * 0.48,
			verticalAspect: 0.9 + random() * 0.55,
			seed: seed * 31 + index * 97 + PEBBLES_SEED_SALT,
			roughness: 0.25 + random() * 0.35,
		} );

	}

	return placements;

}

function buildStoneLod( placements: PebblePlacement[], burial: number, level: 0 | 1 | 2 ): MeshData {

	const builder = new MeshBuilder();
	const lod0VertexLimit = Math.min( 12, Math.floor( MAX_LOD0_VERTICES / placements.length ) );

	for ( const placement of placements ) {

		const detailScale = level === 0 ? 1 : level === 1 ? 0.8 : 0.6;
		const radiusAt = createPebbleRadiusFunction( placement.seed, placement.roughness, detailScale );
		const reference = buildRockShell( 1, radiusAt, 1 );
		scaleMesh( reference, [ placement.size * 0.5 * placement.aspect, placement.size * 0.5 * placement.verticalAspect, placement.size * 0.5 * placement.depthAspect ] );
		rotateMesh( reference, placement.yaw );
		const vertexLimit = level === 0 ? lod0VertexLimit : level === 1 ? Math.min( 8, lod0VertexLimit - 1 ) : 6;
		const stone = buildConvexRockMesh( selectPebbleVertices( reference, vertexLimit, level === 2 ) );

		appendPebble( builder, stone, placement, burial, false, 0.025 );

	}

	const mesh = builder.build();
	recomputeSmoothNormals( mesh );
	applyRockSurfaceShading( mesh );

	return mesh;

}

function buildFarStoneLod( placements: PebblePlacement[], burial: number, size: number ): MeshData {

	const stoneCount = Math.min( placements.length, Math.max( 4, Math.ceil( placements.length * 0.9375 ) ) );
	const selected = placements.slice().sort( ( first, second ) => second.size - first.size ).slice( 0, stoneCount );
	const builder = new MeshBuilder();

	for ( const placement of selected ) {

		const radiusAt = createRockRadiusFunction( placement.seed, 1, placement.roughness, 1, 0.02 );
		const reference = buildRockShell( 1, radiusAt, 1 );
		scaleMesh( reference, [ placement.size * 0.5 * placement.aspect, placement.size * 0.5 * placement.verticalAspect, placement.size * 0.5 * placement.depthAspect ] );
		rotateMesh( reference, placement.yaw );
		const bounds = getMeshBounds( reference );
		const fullHeight = bounds.maximum[ 1 ] - bounds.minimum[ 1 ];
		// Widen the coarse base enough to keep its apex obtuse without shortening the silhouette.
		const base = getProjectedMeshOutline( reference, 5, - 0.03 * size ).map( ( [ x, y, z ] ) => [ x * 1.1, y, z * 1.1 ] as Vec3 );
		const apexY = bounds.maximum[ 1 ] - bounds.minimum[ 1 ] - burial * fullHeight;
		const vertices = [ ...base, [ 0, apexY, 0 ] as Vec3 ];
		const apexIndex = vertices.length - 1;
		const faces: [ number, number, number ][] = [];

		for ( let index = 0; index < base.length; index ++ ) faces.push( [ index, apexIndex, ( index + 1 ) % base.length ] );
		const stone = buildRockMeshFromFaces( vertices, faces );

		appendPebble( builder, stone, placement, burial, true, 0.03 );

	}

	const mesh = builder.build();
	recomputeSmoothNormals( mesh );
	applyRockSurfaceShading( mesh );

	return mesh;

}

export function generatePebblesData( options: PebblesOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const count = options.count ?? DEFAULT_COUNT;
	const spread = options.spread ?? 1.56;
	const size = options.size ?? 0.22;
	const sizeVariation = options.sizeVariation ?? 0.8;
	const burial = options.burial ?? 0.4;
	const stoneColor = options.stoneColor ?? 0xffffff;

	if ( ! Number.isFinite( seed ) ) {
		throw new RangeError( 'Pebbles seed must be finite' );
	}

	if ( ! Number.isInteger( count ) || count < 4 || count > MAX_COUNT ) {
		throw new RangeError( `Pebbles count must be an integer from 4 to ${ MAX_COUNT }` );
	}

	if ( ! Number.isFinite( spread ) || spread <= 0 ) {
		throw new RangeError( 'Pebbles spread must be a positive finite number' );
	}

	if ( ! Number.isFinite( size ) || size <= 0 ) {
		throw new RangeError( 'Pebbles size must be a positive finite number' );
	}

	if ( ! Number.isFinite( sizeVariation ) || sizeVariation < 0 || sizeVariation > 0.9 ) {
		throw new RangeError( 'Pebbles size variation must be a finite value from 0 to 0.9' );
	}

	if ( ! Number.isFinite( burial ) || burial < 0 || burial > 1 ) {
		throw new RangeError( 'Pebbles burial must be a finite value from 0 to 1' );
	}

	if ( ! Number.isInteger( stoneColor ) || stoneColor < 0 || stoneColor > 0xffffff ) {
		throw new RangeError( 'Pebbles stone color must be a 24-bit integer' );
	}

	const placements = createPlacements( seed, count, spread, size, sizeVariation );
	const lod0 = buildStoneLod( placements, burial, 0 );
	const lod1 = buildStoneLod( placements, burial, 1 );
	const lod2 = buildStoneLod( placements, burial, 2 );
	const lod3 = buildFarStoneLod( placements, burial, size );
	const bounds = getBounds( lod0 );
	const lod4 = buildBillboard( bounds, 1, lod0, bounds.height * 0.25 );
	lod3.colors.fill( lod0.colors[ 0 ]! * FAR_PEBBLE_COLOR_FACTOR );
	const parts: PartDef[] = [
		{
			name: 'stone',
			defaultColor: stoneColor,
			texture: 'albedo',
			normalTexture: 'normal',
			roughness: 0.9,
			specularIntensity: 0.014872,
			ior: 1.05,
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
		},
		impostorPart(),
	];
	const textures = createRockTextures( seed );

	return {
		kind: 'pebbles',
		parts,
		lods: [ lod0, lod1, lod2, lod3, lod4 ],
		collider: null,
		textures: { albedo: textures.albedo, normal: textures.normal },
		bounds,
	};

}
