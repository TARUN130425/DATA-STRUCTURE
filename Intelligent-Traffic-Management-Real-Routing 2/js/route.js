const $ = (id) => document.getElementById(id);

let map;
let routeLayers = [];
let markers = [];

function initMap() {
  map = L.map("map").setView([13.0827, 80.2707], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function showMessage(text, error=false) {
  const el = $("routeMessage");
  el.textContent = text;
  el.className = "message" + (error ? " error" : "");
  el.classList.remove("hidden");
}

function clearMap() {
  routeLayers.forEach(layer => map.removeLayer(layer));
  markers.forEach(marker => map.removeLayer(marker));
  routeLayers = [];
  markers = [];
}

async function geocode(place) {
  // Known Chennai project locations are resolved explicitly so ambiguous names
  // do not accidentally select a different Saveetha/Chennai place.
  const key = place.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const known = [
    {
      keys: ["chennai central", "central railway station", "mgr chennai central", "puratchi thalaivar dr m g ramachandran central"],
      lat: 13.0825, lon: 80.2750,
      name: "Chennai Central Railway Station, Chennai, Tamil Nadu"
    },
    {
      keys: ["saveetha engineering college", "saveetha engineering", "saveetha college", "saveetha"],
      lat: 13.025898, lon: 80.016443,
      name: "Saveetha Engineering College, Saveetha Nagar, Thandalam, Chennai - 602105"
    }
  ];

  const exact = known.find(x => x.keys.some(k => key === k || key.includes(k)));
  if (exact) return exact;

  // User-triggered single geocoding request. We intentionally do not use autocomplete.
  // Include the full Chennai/Tamil Nadu context to reduce ambiguous results.
  const query = `${place}, Chennai, Tamil Nadu, India`;
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=" + encodeURIComponent(query);
  const response = await fetch(url, {headers: {"Accept":"application/json"}});
  if (!response.ok) throw new Error("Location search failed.");
  const data = await response.json();
  if (!data.length) throw new Error(`Could not find "${place}". Try a more complete place name.`);

  // Prefer results that are actually inside/near Chennai and not unrelated
  // similarly named places.
  const best = data.find(x => /chennai|thandalam|sriperumbudur|kancheepuram/i.test(
    `${x.display_name} ${JSON.stringify(x.address || {})}`
  )) || data[0];

  return {lat:Number(best.lat), lon:Number(best.lon), name:best.display_name};
}

async function getRoutes(start, destination, vehicle) {
  const profile = vehicle === "bike" ? "bike" : "car";
  const coords = `${start.lon},${start.lat};${destination.lon},${destination.lat}`;
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?alternatives=true&steps=true&overview=full&geometries=geojson`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Routing service is unavailable right now.");
  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("No connected road route was found.");
  return data.routes;
}

function formatDistance(m) {
  return m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins/60);
  const m = mins % 60;
  return h ? `${h} hr ${m} min` : `${m} min`;
}

function congestionEstimate(route, index) {
  // This is an academic estimate, not live traffic data.
  // It makes the optimization demo vary without pretending that OSRM supplies live congestion.
  const ratio = route.duration / Math.max(route.distance / 13.9, 60);
  let base = Math.min(78, Math.max(12, Math.round((ratio - 1) * 90)));
  base += index * 4;
  return Math.min(85, Math.max(10, base));
}

function scoreRoute(route, congestion, preference) {
  const km = route.distance / 1000;
  const min = route.duration / 60;
  const traffic = congestion;
  if (preference === "fastest") return min * 1.0 + traffic * 0.20;
  if (preference === "shortest") return km * 1.0 + traffic * 0.08;
  if (preference === "lowtraffic") return traffic * 1.0 + min * 0.08;
  return km * 0.35 + min * 0.50 + traffic * 0.25;
}

function roadLabel(route, index) {
  const names = [];
  (route.legs || []).forEach(leg => (leg.steps || []).forEach(step => {
    const n = step.name;
    if (n && !names.includes(n)) names.push(n);
  }));
  return names.slice(0, 3).join(" → ") || `Real road route ${index + 1}`;
}

function renderRoutes(routes, preference) {
  const scored = routes.map((route, index) => {
    const congestion = congestionEstimate(route, index);
    return {...route, index, congestion, score:scoreRoute(route, congestion, preference), roadName:roadLabel(route,index)};
  }).sort((a,b)=>a.score-b.score);

  const best = scored[0];
  $("routeResults").innerHTML = scored.map((r, i) => `
    <article class="route-card ${i===0 ? "recommended":""}" data-index="${r.index}">
      <div class="route-name">
        <h3>${i===0 ? "★ RECOMMENDED — " : ""}${escapeHtml(r.roadName)}</h3>
        <span class="badge">${r.congestion < 30 ? "Low" : r.congestion < 55 ? "Moderate" : "Heavy"}</span>
      </div>
      <div class="route-metrics">
        <span>${formatDistance(r.distance)}</span>
        <span>${formatDuration(r.duration)}</span>
        <span>${Math.round((r.distance/1000)/(r.duration/3600))} km/h avg</span>
        <span>Estimated congestion ${r.congestion}%</span>
        <span class="score">Score ${r.score.toFixed(1)}</span>
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".route-card").forEach(card => {
    card.addEventListener("click", () => drawRoutes(scored, Number(card.dataset.index)));
  });

  $("routeDetails").classList.remove("hidden");
  $("details").innerHTML = `
    <div class="notice"><b>Recommended:</b> ${escapeHtml(best.roadName)}. The recommendation is based on your selected preference, real road distance/time from the routing engine, and an academic congestion estimate.</div>
    <div class="detail-grid" style="margin-top:15px">
      <div class="detail"><small>Distance</small><strong>${formatDistance(best.distance)}</strong></div>
      <div class="detail"><small>Travel Time</small><strong>${formatDuration(best.duration)}</strong></div>
      <div class="detail"><small>Estimated Congestion</small><strong>${best.congestion}%</strong></div>
      <div class="detail"><small>Optimization Score</small><strong>${best.score.toFixed(1)}</strong></div>
    </div>`;
  return scored;
}

function drawRoutes(scored, selectedIndex=0) {
  clearMap();
  scored.forEach((r, idx) => {
    const coords = r.geometry.coordinates.map(p => [p[1], p[0]]);
    const line = L.polyline(coords, {
      color: idx === 0 ? "#18c9c2" : "#617487",
      weight: idx === 0 ? 7 : 4,
      opacity: idx === 0 ? 0.95 : 0.55
    }).addTo(map);
    routeLayers.push(line);
  });
  const selected = scored[selectedIndex];
  const selectedCoords = selected.geometry.coordinates.map(p => [p[1], p[0]]);
  const highlight = L.polyline(selectedCoords, {color:"#18c9c2", weight:8, opacity:0.95}).addTo(map);
  routeLayers.push(highlight);
  const start = selectedCoords[0];
  const end = selectedCoords[selectedCoords.length-1];
  markers.push(L.marker(start).addTo(map).bindPopup("<b>Start</b>").openPopup());
  markers.push(L.marker(end).addTo(map).bindPopup("<b>Destination</b>"));
  map.fitBounds(L.latLngBounds(selectedCoords), {padding:[35,35]});
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function findBestRoute() {
  const startText = $("start").value.trim();
  const destText = $("destination").value.trim();
  const vehicle = $("vehicle").value;
  const preference = $("preference").value;
  if (!startText || !destText) {
    showMessage("Please enter both a starting location and destination.", true);
    return;
  }

  $("findRoute").disabled = true;
  $("findRoute").textContent = "Finding real route...";
  $("routeResults").innerHTML = `<div class="empty">Searching the real road network…</div>`;
  $("routeDetails").classList.add("hidden");
  try {
    showMessage("Finding locations and calculating connected road routes…");
    const start = await geocode(startText);
    const destination = await geocode(destText);
    const routes = await getRoutes(start, destination, vehicle);
    const scored = renderRoutes(routes, preference);
    drawRoutes(scored, 0);
    showMessage(`Route found: ${formatDistance(scored[0].distance)} • ${formatDuration(scored[0].duration)}. The map now shows the real road geometry.`);
  } catch (err) {
    console.error(err);
    showMessage(err.message || "Something went wrong.", true);
    $("routeResults").innerHTML = `<div class="empty">No route could be calculated. Try adding “Chennai, Tamil Nadu” to the place name.</div>`;
  } finally {
    $("findRoute").disabled = false;
    $("findRoute").textContent = "Find Best Route";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  $("findRoute").addEventListener("click", findBestRoute);
  $("destination").addEventListener("keydown", e => { if (e.key === "Enter") findBestRoute(); });
  $("start").addEventListener("keydown", e => { if (e.key === "Enter") findBestRoute(); });
});