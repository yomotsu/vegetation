import { FrontSide, InstancedMesh, LOD, Matrix4, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FlowersMesh, generateFlowers, generateFlowersAsync } from '../../src/index';
import { generateFlowersData } from '../../src/core/generators/flowers';
import { prepareVegetationAsset } from '../../src/core/vegetationAssetPreparation';
import { areByteIdentical, areStructurallyByteIdentical } from '../helpers/byteIdentical';
import { orientBillboardInstances } from '../../src/three/VegetationMesh';

describe( 'flowers three.js API', () => {

	it( 'exports FlowersMesh with split textured parts and owned up-normal cards', () => {

		const asset = generateFlowers( { seed: 3, variety: 'daisy' } );
		const mesh = new FlowersMesh( { seed: 3, variety: 'daisy', lod: 0 } );

		expect( mesh ).toBeInstanceOf( Mesh );
		expect( mesh.collider ).toBeNull();
		expect( asset.data.parts.slice( 0, 2 ).map( ( part ) => part.name ) ).toEqual( [ 'petal', 'stem' ] );
		expect( asset.data.parts.slice( 0, 2 ).every( ( part ) => part.colorizesTexture && part.upNormalCards ) ).toBe( true );
		expect( asset.materials.slice( 0, 2 ).every( ( material ) => material instanceof MeshPhysicalMaterial ) ).toBe( true );
		expect( mesh.parts.map( ( part ) => part.name ) ).toEqual( [ 'petal', 'stem' ] );
		expect( mesh.parts.every( ( part ) => part.material.side === FrontSide ) ).toBe( true );
		expect( mesh.parts.every( ( part ) => part.geometry.getIndex()!.count > asset.getParts( 0 ).find( ( source ) => source.part === part.name )!.geometry.getIndex()!.count ) ).toBe( true );
		asset.dispose();
		mesh.dispose();

	} );

	it( 'regenerates petal and stem colors without replacing geometry, and creates five LODs', () => {

		const mesh = new FlowersMesh( { seed: 6, petalColor: '#f2c230', stemColor: '#2f6f1e' } );
		const positions = mesh.asset.geometries.map( ( geometry ) => geometry.getAttribute( 'position' ).array.slice() );
		expect( mesh.asset.data.parts[ 0 ]!.texture ).toBeNull();
		expect( mesh.asset.data.parts[ 1 ]!.texture ).toBeNull();
		expect( Object.keys( mesh.asset.data.textures ) ).toEqual( [ 'plantCard' ] );
		const oldPlantCard = ( mesh.asset.materials[ 2 ]!.map!.image as { data: Uint8Array } ).data.slice();
		const oldLod3Impostor = ( mesh.asset.materials[ 3 ]!.map!.image as { data: Uint8Array } ).data.slice();
		const oldLod4Impostor = ( mesh.asset.materials[ 4 ]!.map!.image as { data: Uint8Array } ).data.slice();
		mesh.setColor( 'petal', '#a98bd6' );
		const petalChangedPlantCard = ( mesh.asset.materials[ 2 ]!.map!.image as { data: Uint8Array } ).data.slice();
		const petalChangedLod3Impostor = ( mesh.asset.materials[ 3 ]!.map!.image as { data: Uint8Array } ).data.slice();
		const petalChangedLod4Impostor = ( mesh.asset.materials[ 4 ]!.map!.image as { data: Uint8Array } ).data.slice();
		mesh.setColor( 'stem', '#81603d' );
		expect( mesh.getColor( 'petal' ).getHex() ).toBe( 0xa98bd6 );
		expect( areByteIdentical( petalChangedPlantCard, oldPlantCard ) ).toBe( false );
		expect( areByteIdentical( ( mesh.asset.materials[ 2 ]!.map!.image as { data: Uint8Array } ).data, petalChangedPlantCard ) ).toBe( false );
		expect( areByteIdentical( petalChangedLod3Impostor, oldLod3Impostor ) ).toBe( false );
		expect( areByteIdentical( petalChangedLod4Impostor, oldLod4Impostor ) ).toBe( false );
		expect( mesh.asset.geometries.map( ( geometry ) => geometry.getAttribute( 'position' ).array ) ).toEqual( positions );

		const lod = FlowersMesh.createLOD( { seed: 6 } );
		expect( lod ).toBeInstanceOf( LOD );
		expect( lod.levels.map( ( level ) => ( level.object as FlowersMesh ).lod ) ).toEqual( [ 0, 1, 2, 3, 4 ] );
		for ( const level of lod.levels ) ( level.object as FlowersMesh ).dispose();
		mesh.dispose();

	} );

	it( 'builds a single-card allium LOD4 and orients its instances to the camera', () => {

		const mesh = new FlowersMesh( { seed: 3, variety: 'allium', lod: 4 } );
		const [ billboard ] = mesh.parts;
		expect( mesh.parts ).toHaveLength( 1 );
		expect( billboard!.geometry.getIndex()!.count ).toBe( 12 );
		expect( billboard!.geometry.getAttribute( 'impostorCard' ).array ).toEqual( new Float32Array( [ 0, 0, 0, 0 ] ) );
		expect( [ ...billboard!.geometry.getAttribute( 'uv' ).array ] ).toEqual( [ 0, 0, 1, 0, 1, 1, 0, 1 ] );
		expect( billboard!.material.side ).toBe( FrontSide );
		expect( mesh.asset.data.parts[ 3 ]!.impostorFade ).toBe( false );
		expect( mesh.asset.data.parts[ 4 ]!.upNormalCards ).toBe( true );
		expect( ( mesh.asset.materials[ 3 ]!.map!.image as { width: number } ).width ).toBe( 256 );
		expect( ( mesh.asset.materials[ 4 ]!.map!.image as { width: number } ).width ).toBe( 128 );

		const instances = new InstancedMesh( billboard!.geometry, billboard!.material, 1 );
		instances.setMatrixAt( 0, new Matrix4() );
		const camera = new PerspectiveCamera();
		camera.position.set( 1, 0, 0 );
		camera.updateMatrixWorld( true );
		orientBillboardInstances( instances, camera );
		const matrix = new Matrix4();
		instances.getMatrixAt( 0, matrix );
		const direction = new Vector3( 0, 0, 1 ).applyMatrix4( matrix );
		expect( direction.x ).toBeCloseTo( 1, 6 );
		expect( direction.z ).toBeCloseTo( 0, 6 );
		const shadowCamera = new PerspectiveCamera();
		shadowCamera.position.set( 1, 0, 0 );
		shadowCamera.updateMatrixWorld( true );
		billboard!.onBeforeShadow( null as never, null as never, shadowCamera, shadowCamera, billboard!.geometry, null as never, null as never );
		expect( billboard!.rotation.y ).toBeCloseTo( Math.PI / 2, 6 );
		instances.dispose();
		mesh.dispose();

	} );

	it( 'keeps primrose dome geometry single-sided through VegetationMesh', () => {

		for ( const lod of [ 2, 3 ] as const ) {
			const mesh = new FlowersMesh( { seed: 5, variety: 'primrose', lod } );
			const part = mesh.parts[ 0 ]!;
			const source = mesh.asset.getParts( lod )[ 0 ]!;
			const definition = mesh.asset.data.parts[ 2 ]!;
			expect( definition.doubleSided ).toBe( false );
			expect( definition.upNormalCards ).toBeUndefined();
			expect( part.geometry.getIndex()!.count ).toBe( source.geometry.getIndex()!.count );
			expect( part.material.side ).toBe( FrontSide );
			mesh.dispose();
		}

	} );

	it( 'duplicates split daisy impostor cards in both LOD3 and camera-facing LOD4', () => {

		for ( const lod of [ 3, 4 ] as const ) {
			const mesh = new FlowersMesh( { seed: 5, variety: 'daisy', lod } );
			const source = mesh.asset.getParts( lod )[ 0 ]!;
			const vertical = mesh.parts[ 0 ]!;
			const horizontal = mesh.parts[ 1 ]!;
			const indexedCardIds = ( part: Mesh ) => new Set( Array.from( part.geometry.getIndex()!.array, ( vertex ) => part.geometry.getAttribute( 'impostorCard' ).getX( vertex ) ) );

			expect( mesh.parts ).toHaveLength( 2 );
			expect( indexedCardIds( vertical ) ).toEqual( new Set( [ 0 ] ) );
			expect( indexedCardIds( horizontal ) ).toEqual( new Set( [ 1 ] ) );
			expect( vertical.geometry.getIndex()!.count ).toBe( lod === 3 ? 24 : 12 );
			expect( horizontal.geometry.getIndex()!.count ).toBe( 12 );
			expect( vertical.material ).toBe( horizontal.material );
			expect( vertical.material.side ).toBe( FrontSide );
			expect( vertical.material.customProgramCacheKey() ).not.toContain( 'vegetation-impostor-view-fade-v1' );
			expect( vertical.geometry.getIndex()!.count + horizontal.geometry.getIndex()!.count ).toBe( source.geometry.getIndex()!.count * 2 );
			mesh.dispose();
		}

	} );

	it( 'preserves impostor fade hooks when split flower cards use front-side materials', () => {

		const mesh = new FlowersMesh( { seed: 5, variety: 'bluebell', lod: 3 } );
		const [ vertical ] = mesh.parts;
		const shader = {
			vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
			fragmentShader: '#include <common>\n#include <alphatest_fragment>',
			uniforms: {},
		};

		expect( mesh.parts ).toHaveLength( 2 );
		expect( vertical!.material.side ).toBe( FrontSide );
		expect( vertical!.material.customProgramCacheKey() ).toContain( 'vegetation-impostor-view-fade-v1' );
		vertical!.material.onBeforeCompile( shader as never, undefined as never );
		expect( shader.fragmentShader ).toContain( 'impostorDither' );
		mesh.dispose();

	} );

	it( 'updates tulip plant-card texture when petal or stem colors change', () => {

		const mesh = new FlowersMesh( { seed: 6, variety: 'tulip', lod: 1 } );
		const plantCard = mesh.asset.materials[ 2 ]!.map!;
		const original = ( plantCard.image as { data: Uint8Array } ).data.slice();
		mesh.setColor( 'petal', '#a98bd6' );
		const petalChanged = ( plantCard.image as { data: Uint8Array } ).data.slice();
		mesh.setColor( 'stem', '#81603d' );
		const fresh = new FlowersMesh( { seed: 6, variety: 'tulip', petalColor: '#a98bd6', stemColor: '#81603d', lod: 1 } );

		expect( areByteIdentical( petalChanged, original ) ).toBe( false );
		expect( areByteIdentical( ( plantCard.image as { data: Uint8Array } ).data, ( fresh.asset.materials[ 2 ]!.map!.image as { data: Uint8Array } ).data ) ).toBe( true );
		expect( mesh.parts ).toHaveLength( 1 );
		expect( mesh.parts[ 0 ]!.material.side ).toBe( FrontSide );
		fresh.dispose();
		mesh.dispose();

	} );

	it( 'updates calla plant-card leaves and LOD3/4 impostors when petal or stem colors change', () => {

		const mesh = new FlowersMesh( { seed: 5, variety: 'calla', lod: 1 } );
		const plantCard = mesh.asset.materials[ 2 ]!.map!;
		const originalCard = ( plantCard.image as { data: Uint8Array } ).data.slice();
		const originalLod3 = ( mesh.asset.materials[ 3 ]!.map!.image as { data: Uint8Array } ).data.slice();
		const originalLod4 = ( mesh.asset.materials[ 4 ]!.map!.image as { data: Uint8Array } ).data.slice();
		mesh.setColor( 'petal', '#a98bd6' );
		const petalChangedCard = ( plantCard.image as { data: Uint8Array } ).data.slice();
		const petalChangedLod3 = ( mesh.asset.materials[ 3 ]!.map!.image as { data: Uint8Array } ).data.slice();
		const petalChangedLod4 = ( mesh.asset.materials[ 4 ]!.map!.image as { data: Uint8Array } ).data.slice();
		mesh.setColor( 'stem', '#81603d' );
		const fresh = new FlowersMesh( { seed: 5, variety: 'calla', petalColor: '#a98bd6', stemColor: '#81603d', lod: 1 } );

		expect( areByteIdentical( petalChangedCard, originalCard ) ).toBe( false );
		expect( areByteIdentical( petalChangedLod3, originalLod3 ) ).toBe( false );
		expect( areByteIdentical( petalChangedLod4, originalLod4 ) ).toBe( false );
		expect( areByteIdentical( ( plantCard.image as { data: Uint8Array } ).data, ( fresh.asset.materials[ 2 ]!.map!.image as { data: Uint8Array } ).data ) ).toBe( true );
		expect( areByteIdentical( ( mesh.asset.materials[ 3 ]!.map!.image as { data: Uint8Array } ).data, ( fresh.asset.materials[ 3 ]!.map!.image as { data: Uint8Array } ).data ) ).toBe( true );
		expect( areByteIdentical( ( mesh.asset.materials[ 4 ]!.map!.image as { data: Uint8Array } ).data, ( fresh.asset.materials[ 4 ]!.map!.image as { data: Uint8Array } ).data ) ).toBe( true );
		fresh.dispose();
		mesh.dispose();

	} );

	it( 'keeps poppy leaves out of LOD3/4 when petal color changes rebake the impostors', () => {

		const mesh = new FlowersMesh( { seed: 5, variety: 'poppy' } );
		const ranges = mesh.asset.data.parts[ 1 ]!.impostorBakeExcludeIndexRanges;
		const expected = prepareVegetationAsset( generateFlowersData( { seed: 5, variety: 'poppy', petalColor: 0xa98bd6 } ), {}, 128 );
		mesh.setColor( 'petal', '#a98bd6' );

		expect( mesh.asset.data.parts[ 1 ]!.impostorBakeExcludeIndexRanges ).toEqual( ranges );
		for ( const [ partIndex, textureName ] of [ [ 2, 'impostor-lod3' ], [ 3, 'impostor' ] ] as const ) {
			const image = mesh.asset.materials[ partIndex ]!.map!.image as { data: Uint8Array };
			expect( areByteIdentical( image.data, expected.impostorTextures[ textureName ]!.data ) ).toBe( true );
		}
		mesh.dispose();

	} );

	it( 'keeps asynchronous generation byte-identical when workers are unavailable', async () => {

		const originalWorker = globalThis.Worker;
		Object.defineProperty( globalThis, 'Worker', { configurable: true, value: undefined } );
		try {
			for ( const variety of [ 'allium', 'daisy', 'tulip', 'poppy', 'bluebell', 'calla', 'primrose' ] as const ) {
				const synchronous = generateFlowers( { seed: 11, variety, petalColor: '#a98bd6', centerColor: '#b9cf6a' } );
				const asynchronous = await generateFlowersAsync( { seed: 11, variety, petalColor: '#a98bd6', centerColor: '#b9cf6a' } );
				const colorPartIndex = variety === 'allium' ? 2 : 0;
				expect( areStructurallyByteIdentical( asynchronous.data, synchronous.data ) ).toBe( true );
				expect( areStructurallyByteIdentical( asynchronous.materials[ colorPartIndex ]!.map!.image, synchronous.materials[ colorPartIndex ]!.map!.image ) ).toBe( true );
				synchronous.dispose();
				asynchronous.dispose();
			}
		} finally {
			Object.defineProperty( globalThis, 'Worker', { configurable: true, value: originalWorker } );
		}

	}, 30000 );

	it( 'keeps generation, texture creation, and impostor baking under 50 ms per variety', () => {

		for ( const variety of [ 'allium', 'daisy', 'tulip', 'poppy', 'bluebell', 'calla', 'primrose' ] as const ) {
			const start = performance.now();
			const asset = generateFlowers( { seed: 1, variety } );
			const elapsed = performance.now() - start;
			console.log( `generateFlowers ${ variety }: ${ elapsed.toFixed( 2 ) } ms` );
			expect( elapsed ).toBeLessThan( 50 );
			asset.dispose();
		}

	} );

} );
