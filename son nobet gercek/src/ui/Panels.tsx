import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, ClipboardList, CornerDownLeft, Hand, MapPin, MoveUpRight, Play, RotateCcw, ShieldCheck, SlidersHorizontal, Square, Volume2, X, Zap } from 'lucide-react';
import { audio } from '../game/audio';
import { ACTIONS, DEFAULT_KEYS, DEFAULT_SETTINGS, DIFFICULTY, FLOOR_CODES, FLOOR_NAMES, FLOORS, ITEMS, NOTES, PARTS, bagUsed, keyLabel, owns, partCount, type Action, type Floor, type ItemId, type Progress, type Settings } from '../game/data';
import type { Hud } from '../game/game';
import { COLS, DOORS, MAPS, ROOM_LABELS, ROWS, roomName, type Room } from '../game/layout';
import { CELL } from '../game/data';
import { ItemIcon, Raven } from './Icons';

export function Dialog({ label, title, sub, close, children, size = '', bottom }: { label: string; title: string; sub?: string; close?: () => void; children: ReactNode; size?: string; bottom?: ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="dialog-overlay">
    <section className={`dialog ${size}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1} ref={dialog} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      if (event.defaultPrevented) return;
      const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <header className="dialog-header">
        <div><span className="micro overline"><i />{label}</span><h2 id="dialog-title">{title}</h2>{sub && <p>{sub}</p>}</div>
        {close && <button className="icon-button" type="button" aria-label="Kapat" onClick={close}><X size={20} /></button>}
      </header>
      <div className="dialog-body">{children}</div>
      {bottom && <footer className="dialog-footer">{bottom}</footer>}
    </section>
  </div>;
}

export const Back = ({ onClick, label = 'Geri dön' }: { onClick: () => void; label?: string }) => <button type="button" className="flat-button" onClick={onClick}><ArrowLeft size={16} />{label}</button>;
export const Primary = ({ onClick, label, icon, disabled = false }: { onClick: () => void; label: string; icon?: ReactNode; disabled?: boolean }) => <button type="button" className="primary-small" disabled={disabled} onClick={onClick}>{icon ?? <ArrowRight size={16} />}{label}</button>;
const Toggle = ({ title, sub, value, onChange }: { title: string; sub?: string; value: boolean; onChange: () => void }) => <div className="setting-row"><span>{title}{sub && <small>{sub}</small>}</span><button type="button" className="switch" onClick={onChange} role="switch" aria-checked={value} aria-label={title}><i /></button></div>;
const Range = ({ title, min = 0, max = 100, value, unit = '%', onChange }: { title: string; min?: number; max?: number; value: number; unit?: string; onChange: (n: number) => void }) => <label className="setting-row"><span>{title}</span><span className="range-control"><input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ '--fill': `${(value - min) / (max - min) * 100}%` } as CSSProperties}/><output>{value}{unit}</output></span></label>;

export function SettingsPanel({ value, change, close, duringGame }: { value: Settings; change: (p: Partial<Settings>) => void; close: () => void; duringGame: boolean }) {
  const [tab, setTab] = useState<'play' | 'display' | 'audio'>('play');
  return <Dialog title="Ayarlar" label="SİSTEM / TERCİHLER" close={close} size="settings-dialog" bottom={<><Back onClick={close}/><button className="flat-button quiet" type="button" onClick={() => change(duringGame ? { ...DEFAULT_SETTINGS, difficulty: value.difficulty } : DEFAULT_SETTINGS)}><RotateCcw size={14} /> Varsayılanlar</button></>}>
    <div className="tab-strip" aria-label="Ayar kategorileri">{([['play', 'Oynanış'], ['display', 'Görüntü'], ['audio', 'Ses']] as const).map(([id, title]) => <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}>{title}</button>)}</div>
    {tab === 'play' && <div className="settings-list">
      <div className="setting-difficulty"><label>Zorluk</label><div className="segments">{Object.entries(DIFFICULTY).map(([id, difficulty]) => <button key={id} type="button" disabled={duringGame} aria-pressed={value.difficulty === id} onClick={() => change({ difficulty: id as Settings['difficulty'], hints: id === 'story' })}>{difficulty.name}</button>)}</div><small>{duringGame ? 'Zorluk, yeni oyun başlatırken seçilir.' : DIFFICULTY[value.difficulty].info}</small></div>
      <Range title="Fare hassasiyeti" value={value.sensitivity} onChange={sensitivity => change({ sensitivity })} />
      <Toggle title="Görev paneli" value={value.objectives} onChange={() => change({ objectives: !value.objectives })} />
      <Toggle title="Görev işaretçileri" value={value.hints} onChange={() => change({ hints: !value.hints })} />
      <Toggle title="Koşmayı aç / kapat" sub="Kapalıyken tuşu basılı tut." value={value.toggleRun} onChange={() => change({ toggleRun: !value.toggleRun })} />
      <Toggle title="Çömelmeyi aç / kapat" value={value.toggleCrouch} onChange={() => change({ toggleCrouch: !value.toggleCrouch })} />
    </div>}
    {tab === 'display' && <div className="settings-list">
      <Range title="Görüş açısı" min={58} max={105} unit="°" value={value.fov} onChange={fov => change({ fov })} />
      <Toggle title="Düşük grafik ayrıntısı" sub="Yağmur parçacıklarını ve etkin ışık sayısını azaltır." value={value.detail === 'low'} onChange={() => change({ detail: value.detail === 'low' ? 'normal' : 'low' })} />
      <Toggle title="Kamera salınımı" value={value.motion} onChange={() => change({ motion: !value.motion })} />
      <Toggle title="Işık titreşimi" value={value.flashes} onChange={() => change({ flashes: !value.flashes })} />
      <Toggle title="Yüksek kontrastlı arayüz" value={value.highContrast} onChange={() => change({ highContrast: !value.highContrast })} />
    </div>}
    {tab === 'audio' && <div className="settings-list">
      <Range title="Ana ses seviyesi" value={value.volume} onChange={volume => change({ volume, muted: false })} />
      <Toggle title="Sessiz mod" value={value.muted} onChange={() => change({ muted: !value.muted })} />
      <Toggle title="Altyazılar" value={value.subtitles} onChange={() => change({ subtitles: !value.subtitles })} />
      <Toggle title="Büyük altyazı" value={value.largeText} onChange={() => change({ largeText: !value.largeText })} />
      <Toggle title="Altyazı arka planı" value={value.subtitleBackdrop} onChange={() => change({ subtitleBackdrop: !value.subtitleBackdrop })} />
    </div>}
  </Dialog>;
}

export function ControlsPanel({ value, change, close }: { value: Settings; change: (p: Partial<Settings>) => void; close: () => void }) {
  const [listen, setListen] = useState<Action | null>(null);
  const [info, setInfo] = useState('Değiştirmek için bir tuşa tıkla.');
  useEffect(() => {
    if (!listen) return;
    const key = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.code === 'Escape') { setInfo('Tuş atama iptal edildi.'); setListen(null); return; }
      if (/^(Digit[1-4]|KeyB|Meta|Alt|F\d|Unidentified)/.test(event.code)) { setInfo('Bu tuş ayrılmış. Başka bir tuş seç.'); return; }
      const other = (Object.keys(value.keys) as Action[]).find(a => a !== listen && value.keys[a] === event.code);
      change({ keys: { ...value.keys, ...(other ? { [other]: value.keys[listen] } : {}), [listen]: event.code } });
      setInfo(`${ACTIONS[listen]}: ${keyLabel(event.code)}`); setListen(null);
    };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  }, [listen, value.keys, change]);
  return <Dialog title="Kontroller" label="SİSTEM / GİRDİ" close={close} size="controls-dialog" bottom={<><Back onClick={close}/><button className="flat-button quiet" type="button" onClick={() => { change({ keys: { ...DEFAULT_KEYS } }); setListen(null); setInfo('Varsayılan tuşlar geri yüklendi.'); }}><RotateCcw size={14} /> Tuşları sıfırla</button></>}>
    <div className="control-tray">{(Object.keys(ACTIONS) as Action[]).map(action => <div className="control-row" key={action}><span>{ACTIONS[action]}</span><button type="button" className={`key-button ${listen === action ? 'listening' : ''}`} onClick={() => { setListen(action); setInfo('Yeni tuşa bas veya ESC ile iptal et.'); }} aria-label={`${ACTIONS[action]}: ${keyLabel(value.keys[action])}`}>{listen === action ? '...' : keyLabel(value.keys[action])}</button></div>)}</div>
    <div className="fixed-controls"><span>Kamera <kbd>FARE</kbd></span><span>Yakın dövüş <kbd>SOL TIK</kbd></span><span>Hızlı yuva <kbd>1–4</kbd></span><span>Barikat <kbd>B</kbd></span><span>Duraklat <kbd>ESC</kbd></span></div>
    <p className="dialog-note" role="status"><CircleHelp size={15} /> {info} Fare kilidi yoksa kamerayı sürükleyerek veya yön tuşlarıyla çevir.</p>
  </Dialog>;
}

export function InventoryPanel({ hud, close, useItem, discard, assign, inspectNote }: { hud: Hud; close: () => void; useItem: (id: ItemId) => void; discard: (id: ItemId) => void; assign: (slot: number, id: ItemId | null) => void; inspectNote: (note: string) => void }) {
  const p = hud.progress;
  const items = (Object.keys(p.stock) as ItemId[]).filter(id => (p.stock[id] ?? 0) > 0);
  const [selected, select] = useState<ItemId | null>(p.hotbar[p.selected] ?? items[0] ?? null);
  const chosen = selected && owns(p, selected) ? ITEMS[selected] : null;
  const slots = items.flatMap(id => [{ id, extra: false }, ...(ITEMS[id].size === 2 ? [{ id, extra: true }] : [])]);
  const stash = p.secured.filter(id => !PARTS.includes(id));
  return <Dialog title="Envanter" label="SAHA DONANIMI" close={close} size="wide-dialog" bottom={<><Back onClick={close} label="Oyuna dön"/><span className="micro">{bagUsed(p) >= 8 ? 'AĞIR YÜK / HAREKET HAFİF YAVAŞ' : 'KRİTİK EŞYALAR AYRI TAŞINIR'}</span></>}>
    <div className="inventory-layout">
      <div>
        <div className="subheading"><span>Sırt çantası</span><small>{bagUsed(p)} / 10 yuva</small></div>
        <div className="bag-grid">{Array.from({ length: 10 }, (_, i) => {
          const slot = slots[i]; return slot ? <button key={i} type="button" className={`bag-slot ${slot.id === selected ? 'chosen' : ''} ${slot.extra ? 'extended' : ''}`} style={{ '--item': ITEMS[slot.id].color } as CSSProperties} onClick={() => select(slot.id)} aria-label={`${ITEMS[slot.id].name}${slot.extra ? ', ikinci yuva' : ''}`}>
            <small>{String(i + 1).padStart(2, '0')}</small><ItemIcon name={ITEMS[slot.id].icon} size={25}/>{!slot.extra && <b>{p.stock[slot.id]! > 1 ? `×${p.stock[slot.id]}` : p.durability[slot.id] ?? ''}</b>}
          </button> : <div className="bag-slot empty" key={i}><small>{String(i + 1).padStart(2, '0')}</small><span>+</span></div>;
        })}</div>
        <div className="subheading quick-heading"><span>Hızlı erişim</span><small>Atamak için yuva seç</small></div>
        <div className="quick-config">{p.hotbar.map((id, i) => <button type="button" key={i} onClick={() => { if (selected === id) assign(i, null); else if (chosen && selected) assign(i, selected); }} disabled={Boolean(chosen && (chosen.kind === 'key' || chosen.kind === 'part'))} aria-label={`${i + 1}. hızlı yuva${id ? `: ${ITEMS[id].name}` : ': boş'}`}><kbd>{i + 1}</kbd>{id ? <ItemIcon name={ITEMS[id].icon} size={19}/> : <span>-</span>}</button>)}</div>
        <div className="item-inspect">{chosen && selected ? <>
          <span className="micro">{FLOOR_NAMES[chosen.floor]} / {chosen.size ? `${chosen.size} YUVA` : 'KORUMALI'}</span><h3>{chosen.name}</h3><p>{chosen.description}</p>
          {p.durability[selected] != null && <small>Dayanıklılık: {p.durability[selected]}</small>}
          <div className="inline-actions">{(chosen.size > 0 || selected === 'map') && <Primary onClick={() => useItem(selected)} label={chosen.kind === 'weapon' || chosen.kind === 'throw' ? 'Kuşan' : selected === 'map' ? 'Krokiyi aç' : 'Kullan'} icon={<Hand size={15}/>}/>} {chosen.size > 0 && selected !== 'lamp' && <button type="button" className="flat-button quiet" onClick={() => discard(selected)}>Çantadan çıkar</button>}</div>
        </> : <p>İncelemek veya kullanmak için bir eşya seç.</p>}{hud.toast && <small className="inventory-toast" role="status">{hud.toast.text}</small>}</div>
      </div>
      <div className="inventory-secured">
        <div className="subheading"><span>Önemli eşyalar</span><ShieldCheck size={17}/></div>
        {stash.map(id => <button className={`file-row ${selected === id ? 'chosen' : ''}`} key={id} type="button" onClick={() => select(id)}><ItemIcon name={ITEMS[id].icon} size={16}/><span>{ITEMS[id].name}</span><ChevronRight size={15}/></button>)}
        <div className="subheading quick-heading"><span>Uçuş donanımı</span><small>{partCount(p)} / 5</small></div>
        {PARTS.map(id => <button className={`file-row ${selected === id ? 'chosen' : ''}`} key={id} type="button" disabled={!owns(p, id)} onClick={() => select(id)}><ItemIcon name={ITEMS[id].icon} size={15}/><span>{ITEMS[id].name}</span>{p.installed.includes(id) ? <Check size={15}/> : <small>{FLOOR_CODES[ITEMS[id].floor]}</small>}</button>)}
        {p.notes.length > 0 && <><div className="subheading quick-heading"><span>Hastane kayıtları</span><small>{p.notes.length}</small></div>{p.notes.map(id => <button className="file-row" key={id} type="button" onClick={() => inspectNote(id)}><ClipboardList size={15}/><span>{NOTES[id].title}</span><ChevronRight size={15}/></button>)}</>}
      </div>
    </div>
  </Dialog>;
}

export function MapPanel({ hud, close }: { hud: Hud; close: () => void }) {
  const [floor, setFloor] = useState<Floor>(hud.floor);
  const grid = MAPS[floor];
  const rooms = [...new Set(grid.flat().filter((r): r is Room => Boolean(r)))];
  const discovered = (r: Room) => hud.progress.explored.includes(`${floor}:${r}`);
  const color = (r: Room) => r === 'main' || r === 'service' || r === 'lift' ? '#424037' : r === 'yard' || r === 'roof' ? '#2b4039' : discovered(r) ? '#40504a' : '#222d2a';
  return <Dialog title="Hastane Krokisi" label="YÖN BULMA / KAT PLANI" close={close} size="map-dialog" bottom={<><Back onClick={close} label="Oyuna dön"/><span className="micro"><MapPin size={13}/> {FLOOR_CODES[hud.floor]} / {hud.location}</span></>}>
    <div className="floor-tabs">{FLOORS.map(f => <button type="button" key={f} aria-pressed={f === floor} aria-label={FLOOR_NAMES[f]} onClick={() => setFloor(f)}>{FLOOR_CODES[f]}{f === hud.floor && <i />}</button>)}</div>
    <div className="map-sheet"><svg role="img" aria-label={`${FLOOR_NAMES[floor]} krokisi`} viewBox={`-.1 -.55 ${COLS + .25} ${floor === 0 ? ROWS + .85 : 18.6}`}>
      <defs><pattern id="graph-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" stroke="#53625b" strokeWidth=".032" fill="none" opacity=".29"/></pattern></defs>
      <rect x="0" y="-.5" width={COLS} height={floor === 0 ? ROWS + .8 : 18.6} fill="url(#graph-grid)" />
      {grid.map((row, z) => row.map((r, x) => r && <g key={`${x}-${z}`}><rect x={x} y={z} width="1.004" height="1.004" fill={color(r)} stroke="#54635a" strokeWidth=".018" />
        {grid[z - 1]?.[x] !== r && <path d={`M${x} ${z}h1`} stroke="#869184" strokeWidth=".04"/>}{grid[z + 1]?.[x] !== r && <path d={`M${x} ${z + 1}h1`} stroke="#869184" strokeWidth=".04"/>}
        {row[x - 1] !== r && <path d={`M${x} ${z}v1`} stroke="#869184" strokeWidth=".04"/>}{row[x + 1] !== r && <path d={`M${x + 1} ${z}v1`} stroke="#869184" strokeWidth=".04"/>}</g>))}
      {DOORS[floor].map(d => {
        const [x, y] = [(d.a[0] + d.b[0] + 1) / 2, (d.a[1] + d.b[1] + 1) / 2], X = d.a[0] !== d.b[0];
        const locked = d.lock && !hud.progress.unlocked.includes(d.id);
        return <g key={d.id}><path d={X ? `M${x} ${y - .29}v.58` : `M${x - .29} ${y}h.58`} stroke={locked ? '#d99679' : d.crawl ? '#a7b98f' : '#d3dbcb'} strokeWidth=".11" />{locked && <circle cx={x} cy={y} r=".105" fill="#382624" stroke="#e19f83" strokeWidth=".04"/>}</g>;
      })}
      {rooms.map(r => {
        const label = ROOM_LABELS[r]; if (!label) return null;
        const [x, y] = label, name = roomName(floor, r);
        const width = r === 'sw' || r === 'se' ? 6.1 : ['main', 'service', 'lift'].includes(r) ? 2.85 : r === 'nw' ? 3.55 : 4.6;
        const words = name.split(' '); const lines = words.length > 1 && (name.length > 14 || width < 3) ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [name];
        return <text key={r} x={x} y={y} fill={discovered(r) || r === 'main' || r === 'service' ? '#e2e1cc' : '#94a79c'} fontSize={r === 'lift' ? '.23' : '.33'} textAnchor="middle" fontWeight={discovered(r) ? '600' : '400'}>{lines.map((s, i) => <tspan key={i} x={x} dy={i ? '.43' : '0'}>{s}</tspan>)}</text>;
      })}
      <g transform="translate(1.2 2.1)"><path d="m0 -.50 .18 .40-.18 -.075-.18 .075z" fill="#a6b0a0"/><text fill="#b9bdae" fontSize=".36" textAnchor="middle" y=".43">K</text></g>
      {hud.floor === floor && <g transform={`translate(${hud.x / CELL} ${hud.z / CELL}) rotate(${-hud.yaw * 180 / Math.PI})`}><circle r=".33" fill="#4e2f26" stroke="#eb9b82" strokeWidth=".055"/><path d="m0 -.285 .17 .42-.17 -.08-.17 .08z" fill="#f1ab8a"/></g>}
    </svg></div>
    <div className="map-legend"><span><i style={{ background: '#e8a086' }} /> Konumun / kilitli geçit</span><span><i style={{ background: '#8c9f90' }}/> Keşfedildi</span><span><i /> Henüz keşfedilmedi</span></div>
  </Dialog>;
}

export function PausePanel({ progress, close, settings, controls, map, inventory, exit }: { progress: Progress; close: () => void; settings: () => void; controls: () => void; map: () => void; inventory: () => void; exit: () => void }) {
  return <Dialog label="SON NÖBET / OTURUM" title="Duraklatıldı" sub={`Helikopter parçaları: ${partCount(progress)} / 5`} close={close} size="small-dialog">
    <div className="pause-actions"><Primary onClick={close} label="Devam et" icon={<Play size={17}/>}/><button type="button" onClick={inventory}>Envanter <ChevronRight size={16}/></button><button type="button" onClick={map}>Hastane krokisi <ChevronRight size={16}/></button><button type="button" onClick={settings}>Ayarlar <SlidersHorizontal size={16}/></button><button type="button" onClick={controls}>Kontroller <ChevronRight size={16}/></button><button type="button" onClick={exit}>Ana menü <ArrowRight size={16}/></button></div>
  </Dialog>;
}

export function PowerPanel({ switches, error, flip, apply, close }: { switches: boolean[]; error?: string; flip: (i: number) => void; apply: () => void; close: () => void }) {
  return <Dialog label="B1 / JENERATÖR KONTROLÜ" title="Yedek Güç Panosu" sub="Sigorta seti takıldı. Güvenlik rölesini doğru hatlarla besle." close={close} bottom={<><Back onClick={close} label="Panodan ayrıl"/><Primary icon={<Zap size={16}/>} label="Röleyi devreye al" onClick={apply}/></>}>
    <div className="power-callout"><ClipboardList size={19}/><p><strong>Bakım talimatı</strong><br />Laboratuvar ve yedek hat açık (I), asansörün doğrudan beslemesi kapalı (0) olmalı.</p></div>
    <div className="fuse-bank">{['LAB', 'ASANSÖR', 'YEDEK'].map((name, i) => <button key={name} type="button" role="switch" aria-checked={switches[i]} aria-label={`${name} hattı`} className={`fuse ${switches[i] ? 'active' : ''}`} onClick={() => flip(i)}><span>{String(i + 1).padStart(2, '0')} / {name}</span><div><i/><b>{switches[i] ? 'I' : '0'}</b></div><small>{switches[i] ? 'HAT AÇIK' : 'HAT KAPALI'}</small></button>)}</div>
    <p className="dialog-note" role="status"><Zap size={15}/>{error || 'Röle beklemede.'}</p>
  </Dialog>;
}

export function LiftPanel({ current, choose, close }: { current: Floor; choose: (f: Floor) => void; close: () => void }) {
  return <Dialog label="ASANSÖR / YEDEK HAT" title="Kat Seçimi" sub="Kapı hareket etmeden önce kapanır. Çatıya ana merdivenden çıkılır." size="small-dialog" close={close} bottom={<Back onClick={close} label="Asansörden ayrıl"/>}>
    <div className="lift-list">{FLOORS.filter(f => f < 4).reverse().map(f => <button key={f} type="button" disabled={current === f} onClick={() => choose(f)}><b>{FLOOR_CODES[f]}</b><span>{FLOOR_NAMES[f]}</span>{f === current ? <Check size={17}/> : <ArrowDownToLine size={16}/>}</button>)}</div>
  </Dialog>;
}

export function NotePanel({ id, close, audible }: { id: string; close: () => void; audible: boolean }) {
  const note = NOTES[id];
  const [talking, setTalking] = useState(false);
  const clip = note.audio;
  useEffect(() => { setTalking(false); return () => { if (clip) audio.stopVoice(clip); }; }, [clip]);
  const listen = () => {
    if (!clip) return;
    if (talking) { audio.stopVoice(clip); setTalking(false); }
    else { setTalking(true); audio.voice(clip, .90, () => setTalking(false)); }
  };
  return <Dialog label={note.tag} title={note.title} close={close} bottom={<><Back onClick={close} label="Belgeyi kapat"/>{clip && <Primary onClick={listen} disabled={!audible} label={!audible ? 'Ses kapalı' : talking ? 'Durdur' : 'Kaydı dinle'} icon={talking ? <Square size={15}/> : <Volume2 size={16}/>}/>}</>}>
    <div className="document-page"><Raven/><div className="micro">KUZGUN ADASI / HASTANE İÇİ</div><p>{note.text}</p></div>
  </Dialog>;
}

export function EndingPanel({ progress, restart, exit }: { progress: Progress; restart: () => void; exit: () => void }) {
  const minutes = Math.floor(progress.elapsed / 60);
  return <Dialog title="Adadan Kaçtın" label="SON NÖBET / BÖLÜM TAMAMLANDI" sub="Rotor sesi fırtınaya karışırken Kuzgun Adası ufukta kayboldu." size="ending-dialog" bottom={<><Back onClick={exit} label="Ana menü"/><Primary onClick={restart} label="Yeni oyun" icon={<RotateCcw size={16}/>}/></>}>
    <div className="ending-summary"><span><Check size={19}/> 5 / 5 parça takıldı</span><span><ClipboardList size={18}/> {progress.notes.length} kayıt okundu</span><span><MoveUpRight size={18}/> {minutes ? `${minutes} dk` : `${Math.floor(progress.elapsed)} sn`} süre</span></div>
    <p className="dialog-note"><CornerDownLeft size={16}/> {progress.antenna ? 'Hastane kayıtlarının bir kopyası ana karaya ulaştı.' : 'Acil durum frekansı bir kez cızırdadı, sonra sessizliğe gömüldü.'}</p>
  </Dialog>;
}