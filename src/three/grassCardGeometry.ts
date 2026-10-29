import { BufferAttribute, BufferGeometry } from 'three';

export function createBidirectionalCardGeometry( source: BufferGeometry ): BufferGeometry {

	const geometry = new BufferGeometry();
	for ( const name of Object.keys( source.attributes ) ) geometry.setAttribute( name, source.getAttribute( name ) );

	const sourceIndex = source.getIndex();
	if ( sourceIndex === null || sourceIndex.count % 3 !== 0 ) throw new Error( 'Grass card geometry must have indexed triangles' );

	const indices = new Uint32Array( sourceIndex.count * 2 );
	for ( let offset = 0; offset < sourceIndex.count; offset += 3 ) {

		const a = sourceIndex.getX( offset );
		const b = sourceIndex.getX( offset + 1 );
		const c = sourceIndex.getX( offset + 2 );
		indices[ offset ] = a;
		indices[ offset + 1 ] = b;
		indices[ offset + 2 ] = c;
		indices[ sourceIndex.count + offset ] = a;
		indices[ sourceIndex.count + offset + 1 ] = c;
		indices[ sourceIndex.count + offset + 2 ] = b;

	}

	geometry.setIndex( new BufferAttribute( indices, 1 ) );
	geometry.boundingBox = source.boundingBox?.clone() ?? null;
	geometry.boundingSphere = source.boundingSphere?.clone() ?? null;

	return geometry;

}
