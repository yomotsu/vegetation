import type { PreparedVegetationAsset } from '../core/vegetationAssetPreparation';
import type { VegetationWorkerRequest, VegetationWorkerResponse } from './protocol';

type WorkerFactory = () => Worker;

interface WorkerSlot {
	worker: Worker;
	busy: number;
	requestIds: Set<number>;
}

interface PendingRequest {
	slot: WorkerSlot;
	resolve: ( prepared: PreparedVegetationAsset ) => void;
	reject: ( error: Error ) => void;
}

export class VegetationWorkerUnavailableError extends Error {

	constructor( message: string ) {

		super( message );
		this.name = 'VegetationWorkerUnavailableError';

	}

}

export interface VegetationWorkerPool {
	request: ( request: Omit<VegetationWorkerRequest, 'id'>, affinity: string ) => Promise<PreparedVegetationAsset>;
	dispose: () => void;
}

export function getVegetationWorkerLimit( hardwareConcurrency = globalThis.navigator?.hardwareConcurrency ?? 2 ): number {

	return Math.max( 1, Math.min( 4, hardwareConcurrency - 1 ) );

}

export function createVegetationWorkerPool( options: { maxWorkers?: number; workerFactory?: WorkerFactory } = {} ): VegetationWorkerPool {

	const maxWorkers = Math.max( 1, Math.min( 4, options.maxWorkers ?? getVegetationWorkerLimit() ) );
	const workerFactory = options.workerFactory ?? ( () => new Worker( new URL( './vegetationWorker.ts', import.meta.url ), { type: 'module' } ) );
	const workers: WorkerSlot[] = [];
	const affinities = new Map<string, WorkerSlot>();
	const pending = new Map<number, PendingRequest>();
	let nextId = 1;
	let disposed = false;

	function reviveError( error: { name: string; message: string } ): Error {

		if ( error.name === 'RangeError' ) return new RangeError( error.message );
		if ( error.name === 'TypeError' ) return new TypeError( error.message );
		const result = new Error( error.message );
		result.name = error.name;
		return result;

	}

	function removePending( id: number, slot: WorkerSlot ): PendingRequest | undefined {

		const request = pending.get( id );
		if ( request === undefined ) return undefined;
		pending.delete( id );
		slot.requestIds.delete( id );
		slot.busy --;
		return request;

	}

	function createSlot(): WorkerSlot {

		let worker: Worker;
		try {
			worker = workerFactory();
		} catch ( error ) {
			throw new VegetationWorkerUnavailableError( error instanceof Error ? error.message : String( error ) );
		}

		const slot: WorkerSlot = { worker, busy: 0, requestIds: new Set() };
		worker.onmessage = ( event: MessageEvent<VegetationWorkerResponse> ) => {

			const response = event.data;
			const request = removePending( response.id, slot );
			if ( request === undefined ) return;
			if ( 'error' in response ) request.reject( reviveError( response.error ) );
			else request.resolve( response.prepared );

		};
		worker.onerror = ( event: ErrorEvent ) => {

			for ( const id of [ ...slot.requestIds ] ) {

				const request = removePending( id, slot );
				request?.reject( new VegetationWorkerUnavailableError( event.message || 'Vegetation worker failed' ) );

			}

			worker.terminate();
			const index = workers.indexOf( slot );
			if ( index >= 0 ) workers.splice( index, 1 );
			for ( const [ key, assigned ] of affinities ) if ( assigned === slot ) affinities.delete( key );

		};
		workers.push( slot );
		return slot;

	}

	function selectWorker( affinity: string ): WorkerSlot {

		const assigned = affinities.get( affinity );
		if ( assigned !== undefined && workers.includes( assigned ) ) return assigned;
		if ( workers.length < maxWorkers ) return createSlot();

		return workers.reduce( ( leastBusy, worker ) => worker.busy < leastBusy.busy ? worker : leastBusy );

	}

	function request( payload: Omit<VegetationWorkerRequest, 'id'>, affinity: string ): Promise<PreparedVegetationAsset> {

		if ( disposed ) return Promise.reject( new Error( 'Vegetation worker pool is disposed' ) );

		let slot: WorkerSlot;
		try {
			slot = selectWorker( affinity );
		} catch ( error ) {
			if ( error instanceof VegetationWorkerUnavailableError ) return Promise.reject( error );
			return Promise.reject( new VegetationWorkerUnavailableError( error instanceof Error ? error.message : String( error ) ) );
		}

		const id = nextId ++;
		const message: VegetationWorkerRequest = { ...payload, id };
		affinities.set( affinity, slot );
		slot.busy ++;
		slot.requestIds.add( id );

		return new Promise( ( resolve, reject ) => {

			pending.set( id, { slot, resolve, reject } );
			try {
				slot.worker.postMessage( message );
			} catch ( error ) {
				removePending( id, slot );
				reject( error instanceof Error ? error : new Error( String( error ) ) );
			}

		} );

	}

	function dispose(): void {

		if ( disposed ) return;
		disposed = true;

		for ( const slot of workers ) {

			slot.worker.terminate();
			for ( const id of [ ...slot.requestIds ] ) {

				const request = removePending( id, slot );
				request?.reject( new Error( 'Vegetation worker pool disposed' ) );

			}

		}

		workers.length = 0;
		affinities.clear();

	}

	return { request, dispose };

}

let pool: VegetationWorkerPool | undefined;

export function requestVegetationWorker(
	request: Omit<VegetationWorkerRequest, 'id'>,
	affinity: string,
): Promise<PreparedVegetationAsset> {

	pool ??= createVegetationWorkerPool();
	return pool.request( request, affinity );

}

export function disposeVegetationWorkers(): void {

	pool?.dispose();
	pool = undefined;

}
