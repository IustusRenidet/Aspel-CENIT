(() => {
  const { Chart, TomSelect, dayjs } = window.Libraries;
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const loginForm = document.getElementById('login-form');
  const loginAlert = document.getElementById('login-alert');
  const loginButton = document.getElementById('login-button');
  const companySelectEl = document.getElementById('company-select');
  const userNameEl = document.getElementById('user-name');
  const userEmailEl = document.getElementById('user-email');
  const userRolesEl = document.getElementById('user-roles');
  const configPathButton = document.getElementById('config-path-button');
  const downloadPdfButton = document.getElementById('download-pdf');

  const saeVentasEl = document.getElementById('sae-ventas');
  const saeComprasEl = document.getElementById('sae-compras');
  const saeClientesEl = document.getElementById('sae-clientes');
  const saePedidosEl = document.getElementById('sae-pedidos');
  const saeVentasInfoEl = document.getElementById('sae-ventas-info');
  const saeComprasInfoEl = document.getElementById('sae-compras-info');
  const saeChartCaptionEl = document.getElementById('sae-chart-caption');
  const saeSummaryTable = document.getElementById('sae-summary-table');
  const saeDataSourceEl = document.getElementById('sae-data-source');
  const saeChartCanvas = document.getElementById('sae-chart');

  const state = {
    user: null,
    companies: [],
    selectedCompanyId: null,
    saeChart: null
  };

  let companySelect;

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value || 0);
  }

  function showLoginError(message) {
    loginAlert.textContent = message;
    loginAlert.classList.add('show');
  }

  function clearLoginError() {
    loginAlert.classList.remove('show');
    loginAlert.textContent = '';
  }

  async function performLogin(event) {
    event.preventDefault();
    clearLoginError();

    loginButton.disabled = true;
    loginButton.innerText = 'Verificando...';

    const correo = document.getElementById('email').value;
    const contraseña = document.getElementById('password').value;

    try {
      const response = await window.AppBridge.fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ correo, contraseña })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || 'No fue posible iniciar sesión');
      }

      state.user = payload.user;
      state.companies = payload.companies || [];
      state.selectedCompanyId =
        payload.selectedCompanyId || (state.companies[0] ? state.companies[0]._id : null);

      renderDashboard();
      await refreshSaeDashboard();
    } catch (error) {
      showLoginError(error.message);
    } finally {
      loginButton.disabled = false;
      loginButton.innerText = 'Iniciar sesión';
    }
  }

  function renderDashboard() {
    loginView.classList.add('d-none');
    dashboardView.classList.remove('d-none');

    userNameEl.textContent = state.user?.nombre || 'Usuario';
    userEmailEl.textContent = state.user?.correo || '';
    userRolesEl.innerHTML = '';

    (state.user?.roles || []).forEach((role) => {
      const badge = document.createElement('span');
      badge.className = 'badge-role';
      badge.textContent = role;
      userRolesEl.appendChild(badge);
    });

    initialiseCompanySelect();
  }

  function initialiseCompanySelect() {
    if (companySelect) {
      companySelect.destroy();
      companySelectEl.innerHTML = '';
    }

    state.companies.forEach((company) => {
      const option = document.createElement('option');
      option.value = company._id;
      option.textContent = `${company.nombre} (${company.clave || 'SN'})`;
      companySelectEl.appendChild(option);
    });

    companySelect = new TomSelect(companySelectEl, {
      create: false,
      allowEmptyOption: true,
      placeholder: 'Selecciona la empresa',
      plugins: ['dropdown_input']
    });

    if (state.selectedCompanyId) {
      companySelect.setValue(state.selectedCompanyId, true);
    }

    companySelect.on('change', async (value) => {
      if (!value) {
        return;
      }

      try {
        await window.AppBridge.fetch('/api/config/company', {
          method: 'POST',
          body: JSON.stringify({ companyId: value })
        });
        state.selectedCompanyId = value;
        await refreshSaeDashboard();
      } catch (error) {
        console.error('No fue posible actualizar la empresa predeterminada', error);
      }
    });
  }

  async function refreshSaeDashboard() {
    if (!state.selectedCompanyId) {
      saeChartCaptionEl.textContent = 'Selecciona una empresa para visualizar los datos.';
      return;
    }

    try {
      const response = await window.AppBridge.fetch(
        `/api/dashboard/sae/summary?companyId=${state.selectedCompanyId}`
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || 'No fue posible obtener los datos de SAE.');
      }

      updateSaeOverview(payload);
    } catch (error) {
      saeChartCaptionEl.textContent = error.message;
      console.error(error);
    }
  }

  function updateSaeOverview({ company, overview }) {
    const formattedVentas = formatCurrency(overview.resumen.ventasMesActual);
    const formattedCompras = formatCurrency(overview.resumen.comprasMesActual);

    saeVentasEl.textContent = formattedVentas;
    saeComprasEl.textContent = formattedCompras;
    saeClientesEl.textContent = overview.resumen.clientesActivos;
    saePedidosEl.textContent = overview.resumen.pedidosPendientes;

    saeVentasInfoEl.textContent = `Actualizado ${dayjs(overview.generatedAt).format('DD MMM YYYY')}`;
    saeComprasInfoEl.textContent = `Último registro ${dayjs().format('DD MMM YYYY HH:mm')}`;
    saeChartCaptionEl.textContent = `Serie histórica mensual para ${company.nombre}`;

    saeSummaryTable.innerHTML = '';
    Object.entries(overview.resumen).forEach(([key, value]) => {
      const row = document.createElement('tr');
      const readableKey = key.replace(/([A-Z])/g, ' $1');
      const formattedValue =
        typeof value === 'number'
          ? key.toLowerCase().includes('venta') || key.toLowerCase().includes('compra')
            ? formatCurrency(value)
            : value.toLocaleString('es-MX')
          : value;
      row.innerHTML = `
        <td class="text-uppercase text-secondary small">${readableKey}</td>
        <td class="text-end">${formattedValue}</td>
      `;
      saeSummaryTable.appendChild(row);
    });

    saeDataSourceEl.textContent = `Fuente de datos: ${overview.source.toUpperCase()} | Ruta Firebird: ${
      company.rutaFirebird
    }`;

    renderSaeChart(overview.series);
  }

  function renderSaeChart(series) {
    const datasetConfig = {
      labels: series.labels,
      datasets: [
        {
          label: 'Ventas',
          data: series.ventas,
          borderColor: '#6c5ce7',
          backgroundColor: 'rgba(108, 92, 231, 0.3)',
          tension: 0.35,
          fill: true
        },
        {
          label: 'Compras',
          data: series.compras,
          borderColor: '#1dd1a1',
          backgroundColor: 'rgba(29, 209, 161, 0.25)',
          tension: 0.35,
          fill: true
        }
      ]
    };

    if (state.saeChart) {
      state.saeChart.data = datasetConfig;
      state.saeChart.update();
      return;
    }

    state.saeChart = new Chart(saeChartCanvas, {
      type: 'line',
      data: datasetConfig,
      options: {
        plugins: {
          legend: {
            labels: {
              color: '#f8f9fa'
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#ced4da'
            },
            grid: {
              color: 'rgba(255,255,255,0.05)'
            }
          },
          y: {
            ticks: {
              color: '#ced4da',
              callback: (value) => formatCurrency(value)
            },
            grid: {
              color: 'rgba(255,255,255,0.05)'
            }
          }
        }
      }
    });
  }

  async function downloadSaePdf() {
    if (!state.selectedCompanyId) {
      return;
    }

    try {
      const response = await window.AppBridge.fetch(
        `/api/reports/sae?companyId=${state.selectedCompanyId}`,
        {
          method: 'GET'
        }
      );

      if (!response.ok) {
        throw new Error('No fue posible generar el PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reporte-sae-${dayjs().format('YYYYMMDD-HHmm')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Ocurrió un error al generar el PDF.');
    }
  }

  async function showConfigPath() {
    try {
      const path = await window.AppBridge.getConfigPath();
      alert(`Archivo de configuración: ${path}`);
    } catch (error) {
      console.error(error);
    }
  }

  loginForm.addEventListener('submit', performLogin);
  downloadPdfButton.addEventListener('click', downloadSaePdf);
  configPathButton.addEventListener('click', showConfigPath);
})();
