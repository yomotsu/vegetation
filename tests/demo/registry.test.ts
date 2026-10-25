import { describe, expect, it } from 'vitest';
import { kinds, leafColorPresets } from '../../demo/registry';

describe( 'demo registry', () => {

	it( 'provides the green and autumn leaf color presets', () => {

		expect( leafColorPresets ).toEqual( {
			green: '#2f7d1f',
			'autumn red': '#b5361c',
			orange: '#d9781e',
			yellow: '#d8b62a',
		} );

	} );

	it( 'registers only the tree with the supported controls', () => {

		expect( kinds ).toHaveLength( 1 );
		expect( kinds[ 0 ]!.name ).toBe( 'Tree' );
		expect( kinds[ 0 ]!.colorParts ).toEqual( [ 'leaf', 'bark' ] );
		expect( kinds[ 0 ]!.options ).toEqual( {
			seed: 1,
			height: 7.5,
			crownSize: 1,
			branchCount: 15,
		} );

	} );

} );
