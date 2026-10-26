import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import '../../src/webgpu';
import { generateTreeData } from '../../src/core';
import { VegetationAsset } from '../../src/three/VegetationAsset';
import { getImpostorMaterialFactory } from '../../src/three/impostorMaterialFactory';

describe( 'WebGPU impostor material entry', () => {

	it( 'registers and creates a TSL material with fade and alpha-test nodes', () => {

		expect( getImpostorMaterialFactory() ).not.toBeNull();

		const asset = new VegetationAsset( generateTreeData( { seed: 4 } ) );
		const material = asset.materials[ 3 ]! as unknown as MeshStandardNodeMaterial;

		expect( material ).toBeInstanceOf( MeshStandardNodeMaterial );
		expect( material.opacityNode ).not.toBeNull();
		expect( material.alphaTestNode ).not.toBeNull();
		expect( material.transparent ).toBe( false );
		expect( material.alphaTest ).toBe( 0.5 );

		asset.dispose();

	} );

	it( 'preserves physical impostor material parameters', () => {

		const data = generateTreeData( { seed: 5 } );
		data.parts[ 3 ]!.specularIntensity = 0.25;
		data.parts[ 3 ]!.ior = 1.3;

		const asset = new VegetationAsset( data );
		const material = asset.materials[ 3 ]! as unknown as MeshPhysicalNodeMaterial;

		expect( material ).toBeInstanceOf( MeshPhysicalNodeMaterial );
		expect( material.specularIntensity ).toBe( 0.25 );
		expect( material.ior ).toBe( 1.3 );
		expect( material.opacityNode ).not.toBeNull();
		expect( material.alphaTestNode ).not.toBeNull();

		asset.dispose();

	} );

} );
