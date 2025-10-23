const express = require('express');
const bcrypt = require('bcryptjs');
const { loginSchema, registerSchema } = require('../validation/schemas');
const {
  findUserByEmail,
  createUser,
  getCompaniesByOwner
} = require('../services/mongoService');
const { loadConfiguration } = require('../../config/configManager');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { value, error } = loginSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    const user = await findUserByEmail(value.correo);

    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const isValidPassword = await bcrypt.compare(value.contraseña, user.contraseña);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const companies = await getCompaniesByOwner(user._id);
    const config = loadConfiguration();

    return res.json({
      user: {
        id: user._id,
        nombre: user.nombre,
        correo: user.correo,
        roles: user.roles,
        permisos: user.permisos
      },
      companies,
      selectedCompanyId: config.selectedCompanyId
    });
  } catch (err) {
    next(err);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const { value, error } = registerSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    const existing = await findUserByEmail(value.correo);

    if (existing) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese correo.' });
    }

    const newUser = await createUser(value);

    return res.status(201).json({
      user: {
        id: newUser._id,
        nombre: newUser.nombre,
        correo: newUser.correo,
        roles: newUser.roles,
        permisos: newUser.permisos
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
