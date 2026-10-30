import { parentPort } from 'node:worker_threads';

let onMessage;
globalThis.addEventListener = ( type, listener ) => {
	if ( type === 'message' ) onMessage = listener;
};
globalThis.postMessage = ( message, transfer = [] ) => parentPort.postMessage( message, transfer );

await import( '../src/worker/vegetationWorker.ts' );

parentPort.on( 'message', ( data ) => onMessage?.( { data } ) );
