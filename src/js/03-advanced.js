
    // ===== ADVANCED VIEW: 90% HYBRID SCHEME =====
    let advChartInstance = null;
    const advState = { x: 110, zeroThreshold: 0, t1: 80, t2: 100, oldNominalE: 5000, fixedSalary: 50000, min100E: 0, min200E: 0 };
    const fourToOneState = { corridorC2P: 300000 };
    const STANDARD_TARGET_SHARE_PCT = 20;

    function normalizeFourToOneCorridor(value) {
      return isFinite(value) && value > 0 ? value : 1;
    }

    // Hybrid scheme core. All amounts in €, expressed back in % of the rep's OLD nominal.
    // New nominal = max(target share (20%), € minimum entered, old nominal)
    // Value at 200% = max(2 × new nominal, € minimum entered)
    // Base new curve: linear 0→100% up to the new nominal, then linear 100%→200%.
    // The transition passage blends pointwise (linearly) from the old curve to the new curve.
    function advNominals(oldNomE, fixedE = advState.fixedSalary) {
      return Engine.hybridContext(oldNomE, fixedE, state.newVarShare, advState.min100E, advState.min200E,
        advState.zeroThreshold, advState.t1, advState.t2, state.payoutCap);
    }

    function evalOldE(x, oldNomE) {
      return Math.min(x, state.payoutCap) / 100 * oldNomE;
    }

    function evalNewBaseE(x, nom) {
      if (x <= 100) return x / 100 * nom.newNomE;
      if (x <= 200) return nom.newNomE + (x - 100) / 100 * (nom.val200E - nom.newNomE);
      return nom.val200E;
    }

    function evalHybridE(x, oldNomE, fixedE = advState.fixedSalary) {
      const n = advNominals(oldNomE, fixedE);
      if (x < advState.zeroThreshold) return 0;
      if (x < advState.t1) return evalOldE(x, n.oldNomE);
      if (x <= advState.t2) {
        if (advState.t2 <= advState.t1) return evalNewBaseE(x, n);
        // Linear transition: straight segment from (T1, old curve) to (T2, new curve)
        const start = evalOldE(advState.t1, n.oldNomE);
        const end = evalNewBaseE(advState.t2, n);
        const t = (x - advState.t1) / (advState.t2 - advState.t1);
        return start + t * (end - start);
      }
      return evalNewBaseE(x, n);
    }

    function evalHybridPayoutOldNominal(x, oldNomE, fixedE) {
      const n = advNominals(oldNomE, fixedE);
      return n.oldNomE > 0 ? evalHybridE(x, oldNomE, fixedE) / n.oldNomE * 100 : 0;
    }

    function evalNewBasePayoutOldNominal(x, oldNomE, fixedE) {
      const n = advNominals(oldNomE, fixedE);
      return n.oldNomE > 0 ? evalNewBaseE(x, n) / n.oldNomE * 100 : 0;
    }

    function fourToOneNominals(oldNomE, fixedE) {
      const targetNomE = Math.max(fixedE * STANDARD_TARGET_SHARE_PCT / 100, oldNomE);
      const nominalIncreaseE = Math.max(0, targetNomE - oldNomE);
      const objectiveIncreaseE = nominalIncreaseE * 4;
      const corridor = normalizeFourToOneCorridor(fourToOneState.corridorC2P);
      return {
        targetNomE,
        nominalIncreaseE,
        objectiveIncreaseE,
        achievementShift: objectiveIncreaseE / corridor * 100
      };
    }

    function evalFourToOnePayout(x, rep) {
      const nom = fourToOneNominals(rep.nominal, rep.fixed);
      const calibrated = x - nom.achievementShift + state.overperf;
      return Engine.paliers(calibrated, state.breakpoints, state.payoutCap) / 100 * nom.targetNomE;
    }

    function initAdvChart() {
      const ctx = document.getElementById('advChart').getContext('2d');
      advChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Old (linear 1:1)',
              data: [],
              borderColor: '#94a3b8',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
              tension: 0,
              order: 3
            },
            {
              label: 'Hybrid 90% (this rep)',
              data: [],
              borderColor: '#ea580c',
              backgroundColor: 'rgba(234, 88, 12, 0.06)',
              borderWidth: 3.5,
              fill: true,
              pointRadius: 0,
              tension: 0,
              order: 2
            },
            {
              label: 'All-New (× nominal ratio)',
              data: [],
              borderColor: '#4f46e5',
              borderWidth: 2,
              borderDash: [4, 4],
              pointRadius: 0,
              tension: 0,
              order: 3
            },
            {
              label: 'Before Point (Old Scheme)',
              data: [],
              borderColor: '#64748b',
              backgroundColor: '#64748b',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 7,
              pointHoverRadius: 10,
              showLine: false,
              order: 1
            },
            {
              label: 'After Point (Calibrated Hybrid)',
              data: [],
              borderColor: '#ea580c',
              backgroundColor: '#ea580c',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 8,
              pointHoverRadius: 11,
              showLine: false,
              order: 0
            },
            {
              label: 'Standard Scenario (Breakpoints)',
              data: [],
              borderColor: '#7c3aed',
              borderWidth: 2,
              borderDash: [2, 3],
              pointRadius: 0,
              tension: 0,
              hidden: true,
              order: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
              bodyFont: { family: 'JetBrains Mono', size: 11 },
              padding: 10,
              cornerRadius: 8
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Achievement Rate (%)',
                font: { family: 'Plus Jakarta Sans', weight: 'bold', size: 11 },
                color: '#64748b'
              },
              grid: { color: '#f1f5f9' },
              ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#64748b' }
            },
            y: {
              min: 0,
              title: {
                display: true,
                text: 'Variable paid (% of Old Nominal)',
                font: { family: 'Plus Jakarta Sans', weight: 'bold', size: 11 },
                color: '#ea580c'
              },
              grid: { color: '#f1f5f9' },
              ticks: {
                font: { family: 'JetBrains Mono', size: 10 },
                color: '#ea580c',
                callback: function(v) { return v + '%'; }
              }
            }
          }
        }
      });
    }

    function updateAdvancedView() {
      if (!advChartInstance) return;
      const x = advState.x;
      const zero = advState.zeroThreshold, t1 = advState.t1, t2 = advState.t2;
      const oldNomE = advState.oldNominalE;

      // Calibrated achievement: same formula as the aggregate (targets rise + overperformance)
      const calibrated = Math.max(0, getCalibratedAchievement(x));

      const nom = advNominals(oldNomE, advState.fixedSalary);
      const r = nom.oldNomE > 0 ? nom.newNomE / nom.oldNomE : 1;
      const oldNominal = nom.oldNomE;
      const newNominal = nom.newNomE;

      // Before: old scheme on historical perf / After: hybrid on calibrated perf
      const paidOld = evalOldE(x, oldNominal);
      const paidHyb = evalHybridE(calibrated, oldNomE, advState.fixedSalary);
      const paidNew = evalNewBaseE(calibrated, nom);

      // Badges & nominaux
      document.getElementById('adv-val-achieve-before').innerText = x + '%';
      document.getElementById('adv-val-achieve-after').innerText = calibrated.toFixed(1) + '%';
      syncTargetSliders();
      if (typeof syncOverperfSliders === 'function') syncOverperfSliders();
      document.getElementById('adv-val-zero').innerText = zero + '%';
      document.getElementById('adv-val-t1').innerText = t1 + '%';
      document.getElementById('adv-val-t2').innerText = t2 + '%';
      document.getElementById('adv-desc-zero').innerText = zero + '%';
      document.getElementById('adv-desc-zero2').innerText = zero + '%';
      document.getElementById('adv-desc-t1a').innerText = t1 + '%';
      document.getElementById('adv-desc-t1b').innerText = t1 + '%';
      document.getElementById('adv-desc-t2a').innerText = t2 + '%';
      const track = document.getElementById('adv-dual-track');
      track.style.left = (t1 / 2) + '%';
      track.style.width = (Math.max(0, t2 - t1) / 2) + '%';
      document.getElementById('adv-badge-r').innerText = oldNomE > 0 ? `\u00D7${r.toFixed(2)} nominal` : '—';
      document.getElementById('adv-nominal-new').innerText = Math.round(newNominal).toLocaleString('en-US') + ' €';

      // KPI cards (compact: Old / Hybrid / Δ — no all-new card)
      const kpiOldEl = document.getElementById('adv-kpi-old');
      if (kpiOldEl) kpiOldEl.innerText = Math.round(paidOld).toLocaleString('en-US') + ' €';
      const kpiHybEl = document.getElementById('adv-kpi-hyb');
      if (kpiHybEl) kpiHybEl.innerText = Math.round(paidHyb).toLocaleString('en-US') + ' €';
      const kpiNewEl = document.getElementById('adv-kpi-new');
      if (kpiNewEl) kpiNewEl.innerText = Math.round(paidNew).toLocaleString('en-US') + ' €';

      const deltaOld = paidHyb - paidOld;
      const deltaNewEl = document.getElementById('adv-kpi-delta-new');
      if (deltaNewEl) deltaNewEl.innerText = (paidHyb - paidNew >= 0 ? '+' : '') + Math.round(paidHyb - paidNew).toLocaleString('en-US') + ' €';
      const deltaEl = document.getElementById('adv-kpi-delta');
      if (deltaEl) {
        deltaEl.innerText = (deltaOld >= 0 ? '+' : '') + Math.round(deltaOld).toLocaleString('en-US') + ' €';
        deltaEl.className = 'text-lg font-black mt-0.5 ' + (deltaOld >= 0 ? 'text-emerald-600' : 'text-rose-600');
      }

      // Dynamic transition labels (title, legend)
      const titleT1 = document.getElementById('adv-title-t1');
      if (titleT1) titleT1.innerText = t1 + '%';
      const titleT2 = document.getElementById('adv-title-t2');
      if (titleT2) titleT2.innerText = t2 + '%';
      const legendT1 = document.getElementById('adv-legend-t1');
      if (legendT1) legendT1.innerText = t1 + '%';

      // Chart data (% of old nominal)
      const labels = [];
      const oldVals = [];
      const hybVals = [];
      const newVals = [];
      const stdVals = [];
      const beforePoints = [];
      const afterPoints = [];
      for (let v = 20; v <= 220; v += 1) {
        labels.push(v);
        oldVals.push(Math.min(v, state.payoutCap));
        hybVals.push(evalHybridPayoutOldNominal(v, oldNomE, advState.fixedSalary));
        newVals.push(evalNewBasePayoutOldNominal(v, oldNomE, advState.fixedSalary));
        stdVals.push(evalNewPayout(v) * r);
        beforePoints.push(v === x ? oldVals[oldVals.length - 1] : null);
        afterPoints.push(v === Math.round(calibrated) ? hybVals[hybVals.length - 1] : null);
      }
      advChartInstance.data.labels = labels;
      advChartInstance.data.datasets[0].data = oldVals;
      advChartInstance.data.datasets[1].data = hybVals;
      advChartInstance.data.datasets[2].data = newVals;
      advChartInstance.data.datasets[3].data = beforePoints;
      advChartInstance.data.datasets[4].data = afterPoints;
      advChartInstance.data.datasets[5].data = stdVals;
      advChartInstance.update();

      // Real population (CSV) — recompute with current curve parameters
      refreshPopulation();
    }
