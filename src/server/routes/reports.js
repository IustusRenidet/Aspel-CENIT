const express = require('express');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const { loadConfiguration } = require('../../config/configManager');
const { getCompanyById } = require('../services/mongoService');
const { fetchSaeOverview } = require('../services/firebirdService');

const router = express.Router();

router.get('/sae', async (req, res, next) => {
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

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reporte-sae-${company.clave || company._id.toString()}.pdf"`
    );

    doc.pipe(res);

    doc.fontSize(20).text(`Reporte SAE - ${company.nombre}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generado: ${dayjs(overview.generatedAt).format('DD/MM/YYYY HH:mm')}`);
    doc.text(`Fuente de datos: ${overview.source}`);
    doc.moveDown();

    doc.fontSize(14).text('Resumen');
    doc.moveDown(0.5);
    Object.entries(overview.resumen).forEach(([key, value]) => {
      doc.text(`${key}: ${value}`);
    });

    doc.moveDown();
    doc.fontSize(14).text('Serie mensual de ventas y compras');
    doc.moveDown(0.5);

    overview.series.labels.forEach((label, index) => {
      doc.text(
        `${label}: Ventas ${overview.series.ventas[index]} | Compras ${overview.series.compras[index]}`
      );
    });

    doc.end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
