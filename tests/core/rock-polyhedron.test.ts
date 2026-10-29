import { describe, expect, it } from 'vitest';
import { generateRockData } from '../../src/core/generators/rock';
import type { MeshData } from '../../src/core/types';
import { minimumRockApexAngle } from '../helpers/rockSharpness';
import { withSharedRockTextures } from '../helpers/sharedRockTextures';
import { buildConvexHullFaces, buildRockHullMesh, buildRockHullMeshWithChamfers, createRockHullShape, getRockScoopInfluence, isRockScoopInterior, recomputeCreasedNormals } from '../../src/core/rockGeometry';
import { createRockCrackPaths, createRockTextures } from '../../src/core/rockTexture';

function vertexCount( mesh: MeshData ): number {

	return mesh.positions.length / 3;

}

function getAboveGroundBounds( mesh: MeshData ): { width: number; height: number; depth: number } {

	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];
	const include = ( point: number[] ): void => {

		for ( let axis = 0; axis < 3; axis ++ ) {

			minimum[ axis ] = Math.min( minimum[ axis ]!, point[ axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, point[ axis ]! );

		}

	};

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const points = [ 0, 1, 2 ].map( ( corner ) => {

			const vertex = mesh.indices[ offset + corner ]! * 3;
			return [ mesh.positions[ vertex ]!, mesh.positions[ vertex + 1 ]!, mesh.positions[ vertex + 2 ]! ];

		} );

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = points[ edge ]!;
			const second = points[ ( edge + 1 ) % 3 ]!;
			if ( first[ 1 ]! >= 0 ) include( first );

			if ( ( first[ 1 ]! < 0 && second[ 1 ]! > 0 ) || ( first[ 1 ]! > 0 && second[ 1 ]! < 0 ) ) {

				const amount = - first[ 1 ]! / ( second[ 1 ]! - first[ 1 ]! );
				include( [
					first[ 0 ]! + ( second[ 0 ]! - first[ 0 ]! ) * amount,
					0,
					first[ 2 ]! + ( second[ 2 ]! - first[ 2 ]! ) * amount,
				] );

			}

		}

	}

	return { width: maximum[ 0 ]! - minimum[ 0 ]!, height: maximum[ 1 ]!, depth: maximum[ 2 ]! - minimum[ 2 ]! };

}

function getSurfaceEdgeErrors( mesh: MeshData ): string[] {

	const vertexKeys = new Map<string, number>();
	const weldedVertices: [ number, number, number ][] = [];
	const edges = new Map<string, { count: number; orientation: number; maximumY: number }>();
	const weld = ( vertex: number ): number => {

		const offset = vertex * 3;
		const point: [ number, number, number ] = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		const key = point.map( ( value ) => value.toFixed( 5 ) ).join( ',' );
		let group = vertexKeys.get( key );

		if ( group === undefined ) {

			group = weldedVertices.length;
			vertexKeys.set( key, group );
			weldedVertices.push( point );

		}

		return group;

	};

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const triangle = [ 0, 1, 2 ].map( ( corner ) => weld( mesh.indices[ offset + corner ]! ) );

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = triangle[ edge ]!;
			const second = triangle[ ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			const record = edges.get( key ) ?? { count: 0, orientation: 0, maximumY: - Infinity };
			record.count ++;
			record.orientation += first < second ? 1 : - 1;
			record.maximumY = Math.max( record.maximumY, weldedVertices[ first ]![ 1 ], weldedVertices[ second ]![ 1 ] );
			edges.set( key, record );

		}

	}

	return Array.from( edges, ( [ key, edge ] ) => {

		if ( edge.count === 2 && edge.orientation === 0 ) return '';
		if ( edge.count === 1 && edge.maximumY <= 1e-5 ) return '';
		const first = Number( key.split( ':' )[ 0 ] );
		const second = Number( key.split( ':' )[ 1 ] );
		return `${ key } ${ weldedVertices[ first ] } -> ${ weldedVertices[ second ] } faces=${ edge.count } orientation=${ edge.orientation }`;

	} ).filter( ( error ) => error.length > 0 );

}

function getTriangle( mesh: MeshData, offset: number ): { points: [ number, number, number ][]; normal: [ number, number, number ]; area: number } {

	const points = [ 0, 1, 2 ].map( ( corner ) => {

		const vertex = mesh.indices[ offset + corner ]! * 3;
		return [ mesh.positions[ vertex ]!, mesh.positions[ vertex + 1 ]!, mesh.positions[ vertex + 2 ]! ] as [ number, number, number ];

	} );
	const first = points[ 0 ]!;
	const second = points[ 1 ]!;
	const third = points[ 2 ]!;
	const ab: [ number, number, number ] = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
	const ac: [ number, number, number ] = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
	const cross: [ number, number, number ] = [
		ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ],
		ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ],
		ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ],
	];
	const doubleArea = Math.hypot( ...cross );
	const normal = cross.map( ( value ) => value / ( doubleArea || 1 ) ) as [ number, number, number ];

	return { points, normal, area: doubleArea * 0.5 };

}

function countChamferTrianglesForHullEdges( mesh: MeshData, shape: ReturnType<typeof createRockHullShape>, faces: [ number, number, number ][] ): { edges: number; strips: number } {

	const edgeFaces = new Map<string, { first: number; second: number; normals: [ number, number, number ][] }>();
	const faceNormals = faces.map( ( face ) => {

		const points = face.map( ( vertex ) => shape.points[ vertex ]! );
		const ab = [ points[ 1 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 1 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 1 ]![ 2 ] - points[ 0 ]![ 2 ] ];
		const ac = [ points[ 2 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 2 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 2 ]![ 2 ] - points[ 0 ]![ 2 ] ];
		const normal = [ ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ];
		const length = Math.hypot( ...normal );
		return normal.map( ( value ) => value / length ) as [ number, number, number ];

	} );

	for ( let faceIndex = 0; faceIndex < faces.length; faceIndex ++ ) {

		const face = faces[ faceIndex ]!;
		for ( let edge = 0; edge < 3; edge ++ ) {
			const first = face[ edge ]!;
			const second = face[ ( edge + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			const record = edgeFaces.get( key ) ?? { first: Math.min( first, second ), second: Math.max( first, second ), normals: [] };
			record.normals.push( faceNormals[ faceIndex ]! );
			edgeFaces.set( key, record );
		}

	}

	let edges = 0;
	let strips = 0;

	for ( const edge of edgeFaces.values() ) {

		if ( edge.normals.length !== 2 ) continue;
		const average = [ edge.normals[ 0 ]![ 0 ] + edge.normals[ 1 ]![ 0 ], edge.normals[ 0 ]![ 1 ] + edge.normals[ 1 ]![ 1 ], edge.normals[ 0 ]![ 2 ] + edge.normals[ 1 ]![ 2 ] ];
		const averageLength = Math.hypot( ...average );
		const dot = edge.normals[ 0 ]![ 0 ] * edge.normals[ 1 ]![ 0 ] + edge.normals[ 0 ]![ 1 ] * edge.normals[ 1 ]![ 1 ] + edge.normals[ 0 ]![ 2 ] * edge.normals[ 1 ]![ 2 ];
		const angle = Math.acos( Math.max( - 1, Math.min( 1, dot ) ) );
		if ( angle < 15 * Math.PI / 180 || averageLength < 1e-8 ) continue;
		edges ++;
		for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

			const triangle = getTriangle( mesh, offset );
			const alignment = triangle.normal[ 0 ] * average[ 0 ]! + triangle.normal[ 1 ] * average[ 1 ]! + triangle.normal[ 2 ] * average[ 2 ]!;
			if ( alignment / averageLength < 0.995 ) continue;
			const first = shape.points[ edge.first ]!;
			const second = shape.points[ edge.second ]!;
			const direction = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
			const lengthSquared = direction[ 0 ]! ** 2 + direction[ 1 ]! ** 2 + direction[ 2 ]! ** 2;
			const center = triangle.points.reduce( ( sum, point ) => [ sum[ 0 ] + point[ 0 ] / 3, sum[ 1 ] + point[ 1 ] / 3, sum[ 2 ] + point[ 2 ] / 3 ], [ 0, 0, 0 ] );
			const projection = ( ( center[ 0 ] - first[ 0 ] ) * direction[ 0 ]! + ( center[ 1 ] - first[ 1 ] ) * direction[ 1 ]! + ( center[ 2 ] - first[ 2 ] ) * direction[ 2 ]! ) / lengthSquared;
			if ( projection < 0.1 || projection > 0.9 ) continue;
			const nearest = [ first[ 0 ] + direction[ 0 ]! * projection, first[ 1 ] + direction[ 1 ]! * projection, first[ 2 ] + direction[ 2 ]! * projection ];
			const distance = Math.hypot( center[ 0 ] - nearest[ 0 ]!, center[ 1 ] - nearest[ 1 ]!, center[ 2 ] - nearest[ 2 ]! );
			if ( distance < shape.size * 0.1 ) strips ++;

		}

	}

	return { edges, strips };

}

function getVisiblePlaneRegions( seed: number ): { normal: [ number, number, number ]; area: number }[] {

	const size = seed % 2 === 0 ? 12.3 : 6.4;
	const shape = createRockHullShape( seed + 62, size, 1.2, 0.04 );
	const faces = buildConvexHullFaces( shape.points );
	const minimumY = Math.min( ...shape.points.map( ( point ) => point[ 1 ] ) );
	const maximumY = Math.max( ...shape.points.map( ( point ) => point[ 1 ] ) );
	const seedHash = Math.sin( Math.abs( seed + 62 ) * 127.1 + 311.7 ) * 43758.5453;
	const burial = 0.39 + ( seedHash - Math.floor( seedHash ) ) * 0.06;
	const groundY = minimumY + ( maximumY - minimumY ) * burial;
	let aboveGroundArea = 0;
	const cameraDirection = [ 0, 0.3, 0.95 ];
	const cameraLength = Math.hypot( ...cameraDirection );
	for ( let axis = 0; axis < 3; axis ++ ) cameraDirection[ axis ]! /= cameraLength;
	const regions: { normal: [ number, number, number ]; offset: number; area: number }[] = [];

	for ( const face of faces ) {

		const points = face.map( ( vertex ) => shape.points[ vertex ]! );
		if ( points.reduce( ( total, point ) => total + point[ 1 ] / 3, 0 ) <= groundY ) continue;
		const first = points[ 0 ]!;
		const second = points[ 1 ]!;
		const third = points[ 2 ]!;
		const ab: [ number, number, number ] = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac: [ number, number, number ] = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const cross: [ number, number, number ] = [
			ab[ 1 ] * ac[ 2 ] - ab[ 2 ] * ac[ 1 ],
			ab[ 2 ] * ac[ 0 ] - ab[ 0 ] * ac[ 2 ],
			ab[ 0 ] * ac[ 1 ] - ab[ 1 ] * ac[ 0 ],
		];
		const doubleArea = Math.hypot( ...cross );
		const normal = cross.map( ( value ) => value / doubleArea ) as [ number, number, number ];
		aboveGroundArea += doubleArea * 0.5;
		if ( normal.reduce( ( total, value, axis ) => total + value * cameraDirection[ axis ]!, 0 ) <= 0.02 ) continue;
		const offset = normal.reduce( ( total, value, axis ) => total + value * first[ axis ]!, 0 );
		let region = regions.find( ( candidate ) => candidate.normal.reduce( ( dot, value, axis ) => dot + value * normal[ axis ]!, 0 ) > 0.9999 && Math.abs( candidate.offset - offset ) < size * 0.001 );
		if ( region === undefined ) {
			region = { normal, offset, area: 0 };
			regions.push( region );
		}
		region.area += doubleArea * 0.5;

	}
	const visibleArea = regions.reduce( ( total, region ) => total + region.area, 0 );
	return regions.filter( ( region ) => region.area / visibleArea >= 0.002 ).map( ( region ) => ( { normal: region.normal, area: region.area / aboveGroundArea } ) );

}

function getMeshFacetColorMean( data: ReturnType<typeof generateRockData>, minimumNormalY: number, maximumNormalY: number ): [ number, number, number ] {

	const texture = data.textures.albedo!;
	const mesh = data.lods[ 0 ]!;
	const total: [ number, number, number ] = [ 0, 0, 0 ];
	let areaTotal = 0;

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const triangle = getTriangle( mesh, offset );
		const normalY = triangle.normal[ 1 ];
		if ( normalY < minimumNormalY || normalY >= maximumNormalY ) continue;
		const vertices = [ 0, 1, 2 ].map( ( corner ) => mesh.indices[ offset + corner ]! );
		const uValues = vertices.map( ( vertex ) => mesh.uvs[ vertex * 2 ]! );
		if ( Math.max( ...uValues ) - Math.min( ...uValues ) > 0.5 ) {
			for ( let corner = 0; corner < uValues.length; corner ++ ) if ( uValues[ corner ]! <= 0.5 ) uValues[ corner ]! += 1;
		}
		const u = ( ( uValues.reduce( ( sum, value ) => sum + value, 0 ) / 3 ) % 1 + 1 ) % 1;
		const v = Math.max( 0, Math.min( 1, vertices.reduce( ( sum, vertex ) => sum + mesh.uvs[ vertex * 2 + 1 ]! / 3, 0 ) ) );
		const pixel = ( Math.min( texture.height - 1, Math.floor( v * texture.height ) ) * texture.width + Math.floor( u * texture.width ) ) * 4;
		for ( let channel = 0; channel < 3; channel ++ ) total[ channel ] = total[ channel ]! + texture.data[ pixel + channel ]! * triangle.area;
		areaTotal += triangle.area;

	}

	return total.map( ( value ) => value / areaTotal ) as [ number, number, number ];

}

function getMeshFacetLuminance( data: ReturnType<typeof generateRockData>, minimumNormalY: number, maximumNormalY: number ): number {

	const color = getMeshFacetColorMean( data, minimumNormalY, maximumNormalY );
	return color[ 0 ] * 0.2126 + color[ 1 ] * 0.7152 + color[ 2 ] * 0.0722;

}

function getTextureLuminance( data: Uint8Array, width: number, u: number, v: number ): number {

	const x = ( Math.floor( u * width ) % width + width ) % width;
	const y = Math.max( 0, Math.min( width - 1, Math.floor( v * width ) ) );
	const offset = ( y * width + x ) * 4;
	return data[ offset ]! * 0.2126 + data[ offset + 1 ]! * 0.7152 + data[ offset + 2 ]! * 0.0722;

}

function minimumVisibleTriangleAngle( mesh: MeshData ): number {

	let visibleArea = 0;
	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {
		const triangle = getTriangle( mesh, offset );
		if ( triangle.points.reduce( ( total, point ) => total + point[ 1 ], 0 ) / 3 > 0 ) visibleArea += triangle.area;
	}
	let minimum = 180;
	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {
		const triangle = getTriangle( mesh, offset );
		const centerY = triangle.points.reduce( ( total, point ) => total + point[ 1 ], 0 ) / 3;
		if ( centerY <= 0 || triangle.area <= visibleArea * 0.01 ) continue;
		for ( let corner = 0; corner < 3; corner ++ ) {
			const origin = triangle.points[ corner ]!;
			const first = triangle.points[ ( corner + 1 ) % 3 ]!;
			const second = triangle.points[ ( corner + 2 ) % 3 ]!;
			const a = [ first[ 0 ] - origin[ 0 ], first[ 1 ] - origin[ 1 ], first[ 2 ] - origin[ 2 ] ];
			const b = [ second[ 0 ] - origin[ 0 ], second[ 1 ] - origin[ 1 ], second[ 2 ] - origin[ 2 ] ];
			const angle = Math.acos( Math.max( - 1, Math.min( 1, ( a[ 0 ]! * b[ 0 ]! + a[ 1 ]! * b[ 1 ]! + a[ 2 ]! * b[ 2 ]! ) / ( Math.hypot( ...a ) * Math.hypot( ...b ) ) ) ) ) * 180 / Math.PI;
			minimum = Math.min( minimum, angle );
		}
	}
	return minimum;

}

function hasLargeConcaveSurface( seed: number ): boolean {

	const shape = createRockHullShape( seed + 62, 6.4, 1.2, 0.04 );
	if ( shape.scoops.length === 0 ) return false;
	const faces = buildConvexHullFaces( shape.points );
	const convexShape = { ...shape, scoops: [] };
	const mesh = buildRockHullMesh( shape, faces, 2, 0 );
	const center: [ number, number, number ] = [ 0, 0, 0 ];
	for ( const point of shape.points ) for ( let axis = 0; axis < 3; axis ++ ) center[ axis ] = center[ axis ]! + point[ axis ]! / shape.points.length;
	const planes = faces.map( ( face ) => {

		const first = convexShape.points[ face[ 0 ] ]!;
		const second = convexShape.points[ face[ 1 ] ]!;
		const third = convexShape.points[ face[ 2 ] ]!;
		const ab = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const normal = [ ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ];
		const length = Math.hypot( ...normal );
		for ( let axis = 0; axis < 3; axis ++ ) normal[ axis ] = normal[ axis ]! / length;
		const centerSide = ( center[ 0 ]! - first[ 0 ] ) * normal[ 0 ]! + ( center[ 1 ]! - first[ 1 ] ) * normal[ 1 ]! + ( center[ 2 ]! - first[ 2 ] ) * normal[ 2 ]!;
		if ( centerSide > 0 ) for ( let axis = 0; axis < 3; axis ++ ) normal[ axis ] = - normal[ axis ]!;
		return { normal, offset: first[ 0 ] * normal[ 0 ]! + first[ 1 ] * normal[ 1 ]! + first[ 2 ] * normal[ 2 ]! };

	} );
	let deepest = 0;

	for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

		const point = [ mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! ];
		let nearestPlane = Infinity;
		for ( const plane of planes ) nearestPlane = Math.min( nearestPlane, plane.offset - point[ 0 ]! * plane.normal[ 0 ]! - point[ 1 ]! * plane.normal[ 1 ]! - point[ 2 ]! * plane.normal[ 2 ]! );
		deepest = Math.max( deepest, nearestPlane );

	}

	return deepest >= shape.size * 0.12;

}

describe( 'irregular polyhedron rocks', () => {

	it( 'uses low-poly ovoid hulls with twelve to twenty visible facets', () => {

		let ovoidSeeds = 0;

		for ( let seed = 1; seed <= 8; seed ++ ) {

			const size = seed % 2 === 0 ? 12.3 : 6.4;
			const shape = createRockHullShape( seed + 62, size, 1.2, 0.04 );
			const minimum = [ Infinity, Infinity, Infinity ];
			const maximum = [ - Infinity, - Infinity, - Infinity ];

			for ( const point of shape.points ) for ( let axis = 0; axis < 3; axis ++ ) {

				minimum[ axis ] = Math.min( minimum[ axis ]!, point[ axis ]! );
				maximum[ axis ] = Math.max( maximum[ axis ]!, point[ axis ]! );

			}

			const width = Math.max( maximum[ 0 ]! - minimum[ 0 ]!, maximum[ 2 ]! - minimum[ 2 ]! );
			const height = maximum[ 1 ]! - minimum[ 1 ]!;
			const aspect = height / width;
			if ( aspect >= 0.8 && aspect <= 1.3 ) ovoidSeeds ++;

			expect( shape.points.length, `seed ${ seed } hull points` ).toBeGreaterThanOrEqual( 30 );
			expect( shape.points.length, `seed ${ seed } hull points` ).toBeLessThanOrEqual( 46 );
			expect( maximum[ 0 ]! - minimum[ 0 ]!, `seed ${ seed } requested width` ).toBeLessThanOrEqual( size + 1e-4 );
			expect( maximum[ 2 ]! - minimum[ 2 ]!, `seed ${ seed } requested depth` ).toBeLessThanOrEqual( size + 1e-4 );
			expect( height, `seed ${ seed } requested height` ).toBeLessThanOrEqual( size * 1.3 + 1e-4 );
			expect( getVisiblePlaneRegions( seed ).length, `seed ${ seed } visible facets from ${ shape.points.length } points` ).toBeGreaterThanOrEqual( 12 );
			expect( getVisiblePlaneRegions( seed ).length, `seed ${ seed } visible facets` ).toBeLessThanOrEqual( 20 );
			expect( Math.max( ...getVisiblePlaneRegions( seed ).map( ( region ) => region.area ) ), `seed ${ seed } largest visible facet` ).toBeLessThanOrEqual( 0.18 );

		}

		expect( ovoidSeeds ).toBeGreaterThanOrEqual( 6 );

	} );

	it( 'matches the measured Rock01 above-ground bounds at default size', () => {

		withSharedRockTextures( () => {

			for ( let seed = 1; seed <= 8; seed ++ ) {

				const bounds = getAboveGroundBounds( generateRockData( { seed } ).lods[ 0 ]! );
				const horizontal = Math.max( bounds.width, bounds.depth );

				expect( horizontal, `seed ${ seed } above-ground width` ).toBeLessThanOrEqual( 6.4 * 1.01 );

				if ( seed === 1 ) {

					// Rock01_LOD0.glbはY=1.5で配置される。地面で切ると6.18 × 4.12 × 6.38になる。
					expect( horizontal ).toBeGreaterThanOrEqual( 6.382 * 0.91 );
					expect( bounds.height ).toBeGreaterThanOrEqual( 4.119 * 0.9 );
					expect( bounds.height ).toBeLessThanOrEqual( 4.119 * 1.1 );

				}

			}

		} );

	} );

	it( 'uses a light cool stone albedo with similar values across facet orientations', () => {

		withSharedRockTextures( () => {

			const texture = generateRockData( { seed: 1 } ).textures.albedo!;
			const mean = [ 0, 0, 0 ];

			for ( let offset = 0; offset < texture.data.length; offset += 4 ) {

				for ( let channel = 0; channel < 3; channel ++ ) mean[ channel ]! += texture.data[ offset + channel ]! / ( texture.data.length / 4 );

			}

			expect( mean[ 0 ]! ).toBeGreaterThanOrEqual( 150 );
			expect( mean[ 0 ]! ).toBeLessThanOrEqual( 165 );
			expect( mean[ 1 ]! ).toBeGreaterThanOrEqual( 160 );
			expect( mean[ 1 ]! ).toBeLessThanOrEqual( 175 );
			expect( mean[ 2 ]! ).toBeGreaterThanOrEqual( 172 );
			expect( mean[ 2 ]! ).toBeLessThanOrEqual( 187 );

		} );

	} );

	it( 'does not bake lighting or curvature darkening into facet albedo', () => {

		withSharedRockTextures( () => {
			const data = generateRockData( { seed: 1 } );
			const top = getMeshFacetLuminance( data, 0.65, 0.98 );
			const side = getMeshFacetLuminance( data, 0.2, 0.55 );
			const downward = getMeshFacetLuminance( data, - 0.95, - 0.4 );
			const downwardColor = getMeshFacetColorMean( data, - 0.95, - 0.4 );

			expect( Math.abs( top - side ), 'top-to-side albedo difference' ).toBeLessThan( 20 );
			expect( Math.abs( side - downward ), 'side-to-downward albedo difference' ).toBeLessThan( 20 );
			expect( Math.abs( downwardColor[ 2 ]! - downwardColor[ 0 ]! ), 'subtle hue range in shadow-facing facets' ).toBeLessThan( 35 );
		} );

	} );

	it( 'samples each hollow as a smooth bowl with a feathered rim', () => {

		const influence = [ 0, 0.25, 0.5, 0.75, 1 ].map( ( amount ) => getRockScoopInfluence( amount, 1 ) );

		expect( influence[ 0 ] ).toBe( 1 );
		expect( influence[ 1 ] ).toBeCloseTo( 0.84375, 5 );
		expect( influence[ 2 ] ).toBeCloseTo( 0.5, 5 );
		expect( influence[ 3 ] ).toBeCloseTo( 0.15625, 5 );
		expect( influence[ 4 ] ).toBe( 0 );
		expect( Math.abs( getRockScoopInfluence( 0.01, 1 ) - 1 ) ).toBeLessThan( 0.001 );
		expect( getRockScoopInfluence( 0.99, 1 ) ).toBeLessThan( 0.001 );

		const shape = createRockHullShape( 65, 6.4, 1.2, 0.04 );
		const faces = buildConvexHullFaces( shape.points );
		const mesh = buildRockHullMesh( shape, faces, 3, 0 );
		recomputeCreasedNormals( mesh, 35, ( position ) => ! isRockScoopInterior( position, shape ) );
		const normalsByPosition = new Map<string, { count: number; normals: Set<string> }>();

		for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

			const offset = vertex * 3;
			const position = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ] as [ number, number, number ];
			if ( ! isRockScoopInterior( position, shape ) ) continue;
			const key = position.map( ( value ) => value.toFixed( 6 ) ).join( ',' );
			const group = normalsByPosition.get( key ) ?? { count: 0, normals: new Set<string>() };
			group.count ++;
			group.normals.add( [ mesh.normals[ offset ]!, mesh.normals[ offset + 1 ]!, mesh.normals[ offset + 2 ]! ].map( ( value ) => value.toFixed( 4 ) ).join( ',' ) );
			normalsByPosition.set( key, group );

		}

		const repeatedInterior = Array.from( normalsByPosition.values() ).filter( ( group ) => group.count > 1 );
		expect( repeatedInterior.length ).toBeGreaterThan( 0 );
		expect( repeatedInterior.every( ( group ) => group.normals.size === 1 ) ).toBe( true );

	} );

	it( 'keeps the visible hull manifold with opposite edge winding', () => {

		withSharedRockTextures( () => {

			for ( let seed = 1; seed <= 8; seed ++ ) {

				const errors = getSurfaceEdgeErrors( generateRockData( { seed } ).lods[ 0 ]! );
				expect( errors, `seed ${ seed } edge topology: ${ errors.slice( 0, 3 ).join( '; ' ) }` ).toEqual( [] );

			}

		} );

	}, 60000 );

	it( 'has large irregular planar facets without spikes, box alignment, or vertex overrun', () => {

		withSharedRockTextures( () => {

			for ( let seed = 1; seed <= 8; seed ++ ) {

				const mesh = generateRockData( { seed } ).lods[ 0 ]!;
				const regions = getVisiblePlaneRegions( seed );
				const minimum = [ Infinity, Infinity, Infinity ];
				const maximum = [ - Infinity, - Infinity, - Infinity ];
				for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) for ( let axis = 0; axis < 3; axis ++ ) {
					minimum[ axis ] = Math.min( minimum[ axis ]!, mesh.positions[ vertex * 3 + axis ]! );
					maximum[ axis ] = Math.max( maximum[ axis ]!, mesh.positions[ vertex * 3 + axis ]! );
				}
				const horizontalSpan = Math.max( maximum[ 0 ]! - minimum[ 0 ]!, maximum[ 2 ]! - minimum[ 2 ]! );

				const axis = [ [ 1, 0, 0 ], [ - 1, 0, 0 ], [ 0, 0, 1 ], [ 0, 0, - 1 ], [ 0, 1, 0 ] ];
				const aligned = axis.filter( ( direction ) => regions.some( ( region ) => region.normal.reduce( ( dot, value, index ) => dot + value * direction[ index ]!, 0 ) > Math.cos( 10 * Math.PI / 180 ) ) );

				expect( regions.length, `seed ${ seed } planar regions` ).toBeGreaterThanOrEqual( 12 );
				expect( regions.length, `seed ${ seed } planar regions` ).toBeLessThanOrEqual( 20 );
				expect( aligned.length, `seed ${ seed } box aligned facets` ).toBeLessThan( 3 );
				expect( vertexCount( mesh ), `seed ${ seed } LOD0 vertex cap` ).toBeLessThanOrEqual( 260 );
				expect( minimumRockApexAngle( mesh ), `seed ${ seed } apex angle` ).toBeGreaterThanOrEqual( 125 );
				expect( maximum[ 1 ]!, `seed ${ seed } emergent height` ).toBeLessThanOrEqual( horizontalSpan * 1.3 );
				expect( minimumVisibleTriangleAngle( mesh ), `seed ${ seed } visible triangle angle` ).toBeGreaterThanOrEqual( 8 );

			}

		} );

	}, 60000 );

	it( 'builds a dedicated chamfer face along each LOD0 hull ridge', () => {

		const sourceShape = createRockHullShape( 63, 6.4, 1.2, 0.04 );
		const shape = { ...sourceShape, scoops: [] };
		const faces = buildConvexHullFaces( shape.points );
		const mesh = buildRockHullMesh( shape, faces, 3, shape.size * 0.04, 0, false );
		const chamfers = countChamferTrianglesForHullEdges( mesh, shape, faces );
		const lowerLod = buildRockHullMesh( shape, faces, 2, 0, 0, false );
		const lowerLodChamfers = countChamferTrianglesForHullEdges( lowerLod, shape, faces );

		expect( chamfers.edges ).toBeGreaterThanOrEqual( 30 );
		expect( chamfers.strips ).toBeGreaterThanOrEqual( chamfers.edges * 1.5 );
		expect( lowerLodChamfers.strips ).toBe( 0 );

	} );

	it( 'paints a broad soft catch-light on only a few major chamfer ridges', () => {

		const sourceShape = createRockHullShape( 63, 6.4, 1.2, 0.04 );
		const shape = { ...sourceShape, scoops: [] };
		const faces = buildConvexHullFaces( shape.points );
		const chamfered = buildRockHullMeshWithChamfers( shape, faces, shape.size * 0.04, 0, false );
		const texture = createRockTextures( 113, 512, 113, chamfered.mesh, 'ridge-profile-green', undefined, chamfered.ridgeUvSegments ).albedo;
		const segment = chamfered.ridgeUvSegments.reduce( ( longest, candidate ) => {
			const deltaU = Math.abs( candidate[ 1 ][ 0 ] - candidate[ 0 ][ 0 ] );
			const wrappedDeltaU = deltaU > 0.5 ? 1 - deltaU : deltaU;
			const deltaV = candidate[ 1 ][ 1 ] - candidate[ 0 ][ 1 ];
			return Math.hypot( wrappedDeltaU, deltaV ) > Math.hypot( Math.abs( longest[ 1 ][ 0 ] - longest[ 0 ][ 0 ] ), longest[ 1 ][ 1 ] - longest[ 0 ][ 1 ] ) ? candidate : longest;
		}, chamfered.ridgeUvSegments[ 0 ]! );
		let firstU = segment[ 0 ][ 0 ];
		let secondU = segment[ 1 ][ 0 ];
		if ( secondU - firstU > 0.5 ) firstU += 1;
		if ( firstU - secondU > 0.5 ) secondU += 1;
		const middleU = ( firstU + secondU ) * 0.5;
		const middleV = ( segment[ 0 ][ 1 ] + segment[ 1 ][ 1 ] ) * 0.5;
		const latitude = ( middleV - 0.5 ) * Math.PI;
		const scaleU = Math.PI * shape.size * Math.max( Math.cos( latitude ), 0.04 );
		const scaleV = Math.PI * shape.size * 0.5;
		const lineX = ( secondU - firstU ) * scaleU;
		const lineY = ( segment[ 1 ][ 1 ] - segment[ 0 ][ 1 ] ) * scaleV;
		const lineLength = Math.hypot( lineX, lineY );
		const outsideDistance = shape.size * 0.055;
		const insideDistance = shape.size * 0.01;
		const outsideU = - lineY / lineLength * outsideDistance / scaleU;
		const outsideV = lineX / lineLength * outsideDistance / scaleV;
		const insideU = - lineY / lineLength * insideDistance / scaleU;
		const insideV = lineX / lineLength * insideDistance / scaleV;
		const center = getTextureLuminance( texture.data, texture.width, middleU, middleV );
		const outside = ( getTextureLuminance( texture.data, texture.width, middleU + outsideU, middleV + outsideV ) + getTextureLuminance( texture.data, texture.width, middleU - outsideU, middleV - outsideV ) ) * 0.5;
		const inside = ( getTextureLuminance( texture.data, texture.width, middleU + insideU, middleV + insideV ) + getTextureLuminance( texture.data, texture.width, middleU - insideU, middleV - insideV ) ) * 0.5;

		expect( chamfered.ridgeUvSegments.length ).toBeGreaterThanOrEqual( 4 );
		expect( chamfered.ridgeUvSegments.length ).toBeLessThanOrEqual( 10 );
		expect( center - outside ).toBeGreaterThan( 10 );
		expect( inside - outside ).toBeGreaterThan( 5 );
		expect( Math.abs( center - inside ) ).toBeLessThan( 12 );

	} );

	it( 'uses two to four long recessed crack paths instead of scattered scratches', () => {

		const paths = createRockCrackPaths( 9, Math.PI / 4, () => 1 );
		const mainPaths = paths.filter( ( path ) => ! path.branch );
		const branches = paths.filter( ( path ) => path.branch );
		const lengths = mainPaths.map( ( path ) => path.points.slice( 1 ).reduce( ( length, point, index ) => {

			const previous = path.points[ index ]!;
			return length + Math.hypot( point.u - previous.u, point.v - previous.v );

		}, 0 ) );

		expect( mainPaths.length ).toBeGreaterThanOrEqual( 2 );
		expect( mainPaths.length ).toBeLessThanOrEqual( 4 );
		expect( branches ).toHaveLength( 0 );
		expect( lengths.every( ( length ) => length >= 0.15 && length <= 0.32 ) ).toBe( true );
		expect( createRockCrackPaths( 9, Math.PI / 4, () => 1 ) ).toEqual( paths );

	} );

	it( 'adds large concave scoops on about one third of seeds', () => {

		withSharedRockTextures( () => {

			let scooped = 0;
			for ( let seed = 1; seed <= 60; seed ++ ) if ( hasLargeConcaveSurface( seed ) ) scooped ++;

			expect( scooped ).toBeGreaterThanOrEqual( 18 );
			expect( scooped ).toBeLessThanOrEqual( 24 );

		} );

	}, 120000 );

	it( 'is deterministic and preserves facet relief over the required seed set', () => {

		withSharedRockTextures( () => {

			const first = generateRockData( { seed: 341810 } );
			const repeated = generateRockData( { seed: 341810 } );
			expect( first.lods[ 0 ]!.positions ).toEqual( repeated.lods[ 0 ]!.positions );

			for ( const seed of [ 1, 2, 3, 50, 100, 200, 300, 341810 ] ) {

				const data = generateRockData( { seed } );
				expect( Math.min( ...Array.from( data.lods[ 0 ]!.positions ).filter( ( _, index ) => index % 3 === 1 ) ), `seed ${ seed } underground skirt` ).toBeLessThanOrEqual( 0 );
				expect( vertexCount( data.lods[ 0 ]! ), `seed ${ seed } vertex cap` ).toBeLessThanOrEqual( 260 );
				expect( data.collider!.indices.length / 3, `seed ${ seed } collider cap` ).toBeLessThanOrEqual( 96 );

			}

		} );

	} );

} );
