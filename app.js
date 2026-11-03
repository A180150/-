/* =========================================================
   小鱼 · 每周六家宴 · 抽奖大屏 v3
   —— 网名+备注双字段解析 / 电影感滚动 / 全屏中奖大屏 / 彩纸特效
   —— 新增：内定必中 / 抽奖音效 / 名单点击标记
   ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var people = [];        // [{nick, note, drawn, rigged}]
  var records = [];       // [{ts, prize, winners:[display]}]
  var rolling = false;
  var skipFlag = false;
  var timer = null;
  var pending = null;     // {winners, prize}
  var currentWinners = [];
  var controlTimer = null;
  var stageHideTimer = null;

  /* ---------------- 真心话大冒险题库 ---------------- */
  var truthQuestions = [
    '你做过最糗的一件事是什么？',
    '你手机里最舍不得删的一张照片是什么？',
    '你最近一次哭是因为什么？',
    '你暗恋过在场的某个人吗？',
    '你最大的缺点是什么？',
    '你做过最叛逆的事是什么？',
    '你最怕的东西是什么？',
    '你最想去的地方是哪里？',
    '你最难忘的一次生日是怎么过的？',
    '你觉得自己身上最好看的部位是哪里？',
    '你最讨厌别人的什么习惯？',
    '你小时候的梦想是什么？现在实现了吗？',
    '你最近撒过的一个谎是什么？',
    '你做过最后悔的决定是什么？',
    '你最想对在场某个人说的一句话是什么？',
    '你谈过几次恋爱？',
    '你最尴尬的一次经历是什么？',
    '你最害怕失去什么？',
    '你觉得自己是个什么样的人？',
    '你最近一次心动是什么时候？'
  ];

  var dareTasks = [
    '模仿在场任意一个人的口头禅或动作。',
    '给手机通讯录里第5个人发一句「我想你了」。',
    '用方言说一段绕口令。',
    '学动物叫，让大家猜是什么动物。',
    '对着镜头做10个鬼脸连拍。',
    '唱一首歌的副歌部分，跑调也算。',
    '用屁股写自己的名字。',
    '即兴说一段夸在场某个人的话，不少于3句。',
    '表演一个你最拿手的才艺。',
    '学一段最近很火的舞蹈动作。',
    '用播音腔朗读一段菜单。',
    '假装自己是主持人，采访在场一个人。',
    '一口气喝完一杯水。',
    '给大家讲一个冷笑话，必须有人笑。',
    '学一种方言打招呼，让大家猜是哪里的。',
    '做5个深蹲，边做边数。',
    '模仿一个表情包，让大家猜。',
    '用鼻子在桌上拱一张纸到指定位置。',
    '唱生日歌，用美声唱法。',
    '在场任选一人，夸他/她3个优点。'
  ];

  /* ---------------- 工具 ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------- 主播管理态（内定入口，默认对观众完全隐藏） ---------------- */
  var admin = false;
  function setAdmin(on) {
    admin = on;
    document.body.classList.toggle('admin', on);
    render();
    toast(on ? '已进入主播管理态' : '已退出主播管理态');
  }

  /* ---------------- 音效（WebAudio 合成） ---------------- */
  var soundOn = true;
  var audioCtx = null;
  function getAudio() {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  function sfxTone(freq, dur, type, vol, delay) {
    if (!soundOn) return;
    var ctx = getAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(vol || 0.05, 0.0001), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  function sfxTick() { sfxTone(1500 + Math.random() * 320, 0.035, 'square', 0.014); }
  function sfxWin() {
    var seq = [[523.25, 0], [659.25, 0.09], [783.99, 0.18], [1046.5, 0.27], [1318.5, 0.38]];
    seq.forEach(function (s) { sfxTone(s[0], 0.3, 'triangle', 0.07, s[1]); });
    sfxTone(1046.5, 0.7, 'sine', 0.045, 0.46);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* ---------------- 名单解析 v2 ----------------
     微信接龙：每行「群内网名 + 备注名」，单字段也算一个人。
     去重以「网名+备注」整体为准，同备注名（如两个"小宇"）不会互相误杀。
  -------------------------------------------------- */
  function parseNames(raw) {
    var text = String(raw || '').replace(/\r/g, '');
    var lines = text.split('\n');
    var numbered = lines.filter(function (l) {
      return /^\s*\d+\s*[.、．]\s*\S/.test(l);
    });

    var out = [];
    if (numbered.length >= 2) {
      numbered.forEach(function (line) {
        var s = line;
        // 微信常见"1. 1.xxx"双序号，剥两遍
        s = s.replace(/^\s*\d+\s*[.、．]\s*/, '');
        s = s.replace(/^\s*\d+\s*[.、．]\s*/, '');
        s = s.replace(/（[^）]*）/g, ' ').replace(/\([^)]*\)/g, ' ');
        s = s.replace(/只接\S*/g, ' ');
        s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ');
        s = s.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u3164]/g, ' ');
        s = s.replace(/[.,，、。:：;；!！?？~～]+/g, ' ');
        s = s.replace(/\s+/g, ' ').trim();
        if (!s) return;
        var parts = s.split(' ');
        var note = parts[parts.length - 1];
        var nick = parts.slice(0, -1).join(' ');
        if (!nick) { nick = note; note = ''; }
        out.push({ nick: nick.slice(0, 24), note: note.slice(0, 24) });
      });
    } else {
      text.split(/[\n,，、;；\t]+/).forEach(function (x) {
        var v = x.replace(/[.。]+$/, '').trim();
        if (v) out.push({ nick: v.slice(0, 24), note: '' });
      });
    }

    var seen = {};
    var result = [];
    out.forEach(function (p) {
      var key = p.nick + '\u0000' + p.note;
      if (seen[key]) return;
      seen[key] = true;
      result.push(p);
    });
    return result;
  }

  function displayName(p) {
    if (p.note && p.nick !== p.note) return p.nick + '·' + p.note;
    return p.nick;
  }

  /* ---------------- 数字递增 ---------------- */
  function setNum(elId, target) {
    var el = $(elId);
    var from = parseInt(el.textContent, 10) || 0;
    if (from === target) return;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / 520, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (target - from) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var pool = people.filter(function (n) { return !n.drawn; });
    var rigged = people.filter(function (n) { return n.rigged; });
    setNum('stTotal', people.length);
    setNum('stPool', pool.length);
    setNum('stDrawn', people.length - pool.length);
    setNum('stRigged', rigged.length);
    $('recordCount').textContent = records.length + ' 轮';

    var hint = $('riggedHint');
    if (hint) {
      hint.hidden = true;
      if (admin && rigged.length) {
        hint.hidden = false;
        hint.innerHTML = '本轮将有 <b>' + rigged.length + '</b> 位内定必中 · 点击名单可取消';
      }
    }
    var clr = $('clearRigged');
    if (clr) clr.disabled = !admin || rigged.length === 0;

    var chips = $('chips');
    if (!people.length) {
      chips.innerHTML = '<p class="empty">名单为空，粘贴后点「应用名单」</p>';
    } else {
      chips.innerHTML = people.map(function (p, i) {
        var rig = admin && p.rigged;
        var cls = 'chip' + (p.drawn ? ' drawn' : '') + (rig ? ' rigged' : '');
        return '<span class="' + cls + '" data-i="' + i + '">' + esc(displayName(p)) + (rig ? '<i>定</i>' : '') + '</span>';
      }).join('');
    }

    var rec = $('records');
    if (!records.length) {
      rec.innerHTML = '<p class="empty">还没有开奖</p>';
    } else {
      rec.innerHTML = records.map(function (r, i) {
        return '<div class="rec">' +
          '<span class="rec-date">' + fmtDate(r.ts) + '</span>' +
          '<span class="rec-prize">' + esc(r.prize) + '</span>' +
          '<span class="rec-who">' + r.winners.map(esc).join('　/　') + '</span>' +
          '<button class="rec-copy" data-i="' + i + '">复制</button>' +
        '</div>';
      }).join('');
      Array.prototype.forEach.call(rec.querySelectorAll('[data-i]'), function (b) {
        b.onclick = function () {
          var r = records[+b.getAttribute('data-i')];
          if (!r) return;
          var text = fmtDate(r.ts) + '「' + r.prize + '」中奖名单：' + r.winners.join('、');
          copyText(text).then(function (ok) { toast(ok ? '已复制' : '复制失败'); });
        };
      });
    }

    var btn = $('drawBtn');
    btn.disabled = rolling || pool.length === 0;
    btn.querySelector('span').textContent = rolling ? '抽 奖 中' : (pool.length === 0 ? '无 人' : '抽\u00A0\u00A0奖');
  }

  /* ---------------- 应用名单 ---------------- */
  function applyNames() {
    var list = parseNames($('namesInput').value);
    if (!list.length) { toast('没有解析到名字'); return; }
    people = list.map(function (p) { return { nick: p.nick, note: p.note, drawn: false, rigged: false }; });
    render();
    toast('已导入 ' + people.length + ' 人');
  }

  /* ---------------- 抽奖流程 ---------------- */
  function startDraw() {
    if (rolling) return;
    var pool = people.filter(function (p) { return !p.drawn; });
    if (!pool.length) { toast(people.length ? '名单已抽空，可重置已中奖' : '请先导入名单'); return; }

    var prize = $('prizeInput').value.trim() || '家宴名额';
    var need = Math.max(1, Math.min(20, parseInt($('countInput').value, 10) || 1));
    var n = Math.min(need, pool.length);

    /* 内定必中：内定者优先占位，其余名额从普通池随机补足 */
    var rigged = pool.filter(function (p) { return p.rigged; });
    var winners;
    if (rigged.length >= n) {
      if (rigged.length > n) toast('内定人数超过本轮人数，将随机取内定中 ' + n + ' 人');
      winners = shuffle(rigged).slice(0, n);
    } else {
      winners = rigged.slice();
      var rest = shuffle(pool.filter(function (p) { return !p.rigged; }));
      var more = n - winners.length;
      if (more > 0) winners = winners.concat(rest.slice(0, more));
    }
    winners = shuffle(winners);   // 打乱顺序，避免内定者总排在最前

    pending = { winners: winners, prize: prize };
    rolling = true;
    skipFlag = false;

    $('stageEyebrow').textContent = '正在抽取 · ' + prize;
    $('stageSub').textContent = '本轮抽取 ' + n + ' 位 · 空格可跳过';
    showStage();
    render();

    var names = pool.map(displayName);
    var ticks = 0;
    var total = 26 + n * 2;
    var last = '';
    var stage = $('stage');
    var nm = $('stageName');

    function tick() {
      ticks++;
      var pick = names[Math.floor(Math.random() * names.length)];
      if (names.length > 1) {
        while (pick === last) pick = names[Math.floor(Math.random() * names.length)];
      }
      last = pick;
      nm.textContent = pick;
      nm.classList.remove('flash'); void nm.offsetWidth; nm.classList.add('flash');

      var slowZone = ticks >= total - 10;
      stage.classList.toggle('fast', !slowZone);
      stage.classList.toggle('slow', slowZone);

      if (slowZone || ticks % 3 === 0) sfxTick();

      if (skipFlag || ticks >= total) { finishRound(); return; }

      var wait;
      if (ticks > total - 6) wait = 150 + (ticks - (total - 6)) * 80;
      else if (ticks > total - 11) wait = 95;
      else wait = 42;
      timer = setTimeout(tick, wait);
    }
    tick();
  }

  function finishRound() {
    clearTimeout(timer);
    rolling = false;
    skipFlag = false;
    hideStage();

    var w = pending;
    pending = null;
    w.winners.forEach(function (p) { p.drawn = true; });
    /* 抽完即清空内定，不留任何痕迹（双保险之一：刷新自动重置） */
    people.forEach(function (p) { p.rigged = false; });
    currentWinners = w.winners;
    records.unshift({ ts: Date.now(), prize: w.prize, winners: w.winners.map(displayName) });

    render();
    showBigScreen(w.winners, w.prize);
  }

  function skip() {
    if (!rolling) return;
    skipFlag = true;
    clearTimeout(timer);
    finishRound();
  }

  /* ---------------- 滚动大屏 ---------------- */
  function showStage() {
    var st = $('stage');
    clearTimeout(stageHideTimer);
    st.hidden = false;
    st.classList.remove('out');
    document.body.style.overflow = 'hidden';
  }
  function hideStage() {
    var st = $('stage');
    st.classList.add('out');
    clearTimeout(stageHideTimer);
    stageHideTimer = setTimeout(function () { st.hidden = true; }, 380);
  }

  /* ---------------- 中奖大屏 ---------------- */
  function showBigScreen(winners, prize) {
    sfxWin();
    $('bsPrize').textContent = prize;
    $('bsDate').textContent = fmtDate(Date.now());
    $('bsLabel').textContent = '恭 喜 中 奖 · ' + winners.length + ' 位';

    var box = $('bsWinners');
    box.className = 'bs-winners n' + Math.min(6, winners.length);
    box.innerHTML = winners.map(function (p, i) {
      return '<div class="bs-card" style="animation-delay:' + (0.18 + i * 0.16) + 's">' +
        '<div class="bs-top"><span class="bs-order">NO.' + pad(i + 1) + '</span><span class="bs-seal">中 奖</span></div>' +
        '<span class="bs-name">' + esc(displayName(p)) + '</span>' +
      '</div>';
    }).join('');

    $('bigscreen').hidden = false;
    document.body.style.overflow = 'hidden';
    beginControls();
    confettiBurst();
    winners.forEach(function (_, i) {
      setTimeout(confettiBurst, 720 + i * 300);
    });
  }

  function closeBigScreen() {
    $('bigscreen').hidden = true;
    document.body.style.overflow = '';
    stopControls();
    $('bsCtrl').classList.remove('show');
    $('bsTip').classList.remove('show');
  }

  function beginControls() {
    var ctrl = $('bsCtrl');
    var tip = $('bsTip');
    clearTimeout(controlTimer);
    setTimeout(function () { ctrl.classList.add('show'); tip.classList.add('show'); }, 700);
    controlTimer = setTimeout(function () {
      ctrl.classList.remove('show');
      tip.classList.remove('show');
    }, 7000);
  }
  function stopControls() { clearTimeout(controlTimer); }

  /* ---------------- 彩纸（暖金 · 大屏上层） ---------------- */
  var cv = $('confetti');
  var ctx = cv.getContext('2d');
  var bits = [];

  function sizeCanvas() {
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
  }
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  function confettiBurst() {
    var colors = ['#e9c98f', '#f6e3bf', '#d8a55f', '#c07a37', '#a03f26', '#fff6e2', '#d4a857'];
    var cx = cv.width * (0.25 + Math.random() * 0.5);
    var cy = cv.height * (0.18 + Math.random() * 0.34);
    for (var i = 0; i < 90; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 3 + Math.random() * 7;
      bits.push({
        x: cx, y: cy,
        w: Math.random() * 6 + 3,
        h: Math.random() * 10 + 4,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25,
        a: 1,
        life: 90 + Math.random() * 70,
        c: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function confettiRain() {
    var colors = ['#e9c98f', '#f6e3bf', '#d8a55f', '#c07a37', '#a03f26'];
    bits.push({
      x: Math.random() * cv.width,
      y: -20 - Math.random() * 100,
      w: Math.random() * 5 + 3,
      h: Math.random() * 8 + 4,
      vx: (Math.random() - 0.5) * 1.2,
      vy: Math.random() * 2 + 1.6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.08,
      a: 1,
      life: 300,
      c: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  (function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    var bigOpen = !$('bigscreen').hidden;
    if (bigOpen && Math.random() < 0.22) confettiRain();
    for (var i = bits.length - 1; i >= 0; i--) {
      var b = bits[i];
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.09;
      b.vx *= 0.99;
      b.rot += b.vr;
      b.life--;
      if (b.y > cv.height + 40 || b.life <= 0) { bits.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, b.life / 60)) * b.a;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    requestAnimationFrame(loop);
  })();

  /* ---------------- 事件 ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    render();

    /* ---------------- 滚动入场动画 ---------------- */
    var revealEls = document.querySelectorAll('.section, .notice-card, .game-card, .card, .truth-col, .rec');
    revealEls.forEach(function (el) { el.classList.add('reveal'); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add('in'); });
    }

    /* ---------------- 1. Hero 鼠标视差 ---------------- */
    var hero = document.querySelector('.hero');
    if (hero && window.matchMedia('(hover: hover)').matches) {
      var heroGlows = hero.querySelectorAll('.glow');
      var heroParallax = [hero.querySelector('.title'), hero.querySelector('.kicker'), hero.querySelector('.lede')].filter(Boolean);
      hero.addEventListener('mousemove', function (e) {
        var r = hero.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        heroGlows.forEach(function (g, i) {
          var depth = (i + 1) * 18;
          g.style.transform = 'translate(' + (x * depth) + 'px,' + (y * depth) + 'px)';
        });
        heroParallax.forEach(function (el, i) {
          var depth = (i + 1) * 6;
          el.style.transform = 'translate(' + (x * depth) + 'px,' + (y * depth) + 'px)';
        });
      });
      hero.addEventListener('mouseleave', function () {
        heroGlows.forEach(function (g) { g.style.transform = ''; });
        heroParallax.forEach(function (el) { el.style.transform = ''; });
      });
    }

    /* ---------------- 2. 卡片 3D 倾斜 ---------------- */
    var tiltCards = document.querySelectorAll('.notice-card, .game-card, .card');
    if (window.matchMedia('(hover: hover)').matches) {
      tiltCards.forEach(function (card) {
        card.addEventListener('mousemove', function (e) {
          var r = card.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - 0.5;
          var y = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform = 'perspective(900px) rotateY(' + (x * 6) + 'deg) rotateX(' + (-y * 6) + 'deg) translateY(-6px)';
        });
        card.addEventListener('mouseleave', function () {
          card.style.transform = '';
        });
      });
    }

    /* ---------------- 3. 数字递增动画 ---------------- */
    function animateNumber(el, target, duration, suffix) {
      suffix = suffix || '';
      var startTime = null;
      function step(ts) {
        if (!startTime) startTime = ts;
        var p = Math.min((ts - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = eased * target;
        el.textContent = (target >= 100 ? Math.floor(val) : val.toFixed(1)) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = (target >= 100 ? Math.floor(target) : target.toFixed(1)) + suffix;
      }
      requestAnimationFrame(step);
    }
    var statNums = document.querySelectorAll('.stat b');
    statNums.forEach(function (b) {
      var txt = b.textContent.trim();
      if (txt.indexOf('万') > -1) {
        var n = parseFloat(txt);
        if (!isNaN(n)) animateNumber(b, n, 1800, '万');
      } else {
        var n2 = parseInt(txt.replace(/,/g, ''), 10);
        if (!isNaN(n2)) animateNumber(b, n2, 1800, '');
      }
    });

    /* ---------------- 4. 背景浮动光点 ---------------- */
    var particlesBox = $('particles');
    if (particlesBox) {
      var count = 26;
      for (var i = 0; i < count; i++) {
        var p = document.createElement('div');
        p.className = 'particle';
        var size = 2 + Math.random() * 6;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.bottom = '-20px';
        p.style.animationDuration = (8 + Math.random() * 12) + 's';
        p.style.animationDelay = (Math.random() * 12) + 's';
        p.style.opacity = (0.3 + Math.random() * 0.5);
        particlesBox.appendChild(p);
      }
    }

    /* ---------------- 5. 滚动进度条 ---------------- */
    var progressBar = $('scrollProgress');
    if (progressBar) {
      function updateProgress() {
        var h = document.documentElement;
        var scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight);
        progressBar.style.width = (scrolled * 100) + '%';
      }
      window.addEventListener('scroll', updateProgress, { passive: true });
      updateProgress();
    }

    /* ---------------- 6. 按钮波纹 ---------------- */
    document.querySelectorAll('.btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var r = btn.getBoundingClientRect();
        var ripple = document.createElement('span');
        ripple.className = 'ripple';
        var size = Math.max(r.width, r.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - r.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - r.top - size / 2) + 'px';
        btn.appendChild(ripple);
        setTimeout(function () { ripple.remove(); }, 600);
      });
    });

    $('applyNames').onclick = applyNames;

    $('demoNames').onclick = function () {
      $('namesInput').value = [
        '1. 独孤求败 于国辉',
        '2. 小千主义 小千',
        '3. 欣挞蛋 小宇',
        '4. 宇宇 小宇',
        '5. 九点准时睡 刘宣池',
        '6. 小石'
      ].join('\n');
      toast('已填入示例，点「应用名单」生效');
    };

    $('clearNames').onclick = function () {
      $('namesInput').value = '';
      people = [];
      render();
      toast('已清空名单');
    };

    $('resetDrawn').onclick = function () {
      people.forEach(function (n) { n.drawn = false; });
      render();
      toast('已重置中奖标记');
    };

    $('clearRigged').onclick = function () {
      people.forEach(function (n) { n.rigged = false; });
      render();
      toast('已清空内定');
    };

    /* 点击名单筹码：切换内定（仅主播管理态生效） */
    $('chips').addEventListener('click', function (e) {
      if (!admin) return;
      var c = e.target && e.target.closest ? e.target.closest('.chip') : null;
      if (!c) return;
      var idx = parseInt(c.getAttribute('data-i'), 10);
      var p = people[idx];
      if (!p || p.drawn) return;
      p.rigged = !p.rigged;
      render();
    });

    /* 进入管理态：1.5 秒内连点左上角头像 5 次 */
    var adminClicks = [];
    document.querySelector('.avatar').addEventListener('click', function (e) {
      e.preventDefault();
      var now = Date.now();
      adminClicks.push(now);
      adminClicks = adminClicks.filter(function (t) { return now - t < 1500; });
      if (adminClicks.length >= 5) {
        adminClicks = [];
        setAdmin(!admin);
      }
    });

    /* 音效开关 */
    $('soundToggle').onclick = function () {
      soundOn = !soundOn;
      var b = $('soundToggle');
      b.classList.toggle('off', !soundOn);
      b.querySelector('.st-txt').textContent = '音效 ' + (soundOn ? '开' : '关');
      if (soundOn) sfxTone(880, 0.12, 'sine', 0.05);
    };

    $('drawBtn').onclick = startDraw;
    $('stageSkip').onclick = skip;

    $('ctaDraw').onclick = $('toDraw').onclick = function () {
      $('drawSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    $('bsClose').onclick = closeBigScreen;
    $('bsAgain').onclick = function () {
      closeBigScreen();
      setTimeout(startDraw, 120);
    };
    $('bsCopy').onclick = function () {
      var text = fmtDate(Date.now()) + '「' + ($('bsPrize').textContent || '家宴名额') + '」中奖名单：' + currentWinners.map(displayName).join('、');
      copyText(text).then(function (ok) { toast(ok ? '已复制 · 可直接粘贴到群里' : '复制失败'); });
    };

    $('bigscreen').addEventListener('mousemove', beginControls);
    $('bigscreen').addEventListener('touchstart', beginControls, { passive: true });

    /* ---------------- 真心话大冒险 ---------------- */
    function renderTruthLists() {
      var tl = $('truthList');
      var dl = $('dareList');
      if (tl) {
        tl.innerHTML = truthQuestions.map(function (q) {
          return '<li>' + esc(q) + '</li>';
        }).join('');
      }
      if (dl) {
        dl.innerHTML = dareTasks.map(function (d) {
          return '<li>' + esc(d) + '</li>';
        }).join('');
      }
    }
    renderTruthLists();

    var lastTruth = -1;
    var lastDare = -1;
    function pickRandom(arr, avoid) {
      if (arr.length <= 1) return 0;
      var i;
      do { i = Math.floor(Math.random() * arr.length); } while (i === avoid);
      return i;
    }

    function showTruth(type, text) {
      var box = $('truthDisplay');
      if (!box) return;
      box.innerHTML = '<span class="truth-text type-' + type + '">' + esc(text) + '</span>';
      var el = box.querySelector('.truth-text');
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = '';
    }

    if ($('drawTruth')) {
      $('drawTruth').onclick = function () {
        lastTruth = pickRandom(truthQuestions, lastTruth);
        showTruth('truth', truthQuestions[lastTruth]);
      };
    }
    if ($('drawDare')) {
      $('drawDare').onclick = function () {
        lastDare = pickRandom(dareTasks, lastDare);
        showTruth('dare', dareTasks[lastDare]);
      };
    }

    document.addEventListener('keydown', function (e) {
      if (!$('bigscreen').hidden) {
        if (e.key === 'Escape') { closeBigScreen(); }
        return;
      }
      var tag = document.activeElement && document.activeElement.tagName;
      var typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.code === 'Space') {
        if (rolling) { e.preventDefault(); skip(); }
        else if (!typing) { e.preventDefault(); startDraw(); }
      }
    });
  });
})();
