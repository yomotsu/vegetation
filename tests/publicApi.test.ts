import { describe, expect, it } from 'vitest';
import type { BroadleafTreeMeshOptions, FirTreeMeshOptions, FirTreeOptions, KTX2LoaderLike } from '../src/index';

describe( 'public entry points', () => {

	it( 'keeps the main entry limited to vegetation objects', async () => {

		const exports = Object.keys( await import( '../src/index' ) ).sort();
		expect( exports ).toEqual( [
			'BroadleafTreeMesh',
			'BushMesh',
			'FirTreeMesh',
			'FlowersMesh',
			'GrassMesh',
			'PebblesMesh',
			'PineTreeMesh',
			'RockMesh',
			'VegetationAsset',
			'VegetationMesh',
			'WillowTreeMesh',
			'disposeVegetationWorkers',
			'generateBroadleafTree',
			'generateBroadleafTreeAsync',
			'generateBush',
			'generateBushAsync',
			'generateFirTree',
			'generateFirTreeAsync',
			'generateFlowers',
			'generateFlowersAsync',
			'generateGrass',
			'generateGrassAsync',
			'generatePebbles',
			'generatePebblesAsync',
			'generatePineTree',
			'generatePineTreeAsync',
			'generateRock',
			'generateRockAsync',
			'generateWillowTree',
			'generateWillowTreeAsync',
			'orientBillboardInstances',
		] );

	} );

	it( 'keeps the core entry limited to data generators', async () => {

		const exports = Object.keys( await import( '../src/core/index' ) ).sort();
		expect( exports ).toEqual( [
			'generateBroadleafTreeData',
			'generateBushData',
			'generateFirTreeData',
			'generateFlowersData',
			'generateGrassData',
			'generatePebblesData',
			'generatePineTreeData',
			'generateRockData',
			'generateWillowTreeData',
		] );

	} );

	it( 'keeps the WebGPU entry side-effect only', async () => {

		const exports = Object.keys( await import( '../src/webgpu/index' ) ).sort();
		expect( exports ).toEqual( [] );

	} );

	it( 'accepts the caller-owned KTX2 loader through mesh generation options', () => {
		const loader: KTX2LoaderLike = { parse() {} };
		const options: FirTreeMeshOptions = { seed: 3, ktx2Loader: loader, compressTextures: false };
		expect( options.ktx2Loader ).toBe( loader );
		expect( options.compressTextures ).toBe( false );
	} );

	it( 'exports a separate mesh options type for each stylized tree', () => {
		const options: BroadleafTreeMeshOptions = { seed: 3, height: 4, leafColor: 0x336633, barkColor: 0x775533 };
		const firOptions: FirTreeMeshOptions = { seed: 3, height: 4, leafColor: 0x336633, barkColor: 0x775533 };
		const coreOptions: FirTreeOptions = { seed: 3, height: 4 };
		expect( options.seed ).toBe( 3 );
		expect( firOptions.seed ).toBe( 3 );
		expect( coreOptions.height ).toBe( 4 );
	} );

} );
