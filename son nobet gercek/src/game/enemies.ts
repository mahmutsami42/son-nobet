import * as T from 'three';
import { enemyModel, type EnemyStyle } from './art';
import { audio } from './audio';
import { DIFFICULTY, HEIGHT, type Difficulty, type Floor } from './data';
import { DOOR_EDGES, ENEMY_LAYOUT, RAMP_START, STAIRCASES, STAIRS_WIDTH, TURN, cellAt, center, edgeKey, worldRoomAt, type Cell } from './layout';
import type { World } from './world';

export type Noise = { position: T.Vector3; floor: Floor; radius: number };
type Sense = { position: T.Vector3; eye: T.Vector3; direction: T.Vector3; floor: Floor; crouch: boolean; hiding: boolean; flashlight: boolean; yaw: number };
type Mode = 'patrol' | 'listen' | 'investigate' | 'search' | 'chase' | 'stunned';
export type Watcher = ReturnType<typeof enemyModel> & {
  id: string; type: EnemyStyle; mode: Mode; floor: Floor; position: T.Vector3; yaw: number; route: Cell[]; patrol: number;
  path: Cell[]; target: T.Vector3; known: T.Vector3; thinking: number; idle: number; wait: number; cooldown: number;
  eyeTimer: number; seen: boolean; windup: number; step: number; cycle: number; search: number; breakTime: number;
  rooftop: boolean; flight: number; stuck: number; lastCell: Cell;
};
const behavior = {
  slow: { patrol: 1.09, run: 2.18, range: 9.4, fov: .36, hearing: 1.1, damage: 21, size: .25, reach: 1.39 },
  fast: { patrol: 1.63, run: 3.42, range: 12.8, fov: .12, hearing: 1.05, damage: 24, size: .27, reach: 1.56 },
  giant: { patrol: 1.28, run: 2.52, range: 10.3, fov: .32, hearing: 1.33, damage: 39, size: .40, reach: 1.86 },
};

export class Enemies {
  readonly actors: Watcher[];
  private noise: Noise[] = [];
  private roofSignal = false;
  proximity = 0;
  chased = false;
  constructor(private readonly world: World, private readonly difficulty: Difficulty) {
    this.actors = ENEMY_LAYOUT.map(({ id, floor, type, patrol }) => {
      const m = enemyModel(type), [x, z] = center(patrol[0]);
      const position = new T.Vector3(x, floor * HEIGHT, z);
      m.root.position.copy(position); world.scene.add(m.root);
      return { ...m, id, floor, type, position, route: patrol, patrol: 1, mode: 'patrol', yaw: type === 'slow' ? Math.PI * .7 : -Math.PI * .4, path: [], target: position.clone(), known: position.clone(), thinking: 0, idle: 0, wait: .5, cooldown: 1, eyeTimer: 0, seen: false, windup: 0, step: .5, cycle: 0, search: 0, breakTime: 0, rooftop: false, flight: -1, stuck: 0, lastCell: patrol[0] };
    });
  }
  emit(event: Noise) { this.noise.push(event); }
  signalRoof() { this.roofSignal = true; }

  private look(enemy: Watcher, s: Sense, distance: number) {
    if (enemy.floor !== s.floor || worldRoomAt(s.floor, s.position.x, s.position.z) === 'south' && s.floor >= 0 && s.floor <= 3) return false;
    if (s.hiding) {
      // The giant can check a locker only when the last sighting was beside it.
      return enemy.type === 'giant' && ['chase', 'search'].includes(enemy.mode) && distance < 1.8 && enemy.known.distanceTo(s.position) < 2.4 && !this.world.occluded(enemy.position.clone().add(new T.Vector3(0, 1.8, 0)), s.eye, .59);
    }
    const b = behavior[enemy.type];
    const aimAtEnemy = s.direction.x * (enemy.position.x - s.eye.x) + s.direction.z * (enemy.position.z - s.eye.z);
    const beam = s.flashlight && distance < 15 && aimAtEnemy > distance * .87;
    if (distance > (s.crouch ? b.range * .64 : b.range) + (enemy.mode === 'chase' ? 2 : 0) && !beam) return false;
    const cos = (Math.sin(enemy.yaw) * (s.position.x - enemy.position.x) + Math.cos(enemy.yaw) * (s.position.z - enemy.position.z)) / Math.max(.001, distance);
    if (!beam && cos < b.fov && distance > 2.2 && enemy.mode !== 'chase') return false;
    return !this.world.occluded(enemy.position.clone().add(new T.Vector3(0, enemy.type === 'giant' ? 1.94 : 1.56, 0)), s.eye);
  }

  private hear(enemy: Watcher, sounds: Noise[], range: number) {
    let loudest: { score: number; target: T.Vector3 } | null = null;
    for (const sound of sounds) {
      const levels = Math.abs(sound.floor - enemy.floor);
      if (levels > 1) continue;
      const target = sound.position.clone();
      let attenuation = 1;
      if (levels) {
        if (sound.radius < 12) continue;
        const portals = sound.floor === 4 || enemy.floor === 4 ? [STAIRCASES.main] : Object.values(STAIRCASES);
        const nearest = portals.map(stair => new T.Vector3(stair.x + STAIRS_WIDTH / 2, enemy.floor * HEIGHT, stair.z + RAMP_START + 1.1)).sort((a, b) => a.distanceToSquared(target) - b.distanceToSquared(target))[0];
        if (nearest.distanceTo(target) > sound.radius * .72) continue;
        target.copy(nearest); attenuation = .46;
      } else if (this.world.occluded(enemy.position.clone().add(new T.Vector3(0, 1.35, 0)), target.clone().add(new T.Vector3(0, .52, 0)))) attenuation = .53;
      const distance = enemy.position.distanceTo(target);
      const score = sound.radius * attenuation * range - distance;
      if (score > 0 && (!loudest || score > loudest.score)) loudest = { score, target };
    }
    return loudest?.target;
  }

  stun(enemy: Watcher, seconds: number) {
    enemy.mode = 'stunned'; enemy.idle = seconds; enemy.windup = 0; enemy.path = []; enemy.seen = false;
  }

  update(dt: number, s: Sense, hit: (amount: number) => void, breakDoor: (id: string) => void) {
    const d = DIFFICULTY[this.difficulty];
    const sounds = this.noise; this.noise = [];
    const room = worldRoomAt(s.floor, s.position.x, s.position.z), inShaft = room === 'main' || room === 'service' || room === 'lift';
    this.proximity = 0; this.chased = false;
    for (const e of this.actors) {
      let moving = false;
      e.root.visible = e.floor === s.floor || inShaft && Math.abs(e.floor - s.floor) <= 1 || e.flight >= 0 && Math.abs(e.position.y - s.position.y) < 4.3;
      const config = behavior[e.type], distance = Math.hypot(e.position.x - s.position.x, e.position.z - s.position.z);
      const close = e.floor === s.floor || e.flight >= 0 && Math.abs(e.position.y - s.position.y) < 4.3;
      if (close) this.proximity = Math.max(this.proximity, Math.max(0, 1 - distance / (e.type === 'giant' ? 16 : 12)));
      e.cooldown -= dt; e.eyeTimer -= dt; e.thinking -= dt;
      if (e.mode === 'stunned') {
        e.idle -= dt; if (e.idle <= 0) { e.mode = 'search'; e.search = 2.3; e.target.copy(e.position); e.thinking = 0; }
        this.animate(e, dt, false, 0); continue;
      }
      if (e.eyeTimer <= 0) { e.seen = this.look(e, s, distance); e.eyeTimer = close ? .105 : .30; }
      if (e.seen) {
        e.target.copy(s.position); e.known.copy(s.position);
        if (e.mode !== 'chase') { e.mode = 'chase'; e.thinking = 0; if (close && distance < 14) audio.cue('breathe', .4); }
        this.chased = true;
      } else if (e.mode === 'chase') {
        e.mode = 'search'; e.search = (e.type === 'fast' ? 9 : 7) * d.search; e.target.copy(e.known); e.thinking = 0;
      }
      if (!e.seen && sounds.length && e.flight < 0 && !e.rooftop) {
        const heard = this.hear(e, sounds, config.hearing * d.hearing);
        if (heard && e.target.distanceTo(heard) > 1.05) {
          e.mode = 'listen'; e.wait = e.type === 'fast' ? .23 : .55; e.path = []; e.target.copy(heard); e.thinking = 0;
        }
      }
      if (e.mode === 'listen') {
        e.wait -= dt;
        if (!e.rooftop && e.wait > 0) { e.yaw = this.turn(e.yaw, Math.atan2(e.target.x - e.position.x, e.target.z - e.position.z), dt * 4); this.animate(e, dt, false, 0); continue; }
        e.mode = 'investigate'; e.search = 5.5 * d.search;
      }
      if (this.roofSignal && e.type === 'giant' && e.floor === 3) e.rooftop = true;
      if (e.rooftop && e.floor === 3 && (s.floor === 4 || e.flight >= 0)) {
        moving = this.climb(e, dt, breakDoor);
      } else if (e.windup > 0) {
        e.windup -= dt;
        e.yaw = this.turn(e.yaw, Math.atan2(s.position.x - e.position.x, s.position.z - e.position.z), dt * 5);
        if (e.windup <= 0 && close && distance <= config.reach + .15 && this.look(e, s, distance)) hit(Math.round(config.damage * d.damage));
      } else if (e.seen && distance <= config.reach && e.cooldown <= 0) {
        e.windup = e.type === 'giant' ? .62 : e.type === 'fast' ? .32 : .44; e.cooldown = e.type === 'giant' ? 2.6 : 1.75;
        audio.cue(e.type === 'giant' ? 'heavy' : 'breathe', .72);
      } else if (!(e.seen && distance < config.reach * .74)) {
        if (e.mode === 'patrol') {
          const [x, z] = center(e.route[e.patrol]); e.target.set(x, e.floor * HEIGHT, z);
          if (Math.hypot(x - e.position.x, z - e.position.z) < .33 || e.stuck > 2.2) { e.patrol = (e.patrol + 1) % e.route.length; e.idle = .35; e.thinking = 0; e.stuck = 0; }
        } else if (e.mode === 'search' || e.mode === 'investigate') {
          const at = e.target.distanceTo(e.position) < .72;
          e.search -= dt * (at ? 1 : .49);
          if (at && e.idle <= 0) { e.yaw += dt * 1.22; }
          if (e.search <= 0) {
            if (e.floor === 4) { e.target.set(32.2, e.floor * HEIGHT, 28.2); e.mode = 'investigate'; e.search = 11; }
            else { e.mode = 'patrol'; e.idle = .7; }
            e.thinking = 0;
          }
        }
        if (e.idle > 0) e.idle -= dt;
        else moving = this.travel(e, dt, e.mode === 'chase' ? config.run : e.mode === 'patrol' ? config.patrol : config.patrol * 1.26, breakDoor);
      }
      this.animate(e, dt, moving, e.mode === 'chase' ? 1.33 : 1);
      if (moving && close && distance < 17) {
        e.step -= dt;
        if (e.step < 0) {
          const pan = ((e.position.x - s.position.x) * Math.cos(s.yaw) - (e.position.z - s.position.z) * Math.sin(s.yaw)) / Math.max(1, distance);
          audio.cue(e.type === 'giant' ? 'heavy' : 'enemy', (1 - distance / 17) * (e.type === 'giant' ? .87 : .66), pan);
          e.step = e.type === 'giant' ? .68 : e.type === 'fast' ? .37 : .57;
        }
      }
    }
  }

  private turn(current: number, desired: number, factor: number) { return current + Math.atan2(Math.sin(desired - current), Math.cos(desired - current)) * Math.min(1, factor); }

  private travel(e: Watcher, dt: number, speed: number, breakDoor: (id: string) => void) {
    let [cx, cz] = cellAt(e.position.x, e.position.z);
    if (e.thinking <= 0 && !(e.path[0]?.[0] === cx && e.path[0]?.[1] === cz)) {
      let goal = cellAt(e.target.x, e.target.z);
      if (!this.world.navCell(e.floor, goal)) {
        const [i, j] = goal;
        const near = [[i, j - 1], [i + 1, j], [i, j + 1], [i - 1, j]] as Cell[];
        goal = near.find(c => this.world.navCell(e.floor, c)) ?? [cx, cz];
      }
      e.path = this.world.path(e.floor, [cx, cz], goal, e.type === 'giant');
      e.thinking = e.mode === 'chase' ? .36 : .84;
    }
    const next = e.path[0];
    let x: number, z: number;
    if (next) {
      [x, z] = center(next);
      [cx, cz] = cellAt(e.position.x, e.position.z);
      if (e.type === 'giant') {
        const door = DOOR_EDGES[e.floor].get(edgeKey([cx, cz], next));
        const state = door && this.world.doors.get(door.id);
        if (state && !state.open && state.def.weak && Math.hypot(state.x - e.position.x, state.z - e.position.z) < .90) {
          e.breakTime += dt; e.yaw = this.turn(e.yaw, Math.atan2(x - e.position.x, z - e.position.z), dt * 5);
          if (e.breakTime > (state.barricaded ? 1.9 : 1.18)) { breakDoor(state.def.id); e.breakTime = 0; }
          return false;
        }
      }
      if (Math.hypot(x - e.position.x, z - e.position.z) < .22) { e.path.shift(); e.lastCell = next; }
    } else if (e.mode === 'chase' && e.seen && Math.hypot(e.target.x - e.position.x, e.target.z - e.position.z) < 4.1) { x = e.target.x; z = e.target.z; }
    else { e.stuck += dt; return false; }
    const distance = Math.hypot(x - e.position.x, z - e.position.z);
    if (distance < .063) return false;
    const v = Math.min(speed * dt, distance), dx = (x - e.position.x) / distance * v, dz = (z - e.position.z) / distance * v;
    e.yaw = this.turn(e.yaw, Math.atan2(dx, dz), dt * (e.type === 'fast' ? 10 : 5.2));
    const beforeX = e.position.x, beforeZ = e.position.z, foot = e.position.y, hh = e.type === 'giant' ? 2.12 : 1.68, size = behavior[e.type].size;
    if (!this.world.moveBlocked(beforeX + dx, beforeZ, foot, hh, size)) e.position.x += dx;
    if (!this.world.moveBlocked(e.position.x, beforeZ + dz, foot, hh, size)) e.position.z += dz;
    const moving = Math.hypot(e.position.x - beforeX, e.position.z - beforeZ) > .003;
    e.stuck = moving ? 0 : e.stuck + dt;
    return moving;
  }

  private climb(e: Watcher, dt: number, breakDoor: (id: string) => void) {
    const stair = STAIRCASES.main, y = 3 * HEIGHT, lx = stair.x + STAIRS_WIDTH * .25, rx = stair.x + STAIRS_WIDTH * .75;
    const near = stair.z + RAMP_START, turn = stair.z + TURN * .49;
    if (e.flight < 0) {
      const [x, z] = center([18, 10]); e.target.set(x, y, z);
      if (e.position.distanceTo(e.target) <= .33) { e.flight = 0; e.seen = false; e.windup = 0; }
      else return this.travel(e, dt, 2.68, breakDoor);
    }
    const way = [[lx, near + .73], [lx, turn], [rx, turn], [rx, near + .81]];
    const [x, z] = way[e.flight];
    const gap = Math.hypot(x - e.position.x, z - e.position.z);
    if (gap < .12) {
      e.flight++;
      if (e.flight >= way.length) {
        e.floor = 4; e.position.y = 4 * HEIGHT; e.flight = -1; e.mode = 'investigate'; e.thinking = 0; e.search = 16;
        e.target.set(29.5, 4 * HEIGHT, 23.8); e.path = [];
      }
      return false;
    }
    const speed = Math.min(gap, dt * 2.58);
    e.yaw = this.turn(e.yaw, Math.atan2(x - e.position.x, z - e.position.z), dt * 6);
    e.position.x += (x - e.position.x) / gap * speed; e.position.z += (z - e.position.z) / gap * speed;
    const g = this.world.ground(e.position.x, e.position.z, e.position.y + .42);
    if (g) e.position.y = g.y;
    return true;
  }

  private animate(e: Watcher, dt: number, moving: boolean, hurry: number) {
    e.cycle += dt * (moving ? (e.type === 'fast' ? 8.7 : 6.1) * hurry : 2.55);
    const sway = Math.sin(e.cycle), bob = moving ? Math.abs(Math.cos(e.cycle)) * .027 : .009 * sway;
    e.root.position.copy(e.position); e.root.position.y += bob; e.root.rotation.y = e.yaw;
    e.head.rotation.z = (e.mode === 'listen' ? .23 : .088) * Math.sin(e.cycle * .45 + .9);
    e.head.rotation.x = e.mode === 'stunned' ? -.32 : .086 + sway * .039;
    e.torso.rotation.z = e.mode === 'stunned' ? .16 * sway : moving ? .035 * sway : .022 * sway;
    for (let i = 0; i < 2; i++) {
      const d = i ? 1 : -1;
      e.legs[i].rotation.x = moving ? sway * d * .33 * Math.min(1.2, hurry) : 0;
      e.arms[i].rotation.x = e.windup > 0 ? -.54 - (1 - Math.min(1, e.windup)) * .91 : moving ? -sway * d * .30 - (hurry > 1 ? .23 : 0) : sway * .07 * d;
    }
  }
}