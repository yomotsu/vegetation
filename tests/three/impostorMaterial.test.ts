import { MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { generateFlowersData } from '../../src/core/generators/flowers';
import { generatePebblesData } from '../../src/core/generators/pebbles';
import { generateRockData } from '../../src/core/generators/rock';
import { generateTreeData } from '../../src/core/generators/tree';
import { VegetationAsset } from '../../src/three/VegetationAsset';
import { registerImpostorMaterialFactory } from '../../src/three/impostorMaterialFactory';
import { VegetationMesh } from '../../src/three/VegetationMesh';

describe( 'impostor materials', () => {

	it( 'adds the view-angle fade to LOD4 WebGL shader and its cache key', () => {

		const asset = new VegetationAsset( generateFlowersData( { seed: 1, variety: 'bluebell' } ) );
		const material = asset.materials[ asset.data.parts.findIndex( ( part ) => part.name === 'impostor' ) ]!;
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

	it( 'draws every tree, rock and pebbles impostor card without the view-angle fade', () => {

		for ( const data of [ generateTreeData( { seed: 1 } ), generateRockData( { seed: 1 } ), generatePebblesData( { seed: 1 } ) ] ) {

			const asset = new VegetationAsset( data );
			const impostorIndices = data.parts.flatMap( ( part, index ) => part.impostorViews !== undefined || part.impostorYawAngles !== undefined ? [ index ] : [] );

			expect( impostorIndices.length ).toBeGreaterThan( 0 );

			for ( const index of impostorIndices ) {

				expect( asset.materials[ index ]!.customProgramCacheKey(), data.kind ).not.toContain( 'vegetation-impostor-view-fade-v1' );

			}

			asset.dispose();

		}

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

			const asset = new VegetationAsset( generateFlowersData( { seed: 2, variety: 'bluebell' } ) );

			try {

				const impostorParts = asset.data.parts.filter( ( part ) => part.impostorViews !== undefined || part.impostorYawAngles !== undefined );

				expect( impostorParts.length ).toBeGreaterThan( 0 );
				expect( factory ).toHaveBeenCalledTimes( impostorParts.length );
				expect( asset.materials[ 0 ] ).toBeInstanceOf( MeshStandardMaterial );

			} finally {

				asset.dispose();

			}

		} finally {

			unregister();

		}

	} );

} );
