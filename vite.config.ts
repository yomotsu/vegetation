import { defineConfig } from 'vite';

export default defineConfig( {
	base: './',
	build: {
		lib: {
			entry: {
				index: 'src/index.ts',
				'core/index': 'src/core/index.ts',
			'webgpu/index': 'src/webgpu/index.ts',
			},
			formats: [ 'es' ],
			fileName: ( _format, entryName ) => `${ entryName }.js`,
		},
		rollupOptions: {
			external: ( id ) => id === 'three' || id.startsWith( 'three/' ),
		},
	},
} );
