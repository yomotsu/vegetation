import { describe, expect, it } from 'vitest';
import { createFirSprigTexture } from '../../src/core';

function alphaAt( texture: { width: number; data: Uint8Array }, x: number, y: number ): number {

	return texture.data[ ( y * texture.width + x ) * 4 + 3 ]!;

}

function alphaCoverage( texture: { width: number; height: number; data: Uint8Array }, xOffset: number, width: number ): number {

	let covered = 0;

	for ( let y = 0; y < texture.height; y ++ ) {

		for ( let x = xOffset; x < xOffset + width; x ++ ) {

			if ( alphaAt( texture, x, y ) >= 128 ) covered ++;

		}

	}

	return covered / ( width * texture.height );

}

function rowWidth( texture: { width: number; data: Uint8Array }, xOffset: number, y: number, width: number ): number {

	let count = 0;

	for ( let x = xOffset; x < xOffset + width; x ++ ) {

		if ( alphaAt( texture, x, y ) >= 128 ) count ++;

	}

	return count;

}

describe( 'fir sprig texture', () => {

	it( 'creates a deterministic atlas with a fir sprig, needles, and a brown stem', () => {

		const first = createFirSprigTexture( 42 );
		const second = createFirSprigTexture( 42 );
		const otherSeed = createFirSprigTexture( 43 );
		const tileWidth = first.width / 3;
		let opaquePixels = 0;
		let sprigOpaquePixels = 0;
		let greenPixels = 0;
		let brownPixels = 0;
		let redTotal = 0;
		let greenTotal = 0;
		let blueTotal = 0;
		let invalidAlphaPixels = 0;

		expect( first.width ).toBe( 768 );
		expect( first.height ).toBe( 256 );
		expect( first.data ).toEqual( second.data );
		expect( first.data ).not.toEqual( otherSeed.data );
		for ( let y = 0; y < first.height; y ++ ) {

			for ( let x = 0; x < first.width; x ++ ) {

				const offset = ( y * first.width + x ) * 4;
				const red = first.data[ offset ]!;
				const green = first.data[ offset + 1 ]!;
				const blue = first.data[ offset + 2 ]!;
				const alpha = first.data[ offset + 3 ]!;

				if ( alpha !== 0 && alpha !== 255 ) invalidAlphaPixels ++;

				if ( alpha === 255 ) {

					opaquePixels ++;
					if ( x < tileWidth ) {

						sprigOpaquePixels ++;
						redTotal += red;
						greenTotal += green;
						blueTotal += blue;

					}

				}

				if ( x < tileWidth && alpha === 255 && green > red && green > blue ) greenPixels ++;
				if ( x < tileWidth && alpha === 255 && red > green && green > blue ) brownPixels ++;

			}

		}

		expect( invalidAlphaPixels ).toBe( 0 );
		expect( opaquePixels ).toBe( sprigOpaquePixels );
		expect( sprigOpaquePixels / ( tileWidth * first.height ) ).toBeGreaterThan( 0.2 );
		expect( greenPixels ).toBeGreaterThan( 1000 );
		expect( brownPixels ).toBeGreaterThan( 100 );
		expect( alphaCoverage( first, 0, tileWidth ) ).toBeGreaterThan( 0.18 );
		expect( alphaCoverage( first, 0, tileWidth ) ).toBeLessThan( 0.5 );
		expect( alphaCoverage( first, tileWidth, tileWidth ) ).toBe( 0 );
		expect( alphaCoverage( first, tileWidth * 2, tileWidth ) ).toBe( 0 );
		expect( redTotal / sprigOpaquePixels ).toBeGreaterThan( 20 );
		expect( redTotal / sprigOpaquePixels ).toBeLessThan( 50 );
		expect( greenTotal / sprigOpaquePixels ).toBeGreaterThan( 50 );
		expect( greenTotal / sprigOpaquePixels ).toBeLessThan( 110 );
		expect( blueTotal / sprigOpaquePixels ).toBeLessThan( 20 );

	} );

	it( 'stores the sprig base at v=0 and narrows toward its tip', () => {

		const texture = createFirSprigTexture( 7 );
		const tileWidth = texture.width / 3;
		const baseRow = rowWidth( texture, 0, 12, tileWidth );
		const middleRow = rowWidth( texture, 0, 128, tileWidth );
		const tipRow = rowWidth( texture, 0, 252, tileWidth );
		expect( baseRow ).toBeGreaterThan( 0 );
		expect( middleRow ).toBeGreaterThan( baseRow );
		expect( tipRow ).toBeLessThan( middleRow );

	} );

	it( 'keeps a dense needle mask similar to the Tree01 albedo', () => {

		const texture = createFirSprigTexture( 1 );
		const tileWidth = texture.width / 3;
		const coverage = alphaCoverage( texture, 0, tileWidth );

		expect( coverage ).toBeGreaterThan( 0.26 );
		expect( coverage ).toBeLessThan( 0.34 );

	} );

	it( 'uses broad, connected needle strokes instead of a hairy edge', () => {

		const texture = createFirSprigTexture( 1 );
		const tileWidth = texture.width / 3;
		let opaquePixels = 0;
		let perimeter = 0;

		for ( let y = 0; y < texture.height; y ++ ) {

			for ( let x = 0; x < tileWidth; x ++ ) {

				const offset = ( y * texture.width + x ) * 4;

				if ( texture.data[ offset + 3 ]! < 128 ) continue;

				opaquePixels ++;

				for ( const [ dx, dy ] of [ [ - 1, 0 ], [ 1, 0 ], [ 0, - 1 ], [ 0, 1 ] ] ) {

					const neighborX = x + dx!;
					const neighborY = y + dy!;

					if ( neighborX < 0 || neighborX >= tileWidth || neighborY < 0 || neighborY >= texture.height || alphaAt( texture, neighborX, neighborY ) < 128 ) perimeter ++;

				}

			}

		}

		expect( perimeter / opaquePixels ).toBeLessThan( 0.42 );

	} );

	it( 'pads transparent RGB with colors from its own opaque atlas region', () => {

		const texture = createFirSprigTexture( 31 );
		const tileWidth = texture.width / 3;

		for ( let tile = 0; tile < 1; tile ++ ) {

			const colors = new Set<string>();

			for ( let y = 0; y < texture.height; y ++ ) {

				for ( let x = tile * tileWidth; x < ( tile + 1 ) * tileWidth; x ++ ) {

					const offset = ( y * texture.width + x ) * 4;
					const color = `${ texture.data[ offset ] },${ texture.data[ offset + 1 ] },${ texture.data[ offset + 2 ] }`;

					if ( texture.data[ offset + 3 ] === 255 ) {

						colors.add( color );

					}

				}

			}

			for ( let y = 0; y < texture.height; y ++ ) {

				for ( let x = tile * tileWidth; x < ( tile + 1 ) * tileWidth; x ++ ) {

					const offset = ( y * texture.width + x ) * 4;

					if ( texture.data[ offset + 3 ] === 0 ) {

						const color = `${ texture.data[ offset ] },${ texture.data[ offset + 1 ] },${ texture.data[ offset + 2 ] }`;

						expect( color ).not.toBe( '255,255,255' );
						expect( colors.has( color ) ).toBe( true );

					}

				}

			}

		}

	} );

	it( 'accepts a positive explicit tile size', () => {

		const texture = createFirSprigTexture( 7, 64 );

		expect( texture.width ).toBe( 192 );
		expect( texture.height ).toBe( 64 );
		expect( texture.data.length ).toBe( 192 * 64 * 4 );
		expect( () => createFirSprigTexture( 7, 0 ) ).toThrow( RangeError );

	} );

} );
