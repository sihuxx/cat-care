// ─────────────────────────────────────────────────────────────
//  냥살핌 — 데이터베이스 (SQLite, 영구 저장)
//  DATA_DIR 환경변수로 저장 위치 지정 (Render 영구 디스크 마운트용)
//  로컬에서는 server/data/nyangsalpim.db 에 저장됩니다.
// ─────────────────────────────────────────────────────────────
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 저장 폴더 결정 (배포 시 DATA_DIR=/var/data 같은 영구 디스크 경로)
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'nyangsalpim.db'));
db.pragma('journal_mode = WAL');   // 동시성·안정성 향상
db.pragma('foreign_keys = ON');

// ── 스키마 생성 ──
db.exec(`
  CREATE TABLE IF NOT EXISTS cats (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    colorTag      TEXT,
    gender        TEXT,
    neutered      INTEGER DEFAULT 0,
    lat           REAL,
    lng           REAL,
    note          TEXT,
    nosePrintId   TEXT,
    health        TEXT DEFAULT 'unknown',
    photo         TEXT,
    registeredAt  TEXT
  );

  CREATE TABLE IF NOT EXISTS feedings (
    id      TEXT PRIMARY KEY,
    catId   TEXT NOT NULL,
    by      TEXT,
    at      TEXT,
    memo    TEXT,
    FOREIGN KEY (catId) REFERENCES cats(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_feedings_cat ON feedings(catId);
  CREATE INDEX IF NOT EXISTS idx_feedings_at  ON feedings(at);

  CREATE TABLE IF NOT EXISTS rescues (
    id      TEXT PRIMARY KEY,
    title   TEXT NOT NULL,
    "desc"  TEXT,
    lat     REAL,
    lng     REAL,
    status  TEXT DEFAULT 'open',
    by      TEXT,
    at      TEXT
  );

  CREATE TABLE IF NOT EXISTS donations (
    id      TEXT PRIMARY KEY,
    donor   TEXT,
    amount  INTEGER,
    target  TEXT,
    at      TEXT
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ── 최초 1회만 시드 데이터 삽입 (이미 시드했으면 건너뜀) ──
function seedOnce() {
  const seeded = db.prepare(`SELECT value FROM meta WHERE key='seeded'`).get();
  if (seeded) return;

  const insertCat = db.prepare(`INSERT INTO cats
    (id,name,colorTag,gender,neutered,lat,lng,note,nosePrintId,health,registeredAt)
    VALUES (@id,@name,@colorTag,@gender,@neutered,@lat,@lng,@note,@nosePrintId,@health,@registeredAt)`);
  const insertFeed = db.prepare(`INSERT INTO feedings (id,catId,by,at,memo)
    VALUES (@id,@catId,@by,@at,@memo)`);
  const insertRescue = db.prepare(`INSERT INTO rescues (id,title,"desc",lat,lng,status,by,at)
    VALUES (@id,@title,@desc,@lat,@lng,@status,@by,@at)`);
  const insertDon = db.prepare(`INSERT INTO donations (id,donor,amount,target,at)
    VALUES (@id,@donor,@amount,@target,@at)`);

  const base = [
    { name: '치즈',   color: '#E8A93C', lat: 37.5388, lng: 126.9905, gender: 'M', neutered: 1, note: '회나무로 편의점 앞. 사람을 잘 따름.' },
    { name: '까망',   color: '#2B2B33', lat: 37.5401, lng: 126.9922, gender: 'F', neutered: 0, note: '경계심 많음. TNR 필요.' },
    { name: '삼색이', color: '#C77B52', lat: 37.5375, lng: 126.9889, gender: 'F', neutered: 1, note: '주차장 구역 대장묘.' },
    { name: '회색이', color: '#8C8C99', lat: 37.5412, lng: 126.9938, gender: 'M', neutered: 0, note: '다리 살짝 절뚝임. 관찰 중.' },
    { name: '하양',   color: '#EDEAE2', lat: 37.5360, lng: 126.9871, gender: 'F', neutered: 1, note: '카페 뒷골목. 새끼 2마리 동반.' },
  ];

  const tx = db.transaction(() => {
    base.forEach((c, i) => {
      const id = uid();
      insertCat.run({
        id, name: c.name, colorTag: c.color, gender: c.gender,
        neutered: c.neutered, lat: c.lat, lng: c.lng, note: c.note,
        nosePrintId: 'NP-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        health: c.neutered ? 'good' : 'watch',
        registeredAt: now(),
      });
      if (i % 2 === 0) {
        insertFeed.run({
          id: uid(), catId: id, by: '캣맘 김',
          at: new Date(Date.now() - (i + 1) * 3600_000 * 5).toISOString(),
          memo: '사료 한 컵, 물 교체',
        });
      }
    });
    insertRescue.run({
      id: uid(), title: '회나무로 12길 다친 고양이 신고',
      desc: '뒷다리를 절뚝이는 회색 고양이. 가까운 분 확인 부탁드려요.',
      lat: 37.5395, lng: 126.9911, status: 'open', by: '주민 제보', at: now(),
    });
    insertDon.run({ id: uid(), donor: '익명', amount: 30000, target: '사료 후원', at: now() });
    insertDon.run({ id: uid(), donor: '용산캣맘모임', amount: 100000, target: 'TNR 비용', at: now() });

    db.prepare(`INSERT INTO meta (key,value) VALUES ('seeded',?)`).run(now());
  });
  tx();
}
seedOnce();

export { db, uid, now };
