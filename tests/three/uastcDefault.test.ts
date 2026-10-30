import { CompressedTexture, DataTexture, RGBA_ASTC_4x4_Format, UnsignedByteType } from 'three';
import type { WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeshData, TextureData, VegetationData } from '../../src/core/types';
import { VegetationAsset } from '../../src/three/VegetationAsset';
import type { KTX2LoaderLike } from '../../src/three/VegetationAsset';
import { VegetationMesh } from '../../src/three/VegetationMesh';
import { disposeVegetationWorkers } from '../../src/three/meshes';

const mocks = vi.hoisted( () => ( {
	encode: vi.fn(),
	workerPoolDispose: vi.fn(),
	internalLoaderCount: 0,
	internalLoaderDisposeCount: 0,
	internalParseCount: 0,
	detectedRenderers: [] as unknown[],
} ) );

vi.mock( '../../src/worker/workerPool', () => ( {
	requestVegetationWorkerEncoding: mocks.encode,
	disposeVegetationWorkers: mocks.workerPoolDispose,
} ) );

vi.mock( 'three/addons/loaders/KTX2Loader.js', async () => {
	const three = await vi.importActual<typeof import( 'three' )>( 'three' );
	return {
		KTX2Loader: class {
			constructor() {
				mocks.internalLoaderCount ++;
			}
			detectSupport( renderer: unknown ) {
				mocks.detectedRenderers.push( renderer );
				return this;
			}
			parse( _buffer: ArrayBuffer, onLoad?: ( texture: InstanceType<typeof three.CompressedTexture> ) => void ) {
				mocks.internalParseCount ++;
				const texture = new three.CompressedTexture( [ { data: new Uint8Array( 16 ), width: 4, height: 4 } ], 4, 4, three.RGBA_ASTC_4x4_Format, three.UnsignedByteType );
				queueMicrotask( () => onLoad?.( texture ) );
			}
			dispose() {
				mocks.internalLoaderDisposeCount ++;
			}
		},
	};
} );

function createTexture(): TextureData {
	return {
		width: 4,
		height: 4,
		data: new Uint8Array( Array.from( { length: 64 }, ( _, index ) => index % 4 === 3 ? 255 : index * 13 ) ),
	};
}

function createMesh( horizontalCard = false ): MeshData {
	return {
		positions: new Float32Array( [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] ),
		normals: new Float32Array( [ 0, 0, 1, 0, 0, 1, 0, 0, 1 ] ),
		uvs: new Float32Array( [ 0, 0, 1, 0, 0, 1 ] ),
		colors: new Float32Array( [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ] ),
		windWeight: new Float32Array( 3 ),
		impostorCard: new Float32Array( horizontalCard ? [ 0, 0, 1 ] : [ 0, 0, 0 ] ),
		indices: new Uint32Array( [ 0, 1, 2 ] ),
		groups: [ { start: 0, count: 3, partIndex: 0 } ],
	};
}

function createData( horizontalCard = false ): VegetationData {
	const part = {
		name: 'plant',
		defaultColor: 0xffffff,
		texture: 'color',
		normalTexture: 'normal',
		alphaTest: 0,
		doubleSided: false,
		flatShading: false,
	};
	const mesh = createMesh( horizontalCard );
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
	if ( ! predicate() ) throw new Error( 'Timed out waiting for default UASTC conversion' );
}

function setWorkerAvailable( available = true ): () => void {
	const hadWorker = Object.prototype.hasOwnProperty.call( globalThis, 'Worker' );
	const originalWorker = globalThis.Worker;
	Object.defineProperty( globalThis, 'Worker', { configurable: true, value: available ? class {} : undefined } );
	return () => {
		if ( hadWorker ) Object.defineProperty( globalThis, 'Worker', { configurable: true, value: originalWorker } );
		else delete ( globalThis as { Worker?: typeof Worker } ).Worker;
	};
}

describe( 'VegetationAsset default UASTC compression', () => {
	beforeEach( () => {
		vi.clearAllMocks();
		mocks.internalLoaderCount = 0;
		mocks.internalLoaderDisposeCount = 0;
		mocks.internalParseCount = 0;
		mocks.detectedRenderers.length = 0;
		mocks.encode.mockResolvedValue( { buffer: new ArrayBuffer( 4 ), encodeTimeMs: 1 } );
	} );

	afterEach( () => {
		disposeVegetationWorkers();
	} );

	it( 'encodes by default and waits for a VegetationMesh renderer before swapping', async () => {
		const restoreWorker = setWorkerAvailable();
		try {
			const asset = new VegetationAsset( createData() );
			const mesh = new VegetationMesh( asset );
			const material = asset.materials[ 0 ]!;
			expect( material.map ).toBeInstanceOf( DataTexture );
			expect( mocks.internalLoaderCount ).toBe( 0 );
			await waitFor( () => mocks.encode.mock.calls.length === 2 );
			expect( material.map ).toBeInstanceOf( DataTexture );
			expect( mocks.internalParseCount ).toBe( 0 );

			const renderer = {} as WebGLRenderer;
			mesh.onBeforeRender( renderer );
			mesh.onBeforeRender( renderer );
			expect( mocks.internalLoaderCount ).toBe( 1 );
			expect( mocks.detectedRenderers ).toEqual( [ renderer ] );
			await waitFor( () => asset.getTextureCompressionReport().length === 2 );
			expect( material.map ).toBeInstanceOf( CompressedTexture );
			expect( mocks.internalParseCount ).toBe( 2 );
			asset.dispose();
			disposeVegetationWorkers();
			expect( mocks.internalLoaderDisposeCount ).toBe( 1 );
		} finally {
			restoreWorker();
		}
	} );

	it( 'does not encode or create a loader when compressTextures is false', async () => {
		const restoreWorker = setWorkerAvailable();
		try {
			const asset = new VegetationAsset( createData(), {}, 4, { compressTextures: false } );
			asset.setRenderer( {} as WebGLRenderer );
			await Promise.resolve();
			expect( mocks.encode ).not.toHaveBeenCalled();
			expect( mocks.internalLoaderCount ).toBe( 0 );
			expect( asset.materials[ 0 ]!.map ).toBeInstanceOf( DataTexture );
			asset.dispose();
		} finally {
			restoreWorker();
		}
	} );

	it( 'keeps RGBA and avoids the internal loader when Workers are unavailable', () => {
		const restoreWorker = setWorkerAvailable( false );
		try {
			const asset = new VegetationAsset( createData() );
			asset.setRenderer( {} as WebGLRenderer );
			expect( mocks.encode ).not.toHaveBeenCalled();
			expect( mocks.internalLoaderCount ).toBe( 0 );
			expect( asset.materials[ 0 ]!.map ).toBeInstanceOf( DataTexture );
			asset.dispose();
		} finally {
			restoreWorker();
		}
	} );

	it( 'registers the renderer from a split LOD3 card child', async () => {
		const restoreWorker = setWorkerAvailable();
		try {
			const asset = new VegetationAsset( createData( true ) );
			const mesh = new VegetationMesh( asset, 3 );
			await waitFor( () => mocks.encode.mock.calls.length === 2 );
			const renderer = {} as WebGLRenderer;
			const onBeforeRender = mesh.children[ 0 ]!.onBeforeRender as unknown as ( renderer: WebGLRenderer ) => void;
			onBeforeRender( renderer );
			await waitFor( () => asset.getTextureCompressionReport().length === 2 );
			expect( mocks.internalLoaderCount ).toBe( 1 );
			expect( mocks.detectedRenderers ).toEqual( [ renderer ] );
			expect( asset.materials[ 0 ]!.map ).toBeInstanceOf( CompressedTexture );
			asset.dispose();
		} finally {
			restoreWorker();
		}
	} );

	it( 'uses a caller-owned loader instead of creating an internal one', async () => {
		const restoreWorker = setWorkerAvailable();
		try {
			let parseCount = 0;
			const loader: KTX2LoaderLike = {
				parse( _buffer, onLoad ) {
					parseCount ++;
					const texture = new CompressedTexture( [ { data: new Uint8Array( 16 ), width: 4, height: 4 } ], 4, 4, RGBA_ASTC_4x4_Format, UnsignedByteType );
					queueMicrotask( () => onLoad?.( texture ) );
				},
			};
			const asset = new VegetationAsset( createData(), {}, 4, { ktx2Loader: loader } );
			asset.setRenderer( {} as WebGLRenderer );
			await waitFor( () => asset.getTextureCompressionReport().length === 2 );
			expect( parseCount ).toBe( 2 );
			expect( mocks.internalLoaderCount ).toBe( 0 );
			expect( asset.materials[ 0 ]!.map ).toBeInstanceOf( CompressedTexture );
			asset.dispose();
		} finally {
			restoreWorker();
		}
	} );
} );
