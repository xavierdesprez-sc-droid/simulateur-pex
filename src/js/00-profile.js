    // Cluster-specific source mapping. The rest of the app consumes only these
    // canonical fields: jobProfile, country, fixed and nominal.
    const POPULATION_PROFILES = {
      SWE: {
        id: 'SWE',
        sheetName: 'Data dynamic distributions',
        headerRow: 4,
        csvHeaderRow: 1,
        csvFile: 'population_test.csv',
        columns: { orga: 0, jobProfile: 1, country: 2, fixed: 6, nominal: 7 },
        excludedOrgaPattern: /MG/i,
        views: { fourToOne: true, personae: true },
        populationSourceSwitch: true,
        defaultPopulationSource: 'swe2025',
        populationSources: {
          swe2025: { label: 'Nouvelle source (Copie de Liste Sales)', csvFile: 'population_test_swe2025.csv', format: 'named' },
          legacy: { label: 'Ancienne source (Data dynamic distributions)', csvFile: 'population_test.csv', format: 'indexed' }
        },
        defaultBreakpoints: [
          { achievement: 0, payout: 0 },
          { achievement: 40, payout: 0 },
          { achievement: 100, payout: 100 },
          { achievement: 200, payout: 200 }
        ]
      },
      NCE: {
        id: 'NCE',
        sheetName: 'Data dynamic distributions',
        headerRow: 4,
        csvHeaderRow: 1,
        csvFile: 'population_test_nce.csv',
        columns: { jobProfile: 0, country: 1, fixed: 3, nominal: 4 },
        excludedOrgaPattern: null,
        views: { fourToOne: false, personae: false },
        populationSourceSwitch: false,
        blankPopulationInputs: true,
        blankPopulationMetrics: true,
        defaultBreakpoints: [
          { achievement: 0, payout: 0 },
          { achievement: 20, payout: 10 },
          { achievement: 80, payout: 50 },
          { achievement: 100, payout: 100 },
          { achievement: 180, payout: 200 }
        ]
      }
    };

    let activePopulationProfile = POPULATION_PROFILES[
      typeof BUILD_PROFILE === 'string' ? BUILD_PROFILE : 'SWE'
    ] || POPULATION_PROFILES.SWE;

    let activePopulationSourceKey = activePopulationProfile.defaultPopulationSource || null;

    function configurePopulationProfile(profileId) {
      const profile = POPULATION_PROFILES[String(profileId || '').toUpperCase()];
      if (!profile) throw new Error('Unknown population profile: ' + profileId);
      activePopulationProfile = profile;
      activePopulationSourceKey = profile.defaultPopulationSource || null;
      advPopulation = [];
      popFilters = { country: '', jobProfile: '' };
      realAgg = null;
      state.breakpoints = profile.defaultBreakpoints.map(p => ({ ...p }));
      return profile;
    }

    function applyProfileUi() {
      [
        ['fourToOne', 'tab-four-to-one', 'view-four-to-one'],
        ['personae', 'tab-personae', 'view-personae']
      ].forEach(([feature, tabId, viewId]) => {
        const hidden = !activePopulationProfile.views[feature];
        const tab = document.getElementById(tabId);
        if (tab) tab.classList.toggle('hidden', hidden);
        const view = document.getElementById(viewId);
        if (view && hidden) view.classList.add('hidden');
      });
      const switchWrap = document.getElementById('pop-source-switch');
      const switchEnabled = Boolean(activePopulationProfile.populationSourceSwitch);
      if (switchWrap) switchWrap.classList.toggle('hidden', !switchEnabled);
      const select = document.getElementById('pop-source-select');
      if (select && switchEnabled) select.value = activePopulationSourceKey;
    }
