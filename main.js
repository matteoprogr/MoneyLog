import { saveCategoria, capitalizeFirstLetter, getCategorie, updateRichieste, deleteCategorie, queryTrns,
        deleteSpese, checkRicorrenze, getCategoryColors, getProjects, getProjectUsage, deleteProject, deleteBudget, checkRicorrenzeBudgetAnnuale, checkRicorrenzeBudgetMensile, getBudgets } from './queryDexie.js';
import { overlayBudget, creaSpesaComponent, creaComponentTotale, recuperaTab, overlayEdit, overlayRicerca,
        categoriaComponent, nessunaCategoriaComponent, nessunaElementoComponent, overlayAddSpesa, populateProjects, prepareBudgetPanel, compBudget, nessunBudgetComponent, catOverlay } from './card.js';

import { initializeInvestments, renderInvestments } from './investments.js';

/////////  SERVICE WORKER ////////////////
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered:', reg))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}


//  EVENT LISTENER //////////////////////////////////
document.getElementById("deleteSpesaBtn").addEventListener("click", deleteSpesaBtn);
document.getElementById("deleteCategoriaBtn").addEventListener("click", deleteCategoriaBtn);
document.getElementById("deleteBudgetBtn").addEventListener("click", deleteBudgetBtn);
document.getElementById("importoMinEntrata").addEventListener("input", createCriteri);
document.getElementById("importoMaxEntrata").addEventListener("input", createCriteri);
const ricercaProgetto = document.getElementById("ricerca-progetto");
ricercaProgetto.addEventListener("change", createCriteri);
document.getElementById("ricerca-categorie").addEventListener("input", categorieCreateComponent);
document.getElementById("indietro").addEventListener("click", function(event) {  setDirezioneData(event, "date-range", "indietro"); });
document.getElementById("avanti").addEventListener("click", function(event) { setDirezioneData(event,  "date-range", "avanti"); });
document.getElementById("indietroGraph").addEventListener("click", function(event) { setDirezioneData(event, "date-range-graph", "indietroGraph"); });
document.getElementById("avantiGraph").addEventListener("click", function(event) { setDirezioneData(event, "date-range-graph", "avantiGraph"); });
document.getElementById("indietroBudget").addEventListener("click", function(event) { setDirezioneData(event, "date-range-budget", "indietroBudget"); });
document.getElementById("avantiBudget").addEventListener("click", function(event) { setDirezioneData(event, "date-range-budget", "avantiBudget"); });
document.getElementById("addCategoriaBtn").addEventListener("click", saveNewCategoria);
document.getElementById('pulisci').addEventListener('click', pulisci);




//  VARIABILI GLOBALI //////////////////////////////////

let targetId;
let picker;

// SUBMIT FORM  e SECTIONS //////////////////////////////////////////

document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('touchstart', function(e) {
        this.touchStartTime = Date.now();
      });

      link.addEventListener('touchend', function(e) {
        if (Date.now() - this.touchStartTime < 400) {
          return;
        }
        e.preventDefault();
      });
    link.addEventListener('click', () => {
        targetId = link.getAttribute('data-target');
        document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
        const targetSection = document.getElementById(targetId);
        targetSection.classList.add('active');
        const navToggle = document.getElementById('nav-toggle');
        if (navToggle) {
            navToggle.checked = false;
        }
        if (targetId === 'movimenti') {
            setDateRange("#date-range");
        }
        if (targetId === 'categorie-section') {
            categorieCreateComponent()
        }
        if(targetId === "grafici"){
            setDateRange("#date-range-graph");
            creaGraficoBar();
        }
        if(targetId === "budget"){
            setDateRange("#date-range-budget");
        }

        if (targetId === 'investimenti') {
            renderInvestments().catch(error => showErrorToast('Investimenti: ' + error.message));
        }
        const selectedCards = document.querySelectorAll('.selected');
        selectedCards.forEach(card => {card.classList.remove('selected');});
    });
});



// DOM CONTENT LOADED ///////////////////////////////
document.addEventListener("DOMContentLoaded", () => {
    initializeInvestments();
    targetId = "movimenti";
    overlayAddSpesa();
    overlayRicerca();
    overlayBudget();
    setupBudgetSearch();
    setupProjectManagement();
    setDateRange("#date-range");
    checkRicorrenze();
    checkRicorrenzeBudgetAnnuale();
    checkRicorrenzeBudgetMensile();
    let container = document.querySelector('.movimenti-container');
    let containerGraph = document.querySelector('.movimenti-container.graph');
    let tabs = document.querySelectorAll('.movimenti-tabs .tab');
    if (!container || !tabs.length) return;
    let startX = 0, startY = 0, currentX = 0, currentY = 0;
    let currentIndex = 0;
    const maxIndex = tabs.length - 1;

 document.addEventListener('click', (event) => {
     if (event.target.tagName === 'SPAN' || event.target.closest('#nav-toggle')) return;
       const navToggle = document.getElementById('nav-toggle');
           if (navToggle) {
               navToggle.checked = false;
           }
   });

//SWIPE
  const observer = new IntersectionObserver((entries) => {
      if( targetId === "movimenti"){
        entries.forEach(entry => {
        let tab;
        const target = entry.target.id;
        if(target === 'lista-spese'){
            tab = document.querySelector('[data-target="traccia-spesa-slide"]');
        }
        if(target === 'lista-entrate'){
            tab = document.querySelector('[data-target="traccia-entrate-slide"]');
        }

        if (entry.isIntersecting) {
            tab.classList.add('active');
        } else if(isValid(tab)) {
            tab.classList.remove('active');
        }

        createCriteri();
        });
        }
      if( targetId === "grafici"){
        entries.forEach(entry => {
        let tab;
        const target = entry.target.id;
        if(target === 'chartCakeSpese'){
            tab = document.querySelector('[data-target="graph-spesa-slide"]');
        }
        if(target === 'chartCakeEntrate'){
            tab = document.querySelector('[data-target="graph-entrate-slide"]');
        }

        if (entry.isIntersecting) {
            tab.classList.add('active');
        } else if(isValid(tab)) {
            tab.classList.remove('active');
        }

        criteriGraph();
        });
      }
  }, {
    root: null,
    threshold: 0.1
  });

  const speseElement = document.querySelector('#lista-spese');
  const entrateElement = document.querySelector('#lista-entrate');
  const speseCake = document.querySelector('#chartCakeSpese');
  const entrateCake = document.querySelector('#chartCakeEntrate');

    if (speseElement) observer.observe(speseElement);
    if (entrateElement) observer.observe(entrateElement);
    if (speseCake) observer.observe(speseCake);
    if (entrateCake) observer.observe(entrateCake);

    tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      currentIndex = i;
      if(currentIndex === 2) currentIndex = 0;
      if(currentIndex === 3) currentIndex = 1;
      const targetLeft = i * container.clientWidth;
      const targetLeftGraph = currentIndex * containerGraph.clientWidth;
      try {
        container.scrollTo({ left: targetLeft, behavior: 'smooth' });
        containerGraph.scrollTo({ left: targetLeftGraph, behavior: 'smooth' });
      } catch {
        container.scrollLeft = targetLeft;
        containerGraph.scrollLeft = targetLeftGraph;
      }
      setActiveTab(i);
    });
    });

    function setActiveTab(index){
        tabs.forEach(t => t.classList.remove('active'));
        if (tabs[index]) tabs[index].classList.add('active');
    }

});



//  FUNZIONI //////////////////////////////////

async function saveNewCategoria(){
    const inputCategoria = document.getElementById('ricerca-categorie');
    const saveBtn = document.getElementById('addCategoriaBtn');
    const newCategoria = inputCategoria.value;
    await saveCategoria(newCategoria, 0);
    inputCategoria.value = "";
    categorieCreateComponent();
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sommaPerMese(transazioni) {
  const somme = Array(12).fill(0);
  transazioni.forEach(item => {
    const data = new Date(item.data);
    const mese = data.getMonth();
    somme[mese] += Math.abs(Number(item.importo)) || 0;
  });

  return somme;
}

function media(entrate, uscite, bilancio, divisoreE, divisoreU) {
    const divisoreBilancio = Math.max(divisoreE, divisoreU);

    const round2 = (n) => Math.round(n * 100) / 100;

    return [
        round2(entrate / divisoreE),
        round2(uscite / divisoreU),
        round2(bilancio / divisoreBilancio)
    ];
}

function calcolaDivisore(arr){
    let count = 0;
    for(let i = 0; i < 12; i++){
        if(arr[i] > 0){
            count++;
        }
    }
    return count;
}


function sommaAnnua(transazioni){
    let somma = 0;
    transazioni.forEach(item => {
        somma += Math.abs(Number(item.importo)) || 0;
    });
    return somma;
}

async function creaGraficoBar(){
const echarts = window.echarts;
const chartElement = document.getElementById('chart');
let chart = echarts.getInstanceByDom(chartElement);
if (!chart) {
    chart = echarts.init(chartElement);
    new ResizeObserver(() => chart.resize()).observe(chartElement);
}
const annoVisionato = document.getElementById("date-range-graph")._flatpickr;
const annoCorrente = annoVisionato.currentYear;
const criteri = {
  dataInizio: formatDate(new Date(annoCorrente, 0, 1)),
  dataFine: formatDate(new Date(annoCorrente, 11, 31))
};
const spese = await queryTrns(criteri,false);
const entrate = await queryTrns(criteri,true);

const sumS = sommaPerMese(spese);
const sumE = sommaPerMese(entrate);

const totS = sommaAnnua(spese);
const totE = sommaAnnua(entrate);
const totB = totE - totS;
const divE = calcolaDivisore(sumE);
const divU = calcolaDivisore(sumS);
const medie = media(totE, totS, totB, divE, divU);
const summary = document.getElementById("chart-summary");
summary.replaceChildren(...[
    ["Entrate", totE, medie[0]],
    ["Uscite", totS, medie[1]],
    ["Bilancio", totB, medie[2]]
].map(([name, total, average]) => {
    const item = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = name;
    const value = document.createElement("strong");
    value.textContent = total.toFixed(2);
    const mean = document.createElement("small");
    mean.textContent = "Media " + average.toFixed(2);
    item.append(label, value, mean);
    return item;
}));

const option = {
  grid: { containLabel: true, left: 8, right: 8, top: 35, bottom: 12 },
  tooltip: {
    trigger: 'axis',
    valueFormatter: function (val) {
        return val.toFixed(2);
      }
  },
  legend: {},
  dataset: {
    source: [
      ['gennaio', sumS[0], sumE[0], sumE[0] - sumS[0] ],
      ['febbraio', sumS[1], sumE[1], sumE[1] - sumS[1] ],
      ['marzo', sumS[2], sumE[2], sumE[2] - sumS[2] ],
      ['aprile', sumS[3], sumE[3], sumE[3] - sumS[3] ],
      ['maggio', sumS[4], sumE[4], sumE[4] - sumS[4] ],
      ['giugno', sumS[5], sumE[5], sumE[5] - sumS[5] ],
      ['luglio', sumS[6], sumE[6], sumE[6] - sumS[6] ],
      ['agosto', sumS[7], sumE[7], sumE[7] - sumS[7] ],
      ['settembre', sumS[8], sumE[8], sumE[8] - sumS[8] ],
      ['ottobre', sumS[9], sumE[9], sumE[9] - sumS[9] ],
      ['novembre', sumS[10], sumE[10], sumE[10] - sumS[10] ],
      ['dicembre', sumS[11], sumE[11], sumE[11] - sumS[11] ]
    ],
    dimensions: ['Mese','Uscite','Entrate', 'Bilancio']
  },
  xAxis: {
    type: 'category',
    axisLabel: { rotate: 0, interval: 0, formatter: month => month.slice(0, 3), fontSize: 10 },
    axisTick: { alignWithLabel: true }
  },
  yAxis: {
    type: 'value',
    min: ({ min }) => min < 0 ? Math.floor(min * 11 / 100) * 10 : 0
  },
  series: [
    {
      type: 'bar',
      name: 'Entrate',
      encode: { x: 'Mese', y: 'Entrate' },
      itemStyle: { color: '#4caf50' }
    },
    {
      type: 'bar',
      name: 'Uscite',
      encode: { x: 'Mese', y: 'Uscite' },
      itemStyle: { color: '#ff5252' }
    },
    {
      type: 'bar',
      name: 'Bilancio',
      encode: { x: 'Mese', y: 'Bilancio' },
      tooltip: { show: true }
    }
  ]
};

chart.setOption(option);


}

async function creaGraficoTorta(criteri){
    const echarts = window.echarts;
    const charts = ["chartCakeSpese", "chartCakeEntrate"].map(id => {
        const element = document.getElementById(id);
        const existing = echarts.getInstanceByDom(element);
        if (existing) return existing;
        const chart = echarts.init(element);
        attachLegendHandler(chart);
        new ResizeObserver(() => chart.resize()).observe(element);
        return chart;
    });
    const [chartSpese, chartEntrate] = charts;

    const spese = await queryTrns(criteri,false);
    const entrate = await queryTrns(criteri,true);
    const colors = await getCategoryColors([...spese, ...entrate].map(item => item.categoria));
    const optionSpese = createOption(spese, 'Uscita', colors);
    const optionEntrate = createOption(entrate, 'Entrata', colors);

    chartSpese.setOption(optionSpese);
    chartEntrate.setOption(optionEntrate);


}

function attachLegendHandler(chart) {
    chart.on('legendselectchanged', function (params) {
        const option = chart.getOption();
        const selected = params.selected;
        const data = option.series[0].data;
        const newTotal = data.reduce((acc, item) => { return selected[item.name] ? acc + item.value : acc; }, 0);

        chart.setOption({
        series: [{
          label: {
           formatter: () => `${newTotal.toFixed(2)}`
          }
         }]
        });

        chart.setOption ({
         tooltip: {
          ...option.tooltip[0],
          formatter: function(p){
           return `${p.name}: ${Number(p.value).toFixed(2)} <br>
                   % sul totale: ${(p.value /newTotal * 100).toFixed(2)}`;
          }
         }
        }, false, true);
    });
}

function createOption(trns, trnsType, colors){

  const aggregato = Object.create(null);

  trns.forEach(item => {
    const categoria = item.categoria;
    const importo = Number(item.importo) || 0;
    if (!aggregato[categoria]) {
      aggregato[categoria] = 0;
    }
    aggregato[categoria] += Math.abs(importo);
  });

  const data = Object.entries(aggregato).map(([name, value]) => ({ name, value, itemStyle: { color: colors.get(name) } }));
  let totale = data.reduce((acc, item) => acc + item.value, 0);

    const option = {
      tooltip: {
        trigger: 'item',
        formatter: function (params) {
              return `${params.name}: ${Number(params.value).toFixed(2)} <br>
                      % sul totale: ${(Number(params.value)/ totale * 100).toFixed(2)} `;
            }
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        top: '10%',
        left: 'left',
        height: '80%',
        pageFormatter: '',
        pageIconSize: 16,
        pageIconColor: '#555',
        pageIconInactiveColor: '#ddd',
        pageTextStyle: { color: 'transparent' }
      },
      series: [
        {
          name: trnsType,
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['65%', '45%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: true,
            position: 'center',
            formatter: () => `${totale.toFixed(2)}`,
            fontSize: 18,
            fontWeight: 'bold',
            lineHeight: 22
          },
          labelLine: {
            show: false
          },
          data: data
        }
      ]
    };

    return option;
}



function setDirezioneData(event, calendar) {
    const picker = document.getElementById(calendar)._flatpickr;
    const direction = event.currentTarget.id.startsWith("avanti") ? 1 : -1;
    const month = new Date(picker.currentYear, picker.currentMonth + direction, 1);
    setDateRange("#" + calendar, month.getMonth(), month.getFullYear());
}


function setDateRange(range, mese, anno) {
  let today = new Date();
  if(isValid(mese) && isValid(anno)){
  today = new Date(anno, mese, 1);
  }

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 2, 0, 0);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 1, 59, 0);
  let lastDay = endOfMonth.getDate();

    function formatDMY(date) {
      const d = String(date.getDate()).padStart(2, "0");
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const y = date.getFullYear();
      return `${d}/${m}/${y}`;
    }

    function getMonthYearName(date) {
      return date.toLocaleString("it-IT", { month: "long", year: "numeric" });
    }

  const picker = flatpickr(range, {
    mode: "range",
    onOpen: (_, __, instance) => {
      instance.calendarContainer.classList.toggle("chart-calendar", range === "#date-range-graph");
    },
    dateFormat: "Y-m-d",
    altInput: false,
    locale: "it",
    minDate: "2020-01-01",
    maxDate: "2035-12-31",
    defaultDate: [startOfMonth, endOfMonth],
    formatDate: function(date, format, locale) {
      return formatDMY(date);
    },
    onReady: function(selectedDates, dateStr, instance) {
      if (
        selectedDates.length === 2 &&
        selectedDates[0].getDate() === 1 &&
        selectedDates[1].getDate() === lastDay &&
        selectedDates[0].getMonth() === selectedDates[1].getMonth()
      ) {
        instance.input.value = getMonthYearName(selectedDates[0]).toUpperCase();
      }
    },
    onChange: function(selectedDates, dateStr, instance) {
    if (selectedDates.length !== 2) return;
    const year = selectedDates[0].getFullYear();
    const month = selectedDates[0].getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

      if (
        selectedDates.length === 2 &&
        selectedDates[0].getDate() === 1 &&
        selectedDates[1].getDate() === lastDay &&
        selectedDates[0].getMonth() === selectedDates[1].getMonth()
      ) {
        instance.input.value = getMonthYearName(selectedDates[0]).toUpperCase();
      } else {
        instance.input.value = `${formatDMY(selectedDates[0])} – ${formatDMY(selectedDates[1])}`;
      }

      callCriteriMethod(range);
    }
  });

     callCriteriMethod(range);
}

function callCriteriMethod(range){
    if(range === "#date-range-budget") criteriBudget();
    if(range === "#date-range-graph") criteriGraph();
    if(range === "#date-range") createCriteri();
}


function getElementiTrns(tabActive){
    if(!tabActive){
        const trns = {
        lista: "lista-spese",
        tot: "lista-spese-totale",
        zero: "zero-spese",
        tipo: "spesa"
        }
        return trns;
    }
    if(tabActive){
        const trns = {
        lista: "lista-entrate",
        tot: "lista-entrate-totale",
        zero: "zero-entrate",
        tipo: "entrata"
        }
        return trns;
    }
}


async function tracciaSpeseClick(criteri) {
    try {
        const tabActive = recuperaTab();
        let transazioni;
        transazioni = await queryTrns(criteri,tabActive);
        const trns = getElementiTrns(tabActive);
        transazioni.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

        const listaTransazioni = document.getElementById(trns.lista);
        const listaTransazioniTotale = document.getElementById(trns.tot);
        const zeroTransazioni = document.getElementById(trns.zero);

        const projects = !tabActive && transazioni.some(item => item.projectId) ? await getProjects() : [];
        const projectNames = new Map(projects.map(project => [project.projectId, project.nome]));
        listaTransazioni.innerHTML = "";
        transazioni.forEach(trns => {
          const nodo = creaSpesaComponent(trns, tabActive, projectNames.get(trns.projectId));
          listaTransazioni.appendChild(nodo);
        });

        const totale = creaComponentTotale(transazioni,tabActive);
        listaTransazioniTotale.innerHTML = "";
        zeroTransazioni.innerHTML = "";
        if (transazioni.length > 0) {
            listaTransazioniTotale.appendChild(totale);
        }else {
        const nodo = nessunaElementoComponent(trns.tipo)
        zeroTransazioni.appendChild(nodo);
        }

    } catch (err) {
        showErrorToast("Errore nel recupero delle transazioni:", "error");
    }
}


export async function categorieCreateComponent() {
    const catInput = document.getElementById("ricerca-categorie").value;
    const saveBtn = document.getElementById('addCategoriaBtn');
    if(catInput.length > 0){
        saveBtn.classList.remove('addCategoria');
    }else{
        saveBtn.classList.add('addCategoria');
    }

    const [categorie, colors] = await Promise.all([getCategorie(catInput), getCategoryColors()]);
    if (document.getElementById("ricerca-categorie").value !== catInput) return;
    const categorieList = document.getElementById("gestione-categorie");
    const zeroCategorie = document.getElementById("zero-categorie");
    zeroCategorie.innerHTML = "";
    categorieList.innerHTML = "";
    if (!categorie || categorie.length === 0) {
        const nodo = nessunaCategoriaComponent("categoria")
        zeroCategorie.appendChild(nodo);
    }else{
        categorie.forEach(cat => {
          const nodo = categoriaComponent(cat.categoria, cat.richieste, colors.get(cat.categoria));
          categorieList.appendChild(nodo);
        });
    }
}


export function isValid(value) {
    return value != null && !Number.isNaN(value) && value !== "" && value != undefined;
}

export async function createCriteri() {
    const criteri = {};
    const tab = recuperaTab();
    ricercaProgetto.disabled = tab !== false;
    ricercaProgetto.closest("label").hidden = ricercaProgetto.disabled;
    if (!ricercaProgetto.disabled && ricercaProgetto.value) {
        criteri.projectId = ricercaProgetto.value;
    }
    let min = 0;
    let max = 0;
    const selectedCards = document.querySelectorAll('#categorieCardsEntrata .card.selected');
    if (selectedCards.length > 0) {
     criteri.categoria = [];
     selectedCards.forEach(card => {
        criteri.categoria.push(card.innerText.trim());
     });
    }
    if(!tab){
        min = -Math.abs(document.getElementById("importoMaxEntrata").value);
        max = -Math.abs(document.getElementById("importoMinEntrata").value);
    }else if(tab){
        max = document.getElementById("importoMaxEntrata").value;
        min = document.getElementById("importoMinEntrata").value;
    }

    if (isValid(min) && min !== -0 && min !== 0) {
        criteri.importoMin = parseFloat(min);
    }
    if (isValid(max) && max !== -0 && max !== 0) {
        criteri.importoMax = parseFloat(max);
    }

    const inputRange = document.getElementById("date-range").value.trim();
    let dataInizio, dataFine;
    if (inputRange.match(/^[a-z]+\s+\d{4}$/i)) {
        const { startDate, endDate } = getMonthDateRange(inputRange);
        dataInizio = startDate;
        dataFine = endDate;
    } else {
        const { dataInizio: ds, dataFine: df } = parseDateRange(inputRange);
        dataInizio = convertDDMMYYYYtoDate(ds);
        dataFine = convertDDMMYYYYtoDate(df);
    }

    criteri.dataInizio = convertDDMMYYYYtoYYYYMMDD(formatDDMMYYYY(dataInizio));
    criteri.dataFine = convertDDMMYYYYtoYYYYMMDD(formatDDMMYYYY(dataFine));

     await tracciaSpeseClick(criteri);
}

async function pulisci(){
    ricercaProgetto.value = "";
    document.getElementById("importoMaxEntrata").value = "";
    document.getElementById("importoMinEntrata").value = "";
    document.getElementById("importoMaxEntrata").value = "";
    document.getElementById("importoMinEntrata").value = "";

    const selectedCards = document.querySelectorAll('#categorieCardsEntrata .card.selected');
    selectedCards.forEach(card =>{
        card.classList.remove("selected")
    });

    document.getElementById("ricerca-categorie-over").value = "";
    const allCats = document.getElementById('categorieCardsEntrata');
    const categorie = await getCategorie();
    const fragment = document.createDocumentFragment();
    categorie.forEach((cat, i) => {
        const card = catOverlay(cat.categoria, "getSpese", null);
        card.style.animationDelay = `${i * 0.1}s`;
        fragment.appendChild(card);
    });
    allCats.replaceChildren(fragment);

    createCriteri();
}

export async function criteriGraph() {

    let criteri = {};
    const inputRange = document.getElementById("date-range-graph").value.trim();

    let dataInizio, dataFine;
    if (inputRange.match(/^[a-z]+\s+\d{4}$/i)) {
        const { startDate, endDate } = getMonthDateRange(inputRange);
        dataInizio = startDate;
        dataFine = endDate;
    } else {
        const { dataInizio: ds, dataFine: df } = parseDateRange(inputRange);
        dataInizio = convertDDMMYYYYtoDate(ds);
        dataFine = convertDDMMYYYYtoDate(df);
    }

    criteri.dataInizio = convertDDMMYYYYtoYYYYMMDD(formatDDMMYYYY(dataInizio));
    criteri.dataFine = convertDDMMYYYYtoYYYYMMDD(formatDDMMYYYY(dataFine));
    creaGraficoTorta(criteri);
    creaGraficoBar();
}

function setupProjectManagement() {
    const management = document.getElementById("project-management");
    const list = document.getElementById("project-management-list");
    const dialog = document.getElementById("project-delete-dialog");
    const message = document.getElementById("project-delete-message");
    let selectedProject;

    async function renderProjects() {
        const projects = await getProjects();
        const rows = projects.map(project => {
            const row = document.createElement("li");
            const name = document.createElement("span");
            name.textContent = project.nome;
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Elimina";
            button.setAttribute("aria-label", "Elimina " + project.nome);
            button.addEventListener("click", async () => {
                let usage;
                try {
                    usage = await getProjectUsage(project.projectId);
                } catch (error) {
                    console.error(error);
                    showErrorToast("Impossibile leggere i collegamenti del progetto");
                    return;
                }
                const [expenses, budgets, recurrences] = usage;
                if (dialog.open) return;
                selectedProject = project;
                message.textContent = '"' + project.nome + '" è associato a ' + expenses +
                    ' uscite, ' + budgets + ' budget e ' + recurrences + ' ricorrenze di uscita.';
                dialog.returnValue = "cancel";
                dialog.showModal();
            });
            row.append(name, button);
            return row;
        });
        if (!rows.length) {
            const row = document.createElement("li");
            row.textContent = "Nessun progetto";
            rows.push(row);
        }
        list.replaceChildren(...rows);
    }

    management.addEventListener("toggle", () => {
        if (management.open) renderProjects();
    });
    document.querySelector('nav a[data-target="impostazioni"]').addEventListener("click", () => {
        if (management.open) renderProjects();
    });

    dialog.addEventListener("close", async () => {
        if (dialog.returnValue !== "delete") return;
        const { projectId } = selectedProject;
        try {
            await deleteProject(projectId);
            for (const select of document.querySelectorAll("#ricerca-progetto, #budget-search-project, select[name='projectId']")) {
                Array.from(select.options).find(option => option.value === projectId)?.remove();
            }
            await renderProjects();
            showToast("Progetto eliminato", "success");
        } catch (error) {
            console.error(error);
            showErrorToast("Errore durante l’eliminazione del progetto");
        }
    });
}

const selectedBudgetCategories = new Set();

function setupBudgetSearch() {
    const overlay = document.getElementById("budgetSearchOverlay");
    const button = document.getElementById("getBudgetBtn");
    const categorySearch = document.getElementById("budget-search-category");
    const categoryList = document.getElementById("budget-search-categories");
    const project = document.getElementById("budget-search-project");
    const min = document.getElementById("budget-search-min");
    const max = document.getElementById("budget-search-max");

    let categoryRevision = 0;
    async function renderCategories() {
        const revision = ++categoryRevision;
        const search = categorySearch.value.trim();
        const criteria = search ? [search, ...selectedBudgetCategories] : [];
        const categories = await getCategorie(criteria);
        if (revision !== categoryRevision) return;
        categoryList.replaceChildren(...categories.map(({ categoria }) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "card";
            card.textContent = categoria;
            const selected = selectedBudgetCategories.has(categoria);
            card.classList.toggle("selected", selected);
            card.setAttribute("aria-pressed", selected);
            card.addEventListener("click", () => {
                const active = !selectedBudgetCategories.has(categoria);
                if (active) selectedBudgetCategories.add(categoria);
                else selectedBudgetCategories.delete(categoria);
                renderCategories();
                criteriBudget();
            });
            return card;
        }));
    }

    function setOpen(open) {
        overlay.classList.toggle("showOverlay", open);
        overlay.inert = !open;
        button.setAttribute("aria-expanded", open);
    }

    button.addEventListener("click", async () => {
        if (!overlay.inert) {
            setOpen(false);
            return;
        }
        const isCurrent = prepareBudgetPanel();
        await renderCategories();
        await populateProjects(project, project.value, false, "Tutti i progetti");
        if (!isCurrent()) return;
        setOpen(true);
        await criteriBudget();
    });
    document.addEventListener("click", event => {
        if (!overlay.inert && !event.target.closest("#budgetSearchOverlay, #getBudgetBtn, .flatpickr-calendar")) {
            setOpen(false);
        }
    });
    categorySearch.addEventListener("input", renderCategories);
    project.addEventListener("change", criteriBudget);
    min.addEventListener("input", criteriBudget);
    max.addEventListener("input", criteriBudget);
    document.getElementById("budget-search-reset").addEventListener("click", () => {
        selectedBudgetCategories.clear();
        categorySearch.value = project.value = min.value = max.value = "";
        renderCategories();
        setDateRange("#date-range-budget");
    });
}

let budgetSearchRevision = 0;

export async function criteriBudget(){
    const revision = ++budgetSearchRevision;
    const inputRange = document.getElementById("date-range-budget").value.trim();
    const budgetList = document.getElementById("budget-lista");
    let start, end;
    if (/^[a-z]+\s+\d{4}$/i.test(inputRange)) {
        ({ startDate: start, endDate: end } = getMonthDateRange(inputRange));
    } else {
        const range = parseDateRange(inputRange);
        start = convertDDMMYYYYtoDate(range.dataInizio);
        end = convertDDMMYYYYtoDate(range.dataFine);
    }
    if (!start || !end) return;

    const isoDate = date => convertDDMMYYYYtoYYYYMMDD(formatDDMMYYYY(date));
    const first = isoDate(start);
    const last = isoDate(end);
    const firstYear = isoDate(new Date(start.getFullYear(), 0, 1));
    const lastYear = isoDate(new Date(end.getFullYear(), 11, 31));
    const [budgets, projects] = await Promise.all([getBudgets(), getProjects()]);
    const projectNames = new Map(projects.map(project => [project.projectId, project.nome]));
    const visibleBudgets = [];
    const categories = new Set(selectedBudgetCategories);
    const projectId = document.getElementById("budget-search-project").value;
    const min = document.getElementById("budget-search-min").value;
    const max = document.getElementById("budget-search-max").value;

    for (const budget of budgets) {
        if (categories.size && !categories.has(budget.categoria)) continue;
        if (projectId && budget.projectId !== projectId) continue;
        if ((min !== "" && budget.destinato < Number(min)) || (max !== "" && budget.destinato > Number(max))) continue;
        let dataInizio = first;
        let dataFine = last;
        if (budget.periodo === "personalizzato") {
            if (!budget.dataInizio || !budget.dataFine || budget.dataInizio > last || budget.dataFine < first) continue;
            ({ dataInizio, dataFine } = budget);
        } else if (budget.periodo === "annuale") {
            if (budget.data < firstYear || budget.data > lastYear) continue;
            const year = budget.data.slice(0, 4);
            dataInizio = year + "-01-01";
            dataFine = year + "-12-31";
        } else if (budget.data < first || budget.data > last) {
            continue;
        }
        budget.projectName = projectNames.get(budget.projectId);
        budget.usato = Math.abs(await getUsciteBudget(budget, dataInizio, dataFine));
        visibleBudgets.push(budget);
    }

    if (revision !== budgetSearchRevision) return;
    budgetList.innerHTML = "";
    if(visibleBudgets.length > 0){
        visibleBudgets.forEach( bgt => {
            const container = compBudget(bgt)
            budgetList.appendChild(container);
        });
    }else{
        const container = nessunBudgetComponent("budget");
        budgetList.appendChild(container);
    }
}

async function getUsciteBudget(budget, dataInizio, dataFine){
    const filtri = {
            categoria: budget.categoria,
            projectId: budget.projectId,
            dataInizio: dataInizio,
            dataFine: dataFine
        };

    const result = await queryTrns(filtri, false);
    const tot = result.reduce((sum, trn) => {
        return sum + (Number(trn.importo) || 0);
    }, 0);

    return tot;
}




export function getMonthDateRange(monthNameYear) {
  const monthNames = [
    'gennaio','febbraio','marzo','aprile','maggio','giugno',
    'luglio','agosto','settembre','ottobre','novembre','dicembre'
  ];

  const parts = monthNameYear.trim().toLowerCase().split(' ');
  if (parts.length < 2) {
    throw new Error('Formato non valido: usare "mese anno", es. "agosto 2025"');
  }

  const year = parseInt(parts[parts.length - 1], 10);
  const monthName = parts.slice(0, parts.length - 1).join(' ');
  const monthIndex = monthNames.indexOf(monthName);

  if (monthIndex === -1 || isNaN(year)) {
    throw new Error(`Mese non valido: "${monthNameYear}"`);
  }

  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 0);

  return { startDate, endDate };
}

export function getYearDateRange(monthNameYear) {
  const parts = monthNameYear.trim().toLowerCase().split(' ');
  if (parts.length < 2) {
    throw new Error('Formato non valido: usare "mese anno", es. "agosto 2025"');
  }
  const yearInput = parts[1];
  const year = parseInt(yearInput, 10);

  if (isNaN(year) || year < 0) {
    throw new Error(`Anno non valido: "${yearInput}"`);
  }

  const startYear = new Date(year, 0, 1);
  const endYear   = new Date(year, 11, 31);

  return { startYear, endYear };
}

export function parseDateRange(str) {
  const [dataInizio = null, dataFine = null] = str.split(' – ');
  return { dataInizio, dataFine };
}

export function convertDDMMYYYYtoDate(str) {
 if(isValid(str)){
  const [d, m, y] = str.split('/');
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }
  return;
}

export function formatDDMMYYYY(date) {
    if(isValid(date)){
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const y = date.getFullYear();
      return `${d}/${m}/${y}`;
    }
return;

}

export function convertDDMMYYYYtoYYYYMMDD(str) {
    if(isValid(str)){
        const [d, m, y] = str.split('/');
        return `${y}-${m}-${d}`;
    }
  return;
}


async function deleteSpesaBtn() {

    try{
        const tab = recuperaTab();
        let selectedCards;
        if(!tab){
            selectedCards = document.querySelectorAll('.spesa.spesaColor.selected');
        }else if(tab){
            selectedCards = document.querySelectorAll('.spesa.entrataColor.selected');
        }

        if (selectedCards.length === 0) {
            showErrorToast("Seleziona almeno una riga da eliminare.","error");
            return;
        }

        const criteri = [];
        if (selectedCards.length > 0) {
             selectedCards.forEach(card => {
            if (card.getAttribute('datains') !== null) {
                criteri.push(card.getAttribute('datains'));
            }
        });
        }

        if (criteri.length === 0) {
            showErrorToast("Errore durante l'eliminazione.","error");
            return;
        }

        await deleteSpese(criteri, tab);

        for (const card of selectedCards) {
            const categoria = card.querySelector(".categoria");
            const oldValue = categoria.innerText;
            await updateRichieste(oldValue, "less");
        }

        if(criteri.length === 1){
            showToast("Uscita eliminata con successo", "success");
        } else {
            showToast("Uscite eliminate con successo", "success");
        }

        createCriteri();

    }catch(error){
        console.log(error);
    }

}


function estraiImporto(str) {
  const clean = str.replace(/[^0-9\.-]+/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}


async function deleteCategoriaBtn() {
    const selectedComponents = document.querySelectorAll('.cat.selected');
    const selectedCards = Array.from(selectedComponents).map(card =>
        card.querySelector('.cat-name').textContent.trim()
    );

    if (selectedCards.length === 0) {
        showErrorToast("Seleziona almeno una categoria da eliminare.","error");
        return;
    }

    const criteri = [];
    if (selectedCards.length > 0) {
         selectedCards.forEach(card => {
            criteri.push(card.trim());
    });
    }

    if (criteri.length === 0) {
        showErrorToast("Errore durante l'eliminazione.","error");
        return;
    }

    await deleteCategorie(criteri);

    if(criteri.length === 1){
        showToast("Categoria eliminata con successo", "success");
    } else {
        showToast("Categorie eliminate con successo", "success");
    }

    categorieCreateComponent();
}

async function deleteBudgetBtn(){
    try{
        const selectedComponents = document.querySelectorAll('.budgetContainer.selected');
        const selectedCards = Array.from(selectedComponents).map(card => card.id);
        if (selectedCards.length === 0) {
            showErrorToast("Seleziona almeno un budget da eliminare.","error");
            return;
        }
        for(const id of selectedCards){
            await deleteBudget(id);
        };

        if(selectedCards.length === 1){
            showToast("Budget eliminato con successo", "success");
        } else {
            showToast("Budget eliminati con successo", "success");
        }

        criteriBudget();
    }catch(err){
        showErrorToast("Errore durante eliminazione budget", "error");
        console.log("Errore durante eliminazione budget", err);
    }

}

export function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 100);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

export function showErrorToast(message,type = "error") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 100);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
