  import { Dexie } from 'https://unpkg.com/dexie/dist/modern/dexie.mjs';
  import { fetchDownload } from './main.js';
  import { showToast } from './main.js';
  import { showErrorToast } from './main.js';
  import { isValid } from './main.js';


let db;
initDB();


/////// INIZIALIZZAZIONE DB ///////////////////
export function initDB() {
  if (!db) {
    db = new Dexie('MoneyLogDB');
    db.version(1).stores({
      spese: '++id, *categoria, importo, data, [importo+data], [data+importo]',
      categorie: '&categoria',
      entrate: '++id, *categoria, importo, data, [importo+data], [data+importo]',
      defaultCat: 'inizializato'
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
            await saveCategoria(cat);
        }
    }

    await db.defaultCat.put({ inizializato: "init", done: true });
}

/////////////////   SALVATAGGIO TRANSAZIONI   ///////////////////////////
export async function saveSpesa(spesa, excel) {
  try {
    initDB();
    const fomattedISO = new Date(spesa.data).toISOString().split('T')[0];
    const categoria = capitalizeFirstLetter(spesa.categoria);
    const data = {
      descrizione: await setDescrizione(spesa.descrizione,categoria),
      importo: -Math.abs(spesa.importo),
      categoria: categoria,
      dataInserimento: new Date().toISOString(),
      data: fomattedISO
    };

    await saveCategoria(spesa.categoria);
    const id = await db.spese.add(data);
    if(!excel){
        showToast("Uscita aggiunta con successo", "success");
    }

    return { success: true, id };
  } catch (error) {
    console.error("Errore nel salvataggio uscita:", error);
    return { success: false, error };
  }
}


export async function saveEntrata(entrata) {
  try {

    initDB();
    const fomattedISO = new Date(entrata.data).toISOString().split('T')[0];
    const categoria = capitalizeFirstLetter(entrata.categoria);

    const data = {
      descrizione: await setDescrizione(entrata.descrizione,categoria),
      importo: entrata.importo,
      categoria: categoria,
      dataInserimento: new Date().toISOString(),
      data: fomattedISO
    };

    await saveCategoria(entrata.categoria);
    const id = await db.entrate.add(data);
    showToast("entrata aggiunta con successo", "success");

    return { success: true, id };
  } catch (error) {
    console.error("Errore nel salvataggio entrata:", error);
    return { success: false, error };
  }
}

async function setDescrizione(descrizione, categoria){
     if(descrizione === ""){
        return categoria;
     }
     return descrizione;
}



/////////// SALVATAGGIO CATEGORIE //////////////////////
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
        updateCategoria(categoria, null, true);
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
export async function updateSpesa( spesa, isNew) {
  try {
    initDB();

    if (!spesa.id) {
      throw new Error("ID uscita mancante per la sostituzione");
    }

    const fomattedISO = new Date(spesa.data).toISOString().split('T')[0];
    const categoria = capitalizeFirstLetter(spesa.categoria);
    const data = {
      id: spesa.id,
      descrizione: await setDescrizione(spesa.descrizione,categoria),
      dataInserimento: isValid(spesa.dataInserimento) ? spesa.dataInserimento : fomattedISO,
      importo: -Math.abs(spesa.importo),
      categoria: categoria,
      data: fomattedISO,
      dataModifica: new Date().toISOString()
    };
    if(isNew){
        await saveCategoria(spesa.categoria);
    }

    const id = await db.spese.put(data);

    showToast("Uscita sostituita con successo", "success");
    return { success: true, id };

  } catch (error) {
    console.error("Errore nella sostituzione uscita:", error);
    showToast("Errore durante la sostituzione della uscita", "error");
    return { success: false, error };
  }
}

export async function updateEntrata(entrata, isNew) {
  try {
    initDB();

    if (!entrata.id) {
      throw new Error("ID entrata mancante per la sostituzione");
    }

    const fomattedISO = new Date(entrata.data).toISOString().split('T')[0];
    const categoria = capitalizeFirstLetter(entrata.categoria);
    const data = {
      id: entrata.id,
      descrizione: await setDescrizione(entrata.descrizione,categoria),
      importo: entrata.importo,
      categoria: categoria,
      data: fomattedISO,
      dataInserimento: isValid(entrata.dataInserimento) !== null ? entrata.dataInserimento : fomattedISO,
      dataModifica: new Date().toISOString()
    };

    if(isNew){
        await saveCategoria(entrata.categoria);
    }

    const id = await db.entrate.put(data);
    showToast("Entrata sostituita con successo", "success");
    return { success: true, id };

  } catch (error) {
    showToast("Errore durante la sostituzione della entrata", "error");
    return { success: false, error };
  }
}



/////////////////  RICERCA ///////////////////////
export async function queryTrns(criteri = {}, tabActive) {
  initDB();
  const collezione = tabActive ? db.entrate : db.spese;

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


////////////////    ELIMINAZIONE TRANSAZIONI ////////////////////////////////
export async function deleteSpese(criteri = {}, tabActive) {

    let collezione;
    if(!tabActive){
        collezione = db.spese.toCollection();
    }else if(tabActive){
        collezione = db.entrate.toCollection();
    }

    if (Array.isArray(criteri) && criteri.length > 0) {
        await  collezione.filter(trns => criteri.includes(trns.dataInserimento)).delete();
        return;
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
        updateCatInTrns(categoria, "Altro");
    }
    return;
}

//////////// GET CATEGORIE /////////////////
export async function getCategorie(criterio) {
    initDB();

    let categorie;
    if (!criterio || criterio.trim() === "") {
        categorie = await db.categorie.toArray();
    } else {
        categorie = await db.categorie
            .where("categoria")
            .startsWithIgnoreCase(criterio)
            .toArray();
    }

    return categorie.sort((a, b) => b.richieste - a.richieste);
}

export async function getCategorieArray(criteri) {
  initDB();

  let criteriArray = [];

  if (!criteri || (Array.isArray(criteri) && criteri.length === 0) || (typeof criteri === 'string' && criteri.trim() === '')) {
    return (await db.categorie.toArray()).sort((a, b) => b.richieste - a.richieste);
  }

  if (Array.isArray(criteri)) {
    criteriArray = criteri;
  } else {
    criteriArray = [criteri];
  }

  // Rimuovi stringhe vuote
  criteriArray = criteriArray.filter(c => typeof c === 'string' && c.trim() !== '');

  let categorie;

  if (criteriArray.length > 0) {
    // Query Indicizzata con Dexie
    categorie = await db.categorie
      .where('categoria')
      .startsWithAnyOfIgnoreCase(criteriArray)
      .toArray();
  } else {
    categorie = await db.categorie.toArray();
  }

  return categorie.sort((a, b) => b.richieste - a.richieste);
}


//////////// UPDATE CATEGORIE /////////////////
export async function updateCategoria(oldCat, newCat, richiesta) {
    try{
        const record = await db.categorie.get(oldCat);
        const recordNew = await db.categorie.get(newCat);
        newCat = capitalizeFirstLetter(newCat)
        if(richiesta === false){
            if (oldCat === newCat) return;
            if (!isValid(record)) return;
            await db.categorie.delete(oldCat);
            if (!isValid(recordNew)) await db.categorie.put({ ...record, categoria: newCat });
            updateCatInTrns(oldCat, newCat);
        }else if(richiesta === true){
            const count = record.richieste +1;
            await db.categorie.update(oldCat, { richieste: count });
        }
    }catch(err){
        showErrorToast("Errore durante l'update","error")
    }

}

//////////////   UPDATE CATEGORIE IN TRANSAZIONI ////////////////////////
async function updateCatInTrns(oldCat, newCat){
    const criteri = {categoria: [oldCat]}
    const catSpese = await queryTrns(criteri, false);
    const catEntrate = await queryTrns(criteri, true);
    if(catSpese.length !== 0){
        for(const spesa of catSpese){
            spesa.categoria = newCat;
            await updateSpesa(spesa,false);
        }
    }
    if(catEntrate.length !== 0){
        for(const entrata of catEntrate){
            entrata.categoria = newCat;
            await updateEntrata(entrata, false);
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



////////////////  EXPORT DATABASE ////////////////////////
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
          categoria: [],
          descrizione: [],
          valore: [],
          totale: 0
      };

  spese.forEach(item => {
          result.id.push(item.id);
          result.dataValuta.push(item.data);
          result.categoria.push(item.categoria);
          result.descrizione.push(item.descrizione || "");
          result.valore.push(item.importo);
      });

    entrate.forEach(item => {
            result.id.push(item.id);
            result.dataValuta.push(item.data);
            result.categoria.push(item.categoria);
            result.descrizione.push(item.descrizione || "");
            result.valore.push(item.importo);
        });

  fetchDownload(result);

  }catch (error) {
    console.error('Errore durante l\'esportazione dei dati:', error);
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

/////////////////////////  IMPORT  ////////////////////////////////////////
async function importaDatabase(file) {
        const overlaySpinner = document.getElementById('spinnerOverlay');
      try {
        overlaySpinner.style.display = 'flex';
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/excel/import", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          showErrorToast("Errore durante l'importazione", "error");
          throw new Error("Errore nel caricamento del file");
        }

        const result = await response.json();
        const transazioni = parseDataTabella(result);

        for (const trns of transazioni) {
            if(trns.importo < 0){
                await saveSpesa(trns);
            }else if(trns.importo > 0){
                await saveEntrata(trns);
            }
        }

        showToast("Importazione completata!", "success");
      } catch (error) {
        showErrorToast("Errore durante l'importazione", "error");
      }finally{
        overlaySpinner.style.display = 'none';
      }
}

 function parseDataTabella(dataTabella) {
      const transazioni = [];

      for (let i = 0; i < dataTabella.categoria.length; i++) {
        transazioni.push({
          id: dataTabella.id[i],
          data: dataTabella.dataValuta[i],
          categoria: dataTabella.categoria[i],
          descrizione: dataTabella.descrizione[i],
          importo: dataTabella.valore[i]
        });
      }

      return transazioni;
 }




