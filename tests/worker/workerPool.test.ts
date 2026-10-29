import { describe, expect, it, vi } from 'vitest';
import { getPreparedTransferables } from '../../src/worker/vegetationWorker';
import { createVegetationWorkerPool } from '../../src/worker/workerPool';

class FakeWorker {
	onmessage: ( event: MessageEvent ) => void = () => {};
	onerror: ( event: ErrorEvent ) => void = () => {};
	postMessage = vi.fn();
	terminate = vi.fn();
}

describe( 'vegetation worker pool', () => {

	it( 'routes matching affinity keys to the same worker', async () => {

		const workers: FakeWorker[] = [];
		const pool = createVegetationWorkerPool( { maxWorkers: 2, workerFactory: () => {

			const worker = new FakeWorker();
			workers.push( worker );
			return worker as unknown as Worker;

		} } );
		const first = pool.request( { kind: 'rock', options: { seed: 3 }, colors: {}, impostorSize: 128 }, 'rock:3' );
		const second = pool.request( { kind: 'rock', options: { seed: 3, moss: 0.5 }, colors: {}, impostorSize: 128 }, 'rock:3' );

		expect( workers ).toHaveLength( 1 );
		expect( workers[ 0 ]!.postMessage ).toHaveBeenCalledTimes( 2 );
		workers[ 0 ]!.onmessage( { data: { id: 999, error: { name: 'RangeError', message: 'stale' } } } as MessageEvent );
		pool.dispose();
		await expect( first ).rejects.toThrow( 'disposed' );
		await expect( second ).rejects.toThrow( 'disposed' );
		expect( workers[ 0 ]!.terminate ).toHaveBeenCalledOnce();

	} );

	it( 'collects every unique backing buffer for worker transfer', () => {

		const first = new Uint8Array( 4 );
		const second = new Float32Array( 2 );
		const transferables = getPreparedTransferables( {
			data: { textures: { base: { data: first } }, lods: [ { positions: second } ] },
			impostorTextures: { impostor: { data: first } },
		} as never );

		expect( transferables ).toEqual( [ first.buffer, second.buffer ] );

	} );

} );
