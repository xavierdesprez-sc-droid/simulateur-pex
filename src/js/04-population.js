
    // ===== REAL POPULATION (Google Sheet via Apps Script, or local CSV) =====
    let advPopulation = []; // { id, orga, position, country, fixed, nominal }
    let popAutoLoaded = false;

    function setPopulationStatus(text, visible = true) {
      ['pop-status', 'four-to-one-status'].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          el.innerText = text;
          if (visible) el.classList.remove('hidden');
      });
    }

    function applyPopulationCsv(res, sourceName) {
      if (!res.reps.length) {
          setPopulationStatus('No valid rows found in ' + sourceName);
          return;
      }
      advPopulation = res.reps;
      setPopulationStatus(res.reps.length + ' rep(s) loaded from ' + sourceName);
      refreshPopulation();
    }

    function showCsvPicker() {
      setPopulationStatus('Automatic CSV loading blocked by the browser — choose the CSV file…');
      const input = document.getElementById('pop-csv-input');
      if (input.click) input.click();
    }

    function loadPopulationCsvFile(file) {
      setPopulationStatus('Loading ' + file.name + '…');
      const reader = new FileReader();
      reader.onload = () => applyPopulationCsv(parsePopulationCsv(reader.result), file.name);
      reader.onerror = () => setPopulationStatus('Reading error: ' + file.name);
      reader.readAsText(file);
    }

    function loadPopulationFromSheet() {
      if (typeof google !== 'undefined' && google.script && google.script.run) {
          setPopulationStatus('Loading from the Sheet…');
          google.script.run
            .withSuccessHandler(reps => {
              advPopulation = Array.isArray(reps) ? reps : (reps && Array.isArray(reps.reps) ? reps.reps : []);
              setPopulationStatus(advPopulation.length
                ? advPopulation.length + ' rep(s) loaded from the Sheet'
                : 'No valid rows found in the Sheet (check header row 4 and columns ID / Base Salary / Amount)');
              refreshPopulation();
            })
            .withFailureHandler(err => {
              setPopulationStatus('Loading error: ' + (err && err.message ? err.message : err));
            })
            .getPopulation();
          return;
      }
      // Local mode: fetch the CSV sitting next to index.html, fall back to a picker
      setPopulationStatus('Loading population_test.csv…');
      fetch('population_test.csv')
          .then(async r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
          applyPopulationCsv(parsePopulationCsv(await r.text()), 'population_test.csv');
          })
          .catch(err => {
            if ((err instanceof TypeError) || /^HTTP/.test(String(err && err.message))) showCsvPicker();
            else setPopulationStatus('Loading error: ' + (err && err.message ? err.message : err));
          });
    }

    let realAgg = null; // actual aggregates (€) when a population is loaded

    let popFilters = { orga: '', country: '', position: '' };

    const escapeHtmlStr = v => String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;" }[c]));

    // Repopulates filter options from the loaded population,
    // keeping the current selection if it still exists (otherwise "All").
    // Both filter sets (Advanced view + Matrix tab) stay in sync.
    const FILTER_KEYS = ['orga', 'country', 'position'];
    const FILTER_SETS = ['pop', 'matrix', 'four-to-one'];

    function populatePopFilters() {
      FILTER_KEYS.forEach(key => {
        const vals = [...new Set(advPopulation.map(r => String(r[key] || '').trim()).filter(Boolean))].sort();
        if (vals.indexOf(popFilters[key]) === -1) popFilters[key] = '';
        FILTER_SETS.forEach(prefix => {
          const sel = document.getElementById(prefix + '-filter-' + key);
          sel.innerHTML = '<option value="">All</option>' + vals.map(v => '<option value="' + escapeHtmlStr(v) + '">' + escapeHtmlStr(v) + '</option>').join('');
          sel.value = popFilters[key];
        });
      });
    }

    function readPopFilters(prefix) {
      FILTER_KEYS.forEach(key => {
        popFilters[key] = document.getElementById(prefix + '-filter-' + key).value || '';
      });
      FILTER_SETS.forEach(p => {
        FILTER_KEYS.forEach(key => {
          const sel = document.getElementById(p + '-filter-' + key);
          if (sel) sel.value = popFilters[key];
        });
      });
    }

    function filteredPopulation() {
      return advPopulation.filter(r =>
        (!popFilters.orga || String(r.orga || '').trim() === popFilters.orga) &&
        (!popFilters.country || String(r.country || '').trim() === popFilters.country) &&
        (!popFilters.position || String(r.position || '').trim() === popFilters.position));
    }

    function onPopFilterChange() {
      readPopFilters('pop');
      refreshPopulation();
    }

    function onMatrixFilterChange() {
      readPopFilters('matrix');
      refreshPopulation();
    }

    function onFourToOneFilterChange() {
      readPopFilters('four-to-one');
      refreshPopulation();
    }

    function updateFourToOneExplainer() {
      const corridorEcho = document.getElementById('four-to-one-corridor-echo');
      if (corridorEcho) corridorEcho.innerText = Math.round(normalizeFourToOneCorridor(fourToOneState.corridorC2P)).toLocaleString('en-US') + ' €';
      const pointsEcho = document.getElementById('four-to-one-points-echo');
      if (pointsEcho) pointsEcho.innerText = '+' + (60000 / normalizeFourToOneCorridor(fourToOneState.corridorC2P) * 100).toFixed(1) + ' points';
    }

    function refreshPopulation() {
      const has = advPopulation.length > 0;
      document.getElementById('pop-results').classList.toggle('hidden', !has);
      document.getElementById('pop-clear-btn').classList.toggle('hidden', !has);
      document.getElementById('pop-input-zone').classList.toggle('hidden', has);
      document.getElementById('matrix-filter-zone').classList.toggle('hidden', !has);
      document.getElementById('four-to-one-results').classList.toggle('hidden', !has);
      document.getElementById('four-to-one-input-zone').classList.toggle('hidden', has);
      updateFourToOneExplainer();
      if (!has) {
        realAgg = null; popMatrix = null;
        // Reset the 3 shared top strips (markup: src/top-strip.js)
        ['hyb-top', 'four-to-one', 'matrix'].forEach(p => {
          [p + '-pex-old', p + '-pex-standard', p + '-pex-fourtoone', p + '-pex-hybrid'].forEach(id => {
            const el = document.getElementById(id); if (el) el.innerText = '—';
          });
          [p + '-pex-standard-delta', p + '-pex-fourtoone-delta', p + '-pex-hybrid-delta'].forEach(id => {
            const el = document.getElementById(id); if (el) el.innerText = '— vs current';
          });
        });
        ['hyb-top-pnl', 'four-to-one-pnl', 'four-to-one-pnl-c2p'].forEach(id => {
          const el = document.getElementById(id); if (el) el.innerText = '—';
        });
        const htStatus = document.getElementById('hyb-top-status');
        if (htStatus) htStatus.innerText = 'load a population below';
        const mxStatus = document.getElementById('matrix-top-status');
        if (mxStatus) mxStatus.innerText = 'load a population to display the matrix';
        renderMatrix();
        return;
      }

      populatePopFilters();
      const population = filteredPopulation();
      if (popFilters.orga || popFilters.country || popFilters.position) {
        document.getElementById('pop-status').innerText = advPopulation.length + ' loaded, ' + population.length + ' displayed';
      }

      // Two distributions: historical (current scheme) and calibrated (target increase)
      const mu0 = state.muInit;
      const muC = getCalibratedAchievement(state.muInit);
      const sigma = state.sigmaInit;
      // Densities pre-computed once for all reps
      const pts0 = Engine.densityPoints(mu0, sigma);
      const ptsC = Engine.densityPoints(muC, sigma);
      const int0 = fn => { let a = 0; for (const { x, w } of pts0) a += fn(x) * w; return a; };
      const intC = fn => { let a = 0; for (const { x, w } of ptsC) a += fn(x) * w; return a; };

      let pexOld = 0, pexHyb = 0, pexNew = 0, pexFourToOne = 0;
      let stdOld = 0, stdNew = 0, targetOld = 0, targetNew = 0;
      let losers = 0, worstLoss = 0, lossSum = 0;
      const rows = [];
      population.forEach(rep => {
        // Standard view: 20% floor of rep's fixed salary, breakpoint curve
        const newNomStd = Math.max(rep.fixed * state.newVarShare / 100, rep.nominal);
        const nomAdv = advNominals(rep.nominal, rep.fixed);
        const eStdOld = int0(x => Engine.oldE(x, { oldNomE: rep.nominal, cap: state.payoutCap }));
        const eStdNew = intC(x => Engine.paliers(x, state.breakpoints, state.payoutCap) / 100 * newNomStd);
        const eHyb = intC(x => Engine.hybridE(x, nomAdv));
        const eNewFull = intC(x => Engine.newBaseE(x, nomAdv));
        const eFourToOne = int0(x => evalFourToOnePayout(x, rep));
        pexOld += eStdOld; stdOld += eStdOld;
        stdNew += eStdNew; targetOld += rep.nominal; targetNew += newNomStd;
        pexHyb += eHyb; pexNew += eNewFull; pexFourToOne += eFourToOne;
        const delta = eHyb - eStdOld;
        if (delta < -0.5) { losers++; worstLoss = Math.min(worstLoss, delta); lossSum += delta; }
        rows.push({
          rep, eOld: eStdOld, eHyb, delta, eNew: eNewFull, deltaNew: eNewFull - eStdOld,
          eStandard: eStdNew, eFourToOne, fourToOne: fourToOneNominals(rep.nominal, rep.fixed)
        });
      });

      realAgg = { stdOld, stdNew, targetOld, targetNew, pexOld, pexHyb, pexNew, pexFourToOne, count: population.length };
      popMatrix = computeMatrix(population, pts0, ptsC, mu0, muC, matrixSize);

      const fmtM = v => (v / 1e6).toFixed(2) + ' M€';
      const fmtE = v => Math.round(v).toLocaleString('en-US') + ' €';
      // Safe DOM setter (elements may differ per view)
      const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
      // Shared top strips (Hybrid / 4:1 / Matrix): main figure = ΔPEX vs current,
      // colored by sign (emerald = savings at/below current, rose = overrun).
      const setDeltaMain = (id, deltaM) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerText = (deltaM >= 0 ? '+' : '') + deltaM.toFixed(2) + ' M€';
        const cls = typeof el.className === 'string' ? el.className : '';
        el.className = cls.replace(/text-(slate|indigo|cyan|orange|emerald|rose)-[0-9]00/g, deltaM <= 0 ? 'text-emerald-600' : 'text-rose-600');
      };
      const updateTopStrip = (p, vals) => {
        setText(p + '-pex-old', fmtM(vals.old));
        setDeltaMain(p + '-pex-standard', (vals.std - vals.old) / 1e6);
        setText(p + '-pex-standard-delta', 'vs current');
        setDeltaMain(p + '-pex-fourtoone', (vals.four - vals.old) / 1e6);
        setText(p + '-pex-fourtoone-delta', 'vs current');
        setDeltaMain(p + '-pex-hybrid', (vals.hyb - vals.old) / 1e6);
        setText(p + '-pex-hybrid-delta', 'vs current');
      };

      document.getElementById('pop-risk-count').innerText = losers + ' / ' + population.length;
      document.getElementById('pop-risk-max').innerText = losers ? fmtE(worstLoss) : '—';
      document.getElementById('pop-risk-avg').innerText = losers ? fmtE(lossSum / losers) : '—';

      // Dynamic 4:1 explainer: points of target for +60 000 € objective at the entered corridor
      updateFourToOneExplainer();

      // Keep the C2P and PEX impacts in the same scope when filters are active.
      const populationShare = advPopulation.length ? population.length / advPopulation.length : 1;
      const fourC2pGainGrossM = state.baseC2P * (state.overperf / 100) * populationShare;
      const fourC2pGainM = fourC2pGainGrossM * (state.marginRate / 100);
      const fourC2pGainEl = document.getElementById('four-to-one-c2p-gain');
      fourC2pGainEl.innerText = (fourC2pGainM >= 0 ? '+' : '') + fourC2pGainM.toFixed(2) + ' M€';
      fourC2pGainEl.className = 'text-2xl font-black ' + (fourC2pGainM >= 0 ? 'text-emerald-600' : 'text-rose-600');
      document.getElementById('four-to-one-c2p-gain-gross').innerText =
        (fourC2pGainGrossM >= 0 ? '+' : '') + fourC2pGainGrossM.toFixed(1) + ' M€ C2P';

      const fourPnlM = fourC2pGainM + (pexOld - pexFourToOne) / 1e6;
      const fourPnlEl = document.getElementById('four-to-one-pnl');
      fourPnlEl.innerText = (fourPnlM >= 0 ? '+' : '') + fourPnlM.toFixed(2) + ' M€';
      fourPnlEl.className = 'text-2xl font-black ' + (fourPnlM >= 0 ? 'text-emerald-400' : 'text-rose-400');
      setText('four-to-one-pnl-c2p', (fourC2pGainM >= 0 ? '+' : '') + fourC2pGainM.toFixed(2) + ' M€');

      // Hybrid P&L (same filtered scope)
      const hybC2pGainM = fourC2pGainGrossM * (state.marginRate / 100);
      const hybPnlM = hybC2pGainM + (pexOld - pexHyb) / 1e6;
      const hybPnlEl = document.getElementById('hyb-top-pnl');
      if (hybPnlEl) {
        hybPnlEl.innerText = (hybPnlM >= 0 ? '+' : '') + hybPnlM.toFixed(2) + ' M€';
        hybPnlEl.className = 'text-2xl mt-1 font-black ' + (hybPnlM >= 0 ? 'text-emerald-400' : 'text-rose-400');
      }
      setText('hyb-top-c2p', (hybC2pGainM >= 0 ? '+' : '') + hybC2pGainM.toFixed(2) + ' M€');
      setText('hyb-top-status', population.length + ' rep(s) displayed');
      setText('matrix-top-status', population.length + ' rep(s) displayed');

      // One call per tab — same numbers, same filters (see src/top-strip.js)
      const stripVals = { old: pexOld, std: stdNew, hyb: pexHyb, four: pexFourToOne };
      updateTopStrip('hyb-top', stripVals);
      updateTopStrip('four-to-one', stripVals);
      updateTopStrip('matrix', stripVals);

      const escapeHtml = v => String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;" }[c]));
      rows.sort((a, b) => a.delta - b.delta);
      const tbody = document.getElementById('pop-table-body');
      tbody.innerHTML = rows.map(r => {
        const deltaCls = r.delta > 20 ? 'text-emerald-600' : r.delta < -20 ? 'text-rose-600' : 'text-slate-400';
        const deltaNewCls = r.deltaNew > 20 ? 'text-emerald-600' : r.deltaNew < -20 ? 'text-rose-600' : 'text-slate-400';
        return '<tr class="hover:bg-slate-50/80">' +
          '<td class="py-1.5 px-3 text-slate-500">' + escapeHtml(r.rep.id) + '</td>' +
          '<td class="py-1.5 px-3 text-slate-600">' + fmtE(r.rep.fixed) + '</td>' +
          '<td class="py-1.5 px-3 text-slate-600">' + fmtE(r.rep.nominal) + '</td>' +
          '<td class="py-1.5 px-3 text-slate-500">' + fmtE(r.eOld) + '</td>' +
          '<td class="py-1.5 px-3 font-bold text-amber-600">' + fmtE(r.eHyb) + '</td>' +
          '<td class="py-1.5 px-3 font-bold ' + deltaCls + '">' + (r.delta > 0 ? '+' : '') + fmtE(r.delta) + '</td>' +
          '<td class="py-1.5 px-3 font-bold text-indigo-700">' + fmtE(r.eNew) + '</td>' +
          '<td class="py-1.5 px-3 font-bold ' + deltaNewCls + '">' + (r.deltaNew > 0 ? '+' : '') + fmtE(r.deltaNew) + '</td></tr>';
      }).join('');

      const fourTbody = document.getElementById('four-to-one-table-body');
      const fourRows = [...rows].sort((a, b) => b.fourToOne.achievementShift - a.fourToOne.achievementShift);
      fourTbody.innerHTML = fourRows.map(r => {
        const deltaFour = r.eFourToOne - r.eOld;
        const deltaFourCls = deltaFour > 20 ? 'text-emerald-600' : deltaFour < -20 ? 'text-rose-600' : 'text-slate-400';
        return '<tr class="hover:bg-slate-50/80">' +
          '<td class="py-1.5 px-3 text-slate-500">' + escapeHtml(r.rep.id) + '</td>' +
          '<td class="py-1.5 px-3 text-slate-600">' + fmtE(r.rep.fixed) + '</td>' +
          '<td class="py-1.5 px-3 text-slate-600">' + fmtE(r.rep.nominal) + '</td>' +
          '<td class="py-1.5 px-3 text-cyan-700">' + fmtE(r.fourToOne.nominalIncreaseE) + '</td>' +
          '<td class="py-1.5 px-3 text-cyan-700">' + fmtE(r.fourToOne.objectiveIncreaseE) + '</td>' +
          '<td class="py-1.5 px-3 text-cyan-700">' + r.fourToOne.achievementShift.toFixed(1) + ' pp</td>' +
          '<td class="py-1.5 px-3 text-slate-500">' + fmtE(r.eOld) + '</td>' +
          '<td class="py-1.5 px-3 text-indigo-700">' + fmtE(r.eStandard) + '</td>' +
          '<td class="py-1.5 px-3 font-bold text-cyan-700">' + fmtE(r.eFourToOne) + '</td>' +
          '<td class="py-1.5 px-3 font-bold ' + deltaFourCls + '">' + (deltaFour > 0 ? '+' : '') + fmtE(deltaFour) + '</td></tr>';
      }).join('');

      renderMatrix();
    }
