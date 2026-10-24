import { WebGPURenderer } from 'three/webgpu';
import { configurePreviewRenderer } from './rendering';
import type { PreviewRenderer } from './rendering';

export async function createRenderer(): Promise<PreviewRenderer> {

	const renderer = new WebGPURenderer( { antialias: true } );
	configurePreviewRenderer( renderer );
	await renderer.init();

	return renderer;

}
