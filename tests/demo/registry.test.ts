import { describe, expect, it } from 'vitest';
import { kinds } from '../../demo/registry';

describe( 'demo registry', () => {

	it( 'registers only the tree with the supported controls', () => {

		expect( kinds ).toHaveLength( 1 );
		expect( kinds[ 0 ]!.name ).toBe( 'Tree' );
		expect( kinds[ 0 ]!.colorParts ).toEqual( [ 'leaf', 'bark' ] );
		expect( kinds[ 0 ]!.options ).toEqual( {
			seed: 1,
			height: 6,
			crownSize: 1,
			branchCount: 6,
		} );

	} );

} );
