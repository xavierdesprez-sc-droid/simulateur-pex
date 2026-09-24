'use strict';
/** Personae view: segment filters and hybrid curve comparisons. */
module.exports = function suite(__h) {
  const { check, assertClose, buildString, els } = __h;

  const sweHtml = buildString('SWE');
  const nceHtml = buildString('NCE');
  check('Personae tab is present only in SWE', /id="tab-personae"/.test(sweHtml) && !/id="tab-personae"/.test(nceHtml));
  check('compensation switch is available in both hybrid views',
    /id="adv-hybrid-objective-compensation"/.test(sweHtml) &&
    /id="personae-hybrid-objective-compensation"/.test(sweHtml));
  check('Personae view includes both chart modes and no-increase notice', /personae-mode-percent/.test(sweHtml) && /Pas de hausse d’objectif appliquée en mode %\/%/.test(sweHtml));
  check('Personae chart has a legend mapping colors to segments', /id="personae-chart-legend"/.test(sweHtml));
  check('Country filter supports multiple selections and the new axis label', /id="personae-filter-countries"/.test(sweHtml) && /Atteinte avant hausse d’objectif/.test(sweHtml));
  check('Portugal is selectable as a country, not filtered by persona text', /Portugal est décoché par défaut/.test(sweHtml) && !/personas contenant « PT » sont exclues/.test(sweHtml));

  const helpersAvailable =
    typeof getPersonaeNominals === 'function' &&
    typeof getPersonaePayouts === 'function' &&
    typeof filterPersonaeRows === 'function' &&
    typeof loadPersonaeFromSheet === 'function';
  check('Personae curve and filter helpers are available', helpersAvailable);
  if (!helpersAvailable) return;

  const persona = {
    country: 'FR',
    seniority: 'Junior',
    headcount: 10,
    meanAge: 32,
    fixedSalary: 50000,
    oldNominal: 6000,
    oldNominalPct: 12,
    segment: '1 FR - Junior Inside Sales'
  };
  const nominals = getPersonaeNominals(persona, 8000);
  check('new nominal uses the largest of old nominal, 20% fixed, and floor', nominals.oldNominalE === 6000 && nominals.newNominalE === 10000);

  const eurosAt120 = getPersonaePayouts(persona, 120, 'euros', 8000, 20);
  assertClose('euro mode applies +20 achievement points to the hybrid curve', eurosAt120.newPayout, 10000);
  assertClose('euro mode compares against the unshifted old curve', eurosAt120.oldPayout, 7200);

  state.hybridObjectiveCompensation = true;
  const compensatedEuroAt100 = getPersonaePayouts(persona, 100, 'euros', 8000, 20);
  assertClose('Personae compensation matches old payout at 100% after a +20 point target rise', compensatedEuroAt100.newPayout, 6000);

  const percentAt80 = getPersonaePayouts(persona, 80, 'percent', 8000, 20);
  assertClose('percent mode leaves the old baseline at y=x', percentAt80.oldPayout, 80);
  assertClose('percent mode ignores target increase and normalizes by new nominal', percentAt80.newPayout, 48);
  state.hybridObjectiveCompensation = false;

  const percentAt39 = getPersonaePayouts(persona, 39, 'percent', 8000, 0);
  const percentAt40 = getPersonaePayouts(persona, 40, 'percent', 8000, 0);
  assertClose('hybrid pays nothing below the 40% threshold', percentAt39.newPayout, 0);
  assertClose('hybrid starts paying at the 40% threshold', percentAt40.newPayout, 24);
  const percentAt100 = getPersonaePayouts(persona, 100, 'percent', 8000, 0);
  assertClose('hybrid reaches 100% of new nominal at 100% achievement', percentAt100.newPayout, 100);

  check('Portugal identifiers are recognized by country, including code and name',
    typeof isPersonaePortugalCountry === 'function' &&
    isPersonaePortugalCountry('PT') &&
    isPersonaePortugalCountry('Portugal') &&
    !isPersonaePortugalCountry('France'));
  check('non-Portugal countries are selected by default',
    typeof shouldSelectPersonaeCountryByDefault === 'function' &&
    shouldSelectPersonaeCountryByDefault('FR') &&
    !shouldSelectPersonaeCountryByDefault('PT'));
  const rows = [
    persona,
    { ...persona, country: 'ES' },
    { ...persona, segment: '2 FR - PT Senior' },
    { ...persona, country: 'PT', seniority: 'Senior', segment: '3 PT - Senior Sales' }
  ];
  const rowKey = row => typeof getPersonaeRowKey === 'function'
    ? getPersonaeRowKey(row)
    : JSON.stringify([row.country, row.seniority, row.segment]);
  const personaRowKey = rowKey(persona);
  const filtered = filterPersonaeRows(rows, {
    countries: new Set(['FR', 'ES']),
    seniority: 'Junior',
    includedSegments: new Set(rows.map(rowKey))
  });
  check('multiple countries and seniority filters combine', filtered.length === 3);
  const selectedDuplicate = filterPersonaeRows(rows, {
    includedSegments: new Set([personaRowKey])
  });
  check('same-named personas in different countries can be selected independently', selectedDuplicate.length === 1 && selectedDuplicate[0].country === 'FR');
  check('Personae row identity includes its country and seniority', typeof getPersonaeRowKey === 'function');
  check('threshold sample points create an exact vertical step', typeof getPersonaeCurvePoints === 'function');
  if (typeof getPersonaeCurvePoints === 'function') {
    const percentThreshold = getPersonaeCurvePoints(persona, 'percent', 150, 8000, 20)
      .filter(point => point.x === 40);
    check('percent mode has duplicate threshold x coordinates from zero to payout',
      percentThreshold.length === 2 && percentThreshold[0].y === 0 && percentThreshold[1].y === 2400 / 10000 * 100);
    const euroThreshold = getPersonaeCurvePoints(persona, 'euros', 220, 8000, 20)
      .filter(point => point.x === 60);
    check('euro mode shifts the vertical threshold with the objective increase',
      euroThreshold.length === 2 && euroThreshold[0].y === 0 && euroThreshold[1].y === 2400);
  }

  __h.mock.personaeRows = {
    personae: [
      persona,
      { ...persona, country: 'ES' },
      { ...persona, segment: '2 FR - PT Senior' },
      { ...persona, country: 'PT', seniority: 'Senior', segment: '3 PT - Senior Sales' }
    ],
    ignored: 1
  };
  __h.mock.personaeError = null;
  loadPersonaeFromSheet();
  check('Sheet load includes personas regardless of their label', personaeData.length === 4 && personaeIncluded.has(rowKey(persona)) && personaeIncluded.has(rowKey({ ...persona, segment: '2 FR - PT Senior' })));
  check('Portugal is unchecked while other countries are selected by default',
    !!personaeFilters.countries && personaeFilters.countries.has('FR') &&
    personaeFilters.countries.has('ES') && !personaeFilters.countries.has('PT'));
  check('country options are rendered as independent checkboxes',
    !!els['personae-filter-countries'] &&
    els['personae-filter-countries'].innerHTML.includes('data-country="PT"') &&
    !/data-country="PT"[^>]*checked/.test(els['personae-filter-countries'].innerHTML));
  check('Sheet status reports ignored source rows', /1/.test(els['personae-status'].innerText));

  initPersonaeView();
  setPersonaeMode('percent');
  check('percent mode disables objective increase and retains a shared old baseline', els['personae-objective-increase'].disabled && personaeChart.data.datasets.length === 4 && personaeChart.data.datasets[0].label.includes('y = x'));
  check('percent mode keeps the segment color legend visible', !!els['personae-chart-legend'] && els['personae-chart-legend'].innerHTML.includes(persona.segment));

  setPersonaeMode('euros');
  const tooltipLabel = personaeChart.options.plugins.tooltip.callbacks.label;
  const oldCurve = personaeChart.data.datasets.find(dataset => dataset.label.includes('— ancienne'));
  const hybridCurve = personaeChart.data.datasets.find(dataset => dataset.label.includes('— hybride'));
  check('hovering either persona curve shows its category headcount',
    oldCurve.personaeHeadcount === persona.headcount &&
    hybridCurve.personaeHeadcount === persona.headcount &&
    tooltipLabel({ dataset: hybridCurve, raw: { y: 10000 } }).includes('Effectif : 10'));

  setupEventListeners();
  const personaeCompensationSwitch = document.getElementById('personae-hybrid-objective-compensation');
  const advancedCompensationSwitch = document.getElementById('adv-hybrid-objective-compensation');
  personaeCompensationSwitch.checked = true;
  if (personaeCompensationSwitch.__handlers.change) {
    personaeCompensationSwitch.__handlers.change({ target: personaeCompensationSwitch });
  }
  check('Personae switch enables the shared compensation setting and mirrors the advanced switch',
    state.hybridObjectiveCompensation === true && advancedCompensationSwitch.checked === true);
  advancedCompensationSwitch.checked = false;
  if (advancedCompensationSwitch.__handlers.change) {
    advancedCompensationSwitch.__handlers.change({ target: advancedCompensationSwitch });
  }
  check('advanced switch disables the shared setting and mirrors the Personae switch',
    state.hybridObjectiveCompensation === false && personaeCompensationSwitch.checked === false);

  __h.mock.personaeError = 'Permission denied';
  loadPersonaeFromSheet();
  check('Sheet loading errors are shown to the user', els['personae-status'].innerText.includes('Permission denied'));
};
