// ─────────────────────────────────────────────────────────────
//  냥살핌 (Nyangsalpim) — 백엔드 API 서버 (SQLite 영구 저장)
//  길고양이 돌봄 통합 관리 플랫폼
//  제23회 특성화고교생 사장되기(Be the CEOs) 창업대회
//  박시후 · 서울디지텍고등학교 인공지능소프트웨어과
// ─────────────────────────────────────────────────────────────
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { db, uid, now } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '12mb' }));
app.use(express.static(join(__dirname, '..', 'public')));

app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`${new Date().toLocaleTimeString('ko-KR')}  ${req.method} ${req.path}`);
  }
  next();
});

// ── 유틸 ──
const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600_000;
const lastFeedingStmt = db.prepare(
  `SELECT * FROM feedings WHERE catId=? ORDER BY at DESC LIMIT 1`);
const lastFeeding = (catId) => lastFeedingStmt.get(catId) || null;

// ── 코무늬 해시(pHash) 비교용: 두 16진수 해시의 해밍 거리 ──
// 클라이언트가 보낸 64비트 perceptual hash(16자리 hex)를 비트 단위로 비교한다.
function hammingHex(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); // 4비트씩 XOR
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

// ═════════════════════════════════════════════════════════════
//  API: 고양이 (Cats)
// ═════════════════════════════════════════════════════════════
app.get('/api/cats', (_req, res) => {
  const cats = db.prepare(`SELECT * FROM cats ORDER BY registeredAt`).all();
  const enriched = cats.map(c => {
    const lf = lastFeeding(c.id);
    const hrs = lf ? hoursSince(lf.at) : null;
    return {
      ...c,
      neutered: !!c.neutered,
      lastFeedingAt: lf ? lf.at : null,
      hoursSinceFeeding: hrs === null ? null : Math.round(hrs * 10) / 10,
      careGap: hrs === null ? true : hrs > 24,
    };
  });
  res.json(enriched);
});

app.get('/api/cats/:id', (req, res) => {
  const cat = db.prepare(`SELECT * FROM cats WHERE id=?`).get(req.params.id);
  if (!cat) return res.status(404).json({ error: '고양이를 찾을 수 없습니다.' });
  const feedings = db.prepare(
    `SELECT * FROM feedings WHERE catId=? ORDER BY at DESC`).all(cat.id);
  res.json({ ...cat, neutered: !!cat.neutered, feedings });
});

app.post('/api/cats', (req, res) => {
  const { name, lat, lng, colorTag, gender, note, photo, noseHash } = req.body || {};
  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: '이름과 위치(지도 탭)는 필수입니다.' });
  }
  const cat = {
    id: uid(),
    name: String(name).slice(0, 30),
    colorTag: colorTag || '#E8A23C',
    gender: gender || 'U',
    neutered: 0,
    lat: Number(lat), lng: Number(lng),
    note: note ? String(note).slice(0, 200) : '',
    nosePrintId: 'NP-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    noseHash: (typeof noseHash === 'string' && /^[0-9a-f]{16}$/i.test(noseHash)) ? noseHash.toLowerCase() : null,
    health: 'unknown',
    photo: photo || null,
    registeredAt: now(),
  };
  db.prepare(`INSERT INTO cats
    (id,name,colorTag,gender,neutered,lat,lng,note,nosePrintId,noseHash,health,photo,registeredAt)
    VALUES (@id,@name,@colorTag,@gender,@neutered,@lat,@lng,@note,@nosePrintId,@noseHash,@health,@photo,@registeredAt)`
  ).run(cat);
  res.status(201).json({ ...cat, neutered: false });
});

app.patch('/api/cats/:id', (req, res) => {
  const cat = db.prepare(`SELECT * FROM cats WHERE id=?`).get(req.params.id);
  if (!cat) return res.status(404).json({ error: '고양이를 찾을 수 없습니다.' });
  const { neutered, health, note } = req.body || {};
  const next = {
    neutered: neutered !== undefined ? (neutered ? 1 : 0) : cat.neutered,
    health: health || cat.health,
    note: note !== undefined ? String(note).slice(0, 200) : cat.note,
    id: cat.id,
  };
  db.prepare(`UPDATE cats SET neutered=@neutered, health=@health, note=@note WHERE id=@id`).run(next);
  const updated = db.prepare(`SELECT * FROM cats WHERE id=?`).get(cat.id);
  res.json({ ...updated, neutered: !!updated.neutered });
});

// ═════════════════════════════════════════════════════════════
//  API: 급식 체크인
// ═════════════════════════════════════════════════════════════
app.post('/api/cats/:id/feed', (req, res) => {
  const cat = db.prepare(`SELECT * FROM cats WHERE id=?`).get(req.params.id);
  if (!cat) return res.status(404).json({ error: '고양이를 찾을 수 없습니다.' });

  const lf = lastFeeding(cat.id);
  const recentlyFed = lf && hoursSince(lf.at) < 3;

  const feeding = {
    id: uid(), catId: cat.id,
    by: (req.body && req.body.by) ? String(req.body.by).slice(0, 20) : '나',
    at: now(),
    memo: (req.body && req.body.memo) ? String(req.body.memo).slice(0, 100) : '급식 완료',
  };
  db.prepare(`INSERT INTO feedings (id,catId,by,at,memo)
    VALUES (@id,@catId,@by,@at,@memo)`).run(feeding);

  res.status(201).json({
    feeding,
    warnedDuplicate: !!recentlyFed,
    lastBy: recentlyFed ? lf.by : null,
    lastAt: recentlyFed ? lf.at : null,
  });
});

app.get('/api/feedings', (_req, res) => {
  const rows = db.prepare(`
    SELECT f.*, c.name AS catName
    FROM feedings f LEFT JOIN cats c ON c.id=f.catId
    ORDER BY f.at DESC LIMIT 30`).all();
  res.json(rows);
});

// ═════════════════════════════════════════════════════════════
//  API: AI 코무늬 인식 (perceptual hash 기반 이미지 유사도 비교)
//  클라이언트가 사진을 32x32 흑백으로 줄여 만든 64비트 pHash(16자리 hex)를 보내면,
//  등록된 고양이들의 noseHash와 해밍 거리로 비교해 가장 비슷한 개체를 찾는다.
//  ── 한계: 실제 '코무늬' 분석이 아니라 사진 전체의 패턴 유사도 비교(프로토타입).
// ═════════════════════════════════════════════════════════════
app.post('/api/ai/nose-match', (req, res) => {
  const { hash } = req.body || {};

  // 해시가 없으면(사진 미첨부) 비교 불가 → 신규로 처리
  if (typeof hash !== 'string' || !/^[0-9a-f]{16}$/i.test(hash)) {
    return res.status(400).json({ error: '사진에서 코무늬 패턴을 추출하지 못했어요. 다시 시도해 주세요.' });
  }
  const q = hash.toLowerCase();

  // noseHash가 등록된 고양이들과 비교
  const cats = db.prepare(
    `SELECT id,name,nosePrintId,colorTag,noseHash FROM cats WHERE noseHash IS NOT NULL`).all();

  let best = null;
  for (const c of cats) {
    const d = hammingHex(q, c.noseHash);
    if (!best || d < best.dist) best = { cat: c, dist: d };
  }

  // 64비트 중 다른 비트 수(distance)를 유사도로 환산 (0=완전동일, 64=정반대)
  // 임계값: 12비트 이하 차이면 '같은 개체'로 판단 (시연 기준값)
  const THRESHOLD = 12;

  setTimeout(() => {
    if (best && best.dist <= THRESHOLD) {
      const confidence = Math.max(0, 1 - best.dist / 64); // 0~1
      res.json({
        result: 'matched',
        confidence: Math.round(confidence * 1000) / 1000,
        distance: best.dist,
        cat: { id: best.cat.id, name: best.cat.name, nosePrintId: best.cat.nosePrintId, colorTag: best.cat.colorTag },
        message: `이미 등록된 '${best.cat.name}'(으)로 추정됩니다. 중복 등록을 방지했어요.`,
      });
    } else {
      // 가장 비슷한 게 있어도 임계값을 넘으면 신규로 판단
      const confidence = best ? Math.max(0, 1 - best.dist / 64) : 0.5;
      res.json({
        result: 'new',
        confidence: Math.round(confidence * 1000) / 1000,
        distance: best ? best.dist : null,
        nosePrintId: 'NP-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        message: cats.length
          ? '등록된 개체 중 일치하는 고양이가 없어요. 새로 등록할 수 있어요.'
          : '아직 비교할 개체가 없어요. 첫 등록이라면 그대로 등록하면 됩니다.',
      });
    }
  }, 700);
});

// ═════════════════════════════════════════════════════════════
//  API: 구조 요청
// ═════════════════════════════════════════════════════════════
app.get('/api/rescues', (_req, res) => {
  res.json(db.prepare(`SELECT * FROM rescues ORDER BY at DESC`).all());
});
app.post('/api/rescues', (req, res) => {
  const { title, desc, lat, lng } = req.body || {};
  if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });
  const r = {
    id: uid(), title: String(title).slice(0, 60),
    desc: desc ? String(desc).slice(0, 300) : '',
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
    status: 'open', by: '나', at: now(),
  };
  db.prepare(`INSERT INTO rescues (id,title,"desc",lat,lng,status,by,at)
    VALUES (@id,@title,@desc,@lat,@lng,@status,@by,@at)`).run(r);
  res.status(201).json(r);
});
app.patch('/api/rescues/:id', (req, res) => {
  const r = db.prepare(`SELECT * FROM rescues WHERE id=?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: '없는 요청입니다.' });
  const status = (req.body && req.body.status) || r.status;
  db.prepare(`UPDATE rescues SET status=? WHERE id=?`).run(status, r.id);
  res.json({ ...r, status });
});

// ═════════════════════════════════════════════════════════════
//  API: 후원
// ═════════════════════════════════════════════════════════════
app.get('/api/donations', (_req, res) => {
  const items = db.prepare(`SELECT * FROM donations ORDER BY at DESC`).all();
  const total = db.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM donations`).get().t;
  res.json({ total, items });
});
app.post('/api/donations', (req, res) => {
  const { donor, amount, target } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: '후원 금액을 확인해 주세요.' });
  const d = {
    id: uid(), donor: donor ? String(donor).slice(0, 20) : '익명',
    amount: Math.round(amt), target: target || '사료 후원', at: now(),
  };
  db.prepare(`INSERT INTO donations (id,donor,amount,target,at)
    VALUES (@id,@donor,@amount,@target,@at)`).run(d);
  res.status(201).json(d);
});

// ═════════════════════════════════════════════════════════════
//  API: 데이터 대시보드 (지자체/B2G)
// ═════════════════════════════════════════════════════════════
app.get('/api/dashboard', (_req, res) => {
  const cats = db.prepare(`SELECT * FROM cats`).all();
  const total = cats.length;
  const neutered = cats.filter(c => c.neutered).length;

  const careGap = cats.filter(c => {
    const lf = lastFeeding(c.id);
    return !lf || hoursSince(lf.at) > 24;
  }).length;

  const today = new Date().toDateString();
  const allFeedings = db.prepare(`SELECT at FROM feedings`).all();
  const feedingsToday = allFeedings.filter(f => new Date(f.at).toDateString() === today).length;

  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400_000);
    trend.push({
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      count: allFeedings.filter(f => new Date(f.at).toDateString() === day.toDateString()).length,
    });
  }

  const openRescues = db.prepare(`SELECT COUNT(*) AS n FROM rescues WHERE status='open'`).get().n;
  const donationTotal = db.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM donations`).get().t;

  res.json({
    totalCats: total,
    neutered,
    tnrRate: total ? Math.round((neutered / total) * 100) : 0,
    careGap,
    feedingsToday,
    openRescues,
    donationTotal,
    feedingTrend: trend,
    healthBreakdown: {
      good: cats.filter(c => c.health === 'good').length,
      watch: cats.filter(c => c.health === 'watch').length,
      unknown: cats.filter(c => c.health === 'unknown' || c.health === 'bad').length,
    },
  });
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('  🐾  냥살핌 서버가 실행되었습니다 (SQLite 영구 저장)');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log('  ──────────────────────────────────────');
  const n = db.prepare(`SELECT COUNT(*) AS n FROM cats`).get().n;
  console.log(`  등록된 길고양이: ${n}마리`);
  console.log('  종료하려면 Ctrl+C');
  console.log('');
});
