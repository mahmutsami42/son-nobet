import * as T from 'three';

export function seeded(seed: number) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

const cube = new T.BoxGeometry();
export const solid = (color: string | number, roughness = .71, metalness = .06) => new T.MeshStandardMaterial({ color, roughness, metalness });
export const luminous = (color: string | number, intensity = 1) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .4 });

type Block = [number, number, number, number, number, number, number];
export class Batch {
  private blocks = new Map<T.Material, Block[]>();
  constructor(readonly group: T.Group) {}
  box(x: number, y: number, z: number, w: number, h: number, d: number, mat: T.Material, yaw = 0) {
    const block: Block = [x, y, z, w, h, d, yaw];
    const items = this.blocks.get(mat);
    if (items) items.push(block); else this.blocks.set(mat, [block]);
  }
  flush() {
    const temp = new T.Object3D();
    for (const [mat, blocks] of this.blocks) {
      const mesh = new T.InstancedMesh(cube, mat, blocks.length);
      blocks.forEach(([x, y, z, w, h, d, yaw], i) => {
        temp.position.set(x, y, z); temp.scale.set(w, h, d); temp.rotation.y = yaw; temp.updateMatrix(); mesh.setMatrixAt(i, temp.matrix);
      });
      mesh.computeBoundingSphere(); this.group.add(mesh);
    }
    this.blocks.clear();
  }
}

export function box(group: T.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, material: T.Material) {
  const mesh = new T.Mesh(cube, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); group.add(mesh); return mesh;
}

export function pipe(group: T.Object3D, a: T.Vector3, b: T.Vector3, radius: number, mat: T.Material, sides = 8) {
  const axis = b.clone().sub(a);
  const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, axis.length(), sides), mat);
  mesh.position.copy(a).addScaledVector(axis, .5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), axis.normalize()); group.add(mesh); return mesh;
}

function grime(type: 'plaster' | 'tiles' | 'floor' | 'metal' | 'concrete') {
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = seeded(1118 + type.length * 73);
  const base = type === 'plaster' ? 161 : type === 'tiles' ? 139 : type === 'floor' ? 137 : type === 'metal' ? 150 : 122;
  const im = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = (random() - .5) * 37 + Math.sin(x * .039 + Math.sin(y * .06) * 2) * 9 + Math.cos(y * .074) * 7;
    const edge = type === 'plaster' ? (y / size) ** 6 * 27 : 0;
    const i = 4 * (y * size + x);
    im.data[i] = base + n - edge; im.data[i + 1] = base + n - edge + 2; im.data[i + 2] = base + n - edge; im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  for (let i = 0; i < 130; i++) {
    const x = random() * size, y = random() * size, r = 2 + random() * 20;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(46,40,29,${random() * .20})`); grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (type === 'plaster' && i < 28) { ctx.fillStyle = '#2632261b'; ctx.fillRect(x, y, .5 + random() * 2, random() * 63); }
  }
  if (type === 'floor' || type === 'tiles' || type === 'concrete') {
    const stride = type === 'tiles' ? 32 : type === 'floor' ? 64 : 128;
    for (let i = 0; i < size; i += stride) {
      ctx.fillStyle = '#101a1b55'; ctx.fillRect(i, 0, type === 'tiles' ? 1.3 : 2.3, size); ctx.fillRect(0, i, size, 2);
      ctx.fillStyle = '#d0d9cd39'; ctx.fillRect(i + 2, 0, .8, size); ctx.fillRect(0, i + 2, size, .8);
    }
  }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.anisotropy = 4; return texture;
}

export function materials() {
  const plaster = grime('plaster'), tiles = grime('tiles'), floor = grime('floor'), metalTex = grime('metal'), concrete = grime('concrete');
  const textured = (color: number, map: T.Texture, roughness: number, metalness = .04) => new T.MeshStandardMaterial({ color, map, roughness, metalness });
  return {
    wall: textured(0xd6d3ba, plaster, .83), tile: textured(0x769b88, tiles, .58), bWall: textured(0xa0aa9a, concrete, .94),
    floor: textured(0xa4b6ac, floor, .47, .22), darkFloor: textured(0x858e86, floor, .67, .19), ceiling: textured(0x939c93, concrete, .92),
    rubber: solid(0x243330), trim: textured(0x838d82, metalTex, .69, .22), metal: textured(0x828577, metalTex, .62, .31),
    door: textured(0x708d79, metalTex, .67), heavyDoor: textured(0x6d7871, metalTex, .71), red: textured(0xa8574a, metalTex, .68),
    steel: solid(0x7d9193, .40, .49), dark: solid(0x222e2c, .66, .20), white: textured(0xc6c6b4, plaster, .73),
    linen: solid(0x8caaa1, .98), sheet: solid(0xb9bcaa, .97), paper: solid(0xc6bea6, .92), wood: textured(0xab8166, metalTex, .72),
    glass: solid(0x355b59, .18, .42), glassShine: solid(0x678a87, .31, .51), ground: textured(0x6d837e, concrete, .82),
    road: textured(0x536260, floor, .66), yellow: solid(0xb4a263, .8), letter: solid(0x9daea0, .78),
    cold: luminous(0xc0e6dc, 1.4), dim: luminous(0x639a91, .48), hot: luminous(0xc95945, .92), green: luminous(0x76c3a2, .83),
  };
}
export type Materials = ReturnType<typeof materials>;

export function sign(w: number, h: number, title: string, sub?: string, color = '#b2c6b9', background = '#23302e') {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.max(48, Math.round(512 * h / w));
  const ctx = canvas.getContext('2d')!, cw = canvas.width, ch = canvas.height;
  ctx.fillStyle = background; ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = '#a5b5a961'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, cw - 8, ch - 8);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${sub ? Math.floor(ch * .39) : Math.floor(ch * .53)}px Arial`;
  ctx.fillText(title, cw / 2, sub ? ch * .37 : ch / 2 + 2, cw - 34);
  if (sub) { ctx.font = `${Math.floor(ch * .19)}px monospace`; ctx.fillStyle = '#abb8aa'; ctx.fillText(sub, cw / 2, ch * .73, cw - 28); }
  const r = seeded(392);
  for (let i = 0; i < 390; i++) { ctx.fillStyle = i % 2 ? '#090e0b35' : '#a4ab9c13'; ctx.fillRect(r() * cw, r() * ch, r() * 5 + 1, r() * 2 + 1); }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 6;
  return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: texture, roughness: .76, side: T.DoubleSide, emissiveMap: texture, emissive: 0x8ca098, emissiveIntensity: .25 }));
}

export function floorGlow(color: string) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const rad = ctx.createRadialGradient(48, 48, 0, 48, 48, 48); rad.addColorStop(0, color); rad.addColorStop(1, 'transparent');
  ctx.fillStyle = rad; ctx.fillRect(0, 0, 96, 96);
  const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace;
  return new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
}

export type EnemyStyle = 'slow' | 'fast' | 'giant';
export function enemyModel(type: EnemyStyle) {
  const root = new T.Group(), torso = new T.Group(), head = new T.Group();
  const giant = type === 'giant', fast = type === 'fast';
  const fabric = solid(giant ? 0x68756a : fast ? 0x728178 : 0x8c9690, .96);
  const pants = solid(0x3c4843, .94), skin = solid(0x9f8d78, .93), hair = solid(0x303533, .96), shoes = solid(0x242826), line = solid(0xb4b4a2, .94);
  const sphere = (p: T.Object3D, mat: T.Material, x: number, y: number, z: number, a: number, b: number, c: number) => {
    const o = new T.Mesh(new T.SphereGeometry(1, 10, 8), mat); o.position.set(x, y, z); o.scale.set(a, b, c); p.add(o); return o;
  };
  torso.position.y = .96; torso.rotation.x = fast ? .17 : .085; root.add(torso);
  sphere(torso, fabric, 0, .34, 0, giant ? .38 : .28, .42, giant ? .23 : .16);
  const apron = box(torso, 0, .17, .11, giant ? .48 : .35, .53, .08, fabric); apron.rotation.z = -.035;
  box(torso, -.125, .36, .155, .09, .13, .019, line);
  box(torso, 0, .43, .167, .025, .43, .014, pants);
  sphere(torso, skin, 0, .69, .02, .083, .12, .085);
  head.position.set(0, .83, .044); torso.add(head);
  sphere(head, skin, 0, 0, 0, .131, .174, .126);
  sphere(head, hair, 0, .064, -.034, .139, .123, .113);
  sphere(head, skin, 0, -.017, .108, .043, .055, .029);
  for (const side of [-1, 1]) {
    sphere(head, skin, side * .125, -.025, -.003, .025, .047, .032);
    sphere(head, hair, side * .048, .011, .108, .028, .014, .012);
  }
  const arms: T.Group[] = [], legs: T.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(side * (giant ? .360 : .275), .54, 0); arm.rotation.z = side * .145; torso.add(arm); arms.push(arm);
    sphere(arm, fabric, 0, -.14, 0, giant ? .116 : .092, .22, .091);
    sphere(arm, skin, .018 * side, -.37, .028, .060, .17, .066);
    sphere(arm, skin, .032 * side, -.51, .062, .063, .097, .045);
    const leg = new T.Group(); leg.position.set(side * .14, 1.04, 0); root.add(leg); legs.push(leg);
    sphere(leg, pants, 0, -.28, 0, .127, .39, .13);
    sphere(leg, pants, side * .011, -.66, -.027, .094, .31, .079);
    sphere(leg, shoes, side * .015, -.94, .068, .099, .071, .154);
  }
  if (giant) root.scale.set(1.28, 1.29, 1.31);
  else if (fast) root.scale.set(.93, .97, .96);
  return { root, torso, head, arms, legs };
}

export function helicopter(m: Materials) {
  const hull = new T.Group(), rotor = new T.Group(), tailRotor = new T.Group();
  const paint = solid(0x9dadaa, .62, .28), tinted = solid(0x203c3e, .22, .5), stripe = solid(0xa35647, .62, .22), black = solid(0x243134, .51, .35);
  const ellipsoid = (x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: T.Material) => {
    const mesh = new T.Mesh(new T.SphereGeometry(1, 24, 14), mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); hull.add(mesh); return mesh;
  };
  ellipsoid(.14, 1.64, 0, 3.28, 1.19, 1.33, paint);
  ellipsoid(-.06, 1.27, 0, 3.13, .62, 1.32, stripe);
  ellipsoid(-.6, 2.45, 0, 1.45, .63, 1.0, paint);
  ellipsoid(1.78, 1.98, 0, 1.50, .72, 1.03, tinted);
  for (const s of [-1, 1]) {
    const side = box(hull, .78, 1.89, s * 1.176, 1.47, .87, .12, black); side.rotation.y = s * .14; side.rotation.z = -.06;
    const window = box(hull, .82, 1.99, s * 1.248, 1.29, .52, .06, tinted); window.rotation.y = s * .14;
    box(hull, -.64, 1.89, s * 1.24, 1.02, .58, .09, tinted);
    box(hull, -.7, 1.37, s * 1.26, 1.17, .12, .10, m.letter);
    box(hull, .15, 1.56, s * 1.32, .23, .065, .06, m.steel);
    box(hull, 1.46, .5, s * 1.24, 1.38, .10, .18, black);
    for (const k of [-1.5, 1.42]) pipe(hull, new T.Vector3(k, 1.03, s * .61), new T.Vector3(k, .26, s * 1.45), .083, m.steel);
    pipe(hull, new T.Vector3(-2.6, .24, s * 1.46), new T.Vector3(2.41, .24, s * 1.46), .092, m.steel);
    pipe(hull, new T.Vector3(2.41, .24, s * 1.46), new T.Vector3(2.7, .39, s * 1.46), .085, m.steel);
    box(hull, -.78, 2.55, s * .93, .93, .26, .14, black);
    for (let i = 0; i < 7; i++) box(hull, -1.15 + i * .12, 2.55, s * 1.018, .022, .21, .01, m.trim);
  }
  const windshieldSpine = box(hull, 2.47, 2.05, 0, .75, .085, .072, paint); windshieldSpine.rotation.z = -.33;
  pipe(hull, new T.Vector3(-2.4, 1.79, 0), new T.Vector3(-7.25, 2.15, 0), .28, paint, 12);
  const stabilizer = box(hull, -6.58, 2.69, 0, .73, 1.51, .18, stripe); stabilizer.rotation.z = .39;
  box(hull, -6.18, 2.08, 0, .73, .11, 2.15, paint);
  box(hull, -7.14, 3.23, .03, .19, .12, .19, m.hot);
  pipe(hull, new T.Vector3(-.52, 2.81, 0), new T.Vector3(-.52, 3.38, 0), .14, m.steel);
  rotor.position.set(-.52, 3.36, 0); hull.add(rotor);
  for (let i = 0; i < 4; i++) {
    const blade = new T.Group(); blade.rotation.y = Math.PI * i / 2 + .32; rotor.add(blade);
    box(blade, 3.55, .012, .06, 6.72, .038, .255, black); box(blade, 6.71, .02, .06, .40, .042, .263, stripe);
  }
  tailRotor.position.set(-7.14, 2.49, .22); hull.add(tailRotor);
  box(tailRotor, 0, 0, 0, 1.4, .11, .062, black); box(tailRotor, 0, 0, .021, .11, 1.4, .062, black);
  const badge = sign(1.35, .26, 'KUZGUN • 07', undefined, '#c8c9b8', '#536260'); badge.position.set(-1.1, 1.18, 1.296); hull.add(badge);
  return { hull, rotor, tailRotor };
}