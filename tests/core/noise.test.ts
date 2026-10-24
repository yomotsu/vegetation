import { describe, expect, it } from 'vitest';
import { createNoise3D } from '../../src/core/noise';

describe( 'createNoise3D', () => {

	it( 'returns the same value for the same seed and coordinates', () => {

		const noise = createNoise3D( 123 );

		expect( noise( 1.25, -4.5, 3.75 ) ).toBe( noise( 1.25, -4.5, 3.75 ) );
		expect( noise( 1.25, -4.5, 3.75 ) ).toBe( createNoise3D( 123 )( 1.25, -4.5, 3.75 ) );

	} );

	it( 'stays within [-1, 1] across 1000 points', () => {

		const noise = createNoise3D( 8 );

		for ( let i = 0; i < 1000; i ++ ) {

			const value = noise( i * 0.173, i * -0.119, i * 0.071 );

			expect( value ).toBeGreaterThanOrEqual( -1 );
			expect( value ).toBeLessThanOrEqual( 1 );

		}

	} );

	it( 'changes smoothly between nearby points', () => {

		const noise = createNoise3D( 17 );
		const first = noise( 2.13, 4.17, -1.61 );
		const second = noise( 2.14, 4.17, -1.61 );

		expect( Math.abs( first - second ) ).toBeLessThan( 0.1 );

	} );

} );
