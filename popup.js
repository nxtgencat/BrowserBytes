const POCKETBASE_URL = 'https://wtf.pockethost.io';

// ----- Modal Utility Functions -----
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    const modalEl = document.getElementById(modalId);
    modalEl.classList.remove('show');

    // Reset modals as needed
    if (modalId === 'exportModal') {
        document.getElementById('exportName').value = '';
        document.getElementById('passphraseContainer').style.display = 'none';
        document.getElementById('saveBtn').style.display = 'block';
    } else if (modalId === 'importModal') {
        document.getElementById('passphraseInput').value = '';
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
// Extract localStorage as an object: { key: value, ... }
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

// Extract cookies as an object where each cookie name is a key
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
            // Save the data object (which now contains plain objects for localStorage and cookies) as JSON
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
// Restore localStorage from an object: { key: value, ... }
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

// Restore cookies from an object where keys are cookie names
async function restoreCookies(tabUrl, cookiesData) {
    let cookiesRestored = 0;
    for (const cookieName in cookiesData) {
        const cookie = cookiesData[cookieName];
        try {
            // Remove any existing cookie with the same name
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
    const name = document.getElementById('exportName').value.trim();
    if (!name) {
        alert('Please enter a name for your saved data');
        return;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Extract localStorage and cookies concurrently
        const [localStorageData, cookiesData] = await Promise.all([
            extractLocalStorage(tab.id),
            extractCookies(tab.url)
        ]);

        const exportData = { localStorage: localStorageData, cookies: cookiesData };
        const result = await createHavelocRecord(name, exportData);

        if (result.success) {
            document.getElementById('generatedPassphrase').textContent = result.passphrase;
            document.getElementById('passphraseContainer').style.display = 'block';
            document.getElementById('saveBtn').style.display = 'none';
        } else {
            alert('Error saving data: ' + result.error);
        }
    } catch (error) {
        alert('Error saving data: ' + error.message);
    }
}

async function handleRetrieveFromCloud() {
    const passphrase = document.getElementById('passphraseInput').value.trim();
    if (!passphrase) {
        alert('Please enter your passphrase');
        return;
    }

    try {
        const record = await getRecordByPassphrase(passphrase);
        // Parse record.data, which contains our plain objects
        const parsedData = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        await restoreLocalStorage(tab.id, parsedData.localStorage);
        const cookiesRestored = await restoreCookies(tab.url, parsedData.cookies);

        alert(`Restored ${Object.keys(parsedData.localStorage).length} localStorage items and ${cookiesRestored} cookies.`);
        closeModal('importModal');
    } catch (error) {
        alert('Error retrieving data: ' + error.message);
    }
}

// ----- Event Listeners -----
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('exportBtn').addEventListener('click', () => showModal('exportModal'));
    document.getElementById('importBtn').addEventListener('click', () => showModal('importModal'));
    document.getElementById('saveBtn').addEventListener('click', handleSaveToCloud);
    document.getElementById('retrieveBtn').addEventListener('click', handleRetrieveFromCloud);

    // Close modals when clicking elements with data-close="modal"
    document.querySelectorAll('[data-close="modal"]').forEach(button => {
        button.addEventListener('click', () => closeModal(button.closest('.modal').id));
    });
});
