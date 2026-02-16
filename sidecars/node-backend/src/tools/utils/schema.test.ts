import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema, getRequiredParams } from './schema.js';

describe('zodToJsonSchema', () => {
  it('should convert string type', () => {
    const schema = z.object({ name: z.string() });
    const result = zodToJsonSchema(schema);
    expect(result.name).toEqual({ type: 'string' });
  });

  it('should convert number type', () => {
    const schema = z.object({ age: z.number() });
    const result = zodToJsonSchema(schema);
    expect(result.age).toEqual({ type: 'number' });
  });

  it('should convert boolean type', () => {
    const schema = z.object({ active: z.boolean() });
    const result = zodToJsonSchema(schema);
    expect(result.active).toEqual({ type: 'boolean' });
  });

  it('should convert enum type', () => {
    const schema = z.object({ status: z.enum(['active', 'inactive']) });
    const result = zodToJsonSchema(schema);
    expect(result.status).toEqual({ type: 'string', enum: ['active', 'inactive'] });
  });

  it('should convert array type', () => {
    const schema = z.object({ items: z.array(z.string()) });
    const result = zodToJsonSchema(schema);
    expect(result.items).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('should convert nested object', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        age: z.number(),
      }),
    });
    const result = zodToJsonSchema(schema);
    expect(result.user).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    });
  });

  it('should handle optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    const result = zodToJsonSchema(schema);
    expect(result.required).toEqual({ type: 'string' });
    expect(result.optional).toEqual({ type: 'string' });
  });

  it('should preserve description', () => {
    const schema = z.object({
      name: z.string().describe('The user name'),
    });
    const result = zodToJsonSchema(schema);
    expect(result.name).toEqual({ type: 'string', description: 'The user name' });
  });

  it('should handle default values', () => {
    const schema = z.object({
      count: z.number().default(0),
    });
    const result = zodToJsonSchema(schema);
    expect(result.count).toEqual({ type: 'number' });
  });

  it('should handle nullable types', () => {
    const schema = z.object({
      value: z.string().nullable(),
    });
    const result = zodToJsonSchema(schema);
    expect(result.value).toEqual({ type: 'string' });
  });
});

describe('getRequiredParams', () => {
  it('should return required fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    const result = getRequiredParams(schema);
    expect(result).toEqual(['required']);
  });

  it('should return empty array when all optional', () => {
    const schema = z.object({
      first: z.string().optional(),
      second: z.number().optional(),
    });
    const result = getRequiredParams(schema);
    expect(result).toEqual([]);
  });

  it('should return all fields when all required', () => {
    const schema = z.object({
      first: z.string(),
      second: z.number(),
      third: z.boolean(),
    });
    const result = getRequiredParams(schema);
    expect(result).toEqual(['first', 'second', 'third']);
  });

  describe('edge cases', () => {
    it('should handle deeply nested objects', () => {
      const schema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              value: z.string(),
            }),
          }),
        }),
      });
      const result = zodToJsonSchema(schema);
      expect(result.level1.type).toBe('object');
      expect(result.level1.properties.level2.type).toBe('object');
      expect(result.level1.properties.level2.properties.level3.type).toBe('object');
    });

    it('should handle arrays of objects', () => {
      const schema = z.object({
        items: z.array(z.object({
          id: z.number(),
          name: z.string(),
        })),
      });
      const result = zodToJsonSchema(schema);
      expect(result.items.type).toBe('array');
      expect(result.items.items.type).toBe('object');
      expect(result.items.items.properties.id.type).toBe('number');
    });

    it('should handle union types', () => {
      const schema = z.object({
        value: z.union([z.string(), z.number()]),
      });
      const result = zodToJsonSchema(schema);
      // Union types should result in empty object (not directly supported)
      expect(result.value).toEqual({});
    });

    it('should handle optional with default', () => {
      const schema = z.object({
        count: z.number().optional().default(0),
      });
      const result = getRequiredParams(schema);
      // Fields with default are not required
      expect(result).toEqual([]);
    });

    it('should handle empty object schema', () => {
      const schema = z.object({});
      const result = zodToJsonSchema(schema);
      expect(result).toEqual({});
    });

    it('should handle many fields', () => {
      const fields: Record<string, z.ZodString> = {};
      for (let i = 0; i < 100; i++) {
        fields[`field${i}`] = z.string();
      }
      const schema = z.object(fields);
      const result = zodToJsonSchema(schema);
      expect(Object.keys(result)).toHaveLength(100);
    });

    it('should handle mixed optional and required', () => {
      const schema = z.object({
        required1: z.string(),
        optional1: z.string().optional(),
        required2: z.number(),
        optional2: z.number().optional(),
        required3: z.boolean(),
      });
      const result = getRequiredParams(schema);
      expect(result).toEqual(['required1', 'required2', 'required3']);
    });
  });
});
