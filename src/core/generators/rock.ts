import { createRockTextures, DEFAULT_MOSS_COLOR } from '../rockTexture';
import { buildBillboard, impostorPart } from '../impostor';
import { applyRockWeathering, buildConvexHullFaces, buildRockHullMesh, buildRockHullMeshWithChamfers, clamp, createRockHullShape, getBounds, getIdenticalVertexWeld, getMinimumY, isRockScoopInterior, liftMesh, limitRockPeakSharpness, recomputeChamferedRockHullNormals, removeRockBottomCap, recomputeCreasedNormals, sinkMesh, splitChamferedRockHullVerticesAtCreases, weldIdenticalVertices } from '../rockGeometry';
import type { RockHullShape, RockUvFrame } from '../rockGeometry';
import type { ColliderData, MeshData, PartDef, VegetationData } from '../types';

const ROCK_SEED_SALT = 62;

export interface RockOptions {
	seed?: number;
	size?: number;
	roughness?: number;
	flatness?: number;
	/** 凸部の角を丸める量（0〜1）。既定値は0.25。 */
	weathering?: number;
	/** 地中に沈める全体高の割合（0〜1）。 */
	burial?: number;
	/** 底面も簡略化せず閉じた形状にする。既定値はfalse（地中の底面を省く）。 */
	closeBottom?: boolean;
	rockColor?: number;
	/** 苔のおおわれ率（0〜1）。既定値は0。 */
	moss?: number;
	/** 苔の色。既定値は0x7cb83a。 */
	mossColor?: number;
}

function getDefaultBurial( seed: number ): number {

	const seedHash = Math.sin( Math.abs( seed ) * 127.1 + 311.7 ) * 43758.5453;
	const variation = seedHash - Math.floor( seedHash );
	return 0.39 + variation * 0.06;

}

function buildCollider( mesh: MeshData ): ColliderData {

	const vertices = new Map<string, number>();
	const positions: number[] = [];
	const indices = Array.from( mesh.indices, ( index ) => {

		const offset = index * 3;
		const x = mesh.positions[ offset ]!;
		const y = mesh.positions[ offset + 1 ]!;
		const z = mesh.positions[ offset + 2 ]!;
		const key = `${ x.toFixed( 7 ) },${ y.toFixed( 7 ) },${ z.toFixed( 7 ) }`;
		let vertex = vertices.get( key );

		if ( vertex === undefined ) {

			vertex = positions.length / 3;
			vertices.set( key, vertex );
			positions.push( x, y, z );

		}

		return vertex;

	} );

	return { positions: new Float32Array( positions ), indices: new Uint32Array( indices ) };

}

const LOD3_SILHOUETTE_DIRECTIONS = Array.from( { length: 8 }, ( _, index ) => {

	const angle = index / 8 * Math.PI * 2;
	return [ Math.cos( angle ), Math.sin( angle ) ] as [ number, number ];

} );

interface AboveGroundMetric {
	volume: number;
	silhouette: number[];
}

function getClosedSurfaceMetric( mesh: MeshData, size: number ): AboveGroundMetric {

	let signedVolume = 0;
	let minimumY = Infinity;
	let maximumY = - Infinity;
	for ( let offset = 1; offset < mesh.positions.length; offset += 3 ) {
		minimumY = Math.min( minimumY, mesh.positions[ offset ]! );
		maximumY = Math.max( maximumY, mesh.positions[ offset ]! );
	}

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {
		const first = mesh.indices[ offset ]! * 3;
		const second = mesh.indices[ offset + 1 ]! * 3;
		const third = mesh.indices[ offset + 2 ]! * 3;
		const ax = mesh.positions[ first ]!;
		const ay = mesh.positions[ first + 1 ]!;
		const az = mesh.positions[ first + 2 ]!;
		const bx = mesh.positions[ second ]!;
		const by = mesh.positions[ second + 1 ]!;
		const bz = mesh.positions[ second + 2 ]!;
		const cx = mesh.positions[ third ]!;
		const cy = mesh.positions[ third + 1 ]!;
		const cz = mesh.positions[ third + 2 ]!;
		signedVolume += ( ax * ( by * cz - bz * cy ) + ay * ( bz * cx - bx * cz ) + az * ( bx * cy - by * cx ) ) / 6;
	}

	const silhouette: number[] = [];
	const elevationCount = 5;
	const supports = new Array<number>( LOD3_SILHOUETTE_DIRECTIONS.length );
	for ( let elevation = 0; elevation < elevationCount; elevation ++ ) {
		const height = minimumY + ( maximumY - minimumY ) * elevation / ( elevationCount - 1 );
		supports.fill( - size );
		let hasIntersection = false;
		for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {
			for ( let edge = 0; edge < 3; edge ++ ) {
				const firstVertex = mesh.indices[ offset + edge ]! * 3;
				const secondVertex = mesh.indices[ offset + ( edge + 1 ) % 3 ]! * 3;
				const firstX = mesh.positions[ firstVertex ]!;
				const firstY = mesh.positions[ firstVertex + 1 ]!;
				const firstZ = mesh.positions[ firstVertex + 2 ]!;
				const secondX = mesh.positions[ secondVertex ]!;
				const secondY = mesh.positions[ secondVertex + 1 ]!;
				const secondZ = mesh.positions[ secondVertex + 2 ]!;
				const firstDelta = firstY - height;
				const secondDelta = secondY - height;
				let intersectionX = firstX;
				let intersectionZ = firstZ;
				if ( ( firstDelta < 0 && secondDelta > 0 ) || ( firstDelta > 0 && secondDelta < 0 ) ) {
					const amount = - firstDelta / ( secondDelta - firstDelta );
					intersectionX = firstX + ( secondX - firstX ) * amount;
					intersectionZ = firstZ + ( secondZ - firstZ ) * amount;
					hasIntersection = true;
				} else if ( Math.abs( firstDelta ) < 1e-7 ) hasIntersection = true;
				else continue;

				for ( let direction = 0; direction < LOD3_SILHOUETTE_DIRECTIONS.length; direction ++ ) {
					const directionX = LOD3_SILHOUETTE_DIRECTIONS[ direction ]![ 0 ];
					const directionZ = LOD3_SILHOUETTE_DIRECTIONS[ direction ]![ 1 ];
					supports[ direction ] = Math.max( supports[ direction ]!, intersectionX * directionX + intersectionZ * directionZ );
				}
			}
		}
		if ( ! hasIntersection ) supports.fill( - size );
		for ( const support of supports ) silhouette.push( support );
	}

	return { volume: Math.abs( signedVolume ), silhouette };

}

function buildLod3Mesh( shape: RockHullShape, faces: [ number, number, number ][], groundOffset: number, burialHeight: number, skirtFloor: number, unwrapSeams: boolean, uvFrame?: RockUvFrame, closeBottom = false ): MeshData {

	const mesh = buildRockHullMesh( shape, faces, 0, 0, 0, unwrapSeams, uvFrame );
	liftMesh( mesh, groundOffset );
	sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
	if ( ! closeBottom ) removeRockBottomCap( mesh, skirtFloor );
	return mesh;

}

function buildLod3Candidate( shape: RockHullShape, faces: [ number, number, number ][], groundOffset: number, burialHeight: number, skirtFloor: number, closeBottom = false ): { mesh: MeshData; triangleCount: number } {

	const mesh = buildRockHullMesh( shape, faces, 0, 0, 0, false, undefined, true );
	liftMesh( mesh, groundOffset );
	sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
	let triangleCount = 0;

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		if ( ! closeBottom && isBottomCapTriangle( mesh, offset, skirtFloor ) ) continue;
		triangleCount ++;

	}

	return { mesh, triangleCount };

}

function isBottomCapTriangle( mesh: MeshData, triangleOffset: number, floor: number ): boolean {

	const first = mesh.positions[ mesh.indices[ triangleOffset ]! * 3 + 1 ]!;
	const second = mesh.positions[ mesh.indices[ triangleOffset + 1 ]! * 3 + 1 ]!;
	const third = mesh.positions[ mesh.indices[ triangleOffset + 2 ]! * 3 + 1 ]!;
	return first <= floor + 1e-6 && second <= floor + 1e-6 && third <= floor + 1e-6;

}

function getAboveGroundMetric( mesh: MeshData, size: number, silhouetteHeight: number, skirtFloor: number ): AboveGroundMetric {

	let signedVolume = 0;
	const clippedX = [ 0, 0, 0, 0 ];
	const clippedY = [ 0, 0, 0, 0 ];
	const clippedZ = [ 0, 0, 0, 0 ];
	const pointOffsets = [ 0, 0, 0 ];
	const x = [ 0, 0, 0 ];
	const y = [ 0, 0, 0 ];
	const z = [ 0, 0, 0 ];

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		if ( isBottomCapTriangle( mesh, offset, skirtFloor ) ) continue;

		pointOffsets[ 0 ] = mesh.indices[ offset ]! * 3;
		pointOffsets[ 1 ] = mesh.indices[ offset + 1 ]! * 3;
		pointOffsets[ 2 ] = mesh.indices[ offset + 2 ]! * 3;
		for ( let point = 0; point < 3; point ++ ) {

			x[ point ] = mesh.positions[ pointOffsets[ point ]! ]!;
			y[ point ] = mesh.positions[ pointOffsets[ point ]! + 1 ]!;
			z[ point ] = mesh.positions[ pointOffsets[ point ]! + 2 ]!;

		}

		let clippedCount = 0;

		for ( let edge = 0; edge < 3; edge ++ ) {

			const next = ( edge + 1 ) % 3;
			const firstInside = y[ edge ]! >= 0;
			const secondInside = y[ next ]! >= 0;

			if ( firstInside ) {

				clippedX[ clippedCount ] = x[ edge ]!;
				clippedY[ clippedCount ] = y[ edge ]!;
				clippedZ[ clippedCount ++ ] = z[ edge ]!;

			}

			if ( firstInside !== secondInside ) {

				const amount = - y[ edge ]! / ( y[ next ]! - y[ edge ]! );
				clippedX[ clippedCount ] = x[ edge ]! + ( x[ next ]! - x[ edge ]! ) * amount;
				clippedY[ clippedCount ] = 0;
				clippedZ[ clippedCount ++ ] = z[ edge ]! + ( z[ next ]! - z[ edge ]! ) * amount;

			}

		}

		for ( let index = 1; index < clippedCount - 1; index ++ ) {

			const firstX = clippedX[ 0 ]!;
			const firstY = clippedY[ 0 ]!;
			const firstZ = clippedZ[ 0 ]!;
			const secondX = clippedX[ index ]!;
			const secondY = clippedY[ index ]!;
			const secondZ = clippedZ[ index ]!;
			const thirdX = clippedX[ index + 1 ]!;
			const thirdY = clippedY[ index + 1 ]!;
			const thirdZ = clippedZ[ index + 1 ]!;
			signedVolume += ( firstX * ( secondY * thirdZ - secondZ * thirdY ) + firstY * ( secondZ * thirdX - secondX * thirdZ ) + firstZ * ( secondX * thirdY - secondY * thirdX ) ) / 6;

		}

	}

	const silhouette: number[] = [];
	const elevationCount = 3;
	const supports = new Array<number>( LOD3_SILHOUETTE_DIRECTIONS.length );

	for ( let elevation = 0; elevation < elevationCount; elevation ++ ) {

		const height = silhouetteHeight * elevation / ( elevationCount - 1 );
		supports.fill( - size );
		let hasIntersection = false;

		for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

			if ( isBottomCapTriangle( mesh, offset, skirtFloor ) ) continue;

			for ( let edge = 0; edge < 3; edge ++ ) {

				const firstVertex = mesh.indices[ offset + edge ]! * 3;
				const secondVertex = mesh.indices[ offset + ( edge + 1 ) % 3 ]! * 3;
				const firstX = mesh.positions[ firstVertex ]!;
				const firstY = mesh.positions[ firstVertex + 1 ]!;
				const firstZ = mesh.positions[ firstVertex + 2 ]!;
				const secondX = mesh.positions[ secondVertex ]!;
				const secondY = mesh.positions[ secondVertex + 1 ]!;
				const secondZ = mesh.positions[ secondVertex + 2 ]!;
				const firstDelta = firstY - height;
				const secondDelta = secondY - height;
				let intersectionX = firstX;
				let intersectionZ = firstZ;

				if ( ( firstDelta < 0 && secondDelta > 0 ) || ( firstDelta > 0 && secondDelta < 0 ) ) {

					const amount = - firstDelta / ( secondDelta - firstDelta );
					intersectionX = firstX + ( secondX - firstX ) * amount;
					intersectionZ = firstZ + ( secondZ - firstZ ) * amount;
					hasIntersection = true;

				} else if ( Math.abs( firstDelta ) < 1e-7 ) {

					hasIntersection = true;

				} else {

					continue;

				}

				for ( let direction = 0; direction < LOD3_SILHOUETTE_DIRECTIONS.length; direction ++ ) {

					const directionX = LOD3_SILHOUETTE_DIRECTIONS[ direction ]![ 0 ];
					const directionZ = LOD3_SILHOUETTE_DIRECTIONS[ direction ]![ 1 ];
					supports[ direction ] = Math.max( supports[ direction ]!, intersectionX * directionX + intersectionZ * directionZ );

				}

			}

		}

		if ( ! hasIntersection ) supports.fill( - size );
		for ( const support of supports ) silhouette.push( support );

	}

	return { volume: Math.abs( signedVolume ), silhouette };

}

function aboveGroundLoss( current: AboveGroundMetric, candidate: AboveGroundMetric, size: number ): number {

	const volumeScale = Math.max( current.volume, size * size * size * 1e-8 );
	let silhouetteDifference = 0;
	for ( let index = 0; index < current.silhouette.length; index ++ ) silhouetteDifference += ( current.silhouette[ index ]! - candidate.silhouette[ index ]! ) ** 2;
	const silhouetteScale = Math.sqrt( silhouetteDifference / Math.max( 1, current.silhouette.length ) ) / size;
	return Math.abs( current.volume - candidate.volume ) / volumeScale + silhouetteScale;

}

interface ReducedRockMesh {
	mesh: MeshData;
	shape: RockHullShape;
	faces: [ number, number, number ][];
	triangleCount: number;
}

function reduceRockLod3( shape: RockHullShape, initialFaces: [ number, number, number ][], groundOffset: number, burialHeight: number, skirtFloor: number, silhouetteHeight: number, uvFrame: RockUvFrame, targetTriangles = 22, minimumTriangles = 16, closeBottom = false ): ReducedRockMesh {

	let currentShape = shape;
	let currentFaces = initialFaces;
	let currentCandidate = buildLod3Candidate( currentShape, currentFaces, groundOffset, burialHeight, skirtFloor, closeBottom );
	let currentMetric = closeBottom ? getClosedSurfaceMetric( currentCandidate.mesh, shape.size ) : getAboveGroundMetric( currentCandidate.mesh, shape.size, silhouetteHeight, skirtFloor );

	while ( currentCandidate.triangleCount > targetTriangles ) {

		let bestLoss = Infinity;
		let bestShape: RockHullShape | undefined;
		let bestFaces: [ number, number, number ][] | undefined;
		let bestCandidate: { mesh: MeshData; triangleCount: number } | undefined;
		let bestMetric: AboveGroundMetric | undefined;
		const hullPoints = [ ...new Set( currentFaces.flat() ) ].sort( ( first, second ) => first - second );

		for ( const removedPoint of hullPoints ) {

			if ( currentShape.points.length <= 4 ) continue;
			const points = currentShape.points.filter( ( _, index ) => index !== removedPoint );
			let faces: [ number, number, number ][];

			try {

				faces = buildConvexHullFaces( points );

			} catch {

				continue;

			}

			const candidateShape = { ...currentShape, points };
			const candidate = buildLod3Candidate( candidateShape, faces, groundOffset, burialHeight, skirtFloor, closeBottom );
			if ( candidate.triangleCount < minimumTriangles ) continue;

			const candidateMetric = closeBottom ? getClosedSurfaceMetric( candidate.mesh, shape.size ) : getAboveGroundMetric( candidate.mesh, shape.size, silhouetteHeight, skirtFloor );
			const loss = aboveGroundLoss( currentMetric, candidateMetric, shape.size );
			if ( loss >= bestLoss ) continue;

			bestLoss = loss;
			bestShape = candidateShape;
			bestFaces = faces;
			bestCandidate = candidate;
			bestMetric = candidateMetric;

		}

		if ( bestShape === undefined || bestFaces === undefined || bestCandidate === undefined || bestMetric === undefined ) break;
		currentShape = bestShape;
		currentFaces = bestFaces;
		currentCandidate = bestCandidate;
		currentMetric = bestMetric;

	}

	return {
		mesh: buildLod3Mesh( currentShape, currentFaces, groundOffset, burialHeight, skirtFloor, true, uvFrame, closeBottom ),
		shape: currentShape,
		faces: currentFaces,
		triangleCount: currentCandidate.triangleCount,
	};

}

function getLod1SubdivisionOrder( shape: RockHullShape, faces: [ number, number, number ][], verticalOffset: number, closeBottom = false ): number[] {

	const sourceVertices = new Map<number, number>();
	for ( const face of faces ) {

		for ( const source of face ) {

			if ( ! sourceVertices.has( source ) ) sourceVertices.set( source, sourceVertices.size );

		}

	}
	const mesh = buildRockHullMesh( shape, faces, 0, 0, 0, false );
	const aboveGroundArea = ( face: [ number, number, number ] ): number => {

		const points = face.map( ( source ) => {

			const offset = sourceVertices.get( source )! * 3;
			return [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]! + verticalOffset, mesh.positions[ offset + 2 ]! ] as [ number, number, number ];

		} );
		const clipped: [ number, number, number ][] = [];

		for ( let edge = 0; edge < 3; edge ++ ) {

			const first = points[ edge ]!;
			const second = points[ ( edge + 1 ) % 3 ]!;
			const firstInside = first[ 1 ] >= 0;
			const secondInside = second[ 1 ] >= 0;
			if ( firstInside ) clipped.push( first );

			if ( firstInside !== secondInside ) {

				const amount = - first[ 1 ] / ( second[ 1 ] - first[ 1 ] );
				clipped.push( [ first[ 0 ] + ( second[ 0 ] - first[ 0 ] ) * amount, 0, first[ 2 ] + ( second[ 2 ] - first[ 2 ] ) * amount ] );

			}

		}
		let area = 0;

		for ( let index = 1; index < clipped.length - 1; index ++ ) {

			const first = clipped[ 0 ]!;
			const second = clipped[ index ]!;
			const third = clipped[ index + 1 ]!;
			const ab = [ second[ 0 ] - first[ 0 ], second[ 1 ] - first[ 1 ], second[ 2 ] - first[ 2 ] ];
			const ac = [ third[ 0 ] - first[ 0 ], third[ 1 ] - first[ 1 ], third[ 2 ] - first[ 2 ] ];
			area += Math.hypot( ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ) * 0.5;

		}

		return area;

	};
	const wholeFaceArea = ( face: [ number, number, number ] ): number => {

		const points = face.map( ( source ) => {
			const offset = sourceVertices.get( source )! * 3;
			return [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]! + verticalOffset, mesh.positions[ offset + 2 ]! ] as [ number, number, number ];
		} );
		const ab = [ points[ 1 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 1 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 1 ]![ 2 ] - points[ 0 ]![ 2 ] ];
		const ac = [ points[ 2 ]![ 0 ] - points[ 0 ]![ 0 ], points[ 2 ]![ 1 ] - points[ 0 ]![ 1 ], points[ 2 ]![ 2 ] - points[ 0 ]![ 2 ] ];
		return Math.hypot( ab[ 1 ]! * ac[ 2 ]! - ab[ 2 ]! * ac[ 1 ]!, ab[ 2 ]! * ac[ 0 ]! - ab[ 0 ]! * ac[ 2 ]!, ab[ 0 ]! * ac[ 1 ]! - ab[ 1 ]! * ac[ 0 ]! ) * 0.5;

	};

	return faces.map( ( face, faceIndex ) => ( { faceIndex, area: closeBottom ? wholeFaceArea( face ) : aboveGroundArea( face ) } ) )
		.sort( ( first, second ) => second.area - first.area || first.faceIndex - second.faceIndex )
		.map( ( entry ) => entry.faceIndex );

}

function padRockImpostorCard( mesh: MeshData ): void {

	if ( mesh.impostorCard.length !== mesh.positions.length / 3 ) {

		if ( mesh.impostorCard.some( ( value ) => value !== 0 ) ) throw new RangeError( 'Rock impostor-card data must use the default value' );
		mesh.impostorCard = new Float32Array( mesh.positions.length / 3 );

	}

}

function splitRockWideUvTriangles( mesh: MeshData ): void {

	const positions = Array.from( mesh.positions );
	const normals = Array.from( mesh.normals );
	const uvs = Array.from( mesh.uvs );
	const colors = Array.from( mesh.colors );
	const windWeight = Array.from( mesh.windWeight );
	const impostorCard = Array.from( mesh.impostorCard );
	const positionKey = ( vertex: number ): string => `${ positions[ vertex * 3 ]!.toFixed( 6 ) },${ positions[ vertex * 3 + 1 ]!.toFixed( 6 ) },${ positions[ vertex * 3 + 2 ]!.toFixed( 6 ) }`;
	const edgeKey = ( first: number, second: number ): string => {
		const firstKey = positionKey( first );
		const secondKey = positionKey( second );
		return firstKey < secondKey ? `${ firstKey }|${ secondKey }` : `${ secondKey }|${ firstKey }`;
	};
	const addInterpolatedVertex = ( vertices: number[] ): number => {
		const target = positions.length / 3;
		for ( let axis = 0; axis < 3; axis ++ ) {
			positions.push( vertices.reduce( ( total, vertex ) => total + positions[ vertex * 3 + axis ]! / vertices.length, 0 ) );
			colors.push( vertices.reduce( ( total, vertex ) => total + colors[ vertex * 3 + axis ]! / vertices.length, 0 ) );
		}
		const normal: [ number, number, number ] = [ 0, 0, 0 ];
		for ( const vertex of vertices ) {
			for ( let axis = 0; axis < 3; axis ++ ) normal[ axis ] = normal[ axis ]! + normals[ vertex * 3 + axis ]! / vertices.length;
		}
		const normalLength = Math.hypot( ...normal ) || 1;
		normals.push( normal[ 0 ] / normalLength, normal[ 1 ] / normalLength, normal[ 2 ] / normalLength );
		for ( let axis = 0; axis < 2; axis ++ ) uvs.push( vertices.reduce( ( total, vertex ) => total + uvs[ vertex * 2 + axis ]! / vertices.length, 0 ) );
		windWeight.push( vertices.reduce( ( total, vertex ) => total + windWeight[ vertex ]! / vertices.length, 0 ) );
		impostorCard.push( vertices.reduce( ( total, vertex ) => total + impostorCard[ vertex ]! / vertices.length, 0 ) );
		return target;
	};
	let groups = mesh.groups.map( ( group ) => ( { ...group } ) );
	let indices = Array.from( mesh.indices );

	for ( let pass = 0; pass < 8; pass ++ ) {

		const splitEdges = new Set<string>();
		for ( const group of groups ) {
			for ( let offset = group.start; offset < group.start + group.count; offset += 3 ) {
				const vertices = [ indices[ offset ]!, indices[ offset + 1 ]!, indices[ offset + 2 ]! ];
				for ( let edge = 0; edge < 3; edge ++ ) {
					const first = vertices[ edge ]!;
					const second = vertices[ ( edge + 1 ) % 3 ]!;
					if ( Math.abs( uvs[ first * 2 ]! - uvs[ second * 2 ]! ) > 0.55 ) splitEdges.add( edgeKey( first, second ) );
				}
			}
		}
		if ( splitEdges.size === 0 ) break;

		const nextIndices: number[] = [];
		const nextGroups: MeshData[ 'groups' ] = [];
		for ( const group of groups ) {
			const start = nextIndices.length;
			for ( let offset = group.start; offset < group.start + group.count; offset += 3 ) {
				const vertices = [ indices[ offset ]!, indices[ offset + 1 ]!, indices[ offset + 2 ]! ];
				const marked = [ 0, 1, 2 ].map( ( edge ) => splitEdges.has( edgeKey( vertices[ edge ]!, vertices[ ( edge + 1 ) % 3 ]! ) ) );
				const markedCount = marked.filter( Boolean ).length;
				if ( markedCount === 0 ) {
					nextIndices.push( ...vertices );
					continue;
				}
				const midpoints = marked.map( ( isMarked, edge ) => isMarked ? addInterpolatedVertex( [ vertices[ edge ]!, vertices[ ( edge + 1 ) % 3 ]! ] ) : - 1 );
				if ( markedCount === 1 ) {
					const edge = marked.indexOf( true );
					const next = ( edge + 1 ) % 3;
					const third = ( edge + 2 ) % 3;
					nextIndices.push( vertices[ edge ]!, midpoints[ edge ]!, vertices[ third ]!, midpoints[ edge ]!, vertices[ next ]!, vertices[ third ]! );
					continue;
				}
				const boundary: number[] = [];
				for ( let edge = 0; edge < 3; edge ++ ) {
					boundary.push( vertices[ edge ]! );
					if ( marked[ edge ] ) boundary.push( midpoints[ edge ]! );
				}
				const center = addInterpolatedVertex( vertices );
				for ( let edge = 0; edge < boundary.length; edge ++ ) nextIndices.push( center, boundary[ edge ]!, boundary[ ( edge + 1 ) % boundary.length ]! );
			}
			nextGroups.push( { ...group, start, count: nextIndices.length - start } );
		}
		indices = nextIndices;
		groups = nextGroups;

	}

	mesh.positions = Float32Array.from( positions );
	mesh.normals = Float32Array.from( normals );
	mesh.uvs = Float32Array.from( uvs );
	mesh.colors = Float32Array.from( colors );
	mesh.windWeight = Float32Array.from( windWeight );
	mesh.impostorCard = Float32Array.from( impostorCard );
	mesh.indices = Uint32Array.from( indices );
	mesh.groups = groups;

}

function prepareClosedRockLod( mesh: MeshData ): void {

	splitRockWideUvTriangles( mesh );
	recomputeCreasedNormals( mesh, 35 );
	padRockImpostorCard( mesh );

}

function buildRockLod1( shape: RockHullShape, faces: [ number, number, number ][], groundOffset: number, burialHeight: number, skirtFloor: number, weathering: number, uvFrame: RockUvFrame, creaseOutsideScoops: ( position: [ number, number, number ] ) => boolean, targetVertices: number, closeBottom = false ): MeshData {

	const subdivisionOrder = getLod1SubdivisionOrder( shape, faces, groundOffset - burialHeight, closeBottom );
	let lower = 0;
	let upper = subdivisionOrder.length;
	let bestMesh: MeshData | undefined;
	let bestDistance = Infinity;

	while ( lower <= upper ) {

		const subdivisionCount = Math.floor( ( lower + upper ) * 0.5 );
		const subdividedFaces = new Set( subdivisionOrder.slice( 0, subdivisionCount ) );
		const mesh = buildRockHullMesh( shape, faces, 1, 0, weathering, true, uvFrame, false, subdividedFaces );
		liftMesh( mesh, groundOffset );
		applyRockWeathering( mesh, weathering );
		limitRockPeakSharpness( mesh, weathering, 125, closeBottom );
		sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
		if ( ! closeBottom ) removeRockBottomCap( mesh, skirtFloor );
		recomputeCreasedNormals( mesh, 35, creaseOutsideScoops );
		padRockImpostorCard( mesh );

		const vertices = getIdenticalVertexWeld( mesh ).uniqueVertices.length;
		const distance = Math.abs( vertices - targetVertices );

		if ( distance < bestDistance ) {

			bestMesh = mesh;
			bestDistance = distance;

		}

		if ( vertices === targetVertices ) break;
		if ( vertices < targetVertices ) lower = subdivisionCount + 1;
		else upper = subdivisionCount - 1;

	}

	return bestMesh!;

}

export function generateRockData( options: RockOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const internalSeed = seed + ROCK_SEED_SALT;
	const size = options.size ?? 6.4;
	const roughnessInput = options.roughness ?? 1.2;
	const flatnessInput = options.flatness ?? 0.04;
	const weatheringInput = options.weathering ?? 0.25;
	const burial = options.burial ?? getDefaultBurial( internalSeed );
	const closeBottom = options.closeBottom ?? false;
	const rockColor = options.rockColor ?? 0xffffff;
	const moss = options.moss ?? 0;
	const mossColor = options.mossColor ?? DEFAULT_MOSS_COLOR;

	if ( ! Number.isFinite( seed ) ) throw new RangeError( 'Rock seed must be finite' );
	if ( ! Number.isFinite( size ) || size <= 0 ) throw new RangeError( 'Rock size must be a positive finite number' );
	if ( ! Number.isFinite( roughnessInput ) ) throw new RangeError( 'Rock roughness must be finite' );
	if ( ! Number.isFinite( flatnessInput ) ) throw new RangeError( 'Rock flatness must be finite' );
	if ( ! Number.isFinite( weatheringInput ) || weatheringInput < 0 || weatheringInput > 1 ) throw new RangeError( 'Rock weathering must be a value from 0 to 1' );
	if ( ! Number.isFinite( burial ) || burial < 0 || burial > 1 ) throw new RangeError( 'Rock burial must be a finite value from 0 to 1' );
	if ( options.closeBottom !== undefined && typeof options.closeBottom !== 'boolean' ) throw new RangeError( 'Rock closeBottom must be a boolean' );
	if ( ! Number.isInteger( rockColor ) || rockColor < 0 || rockColor > 0xffffff ) throw new RangeError( 'Rock color must be a 24-bit integer' );
	if ( ! Number.isFinite( moss ) || moss < 0 || moss > 1 ) throw new RangeError( 'Rock moss must be a finite value from 0 to 1' );
	if ( ! Number.isInteger( mossColor ) || mossColor < 0 || mossColor > 0xffffff ) throw new RangeError( 'Rock moss color must be a 24-bit integer' );

	const roughness = clamp( roughnessInput, 0, 1.5 );
	const flatness = clamp( flatnessInput, 0, 1 );
	const weathering = clamp( weatheringInput, 0, 1 );
	const shape = createRockHullShape( internalSeed, size, roughness, flatness, closeBottom );
	const hullFaces = buildConvexHullFaces( shape.points );
	const bevelWidth = size * 0.04;
	const chamferedLod0 = buildRockHullMeshWithChamfers( shape, hullFaces, bevelWidth, weathering );
	const lod0 = chamferedLod0.mesh;
	const uvFrame = chamferedLod0.uvFrame;
	const lod2Source = buildRockHullMesh( shape, hullFaces, 0, 0, weathering, true, uvFrame );
	const colliderMesh = buildRockHullMesh( shape, hullFaces, 0, 0, weathering, false );
	const groundOffset = - getMinimumY( lod0.positions );

	for ( const mesh of [ lod0, lod2Source, colliderMesh ] ) liftMesh( mesh, groundOffset );
	for ( const mesh of [ lod0, lod2Source ] ) applyRockWeathering( mesh, weathering );
	for ( const mesh of [ lod0, lod2Source ] ) limitRockPeakSharpness( mesh, weathering, 125, closeBottom );

	let fullHeight = 0;
	for ( let offset = 1; offset < lod0.positions.length; offset += 3 ) fullHeight = Math.max( fullHeight, lod0.positions[ offset ]! );
	const burialHeight = burial * fullHeight;
	const skirtFloor = - Math.min( burial, 0.14 ) * fullHeight;

	for ( const mesh of [ lod0, lod2Source ] ) {

		sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
		if ( ! closeBottom ) removeRockBottomCap( mesh, skirtFloor );

	}

	sinkMesh( colliderMesh, burialHeight, Number.NEGATIVE_INFINITY );
	const collider = buildCollider( colliderMesh );
	const creaseOutsideScoops = ( position: [ number, number, number ] ): boolean => ! isRockScoopInterior( position, shape, groundOffset - burialHeight );
	splitChamferedRockHullVerticesAtCreases( lod0, 35, creaseOutsideScoops );
	recomputeChamferedRockHullNormals( lod0, closeBottom );
	padRockImpostorCard( lod0 );
	const lod0Weld = getIdenticalVertexWeld( lod0 );
	const lod1TargetVertices = Math.round( lod0Weld.uniqueVertices.length * 0.5 );
	let silhouetteHeight = 0;
	for ( let offset = 1; offset < lod0.positions.length; offset += 3 ) silhouetteHeight = Math.max( silhouetteHeight, lod0.positions[ offset ]! );
	let lod1 = buildRockLod1( shape, hullFaces, groundOffset, burialHeight, skirtFloor, weathering, uvFrame, creaseOutsideScoops, lod1TargetVertices, closeBottom );
	if ( getIdenticalVertexWeld( lod1 ).uniqueVertices.length > lod0Weld.uniqueVertices.length * 0.55 ) {

		const targetTriangles = Math.max( 25, Math.round( lod1TargetVertices * 0.55 ) );
		const reducedLod1 = reduceRockLod3( shape, hullFaces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, targetTriangles, 16, closeBottom );
		lod1 = buildRockLod1( reducedLod1.shape, reducedLod1.faces, groundOffset, burialHeight, skirtFloor, weathering, uvFrame, creaseOutsideScoops, lod1TargetVertices, closeBottom );

	}
	let lod2Target = closeBottom ? Math.min( 44, lod2Source.indices.length / 3 - 1 ) : Math.min( 22, lod2Source.indices.length / 3 - 15 );
	let reducedLod2 = reduceRockLod3( shape, hullFaces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, lod2Target, closeBottom ? 24 : 16, closeBottom );
	if ( closeBottom ) {
		prepareClosedRockLod( reducedLod2.mesh );
		const lod1Vertices = getIdenticalVertexWeld( lod1 ).uniqueVertices.length;
		while ( getIdenticalVertexWeld( reducedLod2.mesh ).uniqueVertices.length >= lod1Vertices && lod2Target > 32 ) {
			lod2Target = Math.max( 32, lod2Target - 2 );
			reducedLod2 = reduceRockLod3( shape, hullFaces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, lod2Target, 24, true );
			prepareClosedRockLod( reducedLod2.mesh );
		}
	}
	const lod2 = reducedLod2.mesh;
	if ( ! closeBottom ) recomputeCreasedNormals( lod2, 35 );
	lod2.colors.fill( lod0.colors[ 0 ]! );
	let lod3Target = Math.min( closeBottom ? 32 : 16, reducedLod2.triangleCount - 1 );
	let reducedLod3 = reduceRockLod3( reducedLod2.shape, reducedLod2.faces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, lod3Target, closeBottom ? 24 : 12, closeBottom );
	if ( closeBottom ) {
		prepareClosedRockLod( reducedLod3.mesh );
		const lod2Vertices = getIdenticalVertexWeld( reducedLod2.mesh ).uniqueVertices.length;
		while ( getIdenticalVertexWeld( reducedLod3.mesh ).uniqueVertices.length >= lod2Vertices && lod3Target > 24 ) {
			lod3Target = Math.max( 24, lod3Target - 2 );
			reducedLod3 = reduceRockLod3( reducedLod2.shape, reducedLod2.faces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, lod3Target, 24, true );
			prepareClosedRockLod( reducedLod3.mesh );
		}
	}
	let lod3 = reducedLod3.mesh;
	if ( ! closeBottom ) recomputeCreasedNormals( lod3, 35 );
	if ( ! closeBottom && lod3.positions.length >= lod2.positions.length && reducedLod3.triangleCount > 12 ) {

		reducedLod3 = reduceRockLod3( reducedLod3.shape, reducedLod3.faces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, closeBottom ? 24 : 12, closeBottom ? 24 : 12, closeBottom );
		lod3 = reducedLod3.mesh;
		recomputeCreasedNormals( lod3, 35 );

	}
	lod3.colors.fill( lod0.colors[ 0 ]! );

	const bounds = getBounds( lod0 );
	const lod4 = buildBillboard( bounds, 1, lod0, bounds.height * 0.25 );
	const parts: PartDef[] = [
		{
			name: 'rock',
			defaultColor: rockColor,
			texture: 'albedo',
			normalTexture: 'normal',
			roughness: 0.9,
			specularIntensity: 0.014872,
			ior: 1.05,
			alphaTest: 0,
			doubleSided: false,
			flatShading: false,
		},
		{ ...impostorPart(), impostorFade: false },
	];
	const textureShapeKey = `${ roughness.toFixed( 3 ) }:${ flatness.toFixed( 3 ) }:${ weathering.toFixed( 3 ) }:${ closeBottom ? 1 : 0 }${ moss > 0 ? `:burial:${ burial.toFixed( 4 ) }` : '' }`;
	const textures = moss > 0
		? createRockTextures( seed, 1024, internalSeed, lod0, textureShapeKey, { shape, verticalOffset: groundOffset - burialHeight }, chamferedLod0.ridgeUvSegments, { amount: moss, color: mossColor } )
		: createRockTextures( seed, 1024, internalSeed, lod0, textureShapeKey, { shape, verticalOffset: groundOffset - burialHeight }, chamferedLod0.ridgeUvSegments );
	for ( const mesh of [ lod0, lod1, lod2, lod3, lod4 ] ) {

		padRockImpostorCard( mesh );
		if ( closeBottom && mesh !== lod4 ) {
			splitRockWideUvTriangles( mesh );
		}
		weldIdenticalVertices( mesh );

	}

	return {
		kind: 'rock',
		parts,
		lods: [ lod0, lod1, lod2, lod3, lod4 ],
		collider,
		textures: { albedo: textures.albedo, normal: textures.normal },
		bounds,
	};

}
