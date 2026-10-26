import { describe, expect, it } from 'vitest';
import { createBarkTexture, DEFAULT_BARK_COLOR } from '../../src/core/barkTexture';
import { hexToLinear, linearToSrgbByte } from '../../src/core/color';

describe( 'bark texture', () => {

	it( 'creates deterministic opaque gray-ish grain for a brown material tint', () => {

		const first = createBarkTexture( 17 );
		const repeated = createBarkTexture( 17 );
		const other = createBarkTexture( 18 );
		const colors = new Set<string>();
		let redTotal = 0;
		let greenTotal = 0;
		let blueTotal = 0;
		let invalidAlphaPixels = 0;
		let channelRangeTotal = 0;

		expect( first.width ).toBe( 128 );
		expect( first.height ).toBe( 128 );
		expect( first.data ).toEqual( repeated.data );
		expect( first.data ).not.toEqual( other.data );

		for ( let i = 0; i < first.data.length; i += 4 ) {

			const red = first.data[ i ]!;
			const green = first.data[ i + 1 ]!;
			const blue = first.data[ i + 2 ]!;

			if ( first.data[ i + 3 ] !== 255 ) {

				invalidAlphaPixels ++;

			}
			channelRangeTotal += Math.max( red, green, blue ) - Math.min( red, green, blue );
			colors.add( `${ red },${ green },${ blue }` );
			redTotal += red;
			greenTotal += green;
			blueTotal += blue;

		}

		expect( invalidAlphaPixels ).toBe( 0 );
		expect( colors.size ).toBeGreaterThan( 100 );
		expect( Math.max( redTotal, greenTotal, blueTotal ) - Math.min( redTotal, greenTotal, blueTotal ) ).toBeLessThan( first.width * first.height * 30 );
		expect( channelRangeTotal / ( first.width * first.height ) ).toBeLessThan( 35 );

	} );

	it( 'preserves the previous bark appearance with the default brown tint', () => {

		const texture = createBarkTexture( 17 );
		const tint = hexToLinear( DEFAULT_BARK_COLOR );
		const samples = [
			{ x: 0, y: 0, color: [ 78, 61, 34 ] },
			{ x: 1, y: 0, color: [ 66, 51, 26 ] },
			{ x: 64, y: 64, color: [ 67, 52, 27 ] },
			{ x: 23, y: 17, color: [ 81, 64, 36 ] },
			{ x: 127, y: 127, color: [ 75, 59, 32 ] },
			{ x: 12, y: 90, color: [ 52, 39, 18 ] },
			{ x: 100, y: 10, color: [ 68, 53, 28 ] },
			{ x: 24, y: 32, color: [ 71, 56, 30 ] },
			{ x: 91, y: 12, color: [ 65, 50, 26 ] },
			{ x: 80, y: 76, color: [ 79, 62, 34 ] },
			{ x: 83, y: 91, color: [ 99, 79, 47 ] },
		];

		for ( const sample of samples ) {

			const offset = ( sample.y * texture.width + sample.x ) * 4;

			for ( let channel = 0; channel < 3; channel ++ ) {

				const value = texture.data[ offset + channel ]! / 255;
				const linear = value <= 0.04045 ? value / 12.92 : ( ( value + 0.055 ) / 1.055 ) ** 2.4;
				const rendered = linearToSrgbByte( linear * tint[ channel ]! );

				expect( Math.abs( rendered - sample.color[ channel ]! ) ).toBeLessThanOrEqual( 3 );

			}

		}

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

			if ( current > before + 1.5 && current > after + 1.5 ) {

				rings ++;

			}
			if ( current < before - 1.5 && current < after - 1.5 ) {

				rings ++;

			}

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
