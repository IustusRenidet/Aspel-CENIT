function errorHandler(err, req, res, next) {
  console.error('[ExpressError]', err);
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Ocurrió un error inesperado.';

  res.status(statusCode).json({
    message
  });
}

module.exports = {
  errorHandler
};
