'use strict';
/** Engine.totalQuantiles : fourchettes IC 95% (facteur commun + aléa individuel). */
module.exports = function suite(__h) {
  const { check, assertClose } = __h;
  state.targetIncrease = 0; state.overperf = 0;
  const fPal = x => Engine.paliers(Math.max(0, x), state.breakpoints, state.payoutCap);

  // ===== Validation gaussienne : ρ=1, f=identité, N=1 → quantiles de N(0,1) =====
  {
    const q = Engine.totalQuantiles(x => x, [0], [1], 1);
    assertClose('Q975(Z) ≈ +1.96', q.hi, 1.96, 0.15);
    assertClose('Q025(Z) ≈ -1.96', q.lo, -1.96, 0.15);
  }

  // ===== ρ=0 : CLT pur, centré sur la moyenne, demi-largeur 1.96σ =====
  {
    const q = Engine.totalQuantiles(x => x, [110], [30], 0);
    assertClose('ρ=0 identité : centre = µ', (q.lo + q.hi) / 2, 110, 0.5);
    assertClose('ρ=0 identité : demi-largeur = 1.96×σ', (q.hi - q.lo) / 2, 1.959964 * 30, 0.5);
  }

  // ===== ρ=1 : fourchette individuelle (σ_idio = 0) =====
  {
    const f = x => Math.min(Math.max(x, 0), 200);
    const mu = 110, sigma = 30;
    const q = Engine.totalQuantiles(f, [mu], [sigma], 1);
    assertClose('ρ=1 : Q975 ≈ f(µ+1.96σ)', q.hi, f(mu + 1.959964 * sigma), 3);
    assertClose('ρ=1 : Q025 ≈ f(µ−1.96σ)', q.lo, f(mu - 1.959964 * sigma), 3);
  }

  // ===== Monotonie : la largeur du total croît avec ρ (N=10 rép) =====
  {
    const w = rho => { const q = Engine.totalQuantiles(fPal, new Array(10).fill(110), new Array(10).fill(30), rho); return q.hi - q.lo; };
    check('largeur croissante en ρ (0 < 0.5 < 0.95)', w(0) < w(0.5) && w(0.5) < w(0.95));
  }

  // ===== N rép indépendants (ρ=0) : largeur relative plus étroite =====
  {
    const one = Engine.totalQuantiles(fPal, [110], [30], 0);
    const hundred = Engine.totalQuantiles(fPal, new Array(100).fill(110), new Array(100).fill(30), 0);
    check('N=100 indép. : largeur relative réduite',
      (hundred.hi - hundred.lo) / hundred.hi < (one.hi - one.lo) / one.hi);
  }

  // ===== Ordre : lo < hi =====
  {
    const q = Engine.totalQuantiles(fPal, [110], [30], 0.3);
    check('lo < hi', q.lo < q.hi);
  }
};
