/* ═══════════════════════════════════════════════════════════
   냥살핌 — 프론트엔드 앱 로직
   탭: 지도 / 급식 / 등록(+AI 코무늬) / 돌봄(TNR·건강·구조) / 현황(대시보드)
   ═══════════════════════════════════════════════════════════ */
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const api = async (path, opts) => {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || '요청에 실패했어요.');
  }
  return res.json();
};

const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
};

const ago = (iso) => {
  if (!iso) return '기록 없음';
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};
const won = (n) => n.toLocaleString('ko-KR') + '원';

// ── 모달 ──
const modal = $('#modal'), modalBody = $('#modalBody');
function openModal(html) {
  modalBody.innerHTML = '<div class="modal-grip"></div>' + html;
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; }
modal.addEventListener('click', (e) => { if (e.target.dataset.close !== undefined || e.target === modal.querySelector('.modal-backdrop')) closeModal(); });

// ═════════════════════════════════════════════
//  지도 좌표 → 화면 비율 변환 (용산구 인근 bbox)
// ═════════════════════════════════════════════
const BBOX = { minLat: 37.534, maxLat: 37.543, minLng: 126.985, maxLng: 126.995 };
const toXY = (lat, lng) => ({
  x: ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * 100,
  y: (1 - (lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * 100,
});

// ═════════════════════════════════════════════
//  TAB: 지도
// ═════════════════════════════════════════════
async function renderMap() {
  view.innerHTML = `<p class="muted" style="padding:20px">불러오는 중…</p>`;
  const cats = await api('/cats');
  const rescues = await api('/rescues').catch(() => []);

  const pins = cats.map(c => {
    const { x, y } = toXY(c.lat, c.lng);
    const gap = c.careGap;
    return `<button class="pin ${gap ? 'gap' : ''}" data-cat="${c.id}" style="left:${x}%;top:${y}%">
      <span class="dot" style="background:${c.colorTag}"><span>🐱</span></span>
      <span class="tag">${c.name}</span>
    </button>`;
  }).join('');

  const rescuePins = rescues.filter(r => r.status === 'open' && r.lat).map(r => {
    const { x, y } = toXY(r.lat, r.lng);
    return `<button class="pin gap" data-rescue="${r.id}" style="left:${x}%;top:${y}%">
      <span class="dot" style="background:var(--rose)"><span>🚑</span></span>
      <span class="tag">구조</span></button>`;
  }).join('');

  view.innerHTML = `
    <div class="eyebrow">용산구 회나무로 일대</div>
    <h1 class="h-title">우리 동네 돌봄 지도</h1>
    <p class="h-sub">핀을 누르면 고양이 정보와 급식 현황을 볼 수 있어요. 빨갛게 깜빡이면 24시간 넘게 밥 기록이 없는 곳이에요.</p>
    <div class="mapwrap">
      <div class="map-grid"></div>
      <div class="map-road" style="left:8%;top:46%;width:84%;height:14px"></div>
      <div class="map-road" style="left:40%;top:6%;width:13px;height:88%"></div>
      ${pins}${rescuePins}
    </div>
    <div class="legend">
      <span><i style="background:var(--amber)"></i>등록 고양이</span>
      <span><i style="background:var(--rose)"></i>돌봄 공백 / 구조요청</span>
      <span><i style="background:var(--mint)"></i>TNR 완료</span>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="num amber">${cats.length}</div><div class="lbl">등록된 길고양이</div></div>
      <div class="stat"><div class="num rose">${cats.filter(c => c.careGap).length}</div><div class="lbl">돌봄 공백 (24h+)</div></div>
    </div>
    <div class="eyebrow">등록된 고양이</div>
    ${cats.map(catRow).join('')}
  `;
  view.querySelectorAll('.pin[data-cat]').forEach(p =>
    p.addEventListener('click', () => showCat(p.dataset.cat)));
  view.querySelectorAll('.cat-row').forEach(r =>
    r.addEventListener('click', () => showCat(r.dataset.cat)));
  view.querySelectorAll('.pin[data-rescue]').forEach(p =>
    p.addEventListener('click', () => switchTab('care')));
}

function catRow(c) {
  const badges = [];
  if (c.neutered) badges.push(`<span class="badge b-tnr">TNR✓</span>`);
  if (c.careGap) badges.push(`<span class="badge b-gap">돌봄공백</span>`);
  else if (c.health === 'watch') badges.push(`<span class="badge b-watch">관찰중</span>`);
  return `<div class="cat-row" data-cat="${c.id}">
    <div class="avatar" style="background:${c.colorTag}22;border-color:${c.colorTag}">🐱</div>
    <div class="cat-meta">
      <div class="nm">${c.name} ${badges.join('')}</div>
      <div class="sub">마지막 급식 ${ago(c.lastFeedingAt)} · ${c.note || '메모 없음'}</div>
    </div>
    <span style="color:var(--cream-dim)">›</span>
  </div>`;
}

// 고양이 상세 모달
async function showCat(id) {
  const c = await api('/cats/' + id);
  const feedHtml = c.feedings.length
    ? c.feedings.slice(0, 5).map(f => `<div class="feed-item">
        <div class="feed-time">${ago(f.at)}</div>
        <div class="feed-body"><div class="who">${f.by}</div><div class="what">${f.memo}</div></div>
      </div>`).join('')
    : `<p class="muted">아직 급식 기록이 없어요.</p>`;

  openModal(`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:6px">
      <div class="avatar" style="width:58px;height:58px;font-size:28px;background:${c.colorTag}22;border-color:${c.colorTag}">🐱</div>
      <div>
        <div style="font-size:20px;font-weight:900">${c.name}</div>
        <div class="muted">코무늬 ID · ${c.nosePrintId}</div>
      </div>
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
    </div>
  `);
  $('#mFeed').addEventListener('click', async () => {
    const r = await api(`/cats/${id}/feed`, { method: 'POST', body: JSON.stringify({ by: '나' }) });
    closeModal();
    if (r.warnedDuplicate) toast(`⚠️ ${r.lastBy}님이 ${ago(r.lastAt)} 급식했어요. 중복일 수 있어요!`);
    else toast('🍚 급식 체크인 완료! 동네에 공유됐어요.');
    refresh();
  });
  const t = $('#mTnr');
  if (t) t.addEventListener('click', async () => {
    await api('/cats/' + id, { method: 'PATCH', body: JSON.stringify({ neutered: true, health: 'good' }) });
    closeModal(); toast('✓ TNR 완료로 기록했어요.'); refresh();
  });
}

// ═════════════════════════════════════════════
//  TAB: 급식 현황
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

    ${gapCats.length ? `<div class="card pad-lg" style="border-color:var(--rose)">
      <div class="row-between"><strong style="color:var(--rose)">🔔 돌봄 공백 알림</strong>
      <span class="muted">${gapCats.length}마리</span></div>
      <p class="muted" style="margin:8px 0 0">${gapCats.map(c => c.name).join(', ')} — 24시간 넘게 급식 기록이 없어요.</p>
    </div>` : `<div class="card"><strong style="color:var(--mint)">✓ 모든 고양이가 최근에 밥을 먹었어요</strong></div>`}

    <div class="eyebrow">빠른 급식 체크인</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">
      ${cats.map(c => `<button class="btn btn-ghost btn-sm" data-feed="${c.id}" style="display:flex;align-items:center;gap:8px;justify-content:flex-start">
        <span class="avatar" style="width:30px;height:30px;font-size:16px;background:${c.colorTag}22;border-color:${c.colorTag}">🐱</span>
        ${c.name} <small class="muted" style="margin-left:auto">${ago(c.lastFeedingAt)}</small>
      </button>`).join('')}
    </div>

    <div class="eyebrow">최근 급식 타임라인</div>
    <div class="card">
      ${feed.length ? feed.map(f => `<div class="feed-item">
        <div class="feed-time">${ago(f.at)}</div>
        <div class="feed-body"><div class="who">${f.catName || '고양이'} <span class="muted">· ${f.by}</span></div>
        <div class="what">${f.memo}</div></div>
      </div>`).join('') : `<p class="muted">아직 기록이 없어요.</p>`}
    </div>
  `;
  view.querySelectorAll('[data-feed]').forEach(b =>
    b.addEventListener('click', async () => {
      const r = await api(`/cats/${b.dataset.feed}/feed`, { method: 'POST', body: JSON.stringify({ by: '나' }) });
      if (r.warnedDuplicate) toast(`⚠️ ${r.lastBy}님이 ${ago(r.lastAt)} 급식했어요!`);
      else toast('🍚 급식 체크인 완료!');
      renderFeed();
    }));
}

// ═════════════════════════════════════════════
//  TAB: 등록 (+ AI 코무늬 인식)
// ═════════════════════════════════════════════
const COLORS = ['#E8A93C', '#C77B52', '#8C8C99', '#2B2B33', '#EDEAE2', '#D9534F'];
let regState = { color: COLORS[0], lat: 37.5388, lng: 126.9905, aiChecked: false };

function renderRegister() {
  regState.aiChecked = false;
  view.innerHTML = `
    <div class="eyebrow">새 길고양이 등록</div>
    <h1 class="h-title">새 친구를 등록해요</h1>
    <p class="h-sub">먼저 AI 코무늬 인식으로 이미 등록된 고양이인지 확인하면 중복 등록을 막을 수 있어요.</p>

    <div class="ai-box" id="aiBox">
      <span class="ai-nose">👃</span>
      <div style="font-weight:700;margin-bottom:4px">AI 코무늬 인식</div>
      <p class="muted" style="margin:0 0 12px">고양이 코 사진으로 개체를 식별해요. (사람의 지문처럼!)</p>
      <button class="btn btn-primary" id="aiBtn">📷 코무늬 분석하기</button>
      <div id="aiResult"></div>
    </div>

    <label class="fld">이름 *</label>
    <input class="in" id="rName" placeholder="예: 치즈, 까망이…" maxlength="30" />

    <label class="fld">털 색상</label>
    <div class="chips" id="rChips">
      ${COLORS.map(c => `<span class="chip ${c === regState.color ? 'sel' : ''}" data-c="${c}" style="background:${c}"></span>`).join('')}
    </div>

    <label class="fld">성별</label>
    <select class="in" id="rGender">
      <option value="U">미상</option><option value="M">수컷</option><option value="F">암컷</option>
    </select>

    <label class="fld">메모 (특징·위치 설명)</label>
    <textarea class="in" id="rNote" placeholder="예: 회나무로 편의점 앞. 사람을 잘 따름." maxlength="200"></textarea>

    <label class="fld">위치 (지도에서 탭하여 지정)</label>
    <div class="mapwrap" style="height:180px;margin-bottom:8px" id="regMap">
      <div class="map-grid"></div>
      <div class="map-road" style="left:8%;top:46%;width:84%;height:12px"></div>
      <button class="pin" id="regPin" style="left:50%;top:50%">
        <span class="dot" style="background:${regState.color}"><span>📍</span></span>
      </button>
    </div>
    <p class="muted" style="margin:0 0 16px">📍 위도 ${regState.lat.toFixed(4)}, 경도 ${regState.lng.toFixed(4)}</p>

    <button class="btn btn-primary" id="rSubmit">🐾 등록 완료</button>
  `;

  // 색상 선택
  view.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    regState.color = ch.dataset.c;
    view.querySelectorAll('.chip').forEach(x => x.classList.toggle('sel', x === ch));
    $('#regPin .dot').style.background = regState.color;
  }));

  // 지도 탭 → 위치 지정
  $('#regMap').addEventListener('click', (e) => {
    if (e.target.closest('.pin')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    regState.lng = BBOX.minLng + px * (BBOX.maxLng - BBOX.minLng);
    regState.lat = BBOX.minLat + (1 - py) * (BBOX.maxLat - BBOX.minLat);
    const pin = $('#regPin');
    pin.style.left = px * 100 + '%'; pin.style.top = py * 100 + '%';
    e.currentTarget.parentElement.querySelector('.muted')?.remove();
    view.querySelector('#regMap').insertAdjacentHTML('afterend',
      `<p class="muted" style="margin:0 0 16px">📍 위도 ${regState.lat.toFixed(4)}, 경도 ${regState.lng.toFixed(4)}</p>`);
  });

  // AI 코무늬 분석
  $('#aiBtn').addEventListener('click', runNoseMatch);

  // 등록 제출
  $('#rSubmit').addEventListener('click', async () => {
    const name = $('#rName').value.trim();
    if (!name) return toast('이름을 입력해 주세요.');
    try {
      await api('/cats', {
        method: 'POST',
        body: JSON.stringify({
          name, lat: regState.lat, lng: regState.lng,
          colorTag: regState.color, gender: $('#rGender').value,
          note: $('#rNote').value.trim(),
        }),
      });
      toast(`🐾 '${name}' 등록 완료! 지도에 추가됐어요.`);
      switchTab('map');
    } catch (e) { toast(e.message); }
  });
}

async function runNoseMatch() {
  const box = $('#aiBox'), result = $('#aiResult'), btn = $('#aiBtn');
  box.classList.add('scanning');
  btn.disabled = true; btn.textContent = '분석 중…';
  result.innerHTML = `<div class="ai-result" style="background:var(--ink)">
    <span class="muted">코무늬 패턴을 추출하고 등록된 개체와 비교하고 있어요…</span></div>`;
  try {
    const r = await api('/ai/nose-match', {
      method: 'POST', body: JSON.stringify({ imageHint: Date.now() + Math.random() }),
    });
    const pct = Math.round(r.confidence * 100);
    if (r.result === 'matched') {
      result.innerHTML = `<div class="ai-result matched">
        <strong>🎯 일치하는 개체 발견</strong><br>${r.message}
        <div class="confidence-bar"><i style="width:${pct}%"></i></div>
        <div class="muted" style="margin-top:6px">유사도 ${pct}% · ${r.cat.name} (${r.cat.nosePrintId})</div>
      </div>`;
      regState.aiChecked = true;
    } else {
      result.innerHTML = `<div class="ai-result new">
        <strong>✨ 신규 개체</strong><br>${r.message}
        <div class="confidence-bar"><i style="width:${pct}%"></i></div>
        <div class="muted" style="margin-top:6px">신규 가능성 ${pct}% · 코무늬 ID ${r.nosePrintId}</div>
      </div>`;
      regState.aiChecked = true;
    }
  } catch (e) {
    result.innerHTML = `<div class="ai-result" style="border:1px solid var(--rose)">${e.message}</div>`;
  } finally {
    box.classList.remove('scanning');
    btn.disabled = false; btn.textContent = '📷 다시 분석하기';
  }
}

// ═════════════════════════════════════════════
//  TAB: 돌봄 (TNR · 건강 · 구조 · 후원)
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
      <div class="row-between" style="margin-bottom:8px"><strong>TNR 진행 현황</strong><span class="muted">${tnrDone}/${cats.length}마리</span></div>
      <div class="donut-wrap">
        <div class="donut" style="background:conic-gradient(var(--mint) ${tnrRate}%, var(--line) 0)">
          <span class="pct">${tnrRate}%</span>
        </div>
        <div style="flex:1">
          <p class="muted" style="margin:0 0 8px">중성화율이 높을수록 개체 수가 안정적으로 관리돼요.</p>
          ${cats.filter(c => !c.neutered).slice(0, 3).map(c =>
    `<div class="pill-row"><span class="badge b-watch">${c.name} · TNR 필요</span></div>`).join('') || '<span class="badge b-tnr">모두 완료 ✓</span>'}
        </div>
      </div>
    </div>

    <div class="eyebrow">🚑 구조 요청</div>
    <button class="btn btn-rose" id="newRescue" style="margin-bottom:12px">+ 구조 요청 등록</button>
    ${rescues.map(r => `<div class="list-item">
      <div class="li-top"><span class="li-title">${r.title}</span>
        <span class="status-pill ${r.status === 'open' ? 's-open' : 's-done'}">${r.status === 'open' ? '도움 필요' : '완료'}</span></div>
      <div class="li-desc">${r.desc || ''} <br><span class="muted">${r.by} · ${ago(r.at)}</span></div>
      ${r.status === 'open' ? `<button class="btn btn-ghost btn-sm" data-resolve="${r.id}" style="margin-top:10px">해결 완료로 표시</button>` : ''}
    </div>`).join('')}

    <div class="eyebrow">💛 후원 현황</div>
    <div class="card pad-lg">
      <div class="row-between"><strong>누적 후원금</strong><span style="color:var(--amber);font-weight:900;font-size:20px">${won(don.total)}</span></div>
      <div class="divider"></div>
      ${don.items.slice(0, 4).map(d => `<div class="feed-item">
        <div class="feed-body"><div class="who">${d.donor} <span class="muted">· ${d.target}</span></div></div>
        <div style="color:var(--amber);font-weight:700">${won(d.amount)}</div>
      </div>`).join('')}
      <button class="btn btn-primary" id="newDonation" style="margin-top:12px">💛 후원하기</button>
    </div>
  `;

  $('#newRescue').addEventListener('click', () => openModal(`
    <div style="font-size:18px;font-weight:900;margin-bottom:4px">🚑 구조 요청</div>
    <p class="muted">위급한 고양이를 동네에 알려요.</p>
    <label class="fld">제목 *</label>
    <input class="in" id="rsTitle" placeholder="예: 회나무로 다친 고양이" />
    <label class="fld">상황 설명</label>
    <textarea class="in" id="rsDesc" placeholder="위치, 상태, 도움 요청 내용을 적어주세요."></textarea>
    <button class="btn btn-rose" id="rsSubmit" style="margin-top:16px">요청 등록</button>
  `));

  $('#newDonation').addEventListener('click', () => openModal(`
    <div style="font-size:18px;font-weight:900;margin-bottom:4px">💛 후원하기</div>
    <p class="muted">사료와 TNR 비용에 쓰여요. (시연용)</p>
    <label class="fld">후원자명</label>
    <input class="in" id="dDonor" placeholder="익명 가능" />
    <label class="fld">후원처</label>
    <select class="in" id="dTarget"><option>사료 후원</option><option>TNR 비용</option><option>치료비</option></select>
    <label class="fld">금액</label>
    <input class="in" id="dAmount" type="number" placeholder="10000" />
    <button class="btn btn-primary" id="dSubmit" style="margin-top:16px">후원하기</button>
  `));

  // 이벤트 위임 (모달 내부 버튼은 동적 바인딩)
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
  }, { once: false });

  view.querySelectorAll('[data-resolve]').forEach(b =>
    b.addEventListener('click', async () => {
      await api('/rescues/' + b.dataset.resolve, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
      toast('✓ 구조 완료로 표시했어요.'); renderCare();
    }));
}

// ═════════════════════════════════════════════
//  TAB: 현황 (지자체/B2G 대시보드)
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
      <div class="stat"><div class="num amber">${d.totalCats}</div><div class="lbl">관리 중인 개체</div></div>
      <div class="stat"><div class="num mint">${d.tnrRate}%</div><div class="lbl">TNR 중성화율</div></div>
      <div class="stat"><div class="num">${d.feedingsToday}</div><div class="lbl">오늘 급식 횟수</div></div>
      <div class="stat"><div class="num rose">${d.careGap}</div><div class="lbl">돌봄 공백 개체</div></div>
    </div>

    <div class="eyebrow">최근 7일 급식 추이</div>
    <div class="card">
      <div class="bars">
        ${d.feedingTrend.map(t => `<div class="bar-col">
          <span class="v">${t.count}</span>
          <div class="bar" style="height:${(t.count / maxBar) * 100}%"></div>
          <span class="l">${t.label}</span>
        </div>`).join('')}
      </div>
    </div>

    <div class="eyebrow">개체 건강 분포</div>
    <div class="card">
      <div style="display:flex;height:14px;border-radius:99px;overflow:hidden;margin-bottom:10px">
        <div style="flex:${hb.good || 0.01};background:var(--mint)"></div>
        <div style="flex:${hb.watch || 0.01};background:var(--amber)"></div>
        <div style="flex:${hb.unknown || 0.01};background:var(--line)"></div>
      </div>
      <div class="legend" style="padding:0">
        <span><i style="background:var(--mint)"></i>양호 ${hb.good}</span>
        <span><i style="background:var(--amber)"></i>관찰 ${hb.watch}</span>
        <span><i style="background:var(--line)"></i>미상 ${hb.unknown}</span>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="num rose">${d.openRescues}</div><div class="lbl">진행 중 구조요청</div></div>
      <div class="stat"><div class="num amber">${won(d.donationTotal)}</div><div class="lbl">누적 후원금</div></div>
    </div>

    <div class="card" style="margin-top:12px;border-color:var(--amber)">
      <strong style="color:var(--amber)">📑 데이터 내보내기 (B2G)</strong>
      <p class="muted" style="margin:8px 0 0">지자체 담당 부서로 월간 개체·TNR·민원 데이터를 CSV로 제공하는 유료 서비스로 확장됩니다.</p>
    </div>
  `;
  // 막대 진입 애니메이션
  requestAnimationFrame(() => view.querySelectorAll('.bar').forEach(b => {
    const h = b.style.height; b.style.height = '0'; requestAnimationFrame(() => b.style.height = h);
  }));
}

// ═════════════════════════════════════════════
//  탭 라우팅
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

document.getElementById('tabbar').addEventListener('click', (e) => {
  const t = e.target.closest('.tab'); if (t) switchTab(t.dataset.tab);
});

// 서비스 소개
$('#aboutBtn').addEventListener('click', () => openModal(`
  <div style="text-align:center">
    <div style="font-size:40px">🐾</div>
    <div style="font-size:20px;font-weight:900;margin:6px 0">냥살핌</div>
    <p class="muted" style="line-height:1.7">동네 길고양이 돌봄을 효율적으로 관리하는 통합 플랫폼이에요.
    캣맘·캣대디가 따로 돌보며 생기는 <b style="color:var(--cream)">중복 급식</b>과
    <b style="color:var(--cream)">돌봄 공백</b>을 줄이고,
    AI 코무늬 인식으로 개체를 식별해 정확한 데이터를 만들어요.</p>
    <div class="divider"></div>
    <p class="muted" style="font-size:11px">제23회 특성화고교생 사장되기(Be the CEOs) 창업대회<br>박시후 · 서울디지텍고등학교 인공지능소프트웨어과</p>
  </div>
`));

// 시작
switchTab('map');
