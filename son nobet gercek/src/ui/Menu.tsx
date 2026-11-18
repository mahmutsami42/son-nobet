import { ArrowRight, ChevronRight, Keyboard, Play, SlidersHorizontal, Volume2, VolumeX, History } from 'lucide-react';
import { FLOOR_CODES, type Progress, type Settings } from '../game/data';
import { Raven } from './Icons';

type MenuProps = { save: Progress | null; options: Settings; newGame: () => void; resume: () => void; settings: () => void; controls: () => void; sound: () => void };
export function Menu(props: MenuProps) {
  const hasSound = !props.options.muted && props.options.volume > 0;
  return <main className={`main-menu ${props.options.motion ? '' : 'no-motion'}`} aria-label="Ana menü">
    <div className="title-photo" aria-hidden="true" />
    <div className="title-light" aria-hidden="true" />
    <div className="title-grain" aria-hidden="true" />
    <header className="menu-header">
      <div className="hospital-mark">
        <div className="raven-tile"><Raven /></div>
        <div><strong>KUZGUN ADASI</strong><span>TIP VE ARAŞTIRMA HASTANESİ</span></div>
      </div>
      <button className="sound-toggle" type="button" onClick={props.sound} aria-label={hasSound ? 'Sesi kapat' : 'Sesi aç'} aria-pressed={hasSound}>
        {hasSound ? <Volume2 size={16} /> : <VolumeX size={16} />} <span>SES {hasSound ? 'AÇIK' : 'KAPALI'}</span>
      </button>
    </header>
    <section className="title-stage" aria-label="Son Nöbet: Kuzgun Adası">
      <div className="title-content">
        <p className="chapter"><i /> BÖLÜM 01 <span>/</span> KARANTİNA</p>
        <h1 className="game-title" aria-label="Son Nöbet: Kuzgun Adası">
          <span className="game-title-strong">SON NÖBET</span>
          <span className="game-title-sub">KUZGUN ADASI</span>
        </h1>
        <p className="title-synopsis">Fırtına adayı dış dünyadan kopardı.<br />Çatıdaki helikopter tek çıkış yolu.</p>
        <nav className="title-actions" aria-label="Oyun seçenekleri">
          <button className="launch-button" type="button" onClick={props.newGame}><Play size={20} strokeWidth={1.75} /><span>YENİ OYUN</span><ArrowRight className="action-arrow" size={19} strokeWidth={1.6} /></button>
          <button className="menu-line" type="button" onClick={props.resume} disabled={!props.save}><History size={17} strokeWidth={1.55} /><span>DEVAM ET</span>{!props.save ? <small>KAYIT YOK</small> : <><small>{props.save.complete ? 'TAMAMLANDI' : `KAT ${FLOOR_CODES[props.save.checkpoint.floor]}`}</small><ChevronRight size={15} className="action-arrow" /></>}</button>
          <button className="menu-line" type="button" onClick={props.settings}><SlidersHorizontal size={17} strokeWidth={1.55} /><span>AYARLAR</span><ChevronRight size={15} className="action-arrow" /></button>
          <button className="menu-line" type="button" onClick={props.controls}><Keyboard size={18} strokeWidth={1.5} /><span>KONTROLLER</span><ChevronRight size={15} className="action-arrow" /></button>
        </nav>
      </div>
    </section>
    <footer className="menu-footer"><div><i /> OYNANABİLİR PROTOTİP</div><span>SÜRÜM 0.1.0</span></footer>
  </main>;
}