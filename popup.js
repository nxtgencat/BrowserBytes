const POCKETBASE_URL = 'https://wtf.pockethost.io';

// ----- Modal Utility Functions -----
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    const modalEl = document.getElementById(modalId);
    modalEl.classList.remove('show');

    if (modalId === 'exportModal') {
        const exportNameInput = document.getElementById('exportName');
        exportNameInput.value = '';
        exportNameInput.disabled = false;
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.style.display = 'inline-block';
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Save to Cloud';
        document.getElementById('passphraseContainer').style.display = 'none';
        const exportStatus = document.getElementById('exportStatus');
        exportStatus.textContent = '';
        exportStatus.classList.remove('success', 'error');
        // Reset cancel button text back to "Cancel"
        document.getElementById('cancelExportBtn').textContent = 'Cancel';
    } else if (modalId === 'importModal') {
        document.getElementById('passphraseInput').value = '';
        const retrieveBtn = document.getElementById('retrieveBtn');
        retrieveBtn.style.display = 'inline-block';
        retrieveBtn.disabled = false;
        retrieveBtn.innerHTML = 'Retrieve Data';
        const importStatus = document.getElementById('importStatus');
        importStatus.textContent = '';
        importStatus.classList.remove('success', 'error');
        // Reset cancel button text back to "Cancel"
        document.getElementById('cancelImportBtn').textContent = 'Cancel';
    }
}

// ----- Passphrase Generation -----
async function generatePassphrase() {
    try {
        const response = await fetch('https://makemeapassword.ligos.net/api/v1/passphrase/json');
        const { pws } = await response.json();
        return pws[0];
    } catch (error) {
        console.error('Error fetching passphrase:', error);
        throw new Error('Failed to generate passphrase');
    }
}

// ----- Extraction Helpers -----
async function extractLocalStorage(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const storageData = {};
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                storageData[key] = window.localStorage.getItem(key);
            }
            return storageData;
        }
    });
    return result;
}

async function extractCookies(url) {
    const cookiesArray = await chrome.cookies.getAll({ url });
    const cookiesData = {};
    cookiesArray.forEach(cookie => {
        cookiesData[cookie.name] = cookie;
    });
    return cookiesData;
}

// ----- Record Handling -----
async function createHavelocRecord(name, data) {
    try {
        const passphrase = await generatePassphrase();
        const recordData = {
            name,
            passphrase,
            data: JSON.stringify(data)
        };

        const response = await fetch(`${POCKETBASE_URL}/api/collections/havelocCreds/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recordData)
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const record = await response.json();
        return { success: true, record, passphrase };
    } catch (error) {
        console.error('Error creating record:', error);
        return { success: false, error: error.message };
    }
}

async function getRecordByPassphrase(passphrase) {
    try {
        const filter = `passphrase = "${passphrase}"`;
        const encodedFilter = encodeURIComponent(filter);
        const url = `${POCKETBASE_URL}/api/collections/havelocCreds/records?page=1&perPage=1&filter=${encodedFilter}&passphrase=${encodeURIComponent(passphrase)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();
        if (data.items.length === 0) {
            throw new Error("No data found for this passphrase. Please check and try again.");
        }
        return data.items[0];
    } catch (error) {
        console.error('Error retrieving record:', error);
        throw error;
    }
}

// ----- Restore Helpers -----
async function restoreLocalStorage(tabId, storageData) {
    await chrome.scripting.executeScript({
        target: { tabId },
        func: (data) => {
            localStorage.clear();
            Object.keys(data).forEach(key => {
                localStorage.setItem(key, data[key]);
            });
            return Object.keys(data).length;
        },
        args: [storageData]
    });
}

async function restoreCookies(tabUrl, cookiesData) {
    let cookiesRestored = 0;
    for (const cookieName in cookiesData) {
        const cookie = cookiesData[cookieName];
        try {
            await chrome.cookies.remove({ url: tabUrl, name: cookieName });
        } catch (e) {
            // Ignore if not found
        }
        try {
            await chrome.cookies.set({
                url: tabUrl,
                name: cookieName,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                sameSite: cookie.sameSite,
                expirationDate: cookie.expirationDate
            });
            cookiesRestored++;
        } catch (e) {
            console.error('Error setting cookie:', e);
        }
    }
    return cookiesRestored;
}

// ----- Main Cloud Operations -----
async function handleSaveToCloud() {
    const exportNameInput = document.getElementById('exportName');
    const name = exportNameInput.value.trim();
    const saveBtn = document.getElementById('saveBtn');
    const exportStatus = document.getElementById('exportStatus');

    exportStatus.textContent = '';
    exportStatus.classList.remove('success', 'error');

    if (!name) {
        exportStatus.textContent = 'Please enter a name for your saved data';
        exportStatus.classList.add('error');
        return;
    }

    // Disable save button and input
    saveBtn.disabled = true;
    exportNameInput.disabled = true;
    const originalSaveBtnText = saveBtn.innerHTML;
    saveBtn.innerHTML = `<span class="spinner"></span> Saving...`;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [localStorageData, cookiesData] = await Promise.all([
            extractLocalStorage(tab.id),
            extractCookies(tab.url)
        ]);

        const exportData = { localStorage: localStorageData, cookies: cookiesData };
        const result = await createHavelocRecord(name, exportData);

        if (result.success) {
            // Show the passphrase (with larger display)
            document.getElementById('generatedPassphrase').textContent = result.passphrase;
            document.getElementById('passphraseContainer').style.display = 'block';
            // Hide the save button and update cancel to "Close"
            saveBtn.style.display = 'none';
            document.getElementById('cancelExportBtn').textContent = 'Close';
            exportStatus.textContent = 'Data saved successfully!';
            exportStatus.classList.add('success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        exportStatus.textContent = 'Error saving data: ' + error.message;
        exportStatus.classList.add('error');
        saveBtn.disabled = false;
        exportNameInput.disabled = false;
        saveBtn.innerHTML = originalSaveBtnText;
    }
}

async function handleRetrieveFromCloud() {
    const passphrase = document.getElementById('passphraseInput').value.trim();
    const retrieveBtn = document.getElementById('retrieveBtn');
    const importStatus = document.getElementById('importStatus');

    importStatus.textContent = '';
    importStatus.classList.remove('success', 'error');

    if (!passphrase) {
        importStatus.textContent = 'Please enter your passphrase';
        importStatus.classList.add('error');
        return;
    }

    retrieveBtn.disabled = true;
    const originalRetrieveBtnText = retrieveBtn.innerHTML;
    retrieveBtn.innerHTML = `<span class="spinner"></span> Retrieving...`;

    try {
        const record = await getRecordByPassphrase(passphrase);
        const parsedData = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        await restoreLocalStorage(tab.id, parsedData.localStorage);
        const cookiesRestored = await restoreCookies(tab.url, parsedData.cookies);

        importStatus.textContent = `Restored ${Object.keys(parsedData.localStorage).length} localStorage items and ${cookiesRestored} cookies.`;
        importStatus.classList.add('success');

        // Hide the retrieve button and update cancel to "Close"
        retrieveBtn.style.display = 'none';
        document.getElementById('cancelImportBtn').textContent = 'Close';

        // Reload the active tab after a short delay (so the user sees the success message)
        setTimeout(() => {
            chrome.tabs.reload(tab.id);
        }, 1500);
    } catch (error) {
        importStatus.textContent = 'Error retrieving data: ' + error.message;
        importStatus.classList.add('error');
        retrieveBtn.disabled = false;
        retrieveBtn.innerHTML = originalRetrieveBtnText;
    }
}

// ----- Event Listeners -----
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('exportBtn').addEventListener('click', () => showModal('exportModal'));
    document.getElementById('importBtn').addEventListener('click', () => showModal('importModal'));
    document.getElementById('saveBtn').addEventListener('click', handleSaveToCloud);
    document.getElementById('retrieveBtn').addEventListener('click', handleRetrieveFromCloud);

    // Cancel buttons close their respective modals
    document.getElementById('cancelExportBtn').addEventListener('click', () => closeModal('exportModal'));
    document.getElementById('cancelImportBtn').addEventListener('click', () => closeModal('importModal'));
});
