import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const threeModulePath = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
const orbitControlsPath = path.resolve(__dirname, 'node_modules/three/examples/jsm/controls/OrbitControls.js');
const skeletonUtilsPath = path.resolve(__dirname, 'node_modules/three/examples/jsm/utils/SkeletonUtils.js');
const gltfLoaderPath = path.resolve(__dirname, 'node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const fflatePath = path.resolve(__dirname, 'node_modules/three/examples/jsm/libs/fflate.module.js');
const nurbsCurvePath = path.resolve(__dirname, 'node_modules/three/examples/jsm/curves/NURBSCurve.js');
const fbxLoaderPath = path.resolve(__dirname, 'node_modules/three/examples/jsm/loaders/FBXLoader.js');
const assetManagerPath = path.resolve(__dirname, 'switch/AssetManager.js');

let threeCode = fs.readFileSync(threeModulePath, 'utf8');
let orbitCode = fs.readFileSync(orbitControlsPath, 'utf8');
let skeletonCode = fs.readFileSync(skeletonUtilsPath, 'utf8');
let gltfCode = fs.readFileSync(gltfLoaderPath, 'utf8');
let fflateCode = fs.readFileSync(fflatePath, 'utf8');
let nurbsCode = fs.readFileSync(nurbsCurvePath, 'utf8');
let fbxCode = fs.readFileSync(fbxLoaderPath, 'utf8');
let assetCode = fs.readFileSync(assetManagerPath, 'utf8');

// Strip imports from loaders and convert exports to local assignments
function cleanModule(code) {
  return code
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
    .replace(/^export\s+\{[^}]*\};?/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+(class|function|const|let|var)\s+/gm, '$1 ');
}

// Convert Three.js exports to THREE namespace
let cleanedThree = threeCode
  .replace(/^export\s+\{([\s\S]*?)\};?/gm, (match, p1) => {
    return `const THREE = { ${p1} };\nif (typeof globalThis !== 'undefined') globalThis.THREE = THREE;`;
  })
  .replace(/^export\s+(class|function|const|let|var)\s+/gm, '$1 ');

let cleanedFflate = `const fflate = (() => {
  const exports = {};
  ${fflateCode
    .replace(/^export\s+(function|class)\s+([a-zA-Z0-9_$]+)/gm, '$1 $2')
    .replace(/^export\s+(const|let|var)\s+([a-zA-Z0-9_$]+)/gm, '$1 $2')
    .replace(/^export\s+\{([\s\S]*?)\};?/gm, (match, p1) => {
      return p1.split(',').map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        const name = parts[0].trim();
        const alias = (parts[1] || parts[0]).trim();
        return name ? `exports.${alias} = ${name};` : '';
      }).join('\n');
    })}
  return exports;
})();`;

let cleanedNurbs = `const NURBSCurve = (() => {
  ${cleanModule(nurbsCode)}
  return typeof NURBSCurve !== 'undefined' ? NURBSCurve : null;
})();`;

let cleanedOrbit = `const OrbitControls = (() => {
  ${cleanModule(orbitCode)}
  return typeof OrbitControls !== 'undefined' ? OrbitControls : null;
})();`;

let cleanedSkeleton = `const SkeletonUtils = (() => {
  ${cleanModule(skeletonCode)}
  return { clone: typeof clone !== 'undefined' ? clone : null };
})();`;

let cleanedGltf = `const GLTFLoader = (() => {
  ${cleanModule(gltfCode)}
  return typeof GLTFLoader !== 'undefined' ? GLTFLoader : null;
})();`;

let cleanedFbx = `const FBXLoader = (() => {
  ${cleanModule(fbxCode)}
  return typeof FBXLoader !== 'undefined' ? FBXLoader : null;
})();`;

let cleanedAsset = cleanModule(assetCode);

const gameCode = `
// --- CONFIGURAÇÃO DE TELA E RENDERER PARA NINTENDO SWITCH ---
const SCREEN_WIDTH = (typeof screen !== 'undefined' && screen.width) ? screen.width : (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280);
const SCREEN_HEIGHT = (typeof screen !== 'undefined' && screen.height) ? screen.height : (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 720);

// Cena e Câmera Principal
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1322);
scene.fog = new THREE.FogExp2(0x0a1322, 0.018);

const camera = new THREE.PerspectiveCamera(60, SCREEN_WIDTH / SCREEN_HEIGHT, 0.1, 150);
camera.position.set(28.8, 2.1, 0.0);

// Conecta diretamente com o hardware do Nintendo Switch (screen) ou fallback DOM
let mainCanvas = null;
let glContext = null;

if (typeof screen !== 'undefined' && typeof screen.getContext === 'function') {
  mainCanvas = screen;
  try {
    glContext = screen.getContext('webgl2') || screen.getContext('webgl');
  } catch (e) {
    console.warn('[Switch] Falha ao obter WebGL no screen:', e);
  }
} else if (typeof document !== 'undefined') {
  mainCanvas = document.createElement('canvas');
  if (document.body) {
    document.body.appendChild(mainCanvas);
  }
}

const rendererOptions = {
  antialias: true,
  powerPreference: 'high-performance',
};
if (mainCanvas) rendererOptions.canvas = mainCanvas;
if (glContext) rendererOptions.context = glContext;

const renderer = new THREE.WebGLRenderer(rendererOptions);
renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = false;

// 2D Canvas para renderização de HUD e Menus nativos no Switch
function create2DCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(w, h); } catch (e) {}
  }
  if (typeof Canvas !== 'undefined') {
    try { return new Canvas(w, h); } catch (e) {}
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    } catch (e) {}
  }
  return { width: w, height: h, getContext: () => null };
}

const uiCanvas = create2DCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
const uiCtx = (uiCanvas && typeof uiCanvas.getContext === 'function') ? uiCanvas.getContext('2d') : null;

// HUD Three.js Overlay Scene (Renderiza menus e textos por cima do WebGL no Switch)
const hudScene = new THREE.Scene();
const hudCamera = new THREE.OrthographicCamera(-SCREEN_WIDTH / 2, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, -SCREEN_HEIGHT / 2, 0, 30);
hudCamera.position.z = 10;
let uiTexture = null;
if (uiCtx) {
  try {
    uiTexture = new THREE.CanvasTexture(uiCanvas);
    uiTexture.minFilter = THREE.LinearFilter;
    uiTexture.magFilter = THREE.LinearFilter;
    const hudMaterial = new THREE.MeshBasicMaterial({ map: uiTexture, transparent: true, depthTest: false, depthWrite: false });
    const hudPlane = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), hudMaterial);
    hudScene.add(hudPlane);
  } catch (e) {
    console.warn('[Switch] HUD Texture não disponível:', e);
  }
}

// Controles de Câmera Orbitais (Menu e Modo Livre - com proteção)
let orbitControls = null;
try {
  if (renderer.domElement && typeof renderer.domElement.addEventListener === 'function' && typeof OrbitControls === 'function') {
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
    orbitControls.minDistance = 2.0;
    orbitControls.maxDistance = 24.0;
    orbitControls.target.set(25, 1.0, 0);
  }
} catch (e) {
  console.warn('[Switch] OrbitControls desativado no ambiente nativo');
}

let isThirdPerson = true;

// --- SISTEMA DE ÁUDIO NATIVO ---
let audioContext = null;
let currentBGM = null;
let currentBGMNode = null;
let currentBGMGain = null;
let isAudioUnlocked = false;

function getAudioContext() {
  try {
    if (!audioContext && (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined')) {
      const AudioCtx = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
      audioContext = new AudioCtx();
    }
  } catch (e) {}
  return audioContext;
}

function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try { ctx.resume(); } catch (e) {}
  }
  isAudioUnlocked = true;
}

function playSound(key, volume = 1.0, loop = false) {
  const ctx = getAudioContext();
  const buffer = assetManager.getSoundBuffer(key);
  if (!ctx || !buffer) return null;

  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    return { source, gain };
  } catch (e) {
    return null;
  }
}

const BGM_PLAYLIST = ['background1', 'background2', 'background3', 'background4', 'background5'];
let bgmOrder = [...BGM_PLAYLIST];
let bgmIndex = 0;

function shufflePlaylist() {
  for (let i = bgmOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bgmOrder[i], bgmOrder[j]] = [bgmOrder[j], bgmOrder[i]];
  }
}
shufflePlaylist();

function playMenuBGM() {
  stopGameplayBGM();
  if (currentBGM === 'menu') return;
  stopCurrentBGM();
  currentBGM = 'menu';
  const snd = playSound('menu', 0.55, true);
  if (snd) {
    currentBGMNode = snd.source;
    currentBGMGain = snd.gain;
  }
}

function stopMenuBGM() {
  if (currentBGM === 'menu') {
    stopCurrentBGM();
  }
}

function startGameplayBGM() {
  stopMenuBGM();
  if (currentBGM && currentBGM.startsWith('background')) return;
  playNextGameplayTrack();
}

function playNextGameplayTrack() {
  stopCurrentBGM();
  if (bgmIndex >= bgmOrder.length) {
    bgmIndex = 0;
    shufflePlaylist();
  }
  const trackKey = bgmOrder[bgmIndex];
  bgmIndex++;
  currentBGM = trackKey;
  const snd = playSound(trackKey, 0.48, false);
  if (snd) {
    currentBGMNode = snd.source;
    currentBGMGain = snd.gain;
    currentBGMNode.onended = () => {
      if (isGameStarted && !isGamePaused && !isPlayerDead) {
        currentBGM = null;
        playNextGameplayTrack();
      }
    };
  }
}

function pauseGameplayBGM() {
  if (currentBGMGain) {
    currentBGMGain.gain.value = 0.05;
  }
}

function stopGameplayBGM() {
  if (currentBGM && currentBGM.startsWith('background')) {
    stopCurrentBGM();
  }
}

function stopCurrentBGM() {
  if (currentBGMNode) {
    try {
      currentBGMNode.stop(0);
      currentBGMNode.disconnect();
    } catch (e) {}
    currentBGMNode = null;
  }
  currentBGMGain = null;
  currentBGM = null;
}

function playGunshotSound(weaponId) { playSound(weaponId === 'shotgun' ? 'gunshot_shotgun' : 'gunshot_pistol', 0.9); }
function playZombieHitSound() { playSound('zombie_hit', 0.85); }
function playZombieGroanSound() { playSound('zombie_groan', 0.7); }
function playZombieDeathSound(isBoss) { playSound(isBoss ? 'boss_roar' : 'zombie_death', 0.95); }
function playBossRoarSound() { playBossRoarSound = () => {}; playSound('boss_roar', 1.0); }
function playHurtSound() { playSound(selectedCharacter === 'jane' ? 'hurt_female' : 'hurt_male', 0.95); }
function playHealSound() { playSound(selectedCharacter === 'jane' ? 'heal_female' : 'heal_male', 0.9); }
function playReloadSound() { playSound('reload', 0.85); }
function playDryFireSound() { playSound('dryfire', 0.7); }
function playKeySound() { playSound('key', 0.85); }
function playDoorSound(isOpen) { playSound(isOpen ? 'door' : 'locked', 0.8); }
function playLockedSound() { playSound('locked', 0.8); }
function playJumpSound() { playSound('jump', 0.75); }
function playVictorySound() { playSound('victory', 1.0); }
function playSwitchSound() { playSound('switch', 0.8); }

// --- CENÁRIO: ILUMINAÇÃO & AMBIENTAÇÃO ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const combatFlashLight = new THREE.PointLight(0xfacc15, 0.0, 14.0, 1.2);
combatFlashLight.position.set(0, 1, 0);
scene.add(combatFlashLight);

const combatImpactLight = new THREE.PointLight(0x550005, 0.0, 7.0, 1.5);
combatImpactLight.position.set(0, 1, 0);
scene.add(combatImpactLight);

const ceilingLightPositions = [-24, -18, -12, -6, 0, 6, 12, 18, 24];
const corridorCeilingLights = [];

ceilingLightPositions.forEach(x => {
  const cLight = new THREE.PointLight(0x38bdf8, 1.0, 11.0, 1.4);
  cLight.position.set(x, 4.4, 0);
  scene.add(cLight);
  corridorCeilingLights.push(cLight);

  const bulb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  bulb.position.set(x, 4.7, 0);
  scene.add(bulb);
});

// Chão do Hotel
const floorGeo = new THREE.PlaneGeometry(62, 50);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.2 });
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.y = 0;
scene.add(floorMesh);

// Paredes e Colisores
const WALL_HEIGHT = 4.8;
const WALL_THICKNESS = 0.4;
const PLAYER_RADIUS = 0.42;
const wallsGroup = new THREE.Group();
const wallColliders = [];
const allWallMeshes = [];
const cameraRaycaster = new THREE.Raycaster();

function createWallSegment(w, h, d, x, y, z, wallName) {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.85,
    metalness: 0.1,
    transparent: true,
    opacity: 1.0,
  });
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  wallMesh.position.set(x, y, z);
  wallMesh.userData = { isWall: true, wallName, targetOpacity: 1.0 };
  wallsGroup.add(wallMesh);
  allWallMeshes.push(wallMesh);

  const trimHeight = 0.15;
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 1.0,
  });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w === WALL_THICKNESS ? w + 0.04 : w, trimHeight, d === WALL_THICKNESS ? d + 0.04 : d), trimMat);
  trim.position.set(x, trimHeight / 2, z);
  trim.userData = { isWall: true, wallName, targetOpacity: 1.0, parentWall: wallMesh };
  wallsGroup.add(trim);
  allWallMeshes.push(trim);
  wallMesh.userData.trim = trim;

  wallColliders.push({
    minX: x - w / 2 - PLAYER_RADIUS,
    maxX: x + w / 2 + PLAYER_RADIUS,
    minZ: z - d / 2 - PLAYER_RADIUS,
    maxZ: z + d / 2 + PLAYER_RADIUS,
    name: wallName || 'Parede',
  });
}

createWallSegment(60.6, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, -24.0, 'Parede Norte Hotel');
createWallSegment(60.6, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, 24.0, 'Parede Sul Hotel');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 48.6, -30.0, WALL_HEIGHT / 2, 0, 'Parede Oeste Hotel');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 21.5, 30.0, WALL_HEIGHT / 2, -13.25, 'Parede Leste Norte Hotel');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 21.5, 30.0, WALL_HEIGHT / 2, 13.25, 'Parede Leste Sul Hotel');

createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 20.4, -10.2, WALL_HEIGHT / 2, -13.8, 'Divisória Q101/Q102');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 20.4, 2.0, WALL_HEIGHT / 2, -13.8, 'Divisória Q102/Q103');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 20.4, -14.0, WALL_HEIGHT / 2, 13.8, 'Divisória Q104/Q105');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 20.4, 2.0, WALL_HEIGHT / 2, 13.8, 'Divisória Q105/Q106');

createWallSegment(9.6, WALL_HEIGHT, WALL_THICKNESS, -25.2, WALL_HEIGHT / 2, -3.6, 'Parede Q101 Esq');
createWallSegment(7.4, WALL_HEIGHT, WALL_THICKNESS, -13.9, WALL_HEIGHT / 2, -3.6, 'Parede Q101 Dir');
createWallSegment(2.8, WALL_HEIGHT, WALL_THICKNESS, -8.8, WALL_HEIGHT / 2, -3.6, 'Parede Q102 Esq');
createWallSegment(6.6, WALL_HEIGHT, WALL_THICKNESS, -1.3, WALL_HEIGHT / 2, -3.6, 'Parede Q102 Dir');
createWallSegment(5.6, WALL_HEIGHT, WALL_THICKNESS, 4.8, WALL_HEIGHT / 2, -3.6, 'Parede Q103 Esq');
createWallSegment(19.6, WALL_HEIGHT, WALL_THICKNESS, 20.2, WALL_HEIGHT / 2, -3.6, 'Parede Q103 Dir');

createWallSegment(7.6, WALL_HEIGHT, WALL_THICKNESS, -26.2, WALL_HEIGHT / 2, 3.6, 'Parede Q104 Esq');
createWallSegment(5.6, WALL_HEIGHT, WALL_THICKNESS, -16.8, WALL_HEIGHT / 2, 3.6, 'Parede Q104 Dir');
createWallSegment(1.6, WALL_HEIGHT, WALL_THICKNESS, -13.2, WALL_HEIGHT / 2, 3.6, 'Parede Q105 Esq');
createWallSegment(11.6, WALL_HEIGHT, WALL_THICKNESS, -3.8, WALL_HEIGHT / 2, 3.6, 'Parede Q105 Dir');
createWallSegment(9.6, WALL_HEIGHT, WALL_THICKNESS, 6.8, WALL_HEIGHT / 2, 3.6, 'Parede Q106 Esq');
createWallSegment(15.6, WALL_HEIGHT, WALL_THICKNESS, 22.2, WALL_HEIGHT / 2, 3.6, 'Parede Q106 Dir');
scene.add(wallsGroup);

const steppableBoxes = [];
function createBench(x, z, rotationY = 0, benchName = 'Banco do Hotel') {
  const benchGroup = new THREE.Group();
  benchGroup.position.set(x, 0, z);
  benchGroup.rotation.y = rotationY;
  const width = 2.6; const depth = 0.9; const height = 0.95;
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.4 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth), seatMat);
  seat.position.y = 0.48; benchGroup.add(seat);
  scene.add(benchGroup);
  const radX = (width / 2) * Math.abs(Math.cos(rotationY)) + (depth / 2) * Math.abs(Math.sin(rotationY));
  const radZ = (width / 2) * Math.abs(Math.sin(rotationY)) + (depth / 2) * Math.abs(Math.cos(rotationY));
  const bounds = { minX: x - radX, maxX: x + radX, minZ: z - radZ, maxZ: z + radZ, height, topY: 0.55, name: benchName };
  steppableBoxes.push(bounds);
  return bounds;
}

function createCrate(x, z, width, height, depth, color = 0x3b82f6, crateName = 'Caixa') {
  const crateGroup = new THREE.Group();
  crateGroup.position.set(x, height / 2, z);
  const boxMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), boxMat);
  crateGroup.add(boxMesh);
  scene.add(crateGroup);
  const bounds = { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, height, topY: height, name: crateName };
  steppableBoxes.push(bounds);
  return bounds;
}

function createSofa(x, z, rotationY = 0, sofaName = 'Sofá Luxo') {
  const sofaGroup = new THREE.Group();
  sofaGroup.position.set(x, 0, z);
  sofaGroup.rotation.y = rotationY;
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.4 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 1.4), leatherMat);
  seat.position.y = 0.4; sofaGroup.add(seat);
  scene.add(sofaGroup);
  const bounds = { minX: x - 1.6, maxX: x + 1.6, minZ: z - 0.7, maxZ: z + 0.7, height: 1.2, topY: 0.65, name: sofaName };
  steppableBoxes.push(bounds);
  return bounds;
}

createSofa(-23.0, -18.0, 0, 'Sofá Presidencial Q101');
createBench(-15.0, -10.0, Math.PI / 2, 'Banco Suíte Q101');
createCrate(-14.5, -17.5, 2.2, 1.4, 2.2, 0x0284c7, 'Mesa Executiva Q101');
createCrate(-4.0, -18.0, 2.0, 0.9, 1.4, 0x0284c7, 'Bancada Mármore Q102');
createBench(14.0, -18.0, 0, 'Sofá Tech Lounge Q103');
createCrate(8.5, -18.0, 2.4, 1.3, 2.4, 0xb45309, 'Degrau Servidores Q103');
createBench(-27.0, 10.0, Math.PI / 2, 'Banco do Jardim 1 Q104');
createBench(-16.0, 18.0, Math.PI, 'Banco do Jardim 2 Q104');
createCrate(-14.5, 14.5, 2.8, 1.5, 2.8, 0x15803d, 'Plataforma Botânica Q104');
createCrate(-11.0, 18.0, 1.6, 0.9, 1.2, 0x0284c7, 'Bancada Lavabo Q105');
createCrate(8.5, 18.0, 2.2, 1.5, 2.2, 0xec4899, 'Caixa Aperture Q106');
createCrate(15.0, 18.0, 2.6, 2.2, 2.6, 0x6366f1, 'Caixa Teste Q106');
createBench(24.0, 18.0, -Math.PI / 2, 'Banco Observação Q106');

// --- SISTEMA DE PERSONAGEM (JOGADOR) ---
const playerGroup = new THREE.Group();
playerGroup.position.set(25, 1.0, 0);

const fallbackGeo = new THREE.CapsuleGeometry(0.35, 1.1, 8, 16);
const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.2 });
const fallbackPlayerMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
fallbackPlayerMesh.position.set(0, -0.1, 0);
playerGroup.add(fallbackPlayerMesh);
let playerBody = fallbackPlayerMesh;

const playerLight = new THREE.PointLight(0xfff0e2, 5.5, 11.0, 1.1);
playerLight.position.set(0, 0.85, 0);
playerGroup.add(playerLight);

const playerWeaponGroup = new THREE.Group();
playerWeaponGroup.position.set(0.35, 0.25, 0.45);
playerGroup.add(playerWeaponGroup);
scene.add(playerGroup);

let selectedCharacter = 'jake';
let playerHealth = 100;
let MAX_PLAYER_HEALTH = 100;
let medkits = 0;
let isPlayerDead = false;
let invulnerableTimer = 0;
let isAiming = false;
let currentWeaponStance = 'unarmed';
let activePlayerAction = null;
let playerMixer = null;
let playerActions = {};

let jakeModelInstance = null;
let janeModelInstance = null;
let jakeMixer = null;
let janeMixer = null;
let jakeActions = {};
let janeActions = {};
let jakeRightHand = null;
let janeRightHand = null;

function updateActiveCharacterModel() {
  const activeChar = selectedCharacter || 'jake';
  if (jakeModelInstance) jakeModelInstance.visible = (activeChar === 'jake');
  if (janeModelInstance) janeModelInstance.visible = (activeChar === 'jane');

  if (activeChar === 'jane' && janeModelInstance) {
    playerBody = janeModelInstance;
    playerMixer = janeMixer;
    playerActions = janeActions;
    if (janeRightHand) janeRightHand.add(playerWeaponGroup);
    if (fallbackPlayerMesh) fallbackPlayerMesh.visible = false;
  } else if (activeChar === 'jake' && jakeModelInstance) {
    playerBody = jakeModelInstance;
    playerMixer = jakeMixer;
    playerActions = jakeActions;
    if (jakeRightHand) jakeRightHand.add(playerWeaponGroup);
    if (fallbackPlayerMesh) fallbackPlayerMesh.visible = false;
  }
}

function playPlayerAnim(actionName, duration = 0.2) {
  if (isPlayerDead && actionName !== 'death' && actionName !== 'dying') return;

  let mappedAction = actionName;
  if (actionName === 'death' || actionName === 'dying') {
    mappedAction = 'death';
  } else if (playerHealth <= 35 && (actionName === 'walk' || actionName === 'run') && !isAiming) {
    if (actionName === 'walk') mappedAction = 'injured_walk';
    if (actionName === 'run') mappedAction = 'injured_run';
  } else if (currentWeaponStance === 'pistol') {
    if (actionName === 'idle') mappedAction = 'pistol_idle';
    if (actionName === 'walk') mappedAction = (playerHealth <= 35 && !isAiming) ? 'injured_walk' : 'pistol_walk';
    if (actionName === 'run') mappedAction = (playerHealth <= 35 && !isAiming) ? 'injured_run' : 'pistol_run';
    if (actionName === 'shoot' || actionName === 'aim') mappedAction = 'shoot';
  } else if (currentWeaponStance === 'shotgun') {
    if (actionName === 'idle') mappedAction = 'rifle_idle';
    if (actionName === 'walk') mappedAction = (playerHealth <= 35 && !isAiming) ? 'injured_walk' : 'rifle_run';
    if (actionName === 'run') mappedAction = (playerHealth <= 35 && !isAiming) ? 'injured_run' : 'rifle_run';
    if (actionName === 'shoot' || actionName === 'aim') mappedAction = 'rifle_shoot';
  }

  if (!playerMixer || !playerActions[mappedAction]) mappedAction = actionName;
  if (!playerMixer || !playerActions[mappedAction]) return;

  const nextAction = playerActions[mappedAction];
  if (nextAction === activePlayerAction) return;

  nextAction.reset().fadeIn(duration).play();
  if (activePlayerAction) activePlayerAction.fadeOut(duration);
  activePlayerAction = nextAction;
}

// Carregamento de Recursos para Switch
assetManager.loadFBX('jake', 'assets/models/jake/jake.fbx');
assetManager.loadFBX('jane', 'assets/models/jane/jane.fbx');
assetManager.loadFBX('enemy1', 'assets/models/enemy1.fbx');
assetManager.loadFBX('enemy2', 'assets/models/enemy2.fbx');
assetManager.loadFBX('enemy3', 'assets/models/enemy3.fbx');
assetManager.loadFBX('enemy_boss', 'assets/models/enemy_boss.fbx');

assetManager.loadFBXAnimation('idle', 'assets/animacoes/Idle.fbx');
assetManager.loadFBXAnimation('idle_female', 'assets/animacoes/Idle_Female.fbx');
assetManager.loadFBXAnimation('idle_male', 'assets/animacoes/Idle_Male.fbx');
assetManager.loadFBXAnimation('walk_female', 'assets/animacoes/Walking_Female.fbx');
assetManager.loadFBXAnimation('walk_male', 'assets/animacoes/Walking_Male.fbx');
assetManager.loadFBXAnimation('run', 'assets/animacoes/run.fbx');
assetManager.loadFBXAnimation('jump', 'assets/animacoes/jump.fbx');
assetManager.loadFBXAnimation('shoot', 'assets/animacoes/Pistol_Shooting.fbx');
assetManager.loadFBXAnimation('reload', 'assets/animacoes/Reloading.fbx');
assetManager.loadFBXAnimation('death', 'assets/animacoes/Dying.fbx');
assetManager.loadFBXAnimation('dying', 'assets/animacoes/Dying.fbx');
assetManager.loadFBXAnimation('pistol_idle', 'assets/animacoes/Pistol Idle.fbx');
assetManager.loadFBXAnimation('pistol_walk', 'assets/animacoes/Pistol Walk.fbx');
assetManager.loadFBXAnimation('pistol_run', 'assets/animacoes/Pistol Run.fbx');
assetManager.loadFBXAnimation('rifle_idle', 'assets/animacoes/Rifle Idle.fbx');
assetManager.loadFBXAnimation('rifle_run', 'assets/animacoes/Rifle Run.fbx');
assetManager.loadFBXAnimation('rifle_shoot', 'assets/animacoes/Firing Rifle.fbx');
assetManager.loadFBXAnimation('injured_walk', 'assets/animacoes/Injured_Walking.fbx');
assetManager.loadFBXAnimation('injured_run', 'assets/animacoes/Injured_Run.fbx');

assetManager.loadFBXAnimation('enemy_idle', 'assets/animacoes/enemy_base/zombie idle.fbx');
assetManager.loadFBXAnimation('enemy_walk', 'assets/animacoes/enemy_base/zombie walk.fbx');
assetManager.loadFBXAnimation('enemy_run', 'assets/animacoes/enemy_base/zombie run.fbx');
assetManager.loadFBXAnimation('enemy_attack', 'assets/animacoes/enemy_base/zombie attack.fbx');
assetManager.loadFBXAnimation('enemy_death', 'assets/animacoes/enemy_base/zombie death.fbx');
assetManager.loadFBXAnimation('enemy_dying', 'assets/animacoes/enemy_base/zombie dying.fbx');
assetManager.loadFBXAnimation('enemy_biting', 'assets/animacoes/enemy_base/zombie biting.fbx');
assetManager.loadFBXAnimation('enemy_scream', 'assets/animacoes/enemy_base/zombie scream.fbx');

assetManager.loadModel('pistol', 'assets/models/pistol.glb');
assetManager.loadModel('shotgun', 'assets/models/shotgun.glb');

const gameSoundKeys = [
  'gunshot_pistol', 'gunshot_shotgun', 'gunshot', 'reload', 'dryfire', 'ammo',
  'hurt_male', 'hurt_female', 'hurt', 'heal_male', 'heal_female', 'heal',
  'zombie_hit', 'zombie_groan', 'zombie_death', 'boss_roar',
  'door', 'locked', 'key', 'switch', 'jump', 'victory', 'menu',
  'background1', 'background2', 'background3', 'background4', 'background5'
];
gameSoundKeys.forEach(k => assetManager.loadSound(k, k));

// --- ESTADOS DE JOGO ---
let isGameStarted = false;
let isGamePaused = false;
let currentScreen = 'start';
let startMenuSelection = 0;
let pauseMenuSelection = 0;
let diffMenuSelection = 1;
let promptMessage = '';
let promptTimer = 0;
let damageOverlayTimer = 0;
let healOverlayTimer = 0;

const DIFFICULTY_PRESETS = {
  easy: { name: 'Fácil', emoji: '🟢', speedMult: 0.70, hpMult: 0.70, damageMult: 0.75 },
  normal: { name: 'Normal', emoji: '🟡', speedMult: 1.00, hpMult: 1.00, damageMult: 1.00 },
  hard: { name: 'Difícil', emoji: '🔴', speedMult: 1.30, hpMult: 1.40, damageMult: 1.25 },
  nightmare: { name: 'Pesadelo', emoji: '💀', speedMult: 1.65, hpMult: 1.80, damageMult: 1.50 }
};

let currentDiffKey = 'normal';
let gameDifficulty = { ...DIFFICULTY_PRESETS.normal };

assetManager.manager.onLoad = () => {
  const setupChar = (key) => {
    const model = assetManager.models[key];
    if (!model) return null;
    let rightHand = null;
    let hasSkeleton = false;
    model.scale.set(0.018, 0.018, 0.018);
    model.position.set(0, -1.0, 0);
    model.traverse(c => {
      if (c.isSkinnedMesh) hasSkeleton = true;
      if (c.isBone && c.name) {
        c.name = c.name.replace(/.*mixamorig/g, 'mixamorig');
        if (!c.name.startsWith('mixamorig')) {
          c.name = 'mixamorig' + c.name.charAt(0).toUpperCase() + c.name.slice(1);
        }
        if (c.name === 'mixamorigRightHand') rightHand = c;
      }
    });
    playerGroup.add(model);
    let mixer = null;
    let actions = {};
    if (hasSkeleton) {
      mixer = new THREE.AnimationMixer(model);
      const isFemale = (key === 'jane');
      const anims = ['idle', 'walk', 'run', 'jump', 'shoot', 'reload', 'pistol_idle', 'pistol_walk', 'pistol_run', 'rifle_idle', 'rifle_run', 'rifle_shoot', 'death', 'dying', 'injured_walk', 'injured_run'];
      anims.forEach(animName => {
        let animKey = animName;
        if (animName === 'idle') animKey = isFemale ? 'idle_female' : 'idle_male';
        else if (animName === 'walk') animKey = isFemale ? 'walk_female' : 'walk_male';
        let clip = assetManager.getAnimation(animKey) || assetManager.getAnimation(animName);
        if (clip) {
          const clone = clip.clone();
          clone.tracks.forEach(track => {
            if (track && track.name) {
              track.name = track.name.replace(/.*mixamorig/g, 'mixamorig');
              if (track.name.includes('Hips.position')) {
                const values = track.values;
                const initialX = values[0] || 0;
                const initialY = values[1] || 0;
                const initialZ = values[2] || 0;
                for (let i = 0; i < values.length; i += 3) {
                  values[i] = initialX;
                  if (animName !== 'jump' && animName !== 'death' && animName !== 'dying') values[i + 1] = initialY;
                  values[i + 2] = initialZ;
                }
              }
            }
          });
          const action = mixer.clipAction(clone);
          if (['jump', 'shoot', 'reload', 'rifle_shoot', 'death', 'dying'].includes(animName)) {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
          }
          actions[animName] = action;
        }
      });
      if (actions['idle']) actions['idle'].play();
    }
    return { instance: model, mixer, actions, rightHand };
  };

  const jakeData = setupChar('jake');
  if (jakeData) {
    jakeModelInstance = jakeData.instance;
    jakeMixer = jakeData.mixer;
    jakeActions = jakeData.actions;
    jakeRightHand = jakeData.rightHand;
  }
  const janeData = setupChar('jane');
  if (janeData) {
    janeModelInstance = janeData.instance;
    janeMixer = janeData.mixer;
    janeActions = janeData.actions;
    janeRightHand = janeData.rightHand;
  }

  updateActiveCharacterModel();
  playMenuBGM();
};

updateActiveCharacterModel();
setTimeout(() => {
  if (!isGameStarted) {
    updateActiveCharacterModel();
    playMenuBGM();
  }
}, 1000);

// --- GAMEPAD & CONTROLES DO SWITCH ---
const prevGamepadButtons = {};

function isButtonJustPressed(gp, index, threshold = 0.5) {
  const btn = gp.buttons[index];
  const isPressed = btn ? (btn.pressed || btn.value > threshold) : false;
  const wasPressed = prevGamepadButtons[index] || false;
  prevGamepadButtons[index] = isPressed;
  return isPressed && !wasPressed;
}

function handleSwitchControls(delta) {
  if (!navigator.getGamepads) return;
  const gamepads = navigator.getGamepads();
  const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];
  if (!gp || !gp.connected) return;

  unlockAudio();

  // NAVEGAÇÃO DE MENUS
  if (currentScreen === 'start') {
    if (isButtonJustPressed(gp, 12)) startMenuSelection = (startMenuSelection - 1 + 3) % 3; // D-pad Up
    if (isButtonJustPressed(gp, 13)) startMenuSelection = (startMenuSelection + 1) % 3;     // D-pad Down
    if (isButtonJustPressed(gp, 4) || isButtonJustPressed(gp, 14)) { // L ou D-pad Left
      selectedCharacter = 'jake';
      updateActiveCharacterModel();
    }
    if (isButtonJustPressed(gp, 5) || isButtonJustPressed(gp, 15)) { // R ou D-pad Right
      selectedCharacter = 'jane';
      updateActiveCharacterModel();
    }
    if (isButtonJustPressed(gp, 0)) { // Botão A (Confirmar)
      if (startMenuSelection === 0) {
        startCampaign();
      } else if (startMenuSelection === 1) {
        currentScreen = 'difficulty';
      } else if (startMenuSelection === 2) {
        startTestRoom();
      }
    }
    return;
  }

  if (currentScreen === 'difficulty') {
    if (isButtonJustPressed(gp, 12)) diffMenuSelection = (diffMenuSelection - 1 + 4) % 4;
    if (isButtonJustPressed(gp, 13)) diffMenuSelection = (diffMenuSelection + 1) % 4;
    if (isButtonJustPressed(gp, 0)) {
      const keys = ['easy', 'normal', 'hard', 'nightmare'];
      currentDiffKey = keys[diffMenuSelection];
      gameDifficulty = { ...DIFFICULTY_PRESETS[currentDiffKey] };
      currentScreen = 'start';
    }
    if (isButtonJustPressed(gp, 1)) currentScreen = 'start'; // Botão B
    return;
  }

  if (currentScreen === 'pause') {
    if (isButtonJustPressed(gp, 12)) pauseMenuSelection = (pauseMenuSelection - 1 + 3) % 3;
    if (isButtonJustPressed(gp, 13)) pauseMenuSelection = (pauseMenuSelection + 1) % 3;
    if (isButtonJustPressed(gp, 0)) {
      if (pauseMenuSelection === 0) togglePause();
      else if (pauseMenuSelection === 1) restartGame();
      else if (pauseMenuSelection === 2) exitToMenu();
    }
    if (isButtonJustPressed(gp, 9) || isButtonJustPressed(gp, 1)) togglePause();
    return;
  }

  if (currentScreen === 'gameover' || currentScreen === 'victory') {
    if (isButtonJustPressed(gp, 0) || isButtonJustPressed(gp, 9)) {
      restartGame();
    }
    return;
  }

  // GAMEPLAY ATIVO
  if (isButtonJustPressed(gp, 9)) { // Botão + (Plus) -> Pausa
    togglePause();
    return;
  }

  const axisX = Math.abs(gp.axes[0]) > 0.18 ? gp.axes[0] : 0;
  const axisY = Math.abs(gp.axes[1]) > 0.18 ? gp.axes[1] : 0;
  const camAxisX = Math.abs(gp.axes[2]) > 0.18 ? gp.axes[2] : 0;
  const camAxisY = Math.abs(gp.axes[3]) > 0.18 ? gp.axes[3] : 0;

  cameraYaw -= camAxisX * 2.8 * delta;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - camAxisY * 2.4 * delta, -0.25, 1.15);

  const zlValue = gp.buttons[6] ? (gp.buttons[6].value || (gp.buttons[6].pressed ? 1 : 0)) : 0;
  isAiming = (zlValue > 0.3);

  if (isButtonJustPressed(gp, 7)) fireWeapon();
  if (isButtonJustPressed(gp, 3)) reloadWeapon();
  if (isButtonJustPressed(gp, 2)) useMedkit();
  if (isButtonJustPressed(gp, 0)) handleInteraction();
  if (isButtonJustPressed(gp, 1)) equipWeapon(null);

  if (isButtonJustPressed(gp, 14)) equipWeapon('revolver');
  if (isButtonJustPressed(gp, 15)) equipWeapon('shotgun');
  if (isButtonJustPressed(gp, 13)) equipWeapon(null);

  if (isButtonJustPressed(gp, 8)) {
    cameraDistance = cameraDistance >= 5.0 ? 2.8 : cameraDistance + 1.1;
  }

  const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
  const moveVec = new THREE.Vector3();
  moveVec.addScaledVector(right, axisX);
  moveVec.addScaledVector(forward, -axisY);

  const isMoving = moveVec.lengthSq() > 0.04;
  const isRunning = (gp.buttons[10] && gp.buttons[10].pressed) || moveVec.length() > 0.85;

  if (isMoving) {
    moveVec.normalize();
    const speed = isAiming ? 1.8 : (isRunning ? 4.1 : 2.8);
    playerGroup.position.x += moveVec.x * speed * delta;
    playerGroup.position.z += moveVec.z * speed * delta;

    const targetRot = Math.atan2(moveVec.x, moveVec.z);
    playerGroup.rotation.y = THREE.MathUtils.lerp(playerGroup.rotation.y, targetRot, delta * 12);

    playPlayerAnim(isRunning ? 'run' : 'walk');
  } else {
    playPlayerAnim(isAiming ? 'aim' : 'idle');
  }
}

let cameraYaw = -Math.PI / 2;
let cameraPitch = 0.20;
let cameraDistance = 3.8;
const currentCameraPos = new THREE.Vector3();
const currentLookAt = new THREE.Vector3();

function startCampaign() {
  isGameStarted = true;
  isGamePaused = false;
  currentScreen = 'gameplay';
  stopMenuBGM();
  startGameplayBGM();
}

function startTestRoom() {
  isGameStarted = true;
  isGamePaused = false;
  currentScreen = 'gameplay';
  playerGroup.position.set(200, 1.0, 200);
}

function togglePause() {
  isGamePaused = !isGamePaused;
  currentScreen = isGamePaused ? 'pause' : 'gameplay';
  if (isGamePaused) {
    pauseGameplayBGM();
    playMenuBGM();
  } else {
    stopMenuBGM();
    startGameplayBGM();
  }
}

function restartGame() {
  playerHealth = 100;
  isPlayerDead = false;
  isGamePaused = false;
  playerGroup.position.set(25, 1.0, 0);
  currentScreen = 'gameplay';
  stopMenuBGM();
  startGameplayBGM();
}

function exitToMenu() {
  isGameStarted = false;
  isGamePaused = false;
  currentScreen = 'start';
  stopGameplayBGM();
  playMenuBGM();
}

function fireWeapon() {
  if (!isAiming) {
    showPrompt('Segure [ZL] para Mirar antes de Atirar! 🎯');
    return;
  }
  playGunshotSound(currentWeaponStance);
}

function reloadWeapon() {
  playReloadSound();
  showPrompt('Arma Recarregada! 🔄');
}

function useMedkit() {
  if (medkits <= 0) {
    showPrompt('Sem medicamentos no inventário! 🚫');
    return;
  }
  medkits--;
  playerHealth = Math.min(100, playerHealth + 50);
  playHealSound();
  healOverlayTimer = 0.45;
  showPrompt('Saúde Restaurada (+50 HP) 💖');
}

function handleInteraction() {
  showPrompt('Nenhum item interativo próximo');
}

function equipWeapon(id) {
  currentWeaponStance = id || 'unarmed';
  showPrompt(id ? \`Equipou \${id.toUpperCase()} 🔫\` : 'Modo Desarmado 🖐️');
}

function showPrompt(msg) {
  promptMessage = msg;
  promptTimer = 2.5;
}

// --- RENDERIZADOR 2D DE INTERFACE PARA O NINTENDO SWITCH ---
function renderSwitchUI(delta) {
  if (!uiCtx) return;
  uiCtx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  if (damageOverlayTimer > 0) {
    damageOverlayTimer -= delta;
    uiCtx.fillStyle = \`rgba(180, 0, 0, \${damageOverlayTimer * 1.2})\`;
    uiCtx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }
  if (healOverlayTimer > 0) {
    healOverlayTimer -= delta;
    uiCtx.fillStyle = \`rgba(0, 180, 80, \${healOverlayTimer * 1.2})\`;
    uiCtx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  if (currentScreen === 'start') {
    uiCtx.fillStyle = 'rgba(2, 6, 18, 0.78)';
    uiCtx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    uiCtx.font = 'bold 38px sans-serif';
    uiCtx.fillStyle = '#38bdf8';
    uiCtx.textAlign = 'center';
    uiCtx.fillText('OUTBREAK HOTEL: KEY TO SURVIVAL', SCREEN_WIDTH / 2, 140);

    uiCtx.font = 'bold 18px sans-serif';
    uiCtx.fillStyle = '#94a3b8';
    uiCtx.fillText('🎮 NINTENDO SWITCH EDITION', SCREEN_WIDTH / 2, 175);

    uiCtx.font = '20px sans-serif';
    uiCtx.fillStyle = '#cbd5e1';
    uiCtx.fillText(\`Personagem: [ \${selectedCharacter === 'jake' ? '▶ JAKE ◀' : '  JAKE  '} ]    [ \${selectedCharacter === 'jane' ? '▶ JANE ◀' : '  JANE  '} ]\`, SCREEN_WIDTH / 2, 240);

    const options = [
      'INICIAR CAMPANHA',
      \`DIFICULDADE: \${gameDifficulty.emoji} \${gameDifficulty.name.toUpperCase()}\`,
      'SALA DE TESTES (SANDBOX)'
    ];

    options.forEach((opt, idx) => {
      const isSelected = (startMenuSelection === idx);
      const y = 330 + idx * 55;
      if (isSelected) {
        uiCtx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        uiCtx.fillRect(SCREEN_WIDTH / 2 - 220, y - 32, 440, 44);
        uiCtx.strokeStyle = '#38bdf8';
        uiCtx.lineWidth = 2;
        uiCtx.strokeRect(SCREEN_WIDTH / 2 - 220, y - 32, 440, 44);
        uiCtx.fillStyle = '#ffffff';
        uiCtx.font = 'bold 22px sans-serif';
        uiCtx.fillText(\`▶  \${opt}  ◀\`, SCREEN_WIDTH / 2, y);
      } else {
        uiCtx.fillStyle = '#94a3b8';
        uiCtx.font = '20px sans-serif';
        uiCtx.fillText(opt, SCREEN_WIDTH / 2, y);
      }
    });

    uiCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    uiCtx.fillRect(0, SCREEN_HEIGHT - 55, SCREEN_WIDTH, 55);
    uiCtx.font = '16px sans-serif';
    uiCtx.fillStyle = '#f8fafc';
    uiCtx.fillText('🔘 [A] Selecionar   •   🔘 [L/R] Alternar Personagem   •   🕹️ [D-Pad] Navegar', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 22);
    return;
  }

  if (currentScreen === 'difficulty') {
    uiCtx.fillStyle = 'rgba(2, 6, 18, 0.85)';
    uiCtx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    uiCtx.font = 'bold 32px sans-serif';
    uiCtx.fillStyle = '#38bdf8';
    uiCtx.textAlign = 'center';
    uiCtx.fillText('SELECIONE A DIFICULDADE', SCREEN_WIDTH / 2, 160);

    const diffs = [
      { name: 'FÁCIL 🟢', desc: 'Inimigos lentos e menos dano (0.7x)' },
      { name: 'NORMAL 🟡', desc: 'Experiência tática equilibrada padrão (1.0x)' },
      { name: 'DIFÍCIL 🔴', desc: 'Zumbis agressivos e recursos escassos (1.3x)' },
      { name: 'PESADELO 💀', desc: 'Sobrevivência extrema sem perdão (1.7x)' }
    ];

    diffs.forEach((d, idx) => {
      const isSel = (diffMenuSelection === idx);
      const y = 250 + idx * 70;
      if (isSel) {
        uiCtx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        uiCtx.fillRect(SCREEN_WIDTH / 2 - 250, y - 30, 500, 56);
        uiCtx.strokeStyle = '#38bdf8';
        uiCtx.lineWidth = 2;
        uiCtx.strokeRect(SCREEN_WIDTH / 2 - 250, y - 30, 500, 56);
      }
      uiCtx.fillStyle = isSel ? '#ffffff' : '#94a3b8';
      uiCtx.font = 'bold 20px sans-serif';
      uiCtx.fillText(d.name, SCREEN_WIDTH / 2, y);
      uiCtx.font = '14px sans-serif';
      uiCtx.fillStyle = '#64748b';
      uiCtx.fillText(d.desc, SCREEN_WIDTH / 2, y + 20);
    });

    uiCtx.fillStyle = '#f8fafc';
    uiCtx.font = '16px sans-serif';
    uiCtx.fillText('🔘 [A] Confirmar   •   🔘 [B] Voltar', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 35);
    return;
  }

  if (currentScreen === 'pause') {
    uiCtx.fillStyle = 'rgba(2, 6, 18, 0.75)';
    uiCtx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    uiCtx.font = 'bold 36px sans-serif';
    uiCtx.fillStyle = '#38bdf8';
    uiCtx.textAlign = 'center';
    uiCtx.fillText('JOGO PAUSADO', SCREEN_WIDTH / 2, 200);

    const pauseOpts = ['CONTINUAR', 'REINICIAR PARTIDA', 'SAIR PARA O MENU'];
    pauseOpts.forEach((opt, idx) => {
      const isSel = (pauseMenuSelection === idx);
      const y = 300 + idx * 60;
      uiCtx.fillStyle = isSel ? '#38bdf8' : '#94a3b8';
      uiCtx.font = isSel ? 'bold 24px sans-serif' : '20px sans-serif';
      uiCtx.fillText(isSel ? \`▶  \${opt}  ◀\` : opt, SCREEN_WIDTH / 2, y);
    });
    return;
  }

  if (currentScreen === 'gameplay') {
    uiCtx.textAlign = 'left';
    uiCtx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    uiCtx.fillRect(25, 25, 200, 55);
    uiCtx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    uiCtx.strokeRect(25, 25, 200, 55);

    const healthStatus = playerHealth > 65 ? 'FINE' : (playerHealth > 25 ? 'CAUTION' : (playerHealth > 0 ? 'DANGER' : 'DEAD'));
    const healthColor = playerHealth > 65 ? '#22c55e' : (playerHealth > 25 ? '#eab308' : '#ef4444');
    uiCtx.font = 'bold 16px sans-serif';
    uiCtx.fillStyle = healthColor;
    uiCtx.fillText(\`ECG: \${healthStatus}\`, 40, 50);

    uiCtx.font = '14px sans-serif';
    uiCtx.fillStyle = '#cbd5e1';
    uiCtx.fillText(\`HP: \${playerHealth}%\`, 40, 70);

    uiCtx.textAlign = 'right';
    uiCtx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    uiCtx.fillRect(SCREEN_WIDTH - 185, 25, 160, 55);
    uiCtx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    uiCtx.strokeRect(SCREEN_WIDTH - 185, 25, 160, 55);
    uiCtx.font = 'bold 15px sans-serif';
    uiCtx.fillStyle = '#38bdf8';
    uiCtx.fillText(\`💊 Medkit: \${medkits}\`, SCREEN_WIDTH - 45, 50);
    uiCtx.font = '12px sans-serif';
    uiCtx.fillStyle = '#94a3b8';
    uiCtx.fillText('[X] Curar (+50)', SCREEN_WIDTH - 45, 68);

    uiCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    uiCtx.fillRect(SCREEN_WIDTH - 240, SCREEN_HEIGHT - 95, 215, 75);
    uiCtx.strokeStyle = isAiming ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)';
    uiCtx.lineWidth = isAiming ? 2 : 1;
    uiCtx.strokeRect(SCREEN_WIDTH - 240, SCREEN_HEIGHT - 95, 215, 75);

    uiCtx.font = 'bold 16px sans-serif';
    uiCtx.fillStyle = currentWeaponStance !== 'unarmed' ? '#f8fafc' : '#94a3b8';
    uiCtx.fillText(currentWeaponStance === 'shotgun' ? 'Shotgun 12G 💥' : (currentWeaponStance === 'revolver' ? 'Magnum .357 🔫' : 'Desarmado 🖐️'), SCREEN_WIDTH - 45, SCREEN_HEIGHT - 65);

    uiCtx.font = '12px sans-serif';
    uiCtx.fillStyle = isAiming ? '#38bdf8' : '#64748b';
    uiCtx.fillText(isAiming ? '🎯 [ZL] Mirando • [ZR] Atirar' : '[ZL] Mirar • [Y] Recarregar', SCREEN_WIDTH - 45, SCREEN_HEIGHT - 38);

    if (isAiming) {
      uiCtx.strokeStyle = '#38bdf8';
      uiCtx.lineWidth = 2;
      uiCtx.beginPath();
      uiCtx.arc(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, 8, 0, Math.PI * 2);
      uiCtx.stroke();

      uiCtx.beginPath();
      uiCtx.moveTo(SCREEN_WIDTH / 2 - 16, SCREEN_HEIGHT / 2);
      uiCtx.lineTo(SCREEN_WIDTH / 2 - 4, SCREEN_HEIGHT / 2);
      uiCtx.moveTo(SCREEN_WIDTH / 2 + 4, SCREEN_HEIGHT / 2);
      uiCtx.lineTo(SCREEN_WIDTH / 2 + 16, SCREEN_HEIGHT / 2);
      uiCtx.moveTo(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 16);
      uiCtx.lineTo(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 4);
      uiCtx.moveTo(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 4);
      uiCtx.lineTo(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 16);
      uiCtx.stroke();
    }

    if (promptTimer > 0) {
      promptTimer -= delta;
      uiCtx.textAlign = 'center';
      uiCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      uiCtx.fillRect(SCREEN_WIDTH / 2 - 190, SCREEN_HEIGHT - 130, 380, 42);
      uiCtx.strokeStyle = '#38bdf8';
      uiCtx.strokeRect(SCREEN_WIDTH / 2 - 190, SCREEN_HEIGHT - 130, 380, 42);
      uiCtx.font = '15px sans-serif';
      uiCtx.fillStyle = '#f8fafc';
      uiCtx.fillText(promptMessage, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 104);
    }
  }
}

// --- LOOP PRINCIPAL DE ANIMAÇÃO ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);

  handleSwitchControls(delta);

  if (isThirdPerson && isGameStarted && !isGamePaused) {
    const playerTarget = playerGroup.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const offsetX = cameraDistance * Math.sin(cameraYaw) * Math.cos(cameraPitch);
    const offsetY = cameraDistance * Math.sin(cameraPitch);
    const offsetZ = cameraDistance * Math.cos(cameraYaw) * Math.cos(cameraPitch);

    let targetCameraPos = new THREE.Vector3(
      playerGroup.position.x + offsetX,
      playerGroup.position.y + offsetY + 1.2,
      playerGroup.position.z + offsetZ
    );

    const camDir = targetCameraPos.clone().sub(playerTarget);
    const desiredCamDist = camDir.length();
    if (desiredCamDist > 0.05) {
      camDir.normalize();
      cameraRaycaster.set(playerTarget, camDir);
      cameraRaycaster.far = desiredCamDist;
      cameraRaycaster.near = 0.05;
      const camWallHits = cameraRaycaster.intersectObjects(allWallMeshes, false);
      if (camWallHits.length > 0) {
        const safeDist = Math.max(0.85, camWallHits[0].distance - 0.28);
        targetCameraPos.copy(playerTarget).addScaledVector(camDir, safeDist);
      }
    }

    currentCameraPos.lerp(targetCameraPos, Math.min(1.0, 14.0 * delta));
    camera.position.copy(currentCameraPos);
    const lookTarget = playerGroup.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    currentLookAt.lerp(lookTarget, Math.min(1.0, 14.0 * delta));
    camera.lookAt(currentLookAt);

    for (const wall of allWallMeshes) wall.userData.targetOpacity = 1.0;
    const toCamVec = camera.position.clone().sub(playerTarget);
    if (toCamVec.length() > 0.05) {
      toCamVec.normalize();
      cameraRaycaster.set(playerTarget, toCamVec);
      cameraRaycaster.far = toCamVec.length() + 0.35;
      cameraRaycaster.near = 0.05;
      const occludingHits = cameraRaycaster.intersectObjects(allWallMeshes, false);
      for (const hit of occludingHits) {
        if (hit.object && hit.object.userData && hit.object.userData.isWall) {
          hit.object.userData.targetOpacity = 0.08;
          if (hit.object.userData.trim) hit.object.userData.trim.userData.targetOpacity = 0.08;
        }
      }
    }
    for (const wall of allWallMeshes) {
      if (wall.material) {
        const targetOp = wall.userData.targetOpacity !== undefined ? wall.userData.targetOpacity : 1.0;
        wall.material.opacity = THREE.MathUtils.lerp(wall.material.opacity, targetOp, delta * 14.0);
        wall.material.transparent = wall.material.opacity < 0.99;
      }
    }
  } else if (!isGameStarted) {
    if (orbitControls) {
      orbitControls.autoRotate = true;
      orbitControls.autoRotateSpeed = 1.0;
      orbitControls.update();
    }
  }

  if (playerMixer) playerMixer.update(delta);

  renderer.autoClear = false;
  renderer.clear();
  renderer.render(scene, camera);

  renderSwitchUI(delta);
  if (uiTexture) {
    uiTexture.needsUpdate = true;
    renderer.clearDepth();
    renderer.render(hudScene, hudCamera);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    unlockAudio();
    if (currentScreen === 'start') {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') startMenuSelection = (startMenuSelection - 1 + 3) % 3;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') startMenuSelection = (startMenuSelection + 1) % 3;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { selectedCharacter = 'jake'; updateActiveCharacterModel(); }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { selectedCharacter = 'jane'; updateActiveCharacterModel(); }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E') {
        if (startMenuSelection === 0) startCampaign();
        else if (startMenuSelection === 1) currentScreen = 'difficulty';
        else if (startMenuSelection === 2) startTestRoom();
      }
    } else if (currentScreen === 'difficulty') {
      if (e.key === 'ArrowUp') diffMenuSelection = (diffMenuSelection - 1 + 4) % 4;
      if (e.key === 'ArrowDown') diffMenuSelection = (diffMenuSelection + 1) % 4;
      if (e.key === 'Enter' || e.key === ' ') {
        const keys = ['easy', 'normal', 'hard', 'nightmare'];
        currentDiffKey = keys[diffMenuSelection];
        gameDifficulty = { ...DIFFICULTY_PRESETS[currentDiffKey] };
        currentScreen = 'start';
      }
      if (e.key === 'Escape' || e.key === 'Backspace') currentScreen = 'start';
    } else if (currentScreen === 'pause') {
      if (e.key === 'ArrowUp') pauseMenuSelection = (pauseMenuSelection - 1 + 3) % 3;
      if (e.key === 'ArrowDown') pauseMenuSelection = (pauseMenuSelection + 1) % 3;
      if (e.key === 'Enter' || e.key === ' ') {
        if (pauseMenuSelection === 0) togglePause();
        else if (pauseMenuSelection === 1) restartGame();
        else if (pauseMenuSelection === 2) exitToMenu();
      }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause();
    } else if (currentScreen === 'gameplay') {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause();
      if (e.key === '1') equipWeapon('revolver');
      if (e.key === '2') equipWeapon('shotgun');
      if (e.key === '3') equipWeapon(null);
      if (e.key === 'r' || e.key === 'R') reloadWeapon();
      if (e.key === 'x' || e.key === 'X') useMedkit();
      if (e.key === 'e' || e.key === 'E') handleInteraction();
    }
  });
}

animate();
`;

const bundleHeader = `// ==========================================
// OUTBREAK HOTEL - NINTENDO SWITCH STANDALONE BUNDLE
// Self-contained executable script for nx.js (Zero External Dependencies)
// ==========================================
`;

const bundledOutput = `${bundleHeader}

// --- THREE.JS CORE ---
${cleanedThree}

// --- FFLATE ZIP DECOMPRESSOR ---
${cleanedFflate}

// --- THREE.JS NURBS CURVE ---
${cleanedNurbs}

// --- THREE.JS CONTROLS & UTILS ---
${cleanedOrbit}
${cleanedSkeleton}

// --- THREE.JS LOADERS ---
${cleanedGltf}
${cleanedFbx}

// --- ASSET MANAGER ---
${cleanedAsset}

// --- OUTBREAK HOTEL GAME LOGIC ---
${gameCode}
`;

fs.writeFileSync(path.resolve(__dirname, 'switch/main.js'), bundledOutput, 'utf8');
fs.writeFileSync(path.resolve(__dirname, 'switch/OutbreakHotel.js'), bundledOutput, 'utf8');
fs.writeFileSync(path.resolve(__dirname, 'switch/Outbreak.js'), bundledOutput, 'utf8');

console.log('Standalone bundle generated successfully! Size: ' + (bundledOutput.length / 1024).toFixed(1) + ' KB');
