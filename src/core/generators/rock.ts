import { buildBillboard, buildSixPlaneImpostor, impostorLod3Part, impostorPart } from '../impostor';
import { MeshBuilder } from '../meshBuilder';
import { createNoise3D } from '../noise';
import { addRockShell } from '../primitives';
import { createRockTextures } from '../rockTexture';
import type { ColliderData, MeshData, PartDef, Vec3, VegetationData } from '../types';

export interface RockOptions {
	seed?: number;
	size?: number;
	roughness?: number;
	flatness?: number;
	rockColor?: number;
}

function clamp( value: number, minimum: number, maximum: number ): number {

	return Math.max( minimum, Math.min( maximum, value ) );

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
	const styleAspect = seedBand % 2 === 0 ? 0.37 : 0.85;

	return ( styleAspect + variation ) * ( 1 - flatness * 0.15 );

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
	let minimumY = Infinity;
	let maximumY = - Infinity;

	for ( let index = 0; index < mesh.positions.length; index += 3 ) {

		radius = Math.max( radius, Math.hypot( mesh.positions[ index ]!, mesh.positions[ index + 2 ]! ) );
		minimumY = Math.min( minimumY, mesh.positions[ index + 1 ]! );
		maximumY = Math.max( maximumY, mesh.positions[ index + 1 ]! );

	}

	return { radius, height: maximumY - minimumY };

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

function scaleHeight( mesh: MeshData, scale: number ): void {

	for ( let index = 1; index < mesh.positions.length; index += 3 ) {

		mesh.positions[ index ] = mesh.positions[ index ]! * scale;

	}

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

	return builder.build();

}

export function generateRockData( options: RockOptions = {} ): VegetationData {

	const seed = options.seed ?? 1;
	const size = options.size ?? 6.4;
	const roughnessInput = options.roughness ?? 1.2;
	const flatnessInput = options.flatness ?? 0.04;
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

	if ( ! Number.isInteger( rockColor ) || rockColor < 0 || rockColor > 0xffffff ) {
		throw new RangeError( 'Rock color must be a 24-bit integer' );
	}

	const roughness = clamp( roughnessInput, 0, 1.5 );
	const flatness = clamp( flatnessInput, 0, 1 );
	const radius = size * 0.5;
	const verticalScale = getVerticalScale( seed, flatness );
	const noise = createNoise3D( seed + 71 );
	const noiseOffset = [ ( seed * 17.13 ) % 71, ( seed * 31.7 ) % 89, ( seed * 53.9 ) % 97 ];
	const cuttingPlanes = createCuttingPlanes( seed, radius );
	const radiusAt = ( direction: Vec3 ): number => {

		const coarse = noise( direction[ 0 ] * 1.05 + noiseOffset[ 0 ]!, direction[ 1 ] * 1.05 + noiseOffset[ 1 ]!, direction[ 2 ] * 1.05 + noiseOffset[ 2 ]! );
		const medium = noise( direction[ 0 ] * 2.65 - noiseOffset[ 2 ]!, direction[ 1 ] * 2.65 + noiseOffset[ 0 ]!, direction[ 2 ] * 2.65 - noiseOffset[ 1 ]! );
		const detail = noise( direction[ 0 ] * 5.1 + noiseOffset[ 1 ]!, direction[ 1 ] * 5.1 - noiseOffset[ 2 ]!, direction[ 2 ] * 5.1 + noiseOffset[ 0 ]! );
		const angle = Math.atan2( direction[ 2 ], direction[ 0 ] );
		const lobes = Math.sin( angle * 3 + noiseOffset[ 1 ]! ) * 0.075 + Math.cos( angle * 5 - noiseOffset[ 2 ]! ) * 0.035;
		let deformedRadius = radius * clamp( 0.97 + ( coarse * 0.25 + medium * 0.075 + detail * 0.012 + lobes ) * roughness, 0.62, 1.34 );

		for ( const plane of cuttingPlanes ) {

			const projection = direction[ 0 ] * plane.normal[ 0 ] + direction[ 1 ] * plane.normal[ 1 ] + direction[ 2 ] * plane.normal[ 2 ];

			if ( projection > 0 ) deformedRadius = Math.min( deformedRadius, plane.distance / projection );

		}

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
	const targetHeight = getHorizontalSpan( lod0 ) * getTargetAspect( seed, flatness );
	const heightScale = targetHeight / getBounds( lod0 ).height;

	scaleHeight( lod0, heightScale );
	scaleHeight( lod1, heightScale );
	scaleHeight( lod2, heightScale );

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
			flatShading: true,
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
