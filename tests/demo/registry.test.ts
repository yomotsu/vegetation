import { describe, expect, it } from 'vitest';
import { flowerPetalColorPresets, flowerVarietyDefaults, grassColorPresets, kinds, leafColorPresets } from '../../demo/registry';

describe( 'demo registry', () => {

	it( 'provides the green and autumn leaf color presets', () => {

		expect( leafColorPresets ).toEqual( {
			green: '#2f7d1f',
			'autumn red': '#b5361c',
			orange: '#d9781e',
			yellow: '#d8b62a',
		} );

	} );

	it( 'registers tree, rock, pebbles, grass, and flowers with their supported controls', () => {

		expect( kinds ).toHaveLength( 5 );
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
		expect( kinds[ 1 ]!.textureColors ).toEqual( { mossColor: '#7cb83a' } );
		expect( kinds[ 1 ]!.options ).toEqual( {
			seed: 1,
			size: 6.4,
			roughness: 1.2,
			flatness: 0.04,
			weathering: 0.35,
			closeBottom: false,
			moss: 0,
		} );
		expect( kinds[ 2 ]!.name ).toBe( 'Pebbles' );
		expect( kinds[ 2 ]!.colorParts ).toEqual( [ 'stone' ] );
		expect( kinds[ 2 ]!.textureColors ).toEqual( { mossColor: '#7cb83a' } );
		expect( kinds[ 2 ]!.options ).toEqual( {
			seed: 1,
			count: 16,
			spread: 1.6,
			size: 0.32,
			sizeVariation: 0.48,
			burial: 0.4,
			moss: 0,
		} );
		expect( kinds[ 2 ]!.create( {} ).getColor( 'stone' ).getHex() ).toBe( 0xffffff );
		expect( kinds[ 3 ]!.name ).toBe( 'Grass' );
		expect( kinds[ 3 ]!.colorParts ).toEqual( [ 'blade' ] );
		expect( kinds[ 3 ]!.colorOptions ).toEqual( { blade: 'bladeColor' } );
		expect( kinds[ 3 ]!.defaultColors ).toEqual( { blade: '#4b942b' } );
		expect( kinds[ 3 ]!.options ).toEqual( { seed: 1, height: 0.45 } );
		expect( kinds[ 3 ]!.create( {} ).getColor( 'blade' ).getHex() ).toBe( 0x4b942b );
		expect( kinds[ 4 ]!.name ).toBe( 'Flowers' );
		expect( kinds[ 4 ]!.colorParts ).toEqual( [ 'petal', 'stem' ] );
		expect( kinds[ 4 ]!.colorOptions ).toEqual( { petal: 'petalColor', stem: 'stemColor' } );
		expect( kinds[ 4 ]!.defaultColors ).toEqual( { petal: '#f1efe8', stem: '#2f6f1e', centerColor: '#8a9670' } );
		expect( kinds[ 4 ]!.textureColors ).toEqual( { centerColor: '#8a9670' } );
		expect( kinds[ 4 ]!.options ).toEqual( { seed: 1, variety: 'allium', count: 6, spread: 0.29, height: 0.37 } );

	} );

	it( 'provides the requested grass color presets', () => {

		expect( grassColorPresets ).toEqual( { green: '#4b942b', 'dry yellow': '#b8a64a', autumn: '#a86a2c' } );

	} );

	it( 'provides the requested flower petal presets', () => {

		expect( flowerPetalColorPresets ).toEqual( {
			allium: { white: '#f1efe8', lavender: '#a98bd6', pink: '#e889b5', orange: '#d2600c' },
			daisy: { orange: '#d2600c', yellow: '#f2c230', red: '#c8352a', white: '#f1efe8' },
			tulip: { red: '#d8322a', yellow: '#f2c230', pink: '#ef7fa8', white: '#f4f1ea', orange: '#f07a28' },
		} );

	} );

	it( 'resets flower variety controls to their documented defaults', () => {

		expect( flowerVarietyDefaults ).toEqual( {
			allium: { count: 6, spread: 0.29, height: 0.37, petal: '#f1efe8', centerColor: '#8a9670' },
			daisy: { count: 6, spread: 0.37, height: 0.285, petal: '#d2600c', centerColor: '#8a7414' },
			tulip: { count: 4, spread: 0.3, height: 0.36, petal: '#d8322a', centerColor: '#000000' },
		} );
		expect( Object.keys( flowerPetalColorPresets ) ).toEqual( [ 'allium', 'daisy', 'tulip' ] );

	} );

} );
