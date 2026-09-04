
    // Calculate calibrated achievement: ABSOLUTE additive shift in percentage points.
    // targetIncrease = how many pp the objective bar rises  → achievement DROPS by that amount.
    // overperf       = how many pp the rep's actual results improve → achievement RISES by that amount.
    // Example: was 72%, objectives +4pp, surperf +10pp → 72 - 4 + 10 = 78%
    function getCalibratedAchievement(rawPerf) {
      return rawPerf - state.targetIncrease + state.overperf;
    }

    // Individual Rep new bonus % with floor protection: max(20%, currentBonusPct)
    function getEffectiveNewBonusPct(currentBonusPct) {
      return Math.max(state.newVarShare, currentBonusPct);
    }

    // Numerical integration of Expected Payout % (delegated to the engine)
    function calculateExpectedPayout(isNewCurve = true) {
      const mu = isNewCurve ? getCalibratedAchievement(state.muInit) : state.muInit;
      const sigma = state.sigmaInit;
      return isNewCurve
        ? Engine.integrate(x => Engine.paliers(x, state.breakpoints, state.payoutCap) / 100, mu, sigma) * 100
        : Engine.integrate(x => Math.min(x, state.payoutCap) / 100, mu, sigma) * 100;
    }

    // Update entire dashboard
    function updateDashboard() {
      // 1. Calculations
      syncOverperfSliders();
      const muCalibrated = getCalibratedAchievement(state.muInit);
      document.getElementById('val-resulting-mu').innerText = muCalibrated.toFixed(1) + '%';
      document.getElementById('val-init-mu').innerText = state.muInit.toFixed(1) + '%';

      // Real population loaded → actual PEX per rep (otherwise average model)
      if (advPopulation.length) refreshPopulation();

      let oldPexM, newPexM, newTargetPEX_M, newExpectedPayoutPct, oldTargetPEX_M;
      if (realAgg) {
        oldPexM = realAgg.stdOld / 1e6;
        newPexM = realAgg.stdNew / 1e6;
        newTargetPEX_M = realAgg.targetNew / 1e6;
        oldTargetPEX_M = realAgg.targetOld / 1e6;
        newExpectedPayoutPct = realAgg.targetNew > 0 ? realAgg.stdNew / realAgg.targetNew * 100 : 0;
      } else {
        const oldExpectedPayoutPct = calculateExpectedPayout(false);
        oldTargetPEX_M = state.currentPEX / (oldExpectedPayoutPct / 100);
        const varScaleFactor = state.oldVarShare > 0 ? (state.newVarShare / state.oldVarShare) : 1;
        newTargetPEX_M = oldTargetPEX_M * varScaleFactor;
        newExpectedPayoutPct = calculateExpectedPayout(true);
        newPexM = newTargetPEX_M * (newExpectedPayoutPct / 100);
        oldPexM = state.currentPEX;
      }
      document.getElementById('val-new-target-pex').innerText = newTargetPEX_M.toFixed(2);

      const pexDiffM = oldPexM - newPexM; // Positive means savings vs current 2.5M
      const pexDiffPct = oldPexM > 0 ? ((newPexM - oldPexM) / oldPexM) * 100 : 0;

      // Topline impact with Corridor
      const c2pGainM = state.baseC2P * (state.overperf / 100);
      const marginGainM = c2pGainM * (state.marginRate / 100);

      // Net company P&L gain = additional corridor + PEX savings
      const netGainM = marginGainM + pexDiffM;

      // 2. Update KPI cards
      document.getElementById('kpi-pex-new').innerText = newPexM.toFixed(2) + ' M€';
      document.getElementById('kpi-pex-payout-rate').innerText = newExpectedPayoutPct.toFixed(1) + '% avg.';
      document.getElementById('kpi-pex-old').innerText = oldPexM.toFixed(2) + ' M€';
      
      const pexDiffEl = document.getElementById('kpi-pex-diff');
      pexDiffEl.innerText = `(${pexDiffPct >= 0 ? '+' : ''}${pexDiffPct.toFixed(1)}%)`;
      pexDiffEl.className = pexDiffPct <= 0 ? 'font-bold text-emerald-600' : 'font-bold text-rose-600';

      const pexSavingsEl = document.getElementById('kpi-pex-savings');
      const pexSavingsLabel = document.getElementById('kpi-pex-savings-label');
      if (pexDiffM >= 0) {
        pexSavingsEl.innerText = '+' + pexDiffM.toFixed(2) + ' M€';
        pexSavingsEl.className = 'text-2xl font-black text-emerald-600';
        pexSavingsLabel.innerText = 'Net budget savings on PEX';
      } else {
        pexSavingsEl.innerText = pexDiffM.toFixed(2) + ' M€';
        pexSavingsEl.className = 'text-2xl font-black text-rose-600';
        pexSavingsLabel.innerText = 'Budget overrun on PEX';
      }

      const marginGainEl = document.getElementById('kpi-margin-gain');
      marginGainEl.innerText = (marginGainM >= 0 ? '+' : '') + marginGainM.toFixed(2) + ' M€';
      marginGainEl.className = marginGainM >= 0 ? 'text-2xl font-black text-emerald-600' : 'text-2xl font-black text-rose-600';
      document.getElementById('kpi-c2p-gain').innerText = (c2pGainM >= 0 ? '+' : '') + c2pGainM.toFixed(1) + ' M€ C2P';

      const netGainEl = document.getElementById('kpi-net-gain');
      netGainEl.innerText = (netGainM >= 0 ? '+' : '') + netGainM.toFixed(2) + ' M€';
      netGainEl.className = netGainM >= 0 ? 'text-2xl font-black text-emerald-400' : 'text-2xl font-black text-rose-400';

      // 3. Update Individual Rep Inspector & Synchronized Sliders
      updateIndividualRep();

      // 4. Update Segments Table
      const effectiveHeadcount = realAgg ? realAgg.count : state.headcount;
      const avgOldVarPerRep = (oldTargetPEX_M * 1_000_000) / effectiveHeadcount;
      const avgNewVarPerRep = (newTargetPEX_M * 1_000_000) / effectiveHeadcount;
      updateSegmentsTable(avgOldVarPerRep, avgNewVarPerRep, effectiveHeadcount);

      // 5. Update Chart with auto-adapting Y scale
      updateChartData();

      // 6. Dynamic texts
      document.getElementById('legend-mu').innerHTML = '&mu; = ' + state.muInit.toFixed(0) + '%';
      document.getElementById('segments-sigma').innerHTML = '&sigma; = ' + state.sigmaInit.toFixed(0) + '%';
      document.getElementById('footer-sigma').innerHTML = state.sigmaInit.toFixed(0) + '%';
      document.getElementById('footer-pex').innerHTML = state.currentPEX.toFixed(1) + ' M€';

      // 7. Refresh KaTeX math rendering
      renderMathSafely();
    }

    // Individual Rep inspection logic with Nominal & Variable focus
    function updateIndividualRep() {
      const repInit = state.repInitPerf;
      const calibratedAchieve = getCalibratedAchievement(repInit);

      // Synchronize slider under chart & slider in inspector
      document.getElementById('slider-chart-rep-sync').value = repInit;
      document.getElementById('slider-rep-achievement').value = repInit;
      document.getElementById('chart-slider-val-before').innerText = `Before: ${repInit}%`;
      document.getElementById('chart-slider-val-after').innerText = `After: ${calibratedAchieve.toFixed(1)}%`;
      document.getElementById('val-rep-achieve-before').innerText = `${repInit}%`;
      document.getElementById('val-rep-achieve-after').innerText = `${calibratedAchieve.toFixed(1)}%`;

      document.getElementById('rep-initial-achieve').innerText = `${repInit}%`;
      document.getElementById('rep-calibrated-achieve').innerText = `${calibratedAchieve.toFixed(1)}%`;

      // Archetype badge
      const badge = document.getElementById('badge-rep-archetype');
      if (repInit < 60) badge.innerText = 'Drop-out (<60%)';
      else if (repInit < 85) badge.innerText = 'Struggling (60-85%)';
      else if (repInit < 105) badge.innerText = 'On target (85-105%)';
      else if (repInit < 125) badge.innerText = 'Strong performer (105-125%)';
      else badge.innerText = 'Top Performer (>125%)';
      
      const oldPayout = evalOldPayout(repInit);
      const newPayout = evalNewPayout(calibratedAchieve);

      // Calculation of Nominal & Variable Paid with currentBonusPct & Floor Protection:
      const fixed = state.repFixedSalary;
      const oldBonusPct = state.repCurrentBonusPct;
      const newBonusPct = getEffectiveNewBonusPct(oldBonusPct);
      
      // Calculate multiplier safely (avoid division by 0 if bonus is 0%)
      const nominalMultiplier = oldBonusPct > 0 ? (newBonusPct / oldBonusPct) : (newBonusPct > 0 ? (newBonusPct / 1) : 1);

      // Sync Bonus Sliders (under chart and in card)
      document.getElementById('slider-rep-bonus-pct').value = oldBonusPct;
      document.getElementById('slider-chart-bonus-sync').value = oldBonusPct;

      document.getElementById('val-rep-bonus-pct').innerText = `${oldBonusPct.toFixed(1)}%`;
      document.getElementById('val-rep-new-bonus-pct').innerText = `${newBonusPct.toFixed(1)}%`;

      document.getElementById('chart-bonus-pct-val').innerText = `${oldBonusPct.toFixed(1)}%`;
      document.getElementById('chart-bonus-pct-new-val').innerText = `${newBonusPct.toFixed(1)}%`;
      document.getElementById('chart-nominal-multiplier-badge').innerText = oldBonusPct > 0 ? `\u00D7${nominalMultiplier.toFixed(2)} nominal` : `Pure fixed`;

      const oldNominal = fixed * (oldBonusPct / 100);
      const oldVarPaid = (oldPayout / 100) * oldNominal;

      const newNominal = fixed * (newBonusPct / 100);
      const newVarPaid = (newPayout / 100) * newNominal;

      const deltaVarEuros = newVarPaid - oldVarPaid;
      const deltaNominalEuros = newNominal - oldNominal;

      document.getElementById('rep-old-payout').innerText = oldPayout.toFixed(1) + '% payout';
      document.getElementById('rep-old-euros').innerText = Math.round(oldVarPaid).toLocaleString('en-US') + ' €';
      document.getElementById('rep-old-nominal').innerText = Math.round(oldNominal).toLocaleString('en-US') + ' €';

      document.getElementById('rep-new-payout').innerText = newPayout.toFixed(1) + '% payout';
      document.getElementById('rep-new-euros').innerText = Math.round(newVarPaid).toLocaleString('en-US') + ' €';
      document.getElementById('rep-new-nominal').innerText = Math.round(newNominal).toLocaleString('en-US') + ' €';

      const deltaCard = document.getElementById('rep-delta-card');
      const deltaPayoutEl = document.getElementById('rep-delta-payout');
      const deltaNominalEl = document.getElementById('rep-delta-nominal');
      const deltaLabelEl = document.getElementById('rep-delta-label');

      deltaPayoutEl.innerText = (deltaVarEuros >= 0 ? '+' : '') + Math.round(deltaVarEuros).toLocaleString('en-US') + ' €';
      deltaNominalEl.innerText = (deltaNominalEuros >= 0 ? '+' : '') + Math.round(deltaNominalEuros).toLocaleString('en-US') + ' €';

      if (deltaVarEuros >= 0) {
        deltaCard.className = 'p-3 bg-emerald-50/80 rounded-xl border border-emerald-200 text-emerald-800';
        deltaPayoutEl.className = 'text-lg font-black font-mono text-emerald-700';
        deltaLabelEl.innerText = 'Variable Paid Gain';
      } else {
        deltaCard.className = 'p-3 bg-rose-50/80 rounded-xl border border-rose-200 text-rose-800';
        deltaPayoutEl.className = 'text-lg font-black font-mono text-rose-700';
        deltaLabelEl.innerText = 'Variable Paid Loss';
      }
    }

    // Population Segments Table breakdown
    function updateSegmentsTable(avgOldVarPerRep, avgNewVarPerRep, effectiveHeadcount) {
      const muCalibrated = getCalibratedAchievement(state.muInit);
      const sigmaCalibrated = state.sigmaInit; // Fixed sigma
      const totalHeadcount = effectiveHeadcount || state.headcount;

      // Define segments
      const segments = [
        { label: 'Below threshold (< 50%)', min: 0, max: 50 },
        { label: 'Effort zone (50% - 80%)', min: 50, max: 80 },
        { label: 'Standard target (80% - 100%)', min: 80, max: 100 },
        { label: 'Overperformance (100% - 200%)', min: 100, max: 200 },
        { label: 'Max accelerator (> 200%)', min: 200, max: 300 }
      ];

      const tbody = document.getElementById('segments-table-body');
      tbody.innerHTML = '';

      // Single density pass, accumulated per band
      const acc = segments.map(() => ({ d: 0, o: 0, n: 0 }));
      for (const { x, w } of Engine.densityPoints(muCalibrated, sigmaCalibrated)) {
        for (let i = 0; i < segments.length; i++) {
          if (x >= segments[i].min && x < segments[i].max) {
            acc[i].d += w;
            acc[i].o += evalOldPayout(x) * w;
            acc[i].n += evalNewPayout(x) * w;
            break;
          }
        }
      }

      segments.forEach((seg, si) => {
        const segDensity = acc[si].d;
        const weightedOld = acc[si].o;
        const weightedNew = acc[si].n;

        const popPct = Math.min(100, Math.max(0, segDensity * 100));
        const headCountInSeg = Math.round((popPct / 100) * totalHeadcount);
        const avgOldPayout = segDensity > 0 ? (weightedOld / segDensity) : 0;
        const avgNewPayout = segDensity > 0 ? (weightedNew / segDensity) : 0;

        const oldPaidEuros = (avgOldPayout / 100) * avgOldVarPerRep;
        const newPaidEuros = (avgNewPayout / 100) * avgNewVarPerRep;
        const deltaVarEuros = newPaidEuros - oldPaidEuros;

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50/80 transition-colors';
        row.innerHTML = `
          <td class="py-2 px-3 font-sans font-medium text-slate-800">${seg.label}</td>
          <td class="py-2 px-3 text-slate-700">${popPct.toFixed(1)}%</td>
          <td class="py-2 px-3 text-slate-600">${headCountInSeg} reps</td>
          <td class="py-2 px-3 text-slate-500">${avgOldPayout.toFixed(1)}%</td>
          <td class="py-2 px-3 font-bold text-indigo-700">${avgNewPayout.toFixed(1)}%</td>
          <td class="py-2 px-3 font-bold ${deltaVarEuros >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
            ${deltaVarEuros >= 0 ? '+' : ''}${Math.round(deltaVarEuros).toLocaleString('en-US')} €
          </td>
        `;
        tbody.appendChild(row);
      });
    }

    // Render Table of Breakpoints
    function renderBreakpointsTable() {
      const tbody = document.getElementById('breakpoints-table-body');
      tbody.innerHTML = '';

      state.breakpoints.sort((a, b) => a.achievement - b.achievement);

      state.breakpoints.forEach((bp, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="py-1.5 px-3">
            <input type="number" value="${bp.achievement}" min="0" max="300" step="5" onchange="updateBreakpoint(${index}, 'achievement', this.value)" class="w-20 px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold text-xs focus:ring-1 focus:ring-indigo-500"> %
          </td>
          <td class="py-1.5 px-3">
            <input type="number" value="${bp.payout}" min="0" max="300" step="5" onchange="updateBreakpoint(${index}, 'payout', this.value)" class="w-20 px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold text-xs focus:ring-1 focus:ring-indigo-500"> %
          </td>
          <td class="py-1.5 px-2 text-right">
            ${state.breakpoints.length > 2 ? `
              <button onclick="removeBreakpointRow(${index})" class="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-all" title="Delete this breakpoint">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            ` : '<span class="text-slate-300">-</span>'}
          </td>
        `;
        tbody.appendChild(row);
      });
      lucide.createIcons();
    }

    function updateBreakpoint(index, field, value) {
      state.breakpoints[index][field] = parseFloat(value) || 0;
      updateDashboard();
    }

    function addBreakpointRow() {
      const last = state.breakpoints[state.breakpoints.length - 1];
      state.breakpoints.push({ achievement: last.achievement + 20, payout: last.payout + 20 });
      renderBreakpointsTable();
      updateDashboard();
    }

    function removeBreakpointRow(index) {
      if (state.breakpoints.length <= 2) return;
      state.breakpoints.splice(index, 1);
      renderBreakpointsTable();
      updateDashboard();
    }

    // Chart.js initialization & update with Dynamic Auto-Adapting Frame
    function initChart() {
      const ctx = document.getElementById('mainChart').getContext('2d');

      mainChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Initial Gaussian (Historical)',
              data: [],
              yAxisID: 'yDensity',
              borderColor: 'rgba(148, 163, 184, 0.9)',
              backgroundColor: 'rgba(148, 163, 184, 0.08)',
              borderDash: [4, 4],
              fill: true,
              borderWidth: 2,
              tension: 0.35,
              pointRadius: 0,
              order: 6
            },
            {
              label: 'New Gaussian (Calibrated)',
              data: [],
              yAxisID: 'yDensity',
              borderColor: 'rgba(99, 102, 241, 0.95)',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              fill: true,
              borderWidth: 2.5,
              tension: 0.35,
              pointRadius: 0,
              order: 5
            },
            {
              label: 'Old Curve (Linear)',
              data: [],
              yAxisID: 'yPayout',
              borderColor: '#94a3b8',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
              tension: 0,
              order: 4
            },
            {
              label: 'New Curve (Breakpoints)',
              data: [],
              yAxisID: 'yPayout',
              borderColor: '#4f46e5',
              backgroundColor: 'rgba(79, 70, 229, 0.04)',
              borderWidth: 3.5,
              pointRadius: 0,
              tension: 0,
              order: 3
            },
            {
              label: 'Weighted New Curve (Old Nominal Equiv.)',
              data: [],
              yAxisID: 'yPayout',
              borderColor: '#9333ea',
              borderWidth: 2.5,
              borderDash: [4, 4],
              pointRadius: 0,
              tension: 0,
              order: 2
            },
            {
              label: 'Rep Before (Historical)',
              data: [],
              yAxisID: 'yPayout',
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
              label: 'Rep After (On Weighted Curve)',
              data: [],
              yAxisID: 'yPayout',
              borderColor: '#9333ea',
              backgroundColor: '#9333ea',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 8,
              pointHoverRadius: 11,
              showLine: false,
              order: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
              bodyFont: { family: 'JetBrains Mono', size: 11 },
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                title: function(items) {
                  return `Achievement: ${items[0].label}%`;
                },
                label: function(context) {
                  if (context.datasetIndex === 0) {
                    return `Initial density: ${(context.raw * 100).toFixed(2)}%`;
                  } else if (context.datasetIndex === 1) {
                    return `New density: ${(context.raw * 100).toFixed(2)}%`;
                  } else if (context.datasetIndex === 2) {
                    return `Old payout: ${context.raw.toFixed(1)}%`;
                  } else if (context.datasetIndex === 3) {
                    return `New payout (% new nominal): ${context.raw.toFixed(1)}%`;
                  } else if (context.datasetIndex === 4) {
                    return `Weighted payout (old nominal equiv.): ${context.raw.toFixed(1)}%`;
                  } else if (context.datasetIndex === 5 && context.raw !== null) {
                    return `Rep before: ${context.raw.toFixed(1)}%`;
                  } else if (context.datasetIndex === 6 && context.raw !== null) {
                    return `Rep after (weighted): ${context.raw.toFixed(1)}%`;
                  }
                  return null;
                }
              }
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
            yPayout: {
              type: 'linear',
              position: 'left',
              min: 0,
              suggestedMax: 300, // Dynamically adjusted in updateChartData
              title: {
                display: true,
                text: 'Variable Compensation / Payout (% of Old Nominal)',
                font: { family: 'Plus Jakarta Sans', weight: 'bold', size: 11 },
                color: '#4f46e5'
              },
              grid: { color: '#f1f5f9' },
              ticks: {
                font: { family: 'JetBrains Mono', size: 10 },
                color: '#4f46e5',
                callback: function(v) { return v + '%'; }
              }
            },
            yDensity: {
              type: 'linear',
              position: 'right',
              min: 0,
              max: 0.016, // Fixed maximum for invariant bell height
              grid: { display: false },
              ticks: { display: false }
            }
          }
        }
      });
    }

    function updateChartData() {
      if (!mainChartInstance) return;

      const muInit = state.muInit;
      const muCalibrated = getCalibratedAchievement(state.muInit);
      const sigma = state.sigmaInit; // Strictly constant sigma = 30%

      // Nominal scaling factor for the weighted curve
      const oldBonusPct = state.repCurrentBonusPct;
      const newBonusPct = getEffectiveNewBonusPct(oldBonusPct);
      // Safe multiplier even when oldBonusPct approaches 0
      const nominalMultiplier = oldBonusPct > 0 ? (newBonusPct / oldBonusPct) : 1;

      const xValues = [];
      const initDensityValues = [];
      const newDensityValues = [];
      const oldPayoutValues = [];
      const newPayoutValues = [];
      const weightedPayoutValues = [];

      let maxWeightedPoint = 0;

      for (let x = 10; x <= 220; x += 1) {
        xValues.push(x);
        initDensityValues.push(normalPdf(x, muInit, sigma));
        newDensityValues.push(normalPdf(x, muCalibrated, sigma));
        
        const oldP = evalOldPayout(x);
        const newP = evalNewPayout(x);
        const weightedP = newP * nominalMultiplier;

        oldPayoutValues.push(oldP);
        newPayoutValues.push(newP);
        weightedPayoutValues.push(weightedP);

        if (weightedP > maxWeightedPoint) {
          maxWeightedPoint = weightedP;
        }
      }

      // Dynamically adjust Y-axis maximum so the frame adapts and never cuts off the weighted curve!
      const computedYMax = Math.max(250, Math.ceil((maxWeightedPoint * 1.12) / 50) * 50);
      mainChartInstance.options.scales.yPayout.max = computedYMax;

      const scaleBadge = document.getElementById('badge-y-scale');
      if (scaleBadge) {
        scaleBadge.innerText = `Y scale: max ${computedYMax}%`;
      }

      mainChartInstance.data.labels = xValues;
      mainChartInstance.data.datasets[0].data = initDensityValues;
      mainChartInstance.data.datasets[1].data = newDensityValues;
      mainChartInstance.data.datasets[2].data = oldPayoutValues;
      mainChartInstance.data.datasets[3].data = newPayoutValues;
      mainChartInstance.data.datasets[4].data = weightedPayoutValues;

      // Position of inspected rep BEFORE and AFTER.
      // After-point Y: follows weighted curve when it is visible, new payout curve when it is hidden.
      const repInit = Math.round(state.repInitPerf);
      const repOldPayout = evalOldPayout(state.repInitPerf);
      const repCalibrated = Math.round(getCalibratedAchievement(state.repInitPerf));
      const repNewPayout = evalNewPayout(getCalibratedAchievement(state.repInitPerf));
      const repWeightedPayout = repNewPayout * nominalMultiplier;

      // Determine whether the weighted curve (dataset 4) is currently hidden
      const weightedMeta = mainChartInstance.getDatasetMeta(4);
      const weightedIsHidden = weightedMeta.hidden === true || weightedMeta.hidden === null && mainChartInstance.data.datasets[4].hidden;
      const repAfterY = weightedIsHidden ? repNewPayout : repWeightedPayout;

      const repBeforePoints = xValues.map(x => x === repInit ? repOldPayout : null);
      const repAfterPoints = xValues.map(x => x === repCalibrated ? repAfterY : null);

      mainChartInstance.data.datasets[5].data = repBeforePoints;
      mainChartInstance.data.datasets[6].data = repAfterPoints;

      mainChartInstance.update();
    }

    function toggleDataset(index) {
      const meta = mainChartInstance.getDatasetMeta(index);
      // Toggle hidden state
      if (meta.hidden === null || meta.hidden === undefined) {
        meta.hidden = true;
      } else {
        meta.hidden = !meta.hidden;
      }
      // Re-run full update so purple point repositions immediately
      updateDashboard();
    }
