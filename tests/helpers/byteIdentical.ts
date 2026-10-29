export function areByteIdentical( first: ArrayBufferView, second: ArrayBufferView ): boolean {

	if ( first.constructor !== second.constructor || first.byteLength !== second.byteLength ) return false;
	const firstBytes = new Uint8Array( first.buffer, first.byteOffset, first.byteLength );
	const secondBytes = new Uint8Array( second.buffer, second.byteOffset, second.byteLength );

	for ( let index = 0; index < firstBytes.length; index ++ ) {
		if ( firstBytes[ index ] !== secondBytes[ index ] ) return false;
	}

	return true;

}

export function areStructurallyByteIdentical( first: unknown, second: unknown ): boolean {

	if ( first === second ) return true;
	if ( ArrayBuffer.isView( first ) && ArrayBuffer.isView( second ) ) return areByteIdentical( first, second );
	if ( Array.isArray( first ) && Array.isArray( second ) ) {
		return first.length === second.length && first.every( ( value, index ) => areStructurallyByteIdentical( value, second[ index ] ) );
	}
	if ( first === null || second === null || typeof first !== 'object' || typeof second !== 'object' ) return false;
	const firstKeys = Object.keys( first );
	const secondKeys = Object.keys( second );
	if ( firstKeys.length !== secondKeys.length ) return false;
	for ( const key of firstKeys ) {
		if ( ! Object.prototype.hasOwnProperty.call( second, key ) || ! areStructurallyByteIdentical( ( first as Record<string, unknown> )[ key ], ( second as Record<string, unknown> )[ key ] ) ) return false;
	}
	return true;

}
