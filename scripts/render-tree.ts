import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { bakeImpostor } from '../src/core/impostor';
import { hexToLinear } from '../src/core/color';
import { generateTreeData } from '../src/core/generators/tree';
import type { TextureData, VegetationData } from '../src/core/types';

const seed = Number.parseInt( process.argv[ 2 ] ?? '1', 10 );
const outputDirectory = '.superpowers/sdd/2026-10-24-vegetation/renders';
const background = [ 224, 224, 224 ];
const crcTable = new Uint32Array( 256 );

if ( ! Number.isInteger( seed ) ) {

	throw new RangeError( 'Seed must be an integer' );

}

for ( let i = 0; i < crcTable.length; i ++ ) {

	let value = i;

	for ( let bit = 0; bit < 8; bit ++ ) {

		value = ( value & 1 ) === 1 ? 0xedb88320 ^ ( value >>> 1 ) : value >>> 1;

	}

	crcTable[ i ] = value >>> 0;

}

function crc32( data: Buffer ): number {

	let crc = 0xffffffff;

	for ( const value of data ) {

		crc = crcTable[ ( crc ^ value ) & 0xff ]! ^ ( crc >>> 8 );

	}

	return ( crc ^ 0xffffffff ) >>> 0;

}

function pngChunk( type: string, data: Buffer ): Buffer {

	const name = Buffer.from( type, 'ascii' );
	const payload = Buffer.concat( [ name, data ] );
	const chunk = Buffer.alloc( data.length + 12 );

	chunk.writeUInt32BE( data.length, 0 );
	payload.copy( chunk, 4 );
	chunk.writeUInt32BE( crc32( payload ), data.length + 8 );

	return chunk;

}

function composite( texture: TextureData ): Buffer {

	const pixels = Buffer.alloc( texture.width * texture.height * 4 );

	for ( let y = 0; y < texture.height; y ++ ) {

		for ( let x = 0; x < texture.width; x ++ ) {

			const source = ( ( texture.height - y - 1 ) * texture.width + x ) * 4;
			const target = ( y * texture.width + x ) * 4;
			const alpha = texture.data[ source + 3 ]! / 255;

			for ( let channel = 0; channel < 3; channel ++ ) {

				pixels[ target + channel ] = Math.round( texture.data[ source + channel ]! * alpha + background[ channel ]! * ( 1 - alpha ) );

			}

			pixels[ target + 3 ] = 255;

		}

	}

	return pixels;

}

function encodePng( width: number, height: number, pixels: Buffer ): Buffer {

	const header = Buffer.alloc( 13 );
	const rows = Buffer.alloc( height * ( width * 4 + 1 ) );

	header.writeUInt32BE( width, 0 );
	header.writeUInt32BE( height, 4 );
	header[ 8 ] = 8;
	header[ 9 ] = 6;

	for ( let y = 0; y < height; y ++ ) {

		const row = y * ( width * 4 + 1 );
		rows[ row ] = 0;
		pixels.copy( rows, row + 1, y * width * 4, ( y + 1 ) * width * 4 );
	}

	return Buffer.concat( [
		Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ),
		pngChunk( 'IHDR', header ),
		pngChunk( 'IDAT', deflateSync( rows ) ),
		pngChunk( 'IEND', Buffer.alloc( 0 ) ),
	] );

}

async function main(): Promise<void> {

	const data = generateTreeData( { seed } );
	const colors = data.parts.map( ( part ) => hexToLinear( part.defaultColor ) );
	const suffix = `tree-seed${ seed }`;

	await mkdir( outputDirectory, { recursive: true } );

	for ( let lod = 0; lod < 4; lod ++ ) {

		const lodData: VegetationData = { ...data, lods: [ data.lods[ lod ]!, ...data.lods.slice( 1 ) ] };
		const image = bakeImpostor( lodData, colors, 256 );
		const png = encodePng( image.width, image.height, composite( image ) );
		const path = `${ outputDirectory }/${ suffix }-lod${ lod }.png`;

		await writeFile( path, png );
		process.stdout.write( `${ path }\n` );

		if ( lod === 0 ) {

			await writeFile( `${ outputDirectory }/${ suffix }.png`, png );

		}

	}

}

await main();
