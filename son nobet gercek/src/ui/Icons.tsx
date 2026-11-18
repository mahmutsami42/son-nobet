import { BatteryMedium, BriefcaseMedical, Cpu, Flashlight, FlaskConical, IdCard, KeyRound, Map, Pickaxe, Toolbox } from 'lucide-react';

export function Raven({ className = '' }: { className?: string }) {
  return <svg className={className} width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M10 12.5 20 19l3.5 6.5L28 17l6-3 5 4-5.4 1.1-3.8 8.7L20 35l2-5.3-7-4.9L10 12.5Z" fill="currentColor"/>
    <path d="m14.5 17 9.1 8.2-.9 2.3-4.3-3.4z" fill="var(--raven-ground,#141918)"/>
    <path d="M6.5 11V6.5H11m26 0h4.5V11m0 26v4.5H37m-26 0H6.5V37" stroke="currentColor" strokeOpacity=".52" strokeWidth="1"/>
  </svg>;
}

const ITEM_ICONS = { weapon: Pickaxe, flashlight: Flashlight, battery: BatteryMedium, health: BriefcaseMedical, bottle: FlaskConical, card: IdCard, map: Map, tools: Toolbox, part: Cpu, key: KeyRound };
export function ItemIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = ITEM_ICONS[name as keyof typeof ITEM_ICONS] || Cpu;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}