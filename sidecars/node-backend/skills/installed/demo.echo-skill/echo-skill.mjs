import { z } from 'zod';

/**
 * Example custom skill tool.
 * Install it with:
 * npm run skill:install -- ./skills/templates/echo-skill
 */
export const skillTools = [
  {
    name: 'echo_text',
    description: 'Return input text and metadata for quick skill wiring validation.',
    parameters: z.object({
      text: z.string().min(1).describe('Text to echo'),
      uppercase: z.boolean().optional().describe('Return uppercased text'),
    }),
    async execute(args) {
      const text = args.uppercase ? args.text.toUpperCase() : args.text;
      return {
        text,
        original: args.text,
        uppercase: args.uppercase === true,
        length: args.text.length,
        generatedAt: new Date().toISOString(),
      };
    },
  },
];
