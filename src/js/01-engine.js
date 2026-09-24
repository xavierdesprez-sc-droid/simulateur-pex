
    // ============================================================
    // ===== CALCULATION ENGINE (pure — no DOM references here) ====
    // ============================================================
    const Engine = {
      // Normalized density: [{x, w}] with Σw = 1 over the ±4.5σ window
      densityPoints(mu, sigma, step = 0.5) {
        const minX = Math.max(0, mu - 4.5 * sigma), maxX = mu + 4.5 * sigma;
        const pts = []; let total = 0;
        for (let x = minX; x <= maxX; x += step) { const d = normalPdf(x, mu, sigma) * step; pts.push({ x, d }); total += d; }
        return pts.map(p => ({ x: p.x, w: p.d / total }));
      },

      // E[fn(X)] with X ~ N(mu, sigma) truncated at ±4.5σ
      integrate(fn, mu, sigma, step = 0.5) {
        let acc = 0;
        for (const { x, w } of this.densityPoints(mu, sigma, step)) acc += fn(x) * w;
        return acc;
      },

      // A rep's curve context (all in €)
      hybridContext(oldNomE, fixedE, targetSharePct, min100E, min200E, zero, t1, t2, cap) {
        const newNomE = Math.max(fixedE * targetSharePct / 100, min100E, oldNomE);
        const val200E = Math.max(2 * newNomE, min200E);
        return { oldNomE, newNomE, val200E, zero, t1, t2, cap };
      },

      oldE(x, ctx) { return Math.min(x, ctx.cap) / 100 * ctx.oldNomE; },

      newBaseE(x, ctx) {
        if (x <= 100) return x / 100 * ctx.newNomE;
        if (x <= 200) return ctx.newNomE + (x - 100) / 100 * (ctx.val200E - ctx.newNomE);
        return ctx.val200E;
      },

      hybridE(x, ctx) {
        if (x < ctx.zero) return 0;
        if (x < ctx.t1) return Engine.oldE(x, ctx);
        if (x <= ctx.t2) {
          if (ctx.t2 <= ctx.t1) return Engine.newBaseE(x, ctx);
          const t = (x - ctx.t1) / (ctx.t2 - ctx.t1);
          const start = Engine.oldE(ctx.t1, ctx);
          return start + t * (Engine.newBaseE(ctx.t2, ctx) - start);
        }
        return Engine.newBaseE(x, ctx);
      },

      // Breakpoint curve (standard view) — driven by the table, with no hidden assumption:
      // the achievement breakpoint 0 anchors the "below threshold" payout (the threshold = 2nd breakpoint)
      paliers(x, breakpoints, cap) {
        const bps = [...breakpoints].sort((a, b) => a.achievement - b.achievement);
        const belowPayout = bps[0].achievement === 0 ? bps[0].payout : 0;
        const threshold = bps.length > 1 ? bps[1].achievement : bps[0].achievement;
        if (x < threshold) return Math.min(belowPayout, cap);
        for (let i = 1; i < bps.length - 1; i++) {
          const p1 = bps[i], p2 = bps[i + 1];
          if (x >= p1.achievement && x <= p2.achievement) {
            if (p1.achievement === p2.achievement) return Math.min(p2.payout, cap);
            const t = (x - p1.achievement) / (p2.achievement - p1.achievement);
            return Math.min(p1.payout + t * (p2.payout - p1.payout), cap);
          }
        }
        return Math.min(bps[bps.length - 1].payout, cap);
      }
    };

    // Parses a population CSV using the active cluster profile.
    function isExcludedPopulationOrga(orga) {
      const pattern = activePopulationProfile.excludedOrgaPattern;
      return Boolean(pattern && pattern.test(String(orga || '')));
    }

    function parsePopulationCsv(text) {
      const lines = String(text || '').split(/\r?\n/).filter(l => l.trim() !== '');
      const reps = [];
      let ignored = 0;
      const c = activePopulationProfile.columns;
      for (let i = activePopulationProfile.csvHeaderRow; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'));
        const cell = n => cells.length > n ? cells[n] : '';
        const fixed = Number(cell(c.fixed)) || 0;
        const nominal = Number(cell(c.nominal)) || 0;
        if (isExcludedPopulationOrga(c.orga === undefined ? '' : cell(c.orga)) ||
            !cell(c.country).trim() ||
            !cell(c.jobProfile).trim() ||
            !(fixed > 0 && nominal >= 0)) {
          ignored++;
          continue;
        }
        reps.push({
          jobProfile: cell(c.jobProfile),
          country: cell(c.country),
          fixed, nominal
        });
      }
      return { reps, ignored };
    }

    // Normal probability density function with constant sigma
    function normalPdf(x, mu, sigma) {
      const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI));
      const exponent = -0.5 * Math.pow((x - mu) / sigma, 2);
      return coeff * Math.exp(exponent);
    }

    // Evaluate old linear payout curve: payout = min(x, 200)
    function evalOldPayout(achievement) {
      if (achievement < 0) return 0;
      return Math.min(achievement, state.payoutCap);
    }

    // Evaluate new piecewise linear payout curve (delegated to the engine)
    function evalNewPayout(achievement) {
      return Engine.paliers(achievement, state.breakpoints, state.payoutCap);
    }
