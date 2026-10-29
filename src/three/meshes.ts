import { VegetationAsset } from './VegetationAsset';
import { VegetationMesh } from './VegetationMesh';
import { Color } from 'three';
import type { ColorRepresentation } from 'three';
import type { TreeOptions } from '../core/generators/tree';
import { generateTreeData } from '../core/generators/tree';
import type { RockOptions } from '../core/generators/rock';
import { generateRockData } from '../core/generators/rock';
import type { PebblesOptions } from '../core/generators/pebbles';
import { generatePebblesData } from '../core/generators/pebbles';
import { DEFAULT_LEAF_COLOR } from '../core/leafTexture';
import { DEFAULT_MOSS_COLOR } from '../core/rockTexture';
import type { LodLevel } from '../core/types';

export type TreeMeshOptions = Omit<TreeOptions, 'leafColor'> & {
	lod?: number;
	leafColor?: ColorRepresentation;
	barkColor?: ColorRepresentation;
};

export type RockMeshOptions = Omit<RockOptions, 'rockColor' | 'mossColor'> & {
	lod?: number;
	rockColor?: ColorRepresentation;
	mossColor?: ColorRepresentation;
};

export type PebblesMeshOptions = Omit<PebblesOptions, 'stoneColor' | 'mossColor'> & {
	lod?: number;
	stoneColor?: ColorRepresentation;
	mossColor?: ColorRepresentation;
};

function colorsFromOptions(
	options: Record<string, ColorRepresentation | undefined>,
	parts: Record<string, string>,
): Record<string, ColorRepresentation> {

	const colors: Record<string, ColorRepresentation> = {};

	for ( const [ option, part ] of Object.entries( parts ) ) {
		if ( options[ option ] !== undefined ) {

			colors[ part ] = options[ option ]!;

		}
	}

	return colors;

}

export function generateTree( options: TreeMeshOptions = {} ): VegetationAsset {

	const leafColor = options.leafColor ?? DEFAULT_LEAF_COLOR;
	const data = generateTreeData( { ...options, leafColor: new Color( leafColor ).getHex() } );
	const colors = colorsFromOptions( { barkColor: options.barkColor, leafColor }, { barkColor: 'bark', leafColor: 'leaf' } );

	return new VegetationAsset( data, colors );

}

export class TreeMesh extends VegetationMesh {

	constructor( options: TreeMeshOptions = {} ) {

		super( generateTree( options ), options.lod, true );

	}

	static createLOD( options: TreeMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * ( options.height ?? 7.5 ) / 7.5 );
		const asset = generateTree( options );

		return VegetationMesh.fromAsset( asset, distances ?? defaultDistances, true );

	}

}

export function generateRock( options: RockMeshOptions = {} ): VegetationAsset {

	const rockColor = options.rockColor ?? 0xffffff;
	const color = new Color( rockColor );
	const mossColor = new Color( options.mossColor ?? DEFAULT_MOSS_COLOR );
	const data = generateRockData( { ...options, rockColor: color.getHex(), mossColor: mossColor.getHex() } );

	return new VegetationAsset( data, { rock: color } );

}

export class RockMesh extends VegetationMesh {

	constructor( options: RockMeshOptions = {} ) {

		super( generateRock( options ), options.lod, true );

	}

	static createLOD( options: RockMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * ( options.size ?? 6.4 ) / 6.4 );
		const asset = generateRock( options );

		return VegetationMesh.fromAsset( asset, distances ?? defaultDistances, true );

	}

}

export function generatePebbles( options: PebblesMeshOptions = {} ): VegetationAsset {

	const stoneColor = options.stoneColor ?? 0xffffff;
	const color = new Color( stoneColor );
	const mossColor = new Color( options.mossColor ?? DEFAULT_MOSS_COLOR );
	const data = generatePebblesData( { ...options, stoneColor: color.getHex(), mossColor: mossColor.getHex() } );

	return new VegetationAsset( data, { stone: color } );

}

export class PebblesMesh extends VegetationMesh {

	constructor( options: PebblesMeshOptions = {} ) {

		super( generatePebbles( options ), options.lod, true );

	}

	static createLOD( options: PebblesMeshOptions = {}, distances?: number[] ): import( 'three' ).LOD {

		const defaultDistances = [ 0, 15, 30, 60, 120 ].map( ( distance ) => distance * ( options.spread ?? 1.6 ) / 1.6 );
		const asset = generatePebbles( options );

		return VegetationMesh.fromAsset( asset, distances ?? defaultDistances, true );

	}

}

export type { LodLevel, PebblesOptions, RockOptions, TreeOptions };
