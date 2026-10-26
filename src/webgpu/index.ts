import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import {
	abs,
	attribute,
	cameraPosition,
	dot,
	float,
	interleavedGradientNoise,
	max,
	materialOpacity,
	mix,
	modelWorldMatrix,
	normalize,
	positionWorld,
	select,
	screenCoordinate,
	smoothstep,
	step,
	texture,
	uv,
	vec4,
} from 'three/tsl';
import {
	IMPOSTOR_HORIZONTAL_FADE_END,
	IMPOSTOR_HORIZONTAL_FADE_START,
	IMPOSTOR_VERTICAL_FADE_END,
	IMPOSTOR_VERTICAL_FADE_START,
} from '../core/impostorFade';
import type { ImpostorMaterialFactory, ImpostorMaterialParameters } from '../three/impostorMaterialFactory';
import { registerImpostorMaterialFactory } from '../three/impostorMaterialFactory';

function createImpostorMaterial( parameters: ImpostorMaterialParameters ): MeshStandardNodeMaterial | MeshPhysicalNodeMaterial {

	const material = parameters.specularIntensity !== undefined || parameters.ior !== undefined
		? new MeshPhysicalNodeMaterial( parameters )
		: new MeshStandardNodeMaterial( parameters );
	const viewAngle = abs( dot(
		normalize( cameraPosition.sub( positionWorld ) ),
		normalize( modelWorldMatrix.mul( vec4( 0, 1, 0, 0 ) ).xyz ),
	) );
	const verticalWeight = float( 1 ).sub( smoothstep( IMPOSTOR_VERTICAL_FADE_START, IMPOSTOR_VERTICAL_FADE_END, viewAngle ) );
	const horizontalWeight = smoothstep( IMPOSTOR_HORIZONTAL_FADE_START, IMPOSTOR_HORIZONTAL_FADE_END, viewAngle );
	const impostorWeight = mix( verticalWeight, horizontalWeight, step( 0.5, attribute( 'impostorCard', 'float' ) ) );
	const mapAlpha = material.map === null ? float( 1 ) : texture( material.map, uv() ).a;
	const opacity = materialOpacity.mul( mapAlpha ).mul( impostorWeight );
	const dither = interleavedGradientNoise( screenCoordinate );
	const ditherDiscard = select( dither.greaterThanEqual( impostorWeight ), float( 1 ), float( 0 ) );

	material.opacityNode = opacity;
	material.alphaTestNode = max( float( material.alphaTest ).mul( impostorWeight ), ditherDiscard );
	material.transparent = false;

	return material;

}

registerImpostorMaterialFactory( createImpostorMaterial );
