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

    function configurePopulationProfile(profileId) {
      const profile = POPULATION_PROFILES[String(profileId || '').toUpperCase()];
      if (!profile) throw new Error('Unknown population profile: ' + profileId);
      activePopulationProfile = profile;
      advPopulation = [];
      popFilters = { country: '', jobProfile: '' };
      realAgg = null;
      state.breakpoints = profile.defaultBreakpoints.map(p => ({ ...p }));
      return profile;
    }

    function applyProfileUi() {
      const hidden = !activePopulationProfile.views.fourToOne;
      ['tab-four-to-one', 'view-four-to-one'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', hidden);
        if (hidden) el.className = (typeof el.className === 'string' ? el.className : '') + ' hidden';
      });
      const personaeHidden = !activePopulationProfile.views.personae;
      ['tab-personae', 'view-personae'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', personaeHidden);
        if (personaeHidden) el.className = (typeof el.className === 'string' ? el.className : '') + ' hidden';
      });
    }
