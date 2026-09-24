    const PERSONAE_MIN_NOMINAL_DEFAULT = 8000;
    const PERSONAE_OBJECTIVE_INCREASE_DEFAULT = 20;
    const PERSONAE_ACCELERATION_START = 80;
    const PERSONAE_ACCELERATION_END = 100;
    const PERSONAE_ZERO_THRESHOLD = 40;
    const PERSONAE_TARGET_SHARE_PCT = 20;
    const PERSONAE_COLORS = [
      '#2563eb', '#dc2626', '#d97706', '#16a34a', '#ea580c',
      '#0891b2', '#4f46e5', '#db2777', '#65a30d', '#9333ea',
      '#0f766e', '#c2410c', '#0284c7', '#be123c', '#4d7c0f',
      '#7c3aed', '#b45309', '#0e7490', '#15803d', '#c026d3'
    ];

    let personaeData = [];
    let personaeIncluded = new Set();
    let personaeFilters = { country: '', seniority: '' };
    let personaeMode = 'euros';
    let personaeMinimumNominal = PERSONAE_MIN_NOMINAL_DEFAULT;
    let personaeObjectiveIncrease = PERSONAE_OBJECTIVE_INCREASE_DEFAULT;
    let personaeChart = null;
    let personaeInitialized = false;
    let personaeLoading = false;
    let personaeLoaded = false;

    function getPersonaeNominals(persona, minimumNominal = PERSONAE_MIN_NOMINAL_DEFAULT) {
      const oldNominalE = Math.max(0, Number(persona.oldNominal) || 0);
      const fixedSalary = Math.max(0, Number(persona.fixedSalary) || 0);
      const minimum = Math.max(0, Number(minimumNominal) || 0);
      return {
        oldNominalE,
        newNominalE: Math.max(oldNominalE, fixedSalary * PERSONAE_TARGET_SHARE_PCT / 100, minimum)
      };
    }

    function getPersonaeContext(persona, minimumNominal = PERSONAE_MIN_NOMINAL_DEFAULT) {
      return Engine.hybridContext(
        persona.oldNominal,
        persona.fixedSalary,
        PERSONAE_TARGET_SHARE_PCT,
        minimumNominal,
        0,
        PERSONAE_ZERO_THRESHOLD,
        PERSONAE_ACCELERATION_START,
        PERSONAE_ACCELERATION_END,
        state.payoutCap
      );
    }

    function getPersonaePayouts(persona, achievement, mode = 'euros',
      minimumNominal = PERSONAE_MIN_NOMINAL_DEFAULT,
      objectiveIncrease = PERSONAE_OBJECTIVE_INCREASE_DEFAULT) {
      if (!isFinite(achievement)) throw new Error('Achievement must be a finite number.');
      if (mode !== 'euros' && mode !== 'percent') throw new Error('Unknown Personae curve mode: ' + mode);
      const ctx = getPersonaeContext(persona, minimumNominal);
      if (mode === 'percent') {
        return {
          oldPayout: achievement,
          newPayout: ctx.newNomE > 0
            ? Engine.hybridE(achievement, ctx) / ctx.newNomE * 100
            : 0
        };
      }
      return {
        oldPayout: Engine.oldE(achievement, ctx),
        newPayout: Engine.hybridE(achievement - objectiveIncrease, ctx)
      };
    }

    function getPersonaeCrossover(persona, minimumNominal, objectiveIncrease, maxAchievement) {
      let previousX = 0;
      let previousDifference = getPersonaePayouts(persona, 0, 'euros', minimumNominal, objectiveIncrease).newPayout;
      for (let x = 0.25; x <= maxAchievement; x += 0.25) {
        const payouts = getPersonaePayouts(persona, x, 'euros', minimumNominal, objectiveIncrease);
        const difference = payouts.newPayout - payouts.oldPayout;
        if (difference > 0) {
          if (previousDifference >= 0) return previousX;
          const fraction = -previousDifference / (difference - previousDifference);
          return previousX + fraction * (x - previousX);
        }
        previousX = x;
        previousDifference = difference;
      }
      return null;
    }

    function shouldIncludePersonaeByDefault(segment) {
      return !/PT/i.test(String(segment || ''));
    }

    function getPersonaeRowKey(row) {
      return JSON.stringify([row.country, row.seniority, row.segment]);
    }

    function getPersonaeDisplayName(row) {
      return row.segment + ' · ' + row.country + ' / ' + row.seniority;
    }

    function filterPersonaeRows(rows, filters = {}) {
      const { country = '', seniority = '', includedSegments } = filters;
      return rows.filter(row =>
        (!country || row.country === country) &&
        (!seniority || row.seniority === seniority) &&
        (!includedSegments || includedSegments.has(getPersonaeRowKey(row)))
      );
    }

    function escapePersonaeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }

    function normalizePersonaeResponse(response) {
      if (!response || !Array.isArray(response.personae) ||
          !Number.isInteger(response.ignored) || response.ignored < 0) {
        throw new Error('Réponse Personae invalide.');
      }
      return response.personae.map((row, index) => {
        const normalized = {
          country: String(row.country || '').trim(),
          seniority: String(row.seniority || '').trim(),
          headcount: Number(row.headcount),
          meanAge: Number(row.meanAge),
          fixedSalary: Number(row.fixedSalary),
          oldNominal: Number(row.oldNominal),
          oldNominalPct: Number(row.oldNominalPct),
          segment: String(row.segment || '').trim()
        };
        if (!normalized.country || !normalized.seniority || !normalized.segment ||
            !Number.isFinite(normalized.headcount) || normalized.headcount <= 0 ||
            !Number.isFinite(normalized.meanAge) || normalized.meanAge < 0 ||
            !Number.isFinite(normalized.fixedSalary) || normalized.fixedSalary <= 0 ||
            !Number.isFinite(normalized.oldNominal) || normalized.oldNominal < 0 ||
            !Number.isFinite(normalized.oldNominalPct) || normalized.oldNominalPct < 0) {
          throw new Error('Données invalides pour la persona en ligne ' + (index + 3) + '.');
        }
        return normalized;
      });
    }

    function loadPersonaeFromSheet() {
      const status = document.getElementById('personae-status');
      if (personaeLoading) return;
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        status.innerText = 'Erreur : ouvrez la version Apps Script pour charger les données Personae.';
        return;
      }
      personaeLoading = true;
      status.innerText = 'Chargement des personas…';
      google.script.run
        .withSuccessHandler(response => {
          personaeLoading = false;
          try {
            const nextRows = normalizePersonaeResponse(response);
            const previousSegments = new Set(personaeData.map(getPersonaeRowKey));
            const previousIncluded = personaeIncluded;
            personaeData = nextRows;
            personaeLoaded = true;
            personaeIncluded = new Set(nextRows
              .filter(row => previousSegments.has(getPersonaeRowKey(row))
                ? previousIncluded.has(getPersonaeRowKey(row))
                : shouldIncludePersonaeByDefault(row.segment))
              .map(getPersonaeRowKey));
            updatePersonaeFilterOptions();
            status.innerText = personaeData.length + ' persona(s) chargée(s), ' +
              response.ignored + ' ligne(s) ignorée(s).';
            renderPersonaeView();
          } catch (error) {
            personaeData = [];
            personaeLoaded = false;
            personaeIncluded.clear();
            status.innerText = 'Erreur : ' + error.message;
            renderPersonaeView();
          }
        })
        .withFailureHandler(error => {
          personaeLoading = false;
          status.innerText = 'Erreur : ' + (error && error.message ? error.message : String(error));
        })
        .getPersonae();
    }

    function updatePersonaeFilterOptions() {
      [
        ['personae-filter-country', 'country'],
        ['personae-filter-seniority', 'seniority']
      ].forEach(([id, key]) => {
        const select = document.getElementById(id);
        const current = personaeFilters[key];
        const options = Array.from(new Set(personaeData.map(row => row[key]))).sort((a, b) => a.localeCompare(b));
        if (current && !options.includes(current)) personaeFilters[key] = '';
        select.innerHTML = '<option value="">Tous</option>' + options.map(value =>
          '<option value="' + escapePersonaeHtml(value) + '">' + escapePersonaeHtml(value) + '</option>'
        ).join('');
        select.value = personaeFilters[key];
      });
    }

    function visiblePersonaeRows() {
      return filterPersonaeRows(personaeData, {
        country: personaeFilters.country,
        seniority: personaeFilters.seniority,
        includedSegments: personaeIncluded
      });
    }

    function rowsForPersonaeTable() {
      return filterPersonaeRows(personaeData, {
        country: personaeFilters.country,
        seniority: personaeFilters.seniority,
        includedSegments: new Set(personaeData.map(getPersonaeRowKey))
      });
    }

    function formatPersonaeNumber(value, maximumFractionDigits = 0) {
      return new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(value);
    }

    function formatPersonaeEuros(value) {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 0
      }).format(value);
    }

    function renderPersonaeTable() {
      const body = document.getElementById('personae-table-body');
      const rows = rowsForPersonaeTable();
      body.innerHTML = rows.map(row => {
        const key = getPersonaeRowKey(row);
        const checked = personaeIncluded.has(key) ? ' checked' : '';
        const segment = escapePersonaeHtml(row.segment);
        const label = escapePersonaeHtml(getPersonaeDisplayName(row));
        return '<tr>' +
          '<td class="px-3 py-2"><input type="checkbox" data-key="' + escapePersonaeHtml(key) + '"' + checked +
            ' aria-label="Inclure ' + label + '" class="accent-violet-600"></td>' +
          '<td class="px-3 py-2">' + escapePersonaeHtml(row.country) + '</td>' +
          '<td class="px-3 py-2">' + escapePersonaeHtml(row.seniority) + '</td>' +
          '<td class="px-3 py-2 font-medium">' + segment + '</td>' +
          '<td class="px-3 py-2 text-right font-mono">' + formatPersonaeNumber(row.headcount) + '</td>' +
          '<td class="px-3 py-2 text-right font-mono">' + formatPersonaeNumber(row.meanAge, 1) + '</td>' +
          '<td class="px-3 py-2 text-right font-mono">' + formatPersonaeEuros(row.fixedSalary) + '</td>' +
          '<td class="px-3 py-2 text-right font-mono">' + formatPersonaeEuros(row.oldNominal) + '</td>' +
          '<td class="px-3 py-2 text-right font-mono">' + formatPersonaeNumber(row.oldNominalPct, 1) + '%</td>' +
          '</tr>';
      }).join('');
    }

    function setPersonaeMode(mode) {
      if (mode !== 'euros' && mode !== 'percent') throw new Error('Unknown Personae curve mode: ' + mode);
      personaeMode = mode;
      const euroButton = document.getElementById('personae-mode-euros');
      const percentButton = document.getElementById('personae-mode-percent');
      const active = 'px-3 py-2 rounded-lg bg-white text-violet-700 shadow-sm';
      const inactive = 'px-3 py-2 rounded-lg text-slate-600 hover:text-violet-700';
      euroButton.className = mode === 'euros' ? active : inactive;
      percentButton.className = mode === 'percent' ? active : inactive;
      const increaseInput = document.getElementById('personae-objective-increase');
      increaseInput.disabled = mode === 'percent';
      const note = document.getElementById('personae-mode-note');
      note.innerText = mode === 'percent'
        ? 'Pas de hausse d’objectif appliquée en mode %/%. Ancienne courbe commune y = x; les courbes hybrides sont exprimées en % de leur nouveau nominal.'
        : 'En mode %/€, la nouvelle courbe tient compte de la hausse d’objectif.';
      renderPersonaeView();
    }

    function initPersonaeChart() {
      const ctx = document.getElementById('personae-chart').getContext('2d');
      personaeChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: [] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label(context) {
                  const point = context.raw || {};
                  const value = personaeMode === 'percent'
                    ? formatPersonaeNumber(point.y, 1) + '%'
                    : formatPersonaeEuros(point.y);
                  return context.dataset.label + ': ' + value;
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              min: 0,
              max: 150,
              title: { display: true, text: 'Atteinte de l’objectif (%)' },
              ticks: { callback: value => value + '%' }
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Rémunération variable (€)' },
              ticks: { callback: value => personaeMode === 'percent'
                ? value + '%'
                : new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value) + ' €' }
            }
          }
        }
      });
    }

    function renderPersonaeCrossings(rows) {
      const container = document.getElementById('personae-crossings');
      if (personaeMode === 'percent') {
        container.innerHTML = '<p class="sm:col-span-2 lg:col-span-3 text-slate-500">Sans hausse d’objectif, les courbes hybrides rejoignent la référence y = x à 100 %; aucun dépassement n’est appliqué dans ce mode.</p>';
        return;
      }
      const maxAchievement = 200 + personaeObjectiveIncrease;
      container.innerHTML = rows.map(row => {
        const crossing = getPersonaeCrossover(
          row, personaeMinimumNominal, personaeObjectiveIncrease, maxAchievement
        );
        const color = PERSONAE_COLORS[rows.indexOf(row) % PERSONAE_COLORS.length];
        const summary = crossing === null
          ? 'Aucun dépassement jusqu’à ' + maxAchievement + ' %'
          : 'Dépassement dès ' + formatPersonaeNumber(crossing, 1) + ' %';
        return '<div class="rounded-lg border border-slate-100 px-3 py-2"><span class="mr-2 inline-block h-2 w-2 rounded-full" style="background-color:' +
          color + '"></span><span class="font-semibold">' + escapePersonaeHtml(getPersonaeDisplayName(row)) +
          '</span><span class="mt-1 block text-slate-500">' + summary + '</span></div>';
      }).join('');
    }

    function renderPersonaeLegend(rows) {
      const container = document.getElementById('personae-chart-legend');
      container.innerHTML = rows.map((row, index) =>
        '<span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full" style="background-color:' +
        PERSONAE_COLORS[index % PERSONAE_COLORS.length] + '"></span>' +
        escapePersonaeHtml(getPersonaeDisplayName(row)) + '</span>'
      ).join('');
    }

    function renderPersonaeChart(rows) {
      if (!personaeChart) return;
      const xMax = personaeMode === 'euros' ? 200 + personaeObjectiveIncrease : 150;
      const points = Array.from({ length: Math.ceil(xMax / 2) + 1 }, (_, index) => index * 2)
        .filter(value => value <= xMax);
      const datasets = [];
      if (personaeMode === 'percent') {
        datasets.push({
          label: 'Ancienne courbe commune (y = x)',
          data: points.map(x => ({ x, y: x })),
          borderColor: '#475569',
          borderDash: [7, 5],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0,
          order: 2
        });
      }
      rows.forEach((row, index) => {
        const color = PERSONAE_COLORS[index % PERSONAE_COLORS.length];
        if (personaeMode === 'euros') {
          datasets.push({
            label: getPersonaeDisplayName(row) + ' — ancienne',
            data: points.map(x => ({ x, y: getPersonaePayouts(
              row, x, 'euros', personaeMinimumNominal, personaeObjectiveIncrease
            ).oldPayout })),
            borderColor: color,
            borderDash: [6, 4],
            borderWidth: 1.75,
            pointRadius: 0,
            tension: 0,
            order: 3
          });
        }
        datasets.push({
          label: getPersonaeDisplayName(row) + ' — hybride',
          data: points.map(x => ({ x, y: getPersonaePayouts(
            row, x, personaeMode, personaeMinimumNominal, personaeObjectiveIncrease
          ).newPayout })),
          borderColor: color,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0,
          order: 1
        });
        if (personaeMode === 'euros') {
          const crossing = getPersonaeCrossover(
            row, personaeMinimumNominal, personaeObjectiveIncrease, xMax
          );
          if (crossing !== null) {
            datasets.push({
              type: 'scatter',
              label: getPersonaeDisplayName(row) + ' — début du dépassement',
              data: [{ x: crossing, y: getPersonaePayouts(
                row, crossing, 'euros', personaeMinimumNominal, personaeObjectiveIncrease
              ).newPayout }],
              borderColor: color,
              backgroundColor: color,
              pointStyle: 'rectRot',
              pointRadius: 5,
              pointHoverRadius: 7,
              showLine: false,
              order: 0
            });
          }
        }
      });
      personaeChart.data.datasets = datasets;
      personaeChart.options.scales.x.max = xMax;
      personaeChart.options.scales.y.title.text = personaeMode === 'percent'
        ? '% du nominal propre à chaque courbe'
        : 'Rémunération variable (€)';
      personaeChart.update('none');
    }

    function renderPersonaeView() {
      renderPersonaeTable();
      const rows = visiblePersonaeRows();
      const empty = document.getElementById('personae-empty');
      empty.classList.toggle('hidden', rows.length > 0);
      renderPersonaeLegend(rows);
      renderPersonaeCrossings(rows);
      renderPersonaeChart(rows);
    }

    function initPersonaeView() {
      if (personaeInitialized) return;
      personaeInitialized = true;
      personaeChart = null;
      const country = document.getElementById('personae-filter-country');
      const seniority = document.getElementById('personae-filter-seniority');
      country.addEventListener('change', event => {
        personaeFilters.country = event.target.value;
        renderPersonaeView();
      });
      seniority.addEventListener('change', event => {
        personaeFilters.seniority = event.target.value;
        renderPersonaeView();
      });
      document.getElementById('personae-reload').addEventListener('click', loadPersonaeFromSheet);
      document.getElementById('personae-min-nominal').addEventListener('input', event => {
        const value = Number(event.target.value);
        if (!Number.isFinite(value) || value < 0) return;
        personaeMinimumNominal = value;
        renderPersonaeView();
      });
      document.getElementById('personae-objective-increase').addEventListener('input', event => {
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        personaeObjectiveIncrease = Math.max(0, Math.min(60, value));
        document.getElementById('personae-objective-value').innerText = '+' + personaeObjectiveIncrease;
        renderPersonaeView();
      });
      document.getElementById('personae-table-body').addEventListener('change', event => {
        const input = event.target;
        if (!input || !input.dataset || !input.dataset.key) return;
        if (input.checked) personaeIncluded.add(input.dataset.key);
        else personaeIncluded.delete(input.dataset.key);
        renderPersonaeView();
      });
      initPersonaeChart();
      setPersonaeMode(personaeMode);
      renderPersonaeView();
    }
