/* ============================================================
   ORBIT — State Machine, Session Security & Web BLE Pipeline
   ============================================================ */

"use strict";

/* ---------------- SESSION SECURITY ENGINE ---------------- */

const PIN_OPERATOR = "1111";
const PIN_PEER = "2222";

let establishedRole = null;

/* ---------------- WEB BLUETOOTH PIPELINE ---------------- */

const SPP_SERVICE_UUID = '00001101-0000-1000-8000-00805f9b34fb';

let bleTxCharacteristic = null;

const authScreen = document.getElementById('authScreen');
const chatScreen = document.getElementById('chatScreen');
const pinInput = document.getElementById('pinInput');
const authError = document.getElementById('authError');
const userBadge = document.getElementById('userBadge');
const chatBox = document.getElementById('chatBox');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const connectBtn = document.getElementById('connectBtn');
const msgInput = document.getElementById('msgInput');

/* ---------------- SESSION SECURITY ENGINE ---------------- */

function checkAuth() {
    const candidate = pinInput.value.trim();

    if (candidate === PIN_OPERATOR) {
        establishedRole = "Operator";
        userBadge.classList.add('op');
    } else if (candidate === PIN_PEER) {
        establishedRole = "Peer";
        userBadge.classList.add('peer');
    } else {
        authError.textContent = "Access Denied. Clearance code rejected by the relay.";
        authError.classList.add('visible');
        pinInput.value = "";
        return;
    }

    authError.classList.remove('visible');
    authError.textContent = "";
    pinInput.value = "";

    userBadge.textContent = establishedRole;

    authScreen.style.opacity = "0";
    authScreen.classList.remove('active');
    chatScreen.classList.add('active');

    pinInput.blur();
}

/* ---------------- MESSAGE FEED UTILITIES ---------------- */

function appendBubble(text, className) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + className;
    bubble.textContent = text;
    chatBox.appendChild(bubble);
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
}

function appendSystemAlert(text) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble system alert';
    bubble.textContent = text;
    chatBox.appendChild(bubble);
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
}

/* ---------------- WEB BLUETOOTH PIPELINE ---------------- */

async function connectBluetooth() {
    try {
        if (!navigator.bluetooth) {
            appendSystemAlert("Web Bluetooth is unavailable in this browser. Use Chrome/Edge over HTTPS.");
            return;
        }

        appendSystemAlert("Scanning for hardware node...");

        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SPP_SERVICE_UUID] }]
        });

        const server = await device.gatt.connect();

        const service = await server.getPrimaryService(SPP_SERVICE_UUID);

        const characteristics = await service.getCharacteristics();
        bleTxCharacteristic = characteristics[0];

        bleTxCharacteristic.addEventListener(
            'characteristicvaluechanged',
            handleIncomingData
        );

        if (bleTxCharacteristic.properties.notify) {
            await bleTxCharacteristic.startNotifications();
        }

        connectBtn.classList.add('hidden');
        statusText.textContent = "Connected";
        statusText.style.color = "var(--status-live)";
        statusIndicator.classList.add('connected');

        appendSystemAlert("Hardware node link established. Channel is live.");

        device.addEventListener('gattserverdisconnected', handleDisconnect);
    } catch (err) {
        bleTxCharacteristic = null;
        appendSystemAlert("Link failure: " + (err && err.message ? err.message : "unknown error"));
    }
}

function handleDisconnect() {
    bleTxCharacteristic = null;
    statusIndicator.classList.remove('connected');
    statusText.textContent = "Offline";
    statusText.style.color = "";
    connectBtn.classList.remove('hidden');
    appendSystemAlert("Hardware node disconnected. Link is down.");
}

function handleIncomingData(event) {
    const decoder = new TextDecoder('utf-8');
    const raw = decoder.decode(event.target.value.buffer);
    const payload = raw.trim();
    if (payload.length > 0) {
        appendBubble(payload, 'hardware');
    }
}

/* ---------------- COVERT PACKET FRAMING ---------------- */

async function sendData() {
    const text = msgInput.value.trim();

    if (text.length === 0) {
        return;
    }

    if (!establishedRole) {
        appendSystemAlert("No authenticated session. Reload and verify clearance.");
        return;
    }

    if (!bleTxCharacteristic) {
        appendSystemAlert("No active hardware link. Connect the Arduino node first.");
        return;
    }

    const packet = "[" + establishedRole + "]: " + text + "\n";

    try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(packet);
        await bleTxCharacteristic.writeValue(bytes);

        appendBubble(text, 'client');
        msgInput.value = "";
    } catch (err) {
        appendSystemAlert("Transmission failed: " + (err && err.message ? err.message : "unknown error"));
    }
}

/* ---------------- INPUT HARDENING ---------------- */

pinInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        checkAuth();
    }
});

pinInput.addEventListener('input', function () {
    pinInput.value = pinInput.value.replace(/[^0-9]/g, '').slice(0, 4);
    authError.classList.remove('visible');
    authError.textContent = "";
});
