import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Pause, Play, RotateCcw } from 'lucide-react';
import heroWarehouseImg from '../../assets/images/hero_wholesale_warehouse_1794577851103.jpg';

type CameraPreset = 'overview' | 'hub' | 'routes';

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number]; label: string }
> = {
  overview: { pos: [7.4, 5.1, 7.6], target: [0, 0.8, 0], label: 'Overview' },
  hub: { pos: [4.2, 3.1, 4.6], target: [0, 1.35, 0], label: 'Exchange Hub' },
  routes: { pos: [0.2, 8.8, 7.2], target: [0, 0.4, 0], label: 'Trade Network' },
};

// Pre-allocated scratch math objects (zero GC in render loop)
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createRoundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -depth / 2;
  shape.moveTo(x, y + radius);
  shape.lineTo(x, y + depth - radius);
  shape.quadraticCurveTo(x, y + depth, x + radius, y + depth);
  shape.lineTo(x + width - radius, y + depth);
  shape.quadraticCurveTo(x + width, y + depth, x + width, y + depth - radius);
  shape.lineTo(x + width, y + radius);
  shape.quadraticCurveTo(x + width, y, x + width - radius, y);
  shape.lineTo(x + radius, y);
  shape.quadraticCurveTo(x, y, x, y + radius);
  return shape;
}

function createDeckGridTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle radial surface variation
  const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 250);
  grad.addColorStop(0, 'rgba(20, 184, 166, 0.14)');
  grad.addColorStop(0.6, 'rgba(30, 41, 59, 0.45)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Precision hairline trade grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 1;
  const step = 32;
  for (let i = 0; i <= 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Concentric alignment rings
  ctx.strokeStyle = 'rgba(45, 212, 191, 0.25)';
  ctx.lineWidth = 2;
  for (const r of [96, 172, 232]) {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso;
  return texture;
}

function createCrateStencilTexture(maxAniso: number, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 256, 256);

  // Ribbed carton shading lines
  ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
  for (let y = 0; y < 256; y += 16) {
    ctx.fillRect(0, y, 256, 6);
  }

  // Framing band
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 236, 236);

  // Accent strapping bar
  ctx.fillStyle = accentHex;
  ctx.fillRect(24, 34, 208, 18);

  // Shipping stencil barcode blocks
  ctx.fillStyle = '#1e293b';
  let bx = 28;
  const widths = [6, 3, 9, 4, 7, 3, 5, 8, 3, 6, 4, 9, 3, 5];
  for (const w of widths) {
    ctx.fillRect(bx, 180, w, 34);
    bx += w + 5;
  }
  ctx.fillRect(156, 188, 66, 8);
  ctx.fillRect(156, 204, 48, 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso;
  return texture;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.25)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface HeroWholesale3DProps {
  active?: boolean;
}

export function HeroWholesale3D({ active = true }: HeroWholesale3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [autoRotate, setAutoRotate] = useState(true);
  const [webglFailed, setWebglFailed] = useState(false);

  const presetRef = useRef<CameraPreset>('overview');
  const autoRotateRef = useRef(true);
  const orbitOffsetRef = useRef({ yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 });

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    if (!active) return;
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setWebglFailed(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: window.innerWidth >= 768,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const isSoftwareGl = isSoftwareRenderer(renderer.getContext());
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 300);
    const maxDpr = isSoftwareGl ? 1 : window.innerWidth < 768 ? 1.25 : 1.5;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'pan-y';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    scene.fog = new THREE.FogExp2('#0f172a', 0.038);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 80);
    camera.position.set(...CAMERA_PRESETS.overview.pos);
    _lookTarget.set(...CAMERA_PRESETS.overview.target);
    camera.lookAt(_lookTarget);

    // Procedural Studio Environment Map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmremGenerator.dispose();

    // 3-Point Warm / Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1db, 2.1);
    keyLight.position.set(7.5, 11, 6.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 512;
    keyLight.shadow.mapSize.height = 512;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 28;
    const d = 6.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x2dd4bf, 1.35);
    rimLight.position.set(-7, 5.5, -6.5);
    scene.add(rimLight);

    // Track disposable resources
    const disposables: {
      geometries: THREE.BufferGeometry[];
      materials: THREE.Material[];
      textures: THREE.Texture[];
    } = { geometries: [], materials: [], textures: [] };

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposables.geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      disposables.materials.push(m);
      return m;
    };
    const trackTex = <T extends THREE.Texture>(t: T): T => {
      disposables.textures.push(t);
      return t;
    };

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const deckTexture = trackTex(createDeckGridTexture(maxAniso));
    const tealStencilTex = trackTex(createCrateStencilTexture(maxAniso, '#0d9488'));
    const amberStencilTex = trackTex(createCrateStencilTexture(maxAniso, '#d97706'));
    const shadowTexture = trackTex(createContactShadowTexture());

    // Shared PBR Material Palette (varied roughness/metalness per skill guidance)
    const darkSteelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.72,
        roughness: 0.34,
      })
    );
    const brushedAluminumMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.85,
        roughness: 0.22,
      })
    );
    const tealAccentMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0f766e,
        metalness: 0.35,
        roughness: 0.42,
      })
    );
    const brassTrimMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.88,
        roughness: 0.2,
      })
    );
    const timberPalletMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x92400e,
        metalness: 0.05,
        roughness: 0.82,
      })
    );
    const glassCanopyMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x99f6e4,
        metalness: 0.1,
        roughness: 0.06,
        transparent: true,
        opacity: 0.36,
        ior: 1.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.8,
        depthWrite: false,
      })
    );
    const deckSurfaceMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: deckTexture,
        metalness: 0.28,
        roughness: 0.56,
      })
    );
    const tealCrateMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: tealStencilTex,
        metalness: 0.08,
        roughness: 0.65,
      })
    );
    const amberCrateMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: amberStencilTex,
        metalness: 0.08,
        roughness: 0.65,
      })
    );
    const freightGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2dd4bf,
        emissive: 0x14b8a6,
        emissiveIntensity: 1.25,
        metalness: 0.2,
        roughness: 0.25,
      })
    );
    const amberGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 1.05,
        metalness: 0.25,
        roughness: 0.28,
      })
    );
    const routeTubeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.65,
        roughness: 0.3,
        transparent: true,
        opacity: 0.82,
      })
    );

    const worldRoot = new THREE.Group();
    scene.add(worldRoot);

    // 1. Ground Base Deck & Precision Trade Floor
    const floorGeo = trackGeo(new THREE.CylinderGeometry(8.8, 9.2, 0.14, 48));
    const floorMesh = new THREE.Mesh(floorGeo, darkSteelMat);
    floorMesh.position.y = -0.07;
    floorMesh.receiveShadow = true;
    worldRoot.add(floorMesh);

    const deckTopGeo = trackGeo(new THREE.CylinderGeometry(5.6, 5.7, 0.06, 48));
    const deckTop = new THREE.Mesh(deckTopGeo, deckSurfaceMat);
    deckTop.position.y = 0.03;
    deckTop.receiveShadow = true;
    worldRoot.add(deckTop);

    // Contact shadow plane directly under central platform
    const contactShadowMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    const contactShadowGeo = trackGeo(new THREE.PlaneGeometry(5.5, 5.5));
    const centralShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    centralShadow.rotation.x = -Math.PI / 2;
    centralShadow.position.y = 0.065;
    worldRoot.add(centralShadow);

    // 2. Central Exchange Hub (Composite 9-Part Procedural Assembly)
    const hubGroup = new THREE.Group();
    hubGroup.position.set(0, 0.06, 0);
    worldRoot.add(hubGroup);

    // Part 1: Extruded beveled plinth base
    const plinthShape = createRoundedRectShape(2.4, 2.4, 0.35);
    const plinthGeo = trackGeo(
      new THREE.ExtrudeGeometry(plinthShape, {
        depth: 0.24,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments: 2,
      })
    );
    plinthGeo.rotateX(-Math.PI / 2);
    const hubPlinth = new THREE.Mesh(plinthGeo, darkSteelMat);
    hubPlinth.position.y = 0.05;
    hubPlinth.castShadow = true;
    hubPlinth.receiveShadow = true;
    hubGroup.add(hubPlinth);

    // Part 2: Teal recessed trim step
    const trimGeo = trackGeo(new THREE.BoxGeometry(1.9, 0.14, 1.9));
    const hubTrim = new THREE.Mesh(trimGeo, tealAccentMat);
    hubTrim.position.y = 0.36;
    hubTrim.castShadow = true;
    hubGroup.add(hubTrim);

    // Part 3: Brushed aluminum hub core tower
    const coreGeo = trackGeo(new THREE.CylinderGeometry(0.76, 0.88, 1.35, 8));
    const hubCore = new THREE.Mesh(coreGeo, brushedAluminumMat);
    hubCore.position.y = 1.1;
    hubCore.castShadow = true;
    hubCore.receiveShadow = true;
    hubGroup.add(hubCore);

    // Part 4: Vertical corner structural ribs (4 parts)
    const ribGeo = trackGeo(new THREE.BoxGeometry(0.14, 1.45, 0.14));
    const ribOffsets: [number, number][] = [
      [0.84, 0.84],
      [-0.84, 0.84],
      [0.84, -0.84],
      [-0.84, -0.84],
    ];
    for (const [rx, rz] of ribOffsets) {
      const rib = new THREE.Mesh(ribGeo, darkSteelMat);
      rib.position.set(rx, 1.12, rz);
      rib.castShadow = true;
      hubGroup.add(rib);
    }

    // Part 5: Brass precision collar ring
    const collarGeo = trackGeo(new THREE.TorusGeometry(0.92, 0.055, 16, 48));
    collarGeo.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, brassTrimMat);
    collarMesh.position.y = 1.82;
    collarMesh.castShadow = true;
    hubGroup.add(collarMesh);

    // Part 6: Optical glass canopy dome
    const domeGeo = trackGeo(new THREE.CylinderGeometry(0.68, 0.86, 0.48, 24));
    const domeMesh = new THREE.Mesh(domeGeo, glassCanopyMat);
    domeMesh.position.y = 2.08;
    domeMesh.renderOrder = 2;
    hubGroup.add(domeMesh);

    // Part 7: Inner glowing trade core crystal inside the glass dome
    const innerCrystalGeo = trackGeo(new THREE.OctahedronGeometry(0.32, 0));
    const innerCrystal = new THREE.Mesh(innerCrystalGeo, freightGlowMat);
    innerCrystal.position.y = 2.1;
    hubGroup.add(innerCrystal);

    // Part 8: Rotating orbital logistics telemetry ring
    const orbitRingGroup = new THREE.Group();
    orbitRingGroup.position.y = 1.55;
    hubGroup.add(orbitRingGroup);

    const orbitRingGeo = trackGeo(new THREE.TorusGeometry(1.48, 0.032, 12, 64));
    orbitRingGeo.rotateX(Math.PI / 2);
    const orbitRingMesh = new THREE.Mesh(orbitRingGeo, brushedAluminumMat);
    orbitRingGroup.add(orbitRingMesh);

    const nodeMarkerGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.1, 0.16));
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const marker = new THREE.Mesh(nodeMarkerGeo, i % 2 === 0 ? freightGlowMat : amberGlowMat);
      marker.position.set(Math.cos(angle) * 1.48, 0, Math.sin(angle) * 1.48);
      marker.rotation.y = -angle;
      orbitRingGroup.add(marker);
    }

    // 3. Satellite Wholesaler Fulfillment Pallets & Cargo Stations (4 Composite Groups)
    const stationPositions: [number, number, number][] = [
      [3.35, 0.06, -2.15],
      [-3.35, 0.06, -2.15],
      [3.35, 0.06, 2.15],
      [-3.35, 0.06, 2.15],
    ];

    const palletBaseGeo = trackGeo(new THREE.BoxGeometry(1.25, 0.09, 1.05));
    const palletSkidGeo = trackGeo(new THREE.BoxGeometry(1.25, 0.07, 0.12));
    const crateLargeGeo = trackGeo(new THREE.BoxGeometry(0.56, 0.56, 0.56));
    const crateSmallGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.36, 0.42));
    const gantryPostGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.96, 0.08));
    const gantryBeamGeo = trackGeo(new THREE.BoxGeometry(1.3, 0.08, 0.12));
    const padShadowGeo = trackGeo(new THREE.PlaneGeometry(1.85, 1.65));

    const floatingStacks: { group: THREE.Group; baseY: number; phase: number }[] = [];
    const routes: THREE.CatmullRomCurve3[] = [];

    stationPositions.forEach(([sx, sy, sz], idx) => {
      const station = new THREE.Group();
      station.position.set(sx, sy, sz);
      // Slight inward orientation toward central hub
      station.lookAt(0, sy, 0);
      worldRoot.add(station);

      // Station floor shadow
      const padShadow = new THREE.Mesh(padShadowGeo, contactShadowMat);
      padShadow.rotation.x = -Math.PI / 2;
      padShadow.position.y = 0.01;
      station.add(padShadow);

      // Timber/composite pallet runner skids (3 skids)
      for (const zOff of [-0.42, 0, 0.42]) {
        const skid = new THREE.Mesh(palletSkidGeo, timberPalletMat);
        skid.position.set(0, 0.035, zOff);
        skid.castShadow = true;
        station.add(skid);
      }

      // Pallet top deck
      const palletDeck = new THREE.Mesh(palletBaseGeo, timberPalletMat);
      palletDeck.position.y = 0.115;
      palletDeck.castShadow = true;
      palletDeck.receiveShadow = true;
      station.add(palletDeck);

      // Gantry frame (2 vertical posts + top beam)
      for (const xOff of [-0.56, 0.56]) {
        const post = new THREE.Mesh(gantryPostGeo, darkSteelMat);
        post.position.set(xOff, 0.62, -0.42);
        post.castShadow = true;
        station.add(post);
      }
      const beam = new THREE.Mesh(gantryBeamGeo, brushedAluminumMat);
      beam.position.set(0, 1.12, -0.42);
      beam.castShadow = true;
      station.add(beam);

      // Animated lifting cargo stack on the pallet
      const stackGroup = new THREE.Group();
      stackGroup.position.y = 0.16;
      station.add(stackGroup);

      const box1 = new THREE.Mesh(crateLargeGeo, idx % 2 === 0 ? tealCrateMat : amberCrateMat);
      box1.position.set(-0.22, 0.28, 0.04);
      box1.castShadow = true;
      box1.receiveShadow = true;
      stackGroup.add(box1);

      const box2 = new THREE.Mesh(crateSmallGeo, idx % 2 === 0 ? amberCrateMat : tealCrateMat);
      box2.position.set(0.32, 0.18, 0.12);
      box2.castShadow = true;
      box2.receiveShadow = true;
      stackGroup.add(box2);

      const box3 = new THREE.Mesh(crateSmallGeo, brushedAluminumMat);
      box3.position.set(-0.2, 0.74, 0.04);
      box3.rotation.y = 0.18;
      box3.castShadow = true;
      stackGroup.add(box3);

      floatingStacks.push({ group: stackGroup, baseY: 0.16, phase: idx * 1.4 });

      // Curved trade route spline connecting station to central hub
      const start = new THREE.Vector3(sx, 0.55, sz);
      const mid = new THREE.Vector3(sx * 0.52, 1.95 + (idx % 2) * 0.35, sz * 0.52);
      const end = new THREE.Vector3(sx * 0.22, 1.55, sz * 0.22);
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      routes.push(curve);

      const tubeGeo = trackGeo(new THREE.TubeGeometry(curve, 36, 0.032, 8, false));
      const tubeMesh = new THREE.Mesh(tubeGeo, routeTubeMat);
      worldRoot.add(tubeMesh);
    });

    // 4. Moving Freight Packets along each trade corridor
    const packetBodyGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.12, 0.26));
    const packetCapGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.04, 0.14));
    const packets: { mesh: THREE.Group; routeIdx: number; offset: number; speed: number }[] = [];

    routes.forEach((_, idx) => {
      for (let p = 0; p < 2; p++) {
        const packetGroup = new THREE.Group();
        const body = new THREE.Mesh(packetBodyGeo, darkSteelMat);
        const beacon = new THREE.Mesh(packetCapGeo, p === 0 ? freightGlowMat : amberGlowMat);
        beacon.position.y = 0.08;
        packetGroup.add(body);
        packetGroup.add(beacon);
        worldRoot.add(packetGroup);
        packets.push({
          mesh: packetGroup,
          routeIdx: idx,
          offset: p * 0.5 + idx * 0.17,
          speed: 0.22,
        });
      }
    });

    // 5. Instanced Ambient Trade Grid Nodes (InstancedMesh per skill rules)
    const nodeCount = 36;
    const ambientNodeGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.06, 0.06));
    const ambientNodeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5eead4,
        emissive: 0x0d9488,
        emissiveIntensity: 0.85,
        metalness: 0.2,
        roughness: 0.3,
      })
    );
    const instancedNodes = new THREE.InstancedMesh(ambientNodeGeo, ambientNodeMat, nodeCount);
    instancedNodes.frustumCulled = false;
    const nodeSeeds: { angle: number; radius: number; baseY: number; speed: number; scale: number }[] = [];
    for (let i = 0; i < nodeCount; i++) {
      const seed = {
        angle: (i / nodeCount) * Math.PI * 2,
        radius: 3.6 + (i % 5) * 0.65,
        baseY: 0.65 + (i % 4) * 0.55,
        speed: 0.08 + (i % 3) * 0.03,
        scale: 0.85 + (i % 4) * 0.15,
      };
      nodeSeeds.push(seed);
      _vecA.set(Math.cos(seed.angle) * seed.radius, seed.baseY, Math.sin(seed.angle) * seed.radius);
      _scale.setScalar(seed.scale);
      _matrix.compose(_vecA, _quat, _scale);
      instancedNodes.setMatrixAt(i, _matrix);
    }
    instancedNodes.instanceMatrix.needsUpdate = true;
    instancedNodes.computeBoundingSphere();
    worldRoot.add(instancedNodes);

    // Pointer drag + parallax interaction
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      const ny = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;

      if (isDragging) {
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
        orbitOffsetRef.current.targetYaw -= dx * 0.008;
        orbitOffsetRef.current.targetPitch = THREE.MathUtils.clamp(
          orbitOffsetRef.current.targetPitch + dy * 0.005,
          -0.28,
          0.42
        );
      } else {
        // Gentle subtle parallax bias when hovering
        orbitOffsetRef.current.targetPitch = THREE.MathUtils.clamp(-ny * 0.08, -0.2, 0.2);
        if (!autoRotateRef.current) {
          orbitOffsetRef.current.targetYaw = nx * 0.25;
        }
      }
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    let scrollProgress = Math.min(window.scrollY / 650, 1);
    let smoothScroll = scrollProgress;
    const handleScroll = () => {
      scrollProgress = Math.min(Math.max(window.scrollY / 650, 0), 1);
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('scroll', handleScroll, { passive: true });

    // WebGL Context Loss safety
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setWebglFailed(true);
    };
    const onContextRestored = () => {
      setWebglFailed(false);
    };
    domEl.addEventListener('webglcontextlost', onContextLost);
    domEl.addEventListener('webglcontextrestored', onContextRestored);

    // ResizeObserver for crisp fit
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 280);
      const h = Math.max(container.clientHeight, 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation loop with off-screen + visibility + software WebGL pacing
    let frameId = 0;
    let disposed = false;
    let isInViewport = true;
    let isTabVisible = typeof document === 'undefined' || !document.hidden;
    const clock = new THREE.Clock();
    let autoSpinAngle = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    const scheduleNext = () => {
      if (disposed || !isInViewport || !isTabVisible) return;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      if (disposed || !isInViewport || !isTabVisible) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      if (autoRotateRef.current && !isDragging) {
        autoSpinAngle += delta * 0.24;
      }

      // Smooth exponential damping for camera orbit, scroll parallax, and preset transitions
      smoothScroll = THREE.MathUtils.damp(smoothScroll, scrollProgress, 5, delta);
      worldRoot.rotation.x = smoothScroll * 0.08;

      orbitOffsetRef.current.yaw = THREE.MathUtils.damp(
        orbitOffsetRef.current.yaw,
        orbitOffsetRef.current.targetYaw,
        5,
        delta
      );
      orbitOffsetRef.current.pitch = THREE.MathUtils.damp(
        orbitOffsetRef.current.pitch,
        orbitOffsetRef.current.targetPitch,
        5,
        delta
      );

      const activePreset = CAMERA_PRESETS[presetRef.current];
      const basePos = _vecA.set(...activePreset.pos);
      const radiusXZ = Math.hypot(basePos.x, basePos.z);
      const baseAngle =
        Math.atan2(basePos.z, basePos.x) +
        autoSpinAngle +
        orbitOffsetRef.current.yaw +
        smoothScroll * 0.72;
      const desiredY = THREE.MathUtils.clamp(
        basePos.y + orbitOffsetRef.current.pitch * 3.2 + smoothScroll * 1.1,
        2.2,
        10.8
      );

      _targetPos.set(Math.cos(baseAngle) * radiusXZ, desiredY, Math.sin(baseAngle) * radiusXZ);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetPos.x, 4.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetPos.y, 4.5, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetPos.z, 4.5, delta);

      _lookTarget.x = THREE.MathUtils.damp(_lookTarget.x, activePreset.target[0], 5, delta);
      _lookTarget.y = THREE.MathUtils.damp(_lookTarget.y, activePreset.target[1], 5, delta);
      _lookTarget.z = THREE.MathUtils.damp(_lookTarget.z, activePreset.target[2], 5, delta);
      camera.lookAt(_lookTarget);

      // Animate central exchange ring & crystal
      orbitRingGroup.rotation.y = elapsed * 0.45;
      innerCrystal.rotation.y = -elapsed * 0.8;
      innerCrystal.position.y = 2.1 + Math.sin(elapsed * 1.8) * 0.06;

      // Subtle cargo lift oscillation on pallets
      for (const s of floatingStacks) {
        s.group.position.y = s.baseY + Math.max(0, Math.sin(elapsed * 1.1 + s.phase)) * 0.07;
      }

      // Move freight packets along curved trade corridors
      for (const pkt of packets) {
        const t = (elapsed * pkt.speed + pkt.offset) % 1;
        const curve = routes[pkt.routeIdx];
        curve.getPointAt(t, _vecA);
        curve.getTangentAt(t, _vecB);
        pkt.mesh.position.copy(_vecA);
        _vecB.add(_vecA);
        pkt.mesh.lookAt(_vecB);
      }

      // Update ambient instanced grid particles
      for (let i = 0; i < nodeCount; i++) {
        const seed = nodeSeeds[i];
        const a = seed.angle + elapsed * seed.speed;
        const y = seed.baseY + Math.sin(elapsed * 1.3 + i) * 0.18;
        _vecA.set(Math.cos(a) * seed.radius, y, Math.sin(a) * seed.radius);
        _quat.setFromAxisAngle(_up, elapsed * 0.6 + i);
        _scale.setScalar(seed.scale);
        _matrix.compose(_vecA, _quat, _scale);
        instancedNodes.setMatrixAt(i, _matrix);
      }
      instancedNodes.instanceMatrix.needsUpdate = true;

      renderer.render(scene, camera);
      scheduleNext();
    };

    const resumeIfVisible = () => {
      if (!disposed && isInViewport && isTabVisible) {
        clock.getDelta();
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        frameId = requestAnimationFrame(tick);
      }
    };

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? true;
        if (visible !== isInViewport) {
          isInViewport = visible;
          if (visible) {
            resumeIfVisible();
          } else {
            cancelAnimationFrame(frameId);
            clearTimeout(frameId);
          }
        }
      },
      { threshold: 0.05 }
    );
    visibilityObserver.observe(container);

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        resumeIfVisible();
      } else {
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (isSoftwareGl) {
      renderer.render(scene, camera);
      scheduleNext();
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();
      domEl.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('scroll', handleScroll);
      domEl.removeEventListener('webglcontextlost', onContextLost);
      domEl.removeEventListener('webglcontextrestored', onContextRestored);

      for (const g of disposables.geometries) g.dispose();
      for (const m of disposables.materials) m.dispose();
      for (const t of disposables.textures) t.dispose();
      envRT.dispose();
      renderer.dispose();
    };
  }, [active]);

  const handleResetView = () => {
    setPreset('overview');
    setAutoRotate(true);
    orbitOffsetRef.current.targetYaw = 0;
    orbitOffsetRef.current.targetPitch = 0;
  };

  if (webglFailed) {
    return (
      <div className="relative w-full h-full min-h-[340px] lg:min-h-[500px] overflow-hidden bg-slate-800">
        <img
          src={heroWarehouseImg}
          alt="OM wholesale distribution facility and logistics network"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-slate-900/75 via-slate-900/20 to-transparent" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[340px] lg:min-h-[500px] bg-slate-900 overflow-hidden select-none">
      {/* Isolated WebGL canvas mount point */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D wholesale trade and logistics network"
      />

      {/* Edge blend vignette for seamless split transition on desktop */}
      <div className="pointer-events-none hidden lg:block absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-slate-900 to-transparent" />

      {/* Compact bottom camera control bar (no backdrop-filter over WebGL, no side clutter) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/90 border border-slate-700/80 shadow-lg">
        {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPreset(key)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              preset === key
                ? 'bg-teal-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            {CAMERA_PRESETS[key].label}
          </button>
        ))}

        <div className="w-px h-4 bg-slate-700 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={() => setAutoRotate((v) => !v)}
          className="p-1.5 text-slate-300 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
          aria-label={autoRotate ? 'Pause 3D orbit' : 'Resume 3D orbit'}
          title={autoRotate ? 'Pause 3D orbit' : 'Resume 3D orbit'}
        >
          {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={handleResetView}
          className="p-1.5 text-slate-300 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
          aria-label="Reset 3D camera"
          title="Reset camera view"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
