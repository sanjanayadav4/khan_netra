const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Record already exists', error: err.detail });
  }
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced record not found', error: err.detail });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
};

module.exports = { errorHandler, notFound };
