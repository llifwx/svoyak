const $ = s => document.querySelector(s);
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else e[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false && k !== '') e.append(k);
  return e;
}
const btn = (text, cls, fn) => el('button', {class: cls, onclick: fn}, text);
const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
const TYPES = {normal: 'Обычный', cat: '🐱 Кот в мешке', x2: '✖️2 Двойная ставка', safe: '🛡 Без риска',
  flip: '🔄 Плюс на минус', swap: '🔀 Обмен счётом', gift: '🎁 Подарок'};
const NOQ = ['flip', 'swap', 'gift']; // модификаторы вместо вопроса — текст не нужен
const has = q => q && (q.text || q.img || NOQ.includes(q.type));

/* ---------- хранение: IndexedDB (картинки не влезут в localStorage) ---------- */
const db = new Promise((res, rej) => {
  const r = indexedDB.open('svoya-igra', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idb(mode, fn) {
  const d = await db;
  return new Promise((res, rej) => {
    const t = d.transaction('kv', mode), r = fn(t.objectStore('kv'));
    t.oncomplete = () => res(r.result);
    t.onerror = () => rej(t.error);
  });
}
let pack, saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => idb('readwrite', s => s.put(pack, 'pack')).catch(e => alert('Не удалось сохранить: ' + e.message)), 300);
}

const newQ = price => ({price, type: 'normal', text: '', answer: '', img: ''});
const newTheme = n => ({name: '', qs: [1, 2, 3, 4, 5].map(i => newQ(i * 100 * n))});
const newRound = n => ({name: `Раунд ${n}`, themes: [1, 2, 3, 4, 5].map(() => newTheme(n))});
const defaultPack = () => ({rounds: [newRound(1)], final: {theme: '', text: '', answer: '', img: ''}});

/* ---------- редактор ---------- */
function inp(obj, key, ph, type = 'text') {
  return el('input', {type, value: obj[key] ?? '', placeholder: ph,
    oninput: e => { obj[key] = type === 'number' ? Number(e.target.value) || 0 : e.target.value; save(); }});
}
function area(obj, key, ph) {
  return el('textarea', {value: obj[key] ?? '', placeholder: ph, rows: 2, oninput: e => { obj[key] = e.target.value; save(); }});
}
function typeSel(q) {
  const s = el('select', {onchange: e => { q.type = e.target.value; save(); }},
    ...Object.entries(TYPES).map(([v, label]) => el('option', {value: v}, label)));
  s.value = q.type in TYPES ? q.type : 'normal';
  return s;
}
function shrink(file, max = 1280) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = el('canvas', {width: Math.round(img.width * k), height: Math.round(img.height * k)});
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => rej(new Error('не картинка'));
    img.src = URL.createObjectURL(file);
  });
}
function imgPicker(obj) {
  const prev = el('img', {className: 'thumb', src: obj.img || ''});
  const wrap = el('div', {class: 'thumbwrap' + (obj.img ? '' : ' hidden')}, prev,
    el('button', {className: 'bad', title: 'Убрать картинку', onclick: () => { obj.img = ''; save(); wrap.classList.add('hidden'); }}, '✕'));
  const file = el('input', {type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { obj.img = await shrink(f); } catch { return alert('Не получилось открыть картинку'); }
    save(); prev.src = obj.img; wrap.classList.remove('hidden'); e.target.value = '';
  }});
  return el('div', {class: 'img-pick'}, wrap, el('label', {class: 'pick'}, '🖼 Фото', file));
}
function renderEditor() {
  const rerender = () => { save(); renderEditor(); };
  $('#ed').replaceChildren(
    ...pack.rounds.map((r, ri) => el('section', {class: 'card'},
      el('div', {class: 'row'}, inp(r, 'name', 'Название раунда'),
        btn('+ тема', 'ghost', () => { r.themes.push(newTheme(ri + 1)); rerender(); }),
        btn('🗑 Раунд', 'del', () => confirm(`Удалить «${r.name}» со всеми вопросами?`) && (pack.rounds.splice(ri, 1), rerender()))),
      ...r.themes.map((t, ti) => el('div', {class: 'theme'},
        el('div', {class: 'row'}, inp(t, 'name', `Тема ${ti + 1}`),
          btn('+ вопрос', 'ghost', () => { t.qs.push(newQ((t.qs.at(-1)?.price || 0) + 100 * (ri + 1))); rerender(); }),
          btn('🗑 Тема', 'del', () => confirm('Удалить тему?') && (r.themes.splice(ti, 1), rerender()))),
        el('div', {class: 'q qh'}, ...['Цена', 'Тип', 'Вопрос', 'Ответ', 'Картинка'].map(s => el('span', {}, s))),
        ...t.qs.map((q, qi) => el('div', {class: 'q'},
          inp(q, 'price', 'Цена', 'number'), typeSel(q), area(q, 'text', 'Вопрос'), area(q, 'answer', 'Ответ'), imgPicker(q),
          el('button', {className: 'del', title: 'Удалить вопрос', onclick: () => confirm('Удалить вопрос?') && (t.qs.splice(qi, 1), rerender())}, '✕'))))))),
    btn('+ Добавить раунд', 'addround', () => { pack.rounds.push(newRound(pack.rounds.length + 1)); rerender(); }),
    el('section', {class: 'card'}, el('h2', {}, 'Финал'),
      el('div', {class: 'q', style: 'grid-template-columns:1fr 1fr 1fr auto;margin-left:0'},
        inp(pack.final, 'theme', 'Тема финала'), area(pack.final, 'text', 'Вопрос'), area(pack.final, 'answer', 'Ответ'), imgPicker(pack.final)))
  );
}

/* ---------- игроки ---------- */
let names = ['Игрок 1', 'Игрок 2', 'Игрок 3'];
function renderSetup() {
  $('#plist').replaceChildren(...names.map((n, i) => el('div', {class: 'row'},
    el('input', {value: n, oninput: e => names[i] = e.target.value}),
    btn('✕', 'bad', () => { names.splice(i, 1); renderSetup(); }))));
}

/* ---------- игра ---------- */
let state;
const closeModal = () => { $('#modal').classList.add('hidden'); buzzStop(); };
const modal = (...kids) => { $('#mbody').replaceChildren(...kids); $('#modal').classList.remove('hidden'); };
const lock = node => node.querySelectorAll('button').forEach(b => b.disabled = true);

function renderScores() {
  $('#scores').replaceChildren(...state.players.map(p => el('div', {class: 'player'},
    el('div', {class: 'pname'}, p.name),
    el('input', {type: 'number', className: 'pscore', value: p.score, title: 'Можно поправить вручную',
      onchange: e => p.score = Number(e.target.value) || 0}))));
}
function renderGame() {
  const r = pack.rounds[state.ri];
  $('#round-name').textContent = r.name;
  $('#next-round').textContent = state.ri + 1 < pack.rounds.length ? 'Следующий раунд →' : (has(pack.final) ? 'К финалу →' : 'Завершить игру →');
  const themes = r.themes.map((t, ti) => [t, ti]).filter(([t]) => t.qs.some(has));
  const n = Math.max(1, ...themes.map(([t]) => t.qs.length));
  const b = $('#board');
  b.style.gridTemplateColumns = `minmax(120px,1.6fr) repeat(${n},1fr)`;
  b.replaceChildren(...themes.flatMap(([t, ti]) => [
    el('div', {class: 'tname'}, t.name),
    ...Array.from({length: n}, (_, qi) => {
      const q = t.qs[qi], key = `${state.ri}:${ti}:${qi}`, off = !has(q) || state.used.has(key);
      return el('button', {class: 'cell', disabled: off, onclick: () => openQ(t, q, key)}, off ? '' : String(q.price));
    })
  ]));
  renderScores();
}
function openQ(t, q, key) {
  const done = () => { state.used.add(key); closeModal(); renderGame(); };
  const head = el('div', {class: 'qhead'}, `${t.name} · ${q.price}`);
  if (q.type === 'cat') return modal(el('h2', {class: 'special'}, '🐱 Кот в мешке'), head,
    el('p', {}, 'Кому отдаёте вопрос?'),
    el('div', {class: 'row center'}, ...state.players.map(p => btn(p.name, '', () => ask(t, q, [p], q.price, done)))));
  // модификаторы: экран-заставка и выбор игрока
  const pick = (title, desc, fn, ps = state.players) => modal(el('h2', {class: 'special'}, title), head,
    el('p', {class: 'qtext'}, desc),
    el('div', {class: 'row center'}, ...ps.map(p => btn(`${p.name} (${p.score})`, '', () => fn(p)))));
  const intro = (title, desc, next) => modal(el('h2', {class: 'special'}, title), head,
    el('p', {class: 'qtext'}, desc), btn('Показать вопрос', '', next));
  if (q.type === 'flip') return pick('🔄 Плюс на минус', 'У кого меняем знак счёта?', p => { p.score = -p.score; done(); });
  if (q.type === 'gift') return pick('🎁 Подарок', `Кому дарим ${q.price}?`, p => { p.score += q.price; done(); });
  if (q.type === 'swap') return pick('🔀 Обмен счётом', 'Кто меняется?', a =>
    pick('🔀 Обмен счётом', `${a.name} меняется счётом с…`, b => { [a.score, b.score] = [b.score, a.score]; done(); },
      state.players.filter(p => p !== a)));
  if (q.type === 'x2') return intro('✖️2 Двойная ставка', `Вопрос стоит ${q.price * 2} — и в плюс, и в минус`, () => ask(t, q, state.players, q.price * 2, done));
  if (q.type === 'safe') return intro('🛡 Без риска', 'За неверный ответ баллы не снимаются', () => ask(t, q, state.players, q.price, done, true));
  ask(t, q, state.players, q.price, done);
}
function ask(t, q, players, price, done, safe = false) {
  const ans = el('div', {class: 'answer hidden'}, 'Ответ: ' + (q.answer || '—'));
  const reveal = () => ans.classList.remove('hidden');
  let left = players.length;
  const rows = new Map();
  const judge = el('div', {class: 'judge'}, ...players.map(p => {
    const row = el('div', {class: 'jrow'}, el('span', {}, p.name),
      btn(`✓ +${price}`, 'ok', () => { p.score += price; lock(judge); reveal(); renderScores(); buzzStop(); }),
      btn(safe ? '✗ мимо' : `✗ −${price}`, 'bad', () => { if (!safe) p.score -= price; lock(row); row.classList.remove('first'); buzzOut(p); renderScores(); if (--left === 0) reveal(); }));
    rows.set(p, row);
    return row;
  }));
  modal(el('div', {class: 'qhead'}, `${t.name} · ${price}`),
    q.text && el('div', {class: 'qtext'}, q.text),
    q.img && el('img', {className: 'qimg', src: q.img}),
    ans,
    el('div', {class: 'mfoot'}, judge,
      el('div', {class: 'row center'}, btn('Показать ответ', 'ghost', reveal), btn('Закрыть вопрос', '', done))));
  buzzStart(players, p => { rows.get(p).classList.add('first'); beep(); });
}

/* ---------- кнопки на телефонах (PeerJS: телефоны подключаются к ноутбуку напрямую) ---------- */
let peer, conns = [], buzz = {open: false, first: null, out: new Set()};
function sync() {
  if (!state) return;
  const m = {players: state.players.map(p => p.name), open: buzz.open && !buzz.first, first: buzz.first?.name ?? null, out: [...buzz.out].map(p => p.name)};
  conns.forEach(c => c.open && c.send(m));
}
const buzzStart = (players, onFirst) => { buzz = {open: players.length > 1, first: null, out: new Set(), onFirst}; sync(); };
const buzzStop = () => { buzz.open = false; sync(); };
const buzzOut = p => { buzz.out.add(p); if (buzz.first === p) buzz.first = null; sync(); };
function onBuzz(name) {
  const p = state?.players.find(p => p.name === name);
  if (!p || !buzz.open || buzz.first || buzz.out.has(p)) return; // кто первым дошёл до ноутбука — тот и первый
  buzz.first = p; buzz.onFirst?.(p); sync();
}
function beep() {
  try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + .15); } catch {}
}
const phonesCount = () => { $('#g-phones').textContent = `📱 Телефоны: ${conns.length}`; const e = $('#pcount'); if (e) e.textContent = `Подключено: ${conns.length}`; };
function phones() {
  if (location.protocol === 'file:') return alert('Телефоны работают, только когда игра открыта по ссылке (Render), а не из файла');
  if (!window.Peer || !window.qrcode) return alert('Не загрузились библиотеки — проверьте интернет');
  if (!peer) {
    peer = new Peer('svoyak-' + Math.random().toString(36).slice(2, 8));
    peer.on('open', phones);
    peer.on('error', e => alert('Ошибка связи с телефонами: ' + e.type));
    peer.on('connection', c => {
      c.on('open', () => { conns.push(c); phonesCount(); sync(); });
      c.on('data', m => m?.buzz && onBuzz(m.buzz));
      c.on('close', () => { conns = conns.filter(x => x !== c); phonesCount(); });
    });
    return modal(el('h2', {class: 'special'}, '📱 Телефоны'), el('p', {}, 'Подключаемся…'));
  }
  if (!peer.id) return;
  const url = location.origin + location.pathname + '?join=' + peer.id;
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const box = el('div', {class: 'qr'}); box.innerHTML = qr.createSvgTag({cellSize: 8, margin: 2, scalable: true});
  modal(el('h2', {class: 'special'}, '📱 Телефоны'), el('p', {}, 'Отсканируйте камерой телефона и выберите себя'), box,
    el('a', {href: url, target: '_blank', class: 'link'}, url), el('p', {id: 'pcount'}, `Подключено: ${conns.length}`), btn('Готово', '', closeModal));
}

/* ---------- экран телефона (?join=ID) ---------- */
function phone(id) {
  show('buzzer');
  let me = null, st = {players: [], out: []}, conn;
  const status = t => $('#bz-status').textContent = t;
  const render = () => {
    if (!st.players.includes(me)) {
      me = null; status('Кто вы?');
      return $('#bz-body').replaceChildren(el('div', {class: 'menu-btns'}, ...st.players.map(n => btn(n, 'ghost', () => { me = n; render(); }))));
    }
    const can = st.open && !st.out.includes(me);
    status(st.first ? (st.first === me ? 'Ты первый! 🎉' : 'Первым: ' + st.first) : can ? 'Жми!' : 'Ждём вопрос…');
    $('#bz-body').replaceChildren(el('div', {class: 'pname'}, me),
      el('button', {class: 'bigbuzz', disabled: !can, onclick: () => { navigator.vibrate?.(60); conn.send({buzz: me}); }}, '🔔'),
      btn('сменить игрока', 'ghost', () => { me = null; render(); }));
  };
  if (!window.Peer) return status('Нет интернета — обновите страницу');
  const p = new Peer();
  p.on('open', () => {
    conn = p.connect(id, {reliable: true});
    conn.on('open', () => status('Подключено, ждём игру…'));
    conn.on('data', m => { st = m; render(); });
    conn.on('close', () => status('Связь потеряна — обновите страницу'));
  });
  p.on('error', e => status('Ошибка: ' + e.type + ' — обновите страницу'));
}
function startFinal() {
  const f = pack.final, ps = state.players.filter(p => p.score > 0);
  if (!has(f) || !ps.length) return results();
  const bets = ps.map(p => el('input', {type: 'number', min: 0, max: p.score, value: 0}));
  modal(el('h2', {class: 'special'}, 'Финал'), el('div', {class: 'qtext'}, 'Тема: ' + (f.theme || '—')),
    el('p', {}, 'Ставки (от 0 до своего счёта). Игроки с 0 и минусом не участвуют.'),
    el('div', {class: 'judge'}, ...ps.map((p, i) => el('div', {class: 'jrow'}, el('span', {}, `${p.name} (${p.score})`), bets[i]))),
    btn('Показать вопрос', '', () => finalQ(f, ps, bets.map((x, i) => Math.min(ps[i].score, Math.max(0, Number(x.value) || 0))))));
}
function finalQ(f, ps, bets) {
  const ans = el('div', {class: 'answer hidden'}, 'Ответ: ' + (f.answer || '—'));
  modal(el('div', {class: 'qhead'}, 'Финал · ' + (f.theme || '')),
    f.text && el('div', {class: 'qtext'}, f.text),
    f.img && el('img', {className: 'qimg', src: f.img}),
    ans,
    el('div', {class: 'mfoot'},
      el('div', {class: 'judge'}, ...ps.map((p, i) => {
        const row = el('div', {class: 'jrow'}, el('span', {}, `${p.name} (ставка ${bets[i]})`),
          btn('✓ верно', 'ok', () => { p.score += bets[i]; lock(row); }),
          btn('✗ неверно', 'bad', () => { p.score -= bets[i]; lock(row); }));
        return row;
      })),
      el('div', {class: 'row center'}, btn('Показать ответ', 'ghost', () => ans.classList.remove('hidden')), btn('Итоги', '', results))));
}
function results() {
  closeModal();
  const s = [...state.players].sort((a, b) => b.score - a.score);
  $('#res').replaceChildren(...s.map((p, i) => el('div', {class: i ? 'res' : 'res win'}, `${i ? '' : '🏆 '}${p.name} — ${p.score}`)));
  show('results');
}

/* ---------- кнопки ---------- */
document.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => show('menu'));
$('#b-edit').onclick = () => { renderEditor(); show('editor'); };
$('#b-play').onclick = () => {
  if (!pack.rounds.some(r => r.themes.some(t => t.qs.some(has)))) return alert('Сначала добавьте вопросы в редакторе');
  renderSetup(); show('setup');
};
$('#p-add').onclick = () => { names.push(`Игрок ${names.length + 1}`); renderSetup(); };
$('#p-go').onclick = () => {
  const ps = names.map(n => n.trim()).filter(Boolean);
  if (!ps.length) return alert('Добавьте хотя бы одного игрока');
  state = {players: ps.map(name => ({name, score: 0})), ri: 0, used: new Set()};
  renderGame(); show('game'); sync();
};
$('#g-phones').onclick = phones;
$('#next-round').onclick = () => {
  if ($('#board .cell:not(:disabled)') && !confirm('В раунде остались вопросы. Всё равно дальше?')) return;
  if (state.ri + 1 < pack.rounds.length) { state.ri++; renderGame(); } else startFinal();
};
$('#g-menu').onclick = () => confirm('Выйти из игры? Счёт пропадёт.') && show('menu');
$('#b-export').onclick = () => {
  const a = el('a', {href: URL.createObjectURL(new Blob([JSON.stringify(pack)], {type: 'application/json'})), download: 'svoya-igra-pack.json'});
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#import').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !confirm('Заменить текущие вопросы вопросами из файла?')) return;
  try {
    const p = JSON.parse(await f.text());
    if (!Array.isArray(p.rounds)) throw 0;
    p.final ??= {theme: '', text: '', answer: '', img: ''};
    pack = p; save(); alert('Пак загружен');
  } catch { alert('Это не файл пака'); }
};

idb('readonly', s => s.get('pack')).catch(() => null).then(p => { pack = p || defaultPack(); });
const joinId = new URLSearchParams(location.search).get('join');
if (joinId) phone(joinId);
