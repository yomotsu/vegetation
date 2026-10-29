import { describe, expect, it } from 'vitest';
import { hexToLinear } from '../../src/core/color';
import { bakeImpostor } from '../../src/core/impostor';
import { generatePebblesData } from '../../src/core/generators/pebbles';
import { generateRockData } from '../../src/core/generators/rock';
import type { TextureData, VegetationData } from '../../src/core/types';

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
    "albedo": "85d5ca46b16f0d1a235754ec5ceb8f0985b99ae6ac17ac137a1d039b5e0d2c57",
    "normal": "f70a3d177a9209e14114f3050647eb428bbfe8f41c0a58fc8e9e14ab5576cf58",
    "lods": [
      "73fdf80ae87d33cc482a8bb3bc63a06ac1829fa510462cf0b0c598e4623557cb",
      "1f7e5bdc54324fd7dbe956d20250d3958d233d63ac9a651c4b21b247aa3c3477",
      "5d24553878a761fdcfe65f2a6d13c9cab35abceeeef4b177e3fb083bdecc47c5",
      "a2a2f5127f61f47c5bb08151519824de40f1496e56f654b1ad9fe65554e3316b",
      "59756fa4af71fd9c755a4f203fc6c7797e7477d3c0355b3b9efa4ce9cb2e00ab"
    ],
    "impostor": "32a61d119891743ae97abe173538d96952964d5222965d78ba91dfe14eb8e9b2"
  },
  "rock-1-closed": {
    "albedo": "cdfcbf3686fabda29d0a1c7fd8d9d01d889ce123b451a6c845512907f28a6ed6",
    "normal": "f560b5d6222d0381e0059a5de2feb5ae61c4839a720f93a8f4f82734036025d6",
    "lods": [
      "570b71c3febc6c717d79509b673e8542278c18f03ad235de653bf84605bacba1",
      "58de894a9b92ed79c262b4442f869ef341ed4adb7b6b71d022aed3ebcd9c11b9",
      "17d0a621b37d568fbcd167f1d80a26e3e8f957a067bdc23895ba7c9fd1f98f1d",
      "945435cc199b73ab7aabc87148f71a0c36489e3b565dc94cbf2faa855c27ccce",
      "d22a440d9a5cedd8a38f1992e958b6ac10a6cb87f70c93d1afc251b4f32cf29c"
    ],
    "impostor": "53d8445ec8787ddd5f262f037f259f1ac5788ea0dc0bc3d879cdbd33c89e9155"
  },
  "rock-1-moss": {
    "albedo": "8015cb3f8e63045e11eb8261bac8da8a81979d7b747c9fca0555d8fa404c948b",
    "normal": "f902e008079d3bb5c5ed508535b14c6926882772ce1d591732985892db5a1e72",
    "lods": [
      "73fdf80ae87d33cc482a8bb3bc63a06ac1829fa510462cf0b0c598e4623557cb",
      "1f7e5bdc54324fd7dbe956d20250d3958d233d63ac9a651c4b21b247aa3c3477",
      "5d24553878a761fdcfe65f2a6d13c9cab35abceeeef4b177e3fb083bdecc47c5",
      "a2a2f5127f61f47c5bb08151519824de40f1496e56f654b1ad9fe65554e3316b",
      "59756fa4af71fd9c755a4f203fc6c7797e7477d3c0355b3b9efa4ce9cb2e00ab"
    ],
    "impostor": "ca19320793b652932fb0be5d9f4e337aa2d01c405e5bf70d4982d0e3a2bfd4f2"
  },
  "rock-7-default": {
    "albedo": "44b2e264d8e7ad8f18c5b5787a6edf753db1632d79e2880e62048c8b6ae1fc5a",
    "normal": "adbc99741c546656cab8fc2c36accf5a869a9f33882cfdd89ac26247adcec708",
    "lods": [
      "d2fbd5dd5e73c13696233eaa907def304a2b097157d239628d94761781080ed6",
      "c9fa0b62e8227742dbf20306e45ffaecdfec6af7a8fb81e9d16c3e02b87e1add",
      "43f7cc9c8d264d3ae99bce60cc8c3803c355df7a3c696692dcda2e76e6a7f21e",
      "ec9e00cb5403be7ccdd8d4cd8063ad0bb9b6dc6398513d88ff862cab776dc423",
      "6e13ce358f7105db6f0a0e703bbbdf96d159d5483335973bd0b20c52a8f70bf7"
    ],
    "impostor": "4a3c169a213a7d0df7542ccab84f8252bc4306340d98f353fc797d5b290ee552"
  },
  "rock-7-closed": {
    "albedo": "ce73e4d695dd5910e08236574f44b018ebfbc846bdacbf697e2c4189a81089d3",
    "normal": "9008dfaedab03d9bb0f4c5b4c88b5fb1a1b0f7344806eaaa92151656f69fab7e",
    "lods": [
      "42f91dc039cd06bfc7f245f5baf30722be17633657f6bdb1117863ead3ea3796",
      "99f12fc661fa3b07d11f72e5e11d9c910ba47e13a21b4f647e1ea6e5a56384f5",
      "3c509da00c09a588d001db55a0969ea40470dc8de823c1c1b239586e63caaed1",
      "380ba03b92de7fa78fcecb20b525f64bca252ff4b01137255ee0015f14b33499",
      "5c22a227b29a5995b357e5e59c80537fca1159102a7e327c55b77ff9025310c5"
    ],
    "impostor": "f9ffcf64ca6f136a38edfeb0d4e58ebbba6a4223b9a17cc999960fd4a9c7f70f"
  },
  "rock-7-moss": {
    "albedo": "32eddb2b5740054266476aee220663cf66f46c3e45394df5c2ff9bf747c85df4",
    "normal": "ad25903c408a3eed9f1ab5715d271e7aa74ebeaeea4a4f43791e7e7477b4163d",
    "lods": [
      "d2fbd5dd5e73c13696233eaa907def304a2b097157d239628d94761781080ed6",
      "c9fa0b62e8227742dbf20306e45ffaecdfec6af7a8fb81e9d16c3e02b87e1add",
      "43f7cc9c8d264d3ae99bce60cc8c3803c355df7a3c696692dcda2e76e6a7f21e",
      "ec9e00cb5403be7ccdd8d4cd8063ad0bb9b6dc6398513d88ff862cab776dc423",
      "6e13ce358f7105db6f0a0e703bbbdf96d159d5483335973bd0b20c52a8f70bf7"
    ],
    "impostor": "9f2a1088022ecac7844536bd3e123341d9c75409e8378e42880d684c3bf87920"
  },
  "rock-21-default": {
    "albedo": "a54f922cdbea95297fe32331e41b9739c16fdaa187b0ffb08994d043a361ba37",
    "normal": "4ea1b71b0d50565f972ea2234de4ae51450cb8ac8ac24e8f55fc1c8a2d9a1e0a",
    "lods": [
      "0f6b2e741adaef8f89222991913fb1e68faf0afaecf8e9b89bcfbc22b145f9d1",
      "e801a80d1cc7fafadc47e11ee7a77cbe151f6219df4e5c83d1d429c5c9056871",
      "a2482f01087a482b77bd0e335d53ed954414f1e31efffa7127660270cbcf6e8e",
      "7a8061adb287b1c54d3fd1717250c6c968becf09aa47218dbe94d8cbb369ef43",
      "2b11e62a7d582b962d3e6b1f719b453d1a1160531fd9d70d4ab5d5a78be7f9c5"
    ],
    "impostor": "260c4e319476eb049d8729995d9b2cc05c43aaa8e7213bc4211e029b7c2eeea9"
  },
  "rock-21-closed": {
    "albedo": "3c9a49bab61b856e2317c57f2040b2561720aeb15e423b4c7275b7263b7dd09b",
    "normal": "525a09e805af12ee21f9878a4d46cedd3fafe3d3f996bb274652cf29a0622741",
    "lods": [
      "1c2b6ba96c0ad72003541c3da51cd9e31cc0a4a83bd32f2a36e16fd7bc5e7e36",
      "0de3402671b5ab837bb1273201798c6f1d04edf5ed92421c1434d01168bc66d5",
      "2953aba65d260eed113f3f3ac24b35a2e2d4bee73f664ff50bf0003b04386a6c",
      "7b44fff7c6ba6b6cfe5fe7290dbcb45f246fdd699dcbe804b9c351363fb83bad",
      "3ae57ec27bef2f3cbb02ec05f01bf346908d2671c645224fd4a1b70dd37978ba"
    ],
    "impostor": "cf6ea03c5ab5ac5c983bcfe318b1565c383d3eea11f71bd6f82969c6f57aeee8"
  },
  "rock-21-moss": {
    "albedo": "f1213b7d5ad757597c77e4e5cdd020084b585bc8f837c697a9c8710f7636c35c",
    "normal": "cb2b4b944dd87b0f16e369f9705ee8c47873a299b81a9f5168915a943782344d",
    "lods": [
      "0f6b2e741adaef8f89222991913fb1e68faf0afaecf8e9b89bcfbc22b145f9d1",
      "e801a80d1cc7fafadc47e11ee7a77cbe151f6219df4e5c83d1d429c5c9056871",
      "a2482f01087a482b77bd0e335d53ed954414f1e31efffa7127660270cbcf6e8e",
      "7a8061adb287b1c54d3fd1717250c6c968becf09aa47218dbe94d8cbb369ef43",
      "2b11e62a7d582b962d3e6b1f719b453d1a1160531fd9d70d4ab5d5a78be7f9c5"
    ],
    "impostor": "ad7448f6dd7d527d84f9c6f553c4d1c5e62e6c257186eaff621b3dc20d573f26"
  },
  "rock-42-default": {
    "albedo": "72e885a67ed08f69556b2d95303afd74cfaf58cc6d6d420be197df274066e997",
    "normal": "a7885fba147a7c0089df9698644388ca8601af7248c38b416281efc7be4bf522",
    "lods": [
      "60f0e2b8e38db2bc3da72ec09dd4bcf971e90dc75de634a5c66b03fa5637a82a",
      "86b09822f30319850d9aedaf23191952efb44f82a91533bcfadd37cf35625881",
      "674b81be56862d593982b7b043d3e5ee42ec0aa9e2de3763558c8d20f1555839",
      "19cb19126401b278eceb218047fedea4b612aea1d84ba99976c395e019c3ad6b",
      "92a840db4151c37e2e8a70acddc4360ea0dd87374d5ee1d18d42371b5e781bf9"
    ],
    "impostor": "b54c69b5dc78548bfa7f63be4608b6cf444f7853f1654273bdaa5d69f7f0956a"
  },
  "rock-42-closed": {
    "albedo": "da11f691fdb4bebfe02d7b2c73d0ea15c6dbef80379e7822b8d01d1d2dcf240d",
    "normal": "0e85dceca7e760dbfe994ae9e185c0906a82ac09bcb6f41208eb31e16463fb1c",
    "lods": [
      "f624adf65198366f84c1b0de537d8153660dc46469b2ac06ca2b0ace6e164e63",
      "611c5bae066a0d8ffb9025034f57e98ceb077489ddbf87456557786b14080282",
      "9d35ef36ed9dba7ff5346368dee0451404ee72ff5d370607ea0cbeb693488f6e",
      "6f089759b819e3c664cd2268050da8664bcd84775ad6ff7207f3b32624493b8a",
      "a6d301832807cc8d547bb6f5ec420e141e4b43d2c2db277757da2226e4c66e43"
    ],
    "impostor": "7069553fe6cdfd291d893193fc48afc70bedcf0257b2513a7e9a0056d48b9fcf"
  },
  "rock-42-moss": {
    "albedo": "40b8510409d2382072c4aaed0669d8944aeacc090d8c4ebdfab79129ca87e7f2",
    "normal": "2b65c9a337135d658e7460547d4df677599aaf532c3168437626c0f56db7ca29",
    "lods": [
      "60f0e2b8e38db2bc3da72ec09dd4bcf971e90dc75de634a5c66b03fa5637a82a",
      "86b09822f30319850d9aedaf23191952efb44f82a91533bcfadd37cf35625881",
      "674b81be56862d593982b7b043d3e5ee42ec0aa9e2de3763558c8d20f1555839",
      "19cb19126401b278eceb218047fedea4b612aea1d84ba99976c395e019c3ad6b",
      "92a840db4151c37e2e8a70acddc4360ea0dd87374d5ee1d18d42371b5e781bf9"
    ],
    "impostor": "68d6c26eeea00be7298073815222fff0122b85fda87b986da9cb2153212c8da1"
  },
  "pebbles-1-default": {
    "albedo": "80883d5a31b68957ea8a17853ca025ff7591949e92253d2d77b58a3d35cbef1d",
    "normal": "1dd9bb08c056f10dabd998f2815a54233a6957080c2d5830abca95777f28aa3e",
    "lods": [
      "e7f47e7a7b062d8a4c50bc4a0a9d5b35929ad5206a1edcb72de6c50356ea2a3f",
      "6a7199ae15cf9c01131efcc48afc706f39217ea01b13e0cb587f1227c6112f27",
      "6583fafa13252702a4441316aaeda62cd9c50a07c51a329a0a54416faed1a16e",
      "23faab8b39c108e10cdedd2f9d74ddf47b7b3384c59bfb10f88b2c31f0ccfeb6",
      "c19beaba7b8301f06d78917b2eefa8211cfbce08bf838e2fbbcbfac24439ebc2"
    ],
    "impostor": "10cf76cfe983f4af7442a1b5298fa9979ec926afa84c29e909adb4b2b2b37c05"
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
