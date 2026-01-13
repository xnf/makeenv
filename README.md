# makeenv

Generate `.env` files from JSON, YAML, or TOML templates. Perfect for CI/CD pipelines.

## Why?

In CI/CD environments (GitHub Actions, GitLab CI, Azure Pipelines, AWS CodeBuild), you often need to generate `.env`
files from environment variables or hardcoded values. This tool provides a simple, declarative schema to define your
environment configuration.

**Use cases:**

- Generate `.env` files in GitHub Actions using repository secrets
- Mix hardcoded public values with secret environment variables
- Validate required variables before deployment
- Single schema format that works across all CI/CD platforms

## Installation

No installation required! Run directly with `npx` or `pnpx`:

```bash
npx makeenv env.yaml
pnpx makeenv env.yaml
```

Or install globally:

```bash
npm install -g makeenv
```

## Usage

```bash
# Generate .env from template (output defaults to .env)
npx makeenv env.yaml

# Specify custom output file
npx makeenv env.json .env.local

# Validate template without generating file
npx makeenv env.yaml --dry-run

# Generate a template from existing .env file
npx makeenv --generate .env env.yaml
npx makeenv --generate env.json  # uses .env as default input

# Update template with current resolved values as defaults
npx makeenv --set-defaults env.yaml

# Using pnpm
pnpx makeenv config.toml .env.production
```

### Options

| Option           | Description                                                                                                     |
|------------------|-----------------------------------------------------------------------------------------------------------------|
| `--dry-run`      | Validate template and resolve all values without writing output file. Exits with code 0 on success, 1 on error. |
| `--generate`     | Create a template from an existing `.env` file. Non-empty values are marked as required.                        |
| `--set-defaults` | Read current values and save them as defaults in the template file.                                             |
| `-h, --help`     | Show help message.                                                                                              |

## Template Format

Templates define environment variables with the following properties:

| Property   | Type    | Description                                                     |
|------------|---------|-----------------------------------------------------------------|
| `required` | boolean | If `true`, generation fails when value is missing               |
| `source`   | string  | `"string"` for literal values, `"env"` to read from environment |
| `value`    | string  | The literal value or environment variable name to read          |
| `default`  | string  | Fallback value if the primary value is not found                |

### Sources

- **`string`**: Use the `value` field directly as the variable value
- **`env`**: Read the value from an environment variable named in `value`

## Examples

### YAML (`.yaml`, `.yml`)

```yaml
# env.yaml
AWS_REGION:
  required: true
  source: string
  value: eu-north-1

AWS_ACCESS_KEY_ID:
  required: true
  source: env
  value: AWS_ACCESS_KEY_ID

DATABASE_URL:
  required: true
  source: env
  value: DB_CONNECTION_STRING

OPTIONAL_FEATURE:
  required: false
  source: env
  value: FEATURE_FLAG
  default: "disabled"
```

### JSON (`.json`)

```json
{
  "AWS_REGION": {
    "required": true,
    "source": "string",
    "value": "eu-north-1"
  },
  "AWS_ACCESS_KEY_ID": {
    "required": true,
    "source": "env",
    "value": "AWS_ACCESS_KEY_ID"
  },
  "DATABASE_URL": {
    "required": true,
    "source": "env",
    "value": "DB_CONNECTION_STRING"
  },
  "OPTIONAL_FEATURE": {
    "required": false,
    "source": "env",
    "value": "FEATURE_FLAG",
    "default": "disabled"
  }
}
```

### TOML (`.toml`, `.tml`)

```toml
[AWS_REGION]
required = true
source = "string"
value = "eu-north-1"

[AWS_ACCESS_KEY_ID]
required = true
source = "env"
value = "AWS_ACCESS_KEY_ID"

[DATABASE_URL]
required = true
source = "env"
value = "DB_CONNECTION_STRING"

[OPTIONAL_FEATURE]
required = false
source = "env"
value = "FEATURE_FLAG"
default = "disabled"
```

## CI/CD Examples

### GitHub Actions

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate .env
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: npx makeenv env.yaml .env

      - name: Deploy
        run: ./deploy.sh
```

### GitLab CI

```yaml
deploy:
  stage: deploy
  script:
    - npx makeenv env.yaml .env
    - ./deploy.sh
  variables:
    AWS_ACCESS_KEY_ID: $AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY: $AWS_SECRET_ACCESS_KEY
    DATABASE_URL: $DATABASE_URL
```

### Azure Pipelines

```yaml
steps:
  - script: npx makeenv env.yaml .env
    displayName: 'Generate .env'
    env:
      AWS_ACCESS_KEY_ID: $(AWS_ACCESS_KEY_ID)
      AWS_SECRET_ACCESS_KEY: $(AWS_SECRET_ACCESS_KEY)
      DATABASE_URL: $(DATABASE_URL)
```

## Output

Generated `.env` file:

```bash
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
DATABASE_URL=postgres://user:pass@host:5432/db
OPTIONAL_FEATURE=disabled
```

## Roadmap

This is version 1.0.0 with a minimal feature set. Future versions will add (with backwards compatibility):

- Additional sources (e.g., `file`, `secret-manager`, `vault`)
- Variable transformation (e.g., base64 encode/decode)
- Conditional variables
- Multiple output formats

## License

MIT
