import { describe, expect, it } from 'vitest';
import { createLeafClusterTexture } from '../../src/core';

describe( 'leaf cluster texture', () => {

	it( 'creates a deterministic 128 pixel texture with binary alpha and centered leaf coverage', () => {

		const first = createLeafClusterTexture( 42 );
		const second = createLeafClusterTexture( 42 );
		const otherSeed = createLeafClusterTexture( 43 );
		let opaquePixels = 0;

		expect( first.width ).toBe( 128 );
		expect( first.height ).toBe( 128 );
		expect( first.data ).toEqual( second.data );
		expect( first.data ).not.toEqual( otherSeed.data );

		for ( let i = 0; i < first.data.length; i += 4 ) {

			const red = first.data[ i ]!;
			const green = first.data[ i + 1 ]!;
			const blue = first.data[ i + 2 ]!;
			const alpha = first.data[ i + 3 ]!;

			expect( red ).toBeGreaterThanOrEqual( 191 );
			expect( red ).toBeLessThanOrEqual( 255 );
			expect( green ).toBe( red );
			expect( blue ).toBe( red );
			expect( alpha === 0 || alpha === 255 ).toBe( true );

			if ( alpha === 255 ) opaquePixels ++;

		}

		const coverage = opaquePixels / ( first.width * first.height );

		expect( coverage ).toBeGreaterThanOrEqual( 0.2 );
		expect( coverage ).toBeLessThanOrEqual( 0.7 );

	} );

	it( 'accepts an explicit texture size', () => {

		const texture = createLeafClusterTexture( 7, 64 );

		expect( texture.width ).toBe( 64 );
		expect( texture.height ).toBe( 64 );
		expect( texture.data.length ).toBe( 64 * 64 * 4 );

	} );

} );
