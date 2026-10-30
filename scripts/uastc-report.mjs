import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { deflateSync, gzipSync, inflateSync } from 'node:zlib';
import { writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { CompressedTexture, RGBA_ASTC_4x4_Format, UnsignedByteType } from 'three';
import { generateRockData } from '../src/core/generators/rock.ts';
import { generateFlowersData } from '../src/core/generators/flowers.ts';
import { generateTreeData } from '../src/core/generators/tree.ts';
import { generateTextureMipmaps } from '../src/core/textureMipmaps.ts';
import { encodeUastcTexture, encodeUastcTextureAsync } from '../src/core/uastc.ts';
import { writeUastcKtx2, writeUastcKtx2Async } from '../src/core/ktx2.ts';
import { read as readKtx2 } from 'three/examples/jsm/libs/ktx-parse.module.js';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const scratchPath = path.join( root, 'scratch', 'uastc' );
const require = createRequire( import.meta.url );
const basisPath = require.resolve( 'three/examples/jsm/libs/basis/basis_transcoder.js' );
const wasmPath = path.join( path.dirname( basisPath ), 'basis_transcoder.wasm' );
const worker = new Worker( new URL( './uastcMeasureWorker.mjs', import.meta.url ), { type: 'module' } );
let nextWorkerId = 0;
const workerPending = new Map();
let browserWorkersCreated = 0;

const EAC_ALPHA_MODIFIERS = [
	[ - 3, - 6, - 9, - 15, 2, 5, 8, 14 ], [ - 3, - 7, - 10, - 13, 2, 6, 9, 12 ],
	[ - 2, - 5, - 8, - 13, 1, 4, 7, 12 ], [ - 2, - 4, - 6, - 13, 1, 3, 5, 12 ],
	[ - 3, - 6, - 8, - 12, 2, 5, 7, 11 ], [ - 3, - 7, - 9, - 11, 2, 6, 8, 10 ],
	[ - 4, - 7, - 8, - 11, 3, 6, 7, 10 ], [ - 3, - 5, - 8, - 11, 2, 4, 7, 10 ],
	[ - 2, - 6, - 8, - 10, 1, 5, 7, 9 ], [ - 2, - 5, - 8, - 10, 1, 4, 7, 9 ],
	[ - 2, - 4, - 8, - 10, 1, 3, 7, 9 ], [ - 2, - 5, - 7, - 10, 1, 4, 6, 9 ],
	[ - 3, - 4, - 7, - 10, 2, 3, 6, 9 ], [ - 1, - 2, - 3, - 10, 1, 2, 3, 9 ],
	[ - 4, - 6, - 8, - 9, 3, 5, 7, 8 ], [ - 3, - 5, - 7, - 9, 2, 4, 6, 8 ],
];

class BrowserWorkerAdapter {
	constructor() {
		browserWorkersCreated ++;
		this.worker = new Worker( new URL( './uastcBrowserWorker.mjs', import.meta.url ), { type: 'module', execArgv: process.execArgv } );
		this.worker.on( 'message', ( data ) => this.onmessage?.( { data } ) );
		this.worker.on( 'error', ( error ) => this.onerror?.( { message: error.message } ) );
	}

	postMessage( message, transfer ) {
		this.worker.postMessage( message, transfer );
	}

	terminate() {
		void this.worker.terminate();
	}
}

globalThis.Worker = BrowserWorkerAdapter;

worker.on( 'message', ( message ) => {
	const pending = workerPending.get( message.id );
	if ( pending === undefined ) return;
	workerPending.delete( message.id );
	pending.resolve( message );
} );

worker.on( 'error', ( error ) => {
	for ( const pending of workerPending.values() ) pending.reject( error );
	workerPending.clear();
} );

function workerEncode( texture, options ) {
	const id = nextWorkerId ++;
	return new Promise( ( resolve, reject ) => {
		workerPending.set( id, { resolve, reject } );
		worker.postMessage( { id, texture, options } );
	} );
}

function loadBasisTranscoder() {
	const code = readFileSync( basisPath, 'utf8' );
	const module = { exports: {} };
	const context = {
		module,
		exports: module.exports,
		require: createRequire( basisPath ),
		__filename: basisPath,
		__dirname: path.dirname( basisPath ),
		process,
		Buffer,
		WebAssembly,
		console,
		performance,
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval,
	};
	vm.runInNewContext( code, context, { filename: basisPath } );
	return module.exports( { wasmBinary: new Uint8Array( readFileSync( wasmPath ) ) } ).then( ( basis ) => {
		basis.initializeBasis();
		return basis;
	} );
}

function getAlphaTest( data, textureName ) {
	return data.parts.reduce( ( value, part ) => part.texture === textureName ? Math.max( value, part.alphaTest ) : value, 0 );
}

function getTextureLevels( texture, alphaTest, normalMap ) {
	return texture.mipmaps ?? generateTextureMipmaps( texture, alphaTest, normalMap );
}

function transcode( basis, ktx2Buffer, format ) {
	const file = new basis.KTX2File( new Uint8Array( ktx2Buffer ) );
	if ( ! file.isValid() ) throw new Error( 'Basis transcoder rejected the KTX2 container' );
	if ( ! file.isUASTC() ) throw new Error( 'Basis transcoder did not recognize the UASTC payload' );
	if ( ! file.startTranscoding() ) throw new Error( 'Basis transcoder could not start' );
	const levels = [];
	try {
		for ( let levelIndex = 0; levelIndex < file.getLevels(); levelIndex ++ ) {
			const targetSize = file.getImageTranscodedSizeInBytes( levelIndex, 0, 0, format );
			const data = new Uint8Array( targetSize );
			if ( ! file.transcodeImage( data, levelIndex, 0, 0, format, 0, - 1, - 1 ) ) throw new Error( `Basis transcode failed at mip ${ levelIndex } for format ${ format }` );
			levels.push( data );
		}
		return levels;
	} finally {
		file.close();
		file.delete();
	}
}

function psnr( source, decoded, pixelLimit ) {
	let error = 0;
	let count = 0;
	for ( let pixel = 0; pixel < pixelLimit; pixel ++ ) {
		for ( let channel = 0; channel < 3; channel ++ ) {
			const difference = source[ pixel * 4 + channel ] - decoded[ pixel * 4 + channel ];
			error += difference * difference;
			count ++;
		}
	}
	return error === 0 ? Infinity : 10 * Math.log10( 255 * 255 * count / error );
}

function alphaCoverage( source, decoded, alphaTest ) {
	const threshold = Math.ceil( alphaTest * 255 );
	let sourceCovered = 0;
	let decodedCovered = 0;
	let mismatched = 0;
	for ( let pixel = 0; pixel < source.length / 4; pixel ++ ) {
		const sourceValue = source[ pixel * 4 + 3 ] >= threshold;
		const decodedValue = decoded[ pixel * 4 + 3 ] >= threshold;
		if ( sourceValue ) sourceCovered ++;
		if ( decodedValue ) decodedCovered ++;
		if ( sourceValue !== decodedValue ) mismatched ++;
	}
	return { sourceCovered, decodedCovered, mismatched, equalCoverage: sourceCovered === decodedCovered && mismatched === 0 };
}

function alphaCoverageByMip( sourceLevels, decodedLevels, alphaTest ) {
	return sourceLevels.map( ( level, index ) => ( {
		mip: index,
		...alphaCoverage( level.data, decodedLevels[ index ], alphaTest ),
	} ) );
}

function decodeEtc2Alpha( blocks, width, height ) {
	const pixels = new Uint8Array( width * height );
	const blocksWide = Math.ceil( width / 4 );
	const blocksHigh = Math.ceil( height / 4 );
	for ( let blockY = 0; blockY < blocksHigh; blockY ++ ) {
		for ( let blockX = 0; blockX < blocksWide; blockX ++ ) {
			const offset = ( blockY * blocksWide + blockX ) * 16;
			const base = blocks[ offset ];
			const table = blocks[ offset + 1 ] >> 4;
			const multiplier = blocks[ offset + 1 ] & 15;
			let indices = 0n;
			for ( let byte = 0; byte < 6; byte ++ ) indices = ( indices << 8n ) | BigInt( blocks[ offset + 2 + byte ] );
			for ( let x = 0; x < 4; x ++ ) {
				for ( let y = 0; y < 4; y ++ ) {
					const texel = x * 4 + y;
					const index = Number( ( indices >> BigInt( 45 - texel * 3 ) ) & 7n );
					const alpha = Math.max( 0, Math.min( 255, base + EAC_ALPHA_MODIFIERS[ table ][ index ] * multiplier ) );
					const pixelX = blockX * 4 + x;
					const pixelY = blockY * 4 + y;
					if ( pixelX < width && pixelY < height ) pixels[ pixelY * width + pixelX ] = alpha;
				}
			}
		}
	}
	return pixels;
}

function binaryAlphaLevels( sourceLevels, alphaTest ) {
	const threshold = Math.ceil( alphaTest * 255 );
	return sourceLevels.map( ( level ) => {
		const data = level.data.slice();
		for ( let offset = 3; offset < data.length; offset += 4 ) data[ offset ] = data[ offset ] >= threshold ? 255 : 0;
		return { ...level, data };
	} );
}

function blockCount( width, height ) {
	return Math.max( 1, Math.ceil( width / 4 ) ) * Math.max( 1, Math.ceil( height / 4 ) );
}

function gpuBytes( levels, bytesPerBlock ) {
	return levels.reduce( ( total, level ) => total + blockCount( level.width, level.height ) * bytesPerBlock, 0 );
}

function crop( level, width, height, requestedX, requestedY ) {
	const cropWidth = Math.min( width, level.width );
	const cropHeight = Math.min( height, level.height );
	const xStart = Math.max( 0, Math.min( level.width - cropWidth, requestedX ?? Math.floor( ( level.width - cropWidth ) / 2 ) ) );
	const yStart = Math.max( 0, Math.min( level.height - cropHeight, requestedY ?? Math.floor( ( level.height - cropHeight ) / 2 ) ) );
	const data = new Uint8Array( cropWidth * cropHeight * 4 );
	for ( let y = 0; y < cropHeight; y ++ ) {
		const sourceOffset = ( ( yStart + y ) * level.width + xStart ) * 4;
		data.set( level.data.subarray( sourceOffset, sourceOffset + cropWidth * 4 ), y * cropWidth * 4 );
	}
	return { width: cropWidth, height: cropHeight, data };
}

const crcTable = new Uint32Array( 256 );
for ( let index = 0; index < 256; index ++ ) {
	let value = index;
	for ( let bit = 0; bit < 8; bit ++ ) value = value & 1 ? 0xedb88320 ^ ( value >>> 1 ) : value >>> 1;
	crcTable[ index ] = value >>> 0;
}

function crc32( data ) {
	let value = 0xffffffff;
	for ( const byte of data ) value = crcTable[ ( value ^ byte ) & 0xff ] ^ ( value >>> 8 );
	return ( value ^ 0xffffffff ) >>> 0;
}

function pngChunk( tag, data ) {
	const type = Buffer.from( tag );
	const result = Buffer.alloc( 12 + data.byteLength );
	result.writeUInt32BE( data.byteLength, 0 );
	type.copy( result, 4 );
	Buffer.from( data ).copy( result, 8 );
	result.writeUInt32BE( crc32( Buffer.concat( [ type, Buffer.from( data ) ] ) ), 8 + data.byteLength );
	return result;
}

function writePng( image, destination ) {
	const scanlines = Buffer.alloc( image.height * ( image.width * 4 + 1 ) );
	for ( let y = 0; y < image.height; y ++ ) {
		const rowOffset = y * ( image.width * 4 + 1 );
		scanlines[ rowOffset ] = 0;
		scanlines.set( image.data.subarray( y * image.width * 4, ( y + 1 ) * image.width * 4 ), rowOffset + 1 );
	}
	const header = Buffer.alloc( 13 );
	header.writeUInt32BE( image.width, 0 );
	header.writeUInt32BE( image.height, 4 );
	header[ 8 ] = 8;
	header[ 9 ] = 6;
	return writeFile( destination, Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), pngChunk( 'IHDR', header ), pngChunk( 'IDAT', deflateSync( scanlines ) ), pngChunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );
}

function readPng( source ) {
	const bytes = readFileSync( source );
	let offset = 8;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	const compressed = [];
	while ( offset < bytes.length ) {
		const length = bytes.readUInt32BE( offset );
		const type = bytes.toString( 'ascii', offset + 4, offset + 8 );
		const data = bytes.subarray( offset + 8, offset + 8 + length );
		if ( type === 'IHDR' ) {
			width = data.readUInt32BE( 0 );
			height = data.readUInt32BE( 4 );
			bitDepth = data[ 8 ];
			colorType = data[ 9 ];
		} else if ( type === 'IDAT' ) compressed.push( data );
		offset += length + 12;
	}
	if ( bitDepth !== 8 || ( colorType !== 2 && colorType !== 6 ) ) throw new Error( `Expected RGB8 or RGBA8 PNG: ${ source }` );
	const decoded = inflateSync( Buffer.concat( compressed ) );
	const channels = colorType === 6 ? 4 : 3;
	const stride = width * channels;
	const sourcePixels = new Uint8Array( width * height * channels );
	for ( let y = 0; y < height; y ++ ) {
		const row = y * ( stride + 1 );
		const filter = decoded[ row ];
		for ( let x = 0; x < stride; x ++ ) {
			const input = decoded[ row + 1 + x ];
			const left = x >= channels ? sourcePixels[ y * stride + x - channels ] : 0;
			const above = y > 0 ? sourcePixels[ ( y - 1 ) * stride + x ] : 0;
			const upperLeft = y > 0 && x >= channels ? sourcePixels[ ( y - 1 ) * stride + x - channels ] : 0;
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
	const pixels = new Uint8Array( width * height * 4 );
	for ( let pixel = 0; pixel < width * height; pixel ++ ) {
		pixels.set( sourcePixels.subarray( pixel * channels, pixel * channels + channels ), pixel * 4 );
		if ( channels === 3 ) pixels[ pixel * 4 + 3 ] = 255;
	}
	return { width, height, data: pixels };
}

function writeBc7Dds( width, height, levels, destination ) {
	const pixelBytes = levels.reduce( ( total, level ) => total + level.byteLength, 0 );
	const header = Buffer.alloc( 148 );
	header.write( 'DDS ', 0, 'ascii' );
	header.writeUInt32LE( 124, 4 );
	header.writeUInt32LE( 0xa1007, 8 );
	header.writeUInt32LE( height, 12 );
	header.writeUInt32LE( width, 16 );
	header.writeUInt32LE( levels[ 0 ].byteLength, 20 );
	header.writeUInt32LE( 0, 24 );
	header.writeUInt32LE( levels.length, 28 );
	header.writeUInt32LE( 32, 76 );
	header.writeUInt32LE( 4, 80 );
	header.write( 'DX10', 84, 'ascii' );
	header.writeUInt32LE( 0x1000, 108 );
	header.writeUInt32LE( 98, 128 );
	header.writeUInt32LE( 3, 132 );
	header.writeUInt32LE( 0, 136 );
	header.writeUInt32LE( 1, 140 );
	header.writeUInt32LE( 0, 144 );
	const data = Buffer.concat( levels.map( ( level ) => Buffer.from( level ) ), pixelBytes );
	return writeFile( destination, Buffer.concat( [ header, data ] ) );
}

function textureSize( levels ) {
	return levels.reduce( ( total, level ) => total + level.width * level.height * 4, 0 );
}

function textureSlug( value ) {
	return value.toLowerCase().replace( /[^a-z0-9]+/g, '-' ).replace( /^-|-$/g, '' );
}

async function measureTexture( basis, target ) {
	const options = { alphaTest: target.alphaTest, normalMap: target.normalMap, colorSpace: target.normalMap ? 'none' : 'srgb' };
	const mainStart = performance.now();
	const encoded = encodeUastcTexture( target.texture, options );
	const ktx2 = writeUastcKtx2( encoded );
	const mainEncodeTimeMs = performance.now() - mainStart;
	const workerResult = await workerEncode( target.texture, options );
	const mainSliceTimes = [];
	const slicedMainStart = performance.now();
	const slicedEncoded = await encodeUastcTextureAsync( target.texture, options, ( durationMs ) => mainSliceTimes.push( durationMs ) );
	await writeUastcKtx2Async( slicedEncoded, ( durationMs ) => mainSliceTimes.push( durationMs ) );
	const slicedMainEncodeAndPackMs = performance.now() - slicedMainStart;
	const parsed = readKtx2( new Uint8Array( ktx2 ) );
	if ( parsed.vkFormat !== 0 || parsed.supercompressionScheme !== 0 || parsed.dataFormatDescriptor[ 0 ]?.colorModel !== 166 ) throw new Error( `KTX2 validation failed for ${ target.label }` );
	const timings = {};
	const outputs = {};
	for ( const [ name, format ] of [ [ 'RGBA32', 13 ], [ 'ASTC_4x4', 10 ], [ 'BC7_M5', 7 ], [ 'ETC2_RGBA8_EAC', 1 ] ] ) {
		const start = performance.now();
		outputs[ name ] = transcode( basis, ktx2, format );
		timings[ name ] = performance.now() - start;
	}
	const sourceLevels = getTextureLevels( target.texture, target.alphaTest, target.normalMap );
	const binaryLevels = target.alphaTest > 0 ? binaryAlphaLevels( sourceLevels, target.alphaTest ) : null;
	const decoded = outputs.RGBA32[ 0 ];
	const source = sourceLevels[ 0 ].data;
	const coverage = target.alphaTest > 0 ? alphaCoverageByMip( sourceLevels, outputs.RGBA32, target.alphaTest ) : null;
	let alphaQuality = null;
	let etc2AlphaCoverageByMip = null;
	if ( binaryLevels !== null ) {
		const beforeEncoded = encodeUastcTexture( { ...target.texture, mipmaps: sourceLevels }, options );
		const afterEncoded = encodeUastcTexture( { ...target.texture, mipmaps: binaryLevels }, options );
		const beforeDecoded = transcode( basis, writeUastcKtx2( beforeEncoded ), 13 )[ 0 ];
		const afterDecoded = transcode( basis, writeUastcKtx2( afterEncoded ), 13 )[ 0 ];
		const beforePsnr = psnr( source, beforeDecoded, target.texture.width * target.texture.height );
		const afterPsnr = psnr( source, afterDecoded, target.texture.width * target.texture.height );
		alphaQuality = {
			beforeBinarizationPsnrDb: Number( beforePsnr.toFixed( 2 ) ),
			afterBinarizationPsnrDb: Number( afterPsnr.toFixed( 2 ) ),
			deltaDb: Number( ( afterPsnr - beforePsnr ).toFixed( 2 ) ),
			encodedRgbBlocksEqual: beforeEncoded.levels.every( ( level, index ) => level.data.every( ( value, offset ) => value === afterEncoded.levels[ index ].data[ offset ] ) ),
		};
		etc2AlphaCoverageByMip = sourceLevels.map( ( level, index ) => {
			const decodedAlpha = decodeEtc2Alpha( outputs.ETC2_RGBA8_EAC[ index ], level.width, level.height );
			const threshold = Math.ceil( target.alphaTest * 255 );
			let mismatched = 0;
			for ( let pixel = 0; pixel < level.width * level.height; pixel ++ ) {
				if ( ( binaryLevels[ index ].data[ pixel * 4 + 3 ] >= threshold ) !== ( decodedAlpha[ pixel ] >= threshold ) ) mismatched ++;
			}
			return { mip: index, mismatched };
		} );
	}
	const base = { width: target.texture.width, height: target.texture.height, data: decoded };
	const cropRegion = target.label.startsWith( 'rock' )
		? { width: 128, height: 128, x: 248, y: 135 }
		: target.label === 'allium plantCard'
			? { width: 128, height: 256, x: 0, y: 0 }
			: target.label === 'tree leaf ring'
				? { width: 256, height: 128 }
				: { width: 256, height: 256 };
	const cropSize = [ cropRegion.width, cropRegion.height, cropRegion.x, cropRegion.y ];
	const slug = textureSlug( target.label );
	await writePng( crop( { width: target.texture.width, height: target.texture.height, data: source }, ...cropSize ), path.join( scratchPath, `${ slug }-source.png` ) );
	await writePng( crop( base, ...cropSize ), path.join( scratchPath, `${ slug }-uastc-rgba32.png` ) );
	const workPath = path.join( scratchPath, '.working' );
	await mkdir( workPath, { recursive: true } );
	const bc7DdsPath = path.join( workPath, `${ slug }-bc7.dds` );
	let bc7DecodedPsnrDb = null;
	let bc7DecodedCoverage = null;
	let bc7DecodedCoverageByMip = null;
	let bc7DecodeError = null;
	try {
		await writeBc7Dds( target.texture.width, target.texture.height, outputs.BC7_M5, bc7DdsPath );
		execFileSync( 'basisu', [ '-unpack', '-no_ktx', '-output_path', workPath, bc7DdsPath ], { stdio: 'ignore' } );
		const pngs = ( await readdir( workPath ) ).filter( ( name ) => name.startsWith( `${ slug }-bc7_unpacked_` ) && name.endsWith( '.png' ) );
		const findDirectDecode = ( levelIndex ) => pngs.find( ( name ) => new RegExp( `_unpacked_rgba_RGBA32_level_${ levelIndex }_face_0_layer_0000\\.png$`, 'i' ).test( name ) );
		const decodedName = findDirectDecode( 0 );
		if ( decodedName === undefined ) throw new Error( `No direct RGBA32 BC7 decode found. Candidates: ${ pngs.join( ', ' ) }` );
		const decodedPath = path.join( workPath, decodedName );
		const bc7Decoded = readPng( decodedPath );
		bc7DecodedPsnrDb = Number( psnr( source, bc7Decoded.data, target.texture.width * target.texture.height ).toFixed( 2 ) );
		if ( target.alphaTest > 0 ) {
			bc7DecodedCoverage = alphaCoverage( source, bc7Decoded.data, target.alphaTest );
			bc7DecodedCoverageByMip = sourceLevels.map( ( level, index ) => {
				const mipName = findDirectDecode( index );
				if ( mipName === undefined ) throw new Error( `No direct RGBA32 BC7 decode found for mip ${ index }` );
				const mip = readPng( path.join( workPath, mipName ) );
				const coverageAtMip = alphaCoverage( level.data, mip.data, target.alphaTest );
				const threshold = Math.ceil( target.alphaTest * 255 );
				const mismatchSamples = [];
				for ( let pixel = 0; pixel < level.width * level.height && mismatchSamples.length < 12; pixel ++ ) {
					const sourceAlpha = binaryLevels[ index ].data[ pixel * 4 + 3 ];
					const decodedAlpha = mip.data[ pixel * 4 + 3 ];
					if ( ( sourceAlpha >= threshold ) !== ( decodedAlpha >= threshold ) ) mismatchSamples.push( { x: pixel % level.width, y: Math.floor( pixel / level.width ), sourceAlpha, decodedAlpha } );
				}
				return { mip: index, ...coverageAtMip, mismatchSamples };
			} );
		}
		await writePng( crop( bc7Decoded, ...cropSize ), path.join( scratchPath, `${ slug }-bc7-decoded.png` ) );
	} catch ( error ) {
		bc7DecodeError = error instanceof Error ? error.message : String( error );
	}
	let fullEncoderPsnrDb = null;
	let fullEncoderError = null;
	try {
		const sourcePngPath = path.join( workPath, `${ slug }-source-full.png` );
		const referenceKtxPath = path.join( workPath, `${ slug }-basis-full.ktx2` );
		await writePng( { width: target.texture.width, height: target.texture.height, data: source }, sourcePngPath );
		const colorFlag = target.normalMap ? '-linear' : '-srgb';
		execFileSync( 'basisu', [ '-uastc', '-uastc_level', '2', '-ktx2_no_zstandard', colorFlag, '-output_file', referenceKtxPath, sourcePngPath ], { stdio: 'ignore' } );
		const referenceRgba = transcode( basis, readFileSync( referenceKtxPath ), 13 )[ 0 ];
		fullEncoderPsnrDb = Number( psnr( source, referenceRgba, target.texture.width * target.texture.height ).toFixed( 2 ) );
	} catch ( error ) {
		fullEncoderError = error instanceof Error ? error.message : String( error );
	}
	await rm( workPath, { recursive: true, force: true } );
	const blockBytesASTC = gpuBytes( encoded.levels, 16 );
	const blockBytesBC7 = gpuBytes( encoded.levels, 16 );
	const blockBytesETC2 = gpuBytes( encoded.levels, target.alphaTest > 0 ? 16 : 8 );
	return {
		texture: target.label,
		dimensions: `${ target.texture.width }x${ target.texture.height }`,
		mipLevels: encoded.levels.length,
		modeSubset: target.alphaTest > 0 ? 'UASTC mode 13' : 'UASTC mode 5',
		mainThreadEncodeMs: Number( mainEncodeTimeMs.toFixed( 2 ) ),
		workerEncodeAndPackMs: Number( workerResult.encodeTimeMs.toFixed( 2 ) ),
		slicedMainEncodeAndPackMs: Number( slicedMainEncodeAndPackMs.toFixed( 2 ) ),
		mainThreadMaxSliceMs: Number( Math.max( ...mainSliceTimes, 0 ).toFixed( 2 ) ),
		transcodeMs: Object.fromEntries( Object.entries( timings ).map( ( [ format, value ] ) => [ format, Number( value.toFixed( 2 ) ) ] ) ),
		transcodedBytes: Object.fromEntries( Object.entries( outputs ).map( ( [ format, levels ] ) => [ format, levels.reduce( ( total, level ) => total + level.byteLength, 0 ) ] ) ),
		rgba32RgbPsnrDb: Number( psnr( source, decoded, target.texture.width * target.texture.height ).toFixed( 2 ) ),
		astcRgbPsnrDb: Number( psnr( source, decoded, target.texture.width * target.texture.height ).toFixed( 2 ) ),
		bc7RgbPsnrDb: bc7DecodedPsnrDb,
		bc7DecodeError,
		fullBasisEncoderPsnrDb: fullEncoderPsnrDb,
		subsetPsnrLossVsFullEncoderDb: fullEncoderPsnrDb === null ? null : Number( ( fullEncoderPsnrDb - psnr( source, decoded, target.texture.width * target.texture.height ) ).toFixed( 2 ) ),
		fullBasisEncoderError: fullEncoderError,
		alphaCoverage: coverage === null ? null : { mips: coverage, allEqual: coverage.every( ( level ) => level.equalCoverage ) },
		bc7AlphaCoverage: bc7DecodedCoverage === null ? null : { ...bc7DecodedCoverage, mips: bc7DecodedCoverageByMip, allEqual: bc7DecodedCoverageByMip.every( ( level ) => level.equalCoverage ) },
		alphaBinarizationRgbQuality: alphaQuality,
		alphaMaskMismatches: target.alphaTest > 0 ? {
			RGBA32: coverage.reduce( ( total, level ) => total + level.mismatched, 0 ),
			BC7: bc7DecodedCoverageByMip?.reduce( ( total, level ) => total + level.mismatched, 0 ) ?? null,
			ETC2: etc2AlphaCoverageByMip.reduce( ( total, level ) => total + level.mismatched, 0 ),
			ETC2ByMip: etc2AlphaCoverageByMip,
		} : null,
		gpuBytes: {
			rgba8Before: textureSize( sourceLevels ),
			astc4x4: blockBytesASTC,
			bc7: blockBytesBC7,
			etc2: blockBytesETC2,
			etc2Format: target.alphaTest > 0 ? 'ETC2 RGBA8 EAC (16 B/block)' : 'ETC2 RGB8 (8 B/block)',
		},
		ktx2Bytes: ktx2.byteLength,
		cropRegion: { width: Math.min( cropRegion.width, target.texture.width ), height: Math.min( cropRegion.height, target.texture.height ), x: cropRegion.x ?? Math.floor( ( target.texture.width - cropRegion.width ) / 2 ), y: cropRegion.y ?? Math.floor( ( target.texture.height - cropRegion.height ) / 2 ), texelScale: '1:1' },
		crops: [ `${ slug }-source.png`, `${ slug }-uastc-rgba32.png`, ...( bc7DecodeError === null ? [ `${ slug }-bc7-decoded.png` ] : [] ) ],
	};
}

async function getPrototypeTargets() {
	const rock = generateRockData( { seed: 1 } );
	const allium = generateFlowersData( { seed: 1, variety: 'allium' } );
	const tree = generateTreeData( { seed: 1 } );
	return [
		{ label: 'rock albedo', data: rock, textureName: 'albedo', normalMap: false },
		{ label: 'rock normal', data: rock, textureName: 'normal', normalMap: true },
		{ label: 'allium plantCard', data: allium, textureName: 'plantCard', normalMap: false },
		{ label: 'tree leaf', data: tree, textureName: 'leaf', normalMap: false },
		{ label: 'tree leaf ring', data: tree, textureName: 'leafRing', normalMap: false },
	].map( ( target ) => {
		const texture = target.data.textures[ target.textureName ];
		if ( texture === undefined ) throw new Error( `Missing ${ target.textureName } for ${ target.label }; available: ${ Object.keys( target.data.textures ).join( ', ' ) }` );
		return { ...target, texture, alphaTest: target.normalMap ? 0 : getAlphaTest( target.data, target.textureName ) };
	} );
}

async function measureRecolor( target ) {
	const { VegetationAsset } = await import( '../src/three/VegetationAsset.ts' );
	const asset = new VegetationAsset( target.data );
	const partName = target.label.startsWith( 'rock' ) ? 'rock' : target.label.startsWith( 'allium' ) ? 'petal' : 'leaf';
	const partNames = partName === 'leaf' ? [ 'leaf', 'leafRing' ] : [ partName ];
	const colorParts = partNames.map( ( name ) => asset.data.parts.find( ( part ) => part.name === name ) ).filter( Boolean );
	const colorPart = colorParts[ 0 ] ?? asset.data.parts[ 0 ];
	const color = ( ( colorPart.defaultColor ^ 0x001f40 ) & 0xffffff ) || 0x527733;
	const start = performance.now();
	asset.setColors( Object.fromEntries( colorParts.map( ( part ) => [ part.name, color ] ) ) );
	const recolorTimeMs = performance.now() - start;
	const changedTextures = new Map();
	for ( const part of colorParts ) {
		const textureName = part.name === 'petal' ? 'plantCard' : part.texture;
		if ( ( part.colorizesTexture || part.name === 'petal' ) && textureName !== null && textureName !== undefined && asset.data.textures[ textureName ] !== undefined ) changedTextures.set( textureName, asset.data.textures[ textureName ] );
	}
	for ( const [ name, texture ] of asset.impostorTextureData ) changedTextures.set( `impostor:${ name }`, texture );
	const encodeStart = performance.now();
	for ( const [ name, texture ] of changedTextures ) {
		const sourceName = name.startsWith( 'impostor:' ) ? name.slice( 9 ) : name;
		const alphaTest = getAlphaTest( asset.data, sourceName );
		writeUastcKtx2( encodeUastcTexture( texture, { alphaTest, colorSpace: 'srgb' } ) );
	}
	const reencodeTimeMs = performance.now() - encodeStart;
	asset.dispose();
	return { asset: target.label, recolorTimeMs: Number( recolorTimeMs.toFixed( 2 ) ), reencodeTimeMs: Number( reencodeTimeMs.toFixed( 2 ) ), part: colorPart.name, textures: [ ...changedTextures.keys() ] };
}

async function measureFullSwap( basis, kind ) {
	const { disposeVegetationWorkers, generateFlowersAsync, generateRockAsync, generateTreeAsync } = await import( '../src/three/meshes.ts' );
	const loader = {
		parse( buffer, onLoad, onError ) {
			try {
				const parsed = readKtx2( new Uint8Array( buffer ) );
				const compressedLevels = transcode( basis, buffer, 10 ).map( ( data, index ) => ( {
					data,
					width: Math.max( 1, parsed.pixelWidth >> index ),
					height: Math.max( 1, parsed.pixelHeight >> index ),
				} ) );
				const texture = new CompressedTexture( compressedLevels, parsed.pixelWidth, parsed.pixelHeight, RGBA_ASTC_4x4_Format, UnsignedByteType );
				setTimeout( () => onLoad?.( texture ), 0 );
			} catch ( error ) {
				onError?.( error );
			}
		},
	};
	const workersBefore = browserWorkersCreated;
	const start = performance.now();
	const asset = kind === 'rock'
		? await generateRockAsync( { seed: 1, ktx2Loader: loader } )
		: kind === 'tree'
			? await generateTreeAsync( { seed: 1, ktx2Loader: loader } )
			: await generateFlowersAsync( { seed: 1, variety: 'allium', ktx2Loader: loader } );
	const expectedBindings = asset.textureBindings.length;
	const deadline = Date.now() + 60_000;
	while ( asset.getTextureCompressionReport().length < expectedBindings && Date.now() < deadline ) await new Promise( ( resolve ) => setTimeout( resolve, 5 ) );
	if ( asset.getTextureCompressionReport().length < expectedBindings ) throw new Error( `${ kind } full texture swap did not complete: ${ asset.getTextureCompressionReport().length }/${ expectedBindings }` );
	const wallClockMs = performance.now() - start;
	const reports = asset.getTextureCompressionReport();
	const textures = reports.map( ( report ) => ( {
		texture: report.texture,
		slot: report.slot,
		workerEncodeMs: Number( report.encodeTimeMs.toFixed( 2 ) ),
		loaderTranscodeMs: Number( report.transcodeTimeMs.toFixed( 2 ) ),
		gpuBytes: report.byteLength,
	} ) );
	asset.dispose();
	disposeVegetationWorkers();
	return {
		kind,
		wallClockToFullSwapMs: Number( wallClockMs.toFixed( 2 ) ),
		workerThreadsCreated: browserWorkersCreated - workersBefore,
		textureBindings: textures,
		mainThreadMaxSliceMs: Math.max( ...reports.map( ( report ) => report.mainThreadMaxSliceMs ), 0 ),
	};
}

async function measureLibraryBytes() {
	const { rolldown } = await import( 'rolldown' );
	async function bundleBytes( sourceRoot ) {
		const bundle = await rolldown( {
			input: {
				library: path.join( sourceRoot, 'src/index.ts' ),
				worker: path.join( sourceRoot, 'src/worker/vegetationWorker.ts' ),
			},
			platform: 'browser',
			external: [ 'three', /^three\// ],
			logLevel: 'silent',
		} );
		const generated = await bundle.generate( { format: 'es', minify: true } );
		const bytes = Buffer.from( generated.output.map( ( chunk ) => chunk.code ).join( '\n' ) );
		await bundle.close();
		return { bytes, outputs: generated.output.map( ( chunk ) => ( { file: chunk.fileName, bytes: Buffer.byteLength( chunk.code ) } ) ) };
	}
	const baselineRoot = await mkdtemp( path.join( tmpdir(), 'vegetation-uastc-size-' ) );
	try {
		const archive = execFileSync( 'git', [ 'archive', '--format=tar', 'HEAD' ], { cwd: root, maxBuffer: 128 * 1024 * 1024 } );
		execFileSync( 'tar', [ '-x', '-C', baselineRoot ], { input: archive } );
		const [ baseline, current ] = await Promise.all( [ bundleBytes( baselineRoot ), bundleBytes( root ) ] );
		return {
			baselineMinifiedBytes: baseline.bytes.byteLength,
			currentMinifiedBytes: current.bytes.byteLength,
			addedMinifiedBytes: current.bytes.byteLength - baseline.bytes.byteLength,
			baselineGzipBytes: gzipSync( baseline.bytes ).byteLength,
			currentGzipBytes: gzipSync( current.bytes ).byteLength,
			addedGzipBytes: gzipSync( current.bytes ).byteLength - gzipSync( baseline.bytes ).byteLength,
			baselineOutputs: baseline.outputs,
			currentOutputs: current.outputs,
		};
	} finally {
		await rm( baselineRoot, { recursive: true, force: true } );
	}
}

try {
	await mkdir( scratchPath, { recursive: true } );
	const basis = await loadBasisTranscoder();
	const targets = await getPrototypeTargets();
	const textureResults = [];
	for ( const target of targets ) textureResults.push( await measureTexture( basis, target ) );
	const recolorResults = [];
	for ( const target of [ targets[ 0 ], targets[ 2 ], targets[ 3 ] ] ) recolorResults.push( await measureRecolor( target ) );
	const fullSwapResults = [];
	for ( const kind of [ 'rock', 'tree', 'allium' ] ) fullSwapResults.push( await measureFullSwap( basis, kind ) );
	const result = {
		basisTranscoder: 'three r186 bundled basis_transcoder.js/.wasm',
		targets: textureResults,
		recolor: recolorResults,
		fullSwap: fullSwapResults,
		encoderAndWriterSize: await measureLibraryBytes(),
		notes: [
			'ASTC UASTC transcode is lossless by the UASTC specification; the recorded RGBA32 PSNR is also the ASTC-decoded PSNR.',
			'BC7 and ETC2 blocks are produced by the bundled Basis transcoder; BC7 mip masks are decoded with basisu and ETC2 EAC alpha is decoded by the independent block decoder in this report.',
			'Full-encoder quality comparison uses the installed Basis Universal basisu UASTC encoder at effort level 2.',
			'Per-texture encode timings include KTX2 wrapping and exclude transcoder module loading; main-thread max slice covers mip preparation, UASTC blocks, alpha binarization and KTX2 copying.',
			'Full-swap timings use the public async generators with a four-thread Node worker_threads adapter and a bundled Basis ASTC transcode in place of a renderer-selected KTX2Loader.',
		],
	};
	await writeFile( path.join( scratchPath, 'report.json' ), JSON.stringify( result, null, 2 ) );
	console.log( JSON.stringify( result, null, 2 ) );
} finally {
	await worker.terminate();
}
