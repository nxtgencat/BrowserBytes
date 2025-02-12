// State management
let currentFormat = 'json';
let exportData = null;

// Utility functions
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    if (modalId === 'importModal') {
        document.getElementById('importData').value = '';
    }
}

function updateTabs(modalId, activeFormat) {
    const tabs = document.querySelectorAll(`#${modalId} .tab`);
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.format === activeFormat);
    });
}

function formatData(data, format) {
    const jsonData = JSON.stringify(data, null, 2);
    return format === 'json' ? jsonData : btoa(jsonData);
}

// Export functionality
async function handleExport() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const [localStorageResult] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const storage = {};
                for (let i = 0; i < window.localStorage.length; i++) {
                    const key = window.localStorage.key(i);
                    storage[key] = window.localStorage.getItem(key);
                }
                return storage;
            }
        });

        const cookies = await chrome.cookies.getAll({ url: tab.url });

        exportData = {
            localStorage: localStorageResult.result,
            cookies: cookies
        };

        document.getElementById('exportData').value = formatData(exportData, currentFormat);
        showModal('exportModal');
    } catch (error) {
        alert('Error exporting data: ' + error.message);
    }
}

async function downloadData() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const sanitizedTitle = tab.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
        const content = document.getElementById('exportData').value;
        const extension = currentFormat === 'json' ? 'json' : 'txt';

        const blob = new Blob([content], {
            type: currentFormat === 'json' ? 'application/json' : 'text/plain'
        });
        const url = URL.createObjectURL(blob);

        await chrome.downloads.download({
            url: url,
            filename: `browserbytes_${sanitizedTitle}_${currentFormat}.${extension}`
        });
    } catch (error) {
        alert('Error downloading data: ' + error.message);
    }
}

// Import functionality
async function handleImport() {
    const inputData = document.getElementById('importData').value;
    if (!inputData) {
        alert('Please paste data to import');
        return;
    }

    try {
        let parsedData = currentFormat === 'json'
            ? JSON.parse(inputData)
            : JSON.parse(atob(inputData));

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (data) => {
                localStorage.clear();
                Object.entries(data).forEach(([key, value]) => {
                    localStorage.setItem(key, value);
                });
            },
            args: [parsedData.localStorage]
        });

        for (const cookie of parsedData.cookies) {
            await chrome.cookies.remove({
                url: tab.url,
                name: cookie.name
            });

            await chrome.cookies.set({
                url: tab.url,
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                sameSite: cookie.sameSite,
                expirationDate: cookie.expirationDate
            });
        }

        alert('Data imported successfully!');
        closeModal('importModal');
    } catch (error) {
        alert('Error importing data. Please check the format and try again.');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Main buttons
    document.getElementById('exportBtn').addEventListener('click', handleExport);
    document.getElementById('importBtn').addEventListener('click', () => showModal('importModal'));
    document.getElementById('downloadBtn').addEventListener('click', downloadData);
    document.getElementById('importConfirmBtn').addEventListener('click', handleImport);

    // Close buttons
    document.querySelectorAll('[data-close="modal"]').forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            closeModal(modal.id);
        });
    });

    // Tab switching
    document.querySelectorAll('.tab-group').forEach(group => {
        group.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab')) {
                currentFormat = e.target.dataset.format;
                updateTabs(e.target.closest('.modal').id, currentFormat);

                if (exportData && e.target.closest('#exportModal')) {
                    document.getElementById('exportData').value = formatData(exportData, currentFormat);
                }
            }
        });
    });
});