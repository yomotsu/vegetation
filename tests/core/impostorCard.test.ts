import { describe, expect, it } from 'vitest';
import { generateTreeData } from '../../src/core';

describe( 'impostor card ids', () => {

	it( 'marks the LOD4 side and top cards in core geometry', () => {

		const mesh = generateTreeData( { seed: 1 } ).lods[ 4 ]!;

		expect( mesh.impostorCard.slice( 0, 4 ) ).toEqual( new Float32Array( [ 0, 0, 0, 0 ] ) );
		expect( mesh.impostorCard.slice( 4 ) ).toEqual( new Float32Array( [ 1, 1, 1, 1 ] ) );

	} );

	it( 'adds a top-view card to tree LOD3 at one quarter height', () => {

		const data = generateTreeData( { seed: 1 } );
		const mesh = data.lods[ 3 ]!;

		expect( mesh.indices.length / 3 ).toBe( 14 );
		expect( mesh.groups ).toEqual( [ { start: 0, count: 42, partIndex: 2 } ] );
		expect( mesh.impostorCard.filter( ( card ) => card === 0 ) ).toHaveLength( 24 );
		expect( mesh.impostorCard.filter( ( card ) => card === 1 ) ).toHaveLength( 4 );
		expect( Math.min( ...Array.from( mesh.positions ).filter( ( _, index ) => index % 3 === 1 ).slice( - 4 ) ) ).toBeCloseTo( data.bounds.height * 0.25 );
		expect( data.lods[ 2 ]!.indices.length / 3 ).toBeGreaterThan( mesh.indices.length / 3 );
		expect( mesh.indices.length / 3 ).toBeGreaterThan( data.lods[ 4 ]!.indices.length / 3 );

	} );

} );
