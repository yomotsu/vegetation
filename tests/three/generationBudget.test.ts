import { describe, expect, it } from 'vitest';
import { generateTree } from '../../src/three/meshes';

describe( 'tree generation budget', () => {

	it( 'generates and bakes through the three-layer API within the 50 ms budget', () => {

		const coldStart = performance.now();
		const firstAsset = generateTree( { seed: 1 } );
		const cold = performance.now() - coldStart;
		firstAsset.dispose();

		const timings: number[] = [];

		for ( let run = 0; run < 10; run ++ ) {

			const start = performance.now();
			const asset = generateTree( { seed: 1 } );
			timings.push( performance.now() - start );
			asset.dispose();

		}

		const sorted = [ ...timings ].sort( ( a, b ) => a - b );
		const median = ( sorted[ 4 ]! + sorted[ 5 ]! ) / 2;
		const maximum = sorted[ sorted.length - 1 ]!;

		console.log( `generateTree three-layer path: cold ${ cold.toFixed( 2 ) } ms, warm median ${ median.toFixed( 2 ) } ms, max ${ maximum.toFixed( 2 ) } ms` );
		expect( median ).toBeLessThan( 50 );

	} );

} );
