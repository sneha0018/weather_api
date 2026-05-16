// ================================================================
//  script.js  —  WeatherNow Portfolio Edition
//  Improvements over v1:
//    · Debounced search (prevents API spam)
//    · Dynamic background that reacts to weather condition
//    · weather-icons library mapping (replaces tiny PNG sprites)
//    · Sunrise / sunset display using timezone offset
//    · Animated progress bars for humidity & wind
//    · Live clock (updates every second)
//    · Enter-key support
//    · Loading state on search button
//    · AbortController to cancel stale requests
// ================================================================

// ── 1. PASTE YOUR API KEY HERE ──────────────────────────────
const API_KEY = "391e5d1ba60baecfd1fb64257ff0f7ab";
// ────────────────────────────────────────────────────────────

const BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

// ── DOM refs ─────────────────────────────────────────────────
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const btnLabel = document.getElementById("btnLabel");
const loader = document.getElementById("loader");
const weatherCard = document.getElementById("weatherCard");
const idleState = document.getElementById("idleState");
const errorBadge = document.getElementById("errorBadge");
const errorText = document.getElementById("errorText");
const bgLayer = document.getElementById("bgLayer");
const liveClock = document.getElementById("liveClock");

// ── State ────────────────────────────────────────────────────
let lastData = null; // raw API response
let currentUnit = "C"; // "C" | "F"
let controller = null; // AbortController for in-flight requests

// ================================================================
//  IMPROVEMENT: Live clock (updates every second)
// ================================================================
function startClock() {
  function tick() {
    liveClock.textContent = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  tick();
  setInterval(tick, 1000);
}

startClock();

// ================================================================
//  FETCH WEATHER  (async / await + AbortController)
// ================================================================

/**
 * IMPROVEMENT: AbortController cancels any previous fetch
 * so typing quickly doesn't fire multiple overlapping requests.
 */
async function fetchWeather(city) {
  if (!city.trim()) return;

  // Cancel previous request if still pending
  if (controller) controller.abort();
  controller = new AbortController();

  setLoadingState(true);

  try {
    const url = `${BASE_URL}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      const err = await res.json();
      // 404 = city not found, 401 = bad API key, etc.
      throw new Error(
        res.status === 404
          ? "City not found. Check the spelling and try again."
          : res.status === 401
            ? "Invalid API key. Check script.js line 14."
            : err.message || "Something went wrong.",
      );
    }

    const data = await res.json();
    lastData = data;
    currentUnit = "C";
    updateUnitButtons();
    renderWeather(data, "C");
    showCard();
  } catch (err) {
    // AbortError is thrown when we cancel — don't show as an error
    if (err.name !== "AbortError") {
      showError(err.message);
    }
  } finally {
    setLoadingState(false);
  }
}

// ================================================================
//  RENDER
// ================================================================
function renderWeather(data, unit) {
  const { main, wind, sys, weather, visibility, timezone } = data;

  // Temperatures (API always returns metric = Celsius)
  const tempC = main.temp;
  const feelsC = main.feels_like;
  const minC = main.temp_min;
  const maxC = main.temp_max;

  const uLabel = unit === "C" ? "°C" : "°F";
  const convert = unit === "C" ? (c) => Math.round(c) : toF;

  document.getElementById("tempValue").textContent =
    `${convert(tempC)}${uLabel}`;
  document.getElementById("feelsLike").textContent =
    `Feels like ${convert(feelsC)}${uLabel}`;
  document.getElementById("tempMin").textContent = `${convert(minC)}${uLabel}`;
  document.getElementById("tempMax").textContent = `${convert(maxC)}${uLabel}`;

  // Location
  document.getElementById("cityName").textContent = data.name;
  document.getElementById("regionName").textContent =
    `${sys.country}  ${countryFlag(sys.country)}`;
  document.getElementById("localDate").textContent = formatDate();

  // Condition
  const condition = weather[0].main;
  const desc = weather[0].description;
  document.getElementById("conditionText").textContent = capitalize(desc);

  // Stats
  const windKmh = (wind.speed * 3.6).toFixed(1);
  const visKm = (visibility / 1000).toFixed(1);

  document.getElementById("humidity").textContent = `${main.humidity}%`;
  document.getElementById("windSpeed").textContent = `${windKmh} km/h`;
  document.getElementById("visibility").textContent = `${visKm} km`;
  document.getElementById("pressure").textContent = `${main.pressure} hPa`;

  // Sunrise / Sunset using the city's timezone offset (in seconds)
  document.getElementById("sunrise").textContent = utcToLocal(
    sys.sunrise,
    timezone,
  );
  document.getElementById("sunset").textContent = utcToLocal(
    sys.sunset,
    timezone,
  );

  // IMPROVEMENT: Animated progress bars
  animateBar("humidityBar", main.humidity); // 0–100
  animateBar("windBar", Math.min(windKmh, 100)); // cap at 100 for visual

  // IMPROVEMENT: weather-icons mapping
  setWeatherIcon(condition, weather[0].icon);

  // IMPROVEMENT: Dynamic background
  setBackground(condition);
}

// ================================================================
//  IMPROVEMENT: Map OpenWeatherMap condition → weather-icons class
//  Full icon list: erikflowers.github.io/weather-icons/
// ================================================================
const WI_MAP = {
  Thunderstorm: "wi-thunderstorm",
  Drizzle: "wi-sprinkle",
  Rain: "wi-rain",
  Snow: "wi-snow",
  Mist: "wi-fog",
  Smoke: "wi-smoke",
  Haze: "wi-day-haze",
  Dust: "wi-dust",
  Fog: "wi-fog",
  Sand: "wi-sandstorm",
  Ash: "wi-volcano",
  Squall: "wi-strong-wind",
  Tornado: "wi-tornado",
  Clear: "wi-day-sunny",
  Clouds: "wi-cloudy",
};

/**
 * Sets the <i> icon class. Uses day/night variant when relevant.
 * @param {string} condition  - e.g. "Rain"
 * @param {string} iconCode   - e.g. "10d" (d=day, n=night)
 */
function setWeatherIcon(condition, iconCode) {
  const isNight = iconCode.endsWith("n");
  const wiIcon = document.getElementById("wiIcon");

  // Remove previous icon classes
  wiIcon.className = "wi weather-main-icon";

  let cls = WI_MAP[condition] || "wi-day-cloudy";

  // Override Clear to show moon at night
  if (condition === "Clear" && isNight) cls = "wi-night-clear";
  // Partly cloudy variants
  if (condition === "Clouds") {
    cls = isNight ? "wi-night-alt-cloudy" : "wi-day-cloudy";
  }

  wiIcon.classList.add(cls);
}

// ================================================================
//  IMPROVEMENT: Dynamic background
// ================================================================
const BG_MAP = {
  Thunderstorm: "bg-thunderstorm",
  Drizzle: "bg-drizzle",
  Rain: "bg-rain",
  Snow: "bg-snow",
  Mist: "bg-mist",
  Fog: "bg-fog",
  Haze: "bg-haze",
  Dust: "bg-dust",
  Sand: "bg-sand",
  Clear: "bg-clear",
  Clouds: "bg-clouds",
};

function setBackground(condition) {
  // Remove all existing bg-* classes
  bgLayer.className = "bg-layer";
  const cls = BG_MAP[condition] || "";
  if (cls) bgLayer.classList.add(cls);
}

// ================================================================
//  UNIT SWITCHING
// ================================================================
function switchUnit(unit) {
  if (!lastData || unit === currentUnit) return;
  currentUnit = unit;
  updateUnitButtons();
  renderWeather(lastData, unit);
}

function updateUnitButtons() {
  document
    .getElementById("btnC")
    .classList.toggle("active", currentUnit === "C");
  document
    .getElementById("btnF")
    .classList.toggle("active", currentUnit === "F");
}

// ================================================================
//  HELPERS
// ================================================================

// Celsius → Fahrenheit
function toF(c) {
  return Math.round((c * 9) / 5 + 32);
}

// Format local date
function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * IMPROVEMENT: Convert UTC unix timestamp → local city time string.
 * OpenWeatherMap provides a timezone offset (seconds from UTC),
 * so we compute the city's local time regardless of the user's timezone.
 */
function utcToLocal(unixUTC, tzOffsetSec) {
  const localMs = (unixUTC + tzOffsetSec) * 1000;
  const d = new Date(localMs);
  // Use UTC methods because we already applied the offset
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
}

// ISO country code → emoji flag
function countryFlag(code) {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
}

// Capitalise first letter
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * IMPROVEMENT: Animated progress bar.
 * Sets width to 0 first then transitions to the target (triggers CSS animation).
 */
function animateBar(id, percent) {
  const bar = document.getElementById(id);
  if (!bar) return;
  bar.style.width = "0%";
  // Use requestAnimationFrame to ensure the "0" frame is painted before animating
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bar.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
    });
  });
}

// ================================================================
//  UI STATE HELPERS
// ================================================================
function setLoadingState(isLoading) {
  searchBtn.disabled = isLoading;
  btnLabel.textContent = isLoading ? "…" : "Go";
  loader.classList.toggle("hidden", !isLoading);
  if (isLoading) {
    weatherCard.classList.add("hidden");
    idleState.classList.add("hidden");
    errorBadge.classList.add("hidden");
  }
}

function showCard() {
  weatherCard.classList.remove("hidden");
  idleState.classList.add("hidden");
  errorBadge.classList.add("hidden");
}

function showError(msg) {
  errorBadge.classList.remove("hidden");
  errorText.textContent = msg;
  idleState.classList.add("hidden");
  weatherCard.classList.add("hidden");
}

// ================================================================
//  EVENT LISTENERS
// ================================================================

// Search button
searchBtn.addEventListener("click", () => fetchWeather(cityInput.value));

// IMPROVEMENT: Enter key triggers search
cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchWeather(cityInput.value);
});

// IMPROVEMENT: Debounced auto-search as you type (fires 600 ms after you stop)
let debounceTimer;
cityInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const val = cityInput.value.trim();
  if (val.length >= 3) {
    debounceTimer = setTimeout(() => fetchWeather(val), 600);
  }
});

// ── Optional: auto-load a city on startup ──
// fetchWeather("Bengaluru");
