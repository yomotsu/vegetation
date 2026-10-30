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

	it( 'transfers encode buffers and sends independent textures to different workers', async () => {
		const workers: FakeWorker[] = [];
		const pool = createVegetationWorkerPool( { maxWorkers: 2, workerFactory: () => {
			const worker = new FakeWorker();
			workers.push( worker );
			return worker as unknown as Worker;
		} } );
		const pixels = new Uint8Array( 4 * 4 * 4 );
		const mipPixels = new Uint8Array( 2 * 2 * 4 );
		const first = pool.encode( { width: 4, height: 4, data: pixels, mipmaps: [ { width: 2, height: 2, data: mipPixels } ] }, { alphaTest: 0.5 }, 'uastc:first' );
		const second = pool.encode( { width: 4, height: 4, data: new Uint8Array( 64 ) }, { alphaTest: 0 }, 'uastc:second' );

		expect( workers ).toHaveLength( 2 );
		const firstCall = workers[ 0 ]!.postMessage.mock.calls[ 0 ]! as unknown as [ { id: number; task: string }, Transferable[] ];
		const secondCall = workers[ 1 ]!.postMessage.mock.calls[ 0 ]! as unknown as [ { id: number; task: string }, Transferable[] ];
		expect( firstCall[ 0 ].task ).toBe( 'encode' );
		expect( firstCall[ 1 ] ).toEqual( [ pixels.buffer, mipPixels.buffer ] );
		workers[ 0 ]!.onmessage( { data: { id: firstCall[ 0 ].id, task: 'encode', buffer: new ArrayBuffer( 1 ), encodeTimeMs: 1 } } as MessageEvent );
		workers[ 1 ]!.onmessage( { data: { id: secondCall[ 0 ].id, task: 'encode', buffer: new ArrayBuffer( 2 ), encodeTimeMs: 2 } } as MessageEvent );

		await expect( first ).resolves.toMatchObject( { encodeTimeMs: 1 } );
		await expect( second ).resolves.toMatchObject( { encodeTimeMs: 2 } );
		pool.dispose();
	} );

} );
