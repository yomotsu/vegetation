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

	it( 'registers the tree, rock, and pebbles with their supported controls', () => {

		expect( kinds ).toHaveLength( 3 );
		expect( kinds[ 0 ]!.name ).toBe( 'Tree' );
		expect( kinds[ 0 ]!.colorParts ).toEqual( [ 'leaf', 'bark' ] );
		expect( kinds[ 0 ]!.options ).toEqual( {
			seed: 1,
			height: 7.5,
			rootDepth: 0.3 * ( 7.5 / 7.55 ),
			crownSize: 1,
			branchCount: 10,
		} );
		expect( kinds[ 1 ]!.name ).toBe( 'Rock' );
		expect( kinds[ 1 ]!.colorParts ).toEqual( [ 'rock' ] );
		expect( kinds[ 1 ]!.options ).toEqual( {
			seed: 1,
			size: 6.4,
			roughness: 1.2,
			flatness: 0.04,
		} );
		expect( kinds[ 2 ]!.name ).toBe( 'Pebbles' );
		expect( kinds[ 2 ]!.colorParts ).toEqual( [ 'stone' ] );
		expect( kinds[ 2 ]!.options ).toEqual( {
			seed: 1,
			count: 16,
			spread: 1.6,
			size: 0.32,
			sizeVariation: 0.48,
			burial: 0.4,
		} );
		expect( kinds[ 2 ]!.create( {} ).getColor( 'stone' ).getHex() ).toBe( 0xffffff );

	} );

} );
