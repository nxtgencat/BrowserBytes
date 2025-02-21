const POCKETBASE_URL = 'https://wtf.pockethost.io';

// ----- View Management -----
function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    document.getElementById(viewId).style.display = 'block';
}

function resetSaveView() {
    const exportNameInput = document.getElementById('exportName');
    exportNameInput.value = '';
    exportNameInput.disabled = false;

    // Reset encryption key field
    document.getElementById('encryptionKey').value = '';

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
    // Reset decryption key field
    document.getElementById('decryptionKey').value = '';

    const confirmRetrieveBtn = document.getElementById('confirmRetrieveBtn');
    confirmRetrieveBtn.style.display = 'block';
    confirmRetrieveBtn.disabled = false;
    confirmRetrieveBtn.innerHTML = 'Retrieve Data';

    const retrieveStatus = document.getElementById('retrieveStatus');
    retrieveStatus.textContent = '';
    retrieveStatus.classList.remove('success', 'error');
}

// ----- Encryption/Decryption Helpers -----
// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach(b => binary += String.fromCharCode(b));
    return window.btoa(binary);
}

// Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

// Derive a cryptographic key from a password and salt using PBKDF2
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

// Encrypt plaintext using a password. Returns an object containing the salt, IV, and ciphertext (all in Base64).
async function encryptData(plaintext, password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(plaintext)
    );
    return {
        encrypted: true,
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv),
        data: arrayBufferToBase64(ciphertext)
    };
}

// Decrypt data using a password. Expects an object with Base64 encoded salt, iv, and ciphertext.
async function decryptData(encryptedObj, password) {
    const { salt, iv, data } = encryptedObj;
    const saltBuffer = base64ToArrayBuffer(salt);
    const ivBuffer = base64ToArrayBuffer(iv);
    const ciphertextBuffer = base64ToArrayBuffer(data);
    const key = await deriveKey(password, saltBuffer);
    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuffer },
            key,
            ciphertextBuffer
        );
        const dec = new TextDecoder();
        return dec.decode(decryptedBuffer);
    } catch (e) {
        throw new Error("Decryption failed");
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
        } catch (e) { }
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
    const encryptionKeyInput = document.getElementById('encryptionKey');
    const encryptionKey = encryptionKeyInput.value.trim();

    saveStatus.textContent = '';
    saveStatus.classList.remove('success', 'error');

    if (!name) {
        saveStatus.textContent = 'Please enter a name for your saved data';
        saveStatus.classList.add('error');
        return;
    }

    confirmSaveBtn.disabled = true;
    exportNameInput.disabled = true;
    confirmSaveBtn.innerHTML = `<span class="spinner"></span> Saving...`;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [localStorageData, cookiesData] = await Promise.all([
            extractLocalStorage(tab.id),
            extractCookies(tab.url)
        ]);

        let exportData = { localStorage: localStorageData, cookies: cookiesData };

        // If an encryption key is provided, encrypt the export data.
        if (encryptionKey) {
            const plaintext = JSON.stringify(exportData);
            exportData = await encryptData(plaintext, encryptionKey);
        }

        const result = await createHavelocRecord(name, exportData);

        if (result.success) {
            document.getElementById('generatedPassphrase').textContent = result.passphrase;
            document.getElementById('passphraseContainer').style.display = 'block';
            confirmSaveBtn.style.display = 'none';
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
    const decryptionKeyInput = document.getElementById('decryptionKey');

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
        let exportData;

        // Check if the retrieved data is encrypted.
        if (parsedData.encrypted) {
            const decryptionKey = decryptionKeyInput.value.trim();
            if (!decryptionKey) {
                throw new Error("Data is encrypted. A decryption key is required to decrypt.");
            }
            const decryptedText = await decryptData(parsedData, decryptionKey);
            exportData = JSON.parse(decryptedText);
        } else {
            exportData = parsedData;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await restoreLocalStorage(tab.id, exportData.localStorage);
        const cookiesRestored = await restoreCookies(tab.url, exportData.cookies);

        retrieveStatus.textContent = `Restored ${Object.keys(exportData.localStorage).length} localStorage items and ${cookiesRestored} cookies.`;
        retrieveStatus.classList.add('success');

        confirmRetrieveBtn.style.display = 'none';
        document.getElementById('cancelRetrieveBtn').textContent = 'Back to Menu';

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
