import { createFlowerLOD, FlowerMesh, generateFlower, generateFlowerAsync } from './common';
import type { FlowerMeshOptions } from './common';

export type CallaMeshOptions = FlowerMeshOptions;

export function generateCalla( options: CallaMeshOptions = {} ) {

	return generateFlower( 'calla', options );

}

export function generateCallaAsync( options: CallaMeshOptions = {} ) {

	return generateFlowerAsync( 'calla', options );

}

export class CallaMesh extends FlowerMesh {

	constructor( options: CallaMeshOptions = {} ) {

		super( 'calla', options );

	}

	static createLOD( options: CallaMeshOptions = {}, distances?: number[] ) {

		return createFlowerLOD( 'calla', options, distances );

	}

}
