import { parentPort } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { encodeUastcTexture } from '../src/core/uastc.ts';
import { writeUastcKtx2 } from '../src/core/ktx2.ts';

parentPort.on( 'message', ( { id, texture, options } ) => {
	const start = performance.now();
	const encoded = encodeUastcTexture( texture, options );
	const buffer = writeUastcKtx2( encoded );
	parentPort.postMessage( { id, buffer, encodeTimeMs: performance.now() - start } );
} );
