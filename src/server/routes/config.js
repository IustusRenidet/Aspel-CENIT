const express = require('express');
const {
  loadConfiguration,
  setSelectedCompany
} = require('../../config/configManager');
const {
  getCompaniesByOwner,
  getCompanyById,
  upsertCompany
} = require('../services/mongoService');
const { selectCompanySchema, companySchema } = require('../validation/schemas');

const router = express.Router();

router.get('/company', (req, res) => {
  const config = loadConfiguration();
  res.json(config);
});

router.post('/company', async (req, res, next) => {
  try {
    const { value, error } = selectCompanySchema.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    const company = await getCompanyById(value.companyId);

    if (!company) {
      return res.status(404).json({ message: 'Empresa no encontrada.' });
    }

    const updatedConfig = setSelectedCompany(value.companyId);

    res.json({
      config: updatedConfig,
      company
    });
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:ownerId', async (req, res, next) => {
  try {
    const { ownerId } = req.params;
    const companies = await getCompaniesByOwner(ownerId);
    res.json({ companies });
  } catch (error) {
    next(error);
  }
});

router.post('/companies', async (req, res, next) => {
  try {
    const { value, error } = companySchema.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    const company = await upsertCompany(value);
    res.status(201).json({ company });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
