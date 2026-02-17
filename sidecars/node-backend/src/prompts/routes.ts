import { Router } from 'express';
import { promptTemplateManager } from './templates.js';

/**
 * Prompt Templates API routes
 */

export function createPromptsRouter(): Router {
  const router = Router();

  // Get all templates
  router.get('/prompts', (_req, res) => {
    const templates = promptTemplateManager.getAllTemplates();
    res.json({
      success: true,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        variables: t.variables,
      })),
    });
  });

  // Get template categories
  router.get('/prompts/categories', (_req, res) => {
    const categories = promptTemplateManager.getCategories();
    res.json({
      success: true,
      categories,
    });
  });

  // Get templates by category
  router.get('/prompts/category/:category', (req, res) => {
    const { category } = req.params;
    const templates = promptTemplateManager.getTemplatesByCategory(category);
    res.json({
      success: true,
      category,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        variables: t.variables,
      })),
    });
  });

  // Get specific template
  router.get('/prompts/:id', (req, res) => {
    const { id } = req.params;
    const template = promptTemplateManager.getTemplateById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template not found: ${id}`,
      });
    }

    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        template: template.template,
        variables: template.variables,
      },
    });
  });

  // Apply template
  router.post('/prompts/:id/apply', (req, res) => {
    const { id } = req.params;
    const { variables } = req.body ?? {};

    if (!variables || typeof variables !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'variables object is required',
      });
    }

    // Validate variables
    const missing = promptTemplateManager.validateVariables(id, variables);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required variables: ${missing.join(', ')}`,
      });
    }

    try {
      const result = promptTemplateManager.applyTemplate(id, variables);
      res.json({
        success: true,
        prompt: result,
        templateId: id,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  return router;
}
