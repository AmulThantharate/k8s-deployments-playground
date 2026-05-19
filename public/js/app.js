// --- GLOBAL STATE ---
const state = {
  activeTab: 'dashboard-tab',
  simMode: false,
  simulatorRunning: false,
  simulatorTimer: null,
  rps: 5,
  endpoint: '/ab-test',

  // Real-time Traffic Telemetry Counters
  telemetry: {
    totalRequests: 0,
    successRequests: 0,
    errorRequests: 0,
    totalLatency: 0,

    // Distributions
    colors: {}, // e.g. { blue: 45, green: 22 }
    pods: {},   // e.g. { 'colordeploy-blue-xxx': 40 }

    // Latency History (sliding window of last 30 requests)
    history: []
  },

  // Chart references
  charts: {
    color: null,
    pod: null,
    latency: null
  }
};

// --- DOM ELEMENTS ---
const elements = {
  navBtns: document.querySelectorAll('.nav-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),

  // Sidebar info
  simModeToggle: document.getElementById('simModeToggle'),
  redisPulse: document.getElementById('redisPulse'),
  redisStatusText: document.getElementById('redisStatusText'),

  // Top bar info
  pillActiveColor: document.getElementById('pillActiveColor'),
  valDeployColor: document.getElementById('valDeployColor'),
  valVersion: document.getElementById('valVersion'),
  valPodName: document.getElementById('valPodName'),

  // Dashboard cards
  colorMetricCard: document.getElementById('colorMetricCard'),
  dashColor: document.getElementById('dashColor'),
  dashColorDesc: document.getElementById('dashColorDesc'),
  dashVersion: document.getElementById('dashVersion'),
  dashPod: document.getElementById('dashPod'),
  dashHealth: document.getElementById('dashHealth'),
  dashUptime: document.getElementById('dashUptime'),
  dashRedis: document.getElementById('dashRedis'),
  dashRedisVer: document.getElementById('dashRedisVer'),

  // Dashboard quick stats
  dashTotalReq: document.getElementById('dashTotalReq'),
  dashAvgLatency: document.getElementById('dashAvgLatency'),
  dashErrorRate: document.getElementById('dashErrorRate'),
  dashCounterVal: document.getElementById('dashCounterVal'),
  btnResetCounter: document.getElementById('btnResetCounter'),

  // Simulator tab
  rpsSlider: document.getElementById('rpsSlider'),
  rpsVal: document.getElementById('rpsVal'),
  endpointSelect: document.getElementById('endpointSelect'),
  mockConfigPanel: document.getElementById('mockConfigPanel'),
  mockStrategySelect: document.getElementById('mockStrategySelect'),
  btnToggleSimulator: document.getElementById('btnToggleSimulator'),
  btnClearStats: document.getElementById('btnClearStats'),
  simulatorPulse: document.getElementById('simulatorPulse'),
  simulatorStatusText: document.getElementById('simulatorStatusText'),
  statsReqCount: document.getElementById('statsReqCount'),
  statsSuccessRate: document.getElementById('statsSuccessRate'),

  // Log Console
  logConsole: document.getElementById('logConsole'),
  btnClearLog: document.getElementById('btnClearLog'),

  // Guide tabs
  guideTabBtns: document.querySelectorAll('.guide-tab-btn'),
  guideContents: document.querySelectorAll('.guide-content')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupEventListeners();
  initCharts();

  // Load initial backend telemetry
  pollSystemInfo();
  setInterval(pollSystemInfo, 5000);
});

// --- NAVIGATION & TABS ---
function setupNavigation() {
  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      // Update sidebar buttons
      elements.navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update tab panels
      elements.tabPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === tabId) {
          panel.classList.add('active');
        }
      });

      state.activeTab = tabId;
      updateHeaderTitles(tabId);
    });
  });

  // K8s Guide Sub-Tabs
  elements.guideTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const guideId = btn.getAttribute('data-guide');

      elements.guideTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      elements.guideContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === guideId) {
          content.classList.add('active');
        }
      });
    });
  });
}

function updateHeaderTitles(tabId) {
  if (tabId === 'dashboard-tab') {
    elements.pageTitle.textContent = 'Cluster Telemetry';
    elements.pageSubtitle.textContent = 'Real-time container performance analytics';
  } else if (tabId === 'simulator-tab') {
    elements.pageTitle.textContent = 'Traffic Simulator';
    elements.pageSubtitle.textContent = 'Load test deployment configurations in real-time';
  } else if (tabId === 'playground-tab') {
    elements.pageTitle.textContent = 'Kubernetes Playground';
    elements.pageSubtitle.textContent = 'Hands-on walkthroughs for Blue-Green and Canary releases';
  }
}

// --- TELEMETRY POLLING ---
async function pollSystemInfo() {
  // If we are simulating locally or the simulator is running aggressively, don't poll
  if (state.simMode) {
    updateLocalSimPills();
    return;
  }

  try {
    const res = await fetch('/info');
    const data = await res.json();

    // Update Top bar
    updateSystemPills(data.deployment.color, data.deployment.version, data.deployment.pod);

    // Update Dashboard Cards
    updateDashboardCards(data);

    // Update Redis status in sidebar
    if (data.redis.connected) {
      elements.redisPulse.className = 'pulse-indicator online';
      elements.redisStatusText.textContent = `Redis: Connected`;
    } else {
      elements.redisPulse.className = 'pulse-indicator offline';
      elements.redisStatusText.textContent = `Redis: Disconnected`;
    }
  } catch (err) {
    console.warn('Unable to poll server info, server might be offline:', err.message);
    elements.redisPulse.className = 'pulse-indicator offline';
    elements.redisStatusText.textContent = `Redis: Unreachable`;
  }
}

function updateSystemPills(color, version, pod) {
  const c = color.toLowerCase();

  elements.valDeployColor.textContent = color.toUpperCase();
  elements.valVersion.textContent = version;
  elements.valPodName.textContent = pod;

  // Style active color pill
  elements.pillActiveColor.className = 'telemetry-pill';
  if (c === 'blue') elements.pillActiveColor.classList.add('bg-blue-active');
  else if (c === 'green') elements.pillActiveColor.classList.add('bg-green-active');
  else if (c === 'canary') elements.pillActiveColor.classList.add('bg-canary-active');
}

function updateDashboardCards(data) {
  const c = data.deployment.color.toLowerCase();

  // Active Deployment Card
  elements.dashColor.textContent = data.deployment.color.toUpperCase();
  elements.colorMetricCard.className = 'metric-card glow-card';

  if (c === 'blue') {
    elements.colorMetricCard.classList.add('color-blue');
    elements.dashColorDesc.textContent = 'Stable Blue environment active';
  } else if (c === 'green') {
    elements.colorMetricCard.classList.add('color-green');
    elements.dashColorDesc.textContent = 'Upgraded Green environment active';
  } else if (c === 'canary') {
    elements.colorMetricCard.classList.add('color-canary');
    elements.dashColorDesc.textContent = 'Canary subset testing active';
  } else {
    elements.dashColorDesc.textContent = 'External environment running';
  }

  // App Version
  elements.dashVersion.textContent = data.deployment.version;
  elements.dashPod.textContent = `Pod: ${data.deployment.pod}`;

  // Health
  elements.dashHealth.textContent = 'HEALTHY';
  elements.dashHealth.className = 'large-value text-success';

  // Redis info
  if (data.redis.connected) {
    elements.dashRedis.textContent = 'CONNECTED';
    elements.dashRedis.className = 'large-value text-success';
    elements.dashRedisVer.textContent = `Version: ${data.redis.version || '7.x'}`;
  } else {
    elements.dashRedis.textContent = 'OFFLINE';
    elements.dashRedis.className = 'large-value text-danger';
    elements.dashRedisVer.textContent = data.redis.error || 'Connection refused';
  }
}

function updateLocalSimPills() {
  const strategy = elements.mockStrategySelect.value;
  let color = 'simulated';
  let version = 'v1.0.0-mock';
  let pod = 'mock-pod-localhost';

  if (strategy === 'blue') {
    color = 'blue';
  } else if (strategy === 'green') {
    color = 'green';
    version = 'v2.0.0-mock';
  } else if (strategy.startsWith('canary')) {
    color = 'mixed';
    version = 'canary-split';
  } else if (strategy === 'failover') {
    color = 'danger';
    version = 'failing';
  }

  updateSystemPills(color, version, pod);

  elements.redisPulse.className = 'pulse-indicator online';
  elements.redisStatusText.textContent = `Redis: Simulated (Ready)`;

  elements.dashColor.textContent = color.toUpperCase();
  elements.dashVersion.textContent = version;
  elements.dashPod.textContent = `Pod: ${pod}`;
  elements.dashHealth.textContent = strategy === 'failover' ? 'DEGRADED' : 'HEALTHY';
  elements.dashHealth.className = strategy === 'failover' ? 'large-value text-danger' : 'large-value text-success';
  elements.dashRedis.textContent = 'SIMULATED';
  elements.dashRedis.className = 'large-value text-success';
  elements.dashRedisVer.textContent = 'Virtual Memory Store';
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Sim Mode Toggle
  elements.simModeToggle.addEventListener('change', (e) => {
    state.simMode = e.target.checked;

    if (state.simMode) {
      elements.mockConfigPanel.classList.remove('hidden');
      writeLog('Simulation Mode enabled. Telemetry will simulate active traffic scenarios client-side.', 'info');
    } else {
      elements.mockConfigPanel.classList.add('hidden');
      writeLog('Simulation Mode disabled. Traffic tester will query live server APIs.', 'info');
    }

    pollSystemInfo();
    resetTelemetry();
  });

  // RPS Slider
  elements.rpsSlider.addEventListener('input', (e) => {
    state.rps = parseInt(e.target.value);
    elements.rpsVal.textContent = state.rps;

    // Dynamically adjust interval if running
    if (state.simulatorRunning) {
      stopSimulatorTimer();
      startSimulatorTimer();
    }
  });

  // Endpoint Select
  elements.endpointSelect.addEventListener('change', (e) => {
    state.endpoint = e.target.value;
  });

  // Toggle Simulator
  elements.btnToggleSimulator.addEventListener('click', () => {
    if (state.simulatorRunning) {
      stopSimulator();
    } else {
      startSimulator();
    }
  });

  // Clear Stats
  elements.btnClearStats.addEventListener('click', () => {
    resetTelemetry();
    writeLog('Telemetry data counters cleared.', 'info');
  });

  // Clear Log
  elements.btnClearLog.addEventListener('click', () => {
    elements.logConsole.innerHTML = '';
  });

  // Reset server counter
  elements.btnResetCounter.addEventListener('click', async () => {
    if (state.simMode) {
      elements.dashCounterVal.textContent = '0';
      writeLog('[SIMULATION] Incremental server counter reset.', 'info');
      return;
    }

    try {
      const res = await fetch('/counter/reset', { method: 'POST' });
      const data = await res.json();
      elements.dashCounterVal.textContent = '0';
      writeLog('Server Redis counter reset successfully.', 'info');
    } catch (e) {
      writeLog('Failed to reset server counter: ' + e.message, 'error');
    }
  });
}

// --- TRAFFIC SIMULATOR CORE ---
function startSimulator() {
  state.simulatorRunning = true;
  elements.btnToggleSimulator.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Simulator';
  elements.btnToggleSimulator.className = 'btn btn-danger';

  elements.simulatorPulse.className = 'pulse-indicator online';
  elements.simulatorStatusText.textContent = `Running (${state.rps} RPS)`;

  writeLog(`Starting traffic generator at ${state.rps} requests/second targeting ${state.endpoint}...`, 'info');
  startSimulatorTimer();
}

function stopSimulator() {
  state.simulatorRunning = false;
  elements.btnToggleSimulator.innerHTML = '<i class="fa-solid fa-play"></i> Start Simulator';
  elements.btnToggleSimulator.className = 'btn btn-primary';

  elements.simulatorPulse.className = 'pulse-indicator offline';
  elements.simulatorStatusText.textContent = `Simulator Standby`;

  writeLog('Traffic generator stopped.', 'info');
  stopSimulatorTimer();
}

function startSimulatorTimer() {
  const interval = 1000 / state.rps;
  state.simulatorTimer = setInterval(triggerSingleRequest, interval);
}

function stopSimulatorTimer() {
  if (state.simulatorTimer) {
    clearInterval(state.simulatorTimer);
    state.simulatorTimer = null;
  }
}

async function triggerSingleRequest() {
  const startTime = Date.now();
  const reqNum = state.telemetry.totalRequests + 1;

  if (state.simMode) {
    // Client-side simulated query
    simulateResponse(reqNum, startTime);
  } else {
    // Real API fetch
    queryRealBackend(reqNum, startTime);
  }
}

// --- REAL BACKEND STRATEGY ---
async function queryRealBackend(reqNum, startTime) {
  const url = state.endpoint;
  const method = url.includes('increment') || url.includes('reset') ? 'POST' : 'GET';

  try {
    let res;
    if (method === 'POST') {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1 })
      });
    } else {
      res = await fetch(url);
    }

    const latency = Date.now() - startTime;
    const isOk = res.ok;

    // Read custom headers injected by Express middlewares in server.js
    const color = res.headers.get('X-Deploy-Color') || 'unknown';
    const version = res.headers.get('X-App-Version') || '0.0.0';
    const podName = res.headers.get('X-Pod-Name') || 'unknown-pod';

    if (isOk) {
      const data = await res.json();

      // Update quick counter if returned
      if (data.counter !== undefined) {
        elements.dashCounterVal.textContent = data.counter;
      }

      recordSuccess(color, version, podName, latency);
      writeRequestLog(reqNum, method, url, 200, latency, color, podName);
    } else {
      recordFailure(latency);
      writeRequestLog(reqNum, method, url, res.status, latency, 'error', podName);
    }
  } catch (err) {
    const latency = Date.now() - startTime;
    recordFailure(latency);
    writeRequestLog(reqNum, method, url, 'Failed', latency, 'error', 'network');
  }
}

// --- CLIENT-SIDE SIMULATED BACKEND ---
function simulateResponse(reqNum, startTime) {
  const strategy = elements.mockStrategySelect.value;
  const url = state.endpoint;
  const method = url.includes('increment') || url.includes('reset') ? 'POST' : 'GET';

  // Decide response variables based on strategy
  let latency = 50;
  let status = 200;
  let color = 'blue';
  let version = 'v1.0.0';
  let pod = 'pod-colordeploy-stable-87ca';

  // Generate random hash for pods
  const hash1 = Math.random().toString(36).substring(2, 6);
  const hash2 = Math.random().toString(36).substring(2, 6);

  if (strategy === 'blue') {
    latency = Math.floor(Math.random() * 40) + 60; // 60-100ms
    color = 'blue';
    version = 'v1.0.0';
    pod = `pod-colordeploy-blue-${hash1}`;
  } else if (strategy === 'green') {
    latency = Math.floor(Math.random() * 30) + 40; // 40-70ms (faster)
    color = 'green';
    version = 'v2.0.0';
    pod = `pod-colordeploy-green-${hash2}`;
  } else if (strategy === 'canary-10') {
    // 90% Stable, 10% Canary split
    const split = Math.random();
    if (split < 0.1) {
      latency = Math.floor(Math.random() * 15) + 35; // 35-50ms
      color = 'canary';
      version = 'v2.0.0-canary';
      pod = `pod-colordeploy-canary-${hash2}`;
    } else {
      latency = Math.floor(Math.random() * 30) + 75; // 75-105ms
      color = 'blue';
      version = 'v1.0.0';
      pod = `pod-colordeploy-stable-${hash1}`;
    }
  } else if (strategy === 'canary-50') {
    // 50/50 split
    const split = Math.random();
    if (split < 0.5) {
      latency = Math.floor(Math.random() * 15) + 35;
      color = 'canary';
      version = 'v2.0.0-canary';
      pod = `pod-colordeploy-canary-${hash2}`;
    } else {
      latency = Math.floor(Math.random() * 30) + 75;
      color = 'blue';
      version = 'v1.0.0';
      pod = `pod-colordeploy-stable-${hash1}`;
    }
  } else if (strategy === 'failover') {
    // 60% Stable, 40% Server error
    const split = Math.random();
    if (split < 0.4) {
      latency = Math.floor(Math.random() * 80) + 120;
      status = 500;
      color = 'error';
      pod = 'degraded-pod';
    } else {
      latency = Math.floor(Math.random() * 30) + 80;
      color = 'blue';
      version = 'v1.0.0';
      pod = `pod-colordeploy-stable-${hash1}`;
    }
  }

  // Fake brief timeout to feel like a real request
  setTimeout(() => {
    if (status === 200) {
      if (url.includes('increment')) {
        const val = parseInt(elements.dashCounterVal.textContent) || 0;
        elements.dashCounterVal.textContent = val + 1;
      }
      recordSuccess(color, version, pod, latency);
      writeRequestLog(reqNum, method, url, status, latency, color, pod);
    } else {
      recordFailure(latency);
      writeRequestLog(reqNum, method, url, status, latency, 'error', pod);
    }
  }, Math.min(latency, 20));
}

// --- TELEMETRY MUTATORS ---
function recordSuccess(color, version, pod, latency) {
  const t = state.telemetry;
  t.totalRequests++;
  t.successRequests++;
  t.totalLatency += latency;

  // Color distribution
  t.colors[color] = (t.colors[color] || 0) + 1;

  // Pod distribution
  t.pods[pod] = (t.pods[pod] || 0) + 1;

  // History sliding window
  recordHistory(latency, true);

  updateChartsAndTelemetryUI();
}

function recordFailure(latency) {
  const t = state.telemetry;
  t.totalRequests++;
  t.errorRequests++;
  t.totalLatency += latency;

  // Increment error color category
  t.colors['error'] = (t.colors['error'] || 0) + 1;

  recordHistory(latency, false);

  updateChartsAndTelemetryUI();
}

function recordHistory(latency, success) {
  const history = state.telemetry.history;
  history.push({ latency, success });

  if (history.length > 20) {
    history.shift();
  }
}

function resetTelemetry() {
  state.telemetry.totalRequests = 0;
  state.telemetry.successRequests = 0;
  state.telemetry.errorRequests = 0;
  state.telemetry.totalLatency = 0;
  state.telemetry.colors = {};
  state.telemetry.pods = {};
  state.telemetry.history = [];

  updateChartsAndTelemetryUI();
}

// --- UI UPDATERS & RENDER ---
function updateChartsAndTelemetryUI() {
  const t = state.telemetry;

  // Update numbers
  elements.statsReqCount.textContent = t.totalRequests;
  elements.dashTotalReq.textContent = t.totalRequests;

  const successRate = t.totalRequests > 0
    ? ((t.successRequests / t.totalRequests) * 100).toFixed(1)
    : '100.0';
  elements.statsSuccessRate.textContent = successRate + '%';

  const errRate = t.totalRequests > 0
    ? ((t.errorRequests / t.totalRequests) * 100).toFixed(2)
    : '0.00';
  elements.dashErrorRate.textContent = errRate + '%';
  if (parseFloat(errRate) > 5) {
    elements.dashErrorRate.className = 'large-value text-danger';
  } else {
    elements.dashErrorRate.className = 'large-value text-success';
  }

  const avgLatency = t.totalRequests > 0
    ? Math.round(t.totalLatency / t.totalRequests)
    : 0;
  elements.dashAvgLatency.textContent = avgLatency + ' ms';

  // 1. Color Doughnut Chart Update
  const colorData = [];
  const colorLabels = [];
  const colorColors = [];

  const colorConfig = {
    blue: { label: 'Blue', color: '#3b82f6' },
    green: { label: 'Green', color: '#10b981' },
    canary: { label: 'Canary', color: '#eab308' },
    error: { label: 'Errors', color: '#ef4444' },
    unknown: { label: 'Unknown', color: '#6b7280' }
  };

  Object.keys(t.colors).forEach(c => {
    const count = t.colors[c];
    if (count > 0) {
      colorData.push(count);
      const conf = colorConfig[c] || { label: c.toUpperCase(), color: '#a855f7' };
      colorLabels.push(conf.label);
      colorColors.push(conf.color);
    }
  });

  if (colorData.length === 0) {
    // Default placeholder
    colorData.push(1);
    colorLabels.push('Standby');
    colorColors.push('#334155');
  }

  state.charts.color.data.labels = colorLabels;
  state.charts.color.data.datasets[0].data = colorData;
  state.charts.color.data.datasets[0].backgroundColor = colorColors;
  state.charts.color.update('none'); // Update without full animation for performance

  // 2. Pod Bar Chart Update
  const podLabels = Object.keys(t.pods);
  const podData = podLabels.map(p => t.pods[p]);

  state.charts.pod.data.labels = podLabels;
  state.charts.pod.data.datasets[0].data = podData;

  // Color the pod bars based on matching words (blue, green, canary)
  const barColors = podLabels.map(p => {
    if (p.includes('blue') || p.includes('stable')) return 'rgba(59, 130, 246, 0.7)';
    if (p.includes('green')) return 'rgba(16, 185, 129, 0.7)';
    if (p.includes('canary')) return 'rgba(234, 179, 8, 0.7)';
    return 'rgba(168, 85, 247, 0.7)'; // Default purple
  });
  state.charts.pod.data.datasets[0].backgroundColor = barColors;
  state.charts.pod.update('none');

  // 3. Latency & Reliability Chart Update
  const historyLabels = t.history.map((_, i) => i + 1);
  const latencyPoints = t.history.map(h => h.latency);
  const reliabilityPoints = t.history.map(h => h.success ? 100 : 0);

  state.charts.latency.data.labels = historyLabels;
  state.charts.latency.data.datasets[0].data = latencyPoints;
  state.charts.latency.data.datasets[1].data = reliabilityPoints;
  state.charts.latency.update('none');
}

// --- CONSOLE LOGGER ---
function writeLog(message, type = 'info') {
  const row = document.createElement('div');
  row.className = `log-row ${type}-row`;

  const timeStr = new Date().toTimeString().split(' ')[0];

  row.innerHTML = `
    <span class="time">[${timeStr}]</span>
    <span class="message">${message}</span>
  `;

  elements.logConsole.appendChild(row);
  elements.logConsole.scrollTop = elements.logConsole.scrollHeight;
}

function writeRequestLog(reqNum, method, url, status, latency, color, pod) {
  const row = document.createElement('div');
  const isErr = typeof status === 'number' ? status >= 400 : true;
  row.className = `log-row ${isErr ? 'error-row' : 'info-row'}`;

  const timeStr = new Date().toTimeString().split(' ')[0];
  const cBadge = color.toLowerCase();

  row.innerHTML = `
    <span class="time">[${timeStr}]</span>
    <span class="message">
      Request #${reqNum} &bull; <strong style="color:#fff">${method}</strong> ${url} &bull;
      Status: <span class="${isErr ? 'text-danger' : 'text-success'}">${status}</span> &bull;
      Latency: <strong>${latency}ms</strong> &bull;
      Color: <span class="badge-bg-color ${cBadge}">${cBadge}</span> &bull;
      Pod: <span style="font-size:0.75rem; color:#cbd5e1;">${pod}</span>
    </span>
  `;

  elements.logConsole.appendChild(row);

  // Keep console log from growing infinitely
  if (elements.logConsole.children.length > 150) {
    elements.logConsole.removeChild(elements.logConsole.firstChild);
  }

  elements.logConsole.scrollTop = elements.logConsole.scrollHeight;
}

// --- CHART INITIALIZATION ---
function initCharts() {
  Chart.defaults.color = '#9ca3af';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;

  // 1. Color Distribution Doughnut Chart
  const ctxColor = document.getElementById('colorChart').getContext('2d');
  state.charts.color = new Chart(ctxColor, {
    type: 'doughnut',
    data: {
      labels: ['Standby'],
      datasets: [{
        data: [1],
        backgroundColor: ['#334155'],
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, padding: 8 }
        }
      },
      cutout: '65%'
    }
  });

  // 2. Pod Horizontal Bar Chart
  const ctxPod = document.getElementById('podChart').getContext('2d');
  state.charts.pod = new Chart(ctxPod, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Requests Handled',
        data: [],
        backgroundColor: [],
        borderWidth: 0,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { precision: 0 }
        },
        y: {
          grid: { display: false },
          ticks: {
            callback: function(value) {
              const label = this.getLabelForValue(value);
              return label.length > 20 ? label.substring(0, 17) + '...' : label;
            }
          }
        }
      }
    }
  });

  // 3. Latency and Reliability History Line Chart
  const ctxLatency = document.getElementById('latencyChart').getContext('2d');
  state.charts.latency = new Chart(ctxLatency, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Latency (ms)',
          data: [],
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Success Split (%)',
          data: [],
          borderColor: 'rgba(16, 185, 129, 0.4)',
          borderWidth: 1,
          pointStyle: 'crossRot',
          showLine: false,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { display: false }
        },
        y: {
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.04)' },
          title: { display: true, text: 'Latency (ms)' }
        },
        y1: {
          position: 'right',
          grid: { display: false },
          title: { display: true, text: 'Status' },
          min: 0,
          max: 100,
          ticks: {
            stepSize: 50,
            callback: value => value === 100 ? 'OK' : value === 0 ? 'ERR' : ''
          }
        }
      }
    }
  });
}

// --- UTILITY FUNCTIONS ---
window.copyCode = function(button) {
  const pre = button.previousElementSibling;
  const code = pre.querySelector('code').textContent;

  navigator.clipboard.writeText(code).then(() => {
    const icon = button.querySelector('i');
    icon.className = 'fa-solid fa-check';
    button.style.color = '#10b981';

    setTimeout(() => {
      icon.className = 'fa-regular fa-copy';
      button.style.color = '';
    }, 2000);
  });
};
