import { describe, expect, it } from 'vitest';
import { generateRockData } from '../../src/core/generators/rock';

describe( 'cold rock generation budget', () => {

	it( 'keeps the median of five new rocks within 500 ms', () => {

		const durations: number[] = [];
		for ( let seed = 901; seed <= 905; seed ++ ) {
			const start = performance.now();
			generateRockData( { seed, weathering: 0.35 } );
			durations.push( performance.now() - start );
		}
		durations.sort( ( first, second ) => first - second );
		const median = durations[ Math.floor( durations.length / 2 ) ]!;
		expect( median, `cold rock median ${ median.toFixed( 1 ) } ms` ).toBeLessThanOrEqual( 500 );

	}, 120000 );

} );
