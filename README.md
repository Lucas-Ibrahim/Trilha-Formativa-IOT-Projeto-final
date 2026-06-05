<div align="center">
  <h1>💧 FloodWatch</h1>
  <p>Monitor inteligente de alagamento urbano com IoT, MQTT e dashboard em tempo real</p>

  ![ESP8266](https://img.shields.io/badge/ESP8266-NodeMCU-blue)
  ![MQTT](https://img.shields.io/badge/MQTT-Node--RED-orange)
  ![HTML](https://img.shields.io/badge/Frontend-HTML%2FCSS%2FJS-yellow)
  ![Node-RED](https://img.shields.io/badge/Node--RED-1880-red)
</div>

---

## Sobre

O FloodWatch é um sistema de monitoramento de nível de água desenvolvido como protótipo de IoT para aplicação em pontos críticos de alagamento urbano. Um sensor ultrassônico mede o nível da água em tempo real, publica os dados via MQTT e um dashboard web exibe o histórico, status atual e dados meteorológicos integrados.

**Problema que resolve:** Cidades sem monitoramento preventivo de enchentes. Com sensores em bueiros e pontos críticos, é possível emitir alertas antes que o nível se torne perigoso.

---

## Arquitetura

```
HC-SR04 (sensor)
   ↓
ESP8266 NodeMCU (Wi-Fi)
   ↓ MQTT
Broker local (192.168.1.110:1883)
   ↓
Node-RED (média de leituras + conversão distância → nível)
   ↓ WebSocket (ws://127.0.0.1:1880/floodwatch)
Dashboard Web (HTML/CSS/JS)
```

---

## Tecnologias

| Camada | Tecnologia | Função |
|---|---|---|
| Hardware | ESP8266 NodeMCU + HC-SR04 | Leitura do nível de água |
| Firmware | Arduino IDE (C++) | Publicação MQTT |
| Broker | Mosquitto (local) | Roteamento de mensagens |
| Middleware | Node-RED | Média de leituras + conversão + WebSocket |
| Frontend | HTML + CSS + JS puro | Dashboard em tempo real |
| Mapa | Leaflet.js + OpenStreetMap | Visualização geográfica dos sensores |
| Meteorologia | Open-Meteo API | Dados de chuva sem API key |

---

## Como rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) (para o Node-RED)
- [Arduino IDE](https://www.arduino.cc/en/software) com suporte ao ESP8266
- [Mosquitto](https://mosquitto.org/) ou outro broker MQTT
- Extensão Live Server no VSCode (para servir o site)

### 1. Broker MQTT

```bash
# Instalar e iniciar o Mosquitto
mosquitto -v
```

### 2. Node-RED

```bash
npm install -g node-red
node-red
# Acesse http://localhost:1880
```

**Fluxo Node-RED:**

```
[MQTT In: sensor/hcsr04] → [Function] → [WebSocket Out: /floodwatch]
```

**Código da Function (média de 10 leituras + conversão):**

```js
const data = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;

if (!context.readings) context.readings = [];
context.readings.push(data.distancia);

if (context.readings.length < 10) return null;

const media = context.readings.reduce((a, b) => a + b, 0) / 10;
context.readings = [];

const nivel = Math.round(23 - media); // ajustar 23 para altura real do sensor

msg.payload = JSON.stringify({ level: nivel });
return msg;
```

> ⚠️ Ajuste o valor `23` para a altura real (em cm) entre o sensor e o fundo do recipiente.

**Nó WebSocket Out:**
- Tipo: `Ouvir em`
- Path: `/floodwatch`

### 3. Firmware ESP8266

Abra `ProjetoIoT.ino` na Arduino IDE e ajuste:

```cpp
const char* ssid     = "SUA_REDE";
const char* password = "SUA_SENHA";
const char* mqtt_server = "IP_DO_SEU_BROKER"; // ex: 192.168.1.110
```

Pinos do HC-SR04:
```cpp
#define TRIG_PIN D5
#define ECHO_PIN D6
```

Selecione a placa `NodeMCU 0.9 (ESP-12 Module)` e faça o upload.

### 4. Site

Abra `index.html` com o Live Server do VSCode.  
**Use Chrome** — Safari bloqueia WebSocket em `localhost`.

---

## Funcionalidades

- Mapa interativo com marcadores coloridos por status do sensor
- Card de nível atual com barra de progresso e badge (Normal / Atenção / Crítico)
- Gráfico de nível por hora do dia
- Histórico navegável por data
- Meteorologia do dia via Open-Meteo (sem API key)
- Status da conexão MQTT em tempo real
- Botões de simulação para demonstração (Normal / Atenção / Crítico)

### Limites de alerta

| Status | Faixa |
|---|---|
| 🟢 Normal | 0 – 20 cm |
| 🟡 Atenção | 20 – 25 cm |
| 🔴 Crítico | > 25 cm |

---

## Próximas melhorias

- [ ] Cálculo de velocidade de crescimento e previsão "em X min atingirá nível crítico"
- [ ] Deep Sleep no ESP8266 com frequência adaptativa por previsão de chuva
- [ ] Persistência de dados (histórico não se perde ao fechar o site)
- [ ] Substituir broker local por HiveMQ Cloud para apresentações

---

## Estrutura do repositório

```
floodwatch/
├── index.html       # Estrutura do dashboard
├── style.css        # Tema escuro (Space Mono + Syne)
├── script.js        # Toda a lógica frontend (MQTT, mapa, gráfico, meteorologia)
└── ProjetoIoT.ino   # Firmware ESP8266 (Arduino)
```

---

## Autores

Projeto desenvolvido em grupo de 3 pessoas na disciplina de IoT — PUC-Campinas, 5º semestre de Engenharia da Computação.