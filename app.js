/* ===================================================================
 * Modül 4 — Çıkmış Sorular Web App
 * Vanilla JS · No framework · localStorage tabanlı state
 * =================================================================== */

const STORE_KEY = 'm4_state_v2';
const SINAV_TARIHI = '2026-06-30'; // sınav tarihi — gün sayacı için

const state = {
  data: null,         // questions.json
  cardsData: null,    // cards.json (hap bilgi)
  view: 'home',
  current: null,
  progress: {},       // {qId: {answered, correct, when}}
  cardsSrs: {},       // {cardId: {due, interval(saat), ease, lapses}}
  mistakes: [],       // [{qId, when, wrong, right, topic, title, stem}]
  streak: { days: 0, last_date: null },
  quiz: null,
  quizCfg: { count: 10, topics: [], contentType: 'cikmis', timed: true },
  xp: 0,
  achievements: [],   // ['first_correct','streak_5','100_questions',...]
  dailyGoal: 18,      // bugünkü hedef
};

const ACHIEVEMENTS = [
  { id: 'first_q', name: 'İlk Adım', emoji: '👶', desc: 'İlk soruyu tamamla' },
  { id: 'first_correct', name: 'İlk Doğru', emoji: '✓', desc: 'İlk doğru cevap' },
  { id: 'streak_3', name: '3 Üst Üste', emoji: '🔥', desc: '3 soruda üst üste doğru' },
  { id: 'streak_5', name: '5 Üst Üste', emoji: '🔥🔥', desc: '5 soruda üst üste doğru' },
  { id: 'streak_10', name: '10 Üst Üste', emoji: '💯', desc: '10 soruda üst üste doğru' },
  { id: 'quiz_perfect', name: 'Kusursuz Quiz', emoji: '🏆', desc: '10/10 quiz tamamla' },
  { id: 'q_25', name: 'Çeyrek Yol', emoji: '🌱', desc: '25 soru tamamla' },
  { id: 'q_50', name: 'Yarı Yol', emoji: '🌿', desc: '50 soru tamamla' },
  { id: 'q_100', name: 'Tam Yol', emoji: '🌳', desc: '100 soru tamamla' },
  { id: 'streak_day_3', name: '3 Gün Çalışma', emoji: '📅', desc: '3 gün üst üste' },
  { id: 'streak_day_7', name: '1 Hafta', emoji: '🗓️', desc: '7 gün üst üste' },
  { id: 'card_50', name: 'Kart Ustası', emoji: '🃏', desc: '50 kart tekrarla' },
  { id: 'fix_5', name: 'Hata Avcısı', emoji: '🎯', desc: '5 yanlışı düzelt' },
];

/* ======================= STORAGE ======================= */
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(state, saved);
    }
  } catch (e) { console.warn('State load failed', e); }
}
function saveState() {
  const persist = {
    progress: state.progress,
    cardsSrs: state.cardsSrs,
    mistakes: state.mistakes,
    streak: state.streak,
    xp: state.xp,
    achievements: state.achievements,
    quizCfg: state.quizCfg,
    quizHistory: state.quizHistory || [],
    pausedQuiz: state.pausedQuiz || null,  // duraklat-devam için
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(persist));
}

function pauseQuiz() {
  if (!state.quiz) return;
  // Quiz state'i serialize edip kaydet (sadece pickled bilgi — questions referansını kaybet, id'lere göre regenerate)
  const isProf = state.quiz.questions[0]?.isProf;
  state.pausedQuiz = {
    qIds: state.quiz.questions.map(q => q.id),  // ID listesi (orijinal veya prof ID)
    isProfPool: isProf || false,
    index: state.quiz.index,
    score: state.quiz.score,
    streak: state.quiz.streak,
    skipped: state.quiz.skipped || [],
    progressDuringQuiz: state.quiz.progressDuringQuiz || {},
    startTime: state.quiz.startTime,
    elapsedAtPause: Date.now() - state.quiz.startTime
  };
  saveState();
  state.quiz = null;
  show('home');
}

function resumePausedQuiz() {
  if (!state.pausedQuiz) return;
  const p = state.pausedQuiz;
  let questions = [];
  if (p.isProfPool) {
    // p.qIds: ["1_1_P5","..."] gibi — original question ID'den parse et
    questions = p.qIds.map(id => {
      const m = String(id).match(/^(\d+)_/);
      if (!m) return null;
      const parentId = parseInt(m[1]);
      const parent = state.data.questions.find(x => x.id === parentId);
      if (!parent) return null;
      const profIdSuffix = id.substring(m[0].length); // "P5" gibi
      const pq = parent.prof_questions.find(x => x.id.endsWith('_'+profIdSuffix) || x.id === profIdSuffix);
      return pq ? profToQuestion(pq, parent) : null;
    }).filter(Boolean);
  } else {
    questions = p.qIds.map(id => state.data.questions.find(q => q.id === id)).filter(Boolean);
  }
  if (!questions.length) {
    state.pausedQuiz = null; saveState();
    return showToast('Devam edilemedi', 'Sorular bulunamadı');
  }
  state.quiz = {
    questions,
    index: p.index,
    score: p.score,
    streak: p.streak,
    skipped: p.skipped || [],
    progressDuringQuiz: p.progressDuringQuiz || {},
    answered: false,
    picked: null,
    startTime: Date.now() - p.elapsedAtPause
  };
  state.pausedQuiz = null;
  saveState();
  show('quiz');
  renderQuiz();
}

function profToQuestion(profQ, parentQ) {
  // Profesör sorusunu Question objesi gibi davranmasını sağla
  // Yeni format: prof kendi note_quote + note_ref'ini taşır. Eski format için (note alanı) fallback.
  return {
    id: profQ.id,
    num: profQ.id,
    isProf: true,
    parentId: parentQ.id,
    topic: parentQ.topic,
    title: profQ.subtopic || profQ.stem.slice(0,60),
    stem: profQ.stem,
    extra_block: profQ.extra_block || '',
    choices: profQ.choices,
    correct: profQ.correct,
    explain: profQ.explain,
    note_quote: profQ.note_quote || profQ.note || '',
    note_ref: profQ.note_ref || parentQ.note_ref || {},
    note_full_passage: parentQ.note_full_passage || '',
    level: profQ.level
  };
}

/* ======================= ACHIEVEMENTS / XP ======================= */
function awardXp(amount) {
  state.xp += amount;
  saveState();
}
function unlockAchievement(id) {
  if (state.achievements.includes(id)) return;
  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (!ach) return;
  state.achievements.push(id);
  saveState();
  showToast(`${ach.emoji} ${ach.name} açıldı!`, ach.desc);
}
function checkAchievements() {
  const answered = Object.keys(state.progress).length;
  const correctCount = Object.values(state.progress).filter(p => p.correct).length;
  if (answered >= 1) unlockAchievement('first_q');
  if (correctCount >= 1) unlockAchievement('first_correct');
  if (answered >= 25) unlockAchievement('q_25');
  if (answered >= 50) unlockAchievement('q_50');
  if (answered >= 100) unlockAchievement('q_100');
  if (state.streak.days >= 3) unlockAchievement('streak_day_3');
  if (state.streak.days >= 7) unlockAchievement('streak_day_7');
}
function showToast(title, desc) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<div class="toast-title">${title}</div><div class="toast-desc">${desc||''}</div>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 50);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}
function fireConfetti() {
  // Hafif konfeti efekti
  for (let i = 0; i < 30; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.animationDelay = (Math.random() * 0.5) + 's';
    c.style.background = ['#4ade80','#4a9eff','#fbbf24','#f87171'][Math.floor(Math.random()*4)];
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2500);
  }
}
function daysToExam() {
  const exam = new Date(SINAV_TARIHI);
  const today = new Date();
  return Math.max(0, Math.ceil((exam - today) / 86400000));
}

/* ======================= STREAK ======================= */
function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.streak.last_date === today) return; // bugün zaten
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (state.streak.last_date === yesterday) {
    state.streak.days++;
  } else {
    state.streak.days = 1;
  }
  state.streak.last_date = today;
  saveState();
}

/* ======================= ROUTER ======================= */
function show(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + viewId);
  if (el) el.classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.go === viewId);
  });
  state.view = viewId;
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Sayfa başlığını güncelle
  const titles = {
    home: 'Modül 4', questions: 'Sorular', detail: 'Soru Detay',
    quiz: 'Quiz', cards: 'Flashcard', topics: 'Konular', mistakes: 'Yanlış Defteri'
  };
  document.getElementById('page-title').textContent = titles[viewId] || 'Modül 4';

  // View'a özel renderer çağır
  if (viewId === 'home') renderHome();
  else if (viewId === 'questions') renderQuestionList();
  else if (viewId === 'quiz') startQuiz();
  else if (viewId === 'cards') startFlashcard();
  else if (viewId === 'topics') renderTopics();
  else if (viewId === 'mistakes') renderMistakes();
}

/* ======================= HOME ======================= */
function renderHome() {
  const total = state.data.questions.length;
  const answered = Object.keys(state.progress).length;
  const correct = Object.values(state.progress).filter(p => p.correct).length;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const allCards = state.cardsData?.cards || [];
  const dueCards = allCards.filter(c => {
    const s = state.cardsSrs[c.id];
    return !s || s.due <= Date.now();
  }).length;
  const mistakeCount = state.mistakes.length;
  const examDays = daysToExam();

  document.getElementById('stat-completed').textContent = answered;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-accuracy').textContent = accuracy;
  document.getElementById('stat-due').textContent = dueCards;
  document.getElementById('stat-mistakes').textContent = mistakeCount;
  document.getElementById('progress-completed').style.width = total ? (answered/total*100) + '%' : '0%';
  document.getElementById('progress-accuracy').style.width = accuracy + '%';
  document.getElementById('streak-days').textContent = state.streak.days;
  document.getElementById('action-list-count').textContent = total;
  document.getElementById('action-cards-count').textContent = dueCards || allCards.length;
  document.getElementById('action-mistakes-count').textContent = mistakeCount;

  // Greeting + sınav sayacı + XP
  let greet = 'çalışmaya başla 💪';
  if (answered === 0) greet = 'ilk soruyla başla 🚀';
  else if (accuracy >= 90) greet = 'harika gidiyorsun ✨';
  else if (mistakeCount > 5) greet = 'yanlışları tekrar etme zamanı 📖';
  else if (dueCards > 10) greet = 'kartlarını tekrar etmen lazım 🃏';
  document.getElementById('greeting-line').textContent = greet;

  // Devam eden quiz banner (varsa en üstte)
  let resumeBanner = document.getElementById('resume-banner');
  if (state.pausedQuiz) {
    if (!resumeBanner) {
      resumeBanner = document.createElement('div');
      resumeBanner.id = 'resume-banner';
      resumeBanner.className = 'resume-banner';
      const homeView = document.getElementById('view-home');
      homeView.insertBefore(resumeBanner, homeView.firstChild);
    }
    const p = state.pausedQuiz;
    resumeBanner.innerHTML = `
      <div class="resume-content">
        <span class="resume-emoji">⏸</span>
        <div class="resume-text">
          <div class="resume-title">Devam eden quiz</div>
          <div class="resume-desc">${p.index + 1}/${p.qIds.length} · ${p.score} doğru</div>
        </div>
        <button class="btn btn-primary" onclick="resumePausedQuiz()">Devam et</button>
        <button class="resume-close" onclick="dismissPausedQuiz()" title="İptal">×</button>
      </div>
    `;
  } else if (resumeBanner) {
    resumeBanner.remove();
  }

  // Sınav sayacı, XP, daily goal banner
  let topBanner = document.getElementById('top-banner');
  if (!topBanner) {
    topBanner = document.createElement('div');
    topBanner.id = 'top-banner';
    topBanner.className = 'top-banner';
    const homeView = document.getElementById('view-home');
    homeView.insertBefore(topBanner, homeView.firstChild);
  }
  const todayProgress = Object.values(state.progress)
    .filter(p => p.when > Date.now() - 86400000).length;
  const goalPct = Math.min(100, Math.round(todayProgress / state.dailyGoal * 100));
  topBanner.innerHTML = `
    <div class="banner-row">
      <div class="banner-item">
        <div class="banner-emoji">📅</div>
        <div class="banner-text">
          <div class="banner-v">${examDays}</div>
          <div class="banner-l">gün kaldı</div>
        </div>
      </div>
      <div class="banner-item">
        <div class="banner-emoji">⚡</div>
        <div class="banner-text">
          <div class="banner-v">${state.xp}</div>
          <div class="banner-l">XP</div>
        </div>
      </div>
      <div class="banner-item">
        <div class="banner-emoji">🎯</div>
        <div class="banner-text">
          <div class="banner-v">${todayProgress}/${state.dailyGoal}</div>
          <div class="banner-l">bugün</div>
        </div>
      </div>
    </div>
    <div class="banner-progress"><div style="width:${goalPct}%"></div></div>
  `;

  // Achievements
  let achievementsBlock = document.getElementById('achievements-block');
  if (!achievementsBlock) {
    achievementsBlock = document.createElement('div');
    achievementsBlock.id = 'achievements-block';
    document.getElementById('view-home').appendChild(achievementsBlock);
  }
  achievementsBlock.innerHTML = `
    <h3 class="block-title">🏅 Başarılar (${state.achievements.length}/${ACHIEVEMENTS.length})</h3>
    <div class="achievements-grid">
      ${ACHIEVEMENTS.map(a => `
        <div class="ach-badge ${state.achievements.includes(a.id)?'unlocked':'locked'}" title="${a.desc}">
          <div class="ach-emoji">${a.emoji}</div>
          <div class="ach-name">${a.name}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ======================= QUESTION LIST ======================= */
function getAllTopics() {
  const set = new Set();
  state.data.questions.forEach(q => set.add(q.topic.main));
  return [...set].sort();
}

function renderQuestionList() {
  // Konu filtre seçeneklerini doldur
  const sel = document.getElementById('topic-filter');
  if (sel.options.length <= 1) {
    getAllTopics().forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      sel.appendChild(o);
    });
  }

  // Kaynak chip filtresi (lazy render — tek kere)
  renderExamSourceChips();

  const search = document.getElementById('search-input').value.toLowerCase();
  const topic = sel.value;
  const examFilter = state.examFilter || '';
  const list = document.getElementById('question-list');
  list.innerHTML = '';

  let filtered = state.data.questions;
  if (examFilter) filtered = filtered.filter(q => q.exam_source === examFilter);
  if (topic) filtered = filtered.filter(q => q.topic.main === topic);
  if (search) filtered = filtered.filter(q =>
    q.stem.toLowerCase().includes(search) ||
    (q.title||'').toLowerCase().includes(search) ||
    q.topic.main.toLowerCase().includes(search)
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="emoji-big">🔍</div>
      <div class="title">Sonuç bulunamadı</div>
      <div class="desc">Farklı kelime veya konu dene</div>
    </div>`;
    return;
  }

  filtered.forEach(q => {
    const p = state.progress[q.id];
    const row = document.createElement('div');
    row.className = 'question-row';
    if (p) row.classList.add('answered');
    if (p && !p.correct) row.classList.add('wrong');
    const examTag = q.exam_label ? `<span class="q-exam">🎓 ${escapeHtml(q.exam_label)}</span>` : '';
    row.innerHTML = `
      <div class="q-num">${q.num}</div>
      <div class="q-info">
        <div class="q-title">${escapeHtml(q.title || q.stem.slice(0,80))}</div>
        <div class="q-tag">${escapeHtml(q.topic.main)} ${examTag}</div>
      </div>
      <div class="q-status">${p ? (p.correct ? '✓' : '✗') : '›'}</div>
    `;
    row.addEventListener('click', () => openDetail(q.id));
    list.appendChild(row);
  });
}

function renderExamSourceChips() {
  let bar = document.getElementById('exam-chip-bar');
  if (bar) return; // bir kere render edilir
  const filterBar = document.querySelector('#view-questions .filter-bar');
  if (!filterBar) return;
  // Sayım
  const all = state.data.questions;
  const counts = {};
  all.forEach(q => { counts[q.exam_source] = (counts[q.exam_source] || 0) + 1; });
  const sources = Object.keys(counts).sort();
  const labelMap = {
    '2029-D2M4': '2029 D2M4',
    '2028-MEZUNLAR': '2028 Mezunlar',
  };
  bar = document.createElement('div');
  bar.id = 'exam-chip-bar';
  bar.className = 'exam-chip-bar';
  bar.innerHTML = `
    <button class="exam-chip active" data-src="">Tümü <span>${all.length}</span></button>
    ${sources.map(s => `
      <button class="exam-chip" data-src="${s}">${escapeHtml(labelMap[s] || s)} <span>${counts[s]}</span></button>
    `).join('')}
  `;
  filterBar.insertAdjacentElement('afterend', bar);
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.exam-chip');
    if (!btn) return;
    bar.querySelectorAll('.exam-chip').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    state.examFilter = btn.dataset.src;
    renderQuestionList();
  });
}

/* ======================= SORU DETAY ======================= */
function openDetail(qId) {
  const q = state.data.questions.find(x => x.id === qId);
  if (!q) return;
  state.current = q;
  show('detail');
  renderDetail(q);
}

function renderDetail(q) {
  const cont = document.getElementById('detail-content');
  const p = state.progress[q.id];
  const choicesHtml = q.choices.map(c => `
    <div class="choice" data-letter="${c.letter}">
      <div class="choice-letter">${c.letter}</div>
      <div class="choice-text">${c.text}</div>
    </div>
  `).join('');

  // Profesör soruları gruplandır
  const orta = q.prof_questions.filter(p => p.level === 'orta');
  const zor = q.prof_questions.filter(p => p.level === 'zor');

  cont.innerHTML = `
    <div class="detail-header">
      <div class="detail-tag">Soru ${q.num} · ${escapeHtml(q.topic.main)}</div>
      <div class="detail-title">${escapeHtml(q.title)}</div>
      <div class="detail-meta">2029 D2M4 Çıkmışları · s.${q.exam_page}</div>
    </div>
    <div class="question-stem">${q.stem}</div>
    ${q.extra_block ? `<div class="extra-block">${q.extra_block}</div>` : ''}
    <div class="choices">${choicesHtml}</div>
    <div id="explain-area"></div>

    ${q.prof_questions && q.prof_questions.length > 0 ? `
    <div class="prof-section">
      <div class="prof-section-title">👨‍🏫 Profesör Modu</div>
      <div class="prof-section-desc">Bu soruya benzer konularda hazırlanmış ek sorular</div>
      <div class="prof-level-tabs">
        <div class="prof-level-tab active" data-level="orta">Orta zorluk<span class="count">${orta.length} soru</span></div>
        <div class="prof-level-tab" data-level="zor">Zor<span class="count">${zor.length} soru</span></div>
      </div>
      <div id="prof-list"></div>
    </div>
    ` : ''}
  `;

  // Şık tıklama
  cont.querySelectorAll('.choice').forEach(el => {
    el.addEventListener('click', () => onAnswer(q, el.dataset.letter));
  });

  // Önceden cevaplanmışsa göster
  if (p) {
    revealAnswer(q, p.answered);
  }

  // Profesör tabs
  cont.querySelectorAll('.prof-level-tab').forEach(t => {
    t.addEventListener('click', () => {
      cont.querySelectorAll('.prof-level-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderProfList(q, t.dataset.level);
    });
  });
  renderProfList(q, 'orta');
}

function renderProfList(q, level) {
  const list = q.prof_questions.filter(p => p.level === level);
  const wrap = document.getElementById('prof-list');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = list.map(p => `
    <div class="prof-card level-${p.level}" data-pid="${p.id}">
      <div class="prof-card-head">
        <span class="prof-id">${p.id}</span>
        <span class="prof-level-badge ${p.level}">${p.level === 'zor' ? 'Zor' : 'Orta'}</span>
      </div>
      <div class="prof-subtopic">${escapeHtml(p.subtopic || p.stem.slice(0,80))}</div>
    </div>
  `).join('');
  wrap.querySelectorAll('.prof-card').forEach(el => {
    el.addEventListener('click', () => openProf(q.id, el.dataset.pid));
  });
}

function onAnswer(q, letter) {
  const isCorrect = letter === q.correct;
  state.progress[q.id] = { answered: letter, correct: isCorrect, when: Date.now() };
  if (!isCorrect) {
    const exist = state.mistakes.find(m => m.qId === q.id);
    if (!exist) {
      state.mistakes.unshift({
        qId: q.id, when: Date.now(),
        wrong: letter, right: q.correct,
        topic: q.topic.main, title: q.title,
        stem: q.stem.slice(0, 120)
      });
    }
  } else {
    state.mistakes = state.mistakes.filter(m => m.qId !== q.id);
    awardXp(10);
    if (state.mistakes.length === 0 && Object.keys(state.progress).length >= 5) {
      unlockAchievement('fix_5');
    }
  }
  ensureCard(q.id, isCorrect);
  checkAchievements();
  saveState();
  revealAnswer(q, letter);

  if (isCorrect) {
    document.querySelectorAll('#view-detail .choice.correct').forEach(el => el.classList.add('pulse-success'));
  } else {
    document.querySelectorAll('#view-detail .choice.incorrect').forEach(el => el.classList.add('pulse-error'));
  }
}

function revealAnswer(q, picked) {
  document.querySelectorAll('#view-detail .choice').forEach(c => {
    const l = c.dataset.letter;
    c.classList.remove('selected');
    if (l === q.correct) c.classList.add('correct');
    else if (l === picked) c.classList.add('incorrect');
  });
  const ex = document.getElementById('explain-area');
  ex.innerHTML = `
    <div class="explain-box shown">
      <div class="explain-label">✓ Doğru Cevap: ${q.correct}</div>
      <div class="explain-text">${q.explain}</div>
      ${q.note_quote ? `
        <div class="source-quote">
          <div class="src-label">📖 Notta Birebir</div>
          <div class="src-text">${escapeHtml(q.note_quote)}</div>
          <div class="src-ref">${formatNoteRef(q.note_ref)}</div>
          ${q.note_full_passage && q.note_full_passage !== q.note_quote ?
            `<button class="src-expand" onclick="openNoteModal(${q.id})">📚 Tam not pasajını aç</button>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

/* ======================= NOT PASAJ MODAL ======================= */
function openNoteModal(qId) {
  const q = state.data.questions.find(x => x.id === qId);
  if (!q) return;
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">${escapeHtml(q.note_ref.file || 'Tam not pasajı')}</div>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">${escapeHtml(q.note_full_passage)}</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.classList.contains('modal-close')) {
      modal.remove();
    }
  });
}

/* ======================= PROF SORU AÇ ======================= */
function openProf(qId, pId) {
  const q = state.data.questions.find(x => x.id === qId);
  const p = q.prof_questions.find(x => x.id === pId);
  if (!p) return;

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="max-height: 92vh">
      <div class="modal-header">
        <div class="modal-title">${p.id} · ${p.level === 'zor' ? 'Zor' : 'Orta'}</div>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body" style="font-family: -apple-system, system-ui, sans-serif; color: var(--text)">
        ${p.note ? `<div class="source-quote" style="margin-bottom: 16px"><div class="src-label">İpucu</div><div class="src-text" style="font-style: italic">${escapeHtml(p.note)}</div></div>` : ''}
        <div style="font-size: 14.5px; line-height: 1.55; font-weight: 500; margin-bottom: 14px">${p.stem}</div>
        ${p.extra_block ? `<div class="extra-block">${p.extra_block}</div>` : ''}
        <div class="choices" id="prof-choices">
          ${p.choices.map(c => `
            <div class="choice" data-letter="${c.letter}">
              <div class="choice-letter">${c.letter}</div>
              <div class="choice-text">${escapeHtml(c.text)}</div>
            </div>
          `).join('')}
        </div>
        <div id="prof-explain"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('.choice').forEach(el => {
    el.addEventListener('click', () => {
      const picked = el.dataset.letter;
      modal.querySelectorAll('.choice').forEach(c => {
        if (c.dataset.letter === p.correct) c.classList.add('correct');
        else if (c.dataset.letter === picked) c.classList.add('incorrect');
      });
      modal.querySelector('#prof-explain').innerHTML = `
        <div class="explain-box shown" style="margin-top: 14px">
          <div class="explain-label">✓ Doğru Cevap: ${p.correct}</div>
          <div class="explain-text">${p.explain}</div>
        </div>
      `;
    });
  });

  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.classList.contains('modal-close')) {
      modal.remove();
    }
  });
}

/* ======================= QUIZ MODE ======================= */
function startQuiz() {
  // Config ekranı önce
  renderQuizConfig();
}

function getWeakTopic() {
  // En düşük başarı oranlı konuyu bul
  const stats = {};
  state.data.questions.forEach(q => {
    const t = q.topic.main;
    if (!stats[t]) stats[t] = { total: 0, correct: 0, ans: 0 };
    stats[t].total++;
    if (state.progress[q.id]) {
      stats[t].ans++;
      if (state.progress[q.id].correct) stats[t].correct++;
    }
  });
  const candidates = Object.entries(stats)
    .filter(([_,s]) => s.ans >= 2)
    .map(([t,s]) => ({ topic: t, pct: s.correct/s.ans }))
    .sort((a,b) => a.pct - b.pct);
  return candidates[0]?.topic || null;
}

function renderQuizConfig() {
  const cont = document.getElementById('quiz-content');
  const allTopics = getAllTopics();
  const cfg = state.quizCfg;
  const totalAvailable = state.data.questions.length;
  const weakTopic = getWeakTopic();
  const recentQuizzes = (state.quizHistory || []).slice(0, 3);

  cont.innerHTML = `
    <div class="quiz-config">
      <div class="config-header">
        <div class="config-emoji">🎯</div>
        <div class="config-title">Quiz Hazırlığı</div>
        <div class="config-desc">Ne kadar süre çalışacağını seç</div>
      </div>

      ${weakTopic || recentQuizzes.length ? `
      <div class="config-section">
        <div class="config-label">💡 Önerilen</div>
        <div class="suggestion-row">
          ${weakTopic ? `<button class="suggestion-btn" data-quick="weak" data-topic="${escapeHtml(weakTopic)}">
            <span class="sg-emoji">📚</span>
            <div><div class="sg-title">Zayıf konuna odaklan</div>
            <div class="sg-desc">${escapeHtml(weakTopic)} — 10 soru</div></div>
          </button>` : ''}
          ${state.mistakes.length >= 3 ? `<button class="suggestion-btn" data-quick="mistakes">
            <span class="sg-emoji">⚠️</span>
            <div><div class="sg-title">Yanlışlarını tekrar dene</div>
            <div class="sg-desc">${state.mistakes.length} yanlış soru var</div></div>
          </button>` : ''}
        </div>
      </div>
      ` : ''}

      <div class="config-section">
        <div class="config-label">İçerik tipi</div>
        <div class="chip-group" id="cfg-content">
          <div class="chip ${cfg.contentType==='cikmis'?'active':''}" data-content="cikmis">📋 Sadece çıkmış sorular</div>
          <div class="chip ${cfg.contentType==='cikmis_prof'?'active':''}" data-content="cikmis_prof">🎲 Çıkmış + Profesör (karışık)</div>
          <div class="chip ${cfg.contentType==='prof_orta'?'active':''}" data-content="prof_orta">👨‍🏫 Sadece profesör — Orta</div>
          <div class="chip ${cfg.contentType==='prof_zor'?'active':''}" data-content="prof_zor">🔥 Sadece profesör — Zor</div>
          <div class="chip ${cfg.contentType==='prof_tum'?'active':''}" data-content="prof_tum">👨‍🏫 Sadece profesör — Tümü</div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-label">Soru sayısı</div>
        <div class="chip-group" id="cfg-count">
          ${[5,10,20,30].map(n => `<div class="chip ${cfg.count===n?'active':''}" data-count="${n}">${n}</div>`).join('')}
          <div class="chip ${cfg.count===99999?'active':''}" data-count="99999">Tümü</div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-label">Konu seçimi</div>
        <div class="topic-chips" id="cfg-topics">
          <div class="topic-chip ${cfg.topics.length===0?'active':''}" data-topic="">Tüm konular</div>
          ${allTopics.map(t =>
            `<div class="topic-chip ${cfg.topics.includes(t)?'active':''}" data-topic="${escapeHtml(t)}">${escapeHtml(t)}</div>`
          ).join('')}
        </div>
      </div>

      <div class="config-section">
        <div class="config-label">Ek seçenekler</div>
        <label class="toggle-row">
          <input type="checkbox" id="cfg-timed" ${cfg.timed?'checked':''}>
          <span class="toggle-text">⏱ Zamanlayıcı göster (sınav simülasyonu)</span>
        </label>
        <label class="toggle-row">
          <input type="checkbox" id="cfg-only-mistakes">
          <span class="toggle-text">⚠️ Sadece yanlış cevapladıklarımdan</span>
        </label>
        <label class="toggle-row">
          <input type="checkbox" id="cfg-only-unseen">
          <span class="toggle-text">🆕 Sadece daha önce çözmediklerim</span>
        </label>
      </div>

      <div class="config-summary" id="cfg-summary">
        <span id="cfg-summary-text">Tüm konulardan 10 soru — yaklaşık 7 dk</span>
      </div>

      <div class="quiz-actions">
        <button class="btn btn-secondary" onclick="show('home')">Geri</button>
        <button class="btn btn-primary" id="cfg-start">Quiz'i Başlat →</button>
      </div>
    </div>
  `;

  // İçerik tipi chip
  cont.querySelectorAll('#cfg-content .chip').forEach(el => {
    el.addEventListener('click', () => {
      cont.querySelectorAll('#cfg-content .chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      state.quizCfg.contentType = el.dataset.content;
      updateConfigSummary();
    });
  });
  // Soru sayısı chip
  cont.querySelectorAll('#cfg-count .chip').forEach(el => {
    el.addEventListener('click', () => {
      cont.querySelectorAll('#cfg-count .chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      state.quizCfg.count = parseInt(el.dataset.count);
      updateConfigSummary();
    });
  });
  cont.querySelectorAll('#cfg-topics .topic-chip').forEach(el => {
    el.addEventListener('click', () => {
      const t = el.dataset.topic;
      if (t === '') {
        // Tüm konular seçimi
        state.quizCfg.topics = [];
        cont.querySelectorAll('#cfg-topics .topic-chip').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
      } else {
        cont.querySelector('#cfg-topics .topic-chip[data-topic=""]').classList.remove('active');
        if (state.quizCfg.topics.includes(t)) {
          state.quizCfg.topics = state.quizCfg.topics.filter(x => x !== t);
          el.classList.remove('active');
        } else {
          state.quizCfg.topics.push(t);
          el.classList.add('active');
        }
        if (state.quizCfg.topics.length === 0) {
          cont.querySelector('#cfg-topics .topic-chip[data-topic=""]').classList.add('active');
        }
      }
      updateConfigSummary();
    });
  });
  cont.querySelector('#cfg-timed').addEventListener('change', e => { state.quizCfg.timed = e.target.checked; });
  cont.querySelector('#cfg-only-mistakes').addEventListener('change', updateConfigSummary);
  cont.querySelector('#cfg-only-unseen').addEventListener('change', updateConfigSummary);
  cont.querySelector('#cfg-start').addEventListener('click', () => actuallyStartQuiz());

  // Quick suggestion buttons
  cont.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const quick = btn.dataset.quick;
      if (quick === 'weak') {
        const topic = btn.dataset.topic;
        const pool = state.data.questions.filter(q => q.topic.main === topic);
        state.quiz = {
          questions: shuffle([...pool]).slice(0, 10),
          index: 0, score: 0, streak: 0,
          answered: false, picked: null, startTime: Date.now()
        };
        renderQuiz();
      } else if (quick === 'mistakes') {
        const ids = state.mistakes.map(m => m.qId);
        const pool = state.data.questions.filter(q => ids.includes(q.id));
        state.quiz = {
          questions: shuffle([...pool]),
          index: 0, score: 0, streak: 0,
          answered: false, picked: null, startTime: Date.now()
        };
        renderQuiz();
      }
    });
  });

  updateConfigSummary();
  saveState();
}

function buildQuizPool() {
  const onlyMistakes = document.getElementById('cfg-only-mistakes')?.checked;
  const onlyUnseen = document.getElementById('cfg-only-unseen')?.checked;
  const ct = state.quizCfg.contentType || 'cikmis';
  const topicsFilter = state.quizCfg.topics;

  let pool = [];
  // İçerik tipine göre havuz oluştur
  state.data.questions.forEach(q => {
    if (topicsFilter.length && !topicsFilter.includes(q.topic.main)) return;

    if (ct === 'cikmis' || ct === 'cikmis_prof') {
      pool.push(q);
    }
    if (ct === 'cikmis_prof' || ct === 'prof_orta' || ct === 'prof_zor' || ct === 'prof_tum') {
      (q.prof_questions || []).forEach(pq => {
        if (ct === 'prof_orta' && pq.level !== 'orta') return;
        if (ct === 'prof_zor' && pq.level !== 'zor') return;
        pool.push(profToQuestion(pq, q));
      });
    }
  });

  if (onlyMistakes) pool = pool.filter(q => state.mistakes.some(m => m.qId === q.id));
  if (onlyUnseen) pool = pool.filter(q => !state.progress[q.id]);

  return pool;
}

function updateConfigSummary() {
  if (!document.getElementById('quiz-content')) return;
  const pool = buildQuizPool();
  const count = Math.min(state.quizCfg.count, pool.length);
  const minutes = Math.round(count * 0.7);
  const topicLabel = state.quizCfg.topics.length === 0 ? 'Tüm konular' :
    (state.quizCfg.topics.length === 1 ? state.quizCfg.topics[0] : `${state.quizCfg.topics.length} konu`);
  const contentLabel = {
    'cikmis':'çıkmış sorular',
    'cikmis_prof':'çıkmış + profesör karışık',
    'prof_orta':'profesör orta',
    'prof_zor':'profesör zor',
    'prof_tum':'profesör tümü'
  }[state.quizCfg.contentType || 'cikmis'];
  const el = document.getElementById('cfg-summary-text');
  if (el) {
    if (count === 0) {
      el.innerHTML = '⚠️ Bu filtrelerde soru bulunamadı';
    } else {
      el.textContent =
        `${topicLabel} · ${contentLabel} — ${count} soru, ~${minutes} dk` +
        (pool.length < state.quizCfg.count && state.quizCfg.count !== 99999 ? ` (havuz: ${pool.length})` : '');
    }
  }
  // Start butonu disable et eğer pool boşsa
  const startBtn = document.getElementById('cfg-start');
  if (startBtn) startBtn.disabled = count === 0;
}

function actuallyStartQuiz() {
  const pool = buildQuizPool();
  if (!pool.length) {
    showToast('Soru bulunamadı', 'Filtreni gevşet veya farklı konu seç');
    return;
  }
  const count = Math.min(state.quizCfg.count, pool.length);
  const picked = shuffle([...pool]).slice(0, count);
  state.quiz = {
    questions: picked,
    index: 0,
    score: 0,
    streak: 0,
    skipped: [],
    progressDuringQuiz: {},
    answered: false,
    picked: null,
    startTime: Date.now()
  };
  state.pausedQuiz = null;  // varsa eski paused'u sil
  saveState();
  renderQuiz();
}

function renderQuiz() {
  const cont = document.getElementById('quiz-content');
  if (!state.quiz || state.quiz.index >= state.quiz.questions.length) {
    // Atlanan sorular varsa, onları sona eklemiş olabiliriz — bittiyse sonuç
    return renderQuizResult();
  }
  const q = state.quiz.questions[state.quiz.index];
  const progress = ((state.quiz.index + 1) / state.quiz.questions.length) * 100;
  const elapsed = Math.floor((Date.now() - state.quiz.startTime) / 1000);
  const mm = Math.floor(elapsed / 60).toString().padStart(2,'0');
  const ss = (elapsed % 60).toString().padStart(2,'0');
  const isProfQ = q.isProf;
  const profBadge = isProfQ ? `<span class="prof-quiz-badge ${q.level==='zor'?'zor':'orta'}">👨‍🏫 ${q.level==='zor'?'Zor':'Orta'} Prof</span>` : '';

  cont.innerHTML = `
    <div class="quiz-progress-wrap">
      <div class="quiz-meta">
        <span>Soru ${state.quiz.index + 1} / ${state.quiz.questions.length}${state.quiz.skipped?.length ? ` · ⏭ ${state.quiz.skipped.length} atlanan` : ''}</span>
        <span>${state.quizCfg.timed!==false ? `⏱ ${mm}:${ss} · ` : ''}🎯 ${state.quiz.score} doğru</span>
      </div>
      <div class="quiz-progress"><div style="width: ${progress}%"></div></div>
    </div>
    <div class="detail-tag">${escapeHtml(q.topic.main)}</div>
    ${profBadge}
    <div class="question-stem">${q.stem}</div>
    ${q.extra_block ? `<div class="extra-block">${q.extra_block}</div>` : ''}
    <div class="choices" id="quiz-choices">
      ${q.choices.map(c => `
        <div class="choice" data-letter="${c.letter}">
          <div class="choice-letter">${c.letter}</div>
          <div class="choice-text">${escapeHtml(c.text)}</div>
        </div>
      `).join('')}
    </div>
    <div id="quiz-explain"></div>
    <div class="quiz-actions">
      <button class="btn btn-secondary" id="quiz-pause" title="Sonra devam et">⏸ Duraklat</button>
      <button class="btn btn-secondary" id="quiz-skip" title="Sonra dön">⏭ Atla</button>
      <button class="btn btn-primary" id="quiz-next" disabled>Sonraki →</button>
    </div>
    <div style="margin-top: 10px">
      <button class="btn btn-secondary" id="quiz-exit" style="width:100%; opacity:0.7">Quizi sonlandır</button>
    </div>
  `;

  cont.querySelectorAll('.choice').forEach(el => {
    el.addEventListener('click', () => {
      if (state.quiz.answered) return;
      const picked = el.dataset.letter;
      state.quiz.picked = picked;
      state.quiz.answered = true;
      const correct = picked === q.correct;
      if (correct) {
        state.quiz.score++;
        state.quiz.streak++;
        awardXp(10);
        if (state.quiz.streak === 3) unlockAchievement('streak_3');
        if (state.quiz.streak === 5) unlockAchievement('streak_5');
        if (state.quiz.streak === 10) unlockAchievement('streak_10');
      } else {
        state.quiz.streak = 0;
      }
      // Quiz içi kayıt (sonuç ekranında kullanılacak)
      state.quiz.progressDuringQuiz = state.quiz.progressDuringQuiz || {};
      state.quiz.progressDuringQuiz[q.id] = { answered: picked, correct };

      // Sadece çıkmış sorular için global progress kaydedilsin (prof'lar farklı)
      if (!q.isProf) {
        state.progress[q.id] = { answered: picked, correct, when: Date.now() };
        if (!correct) {
          if (!state.mistakes.find(m => m.qId === q.id)) {
            state.mistakes.unshift({
              qId: q.id, when: Date.now(), wrong: picked, right: q.correct,
              topic: q.topic.main, title: q.title, stem: q.stem.slice(0,120)
            });
          }
        } else {
          state.mistakes = state.mistakes.filter(m => m.qId !== q.id);
        }
        ensureCard(q.id, correct);
      }
      saveState();
      // Reveal
      cont.querySelectorAll('.choice').forEach(c => {
        if (c.dataset.letter === q.correct) c.classList.add('correct');
        else if (c.dataset.letter === picked) c.classList.add('incorrect');
      });
      cont.querySelector('#quiz-explain').innerHTML = `
        <div class="explain-box shown">
          <div class="explain-label">✓ Doğru: ${q.correct}</div>
          <div class="explain-text">${q.explain}</div>
          ${q.note_quote ? `
            <div class="source-quote">
              <div class="src-label">📖 Notta Birebir</div>
              <div class="src-text">${escapeHtml(q.note_quote)}</div>
              <div class="src-ref">${formatNoteRef(q.note_ref)}</div>
            </div>
          ` : ''}
        </div>
      `;
      cont.querySelector('#quiz-next').disabled = false;
    });
  });

  cont.querySelector('#quiz-exit').addEventListener('click', () => {
    if (confirm('Quizi sonlandırmak istiyor musun? Mevcut sonuçların kaydedilecek ama yarıda kesilecek.')) {
      // Sonlandır — current state ile sonuç ekranını göster
      state.quiz.questions = state.quiz.questions.slice(0, state.quiz.index + (state.quiz.answered ? 1 : 0));
      renderQuizResult();
    }
  });
  cont.querySelector('#quiz-pause').addEventListener('click', () => {
    pauseQuiz();
    showToast('⏸ Quiz duraklatıldı', 'Ana sayfada "Devam et" ile sonradan dönebilirsin');
  });
  cont.querySelector('#quiz-skip').addEventListener('click', () => {
    if (state.quiz.answered) return; // cevap verildiyse atlama anlamsız
    // Soruyu sonda tekrar göster
    if (!state.quiz.skipped) state.quiz.skipped = [];
    state.quiz.skipped.push(state.quiz.index);
    // Soru objesini sonuna ekle
    state.quiz.questions.push(q);
    state.quiz.index++;
    state.quiz.answered = false;
    state.quiz.picked = null;
    renderQuiz();
  });
  cont.querySelector('#quiz-next').addEventListener('click', () => {
    state.quiz.index++;
    state.quiz.answered = false;
    state.quiz.picked = null;
    renderQuiz();
  });
}

function renderQuizResult() {
  const cont = document.getElementById('quiz-content');
  const total = state.quiz.questions.length;
  const score = state.quiz.score;
  const percentage = Math.round((score / total) * 100);
  const time = Math.floor((Date.now() - state.quiz.startTime) / 1000);
  const mm = Math.floor(time / 60).toString().padStart(2,'0');
  const ss = (time % 60).toString().padStart(2,'0');

  let emoji = '🎯', message = '', vibe = 'neutral';
  if (percentage === 100 && total >= 10) {
    emoji = '🏆'; message = 'Kusursuz!'; vibe = 'perfect';
    unlockAchievement('quiz_perfect');
    fireConfetti();
  } else if (percentage >= 90) { emoji = '🏆'; message = 'Mükemmel!'; vibe = 'great'; fireConfetti(); }
  else if (percentage >= 70) { emoji = '✨'; message = 'Çok iyi gidiyorsun'; vibe = 'good'; }
  else if (percentage >= 50) { emoji = '💪'; message = 'Çalışmaya devam'; vibe = 'ok'; }
  else { emoji = '📖'; message = 'Notları tekrar et'; vibe = 'low'; }

  const xpEarned = score * 10;
  awardXp(0);

  // Konu bazlı performans — prof sorular için progressDuringQuiz kullan
  const topicStats = {};
  const inQuizProgress = state.quiz.progressDuringQuiz || {};
  state.quiz.questions.forEach(q => {
    const t = q.topic.main;
    if (!topicStats[t]) topicStats[t] = { total: 0, correct: 0 };
    topicStats[t].total++;
    const wasCorrect = q.isProf
      ? inQuizProgress[q.id]?.correct
      : (state.progress[q.id]?.correct);
    if (wasCorrect) topicStats[t].correct++;
  });

  // Yanlış cevaplananlar
  const wrongQuestions = state.quiz.questions.filter(q => {
    const correct = q.isProf
      ? inQuizProgress[q.id]?.correct
      : state.progress[q.id]?.correct;
    return !correct;
  });

  // Quiz geçmişine kaydet
  if (!state.quizHistory) state.quizHistory = [];
  state.quizHistory.unshift({
    when: Date.now(),
    score: score, total: total, percentage: percentage,
    time: time,
    topics: state.quizCfg.topics.slice(),
  });
  state.quizHistory = state.quizHistory.slice(0, 30); // son 30 quiz
  saveState();

  const wrongQids = wrongQuestions.map(q => q.id);

  cont.innerHTML = `
    <div class="quiz-result vibe-${vibe}">
      <div class="result-emoji">${emoji}</div>
      <div class="result-title">${message}</div>
      <div class="result-score">
        <span class="big-number">${score}</span><span class="of">/${total}</span>
      </div>
      <div class="result-pct">%${percentage} doğru</div>

      <div class="result-stats">
        <div class="r-stat"><div class="r-stat-v">${mm}:${ss}</div><div class="r-stat-l">Süre</div></div>
        <div class="r-stat"><div class="r-stat-v">+${xpEarned}</div><div class="r-stat-l">XP</div></div>
        <div class="r-stat"><div class="r-stat-v">${state.streak.days}🔥</div><div class="r-stat-l">Gün serisi</div></div>
      </div>

      ${Object.keys(topicStats).length > 1 ? `
        <div class="result-section">
          <div class="result-section-title">📊 Konu Performansı</div>
          <div class="topic-perf-list">
            ${Object.entries(topicStats).map(([t, s]) => {
              const pct = Math.round(s.correct / s.total * 100);
              const cls = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
              return `<div class="topic-perf">
                <div class="tp-name">${escapeHtml(t)}</div>
                <div class="tp-bar"><div class="tp-fill ${cls}" style="width:${pct}%"></div></div>
                <div class="tp-num">${s.correct}/${s.total}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="result-section">
        <div class="result-section-title">📋 Soru Özeti</div>
        <div class="quiz-review-list">
          ${state.quiz.questions.map((q, i) => {
            const correct = q.isProf ? inQuizProgress[q.id]?.correct : state.progress[q.id]?.correct;
            const detailLink = q.isProf ? `openDetail(${q.parentId})` : `openDetail(${q.id})`;
            const profTag = q.isProf ? `<span class="prof-mini-tag ${q.level}">${q.level==='zor'?'🔥 Zor':'👨‍🏫 Orta'}</span>` : '';
            return `<div class="review-item ${correct ? 'r-ok' : 'r-fail'}" onclick="${detailLink}">
              <div class="review-num">${i+1}</div>
              <div class="review-info">
                <div class="review-title">${escapeHtml(q.title || q.stem.slice(0,80))} ${profTag}</div>
                <div class="review-topic">${escapeHtml(q.topic.main)}</div>
              </div>
              <div class="review-status">${correct ? '✓' : '✗'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="result-actions">
        ${wrongQuestions.length ? `<button class="btn btn-warning" onclick="retryWrongFromQuiz([${wrongQids.join(',')}])">⚠️ Yanlışları tekrar dene (${wrongQuestions.length})</button>` : ''}
        <button class="btn btn-primary" onclick="startQuiz()">Yeni quiz</button>
        <button class="btn btn-secondary" onclick="show('home')">Ana sayfa</button>
      </div>
    </div>
  `;
  state.quiz = null;
  updateStreak();
  checkAchievements();
}

function retryWrongFromQuiz(qids) {
  const pool = state.data.questions.filter(q => qids.includes(q.id));
  if (!pool.length) return;
  state.quiz = {
    questions: shuffle([...pool]),
    index: 0, score: 0, streak: 0,
    answered: false, picked: null,
    startTime: Date.now()
  };
  renderQuiz();
}
window.retryWrongFromQuiz = retryWrongFromQuiz;

/* ======================= FLASHCARD (Spaced Repetition) ======================= */
/* ======================= HAP BİLGİ KARTLARI (SRS) ======================= */
function ensureCardSrs(cardId) {
  if (!state.cardsSrs[cardId]) {
    state.cardsSrs[cardId] = { due: Date.now(), interval: 1, ease: 2.5, lapses: 0, reviews: 0 };
  }
}
// Soru cevaplandığında ilgili kartı bul ve SRS güncelle (yardımcı — soru bağlantısı için)
function ensureCard(qId, wasCorrect) {
  // Soruyla bağlantılı tüm kartların SRS durumunu hafifçe etkile
  const related = (state.cardsData?.cards || []).filter(c => c.related_qid === qId);
  related.forEach(c => {
    ensureCardSrs(c.id);
    const s = state.cardsSrs[c.id];
    if (wasCorrect) {
      // sadece interval'i koru, doğru cevap kartı zorunlu çağırmıyor
    } else {
      // yanlış → kart 1 saat içinde tekrar gelsin
      s.due = Math.min(s.due, Date.now() + 60*60*1000);
      s.lapses++;
    }
  });
}

function gradeCard(cardId, grade) {
  ensureCardSrs(cardId);
  const c = state.cardsSrs[cardId];
  c.reviews++;
  if (grade === 'again') {
    c.interval = 1; c.due = Date.now() + 60*60*1000; c.lapses++;
    c.ease = Math.max(1.3, c.ease - 0.2);
  } else if (grade === 'hard') {
    c.interval = Math.max(c.interval, 1) * 1.2;
    c.due = Date.now() + c.interval * 3600 * 1000;
    c.ease = Math.max(1.3, c.ease - 0.15);
  } else if (grade === 'easy') {
    c.interval = (c.interval || 1) * c.ease;
    c.due = Date.now() + c.interval * 3600 * 1000;
    c.ease = Math.min(3.5, c.ease + 0.1);
    awardXp(5);
  }
  // Toplam 50 kart review → achievement
  const totalReviews = Object.values(state.cardsSrs).reduce((sum,x) => sum + (x.reviews||0), 0);
  if (totalReviews >= 50) unlockAchievement('card_50');
  saveState();
}

function startFlashcard() {
  const allCards = state.cardsData?.cards || [];
  const due = allCards.filter(c => {
    const s = state.cardsSrs[c.id];
    return !s || s.due <= Date.now();
  });
  if (!due.length) {
    document.getElementById('cards-content').innerHTML = `
      <div class="empty-state">
        <div class="emoji-big">🎉</div>
        <div class="title">Bugün için tüm kartları bitirdin!</div>
        <div class="desc">Sonraki tekrar zamanı geldiğinde yeniden gelir.</div>
        <div style="margin-top: 24px"><button class="btn btn-primary" onclick="show('home')">Ana sayfa</button></div>
      </div>`;
    return;
  }
  // Konu filtresi kart sayfasında yok şimdilik — tüm due kartları sırala
  // Yeni kartlar önce (reviews=0), sonra eskiler
  due.sort((a,b) => {
    const sa = state.cardsSrs[a.id]?.reviews || 0;
    const sb = state.cardsSrs[b.id]?.reviews || 0;
    return sa - sb;
  });
  state.cardQueue = shuffle(due);
  state.cardIndex = 0;
  renderFlashcard();
}

const CARD_TYPE_EMOJI = {
  'tanım': '🧠', 'liste': '📋', 'mekanizma': '🔗',
  'eşleştirme': '🎯', 'ezber': '📖', 'tuzak': '⚠️'
};
const CARD_TYPE_LABEL = {
  'tanım': 'Tanım', 'liste': 'Liste', 'mekanizma': 'Mekanizma',
  'eşleştirme': 'Eşleştirme', 'ezber': 'Ezber (notta birebir)', 'tuzak': 'Hoca Tuzağı'
};

function renderFlashcard() {
  const cont = document.getElementById('cards-content');
  if (state.cardIndex >= state.cardQueue.length) {
    cont.innerHTML = `
      <div class="empty-state">
        <div class="emoji-big">✅</div>
        <div class="title">Tüm kartlar bitti!</div>
        <div class="desc">${state.cardQueue.length} kart tamamlandı.</div>
        <div style="margin-top: 24px"><button class="btn btn-primary" onclick="show('home')">Ana sayfa</button></div>
      </div>`;
    updateStreak();
    return;
  }
  const c = state.cardQueue[state.cardIndex];
  const progress = ((state.cardIndex + 1) / state.cardQueue.length) * 100;
  const emoji = CARD_TYPE_EMOJI[c.type] || '🃏';
  const typeLabel = CARD_TYPE_LABEL[c.type] || c.type;
  const isFirstReview = !state.cardsSrs[c.id] || (state.cardsSrs[c.id].reviews || 0) === 0;

  cont.innerHTML = `
    <div class="quiz-progress-wrap">
      <div class="quiz-meta">
        <span>Kart ${state.cardIndex + 1} / ${state.cardQueue.length}</span>
        <span>${isFirstReview ? '🆕 Yeni kart' : '🔄 Tekrar'} · ${emoji} ${typeLabel}</span>
      </div>
      <div class="quiz-progress"><div style="width: ${progress}%"></div></div>
    </div>
    <div class="flashcard-wrap">
      <div class="flashcard" id="flashcard">
        <div class="flashcard-inner">
          <div class="flashcard-face front type-${c.type}">
            <div class="card-type-badge">${emoji} ${typeLabel}</div>
            <div class="card-topic">${escapeHtml(c.topic)}</div>
            <div class="card-q">${escapeHtml(c.front)}</div>
            <div class="tap-hint">👆 Cevap için kartı çevir</div>
          </div>
          <div class="flashcard-face back type-${c.type}">
            <div class="card-type-badge">${emoji} ${typeLabel}</div>
            <div class="card-answer-label">CEVAP</div>
            <div class="card-back-text">${formatCardBack(c.back)}</div>
            ${c.source ? `<div class="card-source">📖 ${escapeHtml(c.source)}</div>` : ''}
            ${c.related_qid ? `<div class="card-source" style="margin-top:6px">↪ Soru ${c.related_qid}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="srs-buttons">
      <button class="srs-btn again">❌ Tekrar<span class="srs-small">1 saat</span></button>
      <button class="srs-btn hard">🤔 Zor<span class="srs-small">1-2 gün</span></button>
      <button class="srs-btn easy">✅ Kolay<span class="srs-small">4+ gün</span></button>
    </div>
  `;

  const card = document.getElementById('flashcard');
  card.addEventListener('click', () => card.classList.toggle('flipped'));
  cont.querySelector('.srs-btn.again').addEventListener('click', e => { e.stopPropagation(); gradeCard(c.id, 'again'); nextCard(); });
  cont.querySelector('.srs-btn.hard').addEventListener('click', e => { e.stopPropagation(); gradeCard(c.id, 'hard'); nextCard(); });
  cont.querySelector('.srs-btn.easy').addEventListener('click', e => { e.stopPropagation(); gradeCard(c.id, 'easy'); nextCard(); });
}

function formatCardBack(text) {
  if (!text) return '';
  // Liste (1. ... 2. ...) varsa numaralı liste olarak render
  const lines = text.split('\n').filter(l => l.trim());
  const isList = lines.length >= 2 && lines.every(l => /^\d+\./.test(l.trim()));
  if (isList) {
    return '<ol class="card-list">' + lines.map(l =>
      `<li>${escapeHtml(l.replace(/^\d+\.\s*/, ''))}</li>`
    ).join('') + '</ol>';
  }
  // Aksi durumda HTML olarak göster (b, br vs koru)
  return text.replace(/\n/g, '<br>');
}

function nextCard() {
  state.cardIndex++;
  renderFlashcard();
}

/* ======================= TOPICS ======================= */
function renderTopics() {
  const cont = document.getElementById('topics-content');
  const topicMap = {};
  state.data.questions.forEach(q => {
    const t = q.topic.main;
    if (!topicMap[t]) topicMap[t] = { name: t, total: 0, answered: 0, correct: 0 };
    topicMap[t].total++;
    if (state.progress[q.id]) {
      topicMap[t].answered++;
      if (state.progress[q.id].correct) topicMap[t].correct++;
    }
  });
  const list = Object.values(topicMap).sort((a, b) => b.total - a.total);
  cont.innerHTML = list.map(t => {
    const score = t.answered ? Math.round((t.correct / t.answered) * 100) : null;
    let scoreClass = 'none', scoreText = '—';
    if (score !== null) {
      scoreText = score + '%';
      if (score >= 80) scoreClass = 'high';
      else if (score >= 60) scoreClass = 'mid';
      else scoreClass = 'low';
    }
    return `
      <div class="topic-row" data-topic="${escapeHtml(t.name)}">
        <div class="topic-name">${escapeHtml(t.name)}</div>
        <div class="topic-count">${t.total} soru</div>
        <div class="topic-score ${scoreClass}">${scoreText}</div>
      </div>
    `;
  }).join('');
  cont.querySelectorAll('.topic-row').forEach(r => {
    r.addEventListener('click', () => {
      document.getElementById('topic-filter').value = r.dataset.topic;
      show('questions');
      renderQuestionList();
    });
  });
}

/* ======================= YANLIŞ DEFTERİ ======================= */
function renderMistakes() {
  const cont = document.getElementById('mistakes-content');
  if (!state.mistakes.length) {
    cont.innerHTML = `<div class="empty-state">
      <div class="emoji-big">🎉</div>
      <div class="title">Yanlış defterin boş!</div>
      <div class="desc">Yanlış cevaplayınca buraya otomatik düşer.</div>
    </div>`;
    return;
  }
  cont.innerHTML = state.mistakes.map(m => {
    const dateStr = new Date(m.when).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="mistake-item" data-qid="${m.qId}">
        <div class="mistake-meta">${dateStr} · ${escapeHtml(m.topic)}</div>
        <div class="mistake-q">${escapeHtml(m.stem || m.title || '')}</div>
        <div class="mistake-wrong">❌ Verdiğin: ${m.wrong}</div>
        <div class="mistake-right">✓ Doğru: ${m.right}</div>
      </div>
    `;
  }).join('');
  cont.querySelectorAll('.mistake-item').forEach(el => {
    el.addEventListener('click', () => openDetail(parseInt(el.dataset.qid)));
  });
}

/* ======================= UTILS ======================= */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}
function formatNoteRef(ref) {
  if (!ref || typeof ref !== 'object') return '';
  const parts = [];
  if (ref.file) parts.push(escapeHtml(ref.file));
  const meta = [];
  if (ref.week) meta.push(escapeHtml(ref.week));
  if (ref.type) meta.push(escapeHtml(ref.type));
  if (ref.pages) meta.push('s.' + escapeHtml(String(ref.pages)));
  if (meta.length) parts.push(`<span class="src-ref-meta">${meta.join(' · ')}</span>`);
  return parts.join(' — ');
}

/* ======================= INIT ======================= */
async function init() {
  loadState();
  updateStreak();
  try {
    const [qRes, cRes] = await Promise.all([
      fetch('data/questions.json'),
      fetch('data/cards.json')
    ]);
    state.data = await qRes.json();
    state.cardsData = await cRes.json();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="empty-state" style="padding: 80px 24px">
      <div class="emoji-big">⚠️</div>
      <div class="title">Veri yüklenemedi</div>
      <div class="desc">data/questions.json veya data/cards.json bulunamadı.</div>
    </div>`;
    return;
  }
  // Tab/buton bağlamaları
  document.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => show(el.dataset.go));
  });
  document.getElementById('search-input').addEventListener('input', renderQuestionList);
  document.getElementById('topic-filter').addEventListener('change', renderQuestionList);

  show('home');
}

document.addEventListener('DOMContentLoaded', init);

function dismissPausedQuiz() {
  state.pausedQuiz = null;
  saveState();
  document.getElementById('resume-banner')?.remove();
}

// Global expose (HTML onclick için)
window.openNoteModal = openNoteModal;
window.show = show;
window.startQuiz = startQuiz;
window.resumePausedQuiz = resumePausedQuiz;
window.dismissPausedQuiz = dismissPausedQuiz;
window.openDetail = openDetail;
