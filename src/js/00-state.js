    // State management
    const state = {
      targetIncrease: 0,     // % (e.g. 0 to 60%)
      overperf: 0,           // % (e.g. -10% to +15%)
      muInit: 110,           // % (historical mean, default 110%)
      sigmaInit: 30,         // % (standard dev, strictly fixed at 30% for rigid translation)
      baseC2P: 700,          // M€
      marginRate: 20,        // % (Corridor Rate)
      currentPEX: 2.5,       // M€ (actual PEX paid currently, default 2.5 M€)
      oldVarShare: 11,       // % (current average variable share, default 11%)
      newVarShare: 20,       // % (new target variable share, default 20%)
      headcount: 350,        // reps
      payoutCap: 200,        // % max payout
      repInitPerf: 110,      // % individual rep historical perf
      repFixedSalary: 50000, // € individual rep base fixed salary
      repCurrentBonusPct: 10,// % of fixed salary currently paid as bonus (0 to 30%)
      // Default payout curve: flat 0 up to 40% achievement, linear 0→100% payout
      // between 40% and 100%, then linear 100→200% payout between 100% and 200%
      breakpoints: [
        { achievement: 0, payout: 0 },
        { achievement: 40, payout: 0 },
        { achievement: 100, payout: 100 },
        { achievement: 200, payout: 200 }
      ]
    };

    let mainChartInstance = null;

    // Trigger KaTeX render across all elements
    function renderMathSafely() {
      if (window.renderMathInElement) {
        renderMathInElement(document.body, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '\\[', right: '\\]', display: true},
            {left: '\\(', right: '\\)', display: false},
            {left: '$', right: '$', display: false}
          ],
          throwOnError: false
        });
      }
    }
