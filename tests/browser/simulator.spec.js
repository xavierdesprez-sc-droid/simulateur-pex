'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const profiles = [
  { name: 'SWE', file: 'index.html', views: ['standard', 'four-to-one', 'advanced', 'personae', 'matrix'] },
  { name: 'NCE', file: 'dist/NCE/index.html', views: ['standard', 'advanced', 'matrix'] }
];
const laptopWidths = [1024, 1280, 1366];

async function openSimulator(page, file) {
  await page.addInitScript(() => {
    const population = {
      reps: [
        { jobProfile: 'Sales', country: 'FR', fixed: 50000, nominal: 6000 },
        { jobProfile: 'Sales', country: 'ES', fixed: 65000, nominal: 8500 }
      ],
      ignored: 0,
      canViewIndividualTables: true
    };
    const personae = {
      personae: [
        { country: 'FR', seniority: 'Junior', segment: 'France Junior', headcount: 10, meanAge: 32, fixedSalary: 50000, oldNominal: 6000, oldNominalPct: 12 }
      ],
      ignored: 0
    };
    window.google = {
      script: {
        run: {
          withSuccessHandler(fn) { this.success = fn; return this; },
          withFailureHandler(fn) { this.failure = fn; return this; },
          getPopulation() { this.success(population); },
          getPersonae() { this.success(personae); }
        }
      }
    };
  });
  await page.goto(pathToFileURL(path.resolve(__dirname, '..', '..', file)).href, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#view-advanced')).toBeHidden();
  await expect.poll(() => page.locator('#view-standard').evaluate(el => getComputedStyle(el).maxWidth))
    .toBe('1280px');
}

for (const { name, file, view } of [
  { name: 'SWE-standard', file: 'index.html', view: 'standard' },
  { name: 'SWE-personae', file: 'index.html', view: 'personae' },
  { name: 'NCE-matrix', file: 'dist/NCE/index.html', view: 'matrix' }
]) {
  test(`${name} laptop screenshot`, async ({ page }) => {
    test.skip(process.platform !== 'win32', 'Screenshots are reviewed on Windows CI');
    await page.setViewportSize({ width: 1366, height: 768 });
    await openSimulator(page, file);
    if (view !== 'standard') await page.locator(`#tab-${view}`).click();
    await expect(page.locator(`#view-${view}`)).toBeVisible();
    await expect(page).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      mask: [page.locator('canvas')],
      maskColor: '#e2e8f0',
      maxDiffPixelRatio: 0.01
    });
  });
}

for (const profile of profiles) {
  for (const width of laptopWidths) {
    test(`${profile.name} at ${width}px keeps views isolated and controls within the laptop`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openSimulator(page, profile.file);
      for (const view of profile.views) {
        if (view !== 'standard') await page.locator(`#tab-${view}`).click();
        const visible = await page.locator('main[id^="view-"]').evaluateAll(elements =>
          elements.filter(el => getComputedStyle(el).display !== 'none').map(el => el.id));
        expect(visible, `visible views after selecting ${view}`).toEqual([`view-${view}`]);

        const clippedNavigation = await page.locator('header [role="group"]')
          .evaluateAll(groups => groups.filter(el => el.scrollWidth > el.clientWidth + 2)
            .map(el => el.getAttribute('aria-label')));
        expect(clippedNavigation, `${profile.name} ${view} at ${width}px must show every navigation option`)
          .toEqual([]);

        const overflow = await page.evaluate(() => {
          const active = [...document.querySelectorAll('main[id^="view-"]')]
            .find(el => getComputedStyle(el).display !== 'none');
          const clipped = [...active.querySelectorAll('*')].filter(el =>
            el.clientWidth > 1 && !el.classList.contains('sr-only') &&
            el.scrollWidth - el.clientWidth > 32 &&
            !el.closest('.overflow-x-auto') &&
            getComputedStyle(el).overflowX !== 'auto'
          ).map(el => el.id || el.className.toString().slice(0, 75));
          return {
            page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            clipped
          };
        });
        expect(overflow, `${profile.name} ${view} at ${width}px`).toEqual({ page: 0, clipped: [] });

        const lowContrastTracks = await page.locator(`#view-${view} input[type="range"]:not(.dual-range)`)
          .evaluateAll(elements => elements.filter(el => {
            const rgb = getComputedStyle(el).backgroundColor.match(/\d+/g)?.slice(0, 3).map(Number);
            if (!rgb) return true;
            const luminance = rgb.map(c => {
              const channel = c / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            }).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
            return 1.05 / (luminance + 0.05) < 3;
          }).map(el => el.id));
        expect(lowContrastTracks, `${profile.name} ${view} range tracks need 3:1 contrast on white`).toEqual([]);
      }
    });
  }
}
