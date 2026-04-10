// ==UserScript==
// @name         Lozza Engine Lab Pro
// @namespace    https://delta-polder-indonesia.local/
// @version      2.1.0
// @description  Professional UCI test harness untuk lozza-fixed.js
// @author       You
// @match        https://www.chess.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const ENGINE_URL =
    "https://raw.githubusercontent.com/Delta-Polder-Indonesia/lozza-fixed.js/refs/heads/main/lozza-fixed.js";

  const PANEL_ID = "lel-panel";
  let worker = null;
  let workerUrl = null;
  let loaded = false;
  let consecutiveErrors = 0;
  const MAX_ERRORS = 3;

  const state = {
    logLines: [],
    maxLogLines: 1000,
    testResults: [],
    waitingForResponse: null,
    responseTimeout: null,
    commandSentTime: 0,
    engineOptions: [],
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0
  };

  const perfMonitor = {
    searches: [],
    trackSearch(info) {
      const match = info.match(/depth (\d+).*nodes (\d+).*nps (\d+).*time (\d+)/);
      if (match) {
        this.searches.push({
          depth: parseInt(match[1]),
          nodes: parseInt(match[2]),
          nps: parseInt(match[3]),
          time: parseInt(match[4]),
          timestamp: Date.now()
        });
      }
    },
    getStats() {
      if (this.searches.length === 0) return null;
      const avgNPS = this.searches.reduce((sum, s) => sum + s.nps, 0) / this.searches.length;
      const maxDepth = Math.max(...this.searches.map(s => s.depth));
      const totalNodes = this.searches.reduce((sum, s) => sum + s.nodes, 0);
      return {
        searches: this.searches.length,
        avgNPS: Math.round(avgNPS),
        maxDepth,
        totalNodes,
        avgNodesPerSearch: Math.round(totalNodes / this.searches.length)
      };
    },
    reset() {
      this.searches = [];
    }
  };

  const validators = {
    uci: (response) => {
      const lines = response.split('\n');
      const hasUciOk = lines.some(l => l.includes('uciok'));
      const options = lines.filter(l => l.startsWith('option name')).length;
      return { passed: hasUciOk, details: options + ' options' };
    },
    isready: (response) => ({
      passed: response.includes('readyok'),
      latency: Math.round(performance.now() - state.commandSentTime)
    }),
    go: (response) => {
      const hasBestmove = response.includes('bestmove');
      const nodes = response.match(/nodes (\d+)/);
      return { passed: hasBestmove, nodes: nodes ? parseInt(nodes[1]) : 0 };
    },
    perft: (response) => {
      const nodes = response.match(/Nodes[:\s]+(\d+)/i);
      return { passed: nodes !== null, totalNodes: nodes ? parseInt(nodes[1]) : 0 };
    }
  };

  const testPositions = {
    startpos: "startpos",
    mate_in_2: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
    endgame: "8/5k2/3p4/1p1Pp2p/pP2Pp1P/P4P1K/8/8 b - - 99 50",
    tactical: "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 0 7",
    kiwipete: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"
  };

  function addLog(line, type = "info") {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    let prefix = "";
    if (type === "cmd") prefix = ">";
    else if (type === "res") prefix = "<";
    else if (type === "ok") prefix = "[OK]";
    else if (type === "err") prefix = "[ERR]";
    else if (type === "warn") prefix = "[!]";
    else if (type === "data") prefix = "[i]";
    else prefix = "-";

    state.logLines.push(`${ts} ${prefix} ${line}`);
    if (state.logLines.length > state.maxLogLines) state.logLines.shift();
    updateLogDisplay();
  }

  function updateLogDisplay() {
    const logEl = document.querySelector("#lel-log");
    if (logEl) {
      logEl.value = state.logLines.join("\n");
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function gmFetch(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error("HTTP " + res.status));
        },
        onerror: () => reject(new Error("Network error"))
      });
    });
  }

  async function loadEngine() {
    if (loaded) {
      addLog("Engine already loaded", "warn");
      return;
    }
    addLog("Loading engine...", "info");
    const code = await gmFetch(ENGINE_URL);
    if (!code || !code.includes("onmessage")) {
      throw new Error("Invalid engine script");
    }
    const blob = new Blob([code], { type: "application/javascript" });
    workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl);

    worker.onmessage = (e) => {
      const msg = String(e.data || "").trim();
      if (!msg) return;

      let logType = "res";
      if (msg.includes('bestmove')) logType = "ok";
      else if (msg.includes('error')) logType = "err";

      addLog(msg, logType);

      if (msg.startsWith('info') && msg.includes('nps')) {
        perfMonitor.trackSearch(msg);
      }
      if (msg.startsWith('option name')) {
        parseUCIOption(msg);
      }

      if (state.waitingForResponse) {
        if (msg.includes('uciok') || msg.includes('readyok') ||
            msg.startsWith('bestmove') || msg.includes('Nodes:')) {
          if (state.responseTimeout) clearTimeout(state.responseTimeout);
          const { validator, resolve } = state.waitingForResponse;
          if (validator && validators[validator]) {
            const result = validators[validator](state.logLines.join('\n'));
            addLog("Validation: " + (result.passed ? "passed" : "failed"), result.passed ? "ok" : "err");
          }
          resolve(msg);
          state.waitingForResponse = null;
        }
      }
    };

    worker.onerror = (e) => {
      consecutiveErrors++;
      addLog("Worker error: " + (e.message || "unknown"), "err");
      if (consecutiveErrors >= MAX_ERRORS) {
        addLog("Auto-recovery triggered", "warn");
        autoRecover();
      }
    };

    loaded = true;
    consecutiveErrors = 0;
    addLog("Engine loaded", "ok");
  }

  function unloadEngine() {
    if (worker) { worker.terminate(); worker = null; }
    if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null; }
    loaded = false;
    state.engineOptions = [];
    addLog("Engine unloaded", "info");
  }

  async function autoRecover() {
    try {
      unloadEngine();
      await delay(1000);
      await loadEngine();
      await sendCmd("uci", "uci");
      await sendCmd("isready", "isready");
      consecutiveErrors = 0;
      addLog("Recovery successful", "ok");
    } catch (e) {
      addLog("Recovery failed: " + e.message, "err");
    }
  }

  function sendCmd(cmd, expectedResponse = null, timeout = 10000) {
    if (!worker || !loaded) {
      addLog("Engine not loaded", "err");
      return Promise.reject("Engine not loaded");
    }
    const clean = (cmd || "").trim();
    if (!clean) return Promise.resolve();

    return new Promise((resolve, reject) => {
      state.commandSentTime = performance.now();
      state.waitingForResponse = { command: clean, validator: expectedResponse, resolve, reject };
      addLog(clean, "cmd");
      worker.postMessage(clean + "\n");

      if (state.responseTimeout) clearTimeout(state.responseTimeout);
      state.responseTimeout = setTimeout(() => {
        addLog("Timeout: " + clean, "err");
        reject(new Error("Timeout: " + clean));
        state.waitingForResponse = null;
      }, timeout);
    });
  }

  function parseUCIOption(line) {
    const nameMatch = line.match(/option name (.+?) type/);
    const typeMatch = line.match(/type (\w+)/);
    const defaultMatch = line.match(/default (.+?)(?:\s|$)/);
    if (nameMatch) {
      state.engineOptions.push({
        name: nameMatch[1],
        type: typeMatch ? typeMatch[1] : 'unknown',
        default: defaultMatch ? defaultMatch[1] : ''
      });
    }
  }

  function showOptions() {
    if (state.engineOptions.length === 0) {
      addLog("Run 'uci' first", "warn");
      return;
    }
    addLog("--- Engine Options ---", "info");
    state.engineOptions.forEach(opt => {
      addLog(opt.name + " (" + opt.type + ") = " + opt.default, "data");
    });
  }

  function showStats() {
    const stats = perfMonitor.getStats();
    if (!stats) {
      addLog("No performance data", "warn");
      return;
    }
    addLog("--- Performance Stats ---", "info");
    addLog("Searches: " + stats.searches, "data");
    addLog("Avg NPS: " + stats.avgNPS.toLocaleString(), "data");
    addLog("Max depth: " + stats.maxDepth, "data");
    addLog("Total nodes: " + stats.totalNodes.toLocaleString(), "data");
  }

  async function runAutomatedTests() {
    addLog("=== Automated Test Suite ===", "info");
    const results = [];
    try {
      addLog("Test 1: UCI Protocol", "info");
      await sendCmd("uci", "uci", 5000);
      results.push({ test: "UCI Protocol", pass: true });
      await delay(300);

      addLog("Test 2: Ready Check", "info");
      await sendCmd("isready", "isready", 3000);
      results.push({ test: "Ready Check", pass: true });
      await delay(300);

      addLog("Test 3: New Game", "info");
      await sendCmd("ucinewgame");
      await delay(200);
      await sendCmd("isready", "isready", 3000);
      results.push({ test: "New Game", pass: true });
      await delay(300);

      addLog("Test 4: Options", "info");
      await sendCmd("setoption name MultiPV value 3");
      await sendCmd("setoption name SkillLevel value 15");
      results.push({ test: "Options", pass: true });
      await delay(300);

      addLog("Test 5: Search", "info");
      await sendCmd("position startpos");
      await delay(200);
      await sendCmd("go depth 8", "go", 15000);
      results.push({ test: "Search", pass: true });
      await delay(500);

      addLog("Test 6: Stop", "info");
      await sendCmd("go infinite");
      await delay(1000);
      await sendCmd("stop", "go", 3000);
      results.push({ test: "Stop", pass: true });
      await delay(300);

      addLog("Test 7: Perft", "info");
      await sendCmd("position startpos");
      await delay(200);
      await sendCmd("perft 4", "perft", 10000);
      results.push({ test: "Perft", pass: true });
      await delay(500);

      addLog("Test 8: FEN", "info");
      await sendCmd("position fen " + testPositions.tactical);
      await delay(200);
      await sendCmd("go depth 6", "go", 10000);
      results.push({ test: "FEN", pass: true });

      addLog("=== Results ===", "info");
      results.forEach(r => addLog((r.pass ? "[v]" : "[x]") + " " + r.test, r.pass ? "ok" : "err"));
      state.testResults = results;

    } catch (error) {
      addLog("Test failed: " + error.message, "err");
    }
  }

  async function runSmokeTest() {
    addLog("=== Smoke Test ===", "info");
    const cmds = [
      ["uci", "uci"], ["isready", "isready"], ["ucinewgame"],
      ["isready", "isready"], ["setoption name MultiPV value 3"],
      ["position startpos"], ["go depth 8", "go"]
    ];
    for (const [cmd, v] of cmds) {
      try {
        await sendCmd(cmd, v);
        await delay(200);
      } catch (e) {
        addLog("Error: " + e.message, "err");
        break;
      }
    }
    addLog("Smoke test done", "ok");
  }

  async function runExtendedTest() {
    addLog("=== Extended Test ===", "info");
    const cmds = [
      ["stop"], ["ucinewgame"], ["isready", "isready"],
      ["setoption name MultiPV value 4"],
      ["setoption name ShowWDL value true"],
      ["setoption name SkillLevel value 12"],
      ["setoption name HumanMode value on"],
      ["position startpos"], ["go depth 10", "go"],
      ["stop"], ["perft 4", "perft"], ["bench 6"]
    ];
    for (const [cmd, v] of cmds) {
      try {
        await sendCmd(cmd, v);
        await delay(300);
      } catch (e) {
        addLog("Error: " + e.message, "err");
        break;
      }
    }
    addLog("Extended test done", "ok");
  }

  function exportResults() {
    const data = {
      timestamp: new Date().toISOString(),
      logs: state.logLines,
      performance: perfMonitor.getStats(),
      testResults: state.testResults,
      options: state.engineOptions
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "lozza-test-" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    addLog("Results exported", "ok");
  }

  function initDrag(panel) {
    const header = panel.querySelector("#lel-header");

    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      state.isDragging = true;
      state.dragOffsetX = e.clientX - panel.offsetLeft;
      state.dragOffsetY = e.clientY - panel.offsetTop;
      header.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
      if (!state.isDragging) return;
      e.preventDefault();
      let x = e.clientX - state.dragOffsetX;
      let y = e.clientY - state.dragOffsetY;

      x = Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth));
      y = Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight));

      panel.style.left = x + "px";
      panel.style.right = "auto";
      panel.style.top = y + "px";
      panel.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      state.isDragging = false;
      header.style.cursor = "grab";
    });
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div id="lel-header">
        <span class="lel-title">Engine Lab</span>
        <div class="lel-header-btns">
          <button id="lel-min" title="Minimize">_</button>
          <button id="lel-close" title="Close">x</button>
        </div>
      </div>
      <div id="lel-body">
        <div class="lel-section">
          <div class="lel-label">Engine</div>
          <div class="lel-row">
            <button id="lel-load">Load</button>
            <button id="lel-unload">Unload</button>
            <button id="lel-uci">uci</button>
            <button id="lel-ready">isready</button>
            <button id="lel-stop">stop</button>
            <button id="lel-new">newgame</button>
          </div>
        </div>
        <div class="lel-section">
          <div class="lel-label">Tests</div>
          <div class="lel-row">
            <button id="lel-auto">Auto Test</button>
            <button id="lel-smoke">Smoke</button>
            <button id="lel-extended">Extended</button>
            <button id="lel-perft">perft</button>
            <button id="lel-bench">bench</button>
          </div>
        </div>
        <div class="lel-section">
          <div class="lel-label">Analysis</div>
          <div class="lel-row">
            <select id="lel-preset">
              <option value="startpos">Start Position</option>
              <option value="mate_in_2">Mate in 2</option>
              <option value="endgame">Endgame</option>
              <option value="tactical">Tactical</option>
              <option value="kiwipete">Kiwipete</option>
            </select>
            <button id="lel-analyze">Analyze</button>
          </div>
          <input id="lel-fen" type="text" placeholder="Custom FEN..." />
          <div class="lel-row">
            <button id="lel-setfen">Set FEN</button>
            <button id="lel-stats">Stats</button>
            <button id="lel-opts">Options</button>
            <button id="lel-export">Export</button>
          </div>
        </div>
        <textarea id="lel-log" readonly placeholder="Logs will appear here..."></textarea>
        <div class="lel-row lel-input-row">
          <input id="lel-cmd" type="text" placeholder="UCI command..." />
          <button id="lel-send">Send</button>
          <button id="lel-clear">Clear</button>
        </div>
      </div>
      <style>
        #${PANEL_ID} {
          position: fixed;
          right: 15px;
          bottom: 15px;
          z-index: 999999;
          width: 420px;
          background: #1a1a1a;
          color: #ccc;
          border: 1px solid #333;
          border-radius: 6px;
          font: 12px/1.4 Consolas, Monaco, monospace;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          user-select: none;
        }
        #lel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 10px;
          background: #252525;
          border-bottom: 1px solid #333;
          border-radius: 6px 6px 0 0;
          cursor: grab;
        }
        .lel-title {
          font-weight: 600;
          color: #e0e0e0;
          font-size: 13px;
        }
        .lel-header-btns {
          display: flex;
          gap: 4px;
        }
        .lel-header-btns button {
          width: 22px;
          height: 22px;
          padding: 0;
          background: #333;
          border: 1px solid #444;
          border-radius: 3px;
          color: #999;
          cursor: pointer;
          font-size: 12px;
          line-height: 1;
        }
        .lel-header-btns button:hover {
          background: #444;
          color: #fff;
        }
        #lel-close:hover {
          background: #c53030;
          border-color: #c53030;
        }
        #lel-body {
          padding: 10px;
        }
        .lel-section {
          margin-bottom: 10px;
        }
        .lel-label {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 5px;
          letter-spacing: 0.5px;
        }
        .lel-row {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }
        #${PANEL_ID} button {
          padding: 5px 9px;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 4px;
          color: #b0b0b0;
          cursor: pointer;
          font: 11px Consolas, Monaco, monospace;
          transition: background 0.15s, border-color 0.15s;
        }
        #${PANEL_ID} button:hover {
          background: #353535;
          border-color: #4a4a4a;
          color: #ddd;
        }
        #${PANEL_ID} button:active {
          background: #404040;
        }
        #lel-load {
          background: #1e3a1e;
          border-color: #2d5a2d;
          color: #7cb87c;
        }
        #lel-load:hover {
          background: #264d26;
        }
        #lel-unload {
          background: #3a1e1e;
          border-color: #5a2d2d;
          color: #c87c7c;
        }
        #lel-unload:hover {
          background: #4d2626;
        }
        #lel-auto {
          background: #1e2a3a;
          border-color: #2d3d5a;
          color: #7c9cb8;
        }
        #lel-auto:hover {
          background: #263450;
        }
        #${PANEL_ID} select,
        #${PANEL_ID} input[type="text"] {
          padding: 5px 8px;
          background: #222;
          border: 1px solid #3a3a3a;
          border-radius: 4px;
          color: #ccc;
          font: 11px Consolas, Monaco, monospace;
          outline: none;
        }
        #${PANEL_ID} select:focus,
        #${PANEL_ID} input[type="text"]:focus {
          border-color: #555;
        }
        #lel-preset {
          flex: 1;
          min-width: 120px;
        }
        #lel-fen {
          width: 100%;
          margin: 6px 0;
          box-sizing: border-box;
        }
        #lel-log {
          width: 100%;
          height: 220px;
          margin-top: 8px;
          padding: 8px;
          background: #0d0d0d;
          border: 1px solid #2a2a2a;
          border-radius: 4px;
          color: #8bc98b;
          font: 11px/1.35 Consolas, Monaco, monospace;
          resize: vertical;
          box-sizing: border-box;
        }
        .lel-input-row {
          margin-top: 8px;
        }
        #lel-cmd {
          flex: 1;
        }
      </style>
    `;

    document.body.appendChild(panel);
    initDrag(panel);

    const body = panel.querySelector("#lel-body");
    panel.querySelector("#lel-min").onclick = () => {
      body.style.display = body.style.display === "none" ? "block" : "none";
    };
    panel.querySelector("#lel-close").onclick = () => panel.remove();

    panel.querySelector("#lel-load").onclick = async () => {
      try { await loadEngine(); } catch (e) { addLog("Load failed: " + e.message, "err"); }
    };
    panel.querySelector("#lel-unload").onclick = unloadEngine;
    panel.querySelector("#lel-uci").onclick = () => sendCmd("uci", "uci");
    panel.querySelector("#lel-ready").onclick = () => sendCmd("isready", "isready");
    panel.querySelector("#lel-stop").onclick = () => sendCmd("stop");
    panel.querySelector("#lel-new").onclick = () => sendCmd("ucinewgame");

    panel.querySelector("#lel-auto").onclick = runAutomatedTests;
    panel.querySelector("#lel-smoke").onclick = runSmokeTest;
    panel.querySelector("#lel-extended").onclick = runExtendedTest;
    panel.querySelector("#lel-perft").onclick = async () => {
      await sendCmd("position startpos");
      await delay(100);
      sendCmd("perft 4", "perft");
    };
    panel.querySelector("#lel-bench").onclick = () => sendCmd("bench 6");

    panel.querySelector("#lel-analyze").onclick = async () => {
      const preset = panel.querySelector("#lel-preset").value;
      const custom = panel.querySelector("#lel-fen").value.trim();
      if (custom) {
        await sendCmd("position fen " + custom);
      } else if (preset === "startpos") {
        await sendCmd("position startpos");
      } else {
        await sendCmd("position fen " + testPositions[preset]);
      }
      await delay(100);
      sendCmd("go depth 12", "go");
    };

    panel.querySelector("#lel-setfen").onclick = async () => {
      const fen = panel.querySelector("#lel-fen").value.trim();
      if (!fen) { addLog("FEN empty", "warn"); return; }
      await sendCmd("position fen " + fen);
    };

    panel.querySelector("#lel-stats").onclick = showStats;
    panel.querySelector("#lel-opts").onclick = showOptions;
    panel.querySelector("#lel-export").onclick = exportResults;

    const cmdInput = panel.querySelector("#lel-cmd");
    panel.querySelector("#lel-send").onclick = () => {
      sendCmd(cmdInput.value);
      cmdInput.value = "";
      cmdInput.focus();
    };
    cmdInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        sendCmd(cmdInput.value);
        cmdInput.value = "";
      }
    };

    panel.querySelector("#lel-clear").onclick = () => {
      state.logLines = [];
      perfMonitor.reset();
      addLog("Cleared", "info");
    };

    addLog("Engine Lab ready", "info");
    addLog("Click Load to start", "info");
  }

  createPanel();
})();