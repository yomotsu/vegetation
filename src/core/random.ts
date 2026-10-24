export interface Random {
	next(): number;
	range( min: number, max: number ): number;
	int( min: number, maxInclusive: number ): number;
	fork( salt: number ): Random;
}

function hashFork( seed: number, salt: number ): number {

	let hash = ( seed ^ ( Math.floor( Math.abs( salt ) * 1000 ) >>> 0 ) ^ 0x9e3779b9 ) >>> 0;

	hash = Math.imul( hash ^ ( hash >>> 16 ), 0x7feb352d );
	hash = Math.imul( hash ^ ( hash >>> 15 ), 0x846ca68b );

	return ( hash ^ ( hash >>> 16 ) ) >>> 0;

}

function createRandomFromSeed( seed: number ): Random {

	let state = seed >>> 0;

	return {
		next() {

			state = ( state + 0x6d2b79f5 ) >>> 0;
			let value = state;

			value = Math.imul( value ^ ( value >>> 15 ), value | 1 );
			value ^= value + Math.imul( value ^ ( value >>> 7 ), value | 61 );

			return ( ( value ^ ( value >>> 14 ) ) >>> 0 ) / 4294967296;

		},
		range( min, max ) {

			return min + this.next() * ( max - min );

		},
		int( min, maxInclusive ) {

			return min + Math.floor( this.next() * ( maxInclusive - min + 1 ) );

		},
		fork( salt ) {

			return createRandomFromSeed( hashFork( seed, salt ) );

		},
	};

}

export function createRandom( seed: number ): Random {

	const normalizedSeed = Math.floor( Math.abs( seed ) * 1000 ) >>> 0;

	return createRandomFromSeed( normalizedSeed );

}
