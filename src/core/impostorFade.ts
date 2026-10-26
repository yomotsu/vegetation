export const IMPOSTOR_VERTICAL_FADE_START = 0.55;
export const IMPOSTOR_VERTICAL_FADE_END = 0.8;
export const IMPOSTOR_HORIZONTAL_FADE_START = 0.5;
export const IMPOSTOR_HORIZONTAL_FADE_END = 0.75;

export interface ImpostorCardWeights {
	vertical: number;
	horizontal: number;
}

function smoothstep( edge0: number, edge1: number, value: number ): number {

	const amount = Math.min( 1, Math.max( 0, ( value - edge0 ) / ( edge1 - edge0 ) ) );

	return amount * amount * ( 3 - 2 * amount );

}

export function impostorCardWeights( viewAngle: number ): ImpostorCardWeights {

	const value = Math.min( 1, Math.max( 0, Math.abs( viewAngle ) ) );

	return {
		vertical: 1 - smoothstep( IMPOSTOR_VERTICAL_FADE_START, IMPOSTOR_VERTICAL_FADE_END, value ),
		horizontal: smoothstep( IMPOSTOR_HORIZONTAL_FADE_START, IMPOSTOR_HORIZONTAL_FADE_END, value ),
	};

}
