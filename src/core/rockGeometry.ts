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

export function getRockScoopInfluence( angularDistance: number, angularRadius: number ): number {

	return 1 - smoothstep( 0, angularRadius, angularDistance );

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
	tiltX: number;
	tiltZ: number;
	translation: Vec3;
	scoops: RockScoop[];
	size: number;
}

function transformRockPositionToLocal( position: Vec3, rotationY: number, tiltX: number, tiltZ: number, translation: Vec3 = [ 0, 0, 0 ] ): Vec3 {

	const cosineY = Math.cos( rotationY );
	const sineY = Math.sin( rotationY );
	const translatedX = position[ 0 ] - translation[ 0 ];
	const translatedY = position[ 1 ] - translation[ 1 ];
	const translatedZ = position[ 2 ] - translation[ 2 ];
	const yawX = translatedX * cosineY - translatedZ * sineY;
	const yawZ = translatedX * sineY + translatedZ * cosineY;
	const cosineZ = Math.cos( tiltZ );
	const sineZ = Math.sin( tiltZ );
	const tiltZX = yawX * cosineZ + translatedY * sineZ;
	const tiltZY = - yawX * sineZ + translatedY * cosineZ;
	const cosineX = Math.cos( tiltX );
	const sineX = Math.sin( tiltX );
	const localY = tiltZY * cosineX + yawZ * sineX;
	const localZ = - tiltZY * sineX + yawZ * cosineX;

	return [ tiltZX, localY, localZ ];

}

function transformRockNormalToWorld( normal: Vec3, rotationY: number, tiltX: number, tiltZ: number ): Vec3 {

	const cosineX = Math.cos( tiltX );
	const sineX = Math.sin( tiltX );
	const tiltXY = normal[ 1 ] * cosineX - normal[ 2 ] * sineX;
	const tiltXZ = normal[ 1 ] * sineX + normal[ 2 ] * cosineX;
	const cosineZ = Math.cos( tiltZ );
	const sineZ = Math.sin( tiltZ );
	const tiltZX = normal[ 0 ] * cosineZ - tiltXY * sineZ;
	const tiltZY = normal[ 0 ] * sineZ + tiltXY * cosineZ;
	const cosineY = Math.cos( rotationY );
	const sineY = Math.sin( rotationY );

	return [ tiltZX * cosineY + tiltXZ * sineY, tiltZY, - tiltZX * sineY + tiltXZ * cosineY ];

}

function getMinimumHullFaceAngle( points: Vec3[], faces = buildConvexHullFaces( points ) ): number {

	let minimum = Math.PI;
	for ( const face of faces ) minimum = Math.min( minimum, minimumTriangleAngle( points[ face[ 0 ] ]!, points[ face[ 1 ] ]!, points[ face[ 2 ] ]! ) );
	return minimum;

}

function getVisibleHullRegionCount( points: Vec3[], faces: [ number, number, number ][] ): number {

	const regions: { normal: Vec3; offset: number; area: number }[] = [];
	let visibleArea = 0;
	const cameraDirection = normalizeDirection( [ 0, 0.3, 0.95 ] );
	const minimumY = Math.min( ...points.map( ( point ) => point[ 1 ] ) );
	const maximumY = Math.max( ...points.map( ( point ) => point[ 1 ] ) );
	const groundY = minimumY + ( maximumY - minimumY ) * 0.42;
	const extent = Math.max( ...[ 0, 1, 2 ].map( ( axis ) => Math.max( ...points.map( ( point ) => point[ axis ]! ) ) - Math.min( ...points.map( ( point ) => point[ axis ]! ) ) ) );

	for ( const face of faces ) {

		const first = points[ face[ 0 ] ]!;
		const second = points[ face[ 1 ] ]!;
		const third = points[ face[ 2 ] ]!;
		if ( ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3 <= groundY ) continue;
		const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const cross: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
		const doubleArea = Math.hypot( ...cross );
		const normal = cross.map( ( value ) => value / ( doubleArea || 1 ) ) as Vec3;
		if ( normal[ 0 ] * cameraDirection[ 0 ] + normal[ 1 ] * cameraDirection[ 1 ] + normal[ 2 ] * cameraDirection[ 2 ] <= 0.02 ) continue;
		const offset = normal[ 0 ] * first[ 0 ] + normal[ 1 ] * first[ 1 ] + normal[ 2 ] * first[ 2 ];
		let region = regions.find( ( candidate ) => candidate.normal[ 0 ] * normal[ 0 ] + candidate.normal[ 1 ] * normal[ 1 ] + candidate.normal[ 2 ] * normal[ 2 ] > 0.9999 && Math.abs( candidate.offset - offset ) < extent * 0.001 );

		if ( region === undefined ) {

			region = { normal, offset, area: 0 };
			regions.push( region );

		}

		region.area += doubleArea * 0.5;
		visibleArea += doubleArea * 0.5;

	}

	return regions.filter( ( region ) => region.area / visibleArea >= 0.002 ).length;

}

function getVisibleAxisAlignedFacetCount( points: Vec3[], faces: [ number, number, number ][], rotation = 0 ): number {

	const cameraDirection = normalizeDirection( [ 0, 0.3, 0.95 ] );
	const cosine = Math.cos( rotation );
	const sine = Math.sin( rotation );
	const minimumY = Math.min( ...points.map( ( point ) => point[ 1 ] ) );
	const maximumY = Math.max( ...points.map( ( point ) => point[ 1 ] ) );
	const groundY = minimumY + ( maximumY - minimumY ) * 0.42;
	const visible: { normal: Vec3; area: number }[] = [];
	let visibleArea = 0;

	for ( const face of faces ) {

		const first = points[ face[ 0 ] ]!;
		const second = points[ face[ 1 ] ]!;
		const third = points[ face[ 2 ] ]!;
		if ( ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3 <= groundY ) continue;
		const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const cross: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
		const doubleArea = Math.hypot( ...cross );
		const normal = normalizeDirection( cross );
		const rotatedNormal: Vec3 = [ normal[ 0 ] * cosine + normal[ 2 ] * sine, normal[ 1 ], - normal[ 0 ] * sine + normal[ 2 ] * cosine ];
		if ( rotatedNormal[ 0 ] * cameraDirection[ 0 ] + rotatedNormal[ 1 ] * cameraDirection[ 1 ] + rotatedNormal[ 2 ] * cameraDirection[ 2 ] <= 0.02 ) continue;
		const area = doubleArea * 0.5;
		visible.push( { normal: rotatedNormal, area } );
		visibleArea += area;

	}

	const axes: Vec3[] = [ [ 1, 0, 0 ], [ - 1, 0, 0 ], [ 0, 0, 1 ], [ 0, 0, - 1 ], [ 0, 1, 0 ] ];
	return axes.filter( ( axis ) => visible.some( ( region ) => region.area / visibleArea >= 0.002 && region.normal[ 0 ] * axis[ 0 ] + region.normal[ 1 ] * axis[ 1 ] + region.normal[ 2 ] * axis[ 2 ] > Math.cos( 10 * Math.PI / 180 ) ) ).length;

}

function splitLargeAboveGroundHullFacets( points: Vec3[], directions: Vec3[], size: number ): void {

	for ( let attempt = 0; attempt < 12 && points.length < 46; attempt ++ ) {

		const minimumY = Math.min( ...points.map( ( point ) => point[ 1 ] ) );
		const maximumY = Math.max( ...points.map( ( point ) => point[ 1 ] ) );
		const groundY = minimumY + ( maximumY - minimumY ) * 0.46;
		const cameraDirection = normalizeDirection( [ 0, 0.3, 0.95 ] );
		const faces = buildConvexHullFaces( points );
		const hullCenter: Vec3 = [ 0, 0, 0 ];
		for ( const point of points ) for ( let axis = 0; axis < 3; axis ++ ) hullCenter[ axis ] = hullCenter[ axis ]! + point[ axis ]! / points.length;
		const regions: { normal: Vec3; offset: number; area: number; center: Vec3 }[] = [];
		let visibleArea = 0;

		for ( const face of faces ) {

			const first = points[ face[ 0 ] ]!;
			const second = points[ face[ 1 ] ]!;
			const third = points[ face[ 2 ] ]!;
			if ( ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3 <= groundY ) continue;

			const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
			const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
			const cross: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
			const doubleArea = Math.hypot( ...cross );
			const area = doubleArea * 0.5;
			if ( doubleArea < 1e-8 ) continue;

			const normal = normalizeDirection( cross );
			const center: Vec3 = [ ( first[ 0 ] + second[ 0 ] + third[ 0 ] ) / 3, ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3, ( first[ 2 ] + second[ 2 ] + third[ 2 ] ) / 3 ];
			const outward: Vec3 = [ center[ 0 ] - hullCenter[ 0 ], center[ 1 ] - hullCenter[ 1 ], center[ 2 ] - hullCenter[ 2 ] ];
			if ( normal[ 0 ] * outward[ 0 ] + normal[ 1 ] * outward[ 1 ] + normal[ 2 ] * outward[ 2 ] < 0 ) {
				normal[ 0 ] = - normal[ 0 ];
				normal[ 1 ] = - normal[ 1 ];
				normal[ 2 ] = - normal[ 2 ];
			}
			if ( normal[ 0 ] * cameraDirection[ 0 ] + normal[ 1 ] * cameraDirection[ 1 ] + normal[ 2 ] * cameraDirection[ 2 ] <= 0.02 ) continue;
			visibleArea += area;
			const offset = normal[ 0 ] * first[ 0 ] + normal[ 1 ] * first[ 1 ] + normal[ 2 ] * first[ 2 ];
			let region = regions.find( ( candidate ) => candidate.normal[ 0 ] * normal[ 0 ] + candidate.normal[ 1 ] * normal[ 1 ] + candidate.normal[ 2 ] * normal[ 2 ] > 0.9999 && Math.abs( candidate.offset - offset ) < size * 0.001 );
			if ( region === undefined ) {
				region = { normal, offset, area: 0, center: [ 0, 0, 0 ] };
				regions.push( region );
			}
			region.area += area;
			for ( let axis = 0; axis < 3; axis ++ ) region.center[ axis ] = region.center[ axis ]! + center[ axis ]! * area;

		}

		const largestRegion = regions.reduce<{ normal: Vec3; offset: number; area: number; center: Vec3 } | undefined>( ( largest, region ) => largest === undefined || region.area > largest.area ? region : largest, undefined );
		const visibleFacetCount = regions.filter( ( region ) => region.area / visibleArea >= 0.002 ).length;
		if ( largestRegion === undefined || ( largestRegion.area / visibleArea <= 0.18 && visibleFacetCount >= 12 ) ) return;
		const splitPoint = largestRegion.center.map( ( value ) => value / largestRegion.area ) as Vec3;

		const outward = size * 0.065;
		points.push( [ splitPoint[ 0 ] + largestRegion.normal[ 0 ] * outward, splitPoint[ 1 ] + largestRegion.normal[ 1 ] * outward, splitPoint[ 2 ] + largestRegion.normal[ 2 ] * outward ] );
		directions.push( largestRegion.normal );

	}

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

function createTopEdgeDirections( seed: number, count: number, excluded: Vec3[] = [] ): Vec3[] {

	const random = createRockRandom( seed );
	const directions: Vec3[] = [];
	const clusterCount = Math.ceil( count / 2 );
	const rotation = random() * Math.PI * 2;
	const minimumDot = Math.cos( 0.3 );
	const isSpaced = ( direction: Vec3 ): boolean => excluded.every( ( other ) => direction[ 0 ] * other[ 0 ] + direction[ 1 ] * other[ 1 ] + direction[ 2 ] * other[ 2 ] <= minimumDot ) && directions.every( ( other ) => direction[ 0 ] * other[ 0 ] + direction[ 1 ] * other[ 1 ] + direction[ 2 ] * other[ 2 ] <= minimumDot );

	for ( let cluster = 0; directions.length < count; cluster ++ ) {

		const centerAngle = rotation + cluster / clusterCount * Math.PI * 2 + ( random() - 0.5 ) * 0.16;
		const centerY = 0.52 + random() * 0.22;

		for ( let member = 0; member < 2 && directions.length < count; member ++ ) {

			const side = member === 0 ? - 1 : 1;
			let candidate: Vec3 | undefined;
			for ( let attempt = 0; attempt < 32; attempt ++ ) {
				const angle = centerAngle + side * ( 0.2 + random() * 0.1 ) + ( random() - 0.5 ) * 0.12;
				const y = clamp( centerY + side * ( 0.04 + random() * 0.04 ), 0.4, 0.84 );
				const horizontal = Math.sqrt( 1 - y * y );
				const direction: Vec3 = [ horizontal * Math.cos( angle ), y, horizontal * Math.sin( angle ) ];
				if ( isSpaced( direction ) ) {
					candidate = direction;
					break;
				}
			}
			if ( candidate === undefined ) {
				for ( let attempt = 0; attempt < 64; attempt ++ ) {
					const y = 0.4 + random() * 0.44;
					const angle = random() * Math.PI * 2;
					const horizontal = Math.sqrt( 1 - y * y );
					const direction: Vec3 = [ horizontal * Math.cos( angle ), y, horizontal * Math.sin( angle ) ];
					if ( isSpaced( direction ) ) {
						candidate = direction;
						break;
					}
				}
			}
			if ( candidate === undefined ) {
				const angle = centerAngle + side * 0.25;
				const y = clamp( centerY + side * 0.06, 0.4, 0.84 );
				const horizontal = Math.sqrt( 1 - y * y );
				candidate = [ horizontal * Math.cos( angle ), y, horizontal * Math.sin( angle ) ];
			}
			directions.push( candidate );

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
	let rotationY = random() * Math.PI * 2;
	const cosine = Math.cos( rotationY );
	const sine = Math.sin( rotationY );
	const tiltCosineX = Math.cos( tiltX );
	const tiltSineX = Math.sin( tiltX );
	const tiltCosineZ = Math.cos( tiltZ );
	const tiltSineZ = Math.sin( tiltZ );
	const count = 30 + Math.floor( random() * 5 );
	const jitter = Math.min( 0.18, 0.1 + clamp( roughness, 0, 1.5 ) * 0.0666667 );
	let radii: Vec3 = [ radiusX, radiusY, radiusZ ];
	let translation: Vec3 = [ 0, 0, 0 ];
	let directions: Vec3[] = [];
	let points: Vec3[] = [];
	let bestDirections: Vec3[] = [];
	let bestPoints: Vec3[] = [];
	let bestMinimumFaceAngle = - Infinity;
	const visibleFacetLimits = [ 12, 20 ];

	for ( let attempt = 0; attempt < 12; attempt ++ ) {

		const poissonDirections = createPoissonDirections( seed + 8891 + attempt * 7919, count - 6 );
		directions = [ ...poissonDirections, ...createTopEdgeDirections( seed + 37891 + attempt * 7919, 6, poissonDirections ) ];
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
		const visibleFacets = getVisibleHullRegionCount( points, faces );
		if ( visibleFacets < visibleFacetLimits[ 0 ]! || visibleFacets > visibleFacetLimits[ 1 ]! ) continue;
		const minimumFaceAngle = getMinimumHullFaceAngle( points, faces );
		if ( minimumFaceAngle > bestMinimumFaceAngle ) {
			bestMinimumFaceAngle = minimumFaceAngle;
			bestDirections = directions;
			bestPoints = points;
		}
		if ( minimumFaceAngle >= 12 * Math.PI / 180 ) break;

	}
	if ( bestPoints.length > 0 ) {
		directions = bestDirections;
		points = bestPoints;
	}

	const scoopRandom = createRockRandom( seed + 13725 );
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
					direction: [ localX, y, localZ ],
					angularRadius: 0.85 + candidateRandom() * 0.15,
					depth: size * ( 0.17 + candidateRandom() * 0.04 ),
				} );

			}

			scoops.splice( 0, scoops.length, ...candidate );
			const scoopPoints = points.map( ( point ) => applyRockScoops( point, radii, rotationY, scoops, tiltX, tiltZ ) );
			const visibleFacets = getVisibleHullRegionCount( scoopPoints, hullFaces );
			if ( visibleFacets < 12 || visibleFacets > 20 ) continue;
			if ( getMinimumHullFaceAngle( scoopPoints, hullFaces ) >= 12 * Math.PI / 180 ) break;

		}

	}

	splitLargeAboveGroundHullFacets( points, directions, size );
	const finalFaces = buildConvexHullFaces( points );

	if ( getVisibleAxisAlignedFacetCount( points, finalFaces ) >= 3 ) {

		for ( let step = 1; step <= 36; step ++ ) {

			const correction = step * Math.PI / 36;
			const cosineCorrection = Math.cos( correction );
			const sineCorrection = Math.sin( correction );
			const rotateY = ( point: Vec3 ): Vec3 => [ point[ 0 ] * cosineCorrection + point[ 2 ] * sineCorrection, point[ 1 ], - point[ 0 ] * sineCorrection + point[ 2 ] * cosineCorrection ];
			if ( getVisibleAxisAlignedFacetCount( points, finalFaces, correction ) >= 3 ) continue;

			points = points.map( rotateY );
			directions = directions.map( rotateY );
			rotationY += correction;
			break;

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

		translation = [ centerX * ( 1 - horizontalScale ), centerY * ( 1 - verticalScale ), centerZ * ( 1 - horizontalScale ) ];
		points = points.map( ( point ) => [
			centerX + ( point[ 0 ] - centerX ) * horizontalScale,
			centerY + ( point[ 1 ] - centerY ) * verticalScale,
			centerZ + ( point[ 2 ] - centerZ ) * horizontalScale,
		] );
		radii = [ radii[ 0 ] * horizontalScale, radii[ 1 ] * verticalScale, radii[ 2 ] * horizontalScale ];

	}

	return { points, directions, radii, rotationY, tiltX, tiltZ, translation, scoops, size };

}

function getRockScoopDepthFromDirection( scaled: Vec3, scoops: RockScoop[] ): number {
	let depth = 0;

	for ( const scoop of scoops ) {

		const dot = clamp( scaled[ 0 ] * scoop.direction[ 0 ] + scaled[ 1 ] * scoop.direction[ 1 ] + scaled[ 2 ] * scoop.direction[ 2 ], - 1, 1 );
		const angle = Math.acos( dot );
		const influence = getRockScoopInfluence( angle, scoop.angularRadius );
		depth = Math.max( depth, scoop.depth * influence );

	}
	return depth;

}

function getRockScoopDepth( position: Vec3, radii: Vec3, rotationY: number, scoops: RockScoop[], tiltX = 0, tiltZ = 0, translation: Vec3 = [ 0, 0, 0 ] ): number {

	if ( scoops.length === 0 ) return 0;
	const localPosition = transformRockPositionToLocal( position, rotationY, tiltX, tiltZ, translation );
	const scaled = normalizeDirection( [ localPosition[ 0 ] / radii[ 0 ], localPosition[ 1 ] / radii[ 1 ], localPosition[ 2 ] / radii[ 2 ] ] );
	return getRockScoopDepthFromDirection( scaled, scoops );

}

export function isRockScoopInterior( position: Vec3, shape: RockHullShape, verticalOffset = 0 ): boolean {

	const restored: Vec3 = [ position[ 0 ], position[ 1 ] - verticalOffset, position[ 2 ] ];
	const localPosition = transformRockPositionToLocal( restored, shape.rotationY, shape.tiltX, shape.tiltZ, shape.translation );
	const scaled = normalizeDirection( [ localPosition[ 0 ] / shape.radii[ 0 ], localPosition[ 1 ] / shape.radii[ 1 ], localPosition[ 2 ] / shape.radii[ 2 ] ] );

	return shape.scoops.some( ( scoop ) => {

		const dot = clamp( scaled[ 0 ] * scoop.direction[ 0 ] + scaled[ 1 ] * scoop.direction[ 1 ] + scaled[ 2 ] * scoop.direction[ 2 ], - 1, 1 );
		return dot > Math.cos( scoop.angularRadius * 0.98 );

	} );

}

function applyRockScoops( position: Vec3, radii: Vec3, rotationY: number, scoops: RockScoop[], tiltX = 0, tiltZ = 0, translation: Vec3 = [ 0, 0, 0 ] ): Vec3 {

	if ( scoops.length === 0 ) return position;
	const localPosition = transformRockPositionToLocal( position, rotationY, tiltX, tiltZ, translation );
	const scaled = normalizeDirection( [ localPosition[ 0 ] / radii[ 0 ], localPosition[ 1 ] / radii[ 1 ], localPosition[ 2 ] / radii[ 2 ] ] );
	const surfaceNormal = normalizeDirection( [ scaled[ 0 ] / radii[ 0 ], scaled[ 1 ] / radii[ 1 ], scaled[ 2 ] / radii[ 2 ] ] );
	const depth = getRockScoopDepthFromDirection( scaled, scoops );
	const worldNormal = transformRockNormalToWorld( surfaceNormal, rotationY, tiltX, tiltZ );
	return [ position[ 0 ] - worldNormal[ 0 ] * depth, position[ 1 ] - worldNormal[ 1 ] * depth, position[ 2 ] - worldNormal[ 2 ] * depth ];

}

export type RockRidgeUvSegment = [ [ number, number ], [ number, number ] ];

export interface ChamferedRockHullMesh {
	mesh: MeshData;
	ridgeUvSegments: RockRidgeUvSegment[];
}

interface RockHullFacet {
	normal: Vec3;
	offset: number;
	faces: number[];
	boundary: number[];
	insets: Map<number, Vec3>;
	vertices: Map<number, number>;
}

function buildChamferedRockHullMesh( shape: RockHullShape, faces: [ number, number, number ][], bevelWidth: number, unwrapSeams: boolean ): ChamferedRockHullMesh {

	const hullCenter: Vec3 = [ 0, 0, 0 ];
	for ( const point of shape.points ) for ( let axis = 0; axis < 3; axis ++ ) hullCenter[ axis ] = hullCenter[ axis ]! + point[ axis ]! / shape.points.length;
	const faceNormals = faces.map( ( face ) => {

		const first = shape.points[ face[ 0 ] ]!;
		const second = shape.points[ face[ 1 ] ]!;
		const third = shape.points[ face[ 2 ] ]!;
		const ab: Vec3 = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac: Vec3 = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const normal = normalizeDirection( [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ] );
		const faceCenter: Vec3 = [ ( first[ 0 ] + second[ 0 ] + third[ 0 ] ) / 3, ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3, ( first[ 2 ] + second[ 2 ] + third[ 2 ] ) / 3 ];
		if ( ( faceCenter[ 0 ] - hullCenter[ 0 ] ) * normal[ 0 ] + ( faceCenter[ 1 ] - hullCenter[ 1 ] ) * normal[ 1 ] + ( faceCenter[ 2 ] - hullCenter[ 2 ] ) * normal[ 2 ] < 0 ) return [ - normal[ 0 ], - normal[ 1 ], - normal[ 2 ] ] as Vec3;
		return normal;

	} );
	const facets: RockHullFacet[] = [];
	const faceFacets = new Int32Array( faces.length );

	for ( let faceIndex = 0; faceIndex < faces.length; faceIndex ++ ) {

		const face = faces[ faceIndex ]!;
		const normal = faceNormals[ faceIndex ]!;
		const first = shape.points[ face[ 0 ] ]!;
		const offset = normal[ 0 ] * first[ 0 ] + normal[ 1 ] * first[ 1 ] + normal[ 2 ] * first[ 2 ];
		let facetIndex = facets.findIndex( ( facet ) => facet.normal[ 0 ] * normal[ 0 ] + facet.normal[ 1 ] * normal[ 1 ] + facet.normal[ 2 ] * normal[ 2 ] > 0.995 && Math.abs( facet.offset - offset ) < shape.size * 0.02 );
		if ( facetIndex === - 1 ) {
			facetIndex = facets.length;
			facets.push( { normal, offset, faces: [], boundary: [], insets: new Map(), vertices: new Map() } );
		}
		facets[ facetIndex ]!.faces.push( faceIndex );
		faceFacets[ faceIndex ] = facetIndex;

	}

	const boundaryEdges = new Map<string, { first: number; second: number; facets: number[] }>();

	for ( let facetIndex = 0; facetIndex < facets.length; facetIndex ++ ) {

		const facet = facets[ facetIndex ]!;
		const counts = new Map<string, { first: number; second: number; count: number }>();
		for ( const faceIndex of facet.faces ) {
			const face = faces[ faceIndex ]!;
			for ( let edge = 0; edge < 3; edge ++ ) {
				const first = face[ edge ]!;
				const second = face[ ( edge + 1 ) % 3 ]!;
				const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
				const record = counts.get( key ) ?? { first: Math.min( first, second ), second: Math.max( first, second ), count: 0 };
				record.count ++;
				counts.set( key, record );
			}
		}

		for ( const [ key, edge ] of counts ) {
			if ( edge.count !== 1 ) continue;
			facet.boundary.push( edge.first, edge.second );
			const adjacent = boundaryEdges.get( key ) ?? { first: edge.first, second: edge.second, facets: [] };
			adjacent.facets.push( facetIndex );
			boundaryEdges.set( key, adjacent );
		}

		facet.boundary = [ ...new Set( facet.boundary ) ];
		const boundaryCenter: Vec3 = [ 0, 0, 0 ];
		for ( const vertex of facet.boundary ) for ( let axis = 0; axis < 3; axis ++ ) boundaryCenter[ axis ] = boundaryCenter[ axis ]! + shape.points[ vertex ]![ axis ]! / facet.boundary.length;
		const firstBoundaryVertex = facet.boundary[ 0 ]!;
		const reference = normalizeDirection( [ shape.points[ firstBoundaryVertex ]![ 0 ] - boundaryCenter[ 0 ], shape.points[ firstBoundaryVertex ]![ 1 ] - boundaryCenter[ 1 ], shape.points[ firstBoundaryVertex ]![ 2 ] - boundaryCenter[ 2 ] ] );
		const secondAxis = normalizeDirection( [ facet.normal[ 1 ] * reference[ 2 ] - facet.normal[ 2 ] * reference[ 1 ], facet.normal[ 2 ] * reference[ 0 ] - facet.normal[ 0 ] * reference[ 2 ], facet.normal[ 0 ] * reference[ 1 ] - facet.normal[ 1 ] * reference[ 0 ] ] );
		facet.boundary.sort( ( first, second ) => {
			const firstDirection = [ shape.points[ first ]![ 0 ] - boundaryCenter[ 0 ], shape.points[ first ]![ 1 ] - boundaryCenter[ 1 ], shape.points[ first ]![ 2 ] - boundaryCenter[ 2 ] ];
			const secondDirection = [ shape.points[ second ]![ 0 ] - boundaryCenter[ 0 ], shape.points[ second ]![ 1 ] - boundaryCenter[ 1 ], shape.points[ second ]![ 2 ] - boundaryCenter[ 2 ] ];
			const firstAngle = Math.atan2( firstDirection[ 0 ]! * secondAxis[ 0 ] + firstDirection[ 1 ]! * secondAxis[ 1 ] + firstDirection[ 2 ]! * secondAxis[ 2 ], firstDirection[ 0 ]! * reference[ 0 ] + firstDirection[ 1 ]! * reference[ 1 ] + firstDirection[ 2 ]! * reference[ 2 ] );
			const secondAngle = Math.atan2( secondDirection[ 0 ]! * secondAxis[ 0 ] + secondDirection[ 1 ]! * secondAxis[ 1 ] + secondDirection[ 2 ]! * secondAxis[ 2 ], secondDirection[ 0 ]! * reference[ 0 ] + secondDirection[ 1 ]! * reference[ 1 ] + secondDirection[ 2 ]! * reference[ 2 ] );
			return firstAngle - secondAngle;
		} );

		for ( let index = 0; index < facet.boundary.length; index ++ ) {

			const vertex = facet.boundary[ index ]!;
			const previous = facet.boundary[ ( index + facet.boundary.length - 1 ) % facet.boundary.length ]!;
			const next = facet.boundary[ ( index + 1 ) % facet.boundary.length ]!;
			const previousDirection = normalizeDirection( [ shape.points[ vertex ]![ 0 ] - shape.points[ previous ]![ 0 ], shape.points[ vertex ]![ 1 ] - shape.points[ previous ]![ 1 ], shape.points[ vertex ]![ 2 ] - shape.points[ previous ]![ 2 ] ] );
			const nextDirection = normalizeDirection( [ shape.points[ next ]![ 0 ] - shape.points[ vertex ]![ 0 ], shape.points[ next ]![ 1 ] - shape.points[ vertex ]![ 1 ], shape.points[ next ]![ 2 ] - shape.points[ vertex ]![ 2 ] ] );
			const previousInward = normalizeDirection( [ facet.normal[ 1 ] * previousDirection[ 2 ] - facet.normal[ 2 ] * previousDirection[ 1 ], facet.normal[ 2 ] * previousDirection[ 0 ] - facet.normal[ 0 ] * previousDirection[ 2 ], facet.normal[ 0 ] * previousDirection[ 1 ] - facet.normal[ 1 ] * previousDirection[ 0 ] ] );
			const nextInward = normalizeDirection( [ facet.normal[ 1 ] * nextDirection[ 2 ] - facet.normal[ 2 ] * nextDirection[ 1 ], facet.normal[ 2 ] * nextDirection[ 0 ] - facet.normal[ 0 ] * nextDirection[ 2 ], facet.normal[ 0 ] * nextDirection[ 1 ] - facet.normal[ 1 ] * nextDirection[ 0 ] ] );
			let insetDirection = normalizeDirection( [ previousInward[ 0 ] + nextInward[ 0 ], previousInward[ 1 ] + nextInward[ 1 ], previousInward[ 2 ] + nextInward[ 2 ] ] );
			if ( insetDirection[ 0 ] * previousInward[ 0 ] + insetDirection[ 1 ] * previousInward[ 1 ] + insetDirection[ 2 ] * previousInward[ 2 ] < 0 ) insetDirection = [ - insetDirection[ 0 ], - insetDirection[ 1 ], - insetDirection[ 2 ] ];
			const alignment = Math.min( insetDirection[ 0 ] * previousInward[ 0 ] + insetDirection[ 1 ] * previousInward[ 1 ] + insetDirection[ 2 ] * previousInward[ 2 ], insetDirection[ 0 ] * nextInward[ 0 ] + insetDirection[ 1 ] * nextInward[ 1 ] + insetDirection[ 2 ] * nextInward[ 2 ] );
			const shortestEdge = Math.min( Math.hypot( shape.points[ vertex ]![ 0 ] - shape.points[ previous ]![ 0 ], shape.points[ vertex ]![ 1 ] - shape.points[ previous ]![ 1 ], shape.points[ vertex ]![ 2 ] - shape.points[ previous ]![ 2 ] ), Math.hypot( shape.points[ next ]![ 0 ] - shape.points[ vertex ]![ 0 ], shape.points[ next ]![ 1 ] - shape.points[ vertex ]![ 1 ], shape.points[ next ]![ 2 ] - shape.points[ vertex ]![ 2 ] ) );
			const insetDistance = Math.min( bevelWidth / Math.max( alignment, 0.2 ), shortestEdge * 0.32 );
			facet.insets.set( vertex, [ insetDirection[ 0 ] * insetDistance, insetDirection[ 1 ] * insetDistance, insetDirection[ 2 ] * insetDistance ] );

		}

	}

	const positions: Vec3[] = [];
	const triangles: [ number, number, number ][] = [];
	const vertexKeys = new Map<string, number>();
	const getVertex = ( key: string, position: Vec3 ): number => {
		const existing = vertexKeys.get( key );
		if ( existing !== undefined ) return existing;
		const index = positions.length;
		positions.push( position );
		vertexKeys.set( key, index );
		return index;
	};
	const getFacetVertex = ( facetIndex: number, vertex: number ): number => {
		const facet = facets[ facetIndex ]!;
		const existing = facet.vertices.get( vertex );
		if ( existing !== undefined ) return existing;
		const source = shape.points[ vertex ]!;
		const inset = facet.insets.get( vertex ) ?? [ 0, 0, 0 ];
		const position = applyRockScoops( [ source[ 0 ] + inset[ 0 ], source[ 1 ] + inset[ 1 ], source[ 2 ] + inset[ 2 ] ], shape.radii, shape.rotationY, shape.scoops, shape.tiltX, shape.tiltZ, shape.translation );
		const index = getVertex( `f:${ facetIndex }:v:${ vertex }`, position );
		facet.vertices.set( vertex, index );
		return index;
	};
	const addOutwardTriangle = ( first: number, second: number, third: number ): void => {
		const a = positions[ first ]!;
		const b = positions[ second ]!;
		const c = positions[ third ]!;
		const ab: Vec3 = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ];
		const ac: Vec3 = [ c[ 0 ] - a[ 0 ], c[ 1 ] - a[ 1 ], c[ 2 ] - a[ 2 ] ];
		const normal: Vec3 = [ ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ], ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ], ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ] ];
		if ( Math.hypot( normal[ 0 ], normal[ 1 ], normal[ 2 ] ) < 1e-10 ) return;
		const center: Vec3 = [ ( a[ 0 ] + b[ 0 ] + c[ 0 ] ) / 3, ( a[ 1 ] + b[ 1 ] + c[ 1 ] ) / 3, ( a[ 2 ] + b[ 2 ] + c[ 2 ] ) / 3 ];
		if ( normal[ 0 ] * ( center[ 0 ] - hullCenter[ 0 ] ) + normal[ 1 ] * ( center[ 1 ] - hullCenter[ 1 ] ) + normal[ 2 ] * ( center[ 2 ] - hullCenter[ 2 ] ) < 0 ) triangles.push( [ first, third, second ] );
		else triangles.push( [ first, second, third ] );
	};

	for ( let faceIndex = 0; faceIndex < faces.length; faceIndex ++ ) {

		const face = faces[ faceIndex ]!;
		const facetIndex = faceFacets[ faceIndex ]!;
		const corners = face.map( ( vertex ) => getFacetVertex( facetIndex, vertex ) );
		const first = shape.points[ face[ 0 ] ]!;
		const second = shape.points[ face[ 1 ] ]!;
		const third = shape.points[ face[ 2 ] ]!;
		const centerPosition: Vec3 = [ ( first[ 0 ] + second[ 0 ] + third[ 0 ] ) / 3, ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3, ( first[ 2 ] + second[ 2 ] + third[ 2 ] ) / 3 ];
		const scoopDepth = getRockScoopDepth( centerPosition, shape.radii, shape.rotationY, shape.scoops, shape.tiltX, shape.tiltZ, shape.translation );

		if ( scoopDepth > shape.size * 0.018 ) {
			const scoopedCenter = applyRockScoops( centerPosition, shape.radii, shape.rotationY, shape.scoops, shape.tiltX, shape.tiltZ, shape.translation );
			const baseCenter: Vec3 = [ 0, 1, 2 ].map( ( axis ) => ( positions[ corners[ 0 ]! ]![ axis ]! + positions[ corners[ 1 ]! ]![ axis ]! + positions[ corners[ 2 ]! ]![ axis ]! ) / 3 ) as Vec3;
			const hasBroadTriangles = ( candidate: Vec3 ): boolean => {
				for ( let edge = 0; edge < 3; edge ++ ) if ( minimumTriangleAngle( positions[ corners[ edge ]! ]!, positions[ corners[ ( edge + 1 ) % 3 ]! ]!, candidate ) < 10 * Math.PI / 180 ) return false;
				return true;
			};
			let centerTarget = scoopedCenter;
			if ( ! hasBroadTriangles( centerTarget ) ) {
				let minimum = 0;
				let maximum = 1;
				for ( let iteration = 0; iteration < 12; iteration ++ ) {
					const amount = ( minimum + maximum ) * 0.5;
					const candidate: Vec3 = [ baseCenter[ 0 ] + ( scoopedCenter[ 0 ] - baseCenter[ 0 ] ) * amount, baseCenter[ 1 ] + ( scoopedCenter[ 1 ] - baseCenter[ 1 ] ) * amount, baseCenter[ 2 ] + ( scoopedCenter[ 2 ] - baseCenter[ 2 ] ) * amount ];
					if ( hasBroadTriangles( candidate ) ) minimum = amount;
					else maximum = amount;
				}
				centerTarget = [ baseCenter[ 0 ] + ( scoopedCenter[ 0 ] - baseCenter[ 0 ] ) * minimum, baseCenter[ 1 ] + ( scoopedCenter[ 1 ] - baseCenter[ 1 ] ) * minimum, baseCenter[ 2 ] + ( scoopedCenter[ 2 ] - baseCenter[ 2 ] ) * minimum ];
			}
			const center = getVertex( `s:${ faceIndex }`, centerTarget );
			for ( let edge = 0; edge < 3; edge ++ ) triangles.push( [ corners[ edge ]!, corners[ ( edge + 1 ) % 3 ]!, center ] );
		} else {
			triangles.push( [ corners[ 0 ]!, corners[ 1 ]!, corners[ 2 ]! ] );
		}

	}

	const ridgeVertices: { firstA: number; secondA: number; firstB: number; secondB: number; sharpness: number }[] = [];
	const cornerFanRings: number[][] = [];

	for ( const edge of boundaryEdges.values() ) {

		if ( edge.facets.length !== 2 ) continue;
		const firstFacet = edge.facets[ 0 ]!;
		const secondFacet = edge.facets[ 1 ]!;
		if ( firstFacet === secondFacet ) continue;
		const firstNormal = facets[ firstFacet ]!.normal;
		const secondNormal = facets[ secondFacet ]!.normal;
		const sharpness = Math.acos( clamp( firstNormal[ 0 ] * secondNormal[ 0 ] + firstNormal[ 1 ] * secondNormal[ 1 ] + firstNormal[ 2 ] * secondNormal[ 2 ], - 1, 1 ) );
		const firstA = getFacetVertex( firstFacet, edge.first );
		const firstB = getFacetVertex( firstFacet, edge.second );
		const secondA = getFacetVertex( secondFacet, edge.first );
		const secondB = getFacetVertex( secondFacet, edge.second );
		const firstDiagonal = Math.min(
			minimumTriangleAngle( positions[ firstA ]!, positions[ firstB ]!, positions[ secondB ]! ),
			minimumTriangleAngle( positions[ firstA ]!, positions[ secondB ]!, positions[ secondA ]! ),
		);
		const secondDiagonal = Math.min(
			minimumTriangleAngle( positions[ firstA ]!, positions[ firstB ]!, positions[ secondA ]! ),
			minimumTriangleAngle( positions[ firstB ]!, positions[ secondB ]!, positions[ secondA ]! ),
		);
		if ( firstDiagonal >= secondDiagonal ) {
			addOutwardTriangle( firstA, firstB, secondB );
			addOutwardTriangle( firstA, secondB, secondA );
		} else {
			addOutwardTriangle( firstA, firstB, secondA );
			addOutwardTriangle( firstB, secondB, secondA );
		}
		ridgeVertices.push( { firstA, secondA, firstB, secondB, sharpness } );

	}

	const incidentFacets = shape.points.map( () => new Set<number>() );
	for ( let facetIndex = 0; facetIndex < facets.length; facetIndex ++ ) for ( const vertex of facets[ facetIndex ]!.boundary ) incidentFacets[ vertex ]!.add( facetIndex );
	const incidentFacetNeighbors = shape.points.map( () => new Map<number, Set<number>>() );
	for ( const edge of boundaryEdges.values() ) {
		if ( edge.facets.length !== 2 ) continue;
		const firstFacet = edge.facets[ 0 ]!;
		const secondFacet = edge.facets[ 1 ]!;
		for ( const vertex of [ edge.first, edge.second ] ) {
			const neighbors = incidentFacetNeighbors[ vertex ]!;
			const firstNeighbors = neighbors.get( firstFacet ) ?? new Set<number>();
			const secondNeighbors = neighbors.get( secondFacet ) ?? new Set<number>();
			firstNeighbors.add( secondFacet );
			secondNeighbors.add( firstFacet );
			neighbors.set( firstFacet, firstNeighbors );
			neighbors.set( secondFacet, secondNeighbors );
		}
	}

	for ( let vertex = 0; vertex < incidentFacets.length; vertex ++ ) {

		const connected = [ ...incidentFacets[ vertex ]! ];
		if ( connected.length < 3 ) continue;
		const facetNeighbors = incidentFacetNeighbors[ vertex ]!;
		const ordered = [ connected[ 0 ]! ];
		let previous = - 1;
		let current = connected[ 0 ]!;
		while ( ordered.length < connected.length ) {
			const next = [ ...( facetNeighbors.get( current ) ?? [] ) ].find( ( candidate ) => candidate !== previous && ! ordered.includes( candidate ) );
			if ( next === undefined ) break;
			ordered.push( next );
			previous = current;
			current = next;
		}
		if ( ordered.length !== connected.length ) continue;
		const ring = ordered.map( ( facetIndex ) => getFacetVertex( facetIndex, vertex ) );
		cornerFanRings.push( ring );
		for ( let index = 1; index < ring.length - 1; index ++ ) addOutwardTriangle( ring[ 0 ]!, ring[ index ]!, ring[ index + 1 ]! );

	}

	const edgeUses = new Map<string, { triangle: number; direction: number }[]>();
	for ( let triangle = 0; triangle < triangles.length; triangle ++ ) {
		const face = triangles[ triangle ]!;
		for ( let edge = 0; edge < 3; edge ++ ) {
			const first = face[ edge ]!;
			const second = face[ ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			const uses = edgeUses.get( key ) ?? [];
			uses.push( { triangle, direction: first < second ? 1 : - 1 } );
			edgeUses.set( key, uses );
		}
	}
	const triangleNeighbors = triangles.map( () => [] as { triangle: number; sameDirection: boolean }[] );
	for ( const uses of edgeUses.values() ) {
		for ( let index = 0; index < uses.length; index ++ ) {
			for ( let neighbor = index + 1; neighbor < uses.length; neighbor ++ ) {
				const first = uses[ index ]!;
				const second = uses[ neighbor ]!;
				triangleNeighbors[ first.triangle ]!.push( { triangle: second.triangle, sameDirection: first.direction === second.direction } );
				triangleNeighbors[ second.triangle ]!.push( { triangle: first.triangle, sameDirection: first.direction === second.direction } );
			}
		}
	}
	const winding = new Int8Array( triangles.length );
	for ( let seed = 0; seed < triangles.length; seed ++ ) {
		if ( winding[ seed ] !== 0 ) continue;
		winding[ seed ] = 1;
		const stack = [ seed ];
		const component: number[] = [];
		while ( stack.length > 0 ) {
			const triangle = stack.pop()!;
			component.push( triangle );
			for ( const neighbor of triangleNeighbors[ triangle ]! ) {
				const expected = winding[ triangle ]! * ( neighbor.sameDirection ? - 1 : 1 );
				if ( winding[ neighbor.triangle ] === 0 ) {
					winding[ neighbor.triangle ] = expected;
					stack.push( neighbor.triangle );
				}
			}
		}
		let volume = 0;
		for ( const triangle of component ) {
			const face = triangles[ triangle ]!;
			const first = positions[ face[ 0 ] ]!;
			const second = positions[ face[ 1 ] ]!;
			const third = positions[ face[ 2 ] ]!;
			const cross: Vec3 = [ second[ 1 ] * third[ 2 ] - second[ 2 ] * third[ 1 ], second[ 2 ] * third[ 0 ] - second[ 0 ] * third[ 2 ], second[ 0 ] * third[ 1 ] - second[ 1 ] * third[ 0 ] ];
			volume += winding[ triangle ]! * ( first[ 0 ] * cross[ 0 ] + first[ 1 ] * cross[ 1 ] + first[ 2 ] * cross[ 2 ] );
		}
		if ( volume < 0 ) for ( const triangle of component ) winding[ triangle ] = - winding[ triangle ]!;
	}
	for ( let triangle = 0; triangle < triangles.length; triangle ++ ) if ( winding[ triangle ]! < 0 ) [ triangles[ triangle ]![ 1 ], triangles[ triangle ]![ 2 ] ] = [ triangles[ triangle ]![ 2 ], triangles[ triangle ]![ 1 ] ];

	const mesh = buildRockMeshFromFaces( positions, triangles );
	if ( unwrapSeams ) unwrapRockUvSeams( mesh, true );
	const midpointUv = ( first: number, second: number ): [ number, number ] => {

		const firstU = mesh.uvs[ first * 2 ]!;
		let secondU = mesh.uvs[ second * 2 ]!;
		if ( secondU - firstU > 0.5 ) secondU -= 1;
		if ( firstU - secondU > 0.5 ) secondU += 1;
		return [ ( firstU + secondU ) * 0.5, ( mesh.uvs[ first * 2 + 1 ]! + mesh.uvs[ second * 2 + 1 ]! ) * 0.5 ];

	};
	const addRidgeUvSegment = ( first: [ number, number ], second: [ number, number ], segments: RockRidgeUvSegment[] ): void => {

		let secondU = second[ 0 ];
		if ( secondU - first[ 0 ] > 0.5 ) secondU -= 1;
		if ( first[ 0 ] - secondU > 0.5 ) secondU += 1;
		segments.push( [ first, [ secondU, second[ 1 ] ] ] );

	};
	const ridgeUvSegments: RockRidgeUvSegment[] = [];

	const highlightCount = Math.min( 10, Math.max( 4, Math.round( ridgeVertices.length * 0.3 ) ) );
	const highlightedRidges = ridgeVertices.slice().sort( ( first, second ) => second.sharpness - first.sharpness ).slice( 0, highlightCount );
	for ( const ridge of highlightedRidges ) addRidgeUvSegment( midpointUv( ridge.firstA, ridge.secondA ), midpointUv( ridge.firstB, ridge.secondB ), ridgeUvSegments );

	return { mesh, ridgeUvSegments };

}

export function buildRockHullMeshWithChamfers( shape: RockHullShape, faces: [ number, number, number ][], bevelWidth: number, weathering = 0.25, unwrapSeams = true ): ChamferedRockHullMesh {

	if ( ! Number.isFinite( bevelWidth ) || bevelWidth <= 0 ) throw new RangeError( 'Rock chamfer width must be a positive finite number' );
	if ( ! Number.isFinite( weathering ) || weathering < 0 || weathering > 1 ) throw new RangeError( 'Rock weathering must be from 0 to 1' );
	return buildChamferedRockHullMesh( shape, faces, bevelWidth, unwrapSeams );

}

export function buildRockHullMesh( shape: RockHullShape, faces: [ number, number, number ][], subdivision: 0 | 1 | 2 | 3, bevelWidth = 0, weathering = 0.25, unwrapSeams = true ): MeshData {

	if ( subdivision === 3 && bevelWidth > 0 ) return buildRockHullMeshWithChamfers( shape, faces, bevelWidth, weathering, unwrapSeams ).mesh;

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
	const scoopGridFaces = new Set<number>();

	if ( subdivision === 3 && shape.scoops.length > 0 ) {

		const scoopGridCandidates = faces.map( ( face, faceIndex ) => {

			const center: Vec3 = [ 0, 1, 2 ].map( ( axis ) => ( shape.points[ face[ 0 ] ]![ axis ]! + shape.points[ face[ 1 ] ]![ axis ]! + shape.points[ face[ 2 ] ]![ axis ]! ) / 3 ) as Vec3;
			return { faceIndex, depth: getRockScoopDepth( center, shape.radii, shape.rotationY, shape.scoops, shape.tiltX, shape.tiltZ, shape.translation ) };

		} )
			.filter( ( candidate ) => candidate.depth > shape.size * 0.04 )
			.sort( ( first, second ) => second.depth - first.depth );

		for ( const candidate of scoopGridCandidates.slice( 0, 8 ) ) scoopGridFaces.add( candidate.faceIndex );

	}
	const positions: Vec3[] = [];
	const vertexKeys = new Map<string, number>();
	const triangles: [ number, number, number ][] = [];
	const cornerRound = bevelWidth * ( 0.6 + weathering * 0.4 );
	const getVertex = ( key: string, position: Vec3, inset: Vec3, amount: number ): number => {

		const existing = vertexKeys.get( key );
		if ( existing !== undefined ) return existing;
		const scooped = applyRockScoops( position, shape.radii, shape.rotationY, shape.scoops, shape.tiltX, shape.tiltZ, shape.translation );
		const index = positions.length;
		positions.push( [ scooped[ 0 ] - inset[ 0 ] * amount, scooped[ 1 ] - inset[ 1 ] * amount, scooped[ 2 ] - inset[ 2 ] * amount ] );
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
		const scoopGrid = subdivision === 3 && scoopGridFaces.has( faceIndex );
		const useSixTriangles = subdivision === 2 || ( subdivision === 3 && ( scoopGrid || faceArea >= shape.size * shape.size * 0.12 ) );

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

function unwrapRockUvSeams( mesh: MeshData, optimizeSeam = false ): number {

	let uvOffset = 0;

	if ( optimizeSeam ) {

		let minimumCopies = Infinity;

		for ( let sample = 0; sample < 128; sample ++ ) {

			const candidateOffset = sample / 128;
			const copies = new Set<number>();

			for ( let triangle = 0; triangle < mesh.indices.length; triangle += 3 ) {

				const normalizedU = [ 0, 1, 2 ].map( ( corner ) => {
					const u = mesh.uvs[ mesh.indices[ triangle + corner ]! * 2 ]! + candidateOffset;
					return ( ( u % 1 ) + 1 ) % 1;
				} );
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
				for ( let corner = 0; corner < normalizedU.length; corner ++ ) if ( normalizedU[ corner ]! < start ) copies.add( mesh.indices[ triangle + corner ]! );

			}

			if ( copies.size < minimumCopies ) {
				minimumCopies = copies.size;
				uvOffset = candidateOffset;
			}

		}

	}

	const positions = Array.from( mesh.positions );
	const normals = Array.from( mesh.normals );
	const uvs = Array.from( mesh.uvs, ( value, index ) => index % 2 === 0 ? ( ( value + uvOffset ) % 1 + 1 ) % 1 : value );
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

	return uvOffset;

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

