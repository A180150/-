/* =========================================================
   小鱼 · 抽奖台（主播专用页）
   —— 仅本机可进（首页连点头像 5 次生成通行凭证）
   —— 名单解析 / 内定必中 / 电影感滚动 / 全屏大屏 / 金箔彩纸
   ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 准入校验 ---------------- */
  var PASS_KEY = 'xiaoyu_host_pass';
  var qk = '';
  try {
    var m = /[?&]k=([^&]+)/.exec(location.search);
    qk = m ? decodeURIComponent(m[1]) : '';
  } catch (e) { qk = ''; }
  var savedPass = '';
  try { savedPass = localStorage.getItem(PASS_KEY) || ''; } catch (e) { savedPass = ''; }
  var localFile = location.protocol === 'file:';

  if (!localFile && (!qk || !savedPass || qk !== savedPass)) {
    document.body.innerHTML =
      '<div class="deny"><div class="deny-box">' +
      '<p class="deny-code">404</p>' +
      '<p class="deny-txt">这个页面不存在</p>' +
      '</div></div>';
    setTimeout(function () { location.replace('./'); }, 2200);
    return;
  }

  try { document.body.classList.add('admin'); } catch (e) { }

  var people = [];        // [{nick, note, drawn, rigged}]
  var records = [];       // [{ts, prize, winners:[display]}]
  var rolling = false;
  var skipFlag = false;
  var timer = null;
  var pending = null;
  var currentWinners = [];
  var controlTimer = null;
  var stageHideTimer = null;

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
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------- 本地持久化 ---------------- */
  var STORE_KEY = 'xiaoyu_draw_v1';
  var PUB_KEY = 'xiaoyu_pub_v1';

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (Array.isArray(data.people)) people = data.people;
      if (Array.isArray(data.records)) records = data.records;
      return true;
    } catch (e) { return false; }
  }
  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ people: people, records: records }));
    } catch (e) { /* 静默 */ }
  }
  /* 对外公开摘要：只写奖项、人数、待抽、轮次，不含任何内定痕迹 */
  function savePub(prize, total, pool, round) {
    try {
      localStorage.setItem(PUB_KEY, JSON.stringify({
        p: prize, t: total, w: pool, r: round, at: Date.now()
      }));
    } catch (e) { /* 静默 */ }
  }

  /* ---------------- 音效 ---------------- */
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

  /* ---------------- 名单解析（微信接龙：网名 + 备注） ---------------- */
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
        s = s.replace(/^\s*\d+\s*[.、．]\s*/, '');
        s = s.replace(/^\s*\d+\s*[.、．]\s*/, '');
        /* 群昵称本身可能就是一串标点（例如只有一个「.」），不能被下面的清洗吃掉 */
        var dotHit = s.trim().match(/^[.。·•]{1,4}(?:[ \t]+(.+))?$/u);
        if (dotHit) {
          var dotNick = s.trim().split(/[ \t]+/)[0];
          var dotNote = (dotHit[1] || '')
            .replace(/（[^）]*）/g, ' ').replace(/\([^)]*\)/g, ' ')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
            .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u3164]/g, ' ')
            .replace(/\s+/g, ' ').trim();
          out.push({ nick: dotNick.slice(0, 24), note: dotNote.slice(0, 24) });
          return;
        }
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
        var t = x.trim();
        if (!t) return;
        if (/^[.。·•]{1,4}$/u.test(t)) { out.push({ nick: t.slice(0, 24), note: '' }); return; }
        var v = t.replace(/[.。]+$/, '').trim();
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
    if (p.note && p.nick !== p.note) {
      /* 网名全是标点时只显示备注，避免出现「·小石」这种怪样子 */
      if (/^[.。·•]{1,4}$/u.test(p.nick)) return p.note;
      return p.nick + '·' + p.note;
    }
    return p.nick || p.note;
  }

  /* ---------------- 数字递增 ---------------- */
  function setNum(elId, target) {
    var el = $(elId);
    if (!el) return;
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
    var rc = $('recordCount');
    if (rc) rc.textContent = records.length + ' 轮';

    var hint = $('riggedHint');
    if (hint) {
      hint.hidden = true;
      if (rigged.length) {
        hint.hidden = false;
        hint.innerHTML = '本轮将有 <b>' + rigged.length + '</b> 位内定必中 · 点击名单可取消';
      }
    }
    var clr = $('clearRigged');
    if (clr) clr.disabled = rigged.length === 0;

    var chips = $('chips');
    if (chips) {
      if (!people.length) {
        chips.innerHTML = '<p class="empty">名单为空，粘贴后点「应用名单」</p>';
      } else {
        chips.innerHTML = people.map(function (p, i) {
          var cls = 'chip' + (p.drawn ? ' drawn' : '') + (p.rigged ? ' rigged' : '');
          return '<span class="' + cls + '" data-i="' + i + '">' + esc(displayName(p)) + (p.rigged ? '<i>定</i>' : '') + '</span>';
        }).join('');
      }
    }

    var rec = $('records');
    if (rec) {
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
    }

    var btn = $('drawBtn');
    if (btn) {
      btn.disabled = rolling || pool.length === 0;
      var sp = btn.querySelector('span');
      if (sp) sp.textContent = rolling ? '抽 奖 中' : (pool.length === 0 ? '无 人' : '抽\u00A0\u00A0奖');
    }

    var roundLabel = records.length + 1;
    var prizeVal = ($('prizeInput') && $('prizeInput').value.trim()) || '家宴名额';

    var roundNo = $('roundNo');
    if (roundNo) roundNo.textContent = roundLabel;
    var hostRound = $('hostRound');
    if (hostRound) hostRound.textContent = roundLabel;
    var hostPrize = $('hostPrize');
    if (hostPrize) hostPrize.textContent = prizeVal;
    var hostPool = $('hostPool');
    if (hostPool) hostPool.textContent = pool.length + ' / ' + people.length;

    saveStore();
    savePub(prizeVal, people.length, pool.length, roundLabel);
  }

  /* ---------------- 应用名单 ---------------- */
  function applyNames() {
    var list = parseNames($('namesInput').value);
    if (!list.length) { toast('没有解析到名字'); return; }
    /* 重新导入时沿用旧状态：已中奖的人不能因为重导名单又回到奖池 */
    var oldByKey = {}, oldByNick = {};
    people.forEach(function (p) {
      oldByKey[p.nick + '\u0000' + p.note] = p;
      if (!oldByNick[p.nick]) oldByNick[p.nick] = [];
      oldByNick[p.nick].push(p);
    });
    var carried = 0;
    people = list.map(function (p) {
      var old = oldByKey[p.nick + '\u0000' + p.note];
      if (!old) {
        var same = oldByNick[p.nick];
        if (same && same.length === 1) old = same[0];
      }
      var np = { nick: p.nick, note: p.note, drawn: !!(old && old.drawn), rigged: !!(old && old.rigged) };
      if (np.drawn) carried++;
      return np;
    });
    render();
    toast(carried
      ? ('已导入 ' + people.length + ' 人 · 沿用 ' + carried + ' 位已中奖')
      : ('已导入 ' + people.length + ' 人'));
  }

  /* ---------------- 抽奖流程 ---------------- */
  function startDraw() {
    if (rolling) return;
    var pool = people.filter(function (p) { return !p.drawn; });
    if (!pool.length) { toast(people.length ? '名单已抽空，可重置已中奖' : '请先导入名单'); return; }

    var prize = $('prizeInput').value.trim() || '家宴名额';
    var need = Math.max(1, Math.min(20, parseInt($('countInput').value, 10) || 1));
    var n = Math.min(need, pool.length);

    /* 内定必中：内定者优先占位，其余名额随机补足 */
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
    winners = shuffle(winners);

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
    if (!w) return;
    w.winners.forEach(function (p) { p.drawn = true; });
    /* 抽完即清空内定，不留痕迹 */
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

  /* ---------------- 滚动抽奖层 ---------------- */
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
    var bsRoundEl = $('bsRound');
    if (bsRoundEl) bsRoundEl.textContent = records.length || 1;

    var box = $('bsWinners');
    var n = Math.min(6, winners.length);
    box.className = 'bs-winners n' + n;
    box.innerHTML = winners.map(function (p, i) {
      var d = (0.07 + i * 0.085).toFixed(3);
      var dn = displayName(p);
      var label = esc(dn);
      /* 三列以上时在网名与备注之间的「·」处换行，两行各自完整，不硬断字 */
      if (n >= 3 && dn.indexOf('·') > -1 && dn.length > 7) {
        label = label.replace('·', '<br>');
      }
      return '<div class="bs-card" style="--d:' + d + 's">' +
        '<span class="bs-no">NO.' + pad(i + 1) + '</span>' +
        '<span class="bs-stamp">中<br>奖</span>' +
        '<span class="bs-name">' + label + '</span>' +
        '<span class="bs-sheen" aria-hidden="true"></span>' +
        '</div>';
    }).join('');

    $('bigscreen').hidden = false;
    document.body.style.overflow = 'hidden';
    beginControls();
    seedStardust();
    dragonRush();
    if (fx) starBurst(fx.width * 0.5, fx.height * 0.5, 18);
    confettiBurst();
    winners.forEach(function (_, i) {
      setTimeout(function () {
        var el = box.children[i];
        if (el && el.getBoundingClientRect) {
          var r = el.getBoundingClientRect();
          var cx = r.left + r.width / 2;
          var cy = r.top + Math.min(r.height * 0.5, 220);
          confettiBurst(cx, cy, 46);
          starBurst(cx, cy, 8);
        }
        if (soundOn) sfxTick();
      }, 340 + i * 85);
    });
  }

  function closeBigScreen() {
    $('bigscreen').hidden = true;
    document.body.style.overflow = '';
    stopControls();
    stopFx();
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

  /* ---------------- 金箔彩纸 ---------------- */
  var cv = $('confetti');
  var ctx = cv ? cv.getContext('2d') : null;
  var bits = [];

  function sizeCanvas() {
    if (!cv) return;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
  }
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  function confettiBurst(x, y, count) {
    if (!ctx) return;
    var colors = ['#f2d79f', '#d9a862', '#fbeed0', '#c58f45', '#fff6e2', '#a8762e', '#e0704b'];
    var cx = (typeof x === 'number') ? x : cv.width * (0.25 + Math.random() * 0.5);
    var cy = (typeof y === 'number') ? y : cv.height * (0.18 + Math.random() * 0.34);
    var n = count || 90;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 3 + Math.random() * 7;
      var round = Math.random() < 0.28;
      bits.push({
        x: cx, y: cy,
        w: round ? Math.random() * 4 + 2 : Math.random() * 5 + 3,
        h: round ? Math.random() * 4 + 2 : Math.random() * 11 + 5,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25,
        a: 1,
        round: round,
        life: 90 + Math.random() * 70,
        c: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function confettiRain() {
    if (!ctx) return;
    var colors = ['#f2d79f', '#d9a862', '#fbeed0', '#c58f45', '#e0704b'];
    bits.push({
      x: Math.random() * cv.width,
      y: -20 - Math.random() * 100,
      w: Math.random() * 4 + 2,
      h: Math.random() * 8 + 4,
      vx: (Math.random() - 0.5) * 1.2,
      vy: Math.random() * 2 + 1.6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.08,
      a: 1,
      round: Math.random() < 0.3,
      life: 300,
      c: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  (function loop() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    var bigOpen = $('bigscreen') && !$('bigscreen').hidden;
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
      if (b.round) {
        ctx.beginPath();
        ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      }
      ctx.restore();
    }
    requestAnimationFrame(loop);
  })();

  /* ---------------- 金龙 · 星芒特效层 ---------------- */
  var fx = $('fxLayers');
  var fctx = fx ? fx.getContext('2d') : null;
  var fxRAF = 0;
  var fxStars = [];

  function sizeFx() {
    if (!fx) return;
    fx.width = window.innerWidth;
    fx.height = window.innerHeight;
  }
  sizeFx();
  window.addEventListener('resize', sizeFx);

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* 一颗四尖星芒 */
  function drawStar(g, x, y, r, rot, alpha) {
    if (alpha <= 0) return;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    var grd = g.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
    grd.addColorStop(0, 'rgba(255,252,242,' + (0.9 * alpha) + ')');
    grd.addColorStop(0.34, 'rgba(242,215,159,' + (0.42 * alpha) + ')');
    grd.addColorStop(1, 'rgba(217,168,98,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, r * 2.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,250,236,' + (0.85 * alpha) + ')';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(-r, 0); g.lineTo(r, 0);
    g.moveTo(0, -r); g.lineTo(0, r);
    g.stroke();
    g.restore();
  }

  function starBurst(x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 0.35 + Math.random() * 0.9;
      fxStars.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd * 90,
        vy: Math.sin(ang) * spd * 90,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 3,
        r: 5 + Math.random() * 9,
        born: performance.now(),
        life: 620 + Math.random() * 380
      });
    }
  }

  /* 金龙从左侧腾入、跨过全屏、自右侧离去 */
  function dragonRush() {
    if (!fctx || reduceMotion()) return;
    cancelAnimationFrame(fxRAF);
    fctx.clearRect(0, 0, fx.width, fx.height);

    var W = fx.width, H = fx.height;
    var DUR = 2600;
    var t0 = performance.now();

    var rings = [
      { born: 90, r0: 70, r1: Math.max(W, H) * 0.95 },
      { born: 420, r0: 40, r1: Math.max(W, H) * 0.62 }
    ];
    fxStars = [];

    function path(t) {
      var x = -0.2 * W + t * 1.4 * W;
      var y = H * 0.6 - Math.sin(t * Math.PI * 1.06) * H * 0.27 + Math.sin(t * Math.PI * 4.4) * H * 0.04;
      return { x: x, y: y };
    }

    function bodyPoint(t, k, el) {
      var p = path(t);
      var q = path(t + 0.004);
      var dx = q.x - p.x, dy = q.y - p.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var wob = Math.sin(t * 24 + k * 0.2 + el / 320) * (8 + k * 0.14);
      return { x: p.x + nx * wob, y: p.y + ny * wob, nx: nx, ny: ny };
    }

    function frame(now) {
      var el = now - t0;
      fctx.clearRect(0, 0, W, H);
      if (el > DUR) { fxRAF = 0; fctx.globalCompositeOperation = 'source-over'; return; }
      fctx.globalCompositeOperation = 'lighter';
      fctx.globalAlpha = 1;

      /* 冲击光环 */
      for (var r = 0; r < rings.length; r++) {
        var p = (el - rings[r].born) / 950;
        if (p <= 0 || p >= 1) continue;
        var rad = rings[r].r0 + (rings[r].r1 - rings[r].r0) * (1 - Math.pow(1 - p, 3));
        var cx = W * 0.5, cy = H * 0.5;
        fctx.strokeStyle = 'rgba(242,215,159,1)';
        fctx.globalAlpha = (1 - p) * 0.45;
        fctx.lineWidth = 2.6 * (1 - p) + 0.5;
        fctx.beginPath(); fctx.arc(cx, cy, rad, 0, Math.PI * 2); fctx.stroke();
        fctx.globalAlpha = (1 - p) * 0.14;
        fctx.lineWidth = 12 * (1 - p) + 2;
        fctx.beginPath(); fctx.arc(cx, cy, rad * 0.94, 0, Math.PI * 2); fctx.stroke();
      }
      fctx.globalAlpha = 1;

      /* 龙珠：中心金光，随龙掠过一起呼吸 */
      if (el < 1900) {
        var cA = el < 1500 ? 1 : (1900 - el) / 400;
        var cx2 = W * 0.5, cy2 = H * 0.5;
        var cp = 0.8 + 0.2 * Math.sin(el / 85);
        var cg2 = fctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 190);
        cg2.addColorStop(0, 'rgba(255,252,242,' + (0.5 * cp * cA) + ')');
        cg2.addColorStop(0.32, 'rgba(242,215,159,' + (0.26 * cp * cA) + ')');
        cg2.addColorStop(1, 'rgba(217,168,98,0)');
        fctx.fillStyle = cg2;
        fctx.beginPath(); fctx.arc(cx2, cy2, 190, 0, Math.PI * 2); fctx.fill();
      }

      /* 星芒迸射 */
      var nowT = now;
      for (var i = fxStars.length - 1; i >= 0; i--) {
        var st = fxStars[i];
        var age = nowT - st.born;
        if (age > st.life) { fxStars.splice(i, 1); continue; }
        var pr = age / st.life;
        var px = st.x + st.vx * pr * 0.9;
        var py = st.y + st.vy * pr * 0.9 + 40 * pr * pr;
        fctx.globalAlpha = 1;
        drawStar(fctx, px, py, st.r * (1 - pr * 0.55), st.rot + st.vr * pr, Math.max(0, 1 - pr));
      }
      fctx.globalAlpha = 1;

      fxRAF = requestAnimationFrame(frame);
    }
    fxRAF = requestAnimationFrame(frame);
  }

  function stopFx() {
    cancelAnimationFrame(fxRAF);
    fxRAF = 0;
    fxStars = [];
    if (fctx) {
      fctx.globalCompositeOperation = 'source-over';
      fctx.clearRect(0, 0, fx.width, fx.height);
    }
  }

  function seedStardust() {
    var el = $('bsStardust');
    if (!el || el.childElementCount) return;
    var out = '';
    for (var i = 0; i < 46; i++) {
      var sz = (1 + Math.random() * 1.8).toFixed(1);
      out += '<i style="left:' + (Math.random() * 100).toFixed(2) + '%;top:' +
        (Math.random() * 100).toFixed(2) + '%;width:' + sz + 'px;height:' + sz +
        'px;animation-delay:' + (Math.random() * 3.6).toFixed(2) + 's"></i>';
    }
    el.innerHTML = out;
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    loadStore();
    render();

    /* 按钮波纹 */
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

    /* 点击名单筹码：切换内定 */
    $('chips').addEventListener('click', function (e) {
      var c = e.target && e.target.closest ? e.target.closest('.chip') : null;
      if (!c) return;
      var idx = parseInt(c.getAttribute('data-i'), 10);
      var p = people[idx];
      if (!p || p.drawn) return;
      p.rigged = !p.rigged;
      render();
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

    var prizeEl = $('prizeInput');
    if (prizeEl) {
      prizeEl.addEventListener('input', function () {
        var hp = $('hostPrize');
        if (hp) hp.textContent = prizeEl.value.trim() || '家宴名额';
      });
    }

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
