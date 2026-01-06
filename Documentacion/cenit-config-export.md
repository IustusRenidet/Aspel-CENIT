{
  "app": "CENIT ASP",
  "export_version": 1,
  "generado_en": "2026-01-06T11:00:00-06:00",
  "origen": {
    "app_version": "0.1.0",
    "sistema_operativo": "Windows",
    "equipo": "DESKTOP-XYZ",
    "usuario_etiqueta": "Sophia"
  },
  "opciones": {
    "incluir_preferencias": true,
    "incluir_paneles_compartidos": false
  },
  "preferencias": {
    "tema": "oscuro",
    "densidad": "compacta",
    "idioma": "es-MX"
  },
  "paneles": [
    {
      "panel_id": "pan_01HZZZ1ABCDEF1234567890",
      "nombre": "Mi tablero",
      "visibilidad": "personal",
      "layout_json": "{...JSON del panel completo...}",
      "metadatos": {
        "etiquetas": ["ventas", "resumen"],
        "creado_en": "2026-01-06T10:00:00-06:00",
        "actualizado_en": "2026-01-06T10:10:00-06:00"
      }
    }
  ]
}



## Import (cómo se procesa)

Al importar, el backend:

1. Valida:

* `app === "CENIT ASP"`
* `export_version` soportada
* cada `layout_json` parseable y con `schema_version` soportada

2. **Regenera IDs** (recomendado por defecto):

* `panel.id`
* `widgets[].id`

3. Decide modo de importación:

* `"crear_nuevos"` (default)
* `"fusionar"` (fase 2)


### Payload para el endpoint de import

`POST /api/configuracion/importar`

<pre class="overflow-visible! px-0!" data-start="4908" data-end="5101"><div class="contain-inline-size rounded-2xl corner-superellipse/1.1 relative bg-token-sidebar-surface-primary"><div class="sticky top-[calc(--spacing(9)+var(--header-height))] @w-xl/main:top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-json"><span><span>{</span><span>
  </span><span>"modo"</span><span>:</span><span></span><span>"crear_nuevos"</span><span>,</span><span>
  </span><span>"renombrar_si_existe"</span><span>:</span><span></span><span>true</span><span></span><span>,</span><span>
  </span><span>"sufijo_importado"</span><span>:</span><span></span><span>" (importado)"</span><span>,</span><span>
  </span><span>"aplicar_preferencias"</span><span>:</span><span></span><span>true</span><span></span><span>,</span><span>
  </span><span>"contenido"</span><span>:</span><span></span><span>{</span><span></span><span>"...archivo export completo..."</span><span></span><span>}</span><span>
</span><span>}</span></span></code></div></div></pre>


# Reglas de regeneración de IDs (para cero conflictos)

## 3.1 Reglas

* Nunca reusar IDs importados directamente en DB local.
* Generar IDs nuevos y mantener un mapa interno.

Ejemplo de mapa:

<pre class="overflow-visible! px-0!" data-start="5304" data-end="5396"><div class="contain-inline-size rounded-2xl corner-superellipse/1.1 relative bg-token-sidebar-surface-primary"><div class="sticky top-[calc(--spacing(9)+var(--header-height))] @w-xl/main:top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-json"><span><span>{</span><span>
  </span><span>"paneles"</span><span>:</span><span></span><span>{</span><span></span><span>"pan_old"</span><span>:</span><span></span><span>"pan_new"</span><span></span><span>}</span><span>,</span><span>
  </span><span>"widgets"</span><span>:</span><span></span><span>{</span><span></span><span>"wid_old"</span><span>:</span><span></span><span>"wid_new"</span><span></span><span>}</span><span>
</span><span>}</span></span></code></div></div></pre>


## Formato de ID recomendado

* ULID o UUID v4
* Prefijos: `pan_`, `wid_`, `emp_`

Ejemplos:

* `pan_01HZZZ...`
* `wid_01HZZZ...`
