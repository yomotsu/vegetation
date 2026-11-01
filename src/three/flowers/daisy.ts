import { createFlowerLOD, FlowerMesh, generateFlower, generateFlowerAsync } from './common';
import type { FlowerMeshOptions } from './common';

export type DaisyMeshOptions = FlowerMeshOptions;

export function generateDaisy( options: DaisyMeshOptions = {} ) {

	return generateFlower( 'daisy', options );

}

export function generateDaisyAsync( options: DaisyMeshOptions = {} ) {

	return generateFlowerAsync( 'daisy', options );

}

export class DaisyMesh extends FlowerMesh {

	constructor( options: DaisyMeshOptions = {} ) {

		super( 'daisy', options );

	}

	static createLOD( options: DaisyMeshOptions = {}, distances?: number[] ) {

		return createFlowerLOD( 'daisy', options, distances );

	}

}
