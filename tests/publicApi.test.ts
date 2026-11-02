import { describe, expect, it } from 'vitest';
import type { BambooShootMeshOptions, BambooShootOptions, BambooTreeMeshOptions, BambooTreeOptions, BroadleafTreeMeshOptions, FirTreeMeshOptions, FirTreeOptions, KTX2LoaderLike } from '../src/index';

describe( 'public entry points', () => {

	it( 'keeps the main entry limited to vegetation objects', async () => {

		const exports = Object.keys( await import( '../src/index' ) ).sort();
		expect( exports ).toEqual( [
			'AlliumMesh',
			'BambooShootMesh',
			'BambooTreeMesh',
			'BluebellMesh',
			'BroadleafTreeMesh',
			'BushMesh',
			'CallaMesh',
			'DaisyMesh',
			'FirTreeMesh',
			'FlowersMesh',
			'GrassMesh',
			'PebblesMesh',
			'PineTreeMesh',
			'PoppyMesh',
			'PrimroseMesh',
			'RockMesh',
			'TulipMesh',
			'VegetationAsset',
			'VegetationMesh',
			'WillowTreeMesh',
			'disposeVegetationWorkers',
			'generateAllium',
			'generateAlliumAsync',
			'generateBambooShoot',
			'generateBambooShootAsync',
			'generateBambooTree',
			'generateBambooTreeAsync',
			'generateBluebell',
			'generateBluebellAsync',
			'generateBroadleafTree',
			'generateBroadleafTreeAsync',
			'generateBush',
			'generateBushAsync',
			'generateCalla',
			'generateCallaAsync',
			'generateDaisy',
			'generateDaisyAsync',
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
			'generatePoppy',
			'generatePoppyAsync',
			'generatePrimrose',
			'generatePrimroseAsync',
			'generateRock',
			'generateRockAsync',
			'generateTulip',
			'generateTulipAsync',
			'generateWillowTree',
			'generateWillowTreeAsync',
			'orientBillboardInstances',
		] );

	} );

	it( 'keeps the core entry limited to data generators', async () => {

		const exports = Object.keys( await import( '../src/core/index' ) ).sort();
		expect( exports ).toEqual( [
			'generateBambooShootData',
			'generateBambooTreeData',
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
		const bambooOptions: BambooTreeMeshOptions = { seed: 3, height: 8, leafColor: 0x70a94b, barkColor: 0x477f48 };
		const bambooCoreOptions: BambooTreeOptions = { seed: 3, height: 8 };
		const shootOptions: BambooShootMeshOptions = { seed: 3, height: 0.84, sheathColor: 0x91a24a };
		const shootCoreOptions: BambooShootOptions = { seed: 3, height: 0.84 };
		expect( options.seed ).toBe( 3 );
		expect( firOptions.seed ).toBe( 3 );
		expect( coreOptions.height ).toBe( 4 );
		expect( bambooOptions.height ).toBe( 8 );
		expect( bambooCoreOptions.height ).toBe( 8 );
		expect( shootOptions.height ).toBe( 0.84 );
		expect( shootCoreOptions.height ).toBe( 0.84 );
	} );

} );
