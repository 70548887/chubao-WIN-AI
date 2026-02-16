/**
 * Zod to JSON Schema Converter
 */
import { z } from 'zod';

export function zodToJsonSchema(zodObj: z.ZodObject<any>): Record<string, any> {
  const shape = zodObj.shape;
  const properties: Record<string, any> = {};

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodTypeToJsonSchema(value as z.ZodTypeAny);
  }

  return properties;
}

/**
 * Convert a single Zod type to JSON Schema, handling wrappers
 * like ZodOptional, ZodDefault, ZodNullable, etc.
 */
function zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, any> {
  // Unwrap optional / default / nullable wrappers
  let inner: z.ZodTypeAny = zodType;
  while (
    inner instanceof z.ZodOptional ||
    inner instanceof z.ZodDefault ||
    inner instanceof z.ZodNullable
  ) {
    inner = (inner as any)._def.innerType;
  }

  let schema: Record<string, any>;

  if (inner instanceof z.ZodString) {
    schema = { type: 'string' };
  } else if (inner instanceof z.ZodNumber) {
    schema = { type: 'number' };
  } else if (inner instanceof z.ZodBoolean) {
    schema = { type: 'boolean' };
  } else if (inner instanceof z.ZodEnum) {
    const values = inner._def.values as string[];
    schema = { type: 'string', enum: values };
  } else if (inner instanceof z.ZodArray) {
    const itemType = inner._def.type as z.ZodTypeAny;
    schema = { type: 'array', items: zodTypeToJsonSchema(itemType) };
  } else if (inner instanceof z.ZodObject) {
    schema = {
      type: 'object',
      properties: zodToJsonSchema(inner),
    };
  } else {
    // Fallback for unsupported types
    schema = {};
  }

  // Attach description from the original (possibly wrapped) type
  if (zodType.description) {
    schema.description = zodType.description;
  } else if (inner.description) {
    schema.description = inner.description;
  }

  return schema;
}

export function getRequiredParams(zodObj: z.ZodObject<any>): string[] {
  return Object.keys(zodObj.shape).filter(
    (key) => !zodObj.shape[key].isOptional(),
  );
}
