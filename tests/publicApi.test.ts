import { describe, expect, it } from 'vitest';
import type { BroadleafTreeMeshOptions, KTX2LoaderLike, TreeMeshOptions } from '../src/index';

describe( 'public entry points', () => {

	it( 'keeps the main entry limited to vegetation objects', async () => {

		const exports = Object.keys( await import( '../src/index' ) ).sort();
		expect( exports ).toEqual( [
			'BroadleafTreeMesh',
			'FlowersMesh',
			'GrassMesh',
			'PebblesMesh',
			'RockMesh',
			'TreeMesh',
			'VegetationAsset',
			'VegetationMesh',
			'disposeVegetationWorkers',
			'generateBroadleafTree',
			'generateBroadleafTreeAsync',
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
			'generateBroadleafTreeData',
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

	it( 'accepts the caller-owned KTX2 loader through mesh generation options', () => {
		const loader: KTX2LoaderLike = { parse() {} };
		const options: TreeMeshOptions = { seed: 3, ktx2Loader: loader, compressTextures: false };
		expect( options.ktx2Loader ).toBe( loader );
		expect( options.compressTextures ).toBe( false );
	} );

	it( 'exports a separate mesh options type for each stylized tree', () => {
		const options: BroadleafTreeMeshOptions = { seed: 3, height: 4, leafColor: 0x336633, barkColor: 0x775533 };
		expect( options.seed ).toBe( 3 );
	} );

} );
