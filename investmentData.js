export const investmentTypes = ['ETF', 'Azione', 'Obbligazione', 'Fondo', 'Fondo pensione', 'Altro'];

export function localDate(date = new Date()) {
    const pad = number => String(number).padStart(2, '0');
    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}

function validDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date;
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
    return {
        id, name: name.trim(), type, unit, currency, quantity, averageCost, rate, isin,
        startDate, initialQuoteDate,
        gainReference: gainReference === null ? null : {
            gain: gainReference.gain, value: gainReference.value, date: gainReference.date, quantity: gainReference.quantity
        },
        url: url ? consultationUrl(url) : ''
    };
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
    let quantity = position.quantity;
    const purchases = new Map();
    for (const quote of [...quotes].sort((a, b) => a.date.localeCompare(b.date))) {
        if (quote.totalQuantity === undefined) continue;
        if (position.unit !== 'unit' || quote.totalQuantity < quantity) {
            throw new Error('Il totale delle quote deve rispettare le quantità registrate prima e dopo questa data.');
        }
        purchases.set(quote.date, quote.totalQuantity - quantity);
        quantity = quote.totalQuantity;
    }
    return { quantity, purchases };
}

export function validateInvestmentBackup(backup) {
    if (backup === undefined) return null;
    if (backup?.version !== 1 || !Array.isArray(backup.positions) || !Array.isArray(backup.quotes)) {
        throw new Error('Formato del backup investimenti non valido.');
    }
    const positions = backup.positions.map(validatePosition);
    const ids = new Set(positions.map(position => position.id));
    if (ids.size !== positions.length) throw new Error('Posizioni duplicate nel backup.');
    const datesByPosition = new Map();
    const quotes = backup.quotes.map(({ investmentId, date, value, manual, totalQuantity }) => {
        if (!ids.has(investmentId)) throw new Error('Quotazione senza posizione nel backup.');
        const quote = makeQuote(investmentId, date, value, totalQuantity);
        if (!datesByPosition.has(investmentId)) datesByPosition.set(investmentId, new Set());
        const dates = datesByPosition.get(investmentId);
        if (dates.has(date)) throw new Error('Più quotazioni per la stessa posizione e data nel backup.');
        dates.add(date);
        return { ...quote, manual: manual === true };
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
    return { positions, quotes };
}

export function valuation(position, quote) {
    const { unit, quantity, averageCost, currency } = position;
    const multiplier = unit === 'total' ? 1 : quantity / (unit === 'nominal' ? 100 : 1);
    const rate = currency === 'EUR' ? 1 : position.rate;
    const value = quote ? quote.value * multiplier : null;
    const reference = position.gainReference;
    const inferredCost = reference && (unit === 'total' || reference.quantity === quantity) ?
        reference.value - reference.gain : null;
    const cost = averageCost === null ? inferredCost : averageCost * multiplier;
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
