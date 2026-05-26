// ─────────────────────────────────────────────
// SENSORES CADASTRADOS MANUALMENTE
// ─────────────────────────────────────────────
//
// Estes pontos ainda são fictícios no protótipo.
// Depois, vocês podem trocar por pontos reais definidos pelo grupo.

const SENSORS = [
  {
    id: 'sensor-01',
    name: 'PUC-Campinas H13 - IOT Lab',
    city: 'Campinas — SP',
    lat: -22.833598430363445, 
    lng: -47.05193308392776,
    topic: 'floodwatch/sensor-01'
  }
]

// ─────────────────────────────────────────────
// CONFIGURAÇÃO MQTT
// ─────────────────────────────────────────────
//
// O site NÃO usa Node.
// Ele conecta direto no broker MQTT via WebSocket.
// Para teste, está usando broker público.

const MQTT_BROKER_URL = 'wss://test.mosquitto.org:8081'

// ─────────────────────────────────────────────
// ESTADO GLOBAL DA INTERFACE
// ─────────────────────────────────────────────

let selectedSensor = SENSORS[0]

let selectedDate = startOfDay(new Date())

let mqttClient = null

let map = null

let marker = null

const markersBySensorId = {}

const MAX_LEVEL = 30

// Histórico por sensor e por data.
// Quando vier dado real do MQTT, ele entra aqui.
// Por enquanto já deixei dados simulados para alguns dias.

const sensorHistory = {
  'sensor-01': {
    [formatDateKey(new Date())]: [
      { hour: 8, level: 10 },
      { hour: 9, level: 12 },
      { hour: 10, level: 18 },
      { hour: 11, level: 22 },
      { hour: 12, level: 28 }
    ],
    [formatDateKey(addDays(new Date(), -1))]: [
      { hour: 8, level: 8 },
      { hour: 9, level: 11 },
      { hour: 10, level: 13 },
      { hour: 11, level: 15 },
      { hour: 12, level: 17 }
    ]
  },
  'sensor-02': {
    [formatDateKey(new Date())]: [
      { hour: 7, level: 6 },
      { hour: 8, level: 9 },
      { hour: 9, level: 14 },
      { hour: 10, level: 21 }
    ]
  },
  'sensor-03': {}
}

// Cache para não buscar a meteorologia toda hora na API.

const weatherCache = {}

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────

init()

function init() {
  setupSensorSelect()
  setupDateButtons()
  setupMap()
  setupMqtt()

  updateClock()
  setInterval(updateClock, 1000)

  renderDashboard()
}

// ─────────────────────────────────────────────
// SELECT DE SENSORES
// ─────────────────────────────────────────────

function setupSensorSelect() {
  const select = document.getElementById('sensorSelect')

  SENSORS.forEach(sensor => {
    const option = document.createElement('option')

    option.value = sensor.id
    option.textContent = `${sensor.name} — ${sensor.city}`

    select.appendChild(option)
  })

  select.value = selectedSensor.id

  select.addEventListener('change', () => {
    selectedSensor = SENSORS.find(sensor => sensor.id === select.value)

    if (marker) {
      map.setView([selectedSensor.lat, selectedSensor.lng], 15)
    }

    renderDashboard()
    resubscribeMqttTopic()
  })
}

// ─────────────────────────────────────────────
// NAVEGAÇÃO DE DATA
// ─────────────────────────────────────────────

function setupDateButtons() {
  document.getElementById('prevDayBtn').addEventListener('click', () => {
    selectedDate = addDays(selectedDate, -1)
    renderDashboard()
  })

  document.getElementById('nextDayBtn').addEventListener('click', () => {
    selectedDate = addDays(selectedDate, 1)
    renderDashboard()
  })
}

// ─────────────────────────────────────────────
// MAPA
// ─────────────────────────────────────────────

function setupMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView([selectedSensor.lat, selectedSensor.lng], 15)

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution: '© OpenStreetMap'
    }
  ).addTo(map)

  L.control.zoom({
    position: 'bottomright'
  }).addTo(map)

  SENSORS.forEach(sensor => {
    const sensorMarker = L.marker(
      [sensor.lat, sensor.lng],
      {
        icon: makeIcon('#22dd6a')
      }
    )
      .addTo(map)
      .bindPopup(`<b>${sensor.name}</b><br>${sensor.city}`)

    sensorMarker.on('click', () => {
      selectedSensor = sensor
      document.getElementById('sensorSelect').value = sensor.id
      map.setView([sensor.lat, sensor.lng], 15)
      renderDashboard()
      resubscribeMqttTopic()
    })

    markersBySensorId[sensor.id] = sensorMarker
  })

  marker = markersBySensorId[selectedSensor.id]
}

function makeIcon(color) {
  return L.divIcon({
    className: '',

    html: `
      <div style="position:relative;width:40px;height:40px">
        <div
          style="
            position:absolute;
            inset:0;
            border-radius:50%;
            background:${color};
            opacity:0.25;
            animation:pulse 1.5s infinite
          "
        ></div>

        <div
          style="
            position:absolute;
            inset:8px;
            border-radius:50%;
            background:${color};
            border:2px solid white
          "
        ></div>
      </div>
    `,

    iconSize: [40, 40],
    iconAnchor: [20, 20]
  })
}

// ─────────────────────────────────────────────
// MQTT
// ─────────────────────────────────────────────

function setupMqtt() {
  updateMqttStatus('Conectando...')

  mqttClient = mqtt.connect(MQTT_BROKER_URL)

  mqttClient.on('connect', () => {
    updateMqttStatus('Conectado')
    resubscribeMqttTopic()
  })

  mqttClient.on('message', (topic, message) => {
    handleMqttMessage(topic, message)
  })

  mqttClient.on('error', (error) => {
    console.error('Erro MQTT:', error)
    updateMqttStatus('Erro')
  })

  mqttClient.on('offline', () => {
    updateMqttStatus('Offline')
  })

  mqttClient.on('reconnect', () => {
    updateMqttStatus('Reconectando...')
  })
}

function resubscribeMqttTopic() {
  if (!mqttClient || !mqttClient.connected) {
    return
  }

  SENSORS.forEach(sensor => {
    mqttClient.unsubscribe(sensor.topic)
  })

  mqttClient.subscribe(selectedSensor.topic, (error) => {
    if (error) {
      console.error('Erro ao assinar tópico MQTT:', error)
      updateMqttStatus('Erro no tópico')
      return
    }

    document.getElementById('mqttTopic').textContent = selectedSensor.topic
  })
}

function handleMqttMessage(topic, message) {
  try {
    const payload = JSON.parse(message.toString())

    const level = Number(payload.level)

    if (Number.isNaN(level)) {
      console.warn('Leitura recebida sem level válido:', payload)
      return
    }

    const sensor = SENSORS.find(item => item.topic === topic)

    if (!sensor) {
      return
    }

    const now = new Date()
    const dateKey = formatDateKey(now)
    const hour = now.getHours()

    if (!sensorHistory[sensor.id]) {
      sensorHistory[sensor.id] = {}
    }

    if (!sensorHistory[sensor.id][dateKey]) {
      sensorHistory[sensor.id][dateKey] = []
    }

    sensorHistory[sensor.id][dateKey].push({
      hour,
      level
    })

    document.getElementById('lastReading').textContent =
      now.toLocaleTimeString('pt-BR')

    if (sensor.id === selectedSensor.id && dateKey === formatDateKey(selectedDate)) {
      renderDashboard()
    }

  } catch (error) {
    console.error('Mensagem MQTT inválida:', error)
  }
}

function updateMqttStatus(status) {
  document.getElementById('mqttStatus').textContent = status
}

// ─────────────────────────────────────────────
// RENDERIZAÇÃO PRINCIPAL
// ─────────────────────────────────────────────

async function renderDashboard() {
  const dateKey = formatDateKey(selectedDate)
  const readings = getReadingsForSelectedDay()

  document.getElementById('selectedDateLabel').textContent =
    formatDateBR(selectedDate)

  document.getElementById('sensorName').innerHTML = `
    ${selectedSensor.name}<br>
    ${selectedSensor.city}
  `

  document.getElementById('sensorCoords').textContent =
    `${selectedSensor.lat}° / ${selectedSensor.lng}°`

  document.getElementById('mqttTopic').textContent = selectedSensor.topic

  const lastReading = readings.length > 0
    ? readings[readings.length - 1]
    : null

  if (lastReading) {
    updateLevelCard(lastReading.level)
  } else {
    updateEmptyLevelCard()
  }

  drawDailyChart(readings)

  updateMarkerForSelectedSensor(lastReading)

  await updateWeatherForSelectedDay(dateKey)
}

function updateLevelCard(cm) {
  const status = getStatusFromLevel(cm)

  const card = document.getElementById('statusCard')
  card.className = 'status-card ' + status.statusClass

  const levelVal = document.getElementById('levelVal')
  levelVal.innerHTML = `${cm} <span class="level-unit">cm</span>`
  levelVal.style.color = status.color

  const pct = Math.min(cm / MAX_LEVEL, 1)

  const bar = document.getElementById('barFill')
  bar.style.width = (pct * 100) + '%'
  bar.style.background = status.color

  const badge = document.getElementById('badge')
  badge.className = 'status-badge ' + status.badgeClass
  badge.textContent = status.badgeText
}

function updateEmptyLevelCard() {
  const card = document.getElementById('statusCard')
  card.className = 'status-card empty'

  const levelVal = document.getElementById('levelVal')
  levelVal.innerHTML = `-- <span class="level-unit">cm</span>`
  levelVal.style.color = 'var(--gray)'

  const bar = document.getElementById('barFill')
  bar.style.width = '0%'
  bar.style.background = 'var(--gray)'

  const badge = document.getElementById('badge')
  badge.className = 'status-badge badge-empty'
  badge.textContent = 'SEM DADOS'
}

function updateMarkerForSelectedSensor() {
  Object.entries(markersBySensorId).forEach(([sensorId, itemMarker]) => {
    const sensor = SENSORS.find(item => item.id === sensorId)

    const readings =
      sensorHistory[sensorId]?.[formatDateKey(selectedDate)] || []

    const last = readings.length
      ? readings[readings.length - 1]
      : null

    const status = last
      ? getStatusFromLevel(last.level)
      : {
          color: '#6b7fa3',
          badgeText: 'SEM DADOS'
        }

    itemMarker.setIcon(makeIcon(status.color))

    itemMarker.setPopupContent(`
      <b>${sensor.name}</b><br>
      ${sensor.city}<br>
      ${last ? `Nível: ${last.level} cm — ${status.badgeText}` : 'Sem dados neste dia'}
    `)
  })

  marker = markersBySensorId[selectedSensor.id]
}

function getStatusFromLevel(cm) {
  if (cm > 25) {
    return {
      color: '#f54444',
      statusClass: 'critical',
      badgeClass: 'badge-critical',
      badgeText: 'CRÍTICO'
    }
  }

  if (cm > 20) {
    return {
      color: '#f5c400',
      statusClass: 'warning',
      badgeClass: 'badge-warning',
      badgeText: 'ATENÇÃO'
    }
  }

  return {
    color: '#22dd6a',
    statusClass: 'normal',
    badgeClass: 'badge-normal',
    badgeText: 'NORMAL'
  }
}

// ─────────────────────────────────────────────
// METEOROLOGIA
// ─────────────────────────────────────────────

async function updateWeatherForSelectedDay(dateKey) {
  document.getElementById('weatherNote').textContent =
    'Consultando meteorologia do dia...'

  try {
    const weather = await fetchWeatherForSelectedSensor()

    if (!weather || !weather.hourly) {
      throw new Error('Resposta meteorológica inválida')
    }

    const daily = summarizeWeatherByDate(weather, dateKey)

    updateWeatherInfo(daily)

  } catch (error) {
    console.error('Erro ao consultar meteorologia:', error)

    document.getElementById('weatherPrecipitation').textContent = '-- mm'
    document.getElementById('weatherRain').textContent = '-- mm'
    document.getElementById('weatherProbability').textContent = '--%'
    document.getElementById('weatherNote').textContent =
      'Não foi possível carregar a meteorologia deste dia.'
  }
}

async function fetchWeatherForSelectedSensor() {
  const cacheKey = selectedSensor.id

  if (weatherCache[cacheKey]) {
    return weatherCache[cacheKey]
  }

  const url = `
    https://api.open-meteo.com/v1/forecast
    ?latitude=${selectedSensor.lat}
    &longitude=${selectedSensor.lng}
    &hourly=precipitation,rain,precipitation_probability
    &timezone=America%2FSao_Paulo
    &past_days=7
    &forecast_days=7
  `.replace(/\s/g, '')

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Erro na API Open-Meteo')
  }

  const data = await response.json()

  weatherCache[cacheKey] = data

  return data
}

function summarizeWeatherByDate(weather, dateKey) {
  const times = weather.hourly.time
  const precipitation = weather.hourly.precipitation || []
  const rain = weather.hourly.rain || []
  const probability = weather.hourly.precipitation_probability || []

  let totalPrecipitation = 0
  let totalRain = 0
  let maxProbability = 0
  let count = 0

  times.forEach((time, index) => {
    if (!time.startsWith(dateKey)) {
      return
    }

    totalPrecipitation += Number(precipitation[index] ?? 0)
    totalRain += Number(rain[index] ?? 0)
    maxProbability = Math.max(maxProbability, Number(probability[index] ?? 0))
    count++
  })

  return {
    hasWeatherData: count > 0,
    precipitation: totalPrecipitation,
    rain: totalRain,
    probability: maxProbability
  }
}

function updateWeatherInfo(daily) {
  if (!daily.hasWeatherData) {
    document.getElementById('weatherPrecipitation').textContent = '-- mm'
    document.getElementById('weatherRain').textContent = '-- mm'
    document.getElementById('weatherProbability').textContent = '--%'
    document.getElementById('weatherNote').textContent =
      'Sem dados meteorológicos disponíveis para este dia.'
    return
  }

  document.getElementById('weatherPrecipitation').textContent =
    `${daily.precipitation.toFixed(1)} mm`

  document.getElementById('weatherRain').textContent =
    `${daily.rain.toFixed(1)} mm`

  document.getElementById('weatherProbability').textContent =
    `${daily.probability}%`

  document.getElementById('weatherNote').textContent =
    analyzeDailyRain(daily.rain || daily.precipitation)
}

function analyzeDailyRain(rainValue) {
  if (rainValue >= 30) {
    return 'Chuva muito forte acumulada neste dia.'
  }

  if (rainValue >= 10) {
    return 'Chuva forte acumulada neste dia.'
  }

  if (rainValue >= 2.5) {
    return 'Chuva moderada acumulada neste dia.'
  }

  if (rainValue > 0) {
    return 'Chuva fraca registrada neste dia.'
  }

  return 'Sem chuva relevante registrada neste dia.'
}

// ─────────────────────────────────────────────
// GRÁFICO DIÁRIO DO NÍVEL DA ÁGUA
// ─────────────────────────────────────────────

function drawDailyChart(readings) {
  const canvas = document.getElementById('chart')
  const emptyText = document.getElementById('chartEmpty')
  const ctx = canvas.getContext('2d')

  canvas.width = canvas.offsetWidth * devicePixelRatio
  canvas.height = 120 * devicePixelRatio

  ctx.scale(devicePixelRatio, devicePixelRatio)

  const W = canvas.offsetWidth
  const H = 120

  ctx.clearRect(0, 0, W, H)

  drawGrid(ctx, W, H)

  if (!readings.length) {
    emptyText.style.display = 'block'
    return
  }

  emptyText.style.display = 'none'

  const normalized = normalizeDailyReadings(readings)

  ctx.beginPath()
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.strokeStyle =
    getStatusFromLevel(normalized[normalized.length - 1].level).color

  normalized.forEach((item, index) => {
    const x = (item.hour / 23) * W
    const y = H - (item.level / MAX_LEVEL) * H * 0.85 - 8

    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })

  ctx.stroke()

  ctx.lineTo((normalized[normalized.length - 1].hour / 23) * W, H)
  ctx.lineTo((normalized[0].hour / 23) * W, H)
  ctx.closePath()

  ctx.fillStyle =
    getStatusFromLevel(normalized[normalized.length - 1].level).color + '18'

  ctx.fill()

  normalized.forEach(item => {
    const x = (item.hour / 23) * W
    const y = H - (item.level / MAX_LEVEL) * H * 0.85 - 8

    ctx.beginPath()
    ctx.arc(x, y, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = getStatusFromLevel(item.level).color
    ctx.fill()
  })
}

function drawGrid(ctx, W, H) {
  ctx.strokeStyle = '#1a2540'
  ctx.lineWidth = 1

  ;[0.25, 0.5, 0.75].forEach(t => {
    ctx.beginPath()
    ctx.moveTo(0, H * t)
    ctx.lineTo(W, H * t)
    ctx.stroke()
  })

  ctx.fillStyle = '#6b7fa3'
  ctx.font = '10px Space Mono'

  ;[0, 6, 12, 18, 23].forEach(hour => {
    const x = (hour / 23) * W
    ctx.fillText(`${hour}h`, x, H - 4)
  })
}

function normalizeDailyReadings(readings) {
  return readings
    .slice()
    .sort((a, b) => a.hour - b.hour)
}

// ─────────────────────────────────────────────
// SIMULAÇÃO MANUAL
// ─────────────────────────────────────────────

function simulateLevel(level) {
  const dateKey = formatDateKey(selectedDate)
  const hour = new Date().getHours()

  if (!sensorHistory[selectedSensor.id]) {
    sensorHistory[selectedSensor.id] = {}
  }

  if (!sensorHistory[selectedSensor.id][dateKey]) {
    sensorHistory[selectedSensor.id][dateKey] = []
  }

  sensorHistory[selectedSensor.id][dateKey].push({
    hour,
    level
  })

  document.getElementById('lastReading').textContent =
    new Date().toLocaleTimeString('pt-BR')

  renderDashboard()
}

// ─────────────────────────────────────────────
// HELPERS DE DATA
// ─────────────────────────────────────────────

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, amount) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return startOfDay(copy)
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatDateBR(date) {
  return date.toLocaleDateString('pt-BR')
}

function getReadingsForSelectedDay() {
  const dateKey = formatDateKey(selectedDate)

  return sensorHistory[selectedSensor.id]?.[dateKey] || []
}

// ─────────────────────────────────────────────
// RELÓGIO
// ─────────────────────────────────────────────

function updateClock() {
  const now = new Date()

  document.getElementById('clock').textContent =
    now.toLocaleTimeString('pt-BR')
}