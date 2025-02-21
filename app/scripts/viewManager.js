export const ViewManager = {
    showView(viewId) {
        document.querySelectorAll('.view').forEach(view => view.style.display = 'none');
        document.getElementById(viewId).style.display = 'block';
    },
    resetSaveView() {
        const exportName = document.getElementById('exportName');
        exportName.value = '';
        exportName.disabled = false;
        document.getElementById('encryptionKey').value = '';
        const confirmBtn = document.getElementById('confirmSaveBtn');
        confirmBtn.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Save to Cloud';
        document.getElementById('passphraseContainer').style.display = 'none';
        this.updateStatus('saveStatus', '', '');
    },
    resetRetrieveView() {
        document.getElementById('passphraseInput').value = '';
        document.getElementById('decryptionKey').value = '';
        const confirmBtn = document.getElementById('confirmRetrieveBtn');
        confirmBtn.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Retrieve Data';
        this.updateStatus('retrieveStatus', '', '');
    },
    updateStatus(elementId, message, type) {
        const el = document.getElementById(elementId);
        el.textContent = message;
        el.className = 'status ' + (type || '');
    }
};
