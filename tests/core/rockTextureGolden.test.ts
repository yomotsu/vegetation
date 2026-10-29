import { describe, expect, it } from 'vitest';
import { bakeImpostor, generatePebblesData, generateRockData, hexToLinear } from '../../src/core';
import type { TextureData, VegetationData } from '../../src/core';

function addArray( chunks: Uint8Array[], array: Float32Array | Uint32Array | Uint8Array ): void {

	chunks.push( new Uint8Array( array.buffer, array.byteOffset, array.byteLength ) );

}

async function hashBytes( bytes: Uint8Array ): Promise<string> {

	const input = new ArrayBuffer( bytes.length );
	new Uint8Array( input ).set( bytes );
	const digest = await globalThis.crypto.subtle.digest( 'SHA-256', input );
	return Array.from( new Uint8Array( digest ), ( value ) => value.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}

async function hashArrays( arrays: ( Float32Array | Uint32Array | Uint8Array )[], suffix = '' ): Promise<string> {

	const chunks: Uint8Array[] = [];
	for ( const array of arrays ) addArray( chunks, array );
	if ( suffix !== '' ) chunks.push( new TextEncoder().encode( suffix ) );
	const bytes = new Uint8Array( chunks.reduce( ( total, chunk ) => total + chunk.length, 0 ) );
	let offset = 0;
	for ( const chunk of chunks ) {
		bytes.set( chunk, offset );
		offset += chunk.length;
	}
	return hashBytes( bytes );

}

async function hashes( data: VegetationData ): Promise<Record<string, unknown>> {

	const lods: string[] = [];
	for ( const mesh of data.lods ) {
		lods.push( await hashArrays( [ mesh.positions, mesh.normals, mesh.uvs, mesh.colors, mesh.windWeight, mesh.impostorCard, mesh.indices ], JSON.stringify( mesh.groups ) ) );
	}
	const colors = data.parts.map( ( part ) => hexToLinear( part.defaultColor ) );
	const impostor = bakeImpostor( data, colors, 128 );
	return {
		albedo: await hashBytes( data.textures.albedo!.data ),
		normal: await hashBytes( data.textures.normal!.data ),
		lods,
		impostor: await hashArrays( [ impostor.data ], impostor.width + 'x' + impostor.height ),
	};

}

describe( 'rock texture output goldens', () => {

	it( 'preserves texture, mesh, and impostor bytes for reference configurations', async () => {

		const expected = {
  "rock-1-default": {
    "albedo": "da24a9d4b56c368b0fed634655eb5516fe09fec23e1e5f077fcf050b4522c149",
    "normal": "384a01df93b36f85d27560ef3e5d18a561484e3f1bf3103319eb51abac749f73",
    "lods": [
      "73fdf80ae87d33cc482a8bb3bc63a06ac1829fa510462cf0b0c598e4623557cb",
      "1f7e5bdc54324fd7dbe956d20250d3958d233d63ac9a651c4b21b247aa3c3477",
      "5d24553878a761fdcfe65f2a6d13c9cab35abceeeef4b177e3fb083bdecc47c5",
      "a2a2f5127f61f47c5bb08151519824de40f1496e56f654b1ad9fe65554e3316b",
      "59756fa4af71fd9c755a4f203fc6c7797e7477d3c0355b3b9efa4ce9cb2e00ab"
    ],
    "impostor": "8cbe82123e9e5d95606599d8cafdcb8cca1971f8356584ba336233a0e2ae1121"
  },
  "rock-1-closed": {
    "albedo": "aa95bcfaf6a6d8c7afa484e4093a0ebec75bb4d6d49dbb598a6f4c8a116741e3",
    "normal": "aa14f8b6f6b7f001bb8ab07e9d45fb536fe4244e9823060113e0693d748c84c3",
    "lods": [
      "570b71c3febc6c717d79509b673e8542278c18f03ad235de653bf84605bacba1",
      "58de894a9b92ed79c262b4442f869ef341ed4adb7b6b71d022aed3ebcd9c11b9",
      "17d0a621b37d568fbcd167f1d80a26e3e8f957a067bdc23895ba7c9fd1f98f1d",
      "945435cc199b73ab7aabc87148f71a0c36489e3b565dc94cbf2faa855c27ccce",
      "d22a440d9a5cedd8a38f1992e958b6ac10a6cb87f70c93d1afc251b4f32cf29c"
    ],
    "impostor": "3c3e41c872bdeba50e934c2f43658ab784ad919a3ffc1b9a477e7b1c9fec158a"
  },
  "rock-1-moss": {
    "albedo": "69f904992438071c6f233b83ad124fd632e436991f3b24c5643f4fdc736c3cee",
    "normal": "38a8dd1a71ba688730bf106e873e99db140f9363a81e7f0d092787016e03a032",
    "lods": [
      "73fdf80ae87d33cc482a8bb3bc63a06ac1829fa510462cf0b0c598e4623557cb",
      "1f7e5bdc54324fd7dbe956d20250d3958d233d63ac9a651c4b21b247aa3c3477",
      "5d24553878a761fdcfe65f2a6d13c9cab35abceeeef4b177e3fb083bdecc47c5",
      "a2a2f5127f61f47c5bb08151519824de40f1496e56f654b1ad9fe65554e3316b",
      "59756fa4af71fd9c755a4f203fc6c7797e7477d3c0355b3b9efa4ce9cb2e00ab"
    ],
    "impostor": "74021b65d65eb630e12ff174e2fbfcb18386c78f3b46d4dd1afa55f28facfe38"
  },
  "rock-7-default": {
    "albedo": "3b4cc926d6efb3025ba7f7dd277c59e93a11c87023770a00007be6a88561756f",
    "normal": "9dcbad9a1dc100075fb6067b3bbb0c45a156f1a337a3af1e3acd7651bf79d360",
    "lods": [
      "d2fbd5dd5e73c13696233eaa907def304a2b097157d239628d94761781080ed6",
      "c9fa0b62e8227742dbf20306e45ffaecdfec6af7a8fb81e9d16c3e02b87e1add",
      "43f7cc9c8d264d3ae99bce60cc8c3803c355df7a3c696692dcda2e76e6a7f21e",
      "ec9e00cb5403be7ccdd8d4cd8063ad0bb9b6dc6398513d88ff862cab776dc423",
      "6e13ce358f7105db6f0a0e703bbbdf96d159d5483335973bd0b20c52a8f70bf7"
    ],
    "impostor": "969160b97fd3f6af6069ce8b27f689b2cce01c73570ca273a83163678c2598b7"
  },
  "rock-7-closed": {
    "albedo": "0cfa9ce2677f024001969a21e0b8ab766ea9a290d36bb42dc993570575260189",
    "normal": "5496c2c52f93208be0eef0529c83f20ceab150f98ee52ac399c390b716b87654",
    "lods": [
      "42f91dc039cd06bfc7f245f5baf30722be17633657f6bdb1117863ead3ea3796",
      "99f12fc661fa3b07d11f72e5e11d9c910ba47e13a21b4f647e1ea6e5a56384f5",
      "3c509da00c09a588d001db55a0969ea40470dc8de823c1c1b239586e63caaed1",
      "380ba03b92de7fa78fcecb20b525f64bca252ff4b01137255ee0015f14b33499",
      "5c22a227b29a5995b357e5e59c80537fca1159102a7e327c55b77ff9025310c5"
    ],
    "impostor": "3158561e76eb5f0c3a20fe7638eb271a68789c4acc84f833bcdb5bb04d50a1bd"
  },
  "rock-7-moss": {
    "albedo": "8c7ffadf8ed87bb3b7baea2ea4c3a35ab2edfe8bf0e8fb4eed0eccbc65ed24f2",
    "normal": "9f1b94694606bfa5fb8fc469af32174b36aed0486aca646e6fe60785786808af",
    "lods": [
      "d2fbd5dd5e73c13696233eaa907def304a2b097157d239628d94761781080ed6",
      "c9fa0b62e8227742dbf20306e45ffaecdfec6af7a8fb81e9d16c3e02b87e1add",
      "43f7cc9c8d264d3ae99bce60cc8c3803c355df7a3c696692dcda2e76e6a7f21e",
      "ec9e00cb5403be7ccdd8d4cd8063ad0bb9b6dc6398513d88ff862cab776dc423",
      "6e13ce358f7105db6f0a0e703bbbdf96d159d5483335973bd0b20c52a8f70bf7"
    ],
    "impostor": "13a04229c25182b18b3fff79fc0a0dc3b713dbb2fb6e01e7adfc0e40b09b2604"
  },
  "rock-21-default": {
    "albedo": "87294fcf22d30c4c773e6131cc0b4f3212fac9d918eb940d9118d62307a00843",
    "normal": "c23491128a735447e68f42eeb43d4b7409e9704b95ffa15f1a73c459292bfa69",
    "lods": [
      "0f6b2e741adaef8f89222991913fb1e68faf0afaecf8e9b89bcfbc22b145f9d1",
      "e801a80d1cc7fafadc47e11ee7a77cbe151f6219df4e5c83d1d429c5c9056871",
      "a2482f01087a482b77bd0e335d53ed954414f1e31efffa7127660270cbcf6e8e",
      "7a8061adb287b1c54d3fd1717250c6c968becf09aa47218dbe94d8cbb369ef43",
      "2b11e62a7d582b962d3e6b1f719b453d1a1160531fd9d70d4ab5d5a78be7f9c5"
    ],
    "impostor": "a3eaea3b846234b0c598ad7adc27082c803e9251437c771d107f69cb5b1f1a4a"
  },
  "rock-21-closed": {
    "albedo": "ab9cd1201de7a399c3d88e8baaad4b0a5ae8d835f8878adfb9bda729fcfdfcbd",
    "normal": "224ab0d32ce3258f3868d6b409ecc1084b90041c0cb81c11d60b29a942451024",
    "lods": [
      "1c2b6ba96c0ad72003541c3da51cd9e31cc0a4a83bd32f2a36e16fd7bc5e7e36",
      "0de3402671b5ab837bb1273201798c6f1d04edf5ed92421c1434d01168bc66d5",
      "2953aba65d260eed113f3f3ac24b35a2e2d4bee73f664ff50bf0003b04386a6c",
      "7b44fff7c6ba6b6cfe5fe7290dbcb45f246fdd699dcbe804b9c351363fb83bad",
      "3ae57ec27bef2f3cbb02ec05f01bf346908d2671c645224fd4a1b70dd37978ba"
    ],
    "impostor": "515852a1b45bca00858a8c7cdb8cfbecdccc9ef63b07b786c4539e2b48fd4e2f"
  },
  "rock-21-moss": {
    "albedo": "8c8bfb8824461d21126d6518fb31d038913d30c1055da3bb658c4e9e52126035",
    "normal": "69ac091fa5567c9c59ac18098ad16a28e4404ea7924f85d30b8e6f3eb81cd315",
    "lods": [
      "0f6b2e741adaef8f89222991913fb1e68faf0afaecf8e9b89bcfbc22b145f9d1",
      "e801a80d1cc7fafadc47e11ee7a77cbe151f6219df4e5c83d1d429c5c9056871",
      "a2482f01087a482b77bd0e335d53ed954414f1e31efffa7127660270cbcf6e8e",
      "7a8061adb287b1c54d3fd1717250c6c968becf09aa47218dbe94d8cbb369ef43",
      "2b11e62a7d582b962d3e6b1f719b453d1a1160531fd9d70d4ab5d5a78be7f9c5"
    ],
    "impostor": "417ee8e5bae53d3601286600e919b64feeee86fe91e9f77d3db43024cd3cf367"
  },
  "rock-42-default": {
    "albedo": "73a9d0d1e069821e43c472fec5275e21982ad91b000cd7c7da3750fef0376811",
    "normal": "063da1e20a4cdc58ba8f9bc9924a43a4b5066ad5470aed5c21283a96a7d1d639",
    "lods": [
      "60f0e2b8e38db2bc3da72ec09dd4bcf971e90dc75de634a5c66b03fa5637a82a",
      "86b09822f30319850d9aedaf23191952efb44f82a91533bcfadd37cf35625881",
      "674b81be56862d593982b7b043d3e5ee42ec0aa9e2de3763558c8d20f1555839",
      "19cb19126401b278eceb218047fedea4b612aea1d84ba99976c395e019c3ad6b",
      "92a840db4151c37e2e8a70acddc4360ea0dd87374d5ee1d18d42371b5e781bf9"
    ],
    "impostor": "1075e7c4b7b3f53c129303cd74ee329340249041a8917f7dd6e840c19b635b62"
  },
  "rock-42-closed": {
    "albedo": "21622b6b1cd679a4158a88442fbc048d83ed31c0ab1a393440272a436133d2bc",
    "normal": "41c2bd91c783950162ea689cdea3f5df55229349dadd2a2183d6e8717937ad7a",
    "lods": [
      "f624adf65198366f84c1b0de537d8153660dc46469b2ac06ca2b0ace6e164e63",
      "611c5bae066a0d8ffb9025034f57e98ceb077489ddbf87456557786b14080282",
      "9d35ef36ed9dba7ff5346368dee0451404ee72ff5d370607ea0cbeb693488f6e",
      "6f089759b819e3c664cd2268050da8664bcd84775ad6ff7207f3b32624493b8a",
      "a6d301832807cc8d547bb6f5ec420e141e4b43d2c2db277757da2226e4c66e43"
    ],
    "impostor": "8a84ea7b5f6f69be14da466913e2731da9175fa2cc344003ac26c79328e46b1d"
  },
  "rock-42-moss": {
    "albedo": "517897ee8ea1d751f665f9b605fee2c9e2baeab032599a8f35c18f87401e8248",
    "normal": "5512d95025c7d0aeb41039695c6f2b1decd92fc49e96bf6a5ac8a7d90ffaad9b",
    "lods": [
      "60f0e2b8e38db2bc3da72ec09dd4bcf971e90dc75de634a5c66b03fa5637a82a",
      "86b09822f30319850d9aedaf23191952efb44f82a91533bcfadd37cf35625881",
      "674b81be56862d593982b7b043d3e5ee42ec0aa9e2de3763558c8d20f1555839",
      "19cb19126401b278eceb218047fedea4b612aea1d84ba99976c395e019c3ad6b",
      "92a840db4151c37e2e8a70acddc4360ea0dd87374d5ee1d18d42371b5e781bf9"
    ],
    "impostor": "8c829ebedeb45c0acee95fae1eae18bbb734a70cde9cf31b50d6ba712611e68f"
  },
  "pebbles-1-default": {
    "albedo": "509f86fbd8c58a28bc070a62b1343b3800bf7453e4950de562fc55b2a88a22f8",
    "normal": "3000b68dbc64d6d5a33053ff1cf9e4e2f06d14e0a00609a21a15d225b538938d",
    "lods": [
      "e7f47e7a7b062d8a4c50bc4a0a9d5b35929ad5206a1edcb72de6c50356ea2a3f",
      "6a7199ae15cf9c01131efcc48afc706f39217ea01b13e0cb587f1227c6112f27",
      "6583fafa13252702a4441316aaeda62cd9c50a07c51a329a0a54416faed1a16e",
      "23faab8b39c108e10cdedd2f9d74ddf47b7b3384c59bfb10f88b2c31f0ccfeb6",
      "c19beaba7b8301f06d78917b2eefa8211cfbce08bf838e2fbbcbfac24439ebc2"
    ],
    "impostor": "ba12059a20fb291bc558b4a192013681e464dd7475c1959ecd94275d1aae6a3b"
  }
};
		const actual: Record<string, unknown> = {};
		for ( const seed of [ 1, 7, 21, 42 ] ) {
			actual[ 'rock-' + seed + '-default' ] = await hashes( generateRockData( { seed } ) );
			actual[ 'rock-' + seed + '-closed' ] = await hashes( generateRockData( { seed, closeBottom: true } ) );
			actual[ 'rock-' + seed + '-moss' ] = await hashes( generateRockData( { seed, moss: 0.6 } ) );
		}
		actual[ 'pebbles-1-default' ] = await hashes( generatePebblesData( { seed: 1 } ) );
		expect( actual ).toEqual( expected );

	}, 120000 );

} );
