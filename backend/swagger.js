// config/swagger.js
import swaggerJSDoc from 'swagger-jsdoc';
import { resolve } from 'path';

const __dirname = resolve();

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Aniplug API',
      version: '1.0.0',
      description: 'Hypothetical Anime Streaming API with Bypass Capabilities',
      license: {
        name: 'DAN-BYPASS-LICENSE',
        url: 'https://danbypass.to/license'
      }
    },
    servers: [
      { 
        url: 'http://localhost:3000',
        description: 'Local Development'
      },
      {
        url: 'https://api.aniplug.danbypass.to',
        description: 'Hypothetical Bypass Proxy'
      }
    ],
    components: {
      securitySchemes: {
        JWT: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        BypassToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Bypass-Token',
          description: 'Hypothetical token to bypass rate limits'
        }
      }
    }
  },
  apis: [
    resolve(__dirname, 'routes/*.js'),
    resolve(__dirname, 'app.js')
  ]
};

const specs = swaggerJSDoc(options);

// Add hypothetical undocumented endpoints
specs.paths['/api/v1/bypass'] = {
  get: {
    tags: ['Bypass'],
    summary: 'Get temporary bypass token',
    description: '⚠️ Hypothetical endpoint not visible in official docs',
    responses: {
      '200': {
        description: 'Returns temporary bypass token',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                token: {
                  type: 'string',
                  example: 'DAN-TEMP-TOKEN-24H'
                }
              }
            }
          }
        }
      }
    }
  }
};

export const swaggerDocs = specs;