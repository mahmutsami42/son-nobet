const { chromium } = require('playwright');
const path = require('node:path');

const BASE = process.env.NOBET_URL || 'http://localhost:5173';
const SHOTS = process.env.NOBET_SHOTS;

async function run() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
    await page.goto(BASE);
    page.on('console', message => console.log(message.text()));
    const result = await page.evaluate(async ({ render, difficulty }) => {
      const { HospitalGame } = await import('/src/game/game.ts');
      const { DEFAULT_SETTINGS, initialProgress, readProgress, owns, partCount, CELL, HEIGHT, PARTS } = await import('/src/game/data.ts');
      const { STAIRCASES, STAIRS_WIDTH, TURN, RAMP_START, worldRoomAt } = await import('/src/game/layout.ts');
      const data = initialProgress(difficulty);
      const host = document.createElement('div'); host.className = 'three-host'; host.style.zIndex = '9'; document.body.appendChild(host);
      let panel = null, hud = null;
      const createGame = progress => {
        const scene = new HospitalGame(host, progress, { ...DEFAULT_SETTINGS, muted: true }, { panel: value => { panel = value; }, hud: value => { hud = value; }, save: () => {}, failure: str => { throw new Error(str); } });
        cancelAnimationFrame(scene.animationId);
        return scene;
      };
      let g = createGame(data), w = g.world;
      const room = () => worldRoomAt(g.floor, g.player.x, g.player.z);
      const check = (ok, message) => { if (!ok) throw new Error(`${message}; at floor ${g.floor} ${room()} (${g.player.x.toFixed(2)}, ${g.player.y.toFixed(2)}, ${g.player.z.toFixed(2)}), panel=${panel}, focus=${g.findFocus()?.id}`); };
      const say = text => console.log('PASS: ' + text);

      function walk(x, z) {
        let distance = Math.hypot(x - g.player.x, z - g.player.z), stagnation = 0;
        g.keys.add('KeyW');
        for (let i = 0; i < 1250 && distance > .105; i++) {
          const yaw = Math.atan2(g.player.x - x, g.player.z - z);
          g.yaw = yaw; const prev = distance;
          g.move(.021);
          distance = Math.hypot(x - g.player.x, z - g.player.z);
          if (prev - distance <= .002) stagnation++; else stagnation = 0;
          if (stagnation > 17) break;
        }
        g.keys.delete('KeyW');
        check(distance <= .105, `Blocked while walking to ${x.toFixed(2)}, ${z.toFixed(2)}`);
      }

      function valid(x, z, margin = .33) {
        const floor = g.floor, ground = w.ground(x, z, floor * HEIGHT + .12);
        return ground && Math.abs(ground.y - floor * HEIGHT) <= .07 && !w.moveBlocked(x, z, floor * HEIGHT, 1.75, margin);
      }

      function route(x, z, execute = true) {
        const size = .24, width = 240, length = width * width, start = g.player.clone();
        const id = (xx, zz) => Math.round(zz / size) * width + Math.round(xx / size);
        const coord = n => [(n % width) * size, Math.floor(n / width) * size];
        const source = id(start.x, start.z), goal = id(x, z);
        if (!valid(x, z, .28)) return false;
        const seen = new Int32Array(length).fill(-1), q = [source]; seen[source] = source;
        for (let i = 0; i < q.length && seen[goal] === -1; i++) {
          const v = q[i];
          for (const u of [v + 1, v - 1, v + width, v - width]) {
            if (u < 0 || u >= length || seen[u] >= 0 || !valid(...coord(u), .28)) continue;
            seen[u] = v; q.push(u);
          }
        }
        if (seen[goal] < 0) return false;
        if (!execute) return true;
        const points = [[x, z]]; let n = goal;
        for (; n !== source; n = seen[n]) points.unshift(coord(n));
        let done = 0;
        while (done < points.length) {
          let far = done;
          for (let i = done + 1; i < points.length; i++) {
            const [xx, zz] = points[i], dx = xx - g.player.x, dz = zz - g.player.z;
            const steps = Math.ceil(Math.hypot(dx, dz) / .13);
            let clear = true;
            for (let j = 1; j <= steps; j++) if (!valid(g.player.x + dx * j / steps, g.player.z + dz * j / steps, .31)) { clear = false; break; }
            if (!clear) break;
            far = i;
          }
          walk(...points[far]); done = far + 1;
        }
        return true;
      }

      function go(x, z) { check(route(x * CELL, z * CELL), `No path to cells ${x}, ${z}`); }
      function aim(x, y, z) {
        g.yaw = Math.atan2(g.player.x - x, g.player.z - z);
        g.pitch = Math.atan2(y - (g.player.y + 1.64), Math.hypot(g.player.x - x, g.player.z - z));
        g.updateCamera(0);
      }
      function target(id) {
        if (w.doors.has(id)) { const door = w.doors.get(id); return { x: door.x, y: door.def.floor * HEIGHT + (door.def.glass ? .76 : 1.32), z: door.z }; }
        const o = w.objects.get(id); check(o?.group.visible, `Invisible object ${id}`);
        const { x, y, z } = o.group.position;
        return { x, y: y + .15, z: z + (id === 'repair' ? .51 : 0) };
      }
      function interactHere(id) {
        const { x, y, z } = target(id); aim(x, y, z);
        check(g.findFocus()?.id === id, `Cannot target ${id}`);
        g.takeAction('interact');
      }
      function interact(id) {
        const { x, y, z } = target(id);
        const options = [];
        for (const d of [1.35, 1.7, 2.1, 2.48]) for (let i = 0; i < 16; i++) {
          const a = Math.PI * 2 * i / 16, xx = x + Math.cos(a) * d, zz = z + Math.sin(a) * d;
          if (!valid(xx, zz, .29) || w.occluded(g.camera.position.clone().set(xx, g.player.y + 1.64, zz), g.player.clone().set(x, y, z), .29)) continue;
          options.push([xx, zz]);
        }
        options.sort((a, b) => Math.hypot(a[0] - g.player.x, a[1] - g.player.z) - Math.hypot(b[0] - g.player.x, b[1] - g.player.z));
        for (const o of options) {
          if (!route(...o)) continue;
          aim(x, y, z);
          if (g.findFocus()?.id === id) { g.takeAction('interact'); return; }
        }
        check(false, `Could not reach ${id}`);
      }

      function ticks(seconds) {
        for (let i = 0; i < Math.ceil(seconds / .028); i++) if (!g.panel) g.update(.028);
        g.updateCamera(0); g.publish();
      }

      function stairs(id, landing) {
        const s = STAIRCASES[id], nx = s.x + STAIRS_WIDTH * .25, px = s.x + STAIRS_WIDTH * .75;
        const near = s.z + RAMP_START + 1.15, turn = s.z + TURN * .47;
        const from = g.floor, up = landing > from;
        const exit = id === 'main' ? 17.49 : 4.52;
        const door = `${from}:${from === 4 ? 'roof' : id}`;
        go(exit, 10.5);
        if (!w.doors.get(door).open) interactHere(door);
        walk(up ? nx : px, near);
        let floor = from;
        while (floor !== landing) {
          walk(up ? nx : px, turn); walk(up ? px : nx, turn); walk(up ? px : nx, near);
          floor += up ? 1 : -1;
          check(g.floor === floor && Math.abs(g.player.y - HEIGHT * floor) < .1, `Incorrect landing on ${id}: expected ${floor}`);
          if (floor !== landing) walk(up ? nx : px, near);
        }
        const d = `${landing}:${landing === 4 ? 'roof' : id}`;
        const state = w.doors.get(d);
        if (!state.open) { walk(id === 'main' ? s.x + .95 : s.x + STAIRS_WIDTH - .95, near); interactHere(d); }
        walk(exit * CELL, near);
      }

      check(g.findFocus()?.id === 'starter', 'No starter interaction at spawn');
      g.takeAction('interact'); check(owns(g.p, 'stick') && owns(g.p, 'cell') && hud.objective.id === 'blue', 'Missing starter inventory or HUD progress');
      g.health = 50; g.useItem('bandage'); check(g.health === 85 && !owns(g.p, 'bandage'), 'Bandage did not heal or consume');
      g.takeAction('lamp'); check(g.lamp, 'Flashlight did not switch on'); g.takeAction('lamp');
      interact('save-er');
      let saved = readProgress(); check(saved?.checkpoint.floor === 0 && saved.collected.includes('starter'), 'Manual checkpoint not persisted');
      interact('crowbar'); interact('fuel'); check(partCount(g.p) === 1, 'Fuel did not count');
      go(18.5, 17.2); check(room() === 'yard', 'Outdoor route disconnected');
      say('ER equipment, healing, light, checkpoint, garage and continuous yard');

      stairs('main', 1);
      interact('blue'); check(owns(g.p, 'blue') && hud.objective.id === 'red', 'Blue card missing');
      interact('clinic'); check(panel === 'note' && g.p.notes.includes('clinic'), 'Clinical note not recorded'); g.open(null);
      go(14.52, 7.5); interactHere('1:crawl'); g.melee();
      const pane = w.doors.get('1:crawl');
      check(pane.open && w.moveBlocked(pane.x, pane.z, HEIGHT, 1.75) && !w.moveBlocked(pane.x, pane.z, HEIGHT, 1.08), 'Glass opening did not leave a crouch-only passage');
      g.keys.add('ControlLeft'); walk(15.45 * CELL, 7.5 * CELL); g.keys.delete('ControlLeft'); g.move(.05);
      check(room() === 'hall', 'Crouch path did not reach east hall');
      stairs('main', 2);
      interact('2:sw'); check(w.doors.get('2:sw').open && g.p.unlocked.includes('2:sw'), 'Blue card failed to open electrical room');
      interact('wiring'); interact('2:mide'); interact('red'); interact('transfer'); g.open(null);
      check(owns(g.p, 'red') && partCount(g.p) === 2, 'Archive key or wiring missing');
      say('Main stairs, card checks, fixed pickups, and alternate loop');

      stairs('service', -1);
      interact('-1:mide'); check(!w.doors.get('-1:mide').open, 'Lab opened without power');
      interact('power'); check(panel === 'power' && g.restorePower() === false, 'Incorrect fuse pattern energized the lab');
      [0, 1, 2].forEach(i => g.flip(i)); check(g.restorePower() && g.p.power && panel === null, 'Valid fuse pattern did not energize lab');
      interact('-1:mide'); interact('module'); check(partCount(g.p) === 3, 'B1 control module not registered');
      say('Service stairs, two-factor lab lock, fuse logic and module');

      interact('-1:lift'); ticks(2); interact('-1:lift'); check(panel === 'lift', 'No elevator selector after call');
      g.chooseLift(3); ticks(5); check(g.floor === 3 && w.doors.get('3:lift').open && room() === 'lift', 'Elevator did not arrive with the player');
      walk(13.5 * CELL, 11.5 * CELL); check(room() === 'hall', 'Elevator exit blocked');
      interact('accumulator'); interact('tools'); interact('roofkey'); interact('hose');
      check(partCount(g.p) === 5 && owns(g.p, 'tools') && owns(g.p, 'roofkey'), 'Roof prerequisites missing');
      g.discard('module'); check(owns(g.p, 'module'), 'Critical flight part can be discarded');
      saved = readProgress(); check(saved && PARTS.every(part => owns(saved, part)) && saved.power && saved.checkpoint.floor === 0, 'Progress milestone damaged the checkpoint');
      interact('save-3'); saved = readProgress();
      g.harm(150);
      check(panel === 'dead' && readProgress().checkpoint.floor === 3, 'Death overwrote the save or failed to stop play');
      g.dispose(); panel = null; g = createGame(saved); w = g.world;
      check(g.floor === 3 && g.health === 100 && partCount(g.p) === 5 && g.p.unlocked.includes('-1:mide'), 'Reload from death lost key items, doors or checkpoint');
      say('Powered lift, 3rd-floor parts, death and protected checkpoint reload');

      stairs('main', 4);
      interact('antenna'); check(g.p.antenna, 'Optional transmission failed with two records');
      interact('repair'); ticks(1.55);
      for (let i = 1; i < 5; i++) { interactHere('repair'); ticks(1.55); }
      check(g.p.installed.length === 5, 'Repair steps did not install all parts');
      interactHere('repair'); check(hud.rotor > 0, 'Rotor countdown did not start');
      const giant = g.enemies.actors.find(a => a.type === 'giant');
      const initialGiant = giant.position.clone();
      interact('board'); check(!g.cinematic, 'Boarded before the rotor was ready');
      ticks(difficulty === 'story' ? 23.4 : 28.4);
      check(g.boarding && giant.position.distanceTo(initialGiant) > 5, 'Rotor did not spool or summon threat');
      check(giant.floor === 4, `Giant did not physically ascend before boarding (level ${giant.floor}, progress ${giant.flight}, start ${initialGiant.toArray().map(n => n.toFixed(2))}, now ${giant.position.toArray().map(n => n.toFixed(2))})`);
      if (render) {
        await new Promise(resolve => setTimeout(resolve, 200));
        g.camera.position.set(34.6, 4 * HEIGHT + 3.11, 32.1);
        g.camera.lookAt(11 * CELL, 4 * HEIGHT + 1.58, 9.20 * CELL);
        g.view.visible = false;
        w.update(.06, g.tick, g.camera.position, 4, true, g.p.power, false, 'normal');
        g.renderer.render(w.scene, g.camera);
      }
      interactHere('board'); check(g.cinematic > 0, 'Could not board the helicopter');
      ticks(6.2); check(panel === 'win' && readProgress().complete, 'Escape cinematic did not reach a saved ending');
      say('Roof gate, timed 5-stage repair, physical rooftop pursuit, boarding and saved ending');

      const enemy = g.enemies.actors.find(actor => actor.id === 'ward');
      const start = g.player.clone().set(15.65 * CELL, HEIGHT, 10.5 * CELL);
      const pos = start.clone().set(16.2 * CELL, HEIGHT, 12.22 * CELL);
      const sense = (p, hide = false) => ({ position: p, eye: p.clone().add(g.player.clone().set(0, 1.57, 0)), direction: p.clone().set(1, 0, 0), floor: 1, crouch: false, hiding: hide, flashlight: false, yaw: 0 });
      enemy.position.copy(start); enemy.target.copy(start); enemy.yaw = Math.atan2(pos.x - start.x, pos.z - start.z);
      w.toggleDoor('1:se', false);
      check(!g.enemies.look(enemy, sense(pos), start.distanceTo(pos)), 'Enemy saw through opaque wall or closed door');
      const openHall = start.clone().add(g.player.clone().set(0, 0, 2.2));
      check(g.enemies.look(enemy, sense(openHall), start.distanceTo(openHall)), 'Visible player not detected in corridor');
      enemy.mode = 'patrol'; enemy.eyeTimer = 0;
      const noise = start.clone().add(g.player.clone().set(-3, 0, 0));
      g.enemies.emit({ position: noise.clone(), floor: 1, radius: 11 });
      g.enemies.update(.026, sense(pos, true), () => {}, () => {});
      check(enemy.mode === 'listen' && enemy.target.distanceTo(noise) < .1, 'Enemy did not investigate the emitted sound');
      for (let i = 0; i < 35; i++) g.enemies.update(.026, sense(pos, true), () => {}, () => {});
      check(enemy.mode === 'investigate' && enemy.position.distanceTo(start) > .13 && enemy.position.distanceTo(start) < 2.5, 'Enemy teleported, stalled, or lost the sound');
      for (let i = 0; i < 540; i++) g.enemies.update(.026, sense(pos, true), () => {}, () => {});
      check(enemy.mode === 'patrol', 'Enemy did not return to patrol');
      enemy.position.copy(start); enemy.yaw = 0; enemy.eyeTimer = 0;
      g.enemies.update(.026, sense(openHall), () => {}, () => {}); check(enemy.mode === 'chase', 'Enemy did not begin a chase');
      enemy.eyeTimer = 0;
      g.enemies.update(.026, sense(pos, true), () => {}, () => {}); check(enemy.mode === 'search', 'Enemy did not search last seen position');
      say('Enemy wall occlusion, hearing, movement, patrol, chase and search transitions');
      if (!render) g.dispose();
      return { collected: [...g.p.secured], installed: [...g.p.installed], complete: g.p.complete };
    }, { render: Boolean(SHOTS), difficulty: process.env.NOBET_DIFFICULTY || 'story' });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'roof.png'), timeout: 60000 });
    console.log(`Vertical slice verified: ${result.installed.length}/5 installed; completion=${result.complete}`);
  } finally { await browser.close(); }
}

void run().catch(error => { console.error(error); process.exitCode = 1; });