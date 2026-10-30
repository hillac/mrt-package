// Run against the patched source:
// NODE_PATH=<test dependency node_modules> node --test tests/filter-range.test.cjs
// Set MRT_RANGE_COMPONENT to the patched MRT_FilterRangeFields.tsx path.
// Test dependencies: esbuild, @playwright/test, react, react-dom, @mantine/hooks.
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { delimiter, resolve } = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

let browser;
let bundle;
before(async () => {
  const component = process.env.MRT_RANGE_COMPONENT ?? resolve(__dirname, '../src/components/inputs/MRT_FilterRangeFields.tsx');
  const result = await build({
    stdin: {
      contents: `
        import React, { StrictMode, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { MRT_FilterRangeFields } from ${JSON.stringify(component)};
        const root = createRoot(document.getElementById('root'));
        window.writes = [];
        function Harness() {
          const [external, setExternal] = useState(Object.freeze(['100', '200']));
          window.setExternal = setExternal;
          const column = {
            getFilterValue: () => external,
            setFilterValue: (value) => {
              window.writes.push(value === undefined ? null : value);
              setExternal(value);
            },
          };
          return <MRT_FilterRangeFields header={{ column }} table={{ options: { manualFiltering: false } }} />;
        }
        window.unmount = () => root.unmount();
        root.render(<StrictMode><Harness /></StrictMode>);
      `,
      loader: 'tsx',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    jsx: 'automatic',
    nodePaths: (process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean),
    plugins: [{
      name: 'input-shell',
      setup(build) {
        // Exercise the real range component and React lifecycle. Replace only
        // the visual shell so this test needs no full table or CSS pipeline.
        build.onResolve({ filter: /^(\.\/MRT_FilterTextInput|@mantine\/core|clsx|.*\.module\.css)$/ }, ({ path }) => ({ path, namespace: 'shell' }));
        build.onLoad({ filter: /.*/, namespace: 'shell' }, ({ path }) => ({
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents: path === './MRT_FilterTextInput'
            ? `export function MRT_FilterTextInput({ rangeFilterIndex, rangeFilterValue, onRangeFilterValueChange }) {
                return <input aria-label={rangeFilterIndex === 0 ? 'Minimum' : 'Maximum'} value={rangeFilterValue ?? ''} onChange={event => onRangeFilterValueChange(event.target.value)} />;
              }`
            : path === '@mantine/core'
              ? 'export function Box({children}) { return <div>{children}</div> }'
              : path === 'clsx'
                ? 'export default (...values) => values.filter(Boolean).join(" ")'
                : 'export default {}',
        }));
      },
    }],
  });
  bundle = result.outputFiles[0].text;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  browser = await chromium.launch(executablePath ? { executablePath } : undefined);
});
after(async () => { await browser?.close(); });

async function withRange(run) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle });
    const minimum = page.getByRole('textbox', { name: 'Minimum' });
    const maximum = page.getByRole('textbox', { name: 'Maximum' });
    await expect(minimum).toHaveValue('100');
    await run(page, minimum, maximum);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

// These waits intentionally pass the component's 200ms debounce deadline.
const settle = page => page.waitForTimeout(450);
const writes = page => page.evaluate(() => window.writes);

test('Strict Mode mount does not write controlled state', () => withRange(async page => {
  await settle(page);
  assert.deepEqual(await writes(page), []);
}));

test('both bounds commit together without mutating the frozen external tuple', () => withRange(async (page, minimum, maximum) => {
  await minimum.fill('150');
  await maximum.fill('250');
  await settle(page);
  assert.deepEqual(await writes(page), [['150', '250']]);
}));

test('an equal external tuple preserves pending typing', () => withRange(async (page, minimum) => {
  await minimum.fill('150');
  await page.evaluate(() => window.setExternal(['100', '200']));
  await expect(minimum).toHaveValue('150');
  await settle(page);
  assert.deepEqual(await writes(page), [['150', '200']]);
}));

test('external reset cancels the pending edit without echoing a write', () => withRange(async (page, minimum, maximum) => {
  await minimum.fill('150');
  await page.evaluate(() => window.setExternal(undefined));
  await expect(minimum).toHaveValue('');
  await expect(maximum).toHaveValue('');
  await settle(page);
  assert.deepEqual(await writes(page), []);
}));

test('external replacement cancels the draft and supplies the next edit', () => withRange(async (page, minimum, maximum) => {
  await minimum.fill('150');
  await page.evaluate(() => window.setExternal(['300', '400']));
  await expect(minimum).toHaveValue('300');
  await expect(maximum).toHaveValue('400');
  await settle(page);
  assert.deepEqual(await writes(page), []);
  await minimum.fill('350');
  await settle(page);
  assert.deepEqual(await writes(page), [['350', '400']]);
}));

test('clearing both bounds removes the filter', () => withRange(async (page, minimum, maximum) => {
  await minimum.fill('');
  await maximum.fill('');
  await settle(page);
  assert.deepEqual(await writes(page), [null]);
}));

test('unmount cancels pending writes', () => withRange(async (page, minimum) => {
  await minimum.fill('150');
  await page.evaluate(() => window.unmount());
  await settle(page);
  assert.deepEqual(await writes(page), []);
}));
