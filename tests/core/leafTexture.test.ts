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

function opaqueChannelValues( texture: { width: number; height: number; data: Uint8Array }, channel: number ): number[] {

	const tileWidth = texture.width / 3;
	const values: number[] = [];

	for ( let y = 0; y < texture.height; y ++ ) {
		for ( let x = 0; x < tileWidth; x ++ ) {
			const offset = ( y * texture.width + x ) * 4;

			if ( texture.data[ offset + 3 ]! < 128 ) continue;

			if ( channel === 3 ) {
				values.push( Math.round( 0.2126 * texture.data[ offset ]! + 0.7152 * texture.data[ offset + 1 ]! + 0.0722 * texture.data[ offset + 2 ]! ) );
			} else {
				values.push( texture.data[ offset + channel ]! );
			}

		}
	}

	return values;

}

function opaqueNeighborGradientValues( texture: { width: number; height: number; data: Uint8Array } ): number[] {

	const tileWidth = texture.width / 3;
	const values: number[] = [];

	for ( let y = 0; y < texture.height; y ++ ) {

		for ( let x = 0; x < tileWidth; x ++ ) {

			const offset = ( y * texture.width + x ) * 4;

			if ( texture.data[ offset + 3 ]! < 128 ) continue;

			const luminance = 0.2126 * texture.data[ offset ]! + 0.7152 * texture.data[ offset + 1 ]! + 0.0722 * texture.data[ offset + 2 ]!;

			for ( const [ dx, dy ] of [ [ 1, 0 ], [ 0, 1 ] ] ) {

				const neighborX = x + dx!;
				const neighborY = y + dy!;

				if ( neighborX >= tileWidth || neighborY >= texture.height ) continue;

				const neighborOffset = ( neighborY * texture.width + neighborX ) * 4;

				if ( texture.data[ neighborOffset + 3 ]! < 128 ) continue;

				const neighborLuminance = 0.2126 * texture.data[ neighborOffset ]! + 0.7152 * texture.data[ neighborOffset + 1 ]! + 0.0722 * texture.data[ neighborOffset + 2 ]!;

				values.push( Math.abs( neighborLuminance - luminance ) );

			}

		}

	}

	return values;

}

function meanOpaqueLuminanceInColumnRange( texture: { width: number; height: number; data: Uint8Array }, startX: number, endX: number ): number {

	const values: number[] = [];

	for ( let y = 20; y < texture.height - 20; y ++ ) {

		for ( let x = startX; x < endX; x ++ ) {

			const offset = ( y * texture.width + x ) * 4;

			if ( texture.data[ offset + 3 ]! < 128 ) continue;

			values.push( 0.2126 * texture.data[ offset ]! + 0.7152 * texture.data[ offset + 1 ]! + 0.0722 * texture.data[ offset + 2 ]! );

		}

	}

	return values.reduce( ( total, value ) => total + value, 0 ) / values.length;

}

function opaqueRowLuminance( texture: { width: number; data: Uint8Array }, y: number, startX: number, endX: number ): number | null {

	let total = 0;
	let count = 0;

	for ( let x = startX; x < endX; x ++ ) {

		const offset = ( y * texture.width + x ) * 4;

		if ( texture.data[ offset + 3 ]! < 128 ) continue;

		total += 0.2126 * texture.data[ offset ]! + 0.7152 * texture.data[ offset + 1 ]! + 0.0722 * texture.data[ offset + 2 ]!;
		count ++;

	}

	return count === 0 ? null : total / count;

}

function percentile( values: number[], fraction: number ): number {

	const sorted = [ ...values ].sort( ( a, b ) => a - b );

	return sorted[ Math.round( ( sorted.length - 1 ) * fraction ) ]!;

}

describe( 'fir sprig texture', () => {

	it( 'creates a deterministic atlas with a fir sprig, needles, and a green midrib', () => {

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
		expect( brownPixels ).toBeGreaterThan( 50 );
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

	it( 'draws a narrow brown stem along the center from mid-sprig to base', () => {

		const seed = 1;
		const texture = createFirSprigTexture( seed );

		for ( const y of [ 136, 152, 168, 184, 200, 216, 232, 248 ] ) {

			const center = Math.round( texture.height * 0.5 + Math.sin( y / texture.height * Math.PI * 1.3 + seed * 0.37 ) * texture.height * 0.009 );
			const brownPixels: number[] = [];

			for ( let x = center - 4; x <= center + 4; x ++ ) {

				const offset = ( y * texture.width + x ) * 4;

				if ( texture.data[ offset + 3 ]! < 128 ) continue;
				if ( texture.data[ offset ]! <= texture.data[ offset + 1 ]! + 2 ) continue;
				if ( texture.data[ offset + 1 ]! <= texture.data[ offset + 2 ]! * 1.5 ) continue;

				brownPixels.push( x );

			}

			expect( brownPixels.length ).toBeGreaterThan( 0 );
			expect( brownPixels.length ).toBeLessThanOrEqual( 4 );

		}

	} );

	it( 'keeps the stem opaque at the v=0 base edge', () => {

		const seed = 1;
		const texture = createFirSprigTexture( seed );

		for ( let y = 0; y < 5; y ++ ) {

			const center = Math.round( texture.height * 0.5 + Math.sin( y / texture.height * Math.PI * 1.3 + seed * 0.37 ) * texture.height * 0.009 );
			expect( alphaAt( texture, center, y ) ).toBeGreaterThanOrEqual( 128 );

		}

	} );

	it( 'keeps a dense needle mask similar to the Tree01 albedo', () => {

		const texture = createFirSprigTexture( 1 );
		const tileWidth = texture.width / 3;
		const coverage = alphaCoverage( texture, 0, tileWidth );

		expect( coverage ).toBeGreaterThan( 0.26 );
		expect( coverage ).toBeLessThan( 0.34 );

	} );

	it( 'matches the Tree01 opaque texel hue and value distribution', () => {

		const texture = createFirSprigTexture( 1 );
		const red = opaqueChannelValues( texture, 0 );
		const green = opaqueChannelValues( texture, 1 );
		const blue = opaqueChannelValues( texture, 2 );
		const luminance = opaqueChannelValues( texture, 3 );
		const mean = ( values: number[] ): number => values.reduce( ( total, value ) => total + value, 0 ) / values.length;

		expect( mean( red ) ).toBeGreaterThanOrEqual( 27 );
		expect( mean( red ) ).toBeLessThanOrEqual( 31 );
		expect( mean( green ) ).toBeGreaterThanOrEqual( 69 );
		expect( mean( green ) ).toBeLessThanOrEqual( 75 );
		expect( mean( blue ) ).toBeGreaterThanOrEqual( 4 );
		expect( mean( blue ) ).toBeLessThanOrEqual( 9 );
		expect( percentile( luminance, 0.1 ) ).toBeGreaterThanOrEqual( 41 );
		expect( percentile( luminance, 0.1 ) ).toBeLessThanOrEqual( 49 );
		expect( percentile( luminance, 0.5 ) ).toBeGreaterThanOrEqual( 54 );
		expect( percentile( luminance, 0.5 ) ).toBeLessThanOrEqual( 60 );
		expect( percentile( luminance, 0.9 ) ).toBeGreaterThanOrEqual( 71 );
		expect( percentile( luminance, 0.9 ) ).toBeLessThanOrEqual( 79 );

	} );

	it( 'keeps neighboring needle tones softly graduated', () => {

		const texture = createFirSprigTexture( 1 );
		const gradients = opaqueNeighborGradientValues( texture );

		expect( percentile( gradients, 0.9 ) ).toBeLessThanOrEqual( 4 );

	} );

	it( 'keeps the needle luminance range compact', () => {

		const texture = createFirSprigTexture( 1 );
		const luminance = opaqueChannelValues( texture, 3 );

		expect( percentile( luminance, 0.9 ) - percentile( luminance, 0.1 ) ).toBeLessThanOrEqual( 27 );

	} );

	it( 'keeps the sprig centerline from forming a dark radial stripe', () => {

		const texture = createFirSprigTexture( 1 );
		const center = meanOpaqueLuminanceInColumnRange( texture, 126, 130 );
		const sides = ( meanOpaqueLuminanceInColumnRange( texture, 118, 124 ) + meanOpaqueLuminanceInColumnRange( texture, 132, 138 ) ) / 2;

		expect( center ).toBeGreaterThanOrEqual( sides - 2.75 );

	} );

	it( 'keeps the darkest centerline rows close to their side texture', () => {

		const texture = createFirSprigTexture( 1 );
		const contrasts: number[] = [];

		for ( let y = 20; y < texture.height - 20; y ++ ) {

			const center = opaqueRowLuminance( texture, y, 126, 131 );
			const left = opaqueRowLuminance( texture, y, 118, 124 );
			const right = opaqueRowLuminance( texture, y, 132, 138 );

			if ( center === null || left === null || right === null ) continue;

			contrasts.push( center - ( left + right ) * 0.5 );

		}

		expect( percentile( contrasts, 0.1 ) ).toBeGreaterThanOrEqual( - 2.5 );

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
