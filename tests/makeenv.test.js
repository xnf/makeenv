const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const SNAPSHOTS_DIR = path.join(__dirname, 'snapshots');
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, {recursive: true});
}

// Test cases
const tests = [
    {
        name: 'YAML basic template',
        fixture: 'basic.yaml',
        snapshot: 'basic.yaml.env',
        env: {AWS_ACCESS_KEY_ID: 'test-access-key-123'},
    },
    {
        name: 'JSON basic template',
        fixture: 'basic.json',
        snapshot: 'basic.json.env',
        env: {AWS_ACCESS_KEY_ID: 'test-access-key-123'},
    },
    {
        name: 'TOML basic template',
        fixture: 'basic.toml',
        snapshot: 'basic.toml.env',
        env: {AWS_ACCESS_KEY_ID: 'test-access-key-123'},
    },
    {
        name: 'Template with default values',
        fixture: 'with-defaults.yaml',
        snapshot: 'with-defaults.yaml.env',
        env: {},
    },
    {
        name: 'Template with special characters',
        fixture: 'special-chars.yaml',
        snapshot: 'special-chars.yaml.env',
        env: {},
    },
];

let passed = 0;
let failed = 0;

console.log('Running makeenv snapshot tests...\n');

for (const test of tests) {
    const fixturePath = path.join(FIXTURES_DIR, test.fixture);
    const snapshotPath = path.join(SNAPSHOTS_DIR, test.snapshot);
    const outputPath = path.join(TEMP_DIR, `${test.fixture}.env`);

    try {
        // Build environment for the test
        const testEnv = {...process.env, ...test.env};

        // Run makeenv via the bin script
        const binPath = path.join(__dirname, '..', 'bin', 'makeenv.js');
        execSync(`node "${binPath}" "${fixturePath}" "${outputPath}"`, {
            env: testEnv,
            stdio: 'pipe',
        });

        // Compare output with snapshot using diff (POSIX tool)
        try {
            execSync(`diff "${outputPath}" "${snapshotPath}"`, {stdio: 'pipe'});
            console.log(`  PASS: ${test.name}`);
            passed++;
        } catch (diffError) {
            console.log(`  FAIL: ${test.name}`);
            console.log('    Output differs from snapshot:');

            // Show diff output
            const output = fs.readFileSync(outputPath, 'utf8');
            const snapshot = fs.readFileSync(snapshotPath, 'utf8');
            console.log('    --- Expected (snapshot):');
            console.log(snapshot.split('\n').map(l => `    ${l}`).join('\n'));
            console.log('    --- Got (output):');
            console.log(output.split('\n').map(l => `    ${l}`).join('\n'));

            failed++;
        }
    } catch (error) {
        console.log(`  FAIL: ${test.name}`);
        console.log(`    Error: ${error.message}`);
        failed++;
    }
}

// Test error case - missing required variable
console.log('');
console.log('Testing error handling...');

const errorFixture = path.join(TEMP_DIR, 'error-test.yaml');
fs.writeFileSync(errorFixture, `
MISSING_REQUIRED:
  required: true
  source: env
  value: THIS_VAR_DOES_NOT_EXIST
`);

try {
    const binPath = path.join(__dirname, '..', 'bin', 'makeenv.js');
    execSync(`node "${binPath}" "${errorFixture}" "${path.join(TEMP_DIR, 'error.env')}"`, {
        env: {...process.env},
        stdio: 'pipe',
    });
    console.log('  FAIL: Should have thrown error for missing required variable');
    failed++;
} catch (error) {
    if (error.status !== 0) {
        console.log('  PASS: Correctly fails for missing required variable');
        passed++;
    } else {
        console.log('  FAIL: Unexpected error behavior');
        failed++;
    }
}

// Test --dry-run flag
console.log('');
console.log('Testing --dry-run flag...');

const dryRunFixture = path.join(FIXTURES_DIR, 'basic.yaml');
const dryRunOutput = path.join(TEMP_DIR, 'dry-run-should-not-exist.env');

try {
    const binPath = path.join(__dirname, '..', 'bin', 'makeenv.js');
    execSync(`node "${binPath}" "${dryRunFixture}" "${dryRunOutput}" --dry-run`, {
        env: {...process.env, AWS_ACCESS_KEY_ID: 'test-key'},
        stdio: 'pipe',
    });

    if (fs.existsSync(dryRunOutput)) {
        console.log('  FAIL: --dry-run should not create output file');
        failed++;
    } else {
        console.log('  PASS: --dry-run validates without creating file');
        passed++;
    }
} catch (error) {
    console.log(`  FAIL: --dry-run error: ${error.message}`);
    failed++;
}

// Test --dry-run with missing required variable (should fail)
try {
    const binPath = path.join(__dirname, '..', 'bin', 'makeenv.js');
    execSync(`node "${binPath}" "${dryRunFixture}" "${dryRunOutput}" --dry-run`, {
        env: {...process.env, AWS_ACCESS_KEY_ID: undefined},
        stdio: 'pipe',
    });
    console.log('  FAIL: --dry-run should fail for missing required variable');
    failed++;
} catch (error) {
    if (error.status !== 0) {
        console.log('  PASS: --dry-run correctly fails for missing required variable');
        passed++;
    } else {
        console.log('  FAIL: --dry-run unexpected error behavior');
        failed++;
    }
}

// Test --generate flag
console.log('');
console.log('Testing --generate flag...');

const generateEnvPath = path.join(FIXTURES_DIR, 'generate-source.env');
const generateOutputPath = path.join(TEMP_DIR, 'generated-template.yaml');
const generateSnapshotPath = path.join(SNAPSHOTS_DIR, 'generate-source.env.yaml');

try {
    const binPath = path.join(__dirname, '..', 'bin', 'makeenv.js');
    execSync(`node "${binPath}" --generate "${generateEnvPath}" "${generateOutputPath}"`, {
        stdio: 'pipe',
    });

    try {
        execSync(`diff "${generateOutputPath}" "${generateSnapshotPath}"`, {stdio: 'pipe'});
        console.log('  PASS: --generate creates correct template from .env');
        passed++;
    } catch (diffError) {
        console.log('  FAIL: --generate output differs from snapshot');
        const output = fs.readFileSync(generateOutputPath, 'utf8');
        const snapshot = fs.readFileSync(generateSnapshotPath, 'utf8');
        console.log('    --- Expected:');
        console.log(snapshot.split('\n').map(l => `    ${l}`).join('\n'));
        console.log('    --- Got:');
        console.log(output.split('\n').map(l => `    ${l}`).join('\n'));
        failed++;
    }
} catch (error) {
    console.log(`  FAIL: --generate error: ${error.message}`);
    failed++;
}

// Test --set-defaults flag
console.log('');
console.log('Testing --set-defaults flag...');

const setDefaultsInput = path.join(FIXTURES_DIR, 'set-defaults-input.yaml');
const setDefaultsWorkCopy = path.join(TEMP_DIR, 'set-defaults-work.yaml');
const setDefaultsSnapshot = path.join(SNAPSHOTS_DIR, 'set-defaults-output.yaml');

// Copy fixture to temp so we can modify it
fs.copyFileSync(setDefaultsInput, setDefaultsWorkCopy);

try {
    const binPath = path.join(__dirname, '..', 'bin', 'makeenv.js');
    execSync(`node "${binPath}" --set-defaults "${setDefaultsWorkCopy}"`, {
        env: {...process.env, TEST_FEATURE: 'enabled'},
        stdio: 'pipe',
    });

    try {
        execSync(`diff "${setDefaultsWorkCopy}" "${setDefaultsSnapshot}"`, {stdio: 'pipe'});
        console.log('  PASS: --set-defaults updates template with current values');
        passed++;
    } catch (diffError) {
        console.log('  FAIL: --set-defaults output differs from snapshot');
        const output = fs.readFileSync(setDefaultsWorkCopy, 'utf8');
        const snapshot = fs.readFileSync(setDefaultsSnapshot, 'utf8');
        console.log('    --- Expected:');
        console.log(snapshot.split('\n').map(l => `    ${l}`).join('\n'));
        console.log('    --- Got:');
        console.log(output.split('\n').map(l => `    ${l}`).join('\n'));
        failed++;
    }
} catch (error) {
    console.log(`  FAIL: --set-defaults error: ${error.message}`);
    failed++;
}

// Cleanup
fs.rmSync(TEMP_DIR, {recursive: true, force: true});

// Summary
console.log('');
console.log('---');
console.log(`Results: ${passed} passed, ${failed} failed`);

process.exit(failed > 0 ? 1 : 0);
