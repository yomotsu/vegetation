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

function liftMesh( mesh: MeshData, offset: number ): void {

	for ( let index = 1; index < mesh.positions.length; index += 3 ) {

		mesh.positions[ index ] = mesh.positions[ index ]! + offset;

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
	const verticalScale = 0.9 - flatness * 0.52;
	const noise = createNoise3D( seed + 71 );
	const noiseOffset = [ ( seed * 17.13 ) % 71, ( seed * 31.7 ) % 89, ( seed * 53.9 ) % 97 ];
	const radiusAt = ( direction: Vec3 ): number => {

		const coarse = noise( direction[ 0 ] * 1.4 + noiseOffset[ 0 ]!, direction[ 1 ] * 1.4 + noiseOffset[ 1 ]!, direction[ 2 ] * 1.4 + noiseOffset[ 2 ]! );
		const detail = noise( direction[ 0 ] * 2.8 - noiseOffset[ 2 ]!, direction[ 1 ] * 2.8 + noiseOffset[ 0 ]!, direction[ 2 ] * 2.8 - noiseOffset[ 1 ]! );
		const angle = Math.atan2( direction[ 2 ], direction[ 0 ] );
		const lobes = Math.sin( angle * 3 + noiseOffset[ 1 ]! ) * 0.07 + Math.cos( angle * 5 - noiseOffset[ 2 ]! ) * 0.025;

		return radius * ( 0.94 + ( coarse * 0.11 + detail * 0.025 + lobes ) * roughness );

	};
	const lod0 = buildShell( 4, radiusAt, verticalScale );
	const lod1 = buildShell( 3, radiusAt, verticalScale );
	const lod2 = buildShell( 2, radiusAt, verticalScale );
	const groundOffset = - getMinimumY( lod0.positions );

	liftMesh( lod0, groundOffset );
	liftMesh( lod1, groundOffset );
	liftMesh( lod2, groundOffset );

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
