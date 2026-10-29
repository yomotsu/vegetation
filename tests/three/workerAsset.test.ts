import { describe, expect, it } from 'vitest';
import { generatePebblesData } from '../../src/core/generators/pebbles';
import { generateRockData } from '../../src/core/generators/rock';
import { generateTreeData } from '../../src/core/generators/tree';
import { prepareVegetationAsset } from '../../src/core/vegetationAssetPreparation';
import { VegetationAsset } from '../../src/three/VegetationAsset';
import { generateRock, generateRockAsync } from '../../src/three/meshes';

function expectAssetBytesEqual( first: VegetationAsset, second: VegetationAsset ): void {

	 expect( second.data ).toEqual( first.data );
	 expect( second.geometries.map( ( geometry ) => geometry.attributes ) ).toEqual( first.geometries.map( ( geometry ) => geometry.attributes ) );
	 expect( second.materials.map( ( material ) => material.map?.image ) ).toEqual( first.materials.map( ( material ) => material.map?.image ) );
	 expect( second.collider?.attributes ).toEqual( first.collider?.attributes );

}

describe( 'prepared vegetation assets', () => {

	it( 'matches constructor output for a recolored tree, mossy rock, and pebble', () => {

		const cases = [
			{ data: generateTreeData( { seed: 1 } ), colors: { leaf: 0xc0392b } as Record<string, number>, size: 128 },
			{ data: generateRockData( { seed: 1, moss: 0.5 } ), colors: { rock: 0x897b6a } as Record<string, number>, size: 128 },
			{ data: generatePebblesData( { seed: 1 } ), colors: { stone: 0x6a7b8c } as Record<string, number>, size: 128 },
		];

		for ( const testCase of cases ) {

			const original = new VegetationAsset( testCase.data, testCase.colors );
			const prepared = prepareVegetationAsset( testCase.data, testCase.colors, testCase.size );
			const fromPrepared = VegetationAsset.fromPrepared( prepared );
			expectAssetBytesEqual( original, fromPrepared );
			original.dispose();
			fromPrepared.dispose();

		}

	}, 120000 );

	it( 'falls back to the synchronous generator when Worker is unavailable', async () => {

		const originalWorker = globalThis.Worker;
		Object.defineProperty( globalThis, 'Worker', { configurable: true, value: undefined } );
		const synchronous = generateRock( { seed: 1, moss: 0.5, rockColor: '#897b6a' } );
		const asynchronous = await generateRockAsync( { seed: 1, moss: 0.5, rockColor: '#897b6a' } );
		expectAssetBytesEqual( synchronous, asynchronous );
		synchronous.dispose();
		asynchronous.dispose();
		Object.defineProperty( globalThis, 'Worker', { configurable: true, value: originalWorker } );

	}, 60000 );

} );
