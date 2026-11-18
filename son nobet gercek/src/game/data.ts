export const FLOORS = [-1, 0, 1, 2, 3, 4] as const;
export type Floor = typeof FLOORS[number];
export const FLOOR_NAMES: Record<Floor, string> = { '-1': 'Bodrum', 0: 'Zemin Kat', 1: '1. Kat', 2: '2. Kat', 3: '3. Kat', 4: 'Çatı' };
export const FLOOR_CODES: Record<Floor, string> = { '-1': 'B1', 0: 'Z', 1: '01', 2: '02', 3: '03', 4: 'ÇATI' };

export type Item = { name: string; description: string; icon: string; color: string; floor: Floor; size: number; kind: 'gear' | 'weapon' | 'heal' | 'throw' | 'key' | 'part' };
export const ITEMS = {
  stick: { name: 'Kısa tahta sopa', description: 'Yakınındaki bir Nöbetçiyi kısa süre sendeletir. Darbelerle yıpranır.', icon: 'weapon', color: '#b58c65', floor: 0, size: 1, kind: 'weapon' },
  lamp: { name: 'El feneri', description: 'Karanlıkta yolunu aydınlatır. Düşmanın yüzüne tutulduğunda fark edilirsin.', icon: 'flashlight', color: '#c8c3a8', floor: 0, size: 1, kind: 'gear' },
  cell: { name: 'Yedek pil', description: 'El fenerinin pilini yeniden doldurur.', icon: 'battery', color: '#b7ba83', floor: 0, size: 1, kind: 'gear' },
  bandage: { name: 'Bandaj', description: '35 sağlık yeniler.', icon: 'health', color: '#dad1b7', floor: 0, size: 1, kind: 'heal' },
  kit: { name: 'İlk yardım çantası', description: '70 sağlık yeniler.', icon: 'health', color: '#b96858', floor: 1, size: 1, kind: 'heal' },
  bottle: { name: 'Boş cam şişe', description: 'Q ile at. Kırılma sesi Nöbetçileri düştüğü noktaya çeker.', icon: 'bottle', color: '#7eac9b', floor: 0, size: 1, kind: 'throw' },
  crowbar: { name: 'Levye', description: 'Servis merdiveninin sıkışmış mandalını açar; yakın dövüşte kullanılabilir.', icon: 'weapon', color: '#b37762', floor: 0, size: 1, kind: 'weapon' },
  heavy: { name: 'Dikenli top', description: 'Ağır ve gürültülü. Dev Nöbetçiyi bile kısa süre duraksatır.', icon: 'weapon', color: '#a28e7d', floor: -1, size: 2, kind: 'weapon' },
  extinguisher: { name: 'Yangın söndürücü', description: 'Tek kullanımlık dikkat dağıtıcı. Çıkardığı gürültü kaçmak için süre kazandırır.', icon: 'bottle', color: '#b96753', floor: 2, size: 2, kind: 'throw' },
  screwdriver: { name: 'Tornavida', description: 'Elektrik servisine ait sağlam bir el aleti. Yakın dövüşte kısa menzillidir.', icon: 'tools', color: '#b98a59', floor: 2, size: 1, kind: 'weapon' },
  visitor: { name: 'Ziyaretçi kartı', description: 'Halka açık alanlara erişim verir. Personel alanlarını açmaz.', icon: 'card', color: '#b2b5ae', floor: 0, size: 0, kind: 'key' },
  map: { name: 'Hastane krokisi', description: 'M ile aç. Uğradığın bölümler krokide belirginleşir.', icon: 'map', color: '#bead8c', floor: 0, size: 0, kind: 'key' },
  blue: { name: 'Mavi personel kartı', description: '■ PERSONEL / 2. kat arşivini ve elektrik odasını açar.', icon: 'card', color: '#83adbf', floor: 1, size: 0, kind: 'key' },
  red: { name: 'Kırmızı laboratuvar kartı', description: '▲ LAB / Yedek güç varken B1 teknik laboratuvarını açar.', icon: 'card', color: '#d98675', floor: 2, size: 0, kind: 'key' },
  roofkey: { name: 'Bakım anahtarı', description: 'Ana merdivenin sonundaki çatı kapısını açar.', icon: 'key', color: '#c6a872', floor: 3, size: 0, kind: 'key' },
  tools: { name: 'Alet çantası', description: 'Çatıda helikopter onarımını başlatmak için gerekli. Parça sayacına dahil değildir.', icon: 'tools', color: '#ca9365', floor: 3, size: 0, kind: 'key' },
  module: { name: 'Uçuş kontrol modülü', description: 'B1 test odasına kaldırılan uçuş modülü. Helikopterin kontrol ünitesine takılır.', icon: 'part', color: '#83b6b3', floor: -1, size: 0, kind: 'part' },
  accumulator: { name: 'Akü', description: 'Helikopterin başlatma sisteminin güç kaynağı.', icon: 'battery', color: '#9fb48a', floor: 3, size: 0, kind: 'part' },
  wiring: { name: 'Kablo demeti ve sigorta seti', description: 'Helikopterin kablo takımı. Kutudaki yedek sigorta B1 güç panosuna uyar.', icon: 'part', color: '#c29360', floor: 2, size: 0, kind: 'part' },
  hose: { name: 'Hidrolik hortum', description: 'Helikopterin hidrolik hattındaki eksik bağlantı.', icon: 'part', color: '#a5a59a', floor: 3, size: 0, kind: 'part' },
  fuel: { name: 'Yakıt bidonu', description: 'Ambulans garajındaki acil durum stoğundan. Kalkış için yeterli yakıt var.', icon: 'bottle', color: '#b76e52', floor: 0, size: 0, kind: 'part' },
} satisfies Record<string, Item>;
export type ItemId = keyof typeof ITEMS;
export const PARTS: ItemId[] = ['module', 'accumulator', 'wiring', 'hose', 'fuel'];
export const STARTER: ItemId[] = ['stick', 'lamp', 'cell', 'bandage', 'bottle'];
export const WEAPONS: Partial<Record<ItemId, { durability: number; stamina: number; stagger: number; noise: number; reach: number }>> = {
  stick: { durability: 4, stamina: 16, stagger: 1.55, noise: 7, reach: 2.0 },
  crowbar: { durability: 12, stamina: 19, stagger: 2.3, noise: 11, reach: 2.15 },
  screwdriver: { durability: 8, stamina: 12, stagger: 1.6, noise: 6, reach: 1.5 },
  heavy: { durability: 9, stamina: 31, stagger: 3.1, noise: 17, reach: 2.15 },
};

export const ACTIONS = {
  forward: 'İleri', back: 'Geri', left: 'Sola', right: 'Sağa', sprint: 'Koş', crouch: 'Çömel', jump: 'Atla',
  interact: 'Etkileşim / Al', lamp: 'El feneri', inventory: 'Envanter', map: 'Hastane krokisi', throw: 'Dikkat dağıtıcı at', use: 'Seçili eşyayı kullan',
} as const;
export type Action = keyof typeof ACTIONS;
export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', crouch: 'ControlLeft', jump: 'Space',
  interact: 'KeyE', lamp: 'KeyF', inventory: 'Tab', map: 'KeyM', throw: 'KeyQ', use: 'KeyR',
};
export const keyLabel = (code: string) => ({ Space: 'BOŞLUK', Escape: 'ESC', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'TAB', Enter: 'ENTER' }[code] || code.replace(/^(Key|Digit)/, ''));
export type Difficulty = 'story' | 'normal' | 'night';
export const DIFFICULTY: Record<Difficulty, { name: string; info: string; damage: number; hearing: number; search: number }> = {
  story: { name: 'Hikâye', info: 'Daha kısa aramalar, daha fazla malzeme.', damage: 0.56, hearing: 0.78, search: 0.65 },
  normal: { name: 'Normal', info: 'Dengeli kaynaklar ve düşman algısı.', damage: 1, hearing: 1, search: 1 },
  night: { name: 'Gece Nöbeti', info: 'Sınırlı malzeme ve daha uzun aramalar.', damage: 1.2, hearing: 1.24, search: 1.55 },
};

export type Settings = {
  volume: number; muted: boolean; sensitivity: number; fov: number; motion: boolean; flashes: boolean; objectives: boolean;
  hints: boolean; subtitles: boolean; largeText: boolean; subtitleBackdrop: boolean; highContrast: boolean; toggleRun: boolean; toggleCrouch: boolean;
  detail: 'normal' | 'low'; difficulty: Difficulty; keys: Record<Action, string>;
};
export const DEFAULT_SETTINGS: Settings = {
  volume: 64, muted: false, sensitivity: 48, fov: 75, motion: true, flashes: true, objectives: true,
  hints: false, subtitles: true, largeText: false, subtitleBackdrop: true, highContrast: false, toggleRun: false, toggleCrouch: false,
  detail: 'normal', difficulty: 'normal', keys: DEFAULT_KEYS,
};
const SETTINGS_KEY = 'son-nobet-settings-1';
const SAVE_KEY = 'son-nobet-save-3';
const readStorage = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const writeStorage = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
export function readSettings(): Settings {
  const data = readStorage(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...data, keys: { ...DEFAULT_KEYS, ...data?.keys } };
}
export const writeSettings = (value: Settings) => writeStorage(SETTINGS_KEY, value);

export type Checkpoint = { floor: Floor; x: number; z: number; yaw: number };
export type Progress = {
  version: 3; date: number; elapsed: number; difficulty: Difficulty; checkpoint: Checkpoint;
  stock: Partial<Record<ItemId, number>>; durability: Partial<Record<ItemId, number>>; collected: string[]; unlocked: string[];
  secured: ItemId[]; doors: Record<string, boolean>; explored: string[]; notes: string[]; hotbar: (ItemId | null)[]; selected: number;
  battery: number; power: boolean; installed: ItemId[]; antenna: boolean; complete: boolean;
};
export const CELL = 2.4;
export const HEIGHT = 4;
export const initialProgress = (difficulty: Difficulty): Progress => ({
  version: 3, date: Date.now(), elapsed: 0, difficulty, checkpoint: { floor: 0, x: 10.5 * CELL, z: 14.55 * CELL, yaw: 0 },
  stock: {}, durability: {}, collected: [], unlocked: [], secured: ['visitor', 'map'], doors: {}, explored: ['0:south'],
  notes: [], hotbar: [null, null, null, null], selected: 0, battery: 41, power: false, installed: [], antenna: false, complete: false,
});
export function readProgress(): Progress | null {
  const data = readStorage(SAVE_KEY);
  if (data?.version !== 3 || !FLOORS.includes(data.checkpoint?.floor) || !Array.isArray(data.secured) || !Array.isArray(data.installed) || !data.stock) return null;
  return data;
}
export const writeProgress = (value: Progress) => writeStorage(SAVE_KEY, { ...value, date: Date.now() });
export const owns = (p: Progress, id: ItemId) => p.secured.includes(id) || (p.stock[id] ?? 0) > 0;
export const partCount = (p: Progress) => PARTS.filter(id => p.secured.includes(id)).length;
export const bagUsed = (p: Progress) => (Object.keys(p.stock) as ItemId[]).reduce((sum, id) => sum + (p.stock[id] ? ITEMS[id].size : 0), 0);

export type Objective = { id: string; floor: Floor; title: string; location: string };
export function getObjective(p: Progress, rotor = 0, boarding = false): Objective {
  if (p.complete) return { id: 'end', floor: 4, title: 'Kuzgun Adası’ndan kaçtın.', location: 'GÖREV TAMAMLANDI' };
  if (!p.collected.includes('starter')) return { id: 'starter', floor: 0, title: 'Sedye üzerindeki acil durum malzemelerini al.', location: 'ZEMİN KAT / ACİL SERVİS' };
  if (!owns(p, 'blue')) return { id: 'blue', floor: 1, title: 'Hemşire istasyonunda personel kartını ara.', location: '1. KAT / HEMŞİRE İSTASYONU' };
  if (!owns(p, 'red')) return { id: 'red', floor: 2, title: 'Arşivden laboratuvar erişim kartını al.', location: '2. KAT / HASTA KAYIT ARŞİVİ' };
  if (!owns(p, 'wiring')) return { id: 'wiring', floor: 2, title: 'Elektrik odasındaki kablo ve sigorta setini bul.', location: '2. KAT / ELEKTRİK ODASI' };
  if (!p.power) return { id: 'power', floor: -1, title: 'Sigortayla yedek güç panosunu devreye al.', location: 'B1 / JENERATÖR ODASI' };
  if (!owns(p, 'module')) return { id: 'module', floor: -1, title: 'Teknik laboratuvara gir ve uçuş kontrol modülünü al.', location: 'B1 / TEKNİK LABORATUVAR' };
  if (!owns(p, 'fuel')) return { id: 'fuel', floor: 0, title: 'Ambulans garajından yakıt bidonunu al.', location: 'ZEMİN KAT / AMBULANS GARAJI' };
  if (!owns(p, 'accumulator') || !owns(p, 'tools') || !owns(p, 'roofkey')) {
    const id = !owns(p, 'accumulator') ? 'accumulator' : !owns(p, 'tools') ? 'tools' : 'roofkey';
    return { id, floor: 3, title: `Bakım atölyesinde ${id === 'accumulator' ? 'aküyü' : id === 'tools' ? 'alet çantasını' : 'çatı anahtarını'} bul.`, location: '3. KAT / BAKIM ATÖLYESİ' };
  }
  if (!owns(p, 'hose')) return { id: 'hose', floor: 3, title: 'Mekanik depodan hidrolik hortumu al.', location: '3. KAT / MEKANİK DEPO' };
  if (p.installed.length < 5) return { id: 'repair', floor: 4, title: 'Ana merdivenden çatıya çık ve parçaları helikoptere tak.', location: 'ÇATI / ONARIM NOKTASI' };
  if (boarding) return { id: 'board', floor: 4, title: 'Kokpit kapısına ulaş ve helikoptere bin!', location: 'ÇATI / KOKPİT' };
  if (rotor > 0) return { id: 'hold', floor: 4, title: 'Rotor hızlanırken Nöbetçilerden uzak dur.', location: 'ÇATI / HELİKOPTER PİSTİ' };
  return { id: 'repair', floor: 4, title: 'Onarım tamamlandı. Motoru çalıştır.', location: 'ÇATI / ONARIM NOKTASI' };
}

export const NOTES: Record<string, { title: string; text: string; floor: Floor; tag: string; audio?: 'clinical' | 'transfer' }> = {
  log: { title: 'Gece Nöbeti Teslim Notu', text: '02.14. Kıyı bağlantısı koptu. Ambulans ekibi garajda yakıt bırakmış. 1. kattaki hemşire istasyonunda yedek PERSONEL kartı var. Acil servis güvenli olduğu sürece kayıt terminalini açık tutun. Koridorda adım duyarsanız koşmayın.', floor: 0, tag: 'GÜVENLİK KAYDI / 01' },
  clinic: { title: 'NÖBET / Klinik Gözlem', text: 'Bazı hastalar anonslardan kelimeler tekrarlıyor. Işığa düşük, metalik seslere belirgin tepki veriyorlar. Protokol durduruldu.', floor: 1, tag: 'KLİNİK KAYIT / 02', audio: 'clinical' },
  transfer: { title: 'Malzeme Nakil Tutanağı', text: 'Kuzgun 07 uçuş modülü, su hasarı incelemesi için bodrum test odasına alındı. Giriş için laboratuvar kartı ve yedek güç gerekir.', floor: 2, tag: 'TEKNİK KAYIT / 03', audio: 'transfer' },
  fuse: { title: 'Yedek Güç Talimatı', text: 'Bu panoda normal besleme kapalı tutulur. LAB hattını I, ASANSÖR doğrudan beslemesini 0, YEDEK hattını I konumuna getir. Röle devreye girince asansör yedek hattan beslenir.', floor: -1, tag: 'BAKIM TALİMATI / B1' },
};