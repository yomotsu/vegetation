import { WebGLRenderer } from 'three';
import { configurePreviewRenderer } from './rendering';
import type { PreviewRenderer } from './rendering';

export function createRenderer(): PreviewRenderer {

	const renderer = new WebGLRenderer( { antialias: true } );
	configurePreviewRenderer( renderer );

	return renderer;

}
