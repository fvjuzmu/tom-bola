document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput        = document.getElementById('csvFile');
    const searchInput         = document.getElementById('searchInput');
    const importCsvButton     = document.getElementById('importCsvButton');
    const exportCsvButton     = document.getElementById('exportCsvButton');
    const installButton       = document.getElementById('installButton');
    const helpButton          = document.getElementById('helpButton');
    const optionsButton       = document.getElementById('optionsButton');
    const statusCounter       = document.getElementById('statusCounter');
    const tableBody           = document.querySelector('#csvTable tbody');
    const optionsModal        = document.getElementById('optionsModal');
    const closeModalButton    = document.querySelector('.close-button');
    const themeRadios         = document.querySelectorAll('input[name="theme"]');
    const hideCheckedCheckbox = document.getElementById('hideChecked');
    const hideLogoCheckbox    = document.getElementById('hideLogo');
    const compactModeCheckbox = document.getElementById('compactMode');
    const selectSearchCheckbox = document.getElementById('selectSearchOnFocus');
    const numericKeyboardCheckbox = document.getElementById('numericSearchKeyboard');
    const showChangedByCheckbox = document.getElementById('showChangedBy');
    const uiScaleInput        = document.getElementById('uiScale');
    const uiScaleValueLabel   = document.getElementById('uiScaleValue');
    const datasetSelect       = document.getElementById('dataset-select');

    let currentFileHash  = '';
    let tableData        = [];
    let originalFileName = '';
    let deferredPrompt;
    let lastSyncTime     = 0;
    let syncTimer        = null;
    let selectSearchOnFocus = false;
    let showChangedBy    = false;
    let clockOffset      = parseInt(localStorage.getItem('clockOffset'), 10) || 0;

    const API_URL = 'api.php';

    // Serverzeit für Toggle-Zeitstempel statt Geräteuhr direkt: gleicht Uhrenabweichung
    // aus, damit Last-Write-Wins-Vergleiche über Geräte hinweg im selben Zeitraum liegen.
    function serverNow() {
        return Date.now() + clockOffset;
    }

    // --- Anonymer Geräte-Name (wie bei Google Docs/CryptPad) ---
    const DEVICE_ADJECTIVES = ['Fröhlicher', 'Schneller', 'Mutiger', 'Stiller', 'Wilder', 'Kluger', 'Flinker', 'Ruhiger', 'Tapferer', 'Neugieriger', 'Freundlicher', 'Geduldiger', 'Sonniger', 'Verschmitzter', 'Aufmerksamer'];
    const DEVICE_ANIMALS    = ['Fuchs', 'Falke', 'Bär', 'Wolf', 'Igel', 'Hase', 'Luchs', 'Eule', 'Otter', 'Dachs', 'Biber', 'Reiher', 'Marder', 'Hirsch', 'Pinguin'];

    function getDeviceName() {
        let name = localStorage.getItem('deviceName');
        if (!name) {
            const adj    = DEVICE_ADJECTIVES[Math.floor(Math.random() * DEVICE_ADJECTIVES.length)];
            const animal = DEVICE_ANIMALS[Math.floor(Math.random() * DEVICE_ANIMALS.length)];
            name = `${adj} ${animal}`;
            localStorage.setItem('deviceName', name);
        }
        return name;
    }

    // --- PWA install ---
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (!window.matchMedia('(display-mode: standalone)').matches) {
            installButton.style.display = 'inline-block';
        }
    });

    if (!window.matchMedia('(display-mode: standalone)').matches) {
        installButton.style.display = 'inline-block';
    }

    installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
            installButton.style.display = 'none';
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
        } else {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.indexOf('firefox') > -1) {
                alert(
                    "So installieren Sie die App in Firefox:\n\n" +
                    "1. Tippen Sie auf die Drei-Punkte-Menüschaltfläche in der Adressleiste.\n" +
                    "2. Wählen Sie 'App zum Startbildschirm hinzufügen' oder 'Installieren'.\n" +
                    "3. Folgen Sie den Anweisungen auf dem Bildschirm."
                );
            } else if (ua.indexOf('chrome') > -1 || ua.indexOf('android') > -1) {
                alert(
                    "So installieren Sie die App in Chrome:\n\n" +
                    "1. Tippen Sie auf die Drei-Punkte-Menüschaltfläche oben rechts.\n" +
                    "2. Wählen Sie 'App installieren' oder 'Zum Startbildschirm hinzufügen'.\n" +
                    "3. Folgen Sie den Anweisungen auf dem Bildschirm."
                );
            } else {
                alert("Bitte verwenden Sie das Browsermenü, um die App zum Startbildschirm hinzuzufügen.");
            }
        }
    });

    window.addEventListener('appinstalled', () => {
        installButton.style.display = 'none';
        deferredPrompt = null;
    });

    csvFileInput.addEventListener('change', handleFileSelect);
    importCsvButton.addEventListener('click', () => csvFileInput.click());
    searchInput.addEventListener('input', handleSearch);
    exportCsvButton.addEventListener('click', handleExport);
    helpButton.addEventListener('click', showHelp);
    optionsButton.addEventListener('click', () => optionsModal.style.display = 'block');
    closeModalButton.addEventListener('click', () => optionsModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target === optionsModal) optionsModal.style.display = 'none';
    });

    datasetSelect.addEventListener('change', (e) => {
        const hash = e.target.value;
        if (!hash) return;
        const opt = datasetSelect.querySelector(`option[value="${CSS.escape(hash)}"]`);
        selectDataset(hash, opt ? opt.textContent : '');
    });

    // --- Options ---
    function applyTheme(theme) {
        if (theme === 'auto') {
            document.body.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } else {
            document.body.dataset.theme = theme;
        }
    }

    function applyHideChecked(shouldHide) {
        document.body.classList.toggle('hide-checked', shouldHide);
    }

    function applyHideLogo(shouldHide) {
        document.body.classList.toggle('hide-logo', shouldHide);
    }

    function applyCompactMode(shouldEnable) {
        document.body.classList.toggle('compact-mode', shouldEnable);
    }

    function applyNumericSearchKeyboard(shouldEnable) {
        if (shouldEnable) {
            searchInput.setAttribute('inputmode', 'numeric');
        } else {
            searchInput.removeAttribute('inputmode');
        }
    }

    function applyUiScale(percent) {
        document.documentElement.style.setProperty('--ui-scale', percent / 100);
        uiScaleValueLabel.textContent = `${percent}%`;
    }

    themeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('theme', e.target.value);
            applyTheme(e.target.value);
        });
    });

    hideCheckedCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('hideChecked', e.target.checked);
        applyHideChecked(e.target.checked);
    });

    hideLogoCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('hideLogo', e.target.checked);
        applyHideLogo(e.target.checked);
    });

    compactModeCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('compactMode', e.target.checked);
        applyCompactMode(e.target.checked);
    });

    selectSearchCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('selectSearchOnFocus', e.target.checked);
        selectSearchOnFocus = e.target.checked;
    });

    numericKeyboardCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('numericSearchKeyboard', e.target.checked);
        applyNumericSearchKeyboard(e.target.checked);
    });

    showChangedByCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('showChangedBy', e.target.checked);
        showChangedBy = e.target.checked;
        renderTable(getFilteredData());
    });

    uiScaleInput.addEventListener('input', (e) => {
        applyUiScale(parseInt(e.target.value, 10));
    });

    uiScaleInput.addEventListener('change', (e) => {
        localStorage.setItem('uiScale', e.target.value);
    });

    function loadOptions() {
        const savedTheme       = localStorage.getItem('theme') || 'auto';
        const savedHideChecked = localStorage.getItem('hideChecked') === 'true';
        const savedHideLogo    = localStorage.getItem('hideLogo') === 'true';
        const savedCompactMode = localStorage.getItem('compactMode') === 'true';
        const savedSelectSearchOnFocus = localStorage.getItem('selectSearchOnFocus') === 'true';
        const savedNumericSearchKeyboard = localStorage.getItem('numericSearchKeyboard') === 'true';
        const savedShowChangedBy = localStorage.getItem('showChangedBy') === 'true';
        const savedUiScale = localStorage.getItem('uiScale') || '100';
        document.querySelector(`input[name="theme"][value="${savedTheme}"]`).checked = true;
        hideCheckedCheckbox.checked = savedHideChecked;
        hideLogoCheckbox.checked    = savedHideLogo;
        compactModeCheckbox.checked = savedCompactMode;
        selectSearchCheckbox.checked = savedSelectSearchOnFocus;
        numericKeyboardCheckbox.checked = savedNumericSearchKeyboard;
        showChangedByCheckbox.checked = savedShowChangedBy;
        uiScaleInput.value = savedUiScale;
        applyTheme(savedTheme);
        applyHideChecked(savedHideChecked);
        applyHideLogo(savedHideLogo);
        applyCompactMode(savedCompactMode);
        applyNumericSearchKeyboard(savedNumericSearchKeyboard);
        applyUiScale(parseInt(savedUiScale, 10));
        selectSearchOnFocus = savedSelectSearchOnFocus;
        showChangedBy = savedShowChangedBy;
    }

    // --- API sync ---
    function setSyncStatus(state, text) {
        const dot    = document.getElementById('sync-dot');
        const status = document.getElementById('sync-status');
        if (dot)    dot.dataset.state = state;
        if (status) status.textContent = text;
    }

    // --- Dataset management ---
    async function loadDatasets() {
        try {
            const r    = await fetch(`${API_URL}?action=datasets`);
            const data = await r.json();
            renderDatasetDropdown(data.datasets || []);

            const saved = localStorage.getItem('lastCsvHash');
            const found = (data.datasets || []).find(d => d.hash === saved);
            if (found) {
                selectDataset(found.hash, found.filename);
            } else if (data.datasets && data.datasets.length === 1) {
                selectDataset(data.datasets[0].hash, data.datasets[0].filename);
            }
        } catch (e) {
            // offline: loadLastFile() already rendered from localStorage
        }
    }

    function renderDatasetDropdown(datasets) {
        datasetSelect.innerHTML = '<option value="">— Datei auswählen —</option>';
        datasets.forEach(d => {
            const opt = document.createElement('option');
            opt.value       = d.hash;
            opt.textContent = d.filename;
            datasetSelect.appendChild(opt);
        });
    }

    function selectDataset(hash, filename) {
        const isNewDataset = hash !== currentFileHash;
        currentFileHash  = hash;
        originalFileName = filename;
        datasetSelect.value = hash;
        if (isNewDataset) {
            tableData    = [];
            lastSyncTime = 0;
        } else {
            lastSyncTime = getStoredSyncTime(hash);
        }
        startPolling();
    }

    async function postCsv(content, filename, hash) {
        setSyncStatus('syncing', 'Lädt…');
        try {
            const r = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'load_csv', content, filename, hash })
            });
            const data = await r.json();
            if (!data.ok) throw new Error(data.error || 'Fehler');
            setSyncStatus('ok', 'Synchronisiert');
            // Refresh dataset list and select the just-uploaded one
            await loadDatasets();
            datasetSelect.value = hash;
            if (currentFileHash !== hash) selectDataset(hash, filename);
        } catch (err) {
            console.warn('CSV-Upload-Fehler:', err);
            setSyncStatus('error', 'Server nicht erreichbar');
        }
    }

    async function postToggle(id, checked, ts) {
        if (!currentFileHash) return;
        try {
            const r = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle', id, dataset: currentFileHash, checked, ts, device: getDeviceName() })
            });
            const data = await r.json().catch(() => null);
            if (!r.ok || !data || !data.ok) throw new Error(`HTTP ${r.status}`);
            clearPendingToggle(currentFileHash, id, checked, ts);
            setSyncStatus('ok', 'Synchronisiert');
        } catch (err) {
            console.warn('Toggle-Sync-Fehler:', err);
            setSyncStatus('error', 'Sync-Fehler');
        }
    }

    // --- Pending-Toggle-Queue (offline abgehakte Items, die noch nicht auf dem Server sind) ---
    function pendingKey(hash) {
        return `pendingToggles:${hash}`;
    }

    function getPendingToggles(hash) {
        if (!hash) return {};
        const raw = localStorage.getItem(pendingKey(hash));
        return raw ? JSON.parse(raw) : {};
    }

    function savePendingToggles(hash, pending) {
        if (!hash) return;
        localStorage.setItem(pendingKey(hash), JSON.stringify(pending));
    }

    function queuePendingToggle(hash, id, checked, ts) {
        const pending = getPendingToggles(hash);
        pending[id] = { checked, ts };
        savePendingToggles(hash, pending);
    }

    function clearPendingToggle(hash, id, checked, ts) {
        const pending = getPendingToggles(hash);
        const entry   = pending[id];
        if (entry && entry.checked === checked && entry.ts === ts) {
            delete pending[id];
            savePendingToggles(hash, pending);
        }
    }

    function clearPendingToggles(hash) {
        if (!hash) return;
        localStorage.removeItem(pendingKey(hash));
    }

    async function flushPendingToggles() {
        if (!currentFileHash) return;
        try {
            const pending = getPendingToggles(currentFileHash);
            const ids = Object.keys(pending);
            if (ids.length === 0) return;

            const items = ids.map(id => ({ id, checked: pending[id].checked, ts: pending[id].ts }));
            const r = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle_batch', dataset: currentFileHash, items, device: getDeviceName() })
            });
            const data = await r.json().catch(() => null);
            if (r.ok && data && data.ok) {
                clearPendingToggles(currentFileHash);
            }
        } catch (err) {
            console.warn('Batch-Sync-Fehler:', err);
        }
    }

    // --- Sync-Zeitpunkt je Datensatz persistieren ---
    function syncTimeKey(hash) {
        return `lastSyncTime:${hash}`;
    }

    function getStoredSyncTime(hash) {
        if (!hash) return 0;
        const v = localStorage.getItem(syncTimeKey(hash));
        return v ? (parseInt(v, 10) || 0) : 0;
    }

    function setStoredSyncTime(hash, value) {
        if (!hash) return;
        localStorage.setItem(syncTimeKey(hash), String(value));
    }

    // --- Wer/wann zuletzt abgehakt hat, je Datensatz persistiert ---
    function metaKey(hash) {
        return `itemMeta:${hash}`;
    }

    function getItemMeta(hash) {
        if (!hash) return {};
        const raw = localStorage.getItem(metaKey(hash));
        return raw ? JSON.parse(raw) : {};
    }

    function saveItemMeta(hash, meta) {
        if (!hash) return;
        localStorage.setItem(metaKey(hash), JSON.stringify(meta));
    }

    function setItemMeta(hash, id, by, at) {
        const meta = getItemMeta(hash);
        meta[id] = { by, at };
        saveItemMeta(hash, meta);
    }

    async function fetchChanges() {
        if (!currentFileHash) return;
        try {
            const r = await fetch(`${API_URL}?since=${lastSyncTime}&hash=${currentFileHash}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            lastSyncTime = data.server_time;
            setStoredSyncTime(currentFileHash, lastSyncTime);
            clockOffset = data.server_time - Date.now();
            localStorage.setItem('clockOffset', String(clockOffset));

            if (data.items && data.items.length > 0) {
                // Bootstrap: first fetch (since=0) with no local data
                if (tableData.length === 0) {
                    tableData = data.items.map(i => ({ id: i.id, name: i.name }));
                    tableData.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
                    const checkedIds = data.items.filter(i => i.checked).map(i => i.id);
                    saveCheckedStates(checkedIds);
                    const meta = {};
                    data.items.forEach(i => { meta[i.id] = { by: i.changed_by || '', at: i.updated_at }; });
                    saveItemMeta(currentFileHash, meta);
                    const csvContent = 'id,name\n' + tableData.map(i => `${i.id},"${i.name}"`).join('\n');
                    localStorage.setItem('lastCsvContent',  csvContent);
                    localStorage.setItem('lastCsvHash',      currentFileHash);
                    localStorage.setItem('lastCsvFileName',  originalFileName);
                } else {
                    applyServerState(data.items);
                }
                renderTable(getFilteredData());
                updateStatusCounter();
            }
            setSyncStatus('ok', 'Synchronisiert');
        } catch (err) {
            console.warn('Sync-Fehler:', err);
            setSyncStatus('error', 'Server nicht erreichbar');
        }
    }

    function applyServerState(items) {
        if (!currentFileHash) return;
        let checkedStates = getCheckedStates();
        let changed = false;
        const meta = getItemMeta(currentFileHash);
        items.forEach(({ id, checked, changed_by, updated_at }) => {
            const isChecked  = Boolean(checked);
            const wasChecked = checkedStates.includes(id);
            if (isChecked && !wasChecked) {
                checkedStates.push(id);
                changed = true;
            } else if (!isChecked && wasChecked) {
                checkedStates = checkedStates.filter(cid => cid !== id);
                changed = true;
            }
            meta[id] = { by: changed_by || '', at: updated_at };
        });
        saveItemMeta(currentFileHash, meta);
        if (changed) {
            saveCheckedStates(checkedStates);
            renderTable(getFilteredData());
            updateStatusCounter();
        }
    }

    async function startPolling() {
        if (syncTimer) clearInterval(syncTimer);
        await flushPendingToggles();
        fetchChanges();
        syncTimer = setInterval(async () => {
            await flushPendingToggles();
            fetchChanges();
        }, 10000);
    }

    // --- Help ---
    const helpModal      = document.getElementById('helpModal');
    const helpModalClose = document.getElementById('helpModalClose');
    helpModalClose.addEventListener('click', () => helpModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target === helpModal) helpModal.style.display = 'none';
    });

    function showHelp() {
        helpModal.style.display = 'block';
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    function processCsvContent(fileContent) {
        const lines      = fileContent.split('\n').filter(line => line.trim() !== '');
        const headerLine = lines.shift().trim();
        const delimiter  = headerLine.includes(';') ? ';' : ',';
        const headers    = headerLine.split(delimiter);
        const idIndex    = headers.indexOf('id');
        const nameIndex  = headers.indexOf('name');
        const checkedIndex = headers.indexOf('checked');

        if (idIndex === -1 || nameIndex === -1) {
            alert('Die CSV-Datei muss die Spalten "id" und "name" enthalten.');
            return;
        }

        const initialCheckedStates = [];
        tableData = lines.map(line => {
            const values = line.trim().split(delimiter);
            const item   = {
                id:   values[idIndex],
                name: values[nameIndex] ? values[nameIndex].replace(/"/g, '') : ''
            };
            if (checkedIndex !== -1 && values[checkedIndex] === 'true') {
                initialCheckedStates.push(item.id);
            }
            return item;
        });

        tableData.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

        if (checkedIndex !== -1) saveCheckedStates(initialCheckedStates);

        renderTable(getFilteredData());
        updateStatusCounter();
    }

    async function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        originalFileName = file.name;

        try {
            const fileContent = await readFileAsText(file);

            if (window.crypto && window.crypto.subtle) {
                currentFileHash = await generateHash(fileContent);
            } else {
                currentFileHash = file.name;
            }

            localStorage.setItem('lastCsvContent',  fileContent);
            localStorage.setItem('lastCsvHash',      currentFileHash);
            localStorage.setItem('lastCsvFileName',  originalFileName);

            processCsvContent(fileContent);
            postCsv(fileContent, originalFileName, currentFileHash);
        } catch (error) {
            console.error("Fehler bei der Dateiverarbeitung:", error);
            alert("Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
        }
    }

    function loadLastFile() {
        const lastCsvContent  = localStorage.getItem('lastCsvContent');
        const lastCsvHash     = localStorage.getItem('lastCsvHash');
        const lastCsvFileName = localStorage.getItem('lastCsvFileName');

        if (lastCsvContent && lastCsvHash) {
            currentFileHash  = lastCsvHash;
            originalFileName = lastCsvFileName;
            processCsvContent(lastCsvContent);
        }
    }

    fetch('/VERSION').then(r => r.text()).then(v => {
        const el = document.getElementById('app-version');
        if (el) el.textContent = `v${v.trim()}`;
    }).catch(() => {});

    loadLastFile();
    loadOptions();
    loadDatasets();

    function updateStatusCounter() {
        const totalRows   = tableData.length;
        const checkedRows = getCheckedStates().length;
        statusCounter.textContent = totalRows > 0 ? `Ausgegeben: ${checkedRows} / ${totalRows}` : '';
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        const checkedStates = getCheckedStates();
        const searchTerm    = searchInput.value;

        data.forEach(item => {
            const row       = document.createElement('tr');
            const isChecked = checkedStates.includes(item.id);
            if (isChecked) row.classList.add('checked');

            let idContent   = item.id;
            let nameContent = item.name;

            if (searchTerm) {
                const lowerSearchTerm = searchTerm.toLowerCase();
                if (item.id.toLowerCase().startsWith(lowerSearchTerm)) {
                    idContent = `<mark>${item.id.slice(0, searchTerm.length)}</mark>${item.id.slice(searchTerm.length)}`;
                }
                if (item.name.toLowerCase().includes(lowerSearchTerm)) {
                    const regex = new RegExp(searchTerm.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
                    nameContent = item.name.replace(regex, match => `<mark>${match}</mark>`);
                }
            }

            row.innerHTML = `
                <td><input type="checkbox" ${isChecked ? 'checked' : ''}></td>
                <td>${idContent}</td>
                <td>${nameContent}</td>
            `;

            renderChangedByInfo(row, item.id, isChecked);

            row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                toggleCheckState(row, item.id, e.target.checked);
            });

            tableBody.appendChild(row);
        });
    }

    function renderChangedByInfo(row, id, isChecked) {
        const nameTd = row.children[2];
        const existing = nameTd.querySelector('.changed-by');
        if (existing) {
            const br = existing.previousElementSibling;
            existing.remove();
            if (br && br.tagName === 'BR') br.remove();
        }

        if (!showChangedBy || !isChecked) return;
        const meta = getItemMeta(currentFileHash)[id];
        if (!meta || !meta.by) return;

        const time = new Date(meta.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        nameTd.appendChild(document.createElement('br'));
        const small = document.createElement('small');
        small.className   = 'changed-by';
        small.textContent = `${meta.by}, ${time}`;
        nameTd.appendChild(small);
    }

    function getFilteredData() {
        const searchTerm = searchInput.value.toLowerCase();
        if (!searchTerm) return tableData;
        return tableData.filter(item =>
            item.id.toLowerCase().startsWith(searchTerm) || item.name.toLowerCase().includes(searchTerm)
        );
    }

    function handleSearch() {
        renderTable(getFilteredData());
    }

    function toggleCheckState(row, id, isChecked) {
        if (!isChecked) {
            if (!confirm("Wirklich?")) {
                row.querySelector('input[type="checkbox"]').checked = true;
                return;
            }
        }

        row.classList.toggle('checked', isChecked);
        let checkedStates = getCheckedStates();
        if (isChecked) {
            if (!checkedStates.includes(id)) checkedStates.push(id);
        } else {
            checkedStates = checkedStates.filter(cid => cid !== id);
        }
        saveCheckedStates(checkedStates);
        updateStatusCounter();
        const ts = serverNow();
        setItemMeta(currentFileHash, id, getDeviceName(), ts);
        renderChangedByInfo(row, id, isChecked);
        queuePendingToggle(currentFileHash, id, isChecked, ts);
        postToggle(id, isChecked, ts);
        searchInput.focus();
        if (selectSearchOnFocus) {
            searchInput.select();
        }
    }

    function getCheckedStates() {
        if (!currentFileHash) return [];
        const states = localStorage.getItem(currentFileHash);
        return states ? JSON.parse(states) : [];
    }

    function saveCheckedStates(states) {
        if (!currentFileHash) return;
        localStorage.setItem(currentFileHash, JSON.stringify(states));
    }

    function handleExport() {
        if (tableData.length === 0) {
            alert("Keine Daten zum Exportieren vorhanden.");
            return;
        }

        const checkedStates = getCheckedStates();
        let csvContent = "id,name,checked\r\n";
        tableData.forEach(item => {
            csvContent += `${item.id},"${item.name}",${checkedStates.includes(item.id)}\r\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url  = URL.createObjectURL(blob);
        const date = new Date();
        const ds   = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
        const ts   = `${String(date.getHours()).padStart(2,'0')}${String(date.getMinutes()).padStart(2,'0')}`;
        const base = originalFileName.replace(/\.csv$/i, '');

        link.setAttribute("href", url);
        link.setAttribute("download", `${base}_export_${ds}_${ts}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function generateHash(string) {
        const utf8       = new TextEncoder().encode(string);
        const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
        const hashArray  = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- PWA update ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js');
        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
});
