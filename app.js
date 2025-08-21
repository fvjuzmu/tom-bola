document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFile');
    const searchInput = document.getElementById('searchInput');
    const exportCsvButton = document.getElementById('exportCsvButton');
    const installButton = document.getElementById('installButton');
    const tableBody = document.querySelector('#csvTable tbody');
    let currentFileHash = '';
    let tableData = [];
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

    installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
            // Hide the app provided install promotion
            installButton.style.display = 'none';
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            await deferredPrompt.userChoice;
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
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

    async function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const fileContent = await file.text();
        currentFileHash = await generateHash(fileContent);

        // Basic CSV parsing
        const lines = fileContent.split('\n').filter(line => line.trim() !== '');
        const headers = lines.shift().trim().split(',');
        const idIndex = headers.indexOf('id');
        const nameIndex = headers.indexOf('name');
        const checkedIndex = headers.indexOf('checked');

        if (idIndex === -1 || nameIndex === -1) {
            alert('Die CSV-Datei muss die Spalten "id" und "name" enthalten.');
            return;
        }

        const initialCheckedStates = [];
        tableData = lines.map(line => {
            const values = line.trim().split(',');
            const item = {
                id: values[idIndex],
                name: values[nameIndex]
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
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        const checkedStates = getCheckedStates();

        data.forEach(item => {
            const row = document.createElement('tr');
            const isChecked = checkedStates.includes(item.id);
            if (isChecked) {
                row.classList.add('checked');
            }

            row.innerHTML = `
                <td><input type="checkbox" ${isChecked ? 'checked' : ''}></td>
                <td>${item.id}</td>
                <td>${item.name}</td>
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
            if (!confirm("Möchten Sie die Auswahl für diesen Eintrag wirklich aufheben?")) {
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
        link.setAttribute("href", url);
        link.setAttribute("download", "export.csv");
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
});
