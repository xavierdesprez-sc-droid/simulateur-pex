'use strict';
/** Calculation engine: curves, blend, floors, continuity, calibration. */
module.exports = function suite(__h) {
  const { check, assertClose } = __h;
  const S = advState;
  setView('advanced');
  S.oldNominalE = 5000; S.t1 = 90; S.t2 = 100; S.zeroThreshold = 0; S.min100E = 0; S.min200E = 0;
  S.fixedSalary = 50000; state.targetIncrease = 0; state.overperf = 0;
  const H = evalHybridPayoutOldNominal;

  // ===== Breakpoint curve (standard view) =====
  assertClose('breakpoint 50% → 10%', evalNewPayout(50), 10);
  assertClose('breakpoint 80% → 50%', evalNewPayout(80), 50);
  assertClose('breakpoint 100% → 100%', evalNewPayout(100), 100);
  assertClose('breakpoint 150% (linear 100-200)', evalNewPayout(150), 150);
  assertClose('cap 200%', evalNewPayout(220), 200);
  assertClose('below threshold → 0', evalNewPayout(40), 0);

  // ===== Calibration =====
  state.targetIncrease = 25; state.overperf = 3;
  assertClose('getCalibratedAchievement = mu - target increase + overperf', getCalibratedAchievement(110), 88);
  state.targetIncrease = 0; state.overperf = 0;

  // ===== Engine: integration and data-driven breakpoint table =====
  assertClose('Engine.integrate: E[X] ≈ mu', Engine.integrate(x => x, 110, 30), 110, 0.1);
  const bpEdit = [{ achievement: 0, payout: 20 }, { achievement: 50, payout: 10 }, { achievement: 80, payout: 50 }, { achievement: 100, payout: 100 }, { achievement: 200, payout: 200 }];
  assertClose('breakpoint 0 edited → payout below threshold', Engine.paliers(30, bpEdit, 200), 20);
  const bpNoZero = [{ achievement: 50, payout: 10 }, { achievement: 80, payout: 50 }, { achievement: 100, payout: 100 }, { achievement: 200, payout: 200 }];
  assertClose('breakpoint 0 removed → 0 below threshold', Engine.paliers(30, bpNoZero, 200), 0);

  // ===== Hybrid curve: zones =====
  // (old nominal 5000€, new 10000€ → r=2)
  assertClose('below T1: old scheme', H(85, 5000), 85);
  assertClose('blend x=95: straight segment 90→200', H(95, 5000), 145);
  assertClose('x=100: new nominal', H(100, 5000), 200);
  assertClose('x=110: new curve', H(110, 5000), 220);
  assertClose('x=200: 2× new nominal', H(200, 5000), 400);
  assertClose('x=210: plateau', H(210, 5000), 400);

  // ===== Linear transition (constant slope, no quadratic) =====
  const d1 = H(95, 5000) - H(94, 5000), d2 = H(99, 5000) - H(98, 5000);
  check('constant slope in the blend zone', Math.abs(d1 - d2) < 0.01);

  // ===== € floors =====
  // min200=25000 → v200=25000€=500% ; linear rise from 200% to 500% between 100 and 200
  S.min200E = 25000;
  assertClose('min200: x=100 unchanged', H(100, 5000), 200);
  assertClose('min200: x=150 steep slope', H(150, 5000), 350);
  assertClose('min200: x=200 reaches 500%', H(200, 5000), 500);
  assertClose('min200: held at 210', H(210, 5000), 500);
  S.min200E = 5000; // non-binding (100% < 400%)
  assertClose('low min200: x=150 normal', H(150, 5000), 300);
  S.min200E = 0;

  S.min100E = 12000; // newNom = max(10000, 12000, 5000) = 12000 → r=2.4
  assertClose('min100: x=100 → 240%', H(100, 5000), 240);
  assertClose('min100: x=50 below T1 unchanged', H(50, 5000), 50);
  S.min100E = 3000; // < 20% floor → non-binding
  assertClose('20% floor dominates: x=100 → 200%', H(100, 5000), 200);
  S.min100E = 0;

  // ===== Grandfathered (grandfathered > floors): hybrid == old =====
  assertClose('grandfathered x=100', H(100, 12500), 100);
  assertClose('grandfathered x=200', H(200, 12500), 200);

  // ===== Threshold 0 =====
  S.zeroThreshold = 70;
  assertClose('below threshold → 0', H(60, 5000), 0);
  assertClose('at threshold → old', H(70, 5000), 70);
  S.zeroThreshold = 0;

  // ===== T2 > 100, T2 < 80, T2 = T1 =====
  S.t2 = 150;
  assertClose('t2=150: x=120 blend', H(120, 5000), 90 + (120 - 90) / 60 * 210);
  S.t2 = 70; S.t1 = 60;
  assertClose('t2=70 < 80: base curve linear above', H(85, 5000), 170);
  S.t1 = 90; S.t2 = 90;
  assertClose('t1=t2: no NaN, new curve', isFinite(H(95, 5000)) ? 1 : 0, 1);
  S.t1 = 90; S.t2 = 100;

  // ===== 0% bonus: no NaN =====
  check('0% bonus: finite values', isFinite(H(110, 0)) && isFinite(H(50, 0)));

  // ===== Full reference on various configs =====
  function refNom(o, fixed, m100, m200) {
    const newNom = Math.max(fixed * 0.2, m100, o);
    return { o, n: newNom, v: Math.max(2 * newNom, m200) };
  }
  function refOldE(x, o) { return Math.min(x, 200) / 100 * o; }
  function refNewE(x, n) {
    if (x <= 100) return x / 100 * n.n;
    if (x <= 200) return n.n + (x - 100) / 100 * (n.v - n.n);
    return n.v;
  }
  function refPct(x, o, zero, t1, t2, fixed, m100, m200) {
    const n = refNom(o, fixed, m100, m200);
    const hybE = x => {
      if (x < zero) return 0;
      if (x < t1) return refOldE(x, n.o);
      if (x <= t2) {
        if (t2 <= t1) return refNewE(x, n);
        const t = (x - t1) / (t2 - t1);
        return refOldE(t1, n.o) + t * (refNewE(t2, n) - refOldE(t1, n.o));
      }
      return refNewE(x, n);
    };
    return n.o > 0 ? hybE(x) / n.o * 100 : 0;
  }
  const cfgs = [
    { o: 5000, t1: 90, t2: 100, z: 0, m1: 0, m2: 0 }, { o: 12500, t1: 90, t2: 100, z: 0, m1: 0, m2: 0 },
    { o: 5000, t1: 80, t2: 120, z: 0, m1: 12000, m2: 25000 }, { o: 8000, t1: 90, t2: 100, z: 70, m1: 20000, m2: 0 },
    { o: 5000, t1: 90, t2: 150, z: 0, m1: 0, m2: 30000 }, { o: 0, t1: 90, t2: 100, z: 0, m1: 0, m2: 0 },
    { o: 5000, t1: 60, t2: 80, z: 0, m1: 12000, m2: 0 }, { o: 5000, t1: 100, t2: 100, z: 0, m1: 0, m2: 0 }
  ];
  let cfgOK = true;
  for (const c of cfgs) {
    S.oldNominalE = c.o; S.t1 = c.t1; S.t2 = c.t2; S.zeroThreshold = c.z;
    S.min100E = c.m1; S.min200E = c.m2;
    for (let x = 20; x <= 220; x++) {
      if (Math.abs(H(x, c.o) - refPct(x, c.o, c.z, c.t1, c.t2, 50000, c.m1, c.m2)) > 0.01) { cfgOK = false; }
    }
  }
  check('8 configurations × 201 points = reference', cfgOK);

  // ===== Epsilon continuity at boundaries =====
  const eps = 0.001;
  let contOK = true;
  const fc = [
    { t1: 90, t2: 100, m1: 12000, m2: 25000 }, { t1: 90, t2: 150, m1: 0, m2: 25000 },
    { t1: 80, t2: 120, m1: 12000, m2: 0 }, { t1: 100, t2: 100, m1: 12000, m2: 25000 },
    { t1: 50, t2: 200, m1: 15000, m2: 35000 }
  ];
  for (const f of fc) {
    S.t1 = f.t1; S.t2 = f.t2; S.min100E = f.m1; S.min200E = f.m2; S.oldNominalE = 5000; S.zeroThreshold = 0;
    for (const bpt of [f.t1, f.t2, 100, 200]) {
      if (bpt < 20 || bpt > 219) continue;
      if (Math.abs(H(bpt + eps, 5000) - H(bpt, 5000)) > 0.1) contOK = false;
    }
  }
  check('epsilon continuity at the 4 boundaries (5 configs)', contOK);
};
