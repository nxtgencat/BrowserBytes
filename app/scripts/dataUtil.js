export const DataUtil = {
    async getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    },
    async extractLocalStorage(tabId) {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const data = {};
                for (let i = 0; i < window.localStorage.length; i++) {
                    const key = window.localStorage.key(i);
                    data[key] = window.localStorage.getItem(key);
                }
                return data;
            }
        });
        return result;
    },
    async extractSessionStorage(tabId) {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const data = {};
                for (let i = 0; i < window.sessionStorage.length; i++) {
                    const key = window.sessionStorage.key(i);
                    data[key] = window.sessionStorage.getItem(key);
                }
                return data;
            }
        });
        return result;
    },
    async extractCookies(url) {
        const cookiesArray = await chrome.cookies.getAll({ url });
        const cookiesData = {};
        cookiesArray.forEach(cookie => cookiesData[cookie.name] = cookie);
        return cookiesData;
    },
    async restoreLocalStorage(tabId, data) {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: storageData => {
                localStorage.clear();
                Object.keys(storageData).forEach(key => localStorage.setItem(key, storageData[key]));
            },
            args: [data]
        });
    },
    async restoreSessionStorage(tabId, data) {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: sessionData => {
                sessionStorage.clear();
                Object.keys(sessionData).forEach(key => sessionStorage.setItem(key, sessionData[key]));
            },
            args: [data]
        });
    },
    async restoreCookies(url, cookiesData) {
        let restored = 0;
        for (const cookieName in cookiesData) {
            const cookie = cookiesData[cookieName];
            try { await chrome.cookies.remove({ url, name: cookieName }); } catch (e) { }
            try {
                await chrome.cookies.set({
                    url,
                    name: cookieName,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    sameSite: cookie.sameSite,
                    expirationDate: cookie.expirationDate
                });
                restored++;
            } catch (e) {
                console.error('Error setting cookie:', e);
            }
        }
        return restored;
    }
};
