# BrowserBytes

BrowserBytes is a Chrome extension that backs up and restores your browser's data to a cloud server. It extracts your **localStorage**, **sessionStorage**, and **cookies** from the active tab and lets you save them in the cloud—with optional AES-GCM encryption using a user-provided key. You can later retrieve your data (and decrypt it, if needed) to restore your browser state.

## Features

- **Data Backup:** Extracts and saves localStorage, sessionStorage, and cookies.
- **Optional Encryption:** Encrypt your data with a user-provided key using AES-GCM.
- **Data Restore:** Retrieve and restore your data back into the browser.
- **User-Friendly Interface:** Simple UI with clear feedback for saving and retrieving operations.


## Usage

1. **Saving Data:**
    - Click the **Save Data** button.
    - Enter a name for your data.
    - *(Optional)* Enter an encryption key if you want to encrypt your backup.
    - Click **Save to Cloud**. A passphrase will be generated—save this passphrase to retrieve your data later.

2. **Retrieving Data:**
    - Click the **Retrieve Data** button.
    - Enter the passphrase provided during the save operation.
    - *(Optional)* Enter the decryption key if your data was encrypted.
    - Click **Retrieve Data** to restore your localStorage, sessionStorage, and cookies.


