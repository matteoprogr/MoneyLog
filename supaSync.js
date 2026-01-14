import { isValid, showToast, getSupaClient, checkAuth, getUser } from './main.js'

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
export async function insertTrs(trs, supaTable, userId){
    try{

        const dataToInsert = {
            categoria: trs.categoria,
            data: trs.data,
            dataInserimento: trs.dataInserimento,
            importo: trs.importo,
            descrizione: trs.descrizione,
            user: userId
        };
            console.log('Dati da inserire:', dataToInsert);
            console.log('userId type:', typeof userId);
            console.log('userId value:', userId);



        const { data, error } =
        await supabaseClient
            .from(supaTable)
            .insert({
                categoria: trs.categoria,
                data: trs.data,
                dataInserimento: trs.dataInserimento,
                importo: trs.importo,
                descrizione: trs.descrizione,
                user: userId
            });
        if(error) {
            console.log("Errore nel salvataggio", error);
            console.log("Dati che hanno causato l'errore:", dataToInsert);
        }
    }catch(error){
        console.error(error);
    }

}


// Metodo per recupero dell'id dell'user
// Se variabile curretuser non valorizzata, l'id viene recuparato da supabase
// In caso di errore viene eseguito log dell'errore
//export async function getUserId(){
//    try{
//        initSupabaseClient();
//        const user = await checkAuth();
//        if(isValid(currentUser)) return currentUser.id;
//        //supabaseClient.auth.getSession();
//        const { data: { user } } = await supabaseClient.auth.getUser();
//        if(isValid(user)) {
//            return user.id;
//        }
//        else{
//            throw new Error("Utente non autenticato");
//        }
//    }catch(error){
//        console.log("Errore durante recupero user", error);
//        throw error;
//    }
//}

export async function syncDati(){

}