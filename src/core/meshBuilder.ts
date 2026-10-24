import type { Color3, MeshData, MeshGroup, Vec3 } from './types';

export class MeshBuilder {

	private positions: number[] = [];
	private normals: number[] = [];
	private uvs: number[] = [];
	private colors: number[] = [];
	private windWeights: number[] = [];
	private indices: number[] = [];
	private groups: MeshGroup[] = [];
	private currentPartIndex = 0;

	addVertex( p: Vec3, n: Vec3, uv: [ number, number ], color: Color3, wind: number ): number {

		const index = this.positions.length / 3;

		this.positions.push( p[ 0 ], p[ 1 ], p[ 2 ] );
		this.normals.push( n[ 0 ], n[ 1 ], n[ 2 ] );
		this.uvs.push( uv[ 0 ], uv[ 1 ] );
		this.colors.push( color[ 0 ], color[ 1 ], color[ 2 ] );
		this.windWeights.push( wind );

		return index;

	}

	addTriangle( a: number, b: number, c: number ): void {

		const start = this.indices.length;

		this.indices.push( a, b, c );

		const lastGroup = this.groups[ this.groups.length - 1 ];

		if ( lastGroup !== undefined && lastGroup.partIndex === this.currentPartIndex && lastGroup.start + lastGroup.count === start ) {

			lastGroup.count += 3;

		} else {

			this.groups.push( { start, count: 3, partIndex: this.currentPartIndex } );

		}

	}

	beginGroup( partIndex: number ): void {

		this.currentPartIndex = partIndex;

	}

	get triangleCount(): number {

		return this.indices.length / 3;

	}

	build(): MeshData {

		return {
			positions: new Float32Array( this.positions ),
			normals: new Float32Array( this.normals ),
			uvs: new Float32Array( this.uvs ),
			colors: new Float32Array( this.colors ),
			windWeight: new Float32Array( this.windWeights ),
			indices: new Uint32Array( this.indices ),
			groups: this.groups.map( ( group ) => ( { ...group } ) ),
		};

	}

}
