import type { EncodedUastcTexture } from './uastc';

const KTX2_IDENTIFIER = new Uint8Array( [ 0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a ] );
const HEADER_SIZE = 68;

function align( value: number, boundary: number ): number {
	return Math.ceil( value / boundary ) * boundary;
}

export function writeUastcKtx2( texture: EncodedUastcTexture ): ArrayBuffer {
	const { buffer, levelOffsets } = createKtx2Container( texture );
	const bytes = new Uint8Array( buffer );
	for ( let levelIndex = 0; levelIndex < texture.levels.length; levelIndex ++ ) {
		bytes.set( texture.levels[ levelIndex ]!.data, levelOffsets[ levelIndex ]! );
	}
	return buffer;
}

function createKtx2Container( texture: EncodedUastcTexture ): { buffer: ArrayBuffer; levelOffsets: number[] } {
	const levelCount = texture.levels.length;
	if ( levelCount === 0 ) throw new Error( 'KTX2 UASTC textures must contain at least one mip level' );
	const headerEnd = KTX2_IDENTIFIER.byteLength + HEADER_SIZE;
	const levelIndexEnd = headerEnd + 24 * levelCount;
	const dfdOffset = levelIndexEnd;
	const dfdLength = 44;
	let dataOffset = align( dfdOffset + dfdLength, 16 );
	const levelOffsets = new Array<number>( levelCount );
	for ( let levelIndex = levelCount - 1; levelIndex >= 0; levelIndex -- ) {
		dataOffset = align( dataOffset, 16 );
		levelOffsets[ levelIndex ] = dataOffset;
		dataOffset += texture.levels[ levelIndex ]!.data.byteLength;
	}
	const buffer = new ArrayBuffer( dataOffset );
	const bytes = new Uint8Array( buffer );
	const view = new DataView( buffer );
	bytes.set( KTX2_IDENTIFIER, 0 );
	let offset = 12;
	const header32 = [
		0, // Vulkan 形式を指定しない。
		1, // 型サイズ。
		texture.width,
		texture.height,
		0, // 3D テクスチャではない。
		0, // 配列レイヤー数。
		1, // 面数。
		levelCount,
		0, // スーパー圧縮なし。
		dfdOffset,
		dfdLength,
		0, // キー・値データのオフセット。
		0, // キー・値データの長さ。
	];
	for ( const value of header32 ) {
		view.setUint32( offset, value, true );
		offset += 4;
	}
	view.setBigUint64( offset, 0n, true );
	view.setBigUint64( offset + 8, 0n, true );
	offset = headerEnd;
	for ( let levelIndex = 0; levelIndex < levelCount; levelIndex ++ ) {
		const level = texture.levels[ levelIndex ]!;
		view.setBigUint64( offset, BigInt( levelOffsets[ levelIndex ]! ), true );
		view.setBigUint64( offset + 8, BigInt( level.data.byteLength ), true );
		view.setBigUint64( offset + 16, BigInt( level.data.byteLength ), true );
		offset += 24;
	}
	view.setUint32( dfdOffset, dfdLength, true );
	view.setUint16( dfdOffset + 4, 0, true ); // Khronos の vendor ID。
	view.setUint16( dfdOffset + 6, 0, true ); // BASICFORMAT の記述子。
	view.setUint16( dfdOffset + 8, 2, true ); // DFD のバージョン。
	view.setUint16( dfdOffset + 10, 40, true ); // 16 バイトのサンプルを 1 つ格納。
	view.setUint8( dfdOffset + 12, 166 ); // UASTC 用の色モデル。
	view.setUint8( dfdOffset + 13, texture.colorSpace === 'none' ? 0 : 1 ); // 色域: 未指定または BT.709。
	view.setUint8( dfdOffset + 14, texture.colorSpace === 'srgb' ? 2 : 1 ); // sRGB またはリニア転送関数。
	view.setUint8( dfdOffset + 15, 0 ); // アルファはストレート形式。
	view.setUint8( dfdOffset + 16, 3 );
	view.setUint8( dfdOffset + 17, 3 );
	view.setUint8( dfdOffset + 18, 0 );
	view.setUint8( dfdOffset + 19, 0 );
	view.setUint8( dfdOffset + 20, 16 ); // 1 ブロックは 4x4 texel の 16 バイト。
	view.setUint8( dfdOffset + 28, 0 ); // サンプルのビット位置。
	view.setUint8( dfdOffset + 30, 127 ); // サンプル長から 1 を引いた値。
	view.setUint8( dfdOffset + 31, texture.alpha ? 3 : 0 ); // UASTC の RGBA または RGB チャンネル。
	view.setUint32( dfdOffset + 40, 0xffffffff, true ); // サンプルの上限値。
	return { buffer, levelOffsets };
}

/** Worker が使えない環境向け。最大 64 KiB ごとにメインスレッドへ制御を返します。 */
export async function writeUastcKtx2Async( texture: EncodedUastcTexture, onSlice?: ( durationMs: number ) => void ): Promise<ArrayBuffer> {
	const { buffer, levelOffsets } = createKtx2Container( texture );
	const bytes = new Uint8Array( buffer );
	const copySliceSize = 64 * 1024;
	for ( let levelIndex = 0; levelIndex < texture.levels.length; levelIndex ++ ) {
		const source = texture.levels[ levelIndex ]!.data;
		const targetOffset = levelOffsets[ levelIndex ]!;
		for ( let offset = 0; offset < source.length; offset += copySliceSize ) {
			const sliceStart = performance.now();
			const end = Math.min( source.length, offset + copySliceSize );
			bytes.set( source.subarray( offset, end ), targetOffset + offset );
			onSlice?.( performance.now() - sliceStart );
			if ( end < source.length || levelIndex < texture.levels.length - 1 ) await new Promise<void>( ( resolve ) => setTimeout( resolve, 0 ) );
		}
	}
	return buffer;
}
