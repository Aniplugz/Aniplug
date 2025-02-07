// middleware/errorHandler.js
export default (err, res) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
  
    // Log the error
    console.error(`[${new Date().toISOString()}] Error: ${message}`);
    console.error(err.stack);
  
    // Send response
    res.status(statusCode).json({
      status: 'error',
      message: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) // Include stack trace in development
    });
  };
  