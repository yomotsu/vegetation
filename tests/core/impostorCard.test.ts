import { describe, expect, it } from 'vitest';
import { generateFirTreeData } from '../../src/core/trees/fir';

describe( 'impostor card ids', () => {

	it( 'marks the LOD4 side and top cards in core geometry', () => {

		const mesh = generateFirTreeData( { seed: 1 } ).lods[ 4 ]!;

		expect( mesh.impostorCard.slice( 0, 4 ) ).toEqual( new Float32Array( [ 0, 0, 0, 0 ] ) );
		expect( mesh.impostorCard.slice( 4 ) ).toEqual( new Float32Array( [ 1, 1, 1, 1 ] ) );

	} );

} );
