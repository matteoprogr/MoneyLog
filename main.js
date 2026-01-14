import { saveSpesa } from './queryDexie.js';
import { queryTrns } from './queryDexie.js';
import { deleteSpese } from './queryDexie.js';
import { updateCategoria } from './queryDexie.js';
import { deleteCategorie } from './queryDexie.js';
import { creaSpesaComponent } from './card.js';
import { creaComponentTotale } from './card.js';
import { overlayAddSpesa } from './card.js';
import { nessunaElementoComponent } from './card.js';
import { nessunaCategoriaComponent } from './card.js';
import { categoriaComponent } from './card.js';
import { getCategorie } from './queryDexie.js';
import { overlayRicerca } from './card.js';
import { overlayEdit } from './card.js';
import { recuperaTab } from './card.js';
import { capitalizeFirstLetter } from './queryDexie.js';
import { saveCategoria } from './queryDexie.js';
import { syncDati } from './supaSync.js';


/////////  SERVICE WORKER ////////////////
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered:', reg))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}


///// supabase client /////
let supabaseClient = null;
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const supabaseUrl = 'https://xheobxtzijhgfuhqhnyi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoZW9ieHR6aWpoZ2Z1aHFobnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjMyNjAsImV4cCI6MjA4Mzc5OTI2MH0.BwMxGvMJ_d8pmN6nPCOL_NP2qtWzlmgkkLqvuf4RiyA';
supabaseClient = createClient(supabaseUrl, supabaseKey);

export async function getSupaClient(){
return supabaseClient;
}




//  EVENT LISTENER //////////////////////////////////
document.getElementById("deleteSpesaBtn").addEventListener("click", deleteSpesaBtn);
document.getElementById("deleteCategoriaBtn").addEventListener("click", deleteCategoriaBtn);
document.getElementById("importoMinEntrata").addEventListener("input", createCriteri);
document.getElementById("importoMaxEntrata").addEventListener("input", createCriteri);
document.getElementById("ricerca-categorie").addEventListener("input", categorieCreateComponent);
document.getElementById("indietro").addEventListener("click", function(event) {  setDirezioneData(event, false); });
document.getElementById("avanti").addEventListener("click", function(event) { setDirezioneData(event, false); });
document.getElementById("indietroGraph").addEventListener("click", function(event) { setDirezioneData(event, true); });
document.getElementById("avantiGraph").addEventListener("click", function(event) { setDirezioneData(event, true); });
document.getElementById("addCategoriaBtn").addEventListener("click", saveNewCategoria);
document.getElementById('sign-in').addEventListener('click', loginWithGoogle);
document.getElementById('sign-out').addEventListener('click', logout);
document.getElementById('btnSync').addEventListener('click', syncDati);




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
            setDateRange();
        }
        if (targetId === 'categorie-section') {
            categorieCreateComponent()
        }
        if(targetId === "grafici"){
            setDateRangeGraph();
            creaGraficoBar();
        }

        const selectedCards = document.querySelectorAll('.selected');
        selectedCards.forEach(card => {card.classList.remove('selected');});
    });
});



// DOM CONTENT LOADED ///////////////////////////////
document.addEventListener("DOMContentLoaded", () => {
    getSupaClient();
    checkAuth();
    targetId = "movimenti";
    overlayAddSpesa();
    overlayRicerca();
    setDateRange();
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
    await saveCategoria(newCategoria);
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

function sommaAnnua(transazioni){
    let somma = 0;
    transazioni.forEach(item => {
        somma += Math.abs(Number(item.importo)) || 0;
    });
    return somma;
}

async function creaGraficoBar(){
const echarts = window.echarts;
const chart = echarts.init(document.getElementById('chart'));
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
const colorBilancio = totB >= 0 ? '#4caf50' : '#ff5252';

const option = {
  title: {
    text: `Bilancio annuale:   ${totB.toFixed(2)}`,
    left: 'center',
    top: 50,
    textStyle: {
      fontSize: 12,
      color: colorBilancio
    }
  },
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
    axisLabel: { rotate: 30 , interval: 0},
    axisTick: { alignWithLabel: true }
  },
  yAxis: {
    type: 'value'
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
const canvas = document.querySelector('#chart canvas');
canvas.style.margin = '1rem';

}

async function creaGraficoTorta(criteri){
    const echarts = window.echarts;
    const chartSpese = echarts.init(document.getElementById('chartCakeSpese'));
    const chartEntrate = echarts.init(document.getElementById('chartCakeEntrate'));

    const spese = await queryTrns(criteri,false);
    const entrate = await queryTrns(criteri,true);
    const optionSpese = await createOption(spese,'Uscita');
    const optionEntrate = await createOption(entrate,'Entrata');

    chartSpese.setOption(optionSpese);
    chartEntrate.setOption(optionEntrate);

    attachLegendHandler(chartSpese);
    attachLegendHandler(chartEntrate);

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

async function createOption(trns, trnsType){

  const aggregato = {};

  trns.forEach(item => {
    const categoria = item.categoria;
    const importo = Number(item.importo) || 0;
    if (!aggregato[categoria]) {
      aggregato[categoria] = 0;
    }
    aggregato[categoria] += Math.abs(importo);
  });

  const data = Object.entries(aggregato).map(([name, value]) => ({ name, value }));
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


function setDirezioneData(event,graph){
    const clickedId = event.target.id;
    let dataPartenza;
    if(graph){
        dataPartenza = document.getElementById("date-range-graph")._flatpickr;
    }else{
        dataPartenza = document.getElementById("date-range")._flatpickr;
    }

    const mesePartenza = dataPartenza.currentMonth;
    const annoPartenza = dataPartenza.currentYear;
    const direzione = clickedId;
    let anno = annoPartenza;
    let mese = mesePartenza
    if(direzione === "avanti" || direzione === "avantiGraph"){
        mese = mesePartenza + 1;
        if(mesePartenza == 12){
            anno = annoPartenza + 1;
            mese = 1;
        }
        if(graph){
            setDateRangeGraph("#date-range-graph", mese, anno);
            creaGraficoBar();
        }else {
            setDateRange("#date-range", mese, anno);
        }
    }

    if(direzione === "indietro" || direzione === "indietroGraph"){
        mese = mesePartenza - 1;
        if(mesePartenza == 1){
            anno = annoPartenza - 1;
            mese = 12;
        }
        if(graph){
            setDateRangeGraph("#date-range-graph", mese, anno);
            creaGraficoBar();
        }else {
            setDateRange("#date-range", mese, anno);
        }
    }
}


export function setDateRange(range = "#date-range", mese, anno) {
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

      createCriteri();
    }
  });

    createCriteri();
}

export function setDateRangeGraph(range = "#date-range-graph", mese, anno) {
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

      criteriGraph();
    }
  });

     criteriGraph();
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

        listaTransazioni.innerHTML = "";
        transazioni.forEach(trns => {
          const nodo = creaSpesaComponent(trns,tabActive);
          listaTransazioni.appendChild(nodo);
        });

        const totale = creaComponentTotale(transazioni,tabActive);
        listaTransazioniTotale.innerHTML = "";
        zeroTransazioni.innerHTML = "";
        const totaleText = totale.innerText.trim();
        if(totaleText !== "0.00") {
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

    const categorie = await getCategorie(catInput);
    const categorieList = document.getElementById("gestione-categorie");
    const zeroCategorie = document.getElementById("zero-categorie");
    zeroCategorie.innerHTML = "";
    categorieList.innerHTML = "";
    if (!categorie || categorie.length === 0) {
        const nodo = nessunaCategoriaComponent("categoria")
        zeroCategorie.appendChild(nodo);
    }else{
        categorie.forEach(cat => {
          const nodo = categoriaComponent(cat.categoria);
          categorieList.appendChild(nodo);
        });
    }
}


export function isValid(value) {
    return value != null && !Number.isNaN(value) && value !== "" && value != undefined;
}

export async function createCriteri() {
    let criteri = {};
    const tab = recuperaTab();
    let min = 0;
    let max = 0;
    const selectedCards = document.querySelectorAll('.card.selected');
    if (selectedCards.length > 0) {
     criteri = { categoria: [] };
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
}



function getMonthDateRange(monthNameYear) {
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

function parseDateRange(str) {
  const [dataInizio = null, dataFine = null] = str.split(' – ');
  return { dataInizio, dataFine };
}

function convertDDMMYYYYtoDate(str) {
 if(isValid(str)){
  const [d, m, y] = str.split('/');
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }
  return;
}

function formatDDMMYYYY(date) {
if(isValid(date)){
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}
return;

}

function convertDDMMYYYYtoYYYYMMDD(str) {
    if(isValid(str)){
        const [d, m, y] = str.split('/');
        return `${y}-${m}-${d}`;
    }
  return;
}


async function deleteSpesaBtn() {
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
    await updateCategoria(oldValue, null, true, true);
}

    if(criteri.length === 1){
        showToast("Spesa eliminata con successo", "success");
    } else {
        showToast("Spese eliminate con successo", "success");
    }

    createCriteri();
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
        showErrorToast("Seleziona almeno una riga da eliminare.","error");
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


//// AUTENTICAZIONE ///////
let currentUser = null;// variabile globale contenente i dati dell' user corrente


// Metodo per autenticazione utente taite supabase auth
// In caso di errore viene restitito un toast e loggato l'errore
export async function checkAuth(){
    try{
        const { data: {session } , error } = await supabaseClient.auth.getSession();
        if(error){
            console.error("❌ Errore controllo sessione:", error);
            showToast("Errore nella sessione", "error");
            return null;
        }
        if(session && session.user){
            console.log("✅ Utente autenticato:", session.user.email);
            currentUser = session.user;
            return currentUser;
        }else{
            return null;
        }
    }catch(error){
    console.error("Errore durante checkAuth",error);
    }
}

// Metodo di accesso OAuth third-party provider tramite google
async function loginWithGoogle() {
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
     redirectTo: 'https://matteoprogr.github.io/MoneyLog/'
    }
  });
  if (error) console.error('Login error:', error);
}

// Metodo di logout
async function logout() {
  const { error } = await supabaseClient.auth.signOut()
  if (error) {
    console.error('Errore logout:', error.message)
  }
  currentUser = null;
}

export async function getUser(){
    try{
        if(isValid(currentUser) && isValid(currentUser.id)) {
            return currentUser.id;
        }else{
            const user = await checkAuth();
            if(isValid(user) && isValid(user.id)) {
                currentUser = user;
            }else{
                throw new Error("Utente non autenticato");
            }
        }
        return currentUser;
    }catch(error){
        console.log("Errore durante recupero user", error);
        throw error;
    }
}