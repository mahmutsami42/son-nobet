import * as T from 'three';
import { Batch, box, floorGlow, helicopter, materials, pipe, seeded, sign, solid } from './art';
import { CELL, FLOOR_CODES, FLOORS, HEIGHT, ITEMS, type Floor, type Progress } from './data';
import { COLS, DOOR_EDGES, MAPS, PLACEMENTS, RAMP_START, ROWS, STAIRCASES, STAIRS_WIDTH, TURN, cellAt, cellNumber, center, edgeKey, roomName, worldRoomAt, type Cell, type DoorDef, type Placement, type Room, type StairId } from './layout';

const THICK = .135, OPENING = 1.57, CEILING = 2.96;
type Collider = { x: number; z: number; w: number; d: number; bottom: number; top: number; door?: string; step?: boolean };
export type Door = { def: DoorDef; pivot: T.Group; x: number; z: number; open: boolean; target: number; barricaded: number; board: T.Mesh | null };
export type WorldObject = { def: Placement; group: T.Group; phase: number };
export type Ground = { y: number; floor: Floor; stairs?: StairId; lift?: boolean };
type Lamp = { x: number; y: number; z: number; floor: Floor; tint: number; intensity: number; phase: number; power?: boolean };
const vec = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const upper = (s: string) => s.toLocaleUpperCase('tr');
const clamp = T.MathUtils.clamp;
const nearCells = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

export class World {
  readonly scene = new T.Scene();
  readonly mat = materials();
  readonly levels = new Map<Floor, T.Group>();
  readonly doors = new Map<string, Door>();
  readonly objects = new Map<string, WorldObject>();
  readonly heli = helicopter(this.mat);
  readonly lift = new T.Group();
  readonly liftPosition = { x: 13.52 * CELL, z: 12.43 * CELL, y: 0 };
  readonly light = new T.SpotLight(0xe4efce, 0, 22, .40, .52, 1.35);
  readonly exterior = new T.Group();
  private yardFacade = new T.Group();
  private colliders: Collider[] = [];
  private byCell = new Map<string, Collider[]>();
  private lamps: Lamp[] = [];
  private bulbs: T.PointLight[] = [];
  private powerIndicators: T.Mesh[] = [];
  private rain!: T.LineSegments;
  private rainData!: Float32Array;
  private reflections = { cold: floorGlow('rgba(111,196,177,.25)'), hot: floorGlow('rgba(177,60,40,.40)'), shadow: floorGlow('rgba(8,14,13,.51)') };
  private rot = seeded(7114);
  private skylight: T.DirectionalLight;
  private sky = new T.Color(0x162325);
  private insideSky = new T.Color(0x111a19);
  private ambientSky = this.insideSky.clone();
  private storm: T.Texture | null = null;
  private disposed = false;
  private safeFloors = new Set<Floor>([0, 1, 2, 3]);

  constructor(progress: Progress) {
    this.scene.background = this.ambientSky;
    new T.TextureLoader().load('/images/island-storm.jpg', texture => {
      if (this.disposed) { texture.dispose(); return; }
      texture.mapping = T.EquirectangularReflectionMapping; texture.colorSpace = T.SRGBColorSpace; this.storm = texture;
    }, undefined, () => {});
    this.scene.fog = new T.FogExp2(0x152121, .027);
    this.scene.add(new T.HemisphereLight(0xc0d5c7, 0x526261, 1.31));
    this.skylight = new T.DirectionalLight(0x9fc4d6, .47); this.skylight.position.set(-34, 22, -55); this.scene.add(this.skylight);
    this.scene.add(this.light, this.light.target, this.exterior);
    for (let i = 0; i < 4; i++) { const light = new T.PointLight(0xa8d5ca, 0, 14, 1.78); this.scene.add(light); this.bulbs.push(light); }
    for (const floor of FLOORS) this.buildFloor(floor, progress);
    this.buildLift(); this.buildExterior(); this.buildRain(); this.indexColliders();
  }

  private collider(x: number, bottom: number, z: number, w: number, h: number, d: number, door?: string, step = false) {
    this.colliders.push({ x, z, w, d, bottom, top: bottom + h, door, step });
  }

  private indexColliders() {
    for (const c of this.colliders) {
      const start = cellAt(c.x - c.w / 2 - .6, c.z - c.d / 2 - .6), end = cellAt(c.x + c.w / 2 + .6, c.z + c.d / 2 + .6);
      for (let x = start[0]; x <= end[0]; x++) for (let z = start[1]; z <= end[1]; z++) {
        const key = `${x},${z}`; const cells = this.byCell.get(key);
        if (cells) cells.push(c); else this.byCell.set(key, [c]);
      }
    }
  }

  private flushLights(level: Floor, b: Batch) {
    const ground = level * HEIGHT, m = this.mat;
    const points: [number, number, boolean?, boolean?][] = level === 4 ? [[19.2, 10.5, true], [6.7, 4.65], [11.5, 10.6, true], [14.8, 8.7]] : [
      [10.5, 13.85, level === -1], [12.7, 10.25], [6.65, 10.5], [16.6, 10.35, level !== 1], [19.55, 9.7, true], [2.5, 9.67],
      [8.9, 3.25], [15.65, 3.3], [4.8, 6.6], [15.65, 7.55], [12.65, 6.8, level === -1, level === -1], [4.9, 13.75, level === 3],
      [18.5, 13.5, level === 0], [19.25, 2.8], [2.4, 2.6], [7.95, 6.4], [11.55, .7],
    ];
    if (level === 0) points.push([18.5, 17.2], [13.5, 19.8, true], [4.5, 18.52], [9.3, 12.57]);
    points.forEach(([i, j, red, power], index) => {
      const x = i * CELL, z = j * CELL, outside = level === 4 || j > 16;
      const y = ground + (outside ? (level === 4 ? .53 : 3.9) : 2.84);
      if (outside) {
        b.box(x, ground + (j > 16 ? 1.9 : .22), z, .10, j > 16 ? 3.8 : .46, .10, m.metal);
        b.box(x, y, z, .45, .12, .22, m.dark);
        b.box(x, y + .035, z, .33, .10, .14, red ? m.hot : m.cold);
      } else {
        b.box(x, y + .075, z, 1.46, .082, .346, m.dark);
        b.box(x, y + .022, z, 1.26, .064, .255, m.trim);
        for (const d of [-.067, .067]) b.box(x, y - .01, z + d, 1.17, .036, .043, power ? m.dim : red ? m.hot : (index === 15 ? m.dim : m.cold));
      }
      this.lamps.push({ x, y: outside ? y + .37 : y - .315, z, floor: level, tint: red ? 0xde6f4e : 0xb0e2d1, intensity: red ? 13 : (index === 0 ? 22 : 18), phase: index * 1.53 + level * 2.93, power });
      this.decal(b.group, x, ground + .012, z, outside ? 3.7 : 3.15, outside ? 4.8 : 5.6, red ? 'hot' : 'cold');
    });
  }

  private decal(group: T.Group, x: number, y: number, z: number, w: number, d: number, kind: keyof World['reflections']) {
    const mesh = new T.Mesh(new T.PlaneGeometry(w, d), this.reflections[kind]); mesh.position.set(x, y, z); mesh.rotation.x = -Math.PI / 2; group.add(mesh);
  }

  private buildFloor(level: Floor, progress: Progress) {
    const group = new T.Group(); group.name = `floor-${level}`; this.levels.set(level, group); this.scene.add(group);
    const b = new Batch(group), m = this.mat, y = level * HEIGHT;
    const edges = new Set<string>();
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const room = MAPS[level][j][i]; if (!room) continue;
      const x = (i + .5) * CELL, z = (j + .5) * CELL;
      const outdoor = room === 'yard' || room === 'roof';
      const stair = room === 'main' || room === 'service';
      if ((!stair || j === 10) && room !== 'lift') {
        b.box(x, y - .135, z, CELL + .004, .27, CELL + .004, outdoor ? (room === 'yard' && i > 13 && i < 20 ? m.road : m.ground) : level === -1 ? m.darkFloor : m.floor);
        if (!outdoor && !stair) {
          b.box(x, y + CEILING + .06, z, CELL + .002, .15, CELL + .002, m.ceiling);
          if (room === 'hall' && j === 10) {
            b.box(x, y + .005, z + .72, CELL + .001, .008, .029, level === -1 ? m.red : m.letter);
            if (i % 3 === 0) b.box(x, y + 2.907, z + .83, CELL + .005, .125, .28, m.trim);
          }
          if (room === 'hall' && this.rot() < .18) {
            const px = x + (this.rot() - .5) * 1.4, pz = z + (this.rot() - .5) * 1.15;
            b.box(px, y + .014, pz, .20, .009, .28, m.paper, this.rot() * 4);
            b.box(px + .11, y + .012, pz - .14, .25, .009, .16, m.rubber, this.rot() * 5);
          }
        }
      }
      for (const [di, dj] of nearCells) {
        const a = [i, j] as const, next = [i + di, j + dj] as const;
        const wallKey = `${i * 2 + di},${j * 2 + dj}`;
        if (edges.has(wallKey)) continue;
        const neighbor = MAPS[level][next[1]]?.[next[0]];
        if (neighbor === room) continue;
        edges.add(wallKey);
        const door = DOOR_EDGES[level].get(edgeKey(a, next));
        const xc = x + di * CELL * .5, zc = z + dj * CELL * .5, xEdge = di !== 0;
        if (outdoor && !neighbor) {
          this.buildBoundary(b, room, xc, y, zc, xEdge, i, j); continue;
        }
        const h = stair || neighbor === 'main' || neighbor === 'service' || neighbor === 'lift' || room === 'lift' ? (level === 4 ? 3.1 : 4.02) : CEILING + .19;
        this.wall(b, level, xc, zc, xEdge, h, door, progress);
      }
    }
    for (const stair of Object.values(STAIRCASES)) if (level >= stair.first && level <= stair.last) this.buildStair(b, level, stair.id);
    this.furnish(b, level);
    this.flushLights(level, b);
    for (const def of PLACEMENTS.filter(o => o.level === level)) {
      if (def.limited === 'more' && progress.difficulty !== 'story' || def.limited === 'normal' && progress.difficulty === 'night') continue;
      this.makeObject(b, def, progress);
    }
    b.flush();
  }

  private buildBoundary(b: Batch, room: Room, x: number, y: number, z: number, xEdge: boolean, i: number, j: number) {
    const m = this.mat, w = xEdge ? .15 : CELL + .09, d = xEdge ? CELL + .09 : .15;
    if (room === 'roof') {
      b.box(x, y + .50, z, w, 1.0, d, m.bWall);
      b.box(x, y + 1.006, z, w + .11, .105, d + .11, m.trim);
      this.collider(x, y, z, w, 2.3, d);
    } else {
      b.box(x, y + .16, z, w, .32, d, m.bWall);
      for (const hh of [.38, 2.2]) b.box(x, y + hh, z, xEdge ? .045 : CELL, .043, xEdge ? CELL : .045, m.steel);
      for (let n = 0; n < 10; n++) {
        const off = -CELL / 2 + n * CELL / 10;
        b.box(x + (xEdge ? 0 : off), y + 1.25, z + (xEdge ? off : 0), n ? .026 : .076, n ? 1.85 : 2.53, n ? .026 : .076, n ? m.trim : m.dark);
      }
      if ((i === 15 && j === 22) || (i === 21 && j === 20)) {
        const badge = sign(2.0, .53, 'KARANTİNA', 'KIYI YOLU KAPALI', '#f0c0ac', '#612e29');
        badge.position.set(x - (xEdge ? .13 : 0), y + 1.72, z - (xEdge ? 0 : .13)); badge.rotation.y = xEdge ? -Math.PI / 2 : Math.PI; b.group.add(badge);
      }
      this.collider(x, y, z, w, 2.6, d);
    }
  }

  private wall(b: Batch, level: Floor, x: number, z: number, xEdge: boolean, height: number, door: DoorDef | undefined, progress: Progress) {
    const m = this.mat, y = level * HEIGHT, group = b.group;
    const block = (off: number, cy: number, wide: number, tall: number, depth: number, mat: T.Material) => b.box(x + (xEdge ? 0 : off), y + cy, z + (xEdge ? off : 0), xEdge ? depth : wide, tall, xEdge ? wide : depth, mat);
    const wallPart = (off: number, width: number) => {
      block(off, .575, width, 1.15, THICK, level === -1 ? m.bWall : m.tile);
      block(off, (height + 1.15) * .5, width, height - 1.15, THICK, level === -1 ? m.bWall : m.wall);
      block(off, .065, width, .13, THICK + .028, m.rubber);
      block(off, 1.158, width, .056, THICK + .029, m.trim);
      this.collider(x + (xEdge ? 0 : off), y, z + (xEdge ? off : 0), xEdge ? THICK : width, height, xEdge ? width : THICK);
    };
    if (!door) { wallPart(0, CELL + .005); return; }
    const gap = door.crawl ? 1.05 : OPENING, h = door.crawl ? 1.23 : 2.24, jamb = (CELL - gap) * .5;
    for (const s of [-1, 1]) {
      wallPart(s * (gap + jamb) * .5, jamb + .004);
      block(s * gap * .5, h * .5, .091, h, .219, m.dark);
    }
    block(0, (height + h) * .5, gap + .01, height - h, THICK, level === -1 ? m.bWall : m.wall);
    block(0, h, gap + .09, .10, .205, m.dark);
    this.collider(x, y + h, z, xEdge ? THICK : gap, height - h, xEdge ? gap : THICK);

    const opposite = MAPS[level][door.b[1]]?.[door.b[0]], aRoom = MAPS[level][door.a[1]]?.[door.a[0]];
    const prev = (xEdge ? door.a[0] < door.b[0] : door.a[1] < door.b[1]) ? -1 : 1;
    const title = door.crawl ? 'SERVİS GEÇİDİ' : door.lift ? 'ASANSÖR' : level === 4 ? 'ANA MERDİVEN' : upper(roomName(level, opposite ?? 'hall'));
    const sub = door.lock === 'blue' ? '■ PERSONEL ERİŞİMİ' : door.lock === 'red' ? '▲ LAB / YEDEK GÜÇ' : door.lock === 'roofkey' ? 'BAKIM ANAHTARI' : door.lock === 'crowbar' ? 'SIKIŞMIŞ MANDAL' : door.crawl ? 'ÇÖMELEREK GEÇ' : door.lift ? `${FLOOR_CODES[level]} / YEDEK ŞEBEKE` : door.id.endsWith(':main') ? `${FLOOR_CODES[level]} / KATLAR` : undefined;
    for (const side of [-1, 1]) {
      const front = side === prev;
      const name = front || door.lift || door.crawl ? title : level === 4 ? 'ÇATI PİSTİ' : door.id.endsWith(':main') || door.id.endsWith(':service') ? `${FLOOR_CODES[level]}  /  KAT ÇIKIŞI` : aRoom === 'yard' ? 'AVLU ÇIKIŞI' : '← KORİDOR';
      const showSub = front || level === 4 ? sub : undefined;
      const plaque = sign(door.crawl ? 1.15 : 1.95, showSub ? .46 : .31, name, showSub, door.lock === 'red' || level === 4 ? '#f0c0ac' : '#d0ded2', door.lock === 'red' ? '#5d302c' : '#243a38');
      plaque.position.set(x + (xEdge ? .103 * side : 0), y + h + (door.crawl ? .22 : .30), z + (xEdge ? 0 : .103 * side));
      plaque.rotation.y = xEdge ? side * Math.PI / 2 : side < 0 ? Math.PI : 0;
      group.add(plaque);
    }
    if (door.crawl) {
      for (const k of [-.46, .46]) block(k, h * .5, .052, h, .28, m.steel);
      if (door.glass) {
        const pane = new T.Group(); pane.position.set(x, y, z); pane.rotation.y = xEdge ? Math.PI / 2 : 0; group.add(pane);
        const opaque = new T.MeshStandardMaterial({ color: 0x577773, transparent: true, opacity: .62, roughness: .36, metalness: .18, depthWrite: false });
        box(pane, 0, .605, 0, .91, 1.15, .031, opaque);
        box(pane, 0, .478, .028, .914, .052, .034, m.trim);
        const vertices = [
          -.44, .92, 0, -.16, .73, 0, -.16, .73, 0, .064, .832, 0, .064, .832, 0, .229, .678, 0, .229, .678, 0, .428, .69, 0,
          -.16, .73, 0, -.23, .63, 0, -.23, .63, 0, -.132, .49, 0, -.132, .49, 0, -.256, .31, 0, .064, .832, 0, .092, 1.163, 0,
          .064, .832, 0, -.038, .639, 0, -.038, .639, 0, .098, .426, 0, .098, .426, 0, .19, .184, 0, .19, .184, 0, .103, .05, 0,
        ];
        const cracks = new T.BufferGeometry(); cracks.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
        for (const s of [-1, 1]) { const lines = new T.LineSegments(cracks, new T.LineBasicMaterial({ color: 0x9fbbb3, transparent: true, opacity: .62 })); lines.position.z = s * .022; pane.add(lines); }
        const open = progress.doors[door.id] ?? false; pane.visible = !open;
        this.doors.set(door.id, { def: door, pivot: pane, x, z, open, target: 0, barricaded: 0, board: null });
        this.collider(x, y, z, xEdge ? .079 : gap, h, xEdge ? gap : .079, door.id);
      }
      return;
    }
    const frame = new T.Group(); frame.position.set(x, y, z); frame.rotation.y = xEdge ? Math.PI / 2 : 0; group.add(frame);
    const pivot = new T.Group(); pivot.position.x = -gap * .48; frame.add(pivot);
    const panel = door.lock === 'red' || door.lock === 'roofkey' ? m.red : door.lift ? m.heavyDoor : m.door;
    box(pivot, gap * .48, 1.103, 0, gap * .95, 2.18, .082, panel);
    if (door.lift) {
      box(pivot, gap * .48, 1.09, .052, .020, 2.13, .025, m.dark);
      box(pivot, gap * .48, 1.63, .053, .28, .145, .023, m.rubber);
    } else {
      box(pivot, .54, 1.574, .005, .43, .68, .098, m.dark);
      box(pivot, .54, 1.574, .019, .36, .594, .088, m.glass);
      for (const s of [-1, 1]) {
        box(pivot, .412, 1.574, s * .069, .024, .57, .016, m.glassShine);
        box(pivot, gap * .805, 1.023, s * .07, .17, .055, .063, m.steel);
        box(pivot, gap * .38, .267, s * .046, 1.0, .22, .024, m.trim);
      }
    }
    if (door.lock || door.lift) for (const s of [-1, 1]) {
      box(frame, .96, 1.46, s * .09, .175, .31, .088, m.dark);
      box(frame, .96, 1.53, s * .141, .087, .042, .016, door.lift && progress.power ? m.green : m.hot);
    }
    let barricade: T.Mesh | null = null;
    if (door.weak) { barricade = box(frame, 0, 1.04, .105, gap + .34, .147, .08, m.wood); barricade.rotation.z = -.055; barricade.visible = false; }
    const opened = door.lift ? false : (progress.doors[door.id] ?? door.opens ?? false);
    const record = { def: door, pivot, x, z, open: opened, target: opened ? prev * 1.55 : 0, barricaded: 0, board: barricade };
    pivot.rotation.y = record.target;
    this.doors.set(door.id, record);
    this.collider(x, y, z, xEdge ? .125 : gap, 2.23, xEdge ? gap : .125, door.id);
  }

  private buildStair(b: Batch, level: Floor, id: StairId) {
    const m = this.mat, stair = STAIRCASES[id], x = stair.x, z = stair.z, y = level * HEIGHT, mid = x + STAIRS_WIDTH * .5;
    const route = (a: T.Vector3, c: T.Vector3, r = .027) => pipe(b.group, a, c, r, m.steel, 6);
    b.box(mid, y + 3.98, z + 4.5 * CELL, STAIRS_WIDTH, .13, CELL, m.ceiling);
    if (level === stair.last) b.box(mid, y + 3.14, z + CELL * 2.5, STAIRS_WIDTH + THICK, .26, CELL * 5, m.ceiling);
    const plaque = sign(2.02, .67, level === 4 ? 'ÇATI' : FLOOR_CODES[level], id === 'main' ? 'ANA MERDİVEN' : 'SERVİS MERDİVENİ');
    plaque.position.set(mid, y + 2.00, z + 5 * CELL - .086); plaque.rotation.y = Math.PI; b.group.add(plaque);
    const near = z + RAMP_START, turn = z + TURN, run = near - turn, lane = STAIRS_WIDTH * .5;
    const left = x + lane * .5, right = x + lane * 1.5;
    for (const [px, label] of [[left, level !== stair.last ? '↑  ÜST KATLAR' : 'ÇIKIŞ SOLDA'], [right, level !== stair.first ? '↓  ALT KATLAR' : 'B1 / SON KAT']] as const) {
      const plate = sign(1.46, .30, label); plate.position.set(px, y + 2.47, near + .03); b.group.add(plate);
    }
    if (level === stair.first || level === stair.last) {
      const which = level === stair.first ? right : left;
      b.box(which, y + .5, near + .03, lane - .02, 1.0, .067, m.bWall);
      b.box(which, y + 1, near + .03, lane + .05, .08, .09, m.metal);
      this.collider(which, y, near + .03, lane, 2, .076);
    }
    if (level >= stair.last) return;
    b.box(mid, y + HEIGHT * .5 - .14, z + TURN / 2, STAIRS_WIDTH - .02, .28, TURN + .02, m.bWall);
    b.box(mid, y + 2.4, (near + turn) * .5, .113, 4.13, run - .11, m.rubber);
    this.collider(mid, y, (near + turn) * .5, .14, 4.58, run - .10);
    const steps = 12, d = run / steps, h = (HEIGHT * .5) / steps;
    for (let i = 0; i < steps; i++) {
      const qz = near - (i + .5) * d;
      b.box(left, y + (i + 1) * h - .17, qz, lane - .08, .34, d + .007, m.bWall);
      b.box(left, y + (i + 1) * h + .012, qz + d * .43, lane - .10, .027, .059, i % 4 === 0 ? m.yellow : m.trim);
      b.box(right, y + HEIGHT - i * h - .17, qz, lane - .08, .34, d + .007, m.bWall);
      b.box(right, y + HEIGHT - i * h + .012, qz - d * .43, lane - .10, .027, .059, i % 4 === 0 ? m.yellow : m.trim);
    }
    for (const [px, h1, h2] of [[x + .22, y + .92, y + 2.92], [x + STAIRS_WIDTH - .22, y + 4.92, y + 2.92]]) {
      route(vec(px, h1, near), vec(px, h2, turn), .035);
      for (let j = 0; j <= 4; j++) { const f = j * .25; const sy = T.MathUtils.lerp(h1, h2, f); route(vec(px, sy - .93, near - run * f), vec(px, sy, near - run * f), .025); }
    }
  }

  private furnish(b: Batch, level: Floor) {
    const m = this.mat, y = level * HEIGHT, B = (x: number, z: number, h: number, w: number, t: number, d: number, material: T.Material, angle = 0) => b.box(x * CELL, y + h, z * CELL, w, t, d, material, angle);
    const shelving = (x: number, z: number, wide = 2.2) => {
      for (let i = 0; i < 4; i++) {
        const h = .18 + i * .54; B(x, z, h, wide, .074, .49, m.metal);
        for (let k = 0; k < 5; k++) if (this.rot() > .24) B(x + (k - 2) * .15, z, h + .164, .21 + this.rot() * .16, .25, .29, k % 3 ? m.paper : m.trim, (this.rot() - .5) * .2);
      }
      for (const dx of [-wide * .48, wide * .48]) for (const dz of [-.19, .19]) b.box(x * CELL + dx, y + 1.0, z * CELL + dz, .065, 2, .065, m.dark);
      this.collider(x * CELL, y, z * CELL, wide, 2, .52);
    };
    const bed = (x: number, z: number, angle = 0) => {
      for (const [h, w, t, d, material] of [[.49, .98, .10, 2.12, m.steel], [.64, .94, .22, 1.98, m.linen], [.72, .89, .045, 1.47, m.sheet], [.29, .62, .10, 1.69, m.metal]] as const) B(x, z, h, w, t, d, material, angle);
      for (const d of [-1, 1]) {
        const side = angle ? [d * .407, 0] : [0, d * .407];
        B(x + side[0], z + side[1], .67, angle ? .10 : 1.06, .34, angle ? 1.06 : .10, m.trim);
        for (const s of [-1, 1]) B(x + (angle ? side[0] : .16 * s), z + (angle ? .16 * s : side[1]), .135, .12, .24, .251, m.rubber);
      }
      B(x + (angle ? -.279 : 0), z + (angle ? 0 : -.279), .782, angle ? .35 : .65, .115, angle ? .65 : .35, m.sheet);
      this.collider(x * CELL, y, z * CELL, angle ? 2.13 : 1.0, .77, angle ? 1.0 : 2.13, undefined, true);
      this.decal(b.group, x * CELL, y + .015, z * CELL, angle ? 2.52 : 1.4, angle ? 1.4 : 2.52, 'shadow');
    };
    const bench = (x: number, z: number, angle = 0) => {
      B(x, z, .49, 2.05, .091, .51, m.linen, angle); B(x, z, .265, 1.89, .11, .36, m.trim, angle);
      B(x + (angle ? .093 : 0), z + (angle ? 0 : -.093), .78, 2.02, .48, .073, m.door, angle);
      for (const q of [-1, 1]) B(x + (angle ? 0 : q * .37), z + (angle ? q * .37 : 0), .24, .092, .47, .42, m.trim, angle);
      this.collider(x * CELL, y, z * CELL, angle ? .55 : 2.05, .99, angle ? 2.05 : .58, undefined, true);
    };
    const curtain = (x: number, z: number, len: number) => {
      B(x, z, 2.62, len + .27, .041, .067, m.steel);
      const shape = new T.PlaneGeometry(len, 1.99, 70, 9), points = shape.getAttribute('position');
      const shades = new Float32Array(points.count * 3);
      for (let i = 0; i < points.count; i++) {
        const u = points.getX(i) / len + .5, v = points.getY(i) / 1.99 + .5;
        const fold = Math.sin(u * 62 + Math.sin(u * 12) * .29 + v * .34);
        points.setXYZ(i, points.getX(i) + .021 * (1 - v) * Math.sin(u * 19 + v * 12), points.getY(i) + .038 * (1 - v) ** 5 * Math.sin(u * 37), fold * (.04 + .029 * (1 - v)) + .028 * Math.sin(u * 4 + v));
        const dye = .8 + .12 * fold + .07 * Math.sin(u * 13 + v * 2);
        shades.set([dye * .94, dye, dye * .976], i * 3);
      }
      shape.setAttribute('color', new T.BufferAttribute(shades, 3)); shape.computeVertexNormals();
      const fabric = m.linen.clone(); fabric.side = T.DoubleSide; fabric.vertexColors = true;
      const drape = new T.Mesh(shape, fabric); drape.position.set(x * CELL, y + 1.59, z * CELL); b.group.add(drape);
      this.collider(x * CELL, y + .58, z * CELL, len, 2, .11);
    };
    const plaque = (x: number, z: number, h: number, w: number, title: string, sub: string, rot = 0) => {
      const s = sign(w, .57, title, sub, '#dbe1ca', '#30443f'); s.position.set(x * CELL, y + h, z * CELL); s.rotation.y = rot; b.group.add(s);
    };
    if (level === 4) {
      this.heli.hull.position.set(12 * CELL, y, 9.20 * CELL); b.group.add(this.heli.hull);
      this.collider(12.1 * CELL, y, 9.20 * CELL, 6.2, 2.65, 2.77);
      this.collider(10.0 * CELL, y + 1.4, 9.20 * CELL, 5.3, 1.1, .65);
      const ring = new T.Mesh(new T.RingGeometry(6.75, 6.87, 56), m.yellow); ring.rotation.x = -Math.PI / 2; ring.position.set(12 * CELL, y + .021, 9.20 * CELL); b.group.add(ring);
      B(11.45, 9.2, .013, .21, .02, 3.72, m.letter); B(12.55, 9.2, .013, .21, .02, 3.72, m.letter); B(12, 9.2, .014, 2.63, .025, .24, m.letter);
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
        B(12 + dx * 3.3, 9.2 + dz * 3.15, .022, 1.18, .035, .105, m.yellow);
        B(12 + dx * 3.53, 9.2 + dz * 2.94, .022, .10, .035, 1.1, m.yellow);
      }
      for (const [x, z] of [[16.75, 8.4], [15.92, 5.4], [8.15, 12.9], [8.85, 13.9], [18, 13.0], [16.12, 11.8], [7.85, 6.35]]) {
        B(x, z, .62, 2, 1.24, 1.45, m.metal); B(x, z, 1.22, 2.12, .09, 1.54, m.trim);
        for (let i = 0; i < 12; i++) B(x + (i - 5.5) * .058, z + .307, .74, .074, .54, .04, m.dark);
        this.collider(x * CELL, y, z * CELL, 2, 1.25, 1.45);
      }
      for (const [x, z] of [[6.0, 4.2], [20.1, 3.5]]) {
        for (let i = 0; i < 3; i++) B(x, z, 1.1 + i * .95, i === 0 ? .14 : 1.35, i === 0 ? 3.0 : .06, .085, i === 2 ? m.hot : m.steel);
      }
      return;
    }
    for (const [x, z, wide] of [[1.65, 13.1, 2.28], [3.1, 15.6, 2.53], [6.92, 15.61, 2.35], [18.68, 4.65, 2.65], [20.65, 3.65, 2.07], [14.44, 4.3, 2.37], [10.7, 8.72, 2.17], [6.67, 4.37, 2.15], [11.7, .27, 2.8], [17.18, 15.64, 2.72]]) shelving(x, z, wide);
    for (const [x, z, angle] of [[5.01, 11.68, 0], [9.09, 10.1, 0], [14.7, 11.64, 0], [15.28, 5.88, Math.PI * .5], [6.69, 2.21, 0], [10.8, 3.79, 0]]) bench(x, z, angle);
    for (const [x, z, v] of [[16.52, 10.08, '←  ACİL / SERVİSLER'], [7.8, 10.07, 'ANA MERDİVEN  →'], [5.55, 2.10, 'KAT PLANI  /  DOĞU']] as const) plaque(x, z, 2.35, 2.53, v, `${FLOOR_CODES[level]} / ${upper(roomName(level, 'hall'))}`);
    for (const x of [5.35, 9.40, 14.12, 16.76]) {
      B(x, 10.06, 1.37, .19, .65, .18, m.red);
      B(x, 10.08, 1.74, .095, .13, .105, m.dark);
      B(x + .19, 10.05, 1.7, .43, .74, .057, m.white);
      B(x + .19, 10.07, 1.85, .14, .077, .014, m.red);
    }
    if (level >= 0 && level <= 2) {
      bed(2.2, 1.88); bed(3.68, 2.25); bed(8.82, 5.67, Math.PI / 2); bed(7.12, 8.54, Math.PI / 2);
      bed(20.75, 1.97); curtain(19.65, 2.65, 2.45); curtain(7.42, 6.8, 2.11);
    }
    if (level === 0) {
      bed(8.62, 13.65); bed(11.68, 14.65); curtain(9.04, 13.14, 1.50);
      plaque(10.5, 12.044, 2.61, 2.22, 'ACİL SERVİS', 'ZEMİN KAT  /  KORİDOR', 0);
      plaque(10.54, 10.068, 2.00, 2.92, 'ANA MERDİVEN  →', '01 SERVİSLER  /  02 ARŞİV  /  03 BAKIM');
      plaque(9.13, 12.047, 2.03, .98, 'TRİYAJ', 'ACİL / 01', 0);
      plaque(11.4, 15.953, 2.06, 2.15, 'KARANTİNA', 'HASTANEYİ TERK ETMEYİN', Math.PI);
      B(11.78, 12.033, 1.755, 2.42, 1.21, .112, m.dark);
      B(11.78, 12.064, 1.755, 2.26, 1.05, .076, m.glass);
      for (const k of [-1, 1]) B(11.78 + k * .156, 12.089, 1.755, .053, 1.06, .036, m.trim);
      B(11.78, 12.101, 1.374, 2.37, .041, .081, m.steel);
      B(11.32, 12.114, 2.056, .48, .026, .008, m.glassShine, -.071);
      B(11.04, 12.073, 2.51, .298, .129, .116, m.red); B(11.04, 12.107, 2.51, .20, .061, .088, m.hot);
      this.wheelchair(b.group, 12.03 * CELL, y, 12.9 * CELL);
      B(10.5, 15.56, 2.64, 3.6, .09, .18, m.red);
      B(20.2, 13.43, .69, 2.02, 1.37, 3.88, m.white); B(20.2, 13.85, 1.47, 2.01, .54, 2.13, m.glass); B(20.2, 13.08, 1.42, 1.99, .63, 1.17, m.white);
      B(20.2, 12.90, 1.784, .96, .13, .20, m.hot); B(20.2, 14.28, .56, 1.95, .36, .33, m.red);
      for (const k of [-.4, .4]) for (const j of [-.51, .51]) B(20.2 + k, 13.44 + j, .31, .23, .57, .52, m.rubber);
      this.collider(20.2 * CELL, y, 13.43 * CELL, 2.05, 1.8, 3.88);
      for (const [x, z, w, d] of [[6.1, 18.8, 4.7, 3.2], [10.3, 20.4, 4.4, 3.9], [3.3, 17.7, 2.4, 2.2]]) {
        B(x, z, 1.27, w, 2.54, d, m.bWall); B(x, z, 2.61, w + .22, .25, d + .35, m.metal); this.collider(x * CELL, y, z * CELL, w, 2.54, d);
      }
      plaque(6.1, 18.105, 1.84, 2.29, 'JENERATÖR', 'DIŞ SERVİS KULÜBESİ', Math.PI);
      plaque(10.3, 19.58, 1.84, 2.29, 'YÜKLEME', 'KABUL ALANI', Math.PI);
      for (const i of [13.8, 14.8, 15.8, 16.8]) { B(i, 20.8, .018, .055, .018, 4.3, m.yellow); B(i + .5, 21.70, .113, 1.46, .21, .22, m.bWall); }
      for (const [x, z] of [[12.68, 17.8], [8.21, 17.2], [5.40, 21.48]]) {
        B(x, z, .238, 2.15, .47, .44, m.bWall); B(x, z, .477, 2.21, .09, .52, m.trim);
        this.collider(x * CELL, y, z * CELL, 2.2, .47, .54, undefined, true);
      }
    }
    if (level === -1) {
      for (const x of [6.5, 7.24, 7.98, 8.72]) {
        B(x, 4.39, .47, 1.31, .94, 1.12, m.white); B(x, 4.64, .49, .68, .61, .16, m.glass); this.collider(x * CELL, y, 4.39 * CELL, 1.32, .95, 1.15);
      }
      B(8.82, 14.86, .74, 2.05, 1.48, 1.52, m.heavyDoor); B(8.82, 15.22, .91, 1.78, .30, .10, m.dark);
      for (const z of [14.06, 14.38, 14.69]) B(9.15, z, 2.719, .10, .121, .79, m.trim);
      this.collider(8.82 * CELL, y, 14.86 * CELL, 2.05, 1.48, 1.52);
    }
  }

  private wheelchair(parent: T.Group, x: number, y: number, z: number) {
    const m = this.mat, chair = new T.Group(); chair.position.set(x, y, z); chair.rotation.y = -.41; parent.add(chair);
    box(chair, 0, .56, -.13, .53, .087, .55, m.dark);
    box(chair, 0, .81, -.36, .51, .51, .048, m.rubber).rotation.x = -.12;
    for (const side of [-1, 1]) {
      const px = side * .355;
      for (const [r, tube, mat] of [[.341, .023, m.rubber], [.309, .011, m.steel], [.245, .009, m.trim]] as const) {
        const wheel = new T.Mesh(new T.TorusGeometry(r, tube, 7, 26), mat); wheel.rotation.y = Math.PI * .5; wheel.position.set(px, .364, -.26); chair.add(wheel);
      }
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI / 5, s = Math.sin(a) * .30, c = Math.cos(a) * .30;
        pipe(chair, vec(px, .364 - s, -.26 - c), vec(px, .364 + s, -.26 + c), .005, m.steel, 4);
      }
      const small = new T.Mesh(new T.TorusGeometry(.102, .019, 7, 18), m.rubber); small.rotation.y = Math.PI * .5; small.position.set(px * .81, .119, .275); chair.add(small);
      const sx = side * .27;
      pipe(chair, vec(sx, .24, .29), vec(sx, .89, -.353), .018, m.steel);
      pipe(chair, vec(sx, .32, -.28), vec(sx, .57, .155), .018, m.steel);
      pipe(chair, vec(sx, .55, .15), vec(sx, .78, .09), .018, m.steel);
      pipe(chair, vec(sx, .45, -.36), vec(sx, 1.12, -.40), .017, m.steel);
      box(chair, sx, 1.118, -.45, .044, .044, .145, m.rubber);
      box(chair, sx, .764, -.04, .056, .039, .34, m.rubber);
      box(chair, px * .54, .187, .425, .151, .024, .15, m.metal);
    }
    this.collider(x, y, z, .82, 1.12, .90);
    this.decal(parent, x, y + .018, z, 1.15, 1.4, 'shadow');
  }

  private makeObject(b: Batch, def: Placement, progress: Progress) {
    const m = this.mat, y = def.level * HEIGHT, { x, z } = def, h = def.height ?? 1.06;
    const objects = new T.Group(); objects.position.set(x, y + h, z); b.group.add(objects);
    const B = (dx: number, dy: number, dz: number, w: number, t: number, d: number, mat: T.Material) => box(objects, dx, dy, dz, w, t, d, mat);
    const table = (w: number, d: number, height: number) => {
      b.box(x, y + height - .04, z, w, .083, d, m.trim);
      b.box(x, y + height * .26, z, w * .84, .064, d * .82, m.dark);
      for (const dx of [-w * .43, w * .43]) for (const dz of [-d * .39, d * .39]) {
        b.box(x + dx, y + .5 * height, z + dz, .044, height, .044, m.steel);
        b.box(x + dx, y + .068, z + dz, .103, .125, .096, m.rubber);
      }
      this.collider(x, y, z, w, height, d, undefined, true);
      this.decal(b.group, x, y + .014, z, w * 1.5, d * 1.63, 'shadow');
    };
    if (def.type === 'starter') {
      table(1.54, .91, .966);
      B(0, .02, 0, .63, .24, .39, m.rubber); B(0, .084, 0, .58, .155, .37, m.linen); B(-.09, .173, 0, .181, .065, .047, m.dark);
      for (const s of [-1, 1]) B(s * .173, .169, .02, .035, .018, .307, m.trim);
      B(0, .15, .20, .14, .063, .013, m.white); B(0, .15, .209, .098, .021, .012, m.red); B(0, .15, .209, .029, .061, .013, m.red);
    } else if (def.type === 'pick' && def.item) {
      const item = def.item, d = ITEMS[item];
      table(item === 'module' ? 1.65 : item === 'fuel' ? .82 : .96, item === 'module' ? 1.15 : .67, h - .058);
      const mat = solid(d.color, .49, .19);
      if (d.kind === 'key' && item !== 'tools') {
        B(0, .013, 0, item === 'roofkey' ? .251 : .194, .035, .129, mat); B(-.014, .033, .027, .085, .006, .043, m.white);
      } else if (item === 'fuel' || item === 'bottle' || item === 'extinguisher') {
        const f = item === 'fuel' ? 1.63 : item === 'extinguisher' ? .91 : .55;
        B(0, .157 * f, 0, .243 * f, .334 * f, .166 * f, mat); B(-.042 * f, .352 * f, 0, .131 * f, .062 * f, .096 * f, m.dark);
        B(0, .16 * f, .087 * f, .126 * f, .112 * f, .007, m.paper);
      } else if (item === 'heavy' || item === 'crowbar' || item === 'screwdriver') {
        const handle = B(0, .018, .025, item === 'screwdriver' ? .295 : .55, .068, .071, mat); handle.rotation.y = -.29;
        B(.21, .04, .115, item === 'heavy' ? .198 : .069, item === 'heavy' ? .189 : .068, .17, m.dark);
      } else if (item === 'hose') {
        const torus = new T.Mesh(new T.TorusGeometry(.218, .043, 8, 20), mat); torus.rotation.x = -Math.PI / 2; torus.position.y = .036; objects.add(torus); B(.17, .04, -.12, .169, .091, .09, m.steel);
      } else {
        const scale = d.kind === 'part' || item === 'tools' ? 1 : .54;
        B(0, .103 * scale, 0, .53 * scale, .205 * scale, .348 * scale, mat);
        B(0, .214 * scale, 0, .54 * scale, .040 * scale, .359 * scale, m.trim);
        for (const k of [-1, 1]) B(k * .177 * scale, .129 * scale, .181 * scale, .042 * scale, .096 * scale, .024 * scale, m.steel);
        if (item === 'module') for (let i = 0; i < 6; i++) B((i - 2.5) * .072, .250, 0, .022, .04, .27, m.dark);
        if (item === 'accumulator') for (const i of [-1, 1]) B(i * .186, .26, 0, .069, .08, .069, i < 0 ? m.red : m.dark);
      }
    } else if (def.type === 'save' || def.type === 'power' || def.type === 'antenna') {
      table(def.type === 'power' ? 1.41 : 1.05, .69, .92);
      B(0, .174, 0, def.type === 'power' ? 1.09 : .62, .61, .32, m.dark);
      B(0, .214, .174, def.type === 'power' ? .88 : .49, .436, .027, m.glass);
      const indicator = B(0, .164, .19, def.type === 'power' ? .66 : .26, .028, .012, def.type === 'power' && !progress.power ? m.hot : m.green);
      if (def.type === 'power') this.powerIndicators.push(indicator);
      for (let i = 0; i < 3; i++) B((i - 1) * .132, .017, .203, .071, .068, .034, i % 2 && def.type !== 'save' ? m.hot : m.trim);
      const label = sign(def.type === 'power' ? .94 : .79, .22, def.type === 'power' ? 'YEDEK GÜÇ' : def.type === 'antenna' ? 'ACİL ANTEN' : 'KAYIT NOKTASI');
      label.position.set(x, y + h + .604, z + .035); b.group.add(label);
    } else if (def.type === 'note') {
      table(.75, .56, .99); B(0, -.029, 0, .233, .023, .29, m.paper).rotation.y = .19;
      for (let i = 0; i < 4; i++) B(.004, -.014, -.06 + i * .037, .134, .005, .011, m.trim);
    } else if (def.type === 'hide') {
      b.box(x, y + 1.04, z, .94, 2.04, .67, m.door); b.box(x, y + 1.07, z + .35, .84, 1.94, .053, m.heavyDoor);
      for (let i = 0; i < 4; i++) b.box(x, y + 1.69 + i * .078, z + .381, .55, .025, .017, m.rubber);
      b.box(x + .29, y + .987, z + .405, .053, .17, .039, m.steel);
      this.collider(x, y, z, .95, 2.06, .69);
    } else if (def.type === 'repair') {
      B(0, -.08, .26, .53, .16, .48, m.red); B(0, .05, .33, .37, .119, .26, m.dark); B(.12, .109, .31, .14, .045, .043, m.hot);
    } else if (def.type === 'board') {
      B(-.33, -.19, -.067, .13, .295, .112, m.steel);
    }
    if (def.type === 'pick' || def.type === 'starter') objects.visible = !progress.collected.includes(def.id);
    this.objects.set(def.id, { def, group: objects, phase: this.rot() * 6.28 });
  }

  private buildLift() {
    const m = this.mat, { x, z } = this.liftPosition;
    this.lift.position.set(x, 0, z); this.scene.add(this.lift);
    box(this.lift, 0, -.082, 0, 2.31, .17, 2.09, m.steel);
    box(this.lift, 0, 2.64, 0, 2.33, .16, 2.10, m.trim);
    box(this.lift, 0, 2.541, -.20, 1.23, .053, .33, m.cold);
    for (const s of [-1, 1]) { box(this.lift, s * 1.14, 1.3, 0, .132, 2.72, 2.08, m.heavyDoor); box(this.lift, s * 1.052, 1.01, 0, .07, .09, 1.64, m.steel); }
    box(this.lift, 0, 1.28, .987, 2.4, 2.65, .123, m.heavyDoor);
    const label = sign(.93, .44, 'ASANSÖR', 'YEDEK HAT'); label.position.set(0, 1.92, .90); label.rotation.y = Math.PI; this.lift.add(label);
  }

  private buildExterior() {
    const ext = this.exterior, m = this.mat, water = solid(0x2c4448, .44, .44);
    const sea = new T.Mesh(new T.PlaneGeometry(750, 750), water); sea.rotation.x = -Math.PI / 2; sea.position.set(27, -5.2, 18); ext.add(sea);
    const batch = new Batch(ext); batch.box(27.6, -1.94, 26.4, 55, 3.65, 57, m.bWall);
    const rock = new T.MeshStandardMaterial({ color: 0x344045, roughness: .96, flatShading: true });
    for (let i = 0; i < 47; i++) {
      const t = i / 47 * Math.PI * 2, range = 73 + this.rot() * 115;
      const o = new T.Mesh(new T.IcosahedronGeometry(1, 0), rock);
      o.position.set(27 + Math.cos(t) * range, -7.6 + this.rot() * 3.6, 18 + Math.sin(t) * range); o.scale.set(17 + this.rot() * 35, 7 + this.rot() * 28, 6 + this.rot() * 18); o.rotation.y = t; ext.add(o);
    }
    for (let i = 0; i < 35; i++) {
      const x = 2 + this.rot() * 50, z = 57 + this.rot() * 12, w = .6 + this.rot() * 6.4;
      batch.box(x, -5.16 + this.rot() * .04, z, w, .027, .059, m.glassShine, (this.rot() - .5) * .46);
    }
    for (let i = 0; i < 9; i++) {
      const z = 58 + i * 2.1, off = (this.rot() - .5) * (i * .51 + 1.5), h = -3.1 - i * .24;
      batch.box(36.9 + off, h, z, 5.4 - i * .21, .34, 1.91, m.road, (this.rot() - .5) * i * .27);
    }
    batch.flush();

    ext.add(this.yardFacade);
    const facade = new Batch(this.yardFacade), south = 16 * CELL;
    for (const floor of [2, 3]) {
      const y = floor * HEIGHT;
      facade.box(11.5 * CELL, y + 1.65, south - .19, 21 * CELL, 3.94, .35, m.bWall);
      facade.box(11.5 * CELL, y + .19, south + .064, 21.16 * CELL, .25, .16, m.trim);
      for (let i = 2; i < 22; i += 2) {
        const x = i * CELL;
        facade.box(x, y + 1.68, south + .025, 2.26, 1.49, .13, m.dark);
        facade.box(x, y + 1.68, south + .098, 2.10, 1.31, .051, i === 18 && floor === 2 ? m.glassShine : m.glass);
        facade.box(x, y + 1.68, south + .137, .050, 1.34, .071, m.trim);
        facade.box(x, y + 1.28, south + .137, 2.11, .052, .071, m.trim);
      }
    }
    facade.box(11.5 * CELL, 16.02, south + .096, 21.22 * CELL, .34, .24, m.ceiling);
    facade.flush();
  }

  private buildRain() {
    this.rainData = new Float32Array(320 * 6);
    const geometry = new T.BufferGeometry(), attr = new T.BufferAttribute(this.rainData, 3).setUsage(T.DynamicDrawUsage); geometry.setAttribute('position', attr);
    for (let i = 0; i < this.rainData.length; i += 6) { this.rainData[i] = (this.rot() - .5) * 36; this.rainData[i + 1] = this.rot() * 13; this.rainData[i + 2] = (this.rot() - .5) * 33; }
    this.rain = new T.LineSegments(geometry, new T.LineBasicMaterial({ color: 0xb0c7c7, transparent: true, opacity: .22, depthWrite: false })); this.rain.frustumCulled = false; this.scene.add(this.rain);
  }

  ground(x: number, z: number, ceiling: number): Ground | null {
    const [i, j] = cellAt(x, z);
    let best: Ground | null = null;
    const add = (y: number, floor: Floor, stairs?: StairId, lift?: boolean) => { if (y <= ceiling + .0001 && (!best || y > best.y)) best = { y, floor, stairs, lift }; };
    for (const f of FLOORS) {
      const room = MAPS[f]?.[j]?.[i];
      if (!room || room === 'lift') continue;
      if (room === 'main' || room === 'service') { if (j === 10) add(f * HEIGHT, f, room); }
      else add(f * HEIGHT, f);
    }
    // Multiple flights occupy the same footprint; only reachable surfaces can support the player.
    for (const s of Object.values(STAIRCASES)) {
      if (x <= s.x || x >= s.x + STAIRS_WIDTH || z < s.z || z >= s.z + RAMP_START) continue;
      for (let f = s.first; f < s.last; f++) {
        const base = f * HEIGHT, dz = z - s.z;
        if (dz <= TURN) add(base + HEIGHT / 2, f as Floor, s.id);
        else if (x < s.x + STAIRS_WIDTH * .5) add(base + HEIGHT / 2 * (RAMP_START - dz) / (RAMP_START - TURN), f as Floor, s.id);
        else add(base + HEIGHT / 2 * (1 + (dz - TURN) / (RAMP_START - TURN)), f as Floor, s.id);
      }
    }
    const lp = this.liftPosition;
    if (Math.abs(x - lp.x) < 1.13 && Math.abs(z - lp.z) < 1.04) add(lp.y, clamp(Math.round(lp.y / HEIGHT), -1, 3) as Floor, undefined, true);
    for (const prop of this.byCell.get(`${i},${j}`) ?? []) if (prop.step && Math.abs(prop.x - x) < prop.w * .5 && Math.abs(prop.z - z) < prop.d * .5) add(prop.top, Math.round(prop.bottom / HEIGHT) as Floor);
    return best;
  }

  moveBlocked(x: number, z: number, foot: number, height: number, radius = .25) {
    if (x < 1 || z < -.1 || x > COLS * CELL - .45 || z > ROWS * CELL - .1) return true;
    const [i, j] = cellAt(x, z);
    return (this.byCell.get(`${i},${j}`) ?? []).some(c => {
      if (c.door && this.doors.get(c.door)?.open || c.bottom >= foot + height || c.top <= foot + .255) return false;
      const xx = Math.max(0, Math.abs(x - c.x) - c.w / 2), zz = Math.max(0, Math.abs(z - c.z) - c.d / 2);
      return xx * xx + zz * zz < radius * radius;
    });
  }

  occluded(a: T.Vector3, b: T.Vector3, padding = 0) {
    const length = Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / .070));
    const last = Math.max(1, steps - Math.ceil(padding * steps / Math.max(.001, length)));
    for (let i = 2; i < last; i++) {
      const f = i / steps, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, y = a.y + (b.y - a.y) * f;
      const [ix, iz] = cellAt(x, z);
      for (const c of this.byCell.get(`${ix},${iz}`) ?? []) {
        if (y > c.bottom && y < c.top && Math.abs(x - c.x) <= c.w * .5 && Math.abs(z - c.z) <= c.d * .5 && !(c.door && this.doors.get(c.door)?.open)) return true;
      }
    }
    return false;
  }

  toggleDoor(id: string, open: boolean) {
    const door = this.doors.get(id); if (!door) return;
    door.open = open;
    if (door.def.glass) { door.pivot.visible = !open; return; }
    const d = door.def, xEdge = d.a[0] !== d.b[0];
    const face = (xEdge ? d.a[0] < d.b[0] : d.a[1] < d.b[1]) ? -1 : 1;
    door.target = open ? face * 1.55 : 0;
    if (open) { door.barricaded = 0; if (door.board) door.board.visible = false; }
  }

  setLift(y: number) { this.liftPosition.y = y; this.lift.position.y = y; }

  navCell(floor: Floor, c: Cell, enemy = true) {
    const room = MAPS[floor][c[1]]?.[c[0]];
    if (!room || room === 'lift' || ((room === 'main' || room === 'service') && c[1] !== 10)) return false;
    return !(enemy && room === 'south' && this.safeFloors.has(floor));
  }

  path(floor: Floor, from: Cell, to: Cell, canBreak = false, player = false): Cell[] {
    if (!this.navCell(floor, to, !player)) return [];
    const source = cellNumber(...from), target = cellNumber(...to);
    if (source === target) return [];
    const prev = new Int16Array(COLS * ROWS).fill(-1); prev[source] = source;
    const queue = [source], div = (i: number): Cell => [i % COLS, Math.floor(i / COLS)];
    for (let index = 0; index < queue.length; index++) {
      const n = queue[index], c = div(n);
      for (const [dx, dz] of nearCells) {
        const other: Cell = [c[0] + dx, c[1] + dz]; const u = cellNumber(...other);
        if (prev[u] !== -1 || !this.navCell(floor, other, !player)) continue;
        const door = DOOR_EDGES[floor].get(edgeKey(c, other));
        if (door ? door.crawl ? !player || door.glass && !this.doors.get(door.id)?.open : !this.doors.get(door.id)?.open && !(canBreak && door.weak) : MAPS[floor][c[1]]?.[c[0]] !== MAPS[floor][other[1]]?.[other[0]]) continue;
        const [x, z] = center(other);
        if (this.moveBlocked(x, z, floor * HEIGHT, 1.5, .29)) continue;
        prev[u] = n;
        if (u === target) {
          const path: Cell[] = []; let k = target;
          while (k !== source) { path.unshift(div(k)); k = prev[k]; }
          return path;
        }
        queue.push(u);
      }
    }
    return [];
  }

  update(dt: number, time: number, eye: T.Vector3, floor: Floor, outside: boolean, power: boolean, flashes: boolean, detail: 'low' | 'normal') {
    for (const door of this.doors.values()) {
      if (door.def.glass) continue;
      if (door.def.lift) door.pivot.position.x += ((door.open ? -2.27 : -.7536) - door.pivot.position.x) * Math.min(1, dt * 7);
      else door.pivot.rotation.y += (door.target - door.pivot.rotation.y) * Math.min(1, dt * 7);
    }
    const room = worldRoomAt(floor, eye.x, eye.z);
    const multiple = outside || room === 'main' || room === 'service' || room === 'lift';
    for (const [level, group] of this.levels) group.visible = level === floor || multiple && Math.abs(level - floor) <= 1;
    this.exterior.visible = outside;
    this.yardFacade.visible = floor === 0;
    for (const indicator of this.powerIndicators) indicator.material = power ? this.mat.green : this.mat.hot;
    this.rain.visible = outside && detail !== 'low';
    this.ambientSky.lerp(outside ? this.sky : this.insideSky, Math.min(1, dt * 5));
    this.scene.background = outside && this.storm ? this.storm : this.ambientSky;
    const fog = this.scene.fog as T.FogExp2;
    fog.density = T.MathUtils.lerp(fog.density, outside ? .0155 : .026, Math.min(1, dt * 7)); fog.color.lerp(outside ? this.sky : this.insideSky, Math.min(1, dt * 5));
    this.skylight.intensity = outside ? .74 + (flashes ? Math.max(0, Math.sin(time * .354 + .3) - .989) * 25 : 0) : .45;
    const choices = this.lamps.filter(l => l.floor === floor || Math.abs(l.y - eye.y) < 3.4).sort((a, b) =>
      (a.x - eye.x) ** 2 + (a.z - eye.z) ** 2 + (a.y - eye.y) ** 2 * 4 - ((b.x - eye.x) ** 2 + (b.z - eye.z) ** 2 + (b.y - eye.y) ** 2 * 4));
    for (let i = 0; i < this.bulbs.length; i++) {
      const light = this.bulbs[i], l = choices[i];
      if (!l || (detail === 'low' && i > 1)) { light.intensity = 0; continue; }
      light.position.set(l.x, l.y, l.z);
      light.color.set(l.power && power ? 0xaedfcb : l.tint);
      light.intensity = l.intensity * (l.power && !power ? .52 : 1) * (flashes ? .94 + Math.sin(time * 4.36 + l.phase) * .06 : 1);
    }
    if (this.rain.visible) {
      this.rain.position.set(eye.x, eye.y - 4, eye.z);
      const positions = this.rainData;
      for (let i = 0; i < positions.length; i += 6) {
        positions[i] -= dt * 1.55; positions[i + 1] -= dt * 13;
        if (positions[i + 1] < 0) { positions[i] = (this.rot() - .5) * 36; positions[i + 1] += 13; positions[i + 2] = (this.rot() - .5) * 33; }
        positions[i + 3] = positions[i] + .057; positions[i + 4] = positions[i + 1] + .53; positions[i + 5] = positions[i + 2] + .039;
      }
      this.rain.geometry.getAttribute('position').needsUpdate = true;
    }
  }

  dispose() {
    this.disposed = true; this.storm?.dispose();
    const disposed = new Set<unknown>();
    this.scene.traverse(o => {
      const mesh = o as T.Mesh;
      if (mesh.geometry && !disposed.has(mesh.geometry)) { disposed.add(mesh.geometry); if (mesh.geometry.type !== 'BoxGeometry') mesh.geometry.dispose(); }
      for (const material of [mesh.material].flat().filter(Boolean)) {
        if (disposed.has(material)) continue;
        for (const value of Object.values(material)) if (value instanceof T.Texture && !disposed.has(value)) { value.dispose(); disposed.add(value); }
        material.dispose(); disposed.add(material);
      }
    });
  }
}