
    function syncTargetSliders() {
      const v = state.targetIncrease;
      const s1 = document.getElementById('slider-target-increase');
      const s2 = document.getElementById('adv-target-increase');
      if (s1) s1.value = v;
      if (s2) s2.value = v;
      const label = (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
      const l1 = document.getElementById('val-target-increase');
      const l2 = document.getElementById('adv-val-target-increase');
      if (l1) l1.innerText = label;
      if (l2) l2.innerText = label;
      const s3 = document.getElementById('matrix-target-increase');
      if (s3) s3.value = v;
      const l3 = document.getElementById('matrix-val-target-increase');
      if (l3) l3.innerText = label;
    }

    // Keeps the 4 min inputs (Advanced view + Matrix tab) in sync with advState
    function syncMinInputs() {
      const pairs = [['adv-min-100', advState.min100E], ['adv-min-200', advState.min200E], ['matrix-min-100', advState.min100E], ['matrix-min-200', advState.min200E]];
      pairs.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      });
    }

    function setView(view) {
      const isAdv = view === 'advanced';
      const isMatrix = view === 'matrix';
      const isFourToOne = view === 'four-to-one';
      document.getElementById('view-standard').classList.toggle('hidden', isAdv || isMatrix || isFourToOne);
      document.getElementById('view-advanced').classList.toggle('hidden', !isAdv);
      document.getElementById('view-matrix').classList.toggle('hidden', !isMatrix);
      document.getElementById('view-four-to-one').classList.toggle('hidden', !isFourToOne);
      const active = 'px-3 py-1.5 rounded-lg bg-white shadow-sm ';
      const inactive = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-indigo-600 transition-all';
      document.getElementById('tab-standard').className = (view === 'standard') ? active + 'text-indigo-600' : inactive;
      document.getElementById('tab-advanced').className = isAdv ? active + 'text-orange-600' : inactive;
      document.getElementById('tab-matrix').className = isMatrix ? active + 'text-emerald-600' : inactive;
      document.getElementById('tab-four-to-one').className = isFourToOne ? active + 'text-cyan-600' : inactive;
      if (isAdv) {
        // Lazy init: Chart.js needs a visible container to size correctly
        if (!advChartInstance) initAdvChart();
        updateAdvancedView();
        // Auto-load the Sheet population on first visit to the advanced view
        if (!popAutoLoaded) {
          popAutoLoaded = true;
          loadPopulationFromSheet();
        }
      }
      if (isFourToOne) {
        if (!popAutoLoaded) {
          popAutoLoaded = true;
          loadPopulationFromSheet();
        } else {
          refreshPopulation();
        }
      }
      if (isMatrix) renderMatrix();
    }

    // Presets
    function applyPreset(presetKey) {
      document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
        b.classList.add('text-slate-600');
      });

      if (presetKey === 'initial') {
        state.targetIncrease = 0;
        state.overperf = 0;
        state.muInit = 110;
        state.sigmaInit = 30;
        document.getElementById('preset-initial').classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
      } else if (presetKey === 'targetGroup') {
        // Absolute pp: mu = 110, targetIncrease = +30pp → new mu = 110 - 30 = 80%
        state.targetIncrease = 30;
        state.overperf = 0;
        state.muInit = 110;
        state.sigmaInit = 30;
        document.getElementById('preset-targetGroup').classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
      } else if (presetKey === 'highIncentive') {
        state.targetIncrease = 30;
        state.overperf = 2; // +2 pp induced overperformance
        state.muInit = 110;
        state.sigmaInit = 30;
        document.getElementById('preset-highIncentive').classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
      }

      syncInputsFromState();
      updateDashboard();
    }

    function resetDefaults() {
      state.currentPEX = 2.5;
      state.sigmaInit = 30;
      state.muInit = 110;
      state.oldVarShare = 11;
      state.newVarShare = 20;
      state.marginRate = 20;
      state.repFixedSalary = 50000;
      state.repCurrentBonusPct = 10;
      state.repInitPerf = 110;
      fourToOneState.corridorC2P = 300000;
      state.breakpoints = [
        { achievement: 0, payout: 0 },
        { achievement: 40, payout: 0 },
        { achievement: 100, payout: 100 },
        { achievement: 200, payout: 200 }
      ];
      renderBreakpointsTable();
      applyPreset('initial');
    }

    // All overperformance sliders (Standard + the 3 shared top strips), kept in sync
    const OVERPERF_PAIRS = [
      ['slider-overperf', 'val-overperf'],
      ['four-to-one-overperf', 'four-to-one-overperf-value'],
      ['hyb-overperf', 'hyb-overperf-value'],
      ['matrix-overperf', 'matrix-overperf-value']
    ];

    function syncOverperfSliders() {
      const value = state.overperf;
      const label = (value >= 0 ? '+' : '') + value.toFixed(1) + '%';
      OVERPERF_PAIRS.forEach(([sliderId, labelId]) => {
        const s = document.getElementById(sliderId);
        const l = document.getElementById(labelId);
        if (s) s.value = value;
        if (l) l.innerText = label;
      });
    }

    function syncInputsFromState() {
      syncTargetSliders();
      syncOverperfSliders();

      document.getElementById('input-mu-init').value = state.muInit;
      document.getElementById('input-sigma-init').value = state.sigmaInit;
      document.getElementById('input-current-pex').value = state.currentPEX;
      document.getElementById('input-old-var-share').value = state.oldVarShare;
      document.getElementById('input-new-var-share').value = state.newVarShare;
      document.getElementById('input-base-ca').value = state.baseC2P;
      document.getElementById('input-margin-rate').value = state.marginRate;
      document.getElementById('input-headcount').value = state.headcount;
      document.getElementById('input-rep-fixed-salary').value = state.repFixedSalary;
      document.getElementById('slider-rep-bonus-pct').value = state.repCurrentBonusPct;
      document.getElementById('slider-chart-bonus-sync').value = state.repCurrentBonusPct;
      document.getElementById('slider-chart-rep-sync').value = state.repInitPerf;
      document.getElementById('slider-rep-achievement').value = state.repInitPerf;
      document.getElementById('four-to-one-corridor').value = fourToOneState.corridorC2P;
    }

    // Attach Event Listeners
    function setupEventListeners() {
      // Slider Target Increase
      document.getElementById('slider-target-increase').addEventListener('input', (e) => {
        state.targetIncrease = parseFloat(e.target.value);
        syncTargetSliders();
        updateDashboard();
      });

      // Overperformance sliders (Standard + the 3 shared top strips, all synced)
      OVERPERF_PAIRS.forEach(([sliderId]) => {
        document.getElementById(sliderId).addEventListener('input', (e) => {
          state.overperf = parseFloat(e.target.value);
          syncOverperfSliders();
          updateDashboard();
          refreshPopulation();
          updateAdvancedView();
        });
      });

      // Slider Rep Sync (Under Chart - Achievement)
      document.getElementById('slider-chart-rep-sync').addEventListener('input', (e) => {
        state.repInitPerf = parseFloat(e.target.value);
        document.getElementById('slider-rep-achievement').value = state.repInitPerf;
        updateDashboard();
      });

      // Slider Rep Achievement (In Inspector Card - Synchronized)
      document.getElementById('slider-rep-achievement').addEventListener('input', (e) => {
        state.repInitPerf = parseFloat(e.target.value);
        document.getElementById('slider-chart-rep-sync').value = state.repInitPerf;
        updateDashboard();
      });

      // Slider Rep Bonus Pct (In Inspector Card - Bonus % of Fixed)
      document.getElementById('slider-rep-bonus-pct').addEventListener('input', (e) => {
        state.repCurrentBonusPct = parseFloat(e.target.value);
        document.getElementById('slider-chart-bonus-sync').value = state.repCurrentBonusPct;
        updateDashboard();
      });

      // Slider Rep Bonus Pct (Under Chart - Synchronized Bonus % of Fixed)
      document.getElementById('slider-chart-bonus-sync').addEventListener('input', (e) => {
        state.repCurrentBonusPct = parseFloat(e.target.value);
        document.getElementById('slider-rep-bonus-pct').value = state.repCurrentBonusPct;
        updateDashboard();
      });

      // Numerical inputs: 0 is valid, empty field = keep current value, clamp to bounds
      function bindNumberInput(id, key, min, max, isInt) {
        document.getElementById(id).addEventListener('input', (e) => {
          const raw = parseFloat(e.target.value);
          if (!isFinite(raw)) { updateDashboard(); return; } // empty field: keep current value
          let v = Math.min(max, Math.max(min, raw));
          if (isInt) v = Math.round(v);
          state[key] = v;
          updateDashboard();
        });
      }
      bindNumberInput('input-mu-init', 'muInit', 30, 200, false);
      bindNumberInput('input-sigma-init', 'sigmaInit', 1, 60, false);
      bindNumberInput('input-current-pex', 'currentPEX', 0.1, 50, false);
      bindNumberInput('input-old-var-share', 'oldVarShare', 1, 50, false);
      bindNumberInput('input-new-var-share', 'newVarShare', 1, 50, false);
      bindNumberInput('input-base-ca', 'baseC2P', 10, 10000, false);
      bindNumberInput('input-margin-rate', 'marginRate', 1, 100, false);
      bindNumberInput('input-headcount', 'headcount', 10, 5000, true);
      bindNumberInput('input-payout-cap', 'payoutCap', 100, 500, false);
      bindNumberInput('input-rep-fixed-salary', 'repFixedSalary', 10000, 250000, false);

      document.getElementById('four-to-one-corridor').addEventListener('input', (e) => {
        const raw = parseFloat(e.target.value);
        fourToOneState.corridorC2P = normalizeFourToOneCorridor(raw);
        e.target.value = fourToOneState.corridorC2P;
        refreshPopulation();
      });

      // Advanced view controls
      document.getElementById('adv-achievement').addEventListener('input', (e) => {
        advState.x = parseFloat(e.target.value);
        updateAdvancedView();
      });

      document.getElementById('adv-target-increase').addEventListener('input', (e) => {
        state.targetIncrease = parseFloat(e.target.value);
        syncTargetSliders();
        updateDashboard();
        updateAdvancedView();
      });

      document.getElementById('adv-zero-threshold').addEventListener('input', (e) => {
        advState.zeroThreshold = parseFloat(e.target.value);
        updateAdvancedView();
      });

      document.getElementById('adv-dual-t1').addEventListener('input', (e) => {
        advState.t1 = Math.min(parseFloat(e.target.value), advState.t2);
        e.target.value = advState.t1;
        e.target.style.zIndex = 5;
        document.getElementById('adv-dual-t2').style.zIndex = 3;
        updateAdvancedView();
      });

      document.getElementById('adv-dual-t2').addEventListener('input', (e) => {
        advState.t2 = Math.max(parseFloat(e.target.value), advState.t1);
        e.target.value = advState.t2;
        e.target.style.zIndex = 5;
        document.getElementById('adv-dual-t1').style.zIndex = 3;
        updateAdvancedView();
      });

      document.getElementById('adv-nominal-old-input').addEventListener('input', (e) => {
        advState.oldNominalE = Math.max(0, parseFloat(e.target.value) || 0);
        updateAdvancedView();
      });

      document.getElementById('adv-fixed-salary').addEventListener('input', (e) => {
        const raw = parseFloat(e.target.value);
        if (isFinite(raw)) advState.fixedSalary = Math.min(250000, Math.max(10000, raw));
        updateAdvancedView();
      });

      document.getElementById('adv-min-100').addEventListener('input', (e) => {
        advState.min100E = Math.max(0, parseFloat(e.target.value) || 0);
        syncMinInputs();
        updateAdvancedView();
        refreshPopulation();
      });

      document.getElementById('adv-min-200').addEventListener('input', (e) => {
        advState.min200E = Math.max(0, parseFloat(e.target.value) || 0);
        syncMinInputs();
        updateAdvancedView();
        refreshPopulation();
      });

      document.getElementById('matrix-target-increase').addEventListener('input', (e) => {
        state.targetIncrease = parseFloat(e.target.value);
        syncTargetSliders();
        updateDashboard();
        refreshPopulation();
        updateAdvancedView();
      });

      document.getElementById('matrix-min-100').addEventListener('input', (e) => {
        advState.min100E = Math.max(0, parseFloat(e.target.value) || 0);
        syncMinInputs();
        updateAdvancedView();
        refreshPopulation();
      });

      document.getElementById('matrix-min-200').addEventListener('input', (e) => {
        advState.min200E = Math.max(0, parseFloat(e.target.value) || 0);
        syncMinInputs();
        updateAdvancedView();
        refreshPopulation();
      });

      // Population from the Sheet
      document.getElementById('pop-sheet-btn').addEventListener('click', loadPopulationFromSheet);

      const popCsvInput = document.getElementById('pop-csv-input');
      popCsvInput.addEventListener('change', () => {
        const file = popCsvInput.files && popCsvInput.files[0];
        if (file) loadPopulationCsvFile(file);
        popCsvInput.value = '';
      });

      document.getElementById('btn-adv-standard').addEventListener('click', () => toggleDatasetAdv(5));

      document.getElementById('pop-clear-btn').addEventListener('click', () => {
        advPopulation = [];
        document.getElementById('pop-status').classList.add('hidden');
        document.getElementById('four-to-one-status').classList.remove('hidden');
        refreshPopulation();
      });
    }

    // Initialize on DOM load
    window.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
      renderBreakpointsTable();
      initChart();
      setupEventListeners();
      syncInputsFromState();
      syncMinInputs();
      updateDashboard();
      setTimeout(renderMathSafely, 150);
    });
