import { CELL, FLOORS, type Floor, type ItemId } from './data';

export const COLS = 23;
export const ROWS = 23;
export type Cell = readonly [number, number];
export type Room = 'hall' | 'nw' | 'north' | 'ne' | 'midw' | 'mide' | 'sw' | 'south' | 'se' | 'main' | 'service' | 'lift' | 'yard' | 'roof';
export type Rect = [number, number, number, number];
export type StairId = 'main' | 'service';
export const STAIRCASES = {
  main: { x: 18 * CELL, z: 6 * CELL, first: -1, last: 4, id: 'main' },
  service: { x: CELL, z: 6 * CELL, first: -1, last: 3, id: 'service' },
} as const;
export const STAIRS_WIDTH = 3 * CELL;
export const TURN = 0.84 * CELL;
export const RAMP_START = 4 * CELL;

export const ROOM_NAMES: Record<Floor, Partial<Record<Room, string>>> = {
  '-1': { hall: 'Karantina Koridoru', nw: 'Eski Morg', north: 'Servis Deposu', ne: 'Karantina Ünitesi', midw: 'Çamaşırhane', mide: 'Teknik Laboratuvar', sw: 'Teknik Depo', south: 'Jeneratör Odası', se: 'Bakım Atölyesi' },
  0: { hall: 'Acil Servis Koridoru', nw: 'Yemekhane', north: 'Danışma', ne: 'Hasta Kabul', midw: 'Eczane', mide: 'Bekleme Salonu', sw: 'Güvenlik', south: 'Acil Servis', se: 'Ambulans Garajı' },
  1: { hall: 'Hasta Servisleri', nw: 'Hasta Koğuşu A', north: 'Ziyaretçi Alanı', ne: 'Hasta Koğuşu B', midw: 'Hasta Odaları', mide: 'Hemşire İstasyonu', sw: 'Tıbbi Malzeme', south: 'Personel Odası', se: 'Servis Deposu' },
  2: { hall: 'Ameliyathane Koridoru', nw: 'Röntgen', north: 'Sterilizasyon', ne: 'Ameliyathane', midw: 'Görüntüleme', mide: 'Hasta Kayıt Arşivi', sw: 'Elektrik Odası', south: 'Yoğun Bakım', se: 'Teknik Depo' },
  3: { hall: 'Bakım ve Yönetim', nw: 'Yönetim Ofisi', north: 'Havalandırma', ne: 'Bakım Deposu', midw: 'Personel Ofisi', mide: 'Mekanik Kontrol', sw: 'Bakım Atölyesi', south: 'Dinlenme Odası', se: 'Mekanik Depo' },
  4: { roof: 'Helikopter Pisti' },
};
export const roomName = (level: Floor, room: Room) => ROOM_NAMES[level][room] ?? ({ main: 'Ana Merdiven', service: 'Servis Merdiveni', lift: 'Asansör', yard: 'Karantina Avlusu' } as Partial<Record<Room, string>>)[room] ?? 'Hastane';
export const ROOM_LABELS: Partial<Record<Room, Cell>> = { nw: [2.8, 2.9], north: [10.7, 1.0], ne: [19.0, 3.3], midw: [8, 6.1], mide: [12.5, 6.1], sw: [4.25, 13.3], south: [10.5, 14.65], se: [18.7, 13.45], main: [19.5, 7.25], service: [2.5, 7.25], lift: [14, 12.95], yard: [17.5, 18.8], roof: [13.0, 7.0] };

const mainRooms: Partial<Record<Room, Rect[]>> = {
  hall: [[4, 10, 17, 11], [4, 5, 5, 9], [5, 4, 5, 4], [5, 2, 16, 3], [15, 4, 16, 9]],
  nw: [[1, 1, 4, 4]], north: [[5, 0, 16, 1]], ne: [[17, 1, 21, 5]],
  midw: [[6, 4, 9, 9]], mide: [[10, 4, 14, 9]], sw: [[1, 12, 7, 15]], south: [[8, 12, 12, 15]], se: [[15, 12, 21, 15]],
  main: [[18, 6, 20, 10]], service: [[1, 6, 3, 10]], lift: [[13, 12, 14, 13]],
};
export const MAPS = Object.fromEntries(FLOORS.map(floor => {
  const grid: (Room | undefined)[][] = Array.from({ length: ROWS }, () => Array(COLS));
  const fill = (key: Room, [a, b, c, d]: Rect) => { for (let z = b; z <= d; z++) for (let x = a; x <= c; x++) grid[z][x] = key; };
  if (floor === 4) { fill('roof', [3, 2, 21, 16]); fill('main', [18, 6, 20, 10]); }
  else {
    for (const [room, rects] of Object.entries(mainRooms)) for (const r of rects) fill(room as Room, r);
    if (floor === 0) fill('yard', [2, 16, 21, 22]);
  }
  return [floor, grid];
})) as Record<Floor, (Room | undefined)[][]>;

export const roomAt = (floor: Floor, x: number, z: number) => MAPS[floor]?.[Math.floor(z)]?.[Math.floor(x)];
export const worldRoomAt = (floor: Floor, x: number, z: number) => roomAt(floor, x / CELL, z / CELL);
export const center = (c: Cell) => [(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL] as const;
export const cellAt = (x: number, z: number) => [Math.floor(x / CELL), Math.floor(z / CELL)] as const;
export const cellNumber = (x: number, z: number) => z * COLS + x;
export const edgeKey = (a: Cell, b: Cell) => [cellNumber(...a), cellNumber(...b)].sort((x, y) => x - y).join(':');

export type DoorDef = { id: string; floor: Floor; a: Cell; b: Cell; opens?: boolean; lock?: 'blue' | 'red' | 'roofkey' | 'crowbar'; weak?: boolean; crawl?: boolean; glass?: boolean; lift?: boolean };
function levelDoors(floor: Floor): DoorDef[] {
  const door = (id: string, a: Cell, b: Cell, extra: Partial<DoorDef> = {}): DoorDef => ({ id: `${floor}:${id}`, floor, a, b, ...extra });
  if (floor === 4) return [door('roof', [17, 10], [18, 10], { lock: 'roofkey' })];
  const lab = floor === -1 ? { lock: 'red' as const } : floor === 2 ? { lock: 'blue' as const } : { opens: true, weak: true };
  const list = [
    door('nw', [5, 3], [4, 3], { opens: true, weak: true }), door('north', [11, 2], [11, 1], { weak: true }),
    door('ne', [16, 3], [17, 3], { opens: true, weak: true }), door('midw', [5, 7], [6, 7], { opens: true, weak: true }),
    door('midw-s', [8, 10], [8, 9], { opens: true, weak: true }), door('mide', [12, 10], [12, 9], lab), door('mide-n', [12, 3], [12, 4], lab),
    door('sw', [6, 11], [6, 12], floor === 2 ? { lock: 'blue' } : { opens: true, weak: true }),
    door('south', [10, 11], [10, 12], { opens: true, weak: floor === 0 ? false : true }),
    door('se', [16, 11], [16, 12], { opens: true, weak: true }),
    door('main', [17, 10], [18, 10], { opens: true }), door('service', [4, 10], [3, 10], { lock: 'crowbar' }),
    door('lift', [13, 11], [13, 12], { lift: true }),
  ];
  if (floor >= 0 && floor !== 2) list.push(door('crawl', [14, 7], [15, 7], { crawl: true, glass: floor === 1 }));
  if (floor === 0) list.push(door('garage-yard', [18, 16], [18, 15], { opens: true }));
  return list;
}
export const DOORS = Object.fromEntries(FLOORS.map(floor => [floor, levelDoors(floor)])) as Record<Floor, DoorDef[]>;
export const DOOR_EDGES = Object.fromEntries(FLOORS.map(floor => [floor, new Map(DOORS[floor].map(d => [edgeKey(d.a, d.b), d]))])) as Record<Floor, Map<string, DoorDef>>;

export type Placement = { id: string; level: Floor; x: number; z: number; type: 'pick' | 'starter' | 'save' | 'note' | 'hide' | 'power' | 'repair' | 'board' | 'antenna'; item?: ItemId; note?: string; height?: number; limited?: 'more' | 'normal' };
const p = (level: Floor, id: string, x: number, z: number, type: Placement['type'], more: Partial<Placement> = {}): Placement => ({ id, level, x: x * CELL, z: z * CELL, type, ...more });
const item = (level: Floor, id: ItemId, x: number, z: number, more: Partial<Placement> = {}) => p(level, id, x, z, 'pick', { item: id, ...more });
export const PLACEMENTS: Placement[] = [
  p(0, 'starter', 10.5, 13.63, 'starter', { height: 1.09 }), p(0, 'save-er', 9.08, 14.58, 'save'),
  item(0, 'crowbar', 3.55, 14.55), item(0, 'fuel', 18.55, 14.27, { height: .56 }),
  p(0, 'bottle-er', 11.8, 13.55, 'pick', { item: 'bottle' }), p(0, 'bandage-pharmacy', 7.35, 6.2, 'pick', { item: 'bandage' }),
  p(0, 'log', 5.2, 13.1, 'note', { note: 'log' }), p(0, 'hide-er', 11.98, 15.05, 'hide'),
  p(0, 'hide-ground', 14.05, 8.9, 'hide'), p(0, 'aid-story', 8.9, 14.03, 'pick', { item: 'kit', limited: 'more' }),
  item(1, 'blue', 12.65, 6.45), item(1, 'kit', 4.7, 13.3, { limited: 'normal' }),
  p(1, 'save-1', 10.85, 13.35, 'save'), p(1, 'clinic', 8.5, 5.1, 'note', { note: 'clinic' }),
  p(1, 'hide-ward', 8.97, 8.65, 'hide'), p(1, 'bottle-ward', 18.7, 3.41, 'pick', { item: 'bottle' }),
  item(2, 'red', 12.65, 6.45), item(2, 'wiring', 5.27, 13.85), item(2, 'screwdriver', 4.35, 14.6),
  item(2, 'extinguisher', 16.35, 8.5, { height: .86, limited: 'normal' }), p(2, 'cell-2', 5.24, 14.65, 'pick', { item: 'cell' }),
  p(2, 'transfer', 13.51, 6.35, 'note', { note: 'transfer' }), p(2, 'save-2', 10.85, 13.35, 'save'), p(2, 'hide-2', 19.7, 4.68, 'hide'),
  item(-1, 'module', 12.65, 6.45), item(-1, 'heavy', 19.7, 13.65), p(-1, 'power', 10.55, 14.1, 'power'),
  p(-1, 'fuse', 11.65, 13.6, 'note', { note: 'fuse' }), p(-1, 'hide-b', 8.67, 8.8, 'hide'),
  p(-1, 'bandage-b', 18.3, 13.8, 'pick', { item: 'bandage', limited: 'normal' }),
  item(3, 'accumulator', 5.35, 13.45), item(3, 'tools', 4.45, 13.45), item(3, 'roofkey', 5.35, 14.7),
  item(3, 'hose', 19.1, 14), p(3, 'save-3', 10.85, 13.35, 'save'), p(3, 'hide-3', 7.02, 8.6, 'hide'),
  p(3, 'cell-3', 4.4, 14.7, 'pick', { item: 'cell', limited: 'normal' }),
  p(4, 'repair', 11.03, 9.95, 'repair', { height: 1.28 }), p(4, 'board', 13.6, 9.95, 'board', { height: 1.3 }),
  p(4, 'antenna', 6.55, 4.65, 'antenna', { height: 1.35 }),
];

export const ENEMY_LAYOUT: { id: string; type: 'slow' | 'fast' | 'giant'; floor: Floor; patrol: Cell[] }[] = [
  { id: 'admission', type: 'slow', floor: 0, patrol: [[16, 6], [15, 3], [19, 3], [16, 8], [15, 10]] },
  { id: 'ward', type: 'slow', floor: 1, patrol: [[14, 10], [12, 10], [8, 10], [8, 7], [4, 6], [9, 3], [15, 3], [16, 8]] },
  { id: 'surgery', type: 'fast', floor: 2, patrol: [[9, 3], [16, 3], [16, 7], [17, 10], [13, 10], [8, 10], [5, 7], [5, 4]] },
  { id: 'laundry', type: 'slow', floor: -1, patrol: [[8, 10], [8, 7], [5, 7], [6, 3], [15, 3], [16, 8], [14, 10]] },
  { id: 'quarantine', type: 'slow', floor: -1, patrol: [[18, 3], [16, 4], [16, 9], [17, 10], [15, 6], [17, 3]] },
  { id: 'chief', type: 'giant', floor: 3, patrol: [[8, 10], [6, 12], [5, 13], [7, 11], [15, 10], [16, 12], [19, 13], [16, 11], [16, 7], [9, 3], [5, 7]] },
];