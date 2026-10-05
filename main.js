import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetManager } from './AssetManager.js';

// --- CONFIGURAÇÃO E CONSTANTES DO HOTEL ---
const ROOM_WIDTH = 60;
const ROOM_DEPTH = 48;
const WALL_HEIGHT = 4.8;
const WALL_THICKNESS = 0.6;
const PLAYER_RADIUS = 0.55;

// Limits seguros da cena
const BOUNDS = {
  minX: -(ROOM_WIDTH / 2) + (WALL_THICKNESS / 2) + PLAYER_RADIUS,
  maxX: (ROOM_WIDTH / 2) - (WALL_THICKNESS / 2) - PLAYER_RADIUS,
  minZ: -(ROOM_DEPTH / 2) + (WALL_THICKNESS / 2) + PLAYER_RADIUS,
  maxZ: (ROOM_DEPTH / 2) - (WALL_THICKNESS / 2) - PLAYER_RADIUS,
};

// --- INICIALIZAÇÃO DA CENA ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020306);
scene.fog = new THREE.FogExp2(0x020306, 0.125);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// --- AUDIO LISTENER ---
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02; // Iluminação geral reduzida em 30%
container.appendChild(renderer.domElement);

// Controles Orbitais
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.06;
orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
orbitControls.minDistance = 3;
orbitControls.maxDistance = 22;
orbitControls.enabled = false;

let isThirdPerson = true;

// --- EFEITOS SONOROS SINTETIZADOS VIA WEB AUDIO API ---
// Desativado temporariamente conforme feedback
const AUDIO_ENABLED = true; // Habilitando para testar se o travamento parou

let globalAudioCtx = null;
function getAudioContext() {
  if (!globalAudioCtx) {
    globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return globalAudioCtx;
}

// --- SISTEMA DE TRILHA SONORA (BGM: MENU & GAMEPLAY) ---
const menuBGM = new Audio('assets/sounds/menu.mp3');
menuBGM.loop = true;
menuBGM.volume = 0.20;

const GAMEPLAY_BGM_TRACKS = [
  'assets/sounds/background1.mp3',
  'assets/sounds/background2.mp3',
  'assets/sounds/background3.mp3',
  'assets/sounds/background4.mp3',
  'assets/sounds/background5.mp3'
];

let currentGameplayAudio = null;
let bgmPlaylistQueue = [];
let lastPlayedBgmTrack = null;

function shuffleArray(arr) {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function playMenuBGM() {
  if (!AUDIO_ENABLED) return;
  if (currentGameplayAudio) {
    try { currentGameplayAudio.pause(); } catch (e) { }
  }
  try {
    if (menuBGM.paused) {
      const p = menuBGM.play();
      if (p !== undefined) p.catch(() => { });
    }
  } catch (e) { }
}

function stopMenuBGM() {
  try {
    menuBGM.pause();
  } catch (e) { }
}

function playNextGameplayBGM() {
  if (!AUDIO_ENABLED || !isGameStarted || isGamePaused || isPlayerDead) return;

  if (bgmPlaylistQueue.length === 0) {
    bgmPlaylistQueue = shuffleArray(GAMEPLAY_BGM_TRACKS);
    if (bgmPlaylistQueue.length > 1 && bgmPlaylistQueue[0] === lastPlayedBgmTrack) {
      const temp = bgmPlaylistQueue[0];
      bgmPlaylistQueue[0] = bgmPlaylistQueue[1];
      bgmPlaylistQueue[1] = temp;
    }
  }

  const nextTrackPath = bgmPlaylistQueue.shift();
  lastPlayedBgmTrack = nextTrackPath;

  if (currentGameplayAudio) {
    currentGameplayAudio.onended = null;
    try { currentGameplayAudio.pause(); } catch (e) { }
    currentGameplayAudio = null;
  }

  currentGameplayAudio = new Audio(nextTrackPath);
  currentGameplayAudio.volume = 0.30;
  currentGameplayAudio.onended = () => {
    playNextGameplayBGM();
  };

  const p = currentGameplayAudio.play();
  if (p !== undefined) {
    p.catch(() => { });
  }
}

function startGameplayBGM() {
  if (!AUDIO_ENABLED) return;
  stopMenuBGM();

  if (currentGameplayAudio && currentGameplayAudio.paused && !currentGameplayAudio.ended && currentGameplayAudio.currentTime > 0) {
    const p = currentGameplayAudio.play();
    if (p !== undefined) {
      p.catch(() => playNextGameplayBGM());
    }
  } else {
    playNextGameplayBGM();
  }
}

function pauseGameplayBGM() {
  if (currentGameplayAudio) {
    try { currentGameplayAudio.pause(); } catch (e) { }
  }
}

function stopGameplayBGM() {
  if (currentGameplayAudio) {
    try {
      currentGameplayAudio.pause();
      currentGameplayAudio.currentTime = 0;
    } catch (e) { }
    currentGameplayAudio = null;
  }
  bgmPlaylistQueue = [];
}

// --- HELPER PARA TOCAR ARQUIVOS DE ÁUDIO (.mp3, .ogg, .m4a, .wav) ---
function playBetterAudio(key, volume = 0.5) {
  const buffer = assetManager.getSoundBuffer(key);
  if (buffer && typeof audioListener !== 'undefined') {
    try {
      const sound = new THREE.Audio(audioListener);
      sound.setBuffer(buffer);
      sound.setVolume(volume);
      sound.play();
      return true;
    } catch (e) {
      console.warn("Erro ao tocar áudio: ", e);
    }
  }
  return false;
}

function playSwitchSound(state) {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('switch')) return;
  return;
}

function playDoorSound(isOpen) {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('door')) return;
  return;
}

function playJumpSound() {
  if (selectedCharacter === 'jane') playPlayerAnim('jump', 0.1);
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('jump')) return;
  return;
}

function playKeySound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('key')) return;
  return;
}

function playLockedSound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('locked')) return;
  return;
}

function playVictorySound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('victory')) return;
  return;
}

function playGunshotSound(weaponType) {
  if (!AUDIO_ENABLED) return;
  if (weaponType === 'shotgun') {
    if (playBetterAudio('gunshot_shotgun', 0.5)) return;
  } else {
    if (playBetterAudio('gunshot_pistol', 0.5)) return;
  }
  if (playBetterAudio('gunshot', 0.5)) return;
  return;
}

function playReloadSound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('reload', 0.45)) return;
  return;
}

function playDryFireSound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('dryfire', 0.45)) return;
  return;
}

function playAmmoPickupSound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('ammo', 0.45)) return;
  return;
}

function playHurtSound() {
  if (!AUDIO_ENABLED) return;
  if (selectedCharacter === 'jane') {
    if (playBetterAudio('hurt_female', 0.5)) return;
  } else {
    if (playBetterAudio('hurt_male', 0.5)) return;
  }
  if (playBetterAudio('hurt', 0.5)) return;
  return;
}

function playHealSound() {
  if (!AUDIO_ENABLED) return;
  if (selectedCharacter === 'jane') {
    if (playBetterAudio('heal_female', 0.5)) return;
  } else {
    if (playBetterAudio('heal_male', 0.5)) return;
  }
  if (playBetterAudio('heal', 0.5)) return;
  return;
}

// Sons dos Zumbis com volume reduzido em 20% (0.40)
function playZombieHitSound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('zombie_hit', 0.40)) return;
  return;
}

function playZombieGroanSound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('zombie_groan', 0.40)) return;
  return;
}

function playZombieDeathSound(isBoss = false) {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('zombie_death', 0.40)) return;
  return;
}

function playBossRoarSound() {
  if (!AUDIO_ENABLED) return;
  if (playBetterAudio('boss_roar', 0.40)) return;
  return;
}

// --- SISTEMA DE ILUMINAÇÃO GERAL E POR AMBIENTE ---
const ambientLight = new THREE.AmbientLight(0x080d1a, 0.008);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x161f30, 0x01040f, 0.014);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff5ea, 0.02);
dirLight.position.set(15, 22, 12);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
const d = 25;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0004;
scene.add(dirLight);

// Luzes de Efeito de Combate (Pré-alocadas na cena com intensidade zero para evitar recompilação de shaders)
const combatFlashLight = new THREE.PointLight(0xfacc15, 0.0, 9.0);
scene.add(combatFlashLight);

const combatImpactLight = new THREE.PointLight(0xef4444, 0.0, 6.0);
scene.add(combatImpactLight);

// Dicionário de Ambientes e Iluminação por Sala
const roomEnvironments = {};
const switchClickables = [];

function registerRoomEnvironment(id, name, baseColor) {
  roomEnvironments[id] = {
    id,
    name,
    isLit: false,
    lights: [],
    lampMats: [],
    switchGroup: null,
    rocker: null,
    ledMat: null,
    ledLight: null,
    holoMat: null,
    baseColor,
  };
}

registerRoomEnvironment('corridor', 'Corredor Central', 0x38bdf8);
registerRoomEnvironment('q101', 'Q.101 (Suíte Presidencial)', 0xf59e0b);
registerRoomEnvironment('q102', 'Q.102 (Banheiro Luxo)', 0x06b6d4);
registerRoomEnvironment('q103', 'Q.103 (Tech Lab)', 0xa855f7);
registerRoomEnvironment('q104', 'Q.104 (Suíte Botânica)', 0x84cc16);
registerRoomEnvironment('q105', 'Q.105 (Lavabo Serviço)', 0xfef08a);
registerRoomEnvironment('q106', 'Q.106 (Câmara Testes)', 0xf8fafc);

// --- SISTEMA DE OSCILAÇÃO / TERROR NA LUZ DO CORREDOR ---
let corridorFlickerTimer = 0;
let corridorNextFlickerTime = 5.0 + Math.random() * 7.0; // Fica acesa entre 5 e 12 segundos
let corridorFlickerBugActive = false; // Se está no momento do apagão/falha
let corridorBugDuration = 4.0; // Duração da falha (3 a 8 segundos)

function toggleRoomEnvironmentLight(envId, forceState) {
  const env = roomEnvironments[envId];
  if (!env) return;

  // Se o corredor estiver no meio da oscilação/apagão (bug), o interruptor não responde
  if (envId === 'corridor' && corridorFlickerBugActive && !forceState) {
    playDryFireSound();
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (promptText) promptText.textContent = '⚡ Curto-circuito no corredor! O interruptor não responde...';
    setTimeout(() => {
      if (promptText && promptText.textContent.includes('Curto-circuito')) {
        if (interactionPrompt) interactionPrompt.classList.add('hidden');
      }
    }, 1800);
    return;
  }

  env.isLit = typeof forceState === 'boolean' ? forceState : !env.isLit;
  playSwitchSound(env.isLit);

  if (env.rocker) {
    env.rocker.rotation.x = env.isLit ? -0.22 : 0.22;
  }
  if (env.ledMat) {
    const col = env.isLit ? 0x22c55e : 0xef4444;
    env.ledMat.color.setHex(col);
    env.ledMat.emissive.setHex(col);
  }
  if (env.ledLight) {
    env.ledLight.color.setHex(env.isLit ? 0x22c55e : 0xef4444);
    env.ledLight.intensity = env.isLit ? 0.3 : 1.2;
  }
  if (env.holoMat) {
    env.holoMat.color.setHex(env.isLit ? env.baseColor : 0xf59e0b);
  }

  updateHUDLightStat();
}

function addLightToEnvironment(envId, lightObject, maxIntensity) {
  if (roomEnvironments[envId]) {
    lightObject.decay = 1.0;
    lightObject.userData.maxIntensity = maxIntensity;
    lightObject.intensity = 0.0;
    roomEnvironments[envId].lights.push(lightObject);
    scene.add(lightObject);
  }
}

function createCeilingLamp(envId, x, y, z, color) {
  const lampGroup = new THREE.Group();
  lampGroup.position.set(x, y, z);

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
  const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.1, 24), baseMat);
  lampGroup.add(baseMesh);

  const lensMat = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.0,
    roughness: 0.1,
  });
  const lensMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 24), lensMat);
  lensMesh.position.y = -0.06;
  lampGroup.add(lensMesh);

  scene.add(lampGroup);

  if (roomEnvironments[envId]) {
    roomEnvironments[envId].lampMats.push(lensMat);
  }
}

// --- CONSTRUTOR DE INTERRUPTOR FIXADO NA PAREDE ---
function createWallSwitch(envId, x, y, z, rotationY, labelText) {
  const env = roomEnvironments[envId];
  const switchGroup = new THREE.Group();
  switchGroup.position.set(x, y, z);
  switchGroup.rotation.y = rotationY;

  const switchPlateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.7 });
  const switchPlate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.54, 0.04), switchPlateMat);
  switchPlate.castShadow = true; switchPlate.receiveShadow = true;
  switchGroup.add(switchPlate);
  switchClickables.push(switchPlate);

  const switchFrameMat = new THREE.MeshStandardMaterial({ color: env ? env.baseColor : 0x38bdf8, roughness: 0.2, metalness: 0.9 });
  const switchFrame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.58, 0.015), switchFrameMat);
  switchFrame.position.z = -0.01;
  switchGroup.add(switchFrame);
  switchClickables.push(switchFrame);

  const rockerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.5 });
  const switchRocker = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.04), rockerMat);
  switchRocker.position.set(0, 0, 0.025);
  switchRocker.rotation.x = 0.22;
  switchRocker.castShadow = true;
  switchGroup.add(switchRocker);
  switchClickables.push(switchRocker);

  const ledGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16);
  ledGeo.rotateX(Math.PI / 2);
  const switchLedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.0, roughness: 0.2 });
  const switchLed = new THREE.Mesh(ledGeo, switchLedMat);
  switchLed.position.set(0, 0.18, 0.025);
  switchGroup.add(switchLed);
  switchClickables.push(switchLed);

  const switchLedLight = new THREE.PointLight(0xef4444, 1.1, 2.5);
  switchLedLight.position.set(0, 0.18, 0.06);
  switchGroup.add(switchLedLight);

  const holoGroup = new THREE.Group();
  holoGroup.position.set(0, 0.48, 0.08);
  const holoMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
  const holoRing = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 24), holoMat);
  holoGroup.add(holoRing);
  switchClickables.push(holoRing);

  const bulbIconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bulbIcon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), bulbIconMat);
  holoGroup.add(bulbIcon);
  switchGroup.add(holoGroup);

  switchGroup.userData = { envId, labelText };
  scene.add(switchGroup);

  if (env) {
    env.switchGroup = switchGroup;
    env.rocker = switchRocker;
    env.ledMat = switchLedMat;
    env.ledLight = switchLedLight;
    env.holoMat = holoMat;
  }

  return switchGroup;
}

// 1. Corredor Central (4 Luminárias de Teto)
for (let x = -22; x <= 22; x += 11) {
  createCeilingLamp('corridor', x, WALL_HEIGHT - 0.05, 0, 0x38bdf8);
  const pl = new THREE.PointLight(0x38bdf8, 8.5, 30);
  pl.position.set(x, WALL_HEIGHT - 0.4, 0);
  addLightToEnvironment('corridor', pl, 8.5);
}
createWallSwitch('corridor', -2.5, 1.65, -3.32, 0, 'Luz do Corredor');

// 2. Q.101 Suíte Presidencial
createCeilingLamp('q101', -23.0, WALL_HEIGHT - 0.05, -13.8, 0xf59e0b);
createCeilingLamp('q101', -14.0, WALL_HEIGHT - 0.05, -13.8, 0xf59e0b);
const q101Light1 = new THREE.PointLight(0xf59e0b, 11.0, 36);
q101Light1.position.set(-21.0, WALL_HEIGHT - 0.4, -13.8);
addLightToEnvironment('q101', q101Light1, 11.0);
const q101Light2 = new THREE.PointLight(0xf59e0b, 10.0, 34);
q101Light2.position.set(-14.0, WALL_HEIGHT - 0.4, -13.8);
addLightToEnvironment('q101', q101Light2, 10.0);
createWallSwitch('q101', -13.5, 1.65, -3.88, Math.PI, 'Luz Q.101');

// 3. Q.102 Banheiro Luxo
createCeilingLamp('q102', -6.0, WALL_HEIGHT - 0.05, -13.8, 0x06b6d4);
const q102Light = new THREE.PointLight(0x06b6d4, 10.5, 32);
q102Light.position.set(-6.0, WALL_HEIGHT - 0.4, -13.8);
addLightToEnvironment('q102', q102Light, 10.5);
createWallSwitch('q102', -1.5, 1.65, -3.88, Math.PI, 'Luz Q.102');

// 4. Q.103 Tech Lab
createCeilingLamp('q103', 7.0, WALL_HEIGHT - 0.05, -11.8, 0xa855f7);
const q103Light1 = new THREE.PointLight(0xa855f7, 11.0, 36);
q103Light1.position.set(7.0, WALL_HEIGHT - 0.4, -11.8);
addLightToEnvironment('q103', q103Light1, 11.0);
createCeilingLamp('q103', 21.0, WALL_HEIGHT - 0.05, -16.0, 0x38bdf8);
const q103Light2 = new THREE.PointLight(0x38bdf8, 10.5, 34);
q103Light2.position.set(21.0, WALL_HEIGHT - 0.4, -16.0);
addLightToEnvironment('q103', q103Light2, 10.5);
createWallSwitch('q103', 14.5, 1.65, -3.88, Math.PI, 'Luz Q.103');

// 5. Q.104 Suíte Botânica
createCeilingLamp('q104', -24.0, WALL_HEIGHT - 0.05, 11.8, 0x84cc16);
createCeilingLamp('q104', -16.0, WALL_HEIGHT - 0.05, 11.8, 0x84cc16);
const q104Light1 = new THREE.PointLight(0x84cc16, 11.0, 36);
q104Light1.position.set(-22.0, WALL_HEIGHT - 0.4, 11.8);
addLightToEnvironment('q104', q104Light1, 11.0);
const q104Light2 = new THREE.PointLight(0x84cc16, 10.0, 34);
q104Light2.position.set(-16.0, WALL_HEIGHT - 0.4, 11.8);
addLightToEnvironment('q104', q104Light2, 10.0);
createWallSwitch('q104', -16.5, 1.65, 3.88, 0, 'Luz Q.104');

// 6. Q.105 Lavabo
createCeilingLamp('q105', -11.0, WALL_HEIGHT - 0.05, 11.8, 0xfef08a);
const q105Light = new THREE.PointLight(0xfef08a, 10.0, 32);
q105Light.position.set(-11.0, WALL_HEIGHT - 0.4, 11.8);
addLightToEnvironment('q105', q105Light, 10.0);
createWallSwitch('q105', -6.5, 1.65, 3.88, 0, 'Luz Q.105');

// 7. Q.106 Câmara Testes
createCeilingLamp('q106', 9.0, WALL_HEIGHT - 0.05, 12.8, 0xf8fafc);
createCeilingLamp('q106', 22.0, WALL_HEIGHT - 0.05, 12.8, 0xf8fafc);
const q106Light1 = new THREE.PointLight(0xf8fafc, 12.5, 38);
q106Light1.position.set(9.0, WALL_HEIGHT - 0.4, 12.8);
addLightToEnvironment('q106', q106Light1, 12.5);
const q106Light2 = new THREE.PointLight(0xf8fafc, 11.5, 36);
q106Light2.position.set(22.0, WALL_HEIGHT - 0.4, 12.8);
addLightToEnvironment('q106', q106Light2, 11.5);
createWallSwitch('q106', 18.5, 1.65, 3.88, 0, 'Luz Q.106');

// --- TEXTURAS PROCEDIMENTAIS DE PISO ---
function createGridTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, 504, 504);
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 5); return texture;
}
function createWoodParquetTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1c1917'; ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 128) {
      const isAlt = (y / 64) % 2 === 0; const posX = isAlt ? x : (x + 64) % 512;
      ctx.fillStyle = (x + y) % 128 === 0 ? '#44403c' : '#292524'; ctx.fillRect(posX + 2, y + 2, 124, 60);
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 5); return texture;
}
function createMarbleTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.25)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 120); ctx.bezierCurveTo(140, 200, 280, 50, 512, 380); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 5); return texture;
}
function createBathroomTileTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'; ctx.lineWidth = 3;
  for (let i = 64; i < 512; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 2); return texture;
}
function createCorridorCarpetTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.4)'; ctx.fillRect(236, 0, 40, 512);
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(12, 2); return texture;
}

// --- PISOS DOS QUARTOS E CORREDOR ---
const floorGroup = new THREE.Group();

const corridorFloor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 7.2), new THREE.MeshStandardMaterial({ map: createCorridorCarpetTexture(), roughness: 0.6 }));
corridorFloor.position.set(0, -0.2, 0); corridorFloor.receiveShadow = true; floorGroup.add(corridorFloor);

const q101Floor = new THREE.Mesh(new THREE.BoxGeometry(19.8, 0.4, 20.4), new THREE.MeshStandardMaterial({ map: createMarbleTexture(), roughness: 0.3 }));
q101Floor.position.set(-20.1, -0.2, -13.8); q101Floor.receiveShadow = true; floorGroup.add(q101Floor);

const q102Floor = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.4, 20.4), new THREE.MeshStandardMaterial({ map: createBathroomTileTexture(), roughness: 0.2 }));
q102Floor.position.set(-4.1, -0.2, -13.8); q102Floor.receiveShadow = true; floorGroup.add(q102Floor);

const q103Floor = new THREE.Mesh(new THREE.BoxGeometry(28.0, 0.4, 20.4), new THREE.MeshStandardMaterial({ map: createGridTexture(), roughness: 0.5 }));
q103Floor.position.set(16.0, -0.2, -13.8); q103Floor.receiveShadow = true; floorGroup.add(q103Floor);

const q104Floor = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.4, 20.4), new THREE.MeshStandardMaterial({ map: createWoodParquetTexture(), roughness: 0.7 }));
q104Floor.position.set(-22.0, -0.2, 13.8); q104Floor.receiveShadow = true; floorGroup.add(q104Floor);

const q105Floor = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.4, 20.4), new THREE.MeshStandardMaterial({ map: createBathroomTileTexture(), roughness: 0.3 }));
q105Floor.position.set(-6.0, -0.2, 13.8); q105Floor.receiveShadow = true; floorGroup.add(q105Floor);

const q106Floor = new THREE.Mesh(new THREE.BoxGeometry(28.0, 0.4, 20.4), new THREE.MeshStandardMaterial({ map: createGridTexture(), roughness: 0.3 }));
q106Floor.position.set(16.0, -0.2, 13.8); q106Floor.receiveShadow = true; floorGroup.add(q106Floor);

scene.add(floorGroup);

const gridHelper = new THREE.GridHelper(60, 30, 0x38bdf8, 0x1e293b);
gridHelper.position.set(0, 0.005, 0);
scene.add(gridHelper);

// --- ESTRUTURA DE PAREDES COM ABERTURA REAL PARA AS PORTAS ---
const wallsGroup = new THREE.Group();
const wallColliders = [];
const allWallMeshes = [];
const cameraRaycaster = new THREE.Raycaster();

function createWallSegment(w, h, d, x, y, z, wallName) {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1e2638,
    roughness: 0.85,
    metalness: 0.1,
    transparent: true,
    opacity: 1.0,
  });
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  wallMesh.position.set(x, y, z);
  wallMesh.castShadow = true; wallMesh.receiveShadow = true;
  wallMesh.userData = { isWall: true, wallName, targetOpacity: 1.0 };
  wallsGroup.add(wallMesh);
  allWallMeshes.push(wallMesh);

  const trimHeight = 0.15;
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.4,
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

// Paredes Perimetrais Externas
createWallSegment(60.6, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, -24.0, 'Parede Norte Hotel');
createWallSegment(60.6, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, 24.0, 'Parede Sul Hotel');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 48.6, -30.0, WALL_HEIGHT / 2, 0, 'Parede Oeste Hotel');

// Parede Leste Hotel dividida para permitir o Portão de Saída Mestre
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 21.5, 30.0, WALL_HEIGHT / 2, -13.25, 'Parede Leste Norte Hotel');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 21.5, 30.0, WALL_HEIGHT / 2, 13.25, 'Parede Leste Sul Hotel');

// Divisórias Verticais Entre Quartos
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 20.4, -10.2, WALL_HEIGHT / 2, -13.8, 'Divisória Q101/Q102');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 20.4, 2.0, WALL_HEIGHT / 2, -13.8, 'Divisória Q102/Q103');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 20.4, -14.0, WALL_HEIGHT / 2, 13.8, 'Divisória Q104/Q105');
createWallSegment(WALL_THICKNESS, WALL_HEIGHT, 20.4, 2.0, WALL_HEIGHT / 2, 13.8, 'Divisória Q105/Q106');

// Paredes do Corredor Norte (Z = -3.6)
createWallSegment(9.6, WALL_HEIGHT, WALL_THICKNESS, -25.2, WALL_HEIGHT / 2, -3.6, 'Parede Q101 Esq');
createWallSegment(7.4, WALL_HEIGHT, WALL_THICKNESS, -13.9, WALL_HEIGHT / 2, -3.6, 'Parede Q101 Dir');
createWallSegment(2.8, WALL_HEIGHT, WALL_THICKNESS, -8.8, WALL_HEIGHT / 2, -3.6, 'Parede Q102 Esq');
createWallSegment(6.6, WALL_HEIGHT, WALL_THICKNESS, -1.3, WALL_HEIGHT / 2, -3.6, 'Parede Q102 Dir');
createWallSegment(5.6, WALL_HEIGHT, WALL_THICKNESS, 4.8, WALL_HEIGHT / 2, -3.6, 'Parede Q103 Esq');
createWallSegment(19.6, WALL_HEIGHT, WALL_THICKNESS, 20.2, WALL_HEIGHT / 2, -3.6, 'Parede Q103 Dir');

// Paredes do Corredor Sul (Z = 3.6)
createWallSegment(7.6, WALL_HEIGHT, WALL_THICKNESS, -26.2, WALL_HEIGHT / 2, 3.6, 'Parede Q104 Esq');
createWallSegment(5.6, WALL_HEIGHT, WALL_THICKNESS, -16.8, WALL_HEIGHT / 2, 3.6, 'Parede Q104 Dir');
createWallSegment(1.6, WALL_HEIGHT, WALL_THICKNESS, -13.2, WALL_HEIGHT / 2, 3.6, 'Parede Q105 Esq');
createWallSegment(11.6, WALL_HEIGHT, WALL_THICKNESS, -3.8, WALL_HEIGHT / 2, 3.6, 'Parede Q105 Dir');
createWallSegment(9.6, WALL_HEIGHT, WALL_THICKNESS, 6.8, WALL_HEIGHT / 2, 3.6, 'Parede Q106 Esq');
createWallSegment(15.6, WALL_HEIGHT, WALL_THICKNESS, 22.2, WALL_HEIGHT / 2, 3.6, 'Parede Q106 Dir');

scene.add(wallsGroup);

// --- SALA DE TESTES (SANDBOX LAB) ---
let isTestRoomMode = false;
const testRoomGroup = new THREE.Group();
const testRoomPuzzles = [];
const testRoomDummies = [];
const testRoomEnemies = [];

function createTestRoom() {
  const CENTER_X = 200;
  const CENTER_Z = 200;
  const ROOM_SIZE = 32;
  const WALL_H = 5.5;

  // 1. Chão com Grid Sci-Fi High-Tech
  const floorGeo = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
    metalness: 0.6,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CENTER_X, 0.01, CENTER_Z);
  floor.receiveShadow = true;
  testRoomGroup.add(floor);

  // Grade luminosa de teste no chão
  const grid = new THREE.GridHelper(ROOM_SIZE, 32, 0x38bdf8, 0x1e293b);
  grid.position.set(CENTER_X, 0.02, CENTER_Z);
  testRoomGroup.add(grid);

  // 2. Paredes Perimetrais do Sandbox
  const half = ROOM_SIZE / 2;
  const wallThickness = 0.8;

  const wallsDef = [
    { name: 'TestRoom_WallN', minX: CENTER_X - half, maxX: CENTER_X + half, minZ: CENTER_Z - half - wallThickness / 2, maxZ: CENTER_Z - half + wallThickness / 2, w: ROOM_SIZE, d: wallThickness, x: CENTER_X, z: CENTER_Z - half },
    { name: 'TestRoom_WallS', minX: CENTER_X - half, maxX: CENTER_X + half, minZ: CENTER_Z + half - wallThickness / 2, maxZ: CENTER_Z + half + wallThickness / 2, w: ROOM_SIZE, d: wallThickness, x: CENTER_X, z: CENTER_Z + half },
    { name: 'TestRoom_WallW', minX: CENTER_X - half - wallThickness / 2, maxX: CENTER_X - half + wallThickness / 2, minZ: CENTER_Z - half, maxZ: CENTER_Z + half, w: wallThickness, d: ROOM_SIZE, x: CENTER_X - half, z: CENTER_Z },
    { name: 'TestRoom_WallE', minX: CENTER_X + half - wallThickness / 2, maxX: CENTER_X + half + wallThickness / 2, minZ: CENTER_Z - half, maxZ: CENTER_Z + half, w: wallThickness, d: ROOM_SIZE, x: CENTER_X + half, z: CENTER_Z },
  ];

  wallsDef.forEach(w => {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.3,
      transparent: true,
      opacity: 1.0,
    });
    const geo = new THREE.BoxGeometry(w.w, WALL_H, w.d);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(w.x, WALL_H / 2, w.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { isWall: true, wallName: w.name, targetOpacity: 1.0 };
    testRoomGroup.add(mesh);
    allWallMeshes.push(mesh);

    // Registra colisor de parede para o jogador não sair da sala de testes
    wallColliders.push({
      name: w.name,
      minX: w.minX,
      maxX: w.maxX,
      minZ: w.minZ,
      maxZ: w.maxZ,
      disabled: false,
    });
  });

  // 3. Iluminação do Laboratório de Testes (Limpa, brilhante e agradável)
  const testAmbient = new THREE.AmbientLight(0xffffff, 0.45);
  testRoomGroup.add(testAmbient);

  const lightPositions = [
    { x: CENTER_X - 8, y: 5.0, z: CENTER_Z - 8 },
    { x: CENTER_X + 8, y: 5.0, z: CENTER_Z - 8 },
    { x: CENTER_X - 8, y: 5.0, z: CENTER_Z + 8 },
    { x: CENTER_X + 8, y: 5.0, z: CENTER_Z + 8 },
  ];

  lightPositions.forEach((lp) => {
    const pLight = new THREE.PointLight(0x38bdf8, 1.8, 20);
    pLight.position.set(lp.x, lp.y, lp.z);
    pLight.castShadow = true;
    testRoomGroup.add(pLight);

    const bulbGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(lp.x, 5.4, lp.z);
    testRoomGroup.add(bulb);
  });

  // 4. Painel Holográfico Central / Stand de Testes
  const standGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.8, 16);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.8 });
  const stand = new THREE.Mesh(standGeo, standMat);
  stand.position.set(CENTER_X, 0.4, CENTER_Z - 6);
  stand.castShadow = true;
  stand.receiveShadow = true;
  testRoomGroup.add(stand);

  const standRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  standRing.rotation.x = Math.PI / 2;
  standRing.position.set(CENTER_X, 0.78, CENTER_Z - 6);
  testRoomGroup.add(standRing);

  // Placa Holográfica / Banner
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 512;
  bannerCanvas.height = 128;
  const ctx = bannerCanvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🧪 SALA DE TESTES (SANDBOX)', 256, 55);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px sans-serif';
  ctx.fillText('Área para teste de mecânicas, armas e puzzles', 256, 95);

  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  const bannerGeo = new THREE.PlaneGeometry(6, 1.5);
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, side: THREE.DoubleSide });
  const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
  bannerMesh.position.set(CENTER_X, 3.2, CENTER_Z - half + 0.5);
  testRoomGroup.add(bannerMesh);

  scene.add(testRoomGroup);
}
createTestRoom();

// --- SISTEMA DE NÉVOA / OBSCURIDADE SOBRE QUARTOS TRANCADOS ---
const roomFogObjects = {};

function createRoomFogShroud(envId, x, y, z, w, h, d, doorX, doorZ, tintColor) {
  const fogGroup = new THREE.Group();

  const fogMat = new THREE.MeshBasicMaterial({
    color: tintColor || 0x060913,
    transparent: true,
    opacity: 0.96,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fogMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fogMat);
  fogMesh.position.set(x, y, z);
  fogGroup.add(fogMesh);

  const barrierMat = new THREE.MeshBasicMaterial({
    color: tintColor || 0x060913,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const barrierMesh = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.2, 0.5), barrierMat);
  barrierMesh.position.set(doorX, 1.6, doorZ);
  fogGroup.add(barrierMesh);

  scene.add(fogGroup);

  const fogObj = {
    envId,
    group: fogGroup,
    fogMat,
    barrierMat,
    targetOpacity: 0.96,
    isCleared: false,
  };

  roomFogObjects[envId] = fogObj;
  return fogObj;
}

createRoomFogShroud('q102', -4.1, WALL_HEIGHT / 2, -13.8, 11.8, WALL_HEIGHT - 0.2, 19.8, -6.0, -3.6, 0x031824);
createRoomFogShroud('q103', 16.0, WALL_HEIGHT / 2, -13.8, 27.4, WALL_HEIGHT - 0.2, 19.8, 9.0, -3.6, 0x160424);
createRoomFogShroud('q104', -22.0, WALL_HEIGHT / 2, 13.8, 15.4, WALL_HEIGHT - 0.2, 19.8, -21.0, 3.6, 0x081c04);
createRoomFogShroud('q105', -6.0, WALL_HEIGHT / 2, 13.8, 15.4, WALL_HEIGHT - 0.2, 19.8, -11.0, 3.6, 0x1f1a04);
createRoomFogShroud('q106', 16.0, WALL_HEIGHT / 2, 13.8, 27.4, WALL_HEIGHT - 0.2, 19.8, 13.0, 3.6, 0x121624);

function clearRoomFog(envId) {
  const fogObj = roomFogObjects[envId];
  if (fogObj && !fogObj.isCleared) {
    fogObj.isCleared = true;
    fogObj.targetOpacity = 0.0;
  }
}

// --- SISTEMA DE NÉVOA RASTEIRA 3D (CREEPING GROUND MIST) ---
function createMistTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 15, 128, 128, 120);
  grad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
  grad.addColorStop(0.35, 'rgba(30, 58, 138, 0.18)');
  grad.addColorStop(0.75, 'rgba(15, 23, 42, 0.08)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

const mistTexture = createMistTexture();
const mistMaterial = new THREE.MeshBasicMaterial({
  map: mistTexture,
  transparent: true,
  opacity: 0.70,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

const groundMistPlanes = [];

function createGroundMistZone(x, z, width, depth, count = 3) {
  const zoneGroup = new THREE.Group();
  zoneGroup.position.set(x, 0.2, z);

  for (let i = 0; i < count; i++) {
    const size = Math.max(width, depth) * (0.65 + Math.random() * 0.35);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mistMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(
      (Math.random() - 0.5) * (width * 0.45),
      0.08 + (i * 0.06),
      (Math.random() - 0.5) * (depth * 0.45)
    );
    plane.userData = {
      baseY: plane.position.y,
      rotSpeed: (Math.random() - 0.5) * 0.06,
      floatSpeed: 0.7 + Math.random() * 0.5,
      floatOffset: Math.random() * Math.PI * 2,
    };
    zoneGroup.add(plane);
    groundMistPlanes.push(plane);
  }

  scene.add(zoneGroup);
}

// 1. Névoa Rasteira no Corredor Central (3 trechos)
createGroundMistZone(-18, 0, 18, 6.5, 4);
createGroundMistZone(0, 0, 18, 6.5, 4);
createGroundMistZone(18, 0, 18, 6.5, 4);

// 2. Névoa Rasteira nos Quartos Norte
createGroundMistZone(-20.1, -13.8, 18, 18, 4); // Q.101 Suíte Presidencial
createGroundMistZone(-4.1, -13.8, 11, 18, 3);  // Q.102 Banheiro Luxo
createGroundMistZone(16.0, -13.8, 26, 18, 4);  // Q.103 Tech Lab

// 3. Névoa Rasteira nos Quartos Sul
createGroundMistZone(-22.0, 13.8, 15, 18, 4);  // Q.104 Suíte Botânica
createGroundMistZone(-6.0, 13.8, 15, 18, 3);   // Q.105 Lavabo
createGroundMistZone(16.0, 13.8, 26, 18, 5);   // Q.106 Câmara Testes (Chefe)

// --- SISTEMA DE INVENTÁRIO DE CHAVES ---
const acquiredKeys = new Set();

const KEY_DEFS = [
  { id: 'key_102', name: 'Chave do Escudo 🛡️', shortName: 'Escudo 🛡️', targetDoor: '102', badgeId: 'key-badge-102', color: 0x06b6d4, x: -14.5, y: 1.55, z: -17.5, roomName: 'Q.101 (Suíte Presidencial)' },
  { id: 'key_103', name: 'Chave da Espada ⚔️', shortName: 'Espada ⚔️', targetDoor: '103', badgeId: 'key-badge-103', color: 0xa855f7, x: -0.5, y: 1.05, z: -12.0, roomName: 'Q.102 (Banheiro Luxo)' },
  { id: 'key_104', name: 'Chave da Águia 🦅', shortName: 'Águia 🦅', targetDoor: '104', badgeId: 'key-badge-104', color: 0x84cc16, x: 8.5, y: 1.45, z: -18.0, roomName: 'Q.103 (Tech Lab)' },
  { id: 'key_105', name: 'Chave do Leão 🦁', shortName: 'Leão 🦁', targetDoor: '105', badgeId: 'key-badge-105', color: 0xfef08a, x: -27.0, y: 0.75, z: 10.0, roomName: 'Q.104 (Suíte Botânica)' },
  { id: 'key_106', name: 'Chave do Elmo 🪖', shortName: 'Elmo 🪖', targetDoor: '106', badgeId: 'key-badge-106', color: 0xf8fafc, x: -11.0, y: 1.05, z: 18.0, roomName: 'Q.105 (Lavabo)' },
  { id: 'key_master', name: 'Chave Mestre 👑', shortName: 'Mestre 👑', targetDoor: 'master', badgeId: 'key-badge-master', color: 0xfacc15, x: 16.0, y: 1.5, z: 12.0, roomName: 'Q.106 (Câmara Testes - Drop do Chefe)' },
];

const keyObjects = [];

function createCollectibleKey(def) {
  const keyGroup = new THREE.Group();
  keyGroup.position.set(def.x, def.y, def.z);

  const ringMat = new THREE.MeshStandardMaterial({
    color: def.color,
    metalness: 0.95,
    roughness: 0.15,
    emissive: def.color,
    emissiveIntensity: 0.5,
  });
  const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 16, 32), ringMat);
  ringMesh.rotation.x = Math.PI / 2;
  keyGroup.add(ringMesh);

  const shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 16), ringMat);
  shaftMesh.position.y = -0.3;
  keyGroup.add(shaftMesh);

  const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.035), ringMat);
  tooth1.position.set(0.06, -0.45, 0);
  keyGroup.add(tooth1);
  const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.035), ringMat);
  tooth2.position.set(0.05, -0.35, 0);
  keyGroup.add(tooth2);

  const haloMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const haloMesh = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.42, 24), haloMat);
  haloMesh.rotation.x = Math.PI / 2;
  keyGroup.add(haloMesh);

  scene.add(keyGroup);

  const keyObj = {
    def,
    group: keyGroup,
    initialY: def.y,
    isCollected: false,
  };
  keyObjects.push(keyObj);
  return keyObj;
}

// Spawna as chaves 102 a 106; a Chave Mestre (key_master) é dropada com a morte do Boss no Q.106
KEY_DEFS.filter(def => def.id !== 'key_master').forEach(def => createCollectibleKey(def));

function updateInventoryUI() {
  KEY_DEFS.forEach(def => {
    const badge = document.getElementById(def.badgeId);
    if (badge) {
      if (acquiredKeys.has(def.id)) {
        badge.className = def.id === 'key_master' ? 'key-badge key-master key-acquired' : 'key-badge key-acquired';
        badge.innerHTML = `<span>🔑 ${def.shortName}</span>`;
      } else {
        badge.className = def.id === 'key_master' ? 'key-badge key-master badge-locked' : 'key-badge badge-locked';
        badge.innerHTML = `<span>🔒 ${def.shortName}</span>`;
      }
    }
  });
}

function updateGoalHUD() {
  const statGoal = document.getElementById('stat-goal');
  if (!statGoal) return;

  if (!acquiredKeys.has('key_102')) {
    statGoal.textContent = 'Encontre a Chave do Escudo 🛡️ no Q.101 (Cuidado com a criatura!)';
  } else if (!acquiredKeys.has('key_103')) {
    statGoal.textContent = 'Abra o Q.102, pegue o Revólver 🔫 e a Chave da Espada ⚔️';
  } else if (!acquiredKeys.has('key_104')) {
    statGoal.textContent = 'Abra o Q.103 e elimine os inimigos para pegar a Chave da Águia 🦅';
  } else if (!acquiredKeys.has('key_105')) {
    statGoal.textContent = 'Abra o Q.104, pegue a Shotgun 💥 e a Chave do Leão 🦁';
  } else if (!acquiredKeys.has('key_106')) {
    statGoal.textContent = 'Abra o Q.105 e encontre a Chave do Elmo 🪖';
  } else if (!acquiredKeys.has('key_master')) {
    const bossEnemy = activeEnemies.find(e => e.isBoss);
    if (bossEnemy && !bossEnemy.isDead) {
      statGoal.textContent = '⚔️ DERROTE O GUARDIÃO DA CÂMARA NO Q.106 PARA OBTER A CHAVE MESTRE 👑!';
    } else {
      statGoal.textContent = 'Pegue a Chave Mestre 👑 dropada pelo Guardião!';
    }
  } else {
    statGoal.textContent = 'Vá até o final do corredor e abra a Porta Mestre para Escapar! 🚪✨';
  }
}

// --- SISTEMA DE SAÚDE DO JOGADOR E CURA (MEDKITS) ---
let playerHealth = 100;
const MAX_PLAYER_HEALTH = 100;
let medkits = 0;
let isPlayerDead = false;
let invulnerableTimer = 0;

function updatePlayerHealthUI() {
  const hpFill = document.getElementById('perm-health-fill');
  const healthStatus = document.getElementById('perm-health-status');
  const healthNum = document.getElementById('perm-health-num');
  const ecgIcon = document.getElementById('perm-ecg-icon');
  const medkitCount = document.getElementById('perm-medkit-count');
  const medkitBtn = document.getElementById('perm-medkit-btn');

  const pct = Math.max(0, Math.min(100, (playerHealth / MAX_PLAYER_HEALTH) * 100));

  if (hpFill) {
    hpFill.style.width = `${pct}%`;
    hpFill.className = 'health-bar-fill';
    if (playerHealth > 60) hpFill.classList.add('fine-fill');
    else if (playerHealth > 25) hpFill.classList.add('caution-fill');
    else hpFill.classList.add('danger-fill');
  }

  if (healthStatus && healthNum) {
    healthNum.textContent = `${Math.ceil(playerHealth)} / ${MAX_PLAYER_HEALTH}`;
    if (playerHealth > 60) {
      healthStatus.textContent = 'FINE';
      healthStatus.className = 'health-status-badge fine';
      if (ecgIcon) ecgIcon.textContent = '💚';
    } else if (playerHealth > 25) {
      healthStatus.textContent = 'CAUTION';
      healthStatus.className = 'health-status-badge caution';
      if (ecgIcon) ecgIcon.textContent = '💛';
    } else if (playerHealth > 0) {
      healthStatus.textContent = 'DANGER';
      healthStatus.className = 'health-status-badge danger';
      if (ecgIcon) ecgIcon.textContent = '❤️';
    } else {
      healthStatus.textContent = 'DEAD';
      healthStatus.className = 'health-status-badge danger';
      if (ecgIcon) ecgIcon.textContent = '💀';
    }
  }

  if (medkitCount) {
    medkitCount.textContent = `${medkits}`;
  }

  if (medkitBtn) {
    medkitBtn.style.opacity = (medkits > 0 && playerHealth < 100) ? '1' : '0.55';
  }
}

function damagePlayer(amount, enemyName = 'Criatura') {
  if (isPlayerDead || invulnerableTimer > 0) return;

  playerHealth = Math.max(0, playerHealth - amount);
  invulnerableTimer = 0.8;

  playHurtSound();

  // Partículas 3D abundantes de sangue espirrando do jogador
  const playerHitPos = playerGroup.position.clone().add(new THREE.Vector3(0, 0.9, 0));
  const sprayDir = new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.0, (Math.random() - 0.5) * 0.6).normalize();
  spawnBloodSplatter(playerHitPos, sprayDir, 35, false);

  // Flash vermelho na tela
  const dmgOverlay = document.getElementById('screen-damage-overlay');
  if (dmgOverlay) {
    dmgOverlay.classList.remove('active');
    void dmgOverlay.offsetWidth;
    dmgOverlay.classList.add('active');
    setTimeout(() => dmgOverlay.classList.remove('active'), 350);
  }

  updatePlayerHealthUI();

  if (playerHealth <= 0) {
    isPlayerDead = true;
    velocity.set(0, 0, 0);
    inputVector.set(0, 0, 0);
    keys.w = keys.a = keys.s = keys.d = keys.space = keys.shift = false;
    touchMoveX = 0;
    touchMoveY = 0;
    mouseAiming = gamepadAiming = keyAiming = touchAiming = false;
    isAiming = false;
    if (typeof aimImpactDotMesh !== 'undefined' && aimImpactDotMesh) aimImpactDotMesh.visible = false;
    playZombieDeathSound(false);
    playPlayerAnim('death', 0.2);
    stopGameplayBGM();
    // Aguarda 5 segundos para a animação de morte completa do personagem antes do Game Over
    setTimeout(() => {
      const gameOverModal = document.getElementById('game-over-modal');
      if (gameOverModal) gameOverModal.classList.remove('hidden');
      playMenuBGM();
    }, 5000);
  }
}

function useMedkit() {
  if (isPlayerDead) return;
  if (medkits <= 0) {
    playDryFireSound();
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (promptText) promptText.textContent = 'Sem Medicamentos no inventário! Procure nos quartos 💊';
    return;
  }
  if (playerHealth >= MAX_PLAYER_HEALTH) {
    playDryFireSound();
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (promptText) promptText.textContent = 'Saúde já está no MÁXIMO! (100%) ✨';
    return;
  }

  medkits--;
  playerHealth = Math.min(MAX_PLAYER_HEALTH, playerHealth + 50);
  playHealSound();

  // Flash verde de cura na tela
  const healOverlay = document.getElementById('screen-heal-overlay');
  if (healOverlay) {
    healOverlay.classList.remove('active');
    void healOverlay.offsetWidth;
    healOverlay.classList.add('active');
    setTimeout(() => healOverlay.classList.remove('active'), 450);
  }

  updatePlayerHealthUI();
  if (interactionPrompt) interactionPrompt.classList.remove('hidden');
  if (promptText) promptText.textContent = `Medicamento Usado! Saúde Restaurada (+50 HP) 💖`;
}

// --- SISTEMA DE MEDKITS 3D COLETÁVEIS ---
const collectibleMedkits = [];

function createCollectibleMedkit(id, x, y, z, roomName) {
  const medGroup = new THREE.Group();
  medGroup.position.set(x, y, z);

  // Caixa Branca
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.1 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.2), boxMat);
  box.castShadow = true;
  medGroup.add(box);

  // Cruz Vermelha Frontal e Traseira
  const crossMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2, emissive: 0xef4444, emissiveIntensity: 0.6 });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.21), crossMat);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.21), crossMat);
  medGroup.add(crossV);
  medGroup.add(crossH);

  const haloMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.45, 24), haloMat);
  halo.rotation.x = Math.PI / 2;
  medGroup.add(halo);

  scene.add(medGroup);

  const medObj = { id, name: 'Medicamento 💊', group: medGroup, initialY: y, isCollected: false, roomName, x, y, z };
  collectibleMedkits.push(medObj);
  return medObj;
}

// Spawns dos Medkits nos quartos
createCollectibleMedkit('med_102', -7.5, 1.15, -15.5, 'Q.102 (Banheiro Luxo)');
createCollectibleMedkit('med_104', -27.0, 0.75, 18.0, 'Q.104 (Suíte Botânica)');
createCollectibleMedkit('med_105', -11.0, 1.05, 12.0, 'Q.105 (Lavabo)');

// --- SISTEMA DE ARMAS E MUNIÇÕES (RESIDENT EVIL INSPIRED) ---
const weaponInventory = {
  revolver: {
    id: 'revolver',
    name: 'Revólver 🔫',
    badgeId: 'badge-weapon-revolver',
    isAcquired: false,
    maxMag: 6,
    loadedAmmo: 0,
    reserveAmmo: 0,
    color: 0x94a3b8,
    mesh: null,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun 💥',
    badgeId: 'badge-weapon-shotgun',
    isAcquired: false,
    maxMag: 4,
    loadedAmmo: 0,
    reserveAmmo: 0,
    color: 0xf97316,
    mesh: null,
  },
};

let equippedWeaponId = null;

const collectibleWeapons = [];
const collectibleAmmoBoxes = [];

// Criar Armas 3D Coletáveis no Cenário
function createCollectibleWeapon(id, name, x, y, z, color, roomName) {
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(x, y, z);

  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.2, emissive: color, emissiveIntensity: 0.4 });

  if (id === 'revolver') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 16), mat);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(0.15, 0, 0); weaponGroup.add(barrel);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 16), mat);
    cylinder.position.set(-0.02, 0, 0); weaponGroup.add(cylinder);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 }));
    grip.position.set(-0.1, -0.1, 0); grip.rotation.z = -0.3; weaponGroup.add(grip);
  } else {
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 16), mat);
    barrel1.rotation.z = Math.PI / 2; barrel1.position.set(0.2, 0.03, 0); weaponGroup.add(barrel1);
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 16), mat);
    barrel2.rotation.z = Math.PI / 2; barrel2.position.set(0.2, -0.03, 0); weaponGroup.add(barrel2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 }));
    stock.position.set(-0.3, -0.05, 0); weaponGroup.add(stock);
  }

  const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 24), haloMat);
  halo.rotation.x = Math.PI / 2; weaponGroup.add(halo);

  scene.add(weaponGroup);

  const wObj = { id, name, group: weaponGroup, initialY: y, isCollected: false, roomName, x, y, z };
  collectibleWeapons.push(wObj);
  return wObj;
}

// Criar Caixas de Munição 3D Coletáveis
function createCollectibleAmmoBox(id, type, amount, x, y, z, roomName) {
  const boxGroup = new THREE.Group();
  boxGroup.position.set(x, y, z);

  const color = type === 'revolver' ? 0x38bdf8 : 0xef4444;
  const boxMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6, emissive: color, emissiveIntensity: 0.3 });
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), boxMat);
  boxMesh.castShadow = true; boxGroup.add(boxMesh);

  scene.add(boxGroup);

  const aObj = { id, type, amount, group: boxGroup, initialY: y, isCollected: false, roomName, x, y, z };
  collectibleAmmoBoxes.push(aObj);
  return aObj;
}

// Spawns das Armas (Revólver no Banheiro Luxo Q102 / Shotgun na Suíte Botânica Q104)
createCollectibleWeapon('revolver', 'Revólver 🔫', -4.0, 1.15, -18.0, 0x38bdf8, 'Q.102 (Banheiro Luxo)');
createCollectibleWeapon('shotgun', 'Shotgun 💥', -14.5, 1.75, 14.5, 0xf97316, 'Q.104 (Suíte Botânica)');

// Spawns das Caixas de Munição espalhadas (Distribuídas em cantos e móveis distintos)
createCollectibleAmmoBox('ammo_rev_1', 'revolver', 6, -23.0, 0.75, -18.0, 'Q.101 (Suíte Presidencial - Sofá)');
createCollectibleAmmoBox('ammo_rev_2', 'revolver', 6, 14.0, 0.65, -18.0, 'Q.103 (Tech Lab - Lounge)');
createCollectibleAmmoBox('ammo_rev_3', 'revolver', 6, -4.5, 0.65, 12.0, 'Q.105 (Lavabo - Nicho)');

createCollectibleAmmoBox('ammo_sht_1', 'shotgun', 4, 23.0, 0.85, -12.0, 'Q.103 (Tech Lab - Terminal)');
createCollectibleAmmoBox('ammo_sht_2', 'shotgun', 4, -7.0, 0.55, 19.5, 'Q.105 (Lavabo - Bancada)');
createCollectibleAmmoBox('ammo_sht_3', 'shotgun', 4, 8.5, 1.65, 18.0, 'Q.106 (Câmara Testes - Caixa)');

// Modelos 3D de Armas empunhadas no Personagem
const playerWeaponGroup = new THREE.Group();
playerWeaponGroup.position.set(0.35, 0.25, 0.45);

const playerRevolverMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
const playerRevolverMesh = new THREE.Group();
const revBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 12), playerRevolverMat);
revBarrel.rotation.x = Math.PI / 2; revBarrel.position.set(0, 0, 0.15); playerRevolverMesh.add(revBarrel);
const revCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), playerRevolverMat);
revCyl.rotation.x = Math.PI / 2; revCyl.position.set(0, -0.02, 0); playerRevolverMesh.add(revCyl);
const revGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.05), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 }));
revGrip.position.set(0, -0.08, -0.05); revGrip.rotation.x = -0.3; playerRevolverMesh.add(revGrip);
playerRevolverMesh.visible = false;
playerWeaponGroup.add(playerRevolverMesh);
weaponInventory.revolver.mesh = playerRevolverMesh;

const playerShotgunMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
const playerShotgunMesh = new THREE.Group();
const shtBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 12), playerShotgunMat);
shtBarrel.rotation.x = Math.PI / 2; shtBarrel.position.set(0, 0, 0.3); playerShotgunMesh.add(shtBarrel);
const shtStock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 }));
shtStock.position.set(0, -0.04, -0.12); playerShotgunMesh.add(shtStock);
playerShotgunMesh.visible = false;
playerWeaponGroup.add(playerShotgunMesh);
weaponInventory.shotgun.mesh = playerShotgunMesh;

function updateWeaponsUI() {
  const badgeRev = document.getElementById('badge-weapon-revolver');
  const badgeSht = document.getElementById('badge-weapon-shotgun');
  const equippedName = document.getElementById('weapon-equipped-name');
  const ammoDisplay = document.getElementById('weapon-ammo-display');
  const ammoCountRev = document.getElementById('ammo-count-revolver');
  const ammoCountSht = document.getElementById('ammo-count-shotgun');

  // Elementos do Mostrador Permanente (Sempre Visível)
  const permHud = document.getElementById('permanent-weapon-hud');
  const permIcon = document.getElementById('perm-weapon-icon');
  const permStatus = document.getElementById('perm-weapon-status');
  const permName = document.getElementById('perm-weapon-name');
  const permAmmoMag = document.getElementById('perm-ammo-mag');
  const permAmmoRes = document.getElementById('perm-ammo-res');
  const permAmmoLabel = document.getElementById('perm-ammo-label');

  const wRev = weaponInventory.revolver;
  const wSht = weaponInventory.shotgun;

  if (ammoCountRev) ammoCountRev.textContent = `${wRev.loadedAmmo} + ${wRev.reserveAmmo}`;
  if (ammoCountSht) ammoCountSht.textContent = `${wSht.loadedAmmo} + ${wSht.reserveAmmo}`;

  if (badgeRev) {
    if (wRev.isAcquired) {
      badgeRev.className = equippedWeaponId === 'revolver' ? 'weapon-badge active-equipped' : 'weapon-badge acquired';
      badgeRev.innerHTML = `<span>🔫 Revólver</span>`;
    } else {
      badgeRev.className = 'weapon-badge';
      badgeRev.innerHTML = `<span>🔒 Revólver</span>`;
    }
  }

  if (badgeSht) {
    if (wSht.isAcquired) {
      badgeSht.className = equippedWeaponId === 'shotgun' ? 'weapon-badge active-equipped' : 'weapon-badge acquired';
      badgeSht.innerHTML = `<span>💥 Shotgun</span>`;
    } else {
      badgeSht.className = 'weapon-badge';
      badgeSht.innerHTML = `<span>🔒 Shotgun</span>`;
    }
  }

  // Atualização do Painel Interno da HUD
  if (equippedName && ammoDisplay) {
    if (equippedWeaponId === 'revolver') {
      equippedName.className = 'weapon-equipped-badge';
      equippedName.textContent = 'Revólver 🔫';
      ammoDisplay.textContent = `${wRev.loadedAmmo} / ${wRev.reserveAmmo}`;
    } else if (equippedWeaponId === 'shotgun') {
      equippedName.className = 'weapon-equipped-badge shotgun-active';
      equippedName.textContent = 'Shotgun 💥';
      ammoDisplay.textContent = `${wSht.loadedAmmo} / ${wSht.reserveAmmo}`;
    } else {
      equippedName.className = 'weapon-equipped-badge unequipped';
      equippedName.textContent = 'Desarmado 🖐️';
      ammoDisplay.textContent = '-- / --';
    }
  }

  // Atualização do Mostrador Permanente Externo
  if (permHud) {
    if (equippedWeaponId === 'revolver') {
      const isEmpty = wRev.loadedAmmo === 0;
      permHud.className = `permanent-weapon-hud glass-panel weapon-revolver-active ${isEmpty ? 'ammo-empty' : ''}`;
      if (permIcon) permIcon.textContent = '🔫';
      if (permStatus) permStatus.textContent = isEmpty ? 'Pente Vazio (R / [RB])' : (isAiming ? 'Mirando / Pronta ([RT])' : 'Armada (Segure [LT] / RMB)');
      if (permName) permName.textContent = 'Magnum .357';
      if (permAmmoMag) permAmmoMag.textContent = `${wRev.loadedAmmo}`;
      if (permAmmoRes) permAmmoRes.textContent = `${wRev.reserveAmmo}`;
      if (permAmmoLabel) permAmmoLabel.textContent = isEmpty ? 'Pressione R / [RB] p/ Recarregar' : '[LT]: Mirar • [RT]: Atirar • [RB]: Recarregar';
    } else if (equippedWeaponId === 'shotgun') {
      const isEmpty = wSht.loadedAmmo === 0;
      permHud.className = `permanent-weapon-hud glass-panel weapon-shotgun-active ${isEmpty ? 'ammo-empty' : ''}`;
      if (permIcon) permIcon.textContent = '💥';
      if (permStatus) permStatus.textContent = isEmpty ? 'Pente Vazio (R / [RB])' : (isAiming ? 'Mirando / Pronta ([RT])' : 'Armada (Segure [LT] / RMB)');
      if (permName) permName.textContent = 'Shotgun 12G';
      if (permAmmoMag) permAmmoMag.textContent = `${wSht.loadedAmmo}`;
      if (permAmmoRes) permAmmoRes.textContent = `${wSht.reserveAmmo}`;
      if (permAmmoLabel) permAmmoLabel.textContent = isEmpty ? 'Pressione R / [RB] p/ Recarregar' : '[LT]: Mirar • [RT]: Atirar • [RB]: Recarregar';
    } else {
      permHud.className = 'permanent-weapon-hud glass-panel weapon-unarmed';
      if (permIcon) permIcon.textContent = '🖐️';
      if (permStatus) permStatus.textContent = 'Modo Desarmado';
      if (permName) permName.textContent = 'Mãos Livres';
      if (permAmmoMag) permAmmoMag.textContent = '--';
      if (permAmmoRes) permAmmoRes.textContent = '--';
      if (permAmmoLabel) {
        if (wRev.isAcquired || wSht.isAcquired) {
          permAmmoLabel.textContent = '1/2 / D-Pad: Equipar • [LT]+[RT]: Atirar';
        } else {
          permAmmoLabel.textContent = 'Encontre armas nos quartos';
        }
      }
    }
  }
}

function equipWeapon(weaponId) {
  if (weaponId && !weaponInventory[weaponId].isAcquired) {
    playLockedSound();
    const reqRoom = weaponId === 'revolver' ? 'Banheiro Luxo (Q.102)' : 'Suíte Botânica (Q.104)';
    if (promptText) promptText.textContent = `🔒 Arma não obtida! Encontre no ${reqRoom}`;
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    return;
  }

  equippedWeaponId = weaponId;
  weaponInventory.revolver.mesh.visible = (weaponId === 'revolver');
  weaponInventory.shotgun.mesh.visible = (weaponId === 'shotgun');

  if (weaponId === 'revolver') currentWeaponStance = 'pistol';
  else if (weaponId === 'shotgun') currentWeaponStance = 'shotgun';
  else currentWeaponStance = 'unarmed';

  // Força atualização da animação atual baseada no stance
  if (activePlayerAction) {
    playPlayerAnim(keys.shift ? 'run' : (velocity.lengthSq() > 0 ? 'walk' : 'idle'), 0.3);
  }

  updateWeaponsUI();
}

// --- SISTEMA DE INIMIGOS E BOSS 3D ---
const activeEnemies = [];

// --- SISTEMA DE DIFICULDADE CONFIGURÁVEL ---
const DIFFICULTY_PRESETS = {
  easy: { name: 'Fácil', emoji: '🟢', badgeClass: 'easy', speedMult: 0.70, hpMult: 0.70, damageMult: 0.75, desc: 'FÁCIL (0.7x)' },
  normal: { name: 'Normal', emoji: '🟡', badgeClass: 'normal', speedMult: 1.00, hpMult: 1.00, damageMult: 1.00, desc: 'NORMAL (1.0x)' },
  hard: { name: 'Difícil', emoji: '🔴', badgeClass: 'hard', speedMult: 1.30, hpMult: 1.40, damageMult: 1.25, desc: 'DIFÍCIL (1.3x)' },
  nightmare: { name: 'Pesadelo', emoji: '💀', badgeClass: 'nightmare', speedMult: 1.65, hpMult: 1.80, damageMult: 1.50, desc: 'PESADELO (1.7x)' },
  custom: { name: 'Personalizado', emoji: '⚙️', badgeClass: 'custom', speedMult: 1.0, hpMult: 1.0, damageMult: 1.0, desc: 'CUSTOMIZADO' }
};

const gameDifficulty = {
  preset: 'normal',
  speedMultiplier: 1.0,
  hpMultiplier: 1.0,
  damageMultiplier: 1.0,
};

function applyDifficultySettings(speedMult, hpMult, damageMult = 1.0, presetName = 'custom') {
  gameDifficulty.speedMultiplier = Math.max(0.4, Math.min(2.5, speedMult));
  gameDifficulty.hpMultiplier = Math.max(0.3, Math.min(3.0, hpMult));
  gameDifficulty.damageMultiplier = damageMult;
  gameDifficulty.preset = presetName;

  activeEnemies.forEach(e => {
    const hpRatio = e.maxHp > 0 ? (e.hp / e.maxHp) : 1.0;
    e.maxHp = Math.round(e.baseHp * gameDifficulty.hpMultiplier);
    e.hp = e.isDead ? 0 : Math.round(e.maxHp * hpRatio);
    e.speed = e.baseSpeed * gameDifficulty.speedMultiplier;
    e.damage = Math.round(e.baseDamage * gameDifficulty.damageMultiplier);
  });

  updateDifficultyUI();
}

function updateDifficultyUI() {
  const badge = document.getElementById('current-diff-badge');
  const mainTag = document.getElementById('main-diff-tag');
  const pauseTag = document.getElementById('pause-diff-tag');

  const sliderSpeed = document.getElementById('slider-enemy-speed');
  const sliderHp = document.getElementById('slider-enemy-hp');
  const valSpeed = document.getElementById('val-enemy-speed');
  const valHp = document.getElementById('val-enemy-hp');

  const pauseSliderSpeed = document.getElementById('pause-slider-enemy-speed');
  const pauseSliderHp = document.getElementById('pause-slider-enemy-hp');
  const pauseValSpeed = document.getElementById('pause-val-enemy-speed');
  const pauseValHp = document.getElementById('pause-val-enemy-hp');

  const presetInfo = DIFFICULTY_PRESETS[gameDifficulty.preset] || DIFFICULTY_PRESETS.custom;
  const tagText = `${presetInfo.emoji} ${presetInfo.name.toUpperCase()} (${gameDifficulty.speedMultiplier.toFixed(1)}x / ${gameDifficulty.hpMultiplier.toFixed(1)}x)`;

  if (mainTag) mainTag.textContent = tagText;
  if (pauseTag) pauseTag.textContent = tagText;

  if (badge) {
    badge.className = `difficulty-badge ${presetInfo.badgeClass}`;
    badge.textContent = `${presetInfo.emoji} ${presetInfo.name.toUpperCase()} (${gameDifficulty.speedMultiplier.toFixed(2)}x Vel / ${gameDifficulty.hpMultiplier.toFixed(2)}x Vida)`;
  }

  const speedPct = Math.round(gameDifficulty.speedMultiplier * 100);
  const hpPct = Math.round(gameDifficulty.hpMultiplier * 100);

  if (sliderSpeed) sliderSpeed.value = speedPct;
  if (sliderHp) sliderHp.value = hpPct;
  if (valSpeed) valSpeed.textContent = `${speedPct}% (${gameDifficulty.speedMultiplier.toFixed(2)}x)`;
  if (valHp) valHp.textContent = `${hpPct}% (${gameDifficulty.hpMultiplier.toFixed(2)}x)`;

  if (pauseSliderSpeed) pauseSliderSpeed.value = speedPct;
  if (pauseSliderHp) pauseSliderHp.value = hpPct;
  if (pauseValSpeed) pauseValSpeed.textContent = `${speedPct}%`;
  if (pauseValHp) pauseValHp.textContent = `${hpPct}%`;

  // Atualiza classe ativa dos botões de preset
  document.querySelectorAll('.btn-preset, .btn-preset-pause').forEach(btn => {
    if (btn.getAttribute('data-preset') === gameDifficulty.preset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Spawns dos Inimigos
function createEnemy(id, name, type, x, y, z, baseHp, baseSpeed, baseDamage, isBoss, targetRoom, modelKey = (isBoss ? 'enemy_boss' : 'enemy1')) {
  const enemyGroup = new THREE.Group();
  enemyGroup.position.set(x, isBoss ? y + 0.3 : y, z);

  const skinColor = isBoss ? 0x7f1d1d : (type === 'stalker' ? 0x064e3b : (type === 'cyber' ? 0x312e81 : 0x14532d));
  const clothesColor = isBoss ? 0x1e1b4b : (type === 'stalker' ? 0x1c1917 : 0x0f172a);

  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.7,
    metalness: isBoss ? 0.4 : 0.1,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
  });

  const clothesMat = new THREE.MeshStandardMaterial({
    color: clothesColor,
    roughness: 0.8,
  });

  const eyeMat = new THREE.MeshBasicMaterial({
    color: isBoss ? 0xff0044 : (type === 'stalker' ? 0xa3e635 : 0xef4444),
  });

  const hitMeshes = [];
  const placeholderMeshes = [];

  // Tronco placeholder
  const torsoGeo = new THREE.BoxGeometry(isBoss ? 1.0 : 0.65, isBoss ? 1.2 : 0.75, isBoss ? 0.55 : 0.38);
  const torso = new THREE.Mesh(torsoGeo, clothesMat);
  torso.position.y = 0.25;
  torso.castShadow = true;
  torso.receiveShadow = true;
  torso.userData = { enemyId: id };
  enemyGroup.add(torso);
  hitMeshes.push(torso);
  placeholderMeshes.push(torso);

  // Cabeça placeholder
  const headGeo = new THREE.BoxGeometry(isBoss ? 0.65 : 0.42, isBoss ? 0.65 : 0.42, isBoss ? 0.65 : 0.42);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = isBoss ? 1.15 : 0.82;
  head.castShadow = true;
  head.receiveShadow = true;
  head.userData = { enemyId: id };
  enemyGroup.add(head);
  hitMeshes.push(head);
  placeholderMeshes.push(head);

  // Olhos Incandescentes placeholder
  const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), eyeMat);
  eyeLeft.position.set(-0.11, 0.85, 0.23);
  enemyGroup.add(eyeLeft);
  placeholderMeshes.push(eyeLeft);

  const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), eyeMat);
  eyeRight.position.set(0.11, 0.85, 0.23);
  enemyGroup.add(eyeRight);
  placeholderMeshes.push(eyeRight);

  // Braços placeholder
  const armGeo = new THREE.BoxGeometry(0.16, 0.65, 0.16);
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.set(-0.38, 0.2, 0.28);
  leftArm.rotation.x = -Math.PI / 3;
  leftArm.castShadow = true;
  leftArm.userData = { enemyId: id };
  enemyGroup.add(leftArm);
  hitMeshes.push(leftArm);
  placeholderMeshes.push(leftArm);

  const rightArm = new THREE.Mesh(armGeo, skinMat);
  rightArm.position.set(0.38, 0.2, 0.28);
  rightArm.rotation.x = -Math.PI / 3;
  rightArm.castShadow = true;
  rightArm.userData = { enemyId: id };
  enemyGroup.add(rightArm);
  hitMeshes.push(rightArm);
  placeholderMeshes.push(rightArm);

  // Pernas placeholder
  const legGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
  const leftLeg = new THREE.Mesh(legGeo, clothesMat);
  leftLeg.position.set(-0.16, -0.45, 0);
  leftLeg.castShadow = true;
  leftLeg.userData = { enemyId: id };
  enemyGroup.add(leftLeg);
  hitMeshes.push(leftLeg);
  placeholderMeshes.push(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, clothesMat);
  rightLeg.position.set(0.16, -0.45, 0);
  rightLeg.castShadow = true;
  rightLeg.userData = { enemyId: id };
  enemyGroup.add(rightLeg);
  hitMeshes.push(rightLeg);
  placeholderMeshes.push(rightLeg);

  // Hitbox de tiro generosa para precisão de combate (+10% ajustada)
  const hitColMat = new THREE.MeshBasicMaterial({ visible: false, wireframe: true });
  const hitColGeo = new THREE.CylinderGeometry(isBoss ? 1.75 : 0.95, isBoss ? 1.75 : 0.95, isBoss ? 3.7 : 2.4, 12);
  const hitCollider = new THREE.Mesh(hitColGeo, hitColMat);
  hitCollider.position.set(0, isBoss ? 1.2 : 0.7, 0);
  hitCollider.userData = { enemyId: id };
  enemyGroup.add(hitCollider);
  hitMeshes.push(hitCollider);

  // Detalhes extras se for Chefe (Aura / Chifres)
  if (isBoss) {
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.8, roughness: 0.2, emissive: 0x7f1d1d, emissiveIntensity: 0.5 });
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 8), hornMat);
    hornL.position.set(-0.18, 1.15, 0.05); hornL.rotation.z = -0.3; enemyGroup.add(hornL);
    placeholderMeshes.push(hornL);

    const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 8), hornMat);
    hornR.position.set(0.18, 1.15, 0.05); hornR.rotation.z = 0.3; enemyGroup.add(hornR);
    placeholderMeshes.push(hornR);
  }

  // Luz incandescente do monstro
  const enemyLight = new THREE.PointLight(isBoss ? 0xff0000 : 0xef4444, isBoss ? 3.5 : 1.2, isBoss ? 8.0 : 4.0);
  enemyLight.position.set(0, 0.8, 0.3);
  enemyGroup.add(enemyLight);

  scene.add(enemyGroup);

  const initialHp = Math.round(baseHp * gameDifficulty.hpMultiplier);
  const initialSpeed = baseSpeed * gameDifficulty.speedMultiplier;
  const initialDamage = Math.round(baseDamage * gameDifficulty.damageMultiplier);

  const enemyObj = {
    id,
    name,
    type,
    modelKey,
    x, y, z,
    initialX: x,
    initialY: isBoss ? y + 0.3 : y,
    initialZ: z,
    baseHp,
    baseSpeed,
    baseDamage,
    maxHp: initialHp,
    hp: initialHp,
    speed: initialSpeed,
    damage: initialDamage,
    isBoss,
    targetRoom,
    group: enemyGroup,
    skinMat,
    clothesMat,
    hitMeshes,
    placeholderMeshes,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    enemyLight,
    isDead: false,
    dyingTimer: 0,
    hitFlashTimer: 0,
    attackCooldown: 0,
    walkCycle: 0,
    isAggro: false,
    hasMoved: false,
    groanTimer: Math.random() * 4 + 2,
    modelInstance: null,
    mixer: null,
    actions: {},
    activeAction: null,
    currentActionName: 'idle',
    materials: [],
  };

  activeEnemies.push(enemyObj);
  return enemyObj;
}

// Spawns dos Inimigos nos Quartos com distribuição dos modelos
// Q.101: 1 Zumbi lento (Jogador inicia desarmado, precisa desviar e pegar a chave)
createEnemy('enemy_101', 'Zumbi Andarilho', 'walker', -23.0, 1.0, -8.0, 70, 2.1, 20, false, 'q101', 'enemy1');

// Q.102: 1 Zumbi (Combate inicial com Revólver recém-obtido)
createEnemy('enemy_102', 'Lurker Mutante', 'walker', -6.0, 1.0, -10.0, 85, 2.4, 22, false, 'q102', 'enemy2');

// Q.103: 3 Zumbis (Combate tático no Tech Lab)
createEnemy('enemy_103_1', 'Cyborg Infectado Alpha', 'cyber', 18.0, 1.0, -16.0, 95, 2.5, 25, false, 'q103', 'enemy3');
createEnemy('enemy_103_2', 'Cyborg Infectado Beta', 'cyber', 24.0, 1.0, -8.0, 95, 2.6, 25, false, 'q103', 'enemy1');
createEnemy('enemy_103_3', 'Cyborg Infectado Gamma', 'cyber', 21.0, 1.0, -12.0, 95, 2.5, 25, false, 'q103', 'enemy2');

// Q.104: 2 Stalkers Ágeis (Recompensa da Shotgun)
createEnemy('enemy_104_1', 'Parasita Botânico Alpha', 'stalker', -24.0, 1.0, 16.0, 110, 3.2, 28, false, 'q104', 'enemy2');
createEnemy('enemy_104_2', 'Parasita Botânico Beta', 'stalker', -18.0, 1.0, 8.0, 110, 3.0, 28, false, 'q104', 'enemy3');

// Q.105: 4 Stalkers Fortes (Desafio pré-chefe no Lavabo de Serviço)
createEnemy('enemy_105_1', 'Sombra Abissal Alpha', 'stalker', -3.0, 1.0, 16.0, 115, 3.0, 30, false, 'q105', 'enemy1');
createEnemy('enemy_105_2', 'Sombra Abissal Beta', 'stalker', -8.0, 1.0, 10.0, 115, 3.2, 30, false, 'q105', 'enemy2');
createEnemy('enemy_105_3', 'Sombra Abissal Gamma', 'stalker', -5.5, 1.0, 14.0, 115, 3.0, 30, false, 'q105', 'enemy3');
createEnemy('enemy_105_4', 'Sombra Abissal Delta', 'stalker', -9.5, 1.0, 16.0, 115, 3.1, 30, false, 'q105', 'enemy1');

// Q.106: 1 CHEFE ("Guardião da Câmara") - 700 HP, Drop da Chave Mestre 👑 (Boss com ataques especiais de longe e onda de choque)
createEnemy('boss_106', 'Guardião da Câmara 👹', 'boss', 16.0, 1.5, 12.0, 700, 1.4, 40, true, 'q106', 'enemy_boss');

// --- SISTEMA DE ANIMAÇÃO E MODELAGEM 3D DOS INIMIGOS E BOSS ---
function setupAllEnemies() {
  const enemyAnimNames = ['idle', 'walk', 'run', 'attack', 'death', 'dying', 'biting', 'scream'];

  activeEnemies.forEach(enemy => {
    const modelKey = enemy.modelKey || (enemy.isBoss ? 'enemy_boss' : 'enemy1');
    const baseModel = assetManager.models[modelKey];
    if (!baseModel) {
      console.warn(`Modelo do inimigo não encontrado para a chave: ${modelKey}`);
      return;
    }

    // Clona o modelo com esqueleto completo usando SkeletonUtils
    const enemyInstance = SkeletonUtils.clone(baseModel);

    // Configura escala dos zumbis reduzida em 10% (0.0253 -> 0.0228)
    const scale = enemy.isBoss ? 0.035 : 0.0228;
    enemyInstance.scale.set(scale, scale, scale);
    enemyInstance.position.set(0, -1.0, 0);
    enemyInstance.rotation.set(0, 0, 0);

    const enemyMats = [];

    enemyInstance.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData = { enemyId: enemy.id };
        enemy.hitMeshes.push(child);

        // Se o material for clonado / instanciado, armazena para efeito de hit flash
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => enemyMats.push(m));
          } else {
            enemyMats.push(child.material);
          }
        }
      }

      // Normalização de nomes de ossos Mixamo
      if (child.isBone && child.name) {
        child.name = child.name.replace(/.*mixamorig/g, 'mixamorig').replace(/mixamorig:/g, 'mixamorig');
        if (!child.name.startsWith('mixamorig')) {
          child.name = 'mixamorig' + child.name.charAt(0).toUpperCase() + child.name.slice(1);
        }
      }
    });

    enemy.modelInstance = enemyInstance;
    enemy.materials = enemyMats;
    enemy.group.add(enemyInstance);

    // Remove os blocos geométricos placeholder antigos
    if (enemy.placeholderMeshes) {
      enemy.placeholderMeshes.forEach(m => {
        if (m.parent) m.parent.remove(m);
      });
    }

    // Configura AnimationMixer para o modelo FBX
    const mixer = new THREE.AnimationMixer(enemyInstance);
    const actions = {};

    enemyAnimNames.forEach(name => {
      const animKey = 'enemy_' + name;
      const clip = assetManager.getAnimation(animKey);
      if (clip && clip.tracks) {
        const clipClone = clip.clone();
        clipClone.tracks.forEach(track => {
          if (track && track.name) {
            track.name = track.name.replace(/.*mixamorig/g, 'mixamorig').replace(/mixamorig:/g, 'mixamorig');

            // Trava X e Z dos quadris para neutralizar deslocamento de root-motion e evitar efeito de deslizar no chão
            if (['walk', 'run', 'idle'].includes(name) && track.name.includes('Hips.position')) {
              const values = track.values;
              const initialX = values[0] || 0;
              const initialZ = values[2] || 0;
              for (let i = 0; i < values.length; i += 3) {
                values[i] = initialX;
                values[i + 2] = initialZ;
              }
            }
          }
        });

        const action = mixer.clipAction(clipClone);
        if (['attack', 'death', 'dying', 'scream', 'biting'].includes(name)) {
          action.setLoop(THREE.LoopOnce);
          action.clampWhenFinished = true;
        }

        // Se for o chefe, desacelera o passo da caminhada para parecer mais pesado e imponente
        if (enemy.isBoss && name === 'walk') {
          action.timeScale = 0.75;
        } else if (enemy.isBoss && name === 'attack') {
          action.timeScale = 0.85;
        }

        actions[name] = action;
      }
    });

    enemy.mixer = mixer;
    enemy.actions = actions;

    // Inicia na animação de idle
    if (actions['idle']) {
      actions['idle'].play();
      enemy.activeAction = actions['idle'];
      enemy.currentActionName = 'idle';
    }
  });

  console.log('Modelos FBX e animações dos inimigos e do chefe configurados com sucesso!');
}

function playEnemyAnim(enemy, animName, duration = 0.2) {
  if (!enemy || !enemy.mixer || !enemy.actions) return;

  let targetAction = enemy.actions[animName];
  // Fallbacks úteis
  if (!targetAction && animName === 'run') targetAction = enemy.actions['walk'];
  if (!targetAction && animName === 'dying') targetAction = enemy.actions['death'];
  if (!targetAction) targetAction = enemy.actions['idle'];
  if (!targetAction) return;

  // Ajusta a velocidade de reprodução sincronizada com a velocidade de deslocamento do inimigo (evita deslize)
  if (animName === 'walk') {
    targetAction.timeScale = enemy.isBoss ? 0.75 : Math.max(0.75, enemy.speed / 2.2);
  } else if (animName === 'run') {
    targetAction.timeScale = Math.max(0.9, enemy.speed / 2.6);
  }

  // Não cancela animação de morte se o inimigo já morreu
  if (enemy.isDead && (enemy.currentActionName === 'death' || enemy.currentActionName === 'dying') && animName !== 'death' && animName !== 'dying') {
    return;
  }

  // Não interrompe o golpe de ataque enquanto ele estiver sendo executado (a menos que o inimigo morra)
  if (enemy.currentActionName === 'attack' && enemy.activeAction && enemy.activeAction.isRunning() && animName !== 'death' && animName !== 'dying') {
    return;
  }

  if (enemy.currentActionName === animName && enemy.activeAction && enemy.activeAction.isRunning()) {
    return;
  }

  targetAction.reset().fadeIn(duration).play();
  if (enemy.activeAction && enemy.activeAction !== targetAction) {
    enemy.activeAction.fadeOut(duration);
  }

  enemy.activeAction = targetAction;
  enemy.currentActionName = animName;
}

function updateBossHealthUI() {
  const bossContainer = document.getElementById('boss-health-container');
  const bossFill = document.getElementById('boss-hp-fill');
  const bossNum = document.getElementById('boss-hp-num');
  const boss = activeEnemies.find(e => e.isBoss);

  if (!bossContainer || !boss) return;

  if (boss.isDead || !isGameStarted) {
    bossContainer.classList.add('hidden');
    return;
  }

  // A barra de vida do chefe só aparece quando a porta do Q.106 for aberta e ele for ativado!
  if ((boss.isAggro && boss.hasMoved) || boss.hp < boss.maxHp) {
    bossContainer.classList.remove('hidden');
    const pct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
    if (bossFill) bossFill.style.width = `${pct}%`;
    if (bossNum) bossNum.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp} HP (${Math.round(pct)}%)`;
  } else {
    bossContainer.classList.add('hidden');
  }
}

// --- SISTEMA DE PARTÍCULAS 3D DE SANGUE (BLOOD SPLATTER) ---
const MAX_BLOOD_PARTICLES = 300;
const bloodGeo = new THREE.DodecahedronGeometry(0.045, 0);
const bloodMat = new THREE.MeshStandardMaterial({
  color: 0x4a0002,
  emissive: 0x1f0001,
  emissiveIntensity: 0.25,
  roughness: 0.2,
  metalness: 0.15,
});
const bloodInstancedMesh = new THREE.InstancedMesh(bloodGeo, bloodMat, MAX_BLOOD_PARTICLES);
bloodInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
bloodInstancedMesh.frustumCulled = false; // Garante renderização das partículas em qualquer ângulo da câmera
scene.add(bloodInstancedMesh);

const bloodDummyMatrix = new THREE.Matrix4();
const bloodDummyPos = new THREE.Vector3();
const bloodDummyQuat = new THREE.Quaternion();
const bloodDummyScale = new THREE.Vector3();

const bloodParticlesPool = [];
for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
  bloodParticlesPool.push({
    active: false,
    pos: new THREE.Vector3(0, -100, 0),
    vel: new THREE.Vector3(),
    baseScale: 1.0,
    life: 0,
    maxLife: 1.0,
  });
  bloodDummyMatrix.makeTranslation(0, -100, 0);
  bloodInstancedMesh.setMatrixAt(i, bloodDummyMatrix);
}
bloodInstancedMesh.instanceMatrix.needsUpdate = true;

function spawnBloodSplatter(origin, direction, count = 24, isBig = false) {
  let spawned = 0;
  const targetCount = isBig ? Math.round(count * 1.5) : count;

  for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
    const p = bloodParticlesPool[i];
    if (!p.active) {
      p.active = true;
      p.pos.copy(origin).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.14,
        (Math.random() - 0.5) * 0.14,
        (Math.random() - 0.5) * 0.14
      ));

      const spreadX = (Math.random() - 0.5) * 0.75;
      const spreadY = (Math.random() * 0.5) + 0.15;
      const spreadZ = (Math.random() - 0.5) * 0.75;

      const sprayDir = direction.clone().multiplyScalar(0.6).add(new THREE.Vector3(spreadX, spreadY, spreadZ)).normalize();
      const speed = (Math.random() * 1.6 + 0.9) * (isBig ? 1.3 : 1.0);
      p.vel.copy(sprayDir).multiplyScalar(speed);

      p.baseScale = (Math.random() * 0.5 + 0.75) * (isBig ? 1.35 : 1.0);
      p.maxLife = Math.random() * 0.45 + 0.75;
      p.life = p.maxLife;

      spawned++;
      if (spawned >= targetCount) break;
    }
  }
}

function updateBloodParticles(delta) {
  let needsUpdate = false;

  for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
    const p = bloodParticlesPool[i];
    if (p.active) {
      needsUpdate = true;
      p.life -= delta;

      if (p.life <= 0) {
        p.active = false;
        p.pos.set(0, -100, 0);
        bloodDummyMatrix.makeTranslation(0, -100, 0);
        bloodInstancedMesh.setMatrixAt(i, bloodDummyMatrix);
        continue;
      }

      // Gravidade e movimento balístico contido
      p.vel.y -= 14.0 * delta;
      p.pos.addScaledVector(p.vel, delta);

      // Colisão com o piso
      if (p.pos.y <= 0.04) {
        p.pos.y = 0.04;
        p.vel.set(0, 0, 0);
      }

      const lifeRatio = Math.max(0, p.life / p.maxLife);
      const currentScale = p.baseScale * (lifeRatio > 0.25 ? 1.0 : lifeRatio / 0.25);

      bloodDummyPos.copy(p.pos);
      if (p.pos.y <= 0.05) {
        bloodDummyScale.set(currentScale * 1.3, currentScale * 0.18, currentScale * 1.3);
      } else {
        bloodDummyScale.set(currentScale, currentScale, currentScale);
      }
      bloodDummyMatrix.compose(bloodDummyPos, bloodDummyQuat, bloodDummyScale);
      bloodInstancedMesh.setMatrixAt(i, bloodDummyMatrix);
    }
  }

  if (needsUpdate) {
    bloodInstancedMesh.instanceMatrix.needsUpdate = true;
  }
}

// --- SISTEMA OPTIMIZADO DE ATAQUES ESPECIAIS E PROJÉTEIS DO BOSS ---
const activeBossProjectiles = [];
const activeBossShockwaves = [];

const bossOrbGeo = new THREE.SphereGeometry(0.24, 12, 12);
const bossOrbMat = new THREE.MeshStandardMaterial({
  color: 0xff1100,
  emissive: 0xff3300,
  emissiveIntensity: 3.5,
  roughness: 0.1,
});

const bossShockRingGeo = new THREE.RingGeometry(0.85, 1.0, 32);

function showBossWarningPrompt(message, durationMs = 2200) {
  if (typeof interactionPrompt !== 'undefined' && interactionPrompt && typeof promptText !== 'undefined' && promptText) {
    promptText.textContent = message;
    interactionPrompt.classList.remove('hidden');
    setTimeout(() => {
      if (promptText && promptText.textContent === message) {
        interactionPrompt.classList.add('hidden');
      }
    }, durationMs);
  }
}

function spawnBossProjectile(boss) {
  if (!boss || boss.isDead) return;

  const spawnPos = boss.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const targetPos = playerGroup.position.clone().add(new THREE.Vector3(0, 0.45, 0));
  const dir = targetPos.sub(spawnPos).normalize();

  const orbMesh = new THREE.Mesh(bossOrbGeo, bossOrbMat);
  orbMesh.position.copy(spawnPos);
  scene.add(orbMesh);

  activeBossProjectiles.push({
    mesh: orbMesh,
    dir: dir,
    speed: 8.5,
    life: 3.5,
    damage: Math.round(25 * gameDifficulty.damageMultiplier),
  });

  playBossRoarSound();
  showBossWarningPrompt('☣️ O GUARDIÃO LANÇOU UM ORBE CORROSIVO! DESVIE!', 1800);
}

function spawnBossShockwave(boss) {
  if (!boss || boss.isDead) return;

  const shockMat = new THREE.MeshStandardMaterial({
    color: 0xff0033,
    emissive: 0xff0044,
    emissiveIntensity: 4.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
  });

  const shockMesh = new THREE.Mesh(bossShockRingGeo, shockMat);
  shockMesh.rotation.x = -Math.PI / 2;
  shockMesh.position.set(boss.group.position.x, 0.06, boss.group.position.z);
  shockMesh.scale.set(0.5, 0.5, 0.5);

  scene.add(shockMesh);

  activeBossShockwaves.push({
    mesh: shockMesh,
    center: boss.group.position.clone(),
    scale: 0.5,
    maxRadius: 8.5,
    expandSpeed: 6.0,
    life: 1.4,
    maxLife: 1.4,
    hasHitPlayer: false,
    damage: Math.round(30 * gameDifficulty.damageMultiplier),
  });

  playBossRoarSound();
  showBossWarningPrompt('⚠️ O BOSS BATEU NO CHÃO! PULE PARA ESQUIVAR DA ONDA DE CHOQUE! 🦘', 2400);
}

function updateBossAttacks(delta) {
  // 1. Atualiza Orbes Corrosivos (Projéteis de Longe)
  for (let i = activeBossProjectiles.length - 1; i >= 0; i--) {
    const proj = activeBossProjectiles[i];
    proj.life -= delta;

    if (proj.life <= 0) {
      spawnBloodSplatter(proj.mesh.position, proj.dir.clone().negate(), 12, true);
      scene.remove(proj.mesh);
      activeBossProjectiles.splice(i, 1);
      continue;
    }

    proj.mesh.position.addScaledVector(proj.dir, proj.speed * delta);

    const distToPlayer = proj.mesh.position.distanceTo(playerGroup.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    if (distToPlayer < 0.85) {
      damagePlayer(proj.damage, 'Orbe Corrosivo do Boss ☣️');
      spawnBloodSplatter(proj.mesh.position, proj.dir, 20, true);
      scene.remove(proj.mesh);
      activeBossProjectiles.splice(i, 1);
      continue;
    }

    for (const wall of wallColliders) {
      if (wall.disabled) continue;
      if (
        proj.mesh.position.x > wall.minX && proj.mesh.position.x < wall.maxX &&
        proj.mesh.position.z > wall.minZ && proj.mesh.position.z < wall.maxZ
      ) {
        spawnBloodSplatter(proj.mesh.position, proj.dir.clone().negate(), 14, true);
        scene.remove(proj.mesh);
        activeBossProjectiles.splice(i, 1);
        break;
      }
    }
  }

  // 2. Atualiza Ondas de Choque Terrestres
  for (let i = activeBossShockwaves.length - 1; i >= 0; i--) {
    const sw = activeBossShockwaves[i];
    sw.life -= delta;

    if (sw.life <= 0 || sw.scale >= sw.maxRadius) {
      if (sw.mesh.material) sw.mesh.material.dispose();
      scene.remove(sw.mesh);
      activeBossShockwaves.splice(i, 1);
      continue;
    }

    sw.scale += sw.expandSpeed * delta;
    sw.mesh.scale.set(sw.scale, sw.scale, sw.scale);

    const progress = 1 - (sw.life / sw.maxLife);
    if (sw.mesh.material) {
      sw.mesh.material.opacity = Math.max(0, 0.95 * (1 - progress));
    }

    if (!sw.hasHitPlayer && !isPlayerDead) {
      const distToPlayer = Math.hypot(playerGroup.position.x - sw.center.x, playerGroup.position.z - sw.center.z);
      if (Math.abs(distToPlayer - sw.scale) < 0.85) {
        const isPlayerJumping = !isGrounded && (playerGroup.position.y > 1.35);

        if (isPlayerJumping) {
          sw.hasHitPlayer = true;
          showBossWarningPrompt('✨ Esquivou da Onda de Choque com Sucesso! 🦘', 1200);
        } else {
          sw.hasHitPlayer = true;
          damagePlayer(sw.damage, 'Onda de Choque do Boss 💥');
          const knockDir = playerGroup.position.clone().sub(sw.center);
          knockDir.y = 0;
          knockDir.normalize();
          velocity.x += knockDir.x * 3.5;
          velocity.z += knockDir.z * 3.5;
        }
      }
    }
  }
}

// --- SISTEMA DE VERIFICAÇÃO DE LINHA DE VISÃO DIRETA (PREVINE TIROS ATRAVÉS DE PAREDES E PORTAS) ---
function hasLineOfSight(fromPos, toPos) {
  const dir = toPos.clone().sub(fromPos);
  const dist = dir.length();
  if (dist < 0.1) return true;
  dir.normalize();

  // 1. Checa paredes em wallColliders
  for (const wall of wallColliders) {
    if (wall.disabled) continue;
    const minX = wall.minX - 0.05;
    const maxX = wall.maxX + 0.05;
    const minZ = wall.minZ - 0.05;
    const maxZ = wall.maxZ + 0.05;

    const t1 = (minX - fromPos.x) / (dir.x || 1e-6);
    const t2 = (maxX - fromPos.x) / (dir.x || 1e-6);
    const t3 = (minZ - fromPos.z) / (dir.z || 1e-6);
    const t4 = (maxZ - fromPos.z) / (dir.z || 1e-6);

    const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
    const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));

    if (tmax >= 0 && tmin <= tmax && tmin < dist - 0.3 && tmax > 0.3) {
      return false; // Paredes bloqueiam a linha de tiro!
    }
  }

  // 2. Checa portas FECHADAS
  for (const door of interactiveDoors) {
    if (door.isOpen) continue;
    const doorDist = Math.hypot(door.x - fromPos.x, door.z - fromPos.z);
    if (doorDist < dist + 1.2) {
      const doorMinX = door.x - 1.5;
      const doorMaxX = door.x + 1.5;
      const doorMinZ = door.z - 1.5;
      const doorMaxZ = door.z + 1.5;

      const t1 = (doorMinX - fromPos.x) / (dir.x || 1e-6);
      const t2 = (doorMaxX - fromPos.x) / (dir.x || 1e-6);
      const t3 = (doorMinZ - fromPos.z) / (dir.z || 1e-6);
      const t4 = (doorMaxZ - fromPos.z) / (dir.z || 1e-6);

      const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
      const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));

      if (tmax >= 0 && tmin <= tmax && tmin < dist - 0.3 && tmax > 0.3) {
        return false; // Portas fechadas bloqueiam a linha de tiro!
      }
    }
  }

  return true;
}

function fireActiveWeapon() {
  if (isPlayerDead || !equippedWeaponId) return;

  // Exige que o jogador esteja armando/mirando (com LT ou Botão Direito) para disparar
  if (!isAiming) {
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (promptText) promptText.textContent = 'Segure [LT] ou Botão Direito do mouse para mirar antes de atirar! 🎯';
    setTimeout(() => {
      if (promptText && promptText.textContent.includes('mirar antes de atirar')) {
        if (interactionPrompt) interactionPrompt.classList.add('hidden');
      }
    }, 1500);
    return;
  }

  const weapon = weaponInventory[equippedWeaponId];
  if (weapon.loadedAmmo > 0) {
    weapon.loadedAmmo--;
    playGunshotSound(equippedWeaponId);

    if (isOnlineMultiplayer && p2pConn && p2pConn.open) {
      p2pConn.send({ type: 'EVENT_FIRE', weaponId: equippedWeaponId });
    }

    // Efeito de recuo na animação de disparo
    if (equippedWeaponId === 'revolver' && playerActions['shoot']) {
      playerActions['shoot'].reset().play();
    } else if (equippedWeaponId === 'shotgun' && playerActions['rifle_shoot']) {
      playerActions['rifle_shoot'].reset().play();
    } else {
      playPlayerAnim('shoot', 0.05);
    }

    // Dano da arma
    const damage = equippedWeaponId === 'shotgun' ? 90 : 35;

    // Orientação correta do jogador para o tiro
    const shootDir = new THREE.Vector3(Math.sin(playerRotation), 0, Math.cos(playerRotation)).normalize();

    // Muzzle flash de disparo (sem adicionar/remover luzes dinamicamente)
    const flashPos = playerGroup.position.clone().add(new THREE.Vector3(
      shootDir.x * 0.8,
      0.25,
      shootDir.z * 0.8
    ));
    combatFlashLight.position.copy(flashPos);
    combatFlashLight.color.setHex(0xfacc15);
    combatFlashLight.intensity = 7.0;
    setTimeout(() => { combatFlashLight.intensity = 0.0; }, 80);

    // Recuo de câmera
    cameraPitch = Math.min(1.15, cameraPitch + 0.05);

    // Raycast do Disparo
    const shootOrigin = playerGroup.position.clone().add(new THREE.Vector3(0, 0.45, 0));
    const ray = new THREE.Raycaster(shootOrigin, shootDir, 0.1, 45);

    // Checa colisão com paredes para delimitar alcance do tiro
    const wallHits = ray.intersectObjects(wallsGroup.children, true);
    const maxShootDist = wallHits.length > 0 ? wallHits[0].distance : 40.0;

    // Meshes de todos os inimigos vivos
    const aliveEnemies = activeEnemies.filter(e => !e.isDead);
    const enemyMeshes = [];
    aliveEnemies.forEach(e => {
      e.hitMeshes.forEach(m => enemyMeshes.push(m));
    });

    const enemyHits = ray.intersectObjects(enemyMeshes, true);

    let hitEnemy = null;
    let hitPoint = null;

    if (enemyHits.length > 0 && enemyHits[0].distance < maxShootDist) {
      const hitMesh = enemyHits[0].object;
      let checkObj = hitMesh;
      while (checkObj && !checkObj.userData.enemyId && checkObj.parent) {
        checkObj = checkObj.parent;
      }
      const enemyId = checkObj ? checkObj.userData.enemyId : null;
      const candidateEnemy = aliveEnemies.find(e => e.id === enemyId);
      if (candidateEnemy && hasLineOfSight(shootOrigin, enemyHits[0].point)) {
        hitEnemy = candidateEnemy;
        hitPoint = enemyHits[0].point;
      }
    }

    // Fallback de detecção por cone de mira (exige linha de visão direta sem obstáculos)
    if (!hitEnemy) {
      let closestDist = maxShootDist;
      for (const enemy of aliveEnemies) {
        const toEnemy = enemy.group.position.clone().sub(playerGroup.position);
        toEnemy.y = 0;
        const dist = toEnemy.length();
        if (dist > 0.4 && dist < closestDist) {
          const enemyDir = toEnemy.clone().normalize();
          const dot = enemyDir.dot(shootDir);
          const angleThreshold = enemy.isBoss ? 0.72 : 0.84; // ~35 a 45 graus
          if (dot > angleThreshold) {
            const enemyTargetPos = enemy.group.position.clone().add(new THREE.Vector3(0, 0.8, 0));
            if (hasLineOfSight(shootOrigin, enemyTargetPos)) {
              hitEnemy = enemy;
              closestDist = dist;
              hitPoint = enemyTargetPos;
            }
          }
        }
      }
    }

    // Processa o acerto
    if (hitEnemy) {
      // Efeito de impacto de sangue e luz
      combatImpactLight.position.copy(hitPoint || hitEnemy.group.position);
      combatImpactLight.color.setHex(0x550005);
      combatImpactLight.intensity = 2.5;
      setTimeout(() => { combatImpactLight.intensity = 0.0; }, 100);

      playZombieHitSound();

      // Partículas 3D de sangue espirrando do zumbi
      const bloodOrigin = hitPoint ? hitPoint.clone() : hitEnemy.group.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const splatterDir = shootDir.clone().negate().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6)).normalize();
      spawnBloodSplatter(bloodOrigin, splatterDir, equippedWeaponId === 'shotgun' ? 45 : 28, hitEnemy.isBoss);

      // Aplica Dano e Knockback
      hitEnemy.hp -= damage;
      hitEnemy.hitFlashTimer = 0.12;
      hitEnemy.isAggro = true;

      const knockback = shootDir.clone().multiplyScalar(equippedWeaponId === 'shotgun' ? 1.1 : 0.5);
      hitEnemy.group.position.x += knockback.x;
      hitEnemy.group.position.z += knockback.z;

      if (hitEnemy.isBoss) {
        updateBossHealthUI();
      }

      if (hitEnemy.hp <= 0) {
        hitEnemy.hp = 0;
        hitEnemy.isDead = true;
        hitEnemy.dyingTimer = 3.0;
        playZombieDeathSound(hitEnemy.isBoss);
        playEnemyAnim(hitEnemy, 'death', 0.15);

        if (hitEnemy.isBoss) {
          playBossRoarSound();
          updateBossHealthUI();

          // DROP DA CHAVE MESTRE 👑
          const masterKeyDef = KEY_DEFS.find(k => k.id === 'key_master');
          if (masterKeyDef) {
            masterKeyDef.x = hitEnemy.group.position.x;
            masterKeyDef.y = 1.2;
            masterKeyDef.z = hitEnemy.group.position.z;
            createCollectibleKey(masterKeyDef);
            playVictorySound();
          }

          updateGoalHUD();
        }
      }
    } else if (wallHits.length > 0) {
      // Faísca na parede
      combatImpactLight.position.copy(wallHits[0].point);
      combatImpactLight.color.setHex(0xf97316);
      combatImpactLight.intensity = 4.0;
      setTimeout(() => { combatImpactLight.intensity = 0.0; }, 100);
    }

    updateWeaponsUI();
  } else if (weapon.reserveAmmo > 0) {
    playDryFireSound();
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (promptText) promptText.textContent = `Pente Vazio! Pressione R ou [RB] para Recarregar 🔄`;
  } else {
    playDryFireSound();
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (promptText) promptText.textContent = `Sem Munição para esta arma! 🚫`;
  }
}

function reloadActiveWeapon() {
  if (isPlayerDead || !equippedWeaponId) return;
  const weapon = weaponInventory[equippedWeaponId];
  const needed = weapon.maxMag - weapon.loadedAmmo;
  if (needed > 0 && weapon.reserveAmmo > 0) {
    const toReload = Math.min(needed, weapon.reserveAmmo);
    weapon.loadedAmmo += toReload;
    weapon.reserveAmmo -= toReload;
    playReloadSound();
    updateWeaponsUI();
  } else if (needed === 0) {
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (promptText) promptText.textContent = `Pente já está cheio!`;
  } else {
    playDryFireSound();
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (promptText) promptText.textContent = `Sem Munição na Reserva! 🚫`;
  }
}

// --- SISTEMA DE PORTAS 3D INTERATIVAS ---
const interactiveDoors = [];

function createInteractiveDoor(x, z, roomNumber, roomTitle, isNorthSide, requiredKey = null) {
  const doorGroup = new THREE.Group();
  doorGroup.position.set(x, 0, z);

  const lintelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 0.8), lintelMat);
  lintel.position.set(0, 4.2, 0);
  doorGroup.add(lintel);

  const signMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.8 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.86), signMat);
  sign.position.set(0, 3.4, 0);
  doorGroup.add(sign);

  const pivotGroup = new THREE.Group();
  pivotGroup.position.set(-1.35, 0, 0);

  const doorMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 });
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.2, 0.12), doorMat);
  doorPanel.position.set(1.35, 1.6, 0);
  doorPanel.castShadow = true; doorPanel.receiveShadow = true;
  pivotGroup.add(doorPanel);

  const knobMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9 });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), knobMat);
  knob.position.set(2.4, 1.5, 0.12);
  pivotGroup.add(knob);

  doorGroup.add(pivotGroup);
  scene.add(doorGroup);

  const doorData = {
    group: doorGroup,
    pivot: pivotGroup,
    isOpen: false,
    isUnlocked: !requiredKey,
    requiredKey,
    currentAngle: 0,
    targetAngle: 0,
    isNorthSide,
    x, z,
    roomNumber,
    name: roomTitle,
    colliderIndex: -1,
  };

  const collider = {
    minX: x - 1.4 - PLAYER_RADIUS,
    maxX: x + 1.4 + PLAYER_RADIUS,
    minZ: z - 0.4 - PLAYER_RADIUS,
    maxZ: z + 0.4 + PLAYER_RADIUS,
    name: `Porta ${roomNumber} (${roomTitle})`,
    disabled: false,
  };
  wallColliders.push(collider);
  doorData.colliderIndex = wallColliders.length - 1;

  interactiveDoors.push(doorData);
  return doorData;
}

function toggleDoor(door) {
  if (door.requiredKey && !acquiredKeys.has(door.requiredKey) && !door.isUnlocked) {
    playLockedSound();
    if (interactionPrompt) {
      interactionPrompt.classList.remove('hidden');
      const reqKey = KEY_DEFS.find(k => k.id === door.requiredKey);
      const kName = reqKey ? reqKey.name : `Chave Q.${door.roomNumber}`;
      if (promptText) promptText.textContent = `🔒 Trancada! Requer ${kName}`;
    }
    return;
  }

  door.isUnlocked = true;
  door.isOpen = !door.isOpen;

  if (door.isOpen) {
    clearRoomFog('q' + door.roomNumber);
  }

  door.targetAngle = door.isOpen ? (door.isNorthSide ? Math.PI / 2 : -Math.PI / 2) : 0;
  if (door.colliderIndex >= 0 && wallColliders[door.colliderIndex]) {
    wallColliders[door.colliderIndex].disabled = door.isOpen;
  }
  playDoorSound(door.isOpen);
}

// Criar Portas
createInteractiveDoor(-19.0, -3.6, '101', 'SUÍTE PRESIDENCIAL', true, null);
createInteractiveDoor(-6.0, -3.6, '102', 'BANHEIRO LUXO', true, 'key_102');
createInteractiveDoor(9.0, -3.6, '103', 'TECH LAB', true, 'key_103');
createInteractiveDoor(-21.0, 3.6, '104', 'SUÍTE BOTÂNICA', false, 'key_104');
createInteractiveDoor(-11.0, 3.6, '105', 'LAVABO', false, 'key_105');
createInteractiveDoor(13.0, 3.6, '106', 'CÂMARA TESTES', false, 'key_106');

// --- CONSTRUTOR DA PORTA MESTRE DE SAÍDA ---
function createGrandExitGate() {
  const gateGroup = new THREE.Group();
  gateGroup.position.set(30.0, 0, 0);

  const lintelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 5.2), lintelMat);
  lintel.position.set(0, 4.2, 0);
  gateGroup.add(lintel);

  const signMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xd97706, emissiveIntensity: 2.5 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.5, 3.4), signMat);
  sign.position.set(0, 3.4, 0);
  gateGroup.add(sign);

  const pivotLeft = new THREE.Group();
  pivotLeft.position.set(0, 0, -2.2);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x78350f, metalness: 0.7, roughness: 0.3 });
  const leafLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 2.2), doorMat);
  leafLeft.position.set(0, 1.7, 1.1);
  leafLeft.castShadow = true; leafLeft.receiveShadow = true;
  pivotLeft.add(leafLeft);

  const goldHandleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.95, roughness: 0.1 });
  const handleLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 16), goldHandleMat);
  handleLeft.position.set(-0.12, 1.6, 2.0);
  pivotLeft.add(handleLeft);
  gateGroup.add(pivotLeft);

  const pivotRight = new THREE.Group();
  pivotRight.position.set(0, 0, 2.2);
  const leafRight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 2.2), doorMat);
  leafRight.position.set(0, 1.7, -1.1);
  leafRight.castShadow = true; leafRight.receiveShadow = true;
  pivotRight.add(leafRight);

  const handleRight = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 16), goldHandleMat);
  handleRight.position.set(-0.12, 1.6, -2.0);
  pivotRight.add(handleRight);
  gateGroup.add(pivotRight);

  scene.add(gateGroup);

  const collider = {
    minX: 30.0 - 0.4 - PLAYER_RADIUS,
    maxX: 30.0 + 0.4 + PLAYER_RADIUS,
    minZ: -2.5 - PLAYER_RADIUS,
    maxZ: 2.5 + PLAYER_RADIUS,
    name: 'Porta Mestre de Saída',
    disabled: false,
  };
  wallColliders.push(collider);
  const colliderIndex = wallColliders.length - 1;

  return {
    group: gateGroup,
    pivotLeft,
    pivotRight,
    isOpen: false,
    currentAngle: 0,
    targetAngle: 0,
    requiredKey: 'key_master',
    x: 30.0, z: 0.0,
    name: 'PORTA MESTRE DE SAÍDA',
    colliderIndex,
  };
}

const grandExitGate = createGrandExitGate();

function toggleGrandExitGate(gate) {
  if (!acquiredKeys.has('key_master')) {
    playLockedSound();
    if (interactionPrompt) {
      interactionPrompt.classList.remove('hidden');
      if (promptText) promptText.textContent = '🔒 PORTA MESTRE TRANCADA! (Requer Chave Mestre)';
    }
    return;
  }

  gate.isOpen = !gate.isOpen;
  gate.targetAngle = gate.isOpen ? Math.PI / 2.2 : 0;
  if (gate.colliderIndex >= 0 && wallColliders[gate.colliderIndex]) {
    wallColliders[gate.colliderIndex].disabled = gate.isOpen;
  }
  playDoorSound(gate.isOpen);

  if (gate.isOpen) {
    playVictorySound();
    stopGameplayBGM();
    playMenuBGM();
    const victoryModal = document.getElementById('victory-modal');
    if (victoryModal) victoryModal.classList.remove('hidden');
  }
}

// --- MÓVEIS DO CENÁRIO ---
const steppableBoxes = [];

function createBench(x, z, rotationY = 0, benchName = 'Banco do Hotel') {
  const benchGroup = new THREE.Group();
  benchGroup.position.set(x, 0, z);
  benchGroup.rotation.y = rotationY;

  const width = 2.6; const depth = 0.9; const height = 0.95;
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.4 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth), seatMat);
  seat.position.y = 0.48; seat.castShadow = true; seat.receiveShadow = true; benchGroup.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.45, 0.1), seatMat);
  back.position.set(0, 0.78, -depth / 2 + 0.05); back.castShadow = true; benchGroup.add(back);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, depth + 0.05), frameMat);
  leg1.position.set(-width / 2 + 0.2, 0.24, 0); leg1.castShadow = true; benchGroup.add(leg1);
  const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, depth + 0.05), frameMat);
  leg2.position.set(width / 2 - 0.2, 0.24, 0); leg2.castShadow = true; benchGroup.add(leg2);

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
  boxMesh.castShadow = true; boxMesh.receiveShadow = true; crateGroup.add(boxMesh);
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
  seat.position.y = 0.4; seat.castShadow = true; sofaGroup.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.3), leatherMat);
  back.position.set(0, 0.9, -0.55); back.castShadow = true; sofaGroup.add(back);
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

// --- O PERSONAGEM (JOGADOR) ---
const playerGroup = new THREE.Group();
playerGroup.position.set(25, 1.0, 0); // Altura do colisor original, próximo da Porta Mestre

// Modelo fallback (garante visibilidade mesmo durante o carregamento)
const fallbackGeo = new THREE.CapsuleGeometry(0.35, 1.1, 4, 8);
const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.2 });
const fallbackPlayerMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
fallbackPlayerMesh.position.set(0, -0.1, 0);
fallbackPlayerMesh.castShadow = true;
fallbackPlayerMesh.receiveShadow = true;
playerGroup.add(fallbackPlayerMesh);
let playerBody = fallbackPlayerMesh;

// Iluminação omnidirecional ao redor do personagem (área imediata clara e nítida em 360°)
const playerLight = new THREE.PointLight(0xfff0e2, 5.5, 11.0, 1.1);
playerLight.position.set(0, 0.85, 0);
playerGroup.add(playerLight);

playerGroup.add(playerWeaponGroup);
scene.add(playerGroup);

// --- SISTEMA DE ANIMAÇÃO E MODELOS DO JOGADOR ---
let selectedCharacter = 'jake'; // 'jake' ou 'jane'
let isAiming = false;
let gamepadAiming = false;
let mouseAiming = false;
let keyAiming = false;
let playerMixer = null;
let playerActions = {};
let activePlayerAction = null;
let jakeModelInstance = null;
let janeModelInstance = null;
let jakeHasSkeleton = false;
let janeHasSkeleton = false;
let jakeRightHand = null;
let janeRightHand = null;
let jakeMixer = null;
let janeMixer = null;
let jakeActions = {};
let janeActions = {};
let currentWeaponStance = 'unarmed'; // 'unarmed', 'pistol', 'shotgun'

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
  } else {
    if (fallbackPlayerMesh) {
      fallbackPlayerMesh.visible = true;
      playerBody = fallbackPlayerMesh;
    }
  }

  // Garante que os meshes de armas em mãos sigam estritamente o estado da arma equipada
  if (weaponInventory.revolver && weaponInventory.revolver.mesh) {
    weaponInventory.revolver.mesh.visible = (equippedWeaponId === 'revolver');
  }
  if (weaponInventory.shotgun && weaponInventory.shotgun.mesh) {
    weaponInventory.shotgun.mesh.visible = (equippedWeaponId === 'shotgun');
  }

  // Tocar idle animation caso haja mixer válido
  if (playerMixer && playerActions['idle']) {
    playPlayerAnim(isAiming ? 'aim' : (velocity.lengthSq() > 0 ? 'walk' : 'idle'), 0.1);
  }
}

function playPlayerAnim(actionName, duration = 0.2) {
  if (isPlayerDead && actionName !== 'death' && actionName !== 'dying') {
    return;
  }

  let mappedAction = actionName;

  if (actionName === 'death' || actionName === 'dying') {
    mappedAction = 'death';
  } else if (playerHealth <= 35 && (actionName === 'walk' || actionName === 'run') && !isAiming) {
    // Quando com pouca vida (<=35 HP / Danger & Caution crítico), usa as animações de ferido
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

  if (!playerMixer || !playerActions[mappedAction]) {
    mappedAction = actionName; // fallback
  }

  if (!playerMixer || !playerActions[mappedAction]) return;
  const nextAction = playerActions[mappedAction];
  if (nextAction === activePlayerAction) return;

  nextAction.reset().fadeIn(duration).play();
  if (activePlayerAction) {
    activePlayerAction.fadeOut(duration);
  }
  activePlayerAction = nextAction;
}

// Carregar o modelo glb do Jake (antigo) e FBX da Jane
assetManager.loadFBX('jake', 'assets/models/jake/jake.fbx');
assetManager.loadFBX('jane', 'assets/models/jane/jane.fbx');

// Carregar modelos dos Inimigos e do Chefe FBX
assetManager.loadFBX('enemy1', 'assets/models/enemy1.fbx');
assetManager.loadFBX('enemy2', 'assets/models/enemy2.fbx');
assetManager.loadFBX('enemy3', 'assets/models/enemy3.fbx');
assetManager.loadFBX('enemy_boss', 'assets/models/enemy_boss.fbx');

// Carregar Animações FBX do Jogador (Gerais e Específicas por Gênero)
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

// Carregar Animações FBX dos Inimigos e Boss (pasta enemy_base)
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

// Carregar Efeitos Sonoros com suporte a múltiplos formatos (.mp3, .m4a, .ogg, .wav)
const gameSoundKeys = [
  'gunshot_pistol', 'gunshot_shotgun', 'gunshot', 'reload', 'dryfire', 'ammo',
  'hurt_male', 'hurt_female', 'hurt', 'heal_male', 'heal_female', 'heal',
  'zombie_hit', 'zombie_groan', 'zombie_death', 'boss_roar',
  'door', 'locked', 'key', 'switch', 'jump', 'victory'
];
gameSoundKeys.forEach(key => assetManager.loadSound(key, key));

assetManager.manager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const loadingProgress = document.getElementById('loading-progress');
  const loadingBar = document.getElementById('loading-bar');
  if (loadingProgress && loadingBar) {
    const percent = Math.floor((itemsLoaded / itemsTotal) * 100);
    loadingProgress.textContent = `${percent}%`;
    loadingBar.style.width = `${percent}%`;
  }
};

assetManager.manager.onLoad = () => {
  // Esconder tela de carregamento e mostrar o menu
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.style.display = 'none';
  const startModal = document.getElementById('start-menu-modal');
  if (startModal) startModal.classList.remove('hidden');

  // Habilitar a câmera rodando em volta do jogador no menu
  orbitControls.enabled = true;
  orbitControls.autoRotate = true;
  orbitControls.autoRotateSpeed = 1.0;

  playerWeaponGroup.position.set(0, 0, 0);
  playerWeaponGroup.rotation.set(Math.PI / 2, Math.PI / 2, 0); // Ajuste Mixamo

  const PISTOL_ROT_X = THREE.MathUtils.degToRad(-70);
  const PISTOL_ROT_Y = THREE.MathUtils.degToRad(90);
  const PISTOL_ROT_Z = THREE.MathUtils.degToRad(180);
  const PISTOL_POS_X = 15;
  const PISTOL_POS_Y = -2;
  const PISTOL_POS_Z = 8;

  if (assetManager.models['pistol']) {
    const pModel = assetManager.models['pistol'].clone();
    weaponInventory.revolver.mesh.children.forEach(ch => ch.visible = false);
    pModel.scale.set(1.25, 1.25, 1.25);
    pModel.rotation.set(PISTOL_ROT_X, PISTOL_ROT_Y, PISTOL_ROT_Z);
    pModel.position.set(PISTOL_POS_X, PISTOL_POS_Y, PISTOL_POS_Z);
    weaponInventory.revolver.mesh.add(pModel);
  }

  if (assetManager.models['shotgun']) {
    const sModel = assetManager.models['shotgun'].clone();
    weaponInventory.shotgun.mesh.children.forEach(ch => ch.visible = false);
    sModel.scale.set(0.85, 0.85, 0.85);
    sModel.rotation.set(PISTOL_ROT_X, PISTOL_ROT_Y, PISTOL_ROT_Z);
    sModel.position.set(PISTOL_POS_X, PISTOL_POS_Y, PISTOL_POS_Z);
    weaponInventory.shotgun.mesh.add(sModel);
  }

  // --- ATUALIZAÇÃO DE ARMAS COLETÁVEIS NO CHÃO ---
  collectibleWeapons.forEach(wObj => {
    if (wObj.id === 'revolver' && assetManager.models['pistol']) {
      wObj.group.children.forEach(ch => { if (ch.isMesh && (!ch.geometry || ch.geometry.type !== 'RingGeometry')) ch.visible = false; });
      const pModel = assetManager.models['pistol'].clone();
      pModel.scale.set(0.04, 0.04, 0.04);
      pModel.position.set(0, 0.15, 0);
      wObj.group.add(pModel);
    } else if (wObj.id === 'shotgun' && assetManager.models['shotgun']) {
      wObj.group.children.forEach(ch => { if (ch.isMesh && (!ch.geometry || ch.geometry.type !== 'RingGeometry')) ch.visible = false; });
      const sModel = assetManager.models['shotgun'].clone();
      // Tamanho do item Shotgun reduzido em 10% (0.04 -> 0.036)
      sModel.scale.set(0.036, 0.036, 0.036);
      sModel.position.set(0, 0.15, 0);
      wObj.group.add(sModel);
    }
  });

  // --- FUNÇÃO DE SETUP DE PERSONAGEM (JAKE E JANE) ---
  const setupCharacter = (modelKey) => {
    const charModel = assetManager.models[modelKey];
    if (!charModel) return null;

    let hasSkeleton = false;
    let rightHand = null;
    const toRemove = [];

    charModel.scale.set(0.018, 0.018, 0.018);
    charModel.position.set(0, -1.0, 0);

    charModel.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;

        // Esconder armas embutidas nos modelos originais (como rifles/pistolas que vêm colados no FBX)
        const name = c.name.toLowerCase();
        if (name.includes('weapon') || name.includes('gun') || name.includes('rifle') || name.includes('pistol') || name.includes('shotgun') || name.includes('sword') || name.includes('assault')) {
          c.visible = false;
        }
      }
      if (c.isSkinnedMesh) hasSkeleton = true;
      if (c.isCamera || c.isLight) toRemove.push(c);
      if (c.isBone && c.name) {
        c.name = c.name.replace(/.*mixamorig/g, 'mixamorig');
        // Se a personagem (como a Jane) tiver ossos sem o prefixo padrão do Mixamo, nós adicionamos
        if (!c.name.startsWith('mixamorig')) {
          // A primeira letra do osso deve ser maiúscula para casar com mixamorigHips, mixamorigSpine, etc
          c.name = 'mixamorig' + c.name.charAt(0).toUpperCase() + c.name.slice(1);
        }
        if (c.name === 'mixamorigRightHand') rightHand = c;
      }
    });

    toRemove.forEach(c => { if (c.parent) c.parent.remove(c); });

    if (hasSkeleton) {
      charModel.rotation.set(0, 0, 0);
    } else {
      charModel.rotation.set(-Math.PI / 2, 0, Math.PI);
    }

    playerGroup.add(charModel);

    // Inicializar Mixer
    let mixer = null;
    let actions = {};
    if (hasSkeleton) {
      mixer = new THREE.AnimationMixer(charModel);
      const isFemale = (modelKey === 'jane');
      const anims = ['idle', 'walk', 'run', 'jump', 'shoot', 'reload', 'pistol_idle', 'pistol_walk', 'pistol_run', 'rifle_idle', 'rifle_run', 'rifle_shoot', 'death', 'dying', 'injured_walk', 'injured_run'];
      anims.forEach(animName => {
        let animKey = animName;
        if (animName === 'idle') {
          animKey = isFemale ? 'idle_female' : 'idle_male';
        } else if (animName === 'walk') {
          animKey = isFemale ? 'walk_female' : 'walk_male';
        }

        let clip = assetManager.getAnimation(animKey);
        // Fallback para nome padrão se a animação específica por gênero não estiver carregada
        if (!clip && animKey !== animName) {
          clip = assetManager.getAnimation(animName);
        }

        if (clip && clip.tracks) {
          // Clona o clip para evitar conflitos entre as instâncias dos personagens
          const clipClone = clip.clone();
          clipClone.tracks.forEach(track => {
            if (track && track.name) {
              track.name = track.name.replace(/.*mixamorig/g, 'mixamorig');
              // Neutraliza root motion no quadril para evitar deslocamento ou afundamento no chão
              if (track.name.includes('Hips.position')) {
                const values = track.values;
                const initialX = values[0] || 0;
                const initialY = values[1] || 0;
                const initialZ = values[2] || 0;
                for (let i = 0; i < values.length; i += 3) {
                  values[i] = initialX;
                  if (animName !== 'jump' && animName !== 'death' && animName !== 'dying') {
                    values[i + 1] = initialY;
                  }
                  values[i + 2] = initialZ;
                }
              }
            }
          });
          const action = mixer.clipAction(clipClone);
          if (['jump', 'shoot', 'reload', 'rifle_shoot', 'death', 'dying'].includes(animName)) {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
          }
          actions[animName] = action;
        }
      });
      // Deixa o idle rodando no background
      if (actions['idle']) {
        actions['idle'].play();
      }
    }

    return { instance: charModel, hasSkeleton, rightHand, mixer, actions };
  };

  // Configura ambos os personagens
  const jakeData = setupCharacter('jake');
  if (jakeData) {
    jakeModelInstance = jakeData.instance;
    jakeHasSkeleton = jakeData.hasSkeleton;
    jakeRightHand = jakeData.rightHand;
    jakeMixer = jakeData.mixer;
    jakeActions = jakeData.actions;
  }

  const janeData = setupCharacter('jane');
  if (janeData) {
    janeModelInstance = janeData.instance;
    janeHasSkeleton = janeData.hasSkeleton;
    janeRightHand = janeData.rightHand;
    janeMixer = janeData.mixer;
    janeActions = janeData.actions;
  }

  // Atualiza visibilidade conforme seleção atual
  updateActiveCharacterModel();

  // Garante que os personagens comecem desarmados
  equipWeapon(null);

  // Configura todos os inimigos e o chefe com modelos FBX e animações
  setupAllEnemies();

  // Configura o corpo estático do zumbi decorativo no final do corredor
  setupCorpseProp();

  // Inicia a música do Menu
  playMenuBGM();

  // Desbloqueia áudio na primeira interação do usuário caso o navegador bloqueie autoplay
  const startAudioOnFirstClick = () => {
    if (!isGameStarted || isGamePaused) {
      playMenuBGM();
    }
  };
  window.addEventListener('pointerdown', startAudioOnFirstClick, { once: true });
  window.addEventListener('keydown', startAudioOnFirstClick, { once: true });

  console.log("Modelos e animações de personagens e inimigos configurados com sucesso!");
};

let corpseMixer = null;

// --- CORPO DE ZUMBI DECORATIVO NO FINAL DO CORREDOR (CENÁRIO) ---
function setupCorpseProp() {
  const baseModel = assetManager.models['enemy1'] || assetManager.models['enemy2'] || assetManager.models['enemy3'];
  if (!baseModel) return;

  const corpseGroup = new THREE.Group();
  // Posicionado no final do corredor oeste (y = 1.0 para coincidir com a altura dos zumbis na cena)
  corpseGroup.position.set(-25.8, 1.0, 0.4);
  corpseGroup.rotation.set(0, Math.PI / 3, 0);

  // Poça de sangue decorativa rente ao chão (y = -0.98 relativo ao grupo = 0.02 no mundo)
  const bloodMat = new THREE.MeshStandardMaterial({
    color: 0x3b0707,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.92,
  });
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), bloodMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(0, -0.98, 0);
  puddle.receiveShadow = true;
  corpseGroup.add(puddle);

  // Clona o modelo do zumbi
  const corpseInstance = SkeletonUtils.clone(baseModel);
  corpseInstance.scale.set(0.0228, 0.0228, 0.0228);
  corpseInstance.position.set(0, -1.0, 0);
  corpseInstance.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      child.visible = true;
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { m.side = THREE.DoubleSide; });
        } else {
          child.material.side = THREE.DoubleSide;
        }
      }
    }
  });

  // Aplica a pose final de morte (enemy_death)
  const clip = assetManager.getAnimation('enemy_death') || assetManager.getAnimation('enemy_dying');
  if (clip) {
    corpseMixer = new THREE.AnimationMixer(corpseInstance);
    const clipClone = clip.clone();
    clipClone.tracks.forEach(track => {
      if (track && track.name) {
        track.name = track.name.replace(/.*mixamorig/g, 'mixamorig').replace(/mixamorig:/g, 'mixamorig');
      }
    });
    const action = corpseMixer.clipAction(clipClone);
    action.setLoop(THREE.LoopOnce);
    action.clampWhenFinished = true;
    action.play();
    corpseMixer.setTime(clip.duration); // Fixa diretamente no quadro final caído no chão
  } else {
    corpseInstance.rotation.x = -Math.PI / 2;
    corpseInstance.position.set(0, -0.85, 0);
  }

  corpseGroup.add(corpseInstance);
  scene.add(corpseGroup);
}

// --- SISTEMA DE MOVIMENTAÇÃO, CONTROLES E ATALHOS ---
const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
const velocity = new THREE.Vector3();
let velocityY = 0;
const GRAVITY = -24.0;
const JUMP_FORCE = 5.8; // Pulo reduzido e realista (~0.7m de elevação)
let isGrounded = true;

const MOVE_SPEED = 2.8; // Caminhada ajustada para ser ligeiramente mais rápida que os zumbis
const RUN_SPEED = 4.1;  // Corrida tática (pouco acima dos stalkers ágeis 3.0-3.2)
const ACCELERATION = 20.0;
const FRICTION = 10.0;
let playerRotation = Math.PI / 2;
let walkBobTimer = 0;
let idleAnimTimer = 0;

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  // Tecla de Pausa (Escape ou P)
  if (e.code === 'Escape' || key === 'p') {
    if (isGameStarted && !isPlayerDead) {
      togglePauseGame();
      e.preventDefault();
      return;
    }
  }

  // Tecla para sair da Sala de Testes e voltar ao menu
  if (isGameStarted && isTestRoomMode && key === 'm') {
    exitTestRoomMode();
    e.preventDefault();
    return;
  }

  if (!isGameStarted && (e.code === 'Space' || e.code === 'Enter' || key === ' ')) {
    startGame();
    e.preventDefault();
    return;
  }

  if (isGamePaused) return;

  if (key === 'w' || key === 'arrowup') updateKeyState('w', true);
  if (key === 'a' || key === 'arrowleft') updateKeyState('a', true);
  if (key === 's' || key === 'arrowdown') updateKeyState('s', true);
  if (key === 'd' || key === 'arrowright') updateKeyState('d', true);
  if (e.code === 'Space' || key === ' ') { updateKeyState('space', true); e.preventDefault(); }
  if (key === 'shift') updateKeyState('shift', true);
  if (key === 'e') handleInteraction();
  if (key === 'g') fireActiveWeapon();
  if (key === 'f' || key === 'v') keyAiming = true;
  if (key === 'q') useMedkit();
  if (key === 'h') toggleHUD();
  if (key === '1') equipWeapon('revolver');
  if (key === '2') equipWeapon('shotgun');
  if (key === '3') equipWeapon(null);
  if (key === 'r') reloadActiveWeapon();
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup') updateKeyState('w', false);
  if (key === 'a' || key === 'arrowleft') updateKeyState('a', false);
  if (key === 's' || key === 'arrowdown') updateKeyState('s', false);
  if (key === 'd' || key === 'arrowright') updateKeyState('d', false);
  if (e.code === 'Space' || key === ' ') { updateKeyState('space', false); e.preventDefault(); }
  if (key === 'shift') updateKeyState('shift', false);
  if (key === 'f' || key === 'v') keyAiming = false;
});

// Suporte ao Botão Direito do Mouse para Mirar (Aim)
window.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    mouseAiming = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 2) {
    mouseAiming = false;
  }
});

window.addEventListener('contextmenu', (e) => {
  if (isGameStarted && !isGamePaused) {
    e.preventDefault();
  }
});

function updateKeyState(key, isPressed) {
  keys[key] = isPressed;
  const keyElem = document.getElementById(`key-${key}`);
  if (keyElem) {
    if (isPressed) keyElem.classList.add('active');
    else keyElem.classList.remove('active');
  }
}

// --- SUPORTE A CONTROLE (XBOX GAMEPAD DEFAULT) ---
let activeGamepadIndex = null;
const prevGamepadButtons = {};
let isGamepadConnected = false;

window.addEventListener('gamepadconnected', (e) => {
  activeGamepadIndex = e.gamepad.index;
  isGamepadConnected = true;
  console.log('🎮 Controle Xbox/Gamepad Conectado:', e.gamepad.id);
  if (interactionPrompt) interactionPrompt.classList.remove('hidden');
  const gpName = e.gamepad.id.split('(')[0] || 'Controle Xbox';
  if (promptText) promptText.textContent = `🎮 Controle Conectado: ${gpName}`;
  setTimeout(() => {
    if (promptText && promptText.textContent.includes('Controle Conectado')) {
      if (interactionPrompt) interactionPrompt.classList.add('hidden');
    }
  }, 3500);
});

window.addEventListener('gamepaddisconnected', (e) => {
  if (activeGamepadIndex === e.gamepad.index) {
    activeGamepadIndex = null;
    isGamepadConnected = false;
    console.log('🎮 Controle desconectado:', e.gamepad.id);
  }
});

function applyAxisDeadzone(val, deadzone = 0.16) {
  if (Math.abs(val) < deadzone) return 0;
  const sign = Math.sign(val);
  return sign * ((Math.abs(val) - deadzone) / (1.0 - deadzone));
}

function isButtonJustPressed(gp, index, threshold = 0.5) {
  const btn = gp.buttons[index];
  const isPressed = btn ? (btn.pressed || btn.value > threshold) : false;
  const wasPressed = prevGamepadButtons[index] || false;
  prevGamepadButtons[index] = isPressed;
  return isPressed && !wasPressed;
}

// HUD visível permanentemente por padrão
let isHUDVisible = true;
function toggleHUD() {
  isHUDVisible = true;
  const hudOverlay = document.getElementById('hud-overlay');
  if (hudOverlay) {
    hudOverlay.classList.remove('hud-hidden');
  }
}

// --- SISTEMA DE NAVEGAÇÃO DE TELAS DO MENU & DIFICULDADE ---
let isGameStarted = false;
let isGamePaused = false;

function showMenuScreen(screenId) {
  const screens = ['menu-screen-main', 'menu-screen-difficulty', 'menu-screen-instructions', 'menu-screen-online'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === screenId) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });
}

function showPauseScreen(screenId) {
  const screens = ['pause-screen-main', 'pause-screen-diff'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === screenId) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });
}

// --- SUPORTE E CONTROLES MOBILE / TOQUE VIRTUAL ---
function checkIsMobileDevice() {
  const userAgent = navigator.userAgent || '';
  const isAndroidOrIOS = /Android|iPhone|iPad|iPod/i.test(userAgent);
  const isMacTouch = /Macintosh/i.test(userAgent) && (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const isPointerCoarse = window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: coarse)').matches);
  const touchPoints = ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
  const minDimensionSmall = Math.min(window.innerWidth, window.innerHeight) <= 900;

  return isAndroidOrIOS || isMacTouch || isPointerCoarse || (touchPoints && minDimensionSmall);
}

let isMobileDevice = checkIsMobileDevice();
let forceMobileMode = false;
let isMobileCameraMode = true; // Câmera fixa próxima às costas do jogador no mobile por padrão

let touchMoveX = 0;
let touchMoveY = 0;
let touchAiming = false;

// Elementos da UI Mobile
const mobileControlsOverlay = document.getElementById('mobile-touch-controls');
const btnTouchPause = document.getElementById('btn-touch-pause');
const btnTouchCamMode = document.getElementById('btn-touch-cam-mode');
const touchCamLabel = document.getElementById('touch-cam-label');
const touchJoystickZone = document.getElementById('touch-joystick-zone');
const vJoystickBase = document.getElementById('v-joystick-base');
const vJoystickThumb = document.getElementById('v-joystick-thumb');
const touchLookZone = document.getElementById('touch-look-zone');
const btnTouchShoot = document.getElementById('btn-touch-shoot');
const btnTouchAim = document.getElementById('btn-touch-aim');
const btnTouchInteract = document.getElementById('btn-touch-interact');
const btnTouchReload = document.getElementById('btn-touch-reload');
const btnTouchHeal = document.getElementById('btn-touch-heal');
const btnTouchJump = document.getElementById('btn-touch-jump');
const btnTouchSwap = document.getElementById('btn-touch-swap');
const touchHealCount = document.getElementById('touch-heal-count');
const btnToggleMobileMode = document.getElementById('btn-toggle-mobile-mode');
const mobileModeTag = document.getElementById('mobile-mode-tag');

function updateRendererPerformanceSettings() {
  const isMobile = checkIsMobileDevice() || forceMobileMode;
  if (isMobile) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.type = THREE.PCFShadowMap;
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
}

function updateMobileControlsVisibility() {
  updateRendererPerformanceSettings();
  const isMobile = checkIsMobileDevice() || forceMobileMode;
  const showMobile = isMobile && isGameStarted && !isGamePaused && !isPlayerDead;
  if (mobileControlsOverlay) {
    if (showMobile) {
      mobileControlsOverlay.classList.remove('hidden');
    } else {
      mobileControlsOverlay.classList.add('hidden');
    }
  }

  // Oculta o botão de controles touch no menu principal do PC, mostrando apenas no celular (mobile real)
  if (btnToggleMobileMode) {
    const isRealMobile = checkIsMobileDevice();
    if (isRealMobile) {
      btnToggleMobileMode.style.display = '';
    } else {
      btnToggleMobileMode.style.display = 'none';
    }
  }

  if (mobileModeTag) {
    const isAutoDetected = checkIsMobileDevice();
    mobileModeTag.textContent = forceMobileMode ? 'FORÇADO (ON)' : (isAutoDetected ? 'AUTO (DETECTADO)' : 'DESATIVADO');
    mobileModeTag.style.background = forceMobileMode ? 'rgba(56, 189, 248, 0.35)' : (isAutoDetected ? 'rgba(52, 211, 153, 0.3)' : 'rgba(148, 163, 184, 0.2)');
    mobileModeTag.style.color = forceMobileMode ? '#38bdf8' : (isAutoDetected ? '#34d399' : '#94a3b8');
  }
}

// Executa na inicialização para ocultar o botão no PC imediatamente
updateMobileControlsVisibility();

// Joystick Analógico Virtual
let joystickTouchId = null;
let joystickCenter = { x: 0, y: 0 };
const JOYSTICK_MAX_RADIUS = 50;

if (touchJoystickZone && vJoystickBase && vJoystickThumb) {
  const updateJoystickPosition = (clientX, clientY) => {
    let dx = clientX - joystickCenter.x;
    let dy = clientY - joystickCenter.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > JOYSTICK_MAX_RADIUS) {
      dx = (dx / dist) * JOYSTICK_MAX_RADIUS;
      dy = (dy / dist) * JOYSTICK_MAX_RADIUS;
    }

    vJoystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    touchMoveX = dx / JOYSTICK_MAX_RADIUS;
    touchMoveY = dy / JOYSTICK_MAX_RADIUS;
  };

  const resetJoystick = () => {
    joystickTouchId = null;
    vJoystickThumb.style.transform = 'translate(-50%, -50%)';
    touchMoveX = 0;
    touchMoveY = 0;
  };

  touchJoystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    const rect = vJoystickBase.getBoundingClientRect();
    joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    updateJoystickPosition(touch.clientX, touch.clientY);
  }, { passive: false });

  touchJoystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        updateJoystickPosition(touch.clientX, touch.clientY);
        break;
      }
    }
  }, { passive: false });

  touchJoystickZone.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        resetJoystick();
        break;
      }
    }
  }, { passive: false });

  touchJoystickZone.addEventListener('touchcancel', (e) => {
    resetJoystick();
  }, { passive: false });
}

// Controle de Olhar por Arrasto (Touch Look Zone)
let lookTouchId = null;
let lastLookPos = { x: 0, y: 0 };

if (touchLookZone) {
  touchLookZone.addEventListener('touchstart', (e) => {
    if (lookTouchId !== null) return;
    const touch = e.changedTouches[0];
    lookTouchId = touch.identifier;
    lastLookPos = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  touchLookZone.addEventListener('touchmove', (e) => {
    if (lookTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        const dx = touch.clientX - lastLookPos.x;
        const dy = touch.clientY - lastLookPos.y;
        if (isThirdPerson) {
          cameraYaw -= dx * 0.0018;
          cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.0014, -0.15, 1.15);
        }
        lastLookPos = { x: touch.clientX, y: touch.clientY };
        break;
      }
    }
  }, { passive: true });

  const endLookTouch = (e) => {
    if (lookTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) {
        lookTouchId = null;
        break;
      }
    }
  };

  touchLookZone.addEventListener('touchend', endLookTouch, { passive: true });
  touchLookZone.addEventListener('touchcancel', endLookTouch, { passive: true });
}

// Botões de Ação Touch
let shootIntervalId = null;

if (btnTouchShoot) {
  btnTouchShoot.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fireActiveWeapon();
    if (!shootIntervalId) {
      shootIntervalId = setInterval(() => {
        if (isGameStarted && !isGamePaused && !isPlayerDead) fireActiveWeapon();
      }, 200);
    }
  }, { passive: false });

  const stopShoot = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (shootIntervalId) {
      clearInterval(shootIntervalId);
      shootIntervalId = null;
    }
  };
  btnTouchShoot.addEventListener('touchend', stopShoot, { passive: false });
  btnTouchShoot.addEventListener('touchcancel', stopShoot, { passive: false });
}

if (btnTouchAim) {
  btnTouchAim.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchAiming = !touchAiming;
    if (touchAiming) {
      btnTouchAim.classList.add('aim-active');
    } else {
      btnTouchAim.classList.remove('aim-active');
    }
  }, { passive: false });
}

if (btnTouchInteract) {
  btnTouchInteract.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleInteraction();
  }, { passive: false });
}

if (btnTouchReload) {
  btnTouchReload.addEventListener('touchstart', (e) => {
    e.preventDefault();
    reloadActiveWeapon();
  }, { passive: false });
}

if (btnTouchHeal) {
  btnTouchHeal.addEventListener('touchstart', (e) => {
    e.preventDefault();
    useMedkit();
    if (touchHealCount) touchHealCount.textContent = `${playerMedkits}`;
  }, { passive: false });
}

if (btnTouchJump) {
  btnTouchJump.addEventListener('touchstart', (e) => {
    e.preventDefault();
    updateKeyState('space', true);
  }, { passive: false });
  btnTouchJump.addEventListener('touchend', (e) => {
    e.preventDefault();
    updateKeyState('space', false);
  }, { passive: false });
}

if (btnTouchSwap) {
  btnTouchSwap.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (equippedWeaponId === null) {
      equipWeapon('revolver');
    } else if (equippedWeaponId === 'revolver') {
      equipWeapon('shotgun');
    } else {
      equipWeapon(null);
    }
  }, { passive: false });
}

if (btnTouchPause) {
  btnTouchPause.addEventListener('touchstart', (e) => {
    e.preventDefault();
    togglePauseGame();
  }, { passive: false });
}

if (btnTouchCamMode) {
  btnTouchCamMode.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isMobileCameraMode = !isMobileCameraMode;
    if (touchCamLabel) {
      touchCamLabel.textContent = isMobileCameraMode ? '📷 COSTAS (FIXA)' : '📷 CÂMERA LIVRE';
    }
  }, { passive: false });
}

if (btnToggleMobileMode) {
  btnToggleMobileMode.addEventListener('click', () => {
    forceMobileMode = !forceMobileMode;
    isMobileDevice = checkIsMobileDevice() || forceMobileMode;
    if (mobileModeTag) {
      mobileModeTag.textContent = forceMobileMode ? 'ATIVADO' : (checkIsMobileDevice() ? 'AUTO' : 'DESATIVADO');
      mobileModeTag.style.background = forceMobileMode ? 'rgba(56, 189, 248, 0.3)' : 'rgba(52, 211, 153, 0.25)';
      mobileModeTag.style.color = forceMobileMode ? '#38bdf8' : '#34d399';
    }
    updateMobileControlsVisibility();
  });
}

window.addEventListener('resize', () => {
  isMobileDevice = checkIsMobileDevice();
  updateMobileControlsVisibility();
});

function togglePauseGame(forceState) {
  if (!isGameStarted || isPlayerDead) return;

  isGamePaused = typeof forceState === 'boolean' ? forceState : !isGamePaused;
  const pauseModal = document.getElementById('pause-modal');
  if (pauseModal) {
    if (isGamePaused) {
      pauseModal.classList.remove('hidden');
      showPauseScreen('pause-screen-main');
      pauseGameplayBGM();
      playMenuBGM();
    } else {
      pauseModal.classList.add('hidden');
      clock.getDelta(); // Limpa o delta acumulado durante a pausa
      stopMenuBGM();
      startGameplayBGM();
    }
  }
  updateMobileControlsVisibility();
}

// --- SISTEMA MULTIPLAYER CO-OP ONLINE (WEBRTC P2P VIA PEERJS) ---
let peer = null;
let p2pConn = null;
let isOnlineMultiplayer = false;
let isP2pHost = false;
let p2pRoomCode = '';

// Modelo e Grupo do Parceiro 3D
let partnerGroup = new THREE.Group();
scene.add(partnerGroup);
partnerGroup.visible = false;

let partnerModelInstance = null;
let partnerMixer = null;
let partnerActions = {};
let activePartnerAction = null;
let partnerCharacter = 'jane';
let partnerTargetPos = new THREE.Vector3(1.5, 1.0, 0);
let partnerTargetYaw = Math.PI / 2;
let partnerHealth = 100;
let partnerEquippedWeapon = null;
let partnerWeaponGroup = new THREE.Group();
let partnerRevolverMesh = null;
let partnerShotgunMesh = null;

function setupPartnerMesh(charName) {
  partnerCharacter = charName;
  while (partnerGroup.children.length > 0) {
    partnerGroup.remove(partnerGroup.children[0]);
  }

  const baseModel = charName === 'jane' ? janeModelInstance : jakeModelInstance;
  if (!baseModel) return;

  partnerModelInstance = SkeletonUtils.clone(baseModel);
  partnerModelInstance.scale.set(0.018, 0.018, 0.018);
  partnerModelInstance.position.set(0, -1.0, 0);
  partnerModelInstance.visible = true;

  let rightHand = null;
  partnerModelInstance.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
    if (c.isBone && c.name && c.name.includes('RightHand')) {
      rightHand = c;
    }
  });

  partnerGroup.add(partnerModelInstance);
  partnerGroup.visible = true;
  partnerGroup.position.set(1.5, 1.0, 0);

  if (assetManager) {
    partnerMixer = new THREE.AnimationMixer(partnerModelInstance);
    partnerActions = {};
    const isFemale = (charName === 'jane');
    const anims = ['idle', 'walk', 'run', 'aim', 'shoot', 'death'];
    anims.forEach(animName => {
      let animKey = animName;
      if (animName === 'idle') animKey = isFemale ? 'idle_female' : 'idle_male';
      if (animName === 'walk') animKey = isFemale ? 'walk_female' : 'walk_male';
      if (animName === 'shoot' || animName === 'aim') animKey = 'shoot';
      let clip = assetManager.getAnimation(animKey) || assetManager.getAnimation(animName);
      if (clip) {
        const clipClone = clip.clone();
        clipClone.tracks.forEach(track => {
          if (track && track.name) {
            track.name = track.name.replace(/.*mixamorig/g, 'mixamorig');
            if (track.name.includes('Hips.position')) {
              const values = track.values;
              const initialX = values[0] || 0;
              const initialY = values[1] || 0;
              const initialZ = values[2] || 0;
              for (let i = 0; i < values.length; i += 3) {
                values[i] = initialX;
                if (animName !== 'death') values[i + 1] = initialY;
                values[i + 2] = initialZ;
              }
            }
          }
        });
        const action = partnerMixer.clipAction(clipClone);
        if (animName === 'death' || animName === 'shoot') {
          action.setLoop(THREE.LoopOnce);
          action.clampWhenFinished = true;
        }
        partnerActions[animName] = action;
      }
    });
    if (partnerActions['idle']) partnerActions['idle'].play();
  }

  partnerWeaponGroup = new THREE.Group();
  partnerWeaponGroup.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  const PISTOL_ROT_X = THREE.MathUtils.degToRad(-70);
  const PISTOL_ROT_Y = THREE.MathUtils.degToRad(90);
  const PISTOL_ROT_Z = THREE.MathUtils.degToRad(180);

  if (assetManager.models['pistol']) {
    partnerRevolverMesh = assetManager.models['pistol'].clone();
    partnerRevolverMesh.scale.set(1.25, 1.25, 1.25);
    partnerRevolverMesh.rotation.set(PISTOL_ROT_X, PISTOL_ROT_Y, PISTOL_ROT_Z);
    partnerRevolverMesh.position.set(15, -2, 8);
    partnerRevolverMesh.visible = false;
    partnerWeaponGroup.add(partnerRevolverMesh);
  }

  if (assetManager.models['shotgun']) {
    partnerShotgunMesh = assetManager.models['shotgun'].clone();
    partnerShotgunMesh.scale.set(0.85, 0.85, 0.85);
    partnerShotgunMesh.rotation.set(PISTOL_ROT_X, PISTOL_ROT_Y, PISTOL_ROT_Z);
    partnerShotgunMesh.position.set(15, -2, 8);
    partnerShotgunMesh.visible = false;
    partnerWeaponGroup.add(partnerShotgunMesh);
  }

  if (rightHand) rightHand.add(partnerWeaponGroup);
}

function playPartnerAnim(actionName, duration = 0.2) {
  if (!partnerMixer || !partnerActions[actionName]) return;
  const nextAction = partnerActions[actionName];
  if (nextAction === activePartnerAction) return;

  nextAction.reset().fadeIn(duration).play();
  if (activePartnerAction) activePartnerAction.fadeOut(duration);
  activePartnerAction = nextAction;
}

function updateP2pStatus(text, color = '#38bdf8') {
  const statusElem = document.getElementById('p2p-status-text');
  if (statusElem) {
    statusElem.textContent = text;
    statusElem.style.color = color;
  }
}

function generate4DigitCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function initP2pHost() {
  if (typeof Peer === 'undefined') {
    updateP2pStatus('Erro: PeerJS não carregado. Verifique a conexão.', '#ef4444');
    return;
  }

  p2pRoomCode = generate4DigitCode();
  const peerId = 'outbreak-hotel-' + p2pRoomCode;

  updateP2pStatus('Criando sala...', '#facc15');

  if (peer) { try { peer.destroy(); } catch(e){} }

  peer = new Peer(peerId, { debug: 1 });

  peer.on('open', (id) => {
    const codeDisplay = document.getElementById('p2p-room-code-display');
    if (codeDisplay) {
      codeDisplay.textContent = p2pRoomCode;
      codeDisplay.classList.remove('hidden');
    }
    updateP2pStatus(`👑 Sala Criada! Código: ${p2pRoomCode}. Aguardando parceiro...`, '#38bdf8');
  });

  peer.on('connection', (conn) => {
    setupP2pConnection(conn, true);
  });

  peer.on('error', (err) => {
    console.error('PeerJS Host Error:', err);
    if (err.type === 'unavailable-id') {
      initP2pHost();
    } else {
      updateP2pStatus(`Erro na conexão: ${err.message}`, '#ef4444');
    }
  });
}

function initP2pClient(code) {
  if (typeof Peer === 'undefined') {
    updateP2pStatus('Erro: PeerJS não carregado. Verifique a conexão.', '#ef4444');
    return;
  }

  const cleanCode = (code || '').trim();
  if (!cleanCode || cleanCode.length !== 4) {
    updateP2pStatus('Digite um código válido de 4 dígitos (Ex: 4829)', '#facc15');
    return;
  }

  updateP2pStatus(`Conectando à sala ${cleanCode}...`, '#facc15');

  if (peer) { try { peer.destroy(); } catch(e){} }

  peer = new Peer({ debug: 1 });

  peer.on('open', () => {
    const targetPeerId = 'outbreak-hotel-' + cleanCode;
    const conn = peer.connect(targetPeerId, { reliable: true });
    setupP2pConnection(conn, false);
  });

  peer.on('error', (err) => {
    console.error('PeerJS Client Error:', err);
    updateP2pStatus(`Não foi possível conectar à sala ${cleanCode}. Verifique o código.`, '#ef4444');
  });
}

function setupP2pConnection(conn, isHost) {
  p2pConn = conn;
  isP2pHost = isHost;

  conn.on('open', () => {
    isOnlineMultiplayer = true;
    updateP2pStatus('🟢 Conectado! Iniciando jogo Co-op...', '#34d399');

    if (isHost) {
      selectedCharacter = 'jake';
      partnerCharacter = 'jane';
    } else {
      selectedCharacter = 'jane';
      partnerCharacter = 'jake';
    }

    updateActiveCharacterModel();
    setupPartnerMesh(partnerCharacter);

    setTimeout(() => {
      startGame();
    }, 800);
  });

  conn.on('data', (data) => {
    handleP2pData(data);
  });

  conn.on('close', () => {
    isOnlineMultiplayer = false;
    updateP2pStatus('❌ O outro jogador desconectou.', '#ef4444');
    if (partnerGroup) partnerGroup.visible = false;
  });

  conn.on('error', (err) => {
    console.error('P2P Connection error:', err);
    updateP2pStatus('Erro na transmissão P2P.', '#ef4444');
  });
}

function handleP2pData(data) {
  if (!data || typeof data !== 'object') return;

  if (data.type === 'PLAYER_SYNC') {
    partnerTargetPos.set(data.x, data.y, data.z);
    partnerTargetYaw = data.yaw;
    if (partnerGroup && !partnerGroup.visible) partnerGroup.visible = true;

    if (data.anim) playPartnerAnim(data.anim);

    partnerHealth = data.hp || 100;
    partnerEquippedWeapon = data.weapon;

    if (partnerRevolverMesh) partnerRevolverMesh.visible = (data.weapon === 'revolver');
    if (partnerShotgunMesh) partnerShotgunMesh.visible = (data.weapon === 'shotgun');
  } else if (data.type === 'EVENT_FIRE') {
    if (data.weaponId === 'shotgun') playShotgunSound();
    else playGunshotSound();
  } else if (data.type === 'GAME_STATE_SYNC' && !isP2pHost) {
    if (Array.isArray(data.enemies)) {
      data.enemies.forEach(eState => {
        const enemy = activeEnemies.find(e => e.id === eState.id);
        if (enemy) {
          enemy.group.position.set(eState.x, eState.y, eState.z);
          enemy.group.rotation.y = eState.yaw;
          enemy.hp = eState.hp;
          if (eState.isDead && !enemy.isDead) {
            enemy.isDead = true;
            playEnemyAnim(enemy, 'death', 0.15);
          }
        }
      });
    }
    if (Array.isArray(data.doors)) {
      data.doors.forEach(dState => {
        const door = interactiveDoors.find(d => d.roomNumber === dState.roomNumber);
        if (door) {
          door.isOpen = dState.isOpen;
          door.targetAngle = dState.targetAngle;
          door.isUnlocked = dState.isUnlocked;
        }
      });
    }
  }
}

function initMenuNavigation() {
  // Navegação no Menu Inicial
  const btnOpenDiff = document.getElementById('btn-open-difficulty');
  const btnOpenInst = document.getElementById('btn-open-instructions');
  const btnOpenOnline = document.getElementById('btn-open-online');
  const btnBackDiff = document.getElementById('btn-back-from-diff');
  const btnBackInst = document.getElementById('btn-back-from-inst');
  const btnBackOnline = document.getElementById('btn-back-online');
  const btnStartTestRoom = document.getElementById('btn-start-test-room');
  const btnP2pCreate = document.getElementById('btn-p2p-create-room');
  const btnP2pJoin = document.getElementById('btn-p2p-join-room');

  if (btnOpenDiff) btnOpenDiff.addEventListener('click', () => showMenuScreen('menu-screen-difficulty'));
  if (btnOpenInst) btnOpenInst.addEventListener('click', () => showMenuScreen('menu-screen-instructions'));
  if (btnOpenOnline) btnOpenOnline.addEventListener('click', () => showMenuScreen('menu-screen-online'));
  if (btnBackDiff) btnBackDiff.addEventListener('click', () => showMenuScreen('menu-screen-main'));
  if (btnBackInst) btnBackInst.addEventListener('click', () => showMenuScreen('menu-screen-main'));
  if (btnBackOnline) btnBackOnline.addEventListener('click', () => showMenuScreen('menu-screen-main'));
  if (btnStartTestRoom) btnStartTestRoom.addEventListener('click', startTestRoomMode);
  if (btnP2pCreate) btnP2pCreate.addEventListener('click', () => initP2pHost());
  if (btnP2pJoin) {
    btnP2pJoin.addEventListener('click', () => {
      const codeInput = document.getElementById('input-p2p-room-code');
      if (codeInput) initP2pClient(codeInput.value);
    });
  }

  // Navegação no Menu de Pausa
  const btnResumeGame = document.getElementById('btn-resume-game');
  const btnPauseDiff = document.getElementById('btn-pause-difficulty');
  const btnPauseRestart = document.getElementById('btn-pause-restart');
  const btnPauseMenu = document.getElementById('btn-pause-menu');
  const btnBackPauseDiff = document.getElementById('btn-back-from-pause-diff');

  if (btnResumeGame) {
    btnResumeGame.addEventListener('click', () => togglePauseGame(false));
    btnResumeGame.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      togglePauseGame(false);
    });
  }
  if (btnPauseDiff) btnPauseDiff.addEventListener('click', () => showPauseScreen('pause-screen-diff'));
  if (btnBackPauseDiff) btnBackPauseDiff.addEventListener('click', () => showPauseScreen('pause-screen-main'));
  if (btnPauseRestart) {
    btnPauseRestart.addEventListener('click', () => {
      togglePauseGame(false);
      resetGameState();
      stopMenuBGM();
      startGameplayBGM();
    });
  }
  if (btnPauseMenu) {
    btnPauseMenu.addEventListener('click', () => {
      togglePauseGame(false);
      exitTestRoomMode();
    });
  }

  // Presets no Menu Inicial e na Pausa
  const presetButtons = document.querySelectorAll('.btn-preset, .btn-preset-pause');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.getAttribute('data-preset');
      const preset = DIFFICULTY_PRESETS[presetKey];
      if (preset) {
        applyDifficultySettings(preset.speedMult, preset.hpMult, preset.damageMult, presetKey);
      }
    });
  });

  // Sliders no Menu Inicial
  const sliderSpeed = document.getElementById('slider-enemy-speed');
  const sliderHp = document.getElementById('slider-enemy-hp');

  if (sliderSpeed) {
    sliderSpeed.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100;
      applyDifficultySettings(val, gameDifficulty.hpMultiplier, gameDifficulty.damageMultiplier, 'custom');
    });
  }

  if (sliderHp) {
    sliderHp.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100;
      applyDifficultySettings(gameDifficulty.speedMultiplier, val, gameDifficulty.damageMultiplier, 'custom');
    });
  }

  // Sliders no Menu de Pausa
  const pauseSliderSpeed = document.getElementById('pause-slider-enemy-speed');
  const pauseSliderHp = document.getElementById('pause-slider-enemy-hp');

  if (pauseSliderSpeed) {
    pauseSliderSpeed.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100;
      applyDifficultySettings(val, gameDifficulty.hpMultiplier, gameDifficulty.damageMultiplier, 'custom');
    });
  }

  if (pauseSliderHp) {
    pauseSliderHp.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100;
      applyDifficultySettings(gameDifficulty.speedMultiplier, val, gameDifficulty.damageMultiplier, 'custom');
    });
  }

  updateDifficultyUI();
}

initMenuNavigation();

function startTestRoomMode() {
  isTestRoomMode = true;
  resetGameState();

  // Teleporta o jogador para o centro da Sala de Testes (X: 200, Z: 200)
  playerGroup.position.set(200, 1.0, 200);
  playerRotation = 0;
  playerGroup.rotation.y = playerRotation;
  cameraYaw = 0;
  cameraPitch = 0.20;
  cameraDistance = 3.8;

  // Libera armas e munições para testes completos
  weaponInventory.revolver.isAcquired = true;
  weaponInventory.revolver.loadedAmmo = 6;
  weaponInventory.revolver.reserveAmmo = 99;

  weaponInventory.shotgun.isAcquired = true;
  weaponInventory.shotgun.loadedAmmo = 4;
  weaponInventory.shotgun.reserveAmmo = 99;

  equipWeapon('revolver');
  medkits = 5;

  if (scene.fog) scene.fog.density = 0.012; // Névoa suave na sala de testes
  isGameStarted = true;
  isGamePaused = false;

  stopMenuBGM();
  startGameplayBGM();

  orbitControls.autoRotate = false;
  orbitControls.enabled = !isThirdPerson;

  if (AUDIO_ENABLED) {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
  }

  const startModal = document.getElementById('start-menu-modal');
  if (startModal) startModal.classList.add('hidden');

  const pauseModal = document.getElementById('pause-modal');
  if (pauseModal) pauseModal.classList.add('hidden');

  updateActiveCharacterModel();
  updateInventoryUI();
  updateWeaponsUI();
  updatePlayerHealthUI();
  updateMobileControlsVisibility();

  setTimeout(() => {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    window.dispatchEvent(new Event('resize'));
  }, 50);

  console.log("Sala de Testes Sandbox inicializada!");
}

function exitTestRoomMode() {
  isTestRoomMode = false;
  resetGameState();

  stopGameplayBGM();
  playMenuBGM();

  if (scene.fog) scene.fog.density = 0.215;
  isGameStarted = false;
  isGamePaused = false;

  const startModal = document.getElementById('start-menu-modal');
  if (startModal) {
    startModal.classList.remove('hidden');
    showMenuScreen('menu-screen-main');
  }

  const pauseModal = document.getElementById('pause-modal');
  if (pauseModal) pauseModal.classList.add('hidden');

  orbitControls.enabled = true;
  orbitControls.autoRotate = true;
  updateMobileControlsVisibility();
}

function startGame() {
  if (isGameStarted) return;
  isTestRoomMode = false;
  isGameStarted = true;
  toggleRoomEnvironmentLight('corridor', false);

  stopMenuBGM();
  startGameplayBGM();

  orbitControls.autoRotate = false;
  orbitControls.enabled = !isThirdPerson;

  // Iniciar e destravar o AudioContext durante o clique do usuario
  if (AUDIO_ENABLED) {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  const startModal = document.getElementById('start-menu-modal');
  if (startModal) startModal.classList.add('hidden');
  playVictorySound();

  // Garante que o jogador começa desarmado no início da campanha
  equipWeapon(null);
  updateWeaponsUI();

  // Define o modelo ativo
  updateActiveCharacterModel();
  updateMobileControlsVisibility();

  // Força o navegador a voltar para o topo e recalcular o tamanho do canvas
  // Isso evita o bug da tela cortada pela metade ao ocultar o menu modal.
  setTimeout(() => {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    window.dispatchEvent(new Event('resize'));
  }, 50);
}

const btnStartGame = document.getElementById('btn-start-game');
if (btnStartGame) btnStartGame.addEventListener('click', startGame);

// --- SELEÇÃO DE PERSONAGEM ---
const btnSelectJake = document.getElementById('btn-select-jake');
const btnSelectJane = document.getElementById('btn-select-jane');

function updateCharSelectionUI() {
  if (selectedCharacter === 'jake') {
    if (btnSelectJake) {
      btnSelectJake.style.borderColor = '#38bdf8';
      btnSelectJake.style.background = 'rgba(56, 189, 248, 0.2)';
      btnSelectJake.style.color = '#fff';
    }
    if (btnSelectJane) {
      btnSelectJane.style.borderColor = 'transparent';
      btnSelectJane.style.background = 'rgba(255, 255, 255, 0.05)';
      btnSelectJane.style.color = '#94a3b8';
    }
  } else {
    if (btnSelectJane) {
      btnSelectJane.style.borderColor = '#38bdf8';
      btnSelectJane.style.background = 'rgba(56, 189, 248, 0.2)';
      btnSelectJane.style.color = '#fff';
    }
    if (btnSelectJake) {
      btnSelectJake.style.borderColor = 'transparent';
      btnSelectJake.style.background = 'rgba(255, 255, 255, 0.05)';
      btnSelectJake.style.color = '#94a3b8';
    }
  }
}

if (btnSelectJake) {
  btnSelectJake.addEventListener('click', () => {
    selectedCharacter = 'jake';
    updateCharSelectionUI();
    updateActiveCharacterModel();
  });
}
if (btnSelectJane) {
  btnSelectJane.addEventListener('click', () => {
    selectedCharacter = 'jane';
    updateCharSelectionUI();
    updateActiveCharacterModel();
  });
}

const btnToggleHud = document.getElementById('btn-toggle-hud');
const floatingHudToggle = document.getElementById('floating-hud-toggle');
if (btnToggleHud) btnToggleHud.addEventListener('click', toggleHUD);
if (floatingHudToggle) floatingHudToggle.addEventListener('click', toggleHUD);

// Clique na tela para Disparo / Seleção de Armas
const badgeRev = document.getElementById('badge-weapon-revolver');
const badgeSht = document.getElementById('badge-weapon-shotgun');
const permanentWeaponHud = document.getElementById('permanent-weapon-hud');

if (badgeRev) badgeRev.addEventListener('click', () => equipWeapon('revolver'));
if (badgeSht) badgeSht.addEventListener('click', () => equipWeapon('shotgun'));

const permMedkitBtn = document.getElementById('perm-medkit-btn');
if (permMedkitBtn) {
  permMedkitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    useMedkit();
  });
}

const btnGameOverRestart = document.getElementById('btn-game-over-restart');
if (btnGameOverRestart) {
  btnGameOverRestart.addEventListener('click', () => {
    resetGameState();
    isGameStarted = false;
    stopGameplayBGM();
    playMenuBGM();

    // Reseta a câmera orbital de volta para a visualização do menu principal
    camera.position.set(28.8, 2.1, 0.0);
    currentCameraPos.copy(camera.position);
    currentLookAt.set(25, 1.2, 0);
    orbitControls.target.set(25, 1.0, 0);
    orbitControls.enabled = true;
    orbitControls.autoRotate = true;
    orbitControls.autoRotateSpeed = 1.0;
    orbitControls.update();

    const startModal = document.getElementById('start-menu-modal');
    if (startModal) {
      startModal.classList.remove('hidden');
      showMenuScreen('menu-screen-main');
    }
  });
}

if (permanentWeaponHud) {
  permanentWeaponHud.addEventListener('click', (e) => {
    if (e.target && e.target.closest('#perm-medkit-btn')) return;
    e.stopPropagation();
    const wRev = weaponInventory.revolver;
    const wSht = weaponInventory.shotgun;

    // Se a arma atual estiver vazia com reserva, recarrega
    if (equippedWeaponId && weaponInventory[equippedWeaponId].loadedAmmo === 0 && weaponInventory[equippedWeaponId].reserveAmmo > 0) {
      reloadActiveWeapon();
      return;
    }

    // Alterna armas adquiridas
    if (equippedWeaponId === null) {
      if (wRev.isAcquired) equipWeapon('revolver');
      else if (wSht.isAcquired) equipWeapon('shotgun');
    } else if (equippedWeaponId === 'revolver') {
      if (wSht.isAcquired) equipWeapon('shotgun');
      else equipWeapon(null);
    } else if (equippedWeaponId === 'shotgun') {
      if (wRev.isAcquired) equipWeapon('revolver');
      else equipWeapon(null);
    }
  });
}

// Lógica de Interação ('E' ou Coleta)
function handleInteraction() {
  if (isPlayerDead) return;
  const playerPos = playerGroup.position;

  // 1. Coletar Medicamentos 3D (até 2.5m)
  for (const medObj of collectibleMedkits) {
    if (!medObj.isCollected) {
      const dist = playerPos.distanceTo(medObj.group.position);
      if (dist < 2.5) {
        medObj.isCollected = true;
        medObj.group.visible = false;
        medkits++;
        playHealSound();
        updatePlayerHealthUI();
        if (interactionPrompt) interactionPrompt.classList.remove('hidden');
        if (promptText) promptText.textContent = `Coletou Medicamento! 💊 (+1 Medkit no inventário)`;
        return;
      }
    }
  }

  // 2. Coletar Armas 3D (até 2.5m)
  for (const wObj of collectibleWeapons) {
    if (!wObj.isCollected) {
      const dist = playerPos.distanceTo(wObj.group.position);
      if (dist < 2.5) {
        wObj.isCollected = true;
        wObj.group.visible = false;
        weaponInventory[wObj.id].isAcquired = true;
        weaponInventory[wObj.id].loadedAmmo = weaponInventory[wObj.id].maxMag;
        weaponInventory[wObj.id].reserveAmmo += weaponInventory[wObj.id].maxMag;
        equipWeapon(wObj.id);
        playKeySound();
        updateWeaponsUI();
        return;
      }
    }
  }

  // 3. Coletar Caixas de Munição 3D (até 2.5m)
  for (const aObj of collectibleAmmoBoxes) {
    if (!aObj.isCollected) {
      const dist = playerPos.distanceTo(aObj.group.position);
      if (dist < 2.5) {
        aObj.isCollected = true;
        aObj.group.visible = false;
        weaponInventory[aObj.type].reserveAmmo += aObj.amount;
        playAmmoPickupSound();
        updateWeaponsUI();
        if (interactionPrompt) interactionPrompt.classList.remove('hidden');
        if (promptText) promptText.textContent = `Coletou Munição de ${aObj.type === 'revolver' ? 'Revólver' : 'Shotgun'} (+${aObj.amount}) 📦`;
        return;
      }
    }
  }

  // 4. Coletar Chaves 3D (até 2.5m)
  for (const keyObj of keyObjects) {
    if (!keyObj.isCollected) {
      const dist = playerPos.distanceTo(keyObj.group.position);
      if (dist < 2.5) {
        keyObj.isCollected = true;
        keyObj.group.visible = false;
        acquiredKeys.add(keyObj.def.id);
        playKeySound();
        updateInventoryUI();
        updateGoalHUD();
        return;
      }
    }
  }

  // 5. Checa Porta Mestre (até 3.2m)
  if (grandExitGate) {
    const distToExit = playerPos.distanceTo(new THREE.Vector3(grandExitGate.x, 1.0, grandExitGate.z));
    if (distToExit < 3.2) {
      toggleGrandExitGate(grandExitGate);
      return;
    }
  }

  // 6. Portas de Quartos (até 2.6m)
  for (const door of interactiveDoors) {
    const dist = playerPos.distanceTo(new THREE.Vector3(door.x, 1.0, door.z));
    if (dist < 2.6) {
      toggleDoor(door);
      return;
    }
  }

  // 7. Interruptores de Luz na Parede (Apenas quando próximo, até 2.8m)
  let closestEnvId = null;
  let minDist = 2.8;

  for (const envId in roomEnvironments) {
    const env = roomEnvironments[envId];
    if (env.switchGroup) {
      const dist = playerPos.distanceTo(env.switchGroup.position);
      if (dist < minDist) {
        minDist = dist;
        closestEnvId = envId;
      }
    }
  }

  if (closestEnvId) {
    toggleRoomEnvironmentLight(closestEnvId);
    return;
  }
}

// Elementos HUD
const statRoom = document.getElementById('stat-room');
const statLight = document.getElementById('stat-light');
const statXZ = document.getElementById('stat-xz');
const statYSpeed = document.getElementById('stat-y-speed');
const statCollision = document.getElementById('stat-collision');
const btnReset = document.getElementById('btn-reset');
const btnReplay = document.getElementById('btn-replay');
const btnCamera = document.getElementById('btn-camera');
const btnToggleLight = document.getElementById('btn-toggle-light');
const interactionPrompt = document.getElementById('interaction-prompt');
const promptText = document.getElementById('prompt-text');

function updateHUDLightStat() {
  if (!statLight) return;
  const currentEnvId = getRoomIdAtPosition(playerGroup.position.x, playerGroup.position.z);
  const env = roomEnvironments[currentEnvId];
  if (env) {
    if (currentEnvId === 'corridor' && env.isLit && corridorFlickerBugActive) {
      statLight.textContent = `${env.name}: Curto / Falha ⚡`;
      statLight.className = 'stat-value badge-light-flicker';
    } else {
      statLight.textContent = env.isLit ? `${env.name}: Acesa 💡` : `${env.name}: Apagada 🌙`;
      statLight.className = env.isLit ? 'stat-value badge-light-on' : 'stat-value badge-light-off';
    }
  }
}

if (btnToggleLight) {
  btnToggleLight.addEventListener('click', () => {
    const currentEnvId = getRoomIdAtPosition(playerGroup.position.x, playerGroup.position.z);
    toggleRoomEnvironmentLight(currentEnvId);
  });
}

if (interactionPrompt) {
  interactionPrompt.addEventListener('click', () => handleInteraction());
}

// Raycaster para Interruptores e Interações no clique do mouse (Disparo de arma agora exclusivo na tecla G / [RT])
const raycaster = new THREE.Raycaster();

window.addEventListener('pointerdown', (e) => {
  if (e.target && e.target.closest && e.target.closest('#hud-overlay button, .btn-action, #interaction-prompt, a, #victory-modal, #floating-hud-toggle, #permanent-weapon-hud, #game-over-modal, #start-menu-modal')) {
    return;
  }
  if (e.button === 0) {
    const clickMouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(clickMouse, camera);
    const hits = raycaster.intersectObjects(switchClickables, true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.envId && obj.parent) {
        obj = obj.parent;
      }
      if (obj && obj.userData.envId) {
        const env = roomEnvironments[obj.userData.envId];
        if (env && env.switchGroup) {
          const dist = playerGroup.position.distanceTo(env.switchGroup.position);
          if (dist <= 3.5) {
            toggleRoomEnvironmentLight(obj.userData.envId);
          } else {
            if (interactionPrompt) interactionPrompt.classList.remove('hidden');
            if (promptText) promptText.textContent = 'Aproxime-se do interruptor na parede 💡';
            setTimeout(() => {
              if (promptText && promptText.textContent.includes('Aproxime-se')) {
                interactionPrompt.classList.add('hidden');
              }
            }, 1500);
          }
        }
      }
    }
  }
});

let isPointerDown = false;
let pointerLastX = 0, pointerLastY = 0;
let cameraYaw = -Math.PI / 2, cameraPitch = 0.20, cameraDistance = 3.8;

function updateZoom(deltaZoom) {
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + deltaZoom, 2.5, 22.0);
  const statZoom = document.getElementById('stat-zoom');
  if (statZoom) statZoom.textContent = `${cameraDistance.toFixed(1)}m`;
}

window.addEventListener('wheel', (e) => {
  if (e.target && e.target.closest && e.target.closest('#hud-overlay, #victory-modal, #floating-hud-toggle, #permanent-weapon-hud, #start-menu-modal, #game-over-modal, #pause-modal')) return;
  e.preventDefault();
  updateZoom(e.deltaY > 0 ? 0.9 : -0.9);
}, { passive: false });

const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
if (btnZoomIn) btnZoomIn.addEventListener('click', () => updateZoom(-1.8));
if (btnZoomOut) btnZoomOut.addEventListener('click', () => updateZoom(1.8));

window.addEventListener('pointerdown', (e) => {
  if (e.target && e.target.closest && e.target.closest('#hud-overlay button, .btn-action, #interaction-prompt, a, #victory-modal, #floating-hud-toggle, #permanent-weapon-hud, #start-menu-modal, #game-over-modal, #pause-modal')) return;
  isPointerDown = true;
  pointerLastX = e.clientX; pointerLastY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  if (!isPointerDown) return;
  const dx = e.clientX - pointerLastX;
  const dy = e.clientY - pointerLastY;
  pointerLastX = e.clientX; pointerLastY = e.clientY;

  if (isThirdPerson) {
    cameraYaw -= dx * 0.005;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.004, -0.15, 1.15);
  }
});

window.addEventListener('pointerup', () => { isPointerDown = false; });

function resetGameState() {
  // 1. Interrompe todos os sons e áudios que estiverem tocando
  if (typeof audioListener !== 'undefined' && audioListener && audioListener.children) {
    audioListener.children.forEach(child => {
      if (child && child.isAudio && child.isPlaying) {
        try { child.stop(); } catch (err) { }
      }
    });
  }

  // 2. Limpa todas as partículas 3D de sangue e marcações do chefe/mira
  if (typeof aimImpactDotMesh !== 'undefined' && aimImpactDotMesh) {
    aimImpactDotMesh.visible = false;
  }
  if (typeof activeBossProjectiles !== 'undefined') {
    activeBossProjectiles.forEach(p => scene.remove(p.mesh));
    activeBossProjectiles.length = 0;
  }
  if (typeof activeBossShockwaves !== 'undefined') {
    activeBossShockwaves.forEach(s => scene.remove(s.mesh));
    activeBossShockwaves.length = 0;
  }

  if (typeof bloodParticlesPool !== 'undefined' && typeof bloodInstancedMesh !== 'undefined') {
    for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
      const p = bloodParticlesPool[i];
      p.active = false;
      p.life = 0;
      p.pos.set(0, -100, 0);
      p.vel.set(0, 0, 0);
      bloodDummyMatrix.makeTranslation(0, -100, 0);
      bloodInstancedMesh.setMatrixAt(i, bloodDummyMatrix);
    }
    bloodInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  // 3. Reseta Chaves e Coletáveis do Cenário
  acquiredKeys.clear();
  keyObjects.forEach(k => { k.isCollected = false; k.group.visible = true; });
  collectibleWeapons.forEach(w => { w.isCollected = false; w.group.visible = true; });
  collectibleAmmoBoxes.forEach(a => { a.isCollected = false; a.group.visible = true; });
  collectibleMedkits.forEach(m => { m.isCollected = false; m.group.visible = true; });

  // Remove a chave mestre se tiver sido criada por drop de sessão anterior
  const masterKeyIndex = keyObjects.findIndex(k => k.def.id === 'key_master');
  if (masterKeyIndex >= 0) {
    scene.remove(keyObjects[masterKeyIndex].group);
    keyObjects.splice(masterKeyIndex, 1);
  }

  // 4. Reseta Inimigos e Chefe (Vida, Posição, Animação e Agressividade)
  activeEnemies.forEach(e => {
    e.isDead = false;
    e.maxHp = Math.round(e.baseHp * gameDifficulty.hpMultiplier);
    e.hp = e.maxHp;
    e.speed = e.baseSpeed * gameDifficulty.speedMultiplier;
    e.damage = Math.round(e.baseDamage * gameDifficulty.damageMultiplier);
    e.dyingTimer = 0;
    e.hitFlashTimer = 0;
    e.attackCooldown = 0;
    e.isAggro = false;
    e.hasMoved = false;
    e.groanTimer = Math.random() * 4 + 2;
    e.group.position.set(e.initialX, e.initialY, e.initialZ);
    e.group.rotation.set(0, 0, 0);
    e.group.visible = true;
    if (e.skinMat) {
      e.skinMat.emissive.setHex(0x000000);
      e.skinMat.emissiveIntensity = 0.0;
    }
    if (e.materials) {
      e.materials.forEach(m => {
        if (m && m.emissive) {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0.0;
        }
      });
    }
    if (e.actions) {
      for (const k in e.actions) {
        if (e.actions[k]) e.actions[k].stop();
      }
      playEnemyAnim(e, 'idle', 0.1);
    }
  });

  // 5. Reseta Saúde, Inventário, Armas e Estados de Mira do Jogador
  playerHealth = 100;
  medkits = 0;
  isPlayerDead = false;
  invulnerableTimer = 0;
  isAiming = false;
  gamepadAiming = false;
  mouseAiming = false;
  keyAiming = false;

  weaponInventory.revolver.isAcquired = false; weaponInventory.revolver.loadedAmmo = 0; weaponInventory.revolver.reserveAmmo = 0;
  weaponInventory.shotgun.isAcquired = false; weaponInventory.shotgun.loadedAmmo = 0; weaponInventory.shotgun.reserveAmmo = 0;
  equipWeapon(null);

  // 6. Reseta Portas e Portão Mestre
  interactiveDoors.forEach(d => {
    d.isOpen = false; d.isUnlocked = !d.requiredKey; d.targetAngle = 0; d.currentAngle = 0;
    d.pivot.rotation.y = 0;
    if (d.colliderIndex >= 0 && wallColliders[d.colliderIndex]) wallColliders[d.colliderIndex].disabled = false;
  });
  if (grandExitGate) {
    grandExitGate.isOpen = false; grandExitGate.targetAngle = 0; grandExitGate.currentAngle = 0;
    grandExitGate.pivotLeft.rotation.y = 0;
    grandExitGate.pivotRight.rotation.y = 0;
    if (grandExitGate.colliderIndex >= 0 && wallColliders[grandExitGate.colliderIndex]) wallColliders[grandExitGate.colliderIndex].disabled = false;
  }

  // 7. Reseta Névoa dos Quartos Trancados
  for (const envId in roomFogObjects) {
    const fogObj = roomFogObjects[envId];
    fogObj.isCleared = false; fogObj.targetOpacity = 0.96;
    fogObj.fogMat.opacity = 0.96; fogObj.barrierMat.opacity = 0.95; fogObj.group.visible = true;
  }

  // 8. Desliga Luzes dos Quartos e Reseta Interruptores
  corridorFlickerBugActive = false;
  corridorFlickerTimer = 0;
  corridorNextFlickerTime = 5.0 + Math.random() * 6.0;

  for (const envId in roomEnvironments) {
    const env = roomEnvironments[envId];
    env.isLit = false;
    if (env.rocker) env.rocker.rotation.x = 0.22;
    if (env.ledMat) {
      env.ledMat.color.setHex(0xef4444);
      env.ledMat.emissive.setHex(0xef4444);
    }
    if (env.ledLight) {
      env.ledLight.color.setHex(0xef4444);
      env.ledLight.intensity = 1.2;
    }
    if (env.holoMat) {
      env.holoMat.color.setHex(0xf59e0b);
    }
    for (const lightObj of env.lights) {
      lightObj.intensity = 0.0;
    }
    if (env.lampMats) {
      for (const m of env.lampMats) {
        m.emissiveIntensity = 0.0;
      }
    }
  }
  if (combatFlashLight) combatFlashLight.intensity = 0.0;
  if (combatImpactLight) combatImpactLight.intensity = 0.0;

  // 9. Reseta Animação e Posição do Jogador
  if (jakeModelInstance) {
    jakeModelInstance.position.set(0, -1.0, 0);
    jakeModelInstance.rotation.set(0, 0, 0);
  }
  if (janeModelInstance) {
    janeModelInstance.position.set(0, -1.0, 0);
    janeModelInstance.rotation.set(0, 0, 0);
  }
  if (fallbackPlayerMesh) {
    fallbackPlayerMesh.position.set(0, -0.1, 0);
    fallbackPlayerMesh.rotation.set(0, 0, 0);
  }

  if (jakeMixer) {
    jakeMixer.stopAllAction();
    if (jakeActions['idle']) jakeActions['idle'].reset().play();
  }
  if (janeMixer) {
    janeMixer.stopAllAction();
    if (janeActions['idle']) janeActions['idle'].reset().play();
  }
  activePlayerAction = null;
  currentWeaponStance = 'unarmed';
  walkBobTimer = 0;
  idleAnimTimer = 0;

  if (isTestRoomMode) {
    playerGroup.position.set(200, 1.0, 200);
    velocity.set(0, 0, 0); velocityY = 0;
    isGrounded = true; playerRotation = 0;
    playerGroup.rotation.y = playerRotation;
    cameraYaw = 0; cameraPitch = 0.20; cameraDistance = 3.8;
    weaponInventory.revolver.isAcquired = true; weaponInventory.revolver.loadedAmmo = 6; weaponInventory.revolver.reserveAmmo = 99;
    weaponInventory.shotgun.isAcquired = true; weaponInventory.shotgun.loadedAmmo = 4; weaponInventory.shotgun.reserveAmmo = 99;
    equipWeapon('revolver');
    medkits = 5;
  } else {
    playerGroup.position.set(25, 1.0, 0);
    velocity.set(0, 0, 0); velocityY = 0;
    isGrounded = true; playerRotation = Math.PI / 2;
    playerGroup.rotation.y = playerRotation; cameraYaw = -Math.PI / 2; cameraPitch = 0.20; cameraDistance = 3.8;
  }

  updateActiveCharacterModel();

  // 10. Limpa Overlays de Dano / Cura e Modais
  const dmgOverlay = document.getElementById('screen-damage-overlay');
  if (dmgOverlay) dmgOverlay.classList.remove('active');
  const healOverlay = document.getElementById('screen-heal-overlay');
  if (healOverlay) healOverlay.classList.remove('active');
  if (interactionPrompt) interactionPrompt.classList.add('hidden');

  const victoryModal = document.getElementById('victory-modal');
  if (victoryModal) victoryModal.classList.add('hidden');

  const gameOverModal = document.getElementById('game-over-modal');
  if (gameOverModal) gameOverModal.classList.add('hidden');

  const pauseModal = document.getElementById('pause-modal');
  if (pauseModal) pauseModal.classList.add('hidden');
  isGamePaused = false;

  const bossContainer = document.getElementById('boss-health-container');
  if (bossContainer) bossContainer.classList.add('hidden');

  updateInventoryUI();
  updateWeaponsUI();
  updatePlayerHealthUI();
  updateGoalHUD();
  updateHUDLightStat();
}

if (btnReset) btnReset.addEventListener('click', () => {
  resetGameState();
  if (!isGameStarted) {
    stopGameplayBGM();
    playMenuBGM();
  } else {
    stopMenuBGM();
    startGameplayBGM();
  }
});
if (btnReplay) btnReplay.addEventListener('click', () => {
  resetGameState();
  startGame();
});

btnCamera.addEventListener('click', () => {
  isThirdPerson = !isThirdPerson;
  orbitControls.enabled = !isThirdPerson;
  if (!isThirdPerson) {
    orbitControls.target.copy(playerGroup.position);
    btnCamera.innerHTML = `Câmera Livre Ativa`;
  } else {
    btnCamera.innerHTML = `Alternar Ângulo`;
  }
});

function getRoomIdAtPosition(px, pz) {
  if (px > 100) return 'test_room';
  if (pz < -3.6) {
    if (px < -10.2) return 'q101';
    if (px < 2.0) return 'q102';
    return 'q103';
  } else if (pz > 3.6) {
    if (px < -14.0) return 'q104';
    if (px < 2.0) return 'q105';
    return 'q106';
  }
  return 'corridor';
}

// --- SISTEMA DE COLISÃO 3D ---
function checkAndResolveCollisions3D(newPos) {
  let collided = false;
  let collisionMsg = '';

  for (const wall of wallColliders) {
    if (wall.disabled) continue;
    if (
      newPos.x > wall.minX &&
      newPos.x < wall.maxX &&
      newPos.z > wall.minZ &&
      newPos.z < wall.maxZ
    ) {
      collided = true;
      collisionMsg = wall.name;

      const overlapLeft = newPos.x - wall.minX;
      const overlapRight = wall.maxX - newPos.x;
      const overlapTop = newPos.z - wall.minZ;
      const overlapBottom = wall.maxZ - newPos.z;

      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft) { newPos.x = wall.minX; velocity.x = 0; }
      else if (minOverlap === overlapRight) { newPos.x = wall.maxX; velocity.x = 0; }
      else if (minOverlap === overlapTop) { newPos.z = wall.minZ; velocity.z = 0; }
      else { newPos.z = wall.maxZ; velocity.z = 0; }
    }
  }

  const playerFeetY = newPos.y - 1.0;
  let maxGroundUnderPlayer = 1.0;

  for (const box of steppableBoxes) {
    const isOverBoxX = newPos.x > box.minX - PLAYER_RADIUS && newPos.x < box.maxX + PLAYER_RADIUS;
    const isOverBoxZ = newPos.z > box.minZ - PLAYER_RADIUS && newPos.z < box.maxZ + PLAYER_RADIUS;

    if (isOverBoxX && isOverBoxZ) {
      const boxTargetY = box.topY + 1.0;
      if (playerFeetY >= box.topY - 0.38 && velocityY <= 0) {
        if (boxTargetY > maxGroundUnderPlayer) {
          maxGroundUnderPlayer = boxTargetY;
        }
      } else if (playerFeetY < box.topY - 0.05) {
        collided = true;
        collisionMsg = box.name;

        const overlapLeft = newPos.x - (box.minX - PLAYER_RADIUS);
        const overlapRight = (box.maxX + PLAYER_RADIUS) - newPos.x;
        const overlapTop = newPos.z - (box.minZ - PLAYER_RADIUS);
        const overlapBottom = (box.maxZ + PLAYER_RADIUS) - newPos.z;

        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (minOverlap === overlapLeft) { newPos.x = box.minX - PLAYER_RADIUS; velocity.x = 0; }
        else if (minOverlap === overlapRight) { newPos.x = box.maxX + PLAYER_RADIUS; velocity.x = 0; }
        else if (minOverlap === overlapTop) { newPos.z = box.minZ - PLAYER_RADIUS; velocity.z = 0; }
        else { newPos.z = box.maxZ + PLAYER_RADIUS; velocity.z = 0; }
      }
    }
  }

  return { collided, collisionMsg, targetGroundY: maxGroundUnderPlayer };
}

// --- CÂMERA EM TERCEIRA PESSOA ---
const currentCameraPos = new THREE.Vector3();
const currentLookAt = new THREE.Vector3();

camera.position.set(28.8, 2.1, 0.0);
currentCameraPos.copy(camera.position);
currentLookAt.copy(playerGroup.position);
camera.lookAt(playerGroup.position);
playerRotation = Math.PI / 2;
playerGroup.rotation.y = playerRotation;

// --- LOOP DE ANIMAÇÃO ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  // --- SISTEMA DE NAVEGAÇÃO DE MENU COM GAMEPAD ---
  let gpUI = null;
  if (navigator.getGamepads) {
    const gamepads = navigator.getGamepads();
    gpUI = activeGamepadIndex !== null ? gamepads[activeGamepadIndex] : (gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3]);
  }

  if (gpUI && gpUI.connected) {
    // Se o jogo NÃO começou OU está pausado, os menus estão ativos
    if (!isGameStarted || isGamePaused) {
      handleGamepadMenuNavigation(gpUI);
    }
  }

  // Leitura do controle durante a pausa (para despausar com Start / A / B / Back)
  if (isGamePaused) {
    if (navigator.getGamepads) {
      const gamepads = navigator.getGamepads();
      const gp = activeGamepadIndex !== null ? gamepads[activeGamepadIndex] : (gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3]);
      if (gpUI && gpUI.connected) {
        // Start (9) sempre despausa e volta ao jogo, independentemente do menu em que estiver
        if (isButtonJustPressed(gpUI, 9)) {
          togglePauseGame(false);
        }
      }
    }
    renderer.render(scene, camera);
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();

  // --- SINCRONIZAÇÃO P2P MULTIPLAYER CO-OP ---
  if (isOnlineMultiplayer && p2pConn && p2pConn.open && isGameStarted && !isGamePaused) {
    p2pConn.send({
      type: 'PLAYER_SYNC',
      x: playerGroup.position.x,
      y: playerGroup.position.y,
      z: playerGroup.position.z,
      yaw: playerRotation,
      anim: activePlayerAction ? activePlayerAction._clip.name : 'idle',
      hp: playerHealth,
      weapon: equippedWeaponId,
      char: selectedCharacter
    });

    if (isP2pHost) {
      const enemyStates = activeEnemies.map(e => ({
        id: e.id,
        x: e.group.position.x,
        y: e.group.position.y,
        z: e.group.position.z,
        yaw: e.group.rotation.y,
        hp: e.hp,
        isDead: e.isDead
      }));
      const doorStates = interactiveDoors.map(d => ({
        roomNumber: d.roomNumber,
        isOpen: d.isOpen,
        targetAngle: d.targetAngle,
        isUnlocked: d.isUnlocked
      }));
      p2pConn.send({
        type: 'GAME_STATE_SYNC',
        enemies: enemyStates,
        doors: doorStates
      });
    }
  }

  // Interpola a posição e animação do parceiro 3D
  if (isOnlineMultiplayer && partnerGroup && partnerGroup.visible) {
    partnerGroup.position.lerp(partnerTargetPos, delta * 15.0);
    let yawDiff = partnerTargetYaw - partnerGroup.rotation.y;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    partnerGroup.rotation.y += yawDiff * Math.min(1.0, delta * 15.0);

    if (partnerMixer) {
      partnerMixer.update(delta);
    }
  }

  // Animação das névoas
  for (const envId in roomFogObjects) {
    const fogObj = roomFogObjects[envId];
    if (fogObj.group.visible) {
      fogObj.fogMat.opacity = THREE.MathUtils.lerp(fogObj.fogMat.opacity, fogObj.targetOpacity, delta * 3.5);
      fogObj.barrierMat.opacity = THREE.MathUtils.lerp(fogObj.barrierMat.opacity, fogObj.targetOpacity, delta * 3.5);
      if (fogObj.fogMat.opacity <= 0.02) fogObj.group.visible = false;
    }
  }

  // Animação das placas de névoa rasteira 3D
  for (const plane of groundMistPlanes) {
    plane.rotation.z += plane.userData.rotSpeed * delta;
    plane.position.y = plane.userData.baseY + Math.sin(time * plane.userData.floatSpeed + plane.userData.floatOffset) * 0.04;
  }

  // Animação das chaves 3D
  for (const keyObj of keyObjects) {
    if (!keyObj.isCollected) {
      keyObj.group.rotation.y = time * 2.5;
      keyObj.group.position.y = keyObj.initialY + Math.sin(time * 3.8) * 0.08;
    }
  }

  // Animação das armas coletáveis 3D
  for (const wObj of collectibleWeapons) {
    if (!wObj.isCollected) {
      wObj.group.rotation.y = time * 2.0;
      wObj.group.position.y = wObj.initialY + Math.sin(time * 3.2) * 0.06;
    }
  }

  // Animação das caixas de munição 3D
  for (const aObj of collectibleAmmoBoxes) {
    if (!aObj.isCollected) {
      aObj.group.rotation.y = time * 1.5;
      aObj.group.position.y = aObj.initialY + Math.sin(time * 2.8) * 0.04;
    }
  }

  // Animação dos medicamentos (Medkits) 3D
  for (const medObj of collectibleMedkits) {
    if (!medObj.isCollected) {
      medObj.group.rotation.y = time * 2.2;
      medObj.group.position.y = medObj.initialY + Math.sin(time * 3.5) * 0.05;
    }
  }

  // Atualização das partículas de sangue 3D e ataques do chefe
  updateBloodParticles(delta);
  updateBossAttacks(delta);

  // --- IA E ATUALIZAÇÃO DOS INIMIGOS E BOSS ---
  const currentRoomId = getRoomIdAtPosition(playerGroup.position.x, playerGroup.position.z);

  // Atualização do Mixer de Animação do Corpo Decorativo no Corredor
  if (corpseMixer) {
    corpseMixer.update(delta);
  }

  for (const enemy of activeEnemies) {
    // Atualização do Mixer de Animação FBX do Inimigo
    if (enemy.mixer) {
      enemy.mixer.update(delta);
    }

    // Decréscimo de cooldowns e flashes
    if (enemy.hitFlashTimer > 0) {
      enemy.hitFlashTimer -= delta;
      if (enemy.skinMat) {
        enemy.skinMat.emissive.setHex(0x660000);
        enemy.skinMat.emissiveIntensity = 0.8;
      }
      if (enemy.materials) {
        enemy.materials.forEach(m => {
          if (m && m.emissive) {
            m.emissive.setHex(0x660000);
            m.emissiveIntensity = 0.8;
          }
        });
      }
    } else {
      if (enemy.skinMat) {
        enemy.skinMat.emissive.setHex(0x000000);
        enemy.skinMat.emissiveIntensity = 0.0;
      }
      if (enemy.materials) {
        enemy.materials.forEach(m => {
          if (m && m.emissive) {
            m.emissive.setHex(0x000000);
            m.emissiveIntensity = 0.0;
          }
        });
      }
    }

    if (enemy.attackCooldown > 0) {
      enemy.attackCooldown -= delta;
    }

    // Comportamento se o inimigo morreu
    if (enemy.isDead) {
      if (enemy.dyingTimer > 0) {
        enemy.dyingTimer -= delta;
      }
      if (enemy.currentActionName !== 'death' && enemy.currentActionName !== 'dying') {
        playEnemyAnim(enemy, 'death', 0.15);
      }
      continue;
    }

    const distToPlayer = enemy.group.position.distanceTo(playerGroup.position);

    // Checa se o inimigo foi ativado (Aggro estrito apenas com porta aberta ou quando sofre dano)
    const doorNumber = enemy.targetRoom ? enemy.targetRoom.replace('q', '') : null;
    const roomDoor = doorNumber ? interactiveDoors.find(d => d.roomNumber === doorNumber) : null;
    const isDoorOpen = roomDoor ? roomDoor.isOpen : false;
    const enemyCurrentRoom = getRoomIdAtPosition(enemy.group.position.x, enemy.group.position.z);
    const isInSameRoom = (currentRoomId === enemy.targetRoom || (enemyCurrentRoom !== 'corridor' && currentRoomId === enemyCurrentRoom));

    if ((isInSameRoom && isDoorOpen) || (isDoorOpen && distToPlayer < 14.0) || enemy.hp < enemy.maxHp) {
      enemy.isAggro = true;
      enemy.hasMoved = true;
    }

    // Sons de gemido e rugido dos zumbis e do boss:
    // APENAS após se mexerem pela primeira vez (hasMoved) e quando estiverem próximos ao jogador (< 6.5m)
    if (enemy.hasMoved && !enemy.isDead && distToPlayer < 6.5) {
      enemy.groanTimer -= delta;
      if (enemy.groanTimer <= 0) {
        if (enemy.isBoss) {
          if (Math.random() < 0.35) playBossRoarSound();
          else playZombieGroanSound();
        } else {
          playZombieGroanSound();
        }
        enemy.groanTimer = Math.random() * 5.0 + 3.5;
      }
    }

    // Perseguição inteligente ao jogador (Entra e sai das salas pelas portas sem travar)
    if (enemy.isAggro && !isPlayerDead && (isInSameRoom || isDoorOpen)) {
      enemy.hasMoved = true;
      let targetMovePos = playerGroup.position.clone();

      // 1. Inimigo dentro de uma sala e o jogador está no corredor ou em outro quarto:
      if (enemyCurrentRoom !== 'corridor' && currentRoomId !== enemyCurrentRoom) {
        const enemyDoor = interactiveDoors.find(d => 'q' + d.roomNumber === enemyCurrentRoom);
        if (enemyDoor && enemyDoor.isOpen) {
          const isAlignedX = Math.abs(enemy.group.position.x - enemyDoor.x) < 0.65;
          if (!isAlignedX) {
            // Estágio 1A: Alinha o eixo X com o vão da porta
            targetMovePos = new THREE.Vector3(enemyDoor.x, enemy.group.position.y, enemy.group.position.z);
          } else {
            // Estágio 1B: Atravessa a porta diretamente para o centro do corredor central (z = 0.0)
            targetMovePos = new THREE.Vector3(enemyDoor.x, enemy.group.position.y, 0.0);
          }
        }
      }
      // 2. Inimigo no corredor e o jogador está dentro de um quarto com porta aberta:
      else if (enemyCurrentRoom === 'corridor' && currentRoomId !== 'corridor') {
        const targetDoor = interactiveDoors.find(d => 'q' + d.roomNumber === currentRoomId);
        if (targetDoor && targetDoor.isOpen) {
          const isAlignedX = Math.abs(enemy.group.position.x - targetDoor.x) < 0.65;
          if (!isAlignedX) {
            // Estágio 2A: Desloca-se pelo corredor central livre até ficar alinhado com a porta
            targetMovePos = new THREE.Vector3(targetDoor.x, enemy.group.position.y, 0.0);
          } else {
            // Estágio 2B: Entra diretamente pelo vão da porta para dentro do quarto
            const targetZ = targetDoor.isNorthSide ? -8.0 : 8.0;
            targetMovePos = new THREE.Vector3(targetDoor.x, enemy.group.position.y, targetZ);
          }
        }
      }

      const toTarget = targetMovePos.clone().sub(enemy.group.position);
      toTarget.y = 0;
      const distTarget = toTarget.length();

      const toPlayer = playerGroup.position.clone().sub(enemy.group.position);
      toPlayer.y = 0;
      const realDistToPlayer = toPlayer.length();

      // Se for o Chefe, gerencia cooldowns e executa ataques especiais (Orbe Corrosivo e Onda de Choque)
      if (enemy.isBoss) {
        if (typeof enemy.rangedCooldown === 'undefined') enemy.rangedCooldown = 3.5;
        if (typeof enemy.shockwaveCooldown === 'undefined') enemy.shockwaveCooldown = 7.0;

        if (enemy.rangedCooldown > 0) enemy.rangedCooldown -= delta;
        if (enemy.shockwaveCooldown > 0) enemy.shockwaveCooldown -= delta;

        // Ataque Especial 1: Onda de Choque (Requer PULO para esquivar)
        if (enemy.shockwaveCooldown <= 0 && enemy.attackCooldown <= 0 && realDistToPlayer >= 2.0 && realDistToPlayer <= 11.0) {
          enemy.shockwaveCooldown = Math.random() * 3.0 + 8.0;
          enemy.attackCooldown = 1.8;
          playEnemyAnim(enemy, 'attack', 0.1);
          spawnBossShockwave(enemy);
        }
        // Ataque Especial 2: Orbe Corrosivo (Ataque de Longe)
        else if (enemy.rangedCooldown <= 0 && enemy.attackCooldown <= 0 && realDistToPlayer >= 3.5 && realDistToPlayer <= 15.0) {
          enemy.rangedCooldown = Math.random() * 2.0 + 4.5;
          enemy.attackCooldown = 1.5;
          playEnemyAnim(enemy, 'attack', 0.1);
          spawnBossProjectile(enemy);
        }
      }

      if (distTarget > 0.05) {
        // Rotação em direção ao alvo de navegação ou ao jogador
        const lookDir = distTarget < 1.2 ? toPlayer : toTarget;
        const targetAngle = Math.atan2(lookDir.x, lookDir.z);
        let angleDiff = targetAngle - enemy.group.rotation.y;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        enemy.group.rotation.y += angleDiff * Math.min(1.0, 9.0 * delta);

        const stopDist = enemy.isBoss ? 1.9 : 1.25;
        if (realDistToPlayer > stopDist) {
          toTarget.normalize();

          // Calcula próxima posição
          const nextEnemyX = enemy.group.position.x + toTarget.x * enemy.speed * delta;
          const nextEnemyZ = enemy.group.position.z + toTarget.z * enemy.speed * delta;
          const enemyRadius = enemy.isBoss ? 0.45 : 0.18;

          let allowedX = nextEnemyX;
          let allowedZ = nextEnemyZ;

          // Colisão com as Paredes do Hotel (Com passagem fluida por portas abertas)
          for (const wall of wallColliders) {
            if (wall.disabled) continue;

            // Se o inimigo estiver próximo a qualquer porta aberta (< 3.4m), ignora batentes e paredes no vão
            let ignoreWallForDoor = false;
            for (const d of interactiveDoors) {
              if (d.isOpen) {
                const distToDoor = Math.hypot(enemy.group.position.x - d.x, enemy.group.position.z - d.z);
                if (distToDoor < 3.4) {
                  const wallMidX = (wall.minX + wall.maxX) / 2;
                  const wallMidZ = (wall.minZ + wall.maxZ) / 2;
                  if (Math.abs(wallMidX - d.x) < 3.2 && Math.abs(wallMidZ - d.z) < 3.2) {
                    ignoreWallForDoor = true;
                    break;
                  }
                }
              }
            }
            if (ignoreWallForDoor) continue;

            const trueMinX = wall.minX + PLAYER_RADIUS;
            const trueMaxX = wall.maxX - PLAYER_RADIUS;
            const trueMinZ = wall.minZ + PLAYER_RADIUS;
            const trueMaxZ = wall.maxZ - PLAYER_RADIUS;

            const collidesWithNext = (
              allowedX + enemyRadius > trueMinX &&
              allowedX - enemyRadius < trueMaxX &&
              allowedZ + enemyRadius > trueMinZ &&
              allowedZ - enemyRadius < trueMaxZ
            );

            if (collidesWithNext) {
              const collidesXOnly = (
                allowedX + enemyRadius > trueMinX &&
                allowedX - enemyRadius < trueMaxX &&
                enemy.group.position.z + enemyRadius > trueMinZ &&
                enemy.group.position.z - enemyRadius < trueMaxZ
              );
              const collidesZOnly = (
                enemy.group.position.x + enemyRadius > trueMinX &&
                enemy.group.position.x - enemyRadius < trueMaxX &&
                allowedZ + enemyRadius > trueMinZ &&
                allowedZ - enemyRadius < trueMaxZ
              );

              if (collidesXOnly && !collidesZOnly) {
                allowedX = enemy.group.position.x;
              } else if (collidesZOnly && !collidesXOnly) {
                allowedZ = enemy.group.position.z;
              } else {
                if (Math.abs(toTarget.x) > Math.abs(toTarget.z)) {
                  allowedZ = enemy.group.position.z;
                } else {
                  allowedX = enemy.group.position.x;
                }
              }
            }
          }

          // Colisão com Móveis e Obstáculos do Cenário (Mesas, Bancos, Caixas, Sofás)
          for (const box of steppableBoxes) {
            const collidesWithBox = (
              allowedX + enemyRadius > box.minX &&
              allowedX - enemyRadius < box.maxX &&
              allowedZ + enemyRadius > box.minZ &&
              allowedZ - enemyRadius < box.maxZ
            );

            if (collidesWithBox) {
              const collidesXOnly = (
                allowedX + enemyRadius > box.minX &&
                allowedX - enemyRadius < box.maxX &&
                enemy.group.position.z + enemyRadius > box.minZ &&
                enemy.group.position.z - enemyRadius < box.maxZ
              );
              const collidesZOnly = (
                enemy.group.position.x + enemyRadius > box.minX &&
                enemy.group.position.x - enemyRadius < box.maxX &&
                allowedZ + enemyRadius > box.minZ &&
                allowedZ - enemyRadius < box.maxZ
              );

              if (collidesXOnly && !collidesZOnly) {
                allowedX = enemy.group.position.x;
              } else if (collidesZOnly && !collidesXOnly) {
                allowedZ = enemy.group.position.z;
              } else {
                if (Math.abs(toTarget.x) > Math.abs(toTarget.z)) {
                  allowedZ = enemy.group.position.z;
                } else {
                  allowedX = enemy.group.position.x;
                }
              }
            }
          }

          enemy.group.position.x = allowedX;
          enemy.group.position.z = allowedZ;

          // Animação FBX de locomoção
          if (enemy.type === 'stalker') {
            playEnemyAnim(enemy, 'run', 0.2);
          } else {
            playEnemyAnim(enemy, 'walk', 0.2);
          }
        } else {
          // Inimigo no alcance de ataque do jogador
          if (enemy.attackCooldown <= 0) {
            damagePlayer(enemy.damage, enemy.name);
            enemy.attackCooldown = enemy.isBoss ? 1.8 : 1.2;
            playEnemyAnim(enemy, 'attack', 0.1);
          } else {
            // Se terminou o ataque, volta para idle
            if (enemy.currentActionName === 'attack' && enemy.activeAction && !enemy.activeAction.isRunning()) {
              playEnemyAnim(enemy, 'idle', 0.2);
            }
          }
        }
      }
    } else if (!enemy.isAggro && !enemy.isDead) {
      // Inimigo parado em guarda / idle
      playEnemyAnim(enemy, 'idle', 0.3);
    }
  }

  // Atualização da barra de vida do Chefe
  updateBossHealthUI();

  // Temporizador de invulnerabilidade do jogador (sem piscar o modelo)
  if (invulnerableTimer > 0) {
    invulnerableTimer -= delta;
  }
  if (playerBody) playerBody.visible = true;

  // Movimento
  const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

  const inputVector = new THREE.Vector3();

  // Bloqueia controles se o jogo ainda não começou, está pausado ou o jogador faleceu
  if (isGameStarted && !isGamePaused && !isPlayerDead) {
    if (keys.w) inputVector.add(forward);
    if (keys.s) inputVector.sub(forward);
    if (keys.a) inputVector.sub(right);
    if (keys.d) inputVector.add(right);

    // Joystick Touch Mobile
    if (Math.abs(touchMoveX) > 0.05 || Math.abs(touchMoveY) > 0.05) {
      inputVector.addScaledVector(forward, -touchMoveY);
      inputVector.addScaledVector(right, touchMoveX);
    }
  }

  // --- LEITURA DO CONTROLE XBOX / GAMEPAD ---
  if (navigator.getGamepads) {
    const gamepads = navigator.getGamepads();
    const gp = activeGamepadIndex !== null ? gamepads[activeGamepadIndex] : (gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3]);
    if (gp && gp.connected) {
      // Iniciar Jogo via Controle (Start) - O 'A' agora é lidado pelo menu navigator
      if (!isGameStarted) {
        if (isButtonJustPressed(gp, 9)) {
          startGame();
        }
      }

      if (isGameStarted && !isGamePaused) {
        // Analógico Esquerdo: Movimento
        const rawLX = gp.axes[0] || 0;
        const rawLY = gp.axes[1] || 0;
        const stickLX = applyAxisDeadzone(rawLX, 0.16);
        const stickLY = applyAxisDeadzone(rawLY, 0.16);

        if (Math.abs(stickLX) > 0 || Math.abs(stickLY) > 0) {
          inputVector.addScaledVector(forward, -stickLY);
          inputVector.addScaledVector(right, stickLX);
        }

        // Analógico Direito: Câmera / Rotação
        const rawRX = gp.axes[2] || 0;
        const rawRY = gp.axes[3] || 0;
        const stickRX = applyAxisDeadzone(rawRX, 0.16);
        const stickRY = applyAxisDeadzone(rawRY, 0.16);

        if (Math.abs(stickRX) > 0 || Math.abs(stickRY) > 0) {
          if (isThirdPerson) {
            cameraYaw -= stickRX * delta * 3.4;
            cameraPitch = THREE.MathUtils.clamp(cameraPitch + stickRY * delta * 2.6, -0.15, 1.15);
          }
        }

        // Botão A (0): Pulo
        if (gp.buttons[0] && (gp.buttons[0].pressed || gp.buttons[0].value > 0.5)) {
          if (isGrounded) {
            velocityY = JUMP_FORCE;
            isGrounded = false;
            playJumpSound();
            const keySpaceElem = document.getElementById('key-space');
            if (keySpaceElem) keySpaceElem.classList.add('active');
          }
        }

        // Gatilho Direito RT (7): Atirar
        if (isButtonJustPressed(gp, 7)) {
          fireActiveWeapon();
        }

        // Botão RB (5): Recarregar
        if (isButtonJustPressed(gp, 5)) {
          reloadActiveWeapon();
        }

        // Gatilho Esquerdo LT (6): Armar / Mirar (Aim)
        const ltValue = gp.buttons[6] ? (gp.buttons[6].value || (gp.buttons[6].pressed ? 1 : 0)) : 0;
        gamepadAiming = (ltValue > 0.25 || (gp.axes[4] && gp.axes[4] > 0.3));

        // Gatilho Direito RT (7): Atirar
        if (isButtonJustPressed(gp, 7)) {
          fireActiveWeapon();
        }

        // Botão RB (5): Recarregar
        if (isButtonJustPressed(gp, 5)) {
          reloadActiveWeapon();
        }

        // Botão X (2): Interagir / Coletar
        if (isButtonJustPressed(gp, 2)) {
          handleInteraction();
        }

        // Botão B (1) em Jogo: Aproximar Câmera (Zoom In)
        const bPressed = gp.buttons[1] && (gp.buttons[1].pressed || gp.buttons[1].value > 0.3);
        if (bPressed) {
          updateZoom(-delta * 4.5);
        }

        // Botão Y (3) em Jogo: Afastar Câmera (Zoom Out)
        const yPressed = gp.buttons[3] && (gp.buttons[3].pressed || gp.buttons[3].value > 0.3);
        if (yPressed) {
          updateZoom(delta * 4.5);
        }

        // D-Pad Cima (12): Curar com Medicamento 💊
        if (isButtonJustPressed(gp, 12)) {
          useMedkit();
        }

        // Select / View / Back (8): Alternar HUD
        if (isButtonJustPressed(gp, 8)) {
          toggleHUD();
        }

        // D-Pad Esquerdo (14): Revólver
        if (isButtonJustPressed(gp, 14)) {
          equipWeapon('revolver');
        }

        // D-Pad Direito (15): Shotgun
        if (isButtonJustPressed(gp, 15)) {
          equipWeapon('shotgun');
        }

        // D-Pad Baixo (13): Desarmar
        if (isButtonJustPressed(gp, 13)) {
          equipWeapon(null);
        }
      } // Fim do if (isGameStarted && !isGamePaused)

      // Start/Menu (9): Pausar / Despausar Jogo
      if (isButtonJustPressed(gp, 9)) {
        if (isGameStarted) {
          togglePauseGame();
        } else {
          startGame();
        }
      }
    }
  }

  if (isGameStarted && !isGamePaused) {
    if (keys.space && isGrounded) {
      velocityY = JUMP_FORCE;
      isGrounded = false;
      playJumpSound();
      const keySpaceElem = document.getElementById('key-space');
      if (keySpaceElem) keySpaceElem.classList.add('active');
    } else if (!keys.space) {
      const keySpaceElem = document.getElementById('key-space');
      if (keySpaceElem) keySpaceElem.classList.remove('active');
    }
  }

  // Atualiza estado de mira (Aiming)
  const prevAiming = isAiming;
  isAiming = isGameStarted && !isGamePaused && !isPlayerDead && (equippedWeaponId !== null) && (gamepadAiming || mouseAiming || keyAiming || touchAiming);

  const crosshairContainer = document.getElementById('crosshair-container');
  if (crosshairContainer) {
    if (isAiming) crosshairContainer.classList.add('is-aiming');
    else crosshairContainer.classList.remove('is-aiming');
  }

  // Destaque visual no botão de interagir touch se houver prompt ativo na tela
  if (btnTouchInteract) {
    const promptElem = document.getElementById('interaction-prompt');
    if (promptElem && !promptElem.classList.contains('hidden')) {
      btnTouchInteract.classList.add('pulse-door');
    } else {
      btnTouchInteract.classList.remove('pulse-door');
    }
  }

  if (prevAiming !== isAiming) {
    updateWeaponsUI();
  }

  const isMoving = inputVector.lengthSq() > 0;

  if (isPlayerDead) {
    inputVector.set(0, 0, 0);
    velocity.x = 0;
    velocity.z = 0;
  } else if (isAiming) {
    // Se estiver se movendo, gira para a direção da locomoção; se parado na mira, gira 360° para o centro da câmera/retículo
    const targetAngle = isMoving ? Math.atan2(inputVector.x, inputVector.z) : Math.atan2(forward.x, forward.z);
    let angleDiff = targetAngle - playerRotation;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    playerRotation += angleDiff * Math.min(1.0, 16.0 * delta);
    playerGroup.rotation.y = playerRotation;

    // Movimentação tática e animação fluida durante a postura armada
    if (isMoving) {
      inputVector.normalize();
      const aimSpeed = MOVE_SPEED * 0.75;
      velocity.x += inputVector.x * ACCELERATION * delta;
      velocity.z += inputVector.z * ACCELERATION * delta;
      const curSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      if (curSpeed > aimSpeed) {
        velocity.x = (velocity.x / curSpeed) * aimSpeed;
        velocity.z = (velocity.z / curSpeed) * aimSpeed;
      }

      if (isGrounded) {
        walkBobTimer += delta * 12;
        if (playerMixer) playPlayerAnim('walk', 0.15);
        if (playerBody) playerBody.position.y = -1.0;
      }
    } else {
      velocity.x -= velocity.x * FRICTION * delta;
      velocity.z -= velocity.z * FRICTION * delta;
      if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
      if (Math.abs(velocity.z) < 0.01) velocity.z = 0;

      if (isGrounded) {
        if (playerMixer) playPlayerAnim('aim', 0.15);
        if (playerBody) playerBody.position.y = -1.0;
      }
    }
  } else if (isMoving) {
    inputVector.normalize();
    velocity.x += inputVector.x * ACCELERATION * delta;
    velocity.z += inputVector.z * ACCELERATION * delta;

    let isRunning = keys.shift;
    if (isGamepadConnected && navigator.getGamepads) {
      const gp = navigator.getGamepads()[activeGamepadIndex];
      // Analógico esquerdo totalmente empurrado ou botão L3
      if (gp && ((gp.buttons[10] && gp.buttons[10].pressed) || inputVector.length() > 0.85)) {
        isRunning = true;
      }
    }

    const currentMaxSpeed = isRunning ? RUN_SPEED : MOVE_SPEED;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (speed > currentMaxSpeed) {
      velocity.x = (velocity.x / speed) * currentMaxSpeed;
      velocity.z = (velocity.z / speed) * currentMaxSpeed;
    }

    const targetAngle = Math.atan2(inputVector.x, inputVector.z);
    let angleDiff = targetAngle - playerRotation;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    playerRotation += angleDiff * Math.min(1.0, 14.0 * delta);
    playerGroup.rotation.y = playerRotation;

    if (isGrounded) {
      walkBobTimer += delta * (isRunning ? 20 : 14);
      if (playerMixer) playPlayerAnim(isRunning ? 'run' : 'walk');

      const useProcedural = !playerMixer;

      if (playerBody && useProcedural) {
        // Elevação de cada passo (bounce)
        playerBody.position.y = -1.0 + Math.abs(Math.sin(walkBobTimer)) * 0.12;
        // Ginga de ombros lateral (sway)
        playerBody.rotation.z = Math.sin(walkBobTimer * 0.5) * 0.08;
        // Inclinação corporal ao caminhar/correr (forward tilt)
        playerBody.rotation.x = Math.sin(walkBobTimer) * 0.04 + 0.06;
      } else if (playerBody) {
        // Personagem animado via FBX Mixer (posição Y cravada em -1.0)
        playerBody.position.y = -1.0;
      }
    }
  } else {
    idleAnimTimer += delta * 3;
    if (playerMixer) playPlayerAnim('idle');
    velocity.x -= velocity.x * FRICTION * delta;
    velocity.z -= velocity.z * FRICTION * delta;
    if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
    if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
    if (isGrounded) {
      const useProcedural = !playerMixer;

      if (playerBody && useProcedural) {
        // Respiração idle realista (subida e descida suave do peito)
        playerBody.position.y = -1.0 + Math.sin(idleAnimTimer) * 0.025;
        playerBody.rotation.z = Math.sin(idleAnimTimer * 0.5) * 0.02;
      } else if (playerBody) {
        playerBody.position.y = -1.0;
      }
    }
  }

  if (!isGrounded && playerBody) {
    const useProcedural = !playerMixer;
    if (useProcedural) {
      // Inclinação no ar durante o pulo
      playerBody.rotation.x = -0.12;
    }
  }

  // Atualiza o mixer FBX (se o modelo tiver rig/ossos)
  if (playerMixer) {
    playerMixer.update(delta);
  }

  velocityY += GRAVITY * delta;

  const newPos = playerGroup.position.clone();
  newPos.x += velocity.x * delta;
  newPos.z += velocity.z * delta;
  newPos.y += velocityY * delta;

  const collisionResult = checkAndResolveCollisions3D(newPos);

  if (newPos.y <= collisionResult.targetGroundY) {
    newPos.y = collisionResult.targetGroundY;
    velocityY = 0;
    isGrounded = true;
  } else {
    isGrounded = false;
  }

  playerGroup.position.copy(newPos);

  if (isThirdPerson && isGameStarted) {
    // Modo de Câmera Mobile
    if ((isMobileDevice || forceMobileMode) && isMobileCameraMode) {
      const targetDist = isAiming ? 1.9 : 2.5;
      cameraDistance = THREE.MathUtils.lerp(cameraDistance, targetDist, Math.min(1.0, 8.0 * delta));
      const targetPitch = isAiming ? 0.18 : 0.22;
      cameraPitch = THREE.MathUtils.lerp(cameraPitch, targetPitch, Math.min(1.0, 8.0 * delta));
    }

    const playerTarget = playerGroup.position.clone().add(new THREE.Vector3(0, 1.2, 0));

    const offsetX = cameraDistance * Math.sin(cameraYaw) * Math.cos(cameraPitch);
    const offsetY = cameraDistance * Math.sin(cameraPitch);
    const offsetZ = cameraDistance * Math.cos(cameraYaw) * Math.cos(cameraPitch);

    let targetCameraPos = new THREE.Vector3(
      playerGroup.position.x + offsetX,
      playerGroup.position.y + offsetY + 1.2,
      playerGroup.position.z + offsetZ
    );

    // 1. Raycast de Colisão da Câmera (Spring-Arm inteligente: previne a câmera de atravessar paredes)
    const camDir = targetCameraPos.clone().sub(playerTarget);
    const desiredCamDist = camDir.length();
    if (desiredCamDist > 0.05) {
      camDir.normalize();
      cameraRaycaster.set(playerTarget, camDir);
      cameraRaycaster.far = desiredCamDist;
      cameraRaycaster.near = 0.05;

      const camWallHits = cameraRaycaster.intersectObjects(allWallMeshes, false);
      if (camWallHits.length > 0) {
        const closestHit = camWallHits[0];
        const safeDist = Math.max(0.85, closestHit.distance - 0.28);
        targetCameraPos.copy(playerTarget).addScaledVector(camDir, safeDist);
      }
    }

    // 2. Limites perimétricos para garantir que a câmera não saia do hotel
    const curRoomId = getRoomIdAtPosition(playerGroup.position.x, playerGroup.position.z);
    if (curRoomId === 'corridor') {
      targetCameraPos.z = THREE.MathUtils.clamp(targetCameraPos.z, -2.8, 2.8);
      targetCameraPos.x = THREE.MathUtils.clamp(targetCameraPos.x, -28.5, 28.5);
    } else if (curRoomId !== 'test_room') {
      targetCameraPos.x = THREE.MathUtils.clamp(targetCameraPos.x, -29.2, 29.2);
      targetCameraPos.z = THREE.MathUtils.clamp(targetCameraPos.z, -23.2, 23.2);
      targetCameraPos.y = THREE.MathUtils.clamp(targetCameraPos.y, 0.45, WALL_HEIGHT - 0.3);
    }

    currentCameraPos.lerp(targetCameraPos, Math.min(1.0, 14.0 * delta));
    camera.position.copy(currentCameraPos);

    const lookTarget = playerGroup.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    currentLookAt.lerp(lookTarget, Math.min(1.0, 14.0 * delta));
    camera.lookAt(currentLookAt);

    // 3. Sistema de Oclusão e Escondimento Dinâmico de Paredes (Wall Transparency Fade)
    // Marca todas as paredes para voltarem a opacas (1.0)
    for (let i = 0; i < allWallMeshes.length; i++) {
      allWallMeshes[i].userData.targetOpacity = 1.0;
    }

    // Dispara raio da câmera até o jogador para detectar qualquer parede bloqueando a visão
    const toCamVec = camera.position.clone().sub(playerTarget);
    const actualDist = toCamVec.length();
    if (actualDist > 0.05) {
      toCamVec.normalize();
      cameraRaycaster.set(playerTarget, toCamVec);
      cameraRaycaster.far = actualDist + 0.35;
      cameraRaycaster.near = 0.05;

      const occludingHits = cameraRaycaster.intersectObjects(allWallMeshes, false);
      for (let i = 0; i < occludingHits.length; i++) {
        const hitObj = occludingHits[i].object;
        if (hitObj && hitObj.userData && hitObj.userData.isWall) {
          hitObj.userData.targetOpacity = 0.08;
          if (hitObj.userData.trim) hitObj.userData.trim.userData.targetOpacity = 0.08;
          if (hitObj.userData.parentWall) hitObj.userData.parentWall.userData.targetOpacity = 0.08;
        }
      }
    }

    // Também esconde qualquer parede muito próxima da câmera (< 0.75m) para evitar visão obstruída
    const camPoint = camera.position;
    for (let i = 0; i < allWallMeshes.length; i++) {
      const wall = allWallMeshes[i];
      if (wall.position.distanceToSquared(camPoint) < 36) {
        if (wall.geometry && wall.geometry.parameters) {
          const p = wall.geometry.parameters;
          const halfW = (p.width || 1) / 2 + 0.45;
          const halfH = (p.height || 1) / 2 + 0.45;
          const halfD = (p.depth || 1) / 2 + 0.45;
          const isNear = (
            camPoint.x >= wall.position.x - halfW && camPoint.x <= wall.position.x + halfW &&
            camPoint.y >= wall.position.y - halfH && camPoint.y <= wall.position.y + halfH &&
            camPoint.z >= wall.position.z - halfD && camPoint.z <= wall.position.z + halfD
          );
          if (isNear) {
            wall.userData.targetOpacity = Math.min(wall.userData.targetOpacity !== undefined ? wall.userData.targetOpacity : 1.0, 0.08);
            if (wall.userData.trim) wall.userData.trim.userData.targetOpacity = 0.08;
            if (wall.userData.parentWall) wall.userData.parentWall.userData.targetOpacity = 0.08;
          }
        }
      }
    }

    // Interpola a opacidade suavemente em tempo real sem causar recompilação de materiais
    for (let i = 0; i < allWallMeshes.length; i++) {
      const wall = allWallMeshes[i];
      if (wall.material) {
        if (!wall.material.transparent) wall.material.transparent = true;
        const targetOp = wall.userData.targetOpacity !== undefined ? wall.userData.targetOpacity : 1.0;
        if (Math.abs(wall.material.opacity - targetOp) > 0.002) {
          wall.material.opacity = THREE.MathUtils.lerp(wall.material.opacity, targetOp, delta * 14.0);
        }
      }
    }
  } else {
    orbitControls.target.copy(playerGroup.position);
    orbitControls.update();
  }

  // Animação de portas
  for (const door of interactiveDoors) {
    door.currentAngle = THREE.MathUtils.lerp(door.currentAngle, door.targetAngle, delta * 7.0);
    door.pivot.rotation.y = door.currentAngle;
  }

  if (grandExitGate) {
    grandExitGate.currentAngle = THREE.MathUtils.lerp(grandExitGate.currentAngle, grandExitGate.targetAngle, delta * 5.0);
    grandExitGate.pivotLeft.rotation.y = grandExitGate.currentAngle;
    grandExitGate.pivotRight.rotation.y = -grandExitGate.currentAngle;
  }

  // --- SISTEMA DE FALHA ELÉTRICA / TERROR NO CORREDOR ---
  const corridorEnv = roomEnvironments['corridor'];
  if (corridorEnv && isGameStarted && !isGamePaused) {
    if (corridorEnv.isLit) {
      corridorFlickerTimer += delta;

      if (!corridorFlickerBugActive) {
        if (corridorFlickerTimer >= corridorNextFlickerTime) {
          corridorFlickerBugActive = true;
          corridorFlickerTimer = 0;
          // Duração da falha apagada: entre 3.5s e 8.0s
          corridorBugDuration = 3.5 + Math.random() * 4.5;
        }
      } else {
        if (corridorFlickerTimer >= corridorBugDuration) {
          corridorFlickerBugActive = false;
          corridorFlickerTimer = 0;
          // Próximo tempo acesa antes da próxima falha: entre 5.0s e 12.0s
          corridorNextFlickerTime = 5.0 + Math.random() * 7.0;
        }
      }
    } else {
      corridorFlickerBugActive = false;
      corridorFlickerTimer = 0;
      corridorNextFlickerTime = 5.0 + Math.random() * 6.0;
    }
  }

  // Luzes dos ambientes
  for (const envId in roomEnvironments) {
    const env = roomEnvironments[envId];
    let targetMultiplier = env.isLit ? 1.0 : 0.0;

    // Efeito de oscilação / curto-circuito no corredor central
    if (envId === 'corridor' && env.isLit && corridorFlickerBugActive) {
      const timeInBug = corridorFlickerTimer;
      const timeRemaining = corridorBugDuration - corridorFlickerTimer;
      if (timeInBug < 0.6 || timeRemaining < 0.6) {
        targetMultiplier = Math.random() > 0.5 ? (Math.random() * 0.8) : 0.0;
      } else {
        targetMultiplier = 0.0;
      }
    }

    for (const lightObj of env.lights) {
      const maxI = lightObj.userData.maxIntensity || 1.0;
      lightObj.intensity = THREE.MathUtils.lerp(lightObj.intensity, maxI * targetMultiplier, delta * 12.0);
    }
    if (env.lampMats) {
      const targetEmissive = (env.isLit && targetMultiplier > 0.05) ? (2.5 * targetMultiplier) : 0.0;
      for (const m of env.lampMats) {
        m.emissiveIntensity = THREE.MathUtils.lerp(m.emissiveIntensity, targetEmissive, delta * 12.0);
      }
    }
  }

  // Prompts HUD
  const currentEnvId = getRoomIdAtPosition(playerGroup.position.x, playerGroup.position.z);
  if (statRoom) {
    if (currentEnvId === 'test_room') {
      statRoom.textContent = 'Sala de Testes 🧪';
    } else {
      const env = roomEnvironments[currentEnvId];
      statRoom.textContent = env ? `${env.name} 🏨` : 'Corredor Central 🏨';
    }
  }
  updateHUDLightStat();

  let nearInteractive = null;

  // 1. Checa Medicamentos Próximos
  for (const medObj of collectibleMedkits) {
    if (!medObj.isCollected) {
      const dist = playerGroup.position.distanceTo(medObj.group.position);
      if (dist < 2.5) { nearInteractive = { type: 'medkit', medObj }; break; }
    }
  }

  // 2. Checa Armas Próximas
  if (!nearInteractive) {
    for (const wObj of collectibleWeapons) {
      if (!wObj.isCollected) {
        const dist = playerGroup.position.distanceTo(wObj.group.position);
        if (dist < 2.5) { nearInteractive = { type: 'weapon', wObj }; break; }
      }
    }
  }

  // 3. Checa Munições Próximas
  if (!nearInteractive) {
    for (const aObj of collectibleAmmoBoxes) {
      if (!aObj.isCollected) {
        const dist = playerGroup.position.distanceTo(aObj.group.position);
        if (dist < 2.5) { nearInteractive = { type: 'ammo', aObj }; break; }
      }
    }
  }

  // 4. Checa Chaves 3D Próximas
  if (!nearInteractive) {
    for (const keyObj of keyObjects) {
      if (!keyObj.isCollected) {
        const dist = playerGroup.position.distanceTo(keyObj.group.position);
        if (dist < 2.5) { nearInteractive = { type: 'key', keyObj }; break; }
      }
    }
  }

  // 5. Checa Porta Mestre
  if (!nearInteractive && grandExitGate) {
    const dist = playerGroup.position.distanceTo(new THREE.Vector3(grandExitGate.x, 1.0, grandExitGate.z));
    if (dist < 3.2) { nearInteractive = { type: 'exitGate', gate: grandExitGate }; }
  }

  // 6. Checa Portas de Quartos
  if (!nearInteractive) {
    for (const door of interactiveDoors) {
      const dist = playerGroup.position.distanceTo(new THREE.Vector3(door.x, 1.0, door.z));
      if (dist < 2.6) { nearInteractive = { type: 'door', door }; break; }
    }
  }

  // 7. Checa Interruptores
  if (!nearInteractive) {
    for (const envId in roomEnvironments) {
      const env = roomEnvironments[envId];
      if (env.switchGroup) {
        const dist = playerGroup.position.distanceTo(env.switchGroup.position);
        if (dist < 3.0) { nearInteractive = { type: 'switch', env }; break; }
      }
    }
  }

  if (nearInteractive) {
    if (interactionPrompt) interactionPrompt.classList.remove('hidden');
    if (nearInteractive.type === 'medkit') {
      const m = nearInteractive.medObj;
      if (promptText) promptText.textContent = `Pegar Medicamento 💊 em ${m.roomName} (E)`;
    } else if (nearInteractive.type === 'weapon') {
      const w = nearInteractive.wObj;
      if (promptText) promptText.textContent = `Coletar ${w.name} em ${w.roomName} (E)`;
    } else if (nearInteractive.type === 'ammo') {
      const a = nearInteractive.aObj;
      if (promptText) promptText.textContent = `Pegar Munição de ${a.type === 'revolver' ? 'Revólver' : 'Shotgun'} (+${a.amount}) (E)`;
    } else if (nearInteractive.type === 'key') {
      const k = nearInteractive.keyObj.def;
      if (promptText) promptText.textContent = `Pegar ${k.name} em ${k.roomName} (E)`;
    } else if (nearInteractive.type === 'exitGate') {
      const g = nearInteractive.gate;
      if (!acquiredKeys.has('key_master')) {
        if (promptText) promptText.textContent = `🔒 PORTA MESTRE TRANCADA (Requer Chave Mestre)`;
      } else {
        if (promptText) promptText.textContent = g.isOpen ? `Fechar Porta Mestre (E)` : `Abrir PORTA MESTRE e Escapar! (E)`;
      }
    } else if (nearInteractive.type === 'door') {
      const d = nearInteractive.door;
      if (d.requiredKey && !acquiredKeys.has(d.requiredKey) && !d.isUnlocked) {
        const reqKey = KEY_DEFS.find(k => k.id === d.requiredKey);
        const kName = reqKey ? reqKey.name : `Chave Q.${d.roomNumber}`;
        if (promptText) promptText.textContent = `🔒 Porta ${d.roomNumber} Trancada (Requer ${kName})`;
      } else {
        if (promptText) promptText.textContent = d.isOpen ? `Fechar Porta ${d.roomNumber} (${d.name}) (E)` : `Abrir Porta ${d.roomNumber} (${d.name}) (E)`;
      }
    } else if (nearInteractive.type === 'switch') {
      const env = nearInteractive.env;
      if (promptText) promptText.textContent = env.isLit ? `Apagar Luz do ${env.name} (E)` : `Acender Luz do ${env.name} (E)`;
    }
  } else {
    if (interactionPrompt) interactionPrompt.classList.add('hidden');
  }

  // Telemetria
  const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
  if (statXZ) statXZ.textContent = `${playerGroup.position.x.toFixed(2)} / ${playerGroup.position.z.toFixed(2)}`;
  if (statYSpeed) statYSpeed.textContent = `${playerGroup.position.y.toFixed(2)}m • ${currentSpeed.toFixed(1)}m/s`;

  if (collisionResult.collided) {
    if (statCollision) {
      statCollision.textContent = `Contato: ${collisionResult.collisionMsg}`;
      statCollision.className = 'stat-value badge-warning';
    }
  } else {
    if (statCollision) {
      statCollision.textContent = isGrounded ? 'Espaço Livre (Chão)' : 'No Ar (Pulo)';
      statCollision.className = 'stat-value badge-safe';
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateInventoryUI();
updateWeaponsUI();
updatePlayerHealthUI();
updateGoalHUD();

// --- SISTEMA DE FOCO DO GAMEPAD ---
let gamepadUIRefreshTimer = 0;
let currentFocusedElement = null;

function handleGamepadMenuNavigation(gp) {
  const now = performance.now();
  if (now - gamepadUIRefreshTimer < 150) return; // Cooldown de navegação (evita pular rápido demais)

  // Encontrar todos os botões e sliders visíveis nas modais
  const focusableElements = Array.from(document.querySelectorAll('button:not([disabled]), input[type="range"]')).filter(el => {
    return el.offsetParent !== null; // Só pega os que estão visíveis na tela
  });

  if (focusableElements.length === 0) return;

  let currentIndex = focusableElements.indexOf(currentFocusedElement);
  if (currentIndex === -1) {
    currentIndex = 0;
    currentFocusedElement = focusableElements[0];
    currentFocusedElement.focus({ preventScroll: true });
  }

  let moved = false;

  // D-Pad Baixo / Analógico Baixo
  if (isButtonJustPressed(gp, 13) || gp.axes[1] > 0.5) {
    currentIndex = (currentIndex + 1) % focusableElements.length;
    moved = true;
  }
  // D-Pad Cima / Analógico Cima
  else if (isButtonJustPressed(gp, 12) || gp.axes[1] < -0.5) {
    currentIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
    moved = true;
  }
  // Se estiver focado em um range (slider de dificuldade), usar Esquerda/Direita para mexer
  else if (currentFocusedElement.tagName.toLowerCase() === 'input' && currentFocusedElement.type === 'range') {
    if (isButtonJustPressed(gp, 14) || gp.axes[0] < -0.5) { // Esquerda
      currentFocusedElement.value = Math.max(parseFloat(currentFocusedElement.min), parseFloat(currentFocusedElement.value) - parseFloat(currentFocusedElement.step));
      currentFocusedElement.dispatchEvent(new Event('input')); // Força a atualização visual
      moved = true;
    } else if (isButtonJustPressed(gp, 15) || gp.axes[0] > 0.5) { // Direita
      currentFocusedElement.value = Math.min(parseFloat(currentFocusedElement.max), parseFloat(currentFocusedElement.value) + parseFloat(currentFocusedElement.step));
      currentFocusedElement.dispatchEvent(new Event('input'));
      moved = true;
    }
  }
  // Navegação horizontal em botões normais (ex: Jane / Jake)
  else {
    if (isButtonJustPressed(gp, 14) || gp.axes[0] < -0.5) { // Esquerda
      currentIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
      moved = true;
    } else if (isButtonJustPressed(gp, 15) || gp.axes[0] > 0.5) { // Direita
      currentIndex = (currentIndex + 1) % focusableElements.length;
      moved = true;
    }
  }

  if (moved) {
    currentFocusedElement = focusableElements[currentIndex];
    currentFocusedElement.focus({ preventScroll: true });
    gamepadUIRefreshTimer = now;
  }

  // Botão A (Confirmar/Clicar)
  if (isButtonJustPressed(gp, 0)) {
    if (currentFocusedElement) {
      currentFocusedElement.click();
      gamepadUIRefreshTimer = now + 300; // Maior cooldown após clique
    }
  }

  // Botão B (Voltar)
  if (isButtonJustPressed(gp, 1)) {
    // Procura por um botão com a classe 'btn-menu-back' que esteja visível
    const backBtn = Array.from(document.querySelectorAll('.btn-menu-back')).find(el => el.offsetParent !== null);
    if (backBtn) {
      backBtn.click();
      gamepadUIRefreshTimer = now + 300;
    }
  }
}

// --- SISTEMA DE PWA (PROGRESSIVE WEB APP) & TELA CHEIA (FULLSCREEN) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('PWA Service Worker registrado com sucesso:', reg.scope);
    }).catch((err) => {
      console.warn('Falha ao registrar PWA Service Worker:', err);
    });
  });
}

let deferredPwaInstallPrompt = null;
const btnPwaInstall = document.getElementById('btn-pwa-install');
const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaInstallPrompt = e;
  if (btnPwaInstall) {
    btnPwaInstall.classList.remove('hidden');
  }
});

if (btnPwaInstall) {
  btnPwaInstall.addEventListener('click', async () => {
    if (deferredPwaInstallPrompt) {
      deferredPwaInstallPrompt.prompt();
      const { outcome } = await deferredPwaInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('Usuário aceitou a instalação do PWA');
      }
      deferredPwaInstallPrompt = null;
      btnPwaInstall.classList.add('hidden');
    }
  });
}

if (btnToggleFullscreen) {
  btnToggleFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) docEl.requestFullscreen();
      else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  });
}

// Acende a luz do corredor para o menu inicial e inicia o loop de animação
toggleRoomEnvironmentLight('corridor', true);
animate();

window.__HOTEL_3D__ = {
  scene, camera, playerGroup, velocity, roomEnvironments, toggleRoomEnvironmentLight, acquiredKeys, keyObjects, weaponInventory, equipWeapon, fireActiveWeapon, reloadActiveWeapon, useMedkit, damagePlayer, activeEnemies, collectibleMedkits, resetGameState, toggleHUD, clearRoomFog, gameDifficulty, applyDifficultySettings
};
