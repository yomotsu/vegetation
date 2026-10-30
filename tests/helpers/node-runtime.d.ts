declare module 'node:module' {
	export interface NodeRequire {
		( specifier: string ): string;
		resolve( specifier: string ): string;
	}
	export function createRequire( url: string ): NodeRequire;
}

declare module 'node:fs' {
	export function readFileSync( path: string, encoding: 'utf8' ): string;
	export function readFileSync( path: string ): Uint8Array;
	export function mkdtempSync( prefix: string ): string;
	export function readdirSync( path: string ): string[];
	export function rmSync( path: string, options: { recursive: boolean; force: boolean } ): void;
	export function writeFileSync( path: string, data: Uint8Array ): void;
}

declare module 'node:path' {
	export function dirname( path: string ): string;
	export function join( ...paths: string[] ): string;
}

declare module 'node:vm' {
	export function runInNewContext( code: string, context: Record<string, unknown>, options?: { filename?: string } ): unknown;
}

declare module 'node:child_process' {
	export function execFileSync( file: string, args: string[], options?: { stdio?: 'ignore' | 'inherit' } ): Uint8Array;
}

declare module 'node:os' {
	export function tmpdir(): string;
}

declare module 'node:zlib' {
	export function inflateSync( data: Uint8Array ): Uint8Array;
}
