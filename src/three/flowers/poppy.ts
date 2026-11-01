import { createFlowerLOD, FlowerMesh, generateFlower, generateFlowerAsync } from './common';
import type { FlowerMeshOptions } from './common';

export type PoppyMeshOptions = FlowerMeshOptions;

export function generatePoppy( options: PoppyMeshOptions = {} ) {

	return generateFlower( 'poppy', options );

}

export function generatePoppyAsync( options: PoppyMeshOptions = {} ) {

	return generateFlowerAsync( 'poppy', options );

}

export class PoppyMesh extends FlowerMesh {

	constructor( options: PoppyMeshOptions = {} ) {

		super( 'poppy', options );

	}

	static createLOD( options: PoppyMeshOptions = {}, distances?: number[] ) {

		return createFlowerLOD( 'poppy', options, distances );

	}

}
