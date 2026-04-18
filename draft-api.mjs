import express from 'express'
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import { Aaron } from '@freesewing/aaron'
import { cisMaleAdult40 } from '@freesewing/models'
import { themePlugin } from '@freesewing/plugin-theme'
import { pluginI18n } from '@freesewing/plugin-i18n'

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

// Map of available designs
const designs = {
  aaron: Aaron,
}

/**
 * @openapi
 * /api/designs/{design}:
 *   get:
 *     summary: Get design-specific metadata
 *     description: Returns the required measurements and available styling options for a specific design.
 *     parameters:
 *       - in: path
 *         name: design
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the design (e.g., 'aaron').
 *     responses:
 *       200:
 *         description: Metadata for the design.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 measurements:
 *                   type: array
 *                   items:
 *                     type: string
 *                 options:
 *                   type: object
 *       404:
 *         description: Design not found.
 */
app.get('/api/designs/:design', (req, res) => {
  const { design } = req.params
  const DesignClass = designs[design.toLowerCase()]

  if (!DesignClass) {
    return res.status(404).json({ error: `Design '${design}' not found.` })
  }

  const config = DesignClass.patternConfig || {}
  res.json({
    measurements: config.measurements || [],
    options: config.options || {},
  })
})

/**
 * @openapi
 * /api/draft:
 *   post:
 *     summary: Draft a FreeSewing pattern
 *     description: Takes measurements and options to generate a pattern SVG.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               design:
 *                 type: string
 *                 default: aaron
 *                 description: The name of the design to draft (e.g., 'aaron').
 *               measurements:
 *                 type: object
 *                 description: |
 *                   Body measurements in millimeters. For Aaron, required measurements typically include:
 *                   - **chest**: Chest circumference
 *                   - **hips**: Hips circumference
 *                   - **neck**: Neck circumference
 *                   - **hpsToWaistBack**: High point shoulder to waist (back)
 *                 example:
 *                   chest: 1000
 *                   hips: 1000
 *                   neck: 400
 *                   hpsToWaistBack: 450
 *               options:
 *                 type: object
 *                 description: |
 *                   Design-specific options. For Aaron, these include:
 *                   - **chestEase**: Percentage ease at the chest (0 to 0.2)
 *                   - **hipsEase**: Percentage ease at the hips (0 to 0.2)
 *                   - **stretchFactor**: Compensation for fabric stretch (0 to 0.15)
 *                   - **armholeDrop**: How low to drop the armhole (0 to 0.75)
 *                   - **necklineDrop**: Depth of the front neckline (0.1 to 0.35)
 *                   - **shoulderStrapWidth**: Width of the shoulder strap (0.1 to 0.4)
 *                   - **shoulderStrapPlacement**: Position on the shoulder (0.2 to 0.8)
 *                   - **backlineBend**: Curvature of the back armhole (0.25 to 1.0)
 *                   - **knitBindingWidth**: Width of the binding (3.0 to 8.0)
 *                 example:
 *                   chestEase: 0.08
 *                   armholeDrop: 0.1
 *                   necklineDrop: 0.2
 *                   shoulderStrapWidth: 0.15
 *     responses:
 *       200:
 *         description: A drafted SVG pattern.
 *         content:
 *           image/svg+xml:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request or design not found.
 */
app.post('/api/draft', (req, res) => {
  const { design = 'aaron', measurements = cisMaleAdult40, options = {} } = req.body

  const DesignClass = designs[design.toLowerCase()]
  if (!DesignClass) {
    return res
      .status(400)
      .json({
        error: `Design '${design}' not found. Available: ${Object.keys(designs).join(', ')}`,
      })
  }

  try {
    const settings = {
      measurements,
      options,
      embed: false,
    }

    const pattern = new DesignClass(settings)
    pattern.use(themePlugin, { stripped: false, skipGrid: ['pages'] })
    pattern.use(pluginI18n, (key) => key)

    pattern.draft()

    // Optional: Clean up snippets if needed (matching draft-pattern.mjs logic)
    const draftedParts = pattern.parts[0]
    for (const name in draftedParts) {
      if (draftedParts[name].snippets?.logo) {
        delete draftedParts[name].snippets.logo
      }
    }

    const svg = pattern.render()
    res.setHeader('Content-Type', 'image/svg+xml')
    res.send(svg)
  } catch (error) {
    console.error('Drafting error:', error)
    res.status(500).json({ error: 'Failed to draft pattern', message: error.message })
  }
})

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FreeSewing Drafting API',
      version: '1.0.0',
      description: 'An API to programmatically draft FreeSewing patterns.',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
      },
    ],
  },
  apis: ['./draft-api.mjs'], // Search for @openapi in this file
}

const swaggerSpec = swaggerJsdoc(swaggerOptions)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.listen(port, () => {
  console.log(`🚀 FreeSewing Drafting API listening at http://localhost:${port}`)
  console.log(`📖 Swagger docs available at http://localhost:${port}/api-docs`)
})
