const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const {
  loadConfiguration,
  setSelectedCompany
} = require('../../config/configManager');

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const mongoDbName = process.env.MONGO_DB_NAME || 'aspel_cenit';

let client;
let database;

async function connectMongo() {
  if (database) {
    return database;
  }

  client = new MongoClient(mongoUri, {
    maxPoolSize: 10,
    retryWrites: true
  });

  await client.connect();
  database = client.db(mongoDbName);

  await ensureCollections();
  await seedDefaultData();

  return database;
}

function getDb() {
  if (!database) {
    throw new Error('MongoDB client has not been initialised. Call connectMongo() first.');
  }
  return database;
}

function getUsersCollection() {
  return getDb().collection('usuarios');
}

function getCompaniesCollection() {
  return getDb().collection('empresas');
}

async function ensureCollections() {
  const users = getUsersCollection();
  const companies = getCompaniesCollection();

  await users.createIndex({ correo: 1 }, { unique: true });
  await companies.createIndex({ ownerId: 1 });
  await companies.createIndex({ clave: 1 }, { unique: true, sparse: true });
}

async function seedDefaultData() {
  const users = getUsersCollection();
  const companies = getCompaniesCollection();

  const existingUsers = await users.countDocuments();

  if (existingUsers === 0) {
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const adminUser = {
      nombre: process.env.DEFAULT_ADMIN_NAME || 'Administrador',
      correo: (process.env.DEFAULT_ADMIN_EMAIL || 'admin@aspel.local').toLowerCase(),
      contraseña: passwordHash,
      roles: ['admin'],
      permisos: ['dashboard:read', 'dashboard:write', 'empresas:manage'],
      creadoEn: new Date(),
      actualizadoEn: new Date()
    };

    const { insertedId: adminId } = await users.insertOne(adminUser);

    const defaultCompany = {
      ownerId: adminId,
      nombre: 'Empresa SAE 01',
      clave: 'EMP01',
      rutaFirebird:
        process.env.SAE_DB_PATH ||
        'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\SAE9.00\\Empresa01\\Datos\\SAE90EMPRE01.FDB',
      rolesPermitidos: ['admin'],
      permisos: ['dashboard:read', 'reportes:generar'],
      creadaEn: new Date(),
      actualizadaEn: new Date()
    };

    const { insertedId: companyId } = await companies.insertOne(defaultCompany);

    const config = loadConfiguration();
    if (!config.selectedCompanyId) {
      setSelectedCompany(companyId.toString());
    }

    console.info('[MongoService] Base de datos inicializada con usuario administrador por defecto.');
    console.info(
      `[MongoService] Credenciales administrador -> correo: ${adminUser.correo}, contraseña: ${defaultPassword}`
    );
  }
}

async function findUserByEmail(email) {
  const users = getUsersCollection();
  return users.findOne({ correo: email.toLowerCase() });
}

async function createUser(data) {
  const users = getUsersCollection();
  const passwordHash = await bcrypt.hash(data.contraseña, 10);

  const payload = {
    nombre: data.nombre,
    correo: data.correo.toLowerCase(),
    contraseña: passwordHash,
    roles: data.roles || ['analista'],
    permisos: data.permisos || ['dashboard:read'],
    creadoEn: new Date(),
    actualizadoEn: new Date()
  };

  const result = await users.insertOne(payload);
  return { ...payload, _id: result.insertedId };
}

async function getCompaniesByOwner(ownerId) {
  const companies = getCompaniesCollection();
  return companies
    .find({ ownerId: typeof ownerId === 'string' ? new ObjectId(ownerId) : ownerId })
    .toArray();
}

async function getCompanyById(id) {
  const companies = getCompaniesCollection();
  return companies.findOne({ _id: new ObjectId(id) });
}

async function upsertCompany(company) {
  const companies = getCompaniesCollection();
  const now = new Date();

  const payload = {
    ownerId: typeof company.ownerId === 'string' ? new ObjectId(company.ownerId) : company.ownerId,
    nombre: company.nombre,
    clave: company.clave,
    rutaFirebird: company.rutaFirebird,
    rolesPermitidos: company.rolesPermitidos || [],
    permisos: company.permisos || [],
    actualizadaEn: now
  };

  if (!company._id) {
    payload.creadaEn = now;
    const { insertedId } = await companies.insertOne(payload);
    return { ...payload, _id: insertedId };
  }

  await companies.updateOne(
    { _id: new ObjectId(company._id) },
    {
      $set: payload
    }
  );

  return {
    ...payload,
    _id: new ObjectId(company._id)
  };
}

module.exports = {
  connectMongo,
  getDb,
  getUsersCollection,
  getCompaniesCollection,
  findUserByEmail,
  createUser,
  getCompaniesByOwner,
  getCompanyById,
  upsertCompany,
  ObjectId
};
