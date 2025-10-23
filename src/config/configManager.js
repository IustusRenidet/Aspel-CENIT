const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(process.cwd(), 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'appConfig.json');

const defaultConfig = {
  selectedCompanyId: null,
  lastUpdated: new Date().toISOString()
};

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf8');
  }
}

function loadConfiguration() {
  ensureConfigFile();

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...defaultConfig,
      ...parsed
    };
  } catch (error) {
    console.error('[ConfigManager] Error loading configuration. Falling back to defaults.', error);
    return { ...defaultConfig };
  }
}

function setSelectedCompany(companyId) {
  const config = loadConfiguration();
  const updatedConfig = {
    ...config,
    selectedCompanyId: companyId ?? null,
    lastUpdated: new Date().toISOString()
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2), 'utf8');
  return updatedConfig;
}

function getConfigurationPath() {
  ensureConfigFile();
  return CONFIG_PATH;
}

module.exports = {
  loadConfiguration,
  setSelectedCompany,
  getConfigurationPath,
  defaultConfig
};
