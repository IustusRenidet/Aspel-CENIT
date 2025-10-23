const express = require('express');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const dashboardRoutes = require('./routes/dashboard');
const reportsRoutes = require('./routes/reports');
const { errorHandler } = require('./middleware/errorHandler');
const { connectMongo } = require('./services/mongoService');

dotenv.config();

async function createServer() {
  await connectMongo();

  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportsRoutes);

  app.use(errorHandler);

  return app;
}

module.exports = {
  createServer
};
