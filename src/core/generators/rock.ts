import { createRockTextures } from '../rockTexture';
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
	rockColor?: number;
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

function buildLod3Mesh( shape: RockHullShape, faces: [ number, number, number ][], groundOffset: number, burialHeight: number, skirtFloor: number, unwrapSeams: boolean, uvFrame?: RockUvFrame ): MeshData {

	const mesh = buildRockHullMesh( shape, faces, 0, 0, 0, unwrapSeams, uvFrame );
	liftMesh( mesh, groundOffset );
	sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
	removeRockBottomCap( mesh, skirtFloor );
	return mesh;

}

function buildLod3Candidate( shape: RockHullShape, faces: [ number, number, number ][], groundOffset: number, burialHeight: number, skirtFloor: number ): { mesh: MeshData; triangleCount: number } {

	const mesh = buildRockHullMesh( shape, faces, 0, 0, 0, false, undefined, true );
	liftMesh( mesh, groundOffset );
	sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
	let triangleCount = 0;

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		if ( isBottomCapTriangle( mesh, offset, skirtFloor ) ) continue;
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

function reduceRockLod3( shape: RockHullShape, initialFaces: [ number, number, number ][], groundOffset: number, burialHeight: number, skirtFloor: number, silhouetteHeight: number, uvFrame: RockUvFrame, targetTriangles = 22, minimumTriangles = 16 ): ReducedRockMesh {

	let currentShape = shape;
	let currentFaces = initialFaces;
	let currentCandidate = buildLod3Candidate( currentShape, currentFaces, groundOffset, burialHeight, skirtFloor );
	let currentMetric = getAboveGroundMetric( currentCandidate.mesh, shape.size, silhouetteHeight, skirtFloor );

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
			const candidate = buildLod3Candidate( candidateShape, faces, groundOffset, burialHeight, skirtFloor );
			if ( candidate.triangleCount < minimumTriangles ) continue;

			const candidateMetric = getAboveGroundMetric( candidate.mesh, shape.size, silhouetteHeight, skirtFloor );
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
		mesh: buildLod3Mesh( currentShape, currentFaces, groundOffset, burialHeight, skirtFloor, true, uvFrame ),
		shape: currentShape,
		faces: currentFaces,
		triangleCount: currentCandidate.triangleCount,
	};

}

function getLod1SubdivisionOrder( shape: RockHullShape, faces: [ number, number, number ][], verticalOffset: number ): number[] {

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

	return faces.map( ( face, faceIndex ) => ( { faceIndex, area: aboveGroundArea( face ) } ) )
		.sort( ( first, second ) => second.area - first.area || first.faceIndex - second.faceIndex )
		.map( ( entry ) => entry.faceIndex );

}

function padRockImpostorCard( mesh: MeshData ): void {

	if ( mesh.impostorCard.length !== mesh.positions.length / 3 ) {

		if ( mesh.impostorCard.some( ( value ) => value !== 0 ) ) throw new RangeError( 'Rock impostor-card data must use the default value' );
		mesh.impostorCard = new Float32Array( mesh.positions.length / 3 );

	}

}

function buildRockLod1( shape: RockHullShape, faces: [ number, number, number ][], groundOffset: number, burialHeight: number, skirtFloor: number, weathering: number, uvFrame: RockUvFrame, creaseOutsideScoops: ( position: [ number, number, number ] ) => boolean, targetVertices: number ): MeshData {

	const subdivisionOrder = getLod1SubdivisionOrder( shape, faces, groundOffset - burialHeight );
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
		limitRockPeakSharpness( mesh, weathering, 125 );
		sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
		removeRockBottomCap( mesh, skirtFloor );
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
	const rockColor = options.rockColor ?? 0xffffff;

	if ( ! Number.isFinite( seed ) ) throw new RangeError( 'Rock seed must be finite' );
	if ( ! Number.isFinite( size ) || size <= 0 ) throw new RangeError( 'Rock size must be a positive finite number' );
	if ( ! Number.isFinite( roughnessInput ) ) throw new RangeError( 'Rock roughness must be finite' );
	if ( ! Number.isFinite( flatnessInput ) ) throw new RangeError( 'Rock flatness must be finite' );
	if ( ! Number.isFinite( weatheringInput ) || weatheringInput < 0 || weatheringInput > 1 ) throw new RangeError( 'Rock weathering must be a value from 0 to 1' );
	if ( ! Number.isFinite( burial ) || burial < 0 || burial > 1 ) throw new RangeError( 'Rock burial must be a finite value from 0 to 1' );
	if ( ! Number.isInteger( rockColor ) || rockColor < 0 || rockColor > 0xffffff ) throw new RangeError( 'Rock color must be a 24-bit integer' );

	const roughness = clamp( roughnessInput, 0, 1.5 );
	const flatness = clamp( flatnessInput, 0, 1 );
	const weathering = clamp( weatheringInput, 0, 1 );
	const shape = createRockHullShape( internalSeed, size, roughness, flatness );
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
	for ( const mesh of [ lod0, lod2Source ] ) limitRockPeakSharpness( mesh, weathering, 125 );

	let fullHeight = 0;
	for ( let offset = 1; offset < lod0.positions.length; offset += 3 ) fullHeight = Math.max( fullHeight, lod0.positions[ offset ]! );
	const burialHeight = burial * fullHeight;
	const skirtFloor = - Math.min( burial, 0.14 ) * fullHeight;

	for ( const mesh of [ lod0, lod2Source ] ) {

		sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
		removeRockBottomCap( mesh, skirtFloor );

	}

	sinkMesh( colliderMesh, burialHeight, Number.NEGATIVE_INFINITY );
	const collider = buildCollider( colliderMesh );
	const creaseOutsideScoops = ( position: [ number, number, number ] ): boolean => ! isRockScoopInterior( position, shape, groundOffset - burialHeight );
	splitChamferedRockHullVerticesAtCreases( lod0, 35, creaseOutsideScoops );
	recomputeChamferedRockHullNormals( lod0 );
	padRockImpostorCard( lod0 );
	const lod0Weld = getIdenticalVertexWeld( lod0 );
	const lod1TargetVertices = Math.round( lod0Weld.uniqueVertices.length * 0.5 );
	let silhouetteHeight = 0;
	for ( let offset = 1; offset < lod0.positions.length; offset += 3 ) silhouetteHeight = Math.max( silhouetteHeight, lod0.positions[ offset ]! );
	let lod1 = buildRockLod1( shape, hullFaces, groundOffset, burialHeight, skirtFloor, weathering, uvFrame, creaseOutsideScoops, lod1TargetVertices );
	if ( getIdenticalVertexWeld( lod1 ).uniqueVertices.length > lod0Weld.uniqueVertices.length * 0.55 ) {

		const targetTriangles = Math.max( 25, Math.round( lod1TargetVertices * 0.55 ) );
		const reducedLod1 = reduceRockLod3( shape, hullFaces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, targetTriangles, 16 );
		lod1 = buildRockLod1( reducedLod1.shape, reducedLod1.faces, groundOffset, burialHeight, skirtFloor, weathering, uvFrame, creaseOutsideScoops, lod1TargetVertices );

	}
	const lod2Target = Math.min( 22, lod2Source.indices.length / 3 - 15 );
	const reducedLod2 = reduceRockLod3( shape, hullFaces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, lod2Target );
	const lod2 = reducedLod2.mesh;
	recomputeCreasedNormals( lod2, 35 );
	lod2.colors.fill( lod0.colors[ 0 ]! );
	const lod3Target = Math.min( 16, reducedLod2.triangleCount - 1 );
	let reducedLod3 = reduceRockLod3( reducedLod2.shape, reducedLod2.faces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, lod3Target, 12 );
	let lod3 = reducedLod3.mesh;
	recomputeCreasedNormals( lod3, 35 );
	if ( lod3.positions.length >= lod2.positions.length && reducedLod3.triangleCount > 12 ) {

		reducedLod3 = reduceRockLod3( reducedLod3.shape, reducedLod3.faces, groundOffset, burialHeight, skirtFloor, silhouetteHeight, uvFrame, 12, 12 );
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
		impostorPart(),
	];
	const textureShapeKey = `${ roughness.toFixed( 3 ) }:${ flatness.toFixed( 3 ) }:${ weathering.toFixed( 3 ) }`;
	const textures = createRockTextures( seed, 1024, internalSeed, lod0, textureShapeKey, { shape, verticalOffset: groundOffset - burialHeight }, chamferedLod0.ridgeUvSegments );
	for ( const mesh of [ lod0, lod1, lod2, lod3, lod4 ] ) {

		padRockImpostorCard( mesh );
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
