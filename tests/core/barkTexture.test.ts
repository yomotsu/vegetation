import { describe, expect, it } from 'vitest';
import { createBarkTexture } from '../../src/core';

describe( 'bark texture', () => {

	it( 'creates deterministic opaque olive-brown grain with subtle variation', () => {

		const first = createBarkTexture( 17 );
		const repeated = createBarkTexture( 17 );
		const other = createBarkTexture( 18 );
		const colors = new Set<string>();
		let redTotal = 0;
		let greenTotal = 0;
		let blueTotal = 0;
		let invalidAlphaPixels = 0;
		let invalidHuePixels = 0;

		expect( first.width ).toBe( 128 );
		expect( first.height ).toBe( 128 );
		expect( first.data ).toEqual( repeated.data );
		expect( first.data ).not.toEqual( other.data );

		for ( let i = 0; i < first.data.length; i += 4 ) {

			const red = first.data[ i ]!;
			const green = first.data[ i + 1 ]!;
			const blue = first.data[ i + 2 ]!;

			if ( first.data[ i + 3 ] !== 255 ) invalidAlphaPixels ++;
			if ( red <= green || green <= blue ) invalidHuePixels ++;
			colors.add( `${ red },${ green },${ blue }` );
			redTotal += red;
			greenTotal += green;
			blueTotal += blue;

		}

		expect( invalidAlphaPixels ).toBe( 0 );
		expect( invalidHuePixels ).toBe( 0 );
		expect( colors.size ).toBeGreaterThan( 100 );
		expect( redTotal / ( first.width * first.height ) ).toBeGreaterThan( 60 );
		expect( redTotal / ( first.width * first.height ) ).toBeLessThan( 85 );
		expect( greenTotal / ( first.width * first.height ) ).toBeGreaterThan( 45 );
		expect( greenTotal / ( first.width * first.height ) ).toBeLessThan( 70 );
		expect( blueTotal / ( first.width * first.height ) ).toBeGreaterThan( 20 );
		expect( blueTotal / ( first.width * first.height ) ).toBeLessThan( 40 );

	} );

	it( 'repeats the same pixels for a fixed seed', () => {

		expect( createBarkTexture( 73 ).data ).toEqual( createBarkTexture( 73 ).data );

	} );

	it( 'keeps knots as broad marks without repeated concentric rings', () => {

		const texture = createBarkTexture( 17 );
		const radii: number[] = [];
		const centerX = texture.width * 0.24;
		const centerY = texture.height * 0.32;

		for ( let step = 0; step <= 36; step ++ ) {

			const radius = step / 12;
			let total = 0;

			for ( let angle = 0; angle < 24; angle ++ ) {

				const theta = angle / 24 * Math.PI * 2;
				const x = Math.round( centerX + Math.cos( theta ) * radius * texture.width * 0.055 );
				const y = Math.round( centerY + Math.sin( theta ) * radius * texture.height * 0.16 );
				const offset = ( ( y + texture.height ) % texture.height * texture.width + ( x + texture.width ) % texture.width ) * 4;

				total += texture.data[ offset ]! * 0.2126 + texture.data[ offset + 1 ]! * 0.7152 + texture.data[ offset + 2 ]! * 0.0722;

			}

			radii.push( total / 24 );

		}

		let rings = 0;

		for ( let i = 1; i < radii.length - 1; i ++ ) {

			const before = radii[ i - 1 ]!;
			const current = radii[ i ]!;
			const after = radii[ i + 1 ]!;

			if ( current > before + 1.5 && current > after + 1.5 ) rings ++;
			if ( current < before - 1.5 && current < after - 1.5 ) rings ++;

		}

		expect( rings ).toBeLessThan( 5 );

	} );

	it( 'accepts a positive explicit texture size', () => {

		const texture = createBarkTexture( 9, 64 );

		expect( texture.width ).toBe( 64 );
		expect( texture.height ).toBe( 64 );
		expect( texture.data ).toHaveLength( 64 * 64 * 4 );
		expect( () => createBarkTexture( 9, 0 ) ).toThrow( RangeError );

	} );

} );
