import { initDB } from './queryDexie.js';
import { consultationUrl, formatInvestmentDate, localDate, validatePosition } from './investmentData.js';

const byId = id => document.getElementById('investment-source-' + id);
const months = 'gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre'.split(' ');
const monthPattern = new RegExp('\\b(' + months.join('|') + ')\\b', 'i');
const normalize = text => text.toLowerCase().replace(/\s+/g, ' ').trim();
const numeric = /[−-]?\d[\d.,]*(?:[\u00a0 ]\d{3}(?!\d))*/g;
const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4})\b/g;
const yearPattern = /\b(?:19|20)\d{2}\b/;
const currencyPattern = /€|\b(?:EUR|USD|GBP|CHF|JPY|CAD|AUD|SEK|DKK|NOK|PLN|HKD)\b/i;
const currencyAmountPattern = new RegExp(
    '(?:' + currencyPattern.source + ')\\s*[−-]?\\d[\\d.,]*(?:[\\u00a0 ]\\d{3}(?!\\d))*', 'i'
);
let selected;
let candidates = [];
let revision = 0;
let busy = false;
let callbacks;
let automaticContext = false;

function updateDefaultContext(form) {
    const { url, context } = form.elements;
    let hostname = '';
    try { hostname = new URL(url.value).hostname; } catch { /* incomplete address */ }
    const justEtf = hostname === 'justetf.com' || hostname.endsWith('.justetf.com');
    if (justEtf && !context.value.trim()) {
        context.value = 'gettex';
        automaticContext = true;
    } else if (!justEtf && automaticContext) {
        context.value = '';
        automaticContext = false;
    }
}

function numericValue(raw) {
    let value = raw.replace(/[\s\u00a0]/g, '').replace('−', '-');
    if (value.includes(',')) {
        value = value.lastIndexOf(',') > value.lastIndexOf('.') ?
            value.replaceAll('.', '').replace(',', '.') : value.replaceAll(',', '');
    } else if (value.split('.').length > 2) {
        value = value.replaceAll('.', '');
    }
    return Number(value);
}

function dateFrom(text) {
    for (const raw of text.match(datePattern) ?? []) {
        const pieces = raw.split(/[/.]/);
        const iso = pieces.length === 3 ?
            [pieces[2], pieces[1].padStart(2, '0'), pieces[0].padStart(2, '0')].join('-') : raw;
        const parsed = new Date(iso);
        if (Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === iso && iso <= localDate()) return iso;
    }
    return null;
}

export function extractQuoteCandidates(html, { label, context }) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const root = template.content;
    root.querySelectorAll('script,style,template,noscript,nav,footer,header,[hidden],[aria-hidden="true"]')
        .forEach(node => node.remove());
    const field = normalize(label);
    const scope = normalize(context);
    const result = new Map();
    function add(valueText, surrounding, period = null, order = '') {
        const date = dateFrom(surrounding);
        const currencyText = surrounding.match(currencyPattern)?.[0]?.toUpperCase();
        const currency = currencyText === '€' ? 'EUR' : currencyText ?? null;
        const text = valueText.replace(datePattern, '').trim();
        for (const match of text.matchAll(numeric)) {
            const value = numericValue(match[0]);
            if (!Number.isFinite(value) || value < 0) continue;
            const candidate = { value, date, currency, period, order: date ?? order,
                percent: /^\s*%/.test(text.slice(match.index + match[0].length)),
                context: surrounding.replace(/\s+/g, ' ').trim().slice(0, 180) };
            const key = [value, date, period, currency, candidate.percent].join('|');
            if (!result.has(key)) result.set(key, candidate);
        }
    }
    const scopeNodes = scope ? [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,caption,p,span,strong,td,div')]
        .filter(node => normalize(node.textContent) === scope ||
            node.matches('h1,h2,h3,h4,h5,h6,caption') && normalize(node.textContent).includes(scope)) : [];
    const scopedContainers = scopeNodes.map(node => {
        let container = node.parentElement;
        while (container?.parentElement && !container.textContent.match(/\d/) &&
            container.parentElement.textContent.length < 2400) container = container.parentElement;
        return container;
    }).filter(Boolean);
    function matchesScope(node) {
        if (!scope) return true;
        if (scopedContainers.some(container => container.contains(node))) return true;
        return normalize(node.textContent).includes(scope) ||
            Boolean(node.closest('tr') && normalize(node.closest('tr').textContent).includes(scope));
    }
    for (const table of root.querySelectorAll('table')) {
        const headings = table.tHead?.rows[0] ?? table.rows[0];
        const columns = Array.from(headings?.cells ?? []);
        const index = columns.findIndex(cell => field && normalize(cell.textContent).includes(field));
        if (index < 0) continue;
        const column = columns[index].textContent;
        const periodIndex = columns.findIndex(cell => /data|periodo|date/i.test(cell.textContent));
        for (const row of table.rows) {
            if (row === headings || !row.cells[index] || !(matchesScope(row) || matchesScope(table))) continue;
            const dateText = periodIndex >= 0 ? row.cells[periodIndex]?.textContent ?? '' : row.textContent;
            add(row.cells[index].textContent, column + ' ' + row.cells[index].textContent + ' ' + dateText);
        }
    }
    if (field) {
        for (const node of root.querySelectorAll('p,span,div,li,dt,dd,strong,b,h2,h3,h4,h5,h6,label,td')) {
            if (node.closest('table') || !matchesScope(node)) continue;
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            const index = normalize(text).indexOf(field);
            if (index < 0 || text.length > 180 ||
                [...node.children].some(child => normalize(child.textContent).includes(field))) continue;
            const tail = text.slice(index + field.length).trim();
            const siblings = [];
            let wrapper = node;
            while (wrapper && matchesScope(wrapper) && normalize(wrapper.textContent) === normalize(text)) {
                for (const sibling of [wrapper.previousElementSibling, wrapper.nextElementSibling]) {
                    const value = sibling?.textContent.trim();
                    if (value && value.length < 90 && !siblings.includes(value)) siblings.push(value);
                }
                wrapper = wrapper.parentElement;
            }
            const around = [text, ...siblings].join(' ');
            if (tail.replace(datePattern, '').match(/\d/)) add(tail, around);
            else for (const sibling of siblings) {
                if (/^\s*(?:[A-Z]{3}|€)?\s*[−-]?\d[\d., ]*(?:€|[A-Z]{3}|%)?\s*$/.test(sibling)) add(sibling, around);
            }
        }
    }
    if (scope && !result.size) {
        let year;
        const seen = new Set();
        for (const node of root.querySelectorAll('h2,h3,h4,h5,h6,p,li,td,div,span')) {
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            if (/^(?:19|20)\d{2}$/.test(text)) year = text;
            const month = text.match(monthPattern)?.[1];
            if (!month || text.length > 50 || !matchesScope(node)) continue;
            const row = text.match(new RegExp('^' + month + '\\s+([\\d.,]+)(?:\\s*€)?$', 'i'));
            const rowYear = text.match(yearPattern)?.[0] ?? year;
            if (!row || !rowYear) continue;
            const order = rowYear + '-' + String(months.indexOf(month.toLowerCase()) + 1).padStart(2, '0');
            const period = month + ' ' + rowYear;
            if (seen.has(order + row[1])) continue;
            seen.add(order + row[1]);
            add(row[1], context + ' · ' + period, period, order);
        }
    }
    if (scope && !result.size) {
        for (const node of root.querySelectorAll('div,span,p,time,td,li')) {
            const text = normalize(node.textContent);
            if (text.length > 100 || !text.includes(scope) ||
                [...node.children].some(child => normalize(child.textContent).includes(scope))) continue;
            for (let group = node; group && group.textContent.length < 500; group = group.parentElement) {
                const walker = document.createTreeWalker(group, NodeFilter.SHOW_TEXT);
                const pieces = [];
                while (walker.nextNode()) {
                    const piece = walker.currentNode.nodeValue.trim();
                    if (piece) pieces.push(piece);
                }
                const content = pieces.join(' ');
                if (!dateFrom(content)) continue;
                const withoutTimestamp = content.replace(datePattern, ' ').replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
                const price = withoutTimestamp.match(currencyAmountPattern)?.[0];
                if (!price) continue;
                add(price, content);
                break;
            }
        }
    }
    return [...result.values()].sort((a, b) => b.order.localeCompare(a.order)).slice(0, 30);
}

function setCandidates(rows = []) {
    candidates = rows;
    const form = byId('form');
    form.elements.candidate.replaceChildren(new Option('Seleziona una rilevazione', ''), ...rows.map((row, index) =>
        new Option([String(row.value).replace('.', ',') + (row.percent ? '%' : ''), row.currency,
            row.date ? formatInvestmentDate(row.date) : row.period,
            row.context.replace(datePattern, raw => {
                const date = dateFrom(raw);
                return date ? formatInvestmentDate(date) : raw;
            })].filter(Boolean).join(' · '), index)));
    byId('result').hidden = !rows.length;
    byId('use').disabled = true;
    if (rows.length === 1) {
        form.elements.candidate.value = '0';
        byId('use').disabled = false;
    }
}

function sourceFromForm() {
    const { url, label, context } = byId('form').elements;
    return validatePosition({ ...selected, quoteSource: {
        url: consultationUrl(url.value), label: label.value, context: context.value
    } }).quoteSource;
}

export function openQuoteSource(position) {
    selected = position;
    revision++;
    const form = byId('form');
    form.reset();
    const fallback = position.type === 'ETF' && position.isin ?
        'https://www.justetf.com/it/etf-profile.html?isin=' + position.isin : '';
    form.elements.url.value = position.quoteSource?.url ?? (position.url || fallback);
    form.elements.label.value = position.quoteSource?.label ?? '';
    form.elements.context.value = position.quoteSource?.context ?? '';
    automaticContext = false;
    updateDefaultContext(form);
    byId('title').textContent = 'Configura fonte · ' + position.name;
    byId('status').textContent = position.unit === 'total' ?
        'Usa una fonte che riporti il saldo totale del rendiconto.' : '';
    setCandidates();
    byId('editor').showModal();
}

async function readPage(url) {
    if (window.MoneyLogAndroid) {
        return new Promise((resolve, reject) => {
            window.moneyLogPageResult = (html, error) => {
                delete window.moneyLogPageResult;
                if (error) reject(new Error(error));
                else resolve(html);
            };
            window.MoneyLogAndroid.readPage(url);
        });
    }
    try {
        const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
        if (response.ok) return await response.text();
    } catch {
        // The site may require the Android reader.
    }
    throw new Error('Il browser non riesce a leggere la pagina. Riprova dall’app Android.');
}

function compatibleQuotes(html, position, source) {
    return extractQuoteCandidates(html, source).filter(row =>
        (!row.currency || row.currency === position.currency) && row.percent === (position.unit === 'nominal'));
}

function latestQuote(html, position) {
    const rows = compatibleQuotes(html, position, position.quoteSource).map(row => {
        if (row.date || !row.period || !/^\d{4}-\d{2}$/.test(row.order)) return row;
        const [year, month] = row.order.split('-').map(Number);
        return { ...row, date: localDate(new Date(year, month, 0)) };
    });
    const latest = rows.filter(row => row.date && row.date <= localDate())
        .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) throw new Error('Nessuna quotazione compatibile con una data o un mese valido.');
    if (rows.some(row => row.date === latest.date && row.value !== latest.value)) {
        throw new Error('La fonte mostra prezzi diversi per la stessa data.');
    }
    return latest;
}

export async function readLatestQuote(position) {
    const { url } = position.quoteSource;
    const bridge = window.MoneyLogAndroid;
    if (!bridge) return latestQuote(await readPage(url), position);
    if (!bridge.readQuotePage) throw new Error('Aggiorna l’app Android per usare la lettura in blocco.');
    return new Promise((resolve, reject) => {
        const request = crypto.randomUUID();
        let lastError;
        window.moneyLogQuotePageResult = (id, html, error) => {
            if (id !== request) return;
            if (error) {
                delete window.moneyLogQuotePageResult;
                reject(lastError ?? new Error(error));
                return;
            }
            try {
                const quote = latestQuote(html, position);
                delete window.moneyLogQuotePageResult;
                bridge.finishQuotePage(request);
                resolve(quote);
            } catch (cause) {
                lastError = cause;
            }
        };
        bridge.readQuotePage(url, request);
    });
}

async function readSource() {
    if (busy || !byId('form').reportValidity()) return;
    const request = ++revision;
    setCandidates();
    busy = byId('read').disabled = true;
    byId('status').textContent = 'Caricamento pagina…';
    try {
        const source = sourceFromForm();
        const html = await readPage(source.url);
        if (request !== revision) return;
        setCandidates(compatibleQuotes(html, selected, source));
        byId('status').textContent = candidates.length ?
            'Controlla la rilevazione trovata prima di usarla.' :
            'Nessun dato compatibile. Controlla il nome del campo e la sezione.';
    } catch (error) {
        if (request === revision) byId('status').textContent = error.message;
    } finally {
        busy = byId('read').disabled = false;
    }
}

async function saveSource() {
    const current = selected;
    const quoteSource = sourceFromForm();
    const db = initDB();
    let updated;
    await db.transaction('rw', db.investments, async () => {
        const position = await db.investments.get(current.id);
        if (!position || position.revision !== current.revision) throw new Error('La posizione è cambiata. Riapri la scheda.');
        const revision = crypto.randomUUID();
        updated = { ...position, quoteSource, revision };
        await db.investments.put(updated);
    });
    if (selected === current) selected = updated;
    await callbacks.onChange();
    return updated;
}

export function initializeQuoteSources(actions) {
    callbacks = actions;
    const form = byId('form');
    const report = error => { byId('status').textContent = error.message; };
    byId('read').addEventListener('click', readSource);
    byId('cancel').addEventListener('click', () => byId('editor').close());
    byId('editor').addEventListener('close', () => { revision++; });
    form.addEventListener('input', event => {
        if (event.target === form.elements.context) automaticContext = false;
        if (event.target === form.elements.url) updateDefaultContext(form);
        if (event.target === form.elements.candidate) {
            byId('use').disabled = event.target.value === '';
        } else {
            revision++;
            setCandidates();
            byId('status').textContent = '';
        }
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        saveSource().then(() => { byId('status').textContent = 'Fonte salvata.'; }).catch(report);
    });
    byId('use').addEventListener('click', async () => {
        const candidate = candidates[form.elements.candidate.value];
        if (!candidate) return;
        const request = revision;
        try {
            const position = await saveSource();
            if (request !== revision || !byId('editor').open) return;
            byId('editor').close();
            callbacks.onQuote(position, candidate);
        } catch (error) {
            report(error);
        }
    });
}
