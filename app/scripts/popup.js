import { ViewManager } from './viewManager.js';
import { CryptoUtil } from './cryptoUtil.js';
import { CloudAPI } from './cloudAPI.js';
import { DataUtil } from './dataUtil.js';

async function handleSaveToCloud() {
    const exportName = document.getElementById('exportName').value.trim();
    const encryptionKey = document.getElementById('encryptionKey').value.trim();
    const confirmBtn = document.getElementById('confirmSaveBtn');
    const statusEl = 'saveStatus';

    if (!exportName) {
        ViewManager.updateStatus(statusEl, 'Please enter a name for your saved data', 'error');
        return;
    }

    confirmBtn.disabled = true;
    document.getElementById('exportName').disabled = true;
    confirmBtn.innerHTML = `<span class="spinner"></span> Saving...`;

    try {
        const tab = await DataUtil.getActiveTab();
        const [localStorageData, cookiesData] = await Promise.all([
            DataUtil.extractLocalStorage(tab.id),
            DataUtil.extractCookies(tab.url)
        ]);
        let exportData = { localStorage: localStorageData, cookies: cookiesData };

        if (encryptionKey) {
            exportData = await CryptoUtil.encryptData(JSON.stringify(exportData), encryptionKey);
        }

        const result = await CloudAPI.createRecord(exportName, exportData);
        if (result.success) {
            document.getElementById('generatedPassphrase').textContent = result.passphrase;
            document.getElementById('passphraseContainer').style.display = 'block';
            confirmBtn.style.display = 'none';
            document.getElementById('cancelSaveBtn').textContent = 'Back to Menu';
            ViewManager.updateStatus(statusEl, 'Data saved successfully!', 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        ViewManager.updateStatus(statusEl, 'Error saving data: ' + error.message, 'error');
        confirmBtn.disabled = false;
        document.getElementById('exportName').disabled = false;
        confirmBtn.innerHTML = 'Save to Cloud';
    }
}

async function handleRetrieveFromCloud() {
    const passphrase = document.getElementById('passphraseInput').value.trim();
    const decryptionKey = document.getElementById('decryptionKey').value.trim();
    const confirmBtn = document.getElementById('confirmRetrieveBtn');
    const statusEl = 'retrieveStatus';

    if (!passphrase) {
        ViewManager.updateStatus(statusEl, 'Please enter your passphrase', 'error');
        return;
    }

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span class="spinner"></span> Retrieving...`;

    try {
        const record = await CloudAPI.getRecordByPassphrase(passphrase);
        const parsedData = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
        let exportData;

        if (parsedData.encrypted) {
            if (!decryptionKey) throw new Error("Data is encrypted. A decryption key is required to decrypt.");
            const decryptedText = await CryptoUtil.decryptData(parsedData, decryptionKey);
            exportData = JSON.parse(decryptedText);
        } else {
            exportData = parsedData;
        }

        const tab = await DataUtil.getActiveTab();
        await DataUtil.restoreLocalStorage(tab.id, exportData.localStorage);
        const cookiesRestored = await DataUtil.restoreCookies(tab.url, exportData.cookies);

        ViewManager.updateStatus(statusEl, `Restored ${Object.keys(exportData.localStorage).length} localStorage items and ${cookiesRestored} cookies.`, 'success');
        confirmBtn.style.display = 'none';
        document.getElementById('cancelRetrieveBtn').textContent = 'Back to Menu';

        setTimeout(() => chrome.tabs.reload(tab.id), 1500);
    } catch (error) {
        ViewManager.updateStatus(statusEl, 'Error retrieving data: ' + error.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Retrieve Data';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    ViewManager.showView('mainView');

    document.getElementById('saveBtn').addEventListener('click', () => {
        ViewManager.resetSaveView();
        ViewManager.showView('saveView');
    });

    document.getElementById('retrieveBtn').addEventListener('click', () => {
        ViewManager.resetRetrieveView();
        ViewManager.showView('retrieveView');
    });

    document.getElementById('confirmSaveBtn').addEventListener('click', handleSaveToCloud);
    document.getElementById('cancelSaveBtn').addEventListener('click', () => {
        if (document.getElementById('cancelSaveBtn').textContent === 'Back to Menu') {
            ViewManager.resetSaveView();
        }
        ViewManager.showView('mainView');
    });

    document.getElementById('confirmRetrieveBtn').addEventListener('click', handleRetrieveFromCloud);
    document.getElementById('cancelRetrieveBtn').addEventListener('click', () => {
        if (document.getElementById('cancelRetrieveBtn').textContent === 'Back to Menu') {
            ViewManager.resetRetrieveView();
        }
        ViewManager.showView('mainView');
    });
});
