// Adjektive im Maskulinum (Endung -er); Genus-Anpassung erfolgt in generateAnimalName
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

const ICE_SERVERS = [
    { urls: ['stun:relay.adminforge.de:443', 'stun:relay2.adminforge.de:443', 'stun:stun.l.google.com:19302'] },
    { urls: ['turn:relay.adminforge.de:443', 'turn:relay2.adminforge.de:443'] }
];

let ydoc = null;
let provider = null;
let checkedMap = null;
let csvDataMap = null;
let isConnected = false;
let pendingCsv = null;

function generateAnimalName() {
    const adj  = ADJEKTIVE[Math.floor(Math.random() * ADJEKTIVE.length)];
    const tier = TIERE[Math.floor(Math.random() * TIERE.length)];
    const stem = adj.slice(0, -2); // 'Lustiger' → 'Lustig'
    const declined = tier.g === 'n' ? stem + 'es'
                   : tier.g === 'f' ? stem + 'e'
                   : adj; // Maskulinum bleibt unverändert
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

    if (!provider) {
        peerListEl.innerHTML = '<em>Nicht verbunden</em>';
        return;
    }

    const states = provider.awareness.getStates();
    const peers = [];
    states.forEach((state, clientId) => {
        if (clientId === provider.awareness.clientID) return;
        const name = (state.user && state.user.name) ? state.user.name : 'Unbekannt';
        peers.push(name);
    });

    if (peers.length === 0) {
        if (isConnected) setStatus('connected', 'Suche Mitspieler…');
        peerListEl.innerHTML = '<em>Keine weiteren Mitspieler im Raum</em>';
    } else {
        setStatus('connected', `${peers.length} Mitspieler verbunden`);
        peerListEl.innerHTML = peers
            .map(name => `<span class="collab-peer-badge"><span class="collab-peer-dot"></span>${name}</span>`)
            .join('');
    }
}

function shareCurrentCsv() {
    if (!csvDataMap || !pendingCsv || !ydoc) return;
    ydoc.transact(() => {
        csvDataMap.set('content', pendingCsv.content);
        csvDataMap.set('hash', pendingCsv.hash);
        csvDataMap.set('filename', pendingCsv.filename);
    });
}

function handleRemoteCsv() {
    if (!csvDataMap) return;
    const remoteContent = csvDataMap.get('content');
    const remoteHash = csvDataMap.get('hash');
    const remoteFilename = csvDataMap.get('filename') || 'teilnehmer.csv';

    if (!remoteContent || !remoteHash) return;
    if (pendingCsv && pendingCsv.hash === remoteHash) return;

    const localHash = localStorage.getItem('lastCsvHash');

    let msg;
    if (!localHash) {
        msg = `Eine CSV ist im Raum verfügbar (${remoteFilename}). Laden?`;
    } else if (localHash !== remoteHash) {
        msg = `Die CSV im Raum (${remoteFilename}) unterscheidet sich von deiner. Raum-CSV laden?`;
    } else {
        return;
    }

    if (confirm(msg)) {
        window.dispatchEvent(new CustomEvent('tombola:remotecsv', {
            detail: { content: remoteContent, hash: remoteHash, filename: remoteFilename }
        }));
    }
}

async function connect(roomCode) {
    const toggle = document.getElementById('collab-toggle');
    const roomInput = document.getElementById('collab-room-input');
    const shareBtn = document.getElementById('collab-share');

    if (toggle) toggle.disabled = true;
    setStatus('connecting', 'Lade Bibliotheken…');

    let Y, WebrtcProvider;
    try {
        Y = await import('https://esm.sh/yjs@13');
        ({ WebrtcProvider } = await import('https://esm.sh/y-webrtc@10'));
    } catch (err) {
        console.error('collab: Bibliothek nicht ladbar', err);
        setStatus('offline', navigator.onLine ? 'Bibliothek nicht verfügbar' : 'Kein Netzwerk');
        if (toggle) toggle.disabled = false;
        return;
    }

    ydoc = new Y.Doc();
    checkedMap = ydoc.getMap('checkedMap');
    csvDataMap = ydoc.getMap('csvData');

    // Pre-populate with current local checked state so it's included in the CRDT merge
    const localHash = localStorage.getItem('lastCsvHash');
    if (localHash) {
        const localChecked = JSON.parse(localStorage.getItem(localHash) || '[]');
        if (localChecked.length > 0) {
            ydoc.transact(() => {
                localChecked.forEach(id => checkedMap.set(id, true));
            });
        }
    }

    setStatus('connecting', 'Verbinde…');

    const customSignaling = localStorage.getItem('collab_signaling_url');
    const signalingServers = customSignaling
        ? [customSignaling]
        : ['wss://y-webrtc-eu.fly.dev', 'wss://y-webrtc-us.fly.dev'];

    provider = new WebrtcProvider(roomCode, ydoc, {
        signaling: signalingServers,
        password: roomCode,
        peerOpts: { config: { iceServers: ICE_SERVERS } },
        maxConns: 5
    });

    provider.awareness.setLocalStateField('user', { name: getClientName() });

    provider.on('status', ({ connected }) => {
        if (connected) {
            if (!isConnected) {
                isConnected = true;
                if (toggle) { toggle.disabled = false; toggle.textContent = 'Trennen'; }
                if (roomInput) roomInput.disabled = true;
                if (shareBtn) shareBtn.style.display = 'inline-block';
                const url = new URL(window.location.href);
                url.searchParams.set('room', roomCode);
                window.history.replaceState({}, '', url.toString());
                localStorage.setItem('collab_last_room', roomCode);
                if (pendingCsv) shareCurrentCsv();
            }
            setStatus('connected', 'Suche Mitspieler…');
            updatePeerList();
        } else if (isConnected) {
            setStatus('connecting', 'Verbindung unterbrochen…');
        }
    });

    provider.awareness.on('change', () => updatePeerList());
    provider.on('peers', () => updatePeerList());

    checkedMap.observe(event => {
        if (event.transaction.local) return;
        const checkedIds = [];
        checkedMap.forEach((val, key) => { if (val) checkedIds.push(key); });
        window.dispatchEvent(new CustomEvent('tombola:remotechange', { detail: { checkedIds } }));
    });

    csvDataMap.observe(event => {
        if (event.transaction.local) return;
        handleRemoteCsv();
    });
}

function disconnect() {
    if (provider) { provider.destroy(); provider = null; }
    if (ydoc) { ydoc.destroy(); ydoc = null; }
    checkedMap = null;
    csvDataMap = null;
    isConnected = false;

    const toggle = document.getElementById('collab-toggle');
    const roomInput = document.getElementById('collab-room-input');
    const shareBtn = document.getElementById('collab-share');

    if (toggle) { toggle.textContent = 'Verbinden'; toggle.disabled = false; }
    if (roomInput) roomInput.disabled = false;
    if (shareBtn) shareBtn.style.display = 'none';

    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
    localStorage.removeItem('collab_last_room');

    setStatus('offline', 'Getrennt');
    updatePeerList();
}

// Bridge: receive CSV from app when loaded/restored
window.addEventListener('tombola:csvloaded', (e) => {
    pendingCsv = e.detail;
    if (csvDataMap && isConnected) shareCurrentCsv();
});

// Bridge: propagate local checkbox change to Yjs
window.addEventListener('tombola:localchange', (e) => {
    if (!checkedMap) return;
    const { id, isChecked } = e.detail;
    if (isChecked) {
        checkedMap.set(id, true);
    } else {
        checkedMap.delete(id);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const myNameEl = document.getElementById('collab-myname');
    const toggle = document.getElementById('collab-toggle');
    const roomInput = document.getElementById('collab-room-input');
    const shareBtn = document.getElementById('collab-share');

    if (myNameEl) {
        myNameEl.textContent = getClientName();
        myNameEl.addEventListener('click', () => {
            const newName = generateAnimalName();
            localStorage.setItem('collab_client_name', newName);
            myNameEl.textContent = newName;
            if (provider) provider.awareness.setLocalStateField('user', { name: newName });
        });
    }

    const roomFromUrl = new URLSearchParams(window.location.search).get('room');
    if (roomInput && roomFromUrl) roomInput.value = roomFromUrl;

    if (toggle) {
        toggle.addEventListener('click', () => {
            if (isConnected) {
                disconnect();
            } else {
                const code = roomInput ? roomInput.value.trim() : '';
                if (!code) { if (roomInput) roomInput.focus(); return; }
                connect(code);
            }
        });
    }

    const revealBtn = document.getElementById('collab-room-reveal');
    if (revealBtn && roomInput) {
        let revealTimer = null;
        const hide = () => {
            roomInput.type = 'password';
            revealBtn.textContent = '👁';
            clearTimeout(revealTimer);
            revealTimer = null;
        };
        revealBtn.addEventListener('click', () => {
            if (roomInput.type === 'text') {
                hide();
            } else {
                roomInput.type = 'text';
                revealBtn.textContent = '🙈';
                roomInput.focus();
                revealTimer = setTimeout(hide, 15000);
            }
        });
    }

    if (shareBtn) {
        shareBtn.style.display = 'none';
        shareBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                const orig = shareBtn.textContent;
                shareBtn.textContent = 'Kopiert!';
                setTimeout(() => shareBtn.textContent = orig, 2000);
            }).catch(() => prompt('Link kopieren:', window.location.href));
        });
    }

    window.addEventListener('online', () => {
        if (isConnected) return;
        const savedRoom = localStorage.getItem('collab_last_room');
        if (savedRoom) {
            connect(savedRoom);
        } else {
            setStatus('offline', 'Nicht verbunden');
        }
    });
    window.addEventListener('offline', () => { if (!isConnected) setStatus('offline', 'Kein Netzwerk'); });

    setStatus('offline', navigator.onLine ? 'Nicht verbunden' : 'Kein Netzwerk');

    const lastRoom = localStorage.getItem('collab_last_room')
        || new URLSearchParams(window.location.search).get('room');
    if (lastRoom) {
        if (roomInput) roomInput.value = lastRoom;
        if (navigator.onLine) connect(lastRoom);
    }
});
