export const investmentTypes = ['ETF', 'Azione', 'Obbligazione', 'Fondo', 'Fondo pensione', 'Altro'];

export function localDate(date = new Date()) {
    const pad = number => String(number).padStart(2, '0');
    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}

export function formatInvestmentDate(date) {
    return date ? date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3-$2-$1') : '—';
}

export function validDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date;
}

function validTimestamp(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function validateAccount({ id, name, openingCents, date, boundary, createdAt, updatedAt = createdAt, archivedAt = null }) {
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || name.length > 80 ||
        !Number.isSafeInteger(openingCents) || !validDate(date) || date > localDate() ||
        !['start', 'end'].includes(boundary) || !validTimestamp(createdAt) || !validTimestamp(updatedAt) ||
        updatedAt < createdAt || (archivedAt !== null && (!validTimestamp(archivedAt) ||
            archivedAt < createdAt || archivedAt > updatedAt))) {
        throw new Error('Controlla nome, saldo e data del conto.');
    }
    return { id, name: name.trim(), openingCents, date, boundary, createdAt, updatedAt, archivedAt };
}

export function validateTransfer({ id, fromId, toId, cents, date, createdAt, updatedAt = createdAt, deleted = false }) {
    if (![id, fromId, toId].every(value => typeof value === 'string' && value) || fromId === toId ||
        !Number.isSafeInteger(cents) || cents <= 0 || !validDate(date) || date > localDate() ||
        !validTimestamp(createdAt) || !validTimestamp(updatedAt) || updatedAt < createdAt || typeof deleted !== 'boolean') {
        throw new Error('Scegli due conti diversi e controlla importo e data del trasferimento.');
    }
    return { id, fromId, toId, cents, date, createdAt, updatedAt, deleted };
}

export function nextEditTime(previous) {
    return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}

export function canLinkAccount(account, date, insertedAt) {
    return Boolean(account && validDate(date) && typeof insertedAt === 'string' &&
        Number.isFinite(Date.parse(insertedAt)) && insertedAt >= account.createdAt &&
        (date > account.date || (date === account.date && account.boundary === 'start')));
}

export function installmentDate(plan) {
    const [year, month, day] = plan.date.split('-').map(Number);
    const end = new Date(0);
    end.setUTCFullYear(year, month + plan.offset * plan.frequency, 0);
    return end.toISOString().split('T')[0].replace(/\d{2}$/, String(Math.min(day, end.getUTCDate())).padStart(2, '0'));
}

function validatePlan(plan, unit, purchases) {
    if (plan == null) return null;
    const { id, date, frequency, offset, amountCents, paused } = plan;
    if (unit === 'total' || typeof id !== 'string' || !id || !validDate(date) ||
        ![1, 3, 12].includes(frequency) || !Number.isInteger(offset) || offset < 0 || offset > 120000 ||
        !Number.isSafeInteger(amountCents) || amountCents <= 0 || typeof paused !== 'boolean' ||
        !validDate(installmentDate(plan))) throw new Error('Controlla i dati del piano ricorrente.');
    const validated = { id, date, frequency, offset, amountCents, paused };
    const settled = new Set(purchases.map(purchase => purchase.due));
    while (settled.has(installmentDate(validated))) validated.offset++;
    if (!validDate(installmentDate(validated))) throw new Error('Scadenza del piano non valida.');
    return validated;
}

function validatePurchases(purchases, unit, currency) {
    if (!Array.isArray(purchases) || (unit === 'total' && purchases.length)) {
        throw new Error('Storico acquisti non valido.');
    }
    const ids = new Set();
    const dueDates = new Set();
    return purchases.map(({ id, date, due, quantity, amountCents, feeCents, accountId, insertedAt }) => {
        if (typeof id !== 'string' || !id || ids.has(id) || dueDates.has(due) || !validDate(date) || date > localDate() ||
            !validDate(due) || due > localDate() || !Number.isFinite(quantity) || quantity <= 0 ||
            !Number.isSafeInteger(amountCents) || amountCents <= 0 || !Number.isSafeInteger(feeCents) ||
            feeCents < 0 || !Number.isSafeInteger(amountCents + feeCents) ||
            (accountId !== null && (typeof accountId !== 'string' || !accountId || currency !== 'EUR')) ||
            typeof insertedAt !== 'string' || !Number.isFinite(Date.parse(insertedAt)) ||
            new Date(insertedAt).toISOString() !== insertedAt) throw new Error('Acquisto ricorrente non valido.');
        ids.add(id);
        dueDates.add(due);
        return { id, date, due, quantity, amountCents, feeCents, accountId, insertedAt };
    });
}

export function validIsin(isin) {
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
    const digits = isin.replace(/[A-Z]/g, letter => letter.charCodeAt(0) - 55);
    return [...digits].reverse().reduce((sum, digit, index) => {
        const value = Number(digit) * (index % 2 + 1);
        return sum + (value > 9 ? value - 9 : value);
    }, 0) % 10 === 0;
}

export function isinFeedback(isin) {
    if (!isin) return '';
    if (isin.length < 12) return 'ISIN incompleto: ' + isin.length + ' di 12 caratteri.';
    return validIsin(isin) ? '' : 'ISIN non valido. Controlla il codice e il carattere di controllo.';
}

export function consultationUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('Inserisci un URL di consultazione valido.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Usa un URL HTTP o HTTPS senza credenziali.');
    }
    return url.href;
}

const nonNegative = value => Number.isFinite(value) && value >= 0;
const sameQuantity = (left, right) => Math.abs(left - right) <=
    Number.EPSILON * 8 * Math.max(Math.abs(left), Math.abs(right));

export function investmentUrl(position) {
    return position.url ?? (position.source?.kind === 'url' ? position.source.url : '') ?? '';
}

export function validatePosition(position) {
    const { id, name, type, unit, currency, quantity, averageCost, rate, isin } = position;
    const { startDate = null, gainReference = null, initialQuoteDate = null } = position;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || name.length > 120 ||
        !investmentTypes.includes(type) || !['unit', 'nominal', 'total'].includes(unit) ||
        typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || !nonNegative(quantity) ||
        (rate !== null && (!Number.isFinite(rate) || rate <= 0)) ||
        (averageCost !== null && !nonNegative(averageCost))) {
        throw new Error('Controlla nome, quantità, valuta, cambio e prezzo di carico.');
    }
    if (typeof isin !== 'string') throw new Error('ISIN non valido.');
    if (isinFeedback(isin)) throw new Error(isinFeedback(isin));
    if (startDate !== null && (!validDate(startDate) || startDate > localDate())) {
        throw new Error('Indica una data di inizio di oggi o precedente.');
    }
    if (initialQuoteDate !== null && (!validDate(initialQuoteDate) || initialQuoteDate > localDate())) {
        throw new Error('Data della quotazione iniziale non valida.');
    }
    if (gainReference !== null && (averageCost !== null || !Number.isFinite(gainReference.gain) ||
        !nonNegative(gainReference.value) || !nonNegative(gainReference.quantity) ||
        !validDate(gainReference.date) || gainReference.date > localDate() ||
        gainReference.gain > gainReference.value)) {
        throw new Error('Controlla il guadagno o la perdita maturati e il relativo controvalore.');
    }
    const url = investmentUrl(position);
    if (typeof url !== 'string') throw new Error('URL di consultazione non valido.');
    const purchases = validatePurchases(position.purchases ?? [], unit, currency);
    return {
        id, name: name.trim(), type, unit, currency, quantity, averageCost, rate, isin,
        startDate, initialQuoteDate,
        gainReference: gainReference === null ? null : {
            gain: gainReference.gain, value: gainReference.value, date: gainReference.date, quantity: gainReference.quantity
        },
        url: url ? consultationUrl(url) : '',
        sales: validateSales(position.sales ?? [], unit),
        purchases,
        plan: validatePlan(position.plan, unit, purchases),
        quoteSource: validateQuoteSource(position.quoteSource)
    };
}

function validateSales(sales, unit) {
    if (!Array.isArray(sales)) throw new Error('Storico vendite non valido.');
    const ids = new Set();
    return sales.map(({ id, date, quantity, gross, fees, cost, rate, remainingValue, estimated }) => {
        if (typeof id !== 'string' || !id || ids.has(id) || !validDate(date) || date > localDate() ||
            !nonNegative(gross) || !nonNegative(fees) ||
            (cost !== null && !nonNegative(cost)) ||
            (rate !== null && (!Number.isFinite(rate) || rate <= 0)) ||
            (unit === 'total' ? quantity !== null || !nonNegative(remainingValue) :
                !Number.isFinite(quantity) || quantity <= 0 || remainingValue !== null)) {
            throw new Error('Controlla data, quantità, incasso, commissioni e costo attribuito.');
        }
        ids.add(id);
        return { id, date, quantity, gross, fees, cost, rate, remainingValue, estimated: estimated === true };
    });
}

function validateQuoteSource(source) {
    if (source == null) return null;
    const { url, label, context } = source;
    if (typeof label !== 'string' || typeof context !== 'string' || !(label.trim() || context.trim())) {
        throw new Error('Indica il nome del campo o la sezione della pagina.');
    }
    return { url: consultationUrl(url), label: label.trim(), context: context.trim() };
}

export function makeQuote(investmentId, date, value, totalQuantity) {
    if (typeof date !== 'string' || !validDate(date) || date > localDate() || !nonNegative(value)) {
        throw new Error('La quotazione deve avere un valore valido e una data di oggi o precedente.');
    }
    if (totalQuantity !== undefined && !nonNegative(totalQuantity)) {
        throw new Error('Inserisci un totale di quote valido.');
    }
    return totalQuantity === undefined ? { investmentId, date, value } :
        { investmentId, date, value, totalQuantity };
}

export function quantityHistory(position, quotes) {
    let grossQuantity = position.quantity;
    let sold = 0;
    let closed = false;
    const purchases = new Map();
    const snapshots = quotes.filter(quote => quote.totalQuantity !== undefined).map(quote => ({ date: quote.date, quote }));
    const sales = position.sales ?? [];
    const acquisitions = (position.purchases ?? []).map(purchase => ({ date: purchase.date, purchase }));
    const events = [...acquisitions, ...snapshots, ...sales.map(sale => ({ date: sale.date, sale }))];
    events.sort((a, b) => a.date.localeCompare(b.date));
    for (const { date, quote, sale, purchase } of events) {
        if (closed) throw new Error('Il movimento del ' + formatInvestmentDate(date) + ' è successivo alla chiusura della posizione.');
        if (sale && position.startDate && sale.date < position.startDate) {
            throw new Error('Vendita precedente all’inizio.');
        }
        if (purchase) {
            if (position.startDate && date < position.startDate) throw new Error('Acquisto precedente all’inizio.');
            grossQuantity += purchase.quantity;
        } else if (quote) {
            if (position.unit !== 'unit' ||
                (quote.totalQuantity < grossQuantity && !sameQuantity(quote.totalQuantity, grossQuantity))) {
                throw new Error('Il totale delle quote deve rispettare le quantità registrate prima e dopo questa data.');
            }
            purchases.set(quote.date, Math.max(0, quote.totalQuantity - grossQuantity));
            grossQuantity = Math.max(grossQuantity, quote.totalQuantity);
        } else if (position.unit === 'total') {
            closed = sale.remainingValue === 0;
        } else {
            sold += sale.quantity;
            closed = sameQuantity(grossQuantity, sold);
            if (sold > grossQuantity && !closed) {
                throw new Error('La vendita del ' + formatInvestmentDate(sale.date) + ' supera la quantità disponibile.');
            }
        }
    }
    return { quantity: closed ? 0 : grossQuantity - sold, purchases, closed };
}

export function positionPerformance(position, date, value, cost) {
    if (!position.startDate || !date || date < position.startDate || value === null || !(cost > 0)) return null;
    return {
        baseline: cost,
        points: [
            { date: position.startDate, value: cost, isCost: true, estimated: position.averageCost === null },
            { date, value }
        ]
    };
}

export function validateInvestmentBackup(backup) {
    if (backup === undefined) return null;
    if (![1, 2, 3].includes(backup?.version) || !Array.isArray(backup.positions) || !Array.isArray(backup.quotes)) {
        throw new Error('Formato del backup investimenti non valido.');
    }
    const positions = backup.positions.map(validatePosition);
    const ids = new Set(positions.map(position => position.id));
    if (ids.size !== positions.length) throw new Error('Posizioni duplicate nel backup.');
    const datesByPosition = new Map();
    const quotes = backup.quotes.map(({ investmentId, date, value, manual, totalQuantity, sourcePeriod, sourceUrl }) => {
        if (!ids.has(investmentId)) throw new Error('Quotazione senza posizione nel backup.');
        const quote = makeQuote(investmentId, date, value, totalQuantity);
        if (!datesByPosition.has(investmentId)) datesByPosition.set(investmentId, new Set());
        const dates = datesByPosition.get(investmentId);
        if (dates.has(date)) throw new Error('Più quotazioni per la stessa posizione e data nel backup.');
        dates.add(date);
        return {
            ...quote, manual: manual === true,
            ...(typeof sourcePeriod === 'string' && sourcePeriod ? { sourcePeriod: sourcePeriod.slice(0, 100) } : {}),
            ...(sourceUrl ? { sourceUrl: consultationUrl(sourceUrl) } : {})
        };
    });
    for (const position of positions) {
        quantityHistory(position, quotes.filter(quote => quote.investmentId === position.id));
        const dates = datesByPosition.get(position.id) ?? new Set();
        if (position.initialQuoteDate && !dates.has(position.initialQuoteDate)) {
            throw new Error('Quotazione iniziale mancante nel backup.');
        }
        if (!position.initialQuoteDate && dates.size) {
            position.initialQuoteDate = [...dates].sort()[0];
        }
    }
    return { version: backup.version, positions, quotes };
}

function purchaseBasis(position, history) {
    const purchases = position.purchases ?? [];
    const reference = position.gainReference;
    const average = position.averageCost === null ? null :
        position.averageCost / (position.unit === 'nominal' ? 100 : 1);
    let quantity = reference?.quantity ?? position.quantity;
    let gross = position.quantity;
    let cost = reference ? reference.value - reference.gain : average === null ? null : quantity * average;
    const events = [
        ...purchases.map(purchase => ({ date: purchase.date, purchase })),
        ...history.filter(quote => quote.totalQuantity !== undefined).map(quote => ({ date: quote.date, quote })),
        ...(position.sales ?? []).map(sale => ({ date: sale.date, sale }))
    ].sort((a, b) => a.date.localeCompare(b.date));
    for (const { date, purchase, quote, sale } of events) {
        const added = purchase?.quantity ?? (quote ? Math.max(0, quote.totalQuantity - gross) : 0);
        gross += added;
        if (reference && (date < reference.date || (date === reference.date && !sale))) continue;
        if (sale) {
            if (cost !== null && quantity > 0) cost *= Math.max(0, 1 - sale.quantity / quantity);
            quantity -= sale.quantity;
        } else if (added > 0) {
            const addedCost = purchase ? (purchase.amountCents + purchase.feeCents) / 100 :
                average === null ? null : added * average;
            cost = addedCost === null || (cost === null && quantity > 0) ? null : (cost ?? 0) + addedCost;
            quantity += added;
        }
    }
    return cost;
}

export function valuation(position, quote, history = [], initialQuantity = position.quantity) {
    const { unit, quantity, averageCost, currency } = position;
    const multiplier = unit === 'total' ? 1 : quantity / (unit === 'nominal' ? 100 : 1);
    const rate = currency === 'EUR' ? 1 : position.rate;
    const value = quote ? quote.value * multiplier : null;
    const reference = position.gainReference;
    const subsequentSales = reference ? (position.sales ?? []).filter(sale =>
        sale.date > reference.date || (sale.date === reference.date && unit !== 'total')) : [];
    const soldSinceReference = subsequentSales.reduce((sum, sale) => sum + (sale.quantity ?? 0), 0);
    const inferredCost = reference && (unit === 'total' ||
        sameQuantity(reference.quantity, quantity + soldSinceReference)) ?
        reference.value - reference.gain : null;
    let cost = averageCost === null ? inferredCost : averageCost * multiplier;
    const attributedSales = averageCost === null ? subsequentSales : unit === 'total' ? position.sales ?? [] : [];
    if (cost !== null) {
        for (const sale of attributedSales) {
            if (sale.cost === null) {
                cost = null;
                break;
            }
            cost -= sale.cost;
        }
    }
    if (position.purchases?.length) cost = purchaseBasis({ ...position, quantity: initialQuantity }, history);
    if (cost !== null && cost < 0) cost = cost >= -1e-7 ? 0 : null;
    const gain = value === null || cost === null ? null : value - cost;
    const toEuro = amount => amount === null || rate === null ? null : amount * rate;
    return { value, cost, gain, valueEur: toEuro(value), costEur: toEuro(cost), gainEur: toEuro(gain) };
}

export function investmentSeries(position, history) {
    const anchor = position.startDate && position.averageCost !== null && position.unit !== 'total' ?
        { date: position.startDate, value: position.averageCost, isCost: true } : null;
    const quotes = anchor ? history.filter(quote => quote.date >= anchor.date) : history;
    return {
        points: anchor ? [anchor, ...quotes] : quotes,
        baseline: (anchor ?? quotes[0])?.value ?? null
    };
}

export function csvCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value).replace('.', ',');
    const safeValue = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safeValue.replaceAll('"', '""') + '"';
}
