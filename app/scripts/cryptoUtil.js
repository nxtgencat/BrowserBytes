export const CryptoUtil = {
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        bytes.forEach(b => binary += String.fromCharCode(b));
        return window.btoa(binary);
    },
    base64ToArrayBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    },
    async deriveKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },
    async encryptData(plaintext, password) {
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            enc.encode(plaintext)
        );
        return {
            encrypted: true,
            salt: this.arrayBufferToBase64(salt),
            iv: this.arrayBufferToBase64(iv),
            data: this.arrayBufferToBase64(ciphertext)
        };
    },
    async decryptData(encryptedObj, password) {
        const { salt, iv, data } = encryptedObj;
        const saltBuffer = this.base64ToArrayBuffer(salt);
        const ivBuffer = this.base64ToArrayBuffer(iv);
        const ciphertextBuffer = this.base64ToArrayBuffer(data);
        const key = await this.deriveKey(password, saltBuffer);
        try {
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: ivBuffer },
                key,
                ciphertextBuffer
            );
            return new TextDecoder().decode(decryptedBuffer);
        } catch (e) {
            throw new Error("Decryption failed");
        }
    }
};
