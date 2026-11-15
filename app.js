/* =========================================================
   小鱼 · 每周六家宴（粉丝页）
   —— 只做展示：作品排期 / 须知 / 厨房 / 游戏 / 真心话
   —— 抽奖台是独立页面，只有本机能进（连点头像 5 次）
   ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

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

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- 开饭进度（主播页写、这里只读） ---------------- */
  var PUB_KEY = 'xiaoyu_pub_v1';

  function readPub() {
    try {
      var raw = localStorage.getItem(PUB_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      return {
        prize: typeof d.p === 'string' && d.p ? d.p : '家宴名额',
        total: parseInt(d.t, 10) || 0,
        pool: parseInt(d.w, 10) || 0,
        round: parseInt(d.r, 10) || 1
      };
    } catch (e) { return null; }
  }

  function renderStrip() {
    var d = readPub();
    var prizeEl = $('hxPrize');
    if (!d) {
      if (prizeEl) prizeEl.textContent = '家宴名额';
      if ($('hxTotal')) $('hxTotal').textContent = '0';
      if ($('hxPool')) $('hxPool').textContent = '0';
      if ($('hxRound')) $('hxRound').textContent = '1';
      return;
    }
    if (prizeEl) prizeEl.textContent = d.prize;
    if ($('hxTotal')) $('hxTotal').textContent = d.total;
    if ($('hxPool')) $('hxPool').textContent = d.pool;
    if ($('hxRound')) $('hxRound').textContent = d.round;
  }

  /* ---------------- 主播入口：连点头像 5 次 → 跳到独立抽奖台 ---------------- */
  var PASS_KEY = 'xiaoyu_host_pass';
  var HOST_PAGE = 'host.html';

  function getPass() {
    var v = '';
    try { v = localStorage.getItem(PASS_KEY) || ''; } catch (e) { v = ''; }
    if (!v) {
      v = 'k' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem(PASS_KEY, v); } catch (e) { /* 静默 */ }
    }
    return v;
  }

  var taps = [];
  function bindHostEntry() {
    var av = document.querySelector('.avatar');
    if (!av) return;
    av.addEventListener('click', function (e) {
      e.preventDefault();
      var now = Date.now();
      taps.push(now);
      taps = taps.filter(function (t) { return now - t < 1500; });
      if (taps.length >= 5) {
        taps = [];
        location.href = HOST_PAGE + '?k=' + encodeURIComponent(getPass());
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    renderStrip();
    bindHostEntry();

    /* 1. 滚动入场动画 */
    var revealEls = document.querySelectorAll('.section, .notice-card, .game-card, .card, .truth-col');
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

    /* 2. Hero 鼠标视差 */
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

    /* 3. 卡片 3D 倾斜 */
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

    /* 4. 数字递增动画 */
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

    /* 5. 背景浮动光点 */
    var particlesBox = $('particles');
    if (particlesBox) {
      for (var i = 0; i < 26; i++) {
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

    /* 6. 滚动进度条 */
    var progressBar = $('scrollProgress');
    if (progressBar) {
      var updateProgress = function () {
        var h = document.documentElement;
        var sc = h.scrollTop / (h.scrollHeight - h.clientHeight);
        progressBar.style.width = (sc * 100) + '%';
      };
      window.addEventListener('scroll', updateProgress, { passive: true });
      updateProgress();
    }

    /* 7. 按钮波纹 */
    document.querySelectorAll('.btn, .hs-btn').forEach(function (btn) {
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

    /* 8. 真心话大冒险 */
    function renderTruthLists() {
      var tl = $('truthList');
      var dl = $('dareList');
      if (tl) {
        tl.innerHTML = truthQuestions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('');
      }
      if (dl) {
        dl.innerHTML = dareTasks.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('');
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

    /* 9. 页面回到前台时刷新进度（主播那边刚抽完，粉丝刷新页面也能看到） */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) renderStrip();
    });
  });
})();
