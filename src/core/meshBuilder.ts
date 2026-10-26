import type { Color3, MeshData, MeshGroup, Vec3 } from './types';

export class MeshBuilder {

	private _positions: number[] = [];
	private _normals: number[] = [];
	private _uvs: number[] = [];
	private _colors: number[] = [];
	private _windWeights: number[] = [];
	private _impostorCards: number[] = [];
	private _indices: number[] = [];
	private _groups: MeshGroup[] = [];
	private _currentPartIndex = 0;

	addVertex( p: Vec3, n: Vec3, uv: [ number, number ], color: Color3, wind: number, impostorCard = 0 ): number {

		const index = this._positions.length / 3;

		this._positions.push( p[ 0 ], p[ 1 ], p[ 2 ] );
		this._normals.push( n[ 0 ], n[ 1 ], n[ 2 ] );
		this._uvs.push( uv[ 0 ], uv[ 1 ] );
		this._colors.push( color[ 0 ], color[ 1 ], color[ 2 ] );
		this._windWeights.push( wind );
		this._impostorCards.push( impostorCard );

		return index;

	}

	addTriangle( a: number, b: number, c: number ): void {

		const start = this._indices.length;

		this._indices.push( a, b, c );

		const lastGroup = this._groups[ this._groups.length - 1 ];

		if ( lastGroup !== undefined && lastGroup.partIndex === this._currentPartIndex && lastGroup.start + lastGroup.count === start ) {

			lastGroup.count += 3;

		} else {

			this._groups.push( { start, count: 3, partIndex: this._currentPartIndex } );

		}

	}

	beginGroup( partIndex: number ): void {

		this._currentPartIndex = partIndex;

	}

	get triangleCount(): number {

		return this._indices.length / 3;

	}

	build(): MeshData {

		return {
			positions: new Float32Array( this._positions ),
			normals: new Float32Array( this._normals ),
			uvs: new Float32Array( this._uvs ),
			colors: new Float32Array( this._colors ),
			windWeight: new Float32Array( this._windWeights ),
			impostorCard: new Float32Array( this._impostorCards ),
			indices: new Uint32Array( this._indices ),
			groups: this._groups.map( ( group ) => ( { ...group } ) ),
		};

	}

}
