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

/** 尖った頂点だけを局所的に抑え、大きな形状は保つ。 */
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

	// Clamp only unusually prominent local corners; broad convex forms stay intact.
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
		const correction = ( prominence - maximumProminence ) * clamp( 0.5 + bandLimitWeight, 0, 1 );
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

/** 凸部の鋭い稜線だけを短い帯で削る。 */
export function applyRockWeathering( mesh: MeshData, weathering: number ): void {

	if ( ! Number.isFinite( weathering ) || weathering < 0 || weathering > 1 ) {
		throw new RangeError( 'Rock weathering must be from 0 to 1' );
	}
	if ( weathering === 0 ) return;

	const topology = getWeldedMeshTopology( mesh );
	const positions = topology.positions.map( ( position ) => [ ...position ] as Vec3 );
	const center: Vec3 = [ 0, 0, 0 ];

	for ( const position of positions ) {
		center[ 0 ] += position[ 0 ]! / positions.length;
		center[ 1 ] += position[ 1 ]! / positions.length;
		center[ 2 ] += position[ 2 ]! / positions.length;
	}

	const edges = new Map<string, { first: number; second: number; normals: Vec3[] }>();

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const triangle: [ number, number, number ] = [ topology.vertexGroups[ mesh.indices[ index ]! ]!, topology.vertexGroups[ mesh.indices[ index + 1 ]! ]!, topology.vertexGroups[ mesh.indices[ index + 2 ]! ]! ];
		const first = positions[ triangle[ 0 ] ]!;
		const second = positions[ triangle[ 1 ] ]!;
		const third = positions[ triangle[ 2 ] ]!;
		const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const normal: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
		const normalLength = Math.hypot( normal[ 0 ], normal[ 1 ], normal[ 2 ] ) || 1;
		normal[ 0 ] /= normalLength;
		normal[ 1 ] /= normalLength;
		normal[ 2 ] /= normalLength;

		for ( let edge = 0; edge < 3; edge ++ ) {
			const edgeFirst = triangle[ edge ]!;
			const edgeSecond = triangle[ ( edge + 1 ) % 3 ]!;
			const key = edgeFirst < edgeSecond ? `${ edgeFirst }:${ edgeSecond }` : `${ edgeSecond }:${ edgeFirst }`;
			const record = edges.get( key ) ?? { first: edgeFirst, second: edgeSecond, normals: [] };
			record.normals.push( normal );
			edges.set( key, record );
		}

	}

	const edgeStrength = new Float32Array( positions.length );

	for ( const edge of edges.values() ) {

		if ( edge.normals.length !== 2 ) continue;
		const first = edge.normals[ 0 ]!;
		const second = edge.normals[ 1 ]!;
		const dot = clamp( first[ 0 ] * second[ 0 ] + first[ 1 ] * second[ 1 ] + first[ 2 ] * second[ 2 ], - 1, 1 );
		const normalTurn = Math.acos( dot );
		const strength = smoothstep( 18 * Math.PI / 180, 72 * Math.PI / 180, normalTurn );
		edgeStrength[ edge.first ] = Math.max( edgeStrength[ edge.first ]!, strength );
		edgeStrength[ edge.second ] = Math.max( edgeStrength[ edge.second ]!, strength );

	}

	const diameter = Math.max( ...positions.map( ( position ) => Math.hypot( position[ 0 ] - center[ 0 ], position[ 2 ] - center[ 2 ] ) ) ) * 2;
	const maximumCut = diameter * ( 0.006 + weathering * 0.024 );
	const filtered = positions.map( ( position ) => [ ...position ] as Vec3 );

	for ( let vertex = 0; vertex < positions.length; vertex ++ ) {

		const position = positions[ vertex ]!;
		const edgeAmount = edgeStrength[ vertex ]!;
		const adjacent = topology.neighbors[ vertex ]!;
		if ( position[ 1 ] <= 0 || edgeAmount <= 0 || adjacent.size < 3 ) continue;
		const average = meanNeighborPosition( positions, adjacent );
		if ( average === undefined ) continue;

		const outward: Vec3 = [ position[ 0 ] - center[ 0 ], position[ 1 ] - center[ 1 ], position[ 2 ] - center[ 2 ] ];
		const outwardLength = Math.hypot( outward[ 0 ], outward[ 1 ], outward[ 2 ] ) || 1;
		outward[ 0 ] /= outwardLength;
		outward[ 1 ] /= outwardLength;
		outward[ 2 ] /= outwardLength;
		const convexity = ( position[ 0 ] - average[ 0 ] ) * outward[ 0 ] + ( position[ 1 ] - average[ 1 ] ) * outward[ 1 ] + ( position[ 2 ] - average[ 2 ] ) * outward[ 2 ];
		if ( convexity <= 0 ) continue;

		const cut = Math.min( convexity * weathering * 0.22, maximumCut ) * edgeAmount;
		filtered[ vertex ] = [ position[ 0 ] - outward[ 0 ] * cut, position[ 1 ] - outward[ 1 ] * cut, position[ 2 ] - outward[ 2 ] * cut ];

	}

	for ( let vertex = 0; vertex < positions.length; vertex ++ ) positions[ vertex ] = filtered[ vertex ]!;

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

export function limitRockDihedralAngles( mesh: MeshData, minimumAngle = 100 ): void {

	const topology = getWeldedMeshTopology( mesh );
	const positions = topology.positions.map( ( position ) => [ ...position ] as Vec3 );
	const triangles: [ number, number, number ][] = [];

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {
		triangles.push( [ topology.vertexGroups[ mesh.indices[ index ]! ]!, topology.vertexGroups[ mesh.indices[ index + 1 ]! ]!, topology.vertexGroups[ mesh.indices[ index + 2 ]! ]! ] );
	}

	const threshold = Math.cos( ( 180 - minimumAngle ) * Math.PI / 180 );

	for ( let pass = 0; pass < 24; pass ++ ) {

		const edges = new Map<string, { first: number; second: number; normals: Vec3[] }>();

		for ( const triangle of triangles ) {
			const first = positions[ triangle[ 0 ] ]!;
			const second = positions[ triangle[ 1 ] ]!;
			const third = positions[ triangle[ 2 ] ]!;
			const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
			const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
			const normal: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
			const length = Math.hypot( normal[ 0 ], normal[ 1 ], normal[ 2 ] );
			if ( length < 1e-8 ) continue;
			normal[ 0 ] /= length;
			normal[ 1 ] /= length;
			normal[ 2 ] /= length;

			for ( let edge = 0; edge < 3; edge ++ ) {
				const firstVertex = triangle[ edge ]!;
				const secondVertex = triangle[ ( edge + 1 ) % 3 ]!;
				const key = firstVertex < secondVertex ? `${ firstVertex }:${ secondVertex }` : `${ secondVertex }:${ firstVertex }`;
				const record = edges.get( key ) ?? { first: firstVertex, second: secondVertex, normals: [] };
				record.normals.push( normal );
				edges.set( key, record );
			}
		}

		const affected = new Set<number>();

		for ( const edge of edges.values() ) {
			if ( edge.normals.length !== 2 ) continue;
			if ( positions[ edge.first ]![ 1 ] <= 0 && positions[ edge.second ]![ 1 ] <= 0 ) continue;
			const first = edge.normals[ 0 ]!;
			const second = edge.normals[ 1 ]!;
			const dot = first[ 0 ] * second[ 0 ] + first[ 1 ] * second[ 1 ] + first[ 2 ] * second[ 2 ];
			if ( dot < threshold ) {
				affected.add( edge.first );
				affected.add( edge.second );
			}
		}

		if ( affected.size === 0 ) break;
		const filtered = positions.map( ( position ) => [ ...position ] as Vec3 );

		for ( const vertex of affected ) {
			const average = meanNeighborPosition( positions, topology.neighbors[ vertex ]! );
			if ( average === undefined ) continue;
			const origin = positions[ vertex ]!;
			filtered[ vertex ] = [
				origin[ 0 ] + ( average[ 0 ] - origin[ 0 ] ) * 0.16,
				origin[ 1 ] + ( average[ 1 ] - origin[ 1 ] ) * 0.16,
				origin[ 2 ] + ( average[ 2 ] - origin[ 2 ] ) * 0.16,
			];
		}

		for ( let vertex = 0; vertex < positions.length; vertex ++ ) positions[ vertex ] = filtered[ vertex ]!;
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

export interface RockScoop {
	direction: Vec3;
	angularRadius: number;
	depth: number;
}

export interface RockHullShape {
	points: Vec3[];
	directions: Vec3[];
	radii: Vec3;
	rotationY: number;
	scoops: RockScoop[];
	size: number;
}

function getMinimumHullFaceAngle( points: Vec3[], faces = buildConvexHullFaces( points ) ): number {

	let minimum = Math.PI;
	for ( const face of faces ) minimum = Math.min( minimum, minimumTriangleAngle( points[ face[ 0 ] ]!, points[ face[ 1 ] ]!, points[ face[ 2 ] ]! ) );
	return minimum;

}

function getVisibleHullRegionCount( points: Vec3[], faces: [ number, number, number ][] ): number {

	const regions: { normal: Vec3; offset: number; area: number }[] = [];
	let visibleArea = 0;
	const extent = Math.max( ...[ 0, 1, 2 ].map( ( axis ) => Math.max( ...points.map( ( point ) => point[ axis ]! ) ) - Math.min( ...points.map( ( point ) => point[ axis ]! ) ) ) );

	for ( const face of faces ) {

		const first = points[ face[ 0 ] ]!;
		const second = points[ face[ 1 ] ]!;
		const third = points[ face[ 2 ] ]!;
		if ( ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3 <= 0 ) continue;
		const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const cross: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
		const doubleArea = Math.hypot( ...cross );
		const normal = cross.map( ( value ) => value / ( doubleArea || 1 ) ) as Vec3;
		const offset = normal[ 0 ] * first[ 0 ] + normal[ 1 ] * first[ 1 ] + normal[ 2 ] * first[ 2 ];
		let region = regions.find( ( candidate ) => candidate.normal[ 0 ] * normal[ 0 ] + candidate.normal[ 1 ] * normal[ 1 ] + candidate.normal[ 2 ] * normal[ 2 ] > 0.9999 && Math.abs( candidate.offset - offset ) < extent * 0.001 );

		if ( region === undefined ) {

			region = { normal, offset, area: 0 };
			regions.push( region );

		}

		region.area += doubleArea * 0.5;
		visibleArea += doubleArea * 0.5;

	}

	return regions.filter( ( region ) => region.area / visibleArea >= 0.01 ).length;

}

function normalizeDirection( direction: Vec3 ): Vec3 {

	const length = Math.hypot( direction[ 0 ], direction[ 1 ], direction[ 2 ] ) || 1;
	return [ direction[ 0 ] / length, direction[ 1 ] / length, direction[ 2 ] / length ];

}

function minimumTriangleAngle( first: Vec3, second: Vec3, third: Vec3 ): number {

	const points = [ first, second, third ];
	let minimum = Math.PI;
	for ( let corner = 0; corner < 3; corner ++ ) {
		const origin = points[ corner ]!;
		const a = points[ ( corner + 1 ) % 3 ]!;
		const b = points[ ( corner + 2 ) % 3 ]!;
		const firstEdge: Vec3 = [ a[ 0 ] - origin[ 0 ], a[ 1 ] - origin[ 1 ], a[ 2 ] - origin[ 2 ] ];
		const secondEdge: Vec3 = [ b[ 0 ] - origin[ 0 ], b[ 1 ] - origin[ 1 ], b[ 2 ] - origin[ 2 ] ];
		const lengths = Math.hypot( ...firstEdge ) * Math.hypot( ...secondEdge );
		if ( lengths < 1e-12 ) return 0;
		const dot = firstEdge[ 0 ] * secondEdge[ 0 ] + firstEdge[ 1 ] * secondEdge[ 1 ] + firstEdge[ 2 ] * secondEdge[ 2 ];
		minimum = Math.min( minimum, Math.acos( clamp( dot / lengths, - 1, 1 ) ) );
	}
	return minimum;

}

function createPoissonDirections( seed: number, count: number ): Vec3[] {

	const random = createRockRandom( seed );
	const selected: Vec3[] = [];
	let attempts = 0;

	while ( selected.length < count && attempts < count * 300 ) {

		attempts ++;
		const y = random() * 2 - 1;
		const angle = random() * Math.PI * 2;
		const horizontal = Math.sqrt( Math.max( 1 - y * y, 0 ) );
		const direction: Vec3 = [ horizontal * Math.cos( angle ), y, horizontal * Math.sin( angle ) ];
		const minimumSpacing = Math.cos( 0.38 + random() * 0.2 );
		if ( selected.some( ( chosen ) => direction[ 0 ] * chosen[ 0 ] + direction[ 1 ] * chosen[ 1 ] + direction[ 2 ] * chosen[ 2 ] > minimumSpacing ) ) continue;
		selected.push( direction );

	}

	while ( selected.length < count ) {

		const y = random() * 2 - 1;
		const angle = random() * Math.PI * 2;
		const horizontal = Math.sqrt( Math.max( 1 - y * y, 0 ) );
		selected.push( [ horizontal * Math.cos( angle ), y, horizontal * Math.sin( angle ) ] );

	}

	return selected;

}

function createTopEdgeDirections( seed: number, count: number ): Vec3[] {

	const random = createRockRandom( seed );
	const directions: Vec3[] = [];
	const clusterCount = Math.ceil( count / 2 );
	const rotation = random() * Math.PI * 2;

	for ( let cluster = 0; directions.length < count; cluster ++ ) {

		const centerAngle = rotation + cluster / clusterCount * Math.PI * 2 + ( random() - 0.5 ) * 0.16;
		const centerY = 0.52 + random() * 0.22;

		for ( let member = 0; member < 2 && directions.length < count; member ++ ) {

			const side = member === 0 ? - 1 : 1;
			const angle = centerAngle + side * ( 0.14 + random() * 0.09 );
			const y = clamp( centerY + side * ( 0.04 + random() * 0.06 ), 0.4, 0.84 );
			const horizontal = Math.sqrt( 1 - y * y );
			directions.push( [ horizontal * Math.cos( angle ), y, horizontal * Math.sin( angle ) ] );

		}

	}

	return directions;

}

export function createRockHullShape( seed: number, size: number, roughness = 1.2, flatness = 0 ): RockHullShape {

	const random = createRockRandom( seed + 4711 );
	const aspectX = 0.76 + random() * 0.54;
	const aspectZ = 0.76 + random() * 0.54;
	const radiusX = size * 0.5 * aspectX;
	const radiusZ = size * 0.5 * aspectZ;
	const squatScale = Math.floor( Math.abs( seed ) ) % 6 === 0 ? 0.72 : 1;
	const radiusY = Math.min( size * ( 0.36 + random() * 0.35 ) * squatScale * ( 1 - clamp( flatness, 0, 1 ) * 0.65 ), Math.max( radiusX, radiusZ ) * 1.05 );
	const leanX = ( random() - 0.5 ) * 0.82;
	const leanZ = ( random() - 0.5 ) * 0.72;
	const tiltX = ( random() - 0.5 ) * 0.62;
	const tiltZ = ( random() - 0.5 ) * 0.62;
	const rotationY = random() * Math.PI * 2;
	const cosine = Math.cos( rotationY );
	const sine = Math.sin( rotationY );
	const tiltCosineX = Math.cos( tiltX );
	const tiltSineX = Math.sin( tiltX );
	const tiltCosineZ = Math.cos( tiltZ );
	const tiltSineZ = Math.sin( tiltZ );
	const count = 28 + Math.floor( random() * 5 );
	const jitter = Math.min( 0.18, 0.1 + clamp( roughness, 0, 1.5 ) * 0.0666667 );
	let radii: Vec3 = [ radiusX, radiusY, radiusZ ];
	let directions: Vec3[] = [];
	let points: Vec3[] = [];
	const visibleFacetLimits = [ 20, 34 ];

	for ( let attempt = 0; attempt < 24; attempt ++ ) {

		directions = [
			...createPoissonDirections( seed + 8891 + attempt * 7919, count - 6 ),
			...createTopEdgeDirections( seed + 37891 + attempt * 7919, 6 ),
		];
		const pointRandom = createRockRandom( seed + 22721 + attempt * 7919 );
		points = directions.map( ( direction ) => {

			const radialJitter = 1 + ( pointRandom() * 2 - 1 ) * jitter;
			const y = direction[ 1 ] * radiusY * radialJitter;
			const localX = direction[ 0 ] * radiusX * radialJitter + direction[ 1 ] * radiusY * leanX;
			const localZ = direction[ 2 ] * radiusZ * radialJitter + direction[ 1 ] * radiusY * leanZ;
			const tiltedY = y * tiltCosineX - localZ * tiltSineX;
			const tiltedZ = y * tiltSineX + localZ * tiltCosineX;
			const tiltedX = localX * tiltCosineZ - tiltedY * tiltSineZ;
			const finalY = localX * tiltSineZ + tiltedY * tiltCosineZ;
			return [ tiltedX * cosine + tiltedZ * sine, finalY, - tiltedX * sine + tiltedZ * cosine ] as Vec3;

		} );

		const faces = buildConvexHullFaces( points );
		const minimumAngle = getMinimumHullFaceAngle( points, faces );
		const visibleFacets = getVisibleHullRegionCount( points, faces );
		if ( minimumAngle >= 20 * Math.PI / 180 && visibleFacets >= visibleFacetLimits[ 0 ]! && visibleFacets <= visibleFacetLimits[ 1 ]! ) break;

	}

	const scoopRandom = createRockRandom( seed + 13721 );
	const scoops: RockScoop[] = [];

	if ( scoopRandom() < 0.43 ) {

		const hullFaces = buildConvexHullFaces( points );
		for ( let attempt = 0; attempt < 12; attempt ++ ) {

			const candidateRandom = createRockRandom( seed + 13721 + attempt * 7919 );
			const scoopCount = attempt === 0 && candidateRandom() < 0.1 ? 2 : 1;
			const candidate: RockScoop[] = [];

			for ( let index = 0; index < scoopCount; index ++ ) {

				const y = 0.68 + candidateRandom() * 0.17;
				const angle = candidateRandom() * Math.PI * 2;
				const horizontal = Math.sqrt( 1 - y * y );
				const localX = horizontal * Math.cos( angle );
				const localZ = horizontal * Math.sin( angle );
				candidate.push( {
					direction: [ localX * cosine + localZ * sine, y, - localX * sine + localZ * cosine ],
					angularRadius: 0.85 + candidateRandom() * 0.15,
					depth: size * ( 0.17 + candidateRandom() * 0.04 ),
				} );

			}

			scoops.splice( 0, scoops.length, ...candidate );
			const scoopPoints = points.map( ( point ) => applyRockScoops( point, radii, rotationY, scoops ) );
			const visibleFacets = getVisibleHullRegionCount( scoopPoints, hullFaces );
			if ( getMinimumHullFaceAngle( scoopPoints, hullFaces ) >= 22 * Math.PI / 180 && visibleFacets >= 15 && visibleFacets <= 30 ) break;

		}

	}

	let minimumX = Infinity;
	let maximumX = - Infinity;
	let minimumY = Infinity;
	let maximumY = - Infinity;
	let minimumZ = Infinity;
	let maximumZ = - Infinity;

	for ( const point of points ) {

		minimumX = Math.min( minimumX, point[ 0 ] );
		maximumX = Math.max( maximumX, point[ 0 ] );
		minimumY = Math.min( minimumY, point[ 1 ] );
		maximumY = Math.max( maximumY, point[ 1 ] );
		minimumZ = Math.min( minimumZ, point[ 2 ] );
		maximumZ = Math.max( maximumZ, point[ 2 ] );

	}

	const horizontalScale = size / Math.max( maximumX - minimumX, maximumZ - minimumZ );
	const verticalScale = Math.min( 1, size * 1.3 / ( maximumY - minimumY ) );
	const centerX = ( minimumX + maximumX ) * 0.5;
	const centerY = ( minimumY + maximumY ) * 0.5;
	const centerZ = ( minimumZ + maximumZ ) * 0.5;

	if ( horizontalScale < 1 || verticalScale < 1 ) {

		points = points.map( ( point ) => [
			centerX + ( point[ 0 ] - centerX ) * horizontalScale,
			centerY + ( point[ 1 ] - centerY ) * verticalScale,
			centerZ + ( point[ 2 ] - centerZ ) * horizontalScale,
		] );
		radii = [ radii[ 0 ] * horizontalScale, radii[ 1 ] * verticalScale, radii[ 2 ] * horizontalScale ];

	}

	return { points, directions, radii, rotationY, scoops, size };

}

function applyRockScoops( position: Vec3, radii: Vec3, rotationY: number, scoops: RockScoop[] ): Vec3 {

	if ( scoops.length === 0 ) return position;
	const cosine = Math.cos( rotationY );
	const sine = Math.sin( rotationY );
	const localPosition: Vec3 = [ position[ 0 ] * cosine - position[ 2 ] * sine, position[ 1 ], position[ 0 ] * sine + position[ 2 ] * cosine ];
	const scaled = normalizeDirection( [ localPosition[ 0 ] / radii[ 0 ], localPosition[ 1 ] / radii[ 1 ], localPosition[ 2 ] / radii[ 2 ] ] );
	const surfaceNormal = normalizeDirection( [ scaled[ 0 ] / radii[ 0 ], scaled[ 1 ] / radii[ 1 ], scaled[ 2 ] / radii[ 2 ] ] );
	let depth = 0;

	for ( const scoop of scoops ) {

		const dot = clamp( scaled[ 0 ] * scoop.direction[ 0 ] + scaled[ 1 ] * scoop.direction[ 1 ] + scaled[ 2 ] * scoop.direction[ 2 ], - 1, 1 );
		const angle = Math.acos( dot );
		const influence = 1 - smoothstep( scoop.angularRadius * 0.35, scoop.angularRadius, angle );
		depth = Math.max( depth, scoop.depth * influence );

	}

	const normalX = surfaceNormal[ 0 ] * cosine + surfaceNormal[ 2 ] * sine;
	const normalZ = - surfaceNormal[ 0 ] * sine + surfaceNormal[ 2 ] * cosine;
	return [ position[ 0 ] - normalX * depth, position[ 1 ] - surfaceNormal[ 1 ] * depth, position[ 2 ] - normalZ * depth ];

}

export function buildRockHullMesh( shape: RockHullShape, faces: [ number, number, number ][], subdivision: 0 | 1 | 2 | 3, bevelWidth = 0, weathering = 0.25, unwrapSeams = true ): MeshData {

	const faceNormals = faces.map( ( face ) => {

		const first = shape.points[ face[ 0 ] ]!;
		const second = shape.points[ face[ 1 ] ]!;
		const third = shape.points[ face[ 2 ] ]!;
		const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		return normalizeDirection( [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ] );

	} );
	const vertexNormals = shape.points.map( () => [ 0, 0, 0 ] as Vec3 );
	const edgeFaces = new Map<string, { first: number; second: number; faces: number[] }>();

	for ( let faceIndex = 0; faceIndex < faces.length; faceIndex ++ ) {

		const face = faces[ faceIndex ]!;
		for ( const vertex of face ) {
			for ( let axis = 0; axis < 3; axis ++ ) vertexNormals[ vertex ]![ axis ] = vertexNormals[ vertex ]![ axis ]! + faceNormals[ faceIndex ]![ axis ]!;
		}

		for ( let edge = 0; edge < 3; edge ++ ) {
			const first = face[ edge ]!;
			const second = face[ ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			const record = edgeFaces.get( key ) ?? { first: Math.min( first, second ), second: Math.max( first, second ), faces: [] };
			record.faces.push( faceIndex );
			edgeFaces.set( key, record );
		}

	}

	const edgeOffsets = new Map<string, Vec3>();
	for ( const [ key, edge ] of edgeFaces ) {

		const normal: Vec3 = [ 0, 0, 0 ];
		for ( const face of edge.faces ) {
			for ( let axis = 0; axis < 3; axis ++ ) normal[ axis ] = normal[ axis ]! + faceNormals[ face ]![ axis ]!;
		}
		edgeOffsets.set( key, normalizeDirection( normal ) );

	}
	const scoopFaceDepths = new Map<number, number>();
	const scoopVertexOffsets = new Map<string, Vec3>();
	const addScoopOffset = ( key: string, offset: Vec3 ): void => {

		const current = scoopVertexOffsets.get( key ) ?? [ 0, 0, 0 ];
		scoopVertexOffsets.set( key, [ current[ 0 ] + offset[ 0 ], current[ 1 ] + offset[ 1 ], current[ 2 ] + offset[ 2 ] ] );

	};

	for ( const scoop of shape.scoops ) {

		let selectedFace = - 1;
		let selectedAltitude = 0;
		let selectedScore = - Infinity;

		for ( let faceIndex = 0; faceIndex < faces.length; faceIndex ++ ) {

			if ( scoopFaceDepths.has( faceIndex ) ) continue;
			const face = faces[ faceIndex ]!;
			const first = shape.points[ face[ 0 ] ]!;
			const second = shape.points[ face[ 1 ] ]!;
			const third = shape.points[ face[ 2 ] ]!;
			const centerY = ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3;
			if ( centerY <= 0 ) continue;
			const normal = faceNormals[ faceIndex ]!;
			const alignment = normal[ 0 ] * scoop.direction[ 0 ] + normal[ 1 ] * scoop.direction[ 1 ] + normal[ 2 ] * scoop.direction[ 2 ];
			if ( alignment < 0.25 ) continue;
			const lengths = [
				Math.hypot( first[ 0 ] - second[ 0 ], first[ 1 ] - second[ 1 ], first[ 2 ] - second[ 2 ] ),
				Math.hypot( second[ 0 ] - third[ 0 ], second[ 1 ] - third[ 1 ], second[ 2 ] - third[ 2 ] ),
				Math.hypot( third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ),
			];
			const edge: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
			const other: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
			const areaTwice = Math.hypot( edge[ 1 ] * other[ 2 ] - edge[ 2 ] * other[ 1 ], edge[ 2 ] * other[ 0 ] - edge[ 0 ] * other[ 2 ], edge[ 0 ] * other[ 1 ] - edge[ 1 ] * other[ 0 ] );
			const altitude = areaTwice / Math.max( ...lengths );
			const score = alignment + Math.min( altitude / shape.size, 0.6 ) * 0.35;

			if ( score > selectedScore ) {
				selectedFace = faceIndex;
				selectedAltitude = altitude;
				selectedScore = score;
			}

		}

		if ( selectedFace < 0 ) continue;
		const depth = Math.min( scoop.depth, selectedAltitude * 0.9 );
		if ( depth < shape.size * 0.12 ) continue;
		scoopFaceDepths.set( selectedFace, depth );
		const face = faces[ selectedFace ]!;
		const normal = faceNormals[ selectedFace ]!;
		addScoopOffset( `f:${ selectedFace }`, [ - normal[ 0 ] * depth, - normal[ 1 ] * depth, - normal[ 2 ] * depth ] );

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = face[ edge ]!;
			const second = face[ ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			addScoopOffset( `e:${ key }`, [ - normal[ 0 ] * depth * 0.12, - normal[ 1 ] * depth * 0.12, - normal[ 2 ] * depth * 0.12 ] );

		}

	}

	const positions: Vec3[] = [];
	const vertexKeys = new Map<string, number>();
	const triangles: [ number, number, number ][] = [];
	const cornerRound = bevelWidth * ( 0.6 + weathering * 0.4 );
	const getVertex = ( key: string, position: Vec3, inset: Vec3, amount: number ): number => {

		const existing = vertexKeys.get( key );
		if ( existing !== undefined ) return existing;
		const scooped = scoopVertexOffsets.get( key ) ?? [ 0, 0, 0 ];
		const index = positions.length;
		positions.push( [ position[ 0 ] + scooped[ 0 ] - inset[ 0 ] * amount, position[ 1 ] + scooped[ 1 ] - inset[ 1 ] * amount, position[ 2 ] + scooped[ 2 ] - inset[ 2 ] * amount ] );
		vertexKeys.set( key, index );
		return index;

	};
	for ( let faceIndex = 0; faceIndex < faces.length; faceIndex ++ ) {

		const face = faces[ faceIndex ]!;
		const points = face.map( ( vertex ) => shape.points[ vertex ]! );
		const corners = face.map( ( vertex ) => getVertex( `v:${ vertex }`, shape.points[ vertex ]!, normalizeDirection( vertexNormals[ vertex ]! ), cornerRound ) );
		const edgeLengths = [
			Math.hypot( points[ 1 ]![ 0 ] - points[ 2 ]![ 0 ], points[ 1 ]![ 1 ] - points[ 2 ]![ 1 ], points[ 1 ]![ 2 ] - points[ 2 ]![ 2 ] ),
			Math.hypot( points[ 2 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 2 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 2 ]![ 2 ] - points[ 0 ]![ 2 ] ),
			Math.hypot( points[ 0 ]![ 0 ] - points[ 1 ]![ 0 ], points[ 0 ]![ 1 ] - points[ 1 ]![ 1 ], points[ 0 ]![ 2 ] - points[ 1 ]![ 2 ] ),
		];
		const perimeter = edgeLengths[ 0 ]! + edgeLengths[ 1 ]! + edgeLengths[ 2 ]!;
		const firstEdge: Vec3 = [ points[ 1 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 1 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 1 ]![ 2 ] - points[ 0 ]![ 2 ] ];
		const secondEdge: Vec3 = [ points[ 2 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 2 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 2 ]![ 2 ] - points[ 0 ]![ 2 ] ];
		const faceArea = Math.hypot(
			firstEdge[ 1 ] * secondEdge[ 2 ] - firstEdge[ 2 ] * secondEdge[ 1 ],
			firstEdge[ 2 ] * secondEdge[ 0 ] - firstEdge[ 0 ] * secondEdge[ 2 ],
			firstEdge[ 0 ] * secondEdge[ 1 ] - firstEdge[ 1 ] * secondEdge[ 0 ],
		) * 0.5;
		const centerPosition: Vec3 = [ 0, 1, 2 ].map( ( axis ) => (
			points[ 0 ]![ axis ]! * edgeLengths[ 0 ]! + points[ 1 ]![ axis ]! * edgeLengths[ 1 ]! + points[ 2 ]![ axis ]! * edgeLengths[ 2 ]!
		) / perimeter ) as Vec3;
		const narrowFacet = subdivision === 1 && minimumTriangleAngle(
			positions[ corners[ 0 ]! ]!,
			positions[ corners[ 1 ]! ]!,
			positions[ corners[ 2 ]! ]!,
		) < 14 * Math.PI / 180;

		if ( subdivision === 0 ) {
			triangles.push( corners as [ number, number, number ] );
			continue;
		}
		if ( narrowFacet ) {

			triangles.push( corners as [ number, number, number ] );
			continue;

		}

		if ( subdivision === 1 ) {

			const center = getVertex( `f:${ faceIndex }`, centerPosition, [ 0, 0, 0 ], 0 );
			triangles.push( [ corners[ 0 ]!, corners[ 1 ]!, center ], [ corners[ 1 ]!, corners[ 2 ]!, center ], [ corners[ 2 ]!, corners[ 0 ]!, center ] );
			continue;
		}

		const mids = face.map( ( first, edge ) => {

			const second = face[ ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			const firstPoint = shape.points[ first ]!;
			const secondPoint = shape.points[ second ]!;
			const midpoint: Vec3 = [ ( firstPoint[ 0 ] + secondPoint[ 0 ] ) * 0.5, ( firstPoint[ 1 ] + secondPoint[ 1 ] ) * 0.5, ( firstPoint[ 2 ] + secondPoint[ 2 ] ) * 0.5 ];
			return getVertex( `e:${ key }`, midpoint, edgeOffsets.get( key )!, bevelWidth );

		} );
		const scoopGrid = subdivision === 3 && scoopFaceDepths.has( faceIndex );
		const useSixTriangles = subdivision === 2 || ( subdivision === 3 && ( scoopGrid || faceArea >= shape.size * shape.size * 0.1 ) );

		if ( useSixTriangles ) {

			const center = getVertex( `f:${ faceIndex }`, centerPosition, [ 0, 0, 0 ], 0 );
			const baseCenter = centerPosition;
			const scoopedCenter = positions[ center ]!;
			const hasBroadTriangles = ( candidate: Vec3 ): boolean => {

				for ( let edge = 0; edge < 3; edge ++ ) {
					const next = ( edge + 1 ) % 3;
					const first = positions[ corners[ edge ]! ]!;
					const middle = positions[ mids[ edge ]! ]!;
					const second = positions[ corners[ next ]! ]!;
					if ( minimumTriangleAngle( first, middle, candidate ) < 16 * Math.PI / 180 ) return false;
					if ( minimumTriangleAngle( middle, second, candidate ) < 16 * Math.PI / 180 ) return false;
				}

				return true;

			};

			if ( ! hasBroadTriangles( scoopedCenter ) ) {

				let minimum = 0;
				let maximum = 1;
				for ( let iteration = 0; iteration < 16; iteration ++ ) {
					const amount = ( minimum + maximum ) * 0.5;
					const candidate: Vec3 = [
						baseCenter[ 0 ] + ( scoopedCenter[ 0 ] - baseCenter[ 0 ] ) * amount,
						baseCenter[ 1 ] + ( scoopedCenter[ 1 ] - baseCenter[ 1 ] ) * amount,
						baseCenter[ 2 ] + ( scoopedCenter[ 2 ] - baseCenter[ 2 ] ) * amount,
					];
					if ( hasBroadTriangles( candidate ) ) minimum = amount;
					else maximum = amount;
				}
				const amount = minimum;
				positions[ center ] = [
					baseCenter[ 0 ] + ( scoopedCenter[ 0 ] - baseCenter[ 0 ] ) * amount,
					baseCenter[ 1 ] + ( scoopedCenter[ 1 ] - baseCenter[ 1 ] ) * amount,
					baseCenter[ 2 ] + ( scoopedCenter[ 2 ] - baseCenter[ 2 ] ) * amount,
				];

			}

			for ( let edge = 0; edge < 3; edge ++ ) {
				const next = ( edge + 1 ) % 3;
				triangles.push( [ corners[ edge ]!, mids[ edge ]!, center ], [ mids[ edge ]!, corners[ next ]!, center ] );
			}
			continue;

		}

		const [ first, second, third ] = corners;
		const [ ab, bc, ca ] = mids;
		triangles.push( [ first!, ab!, ca! ], [ ab!, second!, bc! ], [ ca!, bc!, third! ], [ ab!, bc!, ca! ] );

	}

	const mesh = buildRockMeshFromFaces( positions, triangles );
	if ( unwrapSeams ) unwrapRockUvSeams( mesh );
	return mesh;

}

type RockFacetStyle = 'standard' | 'chiseled';

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

	const topCount = 1;
	const sideCount = 5;
	const topAngle = random() * Math.PI * 2;
	const topTilt = random() * 0.08;
	const topHorizontal = Math.sin( topTilt );

	planes.push( {
		normal: [ topHorizontal * Math.cos( topAngle ), Math.cos( topTilt ), topHorizontal * Math.sin( topAngle ) ],
		distance: radius * ( 0.7 + random() * 0.025 ),
	} );

	const sideRotation = topAngle + Math.PI / sideCount + ( random() - 0.5 ) * 0.12;

	for ( let index = 0; index < sideCount; index ++ ) {

		const vertical = - 0.22 + random() * 0.32;
		const angle = sideRotation + index / sideCount * Math.PI * 2 + ( random() - 0.5 ) * 0.06;
		const horizontal = Math.sqrt( 1 - vertical * vertical );

		planes.push( {
			normal: [ horizontal * Math.cos( angle ), vertical, horizontal * Math.sin( angle ) ],
			distance: radius * ( 0.64 + random() * 0.07 ),
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

	return ( direction: Vec3 ): number => {

		return facetEdgeAt( direction );

	};

}

function softMinimum( first: number, second: number, softness: number ): number {

	const blend = Math.max( softness - Math.abs( first - second ), 0 ) / softness;

	return Math.min( first, second ) - blend * blend * softness * 0.25;

}

export function buildConvexHullFaces( positions: Vec3[] ): [ number, number, number ][] {

	if ( positions.length < 4 ) throw new RangeError( 'A 3D convex hull needs at least four points' );
	const bounds = positions.reduce( ( result, point ) => ( {
		minimum: [ Math.min( result.minimum[ 0 ], point[ 0 ] ), Math.min( result.minimum[ 1 ], point[ 1 ] ), Math.min( result.minimum[ 2 ], point[ 2 ] ) ] as Vec3,
		maximum: [ Math.max( result.maximum[ 0 ], point[ 0 ] ), Math.max( result.maximum[ 1 ], point[ 1 ] ), Math.max( result.maximum[ 2 ], point[ 2 ] ) ] as Vec3,
	} ), { minimum: [ Infinity, Infinity, Infinity ] as Vec3, maximum: [ - Infinity, - Infinity, - Infinity ] as Vec3 } );
	const scale = Math.max( bounds.maximum[ 0 ] - bounds.minimum[ 0 ], bounds.maximum[ 1 ] - bounds.minimum[ 1 ], bounds.maximum[ 2 ] - bounds.minimum[ 2 ], 1 );
	const epsilon = scale * 1e-9;
	const cross = ( first: Vec3, second: Vec3, third: Vec3 ): Vec3 => {

		const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		return [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];

	};
	const dotFrom = ( normal: Vec3, point: Vec3, origin: Vec3 ): number => normal[ 0 ] * ( point[ 0 ] - origin[ 0 ] ) + normal[ 1 ] * ( point[ 1 ] - origin[ 1 ] ) + normal[ 2 ] * ( point[ 2 ] - origin[ 2 ] );
	const pointDistanceSquared = ( first: Vec3, second: Vec3 ): number => ( first[ 0 ] - second[ 0 ] ) ** 2 + ( first[ 1 ] - second[ 1 ] ) ** 2 + ( first[ 2 ] - second[ 2 ] ) ** 2;
	const first = 0;
	let second = 1;
	for ( let index = 2; index < positions.length; index ++ ) if ( pointDistanceSquared( positions[ first ]!, positions[ index ]! ) > pointDistanceSquared( positions[ first ]!, positions[ second ]! ) ) second = index;

	let third = - 1;
	let largestArea = 0;
	for ( let index = 0; index < positions.length; index ++ ) {
		if ( index === first || index === second ) continue;
		const area = Math.hypot( ...cross( positions[ first ]!, positions[ second ]!, positions[ index ]! ) );
		if ( area > largestArea ) {
			third = index;
			largestArea = area;
		}
	}
	if ( third < 0 || largestArea <= epsilon * scale ) throw new RangeError( 'Convex hull points are collinear' );

	const initialNormal = normalizeDirection( cross( positions[ first ]!, positions[ second ]!, positions[ third ]! ) );
	let fourth = - 1;
	let largestDistance = 0;
	for ( let index = 0; index < positions.length; index ++ ) {
		if ( index === first || index === second || index === third ) continue;
		const distance = Math.abs( dotFrom( initialNormal, positions[ index ]!, positions[ first ]! ) );
		if ( distance > largestDistance ) {
			fourth = index;
			largestDistance = distance;
		}
	}
	if ( fourth < 0 || largestDistance <= epsilon ) throw new RangeError( 'Convex hull points are coplanar' );

	const interior: Vec3 = [
		( positions[ first ]![ 0 ] + positions[ second ]![ 0 ] + positions[ third ]![ 0 ] + positions[ fourth ]![ 0 ] ) * 0.25,
		( positions[ first ]![ 1 ] + positions[ second ]![ 1 ] + positions[ third ]![ 1 ] + positions[ fourth ]![ 1 ] ) * 0.25,
		( positions[ first ]![ 2 ] + positions[ second ]![ 2 ] + positions[ third ]![ 2 ] + positions[ fourth ]![ 2 ] ) * 0.25,
	];
	type HullFace = { vertices: [ number, number, number ]; normal: Vec3 };
	const makeFace = ( a: number, b: number, c: number ): HullFace | undefined => {

		let vertices: [ number, number, number ] = [ a, b, c ];
		let normal = cross( positions[ a ]!, positions[ b ]!, positions[ c ]! );
		if ( Math.hypot( ...normal ) <= epsilon * epsilon ) return undefined;
		if ( dotFrom( normal, interior, positions[ a ]! ) > 0 ) {
			vertices = [ a, c, b ];
			normal = [ - normal[ 0 ], - normal[ 1 ], - normal[ 2 ] ];
		}
		return { vertices, normal: normalizeDirection( normal ) };

	};
	let hull: HullFace[] = [
		makeFace( first, second, third ),
		makeFace( first, fourth, second ),
		makeFace( second, fourth, third ),
		makeFace( third, fourth, first ),
	].filter( ( face ): face is HullFace => face !== undefined );
	const initial = new Set( [ first, second, third, fourth ] );

	for ( let pointIndex = 0; pointIndex < positions.length; pointIndex ++ ) {

		if ( initial.has( pointIndex ) ) continue;
		const point = positions[ pointIndex ]!;
		const visible = hull.filter( ( face ) => dotFrom( face.normal, point, positions[ face.vertices[ 0 ] ]! ) > epsilon );
		if ( visible.length === 0 ) continue;
		const visibleSet = new Set( visible );
		const horizon = new Map<string, [ number, number ]>();

		for ( const face of visible ) {

			for ( let edge = 0; edge < 3; edge ++ ) {
				const a = face.vertices[ edge ]!;
				const b = face.vertices[ ( edge + 1 ) % 3 ]!;
				const key = a < b ? `${ a }:${ b }` : `${ b }:${ a }`;
				const reverseKey = `${ b }:${ a }`;
				if ( horizon.has( reverseKey ) ) horizon.delete( reverseKey );
				else horizon.set( `${ a }:${ b }`, [ a, b ] );
			}

		}

		hull = hull.filter( ( face ) => ! visibleSet.has( face ) );
		for ( const [ a, b ] of horizon.values() ) {
			const face = makeFace( a, b, pointIndex );
			if ( face !== undefined ) hull.push( face );
		}

	}

	return hull.map( ( face ) => face.vertices );

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

function unwrapRockUvSeams( mesh: MeshData ): void {

	const positions = Array.from( mesh.positions );
	const normals = Array.from( mesh.normals );
	const uvs = Array.from( mesh.uvs );
	const colors = Array.from( mesh.colors );
	const windWeight = Array.from( mesh.windWeight );
	const impostorCard = Array.from( mesh.impostorCard );
	const indices: number[] = [];
	const copiedVertices = new Map<string, number>();
	const copyVertex = ( vertex: number, u: number ): number => {

		const key = `${ vertex }:${ u.toFixed( 6 ) }`;
		const existing = copiedVertices.get( key );
		if ( existing !== undefined ) return existing;
		const copy = positions.length / 3;
		positions.push( positions[ vertex * 3 ]!, positions[ vertex * 3 + 1 ]!, positions[ vertex * 3 + 2 ]! );
		normals.push( normals[ vertex * 3 ]!, normals[ vertex * 3 + 1 ]!, normals[ vertex * 3 + 2 ]! );
		uvs.push( u, uvs[ vertex * 2 + 1 ]! );
		colors.push( colors[ vertex * 3 ]!, colors[ vertex * 3 + 1 ]!, colors[ vertex * 3 + 2 ]! );
		windWeight.push( windWeight[ vertex ]! );
		impostorCard.push( impostorCard[ vertex ]! );
		copiedVertices.set( key, copy );
		return copy;

	};

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const vertices = [ mesh.indices[ offset ]!, mesh.indices[ offset + 1 ]!, mesh.indices[ offset + 2 ]! ];
		const originalU = vertices.map( ( vertex ) => uvs[ vertex * 2 ]! );
		const normalizedU = originalU.map( ( value ) => ( ( value % 1 ) + 1 ) % 1 );
		const sorted = normalizedU.slice().sort( ( first, second ) => first - second );
		let largestGap = - Infinity;
		let start = sorted[ 0 ]!;

		for ( let index = 0; index < sorted.length; index ++ ) {

			const first = sorted[ index ]!;
			const second = sorted[ ( index + 1 ) % sorted.length ]! + ( index === sorted.length - 1 ? 1 : 0 );
			const gap = second - first;
			if ( gap > largestGap ) {
				largestGap = gap;
				start = second % 1;
			}

		}

		const unwrapped = normalizedU.map( ( value ) => value < start ? value + 1 : value );
		const localVertices = vertices.map( ( vertex, corner ) => Math.abs( unwrapped[ corner ]! - originalU[ corner ]! ) < 1e-6 ? vertex : copyVertex( vertex, unwrapped[ corner ]! ) );

		// U座標はリピート範囲外でも使える。分割するとT字接合になる。
		indices.push( localVertices[ 0 ]!, localVertices[ 1 ]!, localVertices[ 2 ]! );

	}

	mesh.positions = Float32Array.from( positions );
	mesh.normals = Float32Array.from( normals );
	mesh.uvs = Float32Array.from( uvs );
	mesh.colors = Float32Array.from( colors );
	mesh.windWeight = Float32Array.from( windWeight );
	mesh.impostorCard = Float32Array.from( impostorCard );
	mesh.indices = Uint32Array.from( indices );
	mesh.groups = mesh.groups.map( ( group, index ) => index === 0 ? { ...group, count: indices.length } : { ...group, start: indices.length } );

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

export function getHorizontalMeshOutline( mesh: MeshData, height: number, samples: number, rotation = 0 ): Vec3[] {

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

		const angle = rotation + sample / samples * Math.PI * 2;
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

interface RockReliefFeature {
	direction: Vec3;
	amplitude: number;
	wavelength: number;
}

function createRockReliefFeatures( seed: number ): RockReliefFeature[] {

	const random = createRockRandom( seed + 841 );
	const features: RockReliefFeature[] = [];
	const planes = createCuttingPlanes( seed, 1, 'chiseled' );
	const topCount = 1;
	const sideCount = planes.length - topCount;
	const phase = Math.floor( random() * topCount );
	const lumpCount = 2 + Math.floor( random() * 3 );
	const dentCount = 1 + Math.floor( random() * 3 );

	for ( let index = 0; index < lumpCount + dentCount; index ++ ) {

		const isDent = index >= lumpCount;
		const featureIndex = isDent ? index - lumpCount : index;
		const sideIndex = ( phase + featureIndex * 2 ) % sideCount;
		const firstDirection = planes[ topCount + sideIndex ]!.normal;
		const nextDirection = planes[ topCount + ( sideIndex + 1 ) % sideCount ]!.normal;
		const direction = isDent
			? [ firstDirection[ 0 ] + nextDirection[ 0 ], firstDirection[ 1 ] + nextDirection[ 1 ], firstDirection[ 2 ] + nextDirection[ 2 ] ] as Vec3
			: [ ...firstDirection ] as Vec3;
		const directionLength = Math.hypot( direction[ 0 ], direction[ 1 ], direction[ 2 ] ) || 1;
		direction[ 0 ] /= directionLength;
		direction[ 1 ] /= directionLength;
		direction[ 2 ] /= directionLength;

		features.push( {
			direction,
			amplitude: ( isDent ? - 0.34 : 0.18 ) - random() * ( isDent ? 0.06 : 0.04 ),
			wavelength: 0.44 + random() * 0.04,
		} );

	}

	return features;

}

function sampleRockReliefFeatures( direction: Vec3, features: RockReliefFeature[] ): number {

	let relief = 0;

	for ( const feature of features ) {

		const dot = clamp( direction[ 0 ] * feature.direction[ 0 ] + direction[ 1 ] * feature.direction[ 1 ] + direction[ 2 ] * feature.direction[ 2 ], - 1, 1 );
		const angle = Math.acos( dot );
		const distance = angle / feature.wavelength;
		relief += feature.amplitude * Math.exp( - 0.5 * distance * distance );

	}

	return relief;

}

/** detailScale attenuates geometric relief for coarser LODs. */
export function createRockRadiusFunction( seed: number, radius: number, roughness: number, verticalScale: number, detailScale = 1, facetStyle: RockFacetStyle = 'standard', weathering = 0.35 ): ( direction: Vec3 ) => number {

	const noise = createNoise3D( seed + 71 );
	const noiseOffset = [ ( seed * 17.13 ) % 71, ( seed * 31.7 ) % 89, ( seed * 53.9 ) % 97 ];
	const cuttingPlanes = createCuttingPlanes( seed, radius, facetStyle );
	const chiseled = facetStyle === 'chiseled';
	const reliefFeatures = chiseled ? createRockReliefFeatures( seed ) : [];
	const coarseAmplitude = chiseled ? Math.floor( Math.abs( seed ) ) % 2 === 0 ? 0.06 : 0.02 : 0.12;
	const broadAmplitude = chiseled ? Math.floor( Math.abs( seed ) ) % 2 === 0 ? 0.03 : 0.006 : 0;

	return ( direction: Vec3 ): number => {

		const coarse = noise( direction[ 0 ] * 1.05 + noiseOffset[ 0 ]!, direction[ 1 ] * 1.05 + noiseOffset[ 1 ]!, direction[ 2 ] * 1.05 + noiseOffset[ 2 ]! );
		const broad = noise( direction[ 0 ] * 1.7 + noiseOffset[ 2 ]!, direction[ 1 ] * 1.7 - noiseOffset[ 0 ]!, direction[ 2 ] * 1.7 + noiseOffset[ 1 ]! );
		const medium = chiseled ? 0 : noise( direction[ 0 ] * 2.65 - noiseOffset[ 2 ]!, direction[ 1 ] * 2.65 + noiseOffset[ 0 ]!, direction[ 2 ] * 2.65 - noiseOffset[ 1 ]! );
		const detail = chiseled ? 0 : noise( direction[ 0 ] * 5.1 + noiseOffset[ 1 ]!, direction[ 1 ] * 5.1 - noiseOffset[ 2 ]!, direction[ 2 ] * 5.1 + noiseOffset[ 0 ]! );
		const relief = chiseled ? 0 : noise( direction[ 0 ] * 6.8 - noiseOffset[ 0 ]!, direction[ 1 ] * 6.8 + noiseOffset[ 2 ]!, direction[ 2 ] * 6.8 - noiseOffset[ 1 ]! );
		const angle = Math.atan2( direction[ 2 ], direction[ 0 ] );
		const lobes = ( Math.sin( angle * 3 + noiseOffset[ 1 ]! ) * 0.055 + Math.cos( angle * ( chiseled ? 2 : 5 ) - noiseOffset[ 2 ]! ) * 0.025 ) * detailScale;
		const baseRadius = radius * clamp( 0.98 + ( coarse * coarseAmplitude + medium * 0.018 * detailScale + detail * 0.003 * detailScale + lobes ) * roughness, 0.66, 1.28 );
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

		const bevelWidth = radius * ( chiseled ? 0.06 + weathering * 0.06 : 0.045 );
		const beveledPlaneRadius = Number.isFinite( nextPlaneRadius ) ? softMinimum( planeRadius, nextPlaneRadius, bevelWidth ) : planeRadius;
		let deformedRadius = softMinimum( baseRadius, beveledPlaneRadius, bevelWidth );
		const planeGap = nextPlaneRadius - planeRadius;
		const relativePlaneGap = Number.isFinite( planeGap ) ? planeGap / radius : 0;
		const facetBulge = Number.isFinite( planeGap ) ? Math.min( radius * ( chiseled ? 0.004 : 0.014 ), planeGap * 0.08 ) * smoothstep( 0.035, 0.16, relativePlaneGap ) : 0;
		deformedRadius += facetBulge;
		const edgeRelief = planeRadius < Infinity ? 1 - smoothstep( 0.045, 0.16, Math.abs( baseRadius - planeRadius ) / radius ) : 0;
		const reliefExposure = 0.4 + smoothstep( 0.08, 0.65, Math.abs( direction[ 1 ] ) ) * 0.6;
		const broadRelief = broad * broadAmplitude * smoothstep( 0.035, 0.16, relativePlaneGap );
		const surfaceRelief = ( relief * 0.018 * edgeRelief + broadRelief ) * roughness * reliefExposure;
		const largeRelief = chiseled ? sampleRockReliefFeatures( direction, reliefFeatures ) * 1.5 * ( roughness / 1.2 ) * smoothstep( 0.015, 0.09, relativePlaneGap ) * detailScale : 0;
		deformedRadius = clamp( deformedRadius + radius * ( surfaceRelief + largeRelief ), radius * 0.62, radius * 1.34 );

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
	const topMiddle = addPoint( top, 1, 1 );
	const bottomPole = addPoint( bottom, 0.5, 0 );
	const bottomSeam = addPoint( bottom, 1.5, 0 );
	const bottomMiddle = addPoint( bottom, 1, 0 );

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
		const poleIndex = segment < Math.floor( segments / 2 ) ? 0 : segment === Math.floor( segments / 2 ) ? 1 : 2;
		const bottomCenter = poleIndex === 0 ? bottomPole : poleIndex === 1 ? bottomMiddle : bottomSeam;
		const topCenter = poleIndex === 0 ? topPole : poleIndex === 1 ? topMiddle : topSeam;
		builder.addTriangle( first, next, bottomCenter );
		builder.addTriangle( upper, topCenter, upperNext );

	}

	return builder.build();

}

