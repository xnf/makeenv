# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run tests (snapshot-based)
npm test

# Run CLI directly
node bin/makeenv.js <template-file> [output-file]
node bin/makeenv.js <template-file> --dry-run
node bin/makeenv.js --generate [env-file] <output-template>
node bin/makeenv.js --set-defaults <template-file>
```

## Architecture

This is a CLI tool that generates `.env` files from JSON, YAML, or TOML templates. Designed for CI/CD pipelines.

**Structure:**

- `bin/makeenv.js` - CLI entry point, handles args and calls `makeEnv()`
- `src/index.js` - Core library with all logic

**Key exports from `src/index.js`:**

- `makeEnv(inputPath, outputPath, options)` - Main async function, returns `Promise<{ success, errors }>`. Options:
  `{ dryRun: boolean }`
- `parseTemplateFile(filePath)` - Auto-detects format by extension
- `generateEnvContent(template)` - Async, produces env content from parsed template
- `resolveValue(config, varName)` - Async, resolves single var based on source type
- `generateTemplate(envPath, outputPath)` - Create template from .env file (reverse operation)
- `setDefaults(templatePath)` - Async, update template with current resolved values as defaults
- `parseEnvFile(filePath)` - Parse .env file into key-value pairs

**Source types:**

- `string` - Use `value` field directly
- `env` - Read from `process.env[value]`
- `AwsSecretManager` - Read from AWS Secrets Manager. Value format: `SecretId/Key` (e.g., `prod/DB_HOST`).
  Uses AWS SDK default credential chain. Secrets are cached per execution to avoid redundant API calls.

## Testing

Tests use snapshot comparison in `tests/makeenv.test.js`:

- Fixtures in `tests/fixtures/` (template files)
- Expected output in `tests/snapshots/` (`.env` files)
- Test runs CLI, compares output with snapshots using `diff`

To add a test: create fixture file + matching snapshot file, add entry to `tests` array.
