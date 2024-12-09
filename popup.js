document.getElementById('exportBtn').addEventListener('click', exportStorageAndCookies);
document.getElementById('importBtn').addEventListener('click', triggerFileInput);
document.getElementById('fileInput').addEventListener('change', importStorageAndCookies);

async function exportStorageAndCookies() {
    try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Collect local storage
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

        // Get cookies for the current domain
        const cookies = await chrome.cookies.getAll({
            url: tab.url
        });

        // Prepare export data
        const exportData = {
            localStorage: localStorageResult.result,
            cookies: cookies
        };

        // Create and download JSON file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        chrome.downloads.download({
            url: url,
            filename: `storage_export_${new Date().toISOString().replace(/:/g, '-')}.json`
        });
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting storage: ' + error.message);
    }
}

function triggerFileInput() {
    document.getElementById('fileInput').click();
}

async function importStorageAndCookies(event) {
    try {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const importData = JSON.parse(e.target.result);

            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Import local storage
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (data) => {
                    // Clear existing local storage
                    window.localStorage.clear();

                    // Import new local storage data
                    Object.entries(data).forEach(([key, value]) => {
                        window.localStorage.setItem(key, value);
                    });
                },
                args: [importData.localStorage]
            });

            // Import cookies
            for (const cookie of importData.cookies) {
                // Remove existing cookies for this domain
                await chrome.cookies.remove({
                    url: tab.url,
                    name: cookie.name
                });

                // Set new cookies
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

            alert('Storage and cookies imported successfully!');
        };
        reader.readAsText(file);
    } catch (error) {
        console.error('Import error:', error);
        alert('Error importing storage: ' + error.message);
    }
}