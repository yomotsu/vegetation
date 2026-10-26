import { MeshBuilder } from './meshBuilder';
import { createNoise3D } from './noise';
import { addRockShell } from './primitives';
import type { MeshData, Vec3 } from './types';

export function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

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

function createCuttingPlanes( seed: number, radius: number ): { normal: Vec3; distance: number }[] {

	const random = createRockRandom( seed );
	const planes: { normal: Vec3; distance: number }[] = [];

	for ( let index = 0; index < 7; index ++ ) {

		const vertical = random() * 2 - 1;
		const angle = random() * Math.PI * 2;
		const horizontal = Math.sqrt( 1 - vertical * vertical );

		planes.push( {
			normal: [ horizontal * Math.cos( angle ), vertical, horizontal * Math.sin( angle ) ],
			distance: radius * ( 0.63 + random() * 0.15 ),
		} );

	}

	return planes;

}

export function createRockRadiusFunction( seed: number, radius: number, roughness: number, verticalScale: number ): ( direction: Vec3 ) => number {

	const noise = createNoise3D( seed + 71 );
	const noiseOffset = [ ( seed * 17.13 ) % 71, ( seed * 31.7 ) % 89, ( seed * 53.9 ) % 97 ];
	const cuttingPlanes = createCuttingPlanes( seed, radius );

	return ( direction: Vec3 ): number => {

		const coarse = noise( direction[ 0 ] * 1.05 + noiseOffset[ 0 ]!, direction[ 1 ] * 1.05 + noiseOffset[ 1 ]!, direction[ 2 ] * 1.05 + noiseOffset[ 2 ]! );
		const medium = noise( direction[ 0 ] * 2.65 - noiseOffset[ 2 ]!, direction[ 1 ] * 2.65 + noiseOffset[ 0 ]!, direction[ 2 ] * 2.65 - noiseOffset[ 1 ]! );
		const detail = noise( direction[ 0 ] * 5.1 + noiseOffset[ 1 ]!, direction[ 1 ] * 5.1 - noiseOffset[ 2 ]!, direction[ 2 ] * 5.1 + noiseOffset[ 0 ]! );
		const relief = noise( direction[ 0 ] * 6.8 - noiseOffset[ 0 ]!, direction[ 1 ] * 6.8 + noiseOffset[ 2 ]!, direction[ 2 ] * 6.8 - noiseOffset[ 1 ]! );
		const angle = Math.atan2( direction[ 2 ], direction[ 0 ] );
		const lobes = Math.sin( angle * 3 + noiseOffset[ 1 ]! ) * 0.075 + Math.cos( angle * 5 - noiseOffset[ 2 ]! ) * 0.035;
		let deformedRadius = radius * clamp( 0.97 + ( coarse * 0.25 + medium * 0.075 + detail * 0.012 + lobes ) * roughness, 0.62, 1.34 );

		for ( const plane of cuttingPlanes ) {

			const projection = direction[ 0 ] * plane.normal[ 0 ] + direction[ 1 ] * plane.normal[ 1 ] + direction[ 2 ] * plane.normal[ 2 ];

			if ( projection > 0 ) deformedRadius = Math.min( deformedRadius, plane.distance / projection );

		}

		const reliefExposure = 0.35 + smoothstep( 0.08, 0.65, Math.abs( direction[ 1 ] ) ) * 0.65;
		deformedRadius = clamp( deformedRadius + radius * relief * 0.072 * roughness * reliefExposure, radius * 0.62, radius * 1.34 );

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

	for ( let vertex = 0; vertex < vertexGroups.length; vertex ++ ) {

		const factor = groupColors[ vertexGroups[ vertex ]! ]!;
		const offset = vertex * 3;

		mesh.colors[ offset ] = factor;
		mesh.colors[ offset + 1 ] = factor;
		mesh.colors[ offset + 2 ] = factor;

	}

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

