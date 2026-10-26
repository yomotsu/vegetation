import { createRockTextures } from '../rockTexture';
import { buildBillboard, impostorPart } from '../impostor';
import { applyRockSurfaceShading, buildConvexHullFaces, buildRockMeshFromFaces, buildRockRingShell, buildRockShell, clamp, createRockRadiusFunction, getBounds, getHorizontalMeshOutline, getHorizontalSpan, getMinimumY, getProjectedMeshOutline, liftMesh, recomputeSmoothNormals, removeRockBottomCap, scaleHeight, sinkMesh, smoothstep } from '../rockGeometry';
import type { ColliderData, MeshData, PartDef, Vec3, VegetationData } from '../types';

const ROCK_SEED_SALT = 62;

export interface RockOptions {
	seed?: number;
	size?: number;
	roughness?: number;
	flatness?: number;
	/** 地中に沈める全体高の割合（0〜1）。 */
	burial?: number;
	rockColor?: number;
}

function getVerticalScale( seed: number, flatness: number ): number {

	const seedBand = Math.floor( Math.abs( seed ) );
	const seedHash = Math.sin( seedBand * 78.233 + 12.9898 ) * 43758.5453;
	const variation = ( seedHash - Math.floor( seedHash ) - 0.5 ) * 0.1;
	const styleScale = ( seedBand % 2 === 0 ? 0.49 : 1.12 ) + variation;

	return styleScale * ( 1 - flatness ) + 0.34 * flatness;

}

function getTargetAspect( seed: number, flatness: number ): number {

	const seedBand = Math.floor( Math.abs( seed ) );
	const seedHash = Math.sin( seedBand * 78.233 + 12.9898 ) * 43758.5453;
	const variation = ( seedHash - Math.floor( seedHash ) - 0.5 ) * 0.03;
	const visibleAspect = seedBand % 2 === 0 ? 0.37 : 0.65;
	const styleAspect = visibleAspect / 0.55;

	return ( styleAspect + variation ) * ( 1 - flatness * 0.15 );

}

function getDefaultBurial( seed: number ): number {

	const seedHash = Math.sin( Math.abs( seed ) * 127.1 + 311.7 ) * 43758.5453;
	const variation = seedHash - Math.floor( seedHash );

	return 0.4 + variation * 0.15;

}

function refineVisibleRockSurface(
	mesh: MeshData,
	radiusAt: ( direction: Vec3 ) => number,
	verticalScale: number,
	groundOffset: number,
	heightScale: number,
	burialHeight: number,
	skirtFloor: number,
	maximumVertices: number,
): void {

	const addedVertexLimit = maximumVertices - mesh.positions.length / 3;

	if ( addedVertexLimit <= 0 ) return;

	const bounds = getBounds( mesh );
	const candidates: { offset: number; position: Vec3; priority: number }[] = [];

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const vertices = [ mesh.indices[ offset ]!, mesh.indices[ offset + 1 ]!, mesh.indices[ offset + 2 ]! ];
		const offsets = vertices.map( ( vertex ) => vertex * 3 );

		const center: Vec3 = [ 0, 0, 0 ];
		for ( const vertexOffset of offsets ) {

			for ( let axis = 0; axis < 3; axis ++ ) {

				const value = mesh.positions[ vertexOffset + axis ]!;
				center[ axis ] = center[ axis ]! + value / 3;
			}

		}

		if ( center[ 1 ] <= 0 ) continue;

		if ( Math.hypot( center[ 0 ], center[ 2 ] ) > bounds.radius * 0.99 ) continue;

		const unburiedY = ( center[ 1 ] + burialHeight ) / heightScale - groundOffset;
		const direction: Vec3 = [ center[ 0 ], unburiedY / verticalScale, center[ 2 ] ];
		const directionLength = Math.hypot( direction[ 0 ], direction[ 1 ], direction[ 2 ] ) || 1;
		direction[ 0 ] /= directionLength;
		direction[ 1 ] /= directionLength;
		direction[ 2 ] /= directionLength;
		const sampledRadius = radiusAt( direction );
		const sampledPosition: Vec3 = [
			direction[ 0 ] * sampledRadius,
			Math.max( ( direction[ 1 ] * sampledRadius * verticalScale + groundOffset ) * heightScale - burialHeight, skirtFloor ),
			direction[ 2 ] * sampledRadius,
		];
		const displacement: Vec3 = [ sampledPosition[ 0 ] - center[ 0 ], sampledPosition[ 1 ] - center[ 1 ], sampledPosition[ 2 ] - center[ 2 ] ];
		const displacementLength = Math.hypot( displacement[ 0 ], displacement[ 1 ], displacement[ 2 ] );
		const maximumDisplacement = bounds.radius * 0.04;
		const amount = displacementLength > maximumDisplacement ? maximumDisplacement / displacementLength : 1;
		const position: Vec3 = [
			center[ 0 ] + displacement[ 0 ] * amount,
			center[ 1 ] + displacement[ 1 ] * amount,
			center[ 2 ] + displacement[ 2 ] * amount,
		];

		if ( position[ 1 ] <= 0 ) continue;

		const hash = Math.sin( center[ 0 ] * 12.9898 + center[ 1 ] * 78.233 + center[ 2 ] * 37.719 ) * 43758.5453;
		const tieBreaker = hash - Math.floor( hash );
		const silhouette = smoothstep( 0.72, 0.98, Math.hypot( center[ 0 ], center[ 2 ] ) / bounds.radius );

		candidates.push( {
			offset,
			position,
			priority: Math.min( displacementLength / ( bounds.radius * 0.04 ), 1 ) + silhouette * 0.25 + tieBreaker * 0.02,
		} );

	}

	const selectedCandidates: typeof candidates = [];
	const remaining = candidates.slice();

	while ( selectedCandidates.length < addedVertexLimit && remaining.length > 0 ) {

		let bestIndex = 0;
		let bestPriority = - Infinity;

		for ( let index = 0; index < remaining.length; index ++ ) {

			const candidate = remaining[ index ]!;
			let spacing = 1;

			for ( const selected of selectedCandidates ) {

				spacing = Math.min( spacing, Math.hypot(
					candidate.position[ 0 ] - selected.position[ 0 ],
					candidate.position[ 1 ] - selected.position[ 1 ],
					candidate.position[ 2 ] - selected.position[ 2 ],
				) / bounds.radius );

			}

			const priority = candidate.priority + spacing * 0.16;

			if ( priority > bestPriority ) {

				bestIndex = index;
				bestPriority = priority;

			}

		}

		selectedCandidates.push( remaining.splice( bestIndex, 1 )[ 0 ]! );

	}

	const selected = new Map( selectedCandidates.map( ( candidate ) => [ candidate.offset, candidate.position ] ) );
	const positions = Array.from( mesh.positions );
	const normals = Array.from( mesh.normals );
	const uvs = Array.from( mesh.uvs );
	const colors = Array.from( mesh.colors );
	const windWeights = Array.from( mesh.windWeight );
	const indices: number[] = [];

	for ( let offset = 0; offset < mesh.indices.length; offset += 3 ) {

		const first = mesh.indices[ offset ]!;
		const second = mesh.indices[ offset + 1 ]!;
		const third = mesh.indices[ offset + 2 ]!;
		const center = selected.get( offset );

		if ( center === undefined ) {

			indices.push( first, second, third );
			continue;

		}

		const centerIndex = positions.length / 3;
		positions.push( center[ 0 ], center[ 1 ], center[ 2 ] );

		const centerNormal = [ 0, 0, 0 ];
		const centerUv = [ 0, 0 ];
		const centerColor = [ 0, 0, 0 ];
		const uValues = [
			mesh.uvs[ first * 2 ]!,
			mesh.uvs[ second * 2 ]!,
			mesh.uvs[ third * 2 ]!,
		];
		const crossesSeam = Math.max( ...uValues ) - Math.min( ...uValues ) > 0.5;
		let centerWindWeight = 0;

		for ( const vertex of [ first, second, third ] ) {

			const positionOffset = vertex * 3;
			const uvOffset = vertex * 2;

			for ( let axis = 0; axis < 3; axis ++ ) {

				centerNormal[ axis ]! += mesh.normals[ positionOffset + axis ]! / 3;
				centerColor[ axis ]! += mesh.colors[ positionOffset + axis ]! / 3;

			}

			const u = mesh.uvs[ uvOffset ]!;
			centerUv[ 0 ]! += ( crossesSeam && u <= 0.5 ? u + 1 : u ) / 3;
			centerUv[ 1 ]! += mesh.uvs[ uvOffset + 1 ]! / 3;
			centerWindWeight += mesh.windWeight[ vertex ]! / 3;

		}

		const normalLength = Math.hypot( centerNormal[ 0 ]!, centerNormal[ 1 ]!, centerNormal[ 2 ]! ) || 1;

		normals.push( centerNormal[ 0 ]! / normalLength, centerNormal[ 1 ]! / normalLength, centerNormal[ 2 ]! / normalLength );
		uvs.push( centerUv[ 0 ]!, centerUv[ 1 ]! );
		colors.push( centerColor[ 0 ]!, centerColor[ 1 ]!, centerColor[ 2 ]! );
		windWeights.push( centerWindWeight );
		indices.push( first, second, centerIndex, second, third, centerIndex, third, first, centerIndex );

	}

	mesh.positions = Float32Array.from( positions );
	mesh.normals = Float32Array.from( normals );
	mesh.uvs = Float32Array.from( uvs );
	mesh.colors = Float32Array.from( colors );
	mesh.windWeight = Float32Array.from( windWeights );
	mesh.indices = Uint32Array.from( indices );
	mesh.groups = [ { start: 0, count: indices.length, partIndex: 0 } ];

}

function getUniqueRockPositions( mesh: MeshData ): Vec3[] {

	const positions = new Map<string, Vec3>();

	for ( let offset = 0; offset < mesh.positions.length; offset += 3 ) {

		const position: Vec3 = [ mesh.positions[ offset ]!, mesh.positions[ offset + 1 ]!, mesh.positions[ offset + 2 ]! ];
		positions.set( position.map( ( value ) => value.toFixed( 6 ) ).join( ',' ), position );

	}

	return [ ...positions.values() ];

}

function buildLowPolyRockShell( source: MeshData, size: number ): MeshData {

	const positions = getUniqueRockPositions( source );
	const bounds = getBounds( source );
	const baseCount = 8;
	const upperCount = 7;
	const base = getProjectedMeshOutline( source, baseCount, - 0.03 * size );
	const upper = getHorizontalMeshOutline( source, bounds.height * 0.48, upperCount );
	const apex = positions.reduce( ( highest, position ) => position[ 1 ] > highest[ 1 ] ? position : highest, [ 0, - Infinity, 0 ] as Vec3 );
	const vertices = [ ...base, ...upper, apex ];
	const shell = buildRockMeshFromFaces( vertices, buildConvexHullFaces( vertices ) );
	removeRockBottomCap( shell, - 0.03 * size );

	return shell;

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

export function generateRockData( options: RockOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const internalSeed = seed + ROCK_SEED_SALT;
	const seedBand = Math.floor( Math.abs( seed ) );
	const size = options.size ?? ( seedBand % 2 === 0 ? 12.3 : 6.4 );
	const roughnessInput = options.roughness ?? 1.2;
	const flatnessInput = options.flatness ?? 0.04;
	const burial = options.burial ?? getDefaultBurial( internalSeed );
	const rockColor = options.rockColor ?? 0xffffff;

	if ( ! Number.isFinite( seed ) ) {
		throw new RangeError( 'Rock seed must be finite' );
	}

	if ( ! Number.isFinite( size ) || size <= 0 ) {
		throw new RangeError( 'Rock size must be a positive finite number' );
	}

	if ( ! Number.isFinite( roughnessInput ) ) {
		throw new RangeError( 'Rock roughness must be finite' );
	}

	if ( ! Number.isFinite( flatnessInput ) ) {
		throw new RangeError( 'Rock flatness must be finite' );
	}

	if ( ! Number.isFinite( burial ) || burial < 0 || burial > 1 ) {
		throw new RangeError( 'Rock burial must be a finite value from 0 to 1' );
	}

	if ( ! Number.isInteger( rockColor ) || rockColor < 0 || rockColor > 0xffffff ) {
		throw new RangeError( 'Rock color must be a 24-bit integer' );
	}

	const roughness = clamp( roughnessInput, 0, 1.5 );
	const flatness = clamp( flatnessInput, 0, 1 );
	const radius = size * 0.5;
	const verticalScale = getVerticalScale( internalSeed, flatness );
	const radiusAt = createRockRadiusFunction( internalSeed, radius, roughness, verticalScale );
	const shapeReference = buildRockShell( 4, radiusAt, verticalScale );
	const lod0 = buildRockShell( 3, radiusAt, verticalScale );
	const lod1 = buildRockShell( 2, radiusAt, verticalScale );
	const lod2 = buildRockRingShell( radiusAt, verticalScale );
	const groundOffset = - getMinimumY( shapeReference.positions );

	liftMesh( shapeReference, groundOffset );
	liftMesh( lod0, groundOffset );
	liftMesh( lod1, groundOffset );
	liftMesh( lod2, groundOffset );
	const targetHeight = getHorizontalSpan( shapeReference ) * getTargetAspect( internalSeed, flatness );
	const heightScale = targetHeight / getBounds( shapeReference ).height;

	scaleHeight( lod0, heightScale );
	scaleHeight( lod1, heightScale );
	scaleHeight( lod2, heightScale );
	const fullHeight = getBounds( lod0 ).height;
	const colliderLod2 = { ...lod2, positions: lod2.positions.slice() };
	sinkMesh( colliderLod2, burial * fullHeight, - Math.min( burial, 0.15 ) * fullHeight );
	const collider = buildCollider( colliderLod2 );
	const skirtFloor = - 0.03 * size;

	sinkMesh( lod0, burial * fullHeight, skirtFloor );
	sinkMesh( lod1, burial * fullHeight, skirtFloor );
	sinkMesh( lod2, burial * fullHeight, skirtFloor );

	refineVisibleRockSurface( lod0, radiusAt, verticalScale, groundOffset, heightScale, burial * fullHeight, skirtFloor, 110 );
	refineVisibleRockSurface( lod1, radiusAt, verticalScale, groundOffset, heightScale, burial * fullHeight, skirtFloor, 56 );
	removeRockBottomCap( lod0, skirtFloor );
	removeRockBottomCap( lod1, skirtFloor );
	removeRockBottomCap( lod2, skirtFloor );
	recomputeSmoothNormals( lod0 );
	recomputeSmoothNormals( lod1 );
	recomputeSmoothNormals( lod2 );
	applyRockSurfaceShading( lod0 );
	applyRockSurfaceShading( lod1 );
	applyRockSurfaceShading( lod2 );

	const lod3 = buildLowPolyRockShell( lod0, size );
	const bounds = getBounds( lod0 );
	const lod4 = buildBillboard( bounds, 1, lod0, bounds.height * 0.75 );
	recomputeSmoothNormals( lod3 );
	lod3.colors.fill( lod0.colors[ 0 ]! );

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
	const textures = createRockTextures( seed );

	return {
		kind: 'rock',
		parts,
		lods: [ lod0, lod1, lod2, lod3, lod4 ],
		collider,
		textures: { albedo: textures.albedo, normal: textures.normal },
		bounds,
	};

}
