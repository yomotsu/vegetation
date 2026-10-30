import path from 'node:path';

export async function resolve( specifier, context, nextResolve ) {
	try {
		return await nextResolve( specifier, context );
	} catch ( error ) {
		if ( ! specifier.startsWith( '.' ) || path.extname( specifier ) !== '' ) throw error;
		for ( const extension of [ '.ts', '.js' ] ) {
			try {
				return await nextResolve( `${ specifier }${ extension }`, context );
			} catch {
				// 拡張子なし import は、リポジトリ内の .ts を試して解決する。
			}
		}
		throw error;
	}
}
