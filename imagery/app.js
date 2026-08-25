/* 意象笺 · 应用逻辑（零依赖，兼容 file:// 直接打开） */
(function () {
  "use strict";

  /* ---------------- 基础工具 ---------------- */
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function loadJSON(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleString("zh-CN", {
        month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
      });
    } catch (e) { return ""; }
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add("hidden"); }, 2200);
  }
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------------- 数据 ---------------- */
  var BUILTIN_IMG = window.YX_IMAGERY || [];
  var BUILTIN_SCENES = window.YX_SCENES || [];
  var imported = loadJSON("yx_imported_v1", { imagery: [], scenes: [] });
  var notes = loadJSON("yx_notes_v1", {});        // id -> {text, ts}
  var collides = loadJSON("yx_collides_v1", []);  // [{ts,imgId,imgName,sceneName,mood,prompt,text}]

  function allImagery() { return BUILTIN_IMG.concat(imported.imagery); }
  function allScenes() { return BUILTIN_SCENES.concat(imported.scenes); }
  function byId(id) {
    var list = allImagery();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  var SENSES = ["视觉", "听觉", "嗅觉", "触觉", "味觉", "情思"];
  function uniqueMoods() {
    var m = {};
    allImagery().forEach(function (it) { (it.moods || []).forEach(function (x) { m[x] = 1; }); });
    return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, "zh"); });
  }
  function uniqueCats() {
    var c = {};
    allImagery().forEach(function (it) { c[it.category] = 1; });
    return Object.keys(c);
  }

  /* ---------------- 花瓣引擎 ---------------- */
  function spawnPetal(x, y) {
    var p = document.createElement("div");
    p.className = "petal";
    var s = 12 + Math.random() * 9;
    p.style.setProperty("--s", s + "px");
    p.style.setProperty("--d", (2.2 + Math.random() * 1.6).toFixed(2) + "s");
    p.style.setProperty("--dx", ((Math.random() * 300) - 150).toFixed(0) + "px");
    p.style.setProperty("--r", ((Math.random() * 520) - 260).toFixed(0) + "deg");
    p.style.left = (x + (Math.random() * 30 - 15)) + "px";
    p.style.top = (y + (Math.random() * 30 - 15)) + "px";
    document.body.appendChild(p);
    p.addEventListener("animationend", function () { p.remove(); });
  }
  function petalBurst(x, y, n) {
    for (var i = 0; i < n; i++) {
      setTimeout(function () { spawnPetal(x, y); }, Math.random() * 260);
    }
  }
  function bindFlowerClicks() {
    $$(".mag-flower").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        var rect = el.getBoundingClientRect();
        var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        petalBurst(cx, cy, 9);
        el.classList.remove("bounce");
        void el.offsetWidth;
        el.classList.add("bounce");
        ev.stopPropagation();
      });
    });
  }

  /* ---------------- 视图切换 ---------------- */
  var currentView = "splash";
  function showView(name) {
    currentView = name;
    ["gallery", "collide", "notes", "import"].forEach(function (v) {
      $("#view-" + v).classList.toggle("hidden", v !== name);
    });
    $$("#nav .nav-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === name);
    });
    if (name === "collide") ensureCollide();
    if (name === "notes") renderNotes();
    if (name === "import") renderImportStats();
  }
  $("#enter-btn").addEventListener("click", function (ev) {
    $("#view-splash").classList.add("hidden");
    $("#topbar").classList.remove("hidden");
    $("#foot").classList.remove("hidden");
    var r = ev.currentTarget.getBoundingClientRect();
    petalBurst(r.left + r.width / 2, r.top + r.height / 2, 12);
    showView("gallery");
  });
  $$("#nav .nav-btn").forEach(function (b) {
    b.addEventListener("click", function () { showView(b.dataset.view); });
  });

  /* ---------------- 意象墙 ---------------- */
  var filters = { q: "", cat: "", sense: "", moods: [] };
  var cMoods = []; // 碰撞页独立的"情感方向"选择，与意象墙筛选互不干扰

  function renderChips() {
    var catRow = $("#catRow"), senseRow = $("#senseRow"), moodPanel = $("#moodPanel"), cmoodPanel = $("#cmoodPanel");
    catRow.innerHTML = "";
    [""].concat(uniqueCats()).forEach(function (c) {
      var b = document.createElement("button");
      b.className = "chip" + (filters.cat === c ? " active" : "");
      b.textContent = c || "全部";
      b.addEventListener("click", function () {
        filters.cat = (filters.cat === c ? "" : c);
        renderChips(); renderGrid();
      });
      catRow.appendChild(b);
    });
    senseRow.innerHTML = "";
    SENSES.forEach(function (s) {
      var b = document.createElement("button");
      b.className = "chip" + (filters.sense === s ? " active" : "");
      b.textContent = s;
      b.addEventListener("click", function () {
        filters.sense = (filters.sense === s ? "" : s);
        renderChips(); renderGrid();
      });
      senseRow.appendChild(b);
    });
    var moods = uniqueMoods();
    moodPanel.innerHTML = "";
    moods.forEach(function (m) {
      var b = document.createElement("button");
      b.className = "chip" + (filters.moods.indexOf(m) >= 0 ? " active" : "");
      b.textContent = m;
      b.addEventListener("click", function () {
        var i = filters.moods.indexOf(m);
        if (i >= 0) filters.moods.splice(i, 1); else filters.moods.push(m);
        renderChips(); renderGrid();
      });
      moodPanel.appendChild(b);
    });
    cmoodPanel.innerHTML = "";
    moods.forEach(function (m) {
      var b = document.createElement("button");
      b.className = "chip" + (cMoods.indexOf(m) >= 0 ? " active" : "");
      b.textContent = m;
      b.addEventListener("click", function () {
        var i = cMoods.indexOf(m);
        if (i >= 0) cMoods.splice(i, 1); else cMoods.push(m);
        updateMoodChips();
      });
      cmoodPanel.appendChild(b);
    });
    $("#moodToggle").textContent = "情绪筛选 ▾（" + moods.length + " 种）";
  }

  function updateMoodChips() {
    $$("#moodPanel .chip").forEach(function (b) {
      b.classList.toggle("active", filters.moods.indexOf(b.textContent) >= 0);
    });
    $$("#cmoodPanel .chip").forEach(function (b) {
      b.classList.toggle("active", cMoods.indexOf(b.textContent) >= 0);
    });
  }

  $("#moodToggle").addEventListener("click", function () { $("#moodPanel").classList.toggle("hidden"); });
  $("#cmoodToggle").addEventListener("click", function () { $("#cmoodPanel").classList.toggle("hidden"); });

  function matchesFilters(it) {
    if (filters.cat && it.category !== filters.cat) return false;
    if (filters.sense && (it.senses || []).indexOf(filters.sense) < 0) return false;
    if (filters.moods.length && !(it.moods || []).some(function (m) { return filters.moods.indexOf(m) >= 0; })) return false;
    if (filters.q) {
      var q = filters.q.toLowerCase();
      var hay = (it.name + " " + (it.alt || "") + " " + it.category + " " + (it.source || "") + " " + (it.text || "")).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function renderGrid() {
    var grid = $("#grid");
    var list = allImagery().filter(matchesFilters);
    grid.innerHTML = "";
    $("#emptyTip").classList.toggle("hidden", list.length > 0);
    list.forEach(function (it) {
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="card-head"><span class="card-name">' + esc(it.name) + "</span>" +
        (it.alt ? '<span class="card-alt">' + esc(it.alt) + "</span>" : "") + "</div>" +
        '<div class="card-tags">' +
        '<span class="chip tag">' + esc(it.category) + "</span>" +
        (it.senses || []).map(function (s) { return '<span class="chip tag">' + esc(s) + "</span>"; }).join("") +
        "</div>" +
        '<div class="card-text">' + esc(it.text || "") + "</div>" +
        '<div class="card-src">' + esc(it.source || "") + "</div>";
      card.addEventListener("click", function () { openDetail(it.id); });
      grid.appendChild(card);
    });
  }

  $("#search").addEventListener("input", function (e) {
    filters.q = e.target.value.trim();
    renderGrid();
  });

  /* ---------------- 详情弹层 ---------------- */
  function openDetail(id) {
    var it = byId(id);
    if (!it) return;
    var note = notes[id] || {};
    var related = allImagery().filter(function (x) {
      if (x.id === id) return false;
      if (x.category === it.category) return true;
      return (x.moods || []).some(function (m) { return (it.moods || []).indexOf(m) >= 0; });
    }).slice(0, 6);
    $("#detailBody").innerHTML =
      '<div class="d-name">' + esc(it.name) + "</div>" +
      (it.alt ? '<div class="d-alt">' + esc(it.alt) + "</div>" : "") +
      '<div class="d-tags">' +
      '<span class="chip tag">' + esc(it.category) + "</span>" +
      (it.senses || []).map(function (s) { return '<span class="chip tag">' + esc(s) + "</span>"; }).join("") +
      (it.moods || []).map(function (m) { return '<span class="chip tag">' + esc(m) + "</span>"; }).join("") +
      "</div>" +
      '<div class="d-source">' + esc(it.source || "") + "</div>" +
      '<div class="d-text">' + esc(it.text || "") + "</div>" +
      '<div class="d-block"><h4>释义</h4><p>' + esc(it.meaning || "") + "</p></div>" +
      '<div class="d-block"><h4>意象解析</h4><p>' + esc(it.analysis || "") + "</p></div>" +
      (it.prompt ? '<div class="d-block"><h4>写作提示</h4><div class="d-prompt">' + esc(it.prompt) + "</div></div>" : "") +
      '<div class="d-block d-note">' +
      '<h4>我的随想</h4>' +
      '<textarea id="dNoteArea" rows="4" placeholder="写一写你从这个意象里看到的…（保存在本机）">' + esc(note.text || "") + "</textarea>" +
      '<div class="d-note-actions">' +
      '<span id="dNoteState" class="note-state"></span>' +
      '<button class="btn small" id="dNoteClear" type="button">清空</button>' +
      '<button class="btn small primary" id="dNoteSave" type="button">保存随想</button>' +
      "</div></div>" +
      (related.length ?
        '<div class="d-related"><h4>相近的意象</h4><div class="related-chips">' +
        related.map(function (r) { return '<button class="chip" data-rel="' + esc(r.id) + '">' + esc(r.name) + "</button>"; }).join("") +
        "</div></div>" : "");
    var area = $("#dNoteArea");
    var state = $("#dNoteState");
    var dirty = false;
    area.addEventListener("input", function () { dirty = true; state.textContent = "未保存"; });
    $("#dNoteSave").addEventListener("click", function () {
      var text = area.value.trim();
      if (text) {
        notes[id] = { text: text, ts: Date.now() };
        saveJSON("yx_notes_v1", notes);
        dirty = false;
        state.textContent = "已保存 " + fmtTime(notes[id].ts);
        toast("随想已收进随想簿");
      } else {
        delete notes[id]; saveJSON("yx_notes_v1", notes);
        dirty = false; state.textContent = "已清空";
        toast("随想已清空");
      }
    });
    $("#dNoteClear").addEventListener("click", function () {
      area.value = ""; dirty = true; state.textContent = "未保存";
    });
    area.addEventListener("blur", function () {
      if (dirty) $("#dNoteSave").click();
    });
    $$("#detailBody [data-rel]").forEach(function (chip) {
      chip.addEventListener("click", function () { openDetail(chip.dataset.rel); });
    });
    $("#detail").classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function closeDetail() {
    $("#detail").classList.add("hidden");
    document.body.style.overflow = "";
  }
  $("#detailClose").addEventListener("click", closeDetail);
  $("#detailMask").addEventListener("click", closeDetail);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDetail();
  });

  /* ---------------- 碰撞 ---------------- */
  var cImg = null, cScene = null, cPrompt = "";
  var SPARK_TEMPLATES = [
    "让「{img}」出现在「{scene}」——写一段 150 字以内的景物，让意象自己开口说话。",
    "如果「{img}」是「{scene}」里唯一的见证者，它会看见什么？",
    "用「{img}」的气息去写「{scene}」——不直接提它，只让读者感觉到它。",
    "在「{scene}」，一个人忽然想起了「{img}」。写 TA 此刻的独白。",
    "把「{img}」藏进「{scene}」的细节里，写三句话，让读者最后才发现它。",
    "让「{img}」与「{scene}」在同一个清晨醒来，写它们各自看到的第一个人。"
  ];
  function pickImg() {
    var pool = allImagery().filter(function (it) {
      return !cMoods.length || (it.moods || []).some(function (m) { return cMoods.indexOf(m) >= 0; });
    });
    if (!pool.length) pool = allImagery();
    var next;
    do { next = rand(pool); } while (pool.length > 1 && cImg && next.id === cImg.id);
    return next;
  }
  function pickScene() {
    var pool = allScenes();
    var next;
    do { next = rand(pool); } while (pool.length > 1 && cScene && next.id === cScene.id);
    return next;
  }
  function ensureCollide() {
    if (!cImg) { cImg = pickImg(); cScene = pickScene(); }
    renderCollide();
  }
  function renderCollide() {
    var img = byId(cImg.id) || cImg;
    $("#cImgCard").innerHTML =
      '<div class="c-kind">意 象</div>' +
      '<div class="c-title">' + esc(img.name) + "</div>" +
      (img.alt ? '<div class="c-sub">' + esc(img.alt) + "</div>" : "") +
      '<div class="c-quote">' + esc(img.text || "") + "</div>" +
      '<div class="c-sub" style="margin-top:8px;font-size:12px;color:var(--ink-faint)">' + esc(img.source || "") + "</div>";
    $("#cSceneCard").innerHTML =
      '<div class="c-kind">场 景</div>' +
      '<div class="c-title">' + esc(cScene.name) + "</div>" +
      '<div class="c-sub">' + esc(cScene.description || "") + "</div>";
    $("#sparkBox").classList.add("hidden");
    $("#cNote").value = "";
    $("#cNoteState").textContent = "";
  }
  $("#cRerollImg").addEventListener("click", function () { cImg = pickImg(); renderCollide(); });
  $("#cRerollScene").addEventListener("click", function () { cScene = pickScene(); renderCollide(); });
  $("#cRerollAll").addEventListener("click", function () { cImg = pickImg(); cScene = pickScene(); renderCollide(); });
  $("#cSpark").addEventListener("click", function () {
    var img = byId(cImg.id) || cImg;
    var t = rand(SPARK_TEMPLATES)
      .replace("{img}", img.name)
      .replace("{scene}", cScene.name);
    if (cMoods.length) t = "以「" + cMoods.join("、") + "」为底色，" + t;
    cPrompt = t;
    $("#sparkText").textContent = t;
    $("#sparkBox").classList.remove("hidden");
  });
  $("#cSaveNote").addEventListener("click", function () {
    var text = $("#cNote").value.trim();
    if (!text) { toast("先写点什么吧"); return; }
    var img = byId(cImg.id) || cImg;
    collides.unshift({
      ts: Date.now(), imgId: img.id, imgName: img.name,
      sceneName: cScene.name, mood: cMoods.slice(), prompt: cPrompt, text: text
    });
    saveJSON("yx_collides_v1", collides);
    $("#cNote").value = "";
    $("#cNoteState").textContent = "已保存";
    toast("碰撞随想已收进随想簿");
  });

  /* ---------------- 随想簿 ---------------- */
  function renderNotes() {
    var imgCount = Object.keys(notes).filter(function (k) { return byId(k); }).length;
    $("#collideCount").textContent = collides.length;
    $("#cardNoteCount").textContent = imgCount;
    $("#notesEmpty").classList.toggle("hidden", !(collides.length || imgCount));
    var cl = $("#collideList");
    cl.innerHTML = "";
    if (!collides.length) {
      cl.innerHTML = '<p class="empty-tip" style="padding:12px 0;font-size:13px">还没有碰撞记录。</p>';
    }
    collides.forEach(function (c) {
      var item = document.createElement("div");
      item.className = "note-item";
      item.innerHTML =
        '<div class="note-meta"><span>' + fmtTime(c.ts) + "</span>" +
        (c.mood && c.mood.length ? "<span>情感：" + esc(c.mood.join("、")) + "</span>" : "") +
        "</div>" +
        '<div class="note-title">「<b>' + esc(c.imgName) + "</b>」×「" + esc(c.sceneName) + "」</div>" +
        (c.prompt ? '<div class="note-body" style="font-size:12px;color:var(--ink-faint)">' + esc(c.prompt) + "</div>" : "") +
        '<div class="note-body">' + esc(c.text) + "</div>" +
        '<div class="note-actions">' +
        '<button class="link" data-act="open" data-id="' + esc(c.imgId) + '">查看意象</button>' +
        '<button class="link" data-act="del">删除</button>' +
        "</div>";
      item.querySelector('[data-act="open"]').addEventListener("click", function () { openDetail(c.imgId); });
      item.querySelector('[data-act="del"]').addEventListener("click", function () {
        collides.splice(collides.indexOf(c), 1);
        saveJSON("yx_collides_v1", collides);
        renderNotes();
      });
      cl.appendChild(item);
    });
    var cn = $("#cardNoteList");
    cn.innerHTML = "";
    var keys = Object.keys(notes).filter(function (k) { return byId(k); });
    if (!keys.length) {
      cn.innerHTML = '<p class="empty-tip" style="padding:12px 0;font-size:13px">还没有卡片随想。</p>';
    }
    keys.forEach(function (k) {
      var it = byId(k), n = notes[k];
      var item = document.createElement("div");
      item.className = "note-item";
      item.innerHTML =
        '<div class="note-meta"><span>' + fmtTime(n.ts) + "</span><span>" + esc(it.source || "") + "</span></div>" +
        '<div class="note-title"><b>' + esc(it.name) + "</b> 的随想</div>" +
        '<div class="note-body">' + esc(n.text) + "</div>" +
        '<div class="note-actions">' +
        '<button class="link" data-act="open">查看意象</button>' +
        '<button class="link" data-act="del">删除</button>' +
        "</div>";
      item.querySelector('[data-act="open"]').addEventListener("click", function () { openDetail(k); });
      item.querySelector('[data-act="del"]').addEventListener("click", function () {
        delete notes[k];
        saveJSON("yx_notes_v1", notes);
        renderNotes();
      });
      cn.appendChild(item);
    });
  }

  /* ---------------- 导入 ---------------- */
  var SAMPLE_JSON = JSON.stringify({
    imagery: [{
      name: "梧桐叶", category: "植物", senses: ["视觉", "听觉"], moods: ["秋意", "寂寥"],
      source: "个人观察", text: "一夜秋风，阶前的梧桐叶落了大半。",
      meaning: "梧桐叶一落，秋天就有了形状。",
      analysis: "梧桐是『秋的信使』：叶阔而疏，落下时有声。一片叶子的重量，能压弯整个季节。",
      prompt: "让一片梧桐叶落在某人肩上，写那个人因此停下的三秒钟。"
    }],
    scenes: [{ name: "打烊前的书店", description: "店员把灯一盏盏关掉，书架的影子越拉越长。" }]
  }, null, 2);

  function renderImportStats() {
    $("#builtinCount").textContent = BUILTIN_IMG.length;
    $("#builtinSceneCount").textContent = BUILTIN_SCENES.length;
    $("#importedCount").textContent = imported.imagery.length;
    $("#importedSceneCount").textContent = imported.scenes.length;
  }
  $("#importFill").addEventListener("click", function () { $("#importArea").value = SAMPLE_JSON; });
  $("#importFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { $("#importArea").value = String(reader.result || ""); };
    reader.readAsText(f, "utf-8");
    e.target.value = "";
  });
  $("#importBtn").addEventListener("click", function () {
    var msg = $("#importMsg");
    var raw = $("#importArea").value.trim();
    if (!raw) { msg.className = "import-msg err"; msg.textContent = "请先粘贴或选择 JSON 内容。"; return; }
    var data;
    try { data = JSON.parse(raw); } catch (e) { msg.className = "import-msg err"; msg.textContent = "JSON 解析失败：" + e.message; return; }
    var addImg = Array.isArray(data.imagery) ? data.imagery : [];
    var addScene = Array.isArray(data.scenes) ? data.scenes : [];
    if (!addImg.length && !addScene.length) {
      msg.className = "import-msg err";
      msg.textContent = "JSON 里没有 imagery 或 scenes 数组，请检查格式。";
      return;
    }
    var imgOk = 0, sceneOk = 0;
    addImg.forEach(function (it) {
      if (!it || typeof it.name !== "string" || !it.name.trim()) return;
      var copy = {};
      ["name", "category", "senses", "moods", "source", "text", "meaning", "analysis", "prompt"].forEach(function (k) {
        if (it[k] != null) copy[k] = it[k];
      });
      if (!copy.category) copy.category = "其他";
      if (!Array.isArray(copy.senses)) copy.senses = [];
      if (!Array.isArray(copy.moods)) copy.moods = [];
      copy.id = copy.id || "u" + imgOk + "_" + copy.name;
      copy.imported = true;
      var exist = imported.imagery.findIndex(function (x) { return x.name === copy.name; });
      if (exist >= 0) imported.imagery[exist] = copy; else imported.imagery.push(copy);
      imgOk++;
    });
    addScene.forEach(function (s) {
      if (!s || typeof s.name !== "string" || !s.name.trim()) return;
      var copy = { id: s.id || "us_" + sceneOk + "_" + s.name, name: s.name, description: s.description || "" };
      var exist = imported.scenes.findIndex(function (x) { return x.name === copy.name; });
      if (exist >= 0) imported.scenes[exist] = copy; else imported.scenes.push(copy);
      sceneOk++;
    });
    saveJSON("yx_imported_v1", imported);
    $("#importArea").value = "";
    msg.className = "import-msg ok";
    msg.textContent = "导入完成：意象 " + imgOk + " 条、场景 " + sceneOk + " 条（同名已覆盖）。";
    renderImportStats();
    renderChips();
    renderGrid();
    toast("导入成功");
  });

  /* ---------------- 启动 ---------------- */
  renderChips();
  renderGrid();
  renderImportStats();
  bindFlowerClicks();
  if (window.YX_IMAGERY && !BUILTIN_IMG.length) {
    // 素材未加载时的兜底提示
    $("#emptyTip").textContent = "素材文件未加载成功，请确认 data/ 目录完整。";
    $("#emptyTip").classList.remove("hidden");
  }
})();
