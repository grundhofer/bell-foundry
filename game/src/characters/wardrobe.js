import * as THREE from 'three';
import * as W from './weapons.js';
import { Capsules } from './capsules.js';

export const ASSETS = W.ASSETS;

const _rootNow = new THREE.Matrix4(),
  _v3 = new THREE.Vector3();

function boneLocalPoint(char, bone, x, y, z) {
  const inv = W.restMatrix(char, bone, new THREE.Matrix4()).invert(),
    v = new THREE.Vector3(x, y, z).applyMatrix4(inv);
  return { bone: char.bones[bone], x: v.x, y: v.y, z: v.z };
}
const off = (q) => [q.x, q.y, q.z];
const FLAT_HANDS = {
  pray_idle: [0, 99],
  buckled_pray: [0, 99],
  pray_to_stand: [0, 2.7],
  fall_to_pray: [1.6, 4.9],
  cast_clap: [2.3, 2.9],
};
function flatHandsEase(kit, dt) {
  const c = kit.char,
    f = FLAT_HANDS[c.clipName],
    flat = f && c.time >= f[0] && c.time <= f[1];
  kit.ease = kit.ease === undefined ? (flat ? 0 : 1) : kit.ease + ((flat ? 0 : 1) - kit.ease) * Math.min(1, dt * 5);
  return kit.ease;
}

class Kit {
  constructor(ctx, char) {
    this.ctx = ctx;
    this.char = char;
    this.scale = char.scale;
    this.body = new Capsules(char.scale);
    this.who = char.name === 'boss' ? 'boss' : 'player';
    this.fadeU = W.makeFadeUniforms(1.8 * char.scale, this.who);
    this._fade = 0;
    this.look = (char.model.userData && char.model.userData.look) || null;
    this.prevRoot = new THREE.Matrix4();
    this.started = false;
    this.moved = false;
    this.time = 0;
    this.holder = new THREE.Group();
    this.holder.name = 'kit';
    char.root.add(this.holder);
  }
  get fade() {
    return this._fade;
  }
  set fade(v) {
    this._fade = v < 0 ? 0 : v > 1 ? 1 : v;
    this.fadeU.uKit.value.x = this._fade;
    this.onFade(this._fade);
  }
  onFade() {}
  cap(name, a, b, r) {
    const p = boneLocalPoint(this.char, a[0], a[1], a[2], a[3]),
      q = boneLocalPoint(this.char, b[0], b[1], b[2], b[3]);
    this.body.add(name, p.bone, off(p), q.bone, off(q), r);
  }
  addLimbCapsule(name, a, b, r) {
    this.body.add(name, this.char.bones[a], null, this.char.bones[b], null, r);
  }
  teleport() {
    this.moved = true;
  }
  pose() {
    this.char.root.updateMatrixWorld(true);
  }
  readBody() {
    this.body.update();
    this.bodyRead = this.time;
  }
  begin(dt) {
    const root = this.char.root;
    _rootNow.copy(root.matrixWorld);
    if (this.started) {
      const a = this.prevRoot.elements,
        b = _rootNow.elements,
        jump = Math.hypot(b[12] - a[12], b[13] - a[13], b[14] - a[14]);
      if (jump > 1.2 + 0.6 * this.scale) this.moved = true;
    }
    this.body.update(this.bodyRead === this.time && this.started);
    if (this.moved && this.started) {
      this.body.teleport();
      this.body.update();
      this.onTeleport();
    }
    this.moved = false;
    this.started = true;
    this.time += dt;
    const look = this.look || (this.look = (this.char.model.userData && this.char.model.userData.look) || null),
      mood = this.ctx.gfx && this.ctx.gfx.mood;
    this.fadeU.uKit.value.y = root.position.y;
    if (look && typeof look.rim === 'number') this.fadeU.rim(look.rim);
    this.fadeU.gold(look && typeof look.gold === 'number' ? look.gold : mood ? mood.gold : 0);
  }
  end() {
    this.prevRoot.copy(_rootNow);
  }
  onTeleport() {}
  disposeKit() {
    if (this.holder.parent) this.holder.parent.remove(this.holder);
  }
}

// The boss carries the forge hammer; the body capsules keep it clear of her.
export function dressBoss(ctx, char) {
  const kit = new Kit(ctx, char),
    body = kit.body,
    B = char.bones;
  kit.cap('hipL', ['Hips', 0.066, 0.985, -0.006], ['Hips', 0.066, 0.9, -0.006], 0.124);
  kit.cap('hipR', ['Hips', -0.066, 0.985, -0.006], ['Hips', -0.066, 0.9, -0.006], 0.124);
  kit.cap('waist', ['Hips', 0, 1.06, -0.004], ['Spine1', 0, 1.24, -0.012], 0.092);
  kit.cap('chest', ['Spine2', 0, 1.3, -0.012], ['Spine2', 0, 1.4, -0.02], 0.122);
  kit.cap('shoulders', ['Spine2', -0.15, 1.4, -0.04], ['Spine2', 0.15, 1.4, -0.04], 0.085);
  kit.cap('head', ['Head', 0, 1.575, -0.008], ['Head', 0, 1.64, -0.014], 0.102);
  kit.cap('crown', ['Head', 0, 1.56, -0.01], ['Head', 0, 1.68, -0.02], 0.17);
  kit.addLimbCapsule('neck', 'Neck', 'Head', 0.062);
  for (const s of ['Left', 'Right']) {
    kit.addLimbCapsule('thigh' + s[0], s + 'UpLeg', s + 'Leg', 0.088);
    kit.addLimbCapsule('shin' + s[0], s + 'Leg', s + 'Foot', 0.07);
    kit.addLimbCapsule('foot' + s[0], s + 'Foot', s + 'ToeBase', 0.055);
    kit.addLimbCapsule('arm' + s[0], s + 'Arm', s + 'ForeArm', 0.058);
    kit.addLimbCapsule('fore' + s[0], s + 'ForeArm', s + 'Hand', 0.05);
  }
  body.build();

  const BLADE_GOLD = [1.0 * 0.85, 0.6 * 0.85, 0.21 * 0.85];
  const swordU = W.makeFadeUniforms(1.8 * char.scale, 'boss');
  const sword = W.makeWeapon(ctx, 'hammer', { fade: swordU });
  const hand = W.gripSocket(char);
  hand.add(sword.object);
  sword.glow = 0;
  const gripAt = new THREE.Vector3().setFromMatrixPosition(hand.userData.rest),
    gripLine = new THREE.Vector3().setFromMatrixColumn(hand.userData.rest, 1).normalize();
  const leftAt = W.mirrored(gripAt),
    leftLine = W.mirrored(gripLine),
    round = (sword.grip || 0.0175) + 0.0105;
  const rightHand = W.makeHand(char, 'Right', { round: { point: gripAt, axis: gripLine, radius: round } });
  const leftHand = W.makeHand(char, 'Left', { round: { point: leftAt, axis: leftLine, radius: round } }),
    leftArm = W.makeArm(char, 'Left', { point: leftAt, line: leftLine });
  const guard = W.makeCarry(char, {
    object: sword.object,
    body,
    names: ['crown', 'chest', 'waist', 'hipL', 'hipR', 'thighL', 'thighR'],
    margin: 0.01,
    segs: [{ a: [0, sword.anchors.guard.position.y + 0.03, 0], b: [0, sword.tip.position.y, 0], r: 0.016 }],
    joints: [
      { bone: B.RightHand, max: 0.6 },
      { bone: B.RightArm, max: 0.9 },
    ],
    floor: () => char.root.position.y,
  });
  const gripLo = sword.anchors.pommel.position.y + 0.122,
    gripHi = -0.1;
  const _o = new THREE.Vector3(),
    _ax = new THREE.Vector3(),
    _t = new THREE.Vector3(),
    _p0 = new THREE.Vector3(),
    _p1 = new THREE.Vector3();
  const pomY = sword.anchors.pommel.position.y,
    guardY = sword.anchors.guard.position.y;
  const toGrip = (p) => {
    const m = sword.object.matrixWorld;
    _p0.set(0, pomY + 0.05, 0).applyMatrix4(m);
    _p1
      .set(0, guardY - 0.02, 0)
      .applyMatrix4(m)
      .sub(_p0);
    const u = Math.max(0, Math.min(1, _t.subVectors(p, _p0).dot(_p1) / _p1.lengthSq()));
    return _t.addScaledVector(_p1, -u).length() / char.scale;
  };
  const PLANT_DEPTH = 0.01;
  const HAFT = sword.grip ? sword.grip - 0.0175 : 0; // (a thicker haft holds the hand that much further off its line)

  Object.assign(kit, {
    sword,
    glow: 0, // how much the boss glows: her light in cutscenes follows it (Boss.updateLight, Stage.glow)
    swordPlanted: false,
    leftOn: 0,
    leftAim: 0,
    leftPull: 0,
    gripR: 1,
    holdR: 0,
    holdL: 0,
    guards: { blade: guard },
    plantSword(x, z, yaw = 0) {
      kit.swordPlanted = true;
      const s = char.scale,
        o = sword.object;
      ctx.scene.add(o);
      const ground = ctx.arena && typeof ctx.arena.ground === 'function' ? ctx.arena.ground(x, z) : 0;
      o.scale.setScalar(s);
      o.rotation.set(Math.PI, yaw + Math.PI / 2, 0);
      o.position.set(x, ground + (sword.tip.position.y - PLANT_DEPTH) * s, z);
      o.updateMatrixWorld(true);
      o.visible = true;
    },
    takeSword() {
      kit.swordPlanted = false;
      const o = sword.object;
      hand.add(o);
      o.scale.setScalar(1);
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      guard.rest(0.25);
      kit.gripR = Math.max(kit.gripR, kit.holdR);
      o.visible = kit.fade < 0.995;
    },
    // The hands as the last update left them, laid on a fresh pose (a cutscene's cut re-poses the figure between updates).
    hands() {
      const e = kit.ease === undefined ? 1 : kit.ease;
      if (kit.gripR < 0.999) rightHand.relax(e);
      leftHand.relax(e);
      rightHand.set(kit.gripR);
      if (kit.swordPlanted) {
        rightHand.set(kit.holdR);
        leftHand.set(kit.holdL);
      } else leftHand.set(kit.leftOn < 0.004 ? 0 : kit.leftOn);
    },
    onFade(f) {
      sword.object.visible = f < 0.995 || kit.swordPlanted;
    },
    update(dt) {
      kit.pose();
      kit.readBody();
      const easy = flatHandsEase(kit, dt);
      kit.gripR += ((kit.swordPlanted ? 0 : 1) - kit.gripR) * Math.min(1, dt * 14);
      if (kit.gripR < 0.999) rightHand.relax(easy);
      leftHand.relax(easy);
      rightHand.set(kit.gripR);
      {
        const a = swordU.uKit.value,
          b = kit.fadeU.uKit.value;
        a.copy(b);
        if (kit.swordPlanted) a.x = 0;
        swordU.uKitRim.value.copy(kit.fadeU.uKitRim.value);
        {
          const g = swordU.uKitGold.value;
          g.copy(kit.fadeU.uKitGold.value);
          g.x = BLADE_GOLD[0];
          g.y = BLADE_GOLD[1];
          g.z = BLADE_GOLD[2];
        }
      }
      if (kit.swordPlanted) {
        hand.getWorldPosition(_v3);
        let near = toGrip(_v3) - HAFT,
          want = near < 0.1 ? 1 : near > 0.19 ? 0 : 1 - (near - 0.1) / 0.09;
        kit.holdR += (want - kit.holdR) * Math.min(1, dt * 10);
        rightHand.set(kit.holdR);
        leftArm.hollow(_v3);
        near = toGrip(_v3) - HAFT;
        want = near < 0.1 ? 1 : near > 0.19 ? 0 : 1 - (near - 0.1) / 0.09;
        kit.holdL += (want - kit.holdL) * Math.min(1, dt * 10);
        leftHand.set(kit.holdL);
      } else {
        kit.holdR = 0;
        kit.holdL = 0;
      }
      if (!kit.swordPlanted) {
        guard.update(dt);
        const e = sword.object.matrixWorld.elements,
          s = char.scale;
        _o.set(e[12], e[13], e[14]);
        _ax.set(e[4], e[5], e[6]).normalize();
        leftArm.hollow(_v3);
        let along = _t.subVectors(_v3, _o).dot(_ax) / s;
        along = along < gripLo ? gripLo : along > gripHi ? gripHi : along;
        _t.copy(_o).addScaledVector(_ax, along * s);
        const d = _v3.distanceTo(_t) / s,
          w = d < 0.12 ? 1 : d > 0.2 ? 0 : 1 - (d - 0.12) / 0.08,
          want = w * w * (3 - 2 * w);
        if (ctx.cine && ctx.cine.playing) {
          const r = 1 - Math.exp(-dt * (want > kit.leftAim ? 12 : 8));
          kit.leftAim += (want - kit.leftAim) * r;
          kit.leftOn += (kit.leftAim - kit.leftOn) * r;
        } // (two stages in cutscenes, so the hand starts to close without a jump)
        else {
          kit.leftOn += (want - kit.leftOn) * (1 - Math.exp(-dt * (want > kit.leftOn ? 9 : 6)));
          kit.leftAim = kit.leftOn;
        }
        const ww = kit.leftOn < 0.004 ? 0 : kit.leftOn;
        const far = d > 0.2 ? 0.2 / d : 1;
        if (far < 1) _t.lerpVectors(_v3, _t, far);
        kit.leftPull = d * far * ww;
        if (ww > 0) {
          leftArm.align(_ax, ww * far);
          leftArm.reach(_t, ww);
        }
        leftHand.set(ww);
      } else {
        kit.leftOn = 0;
        kit.leftAim = 0;
        kit.leftPull = 0;
      }
      kit.begin(dt);
      const m = sword.materials;
      if (m.hammer_head) m.hammer_head.emissiveIntensity = Math.max(0, sword.glow - 0.5) * 3.2; // (only at her tells: phase two's steady shine would leave it glowing copper all the time)
      kit.end();
    },
    dispose() {
      W.disposeWeapon(sword);
      rightHand.open();
      leftHand.open();
      if (hand.parent) hand.parent.remove(hand);
      kit.disposeKit();
    },
  });
  return kit;
}

export function dressPilgrim(ctx, char) {
  const kit = new Kit(ctx, char),
    body = kit.body,
    B = char.bones;
  kit.cap('hipL', ['Hips', 0.075, 1.0, 0.01], ['Hips', 0.075, 0.9, 0.01], 0.148);
  kit.cap('hipR', ['Hips', -0.075, 1.0, 0.01], ['Hips', -0.075, 0.9, 0.01], 0.148);
  kit.cap('belly', ['Hips', 0, 1.08, 0.02], ['Spine1', 0, 1.22, 0.02], 0.148);
  kit.cap('chest', ['Spine2', 0, 1.27, -0.005], ['Spine2', 0, 1.39, -0.012], 0.168);
  kit.cap('head', ['Head', 0, 1.6, -0.01], ['Head', 0, 1.68, 0], 0.148);
  for (const s of ['Left', 'Right']) {
    const x = s === 'Left' ? 1 : -1;
    kit.addLimbCapsule('thigh' + s[0], s + 'UpLeg', s + 'Leg', 0.108);
    kit.addLimbCapsule('shin' + s[0], s + 'Leg', s + 'Foot', 0.085);
    kit.cap('arm' + s[0], [s + 'Arm', x * 0.21, 1.35, -0.014], [s + 'ForeArm', x * 0.302, 1.203, -0.011], 0.078);
    kit.addLimbCapsule('fore' + s[0], s + 'ForeArm', s + 'Hand', 0.066);
  }
  body.build();

  const look = { fade: kit.fadeU };
  const sword = W.makeFrame('sword'),
    scabbard = W.makeFrame('scabbard'),
    shield = W.makeWeapon(ctx, 'shield', look);
  const hand = W.gripSocket(char);
  hand.add(sword.object);
  const arm = W.shieldSocket(char);
  arm.add(shield.object);
  const scabAt = new THREE.Vector3(0.212, 1.045, 0.078),
    scabLine = new THREE.Vector3(0.09, -0.82, -0.565).normalize();
  const sy = scabLine.clone().negate(),
    sz = new THREE.Vector3(scabAt.x, 0, scabAt.z - 0.003).normalize();
  sz.addScaledVector(sy, -sz.dot(sy)).normalize();
  const hip = W.attachToBone(
    char,
    'Hips',
    new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(sy, sz), sy, sz).setPosition(scabAt),
    'kit:scabbard',
  );
  kit.holder.add(scabbard.object);
  scabbard.length = scabbard.anchors.chape ? -scabbard.anchors.chape.position.y : 0.83;
  const bladeCut = sword.cut;
  const hang = new W.Hanger(hip, scabbard.object, scabbard.length, {
    capsules: body,
    use: ['thighL', 'shinL', 'thighR', 'shinR'],
    radius: 0.028,
    floor: () => char.root.position.y + 0.012,
    centre: B.Hips,
    rest: -scabLine.y,
    hang: 0.7,
  });
  const sheath = scabbard.anchors.sword,
    homeY = sheath.position.y;
  const gripAt = new THREE.Vector3().setFromMatrixPosition(hand.userData.rest),
    gripLine = new THREE.Vector3().setFromMatrixColumn(hand.userData.rest, 1).normalize();
  const strapAt = shield.anchors.hand.position.clone().applyMatrix4(arm.userData.rest),
    strapLine = new THREE.Vector3().setFromMatrixColumn(arm.userData.rest, 1).normalize();
  const rightHand = W.makeHand(char, 'Right', { round: { point: gripAt, axis: gripLine, radius: 0.0135 + 0.012 } });
  const leftHand = W.makeHand(char, 'Left', { round: { point: strapAt, axis: strapLine, radius: 0.008 + 0.012 } });
  const rim = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 8) * Math.PI;
    rim.push({
      a: [Math.cos(a) * 0.305, Math.sin(a) * 0.305, 0.012],
      b: [Math.cos(a) * 0.305, Math.sin(a) * 0.305, 0.012],
      r: 0.008,
    });
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 4) * Math.PI;
    rim.push({
      a: [Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.035],
      b: [Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.035],
      r: 0.008,
    });
  }
  rim.push({ a: [0, 0, 0.05], b: [0, 0, 0.05], r: 0.008 });
  const flask = W.makeWeapon(ctx, 'flask', look);
  const fOut = new THREE.Vector3(0.19, 0, -0.105).normalize(),
    fUp = new THREE.Vector3(0.04, 1, -0.02).normalize();
  fOut.addScaledVector(fUp, -fOut.dot(fUp)).normalize();
  const flaskBelt = W.attachToBone(
    char,
    'Hips',
    new THREE.Matrix4()
      .makeBasis(new THREE.Vector3().crossVectors(fUp, fOut), fUp, fOut)
      .setPosition(0.196, 0.945, -0.108),
    'kit:flask',
  );
  const cupAt = W.mirrored(gripAt),
    cupUp = W.mirrored(gripLine),
    cupOut = W.handFrame(char, 'Left', {}).n.clone();
  cupOut.addScaledVector(cupUp, -cupOut.dot(cupUp)).normalize();
  const flaskHandAt = W.attachToBone(
    char,
    'LeftHand',
    new THREE.Matrix4()
      .makeBasis(new THREE.Vector3().crossVectors(cupUp, cupOut), cupUp, cupOut)
      .setPosition(cupAt.clone().addScaledVector(cupUp, 0.012)),
    'kit:flask-hand',
  );
  const cupHand = W.makeHand(char, 'Left', { round: { point: cupAt, axis: cupUp, radius: 0.027 + 0.009 } });
  kit.holder.add(flask.object);
  flask.object.matrixAutoUpdate = false;
  const elbowPivot = new THREE.Vector3(0.147, 0, -0.035),
    _Y = new THREE.Vector3(0, 1, 0);
  const _fp = new THREE.Vector3(),
    _fq = new THREE.Quaternion(),
    _fs = new THREE.Vector3(),
    _hp = new THREE.Vector3(),
    _hq = new THREE.Quaternion(),
    _fm = new THREE.Matrix4(),
    _fi = new THREE.Matrix4();
  const boardGuard = W.makeCarry(char, {
    object: shield.object,
    body,
    names: ['chest', 'belly', 'head', 'hipL', 'hipR', 'thighL', 'thighR'],
    segs: rim,
    margin: 0.006,
    joints: [
      { bone: B.LeftForeArm, max: 0.6 },
      { bone: B.LeftArm, max: 0.7 },
    ],
    order: [1, 0],
  });
  const guard = W.makeCarry(char, {
    object: sword.object,
    body,
    names: ['head', 'chest', 'belly', 'hipL', 'hipR', 'thighL', 'thighR'],
    margin: 0.01,
    segs: [{ a: [0, sword.anchors.guard.position.y, 0], b: [0, sword.tip.position.y, 0], r: 0.012 }],
    joints: [
      { bone: B.RightHand, max: 0.6 },
      { bone: B.RightArm, max: 0.9 },
    ],
    disc: { object: shield.object, radius: 0.315, offset: 0.025 },
    floor: () => char.root.position.y + 0.02,
  });
  const _f = new THREE.Vector3(),
    _a = new THREE.Vector3(),
    _b2 = new THREE.Vector3(),
    _tu = new THREE.Vector3(),
    _ts = new THREE.Vector3(),
    _tq = new THREE.Quaternion();
  const TRAY = 1.08,
    TRAY_FROM = 0.87;

  Object.assign(kit, {
    sword,
    shield,
    scabbard,
    sheathed: false,
    gripR: 1,
    guards: { blade: guard, board: boardGuard },
    hang,
    drawT: 9,
    aimed: 0,
    flask,
    sip: 0,
    boardTilt: 0,
    tray: 0,
    traySide: 0,
    trayMin: TRAY,
    sheathe(on) {
      const was = kit.sheathed;
      kit.sheathed = !!on;
      const o = sword.object;
      if (on) {
        sheath.add(o);
        o.position.set(0, 0, 0);
        o.quaternion.identity();
      } else {
        hand.add(o);
        o.position.set(0, 0, 0);
        o.quaternion.identity();
        if (was) {
          guard.rest(0.35);
          kit.drawT = 0;
        }
      }
    },
    onTeleport() {
      hang.teleport();
    },
    onFade(f) {
      const vis = f < 0.995;
      for (const w of [sword, scabbard, shield, flask]) w.object.visible = vis;
    },
    update(dt) {
      kit.gripR += ((kit.sheathed ? 0 : 1) - kit.gripR) * Math.min(1, dt * 14);
      if (kit.gripR < 0.999) rightHand.relax(flatHandsEase(kit, dt));
      rightHand.set(kit.gripR);
      leftHand.set(1);
      const sipping = char.overlayName === 'drink' || char.clipName === 'drink';
      kit.sip += ((sipping ? 1 : 0) - kit.sip) * Math.min(1, dt * (sipping ? 10 : 6));
      if (kit.sip < 0.002) kit.sip = 0;
      cupHand.set(kit.sip);
      kit.pose();
      kit.readBody();
      {
        let need = 0;
        const o = shield.object;
        if (kit.sip > 0.01) {
          for (let i = 0; i < 3; i++) {
            arm.worldToLocal((i === 0 ? B.LeftHand : i === 1 ? B.LeftHandIndex1 : flaskHandAt).getWorldPosition(_a));
            need = Math.max(
              need,
              (_a.z + (i === 0 ? 0.03 : i === 1 ? 0.04 : 0.055)) / Math.max(0.1, elbowPivot.x - _a.x),
            );
          }
        }
        const want = Math.asin(Math.min(0.5, Math.max(0, need))) * kit.sip;
        kit.boardTilt += (want - kit.boardTilt) * Math.min(1, dt * 14);
        if (kit.boardTilt < 0.002) kit.boardTilt = 0;
        if (kit.boardTilt > 0 || o.quaternion.w < 1) {
          o.quaternion.setFromAxisAngle(_Y, kit.boardTilt);
          o.position.copy(elbowPivot).sub(_v3.copy(elbowPivot).applyQuaternion(o.quaternion));
          o.updateMatrixWorld(true);
        }
      }
      {
        const e = shield.object.matrixWorld.elements,
          el = Math.hypot(e[8], e[9], e[10]) || 1,
          high = e[13] - char.root.position.y;
        B.LeftForeArm.getWorldPosition(_a);
        B.LeftHand.getWorldPosition(_b2);
        _b2.sub(_a).normalize();
        const uy = Math.sqrt(Math.max(0, 1 - _b2.y * _b2.y));
        let want = 0,
          t;
        if (uy > 0.5 && high > 0.8) {
          _tu
            .set(0, 1, 0)
            .addScaledVector(_b2, -_b2.y)
            .multiplyScalar(1 / uy);
          _ts.crossVectors(_b2, _tu);
          t = Math.atan2(
            (e[8] * _ts.x + e[9] * _ts.y + e[10] * _ts.z) / el,
            (e[8] * _tu.x + e[9] * _tu.y + e[10] * _tu.z) / el,
          );
          kit.traySide = -1;
          const lean = t * kit.traySide,
            w =
              Math.min(1, (uy - 0.5) / 0.25) *
              Math.min(1, (high - 0.8) / 0.25) *
              (1 - kit.sip) *
              Math.min(1, Math.max(0, (e[9] / el - 0.62) / 0.18));
          if (lean < TRAY_FROM && lean > -0.6 * TRAY_FROM)
            want = kit.traySide * Math.min(1.9, kit.trayMin * (1 - lean / TRAY_FROM)) * w;
        }
        const step = (Math.abs(want) > Math.abs(kit.tray) ? 0.34 : 0.16) * dt * 60;
        kit.tray += Math.max(-step, Math.min(step, want - kit.tray));
        if (Math.abs(kit.tray) < 0.003 && want === 0) {
          kit.tray = 0;
          kit.traySide = 0;
        }
        if (kit.tray !== 0) {
          const f = B.LeftForeArm;
          f.parent.matrixWorld.decompose(_fp, _hq, _fs);
          f.quaternion.premultiply(_fq.copy(_hq).invert().multiply(_tq.setFromAxisAngle(_b2, kit.tray)).multiply(_hq));
          f.updateMatrixWorld(true);
        }
      }
      boardGuard.update(dt);
      if (!kit.sheathed) guard.update(dt);
      kit.begin(dt);
      hand.getWorldPosition(_f);
      sheath.getWorldPosition(_a);
      kit.drawT += dt;
      const near = _f.distanceTo(_a),
        want = kit.sheathed ? (near < 0.12 ? 1 : near > 0.34 ? 0 : 1 - (near - 0.12) / 0.22) : kit.drawT < 0.2 ? 1 : 0;
      kit.aimed += (want - kit.aimed) * Math.min(1, dt * (want > kit.aimed ? 16 : 5));
      if (kit.aimed < 0.002) kit.aimed = 0;
      hang.aimed = kit.aimed;
      hang.aim.copy(_f);
      hang.update(dt);
      scabbard.object.updateMatrixWorld(true);
      if (kit.sheathed)
        sword.object.position.y = -Math.max(0, Math.min(0.3, hang.piv.distanceTo(_f) - homeY)) * kit.aimed;
      if (bladeCut) {
        if (kit.sheathed) {
          const d = hang.dir;
          bladeCut.set(d.x, d.y, d.z, d.dot(hang.x) - 0.035);
        } else bladeCut.w = 1e9;
      }
      {
        const k = kit.sip * kit.sip * (3 - 2 * kit.sip);
        flaskBelt.matrixWorld.decompose(_fp, _fq, _fs);
        if (k > 0) {
          flaskHandAt.matrixWorld.decompose(_hp, _hq, _fs);
          _fp.lerp(_hp, k);
          _fq.slerp(_hq, k);
        }
        _fm.compose(_fp, _fq, _fs);
        flask.object.matrix.copy(_fi.copy(kit.holder.matrixWorld).invert()).multiply(_fm);
        flask.object.updateMatrixWorld(true);
      }
      kit.end();
    },
    dispose() {
      for (const w of [sword, scabbard, shield, flask]) W.disposeWeapon(w);
      for (const s of [hand, hip, arm, flaskBelt, flaskHandAt]) if (s.parent) s.parent.remove(s);
      rightHand.open();
      leftHand.open();
      kit.disposeKit();
    },
  });
  return kit;
}
