import { MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { generateTreeData } from '../../src/core';
import { VegetationAsset } from '../../src/three/VegetationAsset';
import { registerImpostorMaterialFactory } from '../../src/three/impostorMaterialFactory';
import { VegetationMesh } from '../../src/three/VegetationMesh';

describe( 'impostor materials', () => {

	it( 'adds the view-angle fade to LOD4 WebGL shader and its cache key', () => {

		const asset = new VegetationAsset( generateTreeData( { seed: 1 } ) );
		const material = asset.materials[ 3 ]!;
		const shader = {
			vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
			fragmentShader: '#include <common>\nvoid main() {\n#include <alphatest_fragment>\n}',
			uniforms: {},
		};

		expect( material.customProgramCacheKey() ).toContain( 'vegetation-impostor-view-fade-v1' );
		material.onBeforeCompile( shader as never, undefined as never );
		expect( shader.vertexShader ).toContain( 'attribute float impostorCard' );
		expect( shader.vertexShader ).toContain( 'instanceMatrix' );
		expect( shader.fragmentShader ).toContain( 'gl_FragCoord.xy' );
		expect( shader.fragmentShader ).toContain( 'diffuseColor.a *= impostorWeight' );

		asset.dispose();

	} );

	it( 'keeps the tree LOD3 top card out of the shadow pass', () => {

		const asset = new VegetationAsset( generateTreeData( { seed: 3 } ) );
		const mesh = new VegetationMesh( asset, 3 );

		expect( mesh.geometry.getAttribute( 'position' ) ).toBeDefined();
		expect( mesh.geometry.drawRange.count ).toBe( 0 );
		expect( mesh.parts ).toHaveLength( 2 );
		expect( mesh.parts[ 0 ]!.geometry.getIndex()!.count ).toBe( 36 );
		expect( mesh.parts[ 1 ]!.geometry.getIndex()!.count ).toBe( 6 );
		expect( mesh.parts[ 1 ]!.castShadow ).toBe( false );

		mesh.castShadow = true;
		expect( mesh.parts[ 0 ]!.castShadow ).toBe( true );
		expect( mesh.parts[ 1 ]!.castShadow ).toBe( false );

		mesh.dispose();
		asset.dispose();

	} );

	it( 'uses the registered factory for impostor materials only', () => {

		const factory = vi.fn( ( parameters ) => new MeshStandardMaterial( parameters ) );
		const unregister = registerImpostorMaterialFactory( factory );

		try {

			const asset = new VegetationAsset( generateTreeData( { seed: 2 } ) );

			try {

				expect( factory ).toHaveBeenCalledTimes( 2 );
				expect( asset.materials[ 0 ] ).toBeInstanceOf( MeshStandardMaterial );
				expect( asset.materials[ 2 ] ).toBeInstanceOf( MeshStandardMaterial );

			} finally {

				asset.dispose();

			}

		} finally {

			unregister();

		}

	} );

} );
