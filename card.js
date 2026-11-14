import { updateTrsLocal, aggiungiMovimento, saveCategoria, trsObject, aggiornaMovimento } from './queryDexie.js';
import { createCriteri, criteriBudget } from './main.js';
import { isValid } from './main.js';
import { showErrorToast, showToast } from './main.js';
import { getCategorie, switchRichieste, replaceCat, createBudget, updateBudget, getProjects, CATEGORY_PALETTE, getCategoryColors, getAutomaticCategoryColor, getMoreCategoryColors, saveCategoryColor } from './queryDexie.js';
import { categorieCreateComponent, parseDateRange, convertDDMMYYYYtoDate } from './main.js';

export function creaSpesaComponent(trsn, tabActive, projectName) {

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
                   <div class="spesa-classificazione"><small class="categoria">${trsn.categoria}</small></div>
                   <small class="data">${formatDate(trsn.data)}</small>
                 </div>
             </div>
         </div>
       `;

        if (!tabActive && projectName) {
            const project = document.createElement("small");
            project.className = "spesa-progetto";
            project.textContent = projectName;
            container.querySelector(".spesa-classificazione").appendChild(project);
        }

         container.addEventListener("click", (e) => {
           e.stopPropagation();
           container.classList.toggle("selected");
         });

        let pressTimer;

        container.addEventListener("pointerdown", () => {
          pressTimer = setTimeout(() => {
            overlayEdit(trsn);
          }, 600);
        });

        container.addEventListener("pointerup", () => {
            clearTimeout(pressTimer);
        });

        container.addEventListener("pointerleave", () => {
            clearTimeout(pressTimer);
        });

        container.addEventListener("pointercancel", () => {
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


let colorDialogRequest = 0;

async function openCategoryColor(categoria) {
    const request = ++colorDialogRequest;
    const dialog = document.getElementById("category-color-dialog");
    const form = dialog.querySelector("form");
    const save = form.querySelector('[value="save"]');
    const automatic = document.getElementById("category-color-auto");
    const more = document.getElementById("category-color-more");
    const status = document.getElementById("category-color-status");

    try {
        const colors = await getCategoryColors([categoria]);
        if (request !== colorDialogRequest || dialog.open) return;
        const current = colors.get(categoria);
        const reserved = new Set([...colors].filter(([name]) => name !== categoria).map(([, color]) => color));
        const palette = dialog.querySelector(".category-color-palette");
        const preview = dialog.querySelector(".category-color-preview");
        let selected = current;
        const choices = new Set([...CATEGORY_PALETTE, current]);

        function renderChoices() {
            preview.querySelector("span").style.backgroundColor = selected;
            preview.querySelector("output").textContent = "Anteprima " + selected.toUpperCase();
            palette.replaceChildren(...[...choices].map(color => {
                const swatch = document.createElement("button");
                swatch.type = "button";
                swatch.disabled = reserved.has(color);
                swatch.style.setProperty("--swatch", color);
                swatch.setAttribute("aria-label", color.toUpperCase() + (swatch.disabled ? " già assegnato" : ""));
                swatch.setAttribute("aria-pressed", color === selected);
                swatch.addEventListener("click", () => {
                    selected = color;
                    renderChoices();
                    palette.querySelector('[aria-pressed="true"]')?.focus();
                });
                return swatch;
            }));
        }

        document.getElementById("category-color-title").textContent = "Colore · " + categoria;
        renderChoices();
        more.disabled = false;
        status.hidden = true;
        status.textContent = "";
        more.onclick = () => {
            const extra = getMoreCategoryColors(new Set([...choices, ...reserved]));
            for (const color of extra) choices.add(color);
            if (extra.length) renderChoices();
            if (extra.length < 6) {
                more.disabled = true;
                status.hidden = false;
                status.textContent = "Non ci sono altri colori abbastanza distinti.";
            }
        };
        automatic.onclick = async () => {
            try {
                const color = await getAutomaticCategoryColor();
                if (!dialog.open || request !== colorDialogRequest) return;
                choices.add(color);
                selected = color;
                renderChoices();
            } catch (error) {
                showErrorToast(error.message);
            }
        };
        form.onsubmit = async event => {
            if (event.submitter?.value === "cancel") return;
            event.preventDefault();
            if (save.disabled) return;
            save.disabled = true;
            try {
                await saveCategoryColor(categoria, selected);
                dialog.close();
                await categorieCreateComponent();
            } catch (error) {
                showErrorToast(error.message);
            } finally {
                save.disabled = false;
            }
        };
        dialog.showModal();
    } catch (error) {
        showErrorToast(error.message);
    }
}

export function categoriaComponent(categoria, richieste, color) {
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
    container.addEventListener("pointerdown", event => {
        if (event.target.closest(".category-color-trigger")) return;
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

    container.addEventListener("pointerup", () => {
        clearTimeout(pressTimer);
    });

    container.addEventListener("pointerleave", () => {
        clearTimeout(pressTimer);
    });

    container.addEventListener("pointercancel", () => {
        clearTimeout(pressTimer);
    });

    container.addEventListener("click", () => {
        container.classList.toggle("selected");
    });
}

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "category-color-trigger";
    swatch.style.backgroundColor = color;
    swatch.setAttribute("aria-label", "Cambia colore di " + categoria);
    swatch.addEventListener("click", event => {
        event.stopPropagation();
        openCategoryColor(categoria);
    });
    container.querySelector(".cat-header").prepend(swatch);
    return container;
}


function renderBudgetProgress(budget, cardElement) {
  const perc = budget.destinato > 0
    ? Math.min((budget.usato / budget.destinato) * 100, 100)
    : 0;

  const bar = cardElement.querySelector('.budget-progress-bar-fill');
  const percLabel = cardElement.querySelector('.budget-progress-perc');
  const label = cardElement.querySelector('.budget-progress-usato');

  bar.style.width = `${perc}%`;
  const currency = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
  label.textContent = currency.format(budget.usato);
  percLabel.textContent = currency.format(budget.destinato);
  const remaining = budget.destinato - budget.usato;
  cardElement.querySelector(".budget-progress-remaining").textContent =
      (remaining < 0 ? "Sforamento: " : "Disponibile: ") + currency.format(Math.abs(remaining));

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
                <span class="budget-progress-label"></span>
                <span class="budget-progress-label"></span>
            </div>
            <div class="budget-progress-header">
                <span class="budget-progress-usato"></span>
                <span class="budget-progress-perc"></span>
            </div>
            <div class="budget-progress-bar-track">
                <div class="budget-progress-bar-fill"></div>
            </div>
            <div class="budget-progress-remaining"></div>
        </div>
           `;

    const [name, period] = container.querySelectorAll('.budget-progress-label');
    name.textContent = [budget.categoria, budget.projectName].filter(Boolean).join(" · ");
    period.textContent = budget.periodo === "personalizzato"
        ? [budget.dataInizio, budget.dataFine].map(date => date.split("-").reverse().join("/")).join(" – ")
        : budget.periodo;

    renderBudgetProgress(budget, container);

    container.addEventListener("click", (e) => {
      e.stopPropagation();
      container.classList.toggle("selected");
    });

   let pressTimer;

   container.addEventListener("pointerdown", () => {
     pressTimer = setTimeout(() => {
       openBudgetEdit(budget);
     }, 600);
   });


   container.addEventListener("pointerup", () => {
       clearTimeout(pressTimer);
   });

   container.addEventListener("pointerleave", () => {
       clearTimeout(pressTimer);
   });

   container.addEventListener("pointercancel", () => {
       clearTimeout(pressTimer);
   });

    return container;
}

const NEW_PROJECT = 'new-project';

export async function populateProjects(select, selected = '', allowCreate = false, emptyLabel = 'Nessun progetto') {
    const projects = await getProjects();
    select.replaceChildren(new Option(emptyLabel, ''));
    for (const project of projects) {
        select.add(new Option(project.nome, project.projectId));
    }
    if (allowCreate) select.add(new Option('Crea un progetto…', NEW_PROJECT));
    select.value = selected || '';
}

async function prepareExpenseProject(form, tab, projectId) {
    const select = form.elements.projectId;
    select.disabled = tab !== false;
    select.closest('label').hidden = select.disabled;
    if (!select.disabled) await populateProjects(select, projectId, Boolean(form.elements.projectName));
}

let budgetPanelRequest = 0;

export function prepareBudgetPanel() {
    const request = ++budgetPanelRequest;
    for (const id of ["budgetSearchOverlay", "budgetFormOverlay", "budgetFormOverlayEdit"]) {
        const panel = document.getElementById(id);
        panel.classList.remove("showOverlay");
        panel.inert = true;
    }
    document.getElementById("getBudgetBtn").setAttribute("aria-expanded", "false");
    return () => request === budgetPanelRequest;
}

function configureBudgetForm(form, overlay, closeBtn, edit) {
    const fields = form.elements;
    const categoria = form.querySelector('[id^="budgetCategoria"]');
    const importo = form.querySelector('.importoBudget');
    const catRow = form.querySelector('.categorie-cards');
    const projectNameLabel = form.querySelector('[data-new-project]');
    const dates = form.querySelector('.budget-dates');
    let currentBudget;
    let hasDraft = false;
    overlay.inert = true;

    function updateFields() {
        const newProject = fields.projectId.value === NEW_PROJECT;
        projectNameLabel.hidden = !newProject;
        fields.projectName.disabled = !newProject;
        fields.projectName.required = newProject;
        const custom = fields.periodo.value === 'personalizzato';
        dates.hidden = !custom;
        for (const field of [fields.dataInizio, fields.dataFine]) {
            field.disabled = !custom;
            field.required = custom;
        }
    }

    async function showCategories(search) {
        const categories = await getCategorie(search);
        catRow.replaceChildren(...categories.map(cat =>
            catOverlay(cat.categoria, edit ? 'editBudgetSpesa' : 'addBudgetSpesa', null)
        ));
    }

    categoria.addEventListener('input', () => showCategories(categoria.value));
    fields.projectId.addEventListener('change', updateFields);
    fields.periodo.addEventListener('change', updateFields);
    closeBtn.addEventListener('click', () => {
        hasDraft = false;
        prepareBudgetPanel();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const periodo = fields.periodo.value;
        const custom = periodo === 'personalizzato';
        const dataInizio = custom ? fields.dataInizio.value : null;
        const dataFine = custom ? fields.dataFine.value : null;
        const newProject = fields.projectId.value === NEW_PROJECT;
        const projectName = newProject ? fields.projectName.value.trim() : '';
        if (custom && (!dataInizio || !dataFine || dataInizio > dataFine)) {
            showErrorToast('Inserisci un intervallo di date valido.');
            return;
        }
        if (newProject && !projectName) {
            showErrorToast('Inserisci il nome del progetto.');
            return;
        }
        const budget = {
            budgetId: currentBudget?.budgetId ?? crypto.randomUUID(),
            categoria: categoria.value.trim(),
            destinato: Number(importo.value),
            periodo,
            data: currentBudget?.data ?? new Date().toISOString().split('T')[0],
            dataInizio,
            dataFine,
            projectId: newProject ? null : fields.projectId.value || null,
            projectName
        };

        const submit = form.querySelector('[type="submit"]');
        if (submit.disabled) return;
        submit.disabled = true;
        try {
            await (edit ? updateBudget(budget) : createBudget(budget));
            await saveCategoria(budget.categoria, 0);
            hasDraft = false;
            if (!overlay.inert) prepareBudgetPanel();
            await criteriBudget();
            showToast(edit ? 'Budget aggiornato' : 'Budget aggiunto', 'success');
        } catch (error) {
            showErrorToast('Errore durante il salvataggio del budget');
            console.error(error);
        } finally {
            submit.disabled = false;
        }
    });

    return async budget => {
        const isCurrent = prepareBudgetPanel();
        const resume = hasDraft && currentBudget?.budgetId === budget?.budgetId;
        currentBudget = budget;
        if (!resume) {
            form.reset();
            categoria.value = budget?.categoria ?? '';
            importo.value = budget?.destinato ?? '';
            fields.periodo.value = budget?.periodo ?? '';
            fields.dataInizio.value = budget?.dataInizio ?? '';
            fields.dataFine.value = budget?.dataFine ?? '';
        }
        await populateProjects(fields.projectId, resume ? fields.projectId.value : budget?.projectId, true);
        updateFields();
        await showCategories();
        if (!isCurrent()) return;
        hasDraft = true;
        overlay.inert = false;
        overlay.classList.add('showOverlay');
    };
}

let openBudgetEdit;

export function overlayBudget() {
    const overlay = document.getElementById('budgetFormOverlay');
    const openBudget = configureBudgetForm(
        document.getElementById('budgetForm'), overlay,
        document.getElementById('closeBudgetFormBtn'), false
    );
    openBudgetEdit = configureBudgetForm(
        document.getElementById('budgetFormEdit'),
        document.getElementById('budgetFormOverlayEdit'),
        document.getElementById('closeBudgetFormBtnEdit'), true
    );
    document.getElementById('addBudgetBtn').addEventListener('click', () => {
        if (overlay.classList.contains('showOverlay')) {
            prepareBudgetPanel();
        } else {
            openBudget();
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
const projectName = form.elements.projectName;
const projectSelect = form.elements.projectId;

function updateProjectField() {
    const creating = !projectSelect.disabled && projectSelect.value === NEW_PROJECT;
    projectName.closest('label').hidden = !creating;
    projectName.disabled = !creating;
    projectName.required = creating;
}
projectSelect.addEventListener('change', updateProjectField);
const submit = form.querySelector('[type="submit"]');

openBtn.addEventListener('click', async (e) => {
    if (overlay.classList.contains('showOverlay')) {
        overlay.classList.remove('showOverlay');
        form.reset();
    } else {
        catRow.innerHTML = "";
        ric.innerHTML = "";
        form.reset();
        await prepareExpenseProject(form, recuperaTab());
        updateProjectField();
        const categorie = await getCategorie();
        categorie.forEach(cat => {
            const card = catOverlay(cat.categoria, "addSpesa", null);
            catRow.appendChild(card);
        });
        data.value = new Date().toISOString().split("T")[0];
        overlay.classList.add("showOverlay");
    }
    });
    slider.addEventListener('change', () => ricComponent(slider, null, ric));
    document.addEventListener('click', (event) => {
        if (!overlay.classList.contains('showOverlay')) return;
        if (event.target.closest('#spesaFormOverlay, #addSpesaBtn')) return;
        overlay.classList.remove('showOverlay');
        form.reset();
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
        const r = form.querySelector('.ric.selectedRic');
        if (slider.checked && !r) {
            showErrorToast('Seleziona un periodo per la ricorrenza.');
            return;
        }
        const creatingProject = tab === false && projectSelect.value === NEW_PROJECT;
        const newProject = creatingProject ? projectName.value.trim() : '';
        if (creatingProject && !newProject) {
            showErrorToast('Inserisci il nome del progetto.');
            return;
        }
        const ricorrenza = slider.checked ? r.innerText.trim() + '%' + crypto.randomUUID() : null;
        const transazione = {
            categoria: categoriaInput.value.trim(),
            data: data.value,
            importo: parseFloat(importo.value),
            descrizione: descrizione.value,
            projectId: tab === false && !creatingProject ? projectSelect.value : null,
            ricorrenteId: ricorrenza
        };


        if (submit.disabled) return;
        submit.disabled = true;
        try {
            const tableName = tab ? "entrate" : "uscite";
            const trsOb = await trsObject(transazione, tableName);
            await aggiungiMovimento(trsOb, tableName, newProject);
            overlay.classList.remove("showOverlay");
            saveCategoria(trsOb.categoria);
            createCriteri();
            form.reset();
            showToast("Transazione aggiunta con successo", "success");
        } catch (err) {
            showErrorToast("Errore durante il salvataggio", "error");
            console.log("Errore durante il salvataggio", err);
        } finally {
            submit.disabled = false;
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
    const progetto = document.getElementById('ricerca-progetto');
    let selectedCards = catRow.querySelectorAll(".card.selected");

    openBtn.addEventListener('click', async (e) => {
        if (overlay.classList.contains('showOverlay')) {
            overlay.classList.remove('showOverlay');
        } else {
            selectedCards = catRow.querySelectorAll(".card.selected");
            catRow.innerHTML = "";
            await populateProjects(progetto, progetto.value, false, "Tutti i progetti");
            overlay.classList.add("showOverlay");
            const categorie = await getCategorie();
            categorie.forEach(cat => {
            const card = catOverlay(cat.categoria, "getSpese",selectedCards);
            catRow.appendChild(card);
            });
        }
    });
    document.addEventListener('click', (event) => {
            if (!overlay.classList.contains('showOverlay')) return;
            if (event.target.closest('#overlayRicerca') || event.target.closest('#getSpesaBtn')) return;
              overlay.classList.remove('showOverlay');
    });
     categoriaInput.addEventListener("input",async (event) =>{
          selectedCards = catRow.querySelectorAll(".card.selected");
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

export function catOverlay(categoria, sezione, selectedCards) {
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
      }else if(sezione === "addBudgetSpesa" || sezione === "editBudgetSpesa"){
               const categoria = document.getElementById(sezione === "editBudgetSpesa" ? "budgetCategoriaEdit" : "budgetCategoria");
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


document.addEventListener('click', event => {
    const overlay = document.getElementById('editSpesaFormOverlay');
    if (overlay.classList.contains('showOverlay') && !overlay.contains(event.target)) {
        overlay.classList.remove('showOverlay');
    }
});

export async function overlayEdit(spesa) {
    const overlay = document.getElementById('editSpesaFormOverlay');
    const catRow = document.getElementById('categorieCardsEdit');
    const closeBtn = document.getElementById('closeEditFormBtn');
    const dataInserimento = spesa.dataInserimento;
    const form = document.getElementById('editForm');

    document.getElementById('editSpesaId').value = spesa.id;
    const categoriaElement = document.getElementById('editCategoria');
    categoriaElement.value = spesa.categoria.trim();
    document.getElementById('editData').value = spesa.data;
    document.getElementById('editImporto').value = Math.abs(spesa.importo);
    document.getElementById('editDescrizione').value = spesa.descrizione;
    const tab = recuperaTab();
    await prepareExpenseProject(form, tab, spesa.projectId);
    const slider = document.getElementById('ricorrenteUpdate');
    const ric = document.getElementById('ricorrente-card-upd');
    const previousId = spesa.ricorrenteId;
    slider.checked = Boolean(previousId);
    closeBtn.onclick = () => overlay.classList.remove('showOverlay');
    ricComponent(slider, previousId, ric);

    catRow.innerHTML = "";
    const categorie = await getCategorie();
    categorie.forEach(cat => {
    const card = catOverlay(cat.categoria, "editSpesa", null);
    catRow.appendChild(card);
    });

    overlay.classList.add("showOverlay");
    slider.onchange = () => ricComponent(slider, previousId, ric);
    categoriaElement.oninput = async () => {
        const categorie = await getCategorie(categoriaElement.value);
        catRow.replaceChildren(...categorie.map(cat => catOverlay(cat.categoria, 'editSpesa', null)));
    };
    const oldCategoria = categoriaElement.value;

    form.onsubmit = async e => {
    e.preventDefault();
    const formCategoria = categoriaElement.value;
    const r = form.querySelector('.ric.selectedRic');
    if (slider.checked && !r) {
        showErrorToast('Seleziona un periodo per la ricorrenza.');
        return;
    }
    const seriesId = previousId?.split('%')[1];
    const ricorrenza = slider.checked ? r.innerText.trim() + '%' + (seriesId || crypto.randomUUID()) : null;

    const transazione = {
        id: parseInt(document.getElementById('editSpesaId').value),
        categoria: formCategoria,
        dataInserimento: dataInserimento,
        dataModifica: new Date().toISOString(),
        data: document.getElementById('editData').value,
        importo: parseFloat(document.getElementById('editImporto').value),
        descrizione: document.getElementById('editDescrizione').value,
        projectId: tab === false ? form.elements.projectId.value : null,
        ricorrenteId: ricorrenza
     };
    try {
        overlay.classList.remove('showOverlay');
        const tableName = tab ? "entrate" : "uscite";
        const trsOb = await trsObject(transazione, tableName);
        await aggiornaMovimento(trsOb, tableName, previousId);
        if (oldCategoria !== formCategoria) await switchRichieste(oldCategoria, formCategoria);
        showToast('Transazione aggiornata', 'success');

        createCriteri();
    } catch (err) {
        showErrorToast("Errore durante la modifica:", "error");
        console.log(err);
    }
    };
}