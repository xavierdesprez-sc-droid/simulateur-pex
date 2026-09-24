'use strict';
/** Personae view: segment filters and hybrid curve comparisons. */
module.exports = function suite(__h) {
  const { check, assertClose, buildString, els } = __h;

  const sweHtml = buildString('SWE');
  const nceHtml = buildString('NCE');
  check('Personae tab is present only in SWE', /id="tab-personae"/.test(sweHtml) && !/id="tab-personae"/.test(nceHtml));
  check('Personae view includes both chart modes and no-increase notice', /personae-mode-percent/.test(sweHtml) && /Pas de hausse d’objectif appliquée en mode %\/%/.test(sweHtml));
  check('Personae chart has a legend mapping colors to segments', /id="personae-chart-legend"/.test(sweHtml));

  const helpersAvailable =
    typeof getPersonaeNominals === 'function' &&
    typeof getPersonaePayouts === 'function' &&
    typeof shouldIncludePersonaeByDefault === 'function' &&
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

  const percentAt80 = getPersonaePayouts(persona, 80, 'percent', 8000, 20);
  assertClose('percent mode leaves the old baseline at y=x', percentAt80.oldPayout, 80);
  assertClose('percent mode ignores target increase and normalizes by new nominal', percentAt80.newPayout, 48);

  const percentAt39 = getPersonaePayouts(persona, 39, 'percent', 8000, 0);
  const percentAt40 = getPersonaePayouts(persona, 40, 'percent', 8000, 0);
  assertClose('hybrid pays nothing below the 40% threshold', percentAt39.newPayout, 0);
  assertClose('hybrid starts paying at the 40% threshold', percentAt40.newPayout, 24);
  const percentAt100 = getPersonaePayouts(persona, 100, 'percent', 8000, 0);
  assertClose('hybrid reaches 100% of new nominal at 100% achievement', percentAt100.newPayout, 100);

  check('PT personas are excluded by default, case-insensitively', !shouldIncludePersonaeByDefault('FR - PT Senior') && shouldIncludePersonaeByDefault('FR - Junior'));
  const rows = [
    persona,
    { ...persona, country: 'ES' },
    { ...persona, country: 'ES', segment: '2 ES - Junior Outside Sales' },
    { ...persona, seniority: 'Senior', segment: '3 FR - PT Senior' }
  ];
  const rowKey = row => typeof getPersonaeRowKey === 'function'
    ? getPersonaeRowKey(row)
    : JSON.stringify([row.country, row.seniority, row.segment]);
  const personaRowKey = rowKey(persona);
  const filtered = filterPersonaeRows(rows, {
    country: 'FR',
    seniority: 'Junior',
    includedSegments: new Set([personaRowKey, rowKey(rows[3])])
  });
  check('country, seniority and segment inclusion filters combine', filtered.length === 1 && filtered[0].segment === persona.segment);
  const selectedDuplicate = filterPersonaeRows(rows, {
    includedSegments: new Set([personaRowKey])
  });
  check('same-named personas in different countries can be selected independently', selectedDuplicate.length === 1 && selectedDuplicate[0].country === 'FR');
  check('Personae row identity includes its country and seniority', typeof getPersonaeRowKey === 'function');

  __h.mock.personaeRows = {
    personae: [
      persona,
      { ...persona, country: 'ES' },
      { ...persona, segment: '2 FR - PT Senior' }
    ],
    ignored: 1
  };
  __h.mock.personaeError = null;
  loadPersonaeFromSheet();
  check('Sheet load keeps all personas but excludes PT by default', personaeData.length === 3 && personaeIncluded.has(rowKey(persona)) && personaeIncluded.has(rowKey({ ...persona, country: 'ES' })) && !personaeIncluded.has(rowKey({ ...persona, segment: '2 FR - PT Senior' })));
  check('Sheet status reports ignored source rows', /1/.test(els['personae-status'].innerText));

  initPersonaeView();
  setPersonaeMode('percent');
  check('percent mode disables objective increase and retains a shared old baseline', els['personae-objective-increase'].disabled && personaeChart.data.datasets.length === 3 && personaeChart.data.datasets[0].label.includes('y = x'));
  check('percent mode keeps the segment color legend visible', !!els['personae-chart-legend'] && els['personae-chart-legend'].innerHTML.includes(persona.segment));

  __h.mock.personaeError = 'Permission denied';
  loadPersonaeFromSheet();
  check('Sheet loading errors are shown to the user', els['personae-status'].innerText.includes('Permission denied'));
};
