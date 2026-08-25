/* Kuromi 英语闯关 · 应用逻辑（零依赖，需本地服务器运行以获得语音支持）
 * 功能：单元闯关（认读/听音/拼写）、简化艾宾浩斯复习、口语朗读检测、英音/美音 TTS
 */
(function () {
  "use strict";

  /* ================= 基础工具 ================= */
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
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add("hidden"); }, 2400);
  }
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function startOfDay(ts) {
    var d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  /* ================= 数据 ================= */
  var UNITS = window.KUROMI_UNITS || [];
  var INTERVALS = [1, 3, 7, 14];           // 简化艾宾浩斯：明天/3天/7天/14天
  var STAGE_DONE = 5;

  // 为每个单词生成全局 id
  var WORD_INDEX = {}; // wid -> {unit, word}
  UNITS.forEach(function (u) {
    u.words.forEach(function (w, i) {
      var wid = u.id + "_" + i;
      w.id = wid; w.unitId = u.id; w.unitNum = u.num;
      WORD_INDEX[wid] = { unit: u, word: w };
    });
  });

  var settings = loadJSON("kr_settings", { name: "可聿", accent: "us", voiceOn: true, onboardDone: false, startUnit: 1 });
  var progress = loadJSON("kr_progress", {}); // wid -> {stage, learnedAt}

  function wordsOf(unitId) {
    var u = UNITS.find(function (x) { return x.id === unitId; });
    return u ? u.words : [];
  }
  function stageOf(wid) { var p = progress[wid]; return p ? p.stage : 0; }
  function isDue(wid) {
    var p = progress[wid];
    if (!p || p.stage < 1 || p.stage >= STAGE_DONE) return false;
    var due = startOfDay(p.learnedAt) + INTERVALS[p.stage - 1] * 86400000;
    return startOfDay(Date.now()) >= due;
  }
  function saveProgress() { saveJSON("kr_progress", progress); }
  function saveSettings() { saveJSON("kr_settings", settings); }

  /* ================= 语音（TTS，线上朗读，不占本地容量） ================= */
  function pickVoice() {
    try {
      var voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      var want = settings.accent === "uk" ? /en[-_]GB|en[-_]UK/ : /en[-_]US/;
      var v = voices.find(function (x) { return want.test(x.lang); });
      if (!v) v = voices.find(function (x) { return /^en/i.test(x.lang); });
      return v || null;
    } catch (e) { return null; }
  }
  function speak(text, rate, pitch) {
    if (!settings.voiceOn) return null;
    try {
      if (!window.speechSynthesis) return null;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = settings.accent === "uk" ? "en-GB" : "en-US";
      var v = pickVoice();
      if (v) u.voice = v;
      u.rate = rate || 0.92;
      u.pitch = pitch || 1.05;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      return u;
    } catch (e) { return null; }
  }
  function stopSpeak() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} }
  // 语音列表异步加载后缓存
  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = function () { pickVoice(); };
    pickVoice();
  }

  /* ================= 库洛米台词与夸赞 ================= */
  var PRAISE = ["Great job!", "Amazing!", "You did it!", "Awesome!", "Fantastic!", "Well done!", "Perfect!", "You're a star!", "Super!", "Wonderful!", "Nice work!"];
  var CHEER = ["Hmph! Not bad at all!", "Hehe, I knew you could do it!", "You're getting strong!", "Don't get too proud, okay?", "Kuromi says: good!", "That was cool!"];
  var ENCOURAGE = ["Try again!", "You can do it!", "Almost there!", "One more try!", "Don't give up!"];
  var SHORT_OK = ["Great!", "Nice!", "Good!", "Cool!", "Yes!"];

  var HOME_LINES = [
    "哼，今天也要好好学哦！Hmph, study hard today!",
    "可聿，准备好了吗？Let's go!",
    "别以为我是在帮你，我只是…想看看你有多厉害！",
    "背单词什么的，我最拿手了——虽然我更喜欢恶作剧。",
    "答对了会有我的夸赞，答错了…哼，再试一次！"
  ];

  function sayPraise() {
    var t = rand(PRAISE);
    speak(t);
    return t;
  }
  function sayCheer() { return rand(CHEER); }
  function sayEncourage() { var t = rand(ENCOURAGE); speak(t); return t; }

  /* ================= 视图切换 ================= */
  var currentView = "onboard";
  function showView(name) {
    currentView = name;
    ["onboard", "home", "units", "quiz", "review", "settings"].forEach(function (v) {
      var el = $("#view-" + v);
      if (el) el.classList.toggle("hidden", v !== name);
    });
    $$("#nav .nav-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === name);
    });
    if (name === "home") renderHome();
    if (name === "units") renderUnits();
    if (name === "review") renderReview();
  }
  $$("#nav .nav-btn").forEach(function (b) {
    b.addEventListener("click", function () { showView(b.dataset.view); });
  });
  document.querySelector(".brand").addEventListener("click", function () { showView("home"); });

  /* ================= 首次进入：起点设定 ================= */
  function renderOnboardUnits() {
    var box = $("#onboardUnits");
    box.innerHTML = "";
    UNITS.forEach(function (u) {
      var b = document.createElement("button");
      b.className = "up-item" + (settings.startUnit === u.num ? " active" : "");
      b.textContent = "U" + u.num;
      b.title = u.title;
      b.addEventListener("click", function () {
        settings.startUnit = u.num;
        $$("#onboardUnits .up-item").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
      });
      box.appendChild(b);
    });
  }
  $("#onboardGo").addEventListener("click", function () {
    var name = $("#onboardName").value.trim();
    if (name) settings.name = name;
    settings.onboardDone = true;
    saveSettings();
    // 起点之前的单元整单元标记「已会」，进入艾宾浩斯复习队列
    var now = Date.now();
    UNITS.forEach(function (u) {
      if (u.num >= settings.startUnit) return;
      wordsOf(u.id).forEach(function (w) { if (stageOf(w.id) < 1) progress[w.id] = { stage: 1, learnedAt: now }; });
    });
    saveProgress();
    $("#homeTitle").textContent = settings.name + "，准备好闯关了吗？";
    showView("home");
    speak("Hi, " + settings.name + "! Let's go!");
  });

  /* ================= 首页 ================= */
  function countStats() {
    var stat = { fresh: 0, due: 0, done: 0, badge: 0 };
    UNITS.forEach(function (u) {
      var all = wordsOf(u.id);
      var learned = 0;
      all.forEach(function (w) {
        var s = stageOf(w.id);
        if (s === 0) stat.fresh++;
        else { learned++; if (s >= STAGE_DONE) stat.done++; }
        if (isDue(w.id)) stat.due++;
      });
      if (learned === all.length) stat.badge++;
    });
    return stat;
  }
  function renderHome() {
    var st = countStats();
    $("#statNew").textContent = st.fresh;
    $("#statDue").textContent = st.due;
    $("#statDone").textContent = st.done;
    $("#statBadge").textContent = st.badge;
    $("#homeTitle").textContent = settings.name + "，准备好闯关了吗？";
    var line;
    if (st.due > 0) line = "哼，有 " + st.due + " 个单词该复习了，别偷懒！";
    else if (st.fresh > 0) line = "新词已经准备好了，" + settings.name + "，Let's go!";
    else if (st.badge === UNITS.length) line = "Wow! 你都掌握了！我…我才不佩服你呢！";
    else line = "今天想学点什么？我陪你。";
    $("#speechText").textContent = line;
  }
  function firstTodoUnit() {
    for (var i = 0; i < UNITS.length; i++) {
      var u = UNITS[i];
      var has = wordsOf(u.id).some(function (w) { return stageOf(w.id) === 0 || isDue(w.id); });
      if (has) return u;
    }
    return null;
  }
  $("#btnStartQuiz").addEventListener("click", function () {
    var u = firstTodoUnit();
    if (!u) { toast("所有单词都掌握啦！先去复习或休息一下吧"); return; }
    startQuiz(u.id);
  });
  $("#btnGoReview").addEventListener("click", function () { showView("review"); });
  $("#btnGoUnits").addEventListener("click", function () { showView("units"); });

  /* ================= 单元地图 ================= */
  function renderUnits() {
    var grid = $("#unitGrid");
    grid.innerHTML = "";
    UNITS.forEach(function (u) {
      var words = wordsOf(u.id);
      var learned = words.filter(function (w) { return stageOf(w.id) >= 1; }).length;
      var due = words.filter(function (w) { return isDue(w.id); }).length;
      var done = learned === words.length;
      var pct = Math.round(learned / words.length * 100);
      var card = document.createElement("div");
      card.className = "unit-card" + (done ? " done" : "");
      card.innerHTML =
        '<div class="unit-top">' +
        '<span class="unit-num">' + u.num + "</span>" +
        '<span class="unit-icon">' + u.icon + "</span>" +
        '<div><div class="unit-title">' + esc(u.title) + '</div><div class="unit-cn">' + esc(u.cn) + "</div></div>" +
        "</div>" +
        '<div class="unit-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="unit-meta">' +
        '<span>已学 ' + learned + "/" + words.length + "</span>" +
        (due ? '<span class="unit-badge" style="color:#c0392b">📖 待复习 ' + due + "</span>" : "") +
        (done ? '<span class="unit-badge">🦴 已通关</span>' : "") +
        "</div>" +
        '<div class="unit-actions">' +
        '<button class="btn small pink" data-act="quiz">开始闯关</button>' +
        '<button class="btn small ghost" data-act="mark">标记已会</button>' +
        "</div>";
      card.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest('[data-act]')) return;
        startQuiz(u.id);
      });
      card.querySelector('[data-act="quiz"]').addEventListener("click", function (e) {
        e.stopPropagation();
        startQuiz(u.id);
      });
      card.querySelector('[data-act="mark"]').addEventListener("click", function (e) {
        e.stopPropagation();
        markUnitLearned(u.id);
        toast("Unit " + u.num + " 已标记为已会，明天起进入记忆复习");
        renderUnits();
      });
      grid.appendChild(card);
    });
  }
  function markUnitLearned(unitId) {
    var now = Date.now();
    wordsOf(unitId).forEach(function (w) {
      if (stageOf(w.id) < 1) progress[w.id] = { stage: 1, learnedAt: now };
    });
    saveProgress();
  }

  /* ================= 闯关 ================= */
  var QUIZ_TYPES = ["listen", "en2cn", "cn2en", "spell"];
  var quiz = null; // {unitId, items, index, score, total, badgeAwarded}

  function startQuiz(unitId) {
    var words = wordsOf(unitId);
    var fresh = words.filter(function (w) { return stageOf(w.id) === 0; });
    var due = words.filter(function (w) { return isDue(w.id); });
    var pool = shuffle(fresh.concat(due)).slice(0, 10);
    if (!pool.length) { toast("这个单元的词都掌握啦，先去复习或换个单元"); return; }
    quiz = {
      unitId: unitId,
      items: pool.map(function (w) {
        var types = QUIZ_TYPES.slice();
        if (!w.spell) types = types.filter(function (t) { return t !== "spell"; });
        return { wid: w.id, type: rand(types), kind: stageOf(w.id) === 0 ? "new" : "review", done: false, correct: false };
      }),
      index: 0, score: 0, badgeAwarded: false
    };
    $("#quizUnitLabel").textContent = "Unit " + quizUnit().num + " · " + quizUnit().title;
    showView("quiz");
    renderQuestion();
  }
  function quizUnit() { return UNITS.find(function (u) { return u.id === quiz.unitId; }); }
  function quizWord() {
    var it = quiz.items[quiz.index];
    return WORD_INDEX[it.wid].word;
  }
  function distractors(word, isCn) {
    var pool = [];
    UNITS.forEach(function (u) { u.words.forEach(function (w) { if (w.id !== word.id) pool.push(w); }); });
    pool = shuffle(pool).filter(function (w) { return isCn ? w.cn !== word.cn : w.word.toLowerCase() !== word.word.toLowerCase(); });
    var picks = [];
    var seen = {};
    pool.forEach(function (w) {
      if (picks.length >= 3) return;
      var key = isCn ? w.cn : w.word;
      if (seen[key]) return;
      seen[key] = 1;
      picks.push(w);
    });
    return picks;
  }

  function renderQuestion() {
    var it = quiz.items[quiz.index];
    var w = quizWord();
    $("#quizBar").style.width = (quiz.index / quiz.items.length * 100) + "%";
    $("#quizScore").textContent = "⭐ " + quiz.score;
    var body = $("#quizBody");
    body.innerHTML = "";
    var card = document.createElement("div");
    card.className = "quiz-card";

    if (it.type === "en2cn") {
      card.innerHTML =
        '<div class="quiz-type">选一选 · 它的意思</div>' +
        '<div class="quiz-word">' + esc(w.word) +
        '<button class="word-btn" data-sound="' + esc(w.word) + '">🔊</button></div>' +
        '<div class="quiz-emoji">' + w.emoji + "</div>";
    } else if (it.type === "cn2en") {
      card.innerHTML =
        '<div class="quiz-type">选一选 · 英文是？</div>' +
        '<div class="quiz-emoji">' + w.emoji + "</div>" +
        '<div class="quiz-cn">' + esc(w.cn) + "</div>";
    } else if (it.type === "listen") {
      card.innerHTML =
        '<div class="quiz-type">听一听 · 选单词</div>' +
        '<div class="quiz-emoji">🎧</div>' +
        '<div class="quiz-sound-hint">仔细听，可以多听几遍</div>';
      setTimeout(function () { speak(w.word, 0.85); }, 300);
    } else if (it.type === "spell") {
      card.innerHTML =
        '<div class="quiz-type">拼一拼 · 写出单词</div>' +
        '<div class="quiz-emoji">' + w.emoji + "</div>" +
        '<div class="quiz-cn">' + esc(w.cn) + "</div>" +
        '<div class="spell-box"><input id="spellInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"></div>';
    }

    // 选项
    if (it.type !== "spell") {
      var isCn = it.type === "en2cn";
      var opts = distractors(w, isCn);
      var correctWord = w;
      var wrongWords = opts;
      var choices = shuffle([correctWord].concat(wrongWords));
      var grid = document.createElement("div");
      grid.className = "options";
      choices.forEach(function (c) {
        var b = document.createElement("button");
        b.className = "opt";
        b.textContent = isCn ? c.cn : c.word;
        b.addEventListener("click", function () { answer(it, c.id === w.id, b, grid); });
        grid.appendChild(b);
      });
      card.appendChild(grid);
    } else {
      var input = card.querySelector("#spellInput");
      input.focus();
      var submit = document.createElement("div");
      submit.className = "spell-box";
      var btn = document.createElement("button");
      btn.className = "btn pink";
      btn.textContent = "确认 ✓";
      btn.addEventListener("click", function () { answer(it, matchSpell(input.value, w.word), null, null, input); });
      submit.appendChild(btn);
      card.appendChild(submit);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") btn.click();
      });
    }
    body.appendChild(card);
    // 声音按钮
    $$("#quizBody [data-sound]").forEach(function (b) {
      b.addEventListener("click", function () { speak(b.dataset.sound); });
    });
  }

  function matchSpell(input, target) {
    var a = String(input).toLowerCase().replace(/[^a-z]/g, "").trim();
    var b = String(target).toLowerCase().replace(/[^a-z]/g, "").trim();
    return a === b;
  }

  function answer(it, ok, optEl, grid, inputEl) {
    if (it.done) return;
    it.done = true;
    var w = WORD_INDEX[it.wid].word;
    var body = $("#quizBody");
    var card = body.querySelector(".quiz-card");
    var fb = document.createElement("div");
    fb.className = "quiz-feedback";

    if (ok) {
      it.correct = true;
      quiz.score++;
      applyAnswer(w.id, true);
      var praise = rand(SHORT_OK);
      speak(praise);
      fb.innerHTML =
        '<div class="fb-box"><svg class="fb-kuromi" viewBox="0 0 200 210" width="52" height="55"><use href="#kuromi" transform="scale(0.9) translate(11,14)"/></svg>' +
        '<div class="fb-text"><b>' + praise + "</b><br>" + esc(w.word) + " · " + esc(w.cn) + "</div></div>";
      if (optEl) optEl.classList.add("correct");
      if (inputEl) { inputEl.style.borderColor = "#2e8b57"; inputEl.style.background = "#eafaf0"; }
    } else {
      applyAnswer(w.id, false);
      var enc = sayEncourage();
      fb.innerHTML =
        '<div class="fb-box" style="background:#ffd7de"><svg class="fb-kuromi" viewBox="0 0 200 210" width="52" height="55"><use href="#kuromi" transform="scale(0.9) translate(11,14)"/></svg>' +
        '<div class="fb-text"><b>' + enc + "</b><br>正确答案：<b>" + esc(w.word) + "</b> " + esc(w.cn) + "</div></div>";
      if (optEl) {
        optEl.classList.add("wrong");
        grid.querySelectorAll(".opt").forEach(function (x) {
          if (x.textContent === (it.type === "en2cn" ? w.cn : w.word)) x.classList.add("correct");
        });
      }
      if (inputEl) { inputEl.style.borderColor = "#c0392b"; inputEl.style.background = "#fff0f2"; }
    }
    card.appendChild(fb);

    var next = document.createElement("div");
    next.className = "quiz-next";
    var b = document.createElement("button");
    b.className = "btn pink";
    b.textContent = quiz.index + 1 >= quiz.items.length ? "查看结果 🎉" : "下一题 ➜";
    b.addEventListener("click", function () {
      quiz.index++;
      if (quiz.index >= quiz.items.length) finishQuiz();
      else renderQuestion();
    });
    next.appendChild(b);
    card.appendChild(next);
  }

  function applyAnswer(wid, ok) {
    var p = progress[wid];
    if (ok) {
      if (!p || p.stage < 1) progress[wid] = { stage: 1, learnedAt: Date.now() };       // 新学成功 → 明天复习
      else if (p.stage < STAGE_DONE) progress[wid] = { stage: p.stage + 1, learnedAt: p.learnedAt }; // 复习成功 → 下一轮
    } else {
      progress[wid] = { stage: 0, learnedAt: Date.now() };                               // 答错 → 重新学
    }
    saveProgress();
  }

  function finishQuiz() {
    var u = quizUnit();
    var total = quiz.items.length;
    var score = quiz.score;
    var pct = total ? Math.round(score / total * 100) : 0;
    var stars = pct === 100 ? 3 : pct >= 70 ? 2 : 1;
    var words = wordsOf(u.id);
    var unitDone = words.every(function (w) { return stageOf(w.id) >= 1; });
    var firstTime = unitDone && !quiz.badgeAwarded && !unitHadBadge(u.id);
    if (firstTime) { quiz.badgeAwarded = true; }
    var big = pct === 100 ? sayPraise() : "Good job, " + settings.name + "!";
    var cheer = sayCheer();
    var starStr = "";
    for (var i = 0; i < 3; i++) starStr += i < stars ? "⭐" : "☆";
    $("#quizBody").innerHTML =
      '<div class="quiz-card result-card">' +
      '<svg viewBox="0 0 200 210" width="120" height="126" class="kuromi-bounce"><use href="#kuromi" transform="scale(0.9) translate(11,14)"/></svg>' +
      '<div class="result-stars">' + starStr + "</div>" +
      '<div class="result-title">' + big + "</div>" +
      '<div class="result-sub">' + cheer + "<br>答对 " + score + "/" + total + " 题" +
      (firstTime ? "<br>🎖️ 获得 Unit " + u.num + " 骷髅徽章！" : "") + "</div>" +
      '<div class="result-actions">' +
      '<button class="btn pink" id="rAgain">再闯一关</button>' +
      '<button class="btn" id="rUnits">单元地图</button>' +
      '<button class="btn ghost" id="rHome">回首页</button>' +
      "</div></div>";
    $("#quizBar").style.width = "100%";
    $("#rAgain").addEventListener("click", function () { startQuiz(u.id); });
    $("#rUnits").addEventListener("click", function () { showView("units"); });
    $("#rHome").addEventListener("click", function () { showView("home"); });
  }
  function unitHadBadge(unitId) { return false; } // 徽章即时判定，无需历史记录

  /* ================= 复习（口语朗读检测） ================= */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var review = null; // {queue:[wid], index}

  function renderReview() {
    var body = $("#reviewBody");
    var dueWords = [];
    UNITS.forEach(function (u) {
      u.words.forEach(function (w) { if (isDue(w.id)) dueWords.push(w); });
    });
    dueWords.sort(function (a, b) {
      var pa = progress[a.id], pb = progress[b.id];
      return (pa.learnedAt + INTERVALS[pa.stage - 1] * 86400000) - (pb.learnedAt + INTERVALS[pb.stage - 1] * 86400000);
    });
    if (!dueWords.length) {
      body.innerHTML =
        '<div class="quiz-card review-done">' +
        '<div class="result-stars">😌</div>' +
        '<div class="result-title">今天没有要复习的单词</div>' +
        '<div class="result-sub">记忆计划安排得很棒！去闯新关或休息一下吧。</div>' +
        '<div class="result-actions"><button class="btn pink" id="rvQuiz">去闯关</button>' +
        '<button class="btn ghost" id="rvHome">回首页</button></div></div>';
      $("#rvQuiz").addEventListener("click", function () {
        var u = firstTodoUnit();
        if (u) startQuiz(u.id); else showView("home");
      });
      $("#rvHome").addEventListener("click", function () { showView("home"); });
      return;
    }
    review = { queue: dueWords.map(function (w) { return w.id; }), index: 0, heard: "" };
    var sum = document.createElement("div");
    sum.className = "review-summary";
    sum.innerHTML = '<div class="review-list-item">📖 待复习 <b style="color:#c0392b">' + dueWords.length + "</b> 个单词</div>";
    body.innerHTML = "";
    body.appendChild(sum);
    renderReviewCard();
  }

  function renderReviewCard() {
    var wid = review.queue[review.index];
    var w = WORD_INDEX[wid].word;
    var u = WORD_INDEX[wid].unit;
    var body = $("#reviewBody");
    // 移除旧卡
    var old = body.querySelector(".review-card");
    if (old) old.remove();
    var card = document.createElement("div");
    card.className = "review-card";
    card.innerHTML =
      '<div class="quiz-type">复习 · Unit ' + u.num + " · 大声读出来</div>" +
      '<div class="review-emoji">' + w.emoji + "</div>" +
      '<div class="review-cn">' + esc(w.cn) + "</div>" +
      '<div class="review-hint">先听一听，然后点麦克风读出来</div>' +
      '<div class="mic-area">' +
      '<button class="mic-btn" id="rvMic">🎤</button>' +
      '<div class="mic-status" id="rvStatus">点击麦克风开始朗读</div>' +
      '<div class="mic-heard" id="rvHeard"></div>' +
      "</div>" +
      '<div class="review-actions">' +
      '<button class="btn small" id="rvListen">🔊 听发音</button>' +
      '<button class="btn small" id="rvShow">👀 看单词</button>' +
      '<button class="btn small ghost" id="rvSkip">跳过</button>' +
      "</div>";
    body.appendChild(card);

    $("#rvListen").addEventListener("click", function () { speak(w.word, 0.85); });
    $("#rvShow").addEventListener("click", function () {
      var s = $("#rvStatus");
      if (s.textContent.indexOf(w.word) < 0) {
        s.textContent = "单词是：" + w.word + " —— 跟我读一遍，再试一次！";
        speak(w.word, 0.75);
      }
    });
    $("#rvSkip").addEventListener("click", function () { nextReview(false); });
    $("#rvMic").addEventListener("click", function () { startListening(w); });
  }

  function startListening(w) {
    var micBtn = $("#rvMic");
    var status = $("#rvStatus");
    var heard = $("#rvHeard");
    if (!SR) {
      status.textContent = "这个浏览器不支持语音识别，先听发音跟读，然后点「我读对了」";
      var fallback = document.createElement("button");
      fallback.className = "btn small pink";
      fallback.textContent = "我读对了 ✓";
      fallback.style.marginTop = "8px";
      fallback.addEventListener("click", function () { nextReview(true); });
      heard.appendChild(fallback);
      return;
    }
    stopSpeak();
    var rec = new SR();
    rec.lang = settings.accent === "uk" ? "en-GB" : "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    micBtn.classList.add("listening");
    status.textContent = "在听呢…大声读出来！";
    heard.textContent = "";
    var finalText = "";
    rec.onresult = function (e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      heard.textContent = (finalText + " " + interim).trim();
    };
    rec.onerror = function (e) {
      micBtn.classList.remove("listening");
      status.textContent = "没听清（" + (e.error || "error") + "），再点一次试试";
    };
    rec.onend = function () {
      micBtn.classList.remove("listening");
      var text = finalText.trim() || heard.textContent.trim();
      if (text) {
        heard.textContent = "你读的是：「" + text + "」";
        var ok = matchSpoken(text, w.word);
        status.textContent = ok ? "Great job!" : "再试一次！";
        if (ok) { speak("Great job!"); nextReview(true); }
        else {
          speak("Try again!");
          status.textContent = "再试一次！先听一听发音";
          $("#rvStatus").textContent = "单词是：" + w.word + " —— 再读一遍";
        }
      } else {
        status.textContent = "没有听到声音，再点一次麦克风";
      }
    };
    try { rec.start(); }
    catch (e) {
      micBtn.classList.remove("listening");
      status.textContent = "语音识别启动失败，先听发音跟读，然后点「我读对了」";
    }
  }

  function normalize(s) {
    return String(s).toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();
  }
  function editDist(a, b) {
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = [i]; for (var j = 1; j <= n; j++) dp[i][j] = 0; }
    for (var j = 0; j <= n; j++) dp[0][j] = j;
    for (i = 1; i <= m; i++)
      for (j = 1; j <= n; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[m][n];
  }
  function matchSpoken(heard, target) {
    var t = normalize(target);
    var h = normalize(heard);
    if (!h) return false;
    var tokens = h.split(" ").filter(Boolean);
    if (tokens.indexOf(t) >= 0) return true;
    if (tokens.some(function (x) { return x === t + "s" || (t.endsWith("s") && x === t.slice(0, -1)); })) return true;
    if (tokens.some(function (x) { return editDist(x, t) <= 1; })) return true;
    return false;
  }

  function nextReview(ok) {
    var wid = review.queue[review.index];
    var p = progress[wid];
    if (ok) {
      if (!p || p.stage < 1) progress[wid] = { stage: 1, learnedAt: Date.now() };
      else if (p.stage < STAGE_DONE) progress[wid] = { stage: p.stage + 1, learnedAt: p.learnedAt };
    } else {
      progress[wid] = { stage: 0, learnedAt: Date.now() };
    }
    saveProgress();
    review.index++;
    if (review.index >= review.queue.length) {
      var body = $("#reviewBody");
      body.innerHTML =
        '<div class="quiz-card review-done">' +
        '<svg viewBox="0 0 200 210" width="110" height="116" class="kuromi-bounce"><use href="#kuromi" transform="scale(0.9) translate(11,14)"/></svg>' +
        '<div class="result-title">今天的复习完成啦！</div>' +
        '<div class="result-sub">' + sayCheer() + "</div>" +
        '<div class="result-actions"><button class="btn pink" id="rvDone">回到首页</button></div></div>';
      speak("All done! Great job!");
      $("#rvDone").addEventListener("click", function () { showView("home"); });
      return;
    }
    renderReviewCard();
  }

  /* ================= 设置 ================= */
  function renderSettings() {
    $("#setName").value = settings.name;
    $$(".seg-btn[data-accent]").forEach(function (b) {
      b.classList.toggle("active", settings.accent === b.dataset.accent);
    });
    $$(".seg-btn[data-voice]").forEach(function (b) {
      b.classList.toggle("active", (settings.voiceOn ? "on" : "off") === b.dataset.voice);
    });
    var box = $("#setStartUnits");
    box.innerHTML = "";
    UNITS.forEach(function (u) {
      var b = document.createElement("button");
      b.className = "up-item" + (settings.startUnit === u.num ? " active" : "");
      b.textContent = "U" + u.num;
      b.addEventListener("click", function () {
        applyStartUnit(u.num);
        $$("#setStartUnits .up-item").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
      });
      box.appendChild(b);
    });
  }
  function applyStartUnit(num) {
    settings.startUnit = num;
    saveSettings();
    var now = Date.now();
    UNITS.forEach(function (u) {
      if (u.num >= num) return;
      wordsOf(u.id).forEach(function (w) { if (stageOf(w.id) < 1) progress[w.id] = { stage: 1, learnedAt: now }; });
    });
    saveProgress();
    toast("学习起点设为 Unit " + num + "，更早的单元已标记为已会并进入复习");
    renderUnits();
  }
  $("#setName").addEventListener("change", function () {
    var v = this.value.trim();
    if (v) { settings.name = v; saveSettings(); toast("名字已更新：欢迎你，" + v); }
  });
  $$(".seg-btn[data-accent]").forEach(function (b) {
    b.addEventListener("click", function () {
      settings.accent = b.dataset.accent;
      saveSettings();
      renderSettings();
      toast("口音已切换为" + (settings.accent === "uk" ? "英音 🇬🇧" : "美音 🇺🇸"));
      speak("Hello, how are you today?");
    });
  });
  $$(".seg-btn[data-voice]").forEach(function (b) {
    b.addEventListener("click", function () {
      settings.voiceOn = b.dataset.voice === "on";
      saveSettings();
      renderSettings();
      toast("朗读声音已" + (settings.voiceOn ? "开启" : "关闭"));
      if (settings.voiceOn) speak("Hello!");
    });
  });
  $("#btnExport").addEventListener("click", function () {
    var data = { settings: settings, progress: progress, exportedAt: new Date().toISOString() };
    try {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "kuromi-progress-" + todayStr() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      $("#setMsg").textContent = "进度已导出（含设置与全部记忆记录）";
    } catch (e) { $("#setMsg").textContent = "导出失败：" + e.message; }
  });
  $("#btnReset").addEventListener("click", function () {
    if (!window.confirm("确定要清空全部进度吗？已掌握、徽章、复习计划都会删除。")) return;
    try {
      localStorage.removeItem("kr_progress");
      localStorage.removeItem("kr_settings");
    } catch (e) {}
    location.reload();
  });

  /* ================= 启动 ================= */
  renderOnboardUnits();
  renderSettings();
  if (settings.onboardDone) {
    showView("home");
  } else {
    showView("onboard");
    speak("Hi! I'm Kuromi!");
  }
})();
