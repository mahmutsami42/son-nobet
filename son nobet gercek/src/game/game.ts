import * as T from 'three';
import { box, solid } from './art';
import { audio, type VoiceClip } from './audio';
import { CELL, FLOOR_CODES, FLOOR_NAMES, HEIGHT, ITEMS, NOTES, PARTS, STARTER, WEAPONS, bagUsed, getObjective, owns, partCount, writeProgress, type Action, type Floor, type ItemId, type Progress, type Settings } from './data';
import { Enemies } from './enemies';
import { STAIRCASES, cellAt, roomName, worldRoomAt } from './layout';
import { World } from './world';

export type Panel = 'pause' | 'inventory' | 'map' | 'settings' | 'controls' | 'power' | 'lift' | 'note' | 'dead' | 'win';
type Focus = { id: string; label: string; verb: string; position: T.Vector3; kind: 'door' | 'object'; angle?: number };
type Toast = { key: number; text: string; tone: 'info' | 'important' | 'danger' };
export type Hud = {
  progress: Progress; health: number; stamina: number; battery: number; lamp: boolean; crouch: boolean; hidden: boolean;
  floor: Floor; location: string; x: number; z: number; yaw: number; focus: { label: string; verb: string; id: string } | null;
  objective: ReturnType<typeof getObjective>; aim: { x: number; y: number; direction: string } | null;
  toast: Toast | null; subtitle: string; hurt: number; rotor: number; boarding: boolean; cinematic: boolean;
  action: { title: string; percent: number } | null; capture: 'none' | 'lock' | 'drag'; liftBusy: boolean; switches: boolean[];
};
type Callbacks = { hud: (hud: Hud) => void; panel: (panel: Panel | null, note?: string) => void; save: (progress: Progress) => void; failure: (message: string) => void };
type LiftRide = { from: Floor; to: Floor; t: number; duration: number; rider: boolean; entry: T.Vector3; startYaw: number };
type Projectile = { body: T.Mesh; velocity: T.Vector3; floor: Floor; t: number; loud: boolean };
const cap = T.MathUtils.clamp;
const smooth = (x: number) => x * x * (3 - x * 2);
const v3 = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const copy = <V,>(value: V): V => structuredClone(value);

export class HospitalGame {
  readonly world: World;
  readonly enemies: Enemies;
  readonly renderer: T.WebGLRenderer;
  readonly camera = new T.PerspectiveCamera(75, 1, .06, 260);
  readonly p: Progress;
  readonly player = new T.Vector3();
  settings: Settings;
  floor: Floor;
  yaw = 0;
  pitch = -.155;
  health = 100;
  stamina = 100;
  private lamp = false;
  private crouch = false;
  private crouchToggle = false;
  private sprintToggle = false;
  private exhaustion = 0;
  private eyeHeight = 1.64;
  private vSpeed = 0;
  private airborne = false;
  private hidden: { returnTo: T.Vector3; id: string } | null = null;
  private keys = new Set<string>();
  private touch = new Set<Action>();
  private dragStart: { x: number; y: number; distance: number; already: boolean } | null = null;
  private capture: Hud['capture'] = 'none';
  private panel: Panel | null = null;
  private focus: Focus | null = null;
  private lastFrame = 0;
  private tick = 0;
  private hudTimer = 0;
  private animationId = 0;
  private hurt = 0;
  private breathTime = 0;
  private stepTime = .15;
  private headTime = 0;
  private walkBlend = 0;
  private turnBob = 0;
  private swing = 0;
  private rotor = 0;
  private rotorSpin = 0;
  private boarding = false;
  private cinematic = 0;
  private cineStart = new T.Vector3();
  private action: { item: ItemId; t: number; total: number; title: string } | null = null;
  private toast: Toast | null = null;
  private toastTimer = 0;
  private toastCount = 0;
  private subtitle = '';
  private subtitleTimer = 0;
  private announcement = false;
  private liftFloor: Floor = 0;
  private ride: LiftRide | null = null;
  private switches = [false, true, false];
  private projectiles: Projectile[] = [];
  private readonly view = new T.Group();
  private readonly handLamp = new T.Group();
  private readonly handWeapon = new T.Group();
  private readonly weapons = new Map<ItemId, T.Group>();
  private readonly resizeObserver: ResizeObserver;
  private readonly softwareGpu: boolean;
  private disposed = false;
  private frozenRendered = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(readonly host: HTMLElement, p: Progress, settings: Settings, private readonly callbacks: Callbacks) {
    this.settings = settings;
    this.p = copy(p);
    this.floor = p.checkpoint.floor;
    this.yaw = p.checkpoint.yaw;
    this.player.set(p.checkpoint.x, this.floor * HEIGHT, p.checkpoint.z);
    this.renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    const gl = this.renderer.getContext(), details = gl.getExtension('WEBGL_debug_renderer_info');
    this.softwareGpu = Boolean(details && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(details.UNMASKED_RENDERER_WEBGL))));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.domElement.setAttribute('aria-label', 'Kuzgun Adası Hastanesi, birinci şahıs oyun alanı');
    this.renderer.domElement.setAttribute('tabindex', '0');
    host.appendChild(this.renderer.domElement);
    this.world = new World(this.p);
    this.enemies = new Enemies(this.world, p.difficulty);
    this.world.scene.add(this.camera); this.camera.add(this.view); this.makeView();
    this.lamp = false;
    if (p.power) this.world.toggleDoor('0:lift', true);
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(host); this.resize();
    this.bind();
    this.applySettings(settings);
    this.updateCamera(0);
    this.focus = this.findFocus();
    this.publish();
    this.announce(this.p.collected.includes('starter') ? 'İlerleyişin geri yüklendi.' : 'Çatıda bıraktığım helikopter... Buradan tek çıkış o.', 5.8);
    this.animationId = requestAnimationFrame(this.frame);
  }

  private makeView() {
    const mat = this.world.mat, cloth = solid(0x293f3d, .91), glove = solid(0x363a32, .85);
    this.handLamp.position.set(-.365, -.33, -.57); this.handLamp.rotation.set(-.16, .25, -.12); this.view.add(this.handLamp);
    const grip = new T.Mesh(new T.CylinderGeometry(.051, .043, .26, 12), mat.dark); grip.rotation.x = Math.PI * .5; this.handLamp.add(grip);
    for (const [r, d, z, m] of [[.073, .105, -.138, mat.steel], [.069, .028, -.192, mat.dark], [.058, .018, -.211, mat.glassShine]] as const) {
      const body = new T.Mesh(new T.CylinderGeometry(r, r, d, 12), m); body.rotation.x = Math.PI * .5; body.position.z = z; this.handLamp.add(body);
    }
    box(this.handLamp, .02, -.075, .044, .118, .133, .148, glove).rotation.x = -.12;
    box(this.handLamp, -.04, -.184, .151, .13, .145, .42, cloth).rotation.x = .49;
    this.handWeapon.position.set(.39, -.37, -.70); this.handWeapon.rotation.set(-.29, .10, -.53); this.view.add(this.handWeapon);
    box(this.handWeapon, .013, -.076, .014, .127, .153, .163, glove);
    box(this.handWeapon, .041, -.165, .196, .147, .14, .43, cloth).rotation.x = .47;
    for (const [key, color, length, width] of [['stick', 0x8d6648, .62, .045], ['crowbar', 0x7e4d45, .69, .043], ['screwdriver', 0x9f7052, .33, .033], ['heavy', 0x685e55, .61, .067]] as const) {
      const arm = new T.Group(), handle = box(arm, -.042, .15, -.04, width, length, width * 1.07, solid(color, .84)); handle.rotation.z = .028; handle.rotation.x = -.05;
      if (key === 'stick') { box(arm, -.04, .13, -.063, width + .005, length - .04, .006, solid(0x685142)); box(arm, -.062, .215, -.064, .013, length * .68, .007, solid(0xa07a55)); }
      if (key === 'crowbar') box(arm, -.098, .479, -.048, .16, .046, .061, mat.trim).rotation.z = -.29;
      if (key === 'screwdriver') box(arm, -.045, .37, -.045, .027, .274, .024, mat.steel);
      if (key === 'heavy') { const head = new T.Mesh(new T.DodecahedronGeometry(.137, 0), mat.metal); head.position.set(-.047, .505, -.046); arm.add(head); }
      this.handWeapon.add(arm); this.weapons.set(key, arm);
    }
  }

  private resize = () => {
    if (this.disposed) return;
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    const limit = this.softwareGpu ? Math.min(.83, 1180 / w) : 1.25;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, limit) * (this.settings.detail === 'low' ? .74 : 1));
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.frozenRendered = false;
  };

  applySettings(settings: Settings) {
    this.settings = settings;
    this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); this.resize(); audio.settings(settings);
  }

  private bind() {
    const listen = <K extends keyof WindowEventMap>(event: K, callback: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(event, callback); this.cleanups.push(() => window.removeEventListener(event, callback));
    };
    const canvas = this.renderer.domElement;
    listen('keydown', this.keyDown); listen('keyup', this.keyUp);
    listen('blur', () => { this.keys.clear(); this.touch.clear(); });
    listen('pointermove', this.pointerMove); listen('pointerup', this.pointerUp); listen('pointercancel', this.pointerUp);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('pointerlockchange', this.lockChange);
    document.addEventListener('pointerlockerror', this.lockError);
    this.cleanups.push(() => canvas.removeEventListener('pointerdown', this.pointerDown), () => canvas.removeEventListener('webglcontextlost', this.contextLost), () => document.removeEventListener('pointerlockchange', this.lockChange), () => document.removeEventListener('pointerlockerror', this.lockError));
  }

  private contextLost = (ev: Event) => { ev.preventDefault(); this.callbacks.failure('3D grafik bağlamı kesildi. Ayarlardan grafik ayrıntısını düşürüp yeniden dene.'); };
  private lockChange = () => {
    const canvas = this.renderer.domElement;
    if (document.pointerLockElement === canvas) { this.capture = 'lock'; this.dragStart = null; }
    else if (this.capture === 'lock') { this.capture = 'none'; if (!this.panel && !this.cinematic) this.open('pause'); }
    this.publish();
  };
  private lockError = () => { if (!this.panel) { this.capture = 'drag'; this.publish(); } };

  captureMouse = () => {
    if (this.panel || this.cinematic) return;
    audio.start(this.settings);
    const canvas = this.renderer.domElement;
    if (this.capture === 'lock') return;
    if (this.capture === 'drag' || matchMedia('(pointer: coarse)').matches || typeof canvas.requestPointerLock !== 'function') { this.capture = 'drag'; this.publish(); return; }
    try { const attempt = canvas.requestPointerLock(); if (attempt) void attempt.catch(this.lockError); }
    catch { this.lockError(); }
  };

  private pointerDown = (e: PointerEvent) => {
    if (this.panel || this.cinematic || e.button !== 0) return;
    e.preventDefault();
    if (this.capture === 'lock') { this.melee(); return; }
    const already = this.capture === 'drag';
    if (e.pointerType !== 'mouse') this.capture = 'drag';
    this.dragStart = { x: e.clientX, y: e.clientY, distance: 0, already };
    this.captureMouse();
  };
  private pointerMove = (e: PointerEvent) => {
    if (this.panel || this.cinematic || (this.ride?.rider && this.ride.t < .64)) return;
    const old = this.dragStart, sens = .00077 + this.settings.sensitivity * .000025;
    if (this.capture === 'lock') { this.yaw -= e.movementX * sens; this.pitch = cap(this.pitch - e.movementY * sens, -1.34, 1.34); }
    else if (old) {
      const dx = e.clientX - old.x, dy = e.clientY - old.y;
      old.distance += Math.abs(dx) + Math.abs(dy); old.x = e.clientX; old.y = e.clientY;
      this.yaw -= dx * sens * 1.3; this.pitch = cap(this.pitch - dy * sens * 1.3, -1.34, 1.34);
    }
  };
  private pointerUp = () => { const old = this.dragStart; this.dragStart = null; if (old?.already && old.distance < 5 && !this.panel && !this.cinematic) this.melee(); };

  private keyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const k = this.settings.keys;
    if (this.panel) {
      if (e.repeat) return;
      if (this.panel === 'inventory' && e.code === k.inventory || this.panel === 'map' && e.code === k.map || e.code === 'Escape' && !['dead', 'win', 'settings', 'controls'].includes(this.panel)) { e.preventDefault(); this.open(null); }
      return;
    }
    if (this.cinematic) return;
    if (e.metaKey || e.altKey || (e.ctrlKey && e.code !== k.crouch && !this.keys.has(k.crouch))) return;
    const code = e.code;
    if (Object.values(k).includes(code) || ['Escape', 'KeyB', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(code)) e.preventDefault();
    this.keys.add(code);
    if (e.repeat) return;
    if (code === 'Escape') { this.open('pause'); return; }
    if (code === k.inventory) { this.open('inventory'); return; }
    if (code === k.map) { this.open('map'); return; }
    if (/^Digit[1-4]$/.test(code)) { this.selectSlot(Number(code.slice(-1)) - 1); return; }
    if (code === 'KeyB' && !Object.values(k).includes(code)) { this.barricade(); return; }
    for (const action of ['interact', 'sprint', 'crouch', 'jump', 'lamp', 'throw', 'use'] as Action[]) if (code === k[action]) this.takeAction(action);
  };
  private keyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private held(action: Action) { const code = this.settings.keys[action]; return this.touch.has(action) || this.keys.has(code) || code === 'ShiftLeft' && this.keys.has('ShiftRight') || code === 'ControlLeft' && this.keys.has('ControlRight'); }

  touchAction(action: Action, pressed: boolean) {
    if (pressed) { this.touch.add(action); this.takeAction(action); }
    else this.touch.delete(action);
  }

  takeAction(action: Action) {
    if (this.panel || this.cinematic) return;
    if (action === 'interact') this.interact();
    else if (action === 'lamp') this.toggleLamp();
    else if (action === 'throw') this.throwItem();
    else if (action === 'use') { const id = this.p.hotbar[this.p.selected]; if (id) this.useItem(id); }
    else if (action === 'sprint' && this.settings.toggleRun) this.sprintToggle = !this.sprintToggle;
    else if (action === 'crouch' && this.settings.toggleCrouch) this.crouchToggle = !this.crouchToggle;
    else if (action === 'jump' && !this.airborne && !this.crouch && !this.hidden && !this.ride?.rider) { this.vSpeed = 3.9; this.airborne = true; }
    else if (action === 'inventory' || action === 'map') this.open(action);
  }

  open(panel: Panel | null, note?: string) {
    if (this.disposed) return;
    this.panel = panel; this.keys.clear(); this.touch.clear(); this.dragStart = null; this.frozenRendered = false;
    if (panel && document.pointerLockElement === this.renderer.domElement) { this.capture = 'none'; document.exitPointerLock(); }
    if (panel) { audio.stopVoice(); audio.ambience(false, 0, 0, false); if (panel !== 'dead' && panel !== 'win') audio.cue('ui', .61); }
    this.callbacks.panel(panel, note); this.publish();
  }

  checkpoint(manual = false) {
    if (manual) {
      const f = this.floor, point = this.player.clone(), room = worldRoomAt(f, point.x, point.z);
      const clear = (x: number, z: number) => worldRoomAt(f, x, z) === room && !this.world.moveBlocked(x, z, f * HEIGHT, 1.75, .30);
      let spot = clear(point.x, point.z) ? point : null;
      for (let i = 0; !spot && i < 32; i++) {
        const angle = Math.PI * (i % 8) * .25, r = .43 + Math.floor(i / 8) * .43;
        const x = point.x + Math.cos(angle) * r, z = point.z + Math.sin(angle) * r;
        if (clear(x, z)) spot = v3(x, f * HEIGHT, z);
      }
      if (spot) this.p.checkpoint = { floor: f, x: spot.x, z: spot.z, yaw: this.yaw };
    }
    this.p.date = Date.now();
    const saved = writeProgress(this.p); this.callbacks.save(copy(this.p));
    if (manual) this.notify(saved ? 'İlerleyiş kaydedildi.' : 'Kayıt bellekte. Tarayıcı depolamaya izin vermiyor.', 'important');
  }

  private notify(text: string, tone: Toast['tone'] = 'info') { this.toast = { text, tone, key: ++this.toastCount }; this.toastTimer = 3.85; this.publish(); }
  private announce(text: string, seconds = 4.6, clip?: VoiceClip) { this.subtitle = text; this.subtitleTimer = seconds; if (clip) audio.voice(clip); }
  private noise(radius: number, position = this.player, floor = this.floor) { this.enemies.emit({ position: position.clone(), radius, floor }); }

  private toggleLamp() {
    if (!owns(this.p, 'lamp')) { this.notify('Önce acil durum çantasını al.'); return; }
    if (!this.lamp && this.p.battery <= 0) { this.notify('Pil bitti. Envanterden yedek pili kullan.', 'danger'); return; }
    this.lamp = !this.lamp; audio.cue('lamp', .65); this.publish();
  }

  useItem(id: ItemId) {
    if (!owns(this.p, id)) return;
    const item = ITEMS[id];
    if (item.kind === 'heal') {
      if (this.health >= 100) { this.notify('Sağlık zaten tam.'); return; }
      this.health = Math.min(100, this.health + (id === 'kit' ? 70 : 35)); this.consume(id); this.notify(`${item.name} kullanıldı.`);
    } else if (id === 'cell') {
      if (this.p.battery > 98) { this.notify('El fenerinin pili zaten dolu.'); return; }
      this.p.battery = 100; this.consume(id); this.notify('El fenerinin pili değiştirildi.');
    } else if (id === 'lamp') this.toggleLamp();
    else if (item.kind === 'weapon' || item.kind === 'throw') {
      let slot = this.p.hotbar.indexOf(id);
      if (slot < 0) { slot = this.p.selected; this.assign(slot, id); }
      this.selectSlot(slot);
      this.notify(`${item.name} hazır.`);
    } else if (id === 'map') { this.open('map'); return; }
    else { this.notify('Gerekli yerde etkileşime geçerek kullan.'); return; }
    audio.cue('pickup', .61); this.publish();
  }

  assign(slot: number, id: ItemId | null) {
    if (slot < 0 || slot > 3 || id && (!owns(this.p, id) || ['key', 'part'].includes(ITEMS[id].kind))) return;
    this.p.hotbar = this.p.hotbar.map((entry, i) => i === slot ? id : id && entry === id ? null : entry);
    this.publish();
  }
  selectSlot(slot: number) { this.p.selected = cap(slot, 0, 3); audio.cue('ui', .46); this.publish(); }
  discard(id: ItemId) {
    if (['key', 'part'].includes(ITEMS[id].kind) || id === 'lamp' || !owns(this.p, id)) return;
    this.consume(id, true); this.notify(`${ITEMS[id].name} bırakıldı.`);
  }
  private consume(id: ItemId, all = false) {
    this.p.stock[id] = all ? 0 : Math.max(0, (this.p.stock[id] ?? 0) - 1);
    if (!this.p.stock[id]) { this.p.hotbar = this.p.hotbar.map(e => e === id ? null : e); delete this.p.durability[id]; }
  }
  private give(id: ItemId) {
    const item = ITEMS[id];
    if (item.kind === 'key' || item.kind === 'part') { if (!owns(this.p, id)) this.p.secured.push(id); return true; }
    if (!this.p.stock[id] && bagUsed(this.p) + item.size > 10) return false;
    this.p.stock[id] = (this.p.stock[id] ?? 0) + 1;
    const weapon = WEAPONS[id]; if (weapon && this.p.durability[id] === undefined) this.p.durability[id] = weapon.durability;
    return true;
  }

  private toggle(doorId: string, open: boolean) { this.world.toggleDoor(doorId, open); this.p.doors[doorId] = open; }

  private findFocus(): Focus | null {
    if (this.hidden) return { id: this.hidden.id, label: 'Saklanma dolabı', verb: 'Çık', kind: 'object', position: this.player.clone() };
    if (this.cinematic || this.ride?.rider) return null;
    const eye = this.camera.position, forward = this.camera.getWorldDirection(new T.Vector3());
    let best: Focus | null = null, bestRank = Infinity;
    const check = (f: Focus) => {
      const vector = f.position.clone().sub(eye), dist = vector.length();
      if (dist < .08 || dist > 2.88) return;
      const dot = forward.dot(vector) / dist;
      if (dot < .786 || this.world.occluded(eye, f.position, f.kind === 'door' ? .36 : .21)) return;
      const rank = (1 - dot) * 8 + dist * .24;
      if (rank < bestRank) { best = f; bestRank = rank; }
    };
    for (const { def, group } of this.world.objects.values()) {
      if (def.level !== this.floor || !group.visible || Math.abs(group.position.x - eye.x) > 3 || Math.abs(group.position.z - eye.z) > 3) continue;
      const pos = group.position.clone();
      const id = def.id;
      const label = def.item ? ITEMS[def.item].name : def.note ? NOTES[def.note].title : { starter: 'Acil durum çantası', save: 'Güvenli kayıt noktası', hide: 'Saklanma dolabı', power: 'Yedek güç panosu', repair: 'Helikopter / Onarım noktası', board: 'Helikopter / Kokpit', antenna: 'Acil durum anteni' }[def.type as Exclude<typeof def.type, 'pick' | 'note'>];
      if (def.type === 'repair') pos.z += .51;
      if (def.type === 'hide') { const side = eye.z > pos.z ? 1 : -1; pos.z += side * .36; }
      if (def.type === 'power' || def.type === 'save' || def.type === 'antenna') pos.y += .21;
      if (def.type === 'pick' || def.type === 'starter') pos.y += .13;
      const verb = { pick: 'Al', starter: 'Al', save: 'Kaydet', hide: 'Saklan', note: 'İncele', power: this.p.power ? 'Durumu incele' : 'Panoyu aç', repair: this.boarding || this.rotor > 0 ? 'Kontrol et' : this.p.installed.length < 5 ? 'Onar' : 'Motoru çalıştır', board: this.boarding ? 'Bin' : 'Kontrol et', antenna: this.p.antenna ? 'Sinyali kontrol et' : 'Yayın yap' }[def.type];
      check({ id, label, verb, position: pos, kind: 'object' });
    }
    for (const door of this.world.doors.values()) {
      const d = door.def;
      if (d.glass && door.open || d.floor !== this.floor || Math.abs(door.x - eye.x) > 3 || Math.abs(door.z - eye.z) > 3) continue;
      const room = worldRoomAt(d.floor, (d.b[0] + .5) * CELL, (d.b[1] + .5) * CELL);
      const label = d.glass ? 'Çatlak servis camı' : d.lift ? 'Asansör' : d.floor === 4 ? 'Çatı bakım kapısı' : room ? roomName(d.floor, room) : 'Kapı';
      const verb = d.glass ? 'İncele' : d.lift ? this.ride ? 'Bekle' : this.liftFloor === this.floor && door.open ? 'Kat seç' : 'Çağır' : door.open ? 'Kapat' : d.lock && !this.p.unlocked.includes(d.id) ? 'Kilidi aç' : 'Aç';
      check({ id: d.id, label, verb, position: v3(door.x, this.floor * HEIGHT + (d.glass ? .76 : 1.32), door.z), kind: 'door' });
    }
    return best;
  }

  private interact() {
    if (this.hidden) { this.player.copy(this.hidden.returnTo); this.hidden = null; audio.cue('open', .35); this.notify('Saklandığın yerden çıktın.'); return; }
    const focus = this.findFocus(); if (!focus) return;
    if (focus.kind === 'door') {
      const door = this.world.doors.get(focus.id)!; const d = door.def;
      if (d.lift) { this.callLift(); return; }
      if (d.glass) { this.notify('Bir yakın dövüş eşyasıyla camı kır, sonra çömelerek geç. Ses çıkarır.'); return; }
      const xEdge = d.a[0] !== d.b[0];
      const dx = Math.abs(door.x - this.player.x), dz = Math.abs(door.z - this.player.z);
      if (door.open && (xEdge ? dx < .39 && dz < .94 : dz < .39 && dx < .94)) { this.notify('Kapıyı kapatmak için eşikten çekil.'); return; }
      if (!door.open && d.lock && !this.p.unlocked.includes(d.id)) {
        if (!owns(this.p, d.lock) || d.lock === 'red' && !this.p.power) {
          audio.cue('denied'); this.notify(d.lock === 'red' && !this.p.power ? 'Laboratuvar güvenlik kilidi: B1 yedek güç panosu kapalı.' : `${ITEMS[d.lock].name} gerekli.`, 'danger'); return;
        }
        this.p.unlocked.push(d.id);
        this.toggle(d.id, true); this.checkpoint(); this.notify(d.lock === 'crowbar' ? 'Servis merdiveni kestirmesi açıldı.' : 'Erişim onaylandı.', 'important');
      } else {
        if (door.barricaded) { door.barricaded = 0; if (door.board) door.board.visible = false; this.notify('Barikat kaldırıldı.'); }
        this.toggle(d.id, !door.open);
      }
      audio.cue(d.lock === 'crowbar' ? 'metal' : 'open', .73); this.noise(d.lock === 'crowbar' ? 16 : 8); this.publish(); return;
    }
    const object = this.world.objects.get(focus.id); if (!object) return;
    const { def, group } = object;
    if (def.type === 'starter') {
      for (const id of STARTER) this.give(id);
      this.p.hotbar = ['stick', 'bottle', 'bandage', 'cell']; this.p.collected.push(def.id); group.visible = false;
      audio.cue('pickup'); this.checkpoint(); this.notify('Başlangıç eşyaları çantaya alındı.', 'important');
    } else if (def.item) {
      if (!this.give(def.item)) { this.notify('Sırt çantası dolu. İsteğe bağlı bir eşyayı bırak.', 'danger'); audio.cue('denied'); return; }
      this.p.collected.push(def.id); group.visible = false;
      const item = ITEMS[def.item], critical = item.kind === 'key' || item.kind === 'part';
      audio.cue('pickup'); if (critical) this.checkpoint();
      this.notify(`${item.name} alındı${item.kind === 'part' ? ` / Helikopter parçaları ${partCount(this.p)}/5` : '.'}`, critical ? 'important' : 'info');
    } else if (def.type === 'save') { audio.cue('beacon'); this.checkpoint(true); }
    else if (def.type === 'note' && def.note) {
      if (!this.p.notes.includes(def.note)) { this.p.notes.push(def.note); this.checkpoint(); }
      this.open('note', def.note);
    } else if (def.type === 'hide') {
      this.hidden = { returnTo: this.player.clone(), id: def.id }; this.player.set(group.position.x, HEIGHT * this.floor, group.position.z + .08); this.lamp = false;
      audio.cue('open', .45); this.noise(2.3); this.notify('Gizlendin. Çıkmak için etkileşime geç.');
    } else if (def.type === 'power') {
      if (this.p.power) { this.notify('Yedek güç etkin. Laboratuvar ve asansör besleniyor.'); return; }
      if (!owns(this.p, 'wiring')) { this.notify('Sigorta eksik. 2. kattaki elektrik odasına bak.', 'danger'); audio.cue('denied'); return; }
      this.open('power');
    } else if (def.type === 'repair') this.repair();
    else if (def.type === 'board') {
      if (this.boarding) this.escape(); else this.notify(this.rotor > 0 ? 'Rotor henüz kalkış devrine ulaşmadı.' : 'Önce helikopteri onar ve motoru çalıştır.');
    } else if (def.type === 'antenna') {
      if (this.p.antenna) { this.notify('Acil yayın ana karaya ulaştı.'); return; }
      if (this.p.notes.length < 2) { this.notify('Yayınlamak için en az iki hastane kaydı gerekli.'); return; }
      this.p.antenna = true; this.checkpoint(); this.noise(12); audio.cue('beacon'); this.announce('Acil yayın: Kuzgun Adası kayıtları iletiliyor.'); this.notify('Hastane kayıtları yayınlandı.', 'important');
    }
  }

  flip(index: number) { if (this.panel !== 'power' || index < 0 || index > 2) return; this.switches[index] = !this.switches[index]; audio.cue('metal', .35); this.publish(); }
  restorePower() {
    if (this.panel !== 'power' || this.p.power || !owns(this.p, 'wiring')) return false;
    if (!this.switches[0] || this.switches[1] || !this.switches[2]) { audio.cue('denied'); this.notify('Röle açılmadı. Hat sıralamasını kontrol et.', 'danger'); return false; }
    this.p.power = true; this.world.toggleDoor('0:lift', true); this.open(null); this.checkpoint();
    audio.cue('power'); this.noise(30); this.announce('Anons: Yedek güç etkin. Laboratuvar erişimi, kart onayına tabidir.', 7.2, 'reserve'); this.notify('Yedek güç devrede. Laboratuvar ve asansör aktif.', 'important'); return true;
  }

  private barricade() {
    const f = this.findFocus(), door = f?.kind === 'door' ? this.world.doors.get(f.id) : null;
    if (!door?.board || door.open || door.barricaded || !owns(this.p, 'crowbar')) { this.notify('Barikat için kapalı, zayıf bir kapı ve levye gerek.'); return; }
    door.barricaded = 1; door.board.visible = true; this.noise(6); audio.cue('metal', .44); this.notify('Geçici barikat kuruldu.');
  }

  private callLift() {
    if (!this.p.power) { audio.cue('denied'); this.notify('Asansör elektriksiz. B1 yedek güç panosuna git.'); return; }
    if (this.ride) { this.notify('Asansör hareket halinde.'); return; }
    if (this.liftFloor === this.floor) { this.world.toggleDoor(`${this.floor}:lift`, true); this.open('lift'); }
    else { this.startLift(this.floor, false); this.notify('Asansör çağrıldı.'); }
  }

  chooseLift(floor: Floor) {
    if (this.panel !== 'lift' || this.ride || !this.p.power || floor > 3 || this.floor === floor) return;
    this.open(null); this.startLift(floor, true);
  }

  private startLift(floor: Floor, rider: boolean) {
    this.ride = { from: this.liftFloor, to: floor, t: 0, duration: Math.abs(floor - this.liftFloor) * .90 + .88, rider, entry: this.player.clone(), startYaw: this.yaw };
    if (!rider) this.world.toggleDoor(`${this.liftFloor}:lift`, false);
    audio.cue('power', .54); this.noise(16); this.publish();
  }

  private updateLift(dt: number) {
    const r = this.ride; if (!r) return;
    r.t += dt;
    if (r.t >= .65) this.world.toggleDoor(`${r.from}:lift`, false);
    const t = cap((r.t - .65) / (r.duration - .65), 0, 1), y = T.MathUtils.lerp(r.from * HEIGHT, r.to * HEIGHT, smooth(t));
    this.world.setLift(y);
    if (r.rider) {
      const reach = smooth(cap(r.t / .64, 0, 1));
      this.player.set(T.MathUtils.lerp(r.entry.x, this.world.liftPosition.x, reach), y, T.MathUtils.lerp(r.entry.z, this.world.liftPosition.z, reach));
      this.floor = cap(Math.round(y / HEIGHT), -1, 3) as Floor;
      if (r.t < .65) { this.yaw = r.startYaw + Math.atan2(Math.sin(-r.startYaw), Math.cos(-r.startYaw)) * reach; this.pitch *= 1 - dt * 4; }
    }
    if (r.t >= r.duration) {
      this.liftFloor = r.to; this.ride = null; this.world.toggleDoor(`${r.to}:lift`, true);
      this.noise(16, v3(this.world.liftPosition.x, y, this.world.liftPosition.z), r.to); audio.cue('metal', .68);
      if (r.rider || r.to === this.floor) this.notify(`Asansör ${FLOOR_CODES[r.to]} katına ulaştı. Kapı açık.`);
    }
  }

  private repair() {
    if (this.action) return;
    if (this.rotor > 0 || this.boarding) { this.notify(this.boarding ? 'Kokpit kapısına ilerle.' : 'Rotor hızlanıyor. Çevreyi kontrol et!'); return; }
    if (!owns(this.p, 'tools')) { this.notify('Onarım için bakım atölyesindeki alet çantası gerekli.', 'danger'); return; }
    const available = PARTS.find(id => owns(this.p, id) && !this.p.installed.includes(id));
    if (available) {
      const title = `${ITEMS[available].name} takılıyor`;
      this.action = { item: available, title, t: 0, total: 1.45 };
      this.noise(23); audio.cue('metal'); this.publish(); return;
    }
    if (this.p.installed.length < 5) { this.notify('Eksik: ' + PARTS.filter(id => !owns(this.p, id)).map(id => ITEMS[id].name).join(', '), 'danger'); return; }
    this.rotor = this.p.difficulty === 'story' ? 23 : 28;
    this.enemies.signalRoof(); this.noise(54); audio.cue('power', .9);
    this.announce('Motor çalışıyor. Rotor kalkış devrine ulaşana kadar dayan!', 5); this.notify('Nöbetçi hareketi / Çatı merdivenine dikkat!', 'danger');
  }

  private escape() {
    if (!this.boarding || this.cinematic) return;
    this.cineStart.copy(this.camera.position); this.cinematic = .0001;
    this.keys.clear(); this.touch.clear();
    if (document.pointerLockElement === this.renderer.domElement) { this.capture = 'none'; document.exitPointerLock(); }
    this.publish();
  }

  private melee() {
    if (this.swing > 0 || this.stamina < 8 || this.hidden || this.ride?.rider) return;
    const selected = this.p.hotbar[this.p.selected];
    const id = selected && WEAPONS[selected] && owns(this.p, selected) ? selected : null;
    const weapon = id ? WEAPONS[id]! : { stamina: 12, reach: 1.25, stagger: .6, noise: 4 };
    if (this.stamina < weapon.stamina) { this.notify('Dayanıklılığın toparlanmasını bekle.'); return; }
    this.stamina -= weapon.stamina; this.swing = id === 'heavy' ? .84 : .51;
    const focus = this.findFocus();
    const pane = focus?.kind === 'door' ? this.world.doors.get(focus.id) : null;
    if (id && pane?.def.glass && !pane.open && Math.hypot(pane.x - this.player.x, pane.z - this.player.z) <= weapon.reach) {
      this.toggle(pane.def.id, true); this.wear(id); this.checkpoint(); this.noise(22); audio.cue('glass', .91);
      this.notify('Servis geçidi açıldı. Çömelerek geçebilirsin.', 'important'); return;
    }
    const forward = this.camera.getWorldDirection(new T.Vector3());
    const nearby = this.enemies.actors.filter(e => e.floor === this.floor && e.position.distanceTo(this.player) < weapon.reach && forward.dot(e.position.clone().sub(this.player).normalize()) > .58 && !this.world.occluded(this.camera.position, e.position.clone().add(v3(0, 1.04, 0)))).sort((a, b) => a.position.distanceToSquared(this.player) - b.position.distanceToSquared(this.player));
    if (nearby.length) {
      const enemy = nearby[0]; this.enemies.stun(enemy, enemy.type === 'giant' ? weapon.stagger * (id === 'heavy' ? .63 : .34) : weapon.stagger);
      if (id) this.wear(id);
      audio.cue('hit', .87); this.noise(weapon.noise);
    } else { audio.cue('breathe', .43); this.noise(weapon.noise * .57); }
    this.publish();
  }

  private wear(id: ItemId) {
    const points = this.p.durability[id]; if (points === undefined) return;
    this.p.durability[id] = points - 1;
    if (points <= 1) { this.consume(id); this.notify(`${ITEMS[id].name} kırıldı.`, 'danger'); }
  }

  private throwItem() {
    if (this.hidden || this.ride?.rider) return;
    const selected = this.p.hotbar[this.p.selected];
    const id = selected && ITEMS[selected].kind === 'throw' && owns(this.p, selected) ? selected : owns(this.p, 'bottle') ? 'bottle' : owns(this.p, 'extinguisher') ? 'extinguisher' : null;
    if (!id) { this.notify('Atılabilir eşyan yok.'); return; }
    this.consume(id);
    const mat = id === 'bottle' ? this.world.mat.glassShine : this.world.mat.red;
    const mesh = new T.Mesh(new T.CylinderGeometry(.059, .066, .235, 8), mat);
    const f = this.camera.getWorldDirection(new T.Vector3()); mesh.position.copy(this.camera.position).addScaledVector(f, .34);
    this.world.scene.add(mesh); this.projectiles.push({ body: mesh, velocity: f.multiplyScalar(10.7).add(v3(0, 2.58, 0)), floor: this.floor, t: 0, loud: id === 'extinguisher' });
    this.notify(`${ITEMS[id].name} atıldı.`);
  }

  private updateProjectiles(dt: number) {
    this.projectiles = this.projectiles.filter(p => {
      p.t += dt; const before = p.body.position.clone(); p.velocity.y -= dt * 12.3; p.body.position.addScaledVector(p.velocity, dt); p.body.rotation.x += dt * 12;
      const { x, y, z } = p.body.position, ground = this.world.ground(x, z, y + .25);
      if (p.t > 2.3 || y < -7 || ground && y <= ground.y + .082 || this.world.moveBlocked(x, z, y, .3, .10)) {
        const dist = before.distanceTo(this.player);
        this.noise(p.loud ? 25 : 18, before, ground?.floor ?? p.floor); audio.cue(p.loud ? 'metal' : 'glass', Math.max(.26, 1 - dist / 27));
        this.world.scene.remove(p.body); p.body.geometry.dispose(); return false;
      }
      return true;
    });
  }

  private move(dt: number) {
    if (this.ride?.rider || this.hidden) { this.walkBlend *= 1 - dt * 8; return; }
    if (this.keys.has('ArrowLeft') && !Object.values(this.settings.keys).includes('ArrowLeft')) this.yaw += dt * 1.64;
    if (this.keys.has('ArrowRight') && !Object.values(this.settings.keys).includes('ArrowRight')) this.yaw -= dt * 1.64;
    if (this.keys.has('ArrowUp') && !Object.values(this.settings.keys).includes('ArrowUp')) this.pitch = cap(this.pitch + dt, -1.34, 1.34);
    if (this.keys.has('ArrowDown') && !Object.values(this.settings.keys).includes('ArrowDown')) this.pitch = cap(this.pitch - dt, -1.34, 1.34);
    const room = worldRoomAt(this.floor, this.player.x, this.player.z);
    const desired = this.settings.toggleCrouch ? this.crouchToggle : this.held('crouch');
    this.crouch = desired || this.crouch && this.world.moveBlocked(this.player.x, this.player.z, this.player.y, 1.75, .25);
    const forward = +this.held('forward') - +this.held('back'), side = +this.held('right') - +this.held('left');
    const moving = Boolean(forward || side);
    this.exhaustion = Math.max(0, this.exhaustion - dt);
    const sprint = (this.settings.toggleRun ? this.sprintToggle : this.held('sprint')) && moving && forward >= 0 && !this.crouch && this.swing <= 0 && this.stamina > 1 && this.exhaustion <= 0;
    const multiplier = bagUsed(this.p) >= 8 ? .958 : 1;
    const speed = (this.crouch ? 1.53 : sprint ? 5.3 : 3.28) * multiplier * (this.swing > .1 ? .67 : 1);
    const u = Math.hypot(forward, side) || 1;
    const dx = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side) / u * speed * dt;
    const dz = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side) / u * speed * dt;
    const height = this.crouch ? 1.08 : 1.75, x = this.player.x, z = this.player.z;
    if (!this.world.moveBlocked(x + dx, z, this.player.y, height) && this.world.ground(x + dx, z, this.player.y + .43)) this.player.x += dx;
    if (!this.world.moveBlocked(this.player.x, z + dz, this.player.y, height) && this.world.ground(this.player.x, z + dz, this.player.y + .43)) this.player.z += dz;
    const surface = this.world.ground(this.player.x, this.player.z, this.player.y + .44);
    if (surface) {
      if (this.airborne) {
        this.vSpeed -= dt * 11.5; this.player.y += this.vSpeed * dt;
        if (this.player.y <= surface.y && this.vSpeed <= 0) { this.player.y = surface.y; this.airborne = false; this.vSpeed = 0; audio.cue('concrete', .52); this.noise(5.5); }
      } else this.player.y = surface.y;
      this.floor = surface.floor;
    }
    const moved = Math.hypot(x - this.player.x, z - this.player.z) > .002;
    if (sprint && moved) { this.stamina = Math.max(0, this.stamina - dt * 16.1); if (this.stamina < 1) { this.exhaustion = 1.48; this.breathTime = 0; } }
    else this.stamina = Math.min(100, this.stamina + dt * (this.exhaustion > 0 ? 9 : 22));
    if (this.stamina < 27) { this.breathTime -= dt; if (this.breathTime <= 0) { this.breathTime = 1.25; audio.cue('breathe', .51); this.noise(2); } }
    if (moved && !this.airborne) {
      this.stepTime -= dt; this.headTime += dt * (sprint ? 12.9 : this.crouch ? 6 : 8.6);
      if (this.stepTime <= 0) {
        this.stepTime = sprint ? .292 : this.crouch ? .65 : .432;
        const hard = Boolean(surface?.stairs) || this.floor === -1;
        audio.cue(room === 'yard' || room === 'roof' ? 'wet' : hard ? 'concrete' : 'step', this.crouch ? .31 : sprint ? .86 : .62, Math.sin(this.headTime) * .17);
        this.noise((sprint ? 15.2 : this.crouch ? 1.95 : 5.25) * (hard ? 1.24 : 1));
      }
    }
    this.walkBlend = T.MathUtils.lerp(this.walkBlend, moved ? (sprint ? 1.45 : this.crouch ? .40 : .85) : 0, Math.min(1, dt * 8));
    const entered = worldRoomAt(this.floor, this.player.x, this.player.z);
    const key = `${this.floor}:${entered}`;
    if (entered && !this.p.explored.includes(key)) this.p.explored.push(key);
  }

  private harm(amount: number) {
    if (this.hurt > .3 || this.cinematic || this.ride?.rider) return;
    this.hurt = .90; this.health = Math.max(0, this.health - amount); this.action = null; audio.cue('hit');
    if (this.hidden) { this.player.copy(this.hidden.returnTo); this.hidden = null; }
    if (this.health === 0) this.open('dead');
    this.publish();
  }

  private updateCamera(dt: number) {
    const camera = this.camera, outside = this.isOutside();
    if (this.cinematic) {
      const t = this.cinematic, base = 4 * HEIGHT, h = this.world.heli.hull;
      const rise = smooth(cap((t - .75) / 4.5, 0, 1)), shift = smooth(cap((t - 2.1) / 3.65, 0, 1));
      h.position.set(12 * CELL + shift * 23, base + rise * 15, 9.2 * CELL - shift * 9.9); h.rotation.z = rise * .075 - shift * .173; h.rotation.y = shift * .16;
      const target = v3(12 * CELL + shift * 12.5, base + 5.6 + rise * 12, 9.2 * CELL + 11.8 + shift * 7); camera.position.copy(this.cineStart).lerp(target, smooth(cap(t * .7, 0, 1))); camera.lookAt(h.position.clone().add(v3(0, 1.45, 0)));
      this.view.visible = false; this.world.light.intensity = 0; return;
    }
    const bob = this.settings.motion ? this.walkBlend : 0;
    this.eyeHeight = T.MathUtils.lerp(this.eyeHeight, this.hidden ? 1.28 : this.crouch ? 1.035 : 1.64, dt ? Math.min(1, dt * 13) : 1);
    const oscillation = Math.sin(this.headTime);
    this.turnBob = bob * oscillation * .024;
    camera.position.set(this.player.x + Math.cos(this.yaw) * this.turnBob, this.player.y + this.eyeHeight + bob * Math.abs(Math.cos(this.headTime)) * .037, this.player.z - Math.sin(this.yaw) * this.turnBob);
    camera.rotation.set(this.pitch, this.yaw, -bob * oscillation * .007, 'YXZ');
    this.view.visible = !this.hidden;
    this.view.position.set(oscillation * bob * .019, Math.cos(this.headTime * 2) * bob * .014, 0);
    this.handLamp.visible = owns(this.p, 'lamp') && this.lamp;
    const selected = this.p.hotbar[this.p.selected]; const weapon = selected && WEAPONS[selected] && owns(this.p, selected) ? selected : null;
    this.handWeapon.visible = Boolean(weapon || this.swing > 0);
    for (const [id, g] of this.weapons) g.visible = id === weapon;
    const swing = this.swing > 0 ? Math.sin(cap(this.swing / (weapon === 'heavy' ? .84 : .51), 0, 1) * Math.PI) : 0;
    this.handWeapon.rotation.set(-.32 - swing * 1.12, -.12 + swing * .69, -.40 - swing * 1.15);
    this.handWeapon.position.x = .36 - swing * .57;
    this.world.light.position.copy(camera.position).add(v3(0, -.075, 0));
    const f = camera.getWorldDirection(new T.Vector3()); this.world.light.target.position.copy(camera.position).addScaledVector(f, 9);
    this.world.light.intensity = this.lamp && !this.hidden ? (this.settings.flashes && this.p.battery < 8 ? 29 + Math.sin(this.tick * 28) * 5 : outside ? 41 : 37) : 0;
  }

  private isOutside() { return this.floor === 4 && worldRoomAt(4, this.player.x, this.player.z) === 'roof' || this.floor === 0 && worldRoomAt(0, this.player.x, this.player.z) === 'yard' || this.cinematic > 0; }

  private update(dt: number) {
    if (this.cinematic) {
      this.cinematic += dt;
      this.world.heli.rotor.rotation.y += dt * 26; this.world.heli.tailRotor.rotation.z += dt * 42;
      if (this.cinematic >= 6 && !this.p.complete) { this.p.complete = true; this.checkpoint(); this.open('win'); audio.ambience(true, 0, 0, false); if (this.p.antenna) audio.voice('rescue', .66); }
      return;
    }
    this.tick += dt; this.p.elapsed += dt; this.hurt = Math.max(0, this.hurt - dt * 1.45); this.swing = Math.max(0, this.swing - dt);
    this.toastTimer -= dt; this.subtitleTimer -= dt;
    if (this.toastTimer <= 0) this.toast = null;
    if (this.subtitleTimer <= 0) this.subtitle = '';
    if (!this.announcement && this.tick > 29) { this.announcement = true; this.announce('[Anons] Karantina sürüyor. Personel, lütfen koridorları boşaltın.', 6.9, 'quarantine'); }
    this.updateLift(dt); this.move(dt); this.updateCamera(dt);
    if (this.lamp) {
      this.p.battery = Math.max(0, this.p.battery - dt * .19);
      if (!this.p.battery) { this.lamp = false; this.notify('El fenerinin pili bitti.', 'danger'); }
    }
    this.updateProjectiles(dt);
    this.enemies.update(dt, { position: this.player, eye: this.camera.position, floor: this.floor, direction: this.camera.getWorldDirection(new T.Vector3()), crouch: this.crouch, hiding: Boolean(this.hidden), flashlight: this.lamp, yaw: this.yaw }, amount => this.harm(amount), id => {
      const door = this.world.doors.get(id); if (!door) return;
      this.toggle(id, true); this.noise(17, v3(door.x, door.def.floor * HEIGHT, door.z), door.def.floor);
      if (door.def.floor === this.floor && Math.hypot(door.x - this.player.x, door.z - this.player.z) < 19) audio.cue('metal', .93);
    });
    if (this.action) {
      const o = this.world.objects.get('repair')!.group.position;
      if (Math.hypot(o.x - this.player.x, o.z - this.player.z) > 3.6) { this.action = null; this.notify('Onarım kesildi.'); }
      else {
        this.action.t += dt;
        if (this.action.t >= this.action.total) {
          const item = this.action.item; this.p.installed.push(item); this.action = null;
          this.checkpoint(); audio.cue('metal', .82); this.noise(24); this.notify(`${ITEMS[item].name} takıldı / ${this.p.installed.length}/5`, 'important');
        }
      }
    }
    if (this.rotor > 0) {
      this.rotor = Math.max(0, this.rotor - dt); this.rotorSpin = Math.min(1, this.rotorSpin + dt * .106);
      if (!this.rotor) { this.boarding = true; audio.cue('beacon'); this.notify('Kalkışa hazır. Kokpit kapısına ulaş!', 'important'); this.announce('Kalkış devri hazır. Şimdi binmeliyim.'); }
    }
    if (this.rotorSpin > 0) {
      this.world.heli.rotor.rotation.y += dt * (2 + this.rotorSpin * 25); this.world.heli.tailRotor.rotation.z += dt * (4 + this.rotorSpin * 40);
      if (Math.floor(this.tick * .85) !== Math.floor((this.tick - dt) * .85)) this.noise(41, this.world.objects.get('repair')!.group.position, 4);
    }
    this.focus = this.findFocus();
    audio.ambience(this.isOutside(), this.enemies.chased ? .84 : this.enemies.proximity * .44, this.rotorSpin);
  }

  private frame = (timestamp: number) => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.frame);
    const dt = this.lastFrame ? Math.min(.05, Math.max(.001, (timestamp - this.lastFrame) / 1000)) : .016;
    this.lastFrame = timestamp;
    if (this.panel && this.frozenRendered) return;
    if (!this.panel) this.update(dt);
    if (this.cinematic) this.updateCamera(dt);
    this.world.update(dt, this.tick, this.camera.position, this.floor, this.isOutside(), this.p.power, this.settings.flashes, this.settings.detail);
    this.renderer.render(this.world.scene, this.camera);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = .09; this.publish(); }
    if (this.panel) this.frozenRendered = true;
  };

  publish() {
    if (this.disposed) return;
    const room = worldRoomAt(this.floor, this.player.x, this.player.z);
    const objective = getObjective(this.p, this.rotor, this.boarding);
    const aim = this.settings.hints ? this.hint(objective.id, objective.floor) : null;
    this.callbacks.hud({ progress: copy(this.p), health: this.health, stamina: this.stamina, battery: this.p.battery, lamp: this.lamp,
      crouch: this.crouch, hidden: Boolean(this.hidden), location: room ? roomName(this.floor, room) : FLOOR_NAMES[this.floor], floor: this.floor,
      x: this.player.x, z: this.player.z, yaw: this.yaw, focus: this.focus ? { label: this.focus.label, verb: this.focus.verb, id: this.focus.id } : null,
      objective, aim, toast: this.toast, subtitle: this.subtitle, hurt: this.hurt, rotor: this.rotor, boarding: this.boarding, cinematic: Boolean(this.cinematic),
      action: this.action ? { title: this.action.title, percent: this.action.t / this.action.total } : null, capture: this.capture, liftBusy: Boolean(this.ride?.rider), switches: [...this.switches] });
  }

  private hint(id: string, floor: Floor): Hud['aim'] {
    let target = this.world.objects.get(id)?.group.position.clone();
    if (floor !== this.floor) {
      const stair = STAIRCASES.main;
      const inStair = worldRoomAt(this.floor, this.player.x, this.player.z) === 'main';
      if (inStair) return { x: .5, y: .27, direction: floor > this.floor ? '↑ ÜST KAT' : '↓ ALT KAT' };
      const [cx, cz] = cellAt(this.player.x, this.player.z);
      const path = this.world.path(this.floor, [cx, cz], [17, 10], false, true);
      const node = path[Math.min(path.length, 3) - 1];
      target = node ? v3((node[0] + .5) * CELL, this.floor * HEIGHT + 1.5, (node[1] + .5) * CELL) : v3(stair.x - .16, this.floor * HEIGHT + 1.75, stair.z + 4.5 * CELL);
    }
    if (!target) return null;
    const direction = target.clone().sub(this.camera.position);
    const f = this.camera.getWorldDirection(new T.Vector3());
    this.camera.updateMatrixWorld();
    const screen = target.project(this.camera);
    if (direction.dot(f) > 0 && Math.abs(screen.x) <= .91 && Math.abs(screen.y) <= .84) return { x: .5 + screen.x * .5, y: .5 - screen.y * .5, direction: floor !== this.floor ? 'MERDİVEN' : 'HEDEF' };
    const right = direction.x * Math.cos(this.yaw) - direction.z * Math.sin(this.yaw);
    return { x: right < 0 ? .065 : .935, y: .52, direction: right < 0 ? '‹ HEDEF' : 'HEDEF ›' };
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.animationId); this.resizeObserver.disconnect(); this.cleanups.forEach(f => f());
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.world.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
    audio.stopVoice(); audio.ambience(true, 0, 0, false);
  }
}