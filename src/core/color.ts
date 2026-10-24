import type { Color3 } from './types';

function srgbToLinear( value: number ): number {

	const normalized = value / 255;

	if ( normalized <= 0.04045 ) return normalized / 12.92;

	return ( ( normalized + 0.055 ) / 1.055 ) ** 2.4;

}

export function hexToLinear( hex: number ): Color3 {

	const red = ( hex >>> 16 ) & 0xff;
	const green = ( hex >>> 8 ) & 0xff;
	const blue = hex & 0xff;

	return [ srgbToLinear( red ), srgbToLinear( green ), srgbToLinear( blue ) ];

}

export function linearToSrgbByte( value: number ): number {

	const normalized = Math.min( 1, Math.max( 0, value ) );
	const srgb = normalized <= 0.0031308
		? normalized * 12.92
		: 1.055 * normalized ** ( 1 / 2.4 ) - 0.055;

	return Math.round( srgb * 255 );

}
