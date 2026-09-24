'use strict';
module.exports = function suite(__h) {
  const { check, htmlSrc, defaultHtmlSrc, buildSalesRepString } = __h;
  const salesRepHtml = buildSalesRepString();

  check('Sales Rep bundle has its own title',
    /<title>Sales Rep Variable Compensation Calculator<\/title>/.test(salesRepHtml));
  check('Sales Rep bundle has its own body and hybrid engine',
    /id="sales-rep-app"/.test(salesRepHtml) &&
    /hybridContext\(oldNomE, fixedE, targetSharePct/.test(salesRepHtml));
  check('Sales Rep bundle excludes population parsing, server calls, and persistence',
    !/parsePopulationCsv|google\.script\.run|localStorage|sessionStorage/.test(salesRepHtml));
  check('Sales Rep bundle excludes existing simulator views',
    !/id="view-(standard|advanced|matrix)"/.test(salesRepHtml));
  check('Sales Rep harness exposes matching generated HTML',
    htmlSrc === salesRepHtml);
  check('Sales Rep bundle is distinct from the default bundle',
    salesRepHtml !== defaultHtmlSrc);
};
