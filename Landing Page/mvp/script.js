/* =========================================================================
   DV SUPPLY CHAIN ANALYTICS — MVP: SUPPLY CHAIN CONTROL TOWER (DEMO)
   Vanilla JavaScript. Datos simulados (deterministas) — sin backend, sin IA real.
   Metodología adaptada de la app de forecasting de Naren Castellon (Nixtla):
   NHITS forecast -> aquí: tendencia + estacionalidad + ruido determinista.
   Fórmulas de inventario (stock de seguridad, punto de reorden, EOQ) y de
   riesgo (coeficiente de variación) replicadas 1:1 desde esa referencia.
   ========================================================================= */
(() => {
  'use strict';

  /* -----------------------------------------------------------------------
     1. GENERADOR PSEUDOALEATORIO DETERMINISTA (mismos datos en cada carga)
     ----------------------------------------------------------------------- */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeGaussian(seed) {
    const rand = mulberry32(seed);
    return () => {
      let u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
  }

  /* -----------------------------------------------------------------------
     2. PERFILES DE SKU (base para todas las secciones)
     ----------------------------------------------------------------------- */
  const SKUS = [
    { id: 'detergente', name: 'Detergente Líquido 3L',      profile: 'Estable',      baseDemand: 1200, trendPerWeek:  0.0006, volatility: 0.08, price: 6.8, leadTime: 21, currentStock: 700,  seed: 11 },
    { id: 'snack',      name: 'Snack Edición Limitada',     profile: 'Errático',     baseDemand: 450,  trendPerWeek:  0.0,    volatility: 0.35, price: 2.9, leadTime: 14, currentStock: 7000, seed: 22 },
    { id: 'bebida',     name: 'Bebida Energética 500ml',    profile: 'Creciente',    baseDemand: 900,  trendPerWeek:  0.006,  volatility: 0.15, price: 4.2, leadTime: 21, currentStock: 1950, seed: 33 },
    { id: 'papel',      name: 'Papel Higiénico Pack x12',   profile: 'Decreciente',  baseDemand: 1600, trendPerWeek: -0.004,  volatility: 0.12, price: 9.5, leadTime: 30, currentStock: 7100, seed: 44 },
  ];

  const WEEKS_HISTORY = 52;
  const WEEKS_SHOWN = 26; // ventana visible de histórico en los gráficos

  SKUS.forEach((sku) => {
    const gauss = makeGaussian(sku.seed);
    const history = [];
    for (let w = 0; w < WEEKS_HISTORY; w++) {
      const trendFactor = 1 + sku.trendPerWeek * w;
      const seasonal = 1 + 0.06 * Math.sin((2 * Math.PI * w) / 13);
      const noise = 1 + gauss() * sku.volatility;
      history.push(Math.max(10, Math.round(sku.baseDemand * trendFactor * seasonal * noise)));
    }
    sku.history = history;
  });

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr) => { const m = mean(arr); return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const findSku = (id) => SKUS.find((s) => s.id === id);

  /* -----------------------------------------------------------------------
     3. FORECAST: proyección con banda de confianza (90%, z=1.645)
     ----------------------------------------------------------------------- */
  function computeForecast(sku, horizon) {
    const lastWeek = WEEKS_HISTORY - 1;
    const recentStd = std(sku.history.slice(-13));
    const points = [];
    for (let h = 1; h <= horizon; h++) {
      const w = lastWeek + h;
      const trendFactor = 1 + sku.trendPerWeek * w;
      const seasonal = 1 + 0.06 * Math.sin((2 * Math.PI * w) / 13);
      const central = sku.baseDemand * trendFactor * seasonal;
      const band = 1.645 * recentStd * Math.sqrt(h / 4);
      points.push({ central, lo: Math.max(0, central - band), hi: central + band });
    }
    return points;
  }

  /* -----------------------------------------------------------------------
     4. GRÁFICO SVG: histórico + banda de confianza + proyección
     ----------------------------------------------------------------------- */
  function renderForecastChart(container, sku, horizon, stressMultiplier) {
    const width = 640, height = 260;
    const pad = { top: 14, right: 14, bottom: 26, left: 46 };
    const histVals = sku.history.slice(-WEEKS_SHOWN);
    let forePoints = computeForecast(sku, horizon);

    if (stressMultiplier != null) {
      // Al estresar, la banda se ensancha un poco más de lo que crece el centro,
      // para reflejar la incertidumbre adicional que introduce el shock.
      const bandStress = 1 + Math.abs(stressMultiplier - 1) * 0.5;
      forePoints = forePoints.map((p) => {
        const central = p.central * stressMultiplier;
        const halfBand = (p.hi - p.central) * bandStress;
        return { central, lo: Math.max(0, central - halfBand), hi: central + halfBand };
      });
    }

    const total = histVals.length + forePoints.length;
    const allY = histVals.concat(forePoints.map((p) => p.hi)).concat(forePoints.map((p) => p.lo));
    const yMax = Math.max(...allY) * 1.15;
    const xStep = (width - pad.left - pad.right) / (total - 1);
    const xOf = (i) => pad.left + i * xStep;
    const yOf = (v) => height - pad.bottom - (v / yMax) * (height - pad.top - pad.bottom);

    const histPts = histVals.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ');

    const foreStartIdx = histVals.length - 1;
    const foreXs = [foreStartIdx].concat(forePoints.map((_, i) => foreStartIdx + i + 1));
    const foreCentral = [histVals[histVals.length - 1]].concat(forePoints.map((p) => p.central));
    const foreHi = [histVals[histVals.length - 1]].concat(forePoints.map((p) => p.hi));
    const foreLo = [histVals[histVals.length - 1]].concat(forePoints.map((p) => p.lo));

    const forePts = foreXs.map((x, i) => `${xOf(x)},${yOf(foreCentral[i])}`).join(' ');
    const bandTop = foreXs.map((x, i) => `${xOf(x)},${yOf(foreHi[i])}`).join(' L ');
    const bandBottom = foreXs.slice().reverse().map((x, i, arr) => {
      const origIdx = foreXs.length - 1 - i;
      return `${xOf(x)},${yOf(foreLo[origIdx])}`;
    }).join(' L ');
    const bandPath = `M ${bandTop} L ${bandBottom} Z`;

    const dividerX = xOf(foreStartIdx);
    const gridY = [0.25, 0.5, 0.75].map((f) => yOf(yMax * f));

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${gridY.map((y) => `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="mvp-chart-grid"></line>`).join('')}
        <text x="${pad.left - 8}" y="${yOf(yMax)}" class="mvp-chart-label" text-anchor="end">${fmt(yMax)}</text>
        <text x="${pad.left - 8}" y="${height - pad.bottom}" class="mvp-chart-label" text-anchor="end">0</text>
        <line x1="${dividerX}" y1="${pad.top}" x2="${dividerX}" y2="${height - pad.bottom}" class="mvp-chart-divider"></line>
        <text x="${dividerX}" y="${pad.top - 2}" class="mvp-chart-label" text-anchor="middle">Hoy</text>
        <path d="${bandPath}" class="mvp-chart-band"></path>
        <polyline points="${histPts}" class="mvp-chart-hist"></polyline>
        <polyline points="${forePts}" class="mvp-chart-forecast"></polyline>
      </svg>
    `;
  }

  /* -----------------------------------------------------------------------
     5. SECCIÓN FORECAST — estado + render
     ----------------------------------------------------------------------- */
  const forecastState = { skuId: SKUS[0].id, horizon: 12 };

  function renderForecastSection() {
    const sku = findSku(forecastState.skuId);
    const horizon = forecastState.horizon;
    const forePoints = computeForecast(sku, horizon);
    const chartEl = document.getElementById('forecastChart');
    if (chartEl) renderForecastChart(chartEl, sku, horizon, null);

    const totalVol = forePoints.reduce((a, p) => a + p.central, 0);
    const lastActual = sku.history.slice(-horizon);
    const lastVol = lastActual.reduce((a, b) => a + b, 0);
    const netChange = totalVol - lastVol;
    const growthPct = ((mean(forePoints.map((p) => p.central)) / mean(lastActual)) - 1) * 100;

    document.getElementById('forecastKpiVolume').textContent = `${fmt(totalVol)} u`;
    document.getElementById('forecastKpiImpact').textContent = `${netChange >= 0 ? '+' : ''}${fmt(netChange)} u`;
    document.getElementById('forecastKpiGrowth').textContent = `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%`;
    document.getElementById('forecastKpiConfidence').textContent = '90%';

    const rec = document.getElementById('forecastRecommendation');
    rec.classList.remove('mvp-callout--success', 'mvp-callout--warning', 'mvp-callout--info');
    if (growthPct > 7) {
      rec.classList.add('mvp-callout--success');
      rec.innerHTML = `<strong>Alerta de crecimiento (+${growthPct.toFixed(1)}%).</strong> Aumentar stock de seguridad ~15% y priorizar este SKU en el próximo ciclo de compras.`;
    } else if (growthPct < -7) {
      rec.classList.add('mvp-callout--warning');
      rec.innerHTML = `<strong>Alerta de contracción (${growthPct.toFixed(1)}%).</strong> Reducir órdenes de reabastecimiento para evitar capital inmovilizado.`;
    } else {
      rec.classList.add('mvp-callout--info');
      rec.innerHTML = `<strong>Demanda estable.</strong> Mantener el plan de abastecimiento actual y optimizar frecuencia de entrega.`;
    }
  }

  /* -----------------------------------------------------------------------
     6. SECCIÓN INVENTARIO + CAPITAL — comparten el mismo estado
     ----------------------------------------------------------------------- */
  const inventoryState = { leadTimeMultiplier: 1.0 };

  function computeInventoryRows() {
    return SKUS.map((sku) => {
      const recentHist = sku.history.slice(-13);
      const demandMean = mean(recentHist);
      const demandStd = std(recentHist);
      const leadTime = sku.leadTime * inventoryState.leadTimeMultiplier;

      const safetyStock = 1.65 * demandStd * Math.sqrt(leadTime / 7);
      const reorderPoint = demandMean * (leadTime / 7) + safetyStock;
      const eoq = Math.sqrt((2 * (demandMean * 52) * 100) / (sku.price * 0.20));
      const healthIdx = sku.currentStock / (reorderPoint || 1);
      const valorTotal = sku.currentStock * sku.price;
      // Días de cobertura: Stock Actual / Venta Promedio Diaria (demandMean es semanal).
      const diasCobertura = sku.currentStock / (demandMean / 7 || 1);
      // Costo de oportunidad: valor del faltante frente al punto de reorden, si está en riesgo de quiebre.
      const opportunityCost = Math.max(0, reorderPoint - sku.currentStock) * sku.price;

      let status, action, statusClass;
      if (healthIdx < 1.0) { status = 'Riesgo de Quiebre'; action = `PEDIR ${fmt(eoq)} u.`; statusClass = 'risk'; }
      else if (healthIdx > 2.5) { status = 'Exceso (Capital Atrapado)'; action = 'FRENAR COMPRAS'; statusClass = 'excess'; }
      else { status = 'Óptimo (Saludable)'; action = 'MANTENER'; statusClass = 'ok'; }

      return { sku, demandMean, safetyStock, reorderPoint, eoq, healthIdx, valorTotal, diasCobertura, opportunityCost, status, action, statusClass, leadTime };
    });
  }

  function renderInventorySection() {
    const rows = computeInventoryRows();
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = rows.map((r) => {
      const barPct = Math.min(100, (r.sku.currentStock / (r.reorderPoint * 1.6 || 1)) * 100);
      return `
        <tr class="mvp-row--${r.statusClass}">
          <td>${r.sku.name}</td>
          <td>${fmt(r.demandMean)} u/sem</td>
          <td>${fmt(r.sku.currentStock)} u</td>
          <td>${r.diasCobertura.toFixed(0)} días</td>
          <td>${fmt(r.reorderPoint)} u</td>
          <td>${fmt(r.eoq)} u</td>
          <td>
            <div class="mvp-bar-track"><div class="mvp-bar-fill mvp-bar-fill--${r.statusClass}" style="width:${barPct.toFixed(0)}%"></div></div>
          </td>
          <td><span class="mvp-badge mvp-badge--${r.statusClass}">${r.status}</span></td>
          <td>${r.action}</td>
        </tr>
      `;
    }).join('');

    const nRisk = rows.filter((r) => r.statusClass === 'risk').length;
    const nExcess = rows.filter((r) => r.statusClass === 'excess').length;
    const avgLead = mean(rows.map((r) => r.leadTime));
    document.getElementById('inventoryInsights').innerHTML = `
      <div class="mvp-insight mvp-insight--${nRisk > 0 ? 'warning' : 'success'}">
        ${nRisk > 0
          ? `<strong>${nRisk} SKU(s) en riesgo de quiebre.</strong> Ejecutar los pedidos EOQ sugeridos antes de agotar los días de cobertura restantes.`
          : '<strong>Nivel de servicio seguro.</strong> No hay riesgo de quiebre inmediato.'}
      </div>
      <div class="mvp-insight mvp-insight--${nExcess > 0 ? 'warning' : 'info'}">
        ${nExcess > 0
          ? `<strong>${nExcess} SKU(s) con capital atrapado.</strong> Suspender compras y evaluar promociones para liberar capital.`
          : '<strong>Inventario balanceado.</strong> No se detecta capital ocioso significativo.'}
      </div>
      <div class="mvp-insight mvp-insight--info">
        <strong>Lead time promedio: ${avgLead.toFixed(1)} días.</strong> Los SKUs más volátiles requieren mayor stock de seguridad.
      </div>
    `;

    renderCapitalSection(rows);
  }

  /* -----------------------------------------------------------------------
     7. SECCIÓN CAPITAL — donut + KPIs (derivados del inventario)
     ----------------------------------------------------------------------- */
  function renderCapitalDonut(container, segments) {
    const size = 180, r = 62, cx = size / 2, cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const total = segments.reduce((a, s) => a + s.value, 0) || 1;
    let offset = 0;
    const circles = segments.map((s) => {
      const len = (s.value / total) * circumference;
      const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="26"
        stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}"></circle>`;
      offset += len;
      return circle;
    }).join('');

    container.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}">
        <g transform="rotate(-90 ${cx} ${cy})">${circles}</g>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="mvp-donut-total">$${fmt(total / 1000)}K</text>
        <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="mvp-donut-label">Valor total</text>
      </svg>
    `;
  }

  function renderCapitalSection(rows) {
    const byStatus = { risk: 0, ok: 0, excess: 0 };
    rows.forEach((r) => { byStatus[r.statusClass] += r.valorTotal; });
    const total = byStatus.risk + byStatus.ok + byStatus.excess;

    const donutEl = document.getElementById('capitalDonut');
    if (donutEl) {
      renderCapitalDonut(donutEl, [
        { value: byStatus.risk, color: '#D64545' },
        { value: byStatus.ok, color: '#00B894' },
        { value: byStatus.excess, color: '#F0B94D' },
      ]);
    }

    const opportunityCost = rows.reduce((a, r) => a + r.opportunityCost, 0);

    document.getElementById('capitalTotal').textContent = `$${fmt(total)}`;
    document.getElementById('capitalFrozen').textContent = `$${fmt(byStatus.excess)}`;
    document.getElementById('capitalFrozenPct').textContent = `(${((byStatus.excess / total) * 100 || 0).toFixed(0)}% del valor total del inventario)`;
    document.getElementById('capitalOpportunityCost').textContent = `$${fmt(opportunityCost)}`;
    document.getElementById('capitalOpportunityCostPct').textContent = `(${((opportunityCost / total) * 100 || 0).toFixed(0)}% del valor total del inventario)`;
  }

  /* -----------------------------------------------------------------------
     8. SECCIÓN GESTIÓN DE RIESGOS — stress test + coeficiente de variación
     ----------------------------------------------------------------------- */
  const riskState = { skuId: SKUS[1].id, shockPromo: 1.0, shockClima: 1.0 };

  function renderRiskSection() {
    const sku = findSku(riskState.skuId);
    const multiplier = (riskState.shockPromo + riskState.shockClima) / 2;
    const horizon = 12;

    const chartEl = document.getElementById('riskChart');
    if (chartEl) renderForecastChart(chartEl, sku, horizon, multiplier);

    const basePoints = computeForecast(sku, horizon);
    const baseMean = mean(basePoints.map((p) => p.central));
    const stressedMean = baseMean * multiplier;
    const variation = ((stressedMean / baseMean) - 1) * 100;

    // Clasificación por Coeficiente de Variación al cuadrado (CV²), el mismo eje de
    // variabilidad que usa la matriz ADI/CV² (Syntetos & Boylan) para segmentar demanda.
    const recentHist = sku.history.slice(-26);
    const cvSquared = (std(recentHist) / mean(recentHist)) ** 2;
    let riskLabel, riskClass;
    if (cvSquared < 0.09) { riskLabel = 'BAJO (Demanda Regular)'; riskClass = 'ok'; }
    else if (cvSquared < 0.36) { riskLabel = 'MEDIO (Demanda Errática)'; riskClass = 'excess'; }
    else { riskLabel = 'ALTO (Demanda Caótica)'; riskClass = 'risk'; }

    document.getElementById('riskBadge').textContent = riskLabel;
    document.getElementById('riskBadge').className = `mvp-badge mvp-badge--${riskClass}`;
    document.getElementById('riskVariation').textContent = `${variation >= 0 ? '+' : ''}${variation.toFixed(1)}%`;

    const mitigation = document.getElementById('riskMitigation');
    mitigation.classList.remove('mvp-callout--success', 'mvp-callout--warning', 'mvp-callout--info');
    if (variation > 15) {
      mitigation.classList.add('mvp-callout--warning');
      mitigation.innerHTML = `<strong>Alerta de abastecimiento.</strong> El escenario proyecta un alza crítica. Aumentar el cupo con proveedores en ~${(variation * 0.8).toFixed(0)}%.`;
    } else if (variation < -15) {
      mitigation.classList.add('mvp-callout--warning');
      mitigation.innerHTML = `<strong>Riesgo de sobre-stock.</strong> El escenario sugiere una caída fuerte. Reducir la frecuencia de pedidos para evitar mermas.`;
    } else {
      mitigation.classList.add('mvp-callout--success');
      mitigation.innerHTML = `<strong>Operación estable.</strong> Los shocks aplicados no desestabilizan drásticamente la operación actual.`;
    }
  }

  /* -----------------------------------------------------------------------
     9. CONTROLES: poblar selects, listeners
     ----------------------------------------------------------------------- */
  function populateSkuSelect(selectEl, selectedId) {
    selectEl.innerHTML = SKUS.map((s) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${s.name} (${s.profile} · ${fmt(s.baseDemand)} u/sem)</option>`).join('');
  }

  const forecastSkuSelect = document.getElementById('forecastSkuSelect');
  populateSkuSelect(forecastSkuSelect, forecastState.skuId);
  forecastSkuSelect.addEventListener('change', (e) => { forecastState.skuId = e.target.value; renderForecastSection(); });

  document.querySelectorAll('.mvp-horizon-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mvp-horizon-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      forecastState.horizon = parseInt(btn.dataset.horizon, 10);
      renderForecastSection();
    });
  });

  const leadTimeSlider = document.getElementById('leadTimeSlider');
  leadTimeSlider.addEventListener('input', (e) => {
    inventoryState.leadTimeMultiplier = parseFloat(e.target.value);
    document.getElementById('leadTimeValue').textContent = `${(inventoryState.leadTimeMultiplier * 100).toFixed(0)}%`;
    renderInventorySection();
  });

  const riskSkuSelect = document.getElementById('riskSkuSelect');
  populateSkuSelect(riskSkuSelect, riskState.skuId);
  riskSkuSelect.addEventListener('change', (e) => { riskState.skuId = e.target.value; renderRiskSection(); });

  ['riskShockPromo', 'riskShockClima'].forEach((id) => {
    const slider = document.getElementById(id);
    const label = document.getElementById(`${id}Value`);
    slider.addEventListener('input', (e) => {
      riskState[id === 'riskShockPromo' ? 'shockPromo' : 'shockClima'] = parseFloat(e.target.value);
      label.textContent = `${parseFloat(e.target.value).toFixed(2)}x`;
      renderRiskSection();
    });
  });

  /* -----------------------------------------------------------------------
     10. RENDER INICIAL
     ----------------------------------------------------------------------- */
  renderForecastSection();
  renderInventorySection();
  renderRiskSection();

  /* -----------------------------------------------------------------------
     11. NAVBAR, SCROLL REVEAL Y MODAL DE ACCESO ANTICIPADO
     ----------------------------------------------------------------------- */
  const navbar = document.getElementById('navbar');
  if (navbar) {
    const updateNavbarStyle = () => navbar.classList.toggle('is-scrolled', window.scrollY > 12);
    updateNavbarStyle();
    window.addEventListener('scroll', updateNavbarStyle, { passive: true });
  }

  const navToggle = document.getElementById('navToggle');
  const primaryNav = document.getElementById('primaryNav');
  if (navToggle && primaryNav) {
    const closeMobileMenu = () => {
      primaryNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Abrir menú de navegación');
    };

    navToggle.addEventListener('click', () => {
      const isOpen = primaryNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
    });

    primaryNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMobileMenu));
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  const modalOverlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('accessModal');
  const modalClose = document.getElementById('modalClose');
  const modalBody = document.getElementById('modalBody');
  const successPanel = document.getElementById('formSuccess');
  const accessForm = document.getElementById('accessForm');
  let lastFocusedEl = null;

  const openModal = (e) => {
    if (e) e.preventDefault();
    lastFocusedEl = document.activeElement;
    modalOverlay.hidden = false;
    void modalOverlay.offsetWidth;
    modalOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const firstField = document.getElementById('accessEmail');
    if (firstField) firstField.focus();
    document.addEventListener('keydown', handleModalKeydown);
  };

  const closeModal = () => {
    modalOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleModalKeydown);
    setTimeout(() => { modalOverlay.hidden = true; }, 250);
    if (lastFocusedEl) lastFocusedEl.focus();
    accessForm.reset();
    modalBody.hidden = false;
    successPanel.hidden = true;
    accessSubmitBtn.disabled = false;
    accessSubmitBtn.textContent = accessSubmitBtnDefaultText;
  };

  const getFocusableEls = () => modal.querySelectorAll('a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])');
  const trapFocus = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(getFocusableEls());
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const handleModalKeydown = (e) => { if (e.key === 'Escape') closeModal(); trapFocus(e); };

  document.querySelectorAll('.js-open-modal').forEach((trigger) => trigger.addEventListener('click', openModal));
  modalClose.addEventListener('click', closeModal);
  document.getElementById('successClose').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  const accessSubmitBtn = accessForm.querySelector('button[type="submit"]');
  const accessSubmitBtnDefaultText = accessSubmitBtn.textContent;

  accessForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('accessEmail');
    const emailError = document.getElementById('accessEmailError');
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    emailError.textContent = isValidEmail ? '' : 'Ingresa un email corporativo válido.';
    email.closest('.form__group').classList.toggle('has-error', !isValidEmail);
    if (!isValidEmail) { email.focus(); return; }

    accessSubmitBtn.disabled = true;
    accessSubmitBtn.textContent = 'Enviando...';

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(accessForm))),
      });
      const result = await response.json();

      if (!result.success) throw new Error(result.message || 'Envío rechazado');

      modalBody.hidden = true;
      successPanel.hidden = false;
      successPanel.querySelector('.btn').focus();
    } catch (error) {
      accessSubmitBtn.disabled = false;
      accessSubmitBtn.textContent = accessSubmitBtnDefaultText;
      window.alert('No se pudo enviar tu solicitud. Intenta de nuevo o escríbenos a info@dvsupplychain.com.');
    }
  });

  document.getElementById('year').textContent = new Date().getFullYear();
})();
