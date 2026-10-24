import {
	ACESFilmicToneMapping,
	Color,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PCFShadowMap,
	PlaneGeometry,
	SRGBColorSpace,
} from 'three';
import { describe, expect, it } from 'vitest';
import { configurePreviewRenderer, createPreviewScene, createWebGpuShadowProxy, setPreviewShadowFlags } from '../../demo/rendering';
import type { PreviewRenderer } from '../../demo/rendering';

describe( 'demo rendering', () => {

	it( 'applies one renderer configuration for tone, color, exposure, and shadows', () => {

		const renderer = {
			outputColorSpace: '',
			toneMapping: 0,
			toneMappingExposure: 0,
			shadowMap: { enabled: false, type: 0 },
		} as PreviewRenderer;

		configurePreviewRenderer( renderer );

		expect( renderer.outputColorSpace ).toBe( SRGBColorSpace );
		expect( renderer.toneMapping ).toBe( ACESFilmicToneMapping );
		expect( renderer.toneMappingExposure ).toBe( 1.05 );
		expect( renderer.shadowMap ).toEqual( { enabled: true, type: PCFShadowMap } );

	} );

	it( 'uses matching sky and fog colors with shared demo lighting and shadow camera settings', () => {

		const { scene, ground, hemisphere, sunlight } = createPreviewScene();

		expect( ( scene.background as Color ).getHexString() ).toBe( 'c8e0e9' );
		expect( scene.fog?.color.getHexString() ).toBe( 'c8e0e9' );
		expect( ground.receiveShadow ).toBe( true );
		expect( ground.material ).toBeInstanceOf( MeshStandardMaterial );
		expect( hemisphere.color.getHexString() ).toBe( 'e7f5ff' );
		expect( hemisphere.groundColor.getHexString() ).toBe( '637044' );
		expect( hemisphere.intensity ).toBe( 1.8 );
		expect( sunlight.color.getHexString() ).toBe( 'fff1d6' );
		expect( sunlight.intensity ).toBe( 3.2 );
		expect( sunlight.position.toArray() ).toEqual( [ - 12, 22, 12 ] );
		expect( sunlight.castShadow ).toBe( true );
		expect( sunlight.shadow.mapSize.toArray() ).toEqual( [ 2048, 2048 ] );
		expect( sunlight.shadow.camera.left ).toBe( - 42 );
		expect( sunlight.shadow.camera.right ).toBe( 42 );
		expect( sunlight.shadow.camera.top ).toBe( 42 );
		expect( sunlight.shadow.camera.bottom ).toBe( - 42 );
		expect( sunlight.shadow.camera.near ).toBe( 0.5 );
		expect( sunlight.shadow.camera.far ).toBe( 90 );
		expect( sunlight.shadow.bias ).toBe( - 0.00025 );
		expect( sunlight.shadow.normalBias ).toBe( 0.025 );
		expect( sunlight.shadow.radius ).toBe( 3 );
		expect( sunlight.shadow.autoUpdate ).toBe( false );
		expect( sunlight.shadow.needsUpdate ).toBe( true );

	} );

	it( 'enables both shadow casting and receiving on preview meshes', () => {

		const mesh = new Mesh( new PlaneGeometry(), new MeshStandardMaterial() );

		setPreviewShadowFlags( mesh );

		expect( mesh.castShadow ).toBe( true );
		expect( mesh.receiveShadow ).toBe( true );

		mesh.geometry.dispose();
		mesh.material.dispose();

	} );

	it( 'creates a single-material caster proxy without changing the source geometry', () => {

		const mesh = new Mesh( new PlaneGeometry(), new MeshStandardMaterial() );
		mesh.geometry.addGroup( 0, 6, 0 );
		setPreviewShadowFlags( mesh );
		mesh.position.set( 1, 2, 3 );
		mesh.rotation.y = 0.5;
		mesh.scale.set( 2, 3, 4 );

		const proxy = createWebGpuShadowProxy( mesh );
		const material = proxy.material as MeshBasicMaterial;

		expect( proxy.geometry ).not.toBe( mesh.geometry );
		expect( proxy.geometry.groups ).toEqual( [] );
		expect( mesh.geometry.groups ).toHaveLength( 1 );
		expect( mesh.castShadow ).toBe( false );
		expect( mesh.receiveShadow ).toBe( true );
		expect( proxy.position.toArray() ).toEqual( [ 1, 2, 3 ] );
		expect( proxy.rotation.y ).toBe( 0.5 );
		expect( proxy.scale.toArray() ).toEqual( [ 2, 3, 4 ] );
		expect( proxy.castShadow ).toBe( true );
		expect( proxy.receiveShadow ).toBe( false );
		expect( material.colorWrite ).toBe( false );
		expect( material.depthWrite ).toBe( false );

		proxy.geometry.dispose();
		material.dispose();
		mesh.geometry.dispose();
		( mesh.material as MeshStandardMaterial ).dispose();

	} );

} );
