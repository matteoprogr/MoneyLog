import { isValid, showToast, getSupaClient, checkAuth, getUser } from './main.js'
import { queryTrns, saveLocalDb, getDeleted, deleteCheckedDeleted, getTrsByDataIns } from './queryDexie.js'

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
export async function insertTrs(trs, supaTable){
    try{
        const { data, error } =
        await supabaseClient
            .from(supaTable)
            .insert({
                categoria: trs.categoria,
                data: trs.data,
                dataInserimento: trs.dataInserimento,
                importo: trs.importo,
                descrizione: trs.descrizione
            });
        if(error) {
            console.log("Errore nel salvataggio", error);
        }
        if(data){

        }
    }catch(error){
        console.error(error);
    }

}

export async function updateTrs(trs, supaTable){
    try{
        const { data, error } =
        await supabaseClient
            .from(supaTable)
            .update({
                categoria: trs.categoria,
                data: trs.data,
                dataInserimento: trs.dataInserimento,
                dataModifica: trs.dataModifica,
                importo: trs.importo,
                descrizione: trs.descrizione
            }).eq('dataInserimento', trs.dataInserimento);
        if(error) {
            console.log("Errore nel salvataggio", error);
        }
    }catch(error){
        console.error(error);
    }
}


export async function deleteTrs(dataInserimento, supaTable){
    try{
        const { data, error } =
        await supabaseClient
            .from(supaTable)
            .delete()
            .eq('dataInserimento', dataInserimento);
        if(error) {
            console.log("Errore nel salvataggio", error);
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
}


async function syncCollection({ tableName, collectionName, bol }) {

  // Recupero dati
  const localRecords = await queryTrns({}, bol);
  const { data: remoteRecords, error } = await supabaseClient
    .from(tableName)
    .select('*')

  if (error) throw error

    // Normalizzazione locale
    const normalizedLocal = localRecords.map(r => ({
        dataInserimento: normalizeTimestamp(r.dataInserimento),
        dataModifica: normalizeTimestamp(r.dataModifica),
        importo: r.importo,
        categoria: r.categoria,
        descrizione: r.descrizione,
        data: r.data
    }));

    // Normalizzazione remoto
    const normalizedRemote = remoteRecords.map(r => ({
        dataInserimento: normalizeTimestamp(r.dataInserimento),
        dataModifica: normalizeTimestamp(r.dataModifica),
        importo: r.importo,
        categoria: r.categoria,
        descrizione: r.descrizione,
        data: r.data
    }));


  // Indicizzazione per dataInserimento
  const localMap = new Map(
    normalizedLocal.map(r => [r.dataInserimento, r])
  )

  const remoteMap = new Map(
    normalizedRemote.map(r => [r.dataInserimento, r])
  )

  // Locale → Remoto
  for (const [key, local] of localMap) {
    const remote = remoteMap.get(key);

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

  //  Remoto → Locale
  for (const [key, remote] of remoteMap) {
    const local = localMap.get(key);

    if (!local) {
      await saveLocalDb(remote, "add", collectionName);
    }
    else if (effectiveDate(remote) > effectiveDate(local)) {
       const localTrs = await getTrsByDataIns(collectionName, key);
       const remoteId = {...remote, id: localTrs.id };
       await saveLocalDb(remoteId, "put", collectionName);
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