import { createFlowerLOD, FlowerMesh, generateFlower, generateFlowerAsync } from './common';
import type { FlowerMeshOptions } from './common';

export type TulipMeshOptions = FlowerMeshOptions;

export function generateTulip( options: TulipMeshOptions = {} ) {

	return generateFlower( 'tulip', options );

}

export function generateTulipAsync( options: TulipMeshOptions = {} ) {

	return generateFlowerAsync( 'tulip', options );

}

export class TulipMesh extends FlowerMesh {

	constructor( options: TulipMeshOptions = {} ) {

		super( 'tulip', options );

	}

	static createLOD( options: TulipMeshOptions = {}, distances?: number[] ) {

		return createFlowerLOD( 'tulip', options, distances );

	}

}
