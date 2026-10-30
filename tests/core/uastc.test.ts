import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';
import { read } from 'three/examples/jsm/libs/ktx-parse.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateFlowersData } from '../../src/core/generators/flowers';
import { generateTreeData } from '../../src/core/generators/tree';
import { encodeUastcTexture, encodeUastcTextureAsync } from '../../src/core/uastc';
import { writeUastcKtx2 } from '../../src/core/ktx2';
import { generateTextureMipmaps, generateTextureMipmapsAsync } from '../../src/core/textureMipmaps';
import type { TextureData } from '../../src/core/types';

interface BasisKtx2File {
	isValid(): boolean;
	isUASTC(): boolean;
	startTranscoding(): boolean;
	getLevels(): number;
	getImageTranscodedSizeInBytes( level: number, layer: number, face: number, format: number ): number;
	transcodeImage( destination: Uint8Array, level: number, layer: number, face: number, format: number, decodeFlags: number, outputRowPitch: number, outputRows: number ): boolean;
	close(): void;
	delete(): void;
}

interface BasisTranscoder {
	initializeBasis(): void;
	KTX2File: new ( data: Uint8Array ) => BasisKtx2File;
}

const require = createRequire( import.meta.url );
const basisPath = require.resolve( 'three/examples/jsm/libs/basis/basis_transcoder.js' );
const wasmPath = path.join( path.dirname( basisPath ), 'basis_transcoder.wasm' );
let basis: BasisTranscoder;

async function loadBasisTranscoder(): Promise<BasisTranscoder> {
	const module = { exports: {} as BasisTranscoder | ( ( options: { wasmBinary: Uint8Array } ) => Promise<BasisTranscoder> ) };
	const context = {
		module,
		exports: module.exports,
		require: createRequire( basisPath ),
		__filename: basisPath,
		__dirname: path.dirname( basisPath ),
		process: ( globalThis as typeof globalThis & { process: unknown } ).process,
		Buffer: ( globalThis as typeof globalThis & { Buffer: unknown } ).Buffer,
		WebAssembly,
		console,
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval,
	};
	vm.runInNewContext( readFileSync( basisPath, 'utf8' ), context, { filename: basisPath } );
	const createModule = module.exports as ( options: { wasmBinary: Uint8Array } ) => Promise<BasisTranscoder>;
	const transcoder = await createModule( { wasmBinary: new Uint8Array( readFileSync( wasmPath ) ) } );
	transcoder.initializeBasis();
	return transcoder;
}

function transcodeRgba32( texture: TextureData, transcoder: BasisTranscoder ): Uint8Array {
	return transcodeAllLevels( texture, transcoder, 13 )[ 0 ]!;
}

function transcodeAllLevels( texture: TextureData, transcoder: BasisTranscoder, format: number, options: { alphaTest?: number; normalMap?: boolean; colorSpace?: 'srgb' | 'linear' | 'none' } = {} ): Uint8Array[] {
	const ktx = new transcoder.KTX2File( new Uint8Array( writeUastcKtx2( encodeUastcTexture( texture, options ) ) ) );
	if ( ! ktx.isValid() || ! ktx.isUASTC() ) throw new Error( 'Bundled Basis transcoder rejected the test UASTC texture' );
	if ( ! ktx.startTranscoding() ) throw new Error( 'Bundled Basis transcoder could not start' );
	try {
		const levels: Uint8Array[] = [];
		for ( let level = 0; level < ktx.getLevels(); level ++ ) {
			const data = new Uint8Array( ktx.getImageTranscodedSizeInBytes( level, 0, 0, format ) );
			if ( ! ktx.transcodeImage( data, level, 0, 0, format, 0, - 1, - 1 ) ) throw new Error( `Bundled Basis transcoding failed for format ${ format } at mip ${ level }` );
			levels.push( data );
		}
		return levels;
	} finally {
		ktx.close();
		ktx.delete();
	}
}

function makeBinaryAlphaLevels( levels: { width: number; height: number; data: Uint8Array }[], alphaTest: number ): { width: number; height: number; data: Uint8Array }[] {
	return levels.map( ( level ) => {
		const data = level.data.slice();
		for ( let offset = 3; offset < data.length; offset += 4 ) data[ offset ] = data[ offset ]! / 255 >= alphaTest ? 255 : 0;
		return { width: level.width, height: level.height, data };
	} );
}

function countMaskMismatches( source: Uint8Array, decoded: Uint8Array, alphaTest: number ): number {
	let mismatches = 0;
	for ( let pixel = 0; pixel < source.length / 4; pixel ++ ) {
		if ( ( source[ pixel * 4 + 3 ]! / 255 >= alphaTest ) !== ( decoded[ pixel * 4 + 3 ]! / 255 >= alphaTest ) ) mismatches ++;
	}
	return mismatches;
}

const EAC_ALPHA_MODIFIERS = [
	[ - 3, - 6, - 9, - 15, 2, 5, 8, 14 ],
	[ - 3, - 7, - 10, - 13, 2, 6, 9, 12 ],
	[ - 2, - 5, - 8, - 13, 1, 4, 7, 12 ],
	[ - 2, - 4, - 6, - 13, 1, 3, 5, 12 ],
	[ - 3, - 6, - 8, - 12, 2, 5, 7, 11 ],
	[ - 3, - 7, - 9, - 11, 2, 6, 8, 10 ],
	[ - 4, - 7, - 8, - 11, 3, 6, 7, 10 ],
	[ - 3, - 5, - 8, - 11, 2, 4, 7, 10 ],
	[ - 2, - 6, - 8, - 10, 1, 5, 7, 9 ],
	[ - 2, - 5, - 8, - 10, 1, 4, 7, 9 ],
	[ - 2, - 4, - 8, - 10, 1, 3, 7, 9 ],
	[ - 2, - 5, - 7, - 10, 1, 4, 6, 9 ],
	[ - 3, - 4, - 7, - 10, 2, 3, 6, 9 ],
	[ - 1, - 2, - 3, - 10, 1, 2, 3, 9 ],
	[ - 4, - 6, - 8, - 9, 3, 5, 7, 8 ],
	[ - 3, - 5, - 7, - 9, 2, 4, 6, 8 ],
];

function decodeEtc2Alpha( blocks: Uint8Array, width: number, height: number ): Uint8Array {
	const pixels = new Uint8Array( width * height );
	const blocksWide = Math.ceil( width / 4 );
	const blocksHigh = Math.ceil( height / 4 );
	for ( let blockY = 0; blockY < blocksHigh; blockY ++ ) {
		for ( let blockX = 0; blockX < blocksWide; blockX ++ ) {
			const blockOffset = ( blockY * blocksWide + blockX ) * 16;
			const base = blocks[ blockOffset ]!;
			const table = blocks[ blockOffset + 1 ]! >> 4;
			const multiplier = blocks[ blockOffset + 1 ]! & 0x0f;
			let indices = 0n;
			for ( let byte = 0; byte < 6; byte ++ ) indices = ( indices << 8n ) | BigInt( blocks[ blockOffset + 2 + byte ]! );
			for ( let x = 0; x < 4; x ++ ) {
				for ( let y = 0; y < 4; y ++ ) {
					const texel = x * 4 + y;
					const index = Number( ( indices >> BigInt( 45 - texel * 3 ) ) & 7n );
					const value = Math.max( 0, Math.min( 255, base + EAC_ALPHA_MODIFIERS[ table ]![ index ]! * multiplier ) );
					const pixelX = blockX * 4 + x;
					const pixelY = blockY * 4 + y;
					if ( pixelX < width && pixelY < height ) pixels[ pixelY * width + pixelX ] = value;
				}
			}
		}
	}
	return pixels;
}

function writeBc7Dds( width: number, height: number, levels: Uint8Array[], destination: string ): void {
	const totalBytes = levels.reduce( ( total, level ) => total + level.byteLength, 0 );
	const header = new Uint8Array( 148 );
	const view = new DataView( header.buffer );
	header.set( [ 68, 68, 83, 32 ], 0 );
	view.setUint32( 4, 124, true );
	view.setUint32( 8, 0xa1007, true );
	view.setUint32( 12, height, true );
	view.setUint32( 16, width, true );
	view.setUint32( 20, levels[ 0 ]!.byteLength, true );
	view.setUint32( 28, levels.length, true );
	view.setUint32( 76, 32, true );
	view.setUint32( 80, 4, true );
	header.set( [ 68, 88, 49, 48 ], 84 );
	view.setUint32( 108, 0x1000, true );
	view.setUint32( 128, 98, true );
	view.setUint32( 132, 3, true );
	view.setUint32( 140, 1, true );
	const file = new Uint8Array( header.byteLength + totalBytes );
	file.set( header );
	let offset = header.byteLength;
	for ( const level of levels ) {
		file.set( level, offset );
		offset += level.byteLength;
	}
	writeFileSync( destination, file );
}

function readPngRgba( source: string ): { width: number; height: number; data: Uint8Array } {
	const bytes = readFileSync( source );
	let offset = 8;
	let width = 0;
	let height = 0;
	let channels = 0;
	const compressed: Uint8Array[] = [];
	while ( offset < bytes.length ) {
		const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
		const length = view.getUint32( offset, false );
		const type = String.fromCharCode( ...bytes.subarray( offset + 4, offset + 8 ) );
		const data = bytes.subarray( offset + 8, offset + 8 + length );
		if ( type === 'IHDR' ) {
			const headerView = new DataView( data.buffer, data.byteOffset, data.byteLength );
			width = headerView.getUint32( 0, false );
			height = headerView.getUint32( 4, false );
			channels = data[ 9 ] === 6 ? 4 : data[ 9 ] === 2 ? 3 : 0;
		} else if ( type === 'IDAT' ) compressed.push( data.slice() );
		offset += length + 12;
	}
	if ( channels === 0 || bytes[ 24 ] !== 8 ) throw new Error( 'Reference decoder did not emit an 8-bit RGB/RGBA PNG' );
	const compressedLength = compressed.reduce( ( total, chunk ) => total + chunk.length, 0 );
	const compressedData = new Uint8Array( compressedLength );
	let compressedOffset = 0;
	for ( const chunk of compressed ) {
		compressedData.set( chunk, compressedOffset );
		compressedOffset += chunk.length;
	}
	const decoded = inflateSync( compressedData );
	const stride = width * channels;
	const sourcePixels = new Uint8Array( width * height * channels );
	for ( let y = 0; y < height; y ++ ) {
		const row = y * ( stride + 1 );
		const filter = decoded[ row ]!;
		for ( let x = 0; x < stride; x ++ ) {
			const input = decoded[ row + 1 + x ]!;
			const left = x >= channels ? sourcePixels[ y * stride + x - channels ]! : 0;
			const above = y > 0 ? sourcePixels[ ( y - 1 ) * stride + x ]! : 0;
			const upperLeft = y > 0 && x >= channels ? sourcePixels[ ( y - 1 ) * stride + x - channels ]! : 0;
			let predictor = 0;
			if ( filter === 1 ) predictor = left;
			else if ( filter === 2 ) predictor = above;
			else if ( filter === 3 ) predictor = Math.floor( ( left + above ) / 2 );
			else if ( filter === 4 ) {
				const p = left + above - upperLeft;
				const distanceLeft = Math.abs( p - left );
				const distanceAbove = Math.abs( p - above );
				const distanceUpperLeft = Math.abs( p - upperLeft );
				predictor = distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft ? left : distanceAbove <= distanceUpperLeft ? above : upperLeft;
			} else if ( filter !== 0 ) throw new Error( `Unsupported PNG filter: ${ filter }` );
			sourcePixels[ y * stride + x ] = ( input + predictor ) & 0xff;
		}
	}
	const rgba = new Uint8Array( width * height * 4 );
	for ( let pixel = 0; pixel < width * height; pixel ++ ) {
		rgba.set( sourcePixels.subarray( pixel * channels, pixel * channels + channels ), pixel * 4 );
		if ( channels === 3 ) rgba[ pixel * 4 + 3 ] = 255;
	}
	return { width, height, data: rgba };
}

function decodeBc7LevelsWithBasisu( width: number, height: number, levels: Uint8Array[] ): Uint8Array[] {
	const directory = mkdtempSync( path.join( tmpdir(), 'vegetation-uastc-bc7-' ) );
	const inputPath = path.join( directory, 'alpha-mask.dds' );
	try {
		writeBc7Dds( width, height, levels, inputPath );
		execFileSync( 'basisu', [ '-unpack', '-no_ktx', '-output_path', directory, inputPath ], { stdio: 'ignore' } );
		const names = readdirSync( directory );
		return levels.map( ( _level, levelIndex ) => {
			const expression = new RegExp( `_unpacked_rgba_RGBA32_level_${ levelIndex }_face_0_layer_0000\\.png$`, 'i' );
			const name = names.find( ( candidate ) => candidate.startsWith( 'alpha-mask' ) && expression.test( candidate ) );
			if ( name === undefined ) throw new Error( `basisu did not emit a direct RGBA decode for BC7 mip ${ levelIndex }: ${ names.join( ', ' ) }` );
			return readPngRgba( path.join( directory, name ) ).data;
		} );
	} finally {
		rmSync( directory, { recursive: true, force: true } );
	}
}

function countAlphaChannelMaskMismatches( source: Uint8Array, decoded: Uint8Array, alphaTest: number ): number {
	let mismatches = 0;
	for ( let pixel = 0; pixel < source.length / 4; pixel ++ ) {
		if ( ( source[ pixel * 4 + 3 ]! / 255 >= alphaTest ) !== ( decoded[ pixel ]! / 255 >= alphaTest ) ) mismatches ++;
	}
	return mismatches;
}

function basisuIsAvailable(): boolean {
	try {
		execFileSync( 'basisu', [ '-version' ], { stdio: 'ignore' } );
		return true;
	} catch {
		return false;
	}
}

const HAS_BASISU_REFERENCE_DECODER = basisuIsAvailable();

function createTexture( width: number, height: number, alpha = false ): TextureData {
	const data = new Uint8Array( width * height * 4 );
	for ( let y = 0; y < height; y ++ ) {
		for ( let x = 0; x < width; x ++ ) {
			const offset = ( y * width + x ) * 4;
			data[ offset ] = x * 255 / Math.max( 1, width - 1 );
			data[ offset + 1 ] = y * 255 / Math.max( 1, height - 1 );
			data[ offset + 2 ] = ( x + y ) * 29;
			data[ offset + 3 ] = ! alpha || ( x + y ) % 2 === 0 ? 255 : 0;
		}
	}
	return { width, height, data };
}

function getGeneratedAlphaTargets(): { name: string; texture: TextureData; alphaTest: number }[] {
	const tree = generateTreeData( { seed: 1 } );
	const allium = generateFlowersData( { seed: 1, variety: 'allium' } );
	return [
		{ name: 'allium plantCard', data: allium, textureName: 'plantCard' },
		{ name: 'tree leaf', data: tree, textureName: 'leaf' },
		{ name: 'tree leaf ring', data: tree, textureName: 'leafRing' },
	].map( ( target ) => {
		const texture = target.data.textures[ target.textureName ];
		if ( texture === undefined ) throw new Error( `Missing ${ target.textureName } texture` );
		const alphaTest = Math.max( ...target.data.parts.filter( ( part ) => part.texture === target.textureName ).map( ( part ) => part.alphaTest ) );
		return { name: target.name, texture, alphaTest };
	} );
}

function readBits( data: Uint8Array, offset: number, count: number ): number {
	let value = 0;
	for ( let bit = 0; bit < count; bit ++ ) value |= ( ( data[ ( offset + bit ) >> 3 ]! >> ( ( offset + bit ) & 7 ) ) & 1 ) << bit;
	return value;
}

describe( 'runtime UASTC prototype', () => {
	beforeAll( async () => {
		basis = await loadBasisTranscoder();
	} );

	it( 'encodes deterministic RGB blocks and writes a readable KTX2 mip chain', () => {
		const texture = createTexture( 8, 4 );
		const encoded = encodeUastcTexture( texture );
		const repeated = encodeUastcTexture( texture );
		expect( encoded.data ).toEqual( repeated.data );
		expect( encoded.levels[ 0 ]!.data ).toHaveLength( 2 * 16 );
		expect( readBits( encoded.levels[ 0 ]!.data, 0, 5 ) ).toBe( 0x0b );

		const parsed = read( new Uint8Array( writeUastcKtx2( encoded ) ) );
		expect( parsed.vkFormat ).toBe( 0 );
		expect( parsed.supercompressionScheme ).toBe( 0 );
		expect( parsed.levels ).toHaveLength( encoded.levels.length );
		expect( parsed.dataFormatDescriptor[ 0 ] ).toMatchObject( { colorModel: 166, transferFunction: 2 } );
		expect( parsed.dataFormatDescriptor[ 0 ]!.samples[ 0 ] ).toMatchObject( { bitOffset: 0, bitLength: 127, channelType: 0 } );
	} );

	it( 'slices the main-thread fallback after at most 16 UASTC blocks', async () => {
		const texture = createTexture( 64, 64 );
		const sliceTimes: number[] = [];
		let timerFired = false;
		const timer = new Promise<void>( ( resolve ) => setTimeout( () => {
			timerFired = true;
			resolve();
		}, 0 ) );
		const encoded = await encodeUastcTextureAsync( texture, {}, ( durationMs ) => sliceTimes.push( durationMs ) );
		await timer;

		expect( timerFired ).toBe( true );
		expect( sliceTimes.length ).toBeGreaterThan( 1 );
		expect( encoded.data ).toEqual( encodeUastcTexture( texture ).data );
	} );

	it( 'creates the same coverage-preserving mip chain in small fallback slices', async () => {
		const texture = createTexture( 19, 13, true );
		const sliceTimes: number[] = [];
		const synchronous = generateTextureMipmaps( texture, 0.5 );
		const asynchronous = await generateTextureMipmapsAsync( texture, 0.5, false, ( durationMs ) => sliceTimes.push( durationMs ) );

		expect( asynchronous ).toEqual( synchronous );
		expect( sliceTimes.length ).toBeGreaterThan( 1 );
	} );

	it( 'keeps alpha-test coverage binary in every emitted mip level', () => {
		const texture = createTexture( 8, 8, true );
		const encoded = encodeUastcTexture( texture, { alphaTest: 0.5 } );
		expect( encoded.alpha ).toBe( true );
		expect( readBits( encoded.levels[ 0 ]!.data, 0, 5 ) ).toBe( 0x1f );
		const parsed = read( new Uint8Array( writeUastcKtx2( encoded ) ) );
		expect( parsed.dataFormatDescriptor[ 0 ] ).toMatchObject( { colorModel: 166, transferFunction: 2 } );
		expect( parsed.dataFormatDescriptor[ 0 ]!.samples[ 0 ] ).toMatchObject( { bitLength: 127, channelType: 3 } );
		for ( const level of encoded.levels ) expect( level.data.byteLength ).toBe( Math.ceil( level.width / 4 ) * Math.ceil( level.height / 4 ) * 16 );
	} );

	it( 'keeps the exact alpha-test mask after RGBA32 and ETC2 transcodes at every mip', () => {
		const texture = createTexture( 16, 8, true );
		const alphaTest = 0.5;
		const sourceLevels = generateTextureMipmaps( texture, alphaTest );
		const binaryLevels = makeBinaryAlphaLevels( sourceLevels, alphaTest );
		const options = { alphaTest };
		const rgbaLevels = transcodeAllLevels( texture, basis, 13, options );
		const etc2Levels = transcodeAllLevels( texture, basis, 1, options );
		const decodedEtc2Levels = etc2Levels.map( ( level, index ) => decodeEtc2Alpha( level, binaryLevels[ index ]!.width, binaryLevels[ index ]!.height ) );

		expect( rgbaLevels ).toHaveLength( binaryLevels.length );
		expect( etc2Levels ).toHaveLength( binaryLevels.length );
		for ( let levelIndex = 0; levelIndex < binaryLevels.length; levelIndex ++ ) {
			const source = binaryLevels[ levelIndex ]!;
			const rgba = rgbaLevels[ levelIndex ]!;
			expect( countMaskMismatches( source.data, rgba, alphaTest ), `RGBA32 mip ${ levelIndex }` ).toBe( 0 );
			expect( countAlphaChannelMaskMismatches( source.data, decodedEtc2Levels[ levelIndex ]!, alphaTest ), `ETC2 mip ${ levelIndex }` ).toBe( 0 );
		}
	} );

	it( 'keeps generated leaf and flower cut-outs exact after RGBA32 and ETC2 transcodes', () => {
		for ( const target of getGeneratedAlphaTargets() ) {
			const sourceLevels = target.texture.mipmaps ?? generateTextureMipmaps( target.texture, target.alphaTest );
			const binaryLevels = makeBinaryAlphaLevels( sourceLevels, target.alphaTest );
			const texture = { ...target.texture, mipmaps: sourceLevels };
			const options = { alphaTest: target.alphaTest };
			const rgbaLevels = transcodeAllLevels( texture, basis, 13, options );
			const etc2Levels = transcodeAllLevels( texture, basis, 1, options );
			expect( rgbaLevels, `${ target.name } RGBA32 mips` ).toHaveLength( binaryLevels.length );
			expect( etc2Levels, `${ target.name } ETC2 mips` ).toHaveLength( binaryLevels.length );
			for ( let levelIndex = 0; levelIndex < binaryLevels.length; levelIndex ++ ) {
				const source = binaryLevels[ levelIndex ]!;
				expect( countMaskMismatches( source.data, rgbaLevels[ levelIndex ]!, target.alphaTest ), `${ target.name } RGBA32 mip ${ levelIndex }` ).toBe( 0 );
				const alpha = decodeEtc2Alpha( etc2Levels[ levelIndex ]!, source.width, source.height );
				expect( countAlphaChannelMaskMismatches( source.data, alpha, target.alphaTest ), `${ target.name } ETC2 mip ${ levelIndex }` ).toBe( 0 );
			}
		}
	} );

	it.skipIf( ! HAS_BASISU_REFERENCE_DECODER )( 'keeps the exact alpha-test mask after BC7 transcodes at every mip', () => {
		const texture = createTexture( 16, 8, true );
		const alphaTest = 0.5;
		const binaryLevels = makeBinaryAlphaLevels( generateTextureMipmaps( texture, alphaTest ), alphaTest );
		const bc7Levels = transcodeAllLevels( texture, basis, 7, { alphaTest } );
		const decodedLevels = decodeBc7LevelsWithBasisu( texture.width, texture.height, bc7Levels );

		expect( decodedLevels ).toHaveLength( binaryLevels.length );
		for ( let levelIndex = 0; levelIndex < binaryLevels.length; levelIndex ++ ) {
			expect( countMaskMismatches( binaryLevels[ levelIndex ]!.data, decodedLevels[ levelIndex ]!, alphaTest ), `BC7 mip ${ levelIndex }` ).toBe( 0 );
		}
	} );

	it.skipIf( ! HAS_BASISU_REFERENCE_DECODER )( 'keeps generated leaf and flower cut-outs exact after BC7 transcodes', () => {
		for ( const target of getGeneratedAlphaTargets() ) {
			const sourceLevels = target.texture.mipmaps ?? generateTextureMipmaps( target.texture, target.alphaTest );
			const binaryLevels = makeBinaryAlphaLevels( sourceLevels, target.alphaTest );
			const bc7Levels = transcodeAllLevels( { ...target.texture, mipmaps: sourceLevels }, basis, 7, { alphaTest: target.alphaTest } );
			const decodedLevels = decodeBc7LevelsWithBasisu( target.texture.width, target.texture.height, bc7Levels );
			expect( decodedLevels, `${ target.name } BC7 mips` ).toHaveLength( binaryLevels.length );
			for ( let levelIndex = 0; levelIndex < binaryLevels.length; levelIndex ++ ) {
				expect( countMaskMismatches( binaryLevels[ levelIndex ]!.data, decodedLevels[ levelIndex ]!, target.alphaTest ), `${ target.name } BC7 mip ${ levelIndex }` ).toBe( 0 );
			}
		}
	} );

	it( 'marks normal data as linear with unspecified primaries', () => {
		const encoded = encodeUastcTexture( createTexture( 4, 4 ), { normalMap: true } );
		const parsed = read( new Uint8Array( writeUastcKtx2( encoded ) ) );
		expect( parsed.dataFormatDescriptor[ 0 ] ).toMatchObject( { colorModel: 166, colorPrimaries: 0, transferFunction: 1 } );
	} );

	it( 'preserves block-local gradients and single-texel features through Basis RGBA32 decode', () => {
		const blockColors = [
			[ 21, 42, 63 ], [ 83, 104, 125 ], [ 145, 166, 187 ], [ 207, 228, 249 ],
			[ 37, 91, 173 ], [ 99, 153, 235 ], [ 161, 215, 41 ], [ 223, 23, 103 ],
			[ 49, 137, 211 ], [ 111, 199, 17 ], [ 173, 5, 79 ], [ 235, 67, 141 ],
			[ 61, 183, 7 ], [ 123, 245, 69 ], [ 185, 51, 131 ], [ 247, 113, 193 ],
		];
		const blockTexture = { width: 16, height: 16, data: new Uint8Array( 16 * 16 * 4 ) };
		for ( let blockY = 0; blockY < 4; blockY ++ ) {
			for ( let blockX = 0; blockX < 4; blockX ++ ) {
				const color = blockColors[ blockY * 4 + blockX ]!;
				for ( let y = 0; y < 4; y ++ ) {
					for ( let x = 0; x < 4; x ++ ) {
						const offset = ( ( blockY * 4 + y ) * 16 + blockX * 4 + x ) * 4;
						blockTexture.data.set( [ ...color, 255 ], offset );
					}
				}
			}
		}
		const decodedBlocks = transcodeRgba32( blockTexture, basis );
		for ( let blockY = 0; blockY < 4; blockY ++ ) {
			for ( let blockX = 0; blockX < 4; blockX ++ ) {
				const offset = ( ( blockY * 4 + 1 ) * 16 + blockX * 4 + 1 ) * 4;
				const expected = blockColors[ blockY * 4 + blockX ]!;
				for ( let channel = 0; channel < 3; channel ++ ) expect( Math.abs( decodedBlocks[ offset + channel ]! - expected[ channel ]! ) ).toBeLessThanOrEqual( 1 );
			}
		}

		const checkerTexture = { width: 16, height: 16, data: new Uint8Array( 16 * 16 * 4 ) };
		for ( let y = 0; y < 16; y ++ ) {
			for ( let x = 0; x < 16; x ++ ) {
				const value = ( ( x + y ) & 1 ) === 0 ? 255 : 0;
				const offset = ( y * 16 + x ) * 4;
				checkerTexture.data.set( [ value, value, value, 255 ], offset );
			}
		}
		const decodedChecker = transcodeRgba32( checkerTexture, basis );
		for ( let pixel = 0; pixel < 16 * 16; pixel ++ ) {
			for ( let channel = 0; channel < 3; channel ++ ) expect( decodedChecker[ pixel * 4 + channel ] ).toBe( checkerTexture.data[ pixel * 4 + channel ] );
		}

		const lineTexture = { width: 16, height: 16, data: new Uint8Array( 16 * 16 * 4 ) };
		for ( let y = 0; y < 16; y ++ ) {
			for ( let x = 0; x < 16; x ++ ) {
				const value = x === 6 || y === 9 ? 255 : 0;
				const offset = ( y * 16 + x ) * 4;
				lineTexture.data.set( [ value, value, value, 255 ], offset );
			}
		}
		const decodedLines = transcodeRgba32( lineTexture, basis );
		for ( let pixel = 0; pixel < 16 * 16; pixel ++ ) {
			for ( let channel = 0; channel < 3; channel ++ ) expect( decodedLines[ pixel * 4 + channel ] ).toBe( lineTexture.data[ pixel * 4 + channel ] );
		}

		const gradient = { width: 16, height: 16, data: new Uint8Array( 16 * 16 * 4 ) };
		for ( let y = 0; y < 16; y ++ ) {
			for ( let x = 0; x < 16; x ++ ) {
				const localX = x % 4;
				const green = localX * 80;
				const red = 24 + Math.floor( x / 4 ) * 52 + Math.floor( y / 4 ) * 13;
				const offset = ( y * 16 + x ) * 4;
				gradient.data.set( [ red, green, 255 - green, 255 ], offset );
			}
		}
		const decodedGradient = transcodeRgba32( gradient, basis );
		for ( let y = 0; y < 16; y ++ ) {
			for ( let x = 0; x < 16; x ++ ) {
				const offset = ( y * 16 + x ) * 4;
				for ( let channel = 0; channel < 3; channel ++ ) expect( Math.abs( decodedGradient[ offset + channel ]! - gradient.data[ offset + channel ]! ) ).toBeLessThanOrEqual( 15 );
			}
		}
	} );
} );
