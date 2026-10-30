import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { KTX2Loader as KTX2LoaderInstance } from 'three/addons/loaders/KTX2Loader.js';

export type KTX2Renderer = Parameters<KTX2LoaderInstance['detectSupport']>[ 0 ];

const loaders = new Map<KTX2Renderer, KTX2LoaderInstance>();

export function getKTX2Loader( renderer: KTX2Renderer ): KTX2LoaderInstance {

	let loader = loaders.get( renderer );
	if ( loader === undefined ) {
		loader = new KTX2Loader();
		loader.detectSupport( renderer );
		loaders.set( renderer, loader );
	}

	return loader;

}

export function disposeInternalKTX2Loaders(): void {

	for ( const loader of loaders.values() ) loader.dispose();
	loaders.clear();

}
