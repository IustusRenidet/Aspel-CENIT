#!/usr/bin/env node
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod/v4');

const InteligenciaAspel = require('../servicios/inteligencia_aspel');
const EjecutorMetricas = require('../servicios/ejecutor_metricas');

const SISTEMAS = ['SAE', 'COI', 'NOI', 'BANCO'];

const inteligencia = new InteligenciaAspel();
const ejecutor = new EjecutorMetricas();

function formatoJSON(datos) {
  return JSON.stringify(datos, null, 2);
}

function errorTool(mensaje) {
  return {
    isError: true,
    content: [{ type: 'text', text: mensaje }]
  };
}

function contenidoTool(datos) {
  return {
    content: [{ type: 'text', text: formatoJSON(datos) }]
  };
}

const server = new McpServer({
  name: 'aspel-cenit-mcp-inteligente',
  version: '1.0.0'
});

server.registerTool(
  'list_systems',
  {
    description: 'Lista los sistemas Aspel disponibles y su cobertura de metricas/tablas.',
    inputSchema: {
      include_stats: z.boolean().optional()
    }
  },
  async () => {
    try {
      const sistemas = await inteligencia.obtenerSistemas();
      return contenidoTool({ sistemas });
    } catch (error) {
      return errorTool(`Error listando sistemas: ${error.message}`);
    }
  }
);

server.registerTool(
  'search_metrics',
  {
    description: 'Busca metricas por texto libre, categoria, tipo y sistema.',
    inputSchema: {
      query: z.string().optional(),
      objective: z.string().optional(),
      systems: z.array(z.enum(SISTEMAS)).optional(),
      category: z.string().optional(),
      type: z.enum(['escalar', 'serie', 'tabla']).optional(),
      limit: z.number().int().min(1).max(100).optional()
    }
  },
  async ({ query, objective, systems, category, type, limit }) => {
    try {
      const objetivo = objective || query || '';

      if (objetivo) {
        const resultado = await inteligencia.buscarMetricasInteligentes({
          objetivo,
          sistemas: systems,
          categoria: category,
          tipo: type,
          limite: limit || 12
        });

        return contenidoTool(resultado);
      }

      const metricas = await inteligencia.listarMetricas({
        sistema: Array.isArray(systems) && systems.length === 1 ? systems[0] : null,
        categoria: category,
        tipo: type,
        limite: limit || 100
      });

      const metricasFiltradas = Array.isArray(systems) && systems.length > 1
        ? metricas.filter((metrica) => systems.includes(metrica.sistema))
        : metricas;

      return contenidoTool({ total: metricasFiltradas.length, metricas: metricasFiltradas });
    } catch (error) {
      return errorTool(`Error buscando metricas: ${error.message}`);
    }
  }
);

server.registerTool(
  'get_metric_definition',
  {
    description: 'Obtiene la definicion de una metrica por ID.',
    inputSchema: {
      metric_id: z.string(),
      system: z.enum(SISTEMAS).optional()
    }
  },
  async ({ metric_id, system }) => {
    try {
      const metrica = await inteligencia.obtenerMetrica(metric_id, system || null);

      if (!metrica) {
        return errorTool(`Metrica no encontrada: ${metric_id}`);
      }

      return contenidoTool({ metrica });
    } catch (error) {
      return errorTool(`Error obteniendo metrica: ${error.message}`);
    }
  }
);

server.registerTool(
  'run_metric',
  {
    description: 'Ejecuta una metrica con parametros. Modo auto intenta Firebird y cae a demo.',
    inputSchema: {
      metric_id: z.string(),
      system: z.enum(SISTEMAS).optional(),
      mode: z.enum(['auto', 'real', 'demo']).optional(),
      parameters: z.record(z.any()).optional()
    }
  },
  async ({ metric_id, system, mode, parameters }) => {
    try {
      const resultado = await ejecutor.ejecutarMetrica({
        metricaId: metric_id,
        sistema: system || null,
        parametros: parameters || {},
        modo: mode || 'auto'
      });

      return contenidoTool({ resultado });
    } catch (error) {
      return errorTool(`Error ejecutando metrica: ${error.message}`);
    }
  }
);

server.registerTool(
  'suggest_dashboard',
  {
    description: 'Genera un dashboard inteligente para un objetivo de negocio.',
    inputSchema: {
      objective: z.string(),
      systems: z.array(z.enum(SISTEMAS)).optional(),
      max_widgets: z.number().int().min(3).max(20).optional()
    }
  },
  async ({ objective, systems, max_widgets }) => {
    try {
      const dashboard = await inteligencia.sugerirDashboard({
        objetivo: objective,
        sistemas: systems || null,
        maxWidgets: max_widgets || 8
      });

      return contenidoTool({ dashboard });
    } catch (error) {
      return errorTool(`Error sugiriendo dashboard: ${error.message}`);
    }
  }
);

server.registerTool(
  'list_tables',
  {
    description: 'Lista tablas del diccionario semantico por sistema.',
    inputSchema: {
      system: z.enum(SISTEMAS),
      text: z.string().optional(),
      module: z.string().optional(),
      limit: z.number().int().min(1).max(2000).optional()
    }
  },
  async ({ system, text, module, limit }) => {
    try {
      const tablas = await inteligencia.listarTablas({
        sistema: system,
        texto: text || '',
        modulo: module || '',
        limite: limit || 200
      });

      return contenidoTool({ total: tablas.length, tablas });
    } catch (error) {
      return errorTool(`Error listando tablas: ${error.message}`);
    }
  }
);

server.registerTool(
  'describe_table',
  {
    description: 'Describe estructura, campos y relaciones de una tabla Aspel.',
    inputSchema: {
      system: z.enum(SISTEMAS),
      table: z.string()
    }
  },
  async ({ system, table }) => {
    try {
      const tabla = await inteligencia.describirTabla(system, table);

      if (!tabla) {
        return errorTool(`Tabla no encontrada: ${table} en ${system}`);
      }

      return contenidoTool({ tabla });
    } catch (error) {
      return errorTool(`Error describiendo tabla: ${error.message}`);
    }
  }
);

server.registerTool(
  'reload_context',
  {
    description: 'Recarga cache de metricas, catalogo y semantica.'
  },
  async () => {
    try {
      await inteligencia.recargar();
      return contenidoTool({ ok: true, message: 'Contexto recargado' });
    } catch (error) {
      return errorTool(`Error recargando contexto: ${error.message}`);
    }
  }
);

server.registerResource(
  'aspel-sistemas',
  'aspel://sistemas',
  {
    title: 'Resumen de sistemas Aspel',
    description: 'Sistemas, volumen de metricas y tablas',
    mimeType: 'application/json'
  },
  async () => {
    const sistemas = await inteligencia.obtenerSistemas();
    return {
      contents: [
        {
          uri: 'aspel://sistemas',
          mimeType: 'application/json',
          text: formatoJSON({ sistemas })
        }
      ]
    };
  }
);

for (const sistema of SISTEMAS) {
  const uriMetricas = `aspel://metricas/${sistema.toLowerCase()}`;
  const uriTablas = `aspel://tablas/${sistema.toLowerCase()}`;

  server.registerResource(
    `aspel-metricas-${sistema.toLowerCase()}`,
    uriMetricas,
    {
      title: `Metricas de ${sistema}`,
      description: `Catalogo de metricas para ${sistema}`,
      mimeType: 'application/json'
    },
    async () => {
      const metricas = await inteligencia.listarMetricas({
        sistema,
        limite: 1000
      });

      return {
        contents: [
          {
            uri: uriMetricas,
            mimeType: 'application/json',
            text: formatoJSON({ sistema, total: metricas.length, metricas })
          }
        ]
      };
    }
  );

  server.registerResource(
    `aspel-tablas-${sistema.toLowerCase()}`,
    uriTablas,
    {
      title: `Tablas de ${sistema}`,
      description: `Diccionario de tablas para ${sistema}`,
      mimeType: 'application/json'
    },
    async () => {
      const tablas = await inteligencia.listarTablas({
        sistema,
        limite: 1000
      });

      return {
        contents: [
          {
            uri: uriTablas,
            mimeType: 'application/json',
            text: formatoJSON({ sistema, total: tablas.length, tablas })
          }
        ]
      };
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Aspel CENIT MCP listo en stdio');
}

main().catch((error) => {
  console.error(`Error inicializando MCP: ${error.message}`);
  process.exit(1);
});
