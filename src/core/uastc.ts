import type { TextureData, TextureMipLevel } from './types';
import { generateTextureMipmaps, generateTextureMipmapsAsync } from './textureMipmaps';

export interface UastcEncodeOptions {
	alphaTest?: number;
	normalMap?: boolean;
	colorSpace?: 'srgb' | 'linear' | 'none';
}

export interface EncodedUastcLevel {
	width: number;
	height: number;
	data: Uint8Array;
}

export interface EncodedUastcTexture {
	width: number;
	height: number;
	levels: EncodedUastcLevel[];
	data: Uint8Array;
	alpha: boolean;
	colorSpace: 'srgb' | 'linear' | 'none';
}

const RGB_WEIGHTS = [ 0, 9, 18, 27, 37, 46, 55, 64 ];

function clampByte( value: number ): number {
	return Math.max( 0, Math.min( 255, Math.round( value ) ) );
}

function writeBits( destination: Uint8Array, bitOffset: number, value: number, bitCount: number ): void {
	for ( let bit = 0; bit < bitCount; bit ++ ) {
		if ( ( value & ( 1 << bit ) ) !== 0 ) destination[ ( bitOffset + bit ) >> 3 ]! |= 1 << ( ( bitOffset + bit ) & 7 );
	}
}

function sampleBlock( level: TextureMipLevel, blockX: number, blockY: number ): Uint8Array {
	const pixels = new Uint8Array( 16 * 4 );
	for ( let y = 0; y < 4; y ++ ) {
		for ( let x = 0; x < 4; x ++ ) {
			const sourceX = Math.min( level.width - 1, blockX * 4 + x );
			const sourceY = Math.min( level.height - 1, blockY * 4 + y );
			const sourceOffset = ( sourceY * level.width + sourceX ) * 4;
			const targetOffset = ( y * 4 + x ) * 4;
			for ( let channel = 0; channel < 4; channel ++ ) pixels[ targetOffset + channel ] = level.data[ sourceOffset + channel ]!;
		}
	}
	return pixels;
}

function computeRgbDirection( pixels: Uint8Array ): [ number, number, number ] {
	const mean = [ 0, 0, 0 ];
	for ( let pixel = 0; pixel < 16; pixel ++ ) {
		for ( let channel = 0; channel < 3; channel ++ ) mean[ channel ]! += pixels[ pixel * 4 + channel ]! / 16;
	}
	const covariance = [ [ 0, 0, 0 ], [ 0, 0, 0 ], [ 0, 0, 0 ] ];
	for ( let pixel = 0; pixel < 16; pixel ++ ) {
		const delta = [ pixels[ pixel * 4 ]! - mean[ 0 ]!, pixels[ pixel * 4 + 1 ]! - mean[ 1 ]!, pixels[ pixel * 4 + 2 ]! - mean[ 2 ]! ];
		for ( let row = 0; row < 3; row ++ ) {
			for ( let column = 0; column < 3; column ++ ) covariance[ row ]![ column ]! += delta[ row ]! * delta[ column ]!;
		}
	}
	let bestDirection: [ number, number, number ] = [ 1, 0, 0 ];
	let bestVariance = - Infinity;
	// An all-positive seed can be orthogonal to a real color direction such as (0, 1, -1).
	// Start from each channel axis so at least one power iteration can see every nonzero direction.
	for ( let axis = 0; axis < 3; axis ++ ) {
		let direction: [ number, number, number ] = [ 0, 0, 0 ];
		direction[ axis ] = 1;
		for ( let iteration = 0; iteration < 8; iteration ++ ) {
			const next: [ number, number, number ] = [
				covariance[ 0 ]![ 0 ]! * direction[ 0 ] + covariance[ 0 ]![ 1 ]! * direction[ 1 ] + covariance[ 0 ]![ 2 ]! * direction[ 2 ],
				covariance[ 1 ]![ 0 ]! * direction[ 0 ] + covariance[ 1 ]![ 1 ]! * direction[ 1 ] + covariance[ 1 ]![ 2 ]! * direction[ 2 ],
				covariance[ 2 ]![ 0 ]! * direction[ 0 ] + covariance[ 2 ]![ 1 ]! * direction[ 1 ] + covariance[ 2 ]![ 2 ]! * direction[ 2 ],
			];
			const length = Math.hypot( ...next );
			if ( length < 1e-8 ) break;
			direction = [ next[ 0 ] / length, next[ 1 ] / length, next[ 2 ] / length ];
		}
		const variance = direction[ 0 ] * ( covariance[ 0 ]![ 0 ]! * direction[ 0 ] + covariance[ 0 ]![ 1 ]! * direction[ 1 ] + covariance[ 0 ]![ 2 ]! * direction[ 2 ] ) +
			direction[ 1 ] * ( covariance[ 1 ]![ 0 ]! * direction[ 0 ] + covariance[ 1 ]![ 1 ]! * direction[ 1 ] + covariance[ 1 ]![ 2 ]! * direction[ 2 ] ) +
			direction[ 2 ] * ( covariance[ 2 ]![ 0 ]! * direction[ 0 ] + covariance[ 2 ]![ 1 ]! * direction[ 1 ] + covariance[ 2 ]![ 2 ]! * direction[ 2 ] );
		if ( variance > bestVariance ) {
			bestVariance = variance;
			bestDirection = direction;
		}
	}
	return bestVariance < 1e-8 ? [ 1, 0, 0 ] : bestDirection;
}

function fitRgbEndpoints( pixels: Uint8Array, weightLevels: number ): { low: number[]; high: number[]; indices: number[] } {
	const direction = computeRgbDirection( pixels );
	let minimumProjection = Infinity;
	let maximumProjection = - Infinity;
	let lowIndex = 0;
	let highIndex = 0;
	for ( let pixel = 0; pixel < 16; pixel ++ ) {
		const projection = pixels[ pixel * 4 ]! * direction[ 0 ] + pixels[ pixel * 4 + 1 ]! * direction[ 1 ] + pixels[ pixel * 4 + 2 ]! * direction[ 2 ];
		if ( projection < minimumProjection ) {
			minimumProjection = projection;
			lowIndex = pixel;
		}
		if ( projection > maximumProjection ) {
			maximumProjection = projection;
			highIndex = pixel;
		}
	}
	let low = [ pixels[ lowIndex * 4 ]!, pixels[ lowIndex * 4 + 1 ]!, pixels[ lowIndex * 4 + 2 ]! ];
	let high = [ pixels[ highIndex * 4 ]!, pixels[ highIndex * 4 + 1 ]!, pixels[ highIndex * 4 + 2 ]! ];
	const indices = new Array<number>( 16 ).fill( 0 );
	const weightCount = weightLevels - 1;
	for ( let iteration = 0; iteration < 5; iteration ++ ) {
		for ( let pixel = 0; pixel < 16; pixel ++ ) {
			let bestError = Infinity;
			for ( let weight = 0; weight < weightLevels; weight ++ ) {
				const t = RGB_WEIGHTS.length === weightLevels ? RGB_WEIGHTS[ weight ]! / 64 : weight / weightCount;
				let error = 0;
				for ( let channel = 0; channel < 3; channel ++ ) {
					const value = low[ channel ]! * ( 1 - t ) + high[ channel ]! * t;
					const difference = pixels[ pixel * 4 + channel ]! - value;
					error += difference * difference;
				}
				if ( error < bestError ) {
					bestError = error;
					indices[ pixel ] = weight;
				}
			}
		}
		let sumWeight = 0;
		let sumWeightSquared = 0;
		const sumColor = [ 0, 0, 0 ];
		const sumWeightColor = [ 0, 0, 0 ];
		for ( let pixel = 0; pixel < 16; pixel ++ ) {
			const t = RGB_WEIGHTS.length === weightLevels ? RGB_WEIGHTS[ indices[ pixel ]! ]! / 64 : indices[ pixel ]! / weightCount;
			sumWeight += t;
			sumWeightSquared += t * t;
			for ( let channel = 0; channel < 3; channel ++ ) {
				const value = pixels[ pixel * 4 + channel ]!;
				sumColor[ channel ]! += value;
				sumWeightColor[ channel ]! += t * value;
			}
		}
		const determinant = 16 * sumWeightSquared - sumWeight * sumWeight;
		if ( determinant > 1e-8 ) {
			for ( let channel = 0; channel < 3; channel ++ ) {
				const fittedLow = ( sumColor[ channel ]! * sumWeightSquared - sumWeightColor[ channel ]! * sumWeight ) / determinant;
				// The second least-squares result is the slope (high - low), not the high endpoint itself.
				const fittedSlope = ( 16 * sumWeightColor[ channel ]! - sumWeight * sumColor[ channel ]! ) / determinant;
				low[ channel ] = fittedLow;
				high[ channel ] = fittedLow + fittedSlope;
			}
		}
	}
	return { low: low.map( clampByte ), high: high.map( clampByte ), indices };
}

function encodeRgbBlock( pixels: Uint8Array ): Uint8Array {
	const block = new Uint8Array( 16 );
	const fitted = fitRgbEndpoints( pixels, 8 );
	let indices = fitted.indices;
	let low = fitted.low;
	let high = fitted.high;
	if ( indices[ 0 ]! >= 4 ) {
		[ low, high ] = [ high, low ];
		indices = indices.map( ( weight ) => 7 - weight );
	}
	writeBits( block, 0, 0x0b, 5 ); // 3 ビット重みを使う単一 RGB サブセット。
	writeBits( block, 5, 0, 1 ); // BC1 エンドポイントのヒント。
	writeBits( block, 6, 0, 1 ); // BC1 エンドポイントのヒント。
	writeBits( block, 7, 0, 1 ); // ETC1 の反転ヒント。
	writeBits( block, 8, 0, 1 ); // ETC1 の差分ヒント。
	writeBits( block, 9, 0, 3 ); // ETC1 の強度テーブル 0。
	writeBits( block, 12, 0, 3 ); // ETC1 の強度テーブル 1。
	writeBits( block, 15, 0, 5 ); // ETC1 のバイアス。
	for ( let channel = 0; channel < 3; channel ++ ) {
		writeBits( block, 20 + channel * 16, low[ channel ]!, 8 );
		writeBits( block, 28 + channel * 16, high[ channel ]!, 8 );
	}
	writeBits( block, 68, indices[ 0 ]!, 2 );
	for ( let pixel = 1; pixel < 16; pixel ++ ) writeBits( block, 70 + ( pixel - 1 ) * 3, indices[ pixel ]!, 3 );
	return block;
}

function encodeAlphaBlock( pixels: Uint8Array, alphaTest: number ): Uint8Array {
	const block = new Uint8Array( 16 );
	const fitted = fitRgbEndpoints( pixels, 2 );
	const colorWeights = fitted.indices;
	const alphaWeights = new Array<number>( 16 );
	for ( let pixel = 0; pixel < 16; pixel ++ ) alphaWeights[ pixel ] = pixels[ pixel * 4 + 3 ]! / 255 >= alphaTest ? 1 : 0;
	let low = [ ...fitted.low, 0 ];
	let high = [ ...fitted.high, 255 ];
	let rgbWeights = colorWeights;
	if ( rgbWeights[ 0 ]! !== 0 ) {
		[ low[ 0 ], high[ 0 ] ] = [ high[ 0 ]!, low[ 0 ]! ];
		[ low[ 1 ], high[ 1 ] ] = [ high[ 1 ]!, low[ 1 ]! ];
		[ low[ 2 ], high[ 2 ] ] = [ high[ 2 ]!, low[ 2 ]! ];
		rgbWeights = rgbWeights.map( ( weight ) => 1 - weight );
	}
	if ( alphaWeights[ 0 ]! !== 0 ) {
		[ low[ 3 ], high[ 3 ] ] = [ high[ 3 ]!, low[ 3 ]! ];
		for ( let pixel = 0; pixel < 16; pixel ++ ) alphaWeights[ pixel ] = 1 - alphaWeights[ pixel ]!;
	}
	writeBits( block, 0, 0x1f, 5 ); // 1 ビット重みのデュアルプレーン RGBA。
	writeBits( block, 5, 0, 1 ); // BC1 エンドポイントのヒント。
	writeBits( block, 6, 0, 1 ); // BC1 エンドポイントのヒント。
	writeBits( block, 7, 0, 1 ); // ETC1 の反転ヒント。
	writeBits( block, 8, 0, 1 ); // ETC1 の差分ヒント。
	writeBits( block, 9, 0, 3 ); // ETC1 の強度テーブル 0。
	writeBits( block, 12, 0, 3 ); // ETC1 の強度テーブル 1。
	writeBits( block, 15, 0, 5 ); // ETC1 のバイアス。
	writeBits( block, 20, 0xff, 8 ); // ETC2 EAC が binary alpha の両端を使うように伝える。
	writeBits( block, 28, 3, 2 ); // 2 枚目の重み面にアルファを割り当て。
	for ( let channel = 0; channel < 4; channel ++ ) {
		writeBits( block, 30 + channel * 16, low[ channel ]!, 8 );
		writeBits( block, 38 + channel * 16, high[ channel ]!, 8 );
	}
	for ( let pixel = 1; pixel < 16; pixel ++ ) {
		writeBits( block, 94 + ( pixel - 1 ) * 2, rgbWeights[ pixel ]!, 1 );
		writeBits( block, 95 + ( pixel - 1 ) * 2, alphaWeights[ pixel ]!, 1 );
	}
	return block;
}

function encodeLevel( level: TextureMipLevel, alphaTest: number ): EncodedUastcLevel {
	const blocksWide = Math.max( 1, Math.ceil( level.width / 4 ) );
	const blocksHigh = Math.max( 1, Math.ceil( level.height / 4 ) );
	const data = new Uint8Array( blocksWide * blocksHigh * 16 );
	for ( let blockY = 0; blockY < blocksHigh; blockY ++ ) {
		for ( let blockX = 0; blockX < blocksWide; blockX ++ ) {
			encodeBlockAt( level, blockX, blockY, blocksWide, alphaTest, data );
		}
	}
	return { width: level.width, height: level.height, data };
}

function encodeBlockAt( level: TextureMipLevel, blockX: number, blockY: number, blocksWide: number, alphaTest: number, destination: Uint8Array ): void {
	const pixels = sampleBlock( level, blockX, blockY );
	const block = alphaTest > 0 ? encodeAlphaBlock( pixels, alphaTest ) : encodeRgbBlock( pixels );
	destination.set( block, ( blockY * blocksWide + blockX ) * 16 );
}

function getUastcLevels( texture: TextureData, alphaTest: number, normalMap: boolean ): TextureMipLevel[] {
	const levels = texture.mipmaps ?? generateTextureMipmaps( texture, alphaTest, normalMap );
	if ( alphaTest <= 0 ) return levels;
	return levels.map( ( level ) => {
		const data = level.data.slice();
		for ( let offset = 3; offset < data.length; offset += 4 ) data[ offset ] = data[ offset ]! / 255 >= alphaTest ? 255 : 0;
		return { width: level.width, height: level.height, data };
	} );
}

async function getUastcLevelsAsync( texture: TextureData, alphaTest: number, normalMap: boolean, onSlice?: ( durationMs: number ) => void ): Promise<TextureMipLevel[]> {
	const levels = texture.mipmaps ?? await generateTextureMipmapsAsync( texture, alphaTest, normalMap, onSlice );
	if ( alphaTest <= 0 ) return levels;
	const binaryLevels: TextureMipLevel[] = [];
	const sliceBytes = 8 * 1024;
	for ( const level of levels ) {
		const data = new Uint8Array( level.data.length );
		for ( let offset = 0; offset < data.length; offset += sliceBytes ) {
			const startedAt = performance.now();
			const end = Math.min( data.length, offset + sliceBytes );
			data.set( level.data.subarray( offset, end ), offset );
			for ( let alphaOffset = offset + 3; alphaOffset < end; alphaOffset += 4 ) {
				data[ alphaOffset ] = data[ alphaOffset ]! / 255 >= alphaTest ? 255 : 0;
			}
			onSlice?.( performance.now() - startedAt );
			if ( end < data.length ) await yieldToMainThread();
		}
		binaryLevels.push( { width: level.width, height: level.height, data } );
	}
	return binaryLevels;
}

function packEncodedLevels( width: number, height: number, levels: EncodedUastcLevel[], alphaTest: number, colorSpace: 'srgb' | 'linear' | 'none' ): EncodedUastcTexture {
	const data = new Uint8Array( levels.reduce( ( total, level ) => total + level.data.byteLength, 0 ) );
	let offset = 0;
	for ( const level of levels ) {
		data.set( level.data, offset );
		offset += level.data.byteLength;
	}
	return { width, height, levels, data, alpha: alphaTest > 0, colorSpace };
}

export function encodeUastcTexture( texture: TextureData, options: UastcEncodeOptions = {} ): EncodedUastcTexture {
	if ( texture.width < 1 || texture.height < 1 || texture.data.length !== texture.width * texture.height * 4 ) throw new Error( 'UASTC requires tightly packed RGBA8 image data' );
	const alphaTest = Math.max( 0, options.alphaTest ?? 0 );
	const colorSpace = options.normalMap ? 'none' : options.colorSpace ?? 'srgb';
	const levels = getUastcLevels( texture, alphaTest, options.normalMap ?? false );
	const encodedLevels = levels.map( ( level ) => encodeLevel( level, alphaTest ) );
	return packEncodedLevels( texture.width, texture.height, encodedLevels, alphaTest, colorSpace );
}

const MAIN_THREAD_BLOCKS_PER_SLICE = 16;
const ENCODED_COPY_BYTES_PER_SLICE = 64 * 1024;

function yieldToMainThread(): Promise<void> {
	return new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
}

async function encodeLevelInSlices( level: TextureMipLevel, alphaTest: number, blocksPerSlice: number, onSlice?: ( durationMs: number ) => void ): Promise<EncodedUastcLevel> {
	const blocksWide = Math.max( 1, Math.ceil( level.width / 4 ) );
	const blocksHigh = Math.max( 1, Math.ceil( level.height / 4 ) );
	const blockCount = blocksWide * blocksHigh;
	const data = new Uint8Array( blockCount * 16 );
	for ( let firstBlock = 0; firstBlock < blockCount; firstBlock += blocksPerSlice ) {
		const sliceStart = performance.now();
		const endBlock = Math.min( blockCount, firstBlock + blocksPerSlice );
		for ( let blockIndex = firstBlock; blockIndex < endBlock; blockIndex ++ ) {
			encodeBlockAt( level, blockIndex % blocksWide, Math.floor( blockIndex / blocksWide ), blocksWide, alphaTest, data );
		}
		onSlice?.( performance.now() - sliceStart );
		if ( endBlock < blockCount ) await yieldToMainThread();
	}
	return { width: level.width, height: level.height, data };
}

/** Worker が使えない環境向け。最大 16 個の 4x4 ブロックごとにメインスレッドへ制御を返します。 */
export async function encodeUastcTextureAsync( texture: TextureData, options: UastcEncodeOptions = {}, onSlice?: ( durationMs: number ) => void ): Promise<EncodedUastcTexture> {
	if ( texture.width < 1 || texture.height < 1 || texture.data.length !== texture.width * texture.height * 4 ) throw new Error( 'UASTC requires tightly packed RGBA8 image data' );
	const alphaTest = Math.max( 0, options.alphaTest ?? 0 );
	const colorSpace = options.normalMap ? 'none' : options.colorSpace ?? 'srgb';
	const levels = await getUastcLevelsAsync( texture, alphaTest, options.normalMap ?? false, onSlice );
	const encodedLevels: EncodedUastcLevel[] = [];
	for ( const level of levels ) encodedLevels.push( await encodeLevelInSlices( level, alphaTest, MAIN_THREAD_BLOCKS_PER_SLICE, onSlice ) );
	const data = new Uint8Array( encodedLevels.reduce( ( total, level ) => total + level.data.byteLength, 0 ) );
	let offset = 0;
	for ( const level of encodedLevels ) {
		for ( let levelOffset = 0; levelOffset < level.data.length; levelOffset += ENCODED_COPY_BYTES_PER_SLICE ) {
			const startedAt = performance.now();
			const end = Math.min( level.data.length, levelOffset + ENCODED_COPY_BYTES_PER_SLICE );
			data.set( level.data.subarray( levelOffset, end ), offset + levelOffset );
			onSlice?.( performance.now() - startedAt );
			if ( end < level.data.length ) await yieldToMainThread();
		}
		offset += level.data.byteLength;
	}
	return { width: texture.width, height: texture.height, levels: encodedLevels, data, alpha: alphaTest > 0, colorSpace };
}
