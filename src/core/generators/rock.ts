import { createRockTextures } from '../rockTexture';
import { buildBillboard, impostorPart } from '../impostor';
import { applyRockSurfaceShading, applyRockWeathering, buildConvexHullFaces, buildRockHullMesh, clamp, createRockHullShape, getBounds, getMinimumY, liftMesh, limitRockPeakSharpness, removeRockBottomCap, recomputeCreasedNormals, sinkMesh } from '../rockGeometry';
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
	const bevelWidth = size * 0.02;
	const lod0 = buildRockHullMesh( shape, hullFaces, 3, bevelWidth, weathering );
	const lod1 = buildRockHullMesh( shape, hullFaces, 1, bevelWidth * 0.8, weathering );
	const lod2 = buildRockHullMesh( shape, hullFaces, 0, bevelWidth * 0.8, weathering );
	const colliderMesh = buildRockHullMesh( shape, hullFaces, 0, 0, weathering, false );
	const groundOffset = - getMinimumY( lod0.positions );

	for ( const mesh of [ lod0, lod1, lod2, colliderMesh ] ) liftMesh( mesh, groundOffset );
	for ( const mesh of [ lod0, lod1, lod2 ] ) applyRockWeathering( mesh, weathering );
	for ( const mesh of [ lod0, lod1, lod2 ] ) limitRockPeakSharpness( mesh, weathering, 125 );

	let fullHeight = 0;
	for ( let offset = 1; offset < lod0.positions.length; offset += 3 ) fullHeight = Math.max( fullHeight, lod0.positions[ offset ]! );
	const burialHeight = burial * fullHeight;
	const skirtFloor = - Math.min( burial, 0.14 ) * fullHeight;

	for ( const mesh of [ lod0, lod1, lod2 ] ) {

		sinkMesh( mesh, burialHeight, Number.NEGATIVE_INFINITY );
		removeRockBottomCap( mesh, skirtFloor );

	}

	sinkMesh( colliderMesh, burialHeight, Number.NEGATIVE_INFINITY );
	const collider = buildCollider( colliderMesh );
	recomputeCreasedNormals( lod0, 35 );
	recomputeCreasedNormals( lod1, 35 );
	recomputeCreasedNormals( lod2, 35 );
	applyRockSurfaceShading( lod0 );
	applyRockSurfaceShading( lod1 );
	applyRockSurfaceShading( lod2 );

	const lod3 = buildRockHullMesh( shape, hullFaces, 0, 0, 0, false );
	liftMesh( lod3, groundOffset );
	sinkMesh( lod3, burialHeight, Number.NEGATIVE_INFINITY );
	removeRockBottomCap( lod3, skirtFloor );
	recomputeCreasedNormals( lod3, 35 );
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
	const textures = createRockTextures( seed, 1024, internalSeed, lod0, textureShapeKey );

	return {
		kind: 'rock',
		parts,
		lods: [ lod0, lod1, lod2, lod3, lod4 ],
		collider,
		textures: { albedo: textures.albedo, normal: textures.normal },
		bounds,
	};

}
