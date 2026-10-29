import { describe, expect, it } from 'vitest';
import { generateGrass, generateRock } from '../../src/three/meshes';
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

} );
