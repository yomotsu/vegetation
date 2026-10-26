import {
	Group,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	PerspectiveCamera,
	WireframeGeometry,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { VegetationMesh } from 'vegetation';
import type { VegetationAsset } from 'vegetation';
import { kinds, leafColorPresets } from './registry';
import type { VegetationKind } from './registry';
import { createColorUpdateScheduler } from './colorUpdateScheduler';
import { createColliderMaterialController } from './colliderVisualization';
import { createScatter } from './scatter';
import type { ScatterController } from './scatter';
import { createPreviewScene, setPreviewShadowFlags } from './rendering';
import type { PreviewRenderer } from './rendering';

type ViewMode = 'single' | 'compare' | 'scatter';

interface DemoState {
	kind: string;
	mode: ViewMode;
	lod: number;
	turntable: boolean;
	wireframe: boolean;
	collider: boolean;
	scatterCount: number;
	seedVariants: number;
	leafPreset: string;
	options: Record<string, number>;
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
const { scene, ground, sunlight } = createPreviewScene();

const camera = new PerspectiveCamera( 38, window.innerWidth / window.innerHeight, 0.1, 260 );
let controls: OrbitControls;

const root = new Group();
scene.add( root );

const state: DemoState = {
	kind: kinds[ 0 ]!.name,
	mode: 'compare',
	lod: 0,
	turntable: false,
	wireframe: false,
	collider: false,
	scatterCount: 2000,
	seedVariants: 4,
	leafPreset: 'green',
	options: { ...kinds[ 0 ]!.options },
	colors: {},
};

let activeKind: VegetationKind = kinds[ 0 ]!;
let asset: VegetationAsset = activeKind.create( { ...state.options } );
let scatter: ScatterController | null = null;
let scatterVariants: VegetationAsset[] = [];
let optionFolder: GUI | null = null;
let colorFolder: GUI | null = null;
let labels: CompareLabel[] = [];
let colliderLines: LineSegments[] = [];
let lastScatterShadowUpdate = - Infinity;
const colliderMaterialController = createColliderMaterialController();
const scheduleColorUpdate = createColorUpdateScheduler( ( colors ) => {

	for ( const current of [ asset, ...scatterVariants ] ) current.setColors( colors );

} );

for ( const part of activeKind.colorParts ) {

	state.colors[ part ] = `#${ asset.getColor( part ).getHexString() }`;

}

function getLeafPreset( color: string ): string {

	for ( const [ preset, presetColor ] of Object.entries( leafColorPresets ) ) {

		if ( presetColor.toLowerCase() === color.toLowerCase() ) {

			return preset;

		}

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

	const value = state.options[ name ]!;
	return [ 0, Math.max( 10, value * 2 ), 0.1 ];

}

function makeAsset( kind: VegetationKind, options: Record<string, number>, colors: Record<string, string> ): VegetationAsset {

	const next = kind.create( { ...options, ...( colors.leaf !== undefined ? { leafColor: colors.leaf } : {} ) } );

	for ( const part of kind.colorParts ) {

		if ( part === 'leaf' ) {

			continue;

		}
		if ( colors[ part ] !== undefined ) {

			next.setColor( part, colors[ part ]! );

		}

	}

	return next;

}

function setPartColor( part: string, color: string ): void {

	scheduleColorUpdate( part, color );

}

function setWireframe( enabled: boolean ): void {

	for ( const current of [ asset, ...scatterVariants ] ) {
		current.materials.forEach( ( material ) => {
			if ( material.wireframe === enabled ) {

				return;

			}

			material.wireframe = enabled;
			material.needsUpdate = true;
		} );
	}

}

function disposePreview(): void {

	colliderMaterialController.restore();

	if ( scatter !== null ) {
		scatter.dispose();
		scatter = null;
	}

	for ( const variant of scatterVariants ) variant.dispose();
	scatterVariants = [];

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

function frameView(): void {

	const height = state.options.height ?? state.options.size ?? 7.5;
	controls.target.set( 0, state.mode === 'scatter' ? 0 : height * 0.5, 0 );

	if ( state.mode === 'single' ) {
		camera.position.set( height * 1.5, height * 1.15, height * 2.25 );
		controls.minDistance = height * 0.9;
		controls.maxDistance = height * 8;
	} else if ( state.mode === 'compare' ) {
		camera.position.set( 0, height * 2.2, height * 5.4 );
		controls.minDistance = height * 2;
		controls.maxDistance = height * 18;
	} else {
		camera.position.set( 36, 29, 38 );
		controls.minDistance = 12;
		controls.maxDistance = 170;
	}

	controls.update();

}

function rebuildPreview(): void {

	disposePreview();

	if ( state.mode === 'single' ) {
		const mesh = new VegetationMesh( asset, state.lod );
		setPreviewShadowFlags( mesh );
		root.add( mesh );
		addCollider( 0, state.collider );
	} else if ( state.mode === 'compare' ) {
		const spacing = Math.max( 4.5, ( state.options.size ?? 0 ) * 1.25 );

		for ( let lod = 0; lod < 5; lod ++ ) {

			const x = ( lod - 2 ) * spacing;
			const mesh = new VegetationMesh( asset, lod );
			mesh.position.x = x;
			setPreviewShadowFlags( mesh );
			root.add( mesh );
			addCollider( x, state.collider );

			const label = document.createElement( 'div' );
			label.className = 'compare-label';
			label.textContent = `LOD ${ lod } · ${ Math.round( asset.geometries[ lod ]!.getIndex()!.count / 3 ).toLocaleString() } tris`;
			compareLabels.append( label );
			labels.push( { mesh, element: label } );

		}
	} else {
		const seedCount = Math.max( 1, Math.min( 4, Math.floor( state.seedVariants ) ) );
		scatterVariants = Array.from( { length: seedCount - 1 }, ( _, index ) => makeAsset(
			activeKind,
			{ ...state.options, seed: ( state.options.seed ?? 1 ) + index + 1 },
			state.colors,
		) );
		scatter = createScatter( [ asset, ...scatterVariants ], state.scatterCount, state.options.seed ?? 1 );
		root.add( scatter.group );
	}

	setWireframe( state.wireframe );
	updateColliderVisualization();
	sunlight.shadow.needsUpdate = true;
	lastScatterShadowUpdate = - Infinity;
	status.hidden = state.mode !== 'scatter';
	frameView();

}

function rebuildAsset(): void {

	const previous = asset;
	asset = makeAsset( activeKind, state.options, state.colors );
	rebuildPreview();
	previous.dispose();

}

function rebuildOptionFolders( gui: GUI ): void {

	optionFolder?.destroy();
	colorFolder?.destroy();
	optionFolder = gui.addFolder( `${ activeKind.name } options` );

	for ( const key of Object.keys( state.options ) ) {

		const [ minimum, maximum, step ] = getOptionBounds( key );
		optionFolder.add( state.options, key, minimum, maximum, step )
			.name( key )
			.onFinishChange( rebuildAsset );

	}

	colorFolder = gui.addFolder( 'Part colors' );
	let updateLeafColorDisplay = () => {};
	let updateLeafPresetDisplay = () => {};

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

	for ( const part of activeKind.colorParts ) {

		const colorController = colorFolder.addColor( state.colors, part ).name( part );

		if ( part === 'leaf' ) {

			updateLeafColorDisplay = () => colorController.updateDisplay();
			colorController.onChange( ( color: string ) => {

				state.leafPreset = 'custom';
				updateLeafPresetDisplay();
				setPartColor( part, color );

			} );

		} else {

			colorController.onChange( ( color: string ) => setPartColor( part, color ) );

		}

	}

}

function createGui(): void {

	const gui = new GUI( { title: 'Vegetation', width: 285 } );
	gui.add( state, 'kind', kinds.map( ( kind ) => kind.name ) ).name( 'species' ).onChange( ( name: string ) => {

		const previous = asset;
		activeKind = kinds.find( ( kind ) => kind.name === name )!;
		state.options = { ...activeKind.options };
		const next = activeKind.create( { ...state.options } );
		state.colors = Object.fromEntries( activeKind.colorParts.map( ( part ) => [ part, `#${ next.getColor( part ).getHexString() }` ] ) );
		state.leafPreset = getLeafPreset( state.colors.leaf ?? '' );
		asset = next;
		rebuildOptionFolders( gui );
		rebuildPreview();
		previous.dispose();

	} );

	gui.add( state, 'mode', [ 'single', 'compare', 'scatter' ] ).name( 'view' ).onChange( rebuildPreview );
	gui.add( state, 'lod', 0, 4, 1 ).name( 'single LOD' ).onChange( () => {

		if ( state.mode === 'single' ) {

			rebuildPreview();

		}

	} );
	gui.add( state, 'turntable' ).name( 'turntable' ).onChange( ( enabled: boolean ) => controls.autoRotate = enabled );
	gui.add( state, 'wireframe' ).name( 'wireframe' ).onChange( setWireframe );
	gui.add( state, 'collider' ).name( 'collider' ).onChange( ( visible: boolean ) => {

		state.collider = visible;
		updateColliderVisualization();

	} );
	gui.add( state, 'scatterCount', 0, 5000, 100 ).name( 'scatter count' ).onFinishChange( () => {

		if ( state.mode === 'scatter' ) {

			rebuildPreview();

		}

	} );
	gui.add( state, 'seedVariants', 1, 4, 1 ).name( 'seed variants' ).onFinishChange( () => {

		if ( state.mode === 'scatter' ) {

			rebuildPreview();

		}

	} );

	rebuildOptionFolders( gui );

}

function updateCompareLabels(): void {

	for ( const label of labels ) {

		const position = label.mesh.position.clone();
		position.y = ( state.options.height ?? state.options.size ?? 7.5 ) * 1.13;
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

	const { renderer, label } = await createPreviewRenderer();
	rendererLabel.textContent = `${ label } renderer`;
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	canvasContainer.append( renderer.domElement );
	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.dampingFactor = 0.06;
	controls.autoRotateSpeed = 0.8;
	controls.target.set( 0, 3, 0 );
	createGui();
	rebuildPreview();

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

			if ( now - lastFpsTime >= 500 ) {
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
