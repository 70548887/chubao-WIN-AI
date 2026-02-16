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
});
