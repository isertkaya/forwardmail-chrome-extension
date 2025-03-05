
document.addEventListener('DOMContentLoaded', async () => {
    const views = ['domains', 'aliases', 'createAlias', 'settings'];
    const elements = {
        globalSearch: document.getElementById('globalSearch'),
        domainList: document.getElementById('domainList'),
        aliasList: document.getElementById('aliasList'),
        currentDomain: document.getElementById('currentDomain'),
        createAliasDomain: document.getElementById('createAliasDomain'),
        aliasName: document.getElementById('aliasName'),
        aliasLabel: document.getElementById('aliasLabel'),
        aliasRecipient: document.getElementById('aliasRecipient'),
        createAliasBtn: document.getElementById('createAliasBtn'),
        newApiToken: document.getElementById('newApiToken'),
        saveNewTokenBtn: document.getElementById('saveNewTokenBtn'),
        domainSelector: document.getElementById('domainSelector'),
        loadingSpinner: document.getElementById('loadingSpinner')
    };

    let apiToken = '';
    let accountEmail = '';
    let domains = [];
    let aliases = [];
    let currentDomain = '';
    let currentPage = 0;
    const pageSize = 10;
    let currentSort = 'name';

    chrome.storage.local.get('apiToken', async (data) => {
        apiToken = data.apiToken || '';
        if (apiToken) {
            if (await fetchAccount()) {
                await loadDomains();
            } else {
                switchView('settings');
            }
        } else {
            switchView('settings');
        }
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => switchView(link.dataset.view));
    });

    elements.saveNewTokenBtn.onclick = async () => {
        apiToken = elements.newApiToken.value.trim();
        if (!apiToken) return showToast('Bitte API-Token eingeben!', true);
        chrome.storage.local.set({ apiToken }, async () => {
            if (await fetchAccount()) {
                await loadDomains();
            } else {
                showToast('Login fehlgeschlagen!', true);
                switchView('settings');
            }
        });
    };

    async function fetchAccount() {
        try {
            const account = await apiRequest('/v1/account');
            accountEmail = account.email;
            return true;
        } catch (error) {
            showToast('Fehler beim Abrufen des Accounts: ' + error.message, true);
            return false;
        }
    }

    async function loadDomains() {
        showLoading(true);
        try {
            domains = await apiRequest('/v1/domains');
            elements.domainList.innerHTML = '';
            elements.domainSelector.innerHTML = '';

            let bestDomain = domains[0];
            for (const domain of domains) {
                const aliasCount = (await apiRequest(`/v1/domains/${domain.name}/aliases`)).length;
                domain.aliasCount = aliasCount;

                const icon = domain.enhanced_protection ? '🛡️ ' : '🌐 ';
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-center';
                li.innerHTML = `<span>${icon}<strong>${domain.name}</strong></span>
                                <span class="badge bg-info">${aliasCount} Aliase</span>`;
                li.onclick = () => loadAliasesForDomain(domain.name);
                elements.domainList.appendChild(li);

                const option = new Option(`${domain.name}${domain.enhanced_protection ? ' 🛡️' : ''}`, domain.name);
                elements.domainSelector.appendChild(option);

                if (domain.enhanced_protection || aliasCount > (bestDomain.aliasCount || 0)) {
                    bestDomain = domain;
                }
            }
            await loadAliasesForDomain(bestDomain.name);
        } catch (error) {
            showToast('Fehler beim Laden der Domains: ' + error.message, true);
        } finally {
            showLoading(false);
        }
    }

    async function loadAliasesForDomain(domain) {
        currentDomain = domain;
        elements.currentDomain.textContent = domain;
        elements.createAliasDomain.textContent = domain;
        elements.domainSelector.value = domain;

        try {
            aliases = await apiRequest(`/v1/domains/${domain}/aliases`);
            currentPage = 0;
            switchView('aliases');
            renderAliases();
        } catch (error) {
            showToast('Fehler beim Laden der Aliase: ' + error.message, true);
        }
    }

    elements.globalSearch.oninput = () => {
        if (document.getElementById('view-aliases').classList.contains('d-none')) return;
        renderAliases();
    };

    async function apiRequest(path, method = 'GET', body = null) {
        const res = await fetch(`https://api.forwardemail.net${path}`, {
            method,
            headers: { Authorization: 'Basic ' + btoa(apiToken + ':') },
            body: body ? JSON.stringify(body) : null
        });
        if (!res.ok) {
            const errorMsg = (await res.json()).message || `HTTP ${res.status}`;
            throw new Error(errorMsg);
        }
        return await res.json();
    }

    function showToast(message, isError = false) {
        alert((isError ? '❌ ' : '✅ ') + message);
    }

    function showLoading(show) {
        elements.loadingSpinner.style.display = show ? 'block' : 'none';
    }

    function switchView(view) {
        views.forEach(v => document.getElementById(`view-${v}`).classList.add('d-none'));
        document.getElementById(`view-${view}`).classList.remove('d-none');

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.view === view);
        });

        if (view === 'createAlias') {
            elements.aliasRecipient.value = accountEmail;
            fetchCurrentTabDomain().then(domain => elements.aliasLabel.value = domain);
        }
    }

    async function fetchCurrentTabDomain() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            return new URL(tabs[0]?.url || '').hostname.replace(/^www\./, '');
        } catch (error) {
            return 'default-label.com';
        }
    }

    function renderAliases() {
        elements.aliasList.innerHTML = '';

        const search = elements.globalSearch.value.toLowerCase();

        const filtered = aliases.filter(alias =>
            alias.name.toLowerCase().includes(search) ||
            alias.labels.some(label => label.toLowerCase().includes(search))
        );

        if (filtered.length === 0) {
            elements.aliasList.innerHTML = '<div class="text-center text-muted">Keine Aliase gefunden.</div>';
        } else {
            filtered.forEach(alias => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-center';
                li.innerHTML = `<div>
                                    <strong>✉️ ${alias.name}@${currentDomain}</strong><br>
                                    🏷️ ${alias.labels.join(', ') || 'Keine'}<br>
                                    📧 ${alias.recipients.join(', ') || 'Keine'}
                                </div>
                                <button class="btn btn-outline-secondary btn-sm">📋</button>`;
                li.querySelector('button').onclick = () => copyToClipboard(`${alias.name}@${currentDomain}`);
                elements.aliasList.appendChild(li);
            });
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('In Zwischenablage kopiert!');
        }).catch(() => {
            showToast('Kopieren fehlgeschlagen!', true);
        });
    }

    elements.domainSelector.onchange = () => loadAliasesForDomain(elements.domainSelector.value);
});
