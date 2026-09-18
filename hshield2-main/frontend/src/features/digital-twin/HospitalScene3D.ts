import * as THREE from 'three';
import type { DeviceGridItem, DecoyAsset, DigitalTwinZone } from '../../types';

export interface SceneDeviceObject {
  id: string;
  name: string;
  type: string;
  zone: string;
  meshGroup: THREE.Group;
  statusBadgeMesh?: THREE.Mesh;
  statusLight?: THREE.PointLight;
  containmentCage?: THREE.Mesh;
  alertRingMesh?: THREE.Mesh;
  beaconMesh?: THREE.Mesh;
  screenMesh?: THREE.Mesh;
  data: DeviceGridItem | DecoyAsset;
}

export interface AttackTrajectory {
  id: string;
  sourcePos: THREE.Vector3;
  targetPos: THREE.Vector3;
  curve: THREE.QuadraticBezierCurve3;
  lineMesh: THREE.Line;
  particles: THREE.Points;
  intensity: number;
}

export interface SceneZoneObject {
  id: string;
  defaultColor: number;
  padMesh: THREE.Mesh;
  padMaterial: THREE.MeshStandardMaterial;
  borderMesh: THREE.LineSegments;
  borderMaterial: THREE.LineBasicMaterial;
  discMesh?: THREE.Mesh;
  discMaterial?: THREE.MeshBasicMaterial;
}

export type CameraPreset = 'OVERVIEW' | 'ZONE-ICU' | 'ZONE-NURSE' | 'ZONE-WARD' | 'ZONE-CORE';

export class HospitalScene3D {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animationFrameId: number | null = null;
  private clock: THREE.Clock;

  // Interactive controls state
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private spherical = { radius: 78, theta: Math.PI / 4, phi: Math.PI / 3.4 };
  private targetLookAt = new THREE.Vector3(0, 0, 0);
  private currentLookAt = new THREE.Vector3(0, 0, 0);
  private targetCameraPos = new THREE.Vector3(0, 52, 60);

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-1000, -1000);
  private hoveredDeviceId: string | null = null;

  // Scene entities
  private deviceObjects = new Map<string, SceneDeviceObject>();
  private attackTrajectories: AttackTrajectory[] = [];
  private animatedMeshes: { mesh: THREE.Mesh | THREE.Points; update: (t: number, dt: number) => void }[] = [];
  private zoneObjects = new Map<string, SceneZoneObject>();

  // Callbacks
  public onDeviceClick?: (deviceId: string) => void;
  public onDeviceHover?: (deviceId: string | null, mouseEvent?: { x: number; y: number }) => void;

  private resizeObserver: ResizeObserver | null = null;

  // View modes
  public viewLayer: 'NORMAL' | 'HEATMAP' | 'XRAY' = 'NORMAL';

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080c14);
    this.scene.fog = new THREE.FogExp2(0x080c14, 0.006);

    // 2. Camera & Viewport Calculation
    const width = Math.max(container.clientWidth || 0, container.parentElement?.clientWidth || 0, 800);
    const height = Math.max(container.clientHeight || 0, container.parentElement?.clientHeight || 0, 500);
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 1000);
    this.camera.position.set(0, 56, 68);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(this.renderer.domElement);

    // 4. Build Environment & Default Devices
    this.setupLighting();
    this.buildHospitalArchitecture();
    this.syncHospitalData([], []); // Populate hospital geometry immediately
    this.setupEventListeners();

    // 5. Start Loop
    this.animate = this.animate.bind(this);
    this.animate();

    console.log(`[HealthShield-X 3D Twin] Three.js scene mounted. Viewport: ${width}x${height}, Initial objects: ${this.deviceObjects.size}`);
  }

  // --- LIGHTING ---
  private setupLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0x334155, 2.2);
    this.scene.add(ambient);

    // Main key light
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(30, 65, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 160;
    dirLight.shadow.camera.left = -65;
    dirLight.shadow.camera.right = 65;
    dirLight.shadow.camera.top = 65;
    dirLight.shadow.camera.bottom = -65;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Subtle blue fill light
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    fillLight.position.set(-40, 35, -30);
    this.scene.add(fillLight);

    // Hemisphere light
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 1.2);
    this.scene.add(hemiLight);

    // Zone Accent Point Lights
    const icuSpot = new THREE.PointLight(0x38bdf8, 2.8, 45);
    icuSpot.position.set(-28, 14, -22);
    this.scene.add(icuSpot);

    const nurseSpot = new THREE.PointLight(0x34d399, 2.4, 45);
    nurseSpot.position.set(28, 14, -22);
    this.scene.add(nurseSpot);

    const wardSpot = new THREE.PointLight(0x818cf8, 2.6, 45);
    wardSpot.position.set(-28, 14, 22);
    this.scene.add(wardSpot);

    const coreSpot = new THREE.PointLight(0xf59e0b, 3.2, 50);
    coreSpot.position.set(28, 14, 22);
    this.scene.add(coreSpot);
  }

  // --- ARCHITECTURAL FLOORPLAN ---
  private buildHospitalArchitecture() {
    // 1. Master Base Floor (High-Tech Medical Floor Tiles)
    const floorGeo = new THREE.PlaneGeometry(120, 100);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.25,
      metalness: 0.35,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. High-Tech Grid Overlay
    const gridHelper = new THREE.GridHelper(120, 60, 0x0284c7, 0x1e293b);
    gridHelper.position.y = 0.01;
    (gridHelper.material as THREE.Material).opacity = 0.45;
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);

    // 3. Four Zone Floor Markings
    const zonesConfig = [
      { id: 'ZONE-ICU', color: 0x0284c7, x: -28, z: -22, w: 50, h: 42, label: 'ZONE-ICU // CRITICAL CARE' },
      { id: 'ZONE-NURSE', color: 0x059669, x: 28, z: -22, w: 50, h: 42, label: 'ZONE-NURSE // TRIAGE & OPS' },
      { id: 'ZONE-WARD', color: 0x6366f1, x: -28, z: 22, w: 50, h: 42, label: 'ZONE-WARD // INPATIENT CARE' },
      { id: 'ZONE-CORE', color: 0xd97706, x: 28, z: 22, w: 50, h: 42, label: 'ZONE-CORE // DATACENTER & HONEYPOT' },
    ];

    zonesConfig.forEach((z) => {
      // Zone Floor Pad
      const padGeo = new THREE.PlaneGeometry(z.w, z.h);
      const padMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.4,
        metalness: 0.2,
        transparent: true,
        opacity: 0.9,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(z.x, 0.02, z.z);
      pad.receiveShadow = true;
      this.scene.add(pad);

      // Neon Zone Perimeter Border
      const borderGeo = new THREE.EdgesGeometry(padGeo);
      const borderMat = new THREE.LineBasicMaterial({
        color: z.color,
        linewidth: 2,
        transparent: true,
        opacity: 0.7,
      });
      const border = new THREE.LineSegments(borderGeo, borderMat);
      border.rotation.x = -Math.PI / 2;
      border.position.set(z.x, 0.05, z.z);
      this.scene.add(border);

      this.zoneObjects.set(z.id, {
        id: z.id,
        defaultColor: z.color,
        padMesh: pad,
        padMaterial: padMat,
        borderMesh: border,
        borderMaterial: borderMat,
      });

      // Floor Runner Corner Accents
      const cornerGeo = new THREE.BoxGeometry(2, 0.1, 2);
      const cornerMat = new THREE.MeshBasicMaterial({ color: z.color });
      [
        [-z.w / 2, -z.h / 2],
        [z.w / 2, -z.h / 2],
        [-z.w / 2, z.h / 2],
        [z.w / 2, z.h / 2],
      ].forEach(([cx, cz]) => {
        const cMesh = new THREE.Mesh(cornerGeo, cornerMat);
        cMesh.position.set(z.x + cx, 0.08, z.z + cz);
        this.scene.add(cMesh);
      });
    });

    // 4. Central Corridors & Tinted Glass Partitions
    this.buildGlassPartitions();

    // 5. Zone Signage Holograms
    this.buildZoneSignage(zonesConfig);
  }

  private buildGlassPartitions() {
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.85,
      ior: 1.45,
      thickness: 0.5,
    });

    const wallFrameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.2,
    });

    // Partition walls coordinates: Central Corridor dividers
    const wallSections = [
      // Central vertical divider (X = 0, along Z)
      { pos: [0, 2.5, -22], size: [0.6, 5, 38] },
      { pos: [0, 2.5, 22], size: [0.6, 5, 38] },
      // Central horizontal divider (Z = 0, along X)
      { pos: [-28, 2.5, 0], size: [46, 5, 0.6] },
      { pos: [28, 2.5, 0], size: [46, 5, 0.6] },
    ];

    wallSections.forEach((w) => {
      // Glass pane
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]), glassMat);
      glass.position.set(w.pos[0], w.pos[1], w.pos[2]);
      glass.castShadow = false;
      this.scene.add(glass);

      // Top and bottom metal frames
      const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(w.size[0] + 0.2, 0.3, w.size[2] + 0.2),
        wallFrameMat
      );
      topFrame.position.set(w.pos[0], w.pos[1] + w.size[1] / 2, w.pos[2]);
      this.scene.add(topFrame);

      const bottomFrame = new THREE.Mesh(
        new THREE.BoxGeometry(w.size[0] + 0.2, 0.3, w.size[2] + 0.2),
        wallFrameMat
      );
      bottomFrame.position.set(w.pos[0], 0.15, w.pos[2]);
      this.scene.add(bottomFrame);
    });
  }

  private buildZoneSignage(zones: any[]) {
    zones.forEach((z) => {
      // 3D holographic beacon pillar with glowing signage disc
      const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 6, 12);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(z.x - z.w / 2 + 3, 3, z.z - z.h / 2 + 3);
      this.scene.add(post);

      // Glowing Sign Disc
      const discGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.2, 24);
      const discMat = new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.85 });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.set(z.x - z.w / 2 + 3, 6, z.z - z.h / 2 + 3);
      this.scene.add(disc);

      const zoneObj = this.zoneObjects.get(z.id);
      if (zoneObj) {
        zoneObj.discMesh = disc;
        zoneObj.discMaterial = discMat;
      }

      // Sign Disc Pulsing animation
      this.animatedMeshes.push({
        mesh: disc,
        update: (t) => {
          disc.rotation.y = t * 0.8;
          discMat.opacity = 0.65 + Math.sin(t * 3) * 0.25;
        },
      });
    });
  }

  // --- PROCEDURAL 3D MEDICAL MODELS CREATION ---

  // 1. ICU Patient Bed with articulated mattress & vital signs monitor
  private createICUBedGroup(id: string, name: string, devData: any): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    // Bed frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 8.4), frameMat);
    frame.position.y = 1.2;
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    // Mattress (sterile medical blue)
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.7 });
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.6, 7.8), mattressMat);
    mattress.position.y = 1.6;
    mattress.castShadow = true;
    group.add(mattress);

    // Bed headboard & footboard
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5 });
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.3), boardMat);
    headboard.position.set(0, 2.1, -4.1);
    headboard.castShadow = true;
    group.add(headboard);

    const footboard = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 0.3), boardMat);
    footboard.position.set(0, 1.7, 4.1);
    footboard.castShadow = true;
    group.add(footboard);

    // Side Rails
    const railGeo = new THREE.BoxGeometry(0.1, 0.8, 4.5);
    const railLeft = new THREE.Mesh(railGeo, frameMat);
    railLeft.position.set(-2.05, 2.0, -0.5);
    group.add(railLeft);
    const railRight = new THREE.Mesh(railGeo, frameMat);
    railRight.position.set(2.05, 2.0, -0.5);
    group.add(railRight);

    // Bed Pillow & Sheet accent
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.3, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
    );
    pillow.position.set(0, 1.95, -2.8);
    group.add(pillow);

    // Articulated Swivel Arm & Vital Signs Monitor Screen
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8);
    const arm = new THREE.Mesh(armGeo, frameMat);
    arm.position.set(-2.6, 3.0, -3.2);
    arm.rotation.z = -0.3;
    group.add(arm);

    // Vital Signs Monitor Box
    const monitorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
    const monitorBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.4), monitorMat);
    monitorBox.position.set(-3.2, 4.2, -3.2);
    monitorBox.rotation.y = 0.5;
    monitorBox.castShadow = true;
    group.add(monitorBox);

    // Glowing CRT/LCD Vitals Screen
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), screenMat);
    screen.position.set(-3.2, 4.2, -2.99);
    screen.rotation.y = 0.5;
    group.add(screen);

    // Dynamic Aura Ring & Point Light
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.4, 32), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(0x38bdf8, 1.2, 10);
    ptLight.position.set(-3.2, 4.5, -2.8);
    group.add(ptLight);

    // Floating Interactive Hit Target Box
    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(6, 6, 9),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 3.0;
    hitBox.userData = { deviceId: id, name, type: devData.device_type, isDevice: true };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: devData.device_type,
      zone: 'ZONE-ICU',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      screenMesh: screen,
      data: devData,
    });

    return group;
  }

  // 2. Mechanical Ventilator Unit (VU-04)
  private createVentilatorGroup(id: string, name: string, devData: any): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.4 });

    // Wheeled Trolley Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 2.0), bodyMat);
    base.position.y = 0.3;
    group.add(base);

    // Central Pillar
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.2, 0.8), bodyMat);
    column.position.y = 1.9;
    group.add(column);

    // Main Ventilator Head Unit
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.4), accentMat);
    head.position.y = 4.0;
    head.castShadow = true;
    group.add(head);

    // Glowing Respiration Waveform Display
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), screenMat);
    screen.position.set(0, 4.0, 0.71);
    group.add(screen);

    // Humidifier Cylinder on Side
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16),
      new THREE.MeshPhysicalMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.8, roughness: 0.1 })
    );
    cylinder.position.set(-1.1, 3.6, 0);
    group.add(cylinder);

    // Corrugated Respiration Breathing Tubes (Torus / Curve)
    const tubeGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 24, Math.PI * 0.9);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.position.set(0.6, 3.4, 0.8);
    tube.rotation.z = -Math.PI / 3;
    group.add(tube);

    // Status Aura
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.3, 24), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(0x38bdf8, 1.4, 10);
    ptLight.position.set(0, 4.4, 1.0);
    group.add(ptLight);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 6, 3.5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 3.0;
    hitBox.userData = { deviceId: id, name, type: devData.device_type, isDevice: true };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: devData.device_type,
      zone: 'ZONE-ICU',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      screenMesh: screen,
      data: devData,
    });

    return group;
  }

  // 3. IV Infusion Pump Stand (IP-08 / DEC-PUMP-04)
  private createInfusionPumpGroup(id: string, name: string, devData: any, isDecoy = false): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.1 });
    const pumpBodyMat = new THREE.MeshStandardMaterial({ color: isDecoy ? 0x78350f : 0x0f172a, roughness: 0.3 });

    // Wheeled 5-star base
    const baseGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 5);
    const base = new THREE.Mesh(baseGeo, poleMat);
    base.position.y = 0.15;
    group.add(base);

    // Chrome Tall IV Pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.2, 12), poleMat);
    pole.position.y = 3.2;
    group.add(pole);

    // Dual Digital Infusion Pump Modules
    const pump1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.7), pumpBodyMat);
    pump1.position.set(0, 3.6, 0.3);
    group.add(pump1);

    const pump2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.7), pumpBodyMat);
    pump2.position.set(0, 2.6, 0.3);
    group.add(pump2);

    // Screen
    const screenMat = new THREE.MeshBasicMaterial({ color: isDecoy ? 0xf59e0b : 0x38bdf8 });
    const screen1 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), screenMat);
    screen1.position.set(0, 3.6, 0.66);
    group.add(screen1);

    // Hanging IV Fluid Bag at top
    const bagMat = new THREE.MeshPhysicalMaterial({
      color: isDecoy ? 0xfef08a : 0xe0f2fe,
      transparent: true,
      opacity: 0.75,
      roughness: 0.1,
    });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.25), bagMat);
    bag.position.set(0.3, 5.7, 0.2);
    group.add(bag);

    // Aura
    const auraColor = isDecoy ? 0xf59e0b : 0x38bdf8;
    const auraMat = new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 24), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(auraColor, 1.2, 8);
    ptLight.position.set(0, 4.0, 0.6);
    group.add(ptLight);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 6.5, 2.5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 3.2;
    hitBox.userData = { deviceId: id, name, type: devData.device_type, isDevice: true, isDecoy };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: devData.device_type,
      zone: 'ZONE-ICU',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      screenMesh: screen1,
      data: devData,
    });

    return group;
  }

  // 4. Admin Workstation / Staff PC (AW-07 / DEC-ADMIN-07)
  private createWorkstationGroup(id: string, name: string, devData: any, isDecoy = false): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    const deskMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 });

    // Modern Computer Desk
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.2, 2.6), deskMat);
    deskTop.position.y = 2.0;
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    group.add(deskTop);

    // Desk legs
    const legGeo = new THREE.BoxGeometry(0.2, 2.0, 2.4);
    const legL = new THREE.Mesh(legGeo, metalMat);
    legL.position.set(-2.3, 1.0, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, metalMat);
    legR.position.set(2.3, 1.0, 0);
    group.add(legR);

    // Dual Widescreen Monitors
    const monMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.2 });
    const screenMat = new THREE.MeshBasicMaterial({ color: isDecoy ? 0xf59e0b : 0x34d399 });

    [-1.2, 1.2].forEach((mx, idx) => {
      const mon = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 0.15), monMat);
      mon.position.set(mx, 3.0, -0.6);
      mon.rotation.y = idx === 0 ? 0.15 : -0.15;
      mon.castShadow = true;
      group.add(mon);

      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.15), screenMat);
      scr.position.set(mx, 3.0, -0.51);
      scr.rotation.y = idx === 0 ? 0.15 : -0.15;
      group.add(scr);
    });

    // Keyboard & Mouse Pad
    const kb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.6), monMat);
    kb.position.set(0, 2.12, 0.3);
    group.add(kb);

    // Clinician Task Chair
    const chairSeat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    chairSeat.position.set(0, 1.4, 1.4);
    group.add(chairSeat);

    const chairBack = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    chairBack.position.set(0, 2.4, 2.2);
    group.add(chairBack);

    // Aura
    const auraColor = isDecoy ? 0xf59e0b : 0x34d399;
    const auraMat = new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.4, 24), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(auraColor, 1.4, 10);
    ptLight.position.set(0, 3.2, 0);
    group.add(ptLight);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 5, 4.5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 2.5;
    hitBox.userData = { deviceId: id, name, type: devData.device_type, isDevice: true, isDecoy };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: devData.device_type,
      zone: 'ZONE-NURSE',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      data: devData,
    });

    return group;
  }

  // 5. Smart Medication Dispenser (MD-02)
  private createMedicationDispenserGroup(id: string, name: string, devData: any): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.3 });
    const drawerMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.4 });

    // Main Dispenser Cabinet
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6.2, 2.0), bodyMat);
    cabinet.position.y = 3.1;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    group.add(cabinet);

    // Multi-tier Medication Drawers with Illuminated Slot Indicators
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        const dMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.1), drawerMat);
        dMesh.position.set(-1.0 + col * 1.0, 1.2 + row * 0.9, 1.05);
        group.add(dMesh);

        // Green LED slot light
        const led = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x34d399 })
        );
        led.position.set(-1.0 + col * 1.0 + 0.3, 1.2 + row * 0.9 + 0.2, 1.12);
        group.add(led);
      }
    }

    // Touchscreen Dispense Terminal
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), screenMat);
    screen.position.set(0, 5.0, 1.02);
    group.add(screen);

    // Aura
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x059669, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 24), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(0x059669, 1.4, 10);
    ptLight.position.set(0, 5.0, 1.4);
    group.add(ptLight);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(4, 6.5, 3),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 3.2;
    hitBox.userData = { deviceId: id, name, type: devData.device_type, isDevice: true };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: devData.device_type,
      zone: 'ZONE-NURSE',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      screenMesh: screen,
      data: devData,
    });

    return group;
  }

  // 6. ECG Monitor & Cardiology Cart (ECG-03)
  private createECGCartGroup(id: string, name: string, devData: any): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });

    // Trolley cart base
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2.0), frameMat);
    base.position.y = 0.4;
    group.add(base);

    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 0.8), frameMat);
    pillar.position.y = 1.7;
    group.add(pillar);

    // ECG Unit Box
    const ecgBox = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 1.6), bodyMat);
    ecgBox.position.y = 3.6;
    ecgBox.castShadow = true;
    group.add(ecgBox);

    // ECG Waveform Screen
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x818cf8 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), screenMat);
    screen.position.set(0, 3.6, 0.81);
    group.add(screen);

    // Cable harness arm
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x64748b })
    );
    arm.position.set(1.1, 4.4, 0);
    arm.rotation.z = -0.4;
    group.add(arm);

    // Aura
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.3, 24), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(0x818cf8, 1.2, 9);
    ptLight.position.set(0, 3.8, 1.0);
    group.add(ptLight);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 5.5, 3),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 2.8;
    hitBox.userData = { deviceId: id, name, type: devData.device_type, isDevice: true };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: devData.device_type,
      zone: 'ZONE-WARD',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      screenMesh: screen,
      data: devData,
    });

    return group;
  }

  // 7. Laboratory Analyzer & Imaging Workstation (LA-03 / IW-06)
  private createLabDeviceGroup(id: string, name: string, devData: any, isImaging = false): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    const benchMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const devMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });

    // Laboratory Bench
    const bench = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 2.4), benchMat);
    bench.position.y = 1.0;
    bench.castShadow = true;
    bench.receiveShadow = true;
    group.add(bench);

    if (isImaging) {
      // Diagnostic Radiology PACS Workstation with Vertical Screen
      const vertScreenBox = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.2), devMat);
      vertScreenBox.position.set(0, 3.6, 0);
      group.add(vertScreenBox);

      const screenMat = new THREE.MeshBasicMaterial({ color: 0x6366f1 });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), screenMat);
      screen.position.set(0, 3.6, 0.11);
      group.add(screen);
    } else {
      // Laboratory Blood Chemistry Analyzer with Carousel
      const analyzerBox = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 1.8), devMat);
      analyzerBox.position.set(0, 2.9, 0);
      group.add(analyzerBox);

      // Rotating sample carousel
      const carousel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 0.3, 16),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.6 })
      );
      carousel.position.set(-0.7, 3.9, 0);
      group.add(carousel);
      this.animatedMeshes.push({
        mesh: carousel,
        update: (t) => {
          carousel.rotation.y = t * 1.2;
        },
      });

      const screenMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), screenMat);
      screen.position.set(0.7, 3.2, 0.91);
      group.add(screen);
    }

    // Aura
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 24), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(0x6366f1, 1.3, 10);
    ptLight.position.set(0, 3.5, 1.0);
    group.add(ptLight);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 5.5, 3.2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 2.8;
    hitBox.userData = { deviceId: id, name, type: devData.device_type, isDevice: true };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: devData.device_type,
      zone: 'ZONE-WARD',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      data: devData,
    });

    return group;
  }

  // 8. Server Rack & Core Gateway (EHR-DB-01, DC-AUTH-01, VLAN-GW-01, PACS-IMG-03)
  private createServerRackGroup(id: string, name: string, devData: any, isGateway = false): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    const rackMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.8, roughness: 0.2 });
    const glassDoorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
    });

    // 42U Server Rack Enclosure
    const rack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 7.5, 2.6), rackMat);
    rack.position.y = 3.75;
    rack.castShadow = true;
    rack.receiveShadow = true;
    group.add(rack);

    // Front Glass Door
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 7.2, 0.1), glassDoorMat);
    door.position.set(0, 3.75, 1.35);
    group.add(door);

    // Multi-unit Blinking LED Arrays
    const ledCount = 18;
    const ledMatCyan = new THREE.MeshBasicMaterial({ color: isGateway ? 0x38bdf8 : 0x10b981 });
    const ledMatAmber = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    for (let i = 0; i < ledCount; i++) {
      const isAlt = i % 3 === 0;
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 6),
        isAlt ? ledMatAmber : ledMatCyan
      );
      led.position.set(-0.8 + (i % 6) * 0.32, 1.5 + Math.floor(i / 6) * 1.8, 1.36);
      group.add(led);

      this.animatedMeshes.push({
        mesh: led,
        update: (t) => {
          led.visible = Math.sin(t * (10 + i * 2)) > 0;
        },
      });
    }

    // Aura
    const auraColor = isGateway ? 0x0284c7 : 0xd97706;
    const auraMat = new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 24), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(auraColor, 1.6, 12);
    ptLight.position.set(0, 4.0, 1.5);
    group.add(ptLight);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 8, 3.4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 3.75;
    hitBox.userData = { deviceId: id, name, type: devData.device_type, isDevice: true };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: devData.device_type,
      zone: 'ZONE-CORE',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      data: devData,
    });

    return group;
  }

  // 9. AI Honeypot Deception Node (DEC-PHARM-01 / DEC-PATIENT-DB)
  private createHoneypotNodeGroup(id: string, name: string, decData: any): THREE.Group {
    const group = new THREE.Group();
    group.name = id;

    // Glowing Holographic Hexagonal Trap Node
    const coreGeo = new THREE.CylinderGeometry(1.4, 1.6, 3.6, 6);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      metalness: 0.9,
      roughness: 0.2,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 2.0;
    core.castShadow = true;
    group.add(core);

    // Glowing Honeycomb Deception Rings
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.1, 8, 24), ringMat);
    ring1.position.y = 2.4;
    ring1.rotation.x = Math.PI / 2;
    group.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.1, 8, 24), ringMat);
    ring2.position.y = 2.0;
    ring2.rotation.x = Math.PI / 2.3;
    group.add(ring2);

    this.animatedMeshes.push({
      mesh: ring1,
      update: (t) => {
        ring1.rotation.z = t * 1.5;
        ring2.rotation.z = -t * 1.2;
      },
    });

    // Top Holographic Shield Emblem
    const emblemGeo = new THREE.OctahedronGeometry(0.8);
    const emblemMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true });
    const emblem = new THREE.Mesh(emblemGeo, emblemMat);
    emblem.position.y = 4.8;
    group.add(emblem);

    this.animatedMeshes.push({
      mesh: emblem,
      update: (t) => {
        emblem.rotation.y = t * 2;
        emblem.position.y = 4.8 + Math.sin(t * 3) * 0.25;
      },
    });

    // Aura
    const auraMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const auraRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 24), auraMat);
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.06;
    group.add(auraRing);

    const ptLight = new THREE.PointLight(0xf59e0b, 2.0, 14);
    ptLight.position.set(0, 3.0, 0);
    group.add(ptLight);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 6.5, 4.5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitBox.position.y = 3.0;
    hitBox.userData = { deviceId: id, name, type: decData.asset_type, isDevice: true, isDecoy: true };
    group.add(hitBox);

    this.deviceObjects.set(id, {
      id,
      name,
      type: decData.asset_type,
      zone: 'ZONE-CORE',
      meshGroup: group,
      statusBadgeMesh: auraRing,
      statusLight: ptLight,
      data: decData,
    });

    return group;
  }

  // --- POPULATE SCENE WITH BACKEND DEVICES ---
  public syncHospitalData(devices: DeviceGridItem[], honeypots: DecoyAsset[], zones?: DigitalTwinZone[]) {
    // If devices are already populated, update their visual states without rebuilding geometry
    if (this.deviceObjects.size > 0) {
      devices.forEach((dev) => {
        const obj = this.deviceObjects.get(dev.device_id);
        if (obj) {
          obj.data = dev;
          this.updateDeviceVisualState(obj);
        }
      });

      honeypots.forEach((dec) => {
        const obj = this.deviceObjects.get(dec.id);
        if (obj) {
          obj.data = dec;
          this.updateDecoyVisualState(obj);
        }
      });

      this.syncAttackTrajectories(devices, honeypots);
      this.updateZonesVisualState(devices, honeypots, zones);
      return;
    }

    // --- INITIAL SPATIAL MAPPING SETUP ---

    // 1. ZONE-ICU (West Wing: X ~ -28, Z ~ -22)
    const pm04Data = devices.find((d) => d.device_id === 'PM-04') || { device_id: 'PM-04', device_name: 'Patient Monitor PM-04', device_type: 'Patient Monitor', risk_score: 10, status: 'SECURE' };
    const bed1 = this.createICUBedGroup('PM-04', 'Patient Monitor PM-04', pm04Data);
    bed1.position.set(-36, 0, -28);
    this.scene.add(bed1);

    const pm02Data = devices.find((d) => d.device_id === 'PM-02') || { device_id: 'PM-02', device_name: 'Patient Monitor PM-02', device_type: 'Patient Monitor', risk_score: 10, status: 'SECURE' };
    const bed2 = this.createICUBedGroup('PM-02', 'Patient Monitor PM-02', pm02Data);
    bed2.position.set(-20, 0, -28);
    this.scene.add(bed2);

    const vu04Data = devices.find((d) => d.device_id === 'VU-04') || { device_id: 'VU-04', device_name: 'Ventilator Unit VU-04', device_type: 'Ventilator', risk_score: 10, status: 'SECURE' };
    const vent = this.createVentilatorGroup('VU-04', 'Ventilator Unit VU-04', vu04Data);
    vent.position.set(-42, 0, -16);
    this.scene.add(vent);

    const ip08Data = devices.find((d) => d.device_id === 'IP-08') || { device_id: 'IP-08', device_name: 'Infusion Pump IP-08', device_type: 'Infusion Pump', risk_score: 10, status: 'SECURE' };
    const pump = this.createInfusionPumpGroup('IP-08', 'Infusion Pump IP-08', ip08Data);
    pump.position.set(-30, 0, -16);
    this.scene.add(pump);

    const decPumpData = honeypots.find((h) => h.id === 'DEC-PUMP-04') || { id: 'DEC-PUMP-04', name: 'Decoy Infusion Pump', asset_type: 'Infusion Pump', risk_score: 90, status: 'ARMED', is_decoy: true };
    const decPump = this.createInfusionPumpGroup('DEC-PUMP-04', 'Decoy Infusion Pump', decPumpData, true);
    decPump.position.set(-16, 0, -16);
    this.scene.add(decPump);

    // 2. ZONE-NURSE (North-East: X ~ 28, Z ~ -22)
    const aw07Data = devices.find((d) => d.device_id === 'AW-07') || { device_id: 'AW-07', device_name: 'Admin Workstation AW-07', device_type: 'Admin Workstation', risk_score: 10, status: 'SECURE' };
    const ws = this.createWorkstationGroup('AW-07', 'Admin Workstation AW-07', aw07Data);
    ws.position.set(24, 0, -26);
    this.scene.add(ws);

    const md02Data = devices.find((d) => d.device_id === 'MD-02') || { device_id: 'MD-02', device_name: 'Med Dispenser MD-02', device_type: 'Medication Dispenser', risk_score: 10, status: 'SECURE' };
    const dispenser = this.createMedicationDispenserGroup('MD-02', 'Med Dispenser MD-02', md02Data);
    dispenser.position.set(38, 0, -26);
    this.scene.add(dispenser);

    const decAdminData = honeypots.find((h) => h.id === 'DEC-ADMIN-07') || { id: 'DEC-ADMIN-07', name: 'Fake Admin Workstation', asset_type: 'Admin Workstation', risk_score: 85, status: 'ARMED', is_decoy: true };
    const decWs = this.createWorkstationGroup('DEC-ADMIN-07', 'Fake Admin Workstation', decAdminData, true);
    decWs.position.set(24, 0, -14);
    this.scene.add(decWs);

    // 3. ZONE-WARD (South-West: X ~ -28, Z ~ 22)
    const pm01Data = devices.find((d) => d.device_id === 'PM-01') || { device_id: 'PM-01', device_name: 'Patient Monitor PM-01', device_type: 'Patient Monitor', risk_score: 10, status: 'SECURE' };
    const wardBed = this.createICUBedGroup('PM-01', 'Patient Monitor PM-01', pm01Data);
    wardBed.position.set(-36, 0, 26);
    this.scene.add(wardBed);

    const ecg03Data = devices.find((d) => d.device_id === 'ECG-03') || { device_id: 'ECG-03', device_name: 'ECG Monitor ECG-03', device_type: 'ECG Monitor', risk_score: 10, status: 'SECURE' };
    const ecg = this.createECGCartGroup('ECG-03', 'ECG Monitor ECG-03', ecg03Data);
    ecg.position.set(-20, 0, 26);
    this.scene.add(ecg);

    const la03Data = devices.find((d) => d.device_id === 'LA-03') || { device_id: 'LA-03', device_name: 'Lab Analyzer LA-03', device_type: 'Laboratory Analyzer', risk_score: 10, status: 'SECURE' };
    const lab = this.createLabDeviceGroup('LA-03', 'Lab Analyzer LA-03', la03Data, false);
    lab.position.set(-36, 0, 14);
    this.scene.add(lab);

    const iw06Data = devices.find((d) => d.device_id === 'IW-06') || { device_id: 'IW-06', device_name: 'Imaging Workstation IW-06', device_type: 'Imaging Workstation', risk_score: 10, status: 'SECURE' };
    const img = this.createLabDeviceGroup('IW-06', 'Imaging Workstation IW-06', iw06Data, true);
    img.position.set(-20, 0, 14);
    this.scene.add(img);

    // 4. ZONE-CORE (South-East: X ~ 28, Z ~ 22)
    const gwData = { device_id: 'VLAN-GW-01', device_name: 'Core Network Gateway', device_type: 'Network Gateway', risk_score: 5, status: 'SECURE' };
    const gw = this.createServerRackGroup('VLAN-GW-01', 'Core Network Gateway', gwData, true);
    gw.position.set(18, 0, 16);
    this.scene.add(gw);

    const ehrData = { device_id: 'EHR-DB-01', device_name: 'EHR Master Database', device_type: 'Database Server', risk_score: 5, status: 'SECURE' };
    const dbRack = this.createServerRackGroup('EHR-DB-01', 'EHR Master Database', ehrData, false);
    dbRack.position.set(24, 0, 16);
    this.scene.add(dbRack);

    const dcData = { device_id: 'DC-AUTH-01', device_name: 'Domain Controller Auth', device_type: 'Auth Server', risk_score: 5, status: 'SECURE' };
    const dcRack = this.createServerRackGroup('DC-AUTH-01', 'Domain Controller Auth', dcData, false);
    dcRack.position.set(30, 0, 16);
    this.scene.add(dcRack);

    // Honeypot Enclave
    const decPharmData = honeypots.find((h) => h.id === 'DEC-PHARM-01') || { id: 'DEC-PHARM-01', name: 'Fake Pharmacy Server', asset_type: 'Pharmacy Dispenser', risk_score: 98, status: 'ARMED', is_decoy: true };
    const decPharm = this.createHoneypotNodeGroup('DEC-PHARM-01', 'Fake Pharmacy Server', decPharmData);
    decPharm.position.set(22, 0, 28);
    this.scene.add(decPharm);

    const decDbData = honeypots.find((h) => h.id === 'DEC-PATIENT-DB') || { id: 'DEC-PATIENT-DB', name: 'Synthetic Patient DB', asset_type: 'EHR Database', risk_score: 99, status: 'ARMED', is_decoy: true };
    const decDb = this.createHoneypotNodeGroup('DEC-PATIENT-DB', 'Synthetic Patient DB', decDbData);
    decDb.position.set(36, 0, 28);
    this.scene.add(decDb);

    // Update initial visual states
    this.deviceObjects.forEach((obj) => {
      this.updateDeviceVisualState(obj);
    });

    this.syncAttackTrajectories(devices, honeypots);
    this.updateZonesVisualState(devices, honeypots, zones);
  }

  // --- UPDATE DEVICE VISUAL STATES (REAL ML & SECURITY STATUS) ---
  private updateDeviceVisualState(obj: SceneDeviceObject) {
    const dev = obj.data as DeviceGridItem;
    const status = dev.status || 'SECURE';
    const isAttackActive = dev.attack_active || false;
    const risk = dev.risk_score || 0;

    let colorHex = 0x38bdf8; // Normal cyan
    let lightIntensity = 1.2;

    if (status === 'ISOLATED') {
      colorHex = 0xa855f7; // Purple
      lightIntensity = 2.0;
      this.applyContainmentCage(obj, true);
    } else {
      this.applyContainmentCage(obj, false);

      if (status === 'CRITICAL' || risk >= 75 || isAttackActive) {
        colorHex = 0xf43f5e; // Crimson / Red
        lightIntensity = 3.0;
      } else if (status === 'HIGH RISK' || risk >= 50) {
        colorHex = 0xf97316; // Orange
        lightIntensity = 2.4;
      } else if (status === 'SUSPICIOUS' || risk >= 25) {
        colorHex = 0xfacc15; // Yellow / Amber
        lightIntensity = 1.8;
      } else if (status === 'MONITORING') {
        colorHex = 0x38bdf8; // Light Blue
        lightIntensity = 1.4;
      } else {
        colorHex = 0x10b981; // Emerald Green
        lightIntensity = 1.2;
      }
    }

    if (obj.statusBadgeMesh) {
      (obj.statusBadgeMesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
    }
    if (obj.statusLight) {
      obj.statusLight.color.setHex(colorHex);
      obj.statusLight.intensity = lightIntensity;
    }
    if (obj.screenMesh) {
      (obj.screenMesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
    }
  }

  private updateDecoyVisualState(obj: SceneDeviceObject) {
    const dec = obj.data as DecoyAsset;
    const isTriggered = dec.status === 'TRIGGERED';

    const colorHex = isTriggered ? 0xf43f5e : 0xf59e0b;
    if (obj.statusBadgeMesh) {
      (obj.statusBadgeMesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
    }
    if (obj.statusLight) {
      obj.statusLight.color.setHex(colorHex);
      obj.statusLight.intensity = isTriggered ? 3.5 : 2.0;
    }
  }

  // --- ISOLATION CONTAINMENT CAGE SHIELD ---
  private applyContainmentCage(obj: SceneDeviceObject, enable: boolean) {
    if (enable) {
      if (!obj.containmentCage) {
        const cageGeo = new THREE.CylinderGeometry(3.2, 3.2, 7.5, 16, 4, true);
        const cageMat = new THREE.MeshBasicMaterial({
          color: 0xc084fc,
          wireframe: true,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const cage = new THREE.Mesh(cageGeo, cageMat);
        cage.position.y = 3.75;
        obj.meshGroup.add(cage);
        obj.containmentCage = cage;

        this.animatedMeshes.push({
          mesh: cage,
          update: (t) => {
            cage.rotation.y = t * 1.5;
            cageMat.opacity = 0.4 + Math.sin(t * 4) * 0.25;
          },
        });
      }
      obj.containmentCage.visible = true;
    } else {
      if (obj.containmentCage) {
        obj.containmentCage.visible = false;
      }
    }
  }

  // --- ATTACK TRAJECTORY VISUALIZATION (REAL EVENT DRIVEN) ---
  private syncAttackTrajectories(devices: DeviceGridItem[], _honeypots?: DecoyAsset[]) {
    // Remove existing trajectory lines
    this.attackTrajectories.forEach((t) => {
      this.scene.remove(t.lineMesh);
      this.scene.remove(t.particles);
      t.lineMesh.geometry.dispose();
      (t.lineMesh.material as THREE.Material).dispose();
      t.particles.geometry.dispose();
      (t.particles.material as THREE.Material).dispose();
    });
    this.attackTrajectories = [];

    // Check for active attacks on devices or triggered decoys
    const attackingDevices = devices.filter((d) => d.attack_active || d.status === 'CRITICAL');
    const gatewayPos = new THREE.Vector3(18, 4, 16); // Gateway in Core

    attackingDevices.forEach((dev) => {
      const targetObj = this.deviceObjects.get(dev.device_id);
      if (!targetObj) return;

      const targetPos = targetObj.meshGroup.position.clone().add(new THREE.Vector3(0, 3, 0));
      const midPoint = new THREE.Vector3(
        (gatewayPos.x + targetPos.x) / 2,
        Math.max(gatewayPos.y, targetPos.y) + 8,
        (gatewayPos.z + targetPos.z) / 2
      );

      const curve = new THREE.QuadraticBezierCurve3(gatewayPos, midPoint, targetPos);
      const points = curve.getPoints(50);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xf43f5e, linewidth: 3, transparent: true, opacity: 0.85 });
      const lineMesh = new THREE.Line(lineGeo, lineMat);
      this.scene.add(lineMesh);

      // Trajectory Particles
      const particleGeo = new THREE.BufferGeometry();
      const pCount = 12;
      const positions = new Float32Array(pCount * 3);
      particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particleMat = new THREE.PointsMaterial({ color: 0xffedd5, size: 0.8, transparent: true, opacity: 0.95 });
      const particles = new THREE.Points(particleGeo, particleMat);
      this.scene.add(particles);

      this.attackTrajectories.push({
        id: dev.device_id,
        sourcePos: gatewayPos,
        targetPos,
        curve,
        lineMesh,
        particles,
        intensity: 1.0,
      });
    });
  }

  // --- UPDATE ZONE VISUAL STATES (REAL BACKEND THREAT AGGREGATION) ---
  private updateZonesVisualState(devices: DeviceGridItem[], honeypots: DecoyAsset[], zones?: DigitalTwinZone[]) {
    this.zoneObjects.forEach((zObj, zoneId) => {
      // Collect devices mapped to this logical zone
      const zDevs = devices.filter((d) => {
        if ((d as any).zone === zoneId) return true;
        if (zoneId === 'ZONE-ICU' && ['PM-04', 'PM-02', 'IP-08', 'VU-04'].includes(d.device_id)) return true;
        if (zoneId === 'ZONE-NURSE' && ['AW-07', 'MD-02'].includes(d.device_id)) return true;
        if (zoneId === 'ZONE-WARD' && ['ECG-03', 'LA-03', 'IW-06', 'PM-01'].includes(d.device_id)) return true;
        if (zoneId === 'ZONE-CORE' && ['EHR-DB-01', 'DC-AUTH-01', 'VLAN-GW-01', 'PACS-IMG-03'].includes(d.device_id)) return true;
        return false;
      });

      const zDecoys = honeypots.filter((h) => {
        if ((h as any).zone === zoneId) return true;
        if (zoneId === 'ZONE-ICU' && h.id === 'DEC-PUMP-04') return true;
        if (zoneId === 'ZONE-NURSE' && h.id === 'DEC-ADMIN-07') return true;
        if (zoneId === 'ZONE-CORE' && ['DEC-PHARM-01', 'DEC-PATIENT-DB'].includes(h.id)) return true;
        return false;
      });

      const zData = zones?.find((z) => z.zone_id === zoneId);

      const hasActiveAttack =
        zData?.attack_active ||
        zDevs.some((d) => d.attack_active) ||
        zDecoys.some((h) => h.status === 'TRIGGERED');

      const maxRisk = Math.max(
        zData?.peak_risk || 0,
        zData?.average_risk || 0,
        ...zDevs.map((d) => d.risk_score || 0)
      );

      const hasCritical =
        hasActiveAttack ||
        maxRisk >= 75 ||
        zDevs.some((d) => d.status === 'CRITICAL');

      const hasHighRisk =
        maxRisk >= 50 ||
        zDevs.some((d) => d.status === 'HIGH RISK') ||
        (zData?.threat_count || 0) > 0;

      if (hasCritical) {
        // Alert State: CRITICAL (Glowing Crimson Alert)
        zObj.padMaterial.color.setHex(0x500724);
        zObj.padMaterial.opacity = 0.95;
        zObj.borderMaterial.color.setHex(0xf43f5e);
        zObj.borderMaterial.opacity = 1.0;
        if (zObj.discMaterial) {
          zObj.discMaterial.color.setHex(0xf43f5e);
        }
      } else if (hasHighRisk) {
        // Alert State: HIGH RISK (Glowing Amber / Orange)
        zObj.padMaterial.color.setHex(0x431407);
        zObj.padMaterial.opacity = 0.92;
        zObj.borderMaterial.color.setHex(0xf97316);
        zObj.borderMaterial.opacity = 0.9;
        if (zObj.discMaterial) {
          zObj.discMaterial.color.setHex(0xf97316);
        }
      } else {
        // Normal Baseline Secure State
        zObj.padMaterial.color.setHex(0x111827);
        zObj.padMaterial.opacity = 0.9;
        zObj.borderMaterial.color.setHex(zObj.defaultColor);
        zObj.borderMaterial.opacity = 0.7;
        if (zObj.discMaterial) {
          zObj.discMaterial.color.setHex(zObj.defaultColor);
        }
      }
    });
  }

  // --- CAMERA TRANSITIONS & PRESETS ---
  public setCameraPreset(preset: CameraPreset) {
    switch (preset) {
      case 'OVERVIEW':
        this.targetCameraPos.set(0, 52, 60);
        this.targetLookAt.set(0, 0, 0);
        break;
      case 'ZONE-ICU':
        this.targetCameraPos.set(-28, 24, 0);
        this.targetLookAt.set(-28, 2, -22);
        break;
      case 'ZONE-NURSE':
        this.targetCameraPos.set(28, 24, 0);
        this.targetLookAt.set(28, 2, -22);
        break;
      case 'ZONE-WARD':
        this.targetCameraPos.set(-28, 24, 44);
        this.targetLookAt.set(-28, 2, 22);
        break;
      case 'ZONE-CORE':
        this.targetCameraPos.set(28, 24, 44);
        this.targetLookAt.set(28, 2, 22);
        break;
    }
  }

  // --- EVENT LISTENERS & RAYCASTING ---
  private setupEventListeners() {
    const el = this.renderer.domElement;

    // Mouse drag rotation
    el.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isDragging) {
        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        this.spherical.theta -= deltaX * 0.006;
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI / 2.1, this.spherical.phi - deltaY * 0.006));

        this.targetCameraPos.x = this.currentLookAt.x + this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
        this.targetCameraPos.y = this.currentLookAt.y + this.spherical.radius * Math.cos(this.spherical.phi);
        this.targetCameraPos.z = this.currentLookAt.z + this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);

        this.previousMousePosition = { x: e.clientX, y: e.clientY };
      }

      this.checkRaycastHover(e);
    });

    // Mouse wheel zoom
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.spherical.radius = Math.max(20, Math.min(120, this.spherical.radius + e.deltaY * 0.05));
      this.targetCameraPos.x = this.currentLookAt.x + this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
      this.targetCameraPos.y = this.currentLookAt.y + this.spherical.radius * Math.cos(this.spherical.phi);
      this.targetCameraPos.z = this.currentLookAt.z + this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);
    }, { passive: false });

    // Click selection
    el.addEventListener('click', () => {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);

      for (const hit of intersects) {
        const devId = hit.object.userData?.deviceId;
        if (devId) {
          if (this.onDeviceClick) {
            this.onDeviceClick(devId);
          }
          break;
        }
      }
    });

    // Dynamic ResizeObserver to auto-adapt to flex/motion container resizing
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width || this.container.clientWidth;
          const h = entry.contentRect.height || this.container.clientHeight;
          if (w > 20 && h > 20) {
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h, false);
          }
        }
      });
      this.resizeObserver.observe(this.container);
    }

    // Window Resize fallback
    window.addEventListener('resize', () => {
      if (!this.container) return;
      const w = this.container.clientWidth || 800;
      const h = this.container.clientHeight || 500;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  private checkRaycastHover(e: MouseEvent) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    let foundDevId: string | null = null;
    for (const hit of intersects) {
      const devId = hit.object.userData?.deviceId;
      if (devId) {
        foundDevId = devId;
        break;
      }
    }

    if (foundDevId !== this.hoveredDeviceId) {
      this.hoveredDeviceId = foundDevId;
      this.container.style.cursor = foundDevId ? 'pointer' : 'default';
      if (this.onDeviceHover) {
        this.onDeviceHover(foundDevId, { x: e.clientX, y: e.clientY });
      }
    }
  }

  // --- ANIMATION LOOP ---
  private animate() {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();

    // Smooth camera interpolation
    this.camera.position.lerp(this.targetCameraPos, dt * 3.5);
    this.currentLookAt.lerp(this.targetLookAt, dt * 3.5);
    this.camera.lookAt(this.currentLookAt);

    // Update animated meshes
    this.animatedMeshes.forEach((item) => {
      item.update(elapsedTime, dt);
    });

    // Update attack trajectory particle streams
    this.attackTrajectories.forEach((traj) => {
      const posAttr = traj.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const pCount = posAttr.count;
      for (let i = 0; i < pCount; i++) {
        const offset = (elapsedTime * 0.8 + i / pCount) % 1.0;
        const pt = traj.curve.getPoint(offset);
        posAttr.setXYZ(i, pt.x, pt.y, pt.z);
      }
      posAttr.needsUpdate = true;
    });

    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.renderer.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
