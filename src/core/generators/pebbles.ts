import { buildBillboard, buildSixPlaneImpostor, impostorLod3Part, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { applyRockSurfaceShading, buildRockShell, createRockRadiusFunction, createRockRandom, getBounds, liftMesh, recomputeSmoothNormals, sinkMesh } from '../rockGeometry';
import { createRockTextures } from '../rockTexture';
import type { Color3, MeshData, PartDef, Vec3, VegetationData } from '../types';

const DEFAULT_COUNT = 16;
const MAX_COUNT = 30;
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

function getSphericalUv( direction: Vec3 ): [ number, number ] {

	return [
		Math.atan2( direction[ 2 ], direction[ 0 ] ) / ( Math.PI * 2 ) + 0.5,
		Math.asin( Math.max( - 1, Math.min( 1, direction[ 1 ] ) ) ) / Math.PI + 0.5,
	];

}

function buildConvexHullFaces( positions: Vec3[] ): [ number, number, number ][] {

	const planes = new Map<string, { indices: number[]; normal: Vec3 }>();
	const center: Vec3 = [ 0, 0, 0 ];

	for ( const position of positions ) {

		center[ 0 ] += position[ 0 ] / positions.length;
		center[ 1 ] += position[ 1 ] / positions.length;
		center[ 2 ] += position[ 2 ] / positions.length;

	}

	for ( let first = 0; first < positions.length; first ++ ) {

		for ( let second = first + 1; second < positions.length; second ++ ) {

			for ( let third = second + 1; third < positions.length; third ++ ) {

				const a = positions[ first ]!;
				const b = positions[ second ]!;
				const c = positions[ third ]!;
				const ab: Vec3 = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ];
				const ac: Vec3 = [ c[ 0 ] - a[ 0 ], c[ 1 ] - a[ 1 ], c[ 2 ] - a[ 2 ] ];
				let normal: Vec3 = [
					ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ],
					ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ],
					ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ],
				];
				const normalLength = Math.hypot( normal[ 0 ], normal[ 1 ], normal[ 2 ] );

				if ( normalLength < 1e-8 ) continue;

				normal = [ normal[ 0 ] / normalLength, normal[ 1 ] / normalLength, normal[ 2 ] / normalLength ];
				const distances = positions.map( ( position ) => ( position[ 0 ] - a[ 0 ] ) * normal[ 0 ] + ( position[ 1 ] - a[ 1 ] ) * normal[ 1 ] + ( position[ 2 ] - a[ 2 ] ) * normal[ 2 ] );
				const minimum = Math.min( ...distances );
				const maximum = Math.max( ...distances );

				if ( minimum < - 1e-7 && maximum > 1e-7 ) continue;

				const indices = distances.map( ( distance, index ) => Math.abs( distance ) <= 1e-7 ? index : - 1 ).filter( ( index ) => index >= 0 );
				if ( indices.length < 3 ) continue;

				const key = indices.join( ',' );
				if ( planes.has( key ) ) continue;

				const faceCenter: Vec3 = [ 0, 0, 0 ];

				for ( const index of indices ) {

					faceCenter[ 0 ] += positions[ index ]![ 0 ] / indices.length;
					faceCenter[ 1 ] += positions[ index ]![ 1 ] / indices.length;
					faceCenter[ 2 ] += positions[ index ]![ 2 ] / indices.length;

				}

				if ( ( faceCenter[ 0 ] - center[ 0 ] ) * normal[ 0 ] + ( faceCenter[ 1 ] - center[ 1 ] ) * normal[ 1 ] + ( faceCenter[ 2 ] - center[ 2 ] ) * normal[ 2 ] < 0 ) {

					normal = [ - normal[ 0 ], - normal[ 1 ], - normal[ 2 ] ];

				}

				planes.set( key, { indices, normal } );

			}

		}

	}

	const faces: [ number, number, number ][] = [];

	for ( const plane of planes.values() ) {

		const faceCenter: Vec3 = [ 0, 0, 0 ];

		for ( const index of plane.indices ) {

			faceCenter[ 0 ] += positions[ index ]![ 0 ] / plane.indices.length;
			faceCenter[ 1 ] += positions[ index ]![ 1 ] / plane.indices.length;
			faceCenter[ 2 ] += positions[ index ]![ 2 ] / plane.indices.length;

		}

		const reference: Vec3 = Math.abs( plane.normal[ 0 ] ) < 0.8 ? [ 1, 0, 0 ] : [ 0, 1, 0 ];
		const u: Vec3 = [
			plane.normal[ 1 ] * reference[ 2 ] - plane.normal[ 2 ] * reference[ 1 ],
			plane.normal[ 2 ] * reference[ 0 ] - plane.normal[ 0 ] * reference[ 2 ],
			plane.normal[ 0 ] * reference[ 1 ] - plane.normal[ 1 ] * reference[ 0 ],
		];
		const uLength = Math.hypot( u[ 0 ], u[ 1 ], u[ 2 ] ) || 1;
		const tangent: Vec3 = [ u[ 0 ] / uLength, u[ 1 ] / uLength, u[ 2 ] / uLength ];
		const v: Vec3 = [
			plane.normal[ 1 ]! * tangent[ 2 ]! - plane.normal[ 2 ]! * tangent[ 1 ]!,
			plane.normal[ 2 ]! * tangent[ 0 ]! - plane.normal[ 0 ]! * tangent[ 2 ]!,
			plane.normal[ 0 ]! * tangent[ 1 ]! - plane.normal[ 1 ]! * tangent[ 0 ]!,
		];
		const ordered = plane.indices.slice().sort( ( first, second ) => {

			const firstOffset: Vec3 = [ positions[ first ]![ 0 ] - faceCenter[ 0 ], positions[ first ]![ 1 ] - faceCenter[ 1 ], positions[ first ]![ 2 ] - faceCenter[ 2 ] ];
			const secondOffset: Vec3 = [ positions[ second ]![ 0 ] - faceCenter[ 0 ], positions[ second ]![ 1 ] - faceCenter[ 1 ], positions[ second ]![ 2 ] - faceCenter[ 2 ] ];
			const firstAngle = Math.atan2( firstOffset[ 0 ]! * v[ 0 ]! + firstOffset[ 1 ]! * v[ 1 ]! + firstOffset[ 2 ]! * v[ 2 ]!, firstOffset[ 0 ]! * tangent[ 0 ]! + firstOffset[ 1 ]! * tangent[ 1 ]! + firstOffset[ 2 ]! * tangent[ 2 ]! );
			const secondAngle = Math.atan2( secondOffset[ 0 ]! * v[ 0 ]! + secondOffset[ 1 ]! * v[ 1 ]! + secondOffset[ 2 ]! * v[ 2 ]!, secondOffset[ 0 ]! * tangent[ 0 ]! + secondOffset[ 1 ]! * tangent[ 1 ]! + secondOffset[ 2 ]! * tangent[ 2 ]! );

			return firstAngle - secondAngle;

		} );

		for ( let index = 1; index < ordered.length - 1; index ++ ) {

			faces.push( [ ordered[ 0 ]!, ordered[ index ]!, ordered[ index + 1 ]! ] );

		}

	}

	return faces;

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

function buildLowPolyPebble( positions: Vec3[] ): MeshData {

	const faces = buildConvexHullFaces( positions );
	const builder = new MeshBuilder();
	const white: Color3 = [ 1, 1, 1 ];
	builder.beginGroup( 0 );

	for ( let index = 0; index < positions.length; index ++ ) {

		const position = positions[ index ]!;
		const length = Math.hypot( position[ 0 ], position[ 1 ], position[ 2 ] ) || 1;
		const uv = getSphericalUv( [ position[ 0 ] / length, position[ 1 ] / length, position[ 2 ] / length ] );
		builder.addVertex( position, [ position[ 0 ] / length, position[ 1 ] / length, position[ 2 ] / length ], uv, white, 0 );

	}

	for ( const face of faces ) builder.addTriangle( face[ 0 ], face[ 1 ], face[ 2 ] );

	return builder.build();

}

function appendPebble( builder: MeshBuilder, mesh: MeshData, placement: PebblePlacement, burial: number ): void {

	const minimumY = Math.min( ...Array.from( mesh.positions ).filter( ( _, index ) => index % 3 === 1 ) );
	const maximumY = Math.max( ...Array.from( mesh.positions ).filter( ( _, index ) => index % 3 === 1 ) );
	const fullHeight = maximumY - minimumY;

	liftMesh( mesh, - minimumY );
	sinkMesh( mesh, burial * fullHeight, - Math.min( burial, 0.15 ) * fullHeight );

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
	const sizePriority = placements.slice().sort( ( first, second ) => second.size - first.size );
	const refinedLod1 = new Set( sizePriority.slice( 0, Math.ceil( placements.length / 2 ) ) );

	for ( const placement of placements ) {

		const radiusAt = createRockRadiusFunction( placement.seed, 1, placement.roughness, 1 );
		const reference = buildRockShell( 1, radiusAt, 1 );
		scaleMesh( reference, [ placement.size * 0.5 * placement.aspect, placement.size * 0.5 * placement.verticalAspect, placement.size * 0.5 * placement.depthAspect ] );
		rotateMesh( reference, placement.yaw );
		const vertexLimit = level === 0 ? 8 : level === 1 ? refinedLod1.has( placement ) ? 7 : 6 : 6;
		const stone = buildLowPolyPebble( selectPebbleVertices( reference, vertexLimit, level === 2 ) );

		appendPebble( builder, stone, placement, burial );

	}

	const mesh = builder.build();
	recomputeSmoothNormals( mesh );
	applyRockSurfaceShading( mesh );

	return mesh;

}

export function generatePebblesData( options: PebblesOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const count = options.count ?? DEFAULT_COUNT;
	const spread = options.spread ?? 1.6;
	const size = options.size ?? 0.32;
	const sizeVariation = options.sizeVariation ?? 0.48;
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
	const bounds = getBounds( lod0 );
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
		impostorLod3Part(),
		impostorPart(),
	];
	const lod3 = buildSixPlaneImpostor( bounds.height, bounds.radius, 1 );
	const lod4 = buildBillboard( bounds, 2 );
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
