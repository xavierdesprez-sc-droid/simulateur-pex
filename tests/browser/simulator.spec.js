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

test('range controls keep a transparent input background and full-size touch target', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await openSimulator(page, 'index.html');
  const control = await page.locator('#slider-target-increase').evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    height: getComputedStyle(element).height
  }));
  expect(control).toEqual({
    background: 'rgba(0, 0, 0, 0)',
    height: '40px'
  });
});

test('header removes scenario presets and retains reset controls', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await openSimulator(page, 'index.html');
  await expect(page.locator('[aria-label="Scenario presets"], .preset-btn, [id^="preset-"]')).toHaveCount(0);
  await page.locator('#slider-target-increase').evaluate(element => {
    element.value = '30';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#slider-overperf').evaluate(element => {
    element.value = '2';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Reset parameters' }).click();
  await expect(page.locator('#slider-target-increase')).toHaveValue('0');
  await expect(page.locator('#slider-overperf')).toHaveValue('0');
});

test('range thumbs are vertically centered on their tracks', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await openSimulator(page, 'index.html');
  const slider = page.locator('#slider-target-increase');
  const touchHeight = await slider.evaluate(element => element.getBoundingClientRect().height);
  expect(touchHeight).toBe(40);

  const screenshot = await slider.screenshot();
  const alignment = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const trackRows = [];
    const thumbRows = [];

    for (let y = 0; y < height; y++) {
      let trackPixels = 0;
      let thumbPixels = 0;
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const [red, green, blue] = data.slice(offset, offset + 3);
        if (Math.abs(red - 226) <= 2 && Math.abs(green - 232) <= 2 && Math.abs(blue - 240) <= 2) {
          trackPixels++;
        }
        if (red >= 60 && red <= 100 && green >= 50 && green <= 90 && blue >= 210) {
          thumbPixels++;
        }
      }
      if (trackPixels > width * 0.1) trackRows.push(y);
      if (thumbPixels >= 6) thumbRows.push(y);
    }

    return {
      trackCenter: (trackRows[0] + trackRows[trackRows.length - 1]) / 2,
      thumbCenter: (thumbRows[0] + thumbRows[thumbRows.length - 1]) / 2
    };
  }, screenshot.toString('base64'));
  expect(Math.abs(alignment.thumbCenter - alignment.trackCenter)).toBeLessThanOrEqual(1);
});
