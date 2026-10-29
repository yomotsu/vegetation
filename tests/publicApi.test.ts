import { describe, expect, it } from 'vitest';

describe( 'public entry points', () => {

	it( 'keeps the main entry limited to vegetation objects', async () => {

		const exports = Object.keys( await import( '../src/index' ) ).sort();
		expect( exports ).toEqual( [
			'FlowersMesh',
			'GrassMesh',
			'PebblesMesh',
			'RockMesh',
			'TreeMesh',
			'VegetationAsset',
			'VegetationMesh',
			'disposeVegetationWorkers',
			'generateFlowers',
			'generateFlowersAsync',
			'generateGrass',
			'generateGrassAsync',
			'generatePebbles',
			'generatePebblesAsync',
			'generateRock',
			'generateRockAsync',
			'generateTree',
			'generateTreeAsync',
			'orientBillboardInstances',
		] );

	} );

	it( 'keeps the core entry limited to data generators', async () => {

		const exports = Object.keys( await import( '../src/core/index' ) ).sort();
		expect( exports ).toEqual( [
			'generateFlowersData',
			'generateGrassData',
			'generatePebblesData',
			'generateRockData',
			'generateTreeData',
		] );

	} );

	it( 'keeps the WebGPU entry side-effect only', async () => {

		const exports = Object.keys( await import( '../src/webgpu/index' ) ).sort();
		expect( exports ).toEqual( [] );

	} );

} );
