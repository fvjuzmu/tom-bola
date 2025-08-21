document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFile');
    const searchInput = document.getElementById('searchInput');
    const exportCsvButton = document.getElementById('exportCsvButton');
    const installButton = document.getElementById('installButton');
    const helpButton = document.getElementById('helpButton');
    const optionsButton = document.getElementById('optionsButton');
    const statusCounter = document.getElementById('statusCounter');
    const tableBody = document.querySelector('#csvTable tbody');
    const optionsModal = document.getElementById('optionsModal');
    const closeModalButton = document.querySelector('.close-button');
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    const hideCheckedCheckbox = document.getElementById('hideChecked');
    let currentFileHash = '';
    let tableData = [];
    let originalFileName = '';
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI to notify the user they can install the PWA
        if (!window.matchMedia('(display-mode: standalone)').matches) {
            installButton.style.display = 'inline-block';
        }
    });

    // For Firefox, the install prompt is not supported, so we show the button to provide instructions.
    if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 && !window.matchMedia('(display-mode: standalone)').matches) {
        installButton.style.display = 'inline-block';
    }

    installButton.addEventListener('click', async () => {
        console.log("Install button clicked.");
        if (deferredPrompt) {
            console.log("deferredPrompt is available. Showing install prompt.");
            // Hide the app provided install promotion
            installButton.style.display = 'none';
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            await deferredPrompt.userChoice;
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
        } else if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
            console.log("Browser is Firefox. Showing instructions.");
            alert(
                "So installieren Sie die App in Firefox:\n\n" +
                "1. Tippen Sie auf die Drei-Punkte-Menüschaltfläche in der Adressleiste.\n" +
                "2. Wählen Sie 'App zum Startbildschirm hinzufügen' oder 'Installieren'.\n" +
                "3. Folgen Sie den Anweisungen auf dem Bildschirm."
            );
        } else {
            console.log("deferredPrompt is not available. Cannot show install prompt. This is expected if the app is already installed or the browser's criteria haven't been met.");
            alert("Die App kann derzeit nicht installiert werden. Sie ist möglicherweise bereits installiert oder die Installationskriterien des Browsers sind nicht erfüllt.");
        }
    });

    window.addEventListener('appinstalled', () => {
        // Hide the install button
        installButton.style.display = 'none';
        // Clear the deferredPrompt so it can be garbage collected
        deferredPrompt = null;
        console.log('PWA wurde installiert');
    });

    csvFileInput.addEventListener('change', handleFileSelect);
    searchInput.addEventListener('input', handleSearch);
    exportCsvButton.addEventListener('click', handleExport);
    helpButton.addEventListener('click', showHelp);
    optionsButton.addEventListener('click', () => optionsModal.style.display = 'block');
    closeModalButton.addEventListener('click', () => optionsModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target == optionsModal) {
            optionsModal.style.display = 'none';
        }
    });

    // --- Options Logic ---
    function applyTheme(theme) {
        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.dataset.theme = prefersDark ? 'dark' : 'light';
        } else {
            document.body.dataset.theme = theme;
        }
    }

    function applyHideChecked(shouldHide) {
        document.body.classList.toggle('hide-checked', shouldHide);
    }

    themeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const theme = e.target.value;
            localStorage.setItem('theme', theme);
            applyTheme(theme);
        });
    });

    hideCheckedCheckbox.addEventListener('change', (e) => {
        const shouldHide = e.target.checked;
        localStorage.setItem('hideChecked', shouldHide);
        applyHideChecked(shouldHide);
    });

    function loadOptions() {
        const savedTheme = localStorage.getItem('theme') || 'auto';
        const savedHideChecked = localStorage.getItem('hideChecked') === 'true';

        document.querySelector(`input[name="theme"][value="${savedTheme}"]`).checked = true;
        hideCheckedCheckbox.checked = savedHideChecked;

        applyTheme(savedTheme);
        applyHideChecked(savedHideChecked);
    }
    // --- End Options Logic ---

    function showHelp() {
        alert(
            "**CSV-Format:**\n" +
            "Die CSV-Datei muss eine Kopfzeile mit den Spalten 'id' und 'name' haben. Optional kann eine 'checked'-Spalte (true/false) für den Import vorhanden sein.\n\n" +
            "**Suche:**\n" +
            "Suchen Sie nach Namen (Teilübereinstimmung) oder ID (exakte Übereinstimmung).\n\n" +
            "**Speicherverhalten:**\n" +
            "Der Status (abgehakt/nicht abgehakt) wird pro Datei automatisch im Browser gespeichert. Der Zustand bleibt auch nach dem Schließen des Browsers erhalten.\n\n" +
            "**Import/Export:**\n" +
            "Laden Sie eine CSV-Datei, um zu beginnen. Exportieren Sie die aktuelle Liste inklusive des Abhak-Status als neue CSV-Datei.\n\n" +
            "**Cache:**\n" +
            "Die zuletzt geöffnete Datei wird automatisch zwischengespeichert und beim nächsten Öffnen der App wieder geladen."
        );
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    function processCsvContent(fileContent) {
        // Basic CSV parsing
        const lines = fileContent.split('\n').filter(line => line.trim() !== '');
        const headerLine = lines.shift().trim();

        // Detect delimiter by checking the header
        const delimiter = headerLine.includes(';') ? ';' : ',';

        const headers = headerLine.split(delimiter);
        const idIndex = headers.indexOf('id');
        const nameIndex = headers.indexOf('name');
        const checkedIndex = headers.indexOf('checked');

        if (idIndex === -1 || nameIndex === -1) {
            alert('Die CSV-Datei muss die Spalten "id" und "name" enthalten.');
            return;
        }

        const initialCheckedStates = [];
        tableData = lines.map(line => {
            const values = line.trim().split(delimiter);
            const item = {
                id: values[idIndex],
                name: values[nameIndex] ? values[nameIndex].replace(/"/g, '') : ''
            };

            if (checkedIndex !== -1 && values[checkedIndex] === 'true') {
                initialCheckedStates.push(item.id);
            }
            return item;
        });

        tableData.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

        if (checkedIndex !== -1) {
            saveCheckedStates(initialCheckedStates);
        }

        renderTable(tableData);
        updateStatusCounter();
    }

    async function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        originalFileName = file.name;

        try {
            const fileContent = await readFileAsText(file);

            if (window.crypto && window.crypto.subtle) {
                currentFileHash = await generateHash(fileContent);
            } else {
                console.warn("Crypto API not available in this context. Using filename as a fallback key.");
                currentFileHash = file.name;
            }

            localStorage.setItem('lastCsvContent', fileContent);
            localStorage.setItem('lastCsvHash', currentFileHash);
            localStorage.setItem('lastCsvFileName', originalFileName);

            processCsvContent(fileContent);
        } catch (error) {
            console.error("Fehler bei der Dateiverarbeitung:", error);
            alert("Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
        }
    }

    function loadLastFile() {
        const lastCsvContent = localStorage.getItem('lastCsvContent');
        const lastCsvHash = localStorage.getItem('lastCsvHash');
        const lastCsvFileName = localStorage.getItem('lastCsvFileName');

        if (lastCsvContent && lastCsvHash) {
            currentFileHash = lastCsvHash;
            originalFileName = lastCsvFileName;
            processCsvContent(lastCsvContent);
        }
    }

    loadLastFile();
    loadOptions();

    function updateStatusCounter() {
        const totalRows = tableData.length;
        const checkedRows = getCheckedStates().length;
        if (totalRows > 0) {
            statusCounter.textContent = `Ausgegeben: ${checkedRows} / ${totalRows}`;
        } else {
            statusCounter.textContent = '';
        }
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        const checkedStates = getCheckedStates();
        const searchTerm = searchInput.value;

        data.forEach(item => {
            const row = document.createElement('tr');
            const isChecked = checkedStates.includes(item.id);
            if (isChecked) {
                row.classList.add('checked');
            }

            let idContent = item.id;
            let nameContent = item.name;

            if (searchTerm) {
                const lowerSearchTerm = searchTerm.toLowerCase();

                if (item.id.toLowerCase() === lowerSearchTerm) {
                    idContent = `<mark>${item.id}</mark>`;
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

            row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                toggleCheckState(row, item.id, e.target.checked);
            });

            tableBody.appendChild(row);
        });
    }

    function handleSearch(event) {
        const searchTerm = event.target.value.toLowerCase();
        const filteredData = tableData.filter(item => {
            return item.id.toLowerCase() === searchTerm || item.name.toLowerCase().includes(searchTerm);
        });
        renderTable(filteredData);
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
            if (!checkedStates.includes(id)) {
                checkedStates.push(id);
            }
        } else {
            checkedStates = checkedStates.filter(checkedId => checkedId !== id);
        }
        saveCheckedStates(checkedStates);
        updateStatusCounter();
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
            const isChecked = checkedStates.includes(item.id);
            const row = `${item.id},"${item.name}",${isChecked}`;
            csvContent += row + "\r\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        const date = new Date();
        const dateString = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
        const timeString = `${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
        const baseName = originalFileName.replace(/\.csv$/i, '');
        const exportFileName = `${baseName}_export_${dateString}_${timeString}.csv`;

        link.setAttribute("href", url);
        link.setAttribute("download", exportFileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function generateHash(string) {
        const utf8 = new TextEncoder().encode(string);
        const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(bytes => bytes.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    // PWA Update Logic
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        if (confirm("Eine neue Version der App ist verfügbar. Jetzt neu laden?")) {
                            newWorker.postMessage({ action: 'skipWaiting' });
                        }
                    }
                });
            });
        });

        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            window.location.reload();
            refreshing = true;
        });
    }
});
