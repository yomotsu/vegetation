import { buildBillboard, buildSixPlaneImpostor, impostorLod3Part, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { createNoise3D } from '../noise';
import { addRockShell } from '../primitives';
import { createRockTextures } from '../rockTexture';
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

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

}

function smoothstep( minimum: number, maximum: number, value: number ): number {

	const amount = clamp( ( value - minimum ) / ( maximum - minimum ), 0, 1 );

	return amount * amount * ( 3 - 2 * amount );

}

function createRandom( seed: number ): () => number {

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

	const random = createRandom( seed );
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

function getMinimumY( positions: Float32Array ): number {

	let minimum = Infinity;

	for ( let index = 1; index < positions.length; index += 3 ) {

		minimum = Math.min( minimum, positions[ index ]! );

	}

	return minimum;

}

function getBounds( mesh: MeshData ): { radius: number; height: number } {

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

function getHorizontalSpan( mesh: MeshData ): number {

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

function liftMesh( mesh: MeshData, offset: number ): void {

	for ( let index = 1; index < mesh.positions.length; index += 3 ) {

		mesh.positions[ index ] = mesh.positions[ index ]! + offset;

	}

}

function sinkMesh( mesh: MeshData, offset: number, skirtFloor: number ): void {

	for ( let index = 1; index < mesh.positions.length; index += 3 ) {

		mesh.positions[ index ] = Math.max( mesh.positions[ index ]! - offset, skirtFloor );

	}

}

function scaleHeight( mesh: MeshData, scale: number ): void {

	for ( let index = 1; index < mesh.positions.length; index += 3 ) {

		mesh.positions[ index ] = mesh.positions[ index ]! * scale;

	}

}

function recomputeSmoothNormals( mesh: MeshData ): void {

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

function applyRockSurfaceShading( mesh: MeshData ): void {

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

		candidates.push( {
			offset,
			position,
			priority: hash - Math.floor( hash ),
		} );

	}

	candidates.sort( ( first, second ) => first.priority - second.priority );
	const selected = new Map( candidates.slice( 0, addedVertexLimit ).map( ( candidate ) => [ candidate.offset, candidate.position ] ) );
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

function buildShell( frequency: number, radiusAt: ( direction: Vec3 ) => number, verticalScale: number ): MeshData {

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
	const noise = createNoise3D( internalSeed + 71 );
	const noiseOffset = [ ( internalSeed * 17.13 ) % 71, ( internalSeed * 31.7 ) % 89, ( internalSeed * 53.9 ) % 97 ];
	const cuttingPlanes = createCuttingPlanes( internalSeed, radius );
	const radiusAt = ( direction: Vec3 ): number => {

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
	const lod0 = buildShell( 4, radiusAt, verticalScale );
	const lod1 = buildShell( 3, radiusAt, verticalScale );
	const lod2 = buildShell( 2, radiusAt, verticalScale );
	const groundOffset = - getMinimumY( lod0.positions );

	liftMesh( lod0, groundOffset );
	liftMesh( lod1, groundOffset );
	liftMesh( lod2, groundOffset );
	const targetHeight = getHorizontalSpan( lod0 ) * getTargetAspect( internalSeed, flatness );
	const heightScale = targetHeight / getBounds( lod0 ).height;

	scaleHeight( lod0, heightScale );
	scaleHeight( lod1, heightScale );
	scaleHeight( lod2, heightScale );
	const fullHeight = getBounds( lod0 ).height;
	const skirtFloor = - Math.min( burial, 0.15 ) * fullHeight;

	sinkMesh( lod0, burial * fullHeight, skirtFloor );
	sinkMesh( lod1, burial * fullHeight, skirtFloor );
	sinkMesh( lod2, burial * fullHeight, skirtFloor );
	refineVisibleRockSurface( lod0, radiusAt, verticalScale, groundOffset, heightScale, burial * fullHeight, skirtFloor, 285 );
	recomputeSmoothNormals( lod0 );
	recomputeSmoothNormals( lod1 );
	recomputeSmoothNormals( lod2 );
	applyRockSurfaceShading( lod0 );
	applyRockSurfaceShading( lod1 );
	applyRockSurfaceShading( lod2 );

	const bounds = getBounds( lod0 );
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
		impostorLod3Part(),
		impostorPart(),
	];
	const lod3 = buildSixPlaneImpostor( bounds.height, bounds.radius, 1 );
	const lod4 = buildBillboard( bounds, 2 );
	const textures = createRockTextures( seed );

	return {
		kind: 'rock',
		parts,
		lods: [ lod0, lod1, lod2, lod3, lod4 ],
		collider: buildCollider( lod2 ),
		textures: { albedo: textures.albedo, normal: textures.normal },
		bounds,
	};

}
