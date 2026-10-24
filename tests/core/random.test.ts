import { describe, expect, it } from 'vitest';
import { createRandom } from '../../src/core/random';

describe( 'createRandom', () => {

	it( 'returns the same sequence for the same seed', () => {

		const a = createRandom( 123 );
		const b = createRandom( 123 );
		const sequenceA = Array.from( { length: 100 }, () => a.next() );
		const sequenceB = Array.from( { length: 100 }, () => b.next() );

		expect( sequenceA ).toEqual( sequenceB );

	} );

	it( 'returns different sequences for different seeds', () => {

		const a = createRandom( 1 );
		const b = createRandom( 2 );
		const sequenceA = Array.from( { length: 20 }, () => a.next() );
		const sequenceB = Array.from( { length: 20 }, () => b.next() );

		expect( sequenceA ).not.toEqual( sequenceB );

	} );

	it.each( [ 0, -5, 1.5, 2 ** 40 ] )( 'returns values in [0, 1) for seed %s', ( seed ) => {

		const random = createRandom( seed );

		for ( let i = 0; i < 100; i ++ ) {

			const value = random.next();

			expect( Number.isNaN( value ) ).toBe( false );
			expect( value ).toBeGreaterThanOrEqual( 0 );
			expect( value ).toBeLessThan( 1 );

		}

	} );

	it( 'forks distinct streams without advancing the parent', () => {

		const random = createRandom( 42 );
		const baseline = createRandom( 42 );
		const firstFork = random.fork( 1 );
		const secondFork = random.fork( 2 );
		const firstSequence = Array.from( { length: 20 }, () => firstFork.next() );
		const secondSequence = Array.from( { length: 20 }, () => secondFork.next() );

		expect( firstSequence ).not.toEqual( secondSequence );
		expect( random.next() ).toBe( baseline.next() );
		expect( random.fork( 1 ).next() ).toBe( createRandom( 42 ).fork( 1 ).next() );

	} );

	it( 'does not treat swapped seed and salt as the same fork', () => {

		expect( createRandom( 1 ).fork( 2 ).next() ).not.toBe( createRandom( 2 ).fork( 1 ).next() );

	} );

	it( 'supports ranges and inclusive integers', () => {

		const random = createRandom( 9 );

		for ( let i = 0; i < 100; i ++ ) {

			const ranged = random.range( -2, 3 );
			const integer = random.int( 2, 5 );

			expect( ranged ).toBeGreaterThanOrEqual( -2 );
			expect( ranged ).toBeLessThan( 3 );
			expect( integer ).toBeGreaterThanOrEqual( 2 );
			expect( integer ).toBeLessThanOrEqual( 5 );

		}

	} );

} );
