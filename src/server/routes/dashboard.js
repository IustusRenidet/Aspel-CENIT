const express = require('express');
const { loadConfiguration } = require('../../config/configManager');
const { getCompanyById } = require('../services/mongoService');
const { fetchSaeOverview } = require('../services/firebirdService');

const router = express.Router();

router.get('/sae/summary', async (req, res, next) => {
  try {
    const { companyId } = req.query;
    const config = loadConfiguration();
    const targetCompanyId = companyId || config.selectedCompanyId;

    if (!targetCompanyId) {
      return res.status(400).json({ message: 'No hay una empresa seleccionada en la configuración.' });
    }

    const company = await getCompanyById(targetCompanyId);

    if (!company) {
      return res.status(404).json({ message: 'Empresa no encontrada.' });
    }

    const overview = await fetchSaeOverview(company.rutaFirebird, company.nombre);

    res.json({
      company,
      overview
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
