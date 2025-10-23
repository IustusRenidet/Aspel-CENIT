const Joi = require('joi');

const loginSchema = Joi.object({
  correo: Joi.string().email({ tlds: { allow: false } }).required(),
  contraseña: Joi.string().min(6).required()
});

const registerSchema = Joi.object({
  nombre: Joi.string().min(3).max(120).required(),
  correo: Joi.string().email({ tlds: { allow: false } }).required(),
  contraseña: Joi.string().min(6).required(),
  roles: Joi.array().items(Joi.string()).default(['analista']),
  permisos: Joi.array().items(Joi.string()).default(['dashboard:read'])
});

const selectCompanySchema = Joi.object({
  companyId: Joi.string().required()
});

const companySchema = Joi.object({
  _id: Joi.string().optional(),
  ownerId: Joi.string().required(),
  nombre: Joi.string().min(2).max(120).required(),
  clave: Joi.string().min(2).max(10).required(),
  rutaFirebird: Joi.string().required(),
  rolesPermitidos: Joi.array().items(Joi.string()).default([]),
  permisos: Joi.array().items(Joi.string()).default([])
});

module.exports = {
  loginSchema,
  registerSchema,
  selectCompanySchema,
  companySchema
};
