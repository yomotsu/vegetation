import { describe, expect, it } from 'vitest';
import { impostorCardWeights } from '../../src/core/impostorFade';

describe( 'impostor card weights', () => {

	it( 'keeps vertical cards at side angles and horizontal cards at top angles', () => {

		expect( impostorCardWeights( 0 ) ).toEqual( { vertical: 1, horizontal: 0 } );
		expect( impostorCardWeights( 1 ) ).toEqual( { vertical: 0, horizontal: 1 } );

	} );

	it( 'overlaps smoothly through the fade interval without a zero-weight gap', () => {

		for ( let value = 0.5; value <= 0.8; value += 0.01 ) {

			const weights = impostorCardWeights( value );
			expect( weights.vertical + weights.horizontal ).toBeGreaterThanOrEqual( 1 );

		}

	} );

} );
