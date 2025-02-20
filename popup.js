const POCKETBASE_URL = 'https://wtf.pockethost.io';

// ----- View Management -----
function showView(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });

    // Show the requested view
    document.getElementById(viewId).style.display = 'block';
}

function resetSaveView() {
    const exportNameInput = document.getElementById('exportName');
    exportNameInput.value = '';
    exportNameInput.disabled = false;

    const confirmSaveBtn = document.getElementById('confirmSaveBtn');
    confirmSaveBtn.style.display = 'block';
    confirmSaveBtn.disabled = false;
    confirmSaveBtn.innerHTML = 'Save to Cloud';

    document.getElementById('passphraseContainer').style.display = 'none';

    const saveStatus = document.getElementById('saveStatus');
    saveStatus.textContent = '';
    saveStatus.classList.remove('success', 'error');
}

function resetRetrieveView() {
    document.getElementById('passphraseInput').value = '';

    const confirmRetrieveBtn = document.getElementById('confirmRetrieveBtn');
    confirmRetrieveBtn.style.display = 'block';
    confirmRetrieveBtn.disabled = false;
    confirmRetrieveBtn.innerHTML = 'Retrieve Data';

    const retrieveStatus = document.getElementById('retrieveStatus');
    retrieveStatus.textContent = '';
    retrieveStatus.classList.remove('success', 'error');
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
    const confirmSaveBtn = document.getElementById('confirmSaveBtn');
    const saveStatus = document.getElementById('saveStatus');

    saveStatus.textContent = '';
    saveStatus.classList.remove('success', 'error');

    if (!name) {
        saveStatus.textContent = 'Please enter a name for your saved data';
        saveStatus.classList.add('error');
        return;
    }

    // Disable save button and input
    confirmSaveBtn.disabled = true;
    exportNameInput.disabled = true;
    confirmSaveBtn.innerHTML = `<span class="spinner"></span> Saving...`;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [localStorageData, cookiesData] = await Promise.all([
            extractLocalStorage(tab.id),
            extractCookies(tab.url)
        ]);

        const exportData = { localStorage: localStorageData, cookies: cookiesData };
        const result = await createHavelocRecord(name, exportData);

        if (result.success) {
            // Show the passphrase
            document.getElementById('generatedPassphrase').textContent = result.passphrase;
            document.getElementById('passphraseContainer').style.display = 'block';

            // Hide the save button
            confirmSaveBtn.style.display = 'none';

            // Update cancel button to "Back"
            document.getElementById('cancelSaveBtn').textContent = 'Back to Menu';

            saveStatus.textContent = 'Data saved successfully!';
            saveStatus.classList.add('success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        saveStatus.textContent = 'Error saving data: ' + error.message;
        saveStatus.classList.add('error');
        confirmSaveBtn.disabled = false;
        exportNameInput.disabled = false;
        confirmSaveBtn.innerHTML = 'Save to Cloud';
    }
}

async function handleRetrieveFromCloud() {
    const passphrase = document.getElementById('passphraseInput').value.trim();
    const confirmRetrieveBtn = document.getElementById('confirmRetrieveBtn');
    const retrieveStatus = document.getElementById('retrieveStatus');

    retrieveStatus.textContent = '';
    retrieveStatus.classList.remove('success', 'error');

    if (!passphrase) {
        retrieveStatus.textContent = 'Please enter your passphrase';
        retrieveStatus.classList.add('error');
        return;
    }

    confirmRetrieveBtn.disabled = true;
    confirmRetrieveBtn.innerHTML = `<span class="spinner"></span> Retrieving...`;

    try {
        const record = await getRecordByPassphrase(passphrase);
        const parsedData = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        await restoreLocalStorage(tab.id, parsedData.localStorage);
        const cookiesRestored = await restoreCookies(tab.url, parsedData.cookies);

        retrieveStatus.textContent = `Restored ${Object.keys(parsedData.localStorage).length} localStorage items and ${cookiesRestored} cookies.`;
        retrieveStatus.classList.add('success');

        // Hide the retrieve button
        confirmRetrieveBtn.style.display = 'none';

        // Update cancel button to "Back"
        document.getElementById('cancelRetrieveBtn').textContent = 'Back to Menu';

        // Reload the active tab after a short delay
        setTimeout(() => {
            chrome.tabs.reload(tab.id);
        }, 1500);
    } catch (error) {
        retrieveStatus.textContent = 'Error retrieving data: ' + error.message;
        retrieveStatus.classList.add('error');
        confirmRetrieveBtn.disabled = false;
        confirmRetrieveBtn.innerHTML = 'Retrieve Data';
    }
}

// ----- Event Listeners -----
document.addEventListener('DOMContentLoaded', () => {
    // Show initial view
    showView('mainView');

    // Main view buttons
    document.getElementById('saveBtn').addEventListener('click', () => {
        resetSaveView();
        showView('saveView');
    });

    document.getElementById('retrieveBtn').addEventListener('click', () => {
        resetRetrieveView();
        showView('retrieveView');
    });

    // Save view buttons
    document.getElementById('confirmSaveBtn').addEventListener('click', handleSaveToCloud);
    document.getElementById('cancelSaveBtn').addEventListener('click', () => {
        if (document.getElementById('cancelSaveBtn').textContent === 'Back to Menu') {
            resetSaveView();
        }
        showView('mainView');
    });

    // Retrieve view buttons
    document.getElementById('confirmRetrieveBtn').addEventListener('click', handleRetrieveFromCloud);
    document.getElementById('cancelRetrieveBtn').addEventListener('click', () => {
        if (document.getElementById('cancelRetrieveBtn').textContent === 'Back to Menu') {
            resetRetrieveView();
        }
        showView('mainView');
    });
});