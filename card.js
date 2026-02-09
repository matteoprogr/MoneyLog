import { updateTrsLocal, saveTrsLocal, saveCategoria, trsObject, removeId, saveRicorrenza, updateRicorrenza, deleteRicorrenza, updatePeriodo } from './queryDexie.js';
import { createCriteri, criteriBudget } from './main.js';
import { isValid } from './main.js';
import { showErrorToast, showToast } from './main.js';
import { getCategorie, switchRichieste, replaceCat, createBudget, updateBudget } from './queryDexie.js';
import { categorieCreateComponent, parseDateRange, convertDDMMYYYYtoDate } from './main.js';
import { getUser } from './main.js';
import { insertTrs, updateTrs } from './supaSync.js';

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
         <div class="spesa-card">

            <div class="spesa-content">
                 <div class="spesa-body ${bodyClass}">
                   <span class="descrizione">${trsn.descrizione}</span>
                   <span class="importo ${impClass}">${trsn.importo.toFixed(2)}</span>
                 </div>
                 <div class="spesa-header">
                   <small class="categoria">${trsn.categoria}</small>
                   <small class="data">${formatDate(trsn.data)}</small>
                 </div>
             </div>
         </div>
       `;

         container.addEventListener("click", (e) => {
           e.stopPropagation();
           container.classList.toggle("selected");
         });

        let pressTimer;

        container.addEventListener("touchstart", () => {
          pressTimer = setTimeout(() => {
            overlayEdit(trsn);
          }, 600);
        });

        container.addEventListener("touchend", () => {
          clearTimeout(pressTimer);
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
           <span class="importo-totale ${impClass}">${totale.toFixed(2)}</span>
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
                <span class="rowExplain">👆   Tieni premuto per modificare </span>
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
                <span class="rowExplain">👆   Tieni premuto per modificare</span>
             </div>
           `;

               return container;
}

export function nessunBudgetComponent(tipo) {
        const container = document.createElement("div");
        container.classList.add("nessuna-spesa");
           container.innerHTML = `
             <div>
                <span class="rowExplain">😢   Nessuna ${tipo} disponibile</span>
                <span class="rowExplain">➕   Crea un nuovo ${tipo}</span>
                <span class="rowExplain">🗑️   Elimina ${tipo} selezionato</span>
                <span class="rowExplain">👆   Tieni premuto per modificare </span>
             </div>
           `;

               return container;
}


export function categoriaComponent(categoria, richieste) {
    const container = document.createElement("div");
    container.classList.add("cat");
    let pressTimer;

    if(categoria === "Altro"){
        container.innerHTML = `
          <div class="cat-header">
            <span class="cat-name">${categoria}</span>
            <span class="countTrs">${richieste}</span>
          </div>
        `;
    }else {

    container.innerHTML = `
      <div class="cat-header">
        <span class="cat-name">${categoria}</span>
        <span class="countTrs">${richieste}</span>
      </div>
    `;

    const span = container.querySelector('.cat-name');
    container.addEventListener("touchstart", () => {
        pressTimer = setTimeout(() => {
            const input = document.createElement("input");
            input.type = "text";
            const oldValue = span.textContent.trim();
            input.value = oldValue
            input.maxLength = 25;
            input.classList.add("cat-input");

            span.replaceWith(input);
            input.focus();

            const confirm = async () => {
                const newValue = input.value.trim() || categoria;
                span.textContent = newValue;
                try{ input.replaceWith(span); }catch{}
                if (oldValue !== newValue) {
                    await replaceCat(oldValue, newValue);
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
        }, 600);
    });

    container.addEventListener("touchend", () => {
        clearTimeout(pressTimer);
    });

    container.addEventListener("click", () => {
        container.classList.toggle("selected");
    });
}

    return container;
}


function periodoBudget(slider, periodo, ric){
    let pSelected = null;
    if (slider.checked) {
        if(isValid(periodo)) pSelected = periodo;

        ric.innerHTML = "";
        const periodi = ["mensile", 'annuale'];
        periodi.forEach( p => {
            const card = budgetRic(p, pSelected);
            ric.appendChild(card);
        });
    }else{
        ric.innerHTML = "";
    }
}

function renderBudgetProgress(budget, cardElement) {
  const perc = budget.destinato > 0
    ? Math.min((budget.usato / budget.destinato) * 100, 100)
    : 0;

  const bar = cardElement.querySelector('.budget-progress-bar-fill');
  const percLabel = cardElement.querySelector('.budget-progress-perc');
  const label = cardElement.querySelector('.budget-progress-usato');

  bar.style.width = `${perc}%`;
  percLabel.textContent = `${Math.round(budget.destinato)}`;

  bar.classList.remove('ok', 'warning','serious-warning', 'danger');
  percLabel.classList.remove('ok', 'warning','serious-warning', 'danger');
  label.classList.remove('ok', 'warning','serious-warning', 'danger');

  let status = 'ok';
  if (perc >= 60 && perc < 80) status = 'warning';
  if (perc >= 80 && perc < 95) status = 'serious-warning';
  if (perc >= 95) status = 'danger';

  bar.classList.add(status);
  percLabel.classList.add(status);
  label.classList.add(status);
}


export function compBudget(budget){

    const usato = budget.usato;
    const destinato = budget.destinato;
    const perc = destinato / 100 * usato;
    const container = document.createElement("div");
    container.setAttribute("id", budget.budgetId);
    container.classList.add("budgetContainer");
           container.innerHTML = `
        <div class="budget-progress-card">
            <div class="budget-progress-header">
                <span class="budget-progress-label">${budget.categoria}</span>
                <span class="budget-progress-label">${budget.periodo}</span>
            </div>
            <div class="budget-progress-header">
                <span class="budget-progress-usato">${budget.usato.toFixed(0)}</span>
                <span class="budget-progress-perc">${budget.destinato}</span>
            </div>
            <div class="budget-progress-bar-track">
                <div class="budget-progress-bar-fill"></div>
            </div>
        </div>
           `;

   renderBudgetProgress(budget, container);

    container.addEventListener("click", (e) => {
      e.stopPropagation();
      container.classList.toggle("selected");
    });

   let pressTimer;

   container.addEventListener("touchstart", () => {
     pressTimer = setTimeout(() => {
       overlayBudgetEdit(budget);
     }, 600);
   });

   container.addEventListener("touchend", () => {
     clearTimeout(pressTimer);
   });

    return container;
}

export async function overlayBudget(){
    const openBtn = document.getElementById('addBudgetBtn');
    const overlay = document.getElementById('budgetFormOverlay');
    const form = document.getElementById('budgetForm');
    const categoriaInput = document.getElementById('budgetCategoria');
    const catRow = document.getElementById('categorieCardsBudget');
    const closeBtn = document.getElementById('closeBudgetFormBtn');
    const importo = document.getElementById('budgetImporto');
    const slider = document.getElementById('ricBudget');
    const ric = document.getElementById('periodo-budget-add');

    openBtn.addEventListener('click', async (e) => {
        if (overlay.classList.contains('showOverlay')) {
            overlay.classList.remove('showOverlay');
            form.reset();
        } else {
             catRow.innerHTML = "";
             ric.innerHTML = "";
             overlay.classList.toggle("showOverlay");
             const categorie = await getCategorie();
             categorie.forEach(cat => {
                 const card = catOverlay(cat.categoria, "addBudgetSpesa", null);
                 catRow.appendChild(card);
                 data.value = new Date().toISOString().split("T")[0];
             });
            slider.addEventListener('click', async (e) =>{
                periodoBudget(slider, null, ric);
            });
         }
    });

    closeBtn.addEventListener('click',async () =>{
        overlay.classList.remove('showOverlay');
        form.reset();
    });

        categoriaInput.addEventListener("input",async (event) =>{
          const categorie = await getCategorie(categoriaInput.value);
          const fragment = document.createDocumentFragment();
          categorie.forEach((cat, i) => {
            const card = catOverlay(cat.categoria, "addBudgetSpesa", null);
            card.classList.add("cardTr");
            card.style.animationDelay = `${i * 0.1}s`;
            fragment.appendChild(card);
          });
          catRow.replaceChildren(fragment);
        });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = document.querySelector('.budgetRic.selectedBudget');
        const periodo = isValid(r) ? (r.innerText) : "";
        const data = new Date().toISOString().split('T')[0];
        const budget = {
            budgetId: crypto.randomUUID(),
            categoria: categoriaInput.value.trim(),
            periodo: periodo,
            destinato: parseFloat(importo.value),
            data: data
        };


        try {
            overlay.classList.remove('showOverlay');
            await createBudget(budget);

            saveCategoria(budget.categoria, 0);
            criteriBudget();
            form.reset();
            showToast("Budget aggiunto con successo", "success");
        } catch (err) {
            showErrorToast("Errore durante il salvataggio", "error");
            console.log("Errore durante il salvataggio", err);
        }
    });
}

export async function overlayBudgetEdit(budget){

    document.getElementById('budgetCategoriaEdit').value = budget.categoria;
    document.getElementById('budgetImportoEdit').value = budget.destinato;
    const periodo = budget.periodo;
    const flag = isValid(periodo) ? true : false;
    document.getElementById('ricBudgetEdit').value = flag;
    document.getElementById('periodo-budget-addEdit');

    const overlay = document.getElementById('budgetFormOverlayEdit');
    const form = document.getElementById('budgetFormEdit');
    const categoriaInput = document.getElementById('budgetCategoriaEdit');
    const catRow = document.getElementById('categorieCardsBudgetEdit');
    const closeBtn = document.getElementById('closeBudgetFormBtnEdit');
    const importo = document.getElementById('budgetImportoEdit');
    const slider = document.getElementById('ricBudgetEdit');
    const ric = document.getElementById('periodo-budget-addEdit');
    const budgetId = budget.budgetId
    if(flag){
        slider.checked = true;
        periodoBudget(slider, periodo, ric);
     }

     catRow.innerHTML = "";
     const categorie = await getCategorie();
     categorie.forEach(cat => {
         const card = catOverlay(cat.categoria, "addBudgetSpesa", null);
         catRow.appendChild(card);
         data.value = new Date().toISOString().split("T")[0];
     });
     slider.addEventListener('click', async (e) =>{
        periodoBudget(slider, periodo, ric);
     });

    overlay.classList.add('showOverlay');

    closeBtn.addEventListener('click',async () =>{
        overlay.classList.remove('showOverlay');
        form.reset();
    });

        categoriaInput.addEventListener("input",async (event) =>{
          const categorie = await getCategorie(categoriaInput.value);
          const fragment = document.createDocumentFragment();
          categorie.forEach((cat, i) => {
            const card = catOverlay(cat.categoria, "addBudgetSpesa", null);
            card.classList.add("cardTr");
            card.style.animationDelay = `${i * 0.1}s`;
            fragment.appendChild(card);
          });
          catRow.replaceChildren(fragment);
        });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = document.querySelector('.budgetRic.selectedBudget');
        const periodo = isValid(r) ? (r.innerText) : "";
        const data = new Date().toISOString().split('T')[0];
        const budget = {
            budgetId: budgetId,
            categoria: categoriaInput.value.trim(),
            periodo: periodo,
            destinato: parseFloat(importo.value),
            data: data
        };


        try {
            overlay.classList.remove('showOverlay');
            await updateBudget(budget);

            saveCategoria(budget.categoria, 0);
            criteriBudget();
            form.reset();
            showToast("Budget aggiunto con successo", "success");
        } catch (err) {
            showErrorToast("Errore durante il salvataggio", "error");
            console.log("Errore durante il salvataggio", err);
        }
    });
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
const slider = document.getElementById('ricorrente');
const ric = document.getElementById('ricorrente-card-add');
let ricorrenza;

openBtn.addEventListener('click', async (e) => {
    if (overlay.classList.contains('showOverlay')) {
        overlay.classList.remove('showOverlay');
        form.reset();
    } else {
        catRow.innerHTML = "";
        ric.innerHTML = "";
        overlay.classList.toggle("showOverlay");
        const categorie = await getCategorie();
        categorie.forEach(cat => {
            const card = catOverlay(cat.categoria, "addSpesa", null);
            catRow.appendChild(card);
            data.value = new Date().toISOString().split("T")[0];
        });
        slider.addEventListener('click', async (e) =>{
            ricComponent(slider, null, ric);
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
        e.preventDefault();
        const tab = recuperaTab();
        const r = document.querySelector('.ric.selectedRic');
        ricorrenza = isValid(r) ? (r.innerText) + '%' + crypto.randomUUID()  : null;
        const transazione = {
            categoria: categoriaInput.value.trim(),
            data: data.value,
            importo: parseFloat(importo.value),
            descrizione: descrizione.value,
            ricorrenteId: ricorrenza
        };


        try {
            overlay.classList.remove('showOverlay');
            const user = await getUser();
            let trsOb;
        if(!tab){
            trsOb = await trsObject(transazione, "uscite");
            await saveTrsLocal(trsOb, "uscite");
            if(isValid(user)) insertTrs(await removeId(trsOb), "uscite");
        }else if(tab){
            trsOb = await trsObject(transazione, "entrate");
            await saveTrsLocal(trsOb, "entrate")
            if(isValid(user)) insertTrs(await removeId(trsOb), "entrate");
        }
            if(isValid(ricorrenza)) saveRicorrenza(trsOb);
            saveCategoria(trsOb.categoria);
            createCriteri();
            form.reset();
            showToast("Transazione aggiunta con successo", "success");
        } catch (err) {
            showErrorToast("Errore durante il salvataggio", "error");
            console.log("Errore durante il salvataggio", err);
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

          const categorie = await getCategorie(criteri);
          const fragment = document.createDocumentFragment();
          categorie.forEach((cat, i) => {
            const card = catOverlay(cat.categoria, "getSpese", selectedCards);
            card.style.animationDelay = `${i * 0.1}s`;
            fragment.appendChild(card);
          });
          catRow.replaceChildren(fragment);
        });
  }

function cardRic(periodo, selected, comp){
    const container = document.createElement("div");
    container.classList.add("ric");
    if(isValid(selected) && selected === periodo) container.classList.add("selectedRic");
    container.innerHTML = `
        <div>
            <span> ${periodo}</span>
        </div>
    `;
    container.addEventListener("click", () => {
        const r = document.querySelectorAll('.ric.selectedRic');
        if(isValid(r)) {
            r.forEach(item => {
                item.classList.remove("selectedRic");
            })
        }
        container.classList.toggle("selectedRic");
    });

    return container;
}

function budgetRic(periodo, selected, comp){
    const container = document.createElement("div");
    container.classList.add("budgetRic");
    if(isValid(selected) && selected === periodo) container.classList.add("selectedBudget");
    container.innerHTML = `
        <div>
            <span> ${periodo}</span>
        </div>
    `;
    container.addEventListener("click", () => {
        const r = document.querySelectorAll('.budgetRic.selectedBudget');
        if(isValid(r)) {
            r.forEach(item => {
                item.classList.remove("selectedBudget");
            })
        }
        container.classList.toggle("selectedBudget");
    });

    return container;
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
      }else if(sezione === "addBudgetSpesa"){
               const categoria = document.getElementById('budgetCategoria');
               container.classList.toggle("selected");
               categoria.value = categoriaElement.innerText;
         }

    });

    return container;
}

function ricComponent(slider, ricorrenza, ric){
    let pSelected = null;
    if (slider.checked) {
        if(isValid(ricorrenza)) {
            const split = ricorrenza.split('%');
            pSelected = split[0];
        }

        ric.innerHTML = "";
        const periodi = ["mensile", 'trimestrale', 'annuale'];
        periodi.forEach( p => {
            const card = cardRic(p, pSelected);
            ric.appendChild(card);
        });
    }else{
        ric.innerHTML = "";
    }
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
    const slider = document.getElementById('ricorrenteUpdate');
    const ric = document.getElementById('ricorrente-card-upd');
    let ricorrenza = spesa.ricorrenteId;
    let pSaved = null;
    if(isValid(ricorrenza)) {
        slider.checked = true;
        const split = ricorrenza.split('%');
        pSaved = split[0];
    }else{
        slider.checked = false;
    }


    closeBtn.addEventListener('click',async () =>{
        overlay.classList.remove('showOverlay');
    });

    ricComponent(slider, ricorrenza, ric);

    catRow.innerHTML = "";
    overlay.classList.add("showOverlay");
    const categorie = await getCategorie();
    categorie.forEach(cat => {
    const card = catOverlay(cat.categoria, "editSpesa", null);
    catRow.appendChild(card);
    });

    slider.addEventListener('click', async (e) =>{
        ricComponent(slider, ricorrenza, ric);
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
    const oldCategoria = categoriaElement.value;

    form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formCategoria = categoriaElement.value;
    const r = document.querySelector('.ric.selectedRic');
    const pUpdated = isValid(r) ? (r.innerText) : null;
    if(pSaved !== pUpdated) {
        if(isValid(ricorrenza)){
            const array = ricorrenza.split("%");
            ricorrenza = pUpdated + "%" + array[1];
        }else{
            ricorrenza = pUpdated + '%' + crypto.randomUUID();
        }

    }
    if(oldCategoria !== formCategoria) switchRichieste(oldCategoria, formCategoria);

    const tab = recuperaTab();

    const transazione = {
        id: parseInt(document.getElementById('editSpesaId').value),
        categoria: formCategoria,
        dataInserimento: dataInserimento,
        dataModifica: new Date().toISOString(),
        data: document.getElementById('editData').value,
        importo: parseFloat(document.getElementById('editImporto').value),
        descrizione: document.getElementById('editDescrizione').value,
        ricorrenteId: slider.checked ? ricorrenza : null
     };
    try {
        overlay.classList.remove('showOverlay');
        const user = await getUser();
        let trsOb;
        if(!tab){
            trsOb = await trsObject(transazione, "uscite");
            await updateTrsLocal(trsOb, "uscite");
            if(isValid(user)) updateTrs(await removeId(trsOb), "uscite");
        }else if(tab){
            trsOb = await trsObject(transazione, "entrate");
            await updateTrsLocal(trsOb, "entrate");
            if(isValid(user)) updateTrs(await removeId(trsOb), "entrate");
        }

        if(isValid(ricorrenza)){
            if(slider.checked && pSaved === pUpdated) updateRicorrenza(trsOb);
            if(!slider.checked) deleteRicorrenza(ricorrenza);
            if(pSaved !== pUpdated) updatePeriodo(trsOb, ricorrenza, pSaved);
        }

        createCriteri();
    } catch (err) {
        showErrorToast("Errore durante la modifica:", "error");
        console.log(err);
    }
    }, { once: true });
}