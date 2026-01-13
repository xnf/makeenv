const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const toml = require('smol-toml');

/**
 * Supported source types for environment variable values
 */
const SOURCE_TYPES = {
    STRING: 'string',
    ENV: 'env',
};

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
 * @returns {string|null} Resolved value or null if not found
 */
function resolveValue(config, varName) {
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

        default:
            throw new Error(`Unknown source type "${source}" for variable "${varName}". Supported: string, env`);
    }
}

/**
 * Generate .env content from template
 * @param {object} template - Parsed template object
 * @returns {{ content: string, errors: string[] }} Generated content and any errors
 */
function generateEnvContent(template) {
    const lines = [];
    const errors = [];

    for (const [varName, config] of Object.entries(template)) {
        const resolvedValue = resolveValue(config, varName);
        const isRequired = config.required === true;

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
 * @returns {{ success: boolean, errors: string[] }}
 */
function makeEnv(inputPath, outputPath, options = {}) {
    const template = parseTemplateFile(inputPath);
    const {content, errors} = generateEnvContent(template);

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
 * @returns {{ success: boolean, errors: string[] }}
 */
function setDefaults(templatePath) {
    const template = parseTemplateFile(templatePath);

    for (const [varName, config] of Object.entries(template)) {
        const resolvedValue = resolveValue(config, varName);
        if (resolvedValue !== null) {
            config.default = resolvedValue;
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
