import {
	ACESFilmicToneMapping,
	PCFShadowMap,
	SRGBColorSpace,
	WebGPURenderer,
} from 'three/webgpu';
import type { PreviewRenderer } from './renderer-webgl';

export async function createRenderer(): Promise<PreviewRenderer> {

	const renderer = new WebGPURenderer( { antialias: true } );
	await renderer.init();
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;

	return renderer;

}
