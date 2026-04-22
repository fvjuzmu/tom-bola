const ADJEKTIVE = [
    'Lustiger', 'Fluffiger', 'Schneller', 'Wilder', 'Kluger',
    'Tapferer', 'Fauler', 'Frecher', 'Braver', 'Starker',
    'Leiser', 'Lauter', 'Bunter', 'Dicker', 'Schlauer',
    'Mutiger', 'Neugieriger', 'Fröhlicher', 'Sanfter', 'Grimmiger',
    'Eleganter', 'Verschlafener', 'Zerzauster'
];

// g: 'm' = Maskulinum, 'f' = Femininum, 'n' = Neutrum
const TIERE = [
    { name: 'Hamster',      g: 'm' },
    { name: 'Igel',         g: 'm' },
    { name: 'Fuchs',        g: 'm' },
    { name: 'Bär',          g: 'm' },
    { name: 'Wolf',         g: 'm' },
    { name: 'Adler',        g: 'm' },
    { name: 'Pinguin',      g: 'm' },
    { name: 'Dachs',        g: 'm' },
    { name: 'Otter',        g: 'm' },
    { name: 'Biber',        g: 'm' },
    { name: 'Panda',        g: 'm' },
    { name: 'Luchs',        g: 'm' },
    { name: 'Waschbär',     g: 'm' },
    { name: 'Eichhörnchen', g: 'n' },
    { name: 'Maulwurf',     g: 'm' },
    { name: 'Flamingo',     g: 'm' },
    { name: 'Erdmännchen',  g: 'n' },
    { name: 'Schnabeltier', g: 'n' },
    { name: 'Wombat',       g: 'm' },
    { name: 'Känguru',      g: 'n' },
];

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let pc = null;
let dc = null;
let peerName = null;
let isConnected = false;
let pendingCsv = null;
let scanStream = null;
let scanRafId = null;

function generateAnimalName() {
    const adj  = ADJEKTIVE[Math.floor(Math.random() * ADJEKTIVE.length)];
    const tier = TIERE[Math.floor(Math.random() * TIERE.length)];
    const stem = adj.slice(0, -2);
    const declined = tier.g === 'n' ? stem + 'es'
                   : tier.g === 'f' ? stem + 'e'
                   : adj;
    return `${declined} ${tier.name}`;
}

function getClientName() {
    let name = localStorage.getItem('collab_client_name');
    if (!name) {
        name = generateAnimalName();
        localStorage.setItem('collab_client_name', name);
    }
    return name;
}

function setStatus(state, text) {
    const dot = document.getElementById('collab-dot');
    const status = document.getElementById('collab-status');
    if (dot) dot.dataset.state = state;
    if (status) status.textContent = text;
}

function updatePeerList() {
    const peerListEl = document.getElementById('collab-peer-list');
    if (!peerListEl) return;
    if (!isConnected || !peerName) {
        peerListEl.innerHTML = '<em>Nicht verbunden</em>';
        return;
    }
    peerListEl.innerHTML = `<span class="collab-peer-badge"><span class="collab-peer-dot"></span>${peerName}</span>`;
}

// --- ICE & SDP helpers ---

function waitForIceGathering(peerConn, ms = 4000) {
    return new Promise(resolve => {
        if (peerConn.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, ms);
        const handler = () => {
            if (peerConn.iceGatheringState === 'complete') {
                clearTimeout(timeout);
                peerConn.removeEventListener('icegatheringstatechange', handler);
                resolve();
            }
        };
        peerConn.addEventListener('icegatheringstatechange', handler);
    });
}

async function sdpToQrData(sdp) {
    const LZString = (await import('https://esm.sh/lz-string@1')).default;
    return LZString.compressToBase64(JSON.stringify({ type: sdp.type, sdp: sdp.sdp }));
}

async function qrDataToSdp(data) {
    const LZString = (await import('https://esm.sh/lz-string@1')).default;
    return JSON.parse(LZString.decompressFromBase64(data));
}

async function renderQR(data, canvasEl) {
    const QRCode = (await import('https://esm.sh/qrcode@1')).default;
    await QRCode.toCanvas(canvasEl, data, { width: 280, margin: 1 });
}

// --- Camera scanning ---

function stopCameraScan() {
    if (scanRafId) { cancelAnimationFrame(scanRafId); scanRafId = null; }
    if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
}

async function startCameraScan(videoEl, onResult) {
    stopCameraScan();

    let jsQR;
    try {
        jsQR = (await import('https://esm.sh/jsqr@1')).default;
    } catch (err) {
        showPairingError('Scan-Bibliothek nicht ladbar. Bitte Internetverbindung prüfen.');
        return;
    }

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (err) {
        showPairingError('Kamerazugriff verweigert. Bitte Berechtigung erteilen und erneut versuchen.');
        return;
    }

    scanStream = stream;
    videoEl.srcObject = stream;
    videoEl.play().catch(() => {});

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    function scan() {
        if (!scanStream) return;
        if (videoEl.readyState >= videoEl.HAVE_ENOUGH_DATA && videoEl.videoWidth > 0) {
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
            if (code) {
                stopCameraScan();
                onResult(code.data);
                return;
            }
        }
        scanRafId = requestAnimationFrame(scan);
    }
    scanRafId = requestAnimationFrame(scan);
}

function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Kopiert!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    }).catch(() => prompt('Text kopieren:', text));
}

// --- Pairing modal ---

function openPairingModal() {
    const modal = document.getElementById('pairingModal');
    if (modal) modal.style.display = 'block';
    showPairingStep('role');
}

function closePairingModal() {
    const modal = document.getElementById('pairingModal');
    if (modal) modal.style.display = 'none';
}

function abortPairing() {
    stopCameraScan();
    closePairingModal();
    if (!isConnected) {
        if (dc) { try { dc.close(); } catch (e) {} dc = null; }
        if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    }
}

function showPairingError(msg) {
    const el = document.getElementById('pairing-content');
    if (!el) return;
    el.innerHTML = `
        <h2>Fehler</h2>
        <p>${msg}</p>
        <button class="pairing-role-btn" id="pairing-retry-btn">Erneut versuchen</button>
    `;
    document.getElementById('pairing-retry-btn').addEventListener('click', openPairingModal);
}

function showPairingStep(step, data) {
    const el = document.getElementById('pairing-content');
    if (!el) return;

    switch (step) {
        case 'role':
            el.innerHTML = `
                <h2>Verbinden</h2>
                <p class="pairing-hint">Wie möchtest du verbinden?</p>
                <button class="pairing-role-btn" id="pairing-initiator-btn">Neuen Raum erstellen</button>
                <button class="pairing-role-btn" id="pairing-joiner-btn">Bestehendem Raum beitreten</button>
            `;
            document.getElementById('pairing-initiator-btn').addEventListener('click', startAsInitiator);
            document.getElementById('pairing-joiner-btn').addEventListener('click', startAsJoiner);
            break;

        case 'offer-loading':
            el.innerHTML = `<h2>Verbindungsangebot wird erstellt…</h2><p class="pairing-hint">Bitte warten…</p>`;
            break;

        case 'offer-qr':
            el.innerHTML = `
                <h2>QR-Code vorzeigen</h2>
                <p class="pairing-hint">Bitte die andere Person diesen QR-Code scannen:</p>
                <canvas id="pairing-qr-canvas"></canvas>
                <button class="pairing-role-btn" id="pairing-copy-offer-btn">Text kopieren</button>
                <button class="pairing-role-btn" id="pairing-scan-answer-btn">Antwort-QR scannen</button>
            `;
            renderQR(data, document.getElementById('pairing-qr-canvas'))
                .catch(() => showPairingError('QR-Code konnte nicht erstellt werden.'));
            document.getElementById('pairing-copy-offer-btn').addEventListener('click', () => {
                copyToClipboard(data, document.getElementById('pairing-copy-offer-btn'));
            });
            document.getElementById('pairing-scan-answer-btn').addEventListener('click', startScanningAnswer);
            break;

        case 'scan-offer':
            el.innerHTML = `
                <h2>QR-Code scannen</h2>
                <p class="pairing-hint">Scanne den QR-Code der anderen Person:</p>
                <video id="pairing-video" autoplay playsinline muted></video>
                <p class="pairing-hint" style="margin-top:12px">Oder Text manuell einfügen:</p>
                <textarea id="pairing-manual-input" class="pairing-manual-input" placeholder="Verbindungstext hier einfügen…" rows="3"></textarea>
                <button class="pairing-role-btn" id="pairing-manual-confirm-btn">Bestätigen</button>
            `;
            startCameraScan(document.getElementById('pairing-video'), handleScannedOffer);
            document.getElementById('pairing-manual-confirm-btn').addEventListener('click', () => {
                const val = document.getElementById('pairing-manual-input').value.trim();
                if (val) { stopCameraScan(); handleScannedOffer(val); }
            });
            break;

        case 'answer-loading':
            el.innerHTML = `<h2>Antwort wird erstellt…</h2><p class="pairing-hint">Bitte warten…</p>`;
            break;

        case 'answer-qr':
            el.innerHTML = `
                <h2>QR-Code vorzeigen</h2>
                <p class="pairing-hint">Zeige diesen QR-Code der anderen Person und warte auf Verbindung:</p>
                <canvas id="pairing-answer-canvas"></canvas>
                <button class="pairing-role-btn" id="pairing-copy-answer-btn">Text kopieren</button>
                <p class="pairing-hint">Verbindung wird aufgebaut…</p>
            `;
            renderQR(data, document.getElementById('pairing-answer-canvas'))
                .catch(() => showPairingError('QR-Code konnte nicht erstellt werden.'));
            document.getElementById('pairing-copy-answer-btn').addEventListener('click', () => {
                copyToClipboard(data, document.getElementById('pairing-copy-answer-btn'));
            });
            break;

        case 'scan-answer':
            el.innerHTML = `
                <h2>Antwort-QR scannen</h2>
                <p class="pairing-hint">Scanne den QR-Code der anderen Person:</p>
                <video id="pairing-video-answer" autoplay playsinline muted></video>
                <p class="pairing-hint" style="margin-top:12px">Oder Text manuell einfügen:</p>
                <textarea id="pairing-manual-input" class="pairing-manual-input" placeholder="Antworttext hier einfügen…" rows="3"></textarea>
                <button class="pairing-role-btn" id="pairing-manual-confirm-btn">Bestätigen</button>
            `;
            startCameraScan(document.getElementById('pairing-video-answer'), handleScannedAnswer);
            document.getElementById('pairing-manual-confirm-btn').addEventListener('click', () => {
                const val = document.getElementById('pairing-manual-input').value.trim();
                if (val) { stopCameraScan(); handleScannedAnswer(val); }
            });
            break;

        case 'connecting':
            el.innerHTML = `<h2>Verbinde…</h2><p class="pairing-hint">Stelle Verbindung her…</p>`;
            break;
    }
}

// --- Initiator flow ---

async function startAsInitiator() {
    showPairingStep('offer-loading');
    try {
        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        dc = pc.createDataChannel('tombola');
        setupDataChannel(dc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc);

        const qrData = await sdpToQrData(pc.localDescription);
        showPairingStep('offer-qr', qrData);
    } catch (err) {
        console.error('collab: Initiator-Fehler', err);
        showPairingError('Verbindungsangebot konnte nicht erstellt werden.');
    }
}

function startScanningAnswer() {
    showPairingStep('scan-answer');
}

async function handleScannedAnswer(qrData) {
    showPairingStep('connecting');
    try {
        const answer = await qrDataToSdp(qrData);
        await pc.setRemoteDescription(answer);
    } catch (err) {
        console.error('collab: Antwort-Fehler', err);
        showPairingError('Antwort-QR ungültig oder Verbindung fehlgeschlagen.');
    }
}

// --- Joiner flow ---

function startAsJoiner() {
    showPairingStep('scan-offer');
}

async function handleScannedOffer(qrData) {
    showPairingStep('answer-loading');
    try {
        const offer = await qrDataToSdp(qrData);
        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc.ondatachannel = (e) => setupDataChannel(e.channel);

        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc);

        const qrData2 = await sdpToQrData(pc.localDescription);
        showPairingStep('answer-qr', qrData2);
    } catch (err) {
        console.error('collab: Joiner-Fehler', err);
        showPairingError('Angebot-QR ungültig oder Verbindung fehlgeschlagen.');
    }
}

// --- DataChannel ---

function setupDataChannel(channel) {
    dc = channel;

    dc.onopen = () => {
        isConnected = true;
        stopCameraScan();
        closePairingModal();
        setStatus('connected', 'Verbunden');
        updatePeerList();
        const toggle = document.getElementById('collab-toggle');
        if (toggle) toggle.textContent = 'Trennen';
        dc.send(JSON.stringify({ type: 'hello', name: getClientName() }));
        sendFullState();
    };

    dc.onclose = () => {
        const wasConnected = isConnected;
        isConnected = false;
        pc = null;
        dc = null;
        peerName = null;
        setStatus('offline', wasConnected ? 'Verbindung getrennt' : 'Nicht verbunden');
        updatePeerList();
        const toggle = document.getElementById('collab-toggle');
        if (toggle) toggle.textContent = 'Verbinden';
        if (!wasConnected) {
            const modal = document.getElementById('pairingModal');
            if (modal && modal.style.display !== 'none') {
                showPairingError('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
            }
        }
    };

    dc.onmessage = (e) => {
        try { handleMessage(JSON.parse(e.data)); }
        catch (err) { console.warn('collab: ungültige Nachricht', err); }
    };
}

// --- Sync protocol ---

function getLocalCheckedIds() {
    if (!pendingCsv) return [];
    const stored = localStorage.getItem(pendingCsv.hash);
    return stored ? JSON.parse(stored) : [];
}

function sendFullState() {
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({
        type: 'fullstate',
        checkedIds: getLocalCheckedIds(),
        csv: pendingCsv || null
    }));
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'hello':
            peerName = msg.name;
            if (isConnected) setStatus('connected', `Verbunden: ${peerName}`);
            updatePeerList();
            break;

        case 'fullstate': {
            const localIds = getLocalCheckedIds();
            const merged = [...new Set([...localIds, ...(msg.checkedIds || [])])];
            window.dispatchEvent(new CustomEvent('tombola:remotechange', { detail: { checkedIds: merged } }));
            if (msg.csv) handleRemoteCsvOffer(msg.csv);
            break;
        }

        case 'check': {
            const localIds = getLocalCheckedIds();
            if (!localIds.includes(msg.id)) {
                window.dispatchEvent(new CustomEvent('tombola:remotechange', {
                    detail: { checkedIds: [...localIds, msg.id] }
                }));
            }
            break;
        }

        case 'uncheck': {
            const localIds = getLocalCheckedIds();
            window.dispatchEvent(new CustomEvent('tombola:remotechange', {
                detail: { checkedIds: localIds.filter(id => id !== msg.id) }
            }));
            break;
        }

        case 'csv':
            handleRemoteCsvOffer(msg);
            break;
    }
}

function handleRemoteCsvOffer({ content, hash, filename = 'teilnehmer.csv' }) {
    if (!content || !hash) return;
    if (pendingCsv && pendingCsv.hash === hash) return;

    const localHash = localStorage.getItem('lastCsvHash');
    let msg;
    if (!localHash) {
        msg = `Eine CSV ist verfügbar (${filename}). Laden?`;
    } else if (localHash !== hash) {
        msg = `Die CSV der anderen Person (${filename}) unterscheidet sich. Laden?`;
    } else {
        return;
    }

    if (confirm(msg)) {
        window.dispatchEvent(new CustomEvent('tombola:remotecsv', {
            detail: { content, hash, filename }
        }));
    }
}

function disconnect() {
    stopCameraScan();
    if (dc) { try { dc.close(); } catch (e) {} }
    if (pc) { try { pc.close(); } catch (e) {} }
    dc = null;
    pc = null;
    isConnected = false;
    peerName = null;
    setStatus('offline', 'Getrennt');
    updatePeerList();
    const toggle = document.getElementById('collab-toggle');
    if (toggle) { toggle.textContent = 'Verbinden'; toggle.disabled = false; }
}

// --- CustomEvent bridge ---

window.addEventListener('tombola:csvloaded', (e) => {
    pendingCsv = e.detail;
    if (isConnected && dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'csv', ...pendingCsv }));
    }
});

window.addEventListener('tombola:localchange', (e) => {
    if (!dc || dc.readyState !== 'open') return;
    const { id, isChecked } = e.detail;
    dc.send(JSON.stringify({ type: isChecked ? 'check' : 'uncheck', id }));
});

// --- DOMContentLoaded ---

document.addEventListener('DOMContentLoaded', () => {
    const myNameEl = document.getElementById('collab-myname');
    const toggle = document.getElementById('collab-toggle');

    if (myNameEl) {
        myNameEl.textContent = getClientName();
        myNameEl.addEventListener('click', () => {
            const newName = generateAnimalName();
            localStorage.setItem('collab_client_name', newName);
            myNameEl.textContent = newName;
        });
    }

    if (toggle) {
        toggle.addEventListener('click', () => {
            if (isConnected) {
                disconnect();
            } else {
                openPairingModal();
            }
        });
    }

    const pairingClose = document.getElementById('pairing-close');
    if (pairingClose) {
        pairingClose.addEventListener('click', abortPairing);
    }

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('pairingModal');
        if (e.target === modal) abortPairing();
    });

    setStatus('offline', 'Nicht verbunden');
    updatePeerList();
});
