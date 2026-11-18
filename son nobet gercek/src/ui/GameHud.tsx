import { BatteryMedium, Cross, Footprints, Map, Mouse, Pause, Target, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Flashlight, Backpack, CircleDot } from 'lucide-react';
import type { CSSProperties, PointerEvent } from 'react';
import { FLOOR_CODES, ITEMS, keyLabel, owns, partCount, type Action, type Settings } from '../game/data';
import type { Hud, Panel } from '../game/game';
import { ItemIcon } from './Icons';

export function GameHud({ h, s, open, touch }: { h: Hud; s: Settings; open: (panel: Panel) => void; touch: (action: Action, down: boolean) => void }) {
  const parts = partCount(h.progress);
  const selected = h.progress.hotbar[h.progress.selected];
  const item = selected ? ITEMS[selected] : null;
  const ks = s.keys;
  const event = (e: PointerEvent<HTMLButtonElement>, a: Action) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); touch(a, true); };
  if (h.cinematic) return <div className="cine-bars" aria-hidden="true"><i/><span>KUZGUN ADASI / TAHLİYE</span><i/></div>;
  return <div className={`game-hud ${s.highContrast ? 'high-contrast' : ''}`}>
    <div className="damage" style={{ '--damage': s.flashes ? h.hurt * .70 : h.hurt * .31 } as CSSProperties} />
    {h.hidden && <div className="hidden-view"/>}
    <div className="hud-location">
      <span className="micro"><i/> KUZGUN ADASI HASTANESİ</span><div><b>{FLOOR_CODES[h.floor]}</b><strong>{h.location}</strong></div>
      <nav className="hud-links" aria-label="Oyun içi menü">
        <button type="button" aria-label="Duraklat" onClick={() => open('pause')}><Pause size={13}/><small>ESC</small></button>
        <button type="button" aria-label="Hastane krokisi" onClick={() => open('map')}><Map size={14}/><small>{keyLabel(ks.map)}</small></button>
        <button type="button" aria-label="Envanter" onClick={() => open('inventory')}><Backpack size={14}/><small>{keyLabel(ks.inventory)}</small></button>
      </nav>
    </div>
    {s.objectives && <aside className="hud-objective" aria-label="Kaçış planı" key={h.objective.id}>
      <div className="object-title"><Target size={16}/><b>KAÇIŞ PLANI</b><span>{FLOOR_CODES[h.objective.floor]}</span></div>
      <div className="part-meter" aria-label={`Helikopter parçaları ${parts}/5`}><div>{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < parts ? 'found' : ''} />)}</div><span>{parts}<em>/</em>5</span></div>
      <small className="micro part-label">HELİKOPTER PARÇALARI {h.floor === 4 && h.progress.installed.length > 0 ? `· TAKILAN ${h.progress.installed.length}/5` : ''}</small>
      <div className="objective-description"><small>{h.objective.location}</small><p>{h.objective.title}</p></div>
      {h.rotor > 0 && <div className="rotor-clock"><i/> KALKIŞA {Math.ceil(h.rotor)} SN</div>}
    </aside>}
    <div className={`crosshair ${h.focus ? 'active' : ''}`} aria-hidden="true"><i/></div>
    {h.aim && !h.hidden && <div className="aim-guide" style={{ left: `${h.aim.x * 100}%`, top: `${h.aim.y * 100}%` }}><CircleDot size={13}/>{h.aim.direction}</div>}
    <div className="hud-middle">
      {h.liftBusy && <div className="activity"><span>Asansör hareket ediyor</span><i className="moving"/></div>}
      {h.action ? <div className="activity"><span>{h.action.title}</span><i style={{ '--work': `${h.action.percent * 100}%` } as CSSProperties}/></div> : h.focus && <div className="interaction"><kbd>{keyLabel(ks.interact)}</kbd><div><b>{h.focus.verb}</b><span>{h.focus.label}</span></div></div>}
      {h.toast && <div key={h.toast.key} className={`toast ${h.toast.tone}`} role="status"><i/>{h.toast.text}</div>}
    </div>
    {s.subtitles && h.subtitle && <div className={`subtitle ${s.largeText ? 'large' : ''} ${s.subtitleBackdrop ? 'backdrop' : ''}`}>{h.subtitle}</div>}
    <div className="hud-vitals">
      <div className="vital health"><Cross size={15}/><div><i style={{ width: `${h.health}%` }}/></div><strong>{Math.ceil(h.health)}</strong></div>
      <div className="vital stamina"><Footprints size={15}/><div><i style={{ width: `${h.stamina}%` }}/></div><strong>{Math.ceil(h.stamina)}</strong></div>
      {owns(h.progress, 'lamp') && <div className={`light-vital ${h.lamp ? 'lit' : ''}`}><BatteryMedium size={18}/><span>{Math.ceil(h.battery)}%</span><kbd>{keyLabel(ks.lamp)}</kbd></div>}
    </div>
    <div className="hud-gear">
      <div>{h.hidden ? 'SAKLANIYORSUN' : h.crouch ? 'ÇÖMELDİN' : item ? item.name : 'Hızlı erişim'} {selected && h.progress.durability[selected] !== undefined && <small>{h.progress.durability[selected]} D</small>}</div>
      <div className="hud-slots">{h.progress.hotbar.map((id, i) => <div className={i === h.progress.selected ? 'selected' : ''} key={i}><kbd>{i + 1}</kbd>{id && <ItemIcon name={ITEMS[id].icon} size={19}/>}</div>)}</div>
    </div>
    {h.capture === 'none' && <div className="capture-hint"><Mouse size={15}/> <span>Kamerayı kontrol etmek için oyun alanına tıkla</span></div>}
    <div className="touch-ui">
      <div className="touch-pad">{([['forward', ArrowUp], ['left', ArrowLeft], ['back', ArrowDown], ['right', ArrowRight]] as const).map(([a, Icon]) => <button key={a} type="button" className={a} aria-label={{ forward: 'İleri', back: 'Geri', left: 'Sola', right: 'Sağa' }[a]} onPointerDown={e => event(e, a)} onPointerUp={() => touch(a, false)} onPointerCancel={() => touch(a, false)}><Icon size={23}/></button>)}</div>
      <div className="touch-actions"><button type="button" aria-label="El feneri" onClick={() => { touch('lamp', true); touch('lamp', false); }}><Flashlight size={20}/></button><button type="button" aria-label="Etkileşim" onClick={() => { touch('interact', true); touch('interact', false); }}>E</button></div>
    </div>
  </div>;
}