import { MeshStandardMaterial } from 'three';
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import '../../src/webgpu';
import { generateFlowersData } from '../../src/core';
import { VegetationAsset } from '../../src/three/VegetationAsset';
import { VegetationMesh } from '../../src/three/VegetationMesh';
import { getImpostorMaterialFactory } from '../../src/three/impostorMaterialFactory';

describe( 'WebGPU impostor material entry', () => {

	it( 'registers and creates a TSL material with fade and alpha-test nodes', () => {

		expect( getImpostorMaterialFactory() ).not.toBeNull();

		const data = generateFlowersData( { seed: 4, variety: 'daisy' } );
		const asset = new VegetationAsset( data );
		const material = asset.materials[ data.parts.findIndex( ( part ) => part.name === 'impostor' ) ]! as unknown as MeshStandardNodeMaterial;

		expect( material ).toBeInstanceOf( MeshStandardNodeMaterial );
		expect( material.opacityNode ).not.toBeNull();
		expect( material.alphaTestNode ).not.toBeNull();
		expect( material.transparent ).toBe( false );
		expect( material.alphaTest ).toBe( 0.5 );

		asset.dispose();

	} );

	it( 'preserves physical impostor material parameters', () => {

		const data = generateFlowersData( { seed: 5, variety: 'daisy' } );
		const impostorIndex = data.parts.findIndex( ( part ) => part.name === 'impostor' );
		data.parts[ impostorIndex ]!.specularIntensity = 0.25;
		data.parts[ impostorIndex ]!.ior = 1.3;

		const asset = new VegetationAsset( data );
		const material = asset.materials[ impostorIndex ]! as unknown as MeshPhysicalNodeMaterial;

		expect( material ).toBeInstanceOf( MeshPhysicalNodeMaterial );
		expect( material.specularIntensity ).toBe( 0.25 );
		expect( material.ior ).toBe( 1.3 );
		expect( material.opacityNode ).not.toBeNull();
		expect( material.alphaTestNode ).not.toBeNull();

		asset.dispose();

	} );

	it( 'supports allium LOD4 as a single-card WebGPU-compatible material', () => {

		const data = generateFlowersData( { seed: 6, variety: 'allium' } );
		const asset = new VegetationAsset( data );
		const mesh = new VegetationMesh( asset, 4 );
		const index = data.parts.findIndex( ( part ) => part.name === 'impostor' );

		expect( data.parts[ index ]!.impostorFade ).toBe( false );
		expect( asset.materials[ index ] ).toBeInstanceOf( MeshStandardMaterial );
		expect( mesh.parts ).toHaveLength( 1 );
		expect( mesh.parts[ 0 ]!.geometry.getIndex()!.count ).toBe( 6 );
		expect( ( asset.materials[ index ]!.map!.image as { width: number } ).width ).toBe( 128 );

		mesh.dispose();
		asset.dispose();

	} );

} );
