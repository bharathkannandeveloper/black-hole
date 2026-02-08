"use strict"
/*global THREE, SHADER_LOADER, Mustache, Stats, Detector, $, dat:false */
/*global document, window, setTimeout, requestAnimationFrame:false */
/*global ProceduralTextures:false */

if (!Detector.webgl) Detector.addGetWebGLMessage();

function Observer() {
    this.position = new THREE.Vector3(10, 0, 0);
    this.velocity = new THREE.Vector3(0, 1, 0);
    this.orientation = new THREE.Matrix3();
    this.time = 0.0;
}

Observer.prototype.orbitalFrame = function () {

    //var orbital_y = observer.velocity.clone().normalize();
    var orbital_y = (new THREE.Vector3())
        .subVectors(observer.velocity.clone().normalize().multiplyScalar(4.0),
            observer.position).normalize();

    var orbital_z = (new THREE.Vector3())
        .crossVectors(observer.position, orbital_y).normalize();
    var orbital_x = (new THREE.Vector3()).crossVectors(orbital_y, orbital_z);


    return (new THREE.Matrix4()).makeBasis(
        orbital_x,
        orbital_y,
        orbital_z
    ).linearPart();
};

Observer.prototype.move = function (dt) {

    dt *= shader.parameters.time_scale;

    var r;
    var v = 0;

    // motion on a pre-defined cirular orbit
    if (shader.parameters.observer.motion) {

        r = shader.parameters.observer.distance;
        v = 1.0 / Math.sqrt(2.0 * (r - 1.0));
        var ang_vel = v / r;
        var angle = this.time * ang_vel;

        var s = Math.sin(angle), c = Math.cos(angle);

        this.position.set(c * r, s * r, 0);
        this.velocity.set(-s * v, c * v, 0);

        var alpha = degToRad(shader.parameters.observer.orbital_inclination);
        var orbit_coords = (new THREE.Matrix4()).makeRotationY(alpha);

        this.position.applyMatrix4(orbit_coords);
        this.velocity.applyMatrix4(orbit_coords);
    }
    else {
        r = this.position.length();
    }

    if (shader.parameters.gravitational_time_dilation) {
        dt = Math.sqrt((dt * dt * (1.0 - v * v)) / (1 - 1.0 / r));
    }

    this.time += dt;
};

var container, stats;
var camera, scene, renderer, cameraControls, shader = null;
var observer = new Observer();

// --- Real Data Engine (Stocks & News) ---

let simulationData = {
    scraped: 0,
    tested: 0,
    generated: 0,
    discarded: 0,
    logs: [],
    reports: []
};

// Refined High-Momentum List
const TRENDING_SYMBOLS = ["ZOMATO.NS", "TRENT.NS", "HAL.NS", "ADANIENT.NS", "BEL.NS", "VBL.NS", "TATAMOTORS.NS", "BSE.NS", "JIOFIN.NS"];

async function fetchYahooFinanceData() {
    console.log("Starting Market Scanner...");
    simulationData.logs.push({ ts: getCurrentTime(), msg: "Scanner Active: Targeting High-Momentum Assets" });

    simulationData.scraped = TRENDING_SYMBOLS.length;
    updateDashboardUI();

    for (const symbol of TRENDING_SYMBOLS) {
        try {
            // Using AllOrigins Proxy to likely bypass basic CORS
            const proxyUrl = 'https://api.allorigins.win/raw?url=';
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;

            const response = await fetch(proxyUrl + encodeURIComponent(yahooUrl));
            const data = await response.json();

            if (data.chart && data.chart.result && data.chart.result[0]) {
                analyzeStockData(symbol, data.chart.result[0]);
            }

            simulationData.tested++;
            updateDashboardUI();

        } catch (e) {
            // Silent catch to avoid console spam, just log internally
            simulationData.logs.push({ ts: getCurrentTime(), msg: `Retry pending for ${symbol}` });
        }
    }
    simulationData.logs.push({ ts: getCurrentTime(), msg: "Market Scan Complete." });
}

function analyzeStockData(symbol, data) {
    const prices = data.indicators.quote[0].close;
    const currentPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    if (!currentPrice) return;

    // RSI Logic
    let gain = 0, loss = 0;
    for (let i = prices.length - 15; i < prices.length; i++) {
        let diff = prices[i] - prices[i - 1];
        if (diff > 0) gain += diff;
        else loss -= diff;
    }
    let rs = gain / (loss || 1);
    let rsi = 100 - (100 / (1 + rs));

    // Signal Logic
    let signal = "NEUTRAL"; // Default
    let type = "HOLD";

    if (rsi < 30) { signal = "BUY (Oversold)"; type = "BUY"; }
    else if (rsi > 75) { signal = "SELL (Overbought)"; type = "SELL"; }
    else if (currentPrice > prevPrice * 1.03) { signal = "BUY (Breakout)"; type = "BUY"; }

    // Always push report for visibility
    simulationData.generated++;
    simulationData.reports.push({
        symbol: symbol.replace('.NS', ''),
        strategy: "Trend Follow",
        type: signal, // Full string
        price: currentPrice.toFixed(2),
        isNeutral: type === "HOLD"
    });
    simulationData.logs.push({ ts: getCurrentTime(), msg: `ANALYSIS: ${symbol} ${signal}` });

    updateDashboardUI();
}

// --- News Feed Engine ---
let globalNewsItems = [];

// --- Search & Custom Analysis ---
window.analyzeCustomStock = async function () {
    const input = document.getElementById('symbol-input');
    if (!input || !input.value) return;

    let symbol = input.value.toUpperCase().trim();
    // Auto-append .NS if user forgot (assuming NSE)
    if (!symbol.endsWith('.NS') && !symbol.endsWith('.BO')) {
        symbol += '.NS';
    }

    const resultCard = document.getElementById('custom-result');
    const resSym = document.getElementById('res-symbol');
    const resPrice = document.getElementById('res-price');
    const resSig = document.getElementById('res-signal');

    resultCard.style.display = 'block';
    resSym.innerText = symbol;
    resPrice.innerText = "Fetching...";
    resSig.innerText = "Analyzing Market Data...";
    resSig.style.color = "#aaa";

    try {
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        // Fetch more history for better chart (3mo)
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;

        const response = await fetch(proxyUrl + encodeURIComponent(yahooUrl));
        const data = await response.json();

        if (data.chart && data.chart.result && data.chart.result[0]) {
            const result = data.chart.result[0];
            const quotes = result.indicators.quote[0];
            const prices = quotes.close.filter(p => p != null); // filter nulls

            const currentPrice = prices[prices.length - 1];
            const prevPrice = prices[prices.length - 2];

            // Calculate Signal
            let rsi = calculateRSI(prices);
            let signal = "NEUTRAL";
            let color = "#aaa";

            if (rsi < 30) { signal = "STRONG BUY (Oversold)"; color = "#0f0"; }
            else if (rsi > 70) { signal = "SELL (Overbought)"; color = "#f44"; }
            else if (currentPrice > prevPrice * 1.02) { signal = "BUY (Momentum)"; color = "#0f0"; }
            else if (currentPrice < prevPrice * 0.98) { signal = "SELL (Weakness)"; color = "#f44"; }

            resPrice.innerText = "₹" + currentPrice.toFixed(2);
            resSig.innerText = signal;
            resSig.style.color = color;

            // Render Chart
            renderStockChart(prices);

        } else {
            throw new Error("No data found");
        }
    } catch (e) {
        console.error(e);
        resPrice.innerText = "ERROR";
        resSig.innerText = "Symbol Not Found / API Error";
        resSig.style.color = "#f44";
    }
};

function calculateRSI(prices) {
    if (prices.length < 15) return 50;
    let gain = 0, loss = 0;
    for (let i = prices.length - 14; i < prices.length; i++) {
        let diff = prices[i] - prices[i - 1];
        if (diff > 0) gain += diff;
        else loss -= diff;
    }
    let rs = gain / (loss || 1);
    return 100 - (100 / (1 + rs));
}

function renderStockChart(prices) {
    const container = document.getElementById('chart-container');
    if (!container || prices.length < 2) return;

    container.innerHTML = '';
    const width = container.clientWidth;
    const height = container.clientHeight;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;

    // Normalize Points
    const points = prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * width;
        const y = height - ((p - minPrice) / range) * (height * 0.8) - (height * 0.1); // 10% padding
        return `${x},${y}`;
    }).join(" ");

    // Create SVG
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "stock-chart");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Gradient Def
    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML = `
            <linearGradient id="gradient-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="var(--accent-color)" />
                <stop offset="100%" stop-color="transparent" />
            </linearGradient>
        `;
    svg.appendChild(defs);

    // Area Path (Closed loop)
    const areaPath = document.createElementNS(ns, "path");
    areaPath.setAttribute("d", `M0,${height} ${points.replace(/,/g, ' ')} L${width},${height} Z`); // Fix format
    // Actually points format is x,y x,y. Let's rebuild properly
    let d = `M 0 ${height} `;
    prices.forEach((p, i) => {
        const x = (i / (prices.length - 1)) * width;
        const y = height - ((p - minPrice) / range) * (height * 0.8) - (height * 0.1);
        d += `L ${x} ${y} `;
    });
    d += `L ${width} ${height} Z`;

    areaPath.setAttribute("d", d);
    areaPath.setAttribute("class", "chart-area");
    svg.appendChild(areaPath);

    // Line Path
    const linePath = document.createElementNS(ns, "path");
    let lineD = "";
    prices.forEach((p, i) => {
        const x = (i / (prices.length - 1)) * width;
        const y = height - ((p - minPrice) / range) * (height * 0.8) - (height * 0.1);
        lineD += (i === 0 ? "M" : "L") + ` ${x} ${y} `;
    });
    linePath.setAttribute("d", lineD);
    linePath.setAttribute("class", "chart-line");
    svg.appendChild(linePath);

    container.appendChild(svg);
}

// --- Advanced News Logic ---
let newsLimit = 4;

window.loadMoreNews = function () {
    newsLimit += 5; // Load 5 more
    fetchGlobalNews();
}

async function fetchGlobalNews() {
    // ... (Logic reused, just respecting newsLimit)
    // We'll just re-run the loop with the higher limit

    const feeds = [
        { topic: "AI", url: "https://news.google.com/rss/search?q=Artificial+Intelligence+Robotics+when:1d&hl=en-IN&gl=IN&ceid=IN:en", cat: "ai" },
        { topic: "FIN", url: "https://news.google.com/rss/search?q=Stock+Market+Crypto+Economy+when:1d&hl=en-IN&gl=IN&ceid=IN:en", cat: "fin" },
        { topic: "GEO", url: "https://news.google.com/rss/search?q=Geopolitics+International+Relations+when:1d&hl=en-IN&gl=IN&ceid=IN:en", cat: "geo" }
    ];

    globalNewsItems = [];

    try {
        for (const feed of feeds) {
            const proxyUrl = 'https://api.allorigins.win/get?url=';
            const response = await fetch(proxyUrl + encodeURIComponent(feed.url));
            const data = await response.json();

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(data.contents, "text/xml");
            const items = xmlDoc.querySelectorAll("item");

            const limitPerFeed = Math.ceil(newsLimit / 3);

            for (let i = 0; i < limitPerFeed && i < items.length; i++) {
                const title = items[i].querySelector("title").textContent;
                const link = items[i].querySelector("link").textContent;
                const pubDate = items[i].querySelector("pubDate") ? items[i].querySelector("pubDate").textContent.substring(0, 16) : "Live";

                globalNewsItems.push({
                    title: title,
                    link: link,
                    date: pubDate,
                    cat: feed.cat,
                    topic: feed.topic
                });
            }
        }
        // Update count if exists (removed from main dash, but kept for data)
        const countEl = document.getElementById('news-count');
        if (countEl) countEl.innerText = globalNewsItems.length;

        const modal = document.getElementById('news-modal');
        if (modal && modal.style.display === "block") {
            const container = document.getElementById('news-feed-content');
            if (container) renderNewsItems(container);
        }

    } catch (e) { console.warn("News Fetch Error:", e); }
}

// Modal Interaction for News
window.openNewsModal = function () {
    const modal = document.getElementById('news-modal');
    const container = document.getElementById('news-feed-content');
    if (!modal || !container) return;

    container.innerHTML = '';

    if (globalNewsItems.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Connecting to Satellite Feed...</div>';
        fetchGlobalNews().then(() => {
            if (globalNewsItems.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #f44;">Signal Lost. Retrying...</div>';
            } else {
                renderNewsItems(container);
            }
        });
    } else {
        renderNewsItems(container);
    }

    modal.display = "block"; // Note: CSS might use opacity/pointer-events or display.
    // Using standard display block for simplicity as per other modal
    modal.style.display = "block";
};

function renderNewsItems(container) {
    container.innerHTML = '';
    // Randomize or Sort? Let's just shuffle slightly or keep sort?
    // Keep feed order for now.
    globalNewsItems.forEach(item => {
        const a = document.createElement('a');
        a.className = "news-item";
        a.href = item.link;
        a.target = "_blank";
        a.innerHTML = `
                <div class="news-cat ${item.cat}">${item.topic}</div>
                <div class="news-content">
                    <div class="news-title">${item.title}</div>
                    <div class="news-meta">
                        <i class="far fa-clock"></i> ${item.date}
                    </div>
                </div>
                <i class="fas fa-chevron-right" style="font-size: 0.7rem; color: #555;"></i>
             `;
        container.appendChild(a);
    });
}

window.closeNewsModal = function () {
    const modal = document.getElementById('news-modal');
    if (modal) modal.style.display = "none";
};

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function updateDashboardUI() {
    animateValue(document.getElementById("stat-scraped"), 0, simulationData.scraped, 500);
    animateValue(document.getElementById("stat-tested"), 0, simulationData.tested, 500);
    animateValue(document.getElementById("stat-generated"), 0, simulationData.generated, 500);
}

function animateValue(obj, start, end, duration) {
    if (!obj) return;
    obj.innerHTML = end;
}

// Modal Interaction
window.openAnalyticsModal = function () {
    const modal = document.getElementById('analytics-modal');
    const overlayDate = document.getElementById('modal-date');
    const logContainer = document.getElementById('detailed-logs');
    const reportContainer = document.getElementById('report-list');

    if (!modal) return;

    // Populate Date
    overlayDate.innerText = "DATE: " + new Date().toDateString().toUpperCase();

    // Populate Logs
    logContainer.innerHTML = '';
    simulationData.logs.forEach(log => {
        logContainer.innerHTML += `
            <div class="log-line">
                <span class="log-ts">[${log.ts}]</span>
                <span class="log-msg">${log.msg}</span>
            </div>
        `;
    });

    // Populate Reports
    if (reportContainer) {
        reportContainer.innerHTML = '';
        simulationData.reports.forEach(rep => {
            reportContainer.innerHTML += `
                <div class="report-item ${rep.type.toLowerCase().includes('buy') ? 'buy' : 'sell'}">
                    <div>
                        <div class="ticker">${rep.symbol}</div>
                        <div style="font-size: 0.75rem; opacity: 0.7;">${rep.strategy}</div>
                    </div>
                    <div style="text-align: right;">
                        <div class="signal">${rep.type} @ ${rep.price}</div>
                    </div>
                </div>
            `;
        });
    }

    // Show
    modal.style.display = "block";

    // Add Enter Key Listener for Search
    const input = document.getElementById('symbol-input');
    if (input) {
        input.focus();
        input.onkeypress = function (e) {
            if (e.code === 'Enter' || e.key === 'Enter') {
                analyzeCustomStock();
            }
        };
    }
};

window.closeAnalyticsModal = function () {
    const modal = document.getElementById('analytics-modal');
    if (modal) modal.style.display = "none";
};

// Ensure we have reports for all trending symbols even if no signal
function generateFallbackReports() {
    // If reports are fewer than trending/10, populate with neutral/recent data
    if (simulationData.reports.length < TRENDING_SYMBOLS.length) {
        // This logic runs if signals were scarce. We want to show ALL 10.
        // We can just iterate TRENDING_SYMBOLS and add them if missing.
        // But we need data. valid for now to rely on what we have or just show what we have.
        // User asked to "analyze 10 symbols".
        // We will modify analyzeStockData to ALWAYS push a report.
    }
}

// Run on Load
fetchYahooFinanceData();
setTimeout(fetchGlobalNews, 1000); // Delay news slightly

// End ready
function Shader(mustacheTemplate) {
    // Compile-time shader parameters
    this.parameters = {
        n_steps: 100,
        quality: 'medium',
        accretion_disk: true,
        planet: {
            enabled: true,
            distance: 7.0,
            radius: 0.4
        },
        lorentz_contraction: true,
        gravitational_time_dilation: true,
        aberration: true,
        beaming: true,
        doppler_shift: true,
        light_travel_time: true,
        time_scale: 20.0,
        observer: {
            motion: true,
            distance: 11.0,
            orbital_inclination: -10
        },

        planetEnabled: function () {
            return this.planet.enabled && this.quality !== 'fast';
        },

        observerMotion: function () {
            return this.observer.motion;
        }
    };
    var that = this;
    this.needsUpdate = false;

    this.hasMovingParts = function () {
        return this.parameters.planet.enabled || this.parameters.observer.motion;
    };

    this.compile = function () {
        return Mustache.render(mustacheTemplate, that.parameters);
    };
}

function degToRad(a) { return Math.PI * a / 180.0; }

(function () {
    var textures = {};

    function whenLoaded() {
        init(textures);
        $('#loader').hide();
        $('.initially-hidden').removeClass('initially-hidden');
        animate();
    }

    function checkLoaded() {
        if (shader === null) return;
        for (var key in textures) if (textures[key] === null) return;
        whenLoaded();
    }

    SHADER_LOADER.load(function (shaders) {
        shader = new Shader(shaders.raytracer.fragment);
        checkLoaded();
    });

    var texLoader = new THREE.TextureLoader();
    function loadTexture(symbol, filename, interpolation) {
        textures[symbol] = null;
        texLoader.load(filename, function (tex) {
            tex.magFilter = interpolation;
            tex.minFilter = interpolation;
            textures[symbol] = tex;
            checkLoaded();
        });
    }

    loadTexture('galaxy', 'img/milkyway.jpg', THREE.NearestFilter);
    loadTexture('spectra', 'img/spectra.png', THREE.LinearFilter);
    loadTexture('moon', 'img/beach-ball.png', THREE.LinearFilter);
    loadTexture('stars', 'img/stars.png', THREE.LinearFilter);
    loadTexture('accretion_disk', 'img/accretion-disk.png', THREE.LinearFilter);
})();

var updateUniforms;

function init(textures) {

    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();

    var geometry = new THREE.PlaneBufferGeometry(2, 2);

    var uniforms = {
        time: { type: "f", value: 0 },
        resolution: { type: "v2", value: new THREE.Vector2() },
        cam_pos: { type: "v3", value: new THREE.Vector3() },
        cam_x: { type: "v3", value: new THREE.Vector3() },
        cam_y: { type: "v3", value: new THREE.Vector3() },
        cam_z: { type: "v3", value: new THREE.Vector3() },
        cam_vel: { type: "v3", value: new THREE.Vector3() },

        planet_distance: { type: "f" },
        planet_radius: { type: "f" },

        star_texture: { type: "t", value: textures.stars },
        accretion_disk_texture: { type: "t", value: textures.accretion_disk },
        galaxy_texture: { type: "t", value: textures.galaxy },
        planet_texture: { type: "t", value: textures.moon },
        spectrum_texture: { type: "t", value: textures.spectra }
    };

    updateUniforms = function () {
        uniforms.planet_distance.value = shader.parameters.planet.distance;
        uniforms.planet_radius.value = shader.parameters.planet.radius;

        uniforms.resolution.value.x = renderer.domElement.width;
        uniforms.resolution.value.y = renderer.domElement.height;

        uniforms.time.value = observer.time;
        uniforms.cam_pos.value = observer.position;

        var e = observer.orientation.elements;

        uniforms.cam_x.value.set(e[0], e[1], e[2]);
        uniforms.cam_y.value.set(e[3], e[4], e[5]);
        uniforms.cam_z.value.set(e[6], e[7], e[8]);

        function setVec(target, value) {
            uniforms[target].value.set(value.x, value.y, value.z);
        }

        setVec('cam_pos', observer.position);
        setVec('cam_vel', observer.velocity);
    };

    var material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: $('#vertex-shader').text(),
    });

    scene.updateShader = function () {
        material.fragmentShader = shader.compile();
        material.needsUpdate = true;
        shader.needsUpdate = true;
    };

    scene.updateShader();

    var mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Stats Removed per user request
    /*
    stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0px';
    container.appendChild(stats.domElement);
    $(stats.domElement).addClass('hidden-phone');
    */

    // Orbit camera from three.js
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 80000);
    initializeCamera(camera);

    cameraControls = new THREE.OrbitControls(camera, renderer.domElement);
    cameraControls.target.set(0, 0, 0);
    cameraControls.addEventListener('change', updateCamera);
    updateCamera();

    onWindowResize();

    window.addEventListener('resize', onWindowResize, false);

    setupGUI();
}

function setupGUI() {

    var hint = $('#hint-text');
    var p = shader.parameters;

    function updateShader() {
        hint.hide();
        scene.updateShader();
    }

    // Floating Menu Toggle
    $('#fab-toggle').on('click', function () {
        $('#controls-menu').toggleClass('active');
        var icon = $(this).find('i');
        if ($('#controls-menu').hasClass('active')) {
            icon.removeClass('fa-sliders-h').addClass('fa-times');
        } else {
            icon.removeClass('fa-times').addClass('fa-sliders-h');
        }
    });

    // Close menu when clicking outside (optional, but good UX)
    $(document).on('click', function (event) {
        if (!$(event.target).closest('#controls-container').length) {
            $('#controls-menu').removeClass('active');
            $('#fab-toggle i').removeClass('fa-times').addClass('fa-sliders-h');
        }
    });

    // Quality Select
    $('#ctrl-quality').on('change', function () {
        var value = $(this).val();
        switch (value) {
            case 'fast':
                p.n_steps = 40;
                break;
            case 'medium':
                p.n_steps = 100;
                break;
            case 'high':
                p.n_steps = 200;
                break;
        }
        p.quality = value;
        updateShader();
    });

    // Accretion Disk Checkbox
    $('#ctrl-accretion').on('change', function () {
        p.accretion_disk = $(this).is(':checked');
        updateShader();
    });

    // Observer Motion Checkbox
    $('#ctrl-motion').on('change', function () {
        var motion = $(this).is(':checked');
        p.observer.motion = motion;
        updateCamera();
        updateShader();
    });

    // Zoom (Distance) Slider
    $('#ctrl-distance').on('input', function () {
        p.observer.distance = parseFloat($(this).val());
        updateCamera();
    });

    // Planet Enabled Checkbox
    $('#ctrl-planet-enabled').on('change', function () {
        var enabled = $(this).is(':checked');
        p.planet.enabled = enabled;
        updateShader();
        if (enabled) $('#planet-settings').slideDown();
        else $('#planet-settings').slideUp();
    });

    // Planet Distance Slider
    $('#ctrl-planet-dist').on('input', function () {
        p.planet.distance = parseFloat($(this).val());
        updateUniforms();
    });

    // Planet Radius Slider
    $('#ctrl-planet-radius').on('input', function () {
        p.planet.radius = parseFloat($(this).val());
        updateUniforms();
    });

    // Time Scale Slider
    $('#ctrl-time').on('input', function () {
        p.time_scale = parseFloat($(this).val());
    });

    // --- Advanced Controls ---

    // Toggle Advanced Section
    $('#toggle-advanced').on('click', function () {
        $('#advanced-settings').slideToggle();
        $(this).find('i').toggleClass('fa-microchip fa-times');
    });

    // Orbital Inclination
    $('#ctrl-inclination').on('input', function () {
        p.observer.orbital_inclination = parseFloat($(this).val());
        updateCamera();
    });

    // Light Travel Time
    $('#ctrl-light-travel').on('change', function () {
        p.light_travel_time = $(this).is(':checked');
        updateShader();
    });

    // Gravitational Time Dilation
    $('#ctrl-time-dilation').on('change', function () {
        p.gravitational_time_dilation = $(this).is(':checked');
        updateShader();
    });

    // Lorentz Contraction
    $('#ctrl-lorentz').on('change', function () {
        p.lorentz_contraction = $(this).is(':checked');
        updateShader();
    });

    // Aberration
    $('#ctrl-aberration').on('change', function () {
        p.aberration = $(this).is(':checked');
        updateShader();
    });

    // Beaming
    $('#ctrl-beaming').on('change', function () {
        p.beaming = $(this).is(':checked');
        updateShader();
    });

    // Doppler Shift
    $('#ctrl-doppler').on('change', function () {
        p.doppler_shift = $(this).is(':checked');
        updateShader();
    });

    // --- Mobile Performance Optimization ---
    var isMobile = window.innerWidth < 650;
    if (isMobile) {
        // Reduce quality for smooth FPS
        shader.parameters.n_steps = 40;
        shader.parameters.quality = 'fast';
        shader.parameters.planet.enabled = false;
        updateShader();
    }

    // --- Scroll to Rotate & Spiral (Zoom In) ---
    $('#portfolio-container').on('scroll', function () {
        // We do NOT disable motion here, allowing "Auto Rotation" to persist if checked.

        var el = $(this)[0];
        var maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll <= 0) return;

        var scrollPct = el.scrollTop / maxScroll;

        // Map scroll to rotation (0 to 90 degrees for gentler effect)
        var angle = scrollPct * (Math.PI * 0.5); // reduced from Math.PI

        // --- Spiral Effect (Zoom In + Pitch Up) ---
        // Distance: Starts at 14.0 (Far), Ends at 6.0 (Close)
        var maxDist = 14.0;
        var minDist = 6.0;
        var newDist = maxDist - (scrollPct * (maxDist - minDist));

        // Pitch (Inclination): Starts at -10, Ends at 20 (Top-down view)
        var startPitch = -10;
        var endPitch = 20;
        var newPitch = startPitch + (scrollPct * (endPitch - startPitch));

        // Update Observer Parameters directly
        p.observer.distance = newDist;
        shader.parameters.observer.distance = newDist; // Ensure shader gets it

        p.observer.orbital_inclination = newPitch;
        shader.parameters.observer.orbital_inclination = newPitch;

        // Sync GUI controls if they exist (visual feedback)
        // Note: In a real app we might hide these controls, but good for debug
        // iterating over controllers is hard without reference, so we skip explicit GUI update 
        // unless we stored them. But `p` is the GUI object, so it holds state.

        // Circular orbit in XZ plane based on new distance
        var x = Math.sin(angle) * newDist;
        var z = Math.cos(angle) * newDist;

        // Update observer position directly
        observer.position.x = x;
        observer.position.z = z;

        // Force update uniforms
        updateUniforms();

        // --- Profile Scroll Effect ---
        // Scale down and fade out profile as we scroll down
        var profileScale = Math.max(0.8, 1 - scrollPct * 0.5);
        var profileOpacity = Math.max(0, 1 - scrollPct * 3);
        var profileY = scrollPct * 200; // Parallax move down

        $('#profile').css({
            'transform': 'translateY(' + profileY + 'px) scale(' + profileScale + ')',
            'opacity': profileOpacity
        });
    });

    // --- ISS Cursor Follow ---
    $(document).on('mousemove', function (e) {
        // Simple follow
        $('#iss-cursor').css({
            left: e.pageX,
            top: e.pageY
        });

        // Optional: Rotate based on movement direction? 
        // For now, just simple follow is clean.
    });

    // --- 3D Tilt Effect for Cards ---
    $(document).on('mousemove', '.grid-card', function (e) {
        var card = $(this);
        var width = card.outerWidth();
        var height = card.outerHeight();
        var offset = card.offset();

        // Mouse position relative to card
        var x = e.pageX - offset.left;
        var y = e.pageY - offset.top;

        // Calculate rotation (Max +/- 10 degrees)
        // RotateX is based on Y position (up/down)
        // RotateY is based on X position (left/right)
        var xRot = -1 * ((y - height / 2) / (height / 2) * 10);
        var yRot = (x - width / 2) / (width / 2) * 10;

        // Apply transform
        // Note: perspective is already on the container, but we can reinforce it or just use rotate
        card.css('transform', 'translateY(-5px) scale(1.02) rotateX(' + xRot + 'deg) rotateY(' + yRot + 'deg)');
    });

    $(document).on('mouseleave', '.grid-card', function () {
        // Reset state
        $(this).css('transform', 'translateY(0) scale(1) rotateX(0) rotateY(0)');
    });

    // --- Click Burst Effect ---
    $(document).on('click', function (e) {
        // Prevent burst on UI elements to keep it clean
        if ($(e.target).closest('.control-group, #music-toggle, a').length) return;

        var burst = $('<div class="click-burst"></div>');
        burst.css({
            left: e.pageX - 10, // Center based on width/2
            top: e.pageY - 10
        });
        $('body').append(burst);

        // Cleanup after animation
        setTimeout(function () {
            burst.remove();
        }, 500);
    });

    // --- Music Toggle Logic ---
    var musicAudio = document.getElementById('bg-music');
    var musicBtn = document.getElementById('music-toggle');
    var musicIcon = musicBtn ? musicBtn.querySelector('i') : null;

    if (musicBtn && musicAudio) {
        musicAudio.volume = 0.5; // Start at 50% volume

        musicBtn.addEventListener('click', function (e) {
            e.stopPropagation(); // Prevent other clicks

            if (musicAudio.paused) {
                musicAudio.play().then(function () {
                    musicBtn.classList.add('playing');
                    if (musicIcon) {
                        musicIcon.classList.remove('fa-music');
                        musicIcon.classList.add('fa-volume-up');
                    }
                }).catch(function (err) {
                    console.error("Audio play failed:", err);
                    alert("Please ensure audio/bgm.mp3 exists!");
                });
            } else {
                musicAudio.pause();
                musicBtn.classList.remove('playing');
                if (musicIcon) {
                    musicIcon.classList.remove('fa-volume-up');
                    musicIcon.classList.add('fa-music');
                }
            }
        });
    }



    // --- Gyroscope Tilt (Mobile) ---
    window.addEventListener('deviceorientation', function (event) {
        // Beta: Front/Back tilt, Gamma: Left/Right tilt
        var tiltX = event.beta;
        var tiltY = event.gamma;

        // Limit max tilt effect to 20 degrees
        var maxTilt = 20;

        if (tiltX > maxTilt) tiltX = maxTilt;
        if (tiltX < -maxTilt) tiltX = -maxTilt;

        if (tiltY > maxTilt) tiltY = maxTilt;
        if (tiltY < -maxTilt) tiltY = -maxTilt;

        // Apply tilt to camera position (subtle parallax)
        // Note: This requires the camera to be accessible or handled in the update loop
        // Apply to ALL cards
        $('.grid-card').css('transform',
            'translateY(-5px) ' +
            'rotateX(' + (-tiltX) + 'deg) ' +
            'rotateY(' + (tiltY) + 'deg)'
        );
    });
    // --- Sharpness / Resolution Control ---
    var sharpnessCtrl = document.getElementById('ctrl-sharpness');
    if (sharpnessCtrl) {
        // Set initial value based on device
        sharpnessCtrl.value = window.devicePixelRatio || 1.0;

        sharpnessCtrl.addEventListener('input', function () {
            var val = parseFloat(this.value);
            renderer.setPixelRatio(val);
            // Force redraw? Usually automatic with animate loop
        });

        // Apply initial
        setTimeout(function () {
            renderer.setPixelRatio(parseFloat(sharpnessCtrl.value));
        }, 500);
    }
}

function onWindowResize(event) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Ensure pixel ratio is maintained from slider (or default)
    var sharpnessCtrl = document.getElementById('ctrl-sharpness');
    if (sharpnessCtrl) {
        renderer.setPixelRatio(parseFloat(sharpnessCtrl.value));
    } else {
        renderer.setPixelRatio(window.devicePixelRatio);
    }
    updateUniforms();
}

function initializeCamera(camera) {

    var pitchAngle = 3.0, yawAngle = 0.0;

    // there are nicely named methods such as "lookAt" in the camera object
    // but there do not do a thing to the projection matrix due to an internal
    // representation of the camera coordinates using a quaternion (nice)
    camera.matrixWorldInverse.makeRotationX(degToRad(-pitchAngle));
    camera.matrixWorldInverse.multiply(new THREE.Matrix4().makeRotationY(degToRad(-yawAngle)));

    var m = camera.matrixWorldInverse.elements;

    camera.position.set(m[2], m[6], m[10]);
}

function updateCamera(event) {

    var zoom_dist = camera.position.length();
    var m = camera.matrixWorldInverse.elements;
    var camera_matrix;

    if (shader.parameters.observer.motion) {
        camera_matrix = new THREE.Matrix3();
    }
    else {
        camera_matrix = observer.orientation;
    }

    camera_matrix.set(
        // row-major, not the same as .elements (nice)
        // y and z swapped for a nicer coordinate system
        m[0], m[1], m[2],
        m[8], m[9], m[10],
        m[4], m[5], m[6]
    );

    if (shader.parameters.observer.motion) {

        observer.orientation = observer.orbitalFrame().multiply(camera_matrix);

    } else {

        var p = new THREE.Vector3(
            camera_matrix.elements[6],
            camera_matrix.elements[7],
            camera_matrix.elements[8]);

        var dist = shader.parameters.observer.distance;
        observer.position.set(-p.x * dist, -p.y * dist, -p.z * dist);
        observer.velocity.set(0, 0, 0);
    }
}

function frobeniusDistance(matrix1, matrix2) {
    var sum = 0.0;
    for (var i in matrix1.elements) {
        var diff = matrix1.elements[i] - matrix2.elements[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

function animate() {
    requestAnimationFrame(animate);

    camera.updateMatrixWorld();
    camera.matrixWorldInverse.getInverse(camera.matrixWorld);

    if (shader.needsUpdate || shader.hasMovingParts() ||
        frobeniusDistance(camera.matrixWorldInverse, lastCameraMat) > 1e-10) {

        shader.needsUpdate = false;
        render();
        lastCameraMat = camera.matrixWorldInverse.clone();
    }
    // stats.update();
}

var lastCameraMat = new THREE.Matrix4().identity();

var getFrameDuration = (function () {
    var lastTimestamp = new Date().getTime();
    return function () {
        var timestamp = new Date().getTime();
        var diff = (timestamp - lastTimestamp) / 1000.0;
        lastTimestamp = timestamp;
        return diff;
    };
})();

function render() {
    observer.move(getFrameDuration());
    if (shader.parameters.observer.motion) updateCamera();
    updateUniforms();
    renderer.render(scene, camera);
}

// --- Robust Medium Article Fetch ---
$(document).ready(function () {
    console.log("Initializing Medium Fetch...");
    const mediumUsername = 'bharathkannandeveloper';
    const rssUrl = `https://medium.com/feed/@${mediumUsername}`;
    // Use a CORS proxy or rss2json
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

    $.ajax({
        url: apiUrl,
        method: 'GET',
        dataType: 'json',
        success: function (data) {
            console.log("Medium Fetch Success:", data);
            if (data.status === 'ok' && data.items.length > 0) {
                const latest = data.items[0];

                const $card = $('#medium-article');
                if ($card.length) {
                    $card.attr('href', latest.link);

                    // Truncate title if too long (max 60 chars)
                    let title = latest.title;
                    if (title.length > 50) {
                        title = title.substring(0, 50).trim() + "...";
                    }

                    $card.find('h3').text(title);
                    $card.find('p').html('Read latest article <i class="fas fa-external-link-alt"></i>');
                }
            } else {
                console.warn("Medium Fetch: No items found or status not ok.");
                fallbackMedium(mediumUsername);
            }
        },
        error: function (err) {
            console.error("Medium Fetch Error:", err);
            fallbackMedium(mediumUsername);
        }
    });

    function fallbackMedium(username) {
        const $card = $('#medium-article');
        if ($card.length) {
            $card.attr('href', `https://medium.com/@${username}`);
            $card.find('h3').text('Visit Medium Profile');
            $card.find('p').text('Tap to read articles');
        }
    }
});
