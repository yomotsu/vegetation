import { describe, expect, it } from 'vitest';
import { hexToLinear, linearToSrgbByte } from '../../src/core/color';

describe( 'hexToLinear', () => {

	it( 'converts white and black to linear RGB', () => {

		expect( hexToLinear( 0xffffff ) ).toEqual( [ 1, 1, 1 ] );
		expect( hexToLinear( 0x000000 ) ).toEqual( [ 0, 0, 0 ] );

	} );

	it( 'converts sRGB channel values to linear light', () => {

		expect( hexToLinear( 0x808080 )[ 0 ] ).toBeCloseTo( 0.21586, 5 );

	} );

} );

describe( 'linearToSrgbByte', () => {

	it( 'converts normalized linear values to sRGB bytes', () => {

		expect( linearToSrgbByte( 0 ) ).toBe( 0 );
		expect( linearToSrgbByte( 1 ) ).toBe( 255 );
		expect( linearToSrgbByte( 0.5 ) ).toBe( 188 );
		expect( linearToSrgbByte( - 1 ) ).toBe( 0 );
		expect( linearToSrgbByte( 2 ) ).toBe( 255 );

	} );

} );
