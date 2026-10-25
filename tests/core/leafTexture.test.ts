import { describe, expect, it } from 'vitest';
import { createBarkTexture, createFirSprigTexture } from '../../src/core';
import { getFirSprigNeedleGeometry } from '../../src/core/leafTexture';

function alphaAt( texture: { width: number; data: Uint8Array }, x: number, y: number ): number {

	return texture.data[ ( y * texture.width + x ) * 4 + 3 ]!;

}

function meanNeedleMidWidth( needles: ReturnType<typeof getFirSprigNeedleGeometry> ): number {

	return needles.reduce( ( total, needle ) => total + needle.midWidth, 0 ) / needles.length;

}

function isBrownStemPixel( texture: { width: number; data: Uint8Array }, x: number, y: number ): boolean {

	const offset = ( y * texture.width + x ) * 4;

	return texture.data[ offset + 3 ]! >= 128 && texture.data[ offset ]! > texture.data[ offset + 1 ]! + 2 && texture.data[ offset + 1 ]! > texture.data[ offset + 2 ]! * 1.5;

}

function brownStemWidthAt( texture: { width: number; height: number; data: Uint8Array }, seed: number, y: number ): number {

	const sourceY = texture.height - y - 1;
	const center = Math.round( texture.height * 0.5 + Math.sin( sourceY / texture.height * Math.PI * 1.3 + seed * 0.37 ) * texture.height * 0.009 );
	let width = 0;

	for ( let x = center - 6; x <= center + 6; x ++ ) {

		if ( isBrownStemPixel( texture, x, y ) ) width ++;

	}

	return width;

}

function meanStemColorAtBase( texture: { width: number; height: number; data: Uint8Array }, seed: number ): [ number, number, number ] {

	const channels = [ 0, 0, 0 ];
	let count = 0;

	for ( let y = 4; y <= 12; y ++ ) {

		const sourceY = texture.height - y - 1;
		const center = Math.round( texture.height * 0.5 + Math.sin( sourceY / texture.height * Math.PI * 1.3 + seed * 0.37 ) * texture.height * 0.009 );

		for ( let x = center - 8; x <= center + 8; x ++ ) {

			if ( ! isBrownStemPixel( texture, x, y ) ) continue;

			const offset = ( y * texture.width + x ) * 4;

			for ( let channel = 0; channel < 3; channel ++ ) channels[ channel ]! += texture.data[ offset + channel ]!;
			count ++;

		}

	}

	return channels.map( ( channel ) => channel / count ) as [ number, number, number ];

}

function meanBarkColor( texture: { width: number; height: number; data: Uint8Array } ): [ number, number, number ] {

	const channels = [ 0, 0, 0 ];
	const pixelCount = texture.width * texture.height;

	for ( let offset = 0; offset < texture.data.length; offset += 4 ) {

		for ( let channel = 0; channel < 3; channel ++ ) channels[ channel ]! += texture.data[ offset + channel ]!;

	}

	return channels.map( ( channel ) => channel / pixelCount ) as [ number, number, number ];

}

function meanNeedleDirectionAngle( texture: { width: number; height: number; data: Uint8Array }, startY: number, endY: number ): number {

	const tileWidth = texture.width / 3;
	const center = tileWidth * 0.5;
	let horizontalGradientEnergy = 0;
	let verticalGradientEnergy = 0;

	for ( let y = startY; y < endY; y ++ ) {
		for ( let x = 1; x < tileWidth - 1; x ++ ) {

			if ( Math.abs( x - center ) < 7 ) continue;

			const horizontalGradient = alphaAt( texture, x + 1, y ) - alphaAt( texture, x - 1, y );
			const verticalGradient = alphaAt( texture, x, y + 1 ) - alphaAt( texture, x, y - 1 );

			horizontalGradientEnergy += horizontalGradient * horizontalGradient;
			verticalGradientEnergy += verticalGradient * verticalGradient;

		}
	}

	return Math.atan2( Math.sqrt( verticalGradientEnergy ), Math.sqrt( horizontalGradientEnergy ) ) * 180 / Math.PI;

}

function alphaCoverage( texture: { width: number; height: number; data: Uint8Array }, xOffset: number, width: number ): number {

	let covered = 0;

	for ( let y = 0; y < texture.height; y ++ ) {

		for ( let x = xOffset; x < xOffset + width; x ++ ) {

			if ( alphaAt( texture, x, y ) >= 128 ) covered ++;

		}

	}

	return covered / ( width * texture.height );

}

function rowWidth( texture: { width: number; data: Uint8Array }, xOffset: number, y: number, width: number ): number {

	let count = 0;

	for ( let x = xOffset; x < xOffset + width; x ++ ) {

		if ( alphaAt( texture, x, y ) >= 128 ) count ++;

	}

	return count;

}

function opaqueChannelValues( texture: { width: number; height: number; data: Uint8Array }, channel: number ): number[] {

	const tileWidth = texture.width / 3;
	const values: number[] = [];

	for ( let y = 0; y < texture.height; y ++ ) {
		for ( let x = 0; x < tileWidth; x ++ ) {
			const offset = ( y * texture.width + x ) * 4;

			if ( texture.data[ offset + 3 ]! < 128 ) continue;

			if ( channel === 3 ) {
				values.push( Math.round( 0.2126 * texture.data[ offset ]! + 0.7152 * texture.data[ offset + 1 ]! + 0.0722 * texture.data[ offset + 2 ]! ) );
			} else {
				values.push( texture.data[ offset + channel ]! );
			}

		}
	}

	return values;

}

function opaqueNeighborGradientValues( texture: { width: number; height: number; data: Uint8Array } ): number[] {

	const tileWidth = texture.width / 3;
	const values: number[] = [];

	for ( let y = 0; y < texture.height; y ++ ) {

		for ( let x = 0; x < tileWidth; x ++ ) {

			const offset = ( y * texture.width + x ) * 4;

			if ( texture.data[ offset + 3 ]! < 128 ) continue;

			const luminance = 0.2126 * texture.data[ offset ]! + 0.7152 * texture.data[ offset + 1 ]! + 0.0722 * texture.data[ offset + 2 ]!;

			for ( const [ dx, dy ] of [ [ 1, 0 ], [ 0, 1 ] ] ) {

				const neighborX = x + dx!;
				const neighborY = y + dy!;

				if ( neighborX >= tileWidth || neighborY >= texture.height ) continue;

				const neighborOffset = ( neighborY * texture.width + neighborX ) * 4;

				if ( texture.data[ neighborOffset + 3 ]! < 128 ) continue;

				const neighborLuminance = 0.2126 * texture.data[ neighborOffset ]! + 0.7152 * texture.data[ neighborOffset + 1 ]! + 0.0722 * texture.data[ neighborOffset + 2 ]!;

				values.push( Math.abs( neighborLuminance - luminance ) );

			}

		}

	}

	return values;

}

function meanOpaqueLuminanceInColumnRange( texture: { width: number; height: number; data: Uint8Array }, startX: number, endX: number ): number {

	const values: number[] = [];

	for ( let y = 20; y < texture.height - 20; y ++ ) {

		for ( let x = startX; x < endX; x ++ ) {

			const offset = ( y * texture.width + x ) * 4;

			if ( texture.data[ offset + 3 ]! < 128 ) continue;

			values.push( 0.2126 * texture.data[ offset ]! + 0.7152 * texture.data[ offset + 1 ]! + 0.0722 * texture.data[ offset + 2 ]! );

		}

	}

	return values.reduce( ( total, value ) => total + value, 0 ) / values.length;

}

function opaqueRowLuminance( texture: { width: number; data: Uint8Array }, y: number, startX: number, endX: number ): number | null {

	let total = 0;
	let count = 0;

	for ( let x = startX; x < endX; x ++ ) {

		const offset = ( y * texture.width + x ) * 4;

		if ( texture.data[ offset + 3 ]! < 128 ) continue;

		total += 0.2126 * texture.data[ offset ]! + 0.7152 * texture.data[ offset + 1 ]! + 0.0722 * texture.data[ offset + 2 ]!;
		count ++;

	}

	return count === 0 ? null : total / count;

}

function meanGreenRowColor( texture: { width: number; height: number; data: Uint8Array }, v: number ): [ number, number, number ] | null {

	const centerY = Math.round( v * ( texture.height - 1 ) );
	const firstY = Math.max( 0, centerY - 1 );
	const lastY = Math.min( texture.height - 1, centerY + 1 );
	const totals = [ 0, 0, 0 ];
	let count = 0;

	for ( let y = firstY; y <= lastY; y ++ ) {

		for ( let x = 0; x < texture.width / 3; x ++ ) {

			const offset = ( y * texture.width + x ) * 4;
			const red = texture.data[ offset ]!;
			const green = texture.data[ offset + 1 ]!;
			const blue = texture.data[ offset + 2 ]!;

			if ( texture.data[ offset + 3 ]! < 128 || green <= red || green <= blue ) continue;

			for ( let channel = 0; channel < 3; channel ++ ) totals[ channel ]! += texture.data[ offset + channel ]!;
			count ++;

		}

	}

	return count === 0 ? null : totals.map( ( total ) => total / count ) as [ number, number, number ];

}

function percentile( values: number[], fraction: number ): number {

	const sorted = [ ...values ].sort( ( a, b ) => a - b );

	return sorted[ Math.round( ( sorted.length - 1 ) * fraction ) ]!;

}

describe( 'fir sprig texture', () => {

	it( 'creates a deterministic atlas with a fir sprig, needles, and a green midrib', () => {

		const first = createFirSprigTexture( 42 );
		const second = createFirSprigTexture( 42 );
		const otherSeed = createFirSprigTexture( 43 );
		const tileWidth = first.width / 3;
		let opaquePixels = 0;
		let sprigOpaquePixels = 0;
		let greenPixels = 0;
		let brownPixels = 0;
		let redTotal = 0;
		let greenTotal = 0;
		let blueTotal = 0;
		let invalidAlphaPixels = 0;

		expect( first.width ).toBe( 768 );
		expect( first.height ).toBe( 256 );
		expect( first.data ).toEqual( second.data );
		expect( first.data ).not.toEqual( otherSeed.data );
		for ( let y = 0; y < first.height; y ++ ) {

			for ( let x = 0; x < first.width; x ++ ) {

				const offset = ( y * first.width + x ) * 4;
				const red = first.data[ offset ]!;
				const green = first.data[ offset + 1 ]!;
				const blue = first.data[ offset + 2 ]!;
				const alpha = first.data[ offset + 3 ]!;

				if ( alpha !== 0 && alpha !== 255 ) invalidAlphaPixels ++;

				if ( alpha === 255 ) {

					opaquePixels ++;
					if ( x < tileWidth ) {

						sprigOpaquePixels ++;
						redTotal += red;
						greenTotal += green;
						blueTotal += blue;

					}

				}

				if ( x < tileWidth && alpha === 255 && green > red && green > blue ) greenPixels ++;
				if ( x < tileWidth && alpha === 255 && red > green && green > blue ) brownPixels ++;

			}

		}

		expect( invalidAlphaPixels ).toBeGreaterThan( 0 );
		expect( opaquePixels ).toBe( sprigOpaquePixels );
		expect( sprigOpaquePixels / ( tileWidth * first.height ) ).toBeGreaterThan( 0.2 );
		expect( greenPixels ).toBeGreaterThan( 1000 );
		expect( brownPixels ).toBeGreaterThan( 50 );
		expect( alphaCoverage( first, 0, tileWidth ) ).toBeGreaterThan( 0.18 );
		expect( alphaCoverage( first, 0, tileWidth ) ).toBeLessThan( 0.5 );
		expect( alphaCoverage( first, tileWidth, tileWidth ) ).toBe( 0 );
		expect( alphaCoverage( first, tileWidth * 2, tileWidth ) ).toBe( 0 );
		expect( redTotal / sprigOpaquePixels ).toBeLessThan( 5 );
		expect( greenTotal / sprigOpaquePixels ).toBeGreaterThan( 50 );
		expect( greenTotal / sprigOpaquePixels ).toBeLessThan( 110 );
		expect( blueTotal / sprigOpaquePixels ).toBeLessThan( 20 );

	} );

	it( 'stores the sprig base at v=0 and narrows toward its tip', () => {

		const texture = createFirSprigTexture( 7 );
		const tileWidth = texture.width / 3;
		const baseRow = rowWidth( texture, 0, 13, tileWidth );
		const middleRow = rowWidth( texture, 0, 128, tileWidth );
		const tipRow = rowWidth( texture, 0, 3, tileWidth );
		expect( baseRow ).toBeGreaterThan( 0 );
		expect( middleRow ).toBeGreaterThan( baseRow );
		expect( tipRow ).toBeLessThan( middleRow );

	} );

	it( 'draws a narrow brown stem along the center from mid-sprig to base', () => {

		const seed = 1;
		const texture = createFirSprigTexture( seed );

		for ( const y of [ 136, 152, 168, 184, 200 ] ) {

			const center = Math.round( texture.height * 0.5 + Math.sin( y / texture.height * Math.PI * 1.3 + seed * 0.37 ) * texture.height * 0.009 );
			const brownPixels: number[] = [];

			for ( let x = center - 4; x <= center + 4; x ++ ) {

				const offset = ( y * texture.width + x ) * 4;

				if ( ! isBrownStemPixel( texture, x, y ) ) continue;

				brownPixels.push( x );

			}

			expect( brownPixels.length ).toBeGreaterThan( 0 );
			expect( brownPixels.length ).toBeLessThanOrEqual( 4 );

		}

	} );

	it( 'keeps the stem opaque at the v=0 base edge', () => {

		const seed = 1;
		const texture = createFirSprigTexture( seed );

		for ( let y = 0; y < 5; y ++ ) {

			const sourceY = texture.height - y - 1;
			const center = Math.round( texture.height * 0.5 + Math.sin( sourceY / texture.height * Math.PI * 1.3 + seed * 0.37 ) * texture.height * 0.009 );
			expect( alphaAt( texture, center, y ) ).toBeGreaterThanOrEqual( 128 );

		}

	} );

	it( 'tapers the brown stem away from its thick base', () => {

		const seed = 1;
		const texture = createFirSprigTexture( seed );
		const baseWidth = brownStemWidthAt( texture, seed, 8 );
		const upperWidth = brownStemWidthAt( texture, seed, 128 );

		expect( baseWidth ).toBeGreaterThan( upperWidth );
		expect( baseWidth ).toBeGreaterThanOrEqual( 2 );

	} );

	it( 'matches the trunk brown and doubles the stem width at v=0', () => {

		const seed = 1;
		const texture = createFirSprigTexture( seed );
		const trunkColor = meanBarkColor( createBarkTexture( seed ) );
		const stemColor = meanStemColorAtBase( texture, seed );
		const baseWidth = brownStemWidthAt( texture, seed, 8 );
		const upperWidth = brownStemWidthAt( texture, seed, 128 );

		expect( baseWidth ).toBeGreaterThanOrEqual( 8 );
		expect( baseWidth ).toBeGreaterThan( upperWidth );

		for ( let channel = 0; channel < 3; channel ++ ) {

			expect( Math.abs( stemColor[ channel ]! - trunkColor[ channel ]! ) ).toBeLessThanOrEqual( 8 );

		}

	} );

	it( 'ends the stem before the needle-only tip', () => {

		const seed = 1;
		const texture = createFirSprigTexture( seed );
		const tipEnd = Math.ceil( texture.height * 0.18 );
		let brownTipPixels = 0;
		let needleTipPixels = 0;

		for ( let y = texture.height - tipEnd; y < texture.height; y ++ ) {

			const sourceY = texture.height - y - 1;
			const center = Math.round( texture.height * 0.5 + Math.sin( sourceY / texture.height * Math.PI * 1.3 + seed * 0.37 ) * texture.height * 0.009 );

			for ( let x = center - 8; x <= center + 8; x ++ ) {

				if ( isBrownStemPixel( texture, x, y ) ) brownTipPixels ++;
				if ( alphaAt( texture, x, y ) >= 128 && ! isBrownStemPixel( texture, x, y ) ) needleTipPixels ++;

			}

		}

		expect( brownTipPixels ).toBe( 0 );
		expect( needleTipPixels ).toBeGreaterThan( 0 );
		expect( rowWidth( texture, 0, texture.height - tipEnd + 4, texture.width / 3 ) ).toBeGreaterThan( 0 );

	} );

	it( 'sweeps every needle toward the tip and aligns them progressively', () => {

		const needles = getFirSprigNeedleGeometry( 1 );
		const meanAngle = ( start: number, end: number ): number => {

			const samples = needles.filter( needle => needle.v >= start && needle.v < end );

			return samples.reduce( ( total, needle ) => total + needle.angle, 0 ) / samples.length;

		};
		const bands = [ [ 0.05, 0.2 ], [ 0.2, 0.4 ], [ 0.4, 0.6 ], [ 0.6, 0.8 ], [ 0.8, 0.95 ] ];
		const bandAngles = bands.map( band => meanAngle( band[ 0 ]!, band[ 1 ]! ) );

		expect( needles.length ).toBeGreaterThan( 50 );
		expect( needles.every( needle => needle.tipward >= 0 ) ).toBe( true );
		expect( needles.every( needle => needle.endAngle < needle.startAngle ) ).toBe( true );
		expect( bandAngles[ 0 ] ).toBeGreaterThanOrEqual( 65 );
		expect( bandAngles[ 0 ] ).toBeLessThanOrEqual( 75 );
		expect( bandAngles[ 4 ] ).toBeGreaterThanOrEqual( 10 );
		expect( bandAngles[ 4 ] ).toBeLessThanOrEqual( 20 );
		for ( let index = 1; index < bandAngles.length; index ++ ) {

			expect( bandAngles[ index ] ).toBeLessThan( bandAngles[ index - 1 ]! );

		}

	} );

	it( 'ends the stem between 75% and 85% of the base-to-tip length', () => {

		const texture = createFirSprigTexture( 1 );
		let lastStemRow = - 1;

		for ( let y = 0; y < texture.height; y ++ ) {

			const center = Math.round( texture.height * 0.5 + Math.sin( ( texture.height - y - 1 ) / texture.height * Math.PI * 1.3 + 0.37 ) * texture.height * 0.009 );

			for ( let x = center - 6; x <= center + 6; x ++ ) {

				if ( isBrownStemPixel( texture, x, y ) ) lastStemRow = y;

			}

		}

		expect( lastStemRow / texture.height ).toBeGreaterThanOrEqual( 0.75 );
		expect( lastStemRow / texture.height ).toBeLessThanOrEqual( 0.85 );

	} );

	it( 'turns needle directions toward the tip from base to tip', () => {

		const texture = createFirSprigTexture( 1 );
		const baseAngle = meanNeedleDirectionAngle( texture, 34, 80 );
		const tipAngle = meanNeedleDirectionAngle( texture, 176, 222 );

		expect( tipAngle ).toBeLessThan( baseAngle - 8 );

	} );

	it( 'keeps a dense needle mask similar to the Tree01 albedo', () => {

		const texture = createFirSprigTexture( 1 );
		const tileWidth = texture.width / 3;
		const coverage = alphaCoverage( texture, 0, tileWidth );

		expect( coverage ).toBeGreaterThan( 0.26 );
		expect( coverage ).toBeLessThan( 0.34 );

	} );

	it( 'widens the nominal mean needle mid-width by about 1.45x from the previous texture', () => {

		const needles = getFirSprigNeedleGeometry( 1 );
		const previousMeanWidth = 6.05;
		const widthRatio = meanNeedleMidWidth( needles ) / previousMeanWidth;

		expect( widthRatio ).toBeGreaterThanOrEqual( 1.4 );
		expect( widthRatio ).toBeLessThanOrEqual( 1.55 );

	} );

	it( 'matches the Tree01 opaque texel hue and value distribution', () => {

		const texture = createFirSprigTexture( 1 );
		const red = opaqueChannelValues( texture, 0 );
		const green = opaqueChannelValues( texture, 1 );
		const blue = opaqueChannelValues( texture, 2 );
		const luminance = opaqueChannelValues( texture, 3 );
		const mean = ( values: number[] ): number => values.reduce( ( total, value ) => total + value, 0 ) / values.length;

		expect( mean( red ) ).toBeLessThanOrEqual( 5 );
		expect( mean( green ) ).toBeGreaterThanOrEqual( 80 );
		expect( mean( green ) ).toBeLessThanOrEqual( 86 );
		expect( mean( blue ) ).toBeLessThanOrEqual( 3 );
		expect( percentile( luminance, 0.1 ) ).toBeGreaterThanOrEqual( 35 );
		expect( percentile( luminance, 0.1 ) ).toBeLessThanOrEqual( 55 );
		expect( percentile( luminance, 0.5 ) ).toBeGreaterThanOrEqual( 57 );
		expect( percentile( luminance, 0.5 ) ).toBeLessThanOrEqual( 74 );
		expect( percentile( luminance, 0.9 ) ).toBeGreaterThanOrEqual( 75 );
		expect( percentile( luminance, 0.9 ) ).toBeLessThanOrEqual( 95 );

	} );

	it( 'keeps the pure-green ramp saturated from the dark base to the tip', () => {

		const texture = createFirSprigTexture( 1 );
		const samples = [ 0.05, 0.3, 0.6, 0.9 ].map( ( v ) => meanGreenRowColor( texture, v ) );

		for ( const sample of samples ) {

			expect( sample ).not.toBeNull();
			expect( sample![ 0 ] ).toBeLessThanOrEqual( 4 );
			expect( sample![ 2 ] ).toBeLessThanOrEqual( 4 );

		}

		expect( samples[ 0 ]![ 1 ] ).toBeLessThan( samples[ 1 ]![ 1 ] );
		expect( samples[ 1 ]![ 1 ] ).toBeLessThan( samples[ 2 ]![ 1 ] );
		expect( samples[ 2 ]![ 1 ] ).toBeLessThan( samples[ 3 ]![ 1 ] );
		expect( samples[ 3 ]![ 1 ] / samples[ 0 ]![ 1 ] ).toBeGreaterThanOrEqual( 2.2 );
		expect( samples[ 3 ]![ 1 ] / samples[ 0 ]![ 1 ] ).toBeLessThanOrEqual( 2.8 );

	} );

	it( 'matches the smooth Tree01 brightness ramp from the sprig base to tip', () => {

		const texture = createFirSprigTexture( 1 );
		const samples: [ number, [ number, number, number ] ][] = [
			[ 0.05, [ 0, 43, 0 ] ],
			[ 0.15, [ 0, 59, 0 ] ],
			[ 0.3, [ 0, 70, 0 ] ],
			[ 0.45, [ 0, 80, 0 ] ],
			[ 0.6, [ 0, 93, 0 ] ],
			[ 0.75, [ 0, 101, 0 ] ],
			[ 0.9, [ 0, 111, 0 ] ],
		];
		const measured = samples.map( ( [ v ] ) => meanGreenRowColor( texture, v ) );

		for ( let index = 0; index < samples.length; index ++ ) {

			const expected = samples[ index ]![ 1 ];
			const actual = measured[ index ];

			expect( actual ).not.toBeNull();

			for ( let channel = 0; channel < 3; channel ++ ) {

				const tolerance = channel === 1 ? Math.max( 1, expected[ channel ]! * 0.1 ) : 4;

				expect( Math.abs( actual![ channel ]! - expected[ channel ]! ) ).toBeLessThanOrEqual( tolerance );

			}

			if ( index > 0 ) expect( actual![ 1 ] ).toBeGreaterThan( measured[ index - 1 ]![ 1 ] );

		}

		const ratio = measured[ measured.length - 1 ]![ 1 ] / measured[ 0 ]![ 1 ];

		expect( ratio ).toBeGreaterThanOrEqual( 2.205 );
		expect( ratio ).toBeLessThanOrEqual( 2.695 );

	} );

	it( 'matches the reference luminance profile from the sprig base to tip', () => {

		const texture = createFirSprigTexture( 1 );
		const expected = [ 33, 44, 45, 49, 52, 56, 58, 62, 66, 69, 71, 72, 74, 78, 81 ];
		const measured = expected.map( ( _, index ) => {

			const color = meanGreenRowColor( texture, ( index + 1 ) / 16 )!;

			return Math.round( color[ 0 ] * 0.2126 + color[ 1 ] * 0.7152 + color[ 2 ] * 0.0722 );

		} );
		const maximumError = Math.max( ...measured.map( ( value, index ) => Math.abs( value - expected[ index ]! ) ) );

		expect( maximumError ).toBeLessThanOrEqual( 5 );

	} );

	it( 'keeps antialiased tip texels at the needle color', () => {

		const texture = createFirSprigTexture( 1 );
		const tipStart = Math.floor( texture.height * 0.8 );
		let partialAlphaPixels = 0;
		let brightestGreen = 0;

		for ( let y = tipStart; y < texture.height; y ++ ) {

			for ( let x = 0; x < texture.width / 3; x ++ ) {

				const offset = ( y * texture.width + x ) * 4;
				const red = texture.data[ offset ]!;
				const green = texture.data[ offset + 1 ]!;
				const blue = texture.data[ offset + 2 ]!;
				const alpha = texture.data[ offset + 3 ]!;

				if ( alpha === 0 || alpha >= 128 || green <= red || green <= blue ) continue;

				partialAlphaPixels ++;
				brightestGreen = Math.max( brightestGreen, green );
				expect( red ).toBeLessThanOrEqual( 4 );
				expect( blue ).toBeLessThanOrEqual( 4 );

			}

		}

		expect( partialAlphaPixels ).toBeGreaterThan( 0 );
		expect( brightestGreen ).toBeLessThanOrEqual( 130 );

	} );

	it( 'keeps neighboring needle tones softly graduated', () => {

		const texture = createFirSprigTexture( 1 );
		const gradients = opaqueNeighborGradientValues( texture );

		expect( percentile( gradients, 0.9 ) ).toBeLessThanOrEqual( 4 );

	} );

	it( 'keeps needle luminance variation within the reference ramp', () => {

		const texture = createFirSprigTexture( 1 );
		const luminance = opaqueChannelValues( texture, 3 );

		expect( percentile( luminance, 0.9 ) - percentile( luminance, 0.1 ) ).toBeLessThanOrEqual( 40 );

	} );

	it( 'keeps the sprig centerline from forming a dark radial stripe', () => {

		const texture = createFirSprigTexture( 1 );
		const center = meanOpaqueLuminanceInColumnRange( texture, 126, 130 );
		const sides = ( meanOpaqueLuminanceInColumnRange( texture, 118, 124 ) + meanOpaqueLuminanceInColumnRange( texture, 132, 138 ) ) / 2;

		expect( center ).toBeGreaterThanOrEqual( sides - 2.75 );

	} );

	it( 'keeps the darkest centerline rows close to their side texture', () => {

		const texture = createFirSprigTexture( 1 );
		const contrasts: number[] = [];

		for ( let y = 20; y < texture.height - 20; y ++ ) {

			const center = opaqueRowLuminance( texture, y, 126, 131 );
			const left = opaqueRowLuminance( texture, y, 118, 124 );
			const right = opaqueRowLuminance( texture, y, 132, 138 );

			if ( center === null || left === null || right === null ) continue;

			contrasts.push( center - ( left + right ) * 0.5 );

		}

		expect( percentile( contrasts, 0.1 ) ).toBeGreaterThanOrEqual( - 4 );

	} );

	it( 'uses broad, connected needle strokes instead of a hairy edge', () => {

		const texture = createFirSprigTexture( 1 );
		const tileWidth = texture.width / 3;
		let opaquePixels = 0;
		let perimeter = 0;

		for ( let y = 0; y < texture.height; y ++ ) {

			for ( let x = 0; x < tileWidth; x ++ ) {

				const offset = ( y * texture.width + x ) * 4;

				if ( texture.data[ offset + 3 ]! < 128 ) continue;

				opaquePixels ++;

				for ( const [ dx, dy ] of [ [ - 1, 0 ], [ 1, 0 ], [ 0, - 1 ], [ 0, 1 ] ] ) {

					const neighborX = x + dx!;
					const neighborY = y + dy!;

					if ( neighborX < 0 || neighborX >= tileWidth || neighborY < 0 || neighborY >= texture.height || alphaAt( texture, neighborX, neighborY ) < 128 ) perimeter ++;

				}

			}

		}

		expect( perimeter / opaquePixels ).toBeLessThan( 0.42 );

	} );

	it( 'pads transparent RGB with colors from covered texels in its own atlas region', () => {

		const texture = createFirSprigTexture( 31 );
		const tileWidth = texture.width / 3;

		for ( let tile = 0; tile < 1; tile ++ ) {

			const colors = new Set<string>();

			for ( let y = 0; y < texture.height; y ++ ) {

				for ( let x = tile * tileWidth; x < ( tile + 1 ) * tileWidth; x ++ ) {

					const offset = ( y * texture.width + x ) * 4;
					const color = `${ texture.data[ offset ] },${ texture.data[ offset + 1 ] },${ texture.data[ offset + 2 ] }`;

					if ( texture.data[ offset + 3 ]! > 0 ) {

						colors.add( color );

					}

				}

			}

			for ( let y = 0; y < texture.height; y ++ ) {

				for ( let x = tile * tileWidth; x < ( tile + 1 ) * tileWidth; x ++ ) {

					const offset = ( y * texture.width + x ) * 4;

					if ( texture.data[ offset + 3 ] === 0 ) {

						const color = `${ texture.data[ offset ] },${ texture.data[ offset + 1 ] },${ texture.data[ offset + 2 ] }`;

						expect( color ).not.toBe( '255,255,255' );
						expect( colors.has( color ) ).toBe( true );

					}

				}

			}

		}

	} );

	it( 'keeps intermediate alpha coverage on needle and stem edges', () => {

		const texture = createFirSprigTexture( 1 );
		const tileWidth = texture.width / 3;
		const values = new Set<number>();
		let partialPixels = 0;
		let partialNeedlePixels = 0;
		let partialStemPixels = 0;
		let invalidPartialRgb = 0;

		for ( let y = 0; y < texture.height; y ++ ) {

			for ( let x = 0; x < tileWidth; x ++ ) {

				const offset = ( y * texture.width + x ) * 4;
				const red = texture.data[ offset ]!;
				const green = texture.data[ offset + 1 ]!;
				const blue = texture.data[ offset + 2 ]!;
				const alpha = texture.data[ offset + 3 ]!;

				if ( alpha === 0 || alpha === 255 ) continue;

				partialPixels ++;
				values.add( alpha );
				if ( green > red && green > blue ) partialNeedlePixels ++;
				if ( red > green + 2 && green > blue * 1.5 ) partialStemPixels ++;
				if ( red >= 120 || green >= 132 || blue >= 40 ) invalidPartialRgb ++;

			}

		}

		expect( partialPixels ).toBeGreaterThan( 100 );
		expect( values.size ).toBeGreaterThan( 8 );
		expect( partialNeedlePixels ).toBeGreaterThan( 50 );
		expect( partialStemPixels ).toBeGreaterThan( 0 );
		expect( invalidPartialRgb ).toBe( 0 );

	} );

	it( 'accepts a positive explicit tile size', () => {

		const texture = createFirSprigTexture( 7, 64 );

		expect( texture.width ).toBe( 192 );
		expect( texture.height ).toBe( 64 );
		expect( texture.data.length ).toBe( 192 * 64 * 4 );
		expect( () => createFirSprigTexture( 7, 0 ) ).toThrow( RangeError );

	} );

} );
