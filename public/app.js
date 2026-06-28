/* ═══════════════════════════════════════════════════════════
   냥살핌 — 프론트엔드 앱 로직 (제출 시안 디자인)
   ═══════════════════════════════════════════════════════════ */
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');

const api = async (path, opts) => {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' }, ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '요청에 실패했어요.');
  }
  return res.json();
};

// 삼색이 마스코트 SVG (아바타·핀 공용). tint로 미세 색 변화
function calico(size = 40) {
  return `<svg viewBox="0 0 120 120" class="calico" width="${size}" height="${size}" aria-hidden="true">
    <path d="M30 38 L22 14 L46 30 Z" fill="#3a3a3a"/><path d="M90 38 L98 14 L74 30 Z" fill="#e8a23c"/>
    <path d="M31 35 L26 20 L42 31 Z" fill="#f2a7a0"/><path d="M89 35 L94 20 L78 31 Z" fill="#f2a7a0"/>
    <ellipse cx="60" cy="62" rx="38" ry="34" fill="#fff" stroke="#3a3a3a" stroke-width="3.5"/>
    <path d="M22 56 Q22 34 44 32 Q34 50 38 70 Q30 72 24 66 Z" fill="#3a3a3a"/>
    <path d="M98 56 Q98 34 76 32 Q86 50 82 70 Q90 72 96 66 Z" fill="#e8a23c"/>
    <circle cx="46" cy="60" r="5.5" fill="#3a3a3a"/><circle cx="74" cy="60" r="5.5" fill="#3a3a3a"/>
    <circle cx="48" cy="58" r="1.8" fill="#fff"/><circle cx="76" cy="58" r="1.8" fill="#fff"/>
    <circle cx="38" cy="72" r="5" fill="#f2a7a0" opacity=".7"/><circle cx="82" cy="72" r="5" fill="#f2a7a0" opacity=".7"/>
    <path d="M57 68 L63 68 L60 72 Z" fill="#f2a7a0"/>
    <path d="M60 72 Q56 77 52 74 M60 72 Q64 77 68 74" stroke="#3a3a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

// ── 코무늬 perceptual hash (pHash) ──
// 사진을 8x8 흑백으로 줄여, 각 픽셀이 평균보다 밝으면 1 / 어두우면 0.
// → 64비트 지문(16자리 hex). 비슷한 사진은 비슷한 지문이 나온다.
async function imageToHash(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const N = 8;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, N, N);
    const { data } = ctx.getImageData(0, 0, N, N);
    // 흑백 밝기값
    const gray = [];
    for (let i = 0; i < data.length; i += 4) {
      gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
    // 64비트 → 16진수 16자리
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      let nib = 0;
      for (let j = 0; j < 4; j++) nib = (nib << 1) | (gray[i + j] >= avg ? 1 : 0);
      hex += nib.toString(16);
    }
    return hex;
  } finally {
    URL.revokeObjectURL(url);
  }
}
// 사진 미리보기용 축소 dataURL (DB 저장용, 가볍게)
async function imageToThumb(file, size = 96) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return cv.toDataURL('image/jpeg', 0.7);
  } finally { URL.revokeObjectURL(url); }
}

const toast = (msg) => {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
};
const ago = (iso) => {
  if (!iso) return '기록 없음';
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};
const won = (n) => n.toLocaleString('ko-KR') + '원';

// 모달
const modal = $('#modal'), modalBody = $('#modalBody');
function openModal(html) {
  modalBody.innerHTML = '<div class="modal-grip"></div>' + html;
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; }
modal.addEventListener('click', (e) => {
  if (e.target.dataset.close !== undefined) closeModal();
});

// 지도 좌표 변환 (용산구 인근)
const BBOX = { minLat: 37.534, maxLat: 37.543, minLng: 126.985, maxLng: 126.995 };
const toXY = (lat, lng) => ({
  x: ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * 100,
  y: (1 - (lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * 100,
});

// ═════════════════════════════════════════════
//  TAB: 지도 (홈)
// ═════════════════════════════════════════════
async function renderMap() {
  view.innerHTML = `<p class="muted" style="padding:20px">불러오는 중…</p>`;
  const cats = await api('/cats');
  const rescues = await api('/rescues').catch(() => []);

  // 오늘 급식 현황 3분류 (시안의 급식완료/예정/필요)
  const done = cats.filter(c => !c.careGap && c.hoursSinceFeeding !== null && c.hoursSinceFeeding <= 12).length;
  const need = cats.filter(c => c.careGap).length;
  const soon = cats.length - done - need;

  const pins = cats.map(c => {
    const { x, y } = toXY(c.lat, c.lng);
    return `<button class="pin ${c.careGap ? 'gap' : ''}" data-cat="${c.id}" style="left:${x}%;top:${y}%">
      <span class="dot">${calico(30)}</span><span class="tag">${c.name}</span></button>`;
  }).join('');
  const rescuePins = rescues.filter(r => r.status === 'open' && r.lat).map(r => {
    const { x, y } = toXY(r.lat, r.lng);
    return `<button class="pin gap" data-rescue="${r.id}" style="left:${x}%;top:${y}%">
      <span class="dot" style="background:var(--rose);font-size:18px">🚑</span><span class="tag">구조</span></button>`;
  }).join('');

  view.innerHTML = `
    <div class="card pad-lg" style="background:var(--green-soft);border-color:var(--green-tint)">
      <div style="font-family:var(--round);font-size:16px;color:var(--green-deep);margin-bottom:2px">안녕하세요, 냥집사님! 🐾</div>
      <div class="muted">오늘도 우리 동네 길고양이들의<br>따뜻한 하루를 함께 채워봐요.</div>
      <div class="eyebrow" style="margin:14px 2px 8px">오늘 급식 현황</div>
      <div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr">
        <div class="stat" style="text-align:center"><div class="num green">${done}</div><div class="lbl">급식 완료</div></div>
        <div class="stat" style="text-align:center"><div class="num cheddar">${soon}</div><div class="lbl">급식 예정</div></div>
        <div class="stat" style="text-align:center"><div class="num rose">${need}</div><div class="lbl">급식 필요</div></div>
      </div>
    </div>

    <div class="eyebrow">우리 동네 돌봄 지도</div>
    <h1 class="h-title">회나무로 일대</h1>
    <p class="h-sub">핀을 누르면 고양이 정보와 급식 현황을 볼 수 있어요. 빨갛게 깜빡이면 24시간 넘게 밥 기록이 없는 곳이에요.</p>
    <div class="mapwrap">
      <div class="map-grid"></div>
      <div class="map-blob" style="left:55%;top:20%;width:120px;height:90px"></div>
      <div class="map-blob" style="left:8%;top:60%;width:90px;height:70px"></div>
      <div class="map-road" style="left:6%;top:47%;width:88%;height:10px"></div>
      <div class="map-road" style="left:42%;top:6%;width:9px;height:88%"></div>
      ${pins}${rescuePins}
    </div>
    <div class="legend">
      <span><i style="background:var(--green)"></i>등록 고양이</span>
      <span><i style="background:var(--rose)"></i>돌봄 공백 / 구조요청</span>
      <span><i style="background:var(--cheddar)"></i>TNR 완료</span>
    </div>

    <div class="eyebrow">우리 동네 고양이</div>
    ${cats.map(catRow).join('')}
  `;
  view.querySelectorAll('.pin[data-cat]').forEach(p => p.addEventListener('click', () => showCat(p.dataset.cat)));
  view.querySelectorAll('.cat-row').forEach(r => r.addEventListener('click', () => showCat(r.dataset.cat)));
  view.querySelectorAll('.pin[data-rescue]').forEach(p => p.addEventListener('click', () => switchTab('care')));
}

function catRow(c) {
  const badges = [];
  if (c.neutered) badges.push(`<span class="badge b-tnr">TNR✓</span>`);
  if (c.careGap) badges.push(`<span class="badge b-gap">돌봄공백</span>`);
  else if (c.health === 'watch') badges.push(`<span class="badge b-watch">관찰중</span>`);
  return `<div class="cat-row" data-cat="${c.id}">
    <div class="avatar">${c.photo ? `<img src="${c.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:14px">` : calico(40)}</div>
    <div class="cat-meta">
      <div class="nm">${c.name} ${badges.join('')}</div>
      <div class="sub">마지막 급식 ${ago(c.lastFeedingAt)} · ${c.note || '메모 없음'}</div>
    </div>
    <span class="chev">›</span></div>`;
}

async function showCat(id) {
  const c = await api('/cats/' + id);
  const feedHtml = c.feedings.length
    ? c.feedings.slice(0, 5).map(f => `<div class="feed-item">
        <div class="feed-time">${ago(f.at)}</div>
        <div class="feed-body"><div class="who">${f.by}</div><div class="what">${f.memo}</div></div></div>`).join('')
    : `<p class="muted">아직 급식 기록이 없어요.</p>`;
  openModal(`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:6px">
      <div class="avatar" style="width:60px;height:60px">${c.photo ? `<img src="${c.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:14px">` : calico(50)}</div>
      <div><div style="font-family:var(--round);font-size:22px">${c.name}</div>
        <div class="muted">코무늬 ID · ${c.nosePrintId}</div></div>
    </div>
    <div class="pill-row">
      <span class="badge ${c.neutered ? 'b-tnr' : 'b-watch'}">${c.neutered ? 'TNR 완료' : 'TNR 필요'}</span>
      <span class="badge b-watch">${({ M: '수컷', F: '암컷', U: '미상' })[c.gender] || '미상'}</span>
    </div>
    <div class="divider"></div>
    <div class="muted" style="line-height:1.6">${c.note || '메모가 없습니다.'}</div>
    <div class="divider"></div>
    <div class="eyebrow" style="margin-top:0">급식 기록</div>
    ${feedHtml}
    <div class="divider"></div>
    <div class="btn-row">
      <button class="btn btn-primary" id="mFeed">🍚 밥 줬어요</button>
      ${!c.neutered ? `<button class="btn btn-ghost" id="mTnr">TNR 완료 체크</button>` : ''}
    </div>`);
  $('#mFeed').addEventListener('click', async () => {
    const r = await api(`/cats/${id}/feed`, { method: 'POST', body: JSON.stringify({ by: '나' }) });
    closeModal();
    toast(r.warnedDuplicate ? `⚠️ ${r.lastBy}님이 ${ago(r.lastAt)} 급식했어요. 중복일 수 있어요!` : '🍚 급식 체크인 완료! 동네에 공유됐어요.');
    refresh();
  });
  const t = $('#mTnr');
  if (t) t.addEventListener('click', async () => {
    await api('/cats/' + id, { method: 'PATCH', body: JSON.stringify({ neutered: true, health: 'good' }) });
    closeModal(); toast('✓ TNR 완료로 기록했어요.'); refresh();
  });
}

// ═════════════════════════════════════════════
//  TAB: 급식
// ═════════════════════════════════════════════
async function renderFeed() {
  view.innerHTML = `<p class="muted" style="padding:20px">불러오는 중…</p>`;
  const cats = await api('/cats');
  const feed = await api('/feedings');
  const gapCats = cats.filter(c => c.careGap);

  view.innerHTML = `
    <div class="eyebrow">실시간 돌봄 현황</div>
    <h1 class="h-title">오늘 누가 밥을 줬을까요</h1>
    <p class="h-sub">"오늘 밥 줬어요" 체크인이 모이면 중복 급식과 돌봄 공백을 한눈에 막을 수 있어요.</p>

    ${gapCats.length ? `<div class="card pad-lg" style="border-color:var(--rose);background:#fdf3f3">
      <div class="row-between"><strong style="color:var(--rose)">🔔 돌봄 공백 알림</strong><span class="muted">${gapCats.length}마리</span></div>
      <p class="muted" style="margin:8px 0 0">${gapCats.map(c => c.name).join(', ')} — 24시간 넘게 급식 기록이 없어요.</p>
    </div>` : `<div class="card" style="background:var(--green-soft);border-color:var(--green-tint)"><strong style="color:var(--green-deep)">✓ 모든 고양이가 최근에 밥을 먹었어요</strong></div>`}

    <div class="eyebrow">빠른 급식 체크인</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">
      ${cats.map(c => `<button class="btn btn-ghost btn-sm" data-feed="${c.id}" style="display:flex;align-items:center;gap:8px;justify-content:flex-start">
        <span class="avatar" style="width:30px;height:30px">${calico(24)}</span>
        ${c.name} <small class="muted" style="margin-left:auto">${ago(c.lastFeedingAt)}</small></button>`).join('')}
    </div>

    <div class="eyebrow">최근 급식 타임라인</div>
    <div class="card">
      ${feed.length ? feed.map(f => `<div class="feed-item">
        <div class="feed-time">${ago(f.at)}</div>
        <div class="feed-body"><div class="who">${f.catName || '고양이'} <span class="muted">· ${f.by}</span></div>
        <div class="what">${f.memo}</div></div></div>`).join('') : `<p class="muted">아직 기록이 없어요.</p>`}
    </div>`;
  view.querySelectorAll('[data-feed]').forEach(b => b.addEventListener('click', async () => {
    const r = await api(`/cats/${b.dataset.feed}/feed`, { method: 'POST', body: JSON.stringify({ by: '나' }) });
    toast(r.warnedDuplicate ? `⚠️ ${r.lastBy}님이 ${ago(r.lastAt)} 급식했어요!` : '🍚 급식 체크인 완료!');
    renderFeed();
  }));
}

// ═════════════════════════════════════════════
//  TAB: 등록 (+ AI 코무늬)
// ═════════════════════════════════════════════
const COLORS = ['#E8A23C', '#C77B52', '#8C8C99', '#3A3A3A', '#EDEAE2', '#E57373'];
let regState = { color: COLORS[0], lat: 37.5388, lng: 126.9905, hash: null, thumb: null };

function renderRegister() {
  regState.hash = null; regState.thumb = null;
  view.innerHTML = `
    <div class="eyebrow">새 길고양이 등록</div>
    <h1 class="h-title">새 친구를 등록해요</h1>
    <p class="h-sub">먼저 AI 코무늬 인식으로 이미 등록된 고양이인지 확인하면 중복 등록을 막을 수 있어요.</p>

    <div class="ai-box" id="aiBox">
      <span class="ai-nose">👃</span>
      <div style="font-weight:700;margin-bottom:4px;color:var(--green-deep)">AI 코무늬 인식</div>
      <p class="muted" style="margin:0 0 12px">고양이 코가 잘 보이는 사진을 올리면, 등록된 개체와 비교해 같은 고양이인지 찾아요.</p>
      <input type="file" id="aiFile" accept="image/*" hidden />
      <img id="aiPreview" alt="" style="display:none;width:96px;height:96px;object-fit:cover;border-radius:14px;margin:0 auto 12px;border:2px solid var(--green)" />
      <button class="btn btn-ghost" id="aiPick" style="margin-bottom:8px">📷 코 사진 선택</button>
      <button class="btn btn-primary" id="aiBtn" disabled style="opacity:.5">코무늬 분석하기</button>
      <div id="aiResult"></div>
    </div>

    <label class="fld">이름 *</label>
    <input class="in" id="rName" placeholder="예: 치즈, 까망이…" maxlength="30" />

    <label class="fld">털 색상</label>
    <div class="chips" id="rChips">${COLORS.map(c => `<span class="chip ${c === regState.color ? 'sel' : ''}" data-c="${c}" style="background:${c}"></span>`).join('')}</div>

    <label class="fld">성별</label>
    <select class="in" id="rGender"><option value="U">미상</option><option value="M">수컷</option><option value="F">암컷</option></select>

    <label class="fld">메모 (특징·위치 설명)</label>
    <textarea class="in" id="rNote" placeholder="예: 회나무로 편의점 앞. 사람을 잘 따름." maxlength="200"></textarea>

    <label class="fld">위치 (지도에서 탭하여 지정)</label>
    <div class="mapwrap" style="height:180px;margin-bottom:8px" id="regMap">
      <div class="map-grid"></div>
      <div class="map-road" style="left:6%;top:47%;width:88%;height:9px"></div>
      <button class="pin" id="regPin" style="left:50%;top:50%"><span class="dot" style="background:var(--green);font-size:16px">📍</span></button>
    </div>
    <p class="muted" id="regCoord" style="margin:0 0 16px">📍 위도 ${regState.lat.toFixed(4)}, 경도 ${regState.lng.toFixed(4)}</p>

    <button class="btn btn-primary" id="rSubmit">🐾 등록 완료</button>`;

  view.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    regState.color = ch.dataset.c;
    view.querySelectorAll('.chip').forEach(x => x.classList.toggle('sel', x === ch));
  }));

  $('#regMap').addEventListener('click', (e) => {
    if (e.target.closest('#regPin')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width, py = (e.clientY - rect.top) / rect.height;
    regState.lng = BBOX.minLng + px * (BBOX.maxLng - BBOX.minLng);
    regState.lat = BBOX.minLat + (1 - py) * (BBOX.maxLat - BBOX.minLat);
    const pin = $('#regPin'); pin.style.left = px * 100 + '%'; pin.style.top = py * 100 + '%';
    $('#regCoord').textContent = `📍 위도 ${regState.lat.toFixed(4)}, 경도 ${regState.lng.toFixed(4)}`;
  });

  // 사진 선택 → 미리보기 + pHash 계산
  $('#aiPick').addEventListener('click', () => $('#aiFile').click());
  $('#aiFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const [hash, thumb] = await Promise.all([imageToHash(file), imageToThumb(file)]);
      regState.hash = hash; regState.thumb = thumb;
      const pv = $('#aiPreview'); pv.src = thumb; pv.style.display = 'block';
      const btn = $('#aiBtn'); btn.disabled = false; btn.style.opacity = '1';
      $('#aiResult').innerHTML = '';
      toast('사진을 불러왔어요. 분석하기를 눌러보세요.');
    } catch (err) {
      toast('사진을 처리하지 못했어요. 다른 사진을 시도해 주세요.');
    }
  });

  $('#aiBtn').addEventListener('click', runNoseMatch);
  $('#rSubmit').addEventListener('click', async () => {
    const name = $('#rName').value.trim();
    if (!name) return toast('이름을 입력해 주세요.');
    try {
      await api('/cats', { method: 'POST', body: JSON.stringify({
        name, lat: regState.lat, lng: regState.lng, colorTag: regState.color,
        gender: $('#rGender').value, note: $('#rNote').value.trim(),
        noseHash: regState.hash, photo: regState.thumb }) });
      toast(`🐾 '${name}' 등록 완료! 지도에 추가됐어요.`);
      switchTab('map');
    } catch (e) { toast(e.message); }
  });
}

async function runNoseMatch() {
  if (!regState.hash) return toast('먼저 코 사진을 선택해 주세요.');
  const box = $('#aiBox'), result = $('#aiResult'), btn = $('#aiBtn');
  box.classList.add('scanning'); btn.disabled = true; btn.textContent = '분석 중…';
  result.innerHTML = `<div class="ai-result"><span class="muted">코무늬 패턴을 추출하고 등록된 개체와 비교하고 있어요…</span></div>`;
  try {
    const r = await api('/ai/nose-match', { method: 'POST', body: JSON.stringify({ hash: regState.hash }) });
    const pct = Math.round(r.confidence * 100);
    if (r.result === 'matched') {
      result.innerHTML = `<div class="ai-result matched"><strong>🎯 일치하는 개체 발견</strong><br>${r.message}
        <div class="confidence-bar"><i style="width:${pct}%"></i></div>
        <div class="muted" style="margin-top:6px">유사도 ${pct}% · ${r.cat.name} (${r.cat.nosePrintId})</div></div>`;
    } else {
      result.innerHTML = `<div class="ai-result new"><strong>✨ 신규 개체</strong><br>${r.message}
        <div class="confidence-bar"><i style="width:${pct}%"></i></div>
        <div class="muted" style="margin-top:6px">${r.distance != null ? `가장 가까운 개체와 ${r.distance}비트 차이 · ` : ''}코무늬 ID ${r.nosePrintId}</div></div>`;
    }
  } catch (e) {
    result.innerHTML = `<div class="ai-result" style="border-color:var(--rose)">${e.message}</div>`;
  } finally {
    box.classList.remove('scanning'); btn.disabled = false; btn.textContent = '코무늬 다시 분석하기';
  }
}

// ═════════════════════════════════════════════
//  TAB: 돌봄 (TNR · 구조 · 후원)
// ═════════════════════════════════════════════
async function renderCare() {
  view.innerHTML = `<p class="muted" style="padding:20px">불러오는 중…</p>`;
  const cats = await api('/cats');
  const rescues = await api('/rescues');
  const don = await api('/donations');
  const tnrDone = cats.filter(c => c.neutered).length;
  const tnrRate = cats.length ? Math.round(tnrDone / cats.length * 100) : 0;

  view.innerHTML = `
    <div class="eyebrow">돌봄 · 행정 연계</div>
    <h1 class="h-title">건강하게 함께 살아요</h1>
    <p class="h-sub">TNR(중성화) 관리, 구조 요청, 후원까지 — 동물복지 행정과 이어지는 기능이에요.</p>

    <div class="card pad-lg">
      <div class="row-between" style="margin-bottom:10px"><strong>TNR 진행 현황</strong><span class="muted">${tnrDone}/${cats.length}마리</span></div>
      <div class="donut-wrap">
        <div class="donut" style="background:conic-gradient(var(--green) ${tnrRate}%, var(--line) 0)"><span class="pct">${tnrRate}%</span></div>
        <div style="flex:1">
          <p class="muted" style="margin:0 0 8px">중성화율이 높을수록 개체 수가 안정적으로 관리돼요.</p>
          ${cats.filter(c => !c.neutered).slice(0, 3).map(c => `<div class="pill-row"><span class="badge b-watch">${c.name} · TNR 필요</span></div>`).join('') || '<span class="badge b-tnr">모두 완료 ✓</span>'}
        </div>
      </div>
    </div>

    <div class="eyebrow">🚑 구조 요청</div>
    <button class="btn btn-rose" id="newRescue" style="margin-bottom:12px">+ 구조 요청 등록</button>
    ${rescues.map(r => `<div class="list-item">
      <div class="li-top"><span class="li-title">${r.title}</span>
        <span class="status-pill ${r.status === 'open' ? 's-open' : 's-done'}">${r.status === 'open' ? '도움 필요' : '완료'}</span></div>
      <div class="li-desc">${r.desc || ''}<br><span class="muted">${r.by} · ${ago(r.at)}</span></div>
      ${r.status === 'open' ? `<button class="btn btn-ghost btn-sm" data-resolve="${r.id}" style="margin-top:10px">해결 완료로 표시</button>` : ''}
    </div>`).join('')}

    <div class="eyebrow">💛 후원 현황</div>
    <div class="card pad-lg">
      <div class="row-between"><strong>누적 후원금</strong><span style="font-family:var(--round);color:var(--green-deep);font-size:20px">${won(don.total)}</span></div>
      <div class="divider"></div>
      ${don.items.slice(0, 4).map(d => `<div class="feed-item">
        <div class="feed-body"><div class="who">${d.donor} <span class="muted">· ${d.target}</span></div></div>
        <div style="color:var(--green-deep);font-weight:700">${won(d.amount)}</div></div>`).join('')}
      <button class="btn btn-primary" id="newDonation" style="margin-top:12px">💛 후원하기</button>
    </div>`;

  $('#newRescue').addEventListener('click', () => openModal(`
    <div style="font-family:var(--round);font-size:19px;margin-bottom:4px">🚑 구조 요청</div>
    <p class="muted">위급한 고양이를 동네에 알려요.</p>
    <label class="fld">제목 *</label><input class="in" id="rsTitle" placeholder="예: 회나무로 다친 고양이" />
    <label class="fld">상황 설명</label><textarea class="in" id="rsDesc" placeholder="위치, 상태, 도움 요청 내용을 적어주세요."></textarea>
    <button class="btn btn-rose" id="rsSubmit" style="margin-top:16px">요청 등록</button>`));

  $('#newDonation').addEventListener('click', () => openModal(`
    <div style="font-family:var(--round);font-size:19px;margin-bottom:4px">💛 후원하기</div>
    <p class="muted">사료와 TNR 비용에 쓰여요. (시연용)</p>
    <label class="fld">후원자명</label><input class="in" id="dDonor" placeholder="익명 가능" />
    <label class="fld">후원처</label><select class="in" id="dTarget"><option>사료 후원</option><option>TNR 비용</option><option>치료비</option></select>
    <label class="fld">금액</label><input class="in" id="dAmount" type="number" placeholder="10000" />
    <button class="btn btn-primary" id="dSubmit" style="margin-top:16px">후원하기</button>`));

  modalBody.addEventListener('click', async (e) => {
    if (e.target.id === 'rsSubmit') {
      const title = $('#rsTitle').value.trim();
      if (!title) return toast('제목을 입력해 주세요.');
      await api('/rescues', { method: 'POST', body: JSON.stringify({ title, desc: $('#rsDesc').value.trim() }) });
      closeModal(); toast('🚑 구조 요청이 등록됐어요.'); renderCare();
    }
    if (e.target.id === 'dSubmit') {
      const amount = Number($('#dAmount').value);
      if (!amount) return toast('금액을 입력해 주세요.');
      await api('/donations', { method: 'POST', body: JSON.stringify({ donor: $('#dDonor').value.trim() || '익명', amount, target: $('#dTarget').value }) });
      closeModal(); toast('💛 후원해 주셔서 고맙습니다!'); renderCare();
    }
  });

  view.querySelectorAll('[data-resolve]').forEach(b => b.addEventListener('click', async () => {
    await api('/rescues/' + b.dataset.resolve, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
    toast('✓ 구조 완료로 표시했어요.'); renderCare();
  }));
}

// ═════════════════════════════════════════════
//  TAB: 현황 (대시보드)
// ═════════════════════════════════════════════
async function renderBoard() {
  view.innerHTML = `<p class="muted" style="padding:20px">불러오는 중…</p>`;
  const d = await api('/dashboard');
  const maxBar = Math.max(1, ...d.feedingTrend.map(t => t.count));
  const hb = d.healthBreakdown;

  view.innerHTML = `
    <div class="eyebrow">지자체 · 동물복지 데이터</div>
    <h1 class="h-title">데이터 대시보드</h1>
    <p class="h-sub">돌봄 데이터를 지방자치단체와 공유해 정책 수립과 예산 배분에 활용할 수 있어요. (B2G 수익 모델)</p>

    <div class="stat-grid">
      <div class="stat"><div class="num green">${d.totalCats}</div><div class="lbl">관리 중인 개체</div></div>
      <div class="stat"><div class="num cheddar">${d.tnrRate}%</div><div class="lbl">TNR 중성화율</div></div>
      <div class="stat"><div class="num">${d.feedingsToday}</div><div class="lbl">오늘 급식 횟수</div></div>
      <div class="stat"><div class="num rose">${d.careGap}</div><div class="lbl">돌봄 공백 개체</div></div>
    </div>

    <div class="eyebrow">최근 7일 급식 추이</div>
    <div class="card"><div class="bars">
      ${d.feedingTrend.map(t => `<div class="bar-col"><span class="v">${t.count}</span>
        <div class="bar" style="height:${(t.count / maxBar) * 100}%"></div><span class="l">${t.label}</span></div>`).join('')}
    </div></div>

    <div class="eyebrow">개체 건강 분포</div>
    <div class="card">
      <div style="display:flex;height:14px;border-radius:99px;overflow:hidden;margin-bottom:10px;background:var(--line)">
        <div style="flex:${hb.good || 0.01};background:var(--green)"></div>
        <div style="flex:${hb.watch || 0.01};background:var(--cheddar)"></div>
        <div style="flex:${hb.unknown || 0.01};background:var(--line-2)"></div>
      </div>
      <div class="legend" style="padding:0">
        <span><i style="background:var(--green)"></i>양호 ${hb.good}</span>
        <span><i style="background:var(--cheddar)"></i>관찰 ${hb.watch}</span>
        <span><i style="background:var(--line-2)"></i>미상 ${hb.unknown}</span>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="num rose">${d.openRescues}</div><div class="lbl">진행 중 구조요청</div></div>
      <div class="stat"><div class="num green" style="font-size:20px">${won(d.donationTotal)}</div><div class="lbl">누적 후원금</div></div>
    </div>

    <div class="card" style="margin-top:12px;border-color:var(--green);background:var(--green-soft)">
      <strong style="color:var(--green-deep)">📑 데이터 내보내기 (B2G)</strong>
      <p class="muted" style="margin:8px 0 0">지자체 담당 부서로 월간 개체·TNR·민원 데이터를 CSV로 제공하는 유료 서비스로 확장됩니다.</p>
    </div>`;
  requestAnimationFrame(() => view.querySelectorAll('.bar').forEach(b => {
    const h = b.style.height; b.style.height = '0'; requestAnimationFrame(() => b.style.height = h);
  }));
}

// ═════════════════════════════════════════════
//  라우팅
// ═════════════════════════════════════════════
const TABS = { map: renderMap, feed: renderFeed, register: renderRegister, care: renderCare, board: renderBoard };
let current = 'map';
function switchTab(tab) {
  current = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  view.scrollTop = 0;
  TABS[tab]().catch(e => { view.innerHTML = `<div class="empty"><div class="big">😿</div>${e.message}</div>`; });
}
function refresh() { TABS[current]().catch(() => { }); }
$('#tabbar').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) switchTab(t.dataset.tab); });

$('#aboutBtn').addEventListener('click', () => openModal(`
  <div style="text-align:center">
    <div style="display:flex;justify-content:center">${calico(64)}</div>
    <div style="font-family:var(--round);font-size:21px;color:var(--green-deep);margin:6px 0">냥살핌</div>
    <p class="muted" style="line-height:1.7">AI 기술과 지역 커뮤니티를 연결하여 길고양이 돌봄을 더 체계적이고 따뜻하게.
    캣맘·캣대디가 따로 돌보며 생기는 <b style="color:var(--ink)">중복 급식</b>과
    <b style="color:var(--ink)">돌봄 공백</b>을 줄이고, AI 코무늬 인식으로 개체를 식별해 정확한 데이터를 만들어요.</p>
    <div class="divider"></div>
    <p class="muted" style="font-size:11px">제23회 특성화고교생 사장되기(Be the CEOs) 창업대회<br>박시후 · 서울디지텍고등학교 인공지능소프트웨어과</p>
  </div>`));

switchTab('map');
