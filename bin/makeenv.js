#!/usr/bin/env node

const path = require('path');
const {makeEnv, generateTemplate, setDefaults} = require('../src/index.js');

const args = process.argv.slice(2);

function printUsage() {
    console.log(`
makeenv - Generate .env files from JSON, YAML, or TOML templates

Usage:
  npx makeenv <template-file> [output-file] [options]
  npx makeenv --generate [env-file] <output-template>
  npx makeenv --set-defaults <template-file>

Arguments:
  template-file  Path to template file (.json, .yaml, .yml, .toml, .tml)
  output-file    Path to output file (default: .env)

Options:
  --dry-run       Validate template without generating output file
  --generate      Create a template from an existing .env file
  --set-defaults  Update template with current resolved values as defaults
  -h, --help      Show this help message

Examples:
  npx makeenv env.json
  npx makeenv env.yaml .env.local
  npx makeenv env.yaml --dry-run
  npx makeenv --generate .env env.yaml
  npx makeenv --generate env.json
  npx makeenv --set-defaults env.yaml

Template Format:
  Each variable can have:
    - required: boolean (true/false)
    - source: "string" (literal value) or "env" (from environment)
    - value: the value or env var name to read from
    - default: fallback value if not found

Example (YAML):
  AWS_REGION:
    required: true
    source: string
    value: eu-north-1

  AWS_ACCESS_KEY_ID:
    required: true
    source: env
    value: AWS_ACCESS_KEY_ID

Example (JSON):
  {
    "AWS_REGION": {
      "required": true,
      "source": "string",
      "value": "eu-north-1"
    }
  }
`);
}

function parseArgs(args) {
    const result = {
        help: false,
        dryRun: false,
        generate: false,
        setDefaults: false,
        positional: [],
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--dry-run') {
            result.dryRun = true;
        } else if (arg === '--generate') {
            result.generate = true;
        } else if (arg === '--set-defaults') {
            result.setDefaults = true;
        } else if (!arg.startsWith('-')) {
            result.positional.push(arg);
        }
    }

    return result;
}

function main() {
    const parsed = parseArgs(args);

    if (parsed.help || args.length === 0) {
        printUsage();
        process.exit(args.length === 0 ? 1 : 0);
    }

    try {
        // --set-defaults mode
        if (parsed.setDefaults) {
            if (parsed.positional.length < 1) {
                console.error('Error: --set-defaults requires a template file');
                process.exit(1);
            }
            const templatePath = path.resolve(process.cwd(), parsed.positional[0]);
            const {success, errors} = setDefaults(templatePath);

            if (!success) {
                console.error('Error setting defaults:');
                errors.forEach(err => console.error(`  - ${err}`));
                process.exit(1);
            }

            console.log(`Updated defaults: ${templatePath}`);
            process.exit(0);
        }

        // --generate mode
        if (parsed.generate) {
            let envPath, outputPath;

            if (parsed.positional.length === 1) {
                envPath = path.resolve(process.cwd(), '.env');
                outputPath = path.resolve(process.cwd(), parsed.positional[0]);
            } else if (parsed.positional.length >= 2) {
                envPath = path.resolve(process.cwd(), parsed.positional[0]);
                outputPath = path.resolve(process.cwd(), parsed.positional[1]);
            } else {
                console.error('Error: --generate requires at least an output template file');
                process.exit(1);
            }

            const {success, errors} = generateTemplate(envPath, outputPath);

            if (!success) {
                console.error('Error generating template:');
                errors.forEach(err => console.error(`  - ${err}`));
                process.exit(1);
            }

            console.log(`Generated template: ${outputPath}`);
            process.exit(0);
        }

        // Default mode: generate .env from template
        if (parsed.positional.length < 1) {
            console.error('Error: template file is required');
            process.exit(1);
        }

        const inputPath = path.resolve(process.cwd(), parsed.positional[0]);
        const outputPath = path.resolve(process.cwd(), parsed.positional[1] || '.env');

        const {success, errors} = makeEnv(inputPath, outputPath, {dryRun: parsed.dryRun});

        if (!success) {
            console.error('Error generating .env file:');
            errors.forEach(err => console.error(`  - ${err}`));
            process.exit(1);
        }

        if (parsed.dryRun) {
            console.log('Dry run: validation successful');
        } else {
            console.log(`Generated: ${outputPath}`);
        }
        process.exit(0);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
