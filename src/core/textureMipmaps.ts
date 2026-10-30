import type { PartDef, TextureData, TextureMipLevel } from './types';

function getPowerOfTwo( value: number ): number {
	return 2 ** Math.ceil( Math.log2( Math.max( 1, value ) ) );
}

function getCoverageCount( pixels: Uint8Array, alphaTest: number ): number {
	let covered = 0;
	for ( let offset = 3; offset < pixels.length; offset += 4 ) {
		if ( pixels[ offset ]! / 255 >= alphaTest ) covered ++;
	}
	return covered;
}

function preserveAlphaCoverage( pixels: Uint8Array, targetCoverage: number, alphaTest: number ): void {
	if ( targetCoverage === 0 ) {
		for ( let offset = 3; offset < pixels.length; offset += 4 ) pixels[ offset ] = 0;
		return;
	}

	const pixelCount = pixels.length / 4;
	const targetCovered = targetCoverage * pixelCount;
	const histogram = new Uint32Array( 256 );
	for ( let offset = 3; offset < pixels.length; offset += 4 ) {
		const alpha = pixels[ offset ]!;
		histogram[ alpha ] = histogram[ alpha ]! + 1;
	}
	const threshold = Math.ceil( alphaTest * 255 );
	let minimumScale = 0;
	let maximumScale = 255;
	let bestScale = 1;
	let bestError = Infinity;

	for ( let iteration = 0; iteration < 32; iteration ++ ) {
		const scale = ( minimumScale + maximumScale ) * 0.5;
		let covered = 0;

		for ( let alpha = 1; alpha < 256; alpha ++ ) {
			if ( Math.min( 255, Math.round( alpha * scale ) ) >= threshold ) covered += histogram[ alpha ]!;
		}

		const error = Math.abs( covered - targetCovered );
		if ( error < bestError ) {
			bestError = error;
			bestScale = scale;
		}
		if ( error === 0 ) break;
		if ( covered < targetCovered ) minimumScale = scale;
		else maximumScale = scale;
	}

	for ( let offset = 3; offset < pixels.length; offset += 4 ) {
		pixels[ offset ] = Math.min( 255, Math.round( pixels[ offset ]! * bestScale ) );
	}
}

function downsample( source: TextureMipLevel, alphaTest: number, normalMap: boolean, data: Uint8Array ): TextureMipLevel {
	const width = Math.max( 1, Math.floor( source.width / 2 ) );
	const height = Math.max( 1, Math.floor( source.height / 2 ) );
	const sourceData = source.data;

	if ( source.width % 2 === 0 && source.height % 2 === 0 ) {
		for ( let y = 0; y < height; y ++ ) {
			for ( let x = 0; x < width; x ++ ) {
				const topLeft = ( y * 2 * source.width + x * 2 ) * 4;
				const topRight = topLeft + 4;
				const bottomLeft = topLeft + source.width * 4;
				const bottomRight = bottomLeft + 4;
				const outputOffset = ( y * width + x ) * 4;
				const alpha0 = sourceData[ topLeft + 3 ]!;
				const alpha1 = sourceData[ topRight + 3 ]!;
				const alpha2 = sourceData[ bottomLeft + 3 ]!;
				const alpha3 = sourceData[ bottomRight + 3 ]!;
				const alphaTotal = alpha0 + alpha1 + alpha2 + alpha3;
				const inverseAlphaTotal = alphaTotal === 0 ? 0 : 1 / alphaTotal;

				for ( let channel = 0; channel < 3; channel ++ ) {
					if ( normalMap ) {
						data[ outputOffset + channel ] = Math.round( (
							sourceData[ topLeft + channel ]! + sourceData[ topRight + channel ]! +
							sourceData[ bottomLeft + channel ]! + sourceData[ bottomRight + channel ]!
						) * 0.25 );
					} else if ( alphaTest > 0 && alphaTotal === 0 ) {
						data[ outputOffset + channel ] = 0;
					} else if ( alphaTest > 0 ) {
						data[ outputOffset + channel ] = Math.round( (
							sourceData[ topLeft + channel ]! * alpha0 +
							sourceData[ topRight + channel ]! * alpha1 +
							sourceData[ bottomLeft + channel ]! * alpha2 +
							sourceData[ bottomRight + channel ]! * alpha3
						) * inverseAlphaTotal );
					} else {
						data[ outputOffset + channel ] = Math.round( (
							sourceData[ topLeft + channel ]! +
							sourceData[ topRight + channel ]! +
							sourceData[ bottomLeft + channel ]! +
							sourceData[ bottomRight + channel ]!
						) * 0.25 );
					}
				}

				data[ outputOffset + 3 ] = Math.round( alphaTotal * 0.25 );
			}
		}

		return { width, height, data };
	}

	for ( let y = 0; y < height; y ++ ) {
		const startY = y * source.height / height;
		const endY = ( y + 1 ) * source.height / height;
		const firstY = Math.floor( startY );
		const lastY = Math.ceil( endY );

		for ( let x = 0; x < width; x ++ ) {
			const startX = x * source.width / width;
			const endX = ( x + 1 ) * source.width / width;
			const firstX = Math.floor( startX );
			const lastX = Math.ceil( endX );
			const outputOffset = ( y * width + x ) * 4;
			let totalWeight = 0;
			let alphaSum = 0;
			let redSum = 0;
			let greenSum = 0;
			let blueSum = 0;

			for ( let sourceY = firstY; sourceY < lastY; sourceY ++ ) {
				const weightY = Math.min( endY, sourceY + 1 ) - Math.max( startY, sourceY );
				for ( let sourceX = firstX; sourceX < lastX; sourceX ++ ) {
					const weight = weightY * ( Math.min( endX, sourceX + 1 ) - Math.max( startX, sourceX ) );
					const sourceOffset = ( sourceY * source.width + sourceX ) * 4;
					const alpha = sourceData[ sourceOffset + 3 ]! / 255;
					const colorWeight = alphaTest > 0 ? alpha * weight : weight;
					totalWeight += weight;
					alphaSum += alpha * weight;

					if ( normalMap ) {
						redSum += sourceData[ sourceOffset ]! * weight;
						greenSum += sourceData[ sourceOffset + 1 ]! * weight;
						blueSum += sourceData[ sourceOffset + 2 ]! * weight;
					} else {
						redSum += sourceData[ sourceOffset ]! * colorWeight;
						greenSum += sourceData[ sourceOffset + 1 ]! * colorWeight;
						blueSum += sourceData[ sourceOffset + 2 ]! * colorWeight;
					}
				}
			}

			const colorDivisor = alphaTest > 0 ? alphaSum : totalWeight;
			if ( colorDivisor > 0 ) {
				if ( normalMap ) {
					data[ outputOffset ] = Math.round( redSum / colorDivisor );
					data[ outputOffset + 1 ] = Math.round( greenSum / colorDivisor );
					data[ outputOffset + 2 ] = Math.round( blueSum / colorDivisor );
				} else {
					data[ outputOffset ] = Math.round( redSum / colorDivisor );
					data[ outputOffset + 1 ] = Math.round( greenSum / colorDivisor );
					data[ outputOffset + 2 ] = Math.round( blueSum / colorDivisor );
				}
			}
			data[ outputOffset + 3 ] = Math.round( alphaSum / totalWeight * 255 );
		}
	}

	return { width, height, data };
}

export function generateTextureMipmaps( texture: TextureData, alphaTest = 0, normalMap = false ): TextureMipLevel[] {
	const levels: TextureMipLevel[] = [ { width: texture.width, height: texture.height, data: texture.data } ];
	const dimensions: { width: number; height: number }[] = [];
	let width = texture.width;
	let height = texture.height;
	let mipByteLength = 0;
	while ( width > 1 || height > 1 ) {
		width = Math.max( 1, Math.floor( width / 2 ) );
		height = Math.max( 1, Math.floor( height / 2 ) );
		dimensions.push( { width, height } );
		mipByteLength += width * height * 4;
	}
	const mipStorage = new Uint8Array( mipByteLength );
	let offset = 0;
	let source = levels[ 0 ]!;
	const baseCoverage = alphaTest > 0
		? getCoverageCount( texture.data, alphaTest ) / ( texture.width * texture.height )
		: 0;

	for ( const dimensionsAtLevel of dimensions ) {
		const byteLength = dimensionsAtLevel.width * dimensionsAtLevel.height * 4;
		const levelData = mipStorage.subarray( offset, offset + byteLength );
		offset += byteLength;
		source = downsample( source, alphaTest, normalMap, levelData );
		if ( alphaTest > 0 ) preserveAlphaCoverage( source.data, baseCoverage, alphaTest );
		levels.push( source );
	}

	return levels;
}

export function withTextureMipmaps( texture: TextureData, alphaTest = 0, normalMap = false ): TextureData {
	return { ...texture, mipmaps: generateTextureMipmaps( texture, alphaTest, normalMap ) };
}

export function prepareTextureMipmaps( texture: TextureData, alphaTest = 0, normalMap = false ): TextureData {
	if ( alphaTest > 0 && ! normalMap ) return withTextureMipmaps( texture, alphaTest );
	const { mipmaps: _mipmaps, ...baseTexture } = texture;
	return baseTexture;
}

export function alphaTestForTexture( parts: readonly PartDef[], textureName: string ): number {
	return parts.reduce( ( alphaTest, part ) => part.texture === textureName ? Math.max( alphaTest, part.alphaTest ) : alphaTest, 0 );
}

export function isPowerOfTwo( value: number ): boolean {
	return Number.isInteger( value ) && value > 0 && getPowerOfTwo( value ) === value;
}
