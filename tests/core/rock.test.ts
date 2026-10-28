import { describe, expect, it } from 'vitest';
import { bakeImpostor, generateRockData, hexToLinear } from '../../src/core';
import type { MeshData } from '../../src/core';
import { createRockCrackPaths, createRockTextures, findRockFrontUv } from '../../src/core/rockTexture';
import { sampleOutlineRadius } from '../helpers/meshOutline';
import { withSharedRockTextures } from '../helpers/sharedRockTextures';
import { validateMeshData } from '../helpers/validateMeshData';
import { topCardCoverageIou } from '../helpers/topCardCoverage';
import { hasRockSelfIntersection, minimumRockApexAngle, minimumRockDihedralAngle, minimumRockTriangleAngle } from '../helpers/rockSharpness';
import { buildConvexHullFaces, buildRockHullMesh, buildRockHullMeshWithChamfers, buildRockShell, clamp, createRockFacetNormals, createRockHullShape, createRockRadiusFunction, isRockScoopInterior, recomputeCreasedNormals } from '../../src/core/rockGeometry';
import type { RockUvFrame } from '../../src/core/rockGeometry';

function triangleCount( mesh: MeshData ): number {

	return mesh.indices.length / 3;

}

function vertexCount( mesh: MeshData ): number {

	return mesh.positions.length / 3;

}

function wrappedUnit( value: number ): number {

	return ( ( value % 1 ) + 1 ) % 1;

}

function expectedRockUv( position: [ number, number, number ], frame: RockUvFrame ): [ number, number ] {


	const direction = [ position[ 0 ] - frame.center[ 0 ], position[ 1 ] - frame.center[ 1 ], position[ 2 ] - frame.center[ 2 ] ];
	const length = Math.hypot( direction[ 0 ]!, direction[ 1 ]!, direction[ 2 ]! ) || 1;
	const normal = direction.map( ( value ) => value / length );
	return [
		wrappedUnit( Math.atan2( normal[ 2 ]!, normal[ 0 ]! ) / ( Math.PI * 2 ) + 0.5 + frame.uvOffset ),
		Math.asin( clamp( normal[ 1 ]!, - 1, 1 ) ) / Math.PI + 0.5,
	];

}

function getLod0RockUvFrame( seed: number ): RockUvFrame {


	const shape = createRockHullShape( seed + 62, 6.4, 1.2, 0.04 );
	const faces = buildConvexHullFaces( shape.points );
	const chamferedWithoutSeams = buildRockHullMeshWithChamfers( shape, faces, 6.4 * 0.04, 0.25, false ).mesh;
	const chamferedWithSeams = buildRockHullMeshWithChamfers( shape, faces, 6.4 * 0.04, 0.25, true ).mesh;
	const center: [ number, number, number ] = [ 0, 0, 0 ];

	for ( let offset = 0; offset < chamferedWithoutSeams.positions.length; offset += 3 ) {

		center[ 0 ] += chamferedWithoutSeams.positions[ offset ]! / ( chamferedWithoutSeams.positions.length / 3 );
		center[ 1 ] += chamferedWithoutSeams.positions[ offset + 1 ]! / ( chamferedWithoutSeams.positions.length / 3 );
		center[ 2 ] += chamferedWithoutSeams.positions[ offset + 2 ]! / ( chamferedWithoutSeams.positions.length / 3 );
	}

	return { center, uvOffset: wrappedUnit( chamferedWithSeams.uvs[ 0 ]! - chamferedWithoutSeams.uvs[ 0 ]! ) };

}

function checkChamferedLod0Normals( mesh: MeshData, shape: ReturnType<typeof createRockHullShape>, faces: [ number, number, number ][], seed: number ): { facetInteriorTriangles: number; scoopTriangles: number } {

	const hullCenter: [ number, number, number ] = [ 0, 0, 0 ];
	for ( const point of shape.points ) for ( let axis = 0; axis < 3; axis ++ ) hullCenter[ axis ] = hullCenter[ axis ]! + point[ axis ]! / shape.points.length;
	const planes = faces.map( ( face ) => {
		const first = shape.points[ face[ 0 ] ]!;
		const second = shape.points[ face[ 1 ] ]!;
		const third = shape.points[ face[ 2 ] ]!;
		const ab = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const normal = [ ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ];
		const length = Math.hypot( normal[ 0 ]!, normal[ 1 ]!, normal[ 2 ]! );
		for ( let axis = 0; axis < 3; axis ++ ) normal[ axis ] = normal[ axis ]! / length;
		const center = [ ( first[ 0 ] + second[ 0 ] + third[ 0 ] ) / 3, ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3, ( first[ 2 ] + second[ 2 ] + third[ 2 ] ) / 3 ];
		if ( normal[ 0 ]! * ( center[ 0 ]! - hullCenter[ 0 ]! ) + normal[ 1 ]! * ( center[ 1 ]! - hullCenter[ 1 ]! ) + normal[ 2 ]! * ( center[ 2 ]! - hullCenter[ 2 ]! ) < 0 ) for ( let axis = 0; axis < 3; axis ++ ) normal[ axis ] = - normal[ axis ]!;
		return { origin: first, normal };
	} );
	let facetInteriorTriangles = 0;
	let scoopTriangles = 0;

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {
		const vertices = [ mesh.indices[ offset ]!, mesh.indices[ offset + 1 ]!, mesh.indices[ offset + 2 ]! ];
		const points = vertices.map( ( vertex ) => [ mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! ] );
		const ab = points[ 1 ]!.map( ( value, axis ) => value - points[ 0 ]![ axis ]! );
		const ac = points[ 2 ]!.map( ( value, axis ) => value - points[ 0 ]![ axis ]! );
		const normal = [ ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ];
		const length = Math.hypot( normal[ 0 ]!, normal[ 1 ]!, normal[ 2 ]! );
		for ( let axis = 0; axis < 3; axis ++ ) normal[ axis ] = normal[ axis ]! / length;
		const vertexNormals = vertices.map( ( vertex ) => [ mesh.normals[ vertex * 3 ]!, mesh.normals[ vertex * 3 + 1 ]!, mesh.normals[ vertex * 3 + 2 ]! ] );
		const onFacetPlane = planes.some( ( plane ) => points.every( ( point ) => Math.abs( ( point[ 0 ]! - plane.origin[ 0 ]! ) * plane.normal[ 0 ]! + ( point[ 1 ]! - plane.origin[ 1 ]! ) * plane.normal[ 1 ]! + ( point[ 2 ]! - plane.origin[ 2 ]! ) * plane.normal[ 2 ]! ) < 1e-4 ) );
		const hasScoopedNormal = vertexNormals.some( ( vertexNormal ) => ! planes.some( ( plane ) => vertexNormal[ 0 ]! * plane.normal[ 0 ]! + vertexNormal[ 1 ]! * plane.normal[ 1 ]! + vertexNormal[ 2 ]! * plane.normal[ 2 ]! > Math.cos( 2 * Math.PI / 180 ) ) );
		if ( onFacetPlane && ! hasScoopedNormal ) {
			facetInteriorTriangles ++;
			for ( const vertexNormal of vertexNormals ) {
				const dot = clamp( vertexNormal[ 0 ]! * normal[ 0 ]! + vertexNormal[ 1 ]! * normal[ 1 ]! + vertexNormal[ 2 ]! * normal[ 2 ]!, - 1, 1 );
				expect( dot, `seed ${ seed } triangle ${ offset / 3 } facet normal winding` ).toBeGreaterThan( 0 );
				expect( Math.acos( dot ) * 180 / Math.PI, `seed ${ seed } triangle ${ offset / 3 } facet normal angle` ).toBeLessThanOrEqual( 2 );
			}
		} else {
			const center = [ 0, 1, 2 ].map( ( axis ) => ( points[ 0 ]![ axis ]! + points[ 1 ]![ axis ]! + points[ 2 ]![ axis ]! ) / 3 ) as [ number, number, number ];
			if ( hasScoopedNormal && isRockScoopInterior( center, shape ) ) {
				scoopTriangles ++;
			}
		}
	}

	expect( facetInteriorTriangles, `seed ${ seed } facet-interior triangle coverage` ).toBeGreaterThan( 0 );
	return { facetInteriorTriangles, scoopTriangles };

}

function meshColorSpread( mesh: MeshData ): number {

	let minimum = Infinity;
	let maximum = - Infinity;

	for ( const color of mesh.colors ) {

		minimum = Math.min( minimum, color );
		maximum = Math.max( maximum, color );

	}

	return maximum - minimum;

}

function getAboveGroundDimensions( mesh: MeshData ): { width: number; height: number; depth: number; minimumY: number } {

	const points: [ number, number, number ][] = [];
	const addPoint = ( index: number ): void => {

		const offset = index * 3;
		points.push( [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ] );

	};

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const triangle = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = triangle[ edge ]!;
			const second = triangle[ ( edge + 1 ) % 3 ]!;
			const firstOffset = first * 3;
			const secondOffset = second * 3;
			const firstY = mesh.positions[ firstOffset + 1 ]!;
			const secondY = mesh.positions[ secondOffset + 1 ]!;

			if ( firstY >= 0 ) addPoint( first );

			if ( ( firstY < 0 && secondY > 0 ) || ( firstY > 0 && secondY < 0 ) ) {

				const amount = - firstY / ( secondY - firstY );
				points.push( [
					mesh.positions[ firstOffset ]! + ( mesh.positions[ secondOffset ]! - mesh.positions[ firstOffset ]! ) * amount,
					0,
					mesh.positions[ firstOffset + 2 ]! + ( mesh.positions[ secondOffset + 2 ]! - mesh.positions[ firstOffset + 2 ]! ) * amount,
				] );

			}

		}

	}

	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];

	for ( const point of points ) {

		for ( let axis = 0; axis < 3; axis ++ ) {

			minimum[ axis ] = Math.min( minimum[ axis ]!, point[ axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, point[ axis ]! );

		}

	}

	return {
		width: maximum[ 0 ]! - minimum[ 0 ]!,
		height: maximum[ 1 ]!,
		depth: maximum[ 2 ]! - minimum[ 2 ]!,
		minimumY: minimum[ 1 ]!,
	};

}

function getShapeMetrics( mesh: MeshData ): { ratio: number; roundness: number } {

	const dimensions = getAboveGroundDimensions( mesh );
	const ratio = dimensions.height / Math.max( dimensions.width, dimensions.depth );
	const roundness = Math.min( dimensions.width, dimensions.depth ) / Math.max( dimensions.width, dimensions.depth );

	return {
		ratio,
		roundness,
	};

}

function getRockReliefMetric( mesh: MeshData ): number {

	const groups = new Map<string, number>();
	const positions: [ number, number, number ][] = [];
	const vertices = new Array<number>( mesh.positions.length / 3 );

	for ( let vertex = 0; vertex < vertices.length; vertex ++ ) {
		const point: [ number, number, number ] = [ mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! ];
		const key = point.map( ( value ) => value.toFixed( 6 ) ).join( ',' );
		let group = groups.get( key );
		if ( group === undefined ) {
			group = positions.length;
			groups.set( key, group );
			positions.push( point );
		}
		vertices[ vertex ] = group;
	}

	const neighbors = positions.map( () => new Set<number>() );
	for ( let index = 0; index < mesh.indices.length; index += 3 ) {
		const triangle = [ vertices[ mesh.indices[ index ]! ]!, vertices[ mesh.indices[ index + 1 ]! ]!, vertices[ mesh.indices[ index + 2 ]! ]! ];
		for ( let edge = 0; edge < 3; edge ++ ) {
			const first = triangle[ edge ]!;
			const second = triangle[ ( edge + 1 ) % 3 ]!;
			neighbors[ first ]!.add( second );
			neighbors[ second ]!.add( first );
		}
	}

	const minimum = [ Infinity, Infinity, Infinity ];
	const maximum = [ - Infinity, - Infinity, - Infinity ];
	for ( const point of positions ) {
		for ( let axis = 0; axis < 3; axis ++ ) {
			minimum[ axis ] = Math.min( minimum[ axis ]!, point[ axis ]! );
			maximum[ axis ] = Math.max( maximum[ axis ]!, point[ axis ]! );
		}
	}
		const extent = Math.max( ...minimum.map( ( value, axis ) => maximum[ axis ]! - value ) );
		const center = minimum.map( ( value, axis ) => ( maximum[ axis ]! + value ) * 0.5 );
	let relief = 0;
	let count = 0;

	for ( let vertex = 0; vertex < positions.length; vertex ++ ) {
		const adjacent = neighbors[ vertex ]!;
		if ( adjacent.size === 0 ) continue;
		const average: [ number, number, number ] = [ 0, 0, 0 ];
		for ( const neighbor of adjacent ) {
			for ( let axis = 0; axis < 3; axis ++ ) average[ axis ]! += positions[ neighbor ]![ axis ]! / adjacent.size;
		}
		const point = positions[ vertex ]!;
		const radial: [ number, number, number ] = [ point[ 0 ] - center[ 0 ]!, point[ 1 ] - center[ 1 ]!, point[ 2 ] - center[ 2 ]! ];
		const radialLength = Math.hypot( ...radial ) || 1;
		const normalDeviation = ( ( point[ 0 ] - average[ 0 ] ) * radial[ 0 ] + ( point[ 1 ] - average[ 1 ] ) * radial[ 1 ] + ( point[ 2 ] - average[ 2 ] ) * radial[ 2 ] ) / radialLength;
		relief += Math.abs( normalDeviation );
		count ++;
	}

	return relief / count / extent;

}

function meanRgb( data: Uint8Array ): [ number, number, number ] {

	const mean: [ number, number, number ] = [ 0, 0, 0 ];
	const pixelCount = data.length / 4;

	for ( let offset = 0; offset < data.length; offset += 4 ) {

		mean[ 0 ] += data[ offset ]!;
		mean[ 1 ] += data[ offset + 1 ]!;
		mean[ 2 ] += data[ offset + 2 ]!;

	}

	return mean.map( ( value ) => value / pixelCount ) as [ number, number, number ];

}

function meanOpaqueRgb( data: Uint8Array ): [ number, number, number ] {

	const mean: [ number, number, number ] = [ 0, 0, 0 ];
	let pixels = 0;

	for ( let offset = 0; offset < data.length; offset += 4 ) {

		if ( data[ offset + 3 ] === 0 ) continue;

		mean[ 0 ] += data[ offset ]!;
		mean[ 1 ] += data[ offset + 1 ]!;
		mean[ 2 ] += data[ offset + 2 ]!;
		pixels ++;

	}

	return mean.map( ( value ) => value / pixels ) as [ number, number, number ];

}

function meanOpaquePixelDifference( first: Uint8Array, second: Uint8Array ): number {

	let difference = 0;
	let pixels = 0;

	for ( let offset = 0; offset < first.length; offset += 4 ) {
		if ( first[ offset + 3 ] === 0 || second[ offset + 3 ] === 0 ) continue;
		difference += Math.abs( first[ offset ]! - second[ offset ]! ) + Math.abs( first[ offset + 1 ]! - second[ offset + 1 ]! ) + Math.abs( first[ offset + 2 ]! - second[ offset + 2 ]! );
		pixels ++;
	}

	return pixels > 0 ? difference / pixels / 3 : 0;

}

function hashBytes( data: Uint8Array ): number {

	let hash = 2166136261;
	for ( let index = 0; index < data.length; index ++ ) hash = Math.imul( hash ^ data[ index ]!, 16777619 );
	return hash >>> 0;

}

function percentile( data: Uint8Array, channel: number, amount: number ): number {

	const values: number[] = [];

	for ( let offset = channel; offset < data.length; offset += 4 ) {

		values.push( data[ offset ]! );

	}

	values.sort( ( a, b ) => a - b );

	return values[ Math.floor( ( values.length - 1 ) * amount ) ]!;

}

function meanNeighborDelta( data: Uint8Array, width: number, height: number, step = 1 ): number {

	let delta = 0;
	let samples = 0;

	for ( let y = 0; y < height; y += step ) {

		for ( let x = 0; x < width; x += step ) {

			const index = ( y * width + x ) * 4;
			const right = ( y * width + ( x + step ) % width ) * 4;
			const down = Math.min( y + step, height - 1 ) * width * 4 + x * 4;

			for ( let channel = 0; channel < 3; channel ++ ) {

				delta += Math.abs( data[ index + channel ]! - data[ right + channel ]! );
				delta += Math.abs( data[ index + channel ]! - data[ down + channel ]! );
				samples += 2;

			}

		}

	}

	return delta / samples;

}

function tileTextureContrasts( data: Uint8Array, width: number, tileSize: number ): number[] {

	const tileCount = width / tileSize;
	const totals = new Float64Array( tileCount * tileCount );
	const counts = new Uint32Array( tileCount * tileCount );
	const luminanceAt = ( x: number, y: number ): number => {

		const offset = ( y * width + x ) * 4;
		return ( data[ offset ]! + data[ offset + 1 ]! + data[ offset + 2 ]! ) / 3;

	};

	for ( let y = 0; y < width; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			const tileX = Math.floor( x / tileSize );
			const tileY = Math.floor( y / tileSize );
			const tile = tileY * tileCount + tileX;
			const current = luminanceAt( x, y );

			if ( x + 1 < ( tileX + 1 ) * tileSize ) {
				totals[ tile ]! += Math.abs( current - luminanceAt( x + 1, y ) );
				counts[ tile ]! ++;
			}

			if ( y + 1 < ( tileY + 1 ) * tileSize ) {
				totals[ tile ]! += Math.abs( current - luminanceAt( x, y + 1 ) );
				counts[ tile ]! ++;
			}

		}

	}

	return Array.from( totals, ( total, index ) => total / counts[ index ]! );

}

function rowStripeAmplitude( data: Uint8Array, width: number, height: number, cycles: number ): number {

	const rows = new Float64Array( height );
	let overall = 0;

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < width; x ++ ) {

			const offset = ( y * width + x ) * 4;
			const luminance = ( data[ offset ]! + data[ offset + 1 ]! + data[ offset + 2 ]! ) / 3;
			rows[ y ] = rows[ y ]! + luminance / width;
			overall += luminance / ( width * height );

		}

	}

	let cosine = 0;
	let sine = 0;

	for ( let y = 0; y < rows.length; y ++ ) {

		const angle = y / height * Math.PI * 2 * cycles;
		cosine += ( rows[ y ]! - overall ) * Math.cos( angle );
		sine += ( rows[ y ]! - overall ) * Math.sin( angle );

	}

	return Math.hypot( cosine, sine ) * 2 / height;

}

function darkPixelComponents( data: Uint8Array, width: number, threshold: number ): { coverage: number; count: number; largest: number; span: number } {

	const pixelCount = width * width;
	const visited = new Uint8Array( pixelCount );
	const queue = new Int32Array( pixelCount );
	let darkPixels = 0;
	let count = 0;
	let largest = 0;
	let span = 0;

	for ( let index = 0; index < pixelCount; index ++ ) {

		const offset = index * 4;
		const luminance = ( data[ offset ]! + data[ offset + 1 ]! + data[ offset + 2 ]! ) / 3;

		if ( luminance < threshold ) darkPixels ++;

	}

	for ( let start = 0; start < pixelCount; start ++ ) {

		const startOffset = start * 4;
		const startLuminance = ( data[ startOffset ]! + data[ startOffset + 1 ]! + data[ startOffset + 2 ]! ) / 3;

		if ( visited[ start ] || startLuminance >= threshold ) continue;

		let readIndex = 0;
		let writeIndex = 0;
		let minimumX = width;
		let maximumX = 0;
		let minimumY = width;
		let maximumY = 0;
		queue[ writeIndex ++ ] = start;
		visited[ start ] = 1;

		while ( readIndex < writeIndex ) {

			const index = queue[ readIndex ++ ]!;
			const x = index % width;
			const y = Math.floor( index / width );
			minimumX = Math.min( minimumX, x );
			maximumX = Math.max( maximumX, x );
			minimumY = Math.min( minimumY, y );
			maximumY = Math.max( maximumY, y );
			const neighbors = [
				y > 0 ? index - width : - 1,
				y + 1 < width ? index + width : - 1,
				x > 0 ? index - 1 : - 1,
				x + 1 < width ? index + 1 : - 1,
				y > 0 && x > 0 ? index - width - 1 : - 1,
				y > 0 && x + 1 < width ? index - width + 1 : - 1,
				y + 1 < width && x > 0 ? index + width - 1 : - 1,
				y + 1 < width && x + 1 < width ? index + width + 1 : - 1,
			];

			for ( const neighbor of neighbors ) {

				if ( neighbor < 0 || visited[ neighbor ] ) continue;

				const offset = neighbor * 4;
				const luminance = ( data[ offset ]! + data[ offset + 1 ]! + data[ offset + 2 ]! ) / 3;

				if ( luminance < threshold ) {

					visited[ neighbor ] = 1;
					queue[ writeIndex ++ ] = neighbor;

				}

			}

		}

		largest = Math.max( largest, writeIndex );
		span = Math.max( span, Math.hypot( maximumX - minimumX + 1, maximumY - minimumY + 1 ) / width );
		if ( writeIndex >= 20 * pixelCount / ( 256 * 256 ) ) count ++;

	}

	return { coverage: darkPixels / pixelCount, count, largest: largest / pixelCount, span };

}

function getPlanarFacetCoverage( mesh: MeshData ): { visibleFacets: number; topPlateau: number; largestTopFacet: number } {

	type Triangle = { normal: [ number, number, number ]; offset: number; area: number };
	type Region = { normal: [ number, number, number ]; offset: number; area: number };
	const triangles: Triangle[] = [];
	let visibleArea = 0;

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const vertices = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];
		const points = vertices.map( ( vertex ) => [ mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! ] as [ number, number, number ] );
		const visiblePoints: [ number, number, number ][] = [];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = points[ edge ]!;
			const second = points[ ( edge + 1 ) % 3 ]!;
			if ( first[ 1 ] >= 0 ) visiblePoints.push( first );

			if ( ( first[ 1 ] < 0 && second[ 1 ] > 0 ) || ( first[ 1 ] > 0 && second[ 1 ] < 0 ) ) {

				const amount = - first[ 1 ] / ( second[ 1 ] - first[ 1 ] );
				visiblePoints.push( [ first[ 0 ] + ( second[ 0 ] - first[ 0 ] ) * amount, 0, first[ 2 ] + ( second[ 2 ] - first[ 2 ] ) * amount ] );

			}

		}

		if ( visiblePoints.length < 3 ) continue;

		const first = points[ 0 ]!;
		const second = points[ 1 ]!;
		const third = points[ 2 ]!;
		const ab = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const cross = [ ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ];
		const doubleArea = Math.hypot( cross[ 0 ]!, cross[ 1 ]!, cross[ 2 ]! );
		if ( doubleArea <= 1e-10 ) continue;

		const normal: [ number, number, number ] = [ cross[ 0 ]! / doubleArea, cross[ 1 ]! / doubleArea, cross[ 2 ]! / doubleArea ];
		const center: [ number, number, number ] = [ ( first[ 0 ] + second[ 0 ] + third[ 0 ] ) / 3, ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3, ( first[ 2 ] + second[ 2 ] + third[ 2 ] ) / 3 ];
		let area = 0;

		for ( let point = 1; point < visiblePoints.length - 1; point ++ ) {

			const visibleAb = [ visiblePoints[ point ]![ 0 ] - visiblePoints[ 0 ]![ 0 ], visiblePoints[ point ]![ 1 ] - visiblePoints[ 0 ]![ 1 ], visiblePoints[ point ]![ 2 ] - visiblePoints[ 0 ]![ 2 ] ];
			const visibleAc = [ visiblePoints[ point + 1 ]![ 0 ] - visiblePoints[ 0 ]![ 0 ], visiblePoints[ point + 1 ]![ 1 ] - visiblePoints[ 0 ]![ 1 ], visiblePoints[ point + 1 ]![ 2 ] - visiblePoints[ 0 ]![ 2 ] ];
			const visibleCross = [ visibleAb[ 1 ]! * visibleAc[ 2 ]! - visibleAb[ 2 ]! * visibleAc[ 1 ]!, visibleAb[ 2 ]! * visibleAc[ 0 ]! - visibleAb[ 0 ]! * visibleAc[ 2 ]!, visibleAb[ 0 ]! * visibleAc[ 1 ]! - visibleAb[ 1 ]! * visibleAc[ 0 ]! ];
			area += Math.hypot( visibleCross[ 0 ]!, visibleCross[ 1 ]!, visibleCross[ 2 ]! ) * 0.5;

		}

		triangles.push( { normal, offset: normal[ 0 ] * center[ 0 ] + normal[ 1 ] * center[ 1 ] + normal[ 2 ] * center[ 2 ], area } );
		visibleArea += area;

	}

	const dimensions = getAboveGroundDimensions( mesh );
	const planeTolerance = Math.max( dimensions.width, dimensions.height, dimensions.depth ) * 0.035;
	const regions: Region[] = [];

	for ( const triangle of triangles ) {

		let best: Region | undefined;
		let bestDot = 0.98;

		for ( const region of regions ) {

			const dot = triangle.normal[ 0 ] * region.normal[ 0 ] + triangle.normal[ 1 ] * region.normal[ 1 ] + triangle.normal[ 2 ] * region.normal[ 2 ];
			if ( dot < bestDot || Math.abs( triangle.offset - region.offset ) > planeTolerance ) continue;
			best = region;
			bestDot = dot;

		}

		if ( best === undefined ) {

			regions.push( { ...triangle, normal: [ ...triangle.normal ] } );
			continue;

		}

		const total = best.area + triangle.area;
		const normal: [ number, number, number ] = [
			best.normal[ 0 ] * best.area + triangle.normal[ 0 ] * triangle.area,
			best.normal[ 1 ] * best.area + triangle.normal[ 1 ] * triangle.area,
			best.normal[ 2 ] * best.area + triangle.normal[ 2 ] * triangle.area,
		];
		const length = Math.hypot( normal[ 0 ], normal[ 1 ], normal[ 2 ] ) || 1;
		best.normal = [ normal[ 0 ] / length, normal[ 1 ] / length, normal[ 2 ] / length ];
		best.offset = ( best.offset * best.area + triangle.offset * triangle.area ) / total;
		best.area = total;

	}

	const visibleFacets = regions.filter( ( region ) => region.area >= visibleArea * 0.017 ).length;
	const topRegions = regions.filter( ( region ) => region.normal[ 1 ] > 0.8 );
	const topPlateauArea = topRegions.reduce( ( total, region ) => total + region.area, 0 );
	const largestTopFacet = Math.max( 0, ...topRegions.map( ( region ) => region.area ) ) / visibleArea;

	return { visibleFacets, topPlateau: topPlateauArea / visibleArea, largestTopFacet };

}

function getMaximumSplitNormalAngle( mesh: MeshData ): number {

	const normalsByPosition = new Map<string, [ number, number, number ][]>();

	for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

		const offset = vertex * 3;
		const key = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ].map( ( value ) => value.toFixed( 6 ) ).join( ',' );
		const normals = normalsByPosition.get( key ) ?? [];
		normals.push( [ mesh.normals[ offset ]!, mesh.normals[ offset + 1 ]!, mesh.normals[ offset + 2 ]! ] );
		normalsByPosition.set( key, normals );

	}

	let maximumAngle = 0;

	for ( const normals of normalsByPosition.values() ) {
		for ( let first = 0; first < normals.length; first ++ ) {
			for ( let second = first + 1; second < normals.length; second ++ ) {
				const dot = normals[ first ]![ 0 ] * normals[ second ]![ 0 ] + normals[ first ]![ 1 ] * normals[ second ]![ 1 ] + normals[ first ]![ 2 ] * normals[ second ]![ 2 ];
				maximumAngle = Math.max( maximumAngle, Math.acos( Math.max( - 1, Math.min( 1, dot ) ) ) * 180 / Math.PI );
			}
		}
	}

	return maximumAngle;

}

function getBroadFacetAreaRatios( mesh: MeshData, seed: number ): number[] {

	const normals = createRockFacetNormals( seed + 62 );
	const areas = new Array<number>( normals.length ).fill( 0 );
	let visibleArea = 0;

	for ( let index = 0; index < mesh.indices.length; index += 3 ) {

		const vertices = [ mesh.indices[ index ]!, mesh.indices[ index + 1 ]!, mesh.indices[ index + 2 ]! ];
		const points = vertices.map( ( vertex ) => [ mesh.positions[ vertex * 3 ]!, mesh.positions[ vertex * 3 + 1 ]!, mesh.positions[ vertex * 3 + 2 ]! ] );
		const centerY = ( points[ 0 ]![ 1 ]! + points[ 1 ]![ 1 ]! + points[ 2 ]![ 1 ]! ) / 3;
		if ( centerY <= 0 ) continue;
		const ab = [ points[ 1 ]![ 0 ]! - points[ 0 ]![ 0 ]!, points[ 1 ]![ 1 ]! - points[ 0 ]![ 1 ]!, points[ 1 ]![ 2 ]! - points[ 0 ]![ 2 ]! ];
		const ac = [ points[ 2 ]![ 0 ]! - points[ 0 ]![ 0 ]!, points[ 2 ]![ 1 ]! - points[ 0 ]![ 1 ]!, points[ 2 ]![ 2 ]! - points[ 0 ]![ 2 ]! ];
		const cross = [ ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ];
		const area = Math.hypot( ...cross ) * 0.5;
		if ( area < 1e-9 ) continue;
		const length = Math.hypot( ...cross );
		const normal = cross.map( ( value ) => value / length );
		let best = 0;
		let bestDot = - Infinity;

		for ( let facet = 0; facet < normals.length; facet ++ ) {

			const dot = normal[ 0 ]! * normals[ facet ]![ 0 ]! + normal[ 1 ]! * normals[ facet ]![ 1 ]! + normal[ 2 ]! * normals[ facet ]![ 2 ]!;
			if ( dot > bestDot ) {
				best = facet;
				bestDot = dot;
			}

		}

		areas[ best ]! += area;
		visibleArea += area;

	}

	return areas.map( ( area ) => area / visibleArea ).filter( ( ratio ) => ratio > 1e-5 );

}

function getMaximumConvexHullDeviation( mesh: MeshData ): number {

	const unique = new Map<string, [ number, number, number ]>();

	for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

		const offset = vertex * 3;
		const point: [ number, number, number ] = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		unique.set( point.map( ( value ) => value.toFixed( 5 ) ).join( ',' ), point );

	}

	const fullPoints = [ ...unique.values() ];
	const allPoints = fullPoints.filter( ( point ) => point[ 1 ] > 0 );
	const center: [ number, number, number ] = [ 0, 0, 0 ];

	for ( const point of fullPoints ) {
		center[ 0 ] += point[ 0 ] / fullPoints.length;
		center[ 1 ] += point[ 1 ] / fullPoints.length;
		center[ 2 ] += point[ 2 ] / fullPoints.length;
	}

	const bins = new Array<{ point: [ number, number, number ]; radius: number } | undefined>( 48 );

	for ( const point of fullPoints ) {

		const offset: [ number, number, number ] = [ point[ 0 ] - center[ 0 ], point[ 1 ] - center[ 1 ], point[ 2 ] - center[ 2 ] ];
		const radius = Math.hypot( offset[ 0 ], offset[ 1 ], offset[ 2 ] );
		const angle = Math.atan2( offset[ 2 ], offset[ 0 ] );
		const latitude = Math.acos( offset[ 1 ] / radius );
		const column = Math.floor( ( angle + Math.PI ) / ( Math.PI * 2 ) * 8 ) % 8;
		const row = Math.min( 5, Math.floor( latitude / Math.PI * 6 ) );
		const index = row * 8 + column;
		if ( bins[ index ] === undefined || radius > bins[ index ]!.radius ) bins[ index ] = { point, radius };

	}

	const sampledPoints = bins.filter( ( value ) => value !== undefined ).map( ( value ) => value.point );
	const faces = buildConvexHullFaces( sampledPoints );
	const planes = faces.map( ( face ) => {

		const first = sampledPoints[ face[ 0 ] ]!;
		const second = sampledPoints[ face[ 1 ] ]!;
		const third = sampledPoints[ face[ 2 ] ]!;
		const ab = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
		const ac = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
		const normal: [ number, number, number ] = [ ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ];
		const length = Math.hypot( normal[ 0 ], normal[ 1 ], normal[ 2 ] ) || 1;
		normal[ 0 ] /= length;
		normal[ 1 ] /= length;
		normal[ 2 ] /= length;
		const faceCenter = [ ( first[ 0 ] + second[ 0 ] + third[ 0 ] ) / 3, ( first[ 1 ] + second[ 1 ] + third[ 1 ] ) / 3, ( first[ 2 ] + second[ 2 ] + third[ 2 ] ) / 3 ];
		const centerSide = ( center[ 0 ] - faceCenter[ 0 ]! ) * normal[ 0 ] + ( center[ 1 ] - faceCenter[ 1 ]! ) * normal[ 1 ] + ( center[ 2 ] - faceCenter[ 2 ]! ) * normal[ 2 ];
		if ( centerSide > 0 ) {
			normal[ 0 ] *= - 1;
			normal[ 1 ] *= - 1;
			normal[ 2 ] *= - 1;
		}

		return { normal, offset: first[ 0 ] * normal[ 0 ] + first[ 1 ] * normal[ 1 ] + first[ 2 ] * normal[ 2 ] };

	} );
	let maximumDeviation = 0;

	for ( const point of allPoints ) {

		let nearestPlane = Infinity;
		for ( const plane of planes ) nearestPlane = Math.min( nearestPlane, plane.offset - point[ 0 ] * plane.normal[ 0 ] - point[ 1 ] * plane.normal[ 1 ] - point[ 2 ] * plane.normal[ 2 ] );
		maximumDeviation = Math.max( maximumDeviation, nearestPlane );

	}

	return maximumDeviation;

}

function boundaryEdgeCount( positions: Float32Array, indices: Uint32Array ): number {

	const edges = new Map<string, number>();

	for ( let index = 0; index < indices.length; index += 3 ) {

		const triangle = [ indices[ index ]!, indices[ index + 1 ]!, indices[ index + 2 ]! ];

		for ( let edgeIndex = 0; edgeIndex < 3; edgeIndex ++ ) {

			const first = triangle[ edgeIndex ]!;
			const second = triangle[ ( edgeIndex + 1 ) % 3 ]!;
			const key = first < second ? `${ first }:${ second }` : `${ second }:${ first }`;
			edges.set( key, ( edges.get( key ) ?? 0 ) + 1 );

		}

	}

	return [ ...edges.values() ].filter( ( count ) => count === 1 ).length;

}

function expectGroundPerimeter( mesh: MeshData, size: number, seed: number, lod: number ): number[] {

	const outline: number[] = [];

	for ( let sample = 0; sample < 72; sample ++ ) {

		const angle = sample / 72 * Math.PI * 2;
		const groundRadius = sampleOutlineRadius( mesh, 0, angle );
		const skirtRadius = sampleOutlineRadius( mesh, - 0.02 * size, angle );
		expect( groundRadius, `seed ${ seed } LOD${ lod } y=0 outline sample ${ sample }` ).toBeGreaterThan( 0 );
		expect( skirtRadius, `seed ${ seed } LOD${ lod } below-ground outline sample ${ sample }` ).toBeGreaterThanOrEqual( groundRadius * 0.65 );
		outline.push( groundRadius );

	}

	return outline;

}

function renderCoverage( data: ReturnType<typeof generateRockData>, lod: number, topDown = false, albedoOnly = false ) {

	const source = data.lods[ lod ]!;
	const mesh = topDown
		? {
			...source,
			positions: Float32Array.from( source.positions, ( value, index ) => index % 3 === 1 ? - source.positions[ index + 1 ]! + data.bounds.radius : index % 3 === 2 ? source.positions[ index - 1 ]! : value ),
			normals: Float32Array.from( source.normals, ( value, index ) => index % 3 === 1 ? - source.normals[ index + 1 ]! : index % 3 === 2 ? source.normals[ index - 1 ]! : value ),
		}
		: source;
	const renderMesh = albedoOnly
		? { ...mesh, normals: Float32Array.from( mesh.normals, ( _, index ) => index % 3 === 1 ? 1 : 0 ) }
		: mesh;
	const renderData = {
		...data,
		lods: [ renderMesh ],
		bounds: topDown ? { radius: data.bounds.radius, height: data.bounds.radius * 2 } : data.bounds,
	};

	return bakeImpostor( renderData, data.parts.map( ( part ) => hexToLinear( part.defaultColor ) ), 128, [ 0 ] );

}

function coverageIou( first: { width: number; data: Uint8Array }, second: { width: number; data: Uint8Array }, tolerance = 1 ): number {

	let intersection = 0;
	let union = 0;
	const height = first.data.length / 4 / first.width;
	const opaqueNear = ( image: { width: number; data: Uint8Array }, x: number, y: number ): boolean => {

		for ( let dy = - tolerance; dy <= tolerance; dy ++ ) {

			for ( let dx = - tolerance; dx <= tolerance; dx ++ ) {

				const sampleX = x + dx;
				const sampleY = y + dy;

				if ( sampleX < 0 || sampleX >= image.width || sampleY < 0 || sampleY >= height ) continue;
				if ( image.data[ ( sampleY * image.width + sampleX ) * 4 + 3 ]! > 0 ) return true;

			}

		}

		return false;

	};

	for ( let y = 0; y < height; y ++ ) {

		for ( let x = 0; x < first.width; x ++ ) {

			const firstOpaque = opaqueNear( first, x, y );
			const secondOpaque = opaqueNear( second, x, y );

			if ( firstOpaque && secondOpaque ) intersection ++;
			if ( firstOpaque || secondOpaque ) union ++;

		}

	}

	return intersection / union;

}

describe( 'procedural rock data', () => {

	it( 'keeps chamfered LOD0 facets face-weighted across the seed sweep', () => {

		let scoopTriangles = 0;
		const seeds = [ ...Array.from( { length: 300 }, ( _, index ) => index + 1 ), 341810 ];
		for ( const seed of seeds ) {
			const shape = createRockHullShape( seed + 62, 6.4, 1.2, 0.04 );
			const faces = buildConvexHullFaces( shape.points );
			const mesh = buildRockHullMeshWithChamfers( shape, faces, 6.4 * 0.04 ).mesh;
			const counts = checkChamferedLod0Normals( mesh, shape, faces, seed );
			scoopTriangles += counts.scoopTriangles;
		}
		expect( scoopTriangles ).toBeGreaterThan( 0 );

	}, 180000 );

	it( 'keeps every rock LOD grounded and LOD3 within its triangle budget across 300 seeds', () => {

		withSharedRockTextures( () => {

			const seeds = [ ...Array.from( { length: 300 }, ( _, index ) => index + 1 ), 341810 ];

			for ( const seed of seeds ) {

				const data = generateRockData( { seed, size: 6.4 } );
				const lod3Vertices = vertexCount( data.lods[ 3 ]! );
				expect( vertexCount( data.lods[ 0 ]! ), `seed ${ seed } LOD0 vertices` ).toBeLessThanOrEqual( 260 );
				expect( lod3Vertices, `seed ${ seed } LOD3 vertices` ).toBeLessThanOrEqual( 90 );
				if ( seed <= 300 ) {

					const lod2Triangles = triangleCount( data.lods[ 2 ]! );
					const lod3Triangles = triangleCount( data.lods[ 3 ]! );
					expect( lod3Triangles, `seed ${ seed } LOD3 triangles` ).toBeGreaterThanOrEqual( 16 );
					expect( lod3Triangles, `seed ${ seed } LOD3 triangles` ).toBeLessThanOrEqual( 24 );
					expect( lod2Triangles - lod3Triangles, `seed ${ seed } LOD2 ${ lod2Triangles } minus LOD3 ${ lod3Triangles } triangles` ).toBeGreaterThanOrEqual( 15 );

				}
				expect( data.collider!.indices.length / 3, `seed ${ seed } collider triangles` ).toBeLessThanOrEqual( 96 );
				expect( boundaryEdgeCount( data.collider!.positions, data.collider!.indices ) ).toBe( 0 );

				for ( let lod = 0; lod <= 3; lod ++ ) {

					const mesh = data.lods[ lod ]!;
					const heights = Array.from( { length: vertexCount( mesh ) }, ( _, index ) => mesh.positions[ index * 3 + 1 ]! );
					expect( Math.min( ...heights ), `seed ${ seed } LOD${ lod } underground placement` ).toBeLessThan( 0 );
					expect( Math.max( ...heights ), `seed ${ seed } LOD${ lod } exposed placement` ).toBeGreaterThan( 0 );
					expect( boundaryEdgeCount( mesh.positions, mesh.indices ), `seed ${ seed } LOD${ lod } open bottom` ).toBeGreaterThan( 0 );

				}

			}

		} );

	}, 180000 );

	it( 'keeps weathered rock angles and triangles broad at every visible LOD', () => {

		withSharedRockTextures( () => {

			const seeds = [ 1, 2, 3, 4, 5, 341810 ];

			for ( const seed of seeds ) {

				for ( const weathering of [ 0, 0.25, 1 ] ) {

					const lods = generateRockData( { seed, size: 6.4, weathering } as Parameters<typeof generateRockData>[ 0 ] ).lods;
					expect( vertexCount( lods[ 0 ]! ), `seed ${ seed } LOD0 vertex budget` ).toBeLessThanOrEqual( 260 );

					for ( let lod = 0; lod <= 3; lod ++ ) {

						const mesh = lods[ lod ]!;
						expect( mesh.normals.every( Number.isFinite ), `seed ${ seed } weathering ${ weathering } LOD${ lod } normals` ).toBe( true );

					}

				}

			}

		} );

	}, 120000 );

	it( 'builds mesh LOD0–3 with an open LOD3 base and keeps LOD4 as a billboard', () => {

		const data = generateRockData( { seed: 4 } );

		expect( data.kind ).toBe( 'rock' );
		expect( data.lods ).toHaveLength( 5 );
		expect( data.parts.map( ( part ) => part.name ) ).toEqual( [ 'rock', 'impostor' ] );
		expect( Object.keys( data.textures ) ).toEqual( [ 'albedo', 'normal' ] );
		expect( vertexCount( data.lods[ 3 ]! ) ).toBeGreaterThanOrEqual( 18 );
		expect( vertexCount( data.lods[ 3 ]! ) ).toBeLessThanOrEqual( 90 );
		expect( vertexCount( data.lods[ 4 ]! ) ).toBe( 8 );
		expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 4 );
		expect( data.lods[ 4 ]!.groups[ 0 ]!.partIndex ).toBe( 1 );
		expect( boundaryEdgeCount( data.lods[ 3 ]!.positions, data.lods[ 3 ]!.indices ) ).toBeGreaterThan( 0 );
		for ( let lod = 0; lod < 3; lod ++ ) {

			const mesh = data.lods[ lod ]!;

			const minimumY = Math.min( ...Array.from( mesh.positions ).filter( ( _, index ) => index % 3 === 1 ) );
			for ( let index = 0; index < mesh.indices.length; index += 3 ) {
				const y = [ 0, 1, 2 ].map( ( corner ) => mesh.positions[ mesh.indices[ index + corner ]! * 3 + 1 ]! );
				expect( y.every( ( value ) => value <= minimumY + 1e-6 ) ).toBe( false );
			}

		}
		for ( let lod = 0; lod < 2; lod ++ ) {

			expect( vertexCount( data.lods[ lod ]! ) ).toBeGreaterThan( vertexCount( data.lods[ lod + 1 ]! ) );
			expect( triangleCount( data.lods[ lod ]! ) ).toBeGreaterThan( triangleCount( data.lods[ lod + 1 ]! ) );

		}
		expect( triangleCount( data.lods[ 3 ]! ) ).toBeGreaterThan( triangleCount( data.lods[ 4 ]! ) );
		for ( const mesh of data.lods ) validateMeshData( mesh );

	} );

	it( 'uses the LOD0 UV frame on LOD1–3', () => {

		for ( const seed of [ 1, 2, 3, 7 ] ) {

			const shape = createRockHullShape( seed + 62, 6.4, 1.2, 0.04 );
			const faces = buildConvexHullFaces( shape.points );
			const frame = getLod0RockUvFrame( seed );

			for ( const lod of [ 1, 2, 3 ] ) {

				const mesh = buildRockHullMesh( shape, faces, lod === 1 ? 1 : 0, 0, 0.25, true, frame );

				for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

					const offset = vertex * 3;
					const expected = expectedRockUv( [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ], frame );
					const actualU = wrappedUnit( mesh.uvs[ vertex * 2 ]! );
					expect( Math.min( Math.abs( actualU - expected[ 0 ] ), 1 - Math.abs( actualU - expected[ 0 ] ) ), `seed ${ seed } LOD${ lod } vertex ${ vertex } U` ).toBeLessThan( 1e-4 );
					expect( mesh.uvs[ vertex * 2 + 1 ], `seed ${ seed } LOD${ lod } vertex ${ vertex } V` ).toBeCloseTo( expected[ 1 ], 4 );
				}

			}

		}

	} );

	it( 'keeps albedo crack placement close between LOD0 and LOD2', () => {

		withSharedRockTextures( () => {

			const differences: number[] = [];
			for ( const seed of [ 1, 7 ] ) {

				const data = generateRockData( { seed } );
				const lod0 = renderCoverage( data, 0, false, true );
				const lod2 = renderCoverage( data, 2, false, true );
				const difference = meanOpaquePixelDifference( lod0.data, lod2.data );
				differences.push( difference );

			}
			expect( differences.every( ( difference ) => difference <= 1 ), `seed 1,7 albedo mean RGB differences ${ differences.join( ', ' ) }` ).toBe( true );

		} );

	} );

	it( 'matches the top-down LOD4 coverage to LOD0', () => {

		withSharedRockTextures( () => {

			for ( const seed of [ 1, 4, 7 ] ) {

				const data = generateRockData( { seed } );

				expect( triangleCount( data.lods[ 4 ]! ) ).toBe( 4 );
				expect( vertexCount( data.lods[ 4 ]! ) ).toBe( 8 );
				expect( data.lods[ 4 ]!.positions[ 13 ] ).toBeCloseTo( data.bounds.height * 0.25, 5 );
				expect( triangleCount( data.lods[ 3 ]! ) ).toBeGreaterThan( triangleCount( data.lods[ 4 ]! ) );
				expect( topCardCoverageIou( data ) ).toBeGreaterThanOrEqual( 0.6 );

			}

		} );

	}, 30000 );

	it( 'is deterministic for the same seed and changes shape for another seed', () => {

		const first = generateRockData( { seed: 23 } );
		const repeated = generateRockData( { seed: 23 } );
		const different = generateRockData( { seed: 24 } );

		expect( first.lods[ 0 ]!.positions ).toEqual( repeated.lods[ 0 ]!.positions );
		expect( hashBytes( first.textures.albedo!.data ) ).toBe( hashBytes( repeated.textures.albedo!.data ) );
		expect( first.lods[ 0 ]!.positions ).not.toEqual( different.lods[ 0 ]!.positions );

	}, 30000 );

	it( 'keeps rock vertex tint uniform to prevent diagonal interpolation bands', () => {

		withSharedRockTextures( () => {

			for ( const seed of [ 1, 2 ] ) {

				const data = generateRockData( { seed } );
				expect( meshColorSpread( data.lods[ 0 ]! ) ).toBeLessThan( 0.001 );

			}

		} );

	} );

	it( 'keeps the three shell LODs within vertex caps and strictly reduces triangle counts', () => {

		withSharedRockTextures( () => {

			for ( const seed of [ 1, 2, 3 ] ) {

				const lods = generateRockData( { seed } ).lods;
				const vertices = lods.slice( 0, 3 ).map( vertexCount );
				const triangles = lods.map( triangleCount );
				expect( vertices[ 0 ] ).toBeLessThanOrEqual( 260 );
				expect( vertices[ 1 ] ).toBeLessThanOrEqual( 220 );
				expect( vertices[ 2 ] ).toBeLessThanOrEqual( 90 );
				expect( vertices[ 0 ] ).toBeGreaterThanOrEqual( vertices[ 1 ]! );
				expect( vertices[ 1 ] ).toBeGreaterThan( vertices[ 2 ]! );
				for ( let lod = 0; lod < 2; lod ++ ) {

					expect( triangles[ lod ] ).toBeGreaterThan( triangles[ lod + 1 ]! );

				}
				expect( triangles[ 2 ] ).toBeGreaterThan( triangles[ 4 ]! );

			}

		} );

	} );

	it( 'uses one broad crown cut above the side facets', () => {

		for ( const seed of [ 1, 2, 3, 4, 5 ] ) {

			const normals = createRockFacetNormals( seed, 'chiseled' );
			const crownNormals = normals.filter( ( normal ) => normal[ 1 ] > 0.9 );

			expect( normals.length, `seed ${ seed } cutting plane count` ).toBeGreaterThanOrEqual( 6 );
			expect( normals.length, `seed ${ seed } cutting plane cap` ).toBeLessThanOrEqual( 10 );
			expect( crownNormals, `seed ${ seed } broad crown plane` ).toHaveLength( 1 );

		}

	} );

	it( 'keeps LOD0 normals face-weighted at broad hull facets', () => {

		withSharedRockTextures( () => {

			for ( const seed of [ 1, 2, 3, 4, 5 ] ) {

			const data = generateRockData( { seed } );
			const mesh = data.lods[ 0 ]!;
				expect( vertexCount( mesh ), `seed ${ seed } LOD0 vertex cap` ).toBeLessThanOrEqual( 260 );
				expect( data.parts[ 0 ]!.flatShading ).toBe( false );
				expect( getMaximumSplitNormalAngle( mesh ), `seed ${ seed } facet crease` ).toBeGreaterThan( 0 );

			}

		} );

	}, 30000 );

	it( 'keeps LOD0 within its vertex cap and structurally valid for seeds 1 to 50', () => {

		withSharedRockTextures( () => {

			for ( let seed = 1; seed <= 50; seed ++ ) {

				const mesh = generateRockData( { seed, weathering: 0.35 } ).lods[ 0 ]!;
				expect( vertexCount( mesh ), `seed ${ seed } LOD0 vertex cap` ).toBeLessThanOrEqual( 260 );
				expect( () => validateMeshData( mesh ), `seed ${ seed } LOD0 validation` ).not.toThrow();

			}

		} );

	}, 120000 );

	it( 'keeps LOD0 vertex counts within the HEAD range for seeds 1 to 10', () => {

		withSharedRockTextures( () => {

			const headCounts = [ 143, 149, 122, 165, 151, 139, 155, 169, 143, 148 ];
			for ( let seed = 1; seed <= headCounts.length; seed ++ ) {

				const count = vertexCount( generateRockData( { seed } ).lods[ 0 ]! );
				expect( count, `seed ${ seed } LOD0 vertex upper bound` ).toBeLessThanOrEqual( headCounts[ seed - 1 ]! );
				expect( count, `seed ${ seed } LOD0 vertex lower bound` ).toBeGreaterThanOrEqual( headCounts[ seed - 1 ]! * 0.9 );

			}

		} );

	}, 30000 );

	it( 'keeps large planar relief visible in the generated rock', () => {

		withSharedRockTextures( () => {

			for ( const seed of [ 1, 2, 3, 4, 5 ] ) {

				const relief = getRockReliefMetric( generateRockData( { seed } ).lods[ 0 ]! );
				expect( relief, `seed ${ seed } broad relief` ).toBeGreaterThan( 0.02 );

			}

		} );

	} );

	it( 'uses weathering 0.25 by default and validates its range', () => {

		withSharedRockTextures( () => {

			const implicit = generateRockData( { seed: 2 } ).lods[ 0 ]!;
			const explicit = generateRockData( { seed: 2, weathering: 0.25 } ).lods[ 0 ]!;
			expect( implicit.positions ).toEqual( explicit.positions );
			expect( () => generateRockData( { weathering: - 0.01 } ) ).toThrow( RangeError );
			expect( () => generateRockData( { weathering: 1.01 } ) ).toThrow( RangeError );
			expect( () => generateRockData( { weathering: Number.NaN } ) ).toThrow( RangeError );

		} );

	} );

	it( 'splits facet crease normals and keeps vertex normals finite', () => {

		const data = generateRockData( { seed: 6 } );

		expect( data.parts[ 0 ]!.flatShading ).toBe( false );

		for ( const [ lod, mesh ] of data.lods.slice( 0, 3 ).entries() ) {

			expect( mesh.normals.every( Number.isFinite ), `LOD${ lod } finite normals` ).toBe( true );
			for ( let index = 0; index < mesh.normals.length; index += 3 ) {
				const length = Math.hypot( mesh.normals[ index ]!, mesh.normals[ index + 1 ]!, mesh.normals[ index + 2 ]! );
				expect( length ).toBeCloseTo( 1, 3 );
			}

		}
		expect( getMaximumSplitNormalAngle( data.lods[ 0 ]! ) ).toBeGreaterThan( 0 );

	} );

	it( 'keeps rock vertex color neutral for light-driven shading', () => {

		const data = generateRockData( { seed: 9 } );
		const mesh = data.lods[ 0 ]!;
		let upperColor = 0;
		let upperCount = 0;
		let lowerColor = 0;
		let lowerCount = 0;
		let minimumColor = Infinity;

		for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

			const color = mesh.colors[ vertex * 3 ]!;
			const y = mesh.positions[ vertex * 3 + 1 ]!;
			minimumColor = Math.min( minimumColor, color );

			if ( y > data.bounds.height * 0.7 ) {

				upperColor += color;
				upperCount ++;

			} else if ( y > 0 && y < data.bounds.height * 0.35 ) {

				lowerColor += color;
				lowerCount ++;

			}

		}

		expect( upperCount ).toBeGreaterThan( 0 );
		expect( lowerCount ).toBeGreaterThan( 0 );
		expect( upperColor / upperCount ).toBeCloseTo( lowerColor / lowerCount, 5 );
		expect( minimumColor ).toBe( 1 );

	} );

	it( 'varies seeded ellipsoid proportions and lean', () => {

		withSharedRockTextures( () => {

			const samples = Array.from( { length: 12 }, ( _, index ) => getShapeMetrics( generateRockData( { seed: index + 1 } ).lods[ 0 ]! ) );
			const signatures = new Set( samples.map( ( sample ) => `${ sample.ratio.toFixed( 2 ) },${ sample.roundness.toFixed( 2 ) }` ) );
			const horizontalAspect = samples.map( ( sample ) => 1 / sample.roundness );

			for ( const sample of samples ) {

				expect( sample.ratio ).toBeGreaterThan( 0.2 );
				expect( sample.ratio ).toBeLessThan( 1.2 );
				expect( sample.roundness ).toBeGreaterThan( 0.55 );

			}

			expect( signatures.size ).toBeGreaterThanOrEqual( 8 );
			expect( horizontalAspect.some( ( aspect ) => aspect > 1.15 ) ).toBe( true );

		} );

	}, 30000 );

	it( 'produces both tall and squat rock profiles', () => {

		withSharedRockTextures( () => {

			const samples = Array.from( { length: 12 }, ( _, index ) => {

				const data = generateRockData( { seed: index + 1 } );
				const dimensions = getAboveGroundDimensions( data.lods[ 0 ]! );

				return {
					data,
					dimensions,
					ratio: dimensions.height / Math.max( dimensions.width, dimensions.depth ),
				};

			} );
			const ratios = samples.map( ( sample ) => sample.ratio );
			expect( Math.max( ...ratios ) ).toBeGreaterThan( 0.65 );
			expect( Math.min( ...ratios ) ).toBeLessThan( 0.45 );

		} );

	} );

	it( 'sinks a seeded lower section below ground while keeping a shallow skirt', () => {

		withSharedRockTextures( () => {

			for ( const seed of [ 1, 2, 7, 12 ] ) {

				const buried = generateRockData( { seed } );
				const full = generateRockData( { seed, burial: 0 } );
				const visible = getAboveGroundDimensions( buried.lods[ 0 ]! );
				const minimumY = Math.min( ...Array.from( buried.lods[ 0 ]!.positions ).filter( ( _, index ) => index % 3 === 1 ) );
				const burialRatio = 1 - buried.bounds.height / full.bounds.height;

				expect( burialRatio, `seed ${ seed } burial ratio` ).toBeGreaterThanOrEqual( 0.39 );
				expect( burialRatio ).toBeLessThanOrEqual( 0.45 );
				expect( visible.minimumY ).toBe( 0 );
				expect( buried.bounds.height ).toBeCloseTo( visible.height, 5 );
				expect( minimumY ).toBeLessThan( 0 );
				expect( Math.min( ...Array.from( buried.collider!.positions ).filter( ( _, index ) => index % 3 === 1 ) ) ).toBeLessThan( 0 );

			}

			const unburied = generateRockData( { seed: 1, burial: 0 } );
			const quarterBuried = generateRockData( { seed: 1, burial: 0.2 } );
			expect( quarterBuried.bounds.height / unburied.bounds.height ).toBeCloseTo( 0.8, 1 );

		} );

	}, 30000 );

	it( 'scales the seeded shape with size and validates burial', () => {

		const smallRock = generateRockData( { seed: 17, size: 6.4 } );
		const largeRock = generateRockData( { seed: 17, size: 12.8 } );
		const smallBounds = getAboveGroundDimensions( smallRock.lods[ 0 ]! );
		const largeBounds = getAboveGroundDimensions( largeRock.lods[ 0 ]! );

		expect( largeBounds.width / smallBounds.width ).toBeCloseTo( 2, 2 );
		expect( largeBounds.depth / smallBounds.depth ).toBeCloseTo( 2, 2 );
		expect( largeBounds.height / smallBounds.height ).toBeCloseTo( 2, 2 );
		expect( () => generateRockData( { burial: - 0.01 } ) ).toThrow( RangeError );
		expect( () => generateRockData( { burial: 1.01 } ) ).toThrow( RangeError );
		expect( () => generateRockData( { burial: Number.NaN } ) ).toThrow( RangeError );

	} );

	it( 'unwraps longitude seams so shell triangles use a short U interval', () => {

		const data = generateRockData( { seed: 5 } );

		for ( let lod = 0; lod < 3; lod ++ ) {

			const mesh = data.lods[ lod ]!;

			for ( let index = 0; index < mesh.indices.length; index += 3 ) {

				const u0 = mesh.uvs[ mesh.indices[ index ]! * 2 ]!;
				const u1 = mesh.uvs[ mesh.indices[ index + 1 ]! * 2 ]!;
				const u2 = mesh.uvs[ mesh.indices[ index + 2 ]! * 2 ]!;
				const y0 = mesh.positions[ mesh.indices[ index ]! * 3 + 1 ]!;
				const y1 = mesh.positions[ mesh.indices[ index + 1 ]! * 3 + 1 ]!;
				const y2 = mesh.positions[ mesh.indices[ index + 2 ]! * 3 + 1 ]!;

				if ( Math.min( y0, y1, y2 ) < data.bounds.height * 0.08 || Math.max( y0, y1, y2 ) > data.bounds.height * 0.92 ) continue;

				expect( Math.max( u0, u1, u2 ) - Math.min( u0, u1, u2 ), `LOD${ lod } U values ${ u0 }, ${ u1 }, ${ u2 } at Y ${ y0 }, ${ y1 }, ${ y2 }` ).toBeLessThanOrEqual( 0.55 );

			}

		}

	} );

	it( 'keeps the low-poly LOD3 silhouette close to LOD0 from the side and top', () => {

		const data = generateRockData( { seed: 7 } );

		for ( const topDown of [ false, true ] ) {

			const lod0 = renderCoverage( data, 0, topDown );
			const lod = 3;

			const lodCoverage = renderCoverage( data, lod, topDown );
			const coverage = coverageIou( lod0, lodCoverage, 0 );
			expect( coverage, `LOD${ lod } ${ topDown ? 'top' : 'side' } coverage` ).toBeGreaterThanOrEqual( 0.75 );

			if ( ! topDown ) {

				const sourceColor = meanOpaqueRgb( lod0.data );
				const farColor = meanOpaqueRgb( lodCoverage.data );

				for ( let channel = 0; channel < 3; channel ++ ) {
					expect( Math.abs( sourceColor[ channel ]! - farColor[ channel ]! ), `LOD3 channel ${ channel } mean color` ).toBeLessThanOrEqual( 8 );
				}

			}

		}

	} );

	it( 'builds a closed LOD2-like collider under the reference limits', () => {

		const collider = generateRockData( { seed: 8 } ).collider!;

		expect( collider.positions.length / 3 ).toBeLessThanOrEqual( 50 );
		expect( collider.indices.length / 3 ).toBeLessThanOrEqual( 96 );
		expect( boundaryEdgeCount( collider.positions, collider.indices ) ).toBe( 0 );

	} );

	it( 'generates a light grayscale-blue albedo and normalized tangent-space normal texture', () => {

		const data = generateRockData( { seed: 9 } );
		const part = data.parts[ 0 ]!;
		const albedo = data.textures[ part.texture! ]!;
		const normal = data.textures[ part.normalTexture! ]!;

		expect( part.roughness ).toBe( 0.9 );
		expect( part.flatShading ).toBe( false );
		expect( part.specularIntensity ).toBeCloseTo( 0.014872 );
		expect( part.ior ).toBeCloseTo( 1.05 );
		expect( albedo.width ).toBeGreaterThanOrEqual( 64 );
		expect( normal.data ).toHaveLength( normal.width * normal.height * 4 );
		const albedoMean = meanRgb( albedo.data );
		const normalMean = meanRgb( normal.data );

		expect( Math.abs( albedoMean[ 0 ] - 158 ) ).toBeLessThanOrEqual( 1 );
		expect( Math.abs( albedoMean[ 1 ] - 168 ) ).toBeLessThanOrEqual( 1 );
		expect( Math.abs( albedoMean[ 2 ] - 180 ) ).toBeLessThanOrEqual( 1 );
		expect( meanNeighborDelta( albedo.data, albedo.width, albedo.height, albedo.width / 256 ) ).toBeLessThan( 2 );
		expect( meanNeighborDelta( albedo.data, albedo.width, albedo.height, albedo.width / 256 ) ).toBeGreaterThan( 0.4 );
		expect( rowStripeAmplitude( albedo.data, albedo.width, albedo.height, 5 ) ).toBeLessThan( 14 );
		expect( percentile( albedo.data, 0, 0.1 ) ).toBeGreaterThan( 140 );
		expect( percentile( albedo.data, 0, 0.9 ) ).toBeLessThan( 205 );
		expect( percentile( albedo.data, 0, 0.9 ) - percentile( albedo.data, 0, 0.1 ) ).toBeGreaterThan( 12 );
		expect( percentile( normal.data, 0, 0.9 ) - percentile( normal.data, 0, 0.1 ) ).toBeGreaterThan( 6 );
		expect( normalMean[ 2 ] ).toBeGreaterThan( 220 );
		expect( normalMean[ 2 ] ).toBeLessThan( 255 );

		let averageRed = 0;
		let averageGreen = 0;
		let averageBlue = 0;

		for ( let offset = 0; offset < albedo.data.length; offset += 4 ) {

			averageRed += albedo.data[ offset ]!;
			averageGreen += albedo.data[ offset + 1 ]!;
			averageBlue += albedo.data[ offset + 2 ]!;

		}

		const pixelCount = albedo.width * albedo.height;
		expect( averageBlue / pixelCount ).toBeGreaterThan( averageRed / pixelCount );
		expect( averageGreen / pixelCount ).toBeGreaterThan( averageRed / pixelCount );

		let minimumNormalLength = Infinity;
		let maximumNormalLength = 0;
		let transparentNormalPixels = 0;

		for ( let offset = 0; offset < normal.data.length; offset += 4 ) {

			const x = normal.data[ offset ]! / 127.5 - 1;
			const y = normal.data[ offset + 1 ]! / 127.5 - 1;
			const z = normal.data[ offset + 2 ]! / 127.5 - 1;
			const length = Math.hypot( x, y, z );
			minimumNormalLength = Math.min( minimumNormalLength, length );
			maximumNormalLength = Math.max( maximumNormalLength, length );
			if ( normal.data[ offset + 3 ] !== 255 ) transparentNormalPixels ++;

		}

		expect( minimumNormalLength ).toBeGreaterThan( 0.98 );
		expect( maximumNormalLength ).toBeLessThan( 1.02 );
		expect( transparentNormalPixels ).toBe( 0 );

	} );

	it( 'keeps normalized rock features at 512 and 1024 pixels', () => {

		const defaultTextures = createRockTextures( 9 );
		const reference = createRockTextures( 9, 256 );
		const mediumResolution = createRockTextures( 9, 512 );
		let mediumAlbedoError = 0;
		let mediumNormalError = 0;
		let highAlbedoError = 0;
		let highNormalError = 0;
		let samples = 0;

		expect( defaultTextures.albedo.width ).toBe( 1024 );
		expect( defaultTextures.normal.width ).toBe( 1024 );
		expect( mediumResolution.albedo.width ).toBe( 512 );

		for ( let y = 8; y < 248; y += 8 ) {

			for ( let x = 8; x < 248; x += 8 ) {

				const lowOffset = ( y * 256 + x ) * 4;
				const mediumOffset = ( y * 2 * 512 + x * 2 ) * 4;
				const highOffset = ( y * 4 * 1024 + x * 4 ) * 4;

				for ( let channel = 0; channel < 3; channel ++ ) {

					mediumAlbedoError += Math.abs( reference.albedo.data[ lowOffset + channel ]! - mediumResolution.albedo.data[ mediumOffset + channel ]! );
					mediumNormalError += Math.abs( reference.normal.data[ lowOffset + channel ]! - mediumResolution.normal.data[ mediumOffset + channel ]! );
					highAlbedoError += Math.abs( reference.albedo.data[ lowOffset + channel ]! - defaultTextures.albedo.data[ highOffset + channel ]! );
					highNormalError += Math.abs( reference.normal.data[ lowOffset + channel ]! - defaultTextures.normal.data[ highOffset + channel ]! );

				}

				samples ++;

			}

		}

		expect( mediumAlbedoError / ( samples * 3 ) ).toBeLessThan( 2 );
		expect( mediumNormalError / ( samples * 3 ) ).toBeLessThan( 3 );
		expect( highAlbedoError / ( samples * 3 ) ).toBeLessThan( 2 );
		expect( highNormalError / ( samples * 3 ) ).toBeLessThan( 5 );

	} );

	it( 'uses a horizontally tiling light stone surface with subtle chips and clamped poles', () => {

		const textures = createRockTextures( 9 );
		const rock = generateRockData( { seed: 9 } );
		const rockNormal = rock.textures.normal!;
		let edgeDifference = 0;
		let normalEdgeDifference = 0;

		expect( textures.albedo.wrap ).toBe( 'repeat' );
		expect( textures.normal.wrap ).toBe( 'repeat' );

		for ( let position = 0; position < textures.albedo.width; position ++ ) {

			const left = position * textures.albedo.width * 4;
			const right = left + ( textures.albedo.width - 1 ) * 4;

			for ( let channel = 0; channel < 3; channel ++ ) {

				edgeDifference += Math.abs( textures.albedo.data[ left + channel ]! - textures.albedo.data[ right + channel ]! );

			}

		}

		for ( let position = 0; position < rockNormal.width; position ++ ) {

			const left = position * rockNormal.width * 4;
			const right = left + ( rockNormal.width - 1 ) * 4;

			for ( let channel = 0; channel < 3; channel ++ ) normalEdgeDifference += Math.abs( rockNormal.data[ left + channel ]! - rockNormal.data[ right + channel ]! );

		}

		const meanEdgeDifference = edgeDifference / ( textures.albedo.width * 3 );

		expect( textures.albedo.wrapS ).toBe( 'repeat' );
		expect( textures.albedo.wrapT ).toBe( 'clamp' );
		expect( textures.normal.wrapS ).toBe( 'repeat' );
		expect( textures.normal.wrapT ).toBe( 'clamp' );
		expect( meanRgb( textures.albedo.data )[ 0 ] ).toBeGreaterThan( 150 );
		expect( percentile( textures.albedo.data, 0, 0.01 ) ).toBeGreaterThan( 130 );
		expect( percentile( textures.albedo.data, 0, 0.99 ) ).toBeLessThan( 220 );
		expect( meanEdgeDifference ).toBeLessThan( 3 );
		expect( normalEdgeDifference / ( rockNormal.width * 3 ) ).toBeLessThan( 5 );

		const mesh = rock.lods[ 0 ]!;
		const uValues = Array.from( mesh.uvs ).filter( ( _, index ) => index % 2 === 0 );
		const vValues = Array.from( mesh.uvs ).filter( ( _, index ) => index % 2 === 1 );
		const uRange = Math.max( ...uValues ) - Math.min( ...uValues );
		const vRange = Math.max( ...vValues ) - Math.min( ...vValues );

		expect( uRange ).toBeGreaterThanOrEqual( 0.9 );
		expect( uRange ).toBeLessThanOrEqual( 1.5 );
		expect( vRange ).toBeGreaterThanOrEqual( 0.45 );
		expect( vRange ).toBeLessThanOrEqual( 1.1 );

	} );

	it( 'adds broad blue-grey, purple and warm hue shifts inside the stone planes', () => {

		const texture = createRockTextures( 17, 256 ).albedo;
		const tileSize = texture.width / 8;
		const hueValues: number[] = [];

		for ( let tileY = 0; tileY < 8; tileY ++ ) {

			for ( let tileX = 0; tileX < 8; tileX ++ ) {

				let hue = 0;
				let pixels = 0;

				for ( let y = tileY * tileSize; y < ( tileY + 1 ) * tileSize; y ++ ) {

					for ( let x = tileX * tileSize; x < ( tileX + 1 ) * tileSize; x ++ ) {

						const offset = ( y * texture.width + x ) * 4;
						hue += texture.data[ offset + 2 ]! - texture.data[ offset ]!;
						pixels ++;

					}

				}

				hueValues.push( hue / pixels );

			}

		}

		hueValues.sort( ( first, second ) => first - second );
		const hueSpread = hueValues[ 57 ]! - hueValues[ 6 ]!;

		expect( hueSpread ).toBeGreaterThan( 3.5 );
		expect( meanRgb( texture.data )[ 0 ] ).toBeCloseTo( 158, 0 );
		expect( meanRgb( texture.data )[ 1 ] ).toBeCloseTo( 168, 0 );
		expect( meanRgb( texture.data )[ 2 ] ).toBeCloseTo( 180, 0 );

	} );

	it( 'uses subtle facet value changes from the LOD0 normals', () => {

		const smoothMesh = buildRockShell( 4, createRockRadiusFunction( 27, 2, 0.2, 0.82, 1, 'chiseled' ), 0.82 );
		const chiseledMesh = buildRockShell( 4, createRockRadiusFunction( 27, 2, 1.45, 0.82, 1, 'chiseled' ), 0.82 );
		recomputeCreasedNormals( smoothMesh );
		recomputeCreasedNormals( chiseledMesh );
		const smoothTexture = createRockTextures( 27, 128, 27, smoothMesh ).albedo;
		const chiseledTexture = createRockTextures( 27, 128, 27, chiseledMesh ).albedo;
		let changedPixels = 0;

		for ( let pixel = 0; pixel < smoothTexture.width * smoothTexture.height; pixel ++ ) {

			const offset = pixel * 4;
			const difference = Math.abs( smoothTexture.data[ offset ]! - chiseledTexture.data[ offset ]! )
				+ Math.abs( smoothTexture.data[ offset + 1 ]! - chiseledTexture.data[ offset + 1 ]! )
				+ Math.abs( smoothTexture.data[ offset + 2 ]! - chiseledTexture.data[ offset + 2 ]! );
			if ( difference > 12 ) changedPixels ++;

		}

		expect( changedPixels ).toBeGreaterThan( smoothTexture.width * smoothTexture.height * 0.08 );

	} );

	it( 'keeps brush detail subordinate to broad stone facets', () => {

		const rockOne = createRockTextures( 1 );
		const textures = createRockTextures( 2 );
		const contrasts = tileTextureContrasts( textures.albedo.data, textures.albedo.width, textures.albedo.width / 8 ).sort( ( first, second ) => first - second );
		const quietContrast = contrasts.slice( 0, 16 ).reduce( ( total, value ) => total + value, 0 ) / 16;
		const detailedContrast = contrasts.slice( - 16 ).reduce( ( total, value ) => total + value, 0 ) / 16;

		expect( detailedContrast ).toBeGreaterThan( quietContrast * 1.2 );
		expect( meanNeighborDelta( rockOne.albedo.data, rockOne.albedo.width, rockOne.albedo.height, 1 ) ).toBeLessThan( 2.2 );
		expect( meanNeighborDelta( textures.albedo.data, textures.albedo.width, textures.albedo.height, 1 ) ).toBeLessThan( 2.2 );

	}, 30000 );

	it( 'keeps albedo similar across top, side and underside facets', () => {

		const data = generateRockData( { seed: 3 } );
		const texture = data.textures[ data.parts[ 0 ]!.texture! ]!;
		const mesh = data.lods[ 0 ]!;
		const means = [ 0, 0, 0 ];
		const counts = [ 0, 0, 0 ];

		for ( let vertex = 0; vertex < vertexCount( mesh ); vertex ++ ) {

			const normalY = mesh.normals[ vertex * 3 + 1 ]!;
			const region = normalY > 0.7 ? 0 : normalY < - 0.3 ? 2 : Math.abs( normalY ) < 0.2 ? 1 : - 1;
			if ( region < 0 ) continue;
			const u = ( ( mesh.uvs[ vertex * 2 ]! % 1 ) + 1 ) % 1;
			const v = Math.max( 0, Math.min( 1, mesh.uvs[ vertex * 2 + 1 ]! ) );
			const pixel = ( Math.min( texture.height - 1, Math.floor( v * texture.height ) ) * texture.width + Math.floor( u * texture.width ) ) * 4;
			means[ region ]! += ( texture.data[ pixel ]! + texture.data[ pixel + 1 ]! + texture.data[ pixel + 2 ]! ) / 3;
			counts[ region ]! ++;

		}

		for ( let region = 0; region < means.length; region ++ ) means[ region ]! /= counts[ region ]!;
		const fineContrast = meanNeighborDelta( texture.data, texture.width, texture.height, 1 );

		expect( Math.abs( means[ 0 ]! - means[ 1 ]! ), `up ${ means[ 0 ] }, side ${ means[ 1 ] }` ).toBeLessThan( 20 );
		if ( counts[ 2 ]! > 0 ) expect( Math.abs( means[ 1 ]! - means[ 2 ]! ) ).toBeLessThan( 20 );
		expect( fineContrast ).toBeLessThan( 2.2 );

	}, 30000 );

	it( 'builds a few long tapered recessed cracks that cross stone facets', () => {

		const paths = createRockCrackPaths( 9, Math.PI / 4, () => 1 );
		const mainPaths = paths.filter( ( path ) => ! path.branch );
		let sharpTurns = 0;

		expect( mainPaths.length ).toBeGreaterThanOrEqual( 2 );
		expect( mainPaths.length ).toBeLessThanOrEqual( 4 );
		expect( paths.every( ( path ) => ! path.branch ) ).toBe( true );

		for ( const path of paths ) {

			const widths = [ path.segments[ 0 ]!.width0, ...path.segments.map( ( segment ) => segment.width1 ) ];
			expect( widths[ 0 ] ).toBe( 0 );
			expect( widths[ widths.length - 1 ] ).toBe( 0 );
			expect( Math.max( ...widths ) ).toBeGreaterThanOrEqual( 0.0058 );
			expect( Math.max( ...widths ) ).toBeLessThanOrEqual( 0.0068 );
			expect( new Set( widths ).size ).toBeGreaterThan( 1 );

			const pathLength = path.points.slice( 1 ).reduce( ( length, point, index ) => {

				const previous = path.points[ index ]!;
				return length + Math.hypot( point.u - previous.u, point.v - previous.v );

			}, 0 );

			expect( pathLength ).toBeGreaterThanOrEqual( 0.19 );
			expect( pathLength ).toBeLessThanOrEqual( 0.32 );

			for ( let index = 1; index < path.points.length - 1; index ++ ) {

				const previous = path.points[ index - 1 ]!;
				const current = path.points[ index ]!;
				const next = path.points[ index + 1 ]!;
				const firstAngle = Math.atan2( current.v - previous.v, current.u - previous.u );
				const secondAngle = Math.atan2( next.v - current.v, next.u - current.u );
				const turn = Math.abs( Math.atan2( Math.sin( secondAngle - firstAngle ), Math.cos( secondAngle - firstAngle ) ) );

				if ( turn > 0.5 ) sharpTurns ++;

			}

		}

		expect( sharpTurns ).toBeGreaterThan( 1 );
		expect( createRockCrackPaths( 9, Math.PI / 4, () => 1 ) ).toEqual( paths );
		expect( createRockCrackPaths( 10, Math.PI / 4, () => 1 ) ).not.toEqual( paths );
		const anchoredPaths = createRockCrackPaths( 9, Math.PI / 4, () => 1, { u: 0.75, v: 0.5 } );
		const anchorDistance = Math.abs( anchoredPaths[ 0 ]!.points[ 0 ]!.u - 0.75 );
		expect( Math.min( anchorDistance, 1 - anchorDistance ) ).toBeLessThan( 0.1 );
		expect( Math.abs( anchoredPaths[ 0 ]!.points[ 0 ]!.v - 0.5 ) ).toBeLessThan( 0.1 );

		const textures = createRockTextures( 9 );
		expect( textures.albedo.width ).toBe( 1024 );
		expect( textures.normal.width ).toBe( 1024 );

	} );

	it( 'anchors visible cracks on the camera-facing side of the rock', () => {

		for ( let seed = 1; seed <= 8; seed ++ ) {

			const frontUv = findRockFrontUv( generateRockData( { seed } ).lods[ 0 ]! );
			expect( frontUv, `seed ${ seed } crack anchor` ).toBeDefined();
			expect( Math.abs( frontUv!.v - 0.5 ), `seed ${ seed } side crack anchor` ).toBeLessThan( 0.06 );

		}

	}, 15000 );

	it( 'keeps the few long crack grooves visible as narrow dark paths', () => {

		const texture = createRockTextures( 9, 256 ).albedo;
		const grooves = darkPixelComponents( texture.data, texture.width, 158 );

		expect( grooves.coverage ).toBeGreaterThan( 0.001 );
		expect( grooves.span ).toBeGreaterThan( 0.12 );
		expect( grooves.span ).toBeLessThan( 0.45 );
		expect( grooves.largest ).toBeLessThan( 0.02 );

	} );

	it( 'responds to size and flatness and rejects invalid dimensions', () => {

		withSharedRockTextures( () => {

			const round = generateRockData( { size: 6, flatness: 0 } );
			const flat = generateRockData( { size: 6, flatness: 1 } );
			expect( flat.bounds.height ).toBeLessThan( round.bounds.height );
			expect( generateRockData( { size: 8 } ).bounds.radius ).toBeGreaterThan( round.bounds.radius );
			expect( () => generateRockData( { size: 0 } ) ).toThrow( RangeError );
			expect( () => generateRockData( { roughness: Number.NaN } ) ).toThrow( RangeError );

		} );

	}, 30000 );

	it( 'generates and textures within the 50 ms budget after warm-up', () => {

		generateRockData( { seed: 1 } );
		const samples: number[] = [];

		for ( let iteration = 0; iteration < 5; iteration ++ ) {

			const start = performance.now();
			generateRockData( { seed: 1 } );
			samples.push( performance.now() - start );

		}

		samples.sort( ( a, b ) => a - b );
		expect( samples[ 2 ] ).toBeLessThan( 50 );
		expect( samples[ 4 ] ).toBeLessThan( 50 );

	} );

} );
