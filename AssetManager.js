import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

class AssetManager {
  constructor() {
    this.models = {};
    this.animations = {};
    this.sounds = {};
    this.textures = {};
    
    // Gerenciador de Carregamento (LoadingManager)
    this.manager = new THREE.LoadingManager();
    this.manager.onStart = (url, itemsLoaded, itemsTotal) => {
      console.log(`Carregando: ${url} (${itemsLoaded}/${itemsTotal})`);
    };
    this.manager.onLoad = () => {
      console.log('Todos os assets foram carregados!');
      // Você pode emitir um evento aqui para iniciar o jogo de fato
    };
    this.manager.onError = (url) => {
      console.error(`Erro ao carregar: ${url}`);
    };

    // Loaders Específicos
    this.gltfLoader = new GLTFLoader(this.manager);
    this.fbxLoader = new FBXLoader(this.manager);
    this.textureLoader = new THREE.TextureLoader(this.manager);
    this.audioLoader = new THREE.AudioLoader(this.manager);
  }

  // --- MODELOS ---
  /**
   * Carrega um modelo 3D (ex: .glb, .gltf)
   * @param {string} key - Nome para identificar o modelo depois
   * @param {string} path - Caminho do arquivo (ex: 'assets/models/zumbi.glb')
   */
  loadModel(key, path) {
    this.gltfLoader.load(path, (gltf) => {
      this.models[key] = gltf.scene;
    }, undefined, (err) => {
      console.warn(`Aviso ao carregar modelo GLTF (${key}):`, err);
    });
  }

  getModel(key, clone = true) {
    if (!this.models[key]) return null;
    if (!clone) return this.models[key];
    // Retorna um clone para poder usar o mesmo modelo múltiplas vezes
    return this.models[key].clone();
  }

  // --- FBX & ANIMAÇÕES ---
  loadFBX(key, path) {
    this.fbxLoader.load(path, (fbx) => {
      this.models[key] = fbx;
    }, undefined, (err) => {
      console.warn(`Aviso ao carregar FBX (${key}):`, err);
    });
  }

  loadFBXAnimation(key, path) {
    this.fbxLoader.load(path, (fbx) => {
      if (fbx && fbx.animations && fbx.animations.length > 0) {
        fbx.animations[0].name = key;
        this.animations[key] = fbx.animations[0];
      }
    }, undefined, (err) => {
      console.warn(`Aviso ao carregar animação FBX (${key}):`, err);
    });
  }

  getAnimation(key) {
    return this.animations[key];
  }

  // --- TEXTURAS ---
  /**
   * Carrega uma textura de imagem (ex: .png, .jpg)
   * @param {string} key - Nome para identificar a textura
   * @param {string} path - Caminho do arquivo (ex: 'assets/textures/parede.jpg')
   */
  loadTexture(key, path) {
    this.textures[key] = this.textureLoader.load(path);
  }

  getTexture(key) {
    return this.textures[key];
  }

  // --- SONS ---
  /**
   * Carrega um efeito sonoro ou música (.mp3, .m4a, .ogg, .wav)
   * @param {string} key - Nome para identificar o som
   * @param {string} pathOrBaseName - Caminho ou nome base do som
   */
  loadSound(key, pathOrBaseName) {
    if (!this.standaloneAudioLoader) {
      this.standaloneAudioLoader = new THREE.AudioLoader();
    }

    if (pathOrBaseName.includes('.')) {
      this.standaloneAudioLoader.load(pathOrBaseName, (buffer) => {
        this.sounds[key] = buffer;
      }, undefined, () => {});
      return;
    }

    const extensions = ['.mp3', '.m4a', '.ogg', '.wav'];
    const basePath = pathOrBaseName.startsWith('assets/') ? pathOrBaseName : `assets/sounds/${pathOrBaseName}`;

    const tryNext = (idx) => {
      if (idx >= extensions.length) return;
      const fullPath = `${basePath}${extensions[idx]}`;
      this.standaloneAudioLoader.load(
        fullPath,
        (buffer) => {
          this.sounds[key] = buffer;
        },
        undefined,
        () => {
          tryNext(idx + 1);
        }
      );
    };

    tryNext(0);
  }

  getSoundBuffer(key) {
    return this.sounds[key];
  }
}

export const assetManager = new AssetManager();
