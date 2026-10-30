import { CompressedTexture, DataTexture, RGBA_ASTC_4x4_Format, SRGBColorSpace, UnsignedByteType } from 'three';
import { read as readKtx2 } from 'three/examples/jsm/libs/ktx-parse.module.js';
import { describe, expect, it } from 'vitest';
import type { MeshData, TextureData, VegetationData } from '../../src/core/types';
import { VegetationAsset } from '../../src/three/VegetationAsset';
import type { KTX2LoaderLike } from '../../src/three/VegetationAsset';

function createTexture(): TextureData {

	return {
		width: 4,
		height: 4,
		data: new Uint8Array( Array.from( { length: 64 }, ( _, index ) => index % 4 === 3 ? 255 : index * 13 ) ),
	};

}

function createMesh(): MeshData {

	return {
		positions: new Float32Array( [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] ),
		normals: new Float32Array( [ 0, 0, 1, 0, 0, 1, 0, 0, 1 ] ),
		uvs: new Float32Array( [ 0, 0, 1, 0, 0, 1 ] ),
		colors: new Float32Array( [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ] ),
		windWeight: new Float32Array( 3 ),
		impostorCard: new Float32Array( 3 ),
		indices: new Uint32Array( [ 0, 1, 2 ] ),
		groups: [ { start: 0, count: 3, partIndex: 0 } ],
	};

}

function createData(): VegetationData {

	const part = {
		name: 'plant',
		defaultColor: 0xffffff,
		texture: 'color',
		normalTexture: 'normal',
		alphaTest: 0,
		doubleSided: false,
		flatShading: false,
	};
	const mesh = createMesh();
	return {
		kind: 'test',
		parts: [ part ],
		lods: [ mesh, mesh, mesh, mesh, mesh ],
		collider: null,
		textures: { color: createTexture(), normal: createTexture() },
		bounds: { radius: 1, height: 1 },
	};

}

async function waitFor( predicate: () => boolean ): Promise<void> {
	const deadline = Date.now() + 3000;
	while ( ! predicate() && Date.now() < deadline ) await new Promise( ( resolve ) => setTimeout( resolve, 5 ) );
	if ( ! predicate() ) throw new Error( 'Timed out waiting for UASTC texture parsing' );
}

describe( 'VegetationAsset UASTC opt-in', () => {
	it( 'keeps RGBA textures until KTX2Loader returns a compressed texture', async () => {
		const descriptors: ReturnType<typeof readKtx2>[ 'dataFormatDescriptor' ] = [];
		const loader: KTX2LoaderLike = {
			parse( buffer, onLoad ) {
				descriptors.push( ...readKtx2( new Uint8Array( buffer ) ).dataFormatDescriptor );
				const texture = new CompressedTexture( [ { data: new Uint8Array( 16 ), width: 4, height: 4 } ], 4, 4, RGBA_ASTC_4x4_Format, UnsignedByteType );
				setTimeout( () => onLoad?.( texture ), 0 );
			},
		};
		const asset = new VegetationAsset( createData(), {}, 4, { ktx2Loader: loader } );
		const material = asset.materials[ 0 ]!;
		const rawMap = material.map as DataTexture;
		const rawNormal = material.normalMap as DataTexture;
		let rawMapDisposed = false;
		let rawNormalDisposed = false;
		rawMap.addEventListener( 'dispose', () => { rawMapDisposed = true; } );
		rawNormal.addEventListener( 'dispose', () => { rawNormalDisposed = true; } );
		expect( rawMap ).toBeInstanceOf( DataTexture );
		expect( rawNormal ).toBeInstanceOf( DataTexture );

		await waitFor( () => asset.getTextureCompressionReport().length === 2 );
		expect( material.map ).toBeInstanceOf( CompressedTexture );
		expect( material.normalMap ).toBeInstanceOf( CompressedTexture );
		expect( rawMapDisposed ).toBe( true );
		expect( rawNormalDisposed ).toBe( true );
		expect( material.map!.colorSpace ).toBe( SRGBColorSpace );
		expect( material.normalMap!.colorSpace ).toBe( '' );
		expect( descriptors ).toEqual( expect.arrayContaining( [
			expect.objectContaining( { transferFunction: 2 } ),
			expect.objectContaining( { colorPrimaries: 0, transferFunction: 1 } ),
		] ) );
		const reports = asset.getTextureCompressionReport();
		expect( reports.map( ( report ) => report.slot ).sort() ).toEqual( [ 'map', 'normalMap' ] );
		for ( const report of reports ) {
			expect( [ 'worker', 'main' ] ).toContain( report.encodeThread );
			expect( Number.isFinite( report.mainThreadMaxSliceMs ) ).toBe( true );
		}
		asset.dispose();
	} );
} );
