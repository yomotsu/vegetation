import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>( '../../src/core/**/*.ts', {
	eager: true,
	query: '?raw',
	import: 'default',
} );

describe( 'core purity', () => {

	it( 'does not import three', () => {

		const files = Object.keys( sources );

		expect( files.length ).toBeGreaterThan( 0 );

		for ( const file of files ) {

			const source = sources[ file ];

			expect( source, file ).not.toMatch( /\bfrom\s+['"]three['"]/ );

		}

	} );

} );
