import { isValid, showToast, showErrorToast, getSupaClient, checkAuth, getUser } from './main.js'
import { queryTrns, saveTrsLocal, updateTrsLocal, getDeleted, deleteCheckedDeleted, getTrsByDataIns, saveCategoria, switchRichieste, getCategorie, deleteSpese, trsObject } from './queryDexie.js'

// variabile globale client supabase
let supabaseClient = null;


async function initSupabaseClient(){
supabaseClient = await getSupaClient();
}

document.addEventListener("DOMContentLoaded", () => {
initSupabaseClient();
})


// Metodo per inserimento Spese in supabase
// Utilizzato id user presente in supabase nel salvattaggio della uscita
// In caso di errore viene eseguito il log dell'errore e notificato all'utente tramite toast
export async function insertTrs(trsOb, supaTable){
    try{
        const { data, error } =
        await supabaseClient
            .from(supaTable)
            .insert(trsOb);
        if(error) {
            console.log("Errore nel salvataggio", error);
        }
        if(data){

        }
    }catch(error){
        console.error(error);
    }

}

export async function updateTrs(trsOb, supaTable){
    try{
        const { data, error } =
        await supabaseClient
            .from(supaTable)
            .update(trsOb)
            .eq('dataInserimento', trs.dataInserimento);
        if(error) {
            console.log("Errore nel salvataggio", error);
        }
    }catch(error){
        console.error(error);
    }
}


export async function deleteTrs(dataInserimento, supaTable){
    try{
        const { error } = await supabaseClient
          .from(supaTable)
          .update({ deleted: true })
          .eq('dataInserimento', dataInserimento);

        if (error) {
          console.error('Errore aggiornamento deleted', error);
        }

    }catch(error){
        console.error(error);
    }
}

export async function getTrs(trs, supaTable){
    try{
        const { data, error } =
        await supabaseClient
            .from(supaTable)
            .select()
        if(error) {
            console.log("Errore nel salvataggio", error);
        }
    }catch(error){
        console.error(error);
    }
}

/*
| Caso                              | Azione                     |
| --------------------------------- | -------------------------- |
| Esiste solo in IndexedDB          | ➜ INSERT in Supabase       |
| Esiste solo in Supabase           | ➜ INSERT in IndexedDB      |
| Esiste in entrambi                | ➜ confronta `dataModifica` |
| `dataModifica` Indexed > Supabase | ➜ UPDATE Supabase          |
| `dataModifica` Supabase > Indexed | ➜ UPDATE IndexedDB         |
| Uguali                            | ➜ niente                   |
*/

export async function syncDati() {
    const overlaySpinner = document.getElementById('spinnerOverlay');
    try{
        overlaySpinner.style.display = 'flex';

        // Elimina in supabase le transazioni eliminate in locale
        await checkDeleted("entrate");
        await checkDeleted("uscite");
        await deleteCheckedDeleted();

        // ENTRATE
        await syncCollection({
        tableName: 'entrate',
        collectionName: 'entrate',
        bol: true
        })

        // USCITE
        await syncCollection({
        tableName: 'uscite',
        collectionName: 'spese',
        bol: false
        })

        showToast("Sincronizzazione completata ✅","succes");
    }catch(err){
        showErrorToast("Errore durante la sincronizzazione dei dati","error");
        console.log()"Errore durante la sincronizzazione dei dati", err);
    }finally{
        overlaySpinner.style.display = 'none';
    }
}


async function syncCollection({ tableName, collectionName, bol }) {

  // Recupero dati
  const localRecords = await queryTrns({}, bol);
  const { data: remoteRecords, error } = await supabaseClient
    .from(tableName)
    .select('*')

  if (error) throw error

    const normalizedLocal = localRecords.map(r => ({
        dataInserimento: normalizeTimestamp(r.dataInserimento),
        dataModifica: normalizeTimestamp(r.dataModifica),
        importo: r.importo,
        categoria: r.categoria,
        descrizione: r.descrizione,
        data: r.data
    }));

    const normalizedRemote = remoteRecords.map(r => ({
        dataInserimento: normalizeTimestamp(r.dataInserimento),
        dataModifica: normalizeTimestamp(r.dataModifica),
        importo: r.importo,
        categoria: r.categoria,
        descrizione: r.descrizione,
        data: r.data,
        deleted: r.deleted
    }));

  const localMap = new Map(
    normalizedLocal.map(r => [r.dataInserimento, r])
  )

  const remoteMap = new Map(
    normalizedRemote.map(r => [r.dataInserimento, r])
  )

  // Locale → Remoto
  const criteri = [];
  for (const [key, local] of localMap) {
    const remote = remoteMap.get(key);
    if(remote.deleted) {
        criteri.push(remote.dataInserimento);
        continue;
    }

    if (!remote) {
      await supabaseClient.from(tableName).insert(local);
    }
    else if (effectiveDate(local) > effectiveDate(remote)) {
      await supabaseClient
        .from(tableName)
        .update(local)
        .eq('dataInserimento', key)
    }
  }
  if(criteri.length > 0){
    const tab = collectionName === "spese" ? false : true;
    await deleteSpese(criteri, tab);
  }


  //  Remoto → Locale
  for (const [key, remote] of remoteMap) {
    if(remote.deleted) continue;
    const local = localMap.get(key);

    if (!local) {
      const trsOb = await trsObject(remote, collectionName);
      await saveTrsLocal(trsOb, collectionName);
      await saveCategoria(trsOb.categoria);
    }
    else if (effectiveDate(remote) > effectiveDate(local)) {
       const localTrs = await getTrsByDataIns(collectionName, key);
       const remoteId = {...remote, id: localTrs.id };
       const trsOb = await trsObject(remoteId, collectionName);
       await updateTrsLocal(trsOb, collectionName);
       const localCat = localTrs.categoria.trim();
       const remoteCat = remoteId.categoria.trim();
       if(localCat !== remoteCat) await switchRichieste(localCat, remoteCat);
    }
  }
}


async function checkDeleted(tableName){
    try{
        const dels = await getDeleted();
        for(const del of  dels){
            await deleteTrs(del.dataInserimento, tableName);
        }
    }catch(error){
        console.log(error);
    }
}

function normalizeTimestamp(ts) {
  if (!ts) return null;
  return new Date(ts).toISOString();
}

function effectiveDate(r) {
  return Date.parse(r.dataModifica ?? r.dataInserimento);
}