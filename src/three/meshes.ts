import { VegetationAsset } from './VegetationAsset';
import { VegetationMesh } from './VegetationMesh';
import type { ColorRepresentation } from 'three';
import type { TreeOptions } from '../core/generators/tree';
import { generateTreeData } from '../core/generators/tree';
import type { LodLevel } from '../core/types';

export type TreeMeshOptions = TreeOptions & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
};

function colorsFromOptions(
	options: Record<string, ColorRepresentation | undefined>,
	parts: Record<string, string>,
): Record<string, ColorRepresentation> {

	const colors: Record<string, ColorRepresentation> = {};

	for ( const [ option, part ] of Object.entries( parts ) ) {
		if ( options[ option ] !== undefined ) colors[ part ] = options[ option ]!;
	}

	return colors;

}

export function generateTree( options: TreeMeshOptions = {} ): VegetationAsset {

	const data = generateTreeData( options );
	const colors = colorsFromOptions( { barkColor: options.barkColor, leafColor: options.leafColor }, { barkColor: 'bark', leafColor: 'leaf' } );

	return new VegetationAsset( data, colors );

}

export class TreeMesh extends VegetationMesh {

	constructor( options: TreeMeshOptions = {} ) {

		super( generateTree( options ), options.lod );

	}

	static createLOD( options: TreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * ( options.height ?? 6 ) / 6 );
		const asset = generateTree( options );

		return VegetationMesh.fromAsset( asset, distances ?? defaultDistances );

	}

}

export type { LodLevel, TreeOptions };
