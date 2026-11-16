import { initDB } from './queryDexie.js';
import { showToast, showErrorToast } from './main.js';
import { consultationUrl, csvCell, investmentSeries, isinFeedback, localDate, makeQuote, quantityHistory, validatePosition, valuation } from './investmentData.js';

const byId = id => document.getElementById('investment-' + id);
const formatNumber = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 });
const amount = (value, currency = 'EUR') => value === null ? '—' :
    new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(value);
const percent = value => formatNumber.format(value) + '%';
const portfolioPercent = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 });
const quoteText = (position, value) => position.unit === 'nominal' ? percent(value) :
    formatNumber.format(value) + ' ' + position.currency;

let portfolio = [];
let editing;
let quoting;
let renderVersion = 0;
const expandedPositions = new Set();
const expandedHistories = new Set();

const form = byId('form');
const fields = form.elements;
const quoteForm = byId('quote-form');
const editor = byId('editor');
const quoteEditor = byId('quote-editor');

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

function metric(label, value) {
    const node = element('div');
    node.append(element('small', label), element('strong', value));
    return node;
}

export async function renderInvestments() {
    const version = ++renderVersion;
    const db = initDB();
    const [positions, quotes] = await db.transaction('r', db.investments, db.investmentQuotes, async () =>
        [await db.investments.toArray(), await db.investmentQuotes.toArray()]);
    if (version !== renderVersion) return;

    const series = new Map();
    for (const quote of quotes) {
        if (!series.has(quote.investmentId)) series.set(quote.investmentId, []);
        series.get(quote.investmentId).push(quote);
    }
    portfolio = positions.sort((a, b) => a.type.localeCompare(b.type, 'it') || a.name.localeCompare(b.name, 'it'))
        .map(position => {
            const history = (series.get(position.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
            const latest = history.at(-1);
            const { quantity, purchases } = quantityHistory(position, history);
            return { position, history, latest, quantity, purchases, ...valuation({ ...position, quantity }, latest) };
        });

    byId('summary').replaceChildren(...[
        ['Controvalore', 'valueEur'], ['Capitale a carico', 'costEur'], ['Guadagno / perdita', 'gainEur']
    ].map(([label, field]) => {
        const available = portfolio.filter(row => row[field] !== null);
        const partial = available.length > 0 && available.length < portfolio.length;
        const total = available.length ? available.reduce((sum, row) => sum + row[field], 0) : null;
        return metric(label + (partial ? ' (parziale)' : ''), amount(total));
    }));
    byId('list').replaceChildren(...(portfolio.length ? portfolio.map(positionCard) :
        [element('p', 'Aggiungi un investimento per iniziare.')]));
    byId('analytics').hidden = !portfolio.length;
    if (portfolio.length && document.getElementById('investimenti').classList.contains('active')) renderCharts();
}

function positionCard(row) {
    const { position, history, latest, quantity, purchases, value, cost, gain, valueEur } = row;
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
        element('span', value === null ? 'Quotazione mancante' : amount(value, position.currency)));
    summary.append(heading);
    card.append(summary);
    const fields = element('div', '', 'investment-fields investment-metrics');
    if (position.unit !== 'total') {
        fields.append(metric(position.unit === 'nominal' ? 'Nominale' : 'Quantità', formatNumber.format(quantity)));
    }
    fields.append(
        metric('Ultima quotazione', latest ? quoteText(position, latest.value) : '—'),
        metric('Data del dato', latest?.date ?? '—'),
        metric('Controvalore', amount(value, position.currency)),
        metric(position.gainReference && cost !== null ? 'Capitale iniziale stimato' : 'Costo di carico', amount(cost, position.currency)),
        metric('Guadagno / perdita', amount(gain, position.currency) + (gain !== null && cost > 0 ? ' · ' + percent(gain / cost * 100) : ''))
    );
    if (position.averageCost !== null && position.unit !== 'total') {
        fields.append(metric('Prezzo medio di carico', quoteText(position, position.averageCost)));
    }
    if (position.startDate) fields.append(metric('Inizio investimento', position.startDate));
    if (position.gainReference) {
        const reference = position.gainReference;
        fields.append(metric('Guadagno / perdita dichiarati al ' + reference.date, amount(reference.gain, position.currency)));
        if (reference.value > 0) {
            fields.append(metric('Guadagno o perdita in % del controvalore al ' + reference.date, percent(reference.gain / reference.value * 100)));
        }
        if (gain !== null && value > 0 && latest.date > reference.date) {
            fields.append(metric('Incidenza sul controvalore attuale', percent(gain / value * 100)));
        }
    }
    if (cost === null && history.length > 1 && history[0].value > 0) {
        fields.append(metric('Variazione dalla prima quotazione', percent((latest.value / history[0].value - 1) * 100)));
    }
    if (position.currency !== 'EUR') {
        fields.append(metric('Controvalore in euro', valueEur === null ? 'Cambio o quotazione mancante' : amount(valueEur)));
    }
    card.append(fields);
    const actions = element('div', '', 'investment-actions');
    actions.append(
        button('Registra quotazione', () => openQuote(position)),
        button('Modifica', () => openPosition(position)),
        button('Elimina', () => safely(() => deletePosition(position)))
    );
    card.append(actions);
    if (history.length) card.append(quoteHistory(position, history, purchases));
    return card;
}

function quoteHistory(position, history, purchases) {
    const section = element('details', '', 'investment-quote-history');
    section.open = expandedHistories.has(position.id);
    section.addEventListener('toggle', () => {
        if (section.open) expandedHistories.add(position.id);
        else expandedHistories.delete(position.id);
    });
    section.append(element('summary', 'Storico quotazioni (' + history.length + ')'));
    const list = element('ul');
    for (const quote of [...history].reverse()) {
        const row = element('li');
        const info = element('div', '', 'investment-quote-info');
        const date = element('time', quote.date);
        date.dateTime = quote.date;
        info.append(date, element('strong', quoteText(position, quote.value)));
        if (quote.totalQuantity !== undefined) {
            info.append(element('small', formatNumber.format(quote.totalQuantity) + ' quote totali · ' +
                formatNumber.format(purchases.get(quote.date)) + ' acquistate'));
        }
        row.append(info);
        if (quote.date === position.initialQuoteDate) {
            row.append(element('small', 'Quotazione iniziale'));
        } else {
            const actions = element('div', '', 'investment-actions');
            const edit = button('Modifica', () => openQuote(position, quote));
            const remove = button('Elimina', () => safely(() => deleteQuote(position, quote)));
            edit.setAttribute('aria-label', 'Modifica quotazione del ' + quote.date);
            remove.setAttribute('aria-label', 'Elimina quotazione del ' + quote.date);
            actions.append(edit, remove);
            row.append(actions);
        }
        list.append(row);
    }
    section.append(list);
    return section;
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
    const hasQuantityHistory = portfolio.find(row => row.position.id === editing?.id)?.purchases.size;
    byId('quantity-label').firstElementChild.textContent = fields.unit.value === 'nominal' ?
        'Valore nominale detenuto' : hasQuantityHistory ? 'Quantità prima degli acquisti registrati' : 'Quantità o quote';
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
        await db.investments.put(position);
    });
    editor.close();
    await renderInvestments();
    showToast('Investimento salvato');
}

async function deletePosition(position) {
    if (!window.confirm('Eliminare la posizione e il suo storico?')) return;
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, async () => {
        await db.investmentQuotes.where('investmentId').equals(position.id).delete();
        await db.investments.delete(position.id);
    });
    expandedPositions.delete(position.id);
    expandedHistories.delete(position.id);
    await renderInvestments();
}

function openQuote(position, original = null) {
    quoting = { positionId: position.id, original };
    quoteForm.reset();
    quoteForm.elements.date.value = original?.date ?? localDate();
    quoteForm.elements.value.value = original?.value ?? '';
    byId('quote-quantity').hidden = position.unit !== 'unit';
    quoteForm.elements.totalQuantity.disabled = position.unit !== 'unit';
    quoteForm.elements.totalQuantity.value = original?.totalQuantity ?? '';
    quoteForm.elements.date.max = localDate();
    byId('quote-title').textContent = (original ? 'Modifica quotazione' : 'Registra quotazione') + ' · ' + position.name;
    byId('quote-submit').textContent = original ? 'Salva modifica' : 'Salva quotazione';
    byId('quote-value').firstElementChild.textContent = 'Valore (' + (position.unit === 'nominal' ? '%' : position.currency) + ')';
    byId('quote-error').textContent = '';
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
    if (original.date === position.initialQuoteDate) throw new Error('La quotazione iniziale è protetta.');
    const key = [position.id, original.date];
    const current = await db.investmentQuotes.get(key);
    if (!current || current.value !== original.value || current.totalQuantity !== original.totalQuantity) {
        throw new Error('La quotazione è cambiata. Riapri la scheda e riprova.');
    }
    return key;
}

async function saveQuote() {
    const { date, value, totalQuantity } = quoteForm.elements;
    const { positionId, original } = quoting;
    const quantity = totalQuantity.disabled || totalQuantity.value === '' ? undefined : totalQuantity.valueAsNumber;
    const quote = { ...makeQuote(positionId, date.value, value.valueAsNumber, quantity), manual: true };
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, async () => {
        const position = await db.investments.get(positionId);
        if (!position) throw new Error('Questa posizione è stata eliminata.');
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
        await db.investments.update(positionId, {
            initialQuoteDate: position.initialQuoteDate ?? quote.date,
            revision: crypto.randomUUID()
        });
    });
    quoteEditor.close();
    await renderInvestments();
}

async function deleteQuote(position, quote) {
    if (!window.confirm('Eliminare la quotazione del ' + quote.date + ' (' + quoteText(position, quote.value) + ')?')) return;
    const db = initDB();
    await db.transaction('rw', db.investments, db.investmentQuotes, async () => {
        const current = await db.investments.get(position.id);
        const key = await editableQuoteKey(db, current, quote);
        await db.investmentQuotes.delete(key);
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
    const days = Number(byId('period').value);
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    const cutoff = days ? localDate(start) : '';
    const inPeriod = portfolio.map(({ position, history }) => {
        const { points, baseline } = investmentSeries(position, history);
        return { position, baseline, points: points.filter(point => point.date >= cutoff) };
    }).filter(row => row.points.length);
    const eligible = inPeriod.filter(row => mode === 'price' || row.baseline > 0);

    const unitField = byId('price-unit');
    const previousUnit = unitField.value;
    const units = [...new Set(inPeriod.map(row => priceUnit(row.position)))];
    byId('price-unit-label').hidden = mode !== 'price' || units.length < 2;
    unitField.replaceChildren(...units.map(unit => new Option(unit, unit)));
    if (units.includes(previousUnit)) unitField.value = previousUnit;
    const rows = mode === 'price' ? eligible.filter(row => priceUnit(row.position) === unitField.value) : eligible;
    const empty = byId('line-empty');
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
    const axisDate = new Intl.DateTimeFormat('it-IT', wideRange ?
        { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
    chart.setOption({
        aria: { enabled: true },
        tooltip: {
            trigger: 'item', renderMode: 'richText', confine: true,
            formatter: item => {
                const [date, value] = item.value;
                const formatted = mode === 'percent' ? percent(value) : formatNumber.format(value);
                return names.get(item.seriesName) + '\n' + localDate(new Date(date)) + ' · ' + formatted +
                    (item.data.isCost ? '\nPrezzo medio di carico' : '');
            }
        },
        legend: { type: 'scroll', formatter: name => names.get(name), selected: { ...legendSelection } },
        grid: { top: 55, right: 14, bottom: 30, left: 12, containLabel: true },
        xAxis: {
            type: 'time', splitNumber: byId('line').clientWidth < 480 ? 3 : 6,
            minInterval: wideRange ? 28 * 86400000 : 86400000,
            axisLabel: { formatter: value => axisDate.format(value), hideOverlap: true }
        },
        yAxis: {
            type: 'value', scale: true, name: mode === 'price' ? unitField.value : mode === 'base' ? 'Base 100' : 'Variazione %',
            axisLabel: { formatter: value => mode === 'percent' ? percent(value) : formatNumber.format(value) }
        },
        series: rows.map(({ position, points, baseline }) => ({
            name: position.id, type: 'line', showSymbol: points.length <= 30 || points.some(point => point.isCost),
            data: points.map(({ date, value, isCost }) => {
                const relative = mode === 'price' ? null : value / baseline;
                return {
                    value: [new Date(date + 'T00:00:00').getTime(),
                        mode === 'price' ? value : mode === 'base' ? relative * 100 : (relative - 1) * 100],
                    isCost,
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
    const byType = byId('group').value === 'type';
    for (const { position, valueEur } of portfolio) {
        if (valueEur === null || valueEur <= 0) continue;
        const key = byType ? position.type : position.id;
        const group = groups.get(key) ?? { name: byType ? position.type : position.name, value: 0 };
        group.value += valueEur;
        groups.set(key, group);
    }
    const omitted = portfolio.filter(row => row.valueEur === null).length;
    const zero = portfolio.filter(row => row.valueEur === 0).length;
    const note = byId('pie-note');
    note.textContent = [
        !groups.size ? 'Nessun controvalore positivo in euro da mostrare.' : '',
        omitted ? 'Posizioni escluse per quotazione o cambio mancante: ' + omitted + '.' : '',
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
        ...group, itemStyle: { color: colors[index % colors.length] }
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
    renderLine();
    renderPie();
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
    const csv = [columns, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = element('a');
    link.href = url;
    link.download = 'moneylog-portafoglio-' + localDate() + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initializeInvestments() {
    byId('add').addEventListener('click', () => openPosition());
    byId('cancel').addEventListener('click', () => editor.close());
    byId('quote-cancel').addEventListener('click', () => quoteEditor.close());
    byId('export').addEventListener('click', exportPortfolio);
    for (const id of ['mode', 'period', 'price-unit']) byId(id).addEventListener('change', renderLine);
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
