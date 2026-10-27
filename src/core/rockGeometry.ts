import { MeshBuilder } from './meshBuilder';
import { createNoise3D } from './noise';
import { addRockShell } from './primitives';
import type { Color3, MeshData, Vec3 } from './types';

export function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

interface WeldedMeshTopology {
	positions: Vec3[];
	vertices: number[][];
	neighbors: Set<number>[];
	vertexGroups: number[];
}

function getWeldedMeshTopology( mesh: MeshData ): WeldedMeshTopology {

	const groups = new Map<string, number>();
	const positions: Vec3[] = [];
	const vertices: number[][] = [];
	const vertexGroups = new Array<number>( mesh.positions.length / 3 );

	for ( let vertex = 0; vertex < vertexGroups.length; vertex ++ ) {

		const offset = vertex * 3;
		const position: Vec3 = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		const key = position.map( ( value ) => value.toFixed( 6 ) ).join( ',' );
		let group = groups.get( key );

		if ( group === undefined ) {

			group = positions.length;
			groups.set( key, group );
			positions.push( position );
			vertices.push( [] );

		}

		vertexGroups[ vertex ] = group;
		vertices[ group ]!.push( vertex );

	}

	const neighbors = positions.map( () => new Set<number>() );

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const triangle = [ vertexGroups[ mesh.indices[ index ]! ]!, vertexGroups[ mesh.indices[ index + 1 ]! ]!, vertexGroups[ mesh.indices[ index + 2 ]! ]! ];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = triangle[ edge ]!;
			const second = triangle[ ( edge + 1 ) % 3 ]!;

			if ( first === second ) continue;
			neighbors[ first ]!.add( second );
			neighbors[ second ]!.add( first );

		}

	}

	return { positions, vertices, neighbors, vertexGroups };

}

function meanNeighborPosition( positions: Vec3[], neighbors: Set<number> ): Vec3 | undefined {

	if ( neighbors.size === 0 ) return undefined;

	const average: Vec3 = [ 0, 0, 0 ];

	for ( const neighbor of neighbors ) {
		for ( let axis = 0; axis < 3; axis ++ ) average[ axis ]! += positions[ neighbor ]![ axis ]! / neighbors.size;
	}

	return average;

}

function getConeApexAngle( point: Vec3, neighbors: Set<number>, positions: Vec3[] ): number {

	const average = meanNeighborPosition( positions, neighbors );
	if ( average === undefined || neighbors.size < 3 ) return 180;

	const axis: Vec3 = [ average[ 0 ] - point[ 0 ], average[ 1 ] - point[ 1 ], average[ 2 ] - point[ 2 ] ];
	const axisLength = Math.hypot( axis[ 0 ], axis[ 1 ], axis[ 2 ] );
	if ( axisLength < 1e-8 ) return 180;
	axis[ 0 ] /= axisLength;
	axis[ 1 ] /= axisLength;
	axis[ 2 ] /= axisLength;
	let widestHalfAngle = 0;

	for ( const neighbor of neighbors ) {
		const ray: Vec3 = [ positions[ neighbor ]![ 0 ] - point[ 0 ], positions[ neighbor ]![ 1 ] - point[ 1 ], positions[ neighbor ]![ 2 ] - point[ 2 ] ];
		const rayLength = Math.hypot( ray[ 0 ], ray[ 1 ], ray[ 2 ] );
		if ( rayLength < 1e-8 ) continue;
		const cosine = clamp( ( ray[ 0 ] * axis[ 0 ] + ray[ 1 ] * axis[ 1 ] + ray[ 2 ] * axis[ 2 ] ) / rayLength, - 1, 1 );
		widestHalfAngle = Math.max( widestHalfAngle, Math.acos( cosine ) );
	}

	return Math.min( Math.PI, widestHalfAngle * 2 ) * 180 / Math.PI;

}

/** Low-pass mesh-scale displacement and keep visible 1-ring peaks broad enough to read as rock. */
export function limitRockPeakSharpness( mesh: MeshData, bandLimitWeight: number, minimumApexAngle = 100.5 ): void {

	if ( ! Number.isFinite( bandLimitWeight ) || bandLimitWeight < 0 || bandLimitWeight > 1 ) {
		throw new RangeError( 'Rock band-limit weight must be from 0 to 1' );
	}

	const topology = getWeldedMeshTopology( mesh );
	const positions = topology.positions.map( ( position ) => [ ...position ] as Vec3 );
	const center: Vec3 = [ 0, 0, 0 ];
	for ( const position of positions ) {
		center[ 0 ] += position[ 0 ] / positions.length;
		center[ 1 ] += position[ 1 ] / positions.length;
		center[ 2 ] += position[ 2 ] / positions.length;
	}

	// One graph-Laplacian pass damps radius detail that the current LOD cannot represent.
	if ( bandLimitWeight > 0 ) {
		const filtered = positions.map( ( position ) => [ ...position ] as Vec3 );
		for ( let vertex = 0; vertex < positions.length; vertex ++ ) {
			if ( positions[ vertex ]![ 1 ] <= 0 ) continue;
			const average = meanNeighborPosition( positions, topology.neighbors[ vertex ]! );
			if ( average === undefined ) continue;
			for ( let axis = 0; axis < 3; axis ++ ) filtered[ vertex ]![ axis ] = positions[ vertex ]![ axis ]! + ( average[ axis ]! - positions[ vertex ]![ axis ]! ) * bandLimitWeight;
		}
		for ( let vertex = 0; vertex < positions.length; vertex ++ ) positions[ vertex ] = filtered[ vertex ]!;
	}

	// Clamp only outward Laplacian offsets; ordinary convex curvature stays intact.
	for ( let vertex = 0; vertex < positions.length; vertex ++ ) {
		if ( positions[ vertex ]![ 1 ] <= 0 ) continue;
		const adjacent = topology.neighbors[ vertex ]!;
		const average = meanNeighborPosition( positions, adjacent );
		if ( average === undefined || adjacent.size < 3 ) continue;
		let averageSpacing = 0;
		for ( const neighbor of adjacent ) averageSpacing += Math.hypot( positions[ vertex ]![ 0 ] - positions[ neighbor ]![ 0 ], positions[ vertex ]![ 1 ] - positions[ neighbor ]![ 1 ], positions[ vertex ]![ 2 ] - positions[ neighbor ]![ 2 ] ) / adjacent.size;
		const radial: Vec3 = [ positions[ vertex ]![ 0 ] - center[ 0 ], positions[ vertex ]![ 1 ] - center[ 1 ], positions[ vertex ]![ 2 ] - center[ 2 ] ];
		const radialLength = Math.hypot( radial[ 0 ], radial[ 1 ], radial[ 2 ] ) || 1;
		const offset: Vec3 = [ positions[ vertex ]![ 0 ] - average[ 0 ], positions[ vertex ]![ 1 ] - average[ 1 ], positions[ vertex ]![ 2 ] - average[ 2 ] ];
		const prominence = ( offset[ 0 ] * radial[ 0 ] + offset[ 1 ] * radial[ 1 ] + offset[ 2 ] * radial[ 2 ] ) / radialLength;
		const maximumProminence = averageSpacing * 0.9;
		if ( prominence <= maximumProminence ) continue;
		const correction = prominence - maximumProminence;
		positions[ vertex ] = [ positions[ vertex ]![ 0 ] - radial[ 0 ] / radialLength * correction, positions[ vertex ]![ 1 ] - radial[ 1 ] / radialLength * correction, positions[ vertex ]![ 2 ] - radial[ 2 ] / radialLength * correction ];
	}

	// Move any remaining narrow cone toward its 1-ring centroid, binary-searching the minimum correction.
	for ( let pass = 0; pass < 32; pass ++ ) {
		let changed = false;
		for ( let vertex = 0; vertex < positions.length; vertex ++ ) {
			if ( positions[ vertex ]![ 1 ] <= 0 ) continue;
			const adjacent = topology.neighbors[ vertex ]!;
			if ( getConeApexAngle( positions[ vertex ]!, adjacent, positions ) >= minimumApexAngle ) continue;
			const average = meanNeighborPosition( positions, adjacent );
			if ( average === undefined ) continue;
			const origin = positions[ vertex ]!;
			let endpoint = center;
			if ( getConeApexAngle( endpoint, adjacent, positions ) < minimumApexAngle ) endpoint = average;
			let minimum = 0;
			let maximum = 1;
			for ( let iteration = 0; iteration < 12; iteration ++ ) {
				const amount = ( minimum + maximum ) * 0.5;
				const candidate: Vec3 = [ origin[ 0 ] + ( endpoint[ 0 ] - origin[ 0 ] ) * amount, origin[ 1 ] + ( endpoint[ 1 ] - origin[ 1 ] ) * amount, origin[ 2 ] + ( endpoint[ 2 ] - origin[ 2 ] ) * amount ];
				if ( getConeApexAngle( candidate, adjacent, positions ) >= minimumApexAngle ) maximum = amount;
				else minimum = amount;
			}
			positions[ vertex ] = [ origin[ 0 ] + ( endpoint[ 0 ] - origin[ 0 ] ) * maximum, origin[ 1 ] + ( endpoint[ 1 ] - origin[ 1 ] ) * maximum, origin[ 2 ] + ( endpoint[ 2 ] - origin[ 2 ] ) * maximum ];
			changed = true;
		}
		if ( ! changed ) break;
	}

	for ( let group = 0; group < topology.vertices.length; group ++ ) {
		const position = positions[ group ]!;
		for ( const vertex of topology.vertices[ group ]! ) {
			const offset = vertex * 3;
			mesh.positions[ offset ] = position[ 0 ];
			mesh.positions[ offset + 1 ] = position[ 1 ];
			mesh.positions[ offset + 2 ] = position[ 2 ];
		}
	}

}

export function smoothstep( minimum: number, maximum: number, value: number ): number {

	const amount = clamp( ( value - minimum ) / ( maximum - minimum ), 0, 1 );

	return amount * amount * ( 3 - 2 * amount );

}

export function createRockRandom( seed: number ): () => number {

	let state = ( Math.floor( Math.abs( seed ) * 1000 ) + 0x6d2b79f5 ) >>> 0;

	return () => {

		state = ( state + 0x6d2b79f5 ) >>> 0;
		let value = state;
		value = Math.imul( value ^ value >>> 15, value | 1 );
		value ^= value + Math.imul( value ^ value >>> 7, value | 61 );

		return ( ( value ^ value >>> 14 ) >>> 0 ) / 4294967296;

	};

}

type RockFacetStyle = 'standard' | 'chiseled';

interface RockChunk {
	angle: number;
	centerY: number;
	halfHeight: number;
	halfAngle: number;
	bulge: number;
}

function createRockChunks( seed: number, radius: number ): RockChunk[] {

	const random = createRockRandom( seed + 3847 );
	const count = 3 + Math.floor( random() * 2 );
	const rotation = random() * Math.PI * 2;

	return Array.from( { length: count }, ( _, index ) => ( {
		angle: rotation + index / count * Math.PI * 2 + ( random() - 0.5 ) * 0.55,
		centerY: 0.02 + index / Math.max( count - 1, 1 ) * 0.84 + ( random() - 0.5 ) * 0.1,
		halfHeight: 0.35 + random() * 0.12,
		halfAngle: 0.96 + random() * 0.2,
		bulge: radius * ( 0.19 + random() * 0.055 ),
	} ) );

}

function getRockChunkRelief( direction: Vec3, chunks: RockChunk[], radius: number ): number {

	const angle = Math.atan2( direction[ 2 ], direction[ 0 ] );
	let first = 0;
	let second = 0;
	let edgeNotch = 0;

	for ( const chunk of chunks ) {

		const angularDistance = Math.abs( Math.atan2( Math.sin( angle - chunk.angle ), Math.cos( angle - chunk.angle ) ) );
		const verticalDistance = Math.abs( direction[ 1 ] - chunk.centerY ) / chunk.halfHeight;
		const angularRatio = angularDistance / chunk.halfAngle;
		const distance = Math.max( verticalDistance, angularRatio );
		const mask = 1 - smoothstep( 0.72, 1.04, distance );
		const value = chunk.bulge * mask;

		if ( value > first ) {

			second = first;
			first = value;

		} else if ( value > second ) {

			second = value;

		}

		const lip = smoothstep( 0.76, 0.9, distance ) * ( 1 - smoothstep( 0.98, 1.12, distance ) );
		edgeNotch = Math.max( edgeNotch, chunk.bulge * lip * 0.58 );

	}

	const overlap = smoothstep( 0.035, 0.1, second / radius ) * ( 1 - smoothstep( 0.02, 0.09, Math.abs( first - second ) / radius ) );
	const crevice = radius * 0.2 * overlap;

	return first + second * 0.08 - Math.max( edgeNotch, crevice );

}

function createCuttingPlanes( seed: number, radius: number, style: RockFacetStyle = 'standard' ): { normal: Vec3; distance: number }[] {

	const random = createRockRandom( seed );
	const planes: { normal: Vec3; distance: number }[] = [];

	if ( style === 'standard' ) {

		const topAngle = random() * Math.PI * 2;
		const topTilt = random() * 0.18;
		const topHorizontal = Math.sin( topTilt );

		planes.push( {
			normal: [ topHorizontal * Math.cos( topAngle ), Math.cos( topTilt ), topHorizontal * Math.sin( topAngle ) ],
			distance: radius * ( 0.66 + random() * 0.06 ),
		} );

		const sideRotation = random() * Math.PI * 2;

		for ( let index = 0; index < 5; index ++ ) {

			const vertical = index < 4 ? 0.12 + random() * 0.22 : - 0.32 - random() * 0.08;
			const angle = sideRotation + index / 5 * Math.PI * 2 + ( random() - 0.5 ) * 0.16;
			const horizontal = Math.sqrt( 1 - vertical * vertical );

			planes.push( {
				normal: [ horizontal * Math.cos( angle ), vertical, horizontal * Math.sin( angle ) ],
				distance: radius * ( index < 4 ? 0.74 + random() * 0.12 : 0.9 + random() * 0.045 ),
			} );

		}

		return planes;

	}

	const topCount = 3 + Math.floor( random() * 2 );
	const sideCount = 5 + Math.floor( random() * 2 );
	const topRotation = random() * Math.PI * 2;

	for ( let index = 0; index < topCount; index ++ ) {

		const angle = topRotation + index / topCount * Math.PI * 2 + ( random() - 0.5 ) * 0.42;
		const vertical = 0.62 + random() * 0.2;
		const horizontal = Math.sqrt( 1 - vertical * vertical );

		planes.push( {
			normal: [ horizontal * Math.cos( angle ), vertical, horizontal * Math.sin( angle ) ],
			distance: radius * ( 0.53 + random() * 0.1 ),
		} );

	}

	const sideRotation = random() * Math.PI * 2;

	for ( let index = 0; index < sideCount; index ++ ) {

		const vertical = - 0.28 + random() * 0.68;
		const angle = sideRotation + index / sideCount * Math.PI * 2 + ( random() - 0.5 ) * 0.28;
		const horizontal = Math.sqrt( 1 - vertical * vertical );

		planes.push( {
			normal: [ horizontal * Math.cos( angle ), vertical, horizontal * Math.sin( angle ) ],
			distance: radius * ( 0.74 + random() * 0.15 ),
		} );

	}

	const chipCount = 1 + Math.floor( random() * 2 );

	for ( let index = 0; index < chipCount; index ++ ) {

		const vertical = random() * 1.2 - 0.42;
		const angle = random() * Math.PI * 2;
		const horizontal = Math.sqrt( 1 - vertical * vertical );

		planes.push( {
			normal: [ horizontal * Math.cos( angle ), vertical, horizontal * Math.sin( angle ) ],
			distance: radius * ( 0.9 + random() * 0.07 ),
		} );

	}

	return planes;

}

export function createRockFacetNormals( seed: number, style: RockFacetStyle = 'chiseled' ): Vec3[] {

	return createCuttingPlanes( seed, 1, style ).map( ( plane ) => plane.normal );

}

export function createRockFacetEdgeFunction( seed: number, radius: number, style: RockFacetStyle = 'chiseled' ): ( direction: Vec3 ) => number {

	const planes = createCuttingPlanes( seed, radius, style );

	return ( direction: Vec3 ): number => {

		let nearest = Infinity;
		let nextNearest = Infinity;

		for ( const plane of planes ) {

			const projection = direction[ 0 ] * plane.normal[ 0 ] + direction[ 1 ] * plane.normal[ 1 ] + direction[ 2 ] * plane.normal[ 2 ];
			if ( projection <= 0 ) continue;
			const planeRadius = plane.distance / projection;

			if ( planeRadius < nearest ) {

				nextNearest = nearest;
				nearest = planeRadius;

			} else if ( planeRadius < nextNearest ) {

				nextNearest = planeRadius;

			}

		}

		if ( ! Number.isFinite( nextNearest ) ) return 0;

		const planeGap = ( nextNearest - nearest ) / radius;

		return 1 - smoothstep( 0.012, 0.14, planeGap );

	};

}

export function createRockCreaseFunction( seed: number, radius: number, style: RockFacetStyle = 'chiseled' ): ( direction: Vec3 ) => number {

	const facetEdgeAt = createRockFacetEdgeFunction( seed, radius, style );
	const chunks = style === 'chiseled' ? createRockChunks( seed, radius ) : [];

	return ( direction: Vec3 ): number => {

		const angle = Math.atan2( direction[ 2 ], direction[ 0 ] );
		let chunkEdge = 0;

		for ( const chunk of chunks ) {

			const angularDistance = Math.abs( Math.atan2( Math.sin( angle - chunk.angle ), Math.cos( angle - chunk.angle ) ) );
			const verticalDistance = Math.abs( direction[ 1 ] - chunk.centerY ) / chunk.halfHeight;
			const angularRatio = angularDistance / chunk.halfAngle;
			const distance = Math.max( verticalDistance, angularRatio );
			const edge = 1 - smoothstep( 0.08, 0.24, Math.abs( distance - 0.88 ) );
			chunkEdge = Math.max( chunkEdge, edge );

		}

		return Math.max( facetEdgeAt( direction ), chunkEdge );

	};

}

function softMinimum( first: number, second: number, softness: number ): number {

	const blend = Math.max( softness - Math.abs( first - second ), 0 ) / softness;

	return Math.min( first, second ) - blend * blend * softness * 0.25;

}

export function buildConvexHullFaces( positions: Vec3[] ): [ number, number, number ][] {

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

export function buildRockMeshFromFaces( positions: Vec3[], faces: [ number, number, number ][], partIndex = 0 ): MeshData {

	const builder = new MeshBuilder();
	const center: Vec3 = [ 0, 0, 0 ];
	const white: Color3 = [ 1, 1, 1 ];

	for ( const position of positions ) {

		center[ 0 ] += position[ 0 ] / positions.length;
		center[ 1 ] += position[ 1 ] / positions.length;
		center[ 2 ] += position[ 2 ] / positions.length;

	}

	builder.beginGroup( partIndex );

	for ( const position of positions ) {

		const direction: Vec3 = [ position[ 0 ] - center[ 0 ], position[ 1 ] - center[ 1 ], position[ 2 ] - center[ 2 ] ];
		const length = Math.hypot( direction[ 0 ], direction[ 1 ], direction[ 2 ] ) || 1;
		const normal: Vec3 = [ direction[ 0 ] / length, direction[ 1 ] / length, direction[ 2 ] / length ];
		const uv: [ number, number ] = [
			Math.atan2( normal[ 2 ], normal[ 0 ] ) / ( Math.PI * 2 ) + 0.5,
			Math.asin( clamp( normal[ 1 ], - 1, 1 ) ) / Math.PI + 0.5,
		];

		builder.addVertex( position, normal, uv, white, 0 );

	}

	for ( const face of faces ) builder.addTriangle( face[ 0 ], face[ 1 ], face[ 2 ] );

	return builder.build();

}

export function buildConvexRockMesh( positions: Vec3[], partIndex = 0 ): MeshData {

	return buildRockMeshFromFaces( positions, buildConvexHullFaces( positions ), partIndex );

}

export function buildOpenConvexRockMesh( positions: Vec3[], partIndex = 0, bottomFraction = 0.24 ): MeshData {

	const minimumY = Math.min( ...positions.map( ( position ) => position[ 1 ] ) );
	const maximumY = Math.max( ...positions.map( ( position ) => position[ 1 ] ) );
	const height = maximumY - minimumY || 1;
	const faces = buildConvexHullFaces( positions ).filter( ( face ) => {

		const first = positions[ face[ 0 ] ]!;
		const second = positions[ face[ 1 ] ]!;
		const third = positions[ face[ 2 ] ]!;
		const centerY = ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3;

		return centerY >= minimumY + height * bottomFraction;

	} );

	return buildRockMeshFromFaces( positions, faces, partIndex );

}

export function getHorizontalMeshOutline( mesh: MeshData, height: number, samples: number ): Vec3[] {

	const segments: [ Vec3, Vec3 ][] = [];

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const points: Vec3[] = [];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = mesh.indices[ index + edge ]! * 3;
			const second = mesh.indices[ index + ( edge + 1 ) % 3 ]! * 3;
			const firstY = mesh.positions[ first + 1 ]! - height;
			const secondY = mesh.positions[ second + 1 ]! - height;

			if ( Math.abs( firstY ) < 1e-7 ) points.push( [ mesh.positions[ first ]!, height, mesh.positions[ first + 2 ]! ] );
			if ( ( firstY < 0 && secondY > 0 ) || ( firstY > 0 && secondY < 0 ) ) {

				const amount = - firstY / ( secondY - firstY );
				points.push( [
					mesh.positions[ first ]! + ( mesh.positions[ second ]! - mesh.positions[ first ]! ) * amount,
					height,
					mesh.positions[ first + 2 ]! + ( mesh.positions[ second + 2 ]! - mesh.positions[ first + 2 ]! ) * amount,
				] );

			}

		}

		const unique = points.filter( ( point, pointIndex ) => points.findIndex( ( other ) => Math.hypot( point[ 0 ] - other[ 0 ], point[ 2 ] - other[ 2 ] ) < 1e-7 ) === pointIndex );
		if ( unique.length < 2 ) continue;

		let first = unique[ 0 ]!;
		let second = unique[ 1 ]!;
		let longest = 0;

		for ( let firstIndex = 0; firstIndex < unique.length; firstIndex ++ ) {

			for ( let secondIndex = firstIndex + 1; secondIndex < unique.length; secondIndex ++ ) {

				const distance = Math.hypot( unique[ firstIndex ]![ 0 ] - unique[ secondIndex ]![ 0 ], unique[ firstIndex ]![ 2 ] - unique[ secondIndex ]![ 2 ] );
				if ( distance > longest ) {
					longest = distance;
					first = unique[ firstIndex ]!;
					second = unique[ secondIndex ]!;
				}

			}

		}

		segments.push( [ first, second ] );

	}

	const outline: Vec3[] = [];

	for ( let sample = 0; sample < samples; sample ++ ) {

		const angle = sample / samples * Math.PI * 2;
		const direction: Vec3 = [ Math.cos( angle ), 0, Math.sin( angle ) ];
		let maximum = - Infinity;

		for ( const [ first, second ] of segments ) {

			const edgeX = second[ 0 ] - first[ 0 ];
			const edgeZ = second[ 2 ] - first[ 2 ];
			const denominator = direction[ 0 ] * edgeZ - direction[ 2 ] * edgeX;

			if ( Math.abs( denominator ) < 1e-8 ) continue;

			const distance = ( first[ 0 ] * edgeZ - first[ 2 ] * edgeX ) / denominator;
			const amount = ( first[ 0 ] * direction[ 2 ] - first[ 2 ] * direction[ 0 ] ) / denominator;
			if ( distance >= 0 && amount >= - 1e-7 && amount <= 1 + 1e-7 ) maximum = Math.max( maximum, distance );

		}

		if ( ! Number.isFinite( maximum ) ) throw new RangeError( `Mesh has no horizontal outline at y=${ height }` );
		outline.push( [ direction[ 0 ] * maximum, height, direction[ 2 ] * maximum ] );

	}

	return outline;

}

export function getProjectedMeshOutline( mesh: MeshData, samples: number, height: number ): Vec3[] {

	const points = new Map<string, Vec3>();

	for ( let offset = 0; offset < mesh.positions.length; offset += 3 ) {

		const point: Vec3 = [ mesh.positions[ offset ]!, 0, mesh.positions[ offset + 2 ]! ];
		points.set( `${ point[ 0 ].toFixed( 6 ) },${ point[ 2 ].toFixed( 6 ) }`, point );

	}

	const sorted = [ ...points.values() ].sort( ( first, second ) => first[ 0 ] - second[ 0 ] || first[ 2 ] - second[ 2 ] );
	const cross = ( first: Vec3, second: Vec3, third: Vec3 ): number => ( second[ 0 ] - first[ 0 ] ) * ( third[ 2 ] - first[ 2 ] ) - ( second[ 2 ] - first[ 2 ] ) * ( third[ 0 ] - first[ 0 ] );
	const lower: Vec3[] = [];
	const upper: Vec3[] = [];

	for ( const point of sorted ) {
		while ( lower.length >= 2 && cross( lower[ lower.length - 2 ]!, lower[ lower.length - 1 ]!, point ) <= 0 ) lower.pop();
		lower.push( point );
	}

	for ( const point of sorted.slice().reverse() ) {
		while ( upper.length >= 2 && cross( upper[ upper.length - 2 ]!, upper[ upper.length - 1 ]!, point ) <= 0 ) upper.pop();
		upper.push( point );
	}

	const hull = [ ...lower.slice( 0, - 1 ), ...upper.slice( 0, - 1 ) ];
	if ( hull.length < 3 ) throw new RangeError( 'Mesh does not have a projected outline' );
	const edgeLengths = hull.map( ( point, index ) => {

		const next = hull[ ( index + 1 ) % hull.length ]!;
		return Math.hypot( next[ 0 ] - point[ 0 ], next[ 2 ] - point[ 2 ] );

	} );
	const perimeter = edgeLengths.reduce( ( total, length ) => total + length, 0 );
	const outline: Vec3[] = [];

	for ( let sample = 0; sample < samples; sample ++ ) {

		let distance = sample / samples * perimeter;
		let edge = 0;

		while ( distance > edgeLengths[ edge ]! && edge < hull.length - 1 ) {

			distance -= edgeLengths[ edge ]!;
			edge ++;

		}

		const first = hull[ edge ]!;
		const second = hull[ ( edge + 1 ) % hull.length ]!;
		const amount = edgeLengths[ edge ]! > 0 ? distance / edgeLengths[ edge ]! : 0;
		outline.push( [ first[ 0 ] + ( second[ 0 ] - first[ 0 ] ) * amount, height, first[ 2 ] + ( second[ 2 ] - first[ 2 ] ) * amount ] );

	}

	return outline;

}

export function removeRockBottomCap( mesh: MeshData, floor: number ): void {

	const indices: number[] = [];
	const groups = [] as MeshData[ 'groups' ];

	for ( const group of mesh.groups ) {

		const start = indices.length;

		for ( let index = group.start; index < group.start + group.count; index += 3 ) {

			const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];
			const isBottomCap = triangle.every( ( vertex ) => mesh.positions[ vertex * 3 + 1 ]! <= floor + 1e-6 );
			if ( isBottomCap ) continue;
			indices.push( triangle[ 0 ]!, triangle[ 1 ]!, triangle[ 2 ]! );

		}

		if ( indices.length > start ) groups.push( { ...group, start, count: indices.length - start } );

	}

	mesh.indices = Uint32Array.from( indices );
	mesh.groups = groups;

	const used = new Uint8Array( mesh.positions.length / 3 );
	for ( const index of mesh.indices ) used[ index ] = 1;
	const remap = new Uint32Array( used.length );
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const colors: number[] = [];
	const windWeight: number[] = [];

	for ( let vertex = 0; vertex < used.length; vertex ++ ) {

		if ( used[ vertex ] === 0 ) continue;

		remap[ vertex ] = positions.length / 3;
		positions.push( mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! );
		normals.push( mesh.normals[ vertex * 3 ]!, mesh.normals[ vertex * 3 + 1 ]!, mesh.normals[ vertex * 3 + 2 ]! );
		uvs.push( mesh.uvs[ vertex * 2 ]!, mesh.uvs[ vertex * 2 + 1 ]! );
		colors.push( mesh.colors[ vertex * 3 ]!, mesh.colors[ vertex * 3 + 1 ]!, mesh.colors[ vertex * 3 + 2 ]! );
		windWeight.push( mesh.windWeight[ vertex ]! );

	}

	mesh.positions = Float32Array.from( positions );
	mesh.normals = Float32Array.from( normals );
	mesh.uvs = Float32Array.from( uvs );
	mesh.colors = Float32Array.from( colors );
	mesh.windWeight = Float32Array.from( windWeight );
	mesh.indices = Uint32Array.from( mesh.indices, ( index ) => remap[ index ]! );

}

/** detailScale attenuates medium and finer geometric displacement for coarser LODs. */
export function createRockRadiusFunction( seed: number, radius: number, roughness: number, verticalScale: number, detailScale = 1, facetStyle: RockFacetStyle = 'standard' ): ( direction: Vec3 ) => number {

	const noise = createNoise3D( seed + 71 );
	const noiseOffset = [ ( seed * 17.13 ) % 71, ( seed * 31.7 ) % 89, ( seed * 53.9 ) % 97 ];
	const cuttingPlanes = createCuttingPlanes( seed, radius, facetStyle );
	const chunks = facetStyle === 'chiseled' ? createRockChunks( seed, radius ) : [];

	return ( direction: Vec3 ): number => {

		const coarse = noise( direction[ 0 ] * 1.05 + noiseOffset[ 0 ]!, direction[ 1 ] * 1.05 + noiseOffset[ 1 ]!, direction[ 2 ] * 1.05 + noiseOffset[ 2 ]! );
		const medium = noise( direction[ 0 ] * 2.65 - noiseOffset[ 2 ]!, direction[ 1 ] * 2.65 + noiseOffset[ 0 ]!, direction[ 2 ] * 2.65 - noiseOffset[ 1 ]! );
		const detail = noise( direction[ 0 ] * 5.1 + noiseOffset[ 1 ]!, direction[ 1 ] * 5.1 - noiseOffset[ 2 ]!, direction[ 2 ] * 5.1 + noiseOffset[ 0 ]! );
		const relief = noise( direction[ 0 ] * 6.8 - noiseOffset[ 0 ]!, direction[ 1 ] * 6.8 + noiseOffset[ 2 ]!, direction[ 2 ] * 6.8 - noiseOffset[ 1 ]! );
		const angle = Math.atan2( direction[ 2 ], direction[ 0 ] );
		const lobes = ( Math.sin( angle * 3 + noiseOffset[ 1 ]! ) * 0.055 + Math.cos( angle * 5 - noiseOffset[ 2 ]! ) * 0.025 ) * detailScale;
		const chunkRelief = chunks.length === 0 ? 0 : getRockChunkRelief( direction, chunks, radius );
		const baseRadius = radius * clamp( 0.98 + ( coarse * 0.12 + medium * 0.018 * detailScale + detail * 0.003 * detailScale + lobes ) * roughness, 0.66, 1.28 );
		let planeRadius = Infinity;
		let nextPlaneRadius = Infinity;

		for ( const plane of cuttingPlanes ) {

			const projection = direction[ 0 ] * plane.normal[ 0 ] + direction[ 1 ] * plane.normal[ 1 ] + direction[ 2 ] * plane.normal[ 2 ];

			if ( projection > 0 ) {

				const candidate = plane.distance / projection;

				if ( candidate < planeRadius ) {

					nextPlaneRadius = planeRadius;
					planeRadius = candidate;

				} else if ( candidate < nextPlaneRadius ) {

					nextPlaneRadius = candidate;

				}

			}

		}

		const bevelWidth = radius * 0.045;
		let deformedRadius = softMinimum( baseRadius, planeRadius, bevelWidth ) + chunkRelief;
		const planeGap = nextPlaneRadius - planeRadius;
		const facetBulge = Number.isFinite( planeGap ) ? Math.min( radius * 0.014, planeGap * 0.12 ) * smoothstep( 0.015, 0.12, planeGap / radius ) : 0;
		deformedRadius += facetBulge;
		const edgeRelief = planeRadius < Infinity ? 1 - smoothstep( 0.012, 0.085, Math.abs( baseRadius - planeRadius ) / radius ) : 0;
		const reliefExposure = 0.25 + smoothstep( 0.08, 0.65, Math.abs( direction[ 1 ] ) ) * 0.75;
		deformedRadius = clamp( deformedRadius + radius * relief * 0.018 * roughness * reliefExposure * detailScale * edgeRelief, radius * 0.62, radius * 1.34 );

		const floorHeight = - radius * verticalScale * 0.55;

		if ( direction[ 1 ] < 0 && direction[ 1 ] * deformedRadius * verticalScale < floorHeight ) {

			deformedRadius = floorHeight / ( direction[ 1 ] * verticalScale );

		}

		return deformedRadius;

	};

}

export function getMinimumY( positions: Float32Array ): number {

	let minimum = Infinity;

	for ( let index = 1; index < positions.length; index += 3 ) {

		minimum = Math.min( minimum, positions[ index ]! );

	}

	return minimum;

}

export function getBounds( mesh: MeshData ): { radius: number; height: number } {

	let radius = 0;
	let height = 0;
	const includePoint = ( x: number, y: number, z: number ): void => {

		if ( y < 0 ) return;

		radius = Math.max( radius, Math.hypot( x, z ) );
		height = Math.max( height, y );

	};

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const firstOffset = triangle[ edge ]! * 3;
			const secondOffset = triangle[ ( edge + 1 ) % 3 ]! * 3;
			const firstX = mesh.positions[ firstOffset ]!;
			const firstY = mesh.positions[ firstOffset + 1 ]!;
			const firstZ = mesh.positions[ firstOffset + 2 ]!;
			const secondX = mesh.positions[ secondOffset ]!;
			const secondY = mesh.positions[ secondOffset + 1 ]!;
			const secondZ = mesh.positions[ secondOffset + 2 ]!;

			includePoint( firstX, firstY, firstZ );

			if ( ( firstY < 0 && secondY > 0 ) || ( firstY > 0 && secondY < 0 ) ) {

				const amount = - firstY / ( secondY - firstY );
				includePoint(
					firstX + ( secondX - firstX ) * amount,
					0,
					firstZ + ( secondZ - firstZ ) * amount,
				);

			}

		}

	}

	return { radius, height };

}

export function getHorizontalSpan( mesh: MeshData ): number {

	const minimum = [ Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity ];

	for ( let index = 0; index < mesh.positions.length; index += 3 ) {

		minimum[ 0 ] = Math.min( minimum[ 0 ]!, mesh.positions[ index ]! );
		minimum[ 1 ] = Math.min( minimum[ 1 ]!, mesh.positions[ index + 2 ]! );
		maximum[ 0 ] = Math.max( maximum[ 0 ]!, mesh.positions[ index ]! );
		maximum[ 1 ] = Math.max( maximum[ 1 ]!, mesh.positions[ index + 2 ]! );

	}

	return Math.max( maximum[ 0 ]! - minimum[ 0 ]!, maximum[ 1 ]! - minimum[ 1 ]! );

}

export function liftMesh( mesh: MeshData, offset: number ): void {

	for ( let index = 1; index < mesh.positions.length; index += 3 ) {

		mesh.positions[ index ] = mesh.positions[ index ]! + offset;

	}

}

export function sinkMesh( mesh: MeshData, offset: number, skirtFloor: number ): void {

	for ( let index = 1; index < mesh.positions.length; index += 3 ) {

		mesh.positions[ index ] = Math.max( mesh.positions[ index ]! - offset, skirtFloor );

	}

}

export function scaleHeight( mesh: MeshData, scale: number ): void {

	for ( let index = 1; index < mesh.positions.length; index += 3 ) {

		mesh.positions[ index ] = mesh.positions[ index ]! * scale;

	}

}

export function recomputeSmoothNormals( mesh: MeshData ): void {

	const sums = new Map<string, [ number, number, number ]>();
	const keys = Array.from( { length: mesh.positions.length / 3 }, ( _, index ) => {

		const offset = index * 3;
		return `${ mesh.positions[ offset ]! },${ mesh.positions[ offset + 1 ]! },${ mesh.positions[ offset + 2 ]! }`;

	} );

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const first = mesh.indices[ index ]! * 3;
		const second = mesh.indices[ index + 1 ]! * 3;
		const third = mesh.indices[ index + 2 ]! * 3;
		const firstX = mesh.positions[ first ]!;
		const firstY = mesh.positions[ first + 1 ]!;
		const firstZ = mesh.positions[ first + 2 ]!;
		const abX = mesh.positions[ second ]! - firstX;
		const abY = mesh.positions[ second + 1 ]! - firstY;
		const abZ = mesh.positions[ second + 2 ]! - firstZ;
		const acX = mesh.positions[ third ]! - firstX;
		const acY = mesh.positions[ third + 1 ]! - firstY;
		const acZ = mesh.positions[ third + 2 ]! - firstZ;
		const normal: [ number, number, number ] = [
			abY * acZ - abZ * acY,
			abZ * acX - abX * acZ,
			abX * acY - abY * acX,
		];

		for ( const vertex of [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ] ) {

			const key = keys[ vertex ]!;
			const sum = sums.get( key ) ?? [ 0, 0, 0 ];
			sum[ 0 ] += normal[ 0 ];
			sum[ 1 ] += normal[ 1 ];
			sum[ 2 ] += normal[ 2 ];
			sums.set( key, sum );

		}

	}

	for ( let vertex = 0; vertex < keys.length; vertex ++ ) {

		const normal = sums.get( keys[ vertex ]! ) ?? [ 0, 1, 0 ];
		const length = Math.hypot( normal[ 0 ], normal[ 1 ], normal[ 2 ] ) || 1;
		const offset = vertex * 3;
		mesh.normals[ offset ] = normal[ 0 ] / length;
		mesh.normals[ offset + 1 ] = normal[ 1 ] / length;
		mesh.normals[ offset + 2 ] = normal[ 2 ] / length;

	}

}

export function recomputeCreasedNormals( mesh: MeshData, creaseAngle = 20, creaseAt?: ( position: Vec3 ) => boolean ): void {

	const positions = Array.from( mesh.positions );
	const normals = Array.from( mesh.normals );
	const uvs = Array.from( mesh.uvs );
	const colors = Array.from( mesh.colors );
	const windWeight = Array.from( mesh.windWeight );
	const indices = Array.from( mesh.indices );
	const groups = new Map<string, { corners: { indexOffset: number; vertex: number; normal: Vec3; areaNormal: Vec3 }[] }>();
	const creaseCosine = Math.cos( creaseAngle * Math.PI / 180 );

	for ( let offset = 0; offset < indices.length; offset += 3 ) {

		const first = indices[ offset ]! * 3;
		const second = indices[ offset + 1 ]! * 3;
		const third = indices[ offset + 2 ]! * 3;
		const ab: Vec3 = [ positions[ second ]! - positions[ first ]!, positions[ second + 1 ]! - positions[ first + 1 ]!, positions[ second + 2 ]! - positions[ first + 2 ]! ];
		const ac: Vec3 = [ positions[ third ]! - positions[ first ]!, positions[ third + 1 ]! - positions[ first + 1 ]!, positions[ third + 2 ]! - positions[ first + 2 ]! ];
		const areaNormal: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
		const area = Math.hypot( areaNormal[ 0 ], areaNormal[ 1 ], areaNormal[ 2 ] ) || 1;
		const normal: Vec3 = [ areaNormal[ 0 ] / area, areaNormal[ 1 ] / area, areaNormal[ 2 ] / area ];

		for ( let corner = 0; corner < 3; corner ++ ) {

			const indexOffset = offset + corner;
			const vertex = indices[ indexOffset ]!;
			const positionOffset = vertex * 3;
			const key = `${ positions[ positionOffset ]!.toFixed( 6 ) },${ positions[ positionOffset + 1 ]!.toFixed( 6 ) },${ positions[ positionOffset + 2 ]!.toFixed( 6 ) }`;
			const group = groups.get( key ) ?? { corners: [] };
			group.corners.push( { indexOffset, vertex, normal, areaNormal } );
			groups.set( key, group );

		}

	}

	const vertexClusters = new Map<number, Set<number>>();

	for ( const group of groups.values() ) {

		const clusters: { areaNormal: Vec3; corners: typeof group.corners }[] = [];
		const firstVertexOffset = group.corners[ 0 ]!.vertex * 3;
		const creasePosition: Vec3 = [ positions[ firstVertexOffset ]!, positions[ firstVertexOffset + 1 ]!, positions[ firstVertexOffset + 2 ]! ];
		const splitCrease = creaseAt === undefined || creaseAt( creasePosition );

		for ( const corner of group.corners ) {

			let clusterIndex = - 1;

			for ( let index = 0; index < clusters.length; index ++ ) {

				const clusterNormal = clusters[ index ]!.areaNormal;
				const clusterLength = Math.hypot( clusterNormal[ 0 ], clusterNormal[ 1 ], clusterNormal[ 2 ] ) || 1;
				const dot = ( corner.normal[ 0 ] * clusterNormal[ 0 ] + corner.normal[ 1 ] * clusterNormal[ 1 ] + corner.normal[ 2 ] * clusterNormal[ 2 ] ) / clusterLength;

				if ( ! splitCrease || dot >= creaseCosine ) {

					clusterIndex = index;
					break;

				}

			}

			if ( clusterIndex < 0 ) {

				clusterIndex = clusters.length;
				clusters.push( { areaNormal: [ 0, 0, 0 ], corners: [] } );

			}

			const cluster = clusters[ clusterIndex ]!;
			cluster.areaNormal[ 0 ] += corner.areaNormal[ 0 ];
			cluster.areaNormal[ 1 ] += corner.areaNormal[ 1 ];
			cluster.areaNormal[ 2 ] += corner.areaNormal[ 2 ];
			cluster.corners.push( corner );

		}

		for ( let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex ++ ) {

			const cluster = clusters[ clusterIndex ]!;
			const length = Math.hypot( cluster.areaNormal[ 0 ], cluster.areaNormal[ 1 ], cluster.areaNormal[ 2 ] ) || 1;
			const normal: Vec3 = [ cluster.areaNormal[ 0 ] / length, cluster.areaNormal[ 1 ] / length, cluster.areaNormal[ 2 ] / length ];
			const assigned = new Map<number, number>();

			for ( const corner of cluster.corners ) {

				let target = assigned.get( corner.vertex );

				if ( target === undefined ) {

					const previousClusters = vertexClusters.get( corner.vertex );

					if ( previousClusters === undefined ) {

						target = corner.vertex;
						vertexClusters.set( corner.vertex, new Set( [ clusterIndex ] ) );

					} else if ( ! previousClusters.has( clusterIndex ) ) {

						target = positions.length / 3;
						for ( let axis = 0; axis < 3; axis ++ ) {
							positions.push( positions[ corner.vertex * 3 + axis ]! );
							normals.push( normal[ axis ]! );
						}
						uvs.push( uvs[ corner.vertex * 2 ]!, uvs[ corner.vertex * 2 + 1 ]! );
						colors.push( colors[ corner.vertex * 3 ]!, colors[ corner.vertex * 3 + 1 ]!, colors[ corner.vertex * 3 + 2 ]! );
						windWeight.push( windWeight[ corner.vertex ]! );
						previousClusters.add( clusterIndex );

					} else {

						target = corner.vertex;

					}

					assigned.set( corner.vertex, target );

				}

				indices[ corner.indexOffset ] = target;
				for ( let axis = 0; axis < 3; axis ++ ) normals[ target * 3 + axis ] = normal[ axis ]!;

			}

		}

	}

	mesh.positions = Float32Array.from( positions );
	mesh.normals = Float32Array.from( normals );
	mesh.uvs = Float32Array.from( uvs );
	mesh.colors = Float32Array.from( colors );
	mesh.windWeight = Float32Array.from( windWeight );
	mesh.indices = Uint32Array.from( indices );

}

export function applyRockSurfaceShading( mesh: MeshData ): void {

	const groups = new Map<string, number>();
	const vertexGroups = new Int32Array( mesh.positions.length / 3 );
	const positions: Vec3[] = [];
	const normals: Vec3[] = [];

	for ( let vertex = 0; vertex < vertexGroups.length; vertex ++ ) {

		const offset = vertex * 3;
		const position: Vec3 = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		const key = position.map( ( value ) => value.toFixed( 6 ) ).join( ',' );
		let group = groups.get( key );

		if ( group === undefined ) {

			group = positions.length;
			groups.set( key, group );
			positions.push( position );
			normals.push( [ mesh.normals[ offset ]!, mesh.normals[ offset + 1 ]!, mesh.normals[ offset + 2 ]! ] );

		}

		vertexGroups[ vertex ] = group;

	}

	const neighbors = Array.from( { length: positions.length }, () => new Set<number>() );

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const first = vertexGroups[ mesh.indices[ index ]! ]!;
		const second = vertexGroups[ mesh.indices[ index + 1 ]! ]!;
		const third = vertexGroups[ mesh.indices[ index + 2 ]! ]!;
		neighbors[ first ]!.add( second );
		neighbors[ first ]!.add( third );
		neighbors[ second ]!.add( first );
		neighbors[ second ]!.add( third );
		neighbors[ third ]!.add( first );
		neighbors[ third ]!.add( second );

	}

	const height = getBounds( mesh ).height || 1;
	let size = 0;

	for ( const position of positions ) {

		size = Math.max( size, Math.hypot( position[ 0 ], position[ 2 ] ) );

	}

	size = size || 1;
	const groupColors = new Float32Array( positions.length );

	for ( let group = 0; group < positions.length; group ++ ) {

		const position = positions[ group ]!;
		const normal = normals[ group ]!;
		const adjacent = neighbors[ group ]!;
		let concavity = 0;

		if ( adjacent.size > 0 ) {

			const average: Vec3 = [ 0, 0, 0 ];

			for ( const neighbor of adjacent ) {

				average[ 0 ] += positions[ neighbor ]![ 0 ];
				average[ 1 ] += positions[ neighbor ]![ 1 ];
				average[ 2 ] += positions[ neighbor ]![ 2 ];

			}

			average[ 0 ] /= adjacent.size;
			average[ 1 ] /= adjacent.size;
			average[ 2 ] /= adjacent.size;
			const inward = -( ( position[ 0 ] - average[ 0 ] ) * normal[ 0 ] + ( position[ 1 ] - average[ 1 ] ) * normal[ 1 ] + ( position[ 2 ] - average[ 2 ] ) * normal[ 2 ] );

			concavity = clamp( inward / size * 9, 0, 0.16 );

		}

		// 上面を明るくし、近傍平均より沈んだ箇所を柔らかく暗くする。
		const exposure = smoothstep( 0.08, 0.92, clamp( position[ 1 ] / height, 0, 1 ) );
		groupColors[ group ] = ( 0.92 + exposure * 0.16 ) * ( 1 - concavity );

	}

	let averageShade = 0;

	for ( let vertex = 0; vertex < vertexGroups.length; vertex ++ ) {

		averageShade += groupColors[ vertexGroups[ vertex ]! ]! / vertexGroups.length;

	}

	mesh.colors.fill( clamp( averageShade, 0.93, 0.97 ) );

}

export function buildRockShell( frequency: number, radiusAt: ( direction: Vec3 ) => number, verticalScale: number ): MeshData {

	const builder = new MeshBuilder();

	builder.beginGroup( 0 );
	addRockShell( builder, frequency, radiusAt, {
		color: () => [ 1, 1, 1 ],
		center: [ 0, 0, 0 ],
		scale: [ 1, verticalScale, 1 ],
		flat: false,
	} );
	const mesh = builder.build();

	return mesh;

}

export function buildRockRingShell( radiusAt: ( direction: Vec3 ) => number, verticalScale: number, segments = 8 ): MeshData {

	const builder = new MeshBuilder();
	const rings: number[][] = [];
	const latitudes = [ - 0.62, 0.08, 0.72 ];
	const white: [ number, number, number ] = [ 1, 1, 1 ];
	const addPoint = ( direction: Vec3, u: number, v: number ): number => {

		const radius = radiusAt( direction );
		return builder.addVertex(
			[ direction[ 0 ] * radius, direction[ 1 ] * radius * verticalScale, direction[ 2 ] * radius ],
			direction,
			[ u, v ],
			white,
			0,
		);

	};

	builder.beginGroup( 0 );

	for ( const latitude of latitudes ) {

		const ring: number[] = [];
		const horizontal = Math.cos( latitude );

		for ( let segment = 0; segment < segments; segment ++ ) {

			const angle = segment / segments * Math.PI * 2;
			ring.push( addPoint( [ horizontal * Math.cos( angle ), Math.sin( latitude ), horizontal * Math.sin( angle ) ], segment / segments + 0.5, latitude / Math.PI + 0.5 ) );

		}

		const seamDirection: Vec3 = [ horizontal, Math.sin( latitude ), 0 ];
		ring.push( addPoint( seamDirection, 1.5, latitude / Math.PI + 0.5 ) );
		rings.push( ring );

	}

	const top: Vec3 = [ 0, 1, 0 ];
	const bottom: Vec3 = [ 0, - 1, 0 ];
	const topPole = addPoint( top, 0.5, 1 );
	const topSeam = addPoint( top, 1.5, 1 );
	const bottomPole = addPoint( bottom, 0.5, 0 );
	const bottomSeam = addPoint( bottom, 1.5, 0 );

	for ( let ringIndex = 0; ringIndex < rings.length - 1; ringIndex ++ ) {

		for ( let segment = 0; segment < segments; segment ++ ) {

			const first = rings[ ringIndex ]![ segment ]!;
			const next = rings[ ringIndex ]![ segment + 1 ]!;
			const upper = rings[ ringIndex + 1 ]![ segment ]!;
			const upperNext = rings[ ringIndex + 1 ]![ segment + 1 ]!;
			builder.addTriangle( first, upper, next );
			builder.addTriangle( next, upper, upperNext );

		}

	}

	for ( let segment = 0; segment < segments; segment ++ ) {

		const first = rings[ 0 ]![ segment ]!;
		const next = rings[ 0 ]![ segment + 1 ]!;
		const upper = rings[ rings.length - 1 ]![ segment ]!;
		const upperNext = rings[ rings.length - 1 ]![ segment + 1 ]!;
		const seamHalf = segment >= segments / 2;
		builder.addTriangle( first, next, seamHalf ? bottomSeam : bottomPole );
		builder.addTriangle( upper, seamHalf ? topSeam : topPole, upperNext );

	}

	return builder.build();

}

