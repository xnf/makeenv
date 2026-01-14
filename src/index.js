const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const toml = require('smol-toml');
const {SecretsManagerClient, GetSecretValueCommand} = require('@aws-sdk/client-secrets-manager');

/**
 * Supported source types for environment variable values
 */
const SOURCE_TYPES = {
    STRING: 'string',
    ENV: 'env',
    AWS_SECRETS_MANAGER: 'AwsSecretManager',
};

// Cache for AWS Secrets Manager secrets to avoid repeated API calls
const secretsCache = new Map();

/**
 * Get secret from AWS Secrets Manager (with caching)
 * @param {string} secretId - Secret ID/name
 * @returns {Promise<object>} Parsed secret JSON
 */
async function getAwsSecret(secretId) {
    if (secretsCache.has(secretId)) {
        return secretsCache.get(secretId);
    }

    const client = new SecretsManagerClient();
    const command = new GetSecretValueCommand({SecretId: secretId});
    const response = await client.send(command);

    const secretValue = response.SecretString;
    if (!secretValue) {
        throw new Error(`Secret "${secretId}" has no string value`);
    }

    const parsed = JSON.parse(secretValue);
    secretsCache.set(secretId, parsed);
    return parsed;
}

/**
 * Parse template file based on extension
 * @param {string} filePath - Path to the template file
 * @returns {object} Parsed template object
 */
function parseTemplateFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
        case '.json':
            return JSON.parse(content);
        case '.yaml':
        case '.yml':
            return yaml.load(content);
        case '.toml':
        case '.tml':
            return toml.parse(content);
        default:
            throw new Error(`Unsupported file extension: ${ext}. Supported: .json, .yaml, .yml, .toml, .tml`);
    }
}

/**
 * Resolve a single environment variable value based on source type
 * @param {object} config - Variable configuration
 * @param {string} varName - Variable name (for error messages)
 * @returns {Promise<string|null>} Resolved value or null if not found
 */
async function resolveValue(config, varName) {
    const source = config.source || SOURCE_TYPES.STRING;
    const value = config.value;
    const defaultValue = config.default;

    switch (source) {
        case SOURCE_TYPES.STRING:
            if (value !== undefined && value !== null) {
                return String(value);
            }
            if (defaultValue !== undefined && defaultValue !== null) {
                return String(defaultValue);
            }
            return null;

        case SOURCE_TYPES.ENV:
            const envVarName = value || varName;
            const envValue = process.env[envVarName];
            if (envValue !== undefined && envValue !== null) {
                return envValue;
            }
            if (defaultValue !== undefined && defaultValue !== null) {
                return String(defaultValue);
            }
            return null;

        case SOURCE_TYPES.AWS_SECRETS_MANAGER:
            if (!value) {
                throw new Error(`Variable "${varName}" with source AwsSecretManager requires a value in format "SecretId/Key"`);
            }
            const slashIndex = value.indexOf('/');
            if (slashIndex === -1) {
                throw new Error(`Variable "${varName}" value "${value}" must be in format "SecretId/Key"`);
            }
            const secretId = value.slice(0, slashIndex);
            const secretKey = value.slice(slashIndex + 1);

            try {
                const secret = await getAwsSecret(secretId);
                const secretValue = secret[secretKey];
                if (secretValue !== undefined && secretValue !== null) {
                    return String(secretValue);
                }
                if (defaultValue !== undefined && defaultValue !== null) {
                    return String(defaultValue);
                }
                return null;
            } catch (err) {
                if (defaultValue !== undefined && defaultValue !== null) {
                    return String(defaultValue);
                }
                throw new Error(`Failed to retrieve secret "${secretId}" for variable "${varName}": ${err.message}`);
            }

        default:
            throw new Error(`Unknown source type "${source}" for variable "${varName}". Supported: string, env, AwsSecretManager`);
    }
}

/**
 * Generate .env content from template
 * @param {object} template - Parsed template object
 * @returns {Promise<{ content: string, errors: string[] }>} Generated content and any errors
 */
async function generateEnvContent(template) {
    const lines = [];
    const errors = [];

    for (const [varName, config] of Object.entries(template)) {
        const isRequired = config.required === true;

        let resolvedValue;
        try {
            resolvedValue = await resolveValue(config, varName);
        } catch (err) {
            if (isRequired) {
                errors.push(err.message);
            }
            continue;
        }

        if (resolvedValue === null) {
            if (isRequired) {
                errors.push(`Required variable "${varName}" has no value`);
            }
            continue;
        }

        // Escape special characters and handle multiline values
        let escapedValue = resolvedValue;
        if (escapedValue.includes('\n') || escapedValue.includes('"') || escapedValue.includes(' ')) {
            escapedValue = `"${escapedValue.replace(/"/g, '\\"')}"`;
        }

        lines.push(`${varName}=${escapedValue}`);
    }

    return {
        content: lines.join('\n') + (lines.length > 0 ? '\n' : ''),
        errors,
    };
}

/**
 * Process template file and generate .env file
 * @param {string} inputPath - Path to template file
 * @param {string} outputPath - Path to output .env file
 * @param {{ dryRun?: boolean }} options - Options
 * @returns {Promise<{ success: boolean, errors: string[] }>}
 */
async function makeEnv(inputPath, outputPath, options = {}) {
    const template = parseTemplateFile(inputPath);
    const {content, errors} = await generateEnvContent(template);

    if (errors.length > 0) {
        return {success: false, errors};
    }

    if (!options.dryRun) {
        fs.writeFileSync(outputPath, content, 'utf8');
    }
    return {success: true, errors: []};
}

/**
 * Parse a .env file into key-value pairs
 * @param {string} filePath - Path to .env file
 * @returns {Object<string, string>} Parsed key-value pairs
 */
function parseEnvFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = {};

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex);
        let value = trimmed.slice(eqIndex + 1);

        // Handle quoted values
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1).replace(/\\"/g, '"');
        }

        result[key] = value;
    }

    return result;
}

/**
 * Generate a template from an existing .env file
 * @param {string} envPath - Path to .env file
 * @param {string} outputPath - Path to output template file
 * @returns {{ success: boolean, errors: string[] }}
 */
function generateTemplate(envPath, outputPath) {
    const envVars = parseEnvFile(envPath);
    const template = {};

    for (const [key, value] of Object.entries(envVars)) {
        template[key] = {
            required: value !== '',
            source: 'string',
            value: value,
        };
    }

    const ext = path.extname(outputPath).toLowerCase();
    let content;

    switch (ext) {
        case '.json':
            content = JSON.stringify(template, null, 2) + '\n';
            break;
        case '.yaml':
        case '.yml':
            content = yaml.dump(template, {lineWidth: -1});
            break;
        case '.toml':
        case '.tml':
            content = toml.stringify(template);
            break;
        default:
            return {success: false, errors: [`Unsupported output format: ${ext}`]};
    }

    fs.writeFileSync(outputPath, content, 'utf8');
    return {success: true, errors: []};
}

/**
 * Update a template file with current resolved values as defaults
 * @param {string} templatePath - Path to template file
 * @returns {Promise<{ success: boolean, errors: string[] }>}
 */
async function setDefaults(templatePath) {
    const template = parseTemplateFile(templatePath);

    for (const [varName, config] of Object.entries(template)) {
        try {
            const resolvedValue = await resolveValue(config, varName);
            if (resolvedValue !== null) {
                config.default = resolvedValue;
            }
        } catch {
            // Skip variables that fail to resolve
        }
    }

    const ext = path.extname(templatePath).toLowerCase();
    let content;

    switch (ext) {
        case '.json':
            content = JSON.stringify(template, null, 2) + '\n';
            break;
        case '.yaml':
        case '.yml':
            content = yaml.dump(template, {lineWidth: -1});
            break;
        case '.toml':
        case '.tml':
            content = toml.stringify(template);
            break;
        default:
            return {success: false, errors: [`Unsupported file format: ${ext}`]};
    }

    fs.writeFileSync(templatePath, content, 'utf8');
    return {success: true, errors: []};
}

module.exports = {
    parseTemplateFile,
    parseEnvFile,
    resolveValue,
    generateEnvContent,
    makeEnv,
    generateTemplate,
    setDefaults,
    SOURCE_TYPES,
};
