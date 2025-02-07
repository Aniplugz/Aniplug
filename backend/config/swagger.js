// config/swagger.js  
export const swaggerDocs = {  
    openapi: '3.0.0',  
    info: {  
      title: 'Aniplug API',  
      version: '1.0.0',  
      description: 'API for anime streaming and management'  
    },  
    servers: [{ url: 'http://localhost:3000' }],  
    tags: [  
      { name: 'Auth', description: 'Authentication endpoints' },  
      { name: 'Anime', description: 'Anime scraping & streaming' },  
      { name: 'Users', description: 'User management' }  
    ],  
    components: {  
      securitySchemes: {  
        JWT: {  
          type: 'http',  
          scheme: 'bearer',  
          bearerFormat: 'JWT'  
        }  
      }  
    },  
    paths: {} // Auto-populated by swagger-jsdoc  
  };  
  // Removed the circular import

