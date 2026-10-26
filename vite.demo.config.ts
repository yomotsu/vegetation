import { defineConfig } from 'vite';

const projectRoot = new URL( '.', import.meta.url ).pathname;

export default defineConfig( ( { mode } ) => ( {
	root: new URL( './demo', import.meta.url ).pathname,
	cacheDir: new URL( './node_modules/.vite-' + mode, import.meta.url ).pathname,
	resolve: {
		alias: [
			{ find: /^vegetation\/webgpu$/, replacement: new URL( './src/webgpu/index.ts', import.meta.url ).pathname },
			...( mode === 'webgpu' ? [
				{ find: /^three$/, replacement: 'three/webgpu' },
			] : [] ),
			{ find: 'vegetation', replacement: new URL( './src/index.ts', import.meta.url ).pathname },
		],
	},
	server: {
		fs: {
			allow: [ projectRoot ],
		},
	},
} ) );
