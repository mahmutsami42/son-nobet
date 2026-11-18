import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { audio } from './game/audio';
import { getObjective, initialProgress, readProgress, readSettings, writeSettings, type Progress, type Settings } from './game/data';
import type { HospitalGame, Hud, Panel } from './game/game';
import { GameHud } from './ui/GameHud';
import { Raven } from './ui/Icons';
import { Menu } from './ui/Menu';
import { Back, ControlsPanel, Dialog, EndingPanel, InventoryPanel, LiftPanel, MapPanel, NotePanel, PausePanel, PowerPanel, Primary, SettingsPanel } from './ui/Panels';

type ApplicationPanel = Panel | 'confirm' | 'error';

export default function App() {
  const [options, setOptions] = useState(readSettings);
  const [saved, setSaved] = useState(readProgress);
  const [session, setSession] = useState<{ progress: Progress; token: number } | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [panel, setPanel] = useState<ApplicationPanel | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteBack, setNoteBack] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState<'title' | 'pause' | 'ending'>('title');
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<HospitalGame | null>(null);
  const sequence = useRef(0);
  const opts = useRef(options);
  const change = useCallback((update: Partial<Settings>) => {
    const next = { ...opts.current, ...update };
    opts.current = next; writeSettings(next); setOptions(next); audio.settings(next);
    engine.current?.applySettings(next);
    if (engine.current) engine.current.publish();
  }, []);

  const launch = (progress: Progress) => {
    audio.start(opts.current);
    setPanel(null); setNoteId(null); setNoteBack(false); setHud(null); setError('');
    setSession({ progress, token: ++sequence.current });
  };

  useEffect(() => {
    if (!session) return;
    let canceled = false;
    let game: HospitalGame | null = null;
    const area = host.current;
    void import('./game/game').then(({ HospitalGame }) => {
      if (canceled || !area) return;
      try {
        game = new HospitalGame(area, session.progress, opts.current, {
          hud: setHud,
          panel: (newPanel, note) => { setPanel(newPanel); setNoteId(note ?? null); },
          save: setSaved,
          failure: reason => { game?.open('pause'); setError(reason); setPanel('error'); },
        });
        engine.current = game;
        game.checkpoint();
      } catch (ex) {
        console.warn('WebGL oyun başlatılamadı.', ex);
        setError('3D sahne başlatılamadı. Bu oyun WebGL 2 destekli ve donanım hızlandırması açık bir tarayıcı gerektiriyor.');
        setPanel('error');
      }
    }).catch(() => { if (!canceled) { setError('Oyun dosyaları yüklenemedi. Sayfayı yenileyip yeniden dene.'); setPanel('error'); } });
    return () => { canceled = true; game?.dispose(); if (engine.current === game) engine.current = null; area?.replaceChildren(); };
  }, [session]);

  const open = (target: Panel | null) => {
    if (engine.current) engine.current.open(target);
    else setPanel(target);
  };
  const close = () => open(null);
  const continuePlay = () => { close(); engine.current?.captureMouse(); };
  const menu = () => {
    if (engine.current && panel !== 'dead' && panel !== 'error') engine.current.checkpoint();
    setSession(null); setHud(null); setPanel(null); setNoteBack(false); setNoteId(null);
    audio.ambience(true, 0, 0, false);
  };
  const requestNew = (from: typeof source) => {
    audio.start(opts.current); audio.cue('ui', .56);
    if (saved) { setSource(from); setPanel('confirm'); }
    else launch(initialProgress(opts.current.difficulty));
  };
  const prefs = (kind: 'settings' | 'controls') => { audio.start(opts.current); setSource(session ? 'pause' : 'title'); open(kind); };
  const goBack = () => open(session ? 'pause' : null);
  const dismissConfirm = () => { if (source === 'ending') setPanel('win'); else if (source === 'pause') open('pause'); else setPanel(null); };
  const closeNote = () => { open(noteBack ? 'inventory' : null); setNoteBack(false); };

  useEffect(() => {
    if (!panel) return;
    const esc = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.defaultPrevented) return;
      if (panel === 'confirm') { event.preventDefault(); setPanel(source === 'ending' ? 'win' : source === 'pause' ? 'pause' : null); }
      else if (panel === 'settings' || panel === 'controls') { event.preventDefault(); if (engine.current) engine.current.open('pause'); else setPanel(null); }
      else if (panel === 'note') { event.preventDefault(); engine.current?.open(noteBack ? 'inventory' : null); setNoteBack(false); }
      else if (panel === 'error') { setSession(null); setHud(null); setPanel(null); }
    };
    window.addEventListener('keydown', esc, true); return () => window.removeEventListener('keydown', esc, true);
  }, [panel, source, noteBack]);

  const toggleAudio = () => {
    audio.start(opts.current);
    const off = options.muted || options.volume === 0;
    change({ muted: !off, volume: options.volume || 64 });
    audio.ambience(true, 0, 0, false); if (off) audio.cue('ui');
  };

  return <div className={`app-shell ${options.motion ? '' : 'no-motion'}`}>
    {session ? <main className="playfield" inert={Boolean(panel)}>
      <div className="three-host" ref={host}/>
      {!hud && panel !== 'error' && <div className="load-room" role="status"><Raven /><h2>Hastaneye giriliyor</h2><p className="micro">SAHA BAĞLANTISI KURULUYOR</p></div>}
      {hud && <GameHud h={hud} s={options} open={open} touch={(action, down) => engine.current?.touchAction(action, down)}/>}
    </main> : <div inert={Boolean(panel)}>
      <Menu save={saved} options={options} newGame={() => requestNew('title')} resume={() => { if (saved?.complete) setPanel('win'); else if (saved) launch(saved); }} settings={() => prefs('settings')} controls={() => prefs('controls')} sound={toggleAudio}/>
    </div>}

    {panel === 'confirm' && <Dialog label="SON NÖBET / KAYIT" title="Yeni Oyun" sub="Yeni oyun başlatmak önceki kayıt dosyasının üzerine yazar." close={dismissConfirm} size="small-dialog" bottom={<><Back onClick={dismissConfirm} label="Vazgeç"/><Primary onClick={() => launch(initialProgress(opts.current.difficulty))} label="Oyunu başlat"/></>}><p className="dialog-note"><AlertTriangle size={17}/> Bu işlem mevcut ilerleyişi sıfırlar.</p></Dialog>}
    {panel === 'error' && <Dialog label="SİSTEM / GRAFİK" title="Bağlantı Kesildi" sub={error} size="small-dialog" bottom={<Back onClick={menu} label="Ana menü"/>}><p className="dialog-note">Mümkünse güncel Chrome, Firefox veya Edge ile tekrar aç.</p></Dialog>}
    {panel === 'settings' && <SettingsPanel value={session ? { ...options, difficulty: session.progress.difficulty } : options} change={change} close={goBack} duringGame={Boolean(session)}/>}
    {panel === 'controls' && <ControlsPanel value={options} change={change} close={goBack}/>}
    {panel === 'pause' && hud && <PausePanel progress={hud.progress} close={continuePlay} settings={() => prefs('settings')} controls={() => prefs('controls')} map={() => open('map')} inventory={() => open('inventory')} exit={menu}/>}
    {panel === 'inventory' && hud && <InventoryPanel hud={hud} close={close} useItem={id => engine.current?.useItem(id)} discard={id => engine.current?.discard(id)} assign={(slot, id) => engine.current?.assign(slot, id)} inspectNote={id => { setNoteBack(true); engine.current?.open('note', id); }}/>}
    {panel === 'map' && hud && <MapPanel hud={hud} close={close}/>}
    {panel === 'power' && hud && <PowerPanel switches={hud.switches} error={hud.toast?.text.startsWith('Röle') ? hud.toast.text : undefined} flip={index => engine.current?.flip(index)} apply={() => { if (engine.current?.restorePower()) engine.current.captureMouse(); }} close={close}/>}
    {panel === 'lift' && hud && <LiftPanel current={hud.floor} choose={floor => engine.current?.chooseLift(floor)} close={close}/>}
    {panel === 'note' && noteId && <NotePanel id={noteId} close={closeNote} audible={!options.muted && options.volume > 0}/>}
    {panel === 'dead' && hud && <Dialog label="SON NÖBET / SİNYAL KAYBI" title="Nöbet Sona Erdi" sub="Son güvenli kayıt noktandan devam edebilirsin. Kaydedilen görev parçaları korunur." size="small-dialog" bottom={<><Back onClick={menu} label="Ana menü"/><Primary onClick={() => launch(saved ?? initialProgress(opts.current.difficulty))} label="Kayda dön" icon={<RotateCcw size={16}/>}/></>}><p className="dead-objective"><span className="micro">GÜNCEL HEDEF</span>{getObjective(saved ?? hud.progress).title}</p></Dialog>}
    {panel === 'win' && (hud?.progress || saved) && <EndingPanel progress={(hud?.progress ?? saved)!} restart={() => requestNew('ending')} exit={menu}/>}
  </div>;
}