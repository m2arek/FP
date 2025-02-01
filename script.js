/***************************************************
 * 1) INITIALISER LA CARTE (Google Satellite)
 ***************************************************/
const map = L.map("map").setView([48.8566, 2.3522], 18);
const tileLayer = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
  maxZoom: 20,
  subdomains: ["mt0", "mt1", "mt2", "mt3"],
  attribution: "© Google",
});
tileLayer.addTo(map);

let searchMarker = null;

/***************************************************
 * 2) DESSIN LIBRE SUR CANVAS
 ***************************************************/
const drawingCanvas = document.getElementById("drawingCanvas");
const ctx = drawingCanvas.getContext("2d");
const AdresseField = document.getElementById("Adresse");

let drawing = false;
let drawingEnabled = false;

const toggleDrawingButton = document.getElementById("toggleDrawingButton");
toggleDrawingButton.addEventListener("click", () => {
  drawingEnabled = !drawingEnabled;
  drawingCanvas.style.pointerEvents = drawingEnabled ? "auto" : "none";
  toggleDrawingButton.textContent = drawingEnabled
    ? "Désactiver le dessin"
    : "Activer le dessin (main levée)";
});

function resizeCanvas() {
  drawingCanvas.width = drawingCanvas.offsetWidth;
  drawingCanvas.height = drawingCanvas.offsetHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

drawingCanvas.addEventListener("mousedown", (event) => {
  if (!drawingEnabled) return;
  drawing = true;
  ctx.beginPath();
  const rect = drawingCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  ctx.moveTo(x, y);
});
drawingCanvas.addEventListener("mouseup", () => {
  if (!drawingEnabled) return;
  drawing = false;
  ctx.beginPath();
});
drawingCanvas.addEventListener("mousemove", (event) => {
  if (!drawing || !drawingEnabled) return;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "red";

  const rect = drawingCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  ctx.lineTo(x, y);
  ctx.stroke();
});

/***************************************************
 * A) OUTILS LEAFLET DRAW
 ***************************************************/
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  draw: {
    marker: false,
    circle: false,
    circlemarker: false,
    polygon: true,
    rectangle: true,
    polyline: true
  },
  edit: {
    featureGroup: drawnItems
  }
});

let measureActive = false;
const measureButton = document.getElementById("toggleMeasureButton");
measureButton.addEventListener("click", () => {
  measureActive = !measureActive;
  if (measureActive) {
    map.addControl(drawControl);
    measureButton.textContent = "Terminer la mesure";
  } else {
    map.removeControl(drawControl);
    measureButton.textContent = "Mesurer une surface";
  }
});

function computeBearing(lat1, lng1, lat2, lng2) {
  const toRad = (val) => val * Math.PI / 180;
  const toDeg = (val) => val * 180 / Math.PI;
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
    - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = Math.atan2(y, x);
  brng = toDeg(brng);
  return (brng + 360) % 360;
}

function mapAngleToAspect(angle) {
  const targets = [
    { label: "SUD", deg: 180, aspect: 0 },
    { label: "EST", deg: 90, aspect: -90 },
    { label: "OUEST", deg: 270, aspect: 90 },
    { label: "SUD-EST", deg: 135, aspect: -45 },
    { label: "SUD-OUEST", deg: 225, aspect: 45 },
  ];
  let best = null, bestDiff = 9999;
  for (let t of targets) {
    let diff = Math.abs(angle - t.deg);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = t;
    }
  }
  return best;
}

map.on(L.Draw.Event.CREATED, function (e) {
  const layer = e.layer;
  drawnItems.addLayer(layer);

  if (e.layerType === "polygon" || e.layerType === "rectangle") {
    let latLngs = layer.getLatLngs();
    if (Array.isArray(latLngs[0])) {
      latLngs = latLngs[0];
    }
    const area = L.GeometryUtil.geodesicArea(latLngs);
    const areaInt = Math.round(area);

    alert(`Surface mesurée : ${areaInt.toLocaleString('fr-FR')} m²`);
    document.getElementById("Surface toiture").value = areaInt;

    updateProductionPotential();
  } else if (e.layerType === "polyline") {
    const latLngs = layer.getLatLngs();
    if (latLngs.length < 2) {
      alert("Tracez au moins 2 points pour la ligne d'orientation.");
      return;
    }
    const first = latLngs[0];
    const last = latLngs[latLngs.length - 1];
    const angle = computeBearing(first.lat, first.lng, last.lat, last.lng);
    const aspectObj = mapAngleToAspect(angle);
    if (aspectObj) {
      document.getElementById("orientationIrr").value = aspectObj.aspect.toString();
      alert(`Orientation déterminée: ${aspectObj.label} (aspect=${aspectObj.aspect})`);
    }
    drawnItems.removeLayer(layer);
  }
});

/***************************************************
 * 3) RECHERCHE D'ADRESSE + MARQUEUR
 ***************************************************/
async function searchAddress(event) {
  event.preventDefault();
  const address = document.getElementById("address").value;
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
    );
    const data = await response.json();
    if (data.length > 0) {
      const { lat, lon } = data[0];
      map.setView([lat, lon], 18);
      AdresseField.value = address;

      if (searchMarker) {
        map.removeLayer(searchMarker);
      }
      searchMarker = L.marker([lat, lon]).addTo(map);
      searchMarker.bindPopup(`Adresse trouvée : ${address}`).openPopup();

      document.getElementById("latitudeIrr").value = lat;
      document.getElementById("longitudeIrr").value = lon;
    } else {
      alert("Adresse introuvable.");
    }
  } catch (error) {
    console.error("Erreur recherche adresse:", error);
    alert("Une erreur est survenue lors de la recherche de l'adresse.");
  }
}

/***************************************************
 * 3B) CALCUL PRODUCTIBLE (API PVGIS) + Parsing mensuel
 ***************************************************/
let monthlyProductionData = [];

async function getProductible(lat, lon, aspectValue) {
  const originalUrl = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?outputformat=basic&lat=${lat}&lon=${lon}&raddatabase=PVGIS-SARAH2&peakpower=1&loss=14&pvtechchoice=crystSi&angle=35&aspect=${aspectValue}&usehorizon=1`;
  const proxyUrl = `https://corsproxy.io/?key=a32495b2&url=${encodeURIComponent(originalUrl)}`;
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) return null;
    const text = await response.text();
    const lines = text.split("\n");

    let yearProduction = null;
    let tempMonthly = [];

    for (let line of lines) {
      let cleanLine = line.trim();
      if (!cleanLine) continue;
      if (cleanLine.includes("Year")) {
        const parts = cleanLine.split("\t").map(s=>s.trim());
        yearProduction = parseFloat(parts[1]);
      } else if (/^\d+\s/.test(cleanLine)) {
        const parts = cleanLine.split("\t").map(s=>s.trim());
        if (parts.length >= 3) {
          const monthNumber = parseInt(parts[0],10);
          const E_mValue = parseFloat(parts[2]);
          tempMonthly.push({ month: monthNumber, E_m: E_mValue });
        }
      }
    }

    monthlyProductionData = tempMonthly;

    return {
      yearProduction,
      monthlyProduction: tempMonthly
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}

document.getElementById("calculateIrrButton").addEventListener("click", async () => {
  const lat = parseFloat(document.getElementById("latitudeIrr").value);
  const lon = parseFloat(document.getElementById("longitudeIrr").value);
  const aspectValue = parseFloat(document.getElementById("orientationIrr").value);

  if (isNaN(lat) || isNaN(lon)) {
    alert("Veuillez d'abord renseigner la latitude et la longitude (recherche d'adresse).");
    return;
  }
  const result = await getProductible(lat, lon, aspectValue);
  if (result !== null && result.yearProduction !== null) {
    document.getElementById("productible").value =
      result.yearProduction.toLocaleString('fr-FR');
    fillMonthlyProductionTable(result.monthlyProduction);
  } else {
    alert("Impossible de récupérer le productible. Vérifiez la connexion ou les données.");
  }
  updateProductionPotential();
});

function fillMonthlyProductionTable(monthlyData) {
  const tableBody = document.querySelector("#monthlyProductionTable tbody");
  tableBody.innerHTML = "";

  const moisNoms = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];

  monthlyData.forEach(item => {
    const row = document.createElement("tr");
    const monthCell = document.createElement("td");
    const productionCell = document.createElement("td");

    const idx = item.month - 1;
    monthCell.textContent = (idx>=0 && idx<12) ? moisNoms[idx] : `Mois ${item.month}`;
    productionCell.textContent = item.E_m?.toLocaleString('fr-FR') || "-";

    row.appendChild(monthCell);
    row.appendChild(productionCell);
    tableBody.appendChild(row);
  });
}

/***************************************************
 * 3C) CALCUL "POTENTIEL DE PRODUCTION"
 ***************************************************/
function updateProductionPotential() {
  const surfaceStr = document.getElementById("Surface toiture").value
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const exclStr = document.getElementById("exclusionPercent").value;
  const panelPowerStr = document.getElementById("puissancePanneau").value;
  const productibleStr = document.getElementById("productible").value
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");

  const surface = parseFloat(surfaceStr) || 0;
  const exclusionPercent = parseFloat(exclStr) || 0;
  const panelPower = parseFloat(panelPowerStr) || 420;
  const productibleVal = parseFloat(productibleStr) || 0;

  const surfaceUtile = surface * (1 - (exclusionPercent / 100));
  const nbPanels = Math.floor(surfaceUtile / 2);
  const puissanceMaxW = nbPanels * panelPower;
  const puissanceMaxKW = Math.round(puissanceMaxW / 1000);

  const production = Math.round(puissanceMaxKW * productibleVal);

  document.getElementById("nombrePVMax").value = nbPanels.toLocaleString('fr-FR');
  document.getElementById("puissanceMaxPV").value = puissanceMaxKW.toLocaleString('fr-FR');
  document.getElementById("productionInstall").value = production.toLocaleString('fr-FR');
}

/***************************************************
 * 4) EXPORT PDF (2 PAGES)
 ***************************************************/
function saveMapAsPDF() {
  const mapContainer = document.getElementById("map-container");
  const userForm = document.getElementById("userForm");

  html2canvas(mapContainer, {
    useCORS: true,
    scale: 2,
  }).then((canvas) => {
    const mapImage = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();

    pdf.addImage(mapImage, "PNG", 10, 10, 190, 100);

    let yOffset = 120;
    const formData = new FormData(userForm);
    formData.forEach((value, key) => {
      if (value) {
        pdf.text(`${key} : ${value}`, 10, yOffset);
        yOffset += 10;
      }
    });

    pdf.addPage();
    pdf.text("Consommation mensuelle", 10, 10);
    html2canvas(document.getElementById("consumptionTableContainer"), {
      useCORS: true,
      scale: 2,
    }).then((tableCanvas) => {
      const tableImage = tableCanvas.toDataURL("image/png");
      pdf.addImage(tableImage, "PNG", 10, 20, 190, 0);

      const companyName = document.getElementById("companyName").value;
      const pdfFileName = companyName
        ? `Formulaire_${companyName}.pdf`
        : "Formulaire.pdf";
      pdf.save(pdfFileName);
    });
  });
}

/***************************************************
 * 5) SAUVEGARDER / CHARGER JSON
 ***************************************************/
const saveButton = document.getElementById("saveToFile");
const loadFileInput = document.getElementById("loadFromFile");
const uploadButton = document.getElementById("uploadFile");

saveButton.addEventListener("click", () => {
  const form = document.getElementById("userForm");
  const rawFormData = new FormData(form);

  const formObject = {};
  rawFormData.forEach((value, key) => {
    if (formObject[key] !== undefined) {
      if (!Array.isArray(formObject[key])) {
        formObject[key] = [formObject[key]];
      }
      formObject[key].push(value);
    } else {
      formObject[key] = value;
    }
  });

  const center = map.getCenter();
  formObject["mapCenterLat"] = center.lat;
  formObject["mapCenterLng"] = center.lng;
  formObject["mapZoom"] = map.getZoom();
  formObject["canvasImage"] = drawingCanvas.toDataURL();

  const shapesGeoJSON = drawnItems.toGeoJSON();
  formObject["drawnShapes"] = shapesGeoJSON;

  // Sauvegarde la production mensuelle
  formObject["monthlyProductionData"] = monthlyProductionData;

  const companyName = formObject["companyName"] || "Formulaire";
  const fileName = `Formulaire_${companyName}.json`;

  const jsonString = JSON.stringify(formObject, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
});

uploadButton.addEventListener("click", () => {
  loadFileInput.click();
});

loadFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const jsonData = JSON.parse(e.target.result);
      const form = document.getElementById("userForm");

      Object.keys(jsonData).forEach((key) => {
        const dataValue = jsonData[key];
        if (["mapCenterLat","mapCenterLng","mapZoom","canvasImage","drawnShapes","monthlyProductionData"].includes(key)) {
          return;
        }
        if (Array.isArray(dataValue)) {
          dataValue.forEach((val) => {
            const checkbox = form.querySelector(`[name="${key}"][value="${val}"]`);
            if (checkbox) {
              checkbox.checked = true;
            }
          });
        } else {
          const input = form.querySelector(`[name="${key}"]`);
          if (input) {
            input.value = dataValue;
          }
        }
      });

      if (jsonData["mapCenterLat"] !== undefined &&
          jsonData["mapCenterLng"] !== undefined &&
          jsonData["mapZoom"] !== undefined) {
        map.setView([jsonData["mapCenterLat"], jsonData["mapCenterLng"]], jsonData["mapZoom"]);
      }

      if (jsonData["canvasImage"]) {
        const image = new Image();
        image.onload = function () {
          ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
          ctx.drawImage(image, 0, 0);
        };
        image.src = jsonData["canvasImage"];
      }

      if (jsonData["drawnShapes"]) {
        drawnItems.clearLayers();
        L.geoJson(jsonData["drawnShapes"]).eachLayer(function(layer) {
          drawnItems.addLayer(layer);
        });
      }

      if (jsonData["monthlyProductionData"]) {
        monthlyProductionData = jsonData["monthlyProductionData"];
        fillMonthlyProductionTable(monthlyProductionData);
      }

      for (let i = 0; i < 12; i++) {
        calculateCost(i);
      }
      updateProductionPotential();
    };
    reader.readAsText(file);
  }
});

/***************************************************
 * 6) CALCUL DU COÛT + OPTIMISATION PAR GAIN
 *  (NOUVELLE CONTRAINTE : max autoConso, min revente)
 *  + ratio de consommation diurne
 ***************************************************/

// 6.1) Coût d’installation
function costInstallation(S) {
  const raw = S * ((1.8093 - (0.00659 * S))) * 1000;
  return Math.round(raw / 100) * 100;
}

// 6.2) Calcule autoConsoGain, surplusGain, totalGain
function computeAutoAndSurplusForPower(S, tarifRachat) {
  const ratioDiurneStr = document.getElementById("ratioDiurne").value || "50";
  const ratioDiurne = parseFloat(ratioDiurneStr) || 50;

  let autoConsoGain = 0;
  let surplusGain = 0;

  for (let i = 0; i < 12; i++) {
    const kwhInput = document.getElementById(`kwh_${i}`);
    const costCell = document.getElementById(`costPerKwh_${i}`);
    if (!kwhInput || !costCell || !monthlyProductionData[i]) continue;

    const consoKwh = parseFloat(kwhInput.value) || 0;
    const consoKwhDiurne = consoKwh * (ratioDiurne / 100);

    const p_kWh = parseFloat(costCell.textContent) || 0;
    const E_m1kW = monthlyProductionData[i].E_m;
    const production = S * E_m1kW;

    const autoCons = Math.min(consoKwhDiurne, production);
    const surplus = Math.max(0, production - consoKwhDiurne);

    autoConsoGain += autoCons * p_kWh;
    surplusGain   += surplus * tarifRachat;
  }

  return {
    autoConsoGain,
    surplusGain,
    totalGain: autoConsoGain + surplusGain
  };
}

// 6.3) Recherche S => max autoConso, min revente, max total
function findBestPowerByPayback() {
  const tarifRachat = parseFloat(document.getElementById("tarifRachat").value) || 0.0761;
  let maxPowerStr = (document.getElementById("puissanceMaxPV").value || "0").replace(/\s/g, "");
  const maxPower = parseFloat(maxPowerStr) || 0;
  if (maxPower <= 0) {
    alert("Puissance max PV non définie ou nulle.");
    return;
  }

  let bestS = 1;
  let bestAutoConsoGain = 0;
  let bestSurplusGain   = Infinity;
  let bestTotalGain     = 0;

  for (let s = 1; s <= maxPower; s++) {
    const { autoConsoGain, surplusGain, totalGain } = computeAutoAndSurplusForPower(s, tarifRachat);

    if (autoConsoGain > bestAutoConsoGain) {
      bestS = s;
      bestAutoConsoGain = autoConsoGain;
      bestSurplusGain   = surplusGain;
      bestTotalGain     = totalGain;
    }
    else if (autoConsoGain === bestAutoConsoGain) {
      if (surplusGain < bestSurplusGain) {
        bestS = s;
        bestSurplusGain   = surplusGain;
        bestTotalGain     = totalGain;
      }
      else if (surplusGain === bestSurplusGain) {
        if (totalGain > bestTotalGain) {
          bestS = s;
          bestTotalGain = totalGain;
        }
      }
    }
  }

  const bestVals = computeAutoAndSurplusForPower(bestS, tarifRachat);
  calculatePreconisationWithPower(bestS, bestVals.totalGain);
}

// 6.4) Applique la puissance retenue
function calculatePreconisationWithPower(S, firstYearGain) {
  const installationCost = costInstallation(S);
  fillMonthlyPreconisation(S);
  fill20YearsPreconisation(S, firstYearGain, installationCost);
}

// 6.5) Construit le tableau mensuel (année 1)
function fillMonthlyPreconisation(S) {
  const showKwh = document.getElementById("showKwhColumns").checked;
  const tarifRachat = parseFloat(document.getElementById("tarifRachat").value) || 0.0761;
  const table = document.getElementById("preconisationMonthlyTable");

  table.innerHTML = "";

  const thead = document.createElement("thead");
  let headerRow = `<tr>
    <th>Mois</th>
    ${ showKwh ? '<th>Conso kWh</th>' : '' }
    <th>Facture Sans PV</th>
    ${ showKwh ? '<th>Autoconso kWh</th>' : '' }
    <th>Économies Autoconso</th>
    ${ showKwh ? '<th>Revente kWh</th>' : '' }
    <th>Gains Revente</th>
    <th>Facture Avec PV</th>
    <th>Total Économies</th>
  </tr>`;
  thead.innerHTML = headerRow;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const tfoot = document.createElement("tfoot");
  let footRow = `<tr>
    <th>Totaux</th>
    ${ showKwh ? '<td id="monthlySumKwhConso">-</td>' : '' }
    <td id="monthlyTotalSansPv">-</td>
    ${ showKwh ? '<td id="monthlySumKwhAuto">-</td>' : '' }
    <td id="monthlyTotalAuto">-</td>
    ${ showKwh ? '<td id="monthlySumKwhRevente">-</td>' : '' }
    <td id="monthlyTotalRevente">-</td>
    <td id="monthlyTotalAvecPv">-</td>
    <td id="monthlyTotalEconomies">-</td>
  </tr>`;
  tfoot.innerHTML = footRow;
  table.appendChild(tfoot);

  let sumSansPv = 0, sumAuto = 0, sumRev = 0, sumAvecPv = 0, sumEco = 0;
  let sumKwhConso = 0, sumKwhAuto = 0, sumKwhRev = 0;

  const moisNoms = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];

  for (let i=0; i<12; i++){
    const eurosStr = document.getElementById(`euros_${i}`).value || "0";
    const factureSansPv = parseFloat(eurosStr) || 0;

    const consoKwh = parseFloat(document.getElementById(`kwh_${i}`).value) || 0;
    const costText = document.getElementById(`costPerKwh_${i}`).textContent || "0";
    const costUnit = parseFloat(costText) || 0;

    if(!monthlyProductionData[i]) continue;
    const E_m1kW = monthlyProductionData[i].E_m;
    const production = S * E_m1kW;

    // On lit ratio diurne
    const ratioDiurneStr = document.getElementById("ratioDiurne").value || "50";
    const ratioDiurne = parseFloat(ratioDiurneStr) || 50;
    const consoKwhDiurne = consoKwh * (ratioDiurne / 100);

    const autoCons = Math.min(consoKwhDiurne, production);
    const surplus = Math.max(0, production - consoKwhDiurne);

    const economies = autoCons * costUnit;
    const revente = surplus * tarifRachat;
    const totalEco = economies + revente;
    const factureAvecPv = factureSansPv - economies;

    sumSansPv += factureSansPv;
    sumAuto += economies;
    sumRev += revente;
    sumAvecPv += factureAvecPv;
    sumEco += totalEco;

    sumKwhConso += consoKwh;
    sumKwhAuto += autoCons;
    sumKwhRev += surplus;

    let row = document.createElement("tr");
    let rowHTML = `<td>${moisNoms[i]}</td>`;
    if (showKwh) {
      rowHTML += `<td>${consoKwh.toFixed(1)}</td>`;
    }
    rowHTML += `<td>${factureSansPv.toFixed(2)} €</td>`;
    if (showKwh) {
      rowHTML += `<td>${autoCons.toFixed(1)}</td>`;
    }
    rowHTML += `<td>${economies.toFixed(2)} €</td>`;
    if (showKwh) {
      rowHTML += `<td>${surplus.toFixed(1)}</td>`;
    }
    rowHTML += `<td>${revente.toFixed(2)} €</td>`;
    rowHTML += `<td>${factureAvecPv.toFixed(2)} €</td>`;
    rowHTML += `<td>${totalEco.toFixed(2)} €</td>`;
    row.innerHTML = rowHTML;
    tbody.appendChild(row);
  }

  document.getElementById("monthlyTotalSansPv").textContent = sumSansPv.toFixed(2) + " €";
  document.getElementById("monthlyTotalAuto").textContent = sumAuto.toFixed(2) + " €";
  document.getElementById("monthlyTotalRevente").textContent = sumRev.toFixed(2) + " €";
  document.getElementById("monthlyTotalAvecPv").textContent = sumAvecPv.toFixed(2) + " €";
  document.getElementById("monthlyTotalEconomies").textContent = sumEco.toFixed(2) + " €";

  if (showKwh) {
    document.getElementById("monthlySumKwhConso").textContent = sumKwhConso.toFixed(1);
    document.getElementById("monthlySumKwhAuto").textContent = sumKwhAuto.toFixed(1);
    document.getElementById("monthlySumKwhRevente").textContent = sumKwhRev.toFixed(1);
  }
}

// 6.6) Remplit le tableau sur 20 ans
function fill20YearsPreconisation(S, firstYearGain, installationCost) {
  const annualPriceIncrease = parseFloat(document.getElementById("annualPriceIncrease").value) || 5;
  const tarifRachat = parseFloat(document.getElementById("tarifRachat").value) || 0.0761;

  let baseYearStr = document.getElementById("monthlyTotalSansPv").textContent.replace("€","").trim();
  let baseYearCost = parseFloat(baseYearStr) || 0;

  let strEco = document.getElementById("monthlyTotalAuto").textContent.replace("€","").trim();
  let strRev = document.getElementById("monthlyTotalRevente").textContent.replace("€","").trim();
  let autoYear1 = parseFloat(strEco) || 0;
  let surplusYear1 = parseFloat(strRev) || 0;

  const preconTableBody = document.querySelector("#preconisationTable tbody");
  preconTableBody.innerHTML = "";

  let totalSansPv = 0, totalAuto = 0, totalRev = 0, totalAvecPv = 0, totalEco = 0;

  for (let year=1; year<=20; year++){
    const factureSansPv = baseYearCost * Math.pow(1 + annualPriceIncrease/100, (year-1));
    const econAuto = autoYear1 * Math.pow(1 + annualPriceIncrease/100, (year-1));
    const gainsRev = surplusYear1;
    const totalEcos = econAuto + gainsRev;
    const factureAvecPv = factureSansPv - econAuto;

    totalSansPv += factureSansPv;
    totalAuto += econAuto;
    totalRev += gainsRev;
    totalAvecPv += factureAvecPv;
    totalEco += totalEcos;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${year}</td>
      <td>${factureSansPv.toFixed(2)} €</td>
      <td>${econAuto.toFixed(2)} €</td>
      <td>${gainsRev.toFixed(2)} €</td>
      <td>${factureAvecPv.toFixed(2)} €</td>
      <td>${totalEcos.toFixed(2)} €</td>
    `;
    preconTableBody.appendChild(row);
  }

  document.getElementById("totalSansPv").textContent = totalSansPv.toFixed(2) + " €";
  document.getElementById("totalAuto").textContent = totalAuto.toFixed(2) + " €";
  document.getElementById("totalRevente").textContent = totalRev.toFixed(2) + " €";
  document.getElementById("totalAvecPv").textContent = totalAvecPv.toFixed(2) + " €";
  document.getElementById("totalEconomies").textContent = totalEco.toFixed(2) + " €";

  document.getElementById("puissanceReco").textContent = S.toLocaleString('fr-FR');
  document.getElementById("coutInstallation").textContent = installationCost.toLocaleString('fr-FR');
  document.getElementById("gainSansInv").textContent = totalEco.toFixed(2) + " €";
  let gainAvecInvVal = totalEco - installationCost;
  document.getElementById("gainAvecInv").textContent = gainAvecInvVal.toFixed(2) + " €";

  let payback = installationCost / (firstYearGain || 1);
  document.getElementById("roiResult").textContent = payback.toFixed(1);
}
