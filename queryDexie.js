import Dexie from './libs/dexie.mjs';

import { isValid, showErrorToast, showToast } from './main.js';
import { canLinkAccount, investmentUrl, localDate, nextEditTime, quantityHistory, validDate, validateAccount, validateInvestmentBackup, validatePosition, validateTransfer } from './investmentData.js';


let db;
initDB();


/////// INIZIALIZZAZIONE DB ///////////////////
export function initDB() {
  if (!db) {
    db = new Dexie('MoneyLogDB');
    db.version(1).stores({
      uscite: '++id, &dataInserimento, *categoria, importo, data, [importo+data], [data+importo], ricorrenteId',
      categorie: '&categoria',
      entrate: '++id, &dataInserimento, *categoria, importo, data, [importo+data], [data+importo], ricorrenteId',
      defaultCat: 'inizializato',
      deletedTrs: '++id',
      ricorrenze: 'ricorrenteId, *categoria, importo, data',
      budget: 'budgetId, *categoria, periodo,  usato, destinato, data',
    });

    db.version(2).stores({ progetti: 'projectId, &chiave' });
    db.version(3).upgrade(transaction => transaction.table('progetti').toCollection().modify(project => {
        project.nome = capitalizeFirstLetter(project.nome);
    }));

    db.version(4).stores({ coloriCategorie: "categoria, &colore" });
    db.version(5).upgrade(riequilibraColoriCategorie);
    db.version(6).stores({
        investments: 'id',
        investmentQuotes: '[investmentId+date], investmentId'
    });
    db.version(8).upgrade(transaction => transaction.table('investments').toCollection().modify(position => {
        position.url = investmentUrl(position);
        delete position.source;
        delete position.sourceNeedsReview;
        delete position.lastCheck;
        delete position.refreshError;
    }));
    db.version(9).upgrade(async transaction => {
        const positions = transaction.table('investments');
        const quotes = transaction.table('investmentQuotes');
        for (const id of await positions.toCollection().primaryKeys()) {
            const first = await quotes.where('[investmentId+date]').between([id, ''], [id, '\uffff']).first();
            if (first) await positions.update(id, { initialQuoteDate: first.date });
        }
    });
    db.version(10).stores({
        accounts: 'id',
        deletedTrs: '++id, &[seriesId+data]',
        uscite: '++id, &dataInserimento, *categoria, importo, data, [importo+data], [data+importo], ricorrenteId, accountId',
        entrate: '++id, &dataInserimento, *categoria, importo, data, [importo+data], [data+importo], ricorrenteId, accountId'
    });
    db.version(11).stores({ accountTransfers: 'id, fromId, toId' });

    initCategorie();
  }
  return db;
}


async function initCategorie(){
    const catList = ["Altro","Tempo libero", "Casa e utenze","Trasporti","Salute e benessere","Shopping" ];
    const isInit = await db.defaultCat.get("init");
    if(!isInit){
        for (const cat of catList) {
            await initSaveCategoria(cat);
        }
    }

    await db.defaultCat.put({ inizializato: "init", done: true });
}

export async function trsObject(trs, collectionName){
    try{
        const oggi = new Date().toISOString();
        const id = trs.id;
        const importo = collectionName === "uscite" ? -Math.abs(trs.importo) : Math.abs(trs.importo);
        const fomattedISO = new Date(trs.data).toISOString().split('T')[0];
        const categoria = capitalizeFirstLetter(trs.categoria);
        const dataIns = isValid(trs.dataInserimento) ? trs.dataInserimento : oggi;
        const dataMod = isValid(trs.dataModifica) ? trs.dataModifica : oggi;
        const descrizione = await setDescrizione(trs.descrizione, categoria);
        const ricorrenteId = trs.ricorrenteId;

        const trsOb = {
          id: id,
          descrizione: descrizione,
          importo: importo,
          categoria: categoria,
          dataInserimento: dataIns,
          dataModifica: dataMod,
          data: fomattedISO,
          projectId: collectionName === "uscite" ? trs.projectId || null : null,
          accountId: trs.accountId || null,
          ricorrenteId: ricorrenteId
        };

        return trsOb;
    }catch(err){
        console.log("Errore durante mapping transazione", err);
    }
}

export async function assertAccountLink(database, movement, allowArchived = false) {
    if (!movement.accountId) return;
    const account = await database.accounts.get(movement.accountId);
    if (!canLinkAccount(account, movement.data, movement.dataInserimento) ||
        (!allowArchived && account.archivedAt)) {
        throw new Error('Il conto selezionato non è disponibile per questo movimento.');
    }
}

async function accountOperations(db, id) {
    const [income, expenses, positions, outgoing, incoming] = await Promise.all([
        db.entrate.where('accountId').equals(id).toArray(),
        db.uscite.where('accountId').equals(id).toArray(),
        db.investments.toArray(),
        db.accountTransfers.where('fromId').equals(id).toArray(),
        db.accountTransfers.where('toId').equals(id).toArray()
    ]);
    return [
        ...[...income, ...expenses].map(item => [item.data, item.dataInserimento]),
        ...positions.flatMap(position => (position.purchases ?? [])
            .filter(item => item.accountId === id).map(item => [item.date, item.insertedAt])),
        ...[...outgoing, ...incoming].filter(item => !item.deleted).map(item => [item.date, item.updatedAt])
    ];
}

function assertAccountDates(account, operations) {
    if (operations.some(([date, insertedAt]) => !canLinkAccount(account, date, insertedAt))) {
        throw new Error('La data del saldo iniziale escluderebbe operazioni già collegate al conto.');
    }
}

function accountTransaction(db, action) {
    return db.transaction('rw', db.accounts, db.entrate, db.uscite, db.investments, db.accountTransfers, db.ricorrenze, action);
}

function assertAccountVersion(current, opened) {
    if (!current || (current.updatedAt ?? current.createdAt) !== (opened.updatedAt ?? opened.createdAt)) {
        throw new Error('Il conto è cambiato. Riapri il menu per continuare.');
    }
}

export async function saveCashAccount(input, opened) {
    const db = initDB();
    await accountTransaction(db, async () => {
        if (!opened) {
            await db.accounts.add(validateAccount({ ...input, id: crypto.randomUUID(), createdAt: nextEditTime() }));
            return;
        }
        const current = await db.accounts.get(opened.id);
        assertAccountVersion(current, opened);
        const account = validateAccount({ ...current, ...input, updatedAt: nextEditTime(current.updatedAt ?? current.createdAt) });
        assertAccountDates(account, await accountOperations(db, account.id));
        await db.accounts.put(account);
    });
}

export async function removeCashAccount(opened, archive) {
    const db = initDB();
    await accountTransaction(db, async () => {
        const current = await db.accounts.get(opened.id);
        assertAccountVersion(current, opened);
        if (!archive && (await accountOperations(db, current.id)).length) {
            throw new Error('Il conto ha operazioni collegate. Aggiorna la sezione per archiviarlo.');
        }
        const series = db.ricorrenze.filter(item => item.accountId === current.id);
        await series.modify({ accountId: null, accountFrom: null });
        if (archive) {
            const timestamp = nextEditTime(current.updatedAt ?? current.createdAt);
            await db.accounts.update(current.id, { archivedAt: timestamp, updatedAt: timestamp });
        } else {
            await db.accounts.delete(current.id);
        }
    });
}

export async function saveCashTransfer(input, opened, cancel = false) {
    const db = initDB();
    await db.transaction('rw', db.accounts, db.accountTransfers, async () => {
        const current = opened && await db.accountTransfers.get(opened.id);
        if (opened && (!current || current.deleted || current.updatedAt !== opened.updatedAt)) {
            throw new Error('Il trasferimento è cambiato. Riapri lo storico.');
        }
        const updatedAt = nextEditTime(current?.updatedAt);
        const transfer = validateTransfer({
            ...current, ...input, id: current?.id ?? crypto.randomUUID(),
            createdAt: current?.createdAt ?? updatedAt, updatedAt, deleted: cancel
        });
        if (!cancel) {
            for (const key of ['fromId', 'toId']) {
                const id = transfer[key];
                const alreadyLinked = current?.[key] === id;
                await assertAccountLink(db, { accountId: id, data: transfer.date, dataInserimento: updatedAt }, alreadyLinked);
            }
        }
        await db.accountTransfers.put(transfer);
    });
}

export async function aggiungiMovimento(movimento, collectionName, projectName) {
    const database = initDB();
    const collection = database.table(collectionName);
    return database.transaction("rw", collection, database.progetti, database.ricorrenze, database.accounts, async () => {
        await assertAccountLink(database, movimento);
        if (collectionName === "uscite" && projectName) {
            movimento.projectId = await resolveProject(projectName);
        } else if (movimento.projectId && !await database.progetti.get(movimento.projectId)) {
            movimento.projectId = null;
        }
        await collection.add(movimento);
        if (movimento.ricorrenteId) await database.ricorrenze.add(datiRicorrenza(movimento));
    });
}

function datiRicorrenza({ descrizione, importo, categoria, data, projectId, ricorrenteId, accountId }, previous) {
    let accountFrom = null;
    if (accountId) {
        const sameSchedule = previous?.accountId === accountId &&
            previous.ricorrenteId === ricorrenteId && previous.data === data;
        accountFrom = (sameSchedule && previous.accountFrom) || localDate();
    }
    return { descrizione, importo, categoria, data, projectId, ricorrenteId, accountId, accountFrom };
}

export async function aggiornaMovimento(movimento, collectionName, previousId) {
    const database = initDB();
    const collection = database.table(collectionName);
    await database.transaction("rw", collection, database.progetti, database.ricorrenze, database.accounts, async () => {
        const original = await collection.get(movimento.id);
        if (!original) throw new Error("Movimento non trovato");
        movimento.dataInserimento = original.dataInserimento;
        const retainingAccount = movimento.accountId === original.accountId;
        await assertAccountLink(database, movimento, retainingAccount);
        const previous = previousId ? await database.ricorrenze.get(previousId) : null;
        if (movimento.projectId && !await database.progetti.get(movimento.projectId)) movimento.projectId = null;
        const updated = await collection.update(movimento.id, movimento);
        if (!updated) throw new Error("Movimento non trovato");
        if (previousId && previousId !== movimento.ricorrenteId) {
            await database.ricorrenze.delete(previousId);
        }
        if (movimento.ricorrenteId) {
            const account = movimento.accountId && await database.accounts.get(movimento.accountId);
            await database.ricorrenze.put(datiRicorrenza(account?.archivedAt ? { ...movimento, accountId: null } : movimento, previous));
        }
    });
}

export async function getRic(){
    return await db.ricorrenze.toArray();
}

export async function checkRicorrenze(){
    try{
        const ricorrenti = await getRic();
        const today = new Date();

        for(const trs of ricorrenti){
            const split = trs.ricorrenteId.split('%');
            const periodo =
                split[0] === "mensile" ? 1 :
                split[0] === "trimestrale" ? 3 :
                split[0] === "annuale" ? 12 :
                null;

            if (!periodo) continue;
            const currentDate = new Date(trs.data);

            for(let date = currentDate; date < today;  date = addMonths(date, periodo)){
                const dataObject = date.toISOString().split('T')[0];
                const tableName = trs.importo > 0 ? "entrate" : "uscite";
                const ricTrs = { ...trs, data: dataObject };
                const trsOb = await trsObject(ricTrs, tableName);
                await db.transaction("rw", db.table(tableName), db.ricorrenze, db.accounts, db.deletedTrs, async () => {
                    const current = await db.ricorrenze.get(trs.ricorrenteId);
                    if (!current || current.data !== trs.data || current.importo !== trs.importo ||
                        current.categoria !== trs.categoria || current.descrizione !== trs.descrizione) return;
                    if (await db.deletedTrs.where('[seriesId+data]').equals([split[1], dataObject]).count()) return;
                    const table = db.table(tableName);
                    const exists = await table.where('data').equals(dataObject).toArray();
                    if (exists.some(item => item.ricorrenteId?.split("%")[1] === split[1] ||
                        (!item.ricorrenteId && item.importo === trs.importo && item.categoria === trs.categoria &&
                            (item.projectId ?? null) === (current.projectId ?? null) &&
                            (item.accountId ?? null) === (current.accountId ?? null)))) return;
                    while (await table.get({ dataInserimento: trsOb.dataInserimento })) {
                        trsOb.dataInserimento = new Date(Date.parse(trsOb.dataInserimento) + 1).toISOString();
                    }
                    trsOb.projectId = current.projectId ?? null;
                    const account = current.accountId && await db.accounts.get(current.accountId);
                    trsOb.accountId = current.accountFrom && dataObject > current.accountFrom && !account?.archivedAt &&
                        canLinkAccount(account, dataObject, trsOb.dataInserimento) ? account.id : null;
                    await table.add(trsOb);
                });
            }
        }
    }catch(err){
        console.log("Errore nel salvataggio transazione ricorrente", err);
    }
}



export async function checkRicorrenzeBudgetMensile(){
    const periodo = "mensile";

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0–11

    const dataInizio = formatDateYMD(new Date(year, month, 1));
    const dataFine   = formatDateYMD(new Date(year, month + 1, 0));

    await rinnovaBudget(dataInizio, dataFine, periodo);
}


export async function checkRicorrenzeBudgetAnnuale(){
    const periodo = "annuale";
    const year = new Date().getFullYear();
    const dataInizio = formatDateYMD(new Date(year, 0, 1));
    const dataFine   = formatDateYMD(new Date(year, 11, 31));

    await rinnovaBudget(dataInizio, dataFine, periodo);
}

async function rinnovaBudget(dataInizio, dataFine, periodo) {
    const oggi = formatDateYMD(new Date());
    await initDB().transaction("rw", db.budget, db.progetti, async () => {
        const budgets = await getBudgetsByPeriodo(periodo);
        const archived = new Set();
        for (const budget of budgets.sort((a, b) => b.data.localeCompare(a.data))) {
            if (archived.has(budget.budgetId)) continue;
            if (budget.data > oggi || budget.ricorrenzaArchiviata) continue;
            const existing = await getBudgets(dataInizio, dataFine, budget.categoria, periodo);
            const seriesId = budget.serieBudgetId ?? budget.budgetId;
            const sameSeries = item => budget.serieBudgetId
                ? item.serieBudgetId === seriesId
                : !item.serieBudgetId && (item.projectId ?? null) === (budget.projectId ?? null);
            if (existing.some(sameSeries)) continue;
            await db.budget.update(budget.budgetId, { serieBudgetId: seriesId, ricorrenzaArchiviata: true });
            if (!budget.serieBudgetId) {
                for (const id of await archiviaBudgetPrecedenti(budget, seriesId)) archived.add(id);
            }
            await createBudget({ ...budget, budgetId: crypto.randomUUID(), serieBudgetId: seriesId, ricorrenzaArchiviata: false, data: oggi });
        }
    });
}

function formatDateYMD(date) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}


/////////////////   SALVATAGGIO TRANSAZIONI   ///////////////////////////
async function setDescrizione(descrizione, categoria){
     if(descrizione === ""){
        return categoria;
     }
     return descrizione;
}



/////////// SALVATAGGIO CATEGORIE //////////////////////

export const CATEGORY_PALETTE = [
    "#2975c6", "#d93d38", "#209452", "#e4b500", "#813cc1", "#00a8ad",
    "#ea7121", "#c52c82", "#96aa27", "#31528d", "#a14b2d", "#2bbdc7",
    "#ee6481", "#147d74", "#e8ce56", "#6761d9", "#719f43", "#883e63",
    "#f29944", "#5287ae", "#c293cf", "#a95446", "#739f95", "#ad8239"
];

function coordinateColore(color) {
    const channels = color.slice(1).match(/../g).map(hex => {
        const value = parseInt(hex, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const [r, g, b] = channels;
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

let colorCandidates;

function getColorCandidates() {
    if (colorCandidates) return colorCandidates;
    colorCandidates = [];
    for (let r = 24; r <= 248; r += 32) {
        for (let g = 24; g <= 248; g += 32) {
            for (let b = 24; b <= 248; b += 32) {
                if (Math.max(r, g, b) - Math.min(r, g, b) < 64) continue;
                const color = "#" + [r, g, b].map(value => value.toString(16).padStart(2, "0")).join("");
                colorCandidates.push({ color, point: coordinateColore(color) });
            }
        }
    }
    return colorCandidates;
}

function colorDistanceSquared(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function selectDistinctColors(used, count, minDistance) {
    const assigned = [...used].map(coordinateColore);
    const candidates = getColorCandidates()
        .filter(({ color }) => !used.has(color))
        .map(({ color, point }) => ({
            color,
            point,
            nearest: assigned.reduce((min, other) => Math.min(min, colorDistanceSquared(point, other)), Infinity)
        }));
    const result = [];
    while (result.length < count && candidates.length) {
        const bestIndex = candidates.reduce((best, item, index) =>
            item.nearest > candidates[best].nearest ? index : best, 0);
        if (candidates[bestIndex].nearest < minDistance ** 2) break;
        const [best] = candidates.splice(bestIndex, 1);
        result.push(best.color);
        for (const candidate of candidates) {
            candidate.nearest = Math.min(candidate.nearest, colorDistanceSquared(candidate.point, best.point));
        }
    }
    return result;
}

export function getMoreCategoryColors(used) {
    return selectDistinctColors(used, 6, 0.065);
}

function prossimoColore(used) {
    const available = CATEGORY_PALETTE.find(color => !used.has(color));
    if (available) return available;

    const [best] = selectDistinctColors(used, 1, 0);
    if (best) return best;
    for (let rgb = 1; rgb < 0xffffff; rgb++) {
        const color = "#" + rgb.toString(16).padStart(6, "0");
        if (!used.has(color)) return color;
    }
    throw new Error("Colori disponibili esauriti");
}

async function riequilibraColoriCategorie(transaction) {
    const table = transaction.table("coloriCategorie");
    const stored = await table.toCollection().primaryKeys();
    const categories = await transaction.table("categorie").toCollection().primaryKeys();
    const used = new Set();
    const rows = [...new Set([...categories, ...stored])].map(categoria => {
        const colore = prossimoColore(used);
        used.add(colore);
        return { categoria, colore };
    });
    await table.clear();
    await table.bulkAdd(rows);
}

async function assegnaColoriCategorie(requested) {
    const colors = new Map((await db.coloriCategorie.toArray()).map(item => [item.categoria, item.colore]));
    const used = new Set(colors.values());
    for (const { categoria, colore } of requested) {
        if (!categoria || colors.has(categoria)) continue;
        const preferred = typeof colore === "string" ? colore.toLowerCase() : "";
        const chosen = /^#[0-9a-f]{6}$/.test(preferred) && preferred !== "#000000" &&
            preferred !== "#ffffff" && !used.has(preferred) ? preferred : prossimoColore(used);
        await db.coloriCategorie.add({ categoria, colore: chosen });
        used.add(chosen);
        colors.set(categoria, chosen);
    }
    return colors;
}

export async function getCategoryColors(names = []) {
    const database = initDB();
    return database.transaction("rw", database.categorie, database.coloriCategorie, async () => {
        const categories = await database.categorie.toCollection().primaryKeys();
        return assegnaColoriCategorie([...new Set([...categories, ...names])].map(categoria => ({ categoria })));
    });
}

export async function getAutomaticCategoryColor() {
    const colors = await getCategoryColors();
    return prossimoColore(new Set(colors.values()));
}

export async function updateCategory(categoria, nome, colore) {
    const nuovoNome = capitalizeFirstLetter(nome.trim());
    if (!nuovoNome || nuovoNome.length > 25) throw new Error("Inserisci un nome da 1 a 25 caratteri");
    if (categoria === "Altro" && nuovoNome !== categoria) throw new Error("La categoria Altro non può essere rinominata");
    if (!/^#[0-9a-f]{6}$/.test(colore) || colore === "#000000" || colore === "#ffffff") {
        throw new Error("Colore non valido");
    }
    const database = initDB();
    const collegate = [database.uscite, database.entrate, database.ricorrenze, database.budget];
    return database.transaction("rw", [database.categorie, database.coloriCategorie, ...collegate], async () => {
        const record = await database.categorie.get(categoria);
        if (!record) throw new Error("Categoria non trovata");
        if (nuovoNome !== categoria && await database.categorie.get(nuovoNome)) {
            throw new Error("Esiste già una categoria con questo nome");
        }
        const owner = await database.coloriCategorie.get({ colore });
        if (owner && owner.categoria !== categoria) throw new Error("Colore già assegnato");
        if (nuovoNome !== categoria) {
            await database.categorie.add({ ...record, categoria: nuovoNome });
            for (const table of collegate) {
                await table.where("categoria").equals(categoria).modify({ categoria: nuovoNome });
            }
            await database.categorie.delete(categoria);
            await database.coloriCategorie.delete(categoria);
        }
        await database.coloriCategorie.put({ categoria: nuovoNome, colore });
    });
}

async function initSaveCategoria(categoria){
    await db.transaction("rw", db.categorie, db.coloriCategorie, async () => {
        if (await db.categorie.get(categoria)) return;
        await db.categorie.add({ categoria, richieste: 0 });
        await assegnaColoriCategorie([{ categoria }]);
    });
}

export async function saveCategoria(categoria, richiesta) {
  const categoriaLower = categoria.toLowerCase().trim();
  const categoriaCapitalized = capitalizeFirstLetter(categoriaLower);
  richiesta = richiesta === 0 ? 0 : 1
  try {

    await db.transaction("rw", db.categorie, db.coloriCategorie, async () => {
        const cat = await db.categorie.get(categoriaCapitalized);
        if (!cat) {
            await db.categorie.add({ categoria: categoriaCapitalized, richieste: richiesta });
            await assegnaColoriCategorie([{ categoria: categoriaCapitalized }]);
        } else {
            await updateRichieste(null, "more", cat);
        }
    });

  } catch (error) {
      showErrorToast('Errore durante l\'aggiunta della categoria', "error");
  }
}



export function capitalizeFirstLetter(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}


////////// UPDATE TRANSAZIONI ///////////////////
export async function updateTrsLocal(trsOb, collectionName) {
  try {
    initDB();
    const collection = db[collectionName];
    if (!trsOb.id) {
      throw new Error("ID uscita mancante per la sostituzione");
    }

    const id =  await collection.update(trsOb.id, trsOb);
    showToast("Transazione sostituita con successo", "success");
    return { success: true, id };

  } catch (error) {
    console.error("Errore nella sostituzione della transazione:", error);
    showToast("Errore durante la sostituzione della transazione", "error");
    return { success: false, error };
  }
}


/////////////////  RICERCA ///////////////////////
export async function queryTrns(criteri = {}, tabActive) {
  initDB();
  const collezione = tabActive ? db.entrate : db.uscite;

    if (Object.keys(criteri).length === 0) {
      return collezione.toArray();
    }

  const minImporto = criteri.importoMin != null ? criteri.importoMin : -Infinity;
  const maxImporto = criteri.importoMax != null ? criteri.importoMax : Infinity;
  const startDate = criteri.dataInizio || Dexie.minKey;
  const endDate = criteri.dataFine || Dexie.maxKey;

  const categorieFiltro = criteri.categoria
    ? (Array.isArray(criteri.categoria) ? criteri.categoria : [criteri.categoria])
    : null;

  let col = collezione;

  // 1. Filtro iniziale con indice composto se entrambi i filtri esistono
  if ((criteri.dataInizio || criteri.dataFine) && (criteri.importoMin != null || criteri.importoMax != null)) {
    col = col.where('[data+importo]')
             .between([startDate, minImporto], [endDate, maxImporto], true, true);

  // 2. Solo filtro per data
  } else if (criteri.dataInizio || criteri.dataFine) {
    col = col.where('data').between(startDate, endDate, true, true);

  // 3. Solo filtro per importo
  } else if (criteri.importoMin != null || criteri.importoMax != null) {
    col = col.where('importo').between(minImporto, maxImporto, true, true);

  // 4. Solo categoria
  } else if (categorieFiltro) {
    col = col.where('categoria').anyOf(categorieFiltro).distinct();
  }

  // 5. Filtri aggiuntivi in memoria usando .and()
  col = col.and(item => {
    if (categorieFiltro) {
      const cats = Array.isArray(item.categoria) ? item.categoria : [item.categoria];
      if (!cats.some(c => categorieFiltro.includes(c))) return false;
    }
    if (criteri.projectId && item.projectId !== criteri.projectId) return false;
    if (criteri.importoMin != null && item.importo < criteri.importoMin) return false;
    if (criteri.importoMax != null && item.importo > criteri.importoMax) return false;
    if (criteri.dataInizio && item.data < criteri.dataInizio) return false;
    if (criteri.dataFine && item.data > criteri.dataFine) return false;
    return true;
  });

  return col.toArray();
}


////////////////  ELIMINAZIONE TRANSAZIONI ////////////////////////////////
export async function deleteSpese(criteri = {}, tabActive) {
    const table = tabActive ? db.entrate : db.uscite;
    if (Array.isArray(criteri) && criteri.length > 0) {
        await db.transaction('rw', table, db.deletedTrs, async () => {
            const records = table.filter(trns => criteri.includes(trns.dataInserimento));
            for (const { ricorrenteId, data } of await records.toArray()) {
                const seriesId = ricorrenteId?.split('%')[1];
                if (seriesId && !await db.deletedTrs.where('[seriesId+data]').equals([seriesId, data]).count()) {
                    await db.deletedTrs.add({ seriesId, data });
                }
            }
            await records.delete();
        });
    }
}

//////////// DELETE CATEGORIE /////////////////
export async function deleteCategorie(criteri = []) {
    if (Array.isArray(criteri) && criteri.length > 0) {
        await db.categorie
            .where('categoria')
            .anyOfIgnoreCase(criteri)  // Confronto case-insensitive
            .delete();
    }
    for(const categoria of criteri){
        const defaultCat = await getCategorieEsatta("Altro");
        updateCatInTrns({categoria: categoria, richieste: 0}, defaultCat[0]);
    }
    return;
}

//////////// GET CATEGORIE /////////////////
export async function getCategorie(criteri) {
  initDB();

  let criteriArray = [];
  if (Array.isArray(criteri)) {
    criteriArray = criteri;
  } else if (typeof criteri === 'string' && criteri.trim() !== '') {
    criteriArray = [criteri];
  }

  criteriArray = criteriArray.filter(c => typeof c === 'string' && c.trim() !== '');
  let categorie;

  if (criteriArray.length > 0) {
    categorie = await db.categorie
      .where('categoria')
      .startsWithAnyOfIgnoreCase(criteriArray)
      .toArray();
  } else {
    categorie = await db.categorie.toArray();
  }

  return categorie.sort((a, b) => b.richieste - a.richieste);
}

export async function getCategorieEsatta(categoria) {
  initDB();
  if (typeof categoria !== 'string' || categoria.trim() === '') {
    return (await db.categorie.toArray()).sort((a, b) => b.richieste - a.richieste); }

  const categorie = await db.categorie
    .where('categoria')
    .equals(categoria.trim())
    .toArray();

  return categorie.sort((a, b) => b.richieste - a.richieste);
}


//////////// UPDATE CATEGORIE /////////////////
export async function updateRichieste(nome, operazione, cat){
    const n = operazione === "more" ? 1 : -1;
    let categoria;
    let nomeCat;
    if(isValid(nome)){
        const array = await getCategorie(nome);
        categoria = array[0];
    }else if (isValid(cat)){
        categoria  = cat;
    }

    const r = categoria.richieste;
    nomeCat = categoria.categoria;
    const sum = r + n;
    await db.categorie.update(nomeCat, { richieste: sum });
}

export async function switchRichieste(nomeOld, nomeNew){
    await updateRichieste(nomeOld, "less");
    await saveCategoria(nomeNew);
}

//////////////   UPDATE CATEGORIE IN TRANSAZIONI ////////////////////////
async function updateCatInTrns(oldCat, newCat){
    const criteri = {categoria: [oldCat.categoria]}
    const catSpese = await queryTrns(criteri, false);
    const catEntrate = await queryTrns(criteri, true);
    const newRecord = newCat.categoria;
    if(catSpese.length !== 0){
        for(const spesa of catSpese){
            const trsOb = await trsObject(spesa, "uscite");
            trsOb.categoria = newRecord;
            await updateTrsLocal(trsOb,"uscite");
            await updateRichieste(null, "less", oldCat);
            await updateRichieste(null, "more", newCat);
        }
    }
    if(catEntrate.length !== 0){
        for(const entrata of catEntrate){
            const trsOb = await trsObject(entrata, "entrate");
            trsOb.categoria = newRecord;
            await updateTrsLocal(trsOb, "entrate");
            await updateRichieste(null, "less", oldCat);
            await updateRichieste(null, "more", newCat);
        }
    }

}


document.getElementById('btnDeleteData').addEventListener('click', () => {
  apriConferma();
});

function apriConferma() {
  const modal = document.getElementById('confirmModal');
  modal.classList.remove('hidden');

  const yesBtn = document.getElementById('confirmYes');
  const noBtn = document.getElementById('confirmNo');

  yesBtn.replaceWith(yesBtn.cloneNode(true));
  noBtn.replaceWith(noBtn.cloneNode(true));

  const newYesBtn = document.getElementById('confirmYes');
  const newNoBtn = document.getElementById('confirmNo');

  newYesBtn.addEventListener('click', async () => {
    modal.classList.add('hidden');
    await PulisciDatabase();
  });

  newNoBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}

async function PulisciDatabase() {
  try {
    await db.delete();
    db = null;
    const esiste = await Dexie.exists("MoneyLogDB");

    if (!esiste) {
      showToast("Database eliminato con successo!");
    } else {
      showErrorToast("Attenzione: il database non è stato eliminato correttamente!", "error");
    }
  } catch (error) {
    showErrorToast("Errore durante l'eliminazione del database", "error");
  }
}

//////////////////  EXPORT DATABASE ////////////////////////
document.getElementById('btnExportJSON').addEventListener('click', esportaDatabase);
async function esportaDatabase() {
  const overlaySpinner = document.getElementById('spinnerOverlay');
  try {
      overlaySpinner.style.display = 'flex';
      const result = await db.transaction('r', db.uscite, db.entrate, db.progetti, db.coloriCategorie,
        db.budget, db.ricorrenze, db.deletedTrs, db.accounts, db.accountTransfers, db.investments, db.investmentQuotes, async () => {
        const spese = await queryTrns({}, false);
        const entrate = await queryTrns({}, true);
        const backup = {
            id: [],
            dataValuta: [],
            dataInserimento: [],
            dataModifica: [],
            categoria: [],
            descrizione: [],
            valore: [],
            projectId: [],
            accountId: [],
            ricorrenteId: [],
            progetti: await getProjects(),
            coloriCategorie: await db.coloriCategorie.toArray(),
            budget: await db.budget.toArray(),
            ricorrenze: await db.ricorrenze.toArray(),
            deletedOccurrences: (await db.deletedTrs.toArray()).filter(item => item.seriesId)
                .map(({ seriesId, data }) => ({ seriesId, data })),
            accounts: await db.accounts.toArray(),
            accountTransfers: await db.accountTransfers.toArray(),
            investments: {
                version: 3,
                positions: await db.investments.toArray(),
                quotes: await db.investmentQuotes.toArray()
            },
            bilancio: 0
        };

        for (const item of [...spese, ...entrate]) {
            backup.id.push(item.id);
            backup.dataValuta.push(item.data);
            backup.dataInserimento.push(item.dataInserimento);
            backup.dataModifica.push(item.dataModifica);
            backup.categoria.push(item.categoria);
            backup.descrizione.push(item.descrizione || "");
            backup.projectId.push(item.projectId ?? null);
            backup.accountId.push(item.accountId ?? null);
            backup.ricorrenteId.push(item.ricorrenteId ?? null);
            backup.valore.push(item.importo);
            backup.bilancio += item.importo;
        }
        return backup;
        });

        const json = JSON.stringify(result, null, 2);
        if (window.MoneyLogAndroid) {
            window.MoneyLogAndroid.saveFile("moneyLogExport.json", "application/json", json);
            return;
        }
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "moneyLogExport.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Esportazione eseguita con successo","succes");
    }catch(err){
        showErrorToast("Errore nell'esportazione dei dati","error")
    }finally{
        overlaySpinner.style.display = 'none';
    }
}
const fileInput = document.getElementById('fileImport');
const btnImport = document.getElementById('btnImport');
const importError = document.getElementById('import-error');

fileInput.addEventListener('change', () => {
  btnImport.disabled = fileInput.files.length === 0;
  importError.textContent = '';
});

btnImport.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  btnImport.disabled = true;
  fileInput.disabled = true;
  try {
    await importaDatabase(file);
  } finally {
    fileInput.value = "";
    fileInput.disabled = false;
  }
});

function readBackup(file) {
    const bridge = window.MoneyLogAndroid;
    if (!bridge?.readBackup) return file.text();
    return new Promise((resolve, reject) => {
        window.moneyLogBackupResult = (content, error) => {
            delete window.moneyLogBackupResult;
            if (error) reject(new Error(error));
            else resolve(content);
        };
        bridge.readBackup();
    });
}

///////////////////////////  IMPORT  ////////////////////////
async function importaDatabase(file) {
    const overlaySpinner = document.getElementById('spinnerOverlay');
    overlaySpinner.style.display = 'flex';
    importError.textContent = '';
    let stage = 'Lettura del file';

    try {
        const fileContent = (await readBackup(file)).replace(/^\uFEFF/, '').trim();
        if (!fileContent) throw new Error('Il file selezionato è vuoto.');
        stage = 'Analisi del JSON';
        const result = JSON.parse(fileContent);
        stage = 'Controllo dei movimenti';
        const transazioni = parseDataTabella(result);
        stage = 'Controllo degli investimenti';
        const investments = validateInvestmentBackup(result.investments);
        stage = 'Controllo dei conti';
        const accounts = (result.accounts ?? []).map(validateAccount);
        if (new Set(accounts.map(account => account.id)).size !== accounts.length) {
            throw new Error('Conti duplicati nel backup.');
        }
        const transfers = (result.accountTransfers ?? []).map(validateTransfer);
        if (new Set(transfers.map(transfer => transfer.id)).size !== transfers.length) {
            throw new Error('Trasferimenti duplicati nel backup.');
        }

        stage = 'Salvataggio nel database';
        await db.transaction("rw", db.progetti, db.budget, db.ricorrenze, db.uscite, db.entrate, db.categorie, db.coloriCategorie,
          db.investments, db.investmentQuotes, db.accounts, db.accountTransfers, db.deletedTrs, async () => {
            const changedAccounts = [];
            for (const account of accounts) {
                const existing = await db.accounts.get(account.id);
                if (existing && existing.createdAt !== account.createdAt) {
                    throw new Error('Un conto nel backup ha lo stesso identificativo ma una data di creazione diversa.');
                }
                if (!existing || account.updatedAt > (existing.updatedAt ?? existing.createdAt)) {
                    await db.accounts.put(account);
                    changedAccounts.push(account);
                }
            }
            for (const transfer of transfers) {
                const existing = await db.accountTransfers.get(transfer.id);
                if (existing && existing.createdAt !== transfer.createdAt) {
                    throw new Error('Un trasferimento nel backup ha lo stesso identificativo ma una data di creazione diversa.');
                }
                if (existing && existing.updatedAt >= transfer.updatedAt) continue;
                if (!transfer.deleted) {
                    for (const id of [transfer.fromId, transfer.toId]) {
                        await assertAccountLink(db, {
                            accountId: id, data: transfer.date, dataInserimento: transfer.updatedAt
                        }, true);
                    }
                }
                await db.accountTransfers.put(transfer);
            }
            if (investments) {
                const protectedDates = new Map();
                for (const position of investments.positions) {
                    const existing = await db.investments.get(position.id);
                    if (existing && (existing.currency !== position.currency || existing.unit !== position.unit)) {
                        throw new Error('Posizione esistente con valuta o unità diversa');
                    }
                    const initialQuoteDate = investments.version === 1 ?
                        existing?.initialQuoteDate ?? position.initialQuoteDate :
                        position.initialQuoteDate ?? existing?.initialQuoteDate;
                    if (investments.version === 1 && existing?.initialQuoteDate) {
                        protectedDates.set(position.id, existing.initialQuoteDate);
                    }
                    if (investments.version === 1 && existing) {
                        if (!position.sales.length) position.sales = existing.sales ?? [];
                        position.quoteSource ??= existing.quoteSource ?? null;
                    }
                    if (investments.version < 3 && existing) {
                        position.plan = existing.plan ?? null;
                        position.purchases = existing.purchases ?? [];
                    } else if (existing) {
                        const purchases = new Map((existing.purchases ?? []).map(item => [item.id, item]));
                        for (const item of position.purchases) {
                            if (!purchases.has(item.id)) purchases.set(item.id, item);
                        }
                        position.purchases = [...purchases.values()];
                        if (position.plan && existing.plan?.id === position.plan.id && existing.plan.offset > position.plan.offset) {
                            position.plan = existing.plan;
                        }
                    }
                    for (const purchase of position.purchases) {
                        await assertAccountLink(db, {
                            accountId: purchase.accountId, data: purchase.date, dataInserimento: purchase.insertedAt
                        }, true);
                    }
                    const validated = validatePosition({ ...position, initialQuoteDate });
                    await db.investments.put({ ...validated, revision: crypto.randomUUID() });
                }
                await db.investmentQuotes.bulkPut(investments.quotes.filter(quote => quote.date !== protectedDates.get(quote.investmentId)));
                for (const position of investments.positions) {
                    const history = await db.investmentQuotes.where('investmentId').equals(position.id).toArray();
                    quantityHistory(position, history);
                }
            }
            await assegnaColoriCategorie(result.coloriCategorie ?? []);
            const projectIds = new Map();
            for (const project of result.progetti ?? []) {
                const existing = await db.progetti.get(project.projectId);
                const projectId = existing?.projectId ?? await resolveProject(project.nome, project.projectId);
                projectIds.set(project.projectId, projectId);
            }
            for (const budget of result.budget ?? []) {
                await db.budget.put({ ...budget, projectId: projectIds.get(budget.projectId) ?? budget.projectId });
                await saveCategoria(budget.categoria, 0);
            }
            for (const ricorrenza of result.ricorrenze ?? []) {
                const existing = await db.ricorrenze.get(ricorrenza.ricorrenteId);
                const account = ricorrenza.accountId && await db.accounts.get(ricorrenza.accountId);
                if (ricorrenza.accountId && !account) {
                    throw new Error('Conto della ricorrenza assente dal backup.');
                }
                await db.ricorrenze.put({ ...existing, ...ricorrenza,
                    ...(account?.archivedAt ? { accountId: null, accountFrom: null } : {}),
                    projectId: projectIds.get(ricorrenza.projectId) ?? ricorrenza.projectId });
            }
            for (const { seriesId, data } of result.deletedOccurrences ?? []) {
                if (typeof seriesId !== 'string' || !seriesId || !validDate(data)) {
                    throw new Error('Occorrenza eliminata non valida.');
                }
                if (!await db.deletedTrs.where('[seriesId+data]').equals([seriesId, data]).count()) {
                    await db.deletedTrs.add({ seriesId, data });
                }
                for (const table of [db.uscite, db.entrate]) {
                    await table.where('data').equals(data)
                        .and(item => item.ricorrenteId?.split('%')[1] === seriesId).delete();
                }
            }
            for (const trs of transazioni) {
                if (!Number(trs.importo)) continue;
                const table = trs.importo < 0 ? db.uscite : db.entrate;
                const record = await trsObject({ ...trs, projectId: projectIds.get(trs.projectId) ?? trs.projectId }, table.name);
                const seriesId = record.ricorrenteId?.split('%')[1];
                if (seriesId && await db.deletedTrs.where('[seriesId+data]').equals([seriesId, record.data]).count()) continue;
                const existing = await table.get({ dataInserimento: record.dataInserimento });
                if (existing) {
                    const associations = {};
                    if (trs.projectId !== undefined) associations.projectId = record.projectId;
                    if (trs.ricorrenteId !== undefined) associations.ricorrenteId = record.ricorrenteId;
                    if (trs.accountId !== undefined) {
                        await assertAccountLink(db, { ...existing, accountId: record.accountId }, true);
                        associations.accountId = record.accountId;
                    }
                    if (Object.keys(associations).length) await table.update(existing.id, associations);
                } else {
                    await assertAccountLink(db, record, true);
                    delete record.id;
                    await table.add(record);
                    await saveCategoria(record.categoria);
                }
            }
            for (const account of changedAccounts) {
                assertAccountDates(account, await accountOperations(db, account.id));
            }
        });

        showToast("Importazione completata!", "success");

    } catch (error) {
        console.error(error);
        const name = error?.name && error.name !== 'Error' ? error.name + ' · ' : '';
        const detail = error instanceof SyntaxError ?
            error.message + '. Il file potrebbe essere incompleto.' : error?.message || String(error);
        importError.textContent = 'Errore durante l’importazione · ' + stage + '\n' + name + detail;

    } finally {
        overlaySpinner.style.display = 'none';
    }
}

function parseDataTabella(dataTabella) {
    const transazioni = [];
    for (let i = 0; i < dataTabella.categoria.length; i++) {
        transazioni.push({
            id: dataTabella.id[i],
            data: dataTabella.dataValuta[i],
            dataInserimento: dataTabella.dataInserimento[i],
            dataModifica: dataTabella.dataModifica[i],
            categoria: dataTabella.categoria[i],
            descrizione: dataTabella.descrizione[i],
            projectId: dataTabella.projectId?.[i],
            accountId: dataTabella.accountId?.[i],
            ricorrenteId: dataTabella.ricorrenteId?.[i],
            importo: dataTabella.valore[i]
        });
    }
    return transazioni;
}


/////////// CRUD BUDGET //////////////////////

export function getProjects() {
    return initDB().progetti.orderBy('chiave').toArray();
}

export async function getProjectUsage(projectId) {
    const database = initDB();
    return database.transaction("r", database.uscite, database.budget, database.ricorrenze, () =>
        Promise.all([database.uscite, database.budget, database.ricorrenze].map(table =>
            table.filter(item => item.projectId === projectId).count()
        ))
    );
}

export async function deleteProject(projectId) {
    const database = initDB();
    await database.transaction("rw", database.progetti, database.uscite, database.budget, database.ricorrenze, async () => {
        // Keep legacy project budgets distinct from general budgets after detaching them.
        const budgets = await database.budget.filter(item => item.projectId === projectId &&
            !item.serieBudgetId && ["mensile", "annuale"].includes(item.periodo)
        ).toArray();
        const tracked = new Set();
        for (const budget of budgets.sort((a, b) => b.data.localeCompare(a.data))) {
            if (tracked.has(budget.budgetId)) continue;
            await database.budget.update(budget.budgetId, { serieBudgetId: budget.budgetId });
            for (const id of await archiviaBudgetPrecedenti(budget, budget.budgetId)) tracked.add(id);
        }
        for (const table of [database.uscite, database.budget, database.ricorrenze]) {
            await table.filter(item => item.projectId === projectId).modify({ projectId: null });
        }
        await database.progetti.delete(projectId);
    });
}

async function resolveProject(nome, projectId = crypto.randomUUID()) {
    nome = capitalizeFirstLetter(nome.trim());
    const chiave = nome.toLocaleLowerCase("it");
    const existing = await db.progetti.get({ chiave });
    if (existing) return existing.projectId;
    await db.progetti.add({ projectId, nome, chiave });
    return projectId;
}

export async function createBudget(budget) {
    return saveBudget(budget, false);
}

async function archiviaBudgetPrecedenti(budget, seriesId) {
    const ids = await db.budget.where("periodo").equals(budget.periodo).filter(item =>
        !item.serieBudgetId && item.budgetId !== budget.budgetId && item.data < budget.data &&
        item.categoria === budget.categoria && (item.projectId ?? null) === (budget.projectId ?? null)
    ).primaryKeys();
    await db.budget.where("budgetId").anyOf(ids).modify({ serieBudgetId: seriesId, ricorrenzaArchiviata: true });
    return ids;
}

async function saveBudget({ projectName, ...budget }, edit) {
    return initDB().transaction("rw", db.budget, db.progetti, async () => {
        if (projectName) budget.projectId = await resolveProject(projectName);
        else if (budget.projectId && !await db.progetti.get(budget.projectId)) budget.projectId = null;
        budget.categoria = capitalizeFirstLetter(budget.categoria);
        budget.usato = 0;
        if (edit) {
            const previous = await db.budget.get(budget.budgetId);
            if (!previous) throw new Error("Budget non trovato");
            budget.serieBudgetId = previous.serieBudgetId;
            budget.ricorrenzaArchiviata = previous.ricorrenzaArchiviata;
            if (!previous.serieBudgetId && ["mensile", "annuale"].includes(previous.periodo)) {
                budget.serieBudgetId = previous.budgetId;
                await archiviaBudgetPrecedenti(previous, budget.serieBudgetId);
            }
        }
        if (["mensile", "annuale"].includes(budget.periodo)) budget.serieBudgetId ??= budget.budgetId;
        await db.budget[edit ? "put" : "add"](budget);
    });
}


/**
 * READ - Legge budget filtrati per periodo
 * @param {string} periodo - Periodo (es: "mensile", "annuale")
 * @returns {Array} - Array di budget filtrati
 */
export async function getBudgetsByPeriodo(periodo) {
  try {
    initDB();
    return await db.budget
      .where('periodo')
      .equals(periodo)
      .toArray();
  } catch (error) {
    console.error('Errore durante la lettura dei budget per periodo:', error);
    return [];
  }
}


export async function getBudgets(startDate, endDate, categoria, periodo) {
    try {
        initDB();

        let query = db.budget.toCollection();

        if (startDate && endDate) {
          query = db.budget
            .where('data')
            .between(startDate, endDate, true, true);
        }

        if (categoria) {
          query = query.filter(b => b.categoria === categoria);
        }

        if (periodo) {
          query = query.filter(b => b.periodo === periodo);
        }

        return await query.toArray();
    } catch (error) {
        console.error('Errore durante la lettura dei budget:', error);
        return [];
    }
}


export async function updateBudget(budget) {
    return saveBudget(budget, true);
}


/**
 * DELETE - Elimina un budget
 * @param {string} budgetId - ID del budget da eliminare
 * @returns {Object} - {success: boolean}
 */
export async function deleteBudget(budgetId) {
  try {
    initDB();

    const budget = await db.budget.get(budgetId);
    if (!budget) {
      showErrorToast('Budget non trovato', "error");
      return { success: false, error: 'Budget non trovato' };
    }

    await db.budget.delete(budgetId);
    showToast('Budget eliminato con successo', "success");

    return { success: true };
  } catch (error) {
    console.error('Errore durante l\'eliminazione del budget:', error);
    showErrorToast('Errore durante l\'eliminazione del budget', "error");
    return { success: false, error };
  }
}

