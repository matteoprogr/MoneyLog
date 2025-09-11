import { saveSpesa } from './queryDexie.js';
import { updateSpesa } from './queryDexie.js';
import { saveEntrata } from './queryDexie.js';
import { updateEntrata } from './queryDexie.js';
import { createCriteri } from './main.js';
import { isValid } from './main.js';
import { showErrorToast } from './main.js';
import { getCategorie } from './queryDexie.js';
import { getCategorieArray } from './queryDexie.js';
import { updateCategoria } from './queryDexie.js';
import { categorieCreateComponent } from './main.js';

export function creaSpesaComponent(trsn,tabActive) {

         let cardClass = "";
         let bodyClass = "";
         let btnClass = "";
         let impClass = "";
        if(!tabActive){
            cardClass = "spesaColor";
            bodyClass = "spesaBodyColor";
            btnClass = "btnSpesaColor";
            impClass = "impColorUscita";
        }else if(tabActive){
            cardClass = "entrataColor";
            bodyClass = "entrataBodyColor";
            btnClass = "btnEntrataColor";
            impClass = "impColorEntrata";
        }

        const container = document.createElement("div");

       container.classList.add("spesa");
       container.classList.add(cardClass);
       container.setAttribute("datains", trsn.dataInserimento);
       container.setAttribute("id", trsn.id);

       container.innerHTML = `
         <div class="spesa-header">
           <small class="data">${formatDate(trsn.data)}</small>
           <button class="spesa-btn ${btnClass}" type="button">✏️</button>
         </div>
         <div class="spesa-body ${bodyClass}">
           <span class="descrizione">${trsn.descrizione}</span>
           <span class="importo ${impClass}">${trsn.importo.toFixed(2)} €</span>
         </div>
         <div class="spesa-footer">
           <small class="categoria">${trsn.categoria}</small>
         </div>
       `;

         container.addEventListener("click", (e) => {
           e.stopPropagation();
           container.classList.toggle("selected");
         });

         const editBtn = container.querySelector('.spesa-btn');
         editBtn.addEventListener("click", (e) => {
             e.stopPropagation();
             overlayEdit(trsn);
         });

       return container;
     }


function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("it-IT");
}


export function creaComponentTotale(trsni, tabActive) {
         let cardClass = "";
         let bodyClass = "";
         let impClass = "";
        if(!tabActive){
            cardClass = "spesaTotColor";
            impClass = "impColorUscita";
        }else if(tabActive){
            cardClass = "entrataTotColor";
            impClass = "impColorEntrata";
        }

    let totale = 0;
    trsni.forEach(trns => {
        totale += parseFloat(trns.importo);
    });
    const container = document.createElement("div");
       container.classList.add("spesa-totale");
       container.classList.add(cardClass);
       container.innerHTML = `
         <div>
           <span class="importo-totale ${impClass}">${totale.toFixed(2)} €</span>
         </div>
       `;

           return container;
}

export function nessunaElementoComponent(tipo) {
        const container = document.createElement("div");
        container.classList.add("nessuna-spesa");
           container.innerHTML = `
             <div>
                <span class="rowExplain">😢   Nessuna ${tipo} disponibile</span>
                <span class="rowExplain">➕   Crea una nuova ${tipo}</span>
                <span class="rowExplain">🔍   Ricerca ${tipo}</span>
                <span class="rowExplain">🗑️   Elimina ${tipo} selezionata</span>
                <span class="rowExplain">✏️   Modifica ${tipo} </span>
             </div>
           `;

               return container;
}

export function nessunaCategoriaComponent(tipo) {
        const container = document.createElement("div");
        container.classList.add("nessuna-spesa");
           container.innerHTML = `
             <div>
                <span class="rowExplain">😢   Nessuna ${tipo} disponibile</span>
                <span class="rowExplain">🗑️   Elimina ${tipo} selezionata</span>
                <span class="rowExplain">✏️   Modifica ${tipo} </span>
             </div>
           `;

               return container;
}


export function categoriaComponent(categoria) {
    const container = document.createElement("div");
    container.classList.add("cat");

    if(categoria === "Altro"){
        container.innerHTML = `
          <div class="cat-header">
            <span class="cat-name">${categoria}</span>
          </div>
        `;
    }else {

    container.innerHTML = `
      <div class="cat-header">
        <span class="cat-name">${categoria}</span>
        <button class="catEdit-btn" type="button">✏️</button>
      </div>
    `;

    container.addEventListener("click", () => {
        container.classList.toggle("selected");
    });

    const editBtn = container.querySelector('.catEdit-btn');
    const span = container.querySelector('.cat-name');

    editBtn.addEventListener("click", async (e) => {
        e.stopPropagation();

        const input = document.createElement("input");
        input.type = "text";
        const oldValue = span.textContent.trim();
        input.value = oldValue
        input.classList.add("cat-input");

        span.replaceWith(input);
        input.focus();

        const confirm = async () => {
            const newValue = input.value.trim() || categoria;
            span.textContent = newValue;
            try{ input.replaceWith(span); }catch{}
            if (oldValue !== newValue) {
                await updateCategoria(oldValue, newValue,false);
            }
            categorieCreateComponent();

        };

        const notConfirm = async () => {
            span.textContent = oldValue;
            try{ input.replaceWith(span); }catch{}
        };

        input.addEventListener("blur", notConfirm, { once: true });
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                confirm();
            }
        });
      });
    }

    return container;
}



export async function overlayAddSpesa() {
const openBtn = document.getElementById('addSpesaBtn');
const overlay = document.getElementById('spesaFormOverlay');
const form = document.getElementById('spesaForm');
const categoriaInput = document.getElementById('categoria');
const catRow = document.getElementById('categorieCardsAdd');
const closeBtn = document.getElementById('closeFormBtn');
const importo = document.getElementById('importo');
const descrizione = document.getElementById('descrizione');
const data = document.getElementById('data');


openBtn.addEventListener('click', async (e) => {
        if (overlay.classList.contains('showOverlay')) {
            overlay.classList.remove('showOverlay');
            form.reset();
        } else {
            catRow.innerHTML = "";
            overlay.classList.toggle("showOverlay");
            const categorie = await getCategorie();
            categorie.forEach(cat => {
            const card = catOverlay(cat.categoria, "addSpesa", null);
            catRow.appendChild(card);
            data.value = new Date().toISOString().split("T")[0];
            });
        }
         document.addEventListener('click', (event) => {
            if (!overlay.classList.contains('showOverlay')) return;
            if (event.target.closest('#spesaFormOverlay') || event.target.closest('#addSpesaBtn')) return;
              overlay.classList.remove('showOverlay');
              form.reset();
          });
    });
    closeBtn.addEventListener('click',async () =>{
        overlay.classList.remove('showOverlay');
        form.reset();
    });

    categoriaInput.addEventListener("input",async (event) =>{
      const categorie = await getCategorie(categoriaInput.value);
      const fragment = document.createDocumentFragment();
      categorie.forEach((cat, i) => {
        const card = catOverlay(cat.categoria, "addSpesa", null);
        card.classList.add("cardTr");
        card.style.animationDelay = `${i * 0.1}s`;
        fragment.appendChild(card);
      });
      catRow.replaceChildren(fragment);
    });

    form.addEventListener('submit', async (e) => {
      const tab = recuperaTab();
      e.preventDefault();
      const transazione = {
        categoria: categoriaInput.value.trim(),
        data: data.value,
        importo: parseFloat(importo.value),
        descrizione: descrizione.value
      };


      try {
        if(!tab){
        await saveSpesa(transazione);
        }else if(tab){
        await saveEntrata(transazione);
        }

        overlay.classList.remove('showOverlay');
        createCriteri();
        form.reset();
      } catch (err) {
        showErrorToast("Errore durante il salvataggio", "error");
      }
    });
}

export function recuperaTab(){
    const tabs = document.querySelectorAll('.tab.active');
     let tab;
    if(tabs.length !== 0) {
        tab = tabs[0].innerText;
    }else{
        return;
    }

    if( tab === "Uscite"){
        return false;
    }else if(tab === "Entrate"){
        return true;
    }else{
        showErrorToast("Errore nell'esecuzione della transazione","error");
        return;
    }
}

export async function overlayRicerca() {
    const openBtn = document.getElementById('getSpesaBtn');
    const overlay = document.getElementById('overlayRicerca');
    const catRow = document.getElementById('categorieCardsEntrata');
    const categoriaInput = document.getElementById('ricerca-categorie-over');
    let selectedCards = document.querySelectorAll(".card.selected");

    openBtn.addEventListener('click', async (e) => {
        if (overlay.classList.contains('showOverlay')) {
            overlay.classList.remove('showOverlay');
        } else {
            selectedCards = document.querySelectorAll(".card.selected");
            catRow.innerHTML = "";
            overlay.classList.toggle("showOverlay");
            const categorie = await getCategorie();
            categorie.forEach(cat => {
            const card = catOverlay(cat.categoria, "getSpese",selectedCards);
            catRow.appendChild(card);
            });
        }
         document.addEventListener('click', (event) => {
            if (!overlay.classList.contains('showOverlay')) return;
            if (event.target.closest('#overlayRicerca') || event.target.closest('#getSpesaBtn')) return;
              overlay.classList.remove('showOverlay');
          });
    });
     categoriaInput.addEventListener("input",async (event) =>{
          selectedCards = document.querySelectorAll(".card.selected");
          const criteri = [];
          if(isValid(categoriaInput.value)){
              criteri.push(categoriaInput.value);
              for(const catSelected of selectedCards){
                criteri.push(catSelected.innerText.trim());
              }
          }

          const categorie = await getCategorieArray(criteri);
          const fragment = document.createDocumentFragment();
          categorie.forEach((cat, i) => {
            const card = catOverlay(cat.categoria, "getSpese", selectedCards);
            card.style.animationDelay = `${i * 0.1}s`;
            fragment.appendChild(card);
          });
          catRow.replaceChildren(fragment);
        });
  }

function catOverlay(categoria, sezione, selectedCards) {
        const container = document.createElement("div");
        container.classList.add("card");
        if(selectedCards != null){
            for(const card of selectedCards){
                if(card.innerText.trim() === categoria){
                    container.classList.add("selected");
                    }
            }
        }

           container.innerHTML = `
             <div>
               <span> ${categoria} </span>
             </div>
           `;

            container.addEventListener("click", () => {
              const categoriaElement = container.querySelector("span");
              container.classList.toggle("selected");
              if(sezione === "getSpese"){
                    createCriteri();
              }else if(sezione === "addSpesa"){
                    const categoria = document.getElementById('categoria');
                    container.classList.toggle("selected");
                    categoria.value = categoriaElement.innerText;
              }else if(sezione === "editSpesa"){
                    const categoria = document.getElementById('editCategoria');
                    container.classList.toggle("selected");
                    categoria.value = categoriaElement.innerText;
              }

            });

        return container;
}

export async function overlayEdit(spesa) {
    const overlay = document.getElementById('editSpesaFormOverlay');
    const catRow = document.getElementById('categorieCardsEdit');
    const editBtn = document.getElementById('editBtn');
    const closeBtn = document.getElementById('closeEditFormBtn');
    const dataInserimento = spesa.dataInserimento;
    const form = document.getElementById('editForm');

    document.getElementById('editSpesaId').value = spesa.id;
    const categoriaElement = document.getElementById('editCategoria');
    categoriaElement.value = spesa.categoria.trim();
    document.getElementById('editData').value = spesa.data;
    document.getElementById('editImporto').value = Math.abs(spesa.importo);
    document.getElementById('editDescrizione').value = spesa.descrizione;

    closeBtn.addEventListener('click',async () =>{
        overlay.classList.remove('showOverlay');
    });

    catRow.innerHTML = "";
    overlay.classList.add("showOverlay");
    const categorie = await getCategorie();
    categorie.forEach(cat => {
    const card = catOverlay(cat.categoria, "editSpesa", null);
    catRow.appendChild(card);
    });
    document.addEventListener('click', (event) => {
        if (!overlay.classList.contains('showOverlay')) return;
        if (event.target.closest('#editSpesaFormOverlay')) return;
          overlay.classList.remove('showOverlay');
      });

        categoriaElement.addEventListener("input", async (event) => {
          const categorie = await getCategorie(categoriaElement.value);
          const fragment = document.createDocumentFragment();
          categorie.forEach((cat, i) => {
            const card = catOverlay(cat.categoria, "editSpesa", null);
            card.classList.add("cardTr");
            card.style.animationDelay = `${i * 0.1}s`;
            fragment.appendChild(card);
          });
          catRow.replaceChildren(fragment);
        });

    form.addEventListener('submit', async (e) => {
    const tab = recuperaTab();
    e.preventDefault();

    const transazione = {
        id: parseInt(document.getElementById('editSpesaId').value),
        categoria: categoriaElement.value,
        dataInserimento: dataInserimento,
        data: document.getElementById('editData').value,
        importo: parseFloat(document.getElementById('editImporto').value),
        descrizione: document.getElementById('editDescrizione').value
     };
       try {
        if(!tab){
        await updateSpesa(transazione,true);
        }else if(tab){
        await updateEntrata(transazione,true);
        }
         overlay.classList.remove('showOverlay');
         createCriteri();
       } catch (err) {
         showErrorToast("Errore durante la modifica:", "error");
       }
    });
}