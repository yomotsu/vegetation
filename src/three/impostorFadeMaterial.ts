import type { Material } from 'three';
import {
	IMPOSTOR_HORIZONTAL_FADE_END,
	IMPOSTOR_HORIZONTAL_FADE_START,
	IMPOSTOR_VERTICAL_FADE_END,
	IMPOSTOR_VERTICAL_FADE_START,
} from '../core/impostorFade';

const fadeCacheKey = 'vegetation-impostor-view-fade-v1';

function glslNumber( value: number ): string {

	return Number.isInteger( value ) ? `${ value }.0` : `${ value }`;

}

export function addImpostorFade( material: Material ): void {

	const originalOnBeforeCompile = material.onBeforeCompile.bind( material );
	const originalCacheKey = material.customProgramCacheKey();

	material.onBeforeCompile = ( shader, renderer ) => {

		originalOnBeforeCompile( shader, renderer );
		shader.vertexShader = shader.vertexShader.replace( '#include <common>', `#include <common>
attribute float impostorCard;
varying float vImpostorCard;
varying vec3 vImpostorWorldPosition;
varying vec3 vImpostorWorldUp;` );
		shader.vertexShader = shader.vertexShader.replace( '#include <begin_vertex>', `#include <begin_vertex>
vImpostorCard = impostorCard;` );
		shader.vertexShader = shader.vertexShader.replace( '#include <project_vertex>', `#include <project_vertex>
vec4 impostorWorldPosition = vec4( transformed, 1.0 );
vec3 impostorObjectUp = vec3( 0.0, 1.0, 0.0 );
#ifdef USE_BATCHING
	impostorWorldPosition = batchingMatrix * impostorWorldPosition;
	impostorObjectUp = mat3( batchingMatrix ) * impostorObjectUp;
#endif
#ifdef USE_INSTANCING
	impostorWorldPosition = instanceMatrix * impostorWorldPosition;
	impostorObjectUp = mat3( instanceMatrix ) * impostorObjectUp;
#endif
impostorWorldPosition = modelMatrix * impostorWorldPosition;
vImpostorWorldPosition = impostorWorldPosition.xyz;
vImpostorWorldUp = normalize( mat3( modelMatrix ) * impostorObjectUp );` );
		shader.fragmentShader = shader.fragmentShader.replace( '#include <common>', `#include <common>
varying float vImpostorCard;
varying vec3 vImpostorWorldPosition;
varying vec3 vImpostorWorldUp;` );
		shader.fragmentShader = shader.fragmentShader.replace( '#include <alphatest_fragment>', `float impostorViewAngle = abs( dot( normalize( cameraPosition - vImpostorWorldPosition ), normalize( vImpostorWorldUp ) ) );
float impostorVerticalWeight = 1.0 - smoothstep( ${ glslNumber( IMPOSTOR_VERTICAL_FADE_START ) }, ${ glslNumber( IMPOSTOR_VERTICAL_FADE_END ) }, impostorViewAngle );
float impostorHorizontalWeight = smoothstep( ${ glslNumber( IMPOSTOR_HORIZONTAL_FADE_START ) }, ${ glslNumber( IMPOSTOR_HORIZONTAL_FADE_END ) }, impostorViewAngle );
float impostorWeight = mix( impostorVerticalWeight, impostorHorizontalWeight, step( 0.5, vImpostorCard ) );
float impostorDither = fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
diffuseColor.a *= impostorWeight;
if ( diffuseColor.a < alphaTest * impostorWeight || impostorWeight <= 0.0 || impostorDither >= impostorWeight ) discard;` );

	};

	material.customProgramCacheKey = () => `${ originalCacheKey }|${ fadeCacheKey }`;
	material.needsUpdate = true;

}
