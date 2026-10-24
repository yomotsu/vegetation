import { describe, expect, it } from 'vitest';
import { createBarkTexture } from '../../src/core';

describe( 'bark texture', () => {

	it( 'creates deterministic opaque olive-brown grain with subtle variation', () => {

		const first = createBarkTexture( 17 );
		const repeated = createBarkTexture( 17 );
		const other = createBarkTexture( 18 );
		const colors = new Set<string>();
		let redTotal = 0;
		let greenTotal = 0;
		let blueTotal = 0;
		let invalidAlphaPixels = 0;
		let invalidHuePixels = 0;

		expect( first.width ).toBe( 256 );
		expect( first.height ).toBe( 256 );
		expect( first.data ).toEqual( repeated.data );
		expect( first.data ).not.toEqual( other.data );

		for ( let i = 0; i < first.data.length; i += 4 ) {

			const red = first.data[ i ]!;
			const green = first.data[ i + 1 ]!;
			const blue = first.data[ i + 2 ]!;

			if ( first.data[ i + 3 ] !== 255 ) invalidAlphaPixels ++;
			if ( red <= green || green <= blue ) invalidHuePixels ++;
			colors.add( `${ red },${ green },${ blue }` );
			redTotal += red;
			greenTotal += green;
			blueTotal += blue;

		}

		expect( invalidAlphaPixels ).toBe( 0 );
		expect( invalidHuePixels ).toBe( 0 );
		expect( colors.size ).toBeGreaterThan( 100 );
		expect( redTotal / ( first.width * first.height ) ).toBeGreaterThan( 60 );
		expect( redTotal / ( first.width * first.height ) ).toBeLessThan( 85 );
		expect( greenTotal / ( first.width * first.height ) ).toBeGreaterThan( 45 );
		expect( greenTotal / ( first.width * first.height ) ).toBeLessThan( 70 );
		expect( blueTotal / ( first.width * first.height ) ).toBeGreaterThan( 20 );
		expect( blueTotal / ( first.width * first.height ) ).toBeLessThan( 40 );

	} );

	it( 'accepts a positive explicit texture size', () => {

		const texture = createBarkTexture( 9, 64 );

		expect( texture.width ).toBe( 64 );
		expect( texture.height ).toBe( 64 );
		expect( texture.data ).toHaveLength( 64 * 64 * 4 );
		expect( () => createBarkTexture( 9, 0 ) ).toThrow( RangeError );

	} );

} );
