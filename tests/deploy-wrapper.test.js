'use strict';

const assert = require('assert').strict;
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const wrapper = path.join(root, 'scripts', 'deploy.ps1');
const powershell = process.env.POWERSHELL || 'powershell.exe';

const fakeClaspSource = String.raw`
const fs = require('fs');
const path = require('path');

const statePath = process.env.PEX_DEPLOY_FAKE_STATE;
const logPath = process.env.PEX_DEPLOY_FAKE_LOG;
const repoRoot = path.resolve(process.env.PEX_DEPLOY_REPO_ROOT);
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const args = process.argv.slice(2);
const command = args[0] || '';

function saveState() {
  fs.writeFileSync(statePath, JSON.stringify(state));
}

function targetForId(id) {
  return Object.keys(state.scriptIds).find(target => state.scriptIds[target] === id);
}

function targetForCwd() {
  const cwd = path.resolve(process.cwd());
  if (cwd === repoRoot) return 'SWE';
  const configPath = path.join(cwd, '.clasp.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const target = targetForId(config.scriptId);
    if (target) return target;
  }
  const segments = cwd.split(path.sep);
  return ['SWE', 'NCE', 'SalesRep'].find(target => segments.includes(target));
}

function record(target, extra = {}) {
  fs.appendFileSync(logPath, JSON.stringify({
    command,
    target: target || null,
    cwd: process.cwd(),
    ...extra
  }) + '\n');
}

function readLocalFiles(target) {
  const files = {};
  for (const name of state.fileNames[target]) {
    const filePath = path.join(process.cwd(), name);
    if (fs.existsSync(filePath)) {
      files[name] = fs.readFileSync(filePath).toString('base64');
    }
  }
  return files;
}

function writeFiles(files) {
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(process.cwd(), name), Buffer.from(contents, 'base64'));
  }
}

if (command === 'list') {
  record(null);
  const projects = [
    { title: 'Simulateur Remuneration Variable', scriptId: state.scriptIds.SWE },
    { title: 'Simulateur Remuneration Variable NCE', scriptId: state.scriptIds.NCE },
    { title: 'Sales Rep Variable Compensation Calculator', scriptId: state.scriptIds.SalesRep }
  ];
  if (state.settings.missingProjectTarget) {
    const index = projects.findIndex(project =>
      project.scriptId === state.scriptIds[state.settings.missingProjectTarget]);
    if (index >= 0) projects.splice(index, 1);
  }
  if (state.settings.duplicateProjectTarget) {
    const duplicate = projects.find(project =>
      project.scriptId === state.scriptIds[state.settings.duplicateProjectTarget]);
    if (duplicate) projects.push({ ...duplicate, scriptId: 'FAKE_DUPLICATE_SCRIPT' });
  }
  process.stdout.write(JSON.stringify(projects));
} else if (command === 'clone') {
  const target = targetForId(args[1]);
  const rootDirIndex = args.indexOf('--rootDir');
  record(target, { rootDir: rootDirIndex >= 0 ? args[rootDirIndex + 1] : null });
  if (!target) {
    process.exitCode = 31;
  } else {
    writeFiles(state.remoteFiles[target]);
    const configuredTarget = state.settings.wrongCloneConfigTarget === target
      ? 'SWE'
      : target;
    fs.writeFileSync(
      path.join(process.cwd(), '.clasp.json'),
      JSON.stringify({ scriptId: state.scriptIds[configuredTarget] })
    );
    process.stdout.write('Cloned project.\n');
  }
} else if (command === 'status') {
  const target = targetForCwd();
  record(target);
  if (!target) {
    process.exitCode = 32;
  } else {
    let filesToPush = state.fileNames[target].slice();
    if (state.settings.fileMismatchTarget === target) filesToPush = ['Code.js', 'unexpected.gs'];
    process.stdout.write(JSON.stringify({ filesToPush, filesToDelete: [] }) + '\n');
  }
} else if (command === 'deployments') {
  const target = targetForCwd();
  const currentDeployment = target && (state.deployments[target] || [])[0];
  const productionVersion = currentDeployment &&
  (currentDeployment.activeVersion || currentDeployment.version);
  record(target, { version: productionVersion || null });
  if (!target) {
  process.exitCode = 33;
  } else {
  const targetKey = target.toUpperCase();
  const rows = ['- FAKE_DEPLOY_' + targetKey + ' @' + productionVersion + ' - production'];
  if (state.settings.missingDeploymentTarget !== target) {
    rows.push('- FAKE_HEAD_' + targetKey + ' @HEAD - Head deployment');
  } else {
    rows.shift();
    rows.push('- FAKE_HEAD_' + targetKey + ' @HEAD - Head deployment');
  }
  if (state.settings.ambiguousDeploymentTarget === target) {
    rows.push('- FAKE_EXTRA_DEPLOY_' + targetKey + ' @5 - extra production');
    }
    process.stdout.write('Found ' + rows.length + ' deployments.\n' + rows.join('\n') + '\n');
  }
} else if (command === 'push') {
  const target = targetForCwd();
  record(target, { force: args.some(argument => argument === '-f' || argument === '--force') });
  if (!target || state.settings.failPushTarget === target) {
    process.exitCode = 34;
  } else {
    state.remoteFiles[target] = readLocalFiles(target);
    saveState();
    process.stdout.write('Pushed project.\n');
  }
} else if (command === 'version') {
  const target = targetForCwd();
  record(target);
  if (!target || state.settings.failVersionTarget === target) {
    process.exitCode = 35;
  } else {
    const version = state.nextVersion++;
    state.versions[target][String(version)] = readLocalFiles(target);
    saveState();
    process.stdout.write('Created version ' + version + '.\n');
  }
} else if (command === 'redeploy') {
  const target = targetForCwd();
  const deployment = state.deployments[target] || [];
  const versionIndex = args.indexOf('-V');
  const version = versionIndex >= 0 ? args[versionIndex + 1] : args[2];
  record(target, { version, hasVersionFlag: versionIndex >= 0 });
  if (!target || state.settings.failRedeployTarget === target ||
      !deployment.some(item => item.id === args[1]) ||
      !state.versions[target][String(version)]) {
    process.exitCode = 36;
  } else {
    deployment[0].activeVersion = String(version);
    saveState();
    process.stdout.write('Redeployed project.\n');
  }
} else if (command === 'pull') {
  const target = targetForCwd();
  const versionIndex = args.indexOf('--versionNumber');
  const version = versionIndex >= 0 ? args[versionIndex + 1] : args[1];
  record(target, { version });
  const snapshot = target && state.versions[target][String(version)];
  if (!snapshot) {
    process.exitCode = 37;
  } else {
    writeFiles(snapshot);
    process.stdout.write('Pulled immutable version.\n');
  }
} else {
  record(targetForCwd());
  process.stderr.write('Unexpected fake clasp command.\n');
  process.exitCode = 99;
}
`;

function encode(contents) {
  return Buffer.from(contents).toString('base64');
}

function decode(contents) {
  return Buffer.from(contents, 'base64').toString('utf8');
}

function createSandbox(settings = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `pex-deploy-test-${process.pid}-`));
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin);
  const rootConfig = JSON.parse(fs.readFileSync(path.join(root, '.clasp.json'), 'utf8'));
  const scriptIds = {
    SWE: rootConfig.scriptId,
    NCE: 'FAKE_SCRIPT_SECRET_NCE',
    SalesRep: 'FAKE_SCRIPT_SECRET_SALESREP'
  };
  const fileNames = {
    SWE: ['Code.gs', 'appsscript.json', 'index.html'],
    NCE: ['Code.js', 'appsscript.json', 'index.html'],
    SalesRep: ['Code.js', 'appsscript.json', 'index.html']
  };
  const remoteFiles = {
    SWE: {
      'Code.gs': encode(fs.readFileSync(path.join(root, 'Code.gs'))),
      'appsscript.json': encode(fs.readFileSync(path.join(root, 'appsscript.json'))),
      'index.html': encode(fs.readFileSync(path.join(root, 'index.html')))
    },
    NCE: {
      'Code.js': encode(
        "const DEPLOYED_PROFILE = 'NCE';\nfunction doGet() {}\nfunction getAccessStatus_() {}\nfunction requireAccess_() {}\n"
      ),
      'appsscript.json': encode('{"timeZone":"Etc/UTC"}\n'),
      'index.html': encode('previous NCE bundle\n')
    },
    SalesRep: {
      'Code.js': encode(
        'function doGet() { const access = getAccessStatus_(); if (!access.allowed) return createAccessDeniedPage_(access.contactEmail); return HtmlService.createHtmlOutputFromFile("index"); }\n' +
        'function getAccessStatus_() {}\nfunction createAccessDeniedPage_() {}\n'
      ),
      'appsscript.json': encode('{"timeZone":"Etc/UTC"}\n'),
      'index.html': encode('previous Sales Rep bundle\n')
    }
  };
  if (settings.invalidBackendTarget) {
    remoteFiles[settings.invalidBackendTarget]['Code.js'] = encode(
      decode(remoteFiles[settings.invalidBackendTarget]['Code.js']) + 'function invalid( {\n'
    );
  }
  const state = {
    scriptIds,
    fileNames,
    remoteFiles,
    versions: { SWE: {}, NCE: {}, SalesRep: {} },
    deployments: {
      SWE: [{ id: 'FAKE_DEPLOY_SWE', version: '4' }],
      NCE: [{ id: 'FAKE_DEPLOY_NCE', version: '4' }],
      SalesRep: [{ id: 'FAKE_DEPLOY_SALESREP', version: '4' }]
    },
    nextVersion: 8,
    settings
  };
  const statePath = path.join(directory, 'state.json');
  const logPath = path.join(directory, 'clasp-events.jsonl');
  const npmLogPath = path.join(directory, 'npm-events.txt');
  fs.writeFileSync(statePath, JSON.stringify(state));
  fs.writeFileSync(path.join(bin, 'fake-clasp.js'), fakeClaspSource);
  fs.writeFileSync(path.join(bin, 'clasp.cmd'), [
    '@echo off',
    `"${process.execPath}" "${path.join(bin, 'fake-clasp.js')}" %*`,
    'exit /b %errorlevel%',
    ''
  ].join('\r\n'));
  fs.writeFileSync(path.join(bin, 'npm.ps1'), [
    '$line = "npm " + ($args -join " ")',
    '[System.IO.File]::AppendAllText($env:PEX_DEPLOY_FAKE_NPM_LOG, $line + [Environment]::NewLine)',
    '$global:LASTEXITCODE = 0',
    ''
  ].join('\r\n'));

  return {
    directory,
    statePath,
    logPath,
    npmLogPath,
    bin,
    initialNceBackend: decode(remoteFiles.NCE['Code.js']),
    initialNceManifest: decode(remoteFiles.NCE['appsscript.json']),
    readState() {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    },
    readEvents() {
      if (!fs.existsSync(logPath)) return [];
      return fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/)
        .filter(Boolean).map(line => JSON.parse(line));
    },
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

function invokeWrapper(sandbox, target, options = {}) {
  const wrapperPath = wrapper.replace(/'/g, "''");
  const targetArg = target ? ` -Target '${target}'` : '';
  const dryRunArg = options.dryRun ? ' -DryRun' : '';
  if (options.realNpm) fs.unlinkSync(path.join(sandbox.bin, 'npm.ps1'));
  const env = {
    ...process.env,
    PATH: `${sandbox.bin}${path.delimiter}${process.env.PATH || ''}`,
    PEX_DEPLOY_FAKE_STATE: sandbox.statePath,
    PEX_DEPLOY_FAKE_LOG: sandbox.logPath,
    PEX_DEPLOY_FAKE_NPM_LOG: sandbox.npmLogPath,
    PEX_DEPLOY_REPO_ROOT: root
  };

  if (options.nativeFile) {
    return spawnSync(powershell, [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', wrapper, ...(target ? ['-Target', target] : []),
      ...(options.dryRun ? ['-DryRun'] : [])
    ], {
      cwd: root,
      encoding: 'utf8',
      env,
      input: '',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024
    });
  }

  let promptFunction = 'function Read-Host { param([string]$Prompt); return "" }; ';
  if (Object.prototype.hasOwnProperty.call(options, 'confirmation')) {
    const confirmation = String(options.confirmation).replace(/'/g, "''");
    promptFunction = `function Read-Host { param([string]$Prompt); return '${confirmation}' }; `;
  }
  const command = `${promptFunction}& '${wrapperPath}'${targetArg}${dryRunArg}`;
  return spawnSync(powershell, [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command
  ], {
    cwd: root,
    encoding: 'utf8',
    env,
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024
  });
}

function outputOf(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function assertNoWrites(events) {
  assert.equal(
    events.some(event => ['push', 'version', 'redeploy'].includes(event.command)),
    false,
    'dry run or rejected confirmation must not write remotely'
  );
}

function assertScratchCleaned(events) {
  const cloneEvents = events.filter(item => item.command === 'clone');
  const scratchRoots = new Set(cloneEvents.map(event => path.resolve(event.cwd, '..', '..')));
  for (const event of cloneEvents) {
    assert.equal(fs.existsSync(event.cwd), false, `owned clone directory should be removed: ${event.cwd}`);
  }
  for (const scratchRoot of scratchRoots) {
    assert.equal(fs.existsSync(scratchRoot), false, `owned scratch root should be removed: ${scratchRoot}`);
  }
}

function runCase(name, callback) {
  try {
    callback();
    console.log(`deploy-wrapper.test.js: ${name}`);
  } catch (error) {
    process.exitCode = 1;
    console.error(`deploy-wrapper.test.js: ${name} failed`);
    console.error(error);
  }
}

if (process.platform !== 'win32' && !process.env.POWERSHELL) {
  console.log('deploy-wrapper.test.js: skipped (PowerShell is unavailable)');
} else {
  runCase('requires an explicit target', () => {
    assert.ok(fs.existsSync(wrapper), 'deployment wrapper should exist');
    const sandbox = createSandbox();
    try {
      const result = invokeWrapper(sandbox, null);
      assert.notEqual(result.status, 0);
      assert.match(outputOf(result), /-Target/);
      assert.equal(sandbox.readEvents().length, 0);
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('rejects an unsupported target without contacting clasp', () => {
    const sandbox = createSandbox();
    try {
      const result = invokeWrapper(sandbox, 'Staging');
      assert.notEqual(result.status, 0);
      assert.match(outputOf(result), /SWE.*NCE.*SalesRep.*All/s);
      assert.equal(sandbox.readEvents().length, 0);
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('dry run preflights NCE without remote writes', () => {
    const sandbox = createSandbox();
    try {
      const result = invokeWrapper(sandbox, 'NCE', { dryRun: true });
      assert.equal(result.status, 0, outputOf(result));
      const events = sandbox.readEvents();
      assert.ok(events.some(event => event.command === 'list'));
      assert.ok(events.some(event => event.command === 'clone' && event.target === 'NCE'));
      assert.equal(events.find(event => event.command === 'clone').rootDir, '.',
        'clone must be rooted in its isolated current directory');
      assert.ok(events.some(event => event.command === 'status' && event.target === 'NCE'));
      assert.ok(events.some(event => event.command === 'deployments' && event.target === 'NCE'));
      assertNoWrites(events);
      assertScratchCleaned(events);
      assert.doesNotMatch(outputOf(result), /FAKE_(?:SCRIPT|DEPLOY|HEAD)_/);
      const npmCalls = fs.readFileSync(sandbox.npmLogPath, 'utf8');
      assert.match(npmCalls, /npm run lint/);
      assert.match(npmCalls, /npm test/);
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('wrapper test command does not recursively run itself', () => {
    const sandbox = createSandbox();
    try {
      const result = invokeWrapper(sandbox, 'NCE', { dryRun: true, realNpm: true });
      assert.equal(result.status, 0, outputOf(result));
      assertNoWrites(sandbox.readEvents());
      assertScratchCleaned(sandbox.readEvents());
      assert.match(outputOf(result), /TOTAL:/);
      assert.doesNotMatch(outputOf(result), /deploy-wrapper\.test\.js/);
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('refuses a noninteractive deployment before any write', () => {
    const sandbox = createSandbox();
    try {
      const result = invokeWrapper(sandbox, 'NCE', { nativeFile: true });
      assert.notEqual(result.status, 0, outputOf(result));
      const events = sandbox.readEvents();
      assertNoWrites(events);
      assertScratchCleaned(events);
      assert.match(outputOf(result), /confirm|interactive|confirmation/i);
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('rejects ambiguous project names', () => {
    const sandbox = createSandbox({ duplicateProjectTarget: 'NCE' });
    try {
      const result = invokeWrapper(sandbox, 'NCE', { dryRun: true });
      assert.notEqual(result.status, 0, outputOf(result));
      assert.match(outputOf(result), /exactly one|ambiguous/i);
      assert.equal(sandbox.readEvents().some(event => event.command === 'clone'), false);
      assertNoWrites(sandbox.readEvents());
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('rejects a clone whose clasp config resolves to another project', () => {
    const sandbox = createSandbox({ wrongCloneConfigTarget: 'NCE' });
    try {
      const result = invokeWrapper(sandbox, 'NCE', { dryRun: true });
      assert.notEqual(result.status, 0, outputOf(result));
      assert.match(outputOf(result), /project configuration.*match|config.*selected project/i);
      assertNoWrites(sandbox.readEvents());
      assertScratchCleaned(sandbox.readEvents());
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('rejects invalid remote Apps Script backend syntax', () => {
    const sandbox = createSandbox({ invalidBackendTarget: 'NCE' });
    try {
      const result = invokeWrapper(sandbox, 'NCE', { dryRun: true });
      assert.notEqual(result.status, 0, outputOf(result));
      assert.match(outputOf(result), /backend.*syntax/i);
      assertNoWrites(sandbox.readEvents());
      assertScratchCleaned(sandbox.readEvents());
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('requires one versioned production deployment', () => {
    const sandbox = createSandbox({ missingDeploymentTarget: 'NCE' });
    try {
      const result = invokeWrapper(sandbox, 'NCE', { dryRun: true });
      assert.notEqual(result.status, 0, outputOf(result));
      assert.match(outputOf(result), /versioned.*deployment|deployment.*versioned/i);
      assertNoWrites(sandbox.readEvents());
      assertScratchCleaned(sandbox.readEvents());
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('rejects multiple versioned deployments as ambiguous', () => {
    const sandbox = createSandbox({ ambiguousDeploymentTarget: 'NCE' });
    try {
      const result = invokeWrapper(sandbox, 'NCE', { dryRun: true });
      assert.notEqual(result.status, 0, outputOf(result));
      assert.match(outputOf(result), /exactly one.*deployment/i);
      assertNoWrites(sandbox.readEvents());
      assertScratchCleaned(sandbox.readEvents());
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('rejects an unexpected push file inventory', () => {
    const sandbox = createSandbox({ fileMismatchTarget: 'NCE' });
    try {
      const result = invokeWrapper(sandbox, 'NCE', { dryRun: true });
      assert.notEqual(result.status, 0, outputOf(result));
      assert.match(outputOf(result), /file|inventory/i);
      assertNoWrites(sandbox.readEvents());
      assertScratchCleaned(sandbox.readEvents());
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('preserves NCE backends and verifies the immutable deployed HTML', () => {
    const sandbox = createSandbox();
    try {
      const result = invokeWrapper(sandbox, 'NCE', { confirmation: 'DEPLOY NCE' });
      assert.equal(result.status, 0, outputOf(result));
      const expectedPath = path.join(sandbox.directory, 'expected-nce.html');
      execFileSync(process.execPath, [
        path.join(root, 'build.js'),
        '--profile=NCE',
        `--out=${expectedPath}`
      ], { stdio: 'pipe' });
      const state = sandbox.readState();
      const expectedHtml = fs.readFileSync(expectedPath);
      assert.deepEqual(
        Buffer.from(state.remoteFiles.NCE['index.html'], 'base64'),
        expectedHtml
      );
      assert.equal(decode(state.remoteFiles.NCE['Code.js']), sandbox.initialNceBackend);
      assert.equal(
        decode(state.remoteFiles.NCE['appsscript.json']),
        sandbox.initialNceManifest
      );
      assert.equal(state.deployments.NCE[0].activeVersion, '8');
      assert.deepEqual(
        state.versions.NCE['8'],
        state.remoteFiles.NCE,
        'verified immutable version must contain the pushed files'
      );
      const events = sandbox.readEvents();
      const releaseCommands = events.filter(event =>
        ['push', 'version', 'redeploy', 'deployments', 'pull'].includes(event.command)
      );
      assert.deepEqual(releaseCommands.map(event => event.command), [
        'deployments',
        'push', 'version', 'redeploy', 'deployments', 'pull'
      ]);
      assert.equal(releaseCommands[1].force, false, 'push must not use force');
      assert.equal(releaseCommands[3].hasVersionFlag, true,
        'redeploy must use clasp --versionNumber');
      assert.equal(releaseCommands[3].version, '8');
      assert.equal(releaseCommands[4].version, '8',
        'existing production deployment should point at the new version');
      assert.equal(releaseCommands[5].version, '8');
      assertScratchCleaned(events);
      assert.doesNotMatch(outputOf(result), /FAKE_(?:SCRIPT|DEPLOY|HEAD)_/);
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('preserves the SalesRep backend while deploying its separate bundle', () => {
    const sandbox = createSandbox();
    try {
      const originalBackend = decode(sandbox.readState().remoteFiles.SalesRep['Code.js']);
      const originalManifest = decode(sandbox.readState().remoteFiles.SalesRep['appsscript.json']);
      const result = invokeWrapper(sandbox, 'SalesRep', { confirmation: 'DEPLOY SalesRep' });
      assert.equal(result.status, 0, outputOf(result));
      const expectedPath = path.join(sandbox.directory, 'expected-sales-rep.html');
      execFileSync(process.execPath, [
        path.join(root, 'build.js'),
        '--app=sales-rep',
        `--out=${expectedPath}`
      ], { stdio: 'pipe' });
      const state = sandbox.readState();
      assert.deepEqual(
        Buffer.from(state.remoteFiles.SalesRep['index.html'], 'base64'),
        fs.readFileSync(expectedPath)
      );
      assert.equal(decode(state.remoteFiles.SalesRep['Code.js']), originalBackend);
      assert.equal(
        decode(state.remoteFiles.SalesRep['appsscript.json']),
        originalManifest
      );
      assert.equal(state.deployments.SalesRep[0].activeVersion, '8');
      assertScratchCleaned(sandbox.readEvents());
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('reports a successful push when version creation fails before redeploy', () => {
    const sandbox = createSandbox({ failVersionTarget: 'NCE' });
    try {
      const result = invokeWrapper(sandbox, 'NCE', { confirmation: 'DEPLOY NCE' });
      assert.notEqual(result.status, 0, outputOf(result));
      assert.match(outputOf(result), /pushed but not redeployed.*NCE/i);
      const events = sandbox.readEvents();
      assert.ok(events.some(event => event.command === 'push' && event.target === 'NCE'));
      assert.ok(events.some(event => event.command === 'version' && event.target === 'NCE'));
      assert.equal(events.some(event => event.command === 'redeploy'), false);
      const currentDeployment = sandbox.readState().deployments.NCE[0];
      assert.equal(currentDeployment.activeVersion || currentDeployment.version, '4');
      assert.notDeepEqual(
        sandbox.readState().remoteFiles.NCE['index.html'],
        encode('previous NCE bundle\n')
      );
      assertScratchCleaned(events);
    } finally {
      sandbox.cleanup();
    }
  });

  runCase('aborts partial All release and cleans only its scratch directories', () => {
    const sandbox = createSandbox({ failPushTarget: 'NCE' });
    try {
      const result = invokeWrapper(sandbox, 'All', { confirmation: 'DEPLOY ALL' });
      assert.notEqual(result.status, 0, outputOf(result));
      assert.match(outputOf(result), /already redeployed.*SWE/i);
      const events = sandbox.readEvents();
      const firstPush = events.findIndex(event => event.command === 'push');
      assert.ok(firstPush >= 0);
      assert.deepEqual(
        events.slice(0, firstPush).filter(event =>
          event.command === 'status' || event.command === 'deployments'
        ).map(event => event.target).filter((target, index, values) =>
          values.indexOf(target) === index
        ),
        ['SWE', 'NCE', 'SalesRep'],
        'all projects must be preflighted before the first push'
      );
      assert.ok(events.some(event => event.command === 'redeploy' && event.target === 'SWE'));
      assert.equal(events.some(event => event.command === 'push' && event.target === 'SalesRep'), false);
      assert.equal(sandbox.readState().deployments.SWE[0].activeVersion, '8');
      assertScratchCleaned(events);
      assert.doesNotMatch(outputOf(result), /FAKE_(?:SCRIPT|DEPLOY|HEAD)_/);
    } finally {
      sandbox.cleanup();
    }
  });
}
