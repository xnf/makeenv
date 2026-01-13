export interface VariableConfig {
	required?: boolean;
	source?: 'string' | 'env';
	value?: string;
	default?: string;
}

export interface Template {
	[varName: string]: VariableConfig;
}

export interface Result {
	success: boolean;
	errors: string[];
}

export interface GenerateEnvResult {
	content: string;
	errors: string[];
}

export interface MakeEnvOptions {
	dryRun?: boolean;
}

export const SOURCE_TYPES: {
	STRING: 'string';
	ENV: 'env';
};

export function parseTemplateFile(filePath: string): Template;

export function parseEnvFile(filePath: string): Record<string, string>;

export function resolveValue(config: VariableConfig, varName: string): string | null;

export function generateEnvContent(template: Template): GenerateEnvResult;

export function makeEnv(inputPath: string, outputPath: string, options?: MakeEnvOptions): Result;

export function generateTemplate(envPath: string, outputPath: string): Result;

export function setDefaults(templatePath: string): Result;
