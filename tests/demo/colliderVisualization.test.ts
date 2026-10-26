import { MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { createColliderMaterialController } from '../../demo/colliderVisualization';

describe( 'demo collider visualization', () => {

	it( 'makes shared part materials transparent and restores their original settings', () => {

		const leaves = new MeshStandardMaterial( { alphaTest: 0.42, transparent: true, opacity: 0.78, depthWrite: true } );
		const bark = new MeshStandardMaterial( { transparent: false, opacity: 1, depthWrite: true } );
		const controller = createColliderMaterialController();
		const originalVersions = [ leaves.version, bark.version ];

		controller.show( [ leaves, bark, leaves ], 0.35 );

		expect( leaves.transparent ).toBe( true );
		expect( leaves.opacity ).toBe( 0.35 );
		expect( leaves.depthWrite ).toBe( false );
		expect( leaves.alphaTest ).toBeCloseTo( 0.42 * 0.35 / 0.78 );
		expect( bark.transparent ).toBe( true );
		expect( bark.opacity ).toBe( 0.35 );
		expect( bark.depthWrite ).toBe( false );
		expect( leaves.version ).toBeGreaterThan( originalVersions[ 0 ]! );
		expect( bark.version ).toBeGreaterThan( originalVersions[ 1 ]! );

		const visibleVersions = [ leaves.version, bark.version ];
		controller.restore();

		expect( leaves.transparent ).toBe( true );
		expect( leaves.opacity ).toBe( 0.78 );
		expect( leaves.depthWrite ).toBe( true );
		expect( leaves.alphaTest ).toBe( 0.42 );
		expect( bark.transparent ).toBe( false );
		expect( bark.opacity ).toBe( 1 );
		expect( bark.depthWrite ).toBe( true );
		expect( leaves.version ).toBeGreaterThan( visibleVersions[ 0 ]! );
		expect( bark.version ).toBeGreaterThan( visibleVersions[ 1 ]! );

		leaves.dispose();
		bark.dispose();

	} );

} );
