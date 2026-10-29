import {
	Box3,
	Group,
	LineBasicMaterial,
	LineSegments,
	MathUtils,
	Mesh,
	MeshNormalMaterial,
	MeshStandardMaterial,
	PerspectiveCamera,
	Vector3,
	WireframeGeometry,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { disposeVegetationWorkers, VegetationMesh } from 'vegetation';
import type { VegetationAsset } from 'vegetation';
import { grassColorPresets, kinds, leafColorPresets } from './registry';
import type { VegetationKind } from './registry';
import { createColorUpdateScheduler } from './colorUpdateScheduler';
import { createColliderMaterialController } from './colliderVisualization';
import { createScatter } from './scatter';
import type { ScatterController } from './scatter';
import { createPreviewScene, setPreviewShadowFlags } from './rendering';
import type { PreviewRenderer } from './rendering';

if ( import.meta.env.MODE === 'webgpu' ) {

	await import( 'vegetation/webgpu' );

}

type ViewMode = 'single' | 'compare' | 'scatter';

interface DemoState {
	kind: string;
	mode: ViewMode;
	lod: number;
	wireframe: boolean;
	collider: boolean;
	scatterCount: number;
	seedVariants: number;
	leafPreset: string;
	grassPreset: string;
	options: Record<string, number | boolean>;
	colors: Record<string, string>;
}

interface CompareLabel {
	mesh: Mesh;
	element: HTMLDivElement;
}

const canvasContainer = document.querySelector<HTMLDivElement>( '#canvas' )!;
const rendererLabel = document.querySelector<HTMLDivElement>( '#renderer-label' )!;
const status = document.querySelector<HTMLDivElement>( '#status' )!;
const compareLabels = document.querySelector<HTMLDivElement>( '#compare-labels' )!;
const { scene, ground, hemisphere, sunlight } = createPreviewScene();
const groundBaseColor = ( ground.material as MeshStandardMaterial ).color.clone();
const hemisphereBaseIntensity = hemisphere.intensity;
const sunlightBaseIntensity = sunlight.intensity;

// terrain-gen の草原に合わせる。草の下の地面は草色を暗くした色にし、
// 上向き法線で明るく出すぎるぶん、草の scatter だけ光を落とす。
const GRASS_GROUND_SHADE = 0.75;
const GRASS_LIGHT_SCALE = 0.62;

const camera = new PerspectiveCamera( 38, window.innerWidth / window.innerHeight, 0.1, 260 );
let controls: OrbitControls;

const root = new Group();
scene.add( root );

const state: DemoState = {
	kind: kinds[ 0 ]!.name,
	mode: 'compare',
	lod: 0,
	wireframe: false,
	collider: false,
	scatterCount: 2000,
	seedVariants: 4,
	leafPreset: 'green',
	grassPreset: 'green',
	options: { ...kinds[ 0 ]!.options },
	colors: { ...kinds[ 0 ]!.defaultColors },
};

let activeKind: VegetationKind = kinds[ 0 ]!;
let asset: VegetationAsset;
let scatter: ScatterController | null = null;
let scatterVariants: VegetationAsset[] = [];
let rebuildRequest = 0;
let isGenerating = false;
let optionFolder: GUI | null = null;
let colorFolder: GUI | null = null;
let resetCameraButton: HTMLElement | null = null;
let labels: CompareLabel[] = [];
let colliderLines: LineSegments[] = [];
let lastScatterShadowUpdate = - Infinity;
const colliderMaterialController = createColliderMaterialController();
const scheduleColorUpdate = createColorUpdateScheduler( ( colors ) => {

	for ( const current of [ asset, ...scatterVariants ] ) {

		const partNames = new Set( current.data.parts.map( ( part ) => part.name ) );
		const matchingColors = Object.fromEntries( Object.entries( colors ).filter( ( [ part ] ) => partNames.has( part ) ) );
		if ( Object.keys( matchingColors ).length > 0 ) current.setColors( matchingColors );

	}

} );

function getLeafPreset( color: string ): string {

	for ( const [ preset, presetColor ] of Object.entries( leafColorPresets ) ) {

		if ( presetColor.toLowerCase() === color.toLowerCase() ) {

			return preset;

		}

	}

	return 'custom';

}

function getGrassPreset( color: string ): string {

	for ( const [ preset, presetColor ] of Object.entries( grassColorPresets ) ) {
		if ( presetColor.toLowerCase() === color.toLowerCase() ) return preset;
	}
	return 'custom';

}

state.leafPreset = getLeafPreset( state.colors.leaf ?? '' );

async function createPreviewRenderer(): Promise<{ renderer: PreviewRenderer; label: string }> {

	if ( import.meta.env.MODE === 'webgpu' ) {
		const { createRenderer } = await import( './renderer-webgpu' );
		return { renderer: await createRenderer(), label: 'WebGPU' };
	}

	const { createRenderer } = await import( './renderer-webgl' );
	return { renderer: createRenderer(), label: 'WebGL' };

}

function getOptionBounds( name: string ): [ number, number, number ] {

	if ( name === 'seed' ) {

		return [ 0, 999999, 1 ];

	}
	if ( name === 'closeBottom' ) {

		return [ 0, 1, 1 ];

	}
	if ( name === 'moss' ) {

		return [ 0, 1, 0.01 ];

	}
	if ( activeKind.name === 'Pebbles' && name === 'count' ) {

		return [ 4, 30, 1 ];

	}
	if ( activeKind.name === 'Pebbles' && name === 'spread' ) {

		return [ 0.2, 4, 0.05 ];

	}
	if ( activeKind.name === 'Pebbles' && name === 'size' ) {

		return [ 0.1, 0.8, 0.01 ];

	}
	if ( activeKind.name === 'Pebbles' && name === 'sizeVariation' ) {

		return [ 0, 0.9, 0.01 ];

	}
	if ( activeKind.name === 'Pebbles' && name === 'burial' ) {

		return [ 0, 1, 0.01 ];

	}
	if ( activeKind.name === 'Grass' && name === 'height' ) {
		return [ 0.3, 0.6, 0.01 ];
	}
	if ( name === 'height' ) {

		return [ 2, 14, 0.1 ];

	}
	if ( name === 'rootDepth' ) {

		return [ 0, 1, 0.05 ];

	}
	if ( name === 'crownSize' ) {

		return [ 0.5, 1.5, 0.01 ];

	}
	if ( name === 'branchCount' ) {

		return [ 1, 18, 1 ];

	}
	if ( name === 'size' ) {

		return [ 1, 12, 0.1 ];

	}
	if ( name === 'roughness' ) {

		return [ 0, 1.5, 0.01 ];

	}
	if ( name === 'flatness' ) {

		return [ 0, 1, 0.01 ];

	}
	if ( name === 'weathering' ) {

		return [ 0, 1, 0.01 ];

	}

	const value = state.options[ name ];
	return [ 0, Math.max( 10, typeof value === 'number' ? value * 2 : 10 ), 0.1 ];

}

function makeAsset( kind: VegetationKind, options: Record<string, number | boolean>, colors: Record<string, string> ): Promise<VegetationAsset> {

	const textureColors = Object.fromEntries( Object.keys( kind.textureColors ?? {} ).flatMap( ( key ) => colors[ key ] === undefined ? [] : [ [ key, colors[ key ]! ] ] ) );
	const colorOptions = Object.fromEntries( Object.entries( kind.colorOptions ).flatMap( ( [ part, option ] ) => colors[ part ] === undefined ? [] : [ [ option, colors[ part ]! ] ] ) );
	return kind.createAsync( { ...options, ...textureColors, ...colorOptions } );

}

const initialAssetPromise = makeAsset( activeKind, { ...state.options }, { ...state.colors } );
window.addEventListener( 'pagehide', disposeVegetationWorkers );

function updateGrassScene(): void {

	const grassField = activeKind.name === 'Grass' && state.mode === 'scatter';
	const groundColor = ( ground.material as MeshStandardMaterial ).color;

	if ( grassField ) {

		groundColor.set( state.colors.blade ?? '#4b942b' ).multiplyScalar( GRASS_GROUND_SHADE );

	} else {

		groundColor.copy( groundBaseColor );

	}

	hemisphere.intensity = hemisphereBaseIntensity * ( grassField ? GRASS_LIGHT_SCALE : 1 );
	sunlight.intensity = sunlightBaseIntensity * ( grassField ? GRASS_LIGHT_SCALE : 1 );

}

function setPartColor( part: string, color: string ): void {

	scheduleColorUpdate( part, color );
	if ( part === 'blade' ) updateGrassScene();

}

const wireframeMaterial = new MeshNormalMaterial( { wireframe: true } );
const originalMaterials = new WeakMap<Mesh, Mesh[ 'material' ]>();

// ワイヤーフレーム表示中はテクスチャなしの法線マテリアルに差し替えます。
function setWireframe( enabled: boolean ): void {

	root.traverse( ( object ) => {

		if ( ! ( object instanceof Mesh ) ) {

			return;

		}

		if ( enabled ) {

			if ( ! originalMaterials.has( object ) ) {

				originalMaterials.set( object, object.material );

			}

			object.material = Array.isArray( object.material ) ? object.material.map( () => wireframeMaterial ) : wireframeMaterial;

		} else {

			const original = originalMaterials.get( object );

			if ( original !== undefined ) {

				object.material = original;
				originalMaterials.delete( object );

			}

		}

	} );

}

function disposePreview( disposeVariants = true ): void {

	colliderMaterialController.restore();

	if ( scatter !== null ) {
		scatter.dispose();
		scatter = null;
	}

	if ( disposeVariants ) {

		for ( const variant of scatterVariants ) variant.dispose();
		scatterVariants = [];

	}

	for ( const lines of colliderLines ) {

		lines.geometry.dispose();
		( lines.material as LineBasicMaterial ).dispose();

	}

	colliderLines = [];
	root.clear();
	compareLabels.replaceChildren();
	labels = [];

}

function addCollider( x: number, visible: boolean ): void {

	if ( asset.collider === null ) {

		return;

	}

	const lines = new LineSegments(
		new WireframeGeometry( asset.collider ),
		new LineBasicMaterial( { color: '#ff3b30', transparent: true, opacity: 0.9, depthTest: false } ),
	);
	lines.position.x = x;
	lines.renderOrder = 1;
	lines.visible = visible;
	root.add( lines );
	colliderLines.push( lines );

}

function updateColliderVisualization(): void {

	colliderMaterialController.restore();
	const visible = state.collider && state.mode !== 'scatter' && asset.collider !== null;

	for ( const lines of colliderLines ) lines.visible = visible;

	if ( visible ) {

		colliderMaterialController.show( asset.materials, 0.35 );
		colliderMaterialController.show( Array.isArray( ground.material ) ? ground.material : [ ground.material ], 0.5 );

	}

}

// 正面（x = 0）から、シーン内のオブジェクトが収まる距離にカメラを置きます。
function resetCamera(): void {

	// 草原は terrain-gen の walkthrough と同じく、人の目の高さから見る。
	if ( activeKind.name === 'Grass' && state.mode === 'scatter' ) {

		controls.target.set( 0, 0.3, - 2 );
		camera.position.set( 0, 1.7, 4 );
		controls.update();
		return;

	}

	const box = new Box3().setFromObject( root );

	if ( box.isEmpty() ) {

		return;

	}

	const center = box.getCenter( new Vector3() );
	const halfWidth = Math.max( Math.abs( box.min.x ), Math.abs( box.max.x ) );
	const halfHeight = ( box.max.y - box.min.y ) * 0.5;
	const verticalHalfFov = MathUtils.degToRad( camera.fov ) * 0.5;
	const horizontalHalfFov = Math.atan( Math.tan( verticalHalfFov ) * camera.aspect );
	const distance = Math.max( halfWidth / Math.tan( horizontalHalfFov ), halfHeight / Math.tan( verticalHalfFov ) ) * 1.1 + ( box.max.z - center.z );
	controls.target.set( 0, center.y, center.z );
	camera.position.set( 0, center.y, center.z + distance );
	controls.update();

}

function rebuildPreview(): void {

	disposePreview( false );
	if ( state.mode !== 'scatter' ) {

		for ( const variant of scatterVariants ) variant.dispose();
		scatterVariants = [];

	}

	if ( state.mode === 'single' ) {
		const mesh = new VegetationMesh( asset, state.lod );
		setPreviewShadowFlags( mesh );
		root.add( mesh );
		addCollider( 0, state.collider );
	} else if ( state.mode === 'compare' ) {
		const spacing = Math.max( 4.5, Number( state.options.size ?? 0 ) * 1.25 );

		for ( let lod = 0; lod < 5; lod ++ ) {

			const x = ( lod - 2 ) * spacing;
			const mesh = new VegetationMesh( asset, lod );
			mesh.position.x = x;
			setPreviewShadowFlags( mesh );
			root.add( mesh );
			addCollider( x, state.collider );

			const label = document.createElement( 'div' );
			label.className = 'compare-label';
			const geometry = asset.geometries[ lod ]!;
			const triangles = Math.round( geometry.getIndex()!.count / 3 ).toLocaleString();
			const vertices = geometry.getAttribute( 'position' ).count.toLocaleString();
			label.textContent = `LOD ${ lod }\n${ triangles } tris\n${ vertices } verts`;
			compareLabels.append( label );
			labels.push( { mesh, element: label } );

		}
	} else {
		const seedCount = Math.max( 1, Math.min( 4, Math.floor( state.seedVariants ) ) );
		scatter = createScatter( [ asset, ...scatterVariants.slice( 0, seedCount - 1 ) ], state.scatterCount, Number( state.options.seed ?? 1 ) );
		root.add( scatter.group );
	}

	setWireframe( state.wireframe );
	updateColliderVisualization();
	updateGrassScene();
	sunlight.shadow.needsUpdate = true;
	lastScatterShadowUpdate = - Infinity;
	status.hidden = ! isGenerating && state.mode !== 'scatter';

}

async function rebuildAsset(): Promise<void> {

	const request = ++ rebuildRequest;
	const kind = activeKind;
	const options = { ...state.options };
	const colors = { ...state.colors };
	const seedCount = state.mode === 'scatter' ? Math.max( 1, Math.min( 4, Math.floor( state.seedVariants ) ) ) : 1;
	const jobs = [ makeAsset( kind, options, colors ) ];

	for ( let variant = 1; variant < seedCount; variant ++ ) {

		jobs.push( makeAsset( kind, { ...options, seed: Number( options.seed ?? 1 ) + variant }, colors ) );

	}

	isGenerating = true;
	status.hidden = false;
	status.textContent = 'generating…';

	try {

		const results = await Promise.allSettled( jobs );
		const generated = results.flatMap( ( result ) => result.status === 'fulfilled' ? [ result.value ] : [] );

		if ( request !== rebuildRequest ) {

			for ( const next of generated ) next.dispose();
			return;

		}

		const failure = results.find( ( result ) => result.status === 'rejected' );
		if ( failure !== undefined ) {

			for ( const next of generated ) next.dispose();
			throw failure.reason;

		}

		const nextAsset = generated[ 0 ]!;
		const nextVariants = generated.slice( 1 );
		for ( const part of kind.colorParts ) {

			if ( colors[ part ] !== state.colors[ part ] && state.colors[ part ] !== undefined ) nextAsset.setColor( part, state.colors[ part ]! );

		}

		const previous = asset;
		disposePreview( false );
		for ( const variant of scatterVariants ) variant.dispose();
		asset = nextAsset;
		scatterVariants = nextVariants;
		isGenerating = false;
		rebuildPreview();
		previous.dispose();

	} catch ( error ) {

		if ( request !== rebuildRequest ) return;
		isGenerating = false;
		status.hidden = false;
		status.textContent = error instanceof Error ? error.message : String( error );
		console.error( error );

	}

}

function rebuildOptionFolders( gui: GUI ): void {

	optionFolder?.destroy();
	colorFolder?.destroy();
	optionFolder = gui.addFolder( `${ activeKind.name } options` );

	for ( const key of Object.keys( state.options ) ) {

		const value = state.options[ key ];
		const controller = typeof value === 'boolean'
			? optionFolder.add( state.options, key )
			: optionFolder.add( state.options, key, ...getOptionBounds( key ) );
		controller
			.name( key )
			.onFinishChange( () => void rebuildAsset() );

	}

	colorFolder = gui.addFolder( 'Colors' );
	let updateLeafColorDisplay = () => {};
	let updateLeafPresetDisplay = () => {};
	let updateGrassColorDisplay = () => {};
	let updateGrassPresetDisplay = () => {};

	if ( activeKind.colorParts.includes( 'leaf' ) ) {

		const presetController = colorFolder.add( state, 'leafPreset', [ ...Object.keys( leafColorPresets ), 'custom' ] ).name( 'leaf preset' );
		updateLeafPresetDisplay = () => presetController.updateDisplay();
		presetController.onChange( ( preset: string ) => {

			const color = leafColorPresets[ preset as keyof typeof leafColorPresets ];
			if ( color === undefined ) {

				return;

			}

			state.colors.leaf = color;
			updateLeafColorDisplay();
			setPartColor( 'leaf', color );

		} );

	}

	if ( activeKind.colorParts.includes( 'blade' ) ) {
		const presetController = colorFolder.add( state, 'grassPreset', [ ...Object.keys( grassColorPresets ), 'custom' ] ).name( 'grass preset' );
		updateGrassPresetDisplay = () => presetController.updateDisplay();
		presetController.onChange( ( preset: string ) => {
			const color = grassColorPresets[ preset as keyof typeof grassColorPresets ];
			if ( color === undefined ) return;
			state.colors.blade = color;
			updateGrassColorDisplay();
			setPartColor( 'blade', color );
		} );
	}

	for ( const part of activeKind.colorParts ) {

		const colorController = colorFolder.addColor( state.colors, part ).name( part );

		if ( part === 'leaf' ) {

			updateLeafColorDisplay = () => colorController.updateDisplay();
			colorController.onChange( ( color: string ) => {

				state.leafPreset = 'custom';
				updateLeafPresetDisplay();
				setPartColor( part, color );

			} );

		} else if ( part === 'blade' ) {
			updateGrassColorDisplay = () => colorController.updateDisplay();
			colorController.onChange( ( color: string ) => {
				state.grassPreset = 'custom';
				updateGrassPresetDisplay();
				setPartColor( part, color );
			} );
		} else {

			colorController.onChange( ( color: string ) => setPartColor( part, color ) );

		}

	}

	for ( const key of Object.keys( activeKind.textureColors ?? {} ) ) {
		colorFolder.addColor( state.colors, key ).name( key ).onFinishChange( () => void rebuildAsset() );
	}

	if ( resetCameraButton === null ) {

		resetCameraButton = gui.add( { resetCamera }, 'resetCamera' ).name( 'camera reset' ).domElement;

	}

	// フォルダを作り直しても camera reset は一番下に置きます。
	resetCameraButton.parentElement!.append( resetCameraButton );

}

function createGui(): void {

	const gui = new GUI( { title: 'Vegetation', width: 285 } );
	gui.add( state, 'kind', kinds.map( ( kind ) => kind.name ) ).name( 'species' ).onChange( ( name: string ) => {

		activeKind = kinds.find( ( kind ) => kind.name === name )!;
		state.options = { ...activeKind.options };
		state.colors = { ...activeKind.defaultColors };
		state.leafPreset = getLeafPreset( state.colors.leaf ?? '' );
		state.grassPreset = getGrassPreset( state.colors.blade ?? '' );
		rebuildOptionFolders( gui );
		updateViewControls();
		void rebuildAsset();

	} );

	gui.add( state, 'mode', [ 'single', 'compare', 'scatter' ] ).name( 'view' ).onChange( () => {

		updateViewControls();
		void rebuildAsset();

	} );
	const lodController = gui.add( state, 'lod', 0, 4, 1 ).name( 'LOD' ).onChange( () => {

		if ( state.mode === 'single' ) {

			rebuildPreview();

		}

	} );
	gui.add( state, 'wireframe' ).name( 'wireframe' ).onChange( setWireframe );
	gui.add( state, 'collider' ).name( 'collider' ).onChange( ( visible: boolean ) => {

		state.collider = visible;
		updateColliderVisualization();

	} );
	const scatterCountController = gui.add( state, 'scatterCount', 0, 5000, 100 ).name( 'scatter count' ).onFinishChange( () => {

		if ( state.mode === 'scatter' ) {

			rebuildPreview();

		}

	} );
	const seedVariantsController = gui.add( state, 'seedVariants', 1, 4, 1 ).name( 'seed variants' ).onFinishChange( () => {

		if ( state.mode === 'scatter' ) {

			void rebuildAsset();

		}

	} );

	// 選択中のviewで効く項目だけを表示する。
	const updateViewControls = (): void => {

		lodController.show( state.mode === 'single' );
		scatterCountController.show( state.mode === 'scatter' && activeKind.name !== 'Grass' );
		seedVariantsController.show( state.mode === 'scatter' );

	};

	updateViewControls();
	rebuildOptionFolders( gui );

}

function updateCompareLabels(): void {

	for ( const label of labels ) {

		const position = label.mesh.position.clone();
		position.y = Number( state.options.height ?? state.options.size ?? 7.5 ) * 1.13;
		position.project( camera );
		label.element.style.left = `${ ( position.x * 0.5 + 0.5 ) * window.innerWidth }px`;
		label.element.style.top = `${ ( - position.y * 0.5 + 0.5 ) * window.innerHeight }px`;
		label.element.hidden = position.z < - 1 || position.z > 1;

	}

}

function showRendererError( error: unknown ): void {

	const message = error instanceof Error ? error.message : String( error );
	rendererLabel.textContent = 'Renderer failed';
	status.hidden = false;
	status.textContent = message;
	console.error( error );

}

async function start(): Promise<void> {

	const [ { renderer, label }, initialAsset ] = await Promise.all( [ createPreviewRenderer(), initialAssetPromise ] );
	asset = initialAsset;
	rendererLabel.textContent = `${ label } renderer`;
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	canvasContainer.append( renderer.domElement );
	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.dampingFactor = 0.06;
	controls.minDistance = 0.5;
	controls.maxDistance = 240;
	createGui();
	rebuildPreview();
	resetCamera();

	window.addEventListener( 'resize', () => {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
		renderer.setSize( window.innerWidth, window.innerHeight );
		updateCompareLabels();

	} );

	let frames = 0;
	let lastFpsTime = performance.now();

	function animate(): void {

		requestAnimationFrame( animate );
		controls.update();
		const now = performance.now();

		if ( scatter !== null ) {
			const triangles = scatter.update( camera, now );

			if ( now - lastScatterShadowUpdate >= 500 ) {

				sunlight.shadow.needsUpdate = true;
				lastScatterShadowUpdate = now;

			}

			frames ++;

			if ( ! isGenerating && now - lastFpsTime >= 500 ) {
				const fps = Math.round( frames * 1000 / ( now - lastFpsTime ) );
				status.textContent = `${ fps } FPS · ${ Math.round( triangles ).toLocaleString() } tris`;
				frames = 0;
				lastFpsTime = now;
			}
		}

		updateCompareLabels();
		renderer.render( scene, camera );

	}

	animate();

}

void start().catch( showRendererError );
