A continuación te dejo una especificación completa y operativa de **la configuración de bases de datos Aspel (Firebird) por empresa** en CENIT ASP, incluyendo: detección automática, personalización, validaciones, verificación de conexión, persistencia en SQLite, endpoints, UI/UX del wizard, y consideraciones de robustez.

---

# 1) Objetivo de la configuración de bases

Permitir que cada **Empresa** (objeto dentro de CENIT ASP) tenga:

* Un conjunto de  **sistemas habilitados** : SAE / COI / NOI / BANCO
* Para cada sistema habilitado:
  * versión instalada detectada (SAE7/8/9, COI10/11, NOI10/11, BAN6)
  * ruta al archivo `.FDB` (por defecto o personalizada)
  * estado de verificación (OK / error)
  * metadatos útiles para ETL (hash/fecha de archivo, alias, etc.)

**Regla:** La configuración está asociada a la empresa de CENIT ASP, no al usuario final (aunque viva en AppData del usuario).

---

# 2) Ruta base de detección (entrada)

Ruta estándar:

`C:\Program Files (x86)\Common Files\Aspel\Sistemas Aspel\`

Estructura típica:

* BAN6.00\
* COI10.00\ COI11.00\
* NOI10.00\ NOI11.00\
* SAE7.00\ SAE8.00\ SAE9.00\

Mapeo de carpeta → sistema:

* `BAN6.00` → BANCO
* `COI10.00`, `COI11.00` → COI
* `NOI10.00`, `NOI11.00` → NOI
* `SAE7.00`, `SAE8.00`, `SAE9.00` → SAE

---

# 3) Rutas por defecto (plantillas por sistema)

Estas son  **heurísticas** ; la app propone, pero el usuario puede cambiar.

## SAE (ejemplo SAE9)

`...\SAE9.00\Empresa01\Datos\SAE90EMPRE01.FDB`

Patrón:

* Base: `SAE{verSinPunto}EMPRE{empresa2digitos}.FDB`
  * SAE9.00 → `SAE90...`

Carpeta empresa:

* `Empresa01`, `Empresa02`, ...

## COI (ejemplo COI10)

`...\COI10.00\Datos\Empresa1\COI10EMPRE1.FDB`

Patrón típico:

* Carpeta: `Empresa1`, `Empresa2`, ... (a veces sin cero)
* Archivo: `COI10EMPRE1.FDB`, `COI10EMPRE2.FDB`, etc.

## NOI (ejemplo NOI11)

`...\NOI11.00\Datos\Empresa01\NOI11EMPRE01.FDB`

## BANCO (BAN6)

`...\BAN6.00\Datos\Empresa01\BAN60EMPRE01.FDB`

---

# 4) Método de detección (A: escanear carpetas EmpresaXX)

Tu decisión:  **A) escanear** .

## 4.1 Algoritmo recomendado por sistema

### Paso 1: detectar versiones instaladas

* Lista subcarpetas de la ruta base
* Filtra por regex: `^(SAE|COI|NOI|BAN)\d+\.\d{2}$` (o mapeo directo)
* Agrupa por sistema

### Paso 2: localizar carpetas “Empresa…”

Para cada carpeta de versión detectada:

* SAE:
  * Buscar `Empresa*` directamente dentro de `SAE9.00\`
  * Dentro: `EmpresaXX\Datos\*.FDB`
* COI:
  * Buscar dentro `COI10.00\Datos\Empresa*`
  * Dentro: `\*.FDB`
* NOI:
  * Buscar dentro `NOI11.00\Datos\Empresa*`
  * Dentro: `\*.FDB`
* BANCO:
  * Buscar dentro `BAN6.00\Datos\Empresa*`
  * Dentro: `\*.FDB`

### Paso 3: seleccionar el FDB “candidato”

Si hay varios `.FDB`:

* Preferir el que coincide con patrón por defecto (si existe)
* Si no, elegir el `.FDB` más probable:
  * mayor tamaño
  * último modificado
  * nombre que contiene “EMPRE”

**Siempre mostrar al usuario** la lista de candidatos y permitir elegir.

---

# 5) Personalización (manual) y cómo se guarda

Permites personalizar:

* versión (si hay varias)
* ruta `.FDB` (file picker)
* alias por conexión (opcional)

Caso de uso que definiste:
Una empresa “Sophia” puede apuntar a rutas distintas en cada sistema:

* COI → `COI10EMPRE2.FDB`
* NOI → `NOI11EMPRE04.FDB`
* SAE → `SAE90EMPRE011.FDB`
* BANCO → `BAN60EMPRE01.FDB`

Esto se guarda “por empresa” y “por sistema”.

---

# 6) Verificación de conexión (obligatoria para operar)

## 6.1 Qué debe verificar el backend

Por cada sistema habilitado:

1. Existe el archivo `.FDB`
2. Permisos de lectura (se puede abrir)
3. Conectar Firebird con la configuración integrada
4. Ejecutar query mínima:
   * `SELECT 1 FROM RDB$DATABASE;`
5. Leer metadatos mínimos:
   * timestamp “last modified”
   * tamaño en bytes
   * (opcional) contar tablas clave para confirmar que es el sistema correcto

### 6.2 Verificación “tipo sistema” (evitar que conecten un FDB equivocado)

Para reducir errores humanos, puedes validar con una firma:

* SAE: existencia de tablas típicas (ej. `INVE`, `CLIE`, `FACTF`, etc.)
* COI: tablas típicas (ej. `CUENTAS`, `POLIZAS` o equivalentes)
* NOI: tablas típicas de nómina
* BANCO: tablas de bancos/movimientos

No hace falta el 100% de tablas; con 3–5 tablas distintivas basta.

Resultado por sistema:

* `OK`
* `WARNING` (conectó pero no se pudo validar firma con alta confianza)
* `ERROR` (no conecta / archivo no existe)

---

# 7) Persistencia en SQLite (modelo recomendado)

Necesitas 2 entidades:

1. `empresas`
2. `conexiones_empresa` (una fila por empresa + sistema)

## 7.1 DDL en español (exacto)

```sql
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY,                  -- emp_0001
  nombre TEXT NOT NULL UNIQUE,          -- "Sophia"
  notas TEXT,
  creada_en TEXT NOT NULL,
  actualizada_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conexiones_empresa (
  id TEXT PRIMARY KEY,                  -- cxn_01H...
  empresa_id TEXT NOT NULL,
  sistema TEXT NOT NULL,                -- SAE|COI|NOI|BANCO
  habilitado INTEGER NOT NULL DEFAULT 0,

  version_instalada TEXT,               -- "SAE9.00", "COI10.00", etc.
  ruta_fdb TEXT,                        -- ruta completa al .FDB

  alias_conexion TEXT,                  -- opcional ("COI - contabilidad", etc.)

  verificado INTEGER NOT NULL DEFAULT 0,
  ultimo_ok_en TEXT,
  ultimo_error TEXT,

  archivo_tamano INTEGER,               -- bytes
  archivo_modificado_en TEXT,           -- fecha del filesystem (ISO)
  firma_json TEXT NOT NULL DEFAULT '{}',-- JSON con tabla detectadas, etc.

  creada_en TEXT NOT NULL,
  actualizada_en TEXT NOT NULL,

  UNIQUE (empresa_id, sistema),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conexiones_empresa ON conexiones_empresa (empresa_id);
CREATE INDEX IF NOT EXISTS idx_conexiones_sistema ON conexiones_empresa (sistema);
CREATE INDEX IF NOT EXISTS idx_conexiones_habilitado ON conexiones_empresa (habilitado);
```

---

# 8) Contratos de endpoints (configuración y detección)

## 8.1 Detectar instalaciones

`POST /api/conexiones/detectar-instalaciones`

**Request**

```json
{
  "ruta_base": "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel"
}
```

**Response**

```json
{
  "ok": true,
  "ruta_base": "C:\\...\\Sistemas Aspel",
  "detectado": {
    "SAE": ["SAE7.00", "SAE8.00", "SAE9.00"],
    "COI": ["COI10.00", "COI11.00"],
    "NOI": ["NOI10.00", "NOI11.00"],
    "BANCO": ["BAN6.00"]
  }
}
```

---

## 8.2 Detectar empresas (método A)

`POST /api/conexiones/detectar-empresas`

**Request**

```json
{
  "ruta_base": "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel",
  "seleccion": [
    { "sistema": "SAE", "version": "SAE9.00" },
    { "sistema": "COI", "version": "COI10.00" },
    { "sistema": "NOI", "version": "NOI11.00" },
    { "sistema": "BANCO", "version": "BAN6.00" }
  ]
}
```

**Response**

```json
{
  "ok": true,
  "candidatos": {
    "SAE": [
      {
        "empresa_carpeta": "Empresa01",
        "fdbs": [
          {
            "ruta": "C:\\...\\SAE9.00\\Empresa01\\Datos\\SAE90EMPRE01.FDB",
            "es_patron_default": true,
            "tamano": 123456789,
            "modificado_en": "2025-11-25T11:16:00"
          }
        ]
      }
    ],
    "COI": [
      {
        "empresa_carpeta": "Empresa1",
        "fdbs": [
          { "ruta": "C:\\...\\COI10.00\\Datos\\Empresa1\\COI10EMPRE1.FDB", "es_patron_default": true }
        ]
      }
    ]
  }
}
```

---

## 8.3 Guardar conexiones por empresa

`PUT /api/empresas/:empresaId/conexiones`

**Request**

```json
{
  "conexiones": [
    {
      "sistema": "COI",
      "habilitado": true,
      "version_instalada": "COI10.00",
      "ruta_fdb": "C:\\...\\COI10EMPRE2.FDB",
      "alias_conexion": "COI - Sophia"
    },
    {
      "sistema": "SAE",
      "habilitado": true,
      "version_instalada": "SAE9.00",
      "ruta_fdb": "C:\\...\\SAE90EMPRE011.FDB"
    }
  ]
}
```

**Response**

```json
{ "ok": true }
```

---

## 8.4 Verificar conexiones por empresa

`POST /api/empresas/:empresaId/conexiones/verificar`

**Request**

```json
{ "sistemas": ["SAE", "COI", "NOI", "BANCO"] }
```

**Response**

```json
{
  "ok": true,
  "resultados": [
    { "sistema": "COI", "ok": true, "mensaje": "Conexión OK", "tablas_detectadas": 120 },
    { "sistema": "SAE", "ok": false, "mensaje": "Archivo no existe", "detalle": "No se encontró ruta..." }
  ]
}
```

---

# 9) UX del Wizard (validaciones y mensajes)

## Validaciones en tiempo real (frontend)

* Ruta base existe
* Si habilita un sistema, debe elegir versión
* Si selecciona ruta `.FDB`, debe terminar en `.FDB`
* Si habilitado y no verificado:
  * mostrar badge “No verificado”
  * bloquear sincronización hasta verificar

## Mensajes de error útiles

* “No se encontró la carpeta Datos”
* “No se encontraron carpetas EmpresaXX”
* “No se encontraron archivos .FDB”
* “Conexión rechazada: verifique la configuración integrada”
* “La base conectada no parece ser SAE (firma no coincide)”

---

# 10) “Más cosas” recomendadas (robustez y soporte)

## 10.1 Perfil de conexión (config integrada)

Aunque el usuario no ponga usuario/contraseña, tu app debe manejar un “perfil” interno:

* host (normalmente local)
* dialect/charset
* timeout
* read-only
* pool size

Se guarda en `configuracion_local.config_json` y no se expone, salvo “avanzado”.

## 10.2 Control de cambios de archivo

Guarda en `conexiones_empresa`:

* tamaño del archivo
* fecha modificado
* hash opcional (más caro)
  Si cambia, puedes mostrar:
* “La base cambió desde la última sincronización. Recomendada re-sincronización.”

## 10.3 Multi-ruta y fallback

Si el path base no existe (instalación diferente), permite:

* “Seleccionar ruta base Aspel”
  y guardarla por usuario en `configuracion_local`.

## 10.4 Permisos Windows

Si no tiene permisos en Program Files, la detección puede fallar.
Tu UI debe permitir:

* cambiar ruta base
* seleccionar FDB manualmente

---

# 11) Resultado final de configuración (lo que queda guardado)

Para la empresa “Sophia”, en SQLite quedará:

* Empresa: `Sophia`
* Conexiones:
  * SAE: habilitado, SAE9.00, ruta personalizada, verificado OK
  * COI: habilitado, COI10.00, ruta personalizada, verificado OK
  * NOI: habilitado, NOI11.00, ruta personalizada, verificado OK
  * BANCO: habilitado, BAN6.00, ruta personalizada, verificado OK

Y a partir de eso:

* Se habilitan paneles por sistema
* Se habilitan métricas del constructor
* Se habilitan jobs ETL por dataset
