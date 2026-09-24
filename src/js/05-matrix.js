
    let matrixMode = 'deltas';
    let matrixSize = '2x2';
    let popMatrix = null;

    // E[fn(X) | distribution half]: density renormalized over x < mu (low) or x > mu (high)
    function halfInt(pts, mu, side) {
      const f = pts.filter(p => side === 'low' ? p.x < mu : p.x > mu);
      const tot = f.reduce((a, p) => a + p.w, 0);
      if (!tot) return () => 0;
      return fn => { let a = 0; for (const p of f) a += fn(p.x) * p.w / tot; return a; };
    }

    // Mass tercile cut points of a density: x where cumulative mass reaches 1/3 then 2/3
    function tercileCuts(pts) {
      const cuts = []; let acc = 0;
      for (const p of pts) {
        acc += p.w;
        if (cuts.length === 0) { if (acc >= 1 / 3) cuts.push(p.x); }
        else if (acc >= 2 / 3) { cuts.push(p.x); break; }
      }
      return cuts;
    }

    // E[fn(X) | mass tercile]: low x < c1, mid c1 <= x < c2, top x >= c2
    function bandInt(pts, cuts, band) {
      const f = pts.filter(p => band === 'low' ? p.x < cuts[0] : band === 'top' ? p.x >= cuts[1] : p.x >= cuts[0] && p.x < cuts[1]);
      const tot = f.reduce((a, p) => a + p.w, 0);
      if (!tot) return () => 0;
      return fn => { let a = 0; for (const p of f) a += fn(p.x) * p.w / tot; return a; };
    }

    function computeMatrix(population, pts0, ptsC, mu0, muC, size) {
      if (!population.length) return null;
      const three = size === '3x3';
      const salaryKeys = three ? ['low', 'mid', 'high'] : ['low', 'high'];
      const perfKeys = three ? ['low', 'mid', 'top'] : ['low', 'top'];
      const meanFixed = population.reduce((a, r) => a + r.fixed, 0) / population.length;
      const out = { size, meanFixed, count: {}, quadrants: {} };
      const sorted = [...population].sort((a, b) => a.fixed - b.fixed);
      let groups;
      if (three) {
        const n3 = Math.floor(sorted.length / 3);
        groups = { low: sorted.slice(0, n3), mid: sorted.slice(n3, 2 * n3), high: sorted.slice(2 * n3) };
      } else {
        groups = { low: sorted.filter(r => r.fixed < meanFixed), high: sorted.filter(r => r.fixed >= meanFixed) };
      }
      const cuts0 = three ? tercileCuts(pts0) : null;
      const cutsC = three ? tercileCuts(ptsC) : null;
      salaryKeys.forEach(salary => {
        const reps = groups[salary];
        out.count[salary] = reps.length;
        out.quadrants[salary] = {};
        perfKeys.forEach(perf => {
          if (!reps.length) { out.quadrants[salary][perf] = null; return; }
          const side = three ? perf : (perf === 'top' ? 'high' : 'low');
          const i0 = three ? bandInt(pts0, cuts0, side) : halfInt(pts0, mu0, side);
          const iC = three ? bandInt(ptsC, cutsC, side) : halfInt(ptsC, muC, side);
          let sOld = 0, sHyb = 0, sNew = 0, sFourToOne = 0;
          reps.forEach(rep => {
            const nomAdv = advNominals(rep.nominal, rep.fixed);
            sOld += i0(x => Engine.oldE(x, { oldNomE: rep.nominal, cap: state.payoutCap }));
            sHyb += iC(x => Engine.hybridE(x, nomAdv));
            sNew += iC(x => Engine.newBaseE(x, nomAdv));
            sFourToOne += i0(x => evalFourToOnePayout(x, rep));
          });
          out.quadrants[salary][perf] = {
            old: sOld / reps.length,
            hyb: sHyb / reps.length,
            new: sNew / reps.length,
            fourToOne: sFourToOne / reps.length
          };
        });
      });
      return out;
    }

    function setMatrixMode(mode) {
      matrixMode = mode;
      const on = 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 transition-all';
      const off = 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 transition-all';
      document.getElementById('matrix-mode-levels').className = mode === 'levels' ? on : off;
      document.getElementById('matrix-mode-deltas').className = mode === 'deltas' ? on : off;
      renderMatrix();
    }

    function setMatrixSize(size) {
      matrixSize = size;
      const on = 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 transition-all';
      const off = 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 transition-all';
      document.getElementById('matrix-size-2').className = size === '2x2' ? on : off;
      document.getElementById('matrix-size-3').className = size === '3x3' ? on : off;
      refreshPopulation();
    }

    function renderMatrix() {
      const empty = document.getElementById('matrix-empty');
      const grid = document.getElementById('matrix-grid');
      if (!popMatrix) {
        empty.classList.remove('hidden');
        grid.classList.add('hidden');
        return;
      }
      empty.classList.add('hidden');
      const three = popMatrix.size === '3x3';
      const salaryKeys = three ? ['low', 'mid', 'high'] : ['low', 'high'];
      const perfKeys = three ? ['low', 'mid', 'top'] : ['low', 'top'];
      const cellCls = 'p-2 rounded-lg bg-slate-50 border border-slate-200 text-center';
      grid.className = 'grid ' + (three ? 'grid-cols-[auto_1fr_1fr_1fr]' : 'grid-cols-[auto_1fr_1fr]') + ' gap-2 text-xs';
      const headPosition = p => 'text-center font-semibold text-slate-500 row-start-1 col-start-' + (p === 'low' ? 2 : p === 'mid' ? 3 : three ? 4 : 3);
      const headLow = document.getElementById('matrix-head-low');
      const headMid = document.getElementById('matrix-head-mid');
      const headTop = document.getElementById('matrix-head-top');
      headLow.className = headPosition('low');
      headMid.className = three ? headPosition('mid') : 'hidden text-center font-semibold text-slate-500';
      headTop.className = headPosition('top');
      headLow.style.gridRow = '1'; headLow.style.gridColumn = '2';
      headMid.style.gridRow = '1'; headMid.style.gridColumn = '3';
      headTop.style.gridRow = '1'; headTop.style.gridColumn = three ? '4' : '3';
      document.getElementById('matrix-row-mid').className = (three ? '' : 'hidden ') + 'self-center font-semibold text-slate-500';
      ['low', 'mid', 'high'].forEach(q => {
        const row = salaryKeys.indexOf(q) + 2;
        const rowEl = document.getElementById('matrix-row-' + q);
        if (rowEl) {
          rowEl.className = (q === 'mid' && !three ? 'hidden ' : '') + 'self-center font-semibold text-slate-500 row-start-' + row + ' col-start-1';
          rowEl.style.gridRow = row + '';
          rowEl.style.gridColumn = '1';
        }
      });
      ['low', 'mid', 'high'].forEach(q => {
        ['low', 'mid', 'top'].forEach(p => {
          const active = salaryKeys.indexOf(q) > -1 && perfKeys.indexOf(p) > -1;
          const el = document.getElementById('matrix-' + q + '-' + p);
          el.className = (active ? '' : 'hidden ') + cellCls;
          el.style.gridRow = (salaryKeys.indexOf(q) + 2) + '';
          el.style.gridColumn = (perfKeys.indexOf(p) + 2) + '';
        });
      });
      document.getElementById('matrix-sub-low').innerText = three ? 'lower third of distribution' : 'lower half of distribution';
      document.getElementById('matrix-sub-mid').innerText = 'middle third of distribution';
      document.getElementById('matrix-sub-top').innerText = three ? 'upper third of distribution' : 'upper half of distribution';
      salaryKeys.forEach(q => {
        document.getElementById('matrix-count-' + q).innerText = popMatrix.count[q] + ' reps';
      });
      const fmtMx = v => Math.round(v).toLocaleString('en-US') + ' €';
      const deltaCls = v => v < 0 ? 'text-rose-600' : 'text-emerald-600';
      const chip = txt => '<span class="text-[9px] font-semibold uppercase tracking-wide bg-white border border-slate-200 rounded px-1 mr-1">' + txt + '</span>';
      const cell = d => {
        const fourToOne = activePopulationProfile.views.fourToOne
          ? (matrixMode === 'levels'
            ? '<span class="block font-bold text-cyan-600">' + chip('4:1') + fmtMx(d.fourToOne) + '</span>'
            : '<span class="block font-bold ' + deltaCls(d.fourToOne - d.old) + '">' + chip('4:1') + ((d.fourToOne - d.old) > 0 ? '+' : '') + fmtMx(d.fourToOne - d.old) + '</span>')
          : '';
        if (matrixMode === 'levels') {
          return '<span class="block font-bold text-amber-600">' + chip('Hyb') + fmtMx(d.hyb) + '</span>'
               + '<span class="block font-bold text-indigo-600">' + chip('New') + fmtMx(d.new) + '</span>'
               + fourToOne;
        }
        const dh = d.hyb - d.old, dn = d.new - d.old;
        return '<span class="block font-bold ' + deltaCls(dh) + '">' + chip('&Delta; Hyb') + (dh > 0 ? '+' : '') + fmtMx(dh) + '</span>'
             + '<span class="block font-bold ' + deltaCls(dn) + '">' + chip('&Delta; New') + (dn > 0 ? '+' : '') + fmtMx(dn) + '</span>'
             + fourToOne;
      };
      salaryKeys.forEach(q => {
        perfKeys.forEach(p => {
          const d = popMatrix.quadrants[q][p];
          const row = salaryKeys.indexOf(q) + 2;
          const col = perfKeys.indexOf(p) + 2;
          const el = document.getElementById('matrix-' + q + '-' + p);
          el.className = cellCls + ' row-start-' + row + ' col-start-' + col;
          el.innerHTML = (!d || !popMatrix.count[q]) ? '<span class="text-slate-300">—</span>' : cell(d);
        });
      });
    }

    setMatrixMode(matrixMode);
    setMatrixSize(matrixSize);

    function toggleDatasetAdv(index) {
      const ds = advChartInstance.data.datasets[index];
      ds.hidden = !ds.hidden;
      if (index === 6) {
        advChartInstance.data.datasets[7].hidden = ds.hidden;
      }
      if (index === 6 && advChartInstance.options.scales.density) {
        advChartInstance.options.scales.density.display = !ds.hidden;
      }
      advChartInstance.update();
      const btn = document.getElementById(index === 6 ? 'btn-adv-gaussian' : 'btn-adv-standard');
      if (!btn) return;
      btn.className = ds.hidden
        ? 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 transition-all'
        : index === 6
          ? 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-green-50 text-green-700 border border-green-200 transition-all'
          : 'px-2.5 py-1 text-xs font-semibold rounded-lg bg-purple-50 text-purple-700 border border-purple-200 transition-all';
    }
