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
  const { name, lat, lng, colorTag, gender, note, photo } = req.body || {};
  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: '이름과 위치(지도 탭)는 필수입니다.' });
  }
  const cat = {
    id: uid(),
    name: String(name).slice(0, 30),
    colorTag: colorTag || '#E8A93C',
    gender: gender || 'U',
    neutered: 0,
    lat: Number(lat), lng: Number(lng),
    note: note ? String(note).slice(0, 200) : '',
    nosePrintId: 'NP-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    health: 'unknown',
    photo: photo || null,
    registeredAt: now(),
  };
  db.prepare(`INSERT INTO cats
    (id,name,colorTag,gender,neutered,lat,lng,note,nosePrintId,health,photo,registeredAt)
    VALUES (@id,@name,@colorTag,@gender,@neutered,@lat,@lng,@note,@nosePrintId,@health,@photo,@registeredAt)`
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
//  API: AI 코무늬 인식 (모의 엔진)
// ═════════════════════════════════════════════════════════════
app.post('/api/ai/nose-match', (req, res) => {
  const { imageHint } = req.body || {};
  const h = crypto.createHash('sha256').update((imageHint || '') + Date.now()).digest();
  const roll = h[0] / 255;
  const cats = db.prepare(`SELECT id,name,nosePrintId,colorTag FROM cats`).all();

  setTimeout(() => {
    if (roll < 0.6 && cats.length) {
      const cat = cats[h[1] % cats.length];
      const confidence = 0.82 + (h[2] / 255) * 0.16;
      res.json({
        result: 'matched',
        confidence: Math.round(confidence * 1000) / 1000,
        cat,
        message: `이미 등록된 '${cat.name}'(으)로 추정됩니다. 중복 등록을 방지했어요.`,
      });
    } else {
      const confidence = 0.55 + (h[3] / 255) * 0.2;
      res.json({
        result: 'new',
        confidence: Math.round(confidence * 1000) / 1000,
        nosePrintId: 'NP-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        message: '신규 개체로 보입니다. 새로 등록할 수 있어요.',
      });
    }
  }, 900);
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
