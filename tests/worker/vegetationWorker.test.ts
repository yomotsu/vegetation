import { describe, expect, it } from 'vitest';
import { generateFlowers, generateGrass, generateRock } from '../../src/three/meshes';
import { handleVegetationWorkerMessage } from '../../src/worker/vegetationWorker';
import { areByteIdentical, areStructurallyByteIdentical } from '../helpers/byteIdentical';

describe( 'vegetation worker handler', () => {

	it( 'returns byte-identical generated data and impostor textures', () => {

		const result = handleVegetationWorkerMessage( {
			id: 1,
			kind: 'rock',
			options: { seed: 1, moss: 0.5, rockColor: 0x897b6a, mossColor: 0x7cb83a },
			colors: { rock: 0x897b6a },
			impostorSize: 128,
		} );
		const sync = generateRock( { seed: 1, moss: 0.5, rockColor: '#897b6a' } );

		expect( result ).toHaveProperty( 'prepared' );
		if ( ! ( 'prepared' in result ) ) throw new Error( 'Expected prepared payload' );
		expect( areStructurallyByteIdentical( result.prepared.data, sync.data ) ).toBe( true );
		for ( const [ name, texture ] of Object.entries( result.prepared.impostorTextures ) ) {

			const partIndex = sync.data.parts.findIndex( ( part ) => part.texture === name && part.impostorViews !== undefined );
			const image = sync.materials[ partIndex ]!.map!.image as { data: Uint8Array; width: number; height: number };
			expect( areByteIdentical( texture.data, image.data ) ).toBe( true );
			expect( texture.width ).toBe( image.width );
			expect( texture.height ).toBe( image.height );

		}
		sync.dispose();

	}, 30000 );

	it( 'serializes invalid option errors as RangeError', () => {

		const result = handleVegetationWorkerMessage( {
			id: 2,
			kind: 'rock',
			options: { seed: 1, size: 0 },
			colors: {},
			impostorSize: 128,
		} );

		expect( result ).toEqual( { id: 2, error: { name: 'RangeError', message: 'Rock size must be a positive finite number' } } );

	} );

	it( 'returns single-card grass data and regenerated textures byte-identical to sync generation', () => {

		const result = handleVegetationWorkerMessage( {
			id: 3,
			kind: 'grass',
			options: { seed: 5, height: 0.45, width: 0.50625, bladeColor: 0xb8a64a },
			colors: { blade: 0xb8a64a },
			impostorSize: 128,
		} );
		const sync = generateGrass( { seed: 5, height: 0.45, width: 0.50625, bladeColor: '#b8a64a' } );

		expect( result ).toHaveProperty( 'prepared' );
		if ( ! ( 'prepared' in result ) ) throw new Error( 'Expected prepared payload' );
		expect( areStructurallyByteIdentical( result.prepared.data, sync.data ) ).toBe( true );
		expect( Object.keys( result.prepared.impostorTextures ) ).toEqual( [] );
		expect( areByteIdentical( result.prepared.data.textures.blade!.data, sync.data.textures.blade!.data ) ).toBe( true );
		expect( areByteIdentical( result.prepared.data.textures['blade-normal']!.data, sync.data.textures['blade-normal']!.data ) ).toBe( true );
		sync.dispose();

	}, 30000 );

	it( 'returns allium and daisy geometry, colors, and impostors byte-identical to sync generation', () => {

		for ( const variety of [ 'allium', 'daisy' ] as const ) {
			const options = {
				seed: 13,
				variety,
				count: 6,
				spread: variety === 'allium' ? 0.29 : 0.37,
				height: variety === 'allium' ? 0.37 : 0.285,
				petalColor: variety === 'allium' ? 0xa98bd6 : 0xf2c230,
				centerColor: variety === 'allium' ? 0xb9cf6a : 0x5a4a1c,
				stemColor: 0x81603d,
			};
			const result = handleVegetationWorkerMessage( {
				id: 17,
				kind: 'flowers',
				options,
				colors: { petal: options.petalColor, stem: options.stemColor },
				impostorSize: 128,
			} );
			const sync = generateFlowers( options );

			expect( result ).toHaveProperty( 'prepared' );
			if ( ! ( 'prepared' in result ) ) throw new Error( 'Expected prepared payload' );
			expect( areStructurallyByteIdentical( result.prepared.data, sync.data ) ).toBe( true );
			for ( const [ name, texture ] of Object.entries( result.prepared.impostorTextures ) ) {
				const partIndex = sync.data.parts.findIndex( ( part ) => part.texture === name && part.impostorViews !== undefined );
				const image = sync.materials[ partIndex ]!.map!.image as { data: Uint8Array; width: number; height: number };
				expect( areByteIdentical( texture.data, image.data ) ).toBe( true );
				expect( texture.width ).toBe( image.width );
				expect( texture.height ).toBe( image.height );
			}
			sync.dispose();
		}

	}, 30000 );

	it( 'returns lupine, yarrow, and tulip geometry, colors, and impostors byte-identical to sync generation', () => {

		for ( const variety of [ 'lupine', 'yarrow', 'tulip' ] as const ) {
			const options = {
				seed: 13,
				variety,
				count: variety === 'lupine' ? 5 : variety === 'tulip' ? 4 : 6,
				spread: 0.3,
				height: variety === 'lupine' ? 0.52 : variety === 'yarrow' ? 0.42 : 0.36,
				petalColor: variety === 'lupine' ? 0x4f6fd8 : variety === 'yarrow' ? 0xd0508f : 0xd8322a,
				centerColor: 0xf4d6a0,
				stemColor: 0x81603d,
			};
			const result = handleVegetationWorkerMessage( {
				id: 27,
				kind: 'flowers',
				options,
				colors: { petal: options.petalColor, stem: options.stemColor },
				impostorSize: 128,
			} );
			const sync = generateFlowers( options );
			expect( result ).toHaveProperty( 'prepared' );
			if ( ! ( 'prepared' in result ) ) throw new Error( 'Expected prepared payload' );
			expect( areStructurallyByteIdentical( result.prepared.data, sync.data ) ).toBe( true );
			for ( const [ name, texture ] of Object.entries( result.prepared.impostorTextures ) ) {
				const partIndex = sync.data.parts.findIndex( ( part ) => part.texture === name && part.impostorViews !== undefined );
				const image = sync.materials[ partIndex ]!.map!.image as { data: Uint8Array; width: number; height: number };
				expect( areByteIdentical( texture.data, image.data ) ).toBe( true );
				expect( texture.width ).toBe( image.width );
				expect( texture.height ).toBe( image.height );
			}
			sync.dispose();
		}

	}, 30000 );

} );
