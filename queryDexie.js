import Dexie from './libs/dexie.mjs';

import { isValid, getUser, showErrorToast, showToast } from './main.js';
import { insertTrs, deleteTrs, updateTrs } from './supaSync.js';


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
    });

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
          ricorrenteId: ricorrenteId
        };

        return trsOb;
    }catch(err){
        console.log("Errore durante mapping transazione", err);
    }
}

export async function removeId(trsOb){
    delete trsOb.id;
    return trsOb
}

export async function saveRicorrenza(trsOb){
    initDB();
    const ricOb = {
      descrizione: trsOb.descrizione,
      importo: trsOb.importo,
      categoria: trsOb.categoria,
      data: trsOb.data,
      ricorrenteId: trsOb.ricorrenteId
    };

    await db.ricorrenze.add(ricOb);
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

            const currentDate = new Date(trs.data);

            for(let date = currentDate; date < today;  date = addMonths(date, periodo)){
                const dataObject = date.toISOString().split('T')[0];
                const criteri = {
                  dataInizio: dataObject,
                  dataFine: dataObject,
                  importoMin: trs.importo,
                  importoMax: trs.importo,
                  categoria: trs.categoria
                };
                const exists = await queryTrns(criteri, false);
                if(exists.length > 0) continue;
                const tableName = trs.importo > 0 ? "entrate" : "uscite";
                const ricTrs = { ...trs, data: dataObject };
                const trsOb = await trsObject(ricTrs, tableName);
                await saveTrsLocal(trsOb, tableName);
                const user = await getUser();
                if(isValid(user)) await insertTrs(trsOb, tableName);
            }
        }
    }catch(err){
        console.log("Errore nel salvataggio transazione ricorrente", err);
    }

}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}


/////////////////   SALVATAGGIO TRANSAZIONI   ///////////////////////////
export async function saveTrsLocal(trsOb, collectionName) {
  try {
    initDB();
    const collection = db[collectionName];
    await sleep(1);
    const id = await collection.add(trsOb);

    return { success: true, id };
  } catch (error) {
      if (error.name === 'ConstraintError') {
        console.warn('dataInserimento già esistente');
      } else {
        throw error;
      }
    return { success: false, error };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}



export async function getDeleted(){
    initDB();
    return await db.deletedTrs.toArray();
}

export async function deleteCheckedDeleted(){
    initDB();
    return await db.deletedTrs.clear();
}


async function setDescrizione(descrizione, categoria){
     if(descrizione === ""){
        return categoria;
     }
     return descrizione;
}



/////////// SALVATAGGIO CATEGORIE //////////////////////

async function initSaveCategoria(categoria){
    await db.categorie.add({ categoria: categoria, richieste: 0 });
}

export async function saveCategoria(categoria) {
  const categoriaLower = categoria.toLowerCase().trim();
  const categoriaCapitalized = capitalizeFirstLetter(categoriaLower);
  try {

    const cat = await db.categorie.get(categoriaCapitalized);
    if(!isValid(cat)){
    await db.categorie.add({
        categoria: categoriaCapitalized,
        richieste: 1
         });
    }else{
        updateRichieste(null, "more", cat);
    }

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

    const id = await collection.put(trsOb);
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
    if (criteri.importoMin != null && item.importo < criteri.importoMin) return false;
    if (criteri.importoMax != null && item.importo > criteri.importoMax) return false;
    if (criteri.dataInizio && item.data < criteri.dataInizio) return false;
    if (criteri.dataFine && item.data > criteri.dataFine) return false;
    return true;
  });

  return col.toArray();
}


export async function getTrsByDataIns(collectionName, dataInserimento) {
  const collection = db[collectionName];
  if (!collection) throw new Error(`Collection ${collectionName} non trovata`);

  const transaction = await collection
    .where('dataInserimento')
    .equals(dataInserimento)
    .first();

  return transaction || null;
}


////////////////  ELIMINAZIONE TRANSAZIONI ////////////////////////////////
export async function deleteSpese(criteri = {}, tabActive) {

    let collezione;
    if(!tabActive){
        collezione = db.uscite.toCollection();

    }else if(tabActive){
        collezione = db.entrate.toCollection();
    }

    if (Array.isArray(criteri) && criteri.length > 0) {
        await  collezione.filter(trns => criteri.includes(trns.dataInserimento)).delete();
    }
}

export async function saveDeletedTrs(criteri){
    await db.deletedTrs.bulkAdd( criteri.map(dataInserimento => ({ dataInserimento })) );
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

export async function replaceCat(oldCat, newCat) {
  if (oldCat === newCat) return;
  const oldArr = await getCategorieEsatta(oldCat);
  if (!oldArr || oldArr.length === 0) return;
  const record = oldArr[0];
  await db.categorie.delete(oldCat);
  if(!await db.categorie.get(newCat)) await db.categorie.put({...record,categoria: newCat });
  const newArr = await getCategorieEsatta(newCat);
  const recordNew = newArr[0];
  await updateCatInTrns(record, recordNew);
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
            spesa.categoria = newRecord;
            await updateTrsLocal(trsOb,"uscite");
            if(await db.categorie.get(oldCat)) await updateRichieste(null, "less", oldCat);
            await updateRichieste(null, "more", newRecord);
        }
    }
    if(catEntrate.length !== 0){
        for(const entrata of catEntrate){
            const trsOb = await trsObject(entrata, "entrate");
            entrata.categoria = newRecord;
            await updateTrsLocal(trsOb, "entrate");
            if(await db.categorie.get(oldCat)) await updateRichieste(null, "less", oldCat);
            await updateRichieste(null, "more", newRecord);
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
      const spese = await queryTrns({},false);
      const entrate = await queryTrns({},true);

        const result = {
            id: [],
            dataValuta: [],
            dataInserimento: [],
            dataModifica: [],
            categoria: [],
            descrizione: [],
            valore: [],
            bilancio: 0
        };

        spese.forEach(item => {
            result.id.push(item.id);
            result.dataValuta.push(item.data);
            result.dataInserimento.push(item.dataInserimento);
            result.dataModifica.push(item.dataModifica);
            result.categoria.push(item.categoria);
            result.descrizione.push(item.descrizione || "");
            result.valore.push(item.importo);
            result.bilancio += item.importo;
        });

        entrate.forEach(item => {
            result.id.push(item.id);
            result.dataValuta.push(item.data);
            result.dataInserimento.push(item.dataInserimento);
            result.dataModifica.push(item.dataModifica);
            result.categoria.push(item.categoria);
            result.descrizione.push(item.descrizione || "");
            result.valore.push(item.importo);
            result.bilancio += item.importo;
        });

        // Creare un blob e farlo scaricare
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
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

fileInput.addEventListener('change', () => {
  btnImport.disabled = fileInput.files.length === 0;
});

btnImport.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (file) {
    importaDatabase(file);
    fileInput.value = "";
  }
});

///////////////////////////  IMPORT  ////////////////////////
async function importaDatabase(file) {
    const overlaySpinner = document.getElementById('spinnerOverlay');
    overlaySpinner.style.display = 'flex';

    try {
        const fileContent = await file.text();
        const result = JSON.parse(fileContent);
        const transazioni = parseDataTabella(result);

        for (const trs of transazioni) {
            let trsOb;
            if (trs.importo < 0) {
                trsOb = await trsObject(trs, "uscite");
                await saveTrsLocal(trsOb, "uscite");
            } else if (trs.importo > 0) {
                trsOb = await trsObject(trs, "entrate");
                await saveTrsLocal(trsOb, "entrate");
            }
            await saveCategoria(trsOb.categoria);
        }

        showToast("Importazione completata!", "success");

    } catch (error) {
        console.error(error);
        showErrorToast("Errore durante l'importazione", "error");

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
            importo: dataTabella.valore[i]
        });
    }
    return transazioni;
}


