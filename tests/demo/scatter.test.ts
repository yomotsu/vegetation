import { BufferGeometry, MeshStandardMaterial, PerspectiveCamera, InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { generateTree } from '../../src/index';
import { createScatter } from '../../demo/scatter';
import type { VegetationAsset } from '../../src/index';

describe( 'scatter preview', () => {

	it( 'creates one instanced mesh per part and LOD and assigns every instance once', () => {

		const asset = generateTree( { seed: 7, branchCount: 1 } );
		const scatter = createScatter( asset, 8, 21 );
		const meshes = scatter.group.children as InstancedMesh[];

		expect( meshes ).toHaveLength( asset.data.parts.length * 5 );
		expect( meshes.every( ( mesh ) => mesh instanceof InstancedMesh ) ).toBe( true );

		const camera = new PerspectiveCamera();
		camera.position.set( 0, 3, 0 );
		camera.updateMatrixWorld();
		scatter.update( camera, 0 );

		let assignedInstances = 0;

		for ( let lod = 0; lod < 5; lod ++ ) {

			const levelMeshes = meshes.filter( ( mesh ) => mesh.userData.lod === lod );
			const levelCounts = levelMeshes.map( ( mesh ) => mesh.count ).filter( ( count ) => count > 0 );
			const count = Math.max( ...levelCounts, 0 );
			expect( levelMeshes ).toHaveLength( asset.data.parts.length );
			expect( new Set( levelCounts ).size ).toBeLessThanOrEqual( 1 );
			assignedInstances += count;

		}

		expect( assignedInstances ).toBe( 8 );
		expect( meshes.every( ( mesh ) => asset.materials.includes( mesh.material as typeof asset.materials[number] ) ) ).toBe( true );
		expect( meshes.filter( ( mesh ) => mesh.count === 0 ).every( ( mesh ) => mesh.visible === false ) ).toBe( true );


		scatter.dispose();
		asset.dispose();

	} );

	it( 'caps scatter geometry variants at four seeds', () => {

		const asset = generateTree( { seed: 7, branchCount: 1 } );
		const scatter = createScatter( [ asset, asset, asset, asset, asset ], 4, 19 );
		const meshes = scatter.group.children as InstancedMesh[];

		expect( meshes ).toHaveLength( asset.data.parts.length * 5 * 4 );
		expect( new Set( meshes.map( ( mesh ) => mesh.userData.variant ) ).size ).toBe( 4 );

		scatter.dispose();
		asset.dispose();

	} );

	it( 'disposes every instanced mesh before clearing the scatter group', () => {

		const geometry = new BufferGeometry();
		geometry.setIndex( [ 0, 1, 2 ] );
		const material = new MeshStandardMaterial();
		const asset = {
			data: { parts: [ { name: 'leaf' }, { name: 'bark' } ] },
			materials: [ material, material ],
			getParts: () => [
				{ part: 'leaf', geometry },
				{ part: 'bark', geometry },
			],
		} as unknown as VegetationAsset;
		const scatter = createScatter( asset, 2, 23 );
		const meshes = [ ... scatter.group.children ] as InstancedMesh[];
		const disposedMeshes = new Set<InstancedMesh>();

		for ( const mesh of meshes ) {
			mesh.addEventListener( 'dispose', () => disposedMeshes.add( mesh ) );
		}

		scatter.dispose();
		expect( disposedMeshes.size ).toBe( meshes.length );
		expect( scatter.group.children ).toHaveLength( 0 );

		geometry.dispose();
		material.dispose();

	} );

} );
