import { BufferGeometry, FrontSide, InstancedMesh, Matrix4, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { Material } from 'three';
import { describe, expect, it } from 'vitest';
import { generateFlowers, generateGrass, generateTree } from '../../src/index';
import { createScatter } from '../../demo/scatter';
import { GRASS_BLUE_NOISE_RANKS } from '../../demo/grassBlueNoise';
import type { VegetationAsset } from '../../src/index';

describe( 'scatter preview', () => {

	it( 'keeps the terrain reference blue-noise rank table evenly distributed at 15%', () => {

		const selected = Array.from( GRASS_BLUE_NOISE_RANKS, ( rank ) => rank / 4096 < 0.15 );
		let adjacentPairs = 0;

		for ( let z = 0; z < 64; z ++ ) {
			for ( let x = 0; x < 64; x ++ ) {
				const index = z * 64 + x;
				if ( selected[ index ] && selected[ z * 64 + ( ( x + 1 ) & 63 ) ] ) adjacentPairs ++;
				if ( selected[ index ] && selected[ ( ( z + 1 ) & 63 ) * 64 + x ] ) adjacentPairs ++;
			}
		}

		expect( GRASS_BLUE_NOISE_RANKS ).toHaveLength( 4096 );
		expect( selected.filter( Boolean ) ).toHaveLength( 615 );
		expect( adjacentPairs ).toBeLessThan( 50 );

	} );

	it( 'creates one instanced mesh per part and LOD and assigns every instance once', () => {

		const asset = generateTree( { seed: 7, branchCount: 1 } );
		const scatter = createScatter( asset, 8, 21 );
		const meshes = scatter.group.children as InstancedMesh[];

		expect( meshes ).toHaveLength( asset.data.parts.length * 5 );
		expect( meshes.every( ( mesh ) => mesh instanceof InstancedMesh ) ).toBe( true );
		expect( meshes.every( ( mesh ) => mesh.castShadow && mesh.receiveShadow ) ).toBe( true );

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

	it( 'uses bidirectional front-side geometry and retains fade for flowers that use it', () => {

		const asset = generateFlowers( { seed: 7, variety: 'bluebell' } );
		const scatter = createScatter( asset, 1, 23 );
		const meshes = scatter.group.children as InstancedMesh[];

		for ( const mesh of meshes ) {
			const lod = mesh.userData.lod as number;
			const source = asset.getParts( lod as 0 | 1 | 2 | 3 | 4 ).find( ( part ) => part.part === mesh.userData.part );
			if ( source === undefined ) continue;
			expect( mesh.geometry.getIndex()!.count ).toBe( source.geometry.getIndex()!.count * 2 );
			expect( ( mesh.material as Material ).side ).toBe( FrontSide );
		}

		// bluebell の LOD3 は交差 2 枚で常時描画。切り替えが残るのは LOD4 だけ。
		for ( const lod of [ 4 ] ) {
			const partName = 'impostor';
			const mesh = meshes.find( ( candidate ) => candidate.userData.lod === lod && candidate.userData.part === partName )!;
			const material = mesh.material as Material;
			expect( material.customProgramCacheKey() ).toContain( 'vegetation-impostor-view-fade-v1' );
			const shader = {
				vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
				fragmentShader: '#include <common>\n#include <alphatest_fragment>',
				uniforms: {},
			};
			material.onBeforeCompile( shader as never, undefined as never );
			expect( shader.fragmentShader ).toContain( 'impostorDither' );
		}

		scatter.dispose();
		asset.dispose();

	} );

	it( 'keeps primrose dome geometry single-sided in scatter batches', () => {

		const asset = generateFlowers( { seed: 7, variety: 'primrose' } );
		const scatter = createScatter( asset, 1, 23 );
		const meshes = scatter.group.children as InstancedMesh[];

		for ( const lod of [ 2, 3 ] ) {
			const mesh = meshes.find( ( candidate ) => candidate.userData.lod === lod && candidate.userData.part === 'impostor-lod3' );
			if ( mesh === undefined ) throw new Error( `Primrose LOD${ lod } dome batch is missing` );
			const source = asset.getParts( lod as 2 | 3 ).find( ( part ) => part.part === 'impostor-lod3' )!;
			const definition = asset.data.parts[ 2 ]!;
			expect( definition.doubleSided ).toBe( false );
			expect( definition.upNormalCards ).toBeUndefined();
			expect( mesh.geometry.getIndex()!.count ).toBe( source.geometry.getIndex()!.count );
			expect( ( mesh.material as Material ).side ).toBe( FrontSide );
		}

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

	it( 'turns active LOD4 instances toward a moved camera every update', () => {

		const asset = generateTree( { seed: 7, branchCount: 1 } );
		const scatter = createScatter( asset, 1, 21 );
		const camera = new PerspectiveCamera();
		const matrix = new Matrix4();
		const position = new Vector3();
		const firstRotation = new Quaternion();
		const scale = new Vector3();

		camera.position.set( 1000, 0, 0 );
		camera.updateMatrixWorld( true );
		scatter.update( camera, 0 );
		const batch = scatter.group.children.find( ( child ) => child.userData.lod === 4 && child instanceof InstancedMesh && child.count > 0 ) as InstancedMesh;
		batch.getMatrixAt( 0, matrix );
		matrix.decompose( position, firstRotation, scale );
		const savedPosition = position.clone();

		camera.position.set( - 1000, 0, 0 );
		camera.updateMatrixWorld( true );
		scatter.update( camera, 16 );
		batch.getMatrixAt( 0, matrix );
		matrix.decompose( position, firstRotation, scale );
		const facing = new Vector3( 0, 0, 1 ).applyQuaternion( firstRotation );
		const expected = camera.position.clone().sub( position ).setY( 0 ).normalize();

		expect( position.distanceTo( savedPosition ) ).toBeCloseTo( 0 );
		expect( facing.x ).toBeCloseTo( expected.x );
		expect( facing.z ).toBeCloseTo( expected.z );

		scatter.dispose();
		asset.dispose();

	} );

	it( 'scatters single grass cards at independent random yaw angles', () => {

		const asset = generateGrass( { seed: 7 } );
		const scatter = createScatter( asset, 1, 31 );
		const camera = new PerspectiveCamera();
		const matrix = new Matrix4();
		const position = new Vector3();
		const actualRotation = new Quaternion();
		const scale = new Vector3();

		camera.position.set( 1000, 0, 0 );
		camera.updateMatrixWorld( true );
		scatter.update( camera, 0 );
		const grassMesh = scatter.group.children.find( ( child ) => child instanceof InstancedMesh && child.count > 0 ) as InstancedMesh;
		grassMesh.getMatrixAt( 0, matrix );
		matrix.decompose( position, actualRotation, scale );
		const firstRotation = actualRotation.clone();
		grassMesh.getMatrixAt( 1, matrix );
		matrix.decompose( position, actualRotation, scale );

		expect( grassMesh.geometry.getAttribute( 'position' ).count ).toBe( 4 );
		expect( grassMesh.geometry.getIndex()!.count ).toBe( 12 );
		expect( ( grassMesh.material as Material ).side ).toBe( FrontSide );
		expect( Math.abs( actualRotation.dot( firstRotation ) ) ).toBeLessThan( 0.999 );

		scatter.dispose();
		asset.dispose();

	} );

	it( 'uses dense jittered grid scatter for grass with stable rank thinning and instance tint', () => {

		const seed = 31;
		const asset = generateGrass( { seed: 7 } );
		const scatter = createScatter( asset, 2, seed );
		const meshes = scatter.group.children as InstancedMesh[];
		const camera = new PerspectiveCamera();
		const matrix = new Matrix4();
		const position = new Vector3();
		const rotation = new Quaternion();
		const scale = new Vector3();
		const cells = new Set<string>();
		let closeInstances = 0;
		let thinnedInstances = 0;
		let thinnedAlive = 0;
		let fadedInstances = 0;
		let maximumRootOffset = 0;
		let maximumRadius = 0;
		let duplicateCell = false;
		let minimumTint = Infinity;
		let maximumTint = - Infinity;
		let maximumTintChannelDifference = 0;

		scatter.update( camera, 0 );
		expect( meshes ).toHaveLength( 1 );
		const mesh = meshes[ 0 ]!;
		expect( mesh.count ).toBeGreaterThan( 85000 );
		expect( mesh.count ).toBeLessThan( 92000 );
		expect( mesh.instanceColor ).not.toBeNull();
		expect( mesh.boundingBox!.min.x ).toBeLessThan( - 48 );
		expect( mesh.boundingBox!.max.z ).toBeGreaterThan( 48 );

		for ( let index = 0; index < mesh.count; index ++ ) {

			mesh.getMatrixAt( index, matrix );
			matrix.decompose( position, rotation, scale );
			maximumRootOffset = Math.max( maximumRootOffset, Math.abs( position.y + 0.03 ) );
			const distance = Math.hypot( position.x, position.z );
			maximumRadius = Math.max( maximumRadius, distance );
			const cell = `${ Math.floor( position.x / 0.11 ) },${ Math.floor( position.z / 0.11 ) }`;
			if ( cells.has( cell ) ) duplicateCell = true;
			cells.add( cell );

			if ( distance < 12 ) {
				const height = scale.y * 0.45;
				expect( height ).toBeGreaterThanOrEqual( 0.3 );
				expect( height ).toBeLessThanOrEqual( 0.6 );
				closeInstances ++;
			}
			if ( distance >= 30 && distance < 38 ) {
				thinnedInstances ++;
				if ( Math.abs( matrix.elements[ 5 ]! ) > 0 ) thinnedAlive ++;
			}
			if ( distance >= 46 && distance < 47 ) {
				fadedInstances ++;
				if ( matrix.elements[ 5 ]! >= 0.03 ) throw new Error( 'Grass card did not fade near the draw radius' );
			}

		}

		expect( maximumRootOffset ).toBeLessThan( 0.00001 );
		expect( maximumRadius ).toBeLessThan( 48 );
		expect( duplicateCell ).toBe( false );
		expect( closeInstances ).toBeGreaterThan( 0 );
		expect( thinnedInstances ).toBeGreaterThan( 0 );
		expect( thinnedAlive / thinnedInstances ).toBeGreaterThan( 0.3 );
		expect( thinnedAlive / thinnedInstances ).toBeLessThan( 0.8 );
		expect( fadedInstances ).toBeGreaterThan( 0 );

		const instanceColors = mesh.instanceColor!.array;
		for ( let index = 0; index < mesh.count; index ++ ) {

			const red = instanceColors[ index * 3 ]!;
			const green = instanceColors[ index * 3 + 1 ]!;
			const blue = instanceColors[ index * 3 + 2 ]!;
			minimumTint = Math.min( minimumTint, red );
			maximumTint = Math.max( maximumTint, red );
			maximumTintChannelDifference = Math.max( maximumTintChannelDifference, Math.abs( red - green ), Math.abs( red - blue ) );

		}
		expect( minimumTint ).toBeGreaterThanOrEqual( 0.94 );
		expect( maximumTint ).toBeLessThanOrEqual( 1.06 );
		expect( maximumTintChannelDifference ).toBeLessThan( 0.00001 );

		const second = createScatter( asset, 1, seed );
		const secondMesh = second.group.children[ 0 ] as InstancedMesh;
		expect( secondMesh.count ).toBe( mesh.count );
		for ( let index = 0; index < mesh.count; index += 97 ) {
			mesh.getMatrixAt( index, matrix );
			const firstMatrix = matrix.clone();
			secondMesh.getMatrixAt( index, matrix );
			expect( matrix.elements ).toEqual( firstMatrix.elements );
		}

		second.dispose();
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
