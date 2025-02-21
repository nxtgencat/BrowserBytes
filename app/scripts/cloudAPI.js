const POCKETBASE_URL = 'https://wtf.pockethost.io';

export const CloudAPI = {
    async generatePassphrase() {
        try {
            const response = await fetch('https://makemeapassword.ligos.net/api/v1/passphrase/json');
            const { pws } = await response.json();
            return pws[0];
        } catch (error) {
            console.error('Error fetching passphrase:', error);
            throw new Error('Failed to generate passphrase');
        }
    },
    async createRecord(name, data) {
        try {
            const passphrase = await this.generatePassphrase();
            const recordData = { name, passphrase, data: JSON.stringify(data) };
            const response = await fetch(`${POCKETBASE_URL}/api/collections/browserBytes/records`, {
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
    },
    async getRecordByPassphrase(passphrase) {
        try {
            const filter = `passphrase = "${passphrase}"`;
            const encodedFilter = encodeURIComponent(filter);
            const url = `${POCKETBASE_URL}/api/collections/browserBytes/records?page=1&perPage=1&filter=${encodedFilter}&passphrase=${encodeURIComponent(passphrase)}`;
            const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            const data = await response.json();
            if (data.items.length === 0) throw new Error("No data found for this passphrase. Please check and try again.");
            return data.items[0];
        } catch (error) {
            console.error('Error retrieving record:', error);
            throw error;
        }
    }
};
