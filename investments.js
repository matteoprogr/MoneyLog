import { addTransferPlan, assertAccountLink, initDB, removeCashAccount, saveCashAccount, saveCashTransfer, updateTransferPlan } from './queryDexie.js';
import { showToast, showErrorToast } from './main.js';
import { canLinkAccount, consultationUrl, csvCell, formatInvestmentDate, installmentDate, investmentSeries, isinFeedback, localDate, makeQuote, positionPerformance, quantityHistory, saleCreditCents, validDate, validatePosition, valuation } from './investmentData.js';
import { initializeQuoteSources, openQuoteSource, readLatestQuote } from './investmentSources.js';

const byId = id => document.getElementById('investment-' + id);
const formatNumber = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 });
const formatPerformance = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
const amount = (value, currency = 'EUR') => value === null ? '—' :
    new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(value);
const percent = value => formatNumber.format(value) + '%';
const portfolioPercent = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 });
const quoteText = (position, value) => position.unit === 'nominal' ? percent(value) :
    formatNumber.format(value) + ' ' + position.currency;

let portfolio = [];
let cashTotal = 0;
let cashAccounts = [];
let closedPositions = [];
let refreshingQuotes = false;
let editing;
let quoting;
let selling;
let renderVersion = 0;
const expandedPositions = new Set();
const expandedHistories = new Set();
const historyPages = new Map();

const form = byId('form');
const fields = form.elements;
const quoteForm = byId('quote-form');
const editor = byId('editor');
const quoteEditor = byId('quote-editor');
const saleEditor = byId('sale-editor');
const saleForm = byId('sale-form');
const accountForm = byId('account-form');
const transferForm = byId('transfer-form');
const planForm = byId('plan-form');
const installmentForm = byId('installment-form');
let editingAccount;
let editingTransfer;
let editingPlan;
let confirmingInstallment;

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function button(text, onClick) {
    const node = element('button', text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
}

let openMenu;

function closeActionMenu(restoreFocus = false) {
    if (!openMenu) return;
    const { trigger, panel } = openMenu;
    openMenu = null;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
}

function actionMenu(label, actions, indicators = []) {
    const menu = element('div', '', 'investment-action-menu');
    const panel = element('div', '', 'investment-action-menu-panel');
    panel.hidden = true;
    const trigger = button('', () => {
        const wasOpen = !panel.hidden;
        closeActionMenu();
        if (wasOpen) return;
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        openMenu = { menu, panel, trigger };
    });
    trigger.className = 'investment-action-menu-trigger';
    trigger.setAttribute('aria-label', label);
    trigger.setAttribute('aria-expanded', 'false');
    for (const [text, action] of actions) {
        panel.append(button(text, () => {
            closeActionMenu(true);
            action();
        }));
    }
    for (const [symbol, description] of indicators) {
        const indicator = element('span', symbol === 'bell' ? '' : symbol, 'investment-indicator');
        if (symbol === 'bell') indicator.classList.add('investment-indicator-bell');
        indicator.setAttribute('role', 'img');
        indicator.setAttribute('aria-label', description);
        indicator.title = description;
        menu.append(indicator);
    }
    menu.append(trigger, panel);
    return menu;
}

function metric(label, value) {
    const node = element('div');
    node.append(element('small', label), element('strong', value));
    return node;
}

export async function renderInvestments() {
    const version = ++renderVersion;
    const db = initDB();
    const [positions, quotes, accounts, movements, transfers, transferPlans] = await db.transaction('r',
        db.investments, db.investmentQuotes, db.accounts, db.entrate, db.uscite, db.accountTransfers, db.transferPlans, async () => [
            await db.investments.toArray(), await db.investmentQuotes.toArray(),
            await db.accounts.toCollection().sortBy('name'),
            [...await db.entrate.where('accountId').above('').toArray(), ...await db.uscite.where('accountId').above('').toArray()],
            await db.accountTransfers.filter(transfer => !transfer.deleted).toArray(),
            await db.transferPlans.toArray()
        ]);
    if (version !== renderVersion) return;
    closeActionMenu();

    const series = new Map();
    for (const quote of quotes) {
        if (!series.has(quote.investmentId)) series.set(quote.investmentId, []);
        series.get(quote.investmentId).push(quote);
    }
    const rows = positions.sort((a, b) => a.type.localeCompare(b.type, 'it') || a.name.localeCompare(b.name, 'it'))
        .map(position => {
            const history = (series.get(position.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
            let latest = history.at(-1);
            const { quantity, purchases, closed } = quantityHistory(position, history);
            const lastSale = [...(position.sales ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
            if (position.unit === 'total' && lastSale && (!latest || lastSale.date >= latest.date)) {
                latest = { date: lastSale.date, value: lastSale.remainingValue };
            }
            return { position, history, latest, quantity, purchases, closed,
                ...valuation({ ...position, quantity }, latest, history, position.quantity) };
        });
    portfolio = rows.filter(row => !row.closed);
    closedPositions = rows.filter(row => row.closed);
    byId('refresh').disabled = refreshingQuotes || !portfolio.some(({ position }) => position.quoteSource);

    cashAccounts = accounts;
    cashTotal = renderAccounts(accounts, movements, positions, transfers, transferPlans);
    renderPlans(portfolio);
    const invested = portfolio.reduce((total, row) => total + (row.valueEur ?? 0), 0);
    const incomplete = portfolio.some(row => row.valueEur === null);
    byId('summary').replaceChildren(...[
        ['Valore degli investimenti', 'valueEur'], ['Capitale a carico', 'costEur'], ['Guadagno / perdita', 'gainEur']
    ].map(([label, field]) => {
        const available = portfolio.filter(row => row[field] !== null);
        const partial = available.length > 0 && available.length < portfolio.length;
        const total = available.length ? available.reduce((sum, row) => sum + row[field], 0) : null;
        return metric(label + (partial ? ' (parziale)' : ''), amount(total));
    }));
    byId('wealth-summary').replaceChildren(metric('Liquidità', amount(cashTotal)),
        metric(incomplete ? 'Patrimonio (parziale)' : 'Patrimonio', amount(invested + cashTotal)));
    byId('list').replaceChildren(...(portfolio.length ? portfolio.map(positionCard) :
        [element('p', 'Nessuna posizione aperta.')]));
    byId('closed').hidden = !closedPositions.length;
    byId('closed-list').replaceChildren(...closedPositions.map(positionCard));
    byId('analytics').hidden = !portfolio.length && !accounts.some(account => !account.archivedAt);
    byId('line-panel').hidden = !portfolio.length;
    if (!byId('analytics').hidden && document.getElementById('investimenti').classList.contains('active')) renderCharts();
}

function renderAccounts(accounts, movements, positions, transfers, transferPlans) {
    const balances = new Map(accounts.map(account => [account.id, account.openingCents]));
    const byAccount = new Map(accounts.map(account => [account.id, account]));
    const linked = new Set();
    const today = localDate();
    for (const movement of movements) {
        const { accountId, data, dataInserimento, importo } = movement;
        linked.add(accountId);
        if (data <= today && canLinkAccount(byAccount.get(accountId), data, dataInserimento)) {
            balances.set(accountId, balances.get(accountId) + Math.round(importo * 100));
        }
    }
    for (const position of positions) {
        for (const sale of position.sales ?? []) {
            const credit = sale.credit;
            if (!credit) continue;
            linked.add(credit.accountId);
            if (credit.date <= today && canLinkAccount(byAccount.get(credit.accountId), credit.date, credit.insertedAt)) {
                balances.set(credit.accountId, balances.get(credit.accountId) + saleCreditCents(sale, position.currency));
            }
        }
        for (const { accountId, date, insertedAt, amountCents, feeCents } of position.purchases ?? []) {
            if (accountId) linked.add(accountId);
            if (canLinkAccount(byAccount.get(accountId), date, insertedAt)) {
                balances.set(accountId, balances.get(accountId) - amountCents - feeCents);
            }
        }
    }
    for (const plan of transferPlans) linked.add(plan.fromId).add(plan.toId);
    for (const { fromId, toId, date, cents } of transfers) {
        linked.add(fromId).add(toId);
        if (date <= today && balances.has(fromId) && balances.has(toId)) {
            balances.set(fromId, balances.get(fromId) - cents);
            balances.set(toId, balances.get(toId) + cents);
        }
    }
    const active = accounts.filter(account => !account.archivedAt);
    const archived = accounts.filter(account => account.archivedAt);
    const actions = [['Aggiungi conto', () => openAccount()]];
    if (active.length > 1) actions.push(['Trasferisci liquidità', () => openTransfer(accounts)]);
    const header = byId('accounts-header');
    header.querySelector('.investment-action-menu')?.remove();
    header.append(actionMenu('Azioni Liquidità', actions));

    byId('accounts').replaceChildren(...(active.length ? active.map(account => {
        const row = element('div', '', 'investment-cash-row');
        const details = element('div');
        const balance = balances.get(account.id);
        details.append(metric(account.name, amount(balance / 100)),
            element('small', 'Saldo iniziale ' + amount(account.openingCents / 100), 'investment-cash-detail'),
            element('small', formatInvestmentDate(account.date), 'investment-cash-detail'),
            element('small', account.boundary === 'end' ? 'Fine giornata' : 'Inizio giornata', 'investment-cash-detail'));
        const accountActions = [['Modifica', () => openAccount(account, balance)]];
        if (active.length > 1) accountActions.push(['Trasferisci da questo conto', () => openTransfer(accounts, account.id)]);
        const archive = linked.has(account.id);
        accountActions.push([archive ? 'Archivia' : 'Elimina', () => safely(async () => {
            const message = archive ?
                'Archiviare «' + account.name + '»? Il saldo di ' + amount(balance / 100) + ' sarà escluso dalla liquidità.' :
                'Eliminare «' + account.name + '» e il suo saldo iniziale?';
            if (!window.confirm(message)) return;
            await removeCashAccount(account, archive);
            await renderInvestments();
            showToast(archive ? 'Conto archiviato' : 'Conto eliminato');
        })]);
        row.append(details, actionMenu('Azioni conto ' + account.name, accountActions));
        return row;
    }) : [element('p', 'Nessun conto attivo.')]));
    byId('archived-accounts').hidden = !archived.length;
    byId('archived-list').replaceChildren(...archived.map(account => {
        const row = element('div', '', 'investment-cash-row');
        row.append(metric(account.name, 'Archiviato il ' + formatInvestmentDate(account.archivedAt.slice(0, 10))));
        return row;
    }));
    renderTransfers(transfers, accounts);
    renderTransferPlans(transferPlans, byAccount);
    return active.reduce((total, account) => total + balances.get(account.id), 0) / 100;
}

function openAccount(account = null, currentBalance = null) {
    editingAccount = { account, balance: currentBalance };
    accountForm.reset();
    byId('account-title').textContent = account ? 'Modifica conto' : 'Aggiungi conto';
    byId('account-error').textContent = '';
    const { name, balance, date, boundary } = accountForm.elements;
    name.value = account?.name ?? '';
    balance.value = account ? account.openingCents / 100 : '';
    date.max = localDate();
    date.value = account?.date ?? date.max;
    boundary.value = account?.boundary ?? 'end';
    updateAccountPreview();
    byId('account-editor').showModal();
}

function updateAccountPreview() {
    const { account, balance } = editingAccount;
    const cents = Math.round(accountForm.elements.balance.valueAsNumber * 100);
    byId('account-preview').textContent = account && Number.isSafeInteger(cents) ?
        'Saldo attuale ' + amount(balance / 100) + ' · Saldo dopo la modifica ' +
        amount((balance + cents - account.openingCents) / 100) : '';
}

async function saveAccount() {
    const { name, balance, date, boundary } = accountForm.elements;
    await saveCashAccount({
        openingCents: Math.round(balance.valueAsNumber * 100),
        date: date.value, boundary: boundary.value, name: name.value
    }, editingAccount.account);
    byId('account-editor').close();
    await renderInvestments();
    showToast('Conto salvato');
}

function renderTransfers(transfers, accounts) {
    const names = new Map(accounts.map(account => [account.id, account.name]));
    byId('transfer-history').hidden = !transfers.length;
    byId('transfers').replaceChildren(...transfers.sort((a, b) => b.date.localeCompare(a.date) ||
        b.createdAt.localeCompare(a.createdAt)).map(transfer => {
        const row = element('div', '', 'investment-cash-row');
        const route = names.get(transfer.fromId) + ' → ' + names.get(transfer.toId);
        row.append(metric(formatInvestmentDate(transfer.date) + ' · ' + route, amount(transfer.cents / 100)),
            actionMenu('Azioni trasferimento ' + route, [
                ['Modifica', () => openTransfer(accounts, transfer.fromId, transfer)],
                ['Annulla trasferimento', () => safely(async () => {
                    if (!window.confirm('Annullare il trasferimento di ' + amount(transfer.cents / 100) + ' (' + route + ')?')) return;
                    await saveCashTransfer({}, transfer, true);
                    await renderInvestments();
                    showToast('Trasferimento annullato');
                })]
            ]));
        return row;
    }));
}

function renderTransferPlans(plans, accounts) {
    byId('transfer-plans').hidden = !plans.length;
    byId('transfer-plans-list').replaceChildren(...plans.map(plan => {
        const from = accounts.get(plan.fromId);
        const to = accounts.get(plan.toId);
        const unavailable = !from || !to || from.archivedAt || to.archivedAt;
        const route = (from?.name ?? 'Conto non disponibile') + ' → ' + (to?.name ?? 'Conto non disponibile');
        const due = installmentDate(plan);
        const pending = !plan.paused && due <= localDate();
        const apply = action => safely(async () => {
            await updateTransferPlan(plan, action);
            await renderInvestments();
        });
        const actions = [[plan.paused ? 'Riprendi piano' : 'Sospendi piano', () => apply('toggle')]];
        if (pending) {
            if (!unavailable) actions.push(['Conferma rata', () => apply('confirm')]);
            actions.push(['Salta rata', () => {
                if (window.confirm('Saltare il trasferimento del ' + formatInvestmentDate(due) + '?')) apply('skip');
            }]);
        }
        const status = unavailable ? 'Conto non disponibile' : plan.paused ? 'Sospeso' : 'Scadenza ' + formatInvestmentDate(due);
        const row = element('div', '', 'investment-cash-row');
        row.append(metric(route, amount(plan.cents / 100) + ' · ' + status),
            actionMenu('Azioni trasferimento ricorrente ' + route, actions,
                pending ? [['bell', unavailable ? 'Rata da gestire · Conto non disponibile' : 'Rata da confermare']] : []));
        return row;
    }));
}

function openTransfer(accounts, source = '', transfer = null) {
    editingTransfer = transfer;
    transferForm.reset();
    byId('transfer-title').textContent = transfer ? 'Modifica trasferimento' : 'Trasferisci liquidità';
    byId('transfer-error').textContent = '';
    const { fromId, toId, amount: price, date, frequency } = transferForm.elements;
    byId('transfer-frequency-label').hidden = Boolean(transfer);
    frequency.disabled = Boolean(transfer);
    for (const select of [fromId, toId]) {
        const retained = transfer?.[select.name];
        const options = accounts.filter(account => !account.archivedAt || account.id === retained);
        select.replaceChildren(new Option('Seleziona un conto', ''), ...options.map(account =>
            new Option(account.name + (account.archivedAt ? ' (archiviato)' : ''), account.id)));
    }
    fromId.value = source;
    toId.value = transfer?.toId ?? '';
    price.value = transfer ? transfer.cents / 100 : '';
    date.value = transfer?.date ?? localDate();
    updateTransferOptions();
    byId('transfer-editor').showModal();
}

function updateTransferOptions() {
    const { fromId, toId, date, frequency } = transferForm.elements;
    const recurring = frequency.value !== '0';
    date.max = recurring ? '' : localDate();
    byId('transfer-date-label').textContent = recurring ? 'Prima scadenza' : 'Data del trasferimento';
    for (const [select, other] of [[fromId, toId], [toId, fromId]]) {
        for (const option of select.options) option.disabled = Boolean(option.value && option.value === other.value);
    }
}

async function saveTransfer() {
    const { fromId, toId, amount: price, date, frequency } = transferForm.elements;
    const input = {
        fromId: fromId.value, toId: toId.value, date: date.value, cents: Math.round(price.valueAsNumber * 100)
    };
    const recurring = !editingTransfer && Number(frequency.value) > 0;
    if (recurring) await addTransferPlan({ ...input, frequency: Number(frequency.value) });
    else await saveCashTransfer(input, editingTransfer);
    byId('transfer-editor').close();
    await renderInvestments();
    showToast(recurring ? 'Trasferimento ricorrente configurato' : 'Trasferimento salvato');
}

function renderPlans(rows) {
    const plans = rows.map(row => row.position).filter(position => position.plan);
    byId('plans-panel').hidden = !plans.length;
    byId('plans').replaceChildren(...plans.map(position => {
        const { plan } = position;
        const due = installmentDate(plan);
        const pending = !plan.paused && due <= localDate();
        const row = element('div', '', 'investment-cash-row');
        const actions = [
            ['Modifica piano', () => openPlan(position)],
            [plan.paused ? 'Riprendi piano' : 'Sospendi piano', () => safely(async () => {
                await persistPlan(position, { ...plan, paused: !plan.paused });
                await renderInvestments();
                showToast(plan.paused ? 'Piano ripreso' : 'Piano sospeso');
            })]
        ];
        if (pending) {
            actions.push(['Conferma rata', () => safely(() => openInstallment(position))],
                ['Salta rata', () => safely(async () => {
                    if (window.confirm('Saltare la rata del ' + formatInvestmentDate(due) + '?')) {
                        await resolveInstallment(position);
                    }
                })]);
        }
        const details = element('div');
        details.append(metric(position.name, amount(plan.amountCents / 100, position.currency)),
            element('small', plan.paused ? 'Sospeso' : 'Scadenza ' + formatInvestmentDate(due), 'investment-cash-detail'));
        row.append(details, actionMenu('Azioni piano ' + position.name, actions,
            pending ? [['bell', 'Rata da confermare']] : []));
        return row;
    }));
}

function openPlan(position) {
    editingPlan = position;
    planForm.reset();
    byId('plan-error').textContent = '';
    byId('plan-position').textContent = position.name + ' · ' + position.currency;
    const { amount: price, date, frequency, paused, accountId } = planForm.elements;
    price.value = position.plan ? position.plan.amountCents / 100 : '';
    date.value = position.plan?.date ?? localDate();
    date.min = position.startDate ?? '';
    frequency.value = position.plan?.frequency ?? '1';
    paused.checked = position.plan?.paused ?? false;
    accountId.disabled = position.currency !== 'EUR';
    byId('plan-account-label').hidden = accountId.disabled;
    const selected = position.plan?.accountId ?? '';
    accountId.replaceChildren(new Option('Nessun conto', ''), ...cashAccounts
        .filter(account => !account.archivedAt || account.id === selected)
        .map(account => new Option(account.name + (account.archivedAt ? ' (archiviato)' : ''), account.id)));
    accountId.value = selected;
    byId('plan-editor').showModal();
}

async function savePlan() {
    const { amount: price, date, frequency, paused, accountId } = planForm.elements;
    const opened = editingPlan;
    const existing = opened.plan;
    const sameSchedule = existing?.date === date.value && existing.frequency === Number(frequency.value);
    const plan = {
        id: sameSchedule ? existing.id : crypto.randomUUID(),
        date: date.value, frequency: Number(frequency.value), offset: sameSchedule ? existing.offset : 0,
        amountCents: Math.round(price.valueAsNumber * 100), paused: paused.checked,
        accountId: accountId.disabled ? null : accountId.value || null
    };
    await persistPlan(opened, plan);
    byId('plan-editor').close();
    await renderInvestments();
    showToast('Piano salvato');
}

async function persistPlan(opened, plan) {
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, db.accounts, async () => {
        const position = await db.investments.get(opened.id);
        if (!position || position.revision !== opened.revision) throw new Error('La posizione è cambiata. Riapri il piano.');
        const history = await db.investmentQuotes.where('investmentId').equals(position.id).toArray();
        if (quantityHistory(position, history).closed) throw new Error('Questa posizione è chiusa.');
        const updated = validatePosition({ ...position, plan });
        if (plan.accountId && plan.accountId !== position.plan?.accountId) {
            const account = await db.accounts.get(plan.accountId);
            if (!account || account.archivedAt) throw new Error('Scegli un conto attivo.');
        }
        await db.investments.update(position.id, { plan: updated.plan, revision: crypto.randomUUID() });
    });
}

async function openInstallment(position) {
    confirmingInstallment = position;
    installmentForm.reset();
    byId('installment-error').textContent = '';
    byId('installment-position').textContent = position.name + ' · ' + position.currency + ' · rata del ' +
        formatInvestmentDate(installmentDate(position.plan));
    const { date, amount: price, quantity, fees, accountId } = installmentForm.elements;
    date.max = localDate();
    date.min = position.startDate ?? '';
    date.value = date.max;
    price.value = position.plan.amountCents / 100;
    fees.value = 0;
    quantity.closest('label').firstChild.textContent = position.unit === 'nominal' ? 'Nominale acquistato' : 'Quote acquistate';
    const accounts = position.currency === 'EUR' ? await initDB().accounts.toCollection().sortBy('name') : [];
    let preferred = position.plan.accountId ?? 'none';
    const note = byId('installment-account-note');
    const updateAccounts = () => {
        const now = new Date().toISOString();
        const eligible = accounts.filter(account => !account.archivedAt && canLinkAccount(account, date.value, now));
        accountId.replaceChildren(new Option('Nessun conto', 'none'), ...eligible.map(account => new Option(account.name, account.id)));
        const unavailable = preferred !== 'none' && !eligible.some(account => account.id === preferred);
        accountId.required = unavailable;
        if (unavailable) {
            const prompt = new Option('Scegli un conto', '', false, true);
            prompt.disabled = true;
            accountId.prepend(prompt);
            accountId.value = '';
        } else {
            accountId.value = preferred;
        }
        note.textContent = unavailable ?
            'Il conto indicato non è disponibile per questa data. Scegli un altro conto o Nessun conto.' : '';
    };
    date.onchange = updateAccounts;
    accountId.onchange = () => {
        preferred = accountId.value;
        note.textContent = '';
    };
    updateAccounts();
    byId('installment-editor').showModal();
}

async function resolveInstallment(opened, purchase = null) {
    const db = initDB();
    const due = installmentDate(opened.plan);
    await db.transaction('rw', db.investments, db.investmentQuotes, db.accounts, async () => {
        const position = await db.investments.get(opened.id);
        const plan = position?.plan;
        if (!plan || opened.revision !== position.revision || plan.paused || due > localDate()) {
            throw new Error('La rata è cambiata. Riapri il piano.');
        }
        const history = await db.investmentQuotes.where('investmentId').equals(position.id).toArray();
        if (quantityHistory(position, history).closed) throw new Error('Questa posizione è chiusa.');
        const purchases = [...(position.purchases ?? [])];
        if (purchase) {
            if (history.some(quote => quote.date >= purchase.date && quote.totalQuantity !== undefined) ||
                position.sales?.some(sale => sale.date >= purchase.date)) {
                throw new Error('Usa una data successiva all’ultima vendita o registrazione del totale delle quote.');
            }
            const insertedAt = new Date().toISOString();
            await assertAccountLink(db, { accountId: purchase.accountId, data: purchase.date, dataInserimento: insertedAt });
            purchases.push({ ...purchase, id: plan.id + ':' + due, due, insertedAt });
        }
        const nextPlan = { ...plan, offset: plan.offset + 1 };
        const updated = validatePosition({ ...position, purchases, plan: nextPlan });
        quantityHistory(updated, history);
        await db.investments.update(position.id, {
            purchases: updated.purchases, plan: updated.plan, revision: crypto.randomUUID()
        });
    });
    if (purchase) byId('installment-editor').close();
    await renderInvestments();
    showToast(purchase ? 'Acquisto registrato' : 'Rata saltata');
}

function appendPagedHistory(section, key, records, renderRow) {
    const pageSize = 10;
    const pageCount = Math.ceil(records.length / pageSize);
    const list = element('ul');
    section.append(list);
    let page = Math.min(historyPages.get(key) ?? 0, pageCount - 1);
    const controls = element('div', '', 'investment-history-pages');
    const status = element('small');
    status.setAttribute('aria-live', 'polite');
    const previous = button('‹', () => showPage(page - 1));
    previous.className = 'navigation-arrow';
    previous.setAttribute('aria-label', 'Pagina precedente');
    const next = button('›', () => showPage(page + 1));
    next.className = 'navigation-arrow';
    next.setAttribute('aria-label', 'Pagina successiva');
    function showPage(index) {
        page = index;
        historyPages.set(key, page);
        list.replaceChildren(...records.slice(page * pageSize, (page + 1) * pageSize).map(renderRow));
        status.textContent = 'Pagina ' + (page + 1) + ' di ' + pageCount;
        previous.disabled = page === 0;
        next.disabled = page === pageCount - 1;
    }
    if (pageCount > 1) {
        controls.append(previous, status, next);
        section.append(controls);
    }
    showPage(page);
}

function purchaseHistory(position) {
    const section = element('details', '', 'investment-quote-history');
    section.append(element('summary', 'Storico acquisti (' + position.purchases.length + ')'));
    const records = [...position.purchases].sort((a, b) => b.date.localeCompare(a.date));
    appendPagedHistory(section, 'purchase:' + position.id, records, purchase => {
        const row = element('li');
        const info = element('div', '', 'investment-quote-info');
        info.append(element('strong', formatInvestmentDate(purchase.date) + ' · ' +
            formatNumber.format(purchase.quantity) + (position.unit === 'nominal' ? ' di nominale' : ' quote')),
        element('small', amount(purchase.amountCents / 100, position.currency) + ' investiti · ' +
            amount(purchase.feeCents / 100, position.currency) + ' di commissioni · rata del ' + formatInvestmentDate(purchase.due)));
        row.append(info);
        return row;
    });
    return section;
}

function positionCard(row) {
    const { position, history, latest, quantity, purchases, value, cost, gain, valueEur, closed } = row;
    const card = element('details', '', 'investment-panel investment-position');
    card.open = expandedPositions.has(position.id);
    card.addEventListener('toggle', () => {
        if (card.open) expandedPositions.add(position.id);
        else expandedPositions.delete(position.id);
    });
    const subtitle = [position.type, position.isin].filter(Boolean).join(' · ');
    const summary = element('summary');
    const heading = element('div', '', 'investment-position-heading');
    heading.append(element('strong', position.name),
        element('small', subtitle),
        element('span', closed ? 'Posizione chiusa' : value === null ? 'Quotazione mancante' : amount(value, position.currency)));
    summary.append(heading);
    card.append(summary);
    const fields = element('div', '', 'investment-fields investment-metrics');
    if (position.unit !== 'total') {
        fields.append(metric(position.unit === 'nominal' ? 'Nominale' : 'Quantità', formatNumber.format(quantity)));
    }
    if (!closed) fields.append(
        metric('Ultima quotazione', latest ? quoteText(position, latest.value) : '—'),
        metric('Data del dato', formatInvestmentDate(latest?.date)),
        metric('Controvalore', amount(value, position.currency)),
        metric(position.gainReference && cost !== null ? 'Capitale iniziale stimato' : 'Costo di carico', amount(cost, position.currency)),
        metric('Guadagno / perdita', amount(gain, position.currency) + (gain !== null && cost > 0 ? ' · ' + percent(gain / cost * 100) : ''))
    );
    if (!closed && position.unit !== 'total') {
        const average = position.purchases?.length ?
            cost === null || !quantity ? null : cost / quantity * (position.unit === 'nominal' ? 100 : 1) :
            position.averageCost;
        if (average !== null) fields.append(metric('Prezzo medio di carico', quoteText(position, average)));
    }
    if (position.startDate) fields.append(metric('Inizio investimento', formatInvestmentDate(position.startDate)));
    if (!closed && position.gainReference) {
        const reference = position.gainReference;
        fields.append(metric('Guadagno / perdita dichiarati al ' + formatInvestmentDate(reference.date), amount(reference.gain, position.currency)));
        if (reference.value > 0) {
            fields.append(metric('Guadagno o perdita in % del controvalore al ' + formatInvestmentDate(reference.date), percent(reference.gain / reference.value * 100)));
        }
        if (gain !== null && value > 0 && latest.date > reference.date) {
            fields.append(metric('Incidenza sul controvalore attuale', percent(gain / value * 100)));
        }
    }
    if (!closed && cost === null && history.length > 1 && history[0].value > 0) {
        fields.append(metric('Variazione dalla prima quotazione', percent((latest.value / history[0].value - 1) * 100)));
    }
    if (!closed && position.currency !== 'EUR') {
        fields.append(metric('Controvalore in euro', valueEur === null ? 'Cambio o quotazione mancante' : amount(valueEur)));
    }
    card.append(fields);
    const actions = closed ? [] : [
        ['Registra quotazione', () => openQuote(position)],
        ['Configura fonte', () => openQuoteSource(position)],
        ['Modifica', () => openPosition(position)],
        [position.unit === 'total' ? 'Registra riscatto' : 'Registra vendita', () => openSale(row)]
    ];
    if (!closed && position.unit !== 'total' && !position.plan) {
        actions.push(['Configura piano ricorrente', () => openPlan(position)]);
    }
    if (history.length || position.purchases?.length || position.sales?.length) {
        actions.push(['Scarica storico CSV', () => safely(() => exportPositionHistory(row))]);
    }
    actions.push(['Elimina', () => safely(() => deletePosition(position))]);
    if (position.purchases?.length) card.append(purchaseHistory(position));
    if (position.sales?.length) card.append(saleHistory(row));
    if (history.length) card.append(quoteHistory(position, history, purchases, closed));
    const wrapper = element('div', '', 'investment-position-wrapper');
    const indicators = !closed && position.plan && !position.plan.paused ?
        [['↻', 'Piano di investimento attivo']] : [];
    wrapper.append(actionMenu('Azioni posizione ' + position.name, actions, indicators), card);
    return wrapper;
}

function quoteHistory(position, history, purchases, closed) {
    const section = element('details', '', 'investment-quote-history');
    section.open = expandedHistories.has(position.id);
    section.addEventListener('toggle', () => {
        if (section.open) expandedHistories.add(position.id);
        else expandedHistories.delete(position.id);
    });
    section.append(element('summary', 'Storico quotazioni (' + history.length + ')'));
    appendPagedHistory(section, 'quote:' + position.id, [...history].reverse(), quote => {
        const row = element('li');
        const info = element('div', '', 'investment-quote-info');
        const date = element('time', formatInvestmentDate(quote.date));
        date.dateTime = quote.date;
        info.append(date, element('strong', quoteText(position, quote.value)));
        if (quote.sourcePeriod) info.append(element('small', 'Periodo della fonte: ' + quote.sourcePeriod));
        if (quote.totalQuantity !== undefined) info.append(element('small',
            formatNumber.format(quote.totalQuantity - soldBefore(position, quote.date)) + ' quote totali · ' +
            formatNumber.format(purchases.get(quote.date)) + ' acquistate'));
        row.append(info);
        const initial = quote.date === position.initialQuoteDate;
        if (initial) info.append(element('small', 'Quotazione iniziale'));
        if (initial || !closed) {
            const actions = [['Modifica', () => openQuote(position, quote)]];
            if (!initial) actions.push(['Elimina', () => safely(() => deleteQuote(position, quote))]);
            row.classList.add('investment-quote-with-actions');
            row.prepend(actionMenu('Azioni quotazione del ' + formatInvestmentDate(quote.date), actions));
        }
        return row;
    });
    return section;
}

function saleHistory(row) {
    const { position, closed } = row;
    const sales = [...position.sales].sort((a, b) => a.date.localeCompare(b.date));
    const section = element('details', '', 'investment-quote-history');
    section.append(element('summary', 'Storico vendite e riscatti (' + sales.length + ')'));
    const known = sales.filter(sale => sale.cost !== null);
    const estimated = known.some(sale => sale.estimated);
    const totals = element('dl', '', 'investment-sale-totals');
    const result = known.length ? known.reduce((sum, sale) => sum + sale.gross - sale.fees - sale.cost, 0) : null;
    const resultLabel = 'Risultato realizzato' + (known.length < sales.length ? ' (parziale)' : '') +
        (estimated ? ' · include stime' : '');
    totals.append(element('dt', resultLabel), element('dd', amount(result, position.currency)));
    if (closed) totals.append(element('dt', 'Data di chiusura'),
        element('dd', formatInvestmentDate(sales.at(-1).date)));
    section.append(totals);
    appendPagedHistory(section, 'sale:' + position.id, sales.reverse(), sale => {
        const net = sale.gross - sale.fees;
        const date = element('time', formatInvestmentDate(sale.date));
        date.dateTime = sale.date;
        const info = element('dl', '', 'investment-sale-totals');
        info.append(element('dt', 'Incasso'), element('dd', amount(net, position.currency)));
        if (sale.quantity !== null) info.append(element('dt', 'Quantità venduta'),
            element('dd', formatNumber.format(sale.quantity)));
        else info.append(element('dt', 'Saldo residuo'), element('dd', amount(sale.remainingValue, position.currency)));
        if (sale.rate !== null) info.append(element('dt', 'Incasso in euro'), element('dd', amount(net * sale.rate)));
        if (sale.credit) {
            const account = cashAccounts.find(item => item.id === sale.credit.accountId);
            info.append(element('dt', 'Accredito · ' + (account?.name ?? 'Conto non disponibile')),
                element('dd', amount(saleCreditCents(sale, position.currency) / 100) + ' · ' + formatInvestmentDate(sale.credit.date)));
        }
        info.append(element('dt', sale.estimated ? 'Risultato stimato' : 'Risultato'),
            element('dd', sale.cost === null ? 'Non calcolabile' : amount(net - sale.cost, position.currency)));
        const item = element('li', '', 'investment-sale-entry');
        const operation = (position.unit === 'total' ? 'riscatto' : 'vendita') + ' del ' + formatInvestmentDate(sale.date);
        item.append(actionMenu('Azioni ' + operation, [
            ['Modifica', () => openSale(row, sale)],
            ['Elimina', () => safely(() => deleteSale(position, sale))]
        ]), date, info);
        return item;
    });
    return section;
}

function openSale(row, original = null) {
    selling = { ...row, original };
    saleForm.reset();
    const { position, quantity } = row;
    const total = position.unit === 'total';
    const fields = saleForm.elements;
    fields.date.value = original?.date ?? localDate();
    fields.date.max = localDate();
    fields.date.min = position.startDate ?? '';
    fields.quantity.value = total ? '' : original?.quantity ?? quantity;
    fields.gross.value = original?.gross ?? '';
    fields.fees.value = original?.fees ?? '';
    fields.remainingValue.value = original?.remainingValue ?? '';
    fields.cost.value = original?.cost ?? '';
    fields.quantity.required = !total;
    fields.remainingValue.required = total;
    fields.rate.value = (original ? original.rate : position.rate) ?? '';
    const account = original?.credit?.accountId ?? '';
    fields.accountId.replaceChildren(new Option('Nessun conto', ''), ...cashAccounts
        .filter(item => !item.archivedAt || item.id === account)
        .map(item => new Option(item.name + (item.archivedAt ? ' (archiviato)' : ''), item.id)));
    fields.accountId.value = account;
    fields.creditDate.value = original?.credit?.date ?? '';
    fields.creditAmount.value = original?.credit?.euroCents == null ? '' : original.credit.euroCents / 100;
    fields.rate.disabled = position.currency === 'EUR';
    fields.price.disabled = total;
    byId('sale-quantity').hidden = total;
    byId('sale-price').hidden = total;
    byId('sale-value').hidden = !total;
    byId('sale-rate').hidden = fields.rate.disabled;
    const action = original ? 'Modifica ' : 'Registra ';
    byId('sale-title').textContent = action + (total ? 'riscatto' : 'vendita') + ' · ' + position.name;
    byId('sale-submit').textContent = original ? 'Salva modifica' : 'Salva operazione';
    byId('sale-currency').textContent = 'Valuta: ' + position.currency +
        (position.unit === 'nominal' ? ' · Prezzo in percentuale del nominale' : '');
    byId('sale-error').textContent = '';
    updateSaleCreditFields();
    updateSalePreview();
    saleEditor.showModal();
}

function updateSaleCreditFields() {
    const { accountId, date, creditDate, creditAmount } = saleForm.elements;
    const linked = Boolean(accountId.value);
    creditDate.min = date.value;
    if (linked && !creditDate.value) creditDate.value = date.value;
    creditDate.disabled = !linked;
    creditAmount.disabled = !linked || selling.position.currency === 'EUR';
    byId('sale-credit-date').hidden = creditDate.disabled;
    byId('sale-credit-amount').hidden = creditAmount.disabled;
}

function readSaleFields() {
    return Object.fromEntries([...saleForm.elements].filter(field => field.name && !field.disabled)
        .map(field => [field.name, field.type === 'number' ?
            (field.value === '' ? null : field.valueAsNumber) : field.value]));
}

function saleFromForm(position, history, id, input, original) {
    const { date, price = null, gross: enteredGross, fees = 0, quantity: enteredQuantity,
        remainingValue: enteredBalance, rate = null, cost: enteredCost } = input;
    const total = position.unit === 'total';
    const quantity = total ? null : enteredQuantity;
    const multiplier = quantity === null ? 0 : quantity / (position.unit === 'nominal' ? 100 : 1);
    if (enteredGross !== null && price !== null) {
        throw new Error('Inserisci il ricavo lordo oppure il prezzo di esecuzione.');
    }
    const gross = enteredGross ?? (price === null ? null : price * multiplier);
    const remainingValue = total ? enteredBalance : null;
    const sales = position.sales ?? [];
    const index = original ? sales.findIndex(sale => sale.id === id) : sales.length;
    if (index < 0) throw new Error('L’operazione non è più presente.');
    const before = {
        ...position, sales: sales.filter((sale, offset) => sale.id !== id &&
            (sale.date < date || (sale.date === date && offset < index))),
        purchases: (position.purchases ?? []).filter(purchase => purchase.date <= date)
    };
    const pastQuotes = history.filter(quote => quote.date <= date);
    const { quantity: available } = quantityHistory(before, pastQuotes);
    const laterPurchases = history.some(quote => quote.date > date && quote.totalQuantity !== undefined);
    const basis = valuation({ ...before, quantity: available }, pastQuotes.at(-1), pastQuotes, position.quantity).cost;
    const sameBasis = !laterPurchases && (!position.gainReference || position.gainReference.date <= date);
    const calculated = sameBasis ? (total ? remainingValue === 0 ? basis : null :
        basis === null || !available ? null : basis / available * quantity) : null;
    const sameCostInputs = original && original.date === date && original.quantity === quantity &&
        original.remainingValue === remainingValue && original.cost === enteredCost;
    const explicitCost = original && original.cost === enteredCost && !sameCostInputs && calculated !== null ?
        null : enteredCost;
    if (!sameCostInputs && !total && position.averageCost !== null && calculated !== null && explicitCost !== null &&
        Math.abs(calculated - explicitCost) > 0.005) {
        throw new Error('Per questa vendita il costo viene calcolato dal prezzo medio di carico.');
    }
    const cost = !total && position.averageCost !== null && calculated !== null ? calculated : explicitCost ?? calculated;
    if (position.startDate && date < position.startDate) throw new Error('La vendita precede l’inizio dell’investimento.');
    if (total && !original && sales.some(sale => sale.date > date)) throw new Error('Inserisci i riscatti in ordine di data.');
    if (total && basis !== null && cost !== null && cost - basis > 1e-7) {
        throw new Error('Il costo attribuito supera il capitale di carico residuo.');
    }
    const credit = input.accountId ? {
        accountId: input.accountId, date: input.creditDate || date,
        euroCents: input.creditAmount == null ? null : Math.round(input.creditAmount * 100),
        insertedAt: input.accountId === original?.credit?.accountId ? original.credit.insertedAt : new Date().toISOString()
    } : null;
    const sale = { id, date, quantity, gross, fees: fees ?? 0, cost: sameCostInputs ? original.cost : cost, remainingValue, credit,
        rate, estimated: sameCostInputs ? original.estimated : explicitCost === null && calculated !== null && position.averageCost === null };
    const changedSales = [...sales];
    changedSales.splice(index, original ? 1 : 0, sale);
    const updated = validatePosition({ ...position, sales: changedSales });
    const state = validateSaleHistory(updated, history);
    return { sales: updated.sales, sale, state };
}

function validateSaleHistory(position, history) {
    const state = quantityHistory(position, history);
    if (position.unit !== 'total') return state;
    const previous = [];
    const ordered = [...position.sales].sort((a, b) => a.date.localeCompare(b.date));
    for (const sale of ordered) {
        const reference = position.gainReference;
        const basis = position.averageCost !== null ? position.averageCost :
            reference && sale.date > reference.date ? reference.value - reference.gain : null;
        if (basis !== null && sale.cost !== null) {
            const costs = previous.filter(item => position.averageCost !== null || item.date > reference.date);
            if (costs.every(item => item.cost !== null) &&
                costs.reduce((sum, item) => sum + item.cost, sale.cost) - basis > 1e-7) {
                throw new Error('Il costo attribuito al riscatto del ' + formatInvestmentDate(sale.date) + ' supera il capitale residuo.');
            }
        }
        previous.push(sale);
    }
    return state;
}

function updateSalePreview() {
    const preview = byId('sale-preview');
    preview.replaceChildren();
    const errorOutput = byId('sale-preview-error');
    errorOutput.textContent = '';
    if (!saleForm.checkValidity()) return;
    const { position, history, original } = selling;
    try {
        const { sale, state } = saleFromForm(position, history, original?.id ?? 'preview', readSaleFields(), original);
        const net = sale.gross - sale.fees;
        const total = position.unit === 'total';
        for (const [label, value] of [
            ['Incasso netto', amount(net, position.currency)],
            ['Costo attribuito', amount(sale.cost, position.currency)],
            [sale.estimated ? 'Risultato stimato' : 'Risultato realizzato',
                amount(sale.cost === null ? null : net - sale.cost, position.currency)],
            [total ? 'Saldo residuo' : 'Quantità residua', total ? amount(sale.remainingValue, position.currency) :
                formatNumber.format(state.quantity)]
        ]) preview.append(element('dt', label), element('dd', value));
        if (sale.credit) preview.append(element('dt', 'Accredito sul conto'),
            element('dd', amount(saleCreditCents(sale, position.currency) / 100)));
    } catch (error) {
        errorOutput.textContent = error.message;
    }
}

async function saveSale() {
    const { position, original } = selling;
    const input = readSaleFields();
    await updateSales(position, (current, history) =>
        saleFromForm(current, history, original?.id ?? crypto.randomUUID(), input, original).sales);
    saleEditor.close();
    await renderInvestments();
    showToast(original ? 'Operazione aggiornata' : 'Operazione registrata');
}

async function deleteSale(position, sale) {
    const operation = position.unit === 'total' ? 'il riscatto' : 'la vendita';
    if (!window.confirm('Eliminare ' + operation + ' del ' + formatInvestmentDate(sale.date) + '?')) return;
    await updateSales(position, current => current.sales.filter(item => item.id !== sale.id));
    await renderInvestments();
    showToast('Operazione eliminata');
}

async function updateSales(position, changes) {
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, db.accounts, async () => {
        const current = await db.investments.get(position.id);
        if (!current || current.revision !== position.revision) throw new Error('La posizione è cambiata. Riapri la scheda.');
        const history = await db.investmentQuotes.where('investmentId').equals(position.id).sortBy('date');
        const sales = changes(current, history);
        const originals = new Map((current.sales ?? []).map(sale => [sale.id, sale.credit]));
        for (const { id, credit } of sales) {
            if (credit) await assertAccountLink(db, {
                accountId: credit.accountId, data: credit.date, dataInserimento: credit.insertedAt
            }, originals.get(id)?.accountId === credit.accountId);
        }
        validateSaleHistory({ ...current, sales }, history);
        await db.investments.update(position.id, { sales, revision: crypto.randomUUID() });
    });
}

function updateConsultationLink(id, { type, isin, url }) {
    const link = byId(id + '-link');
    const row = byId(id + '-link-row');
    let href;
    if (url) {
        try {
            href = consultationUrl(url);
        } catch {
            // An unfinished or invalid URL must never become a clickable link.
        }
    } else if (type === 'ETF' && isin && !isinFeedback(isin)) {
        href = 'https://www.justetf.com/it/etf-profile.html?isin=' + isin + '#panoramica';
    }
    row.hidden = !href;
    if (href) {
        link.href = href;
        link.textContent = url ? 'Apri fonte' : 'Apri su JustETF';
    } else {
        link.removeAttribute('href');
    }
}

function updatePositionFields() {
    const total = fields.unit.value === 'total';
    byId('quantity-label').hidden = total;
    fields.quantity.disabled = total;
    const row = portfolio.find(row => row.position.id === editing?.id);
    const hasQuantityHistory = row?.purchases.size || row?.position.purchases?.length;
    byId('quantity-label').firstElementChild.textContent = hasQuantityHistory ? 'Quantità prima degli acquisti registrati' :
        fields.unit.value === 'nominal' ? 'Valore nominale detenuto' : 'Quantità o quote';
    byId('cost-label').firstElementChild.textContent = {
        unit: 'Prezzo medio di carico (facoltativo)',
        nominal: 'Prezzo medio di carico (% del nominale, facoltativo)',
        total: 'Capitale investito (facoltativo)'
    }[fields.unit.value];
    byId('current-label').firstElementChild.textContent = {
        unit: 'Ultima quotazione',
        nominal: 'Ultima quotazione (% del nominale)',
        total: 'Controvalore da rendiconto'
    }[fields.unit.value];
    const hasCost = fields.averageCost.value !== '';
    fields.reportedGain.disabled = hasCost;
    byId('gain-label').hidden = hasCost;
    const currency = fields.currency.value.trim().toUpperCase();
    byId('gain-hint').textContent = 'Importo nella valuta della posizione' + (currency ? ' (' + currency + ')' : '') +
        ', riferito all’ultima quotazione.';
    byId('rate-label').hidden = fields.currency.value.toUpperCase() === 'EUR';
    const isin = fields.isin.value.trim().toUpperCase();
    const feedback = isinFeedback(isin);
    byId('isin-feedback').textContent = feedback;
    fields.isin.setCustomValidity(feedback);
    fields.isin.setAttribute('aria-invalid', String(Boolean(feedback)));
    updateConsultationLink('editor', { type: fields.type.value, isin, url: fields.url.value.trim() });
}

function openPosition(position) {
    form.reset();
    editing = position ? { id: position.id, revision: position.revision, existing: true } :
        { id: crypto.randomUUID(), existing: false };
    byId('editor-error').textContent = '';
    byId('editor-title').textContent = position ? 'Modifica investimento' : 'Aggiungi investimento';
    if (position) {
        for (const key of ['name', 'type', 'unit', 'quantity', 'currency', 'rate', 'averageCost', 'isin', 'startDate', 'url']) {
            fields[key].value = position[key] ?? '';
        }
        fields.reportedGain.value = position.gainReference?.gain ?? '';
    }
    fields.currentDate.max = localDate();
    fields.startDate.max = localDate();
    byId('current-hint').textContent = position ? 'Compila per registrare una quotazione.' :
        'Inserisci il valore della prima quotazione.';
    // Existing quote series keep their original currency and unit.
    fields.unit.disabled = Boolean(position);
    fields.currency.disabled = Boolean(position);
    updatePositionFields();
    editor.showModal();
}

function readPosition() {
    const currency = fields.currency.value.trim().toUpperCase();
    return validatePosition({
        id: editing.id,
        name: fields.name.value.trim(),
        type: fields.type.value,
        currency,
        unit: fields.unit.value,
        quantity: fields.unit.value === 'total' ? 1 : Number(fields.quantity.value),
        rate: currency === 'EUR' || fields.rate.value === '' ? null : Number(fields.rate.value),
        averageCost: fields.averageCost.value === '' ? null : Number(fields.averageCost.value),
        startDate: fields.startDate.value || null,
        isin: fields.isin.value.trim().toUpperCase(),
        url: fields.url.value.trim()
    });
}

async function savePosition() {
    const position = readPosition();
    const manualQuote = fields.currentValue.value === '' ? null : {
        ...makeQuote(position.id, fields.currentDate.value || localDate(), fields.currentValue.valueAsNumber),
        manual: true
    };
    const reportedGain = fields.reportedGain.disabled || fields.reportedGain.value === '' ? null : fields.reportedGain.valueAsNumber;
    if (fields.currentDate.value && !manualQuote) throw new Error('Inserisci il valore della quotazione per salvarla.');
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, async () => {
        const existing = await db.investments.get(position.id);
        if (editing.existing && (!existing || existing.revision !== editing.revision)) {
            throw new Error('La posizione è cambiata. Riaprila per aggiornarla.');
        }
        if (manualQuote) await addQuote(db, manualQuote);
        position.sales = existing?.sales ?? [];
        position.purchases = existing?.purchases ?? [];
        position.plan = existing?.plan ?? null;
        position.quoteSource = existing?.quoteSource ?? null;
        const history = await db.investmentQuotes.where('investmentId').equals(position.id).sortBy('date');
        const latest = history.at(-1);
        const { quantity } = quantityHistory(position, history);
        if (!latest && (!existing || reportedGain !== null)) {
            throw new Error('Inserisci il valore della quotazione prima di salvare.');
        }
        position.initialQuoteDate = existing?.initialQuoteDate ?? manualQuote?.date ?? null;
        if (reportedGain !== null) {
            const previous = existing?.gainReference;
            if (previous && previous.gain === reportedGain) {
                position.gainReference = previous;
            } else {
                const { value } = valuation({ ...position, quantity }, latest);
                position.gainReference = { gain: reportedGain, value, date: latest.date, quantity };
            }
            validatePosition(position);
        }
        position.revision = crypto.randomUUID();
        validatePosition(position);
        await db.investments.put(position);
    });
    editor.close();
    await renderInvestments();
    showToast('Investimento salvato');
}

async function deletePosition(position) {
    const linked = position.purchases?.some(purchase => purchase.accountId) || position.sales?.some(sale => sale.credit);
    if (!window.confirm(linked ?
        'Eliminare la posizione e annullare le operazioni di liquidità associate?' :
        'Eliminare la posizione e il suo storico?')) return;
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, async () => {
        const current = await db.investments.get(position.id);
        if (!current || current.revision !== position.revision) throw new Error('La posizione è cambiata. Riapri la scheda.');
        await db.investmentQuotes.where('investmentId').equals(position.id).delete();
        await db.investments.delete(position.id);
    });
    expandedPositions.delete(position.id);
    expandedHistories.delete(position.id);
    await renderInvestments();
}

function openQuote(position, original = null) {
    quoting = { position, original };
    quoteForm.reset();
    quoteForm.elements.date.value = original?.date ?? localDate();
    quoteForm.elements.value.value = original?.value ?? '';
    byId('quote-quantity').hidden = position.unit !== 'unit';
    quoteForm.elements.totalQuantity.disabled = position.unit !== 'unit';
    const sold = soldBefore(position, original?.date ?? localDate());
    quoteForm.elements.totalQuantity.value = original?.totalQuantity === undefined ? '' :
        original.totalQuantity - sold;
    quoteForm.elements.date.max = localDate();
    byId('quote-title').textContent = (original ? 'Modifica quotazione' : 'Registra quotazione') + ' · ' + position.name;
    byId('quote-submit').textContent = original ? 'Salva modifica' : 'Salva quotazione';
    byId('quote-value').firstElementChild.textContent = 'Valore (' + (position.unit === 'nominal' ? '%' : position.currency) + ')';
    byId('quote-error').textContent = '';
    updateQuoteCostPreview();
    updateConsultationLink('quote', position);
    quoteEditor.showModal();
}

async function addQuote(db, quote) {
    if (await db.investmentQuotes.get([quote.investmentId, quote.date])) {
        throw new Error('Esiste già una quotazione per questa data. Scegli un’altra data.');
    }
    await db.investmentQuotes.add(quote);
}

async function editableQuoteKey(db, position, original) {
    if (!position) throw new Error('Questa posizione è stata eliminata.');
    const key = [position.id, original.date];
    const current = await db.investmentQuotes.get(key);
    if (!current || current.value !== original.value || current.totalQuantity !== original.totalQuantity) {
        throw new Error('La quotazione è cambiata. Riapri la scheda e riprova.');
    }
    return key;
}

function correctedGainReference(position, original, quote, quantity) {
    const reference = position.gainReference;
    if (!reference || !original || reference.date !== original.date) return reference;
    return {
        ...reference,
        date: quote.date,
        value: valuation({ ...position, quantity }, quote).value,
        quantity
    };
}

async function saveRefreshedQuote(opened, candidate) {
    const db = initDB();
    return db.transaction('rw', db.investments, db.investmentQuotes, async () => {
        const position = await db.investments.get(opened.id);
        if (!position || position.revision !== opened.revision) {
            throw new Error('La posizione è cambiata durante la lettura.');
        }
        const history = await db.investmentQuotes.where('investmentId').equals(position.id).toArray();
        if (quantityHistory(position, history).closed) throw new Error('Questa posizione è chiusa.');
        const previous = history.find(quote => quote.date === candidate.date);
        if (previous?.value === candidate.value) return 'unchanged';
        const quote = {
            ...makeQuote(position.id, candidate.date, candidate.value, previous?.totalQuantity),
            manual: false,
            sourceUrl: position.quoteSource.url
        };
        if (candidate.period) quote.sourcePeriod = candidate.period;
        const changes = {
            initialQuoteDate: position.initialQuoteDate ?? quote.date,
            gainReference: correctedGainReference(position, previous, quote, position.gainReference?.quantity),
            revision: crypto.randomUUID()
        };
        validatePosition({ ...position, ...changes });
        await db.investmentQuotes.put(quote);
        await db.investments.update(position.id, changes);
        return previous ? 'updated' : 'created';
    });
}

async function refreshQuotes() {
    if (refreshingQuotes) return;
    const positions = portfolio.map(row => row.position).filter(position => position.quoteSource);
    if (!positions.length) return;
    const dialog = byId('refresh-dialog');
    const close = byId('refresh-close');
    const status = byId('refresh-status');
    const results = byId('refresh-results');
    const counts = { created: 0, updated: 0, unchanged: 0, failed: 0 };
    const labels = { created: 'Creata', updated: 'Aggiornata', unchanged: 'Invariata' };
    refreshingQuotes = true;
    byId('refresh').disabled = true;
    close.disabled = true;
    results.replaceChildren();
    dialog.showModal();
    try {
        for (const [index, position] of positions.entries()) {
            status.textContent = 'Lettura ' + (index + 1) + ' di ' + positions.length + ' · ' + position.name;
            try {
                const candidate = await readLatestQuote(position);
                const outcome = await saveRefreshedQuote(position, candidate);
                counts[outcome]++;
                results.append(element('li', position.name + ' · ' + labels[outcome] + ' · ' +
                    formatInvestmentDate(candidate.date) + ' · ' + quoteText(position, candidate.value)));
            } catch (error) {
                counts.failed++;
                results.append(element('li', position.name + ' · Da verificare: ' + error.message));
            }
        }
        status.textContent = 'Create ' + counts.created + ' · Aggiornate ' + counts.updated +
            ' · Invariate ' + counts.unchanged + ' · Da verificare ' + counts.failed;
    } finally {
        refreshingQuotes = false;
        close.disabled = false;
        close.focus();
        await renderInvestments();
    }
}

function updateQuoteCostPreview() {
    const output = byId('quote-cost-preview');
    output.textContent = '';
    const { position, original } = quoting;
    if (!original || position.gainReference?.date !== original.date) return;
    const { date, value, totalQuantity } = quoteForm.elements;
    if (!date.validity.valid || !value.validity.valid || !Number.isFinite(value.valueAsNumber)) return;
    const quantity = !totalQuantity.disabled && totalQuantity.value !== '' ?
        totalQuantity.valueAsNumber : position.gainReference.quantity;
    if (!Number.isFinite(quantity)) return;
    const reference = correctedGainReference(position, original, { date: date.value, value: value.valueAsNumber }, quantity);
    const cost = reference.value - reference.gain;
    output.textContent = cost < 0 ? 'Il nuovo controvalore è inferiore al guadagno dichiarato.' :
        'Capitale di carico stimato dopo la modifica: ' + amount(cost, position.currency) + '.';
}

async function saveQuote() {
    const { date, value, totalQuantity } = quoteForm.elements;
    const { position: opened, original, source } = quoting;
    const positionId = opened.id;
    const newDate = date.value;
    const newValue = value.valueAsNumber;
    const quantity = totalQuantity.disabled || totalQuantity.value === '' ? undefined : totalQuantity.valueAsNumber;
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, async () => {
        const position = await db.investments.get(positionId);
        if (!position) throw new Error('Questa posizione è stata eliminata.');
        const previousHistory = await db.investmentQuotes.where('investmentId').equals(positionId).toArray();
        if (original && position.revision !== opened.revision) throw new Error('La posizione è cambiata. Riapri la scheda.');
        if (quantityHistory(position, previousHistory).closed &&
            (!original || original.date !== position.initialQuoteDate)) throw new Error('Questa posizione è chiusa.');
        const grossQuantity = quantity === undefined ? undefined : quantity + soldBefore(position, newDate);
        const imported = source && source.value === newValue;
        const quote = { ...makeQuote(positionId, newDate, newValue, grossQuantity), manual: !imported };
        if (imported) {
            quote.sourceUrl = source.url;
            if (source.period) quote.sourcePeriod = source.period;
        } else if (original && original.value === quote.value) {
            quote.manual = original.manual;
            if (original.sourceUrl) quote.sourceUrl = original.sourceUrl;
            if (original.sourcePeriod) quote.sourcePeriod = original.sourcePeriod;
        }
        if (original) {
            const key = await editableQuoteKey(db, position, original);
            if (quote.date === original.date) await db.investmentQuotes.put(quote);
            else {
                await addQuote(db, quote);
                await db.investmentQuotes.delete(key);
            }
        } else {
            await addQuote(db, quote);
        }
        const history = await db.investmentQuotes.where('investmentId').equals(positionId).toArray();
        quantityHistory(position, history);
        const initialQuoteDate = original && original.date === position.initialQuoteDate ?
            quote.date : position.initialQuoteDate ?? quote.date;
        const gainReference = correctedGainReference(position, original, quote, quantity ?? position.gainReference?.quantity);
        const changes = {
            initialQuoteDate, gainReference,
            revision: crypto.randomUUID()
        };
        validatePosition({ ...position, ...changes });
        await db.investments.update(positionId, changes);
    });
    quoteEditor.close();
    await renderInvestments();
}

function soldBefore(position, date) {
    return (position.sales ?? []).reduce((total, sale) => total + (sale.date < date ? sale.quantity ?? 0 : 0), 0);
}

async function deleteQuote(position, quote) {
    if (!window.confirm('Eliminare la quotazione del ' + formatInvestmentDate(quote.date) + ' (' + quoteText(position, quote.value) + ')?')) return;
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, async () => {
        const current = await db.investments.get(position.id);
        const key = await editableQuoteKey(db, current, quote);
        if (quote.date === current.initialQuoteDate) throw new Error('La quotazione iniziale è protetta.');
        await db.investmentQuotes.delete(key);
        const history = await db.investmentQuotes.where('investmentId').equals(position.id).toArray();
        quantityHistory(current, history);
        await db.investments.update(position.id, { revision: crypto.randomUUID() });
    });
    await renderInvestments();
}

function safely(action, output) {
    return Promise.resolve().then(action).catch(error => {
        if (output) output.textContent = error.message;
        else showErrorToast('Investimenti: ' + error.message);
    });
}

const legendSelection = {};
const priceUnit = position => position.unit === 'nominal' ? '% del nominale' : position.currency;

function getChart(id) {
    const container = byId(id);
    const echarts = window.echarts;
    const chart = echarts.getInstanceByDom(container) ?? echarts.init(container);
    chart.resize();
    return chart;
}

function clearChart(id) {
    const node = byId(id);
    window.echarts.getInstanceByDom(node)?.dispose();
    node.hidden = true;
}

function renderLine() {
    const mode = byId('mode').value;
    const period = byId('period').value;
    const custom = period === 'custom';
    const from = byId('period-from');
    const to = byId('period-to');
    byId('period-from-label').hidden = !custom;
    byId('period-to-label').hidden = !custom;
    from.max = to.max = localDate();
    const empty = byId('line-empty');
    if (custom && (!validDate(from.value) || !validDate(to.value) ||
        from.value > to.value || to.value > to.max)) {
        clearChart('line');
        empty.hidden = false;
        empty.textContent = 'Indica un intervallo valido fino alla data di oggi.';
        return;
    }
    const days = Number(period) || 0;
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    const cutoff = custom ? from.value : days ? localDate(start) : '';
    const end = custom ? to.value : '\uffff';
    const inPeriod = portfolio.map(({ position, history, latest, value, cost }) => {
        const performance = mode !== 'price' && position.type === 'Fondo pensione' ?
            positionPerformance(position, latest?.date, value, cost) : null;
        const { points, baseline } = performance ?? investmentSeries(position, history);
        return { position, baseline, points: points.filter(point => point.date >= cutoff && point.date <= end) };
    }).filter(row => row.points.length);
    const eligible = inPeriod.filter(row => mode === 'price' || row.baseline > 0);

    const unitField = byId('price-unit');
    const previousUnit = unitField.value;
    const units = [...new Set(inPeriod.map(row => priceUnit(row.position)))];
    byId('price-unit-label').hidden = mode !== 'price' || units.length < 2;
    unitField.replaceChildren(...units.map(unit => new Option(unit, unit)));
    if (units.includes(previousUnit)) unitField.value = previousUnit;
    const rows = mode === 'price' ? eligible.filter(row => priceUnit(row.position) === unitField.value) : eligible;
    empty.hidden = rows.length > 0;
    empty.textContent = mode !== 'price' && inPeriod.length ?
        'Serve un valore iniziale positivo. Puoi consultare la vista Valore quota.' :
        'Nessuna quotazione nel periodo selezionato.';
    if (!rows.length) {
        clearChart('line');
        return;
    }

    byId('line').hidden = false;
    const chart = getChart('line');
    const names = new Map(rows.map(({ position }) => [position.id, position.name]));
    const bounds = rows.reduce(([first, last], { points }) => [
        first < points[0].date ? first : points[0].date,
        last > points.at(-1).date ? last : points.at(-1).date
    ], ['\uffff', '']);
    const wideRange = Date.parse(bounds[1]) - Date.parse(bounds[0]) > 90 * 86400000;
    const chartDate = timestamp => formatInvestmentDate(localDate(new Date(timestamp)));
    chart.setOption({
        aria: { enabled: true },
        tooltip: {
            trigger: 'item', renderMode: 'richText', confine: true,
            formatter: item => {
                const [date, value] = item.value;
                const formatted = mode === 'price' ? formatNumber.format(value) :
                    formatPerformance.format(value) + (mode === 'percent' ? '%' : '');
                return names.get(item.seriesName) + '\n' + chartDate(date) + ' · ' + formatted +
                    (item.data.estimated ? '\nCapitale di carico ricavato' :
                        item.data.isCost ? '\nValore di carico' : '');
            }
        },
        legend: { type: 'scroll', formatter: name => names.get(name), selected: { ...legendSelection } },
        grid: { top: 55, right: 14, bottom: 30, left: 12, containLabel: true },
        xAxis: {
            type: 'time', splitNumber: byId('line').clientWidth < 480 ? 3 : 6,
            minInterval: wideRange ? 28 * 86400000 : 86400000,
            axisLabel: { formatter: chartDate, hideOverlap: true }
        },
        yAxis: {
            type: 'value', scale: true, name: mode === 'price' ? unitField.value : mode === 'base' ? 'Base 100' : 'Variazione %',
            axisLabel: { formatter: value => mode === 'percent' ? percent(value) : formatNumber.format(value) }
        },
        series: rows.map(({ position, points, baseline }) => ({
            name: position.id, type: 'line', showSymbol: points.length <= 30 || points.some(point => point.isCost),
            data: points.map(({ date, value, isCost, estimated }) => {
                const relative = mode === 'price' ? null : value / baseline;
                return {
                    value: [new Date(date + 'T00:00:00').getTime(),
                        mode === 'price' ? value : mode === 'base' ? relative * 100 : (relative - 1) * 100],
                    isCost,
                    estimated,
                    symbol: isCost ? 'diamond' : points.length > 30 ? 'none' : 'circle',
                    symbolSize: isCost ? 10 : 5
                };
            })
        }))
    }, { notMerge: true });
    chart.off('legendselectchanged');
    chart.on('legendselectchanged', event => Object.assign(legendSelection, event.selected));
}

function renderPie() {
    const groups = new Map();
    const mode = byId('group').value;
    const omitted = portfolio.filter(row => row.valueEur === null).length;
    const zero = portfolio.filter(row => row.valueEur === 0).length;
    if (mode === 'wealth') {
        const invested = portfolio.reduce((sum, row) => sum + (row.valueEur ?? 0), 0);
        if (cashTotal > 0) groups.set('cash', { name: 'Liquidità', value: cashTotal });
        if (invested > 0) groups.set('invested', { name: omitted ? 'Totale investito (parziale)' : 'Totale investito', value: invested });
    } else {
        const byType = mode === 'type';
        for (const { position, valueEur } of portfolio) {
            if (valueEur === null || valueEur <= 0) continue;
            const key = byType ? position.type : position.id;
            const group = groups.get(key) ?? { name: byType ? position.type : position.name, value: 0 };
            group.value += valueEur;
            groups.set(key, group);
        }
    }
    const note = byId('pie-note');
    note.textContent = [
        !groups.size ? 'Nessun controvalore positivo in euro da mostrare.' : '',
        omitted ? 'Posizioni escluse per quotazione o cambio mancante: ' + omitted + '.' : '',
        mode === 'wealth' && cashTotal < 0 ? 'Liquidità negativa: ' + amount(cashTotal) + '.' : '',
        zero ? 'Posizioni con peso pari a zero: ' + zero + '.' : ''
    ].filter(Boolean).join(' ');
    note.hidden = !note.textContent;
    if (!groups.size) {
        clearChart('pie');
        byId('pie-legend').replaceChildren();
        return;
    }
    byId('pie').hidden = false;
    const chart = getChart('pie');
    chart.dispatchAction({ type: 'hideTip' });
    const values = [...groups.values()];
    const colors = chart.getOption()?.color ?? ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];
    const slices = values.map((group, index) => ({
        ...group, itemStyle: { color: mode === 'wealth' ?
            (group.name === 'Liquidità' ? '#805b00' : '#403477') : colors[index % colors.length] }
    }));
    chart.setOption({
        aria: { enabled: true },
        tooltip: {
            trigger: 'item', renderMode: 'richText', confine: true,
            hideDelay: 0,
            formatter: item => item.name + '\n' + amount(item.value) + ' · ' + percent(item.percent)
        },
        series: [{
            type: 'pie', radius: ['44%', '78%'],
            label: { show: false }, data: slices
        }]
    }, { notMerge: true });
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    byId('pie-legend').replaceChildren(...slices.map(slice => {
        const item = element('li');
        const color = element('span', '', 'investment-pie-dot');
        color.style.backgroundColor = slice.itemStyle.color;
        item.append(color, element('span', slice.name), element('strong', portfolioPercent.format(slice.value / total)));
        return item;
    }));
}

function renderCharts() {
    if (portfolio.length) renderLine();
    renderPie();
}

function exportPositionHistory({ position, history, purchases }) {
    const columns = {
        date: 'Data', kind: 'Operazione', currency: 'Valuta', quote: 'Quotazione', quantity: 'Quantità o nominale',
        totalQuantity: 'Quote totali registrate', gross: 'Importo lordo o investito', fees: 'Commissioni',
        net: 'Incasso netto', cost: 'Costo attribuito', remaining: 'Saldo residuo', account: 'Conto',
        due: 'Data rata', creditDate: 'Data accredito', creditEuros: 'Accredito EUR',
        rate: 'Cambio EUR', sourcePeriod: 'Periodo fonte', source: 'URL fonte'
    };
    const accounts = new Map(cashAccounts.map(account => [account.id, account.name]));
    const entries = [
        ...history.map(quote => ({
            date: quote.date, kind: 'Quotazione', quote: quote.value, quantity: purchases.get(quote.date),
            totalQuantity: quote.totalQuantity, sourcePeriod: quote.sourcePeriod, source: quote.sourceUrl
        })),
        ...(position.purchases ?? []).map(purchase => ({
            date: purchase.date, kind: 'Acquisto', quantity: purchase.quantity, gross: purchase.amountCents / 100,
            fees: purchase.feeCents / 100, account: accounts.get(purchase.accountId), due: purchase.due
        })),
        ...(position.sales ?? []).map(sale => ({
            date: sale.date, kind: position.unit === 'total' ? 'Riscatto' : 'Vendita', quantity: sale.quantity,
            gross: sale.gross, fees: sale.fees, net: sale.gross - sale.fees, cost: sale.cost, remaining: sale.remainingValue,
            account: accounts.get(sale.credit?.accountId), creditDate: sale.credit?.date,
            creditEuros: sale.credit ? saleCreditCents(sale, position.currency) / 100 : null, rate: sale.rate
        }))
    ].sort((left, right) => right.date.localeCompare(left.date));
    const rows = entries.map(entry => Object.keys(columns).map(key => key === 'currency' ? position.currency : entry[key]));
    const slug = position.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70) || 'posizione';
    downloadCsv('moneylog-storico-' + slug + '-' + localDate() + '.csv', Object.values(columns), rows);
}

function exportPortfolio() {
    const weightsOnly = byId('weights').checked;
    const total = portfolio.reduce((sum, row) => sum + (row.valueEur ?? 0), 0);
    const columns = ['Tipo', 'Nome', 'ISIN'];
    if (!weightsOnly) columns.push('Valuta', 'Unità', 'Quantità o nominale', 'Prezzo medio di carico',
        'Ultima quotazione', 'Data quotazione', 'Controvalore EUR');
    columns.push('Peso %');
    const rows = portfolio.map(({ position, latest, quantity, valueEur }) => {
        const row = [position.type, position.name, position.isin];
        if (!weightsOnly) row.push(position.currency,
            { unit: 'Quota', nominal: '% del nominale', total: 'Rendiconto' }[position.unit],
            position.unit === 'total' ? null : quantity, position.averageCost,
            latest?.value, latest?.date, valueEur);
        row.push(valueEur === null || total <= 0 ? null : Number((valueEur / total * 100).toFixed(6)));
        return row;
    });
    downloadCsv('moneylog-portafoglio-' + localDate() + '.csv', columns, rows);
}

function downloadCsv(name, columns, rows) {
    const csv = [columns, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
    if (window.MoneyLogAndroid) {
        window.MoneyLogAndroid.saveFile(name, 'text/csv', '\uFEFF' + csv);
        return;
    }
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = element('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initializeInvestments() {
    accountForm.addEventListener('input', updateAccountPreview);
    transferForm.addEventListener('change', updateTransferOptions);
    const saveInstallment = () => {
        const { date, amount: price, quantity, fees, accountId } = installmentForm.elements;
        return resolveInstallment(confirmingInstallment, {
            date: date.value, quantity: quantity.valueAsNumber, accountId: accountId.value === 'none' ? null : accountId.value || null,
            amountCents: Math.round(price.valueAsNumber * 100), feeCents: Math.round(fees.valueAsNumber * 100)
        });
    };
    for (const [id, editorForm, save] of [
        ['account', accountForm, saveAccount], ['transfer', transferForm, saveTransfer],
        ['plan', planForm, savePlan], ['installment', installmentForm, saveInstallment]
    ]) {
        const dialog = byId(id + '-editor');
        editorForm.querySelector('[data-close]').addEventListener('click', () => dialog.close());
        editorForm.addEventListener('submit', async event => {
            event.preventDefault();
            const submit = editorForm.querySelector('[type="submit"]');
            if (submit.disabled) return;
            submit.disabled = true;
            try {
                await safely(save, byId(id + '-error'));
            } finally {
                submit.disabled = false;
            }
        });
    }
    byId('refresh').addEventListener('click', () => safely(refreshQuotes));
    byId('refresh-dialog').addEventListener('cancel', event => {
        if (refreshingQuotes) event.preventDefault();
    });
    document.addEventListener('click', event => {
        if (openMenu && !openMenu.menu.contains(event.target)) closeActionMenu();
    });
    document.addEventListener('focusin', event => {
        if (openMenu && !openMenu.menu.contains(event.target)) closeActionMenu();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && openMenu) {
            event.preventDefault();
            closeActionMenu(true);
        }
    });
    const guide = byId('guide');
    const guideButton = byId('guide-open');
    guideButton.addEventListener('click', () => {
        guide.scrollTop = 0;
        guide.showModal();
    });
    guide.addEventListener('close', () => guideButton.focus());
    initializeQuoteSources({
        onChange: renderInvestments,
        onQuote(position, candidate) {
            openQuote(position);
            quoting.source = { ...candidate, url: position.quoteSource.url };
            quoteForm.elements.date.value = candidate.date ?? '';
            quoteForm.elements.value.value = candidate.value;
            byId('quote-error').textContent = candidate.date ? '' :
                (candidate.period ? 'Periodo della fonte: ' + candidate.period + '. ' : '') +
                'Inserisci la data da usare per la registrazione.';
        }
    });
    byId('sale-cancel').addEventListener('click', () => saleEditor.close());
    saleForm.addEventListener('input', () => {
        updateSaleCreditFields();
        updateSalePreview();
    });
    saleForm.addEventListener('submit', event => {
        event.preventDefault();
        safely(saveSale, byId('sale-error'));
    });
    byId('add').addEventListener('click', () => openPosition());
    byId('cancel').addEventListener('click', () => editor.close());
    byId('quote-cancel').addEventListener('click', () => quoteEditor.close());
    byId('export').addEventListener('click', exportPortfolio);
    for (const id of ['mode', 'period', 'price-unit', 'period-from', 'period-to']) byId(id).addEventListener('change', renderLine);
    byId('group').addEventListener('change', renderPie);
    form.addEventListener('input', event => {
        updatePositionFields();
        if (event.target.name === 'currentValue') {
            if (!fields.currentValue.value) fields.currentDate.value = '';
            else if (!fields.currentDate.value) fields.currentDate.value = localDate();
        }
        byId('editor-error').textContent = '';
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        safely(savePosition, byId('editor-error'));
    });
    quoteForm.addEventListener('submit', event => {
        event.preventDefault();
        safely(saveQuote, byId('quote-error'));
    });
    quoteForm.addEventListener('input', updateQuoteCostPreview);
    window.addEventListener('resize', () => {
        if (!document.getElementById('investimenti').classList.contains('active')) return;
        if (portfolio.length) renderLine();
        window.echarts.getInstanceByDom(byId('pie'))?.resize();
    });
    try {
        localStorage.removeItem('moneylog-twelve-data-key');
    } catch {
        // The portfolio also works when browser settings block localStorage.
    }
}
