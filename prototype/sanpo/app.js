// えびす時空さんぽ（試作）
// 1. 地図で恵比寿さんまで歩く → 2. 着いたら、その場所の水害 → 3. そこから見えた空
// 画面の切り替えは URL のハッシュで行う（#/ が地図、#/spot/<id> が恵比寿さんの前）。

import { initSky, showSky, stopSky } from './sky.js';

const DATA_URL = '../../planning/data/ebisu-demo.json';
// この距離（m）まで近づいたら「着いた」とみなす。GPS の誤差を見込んで広めにとる
const ARRIVE_RADIUS_M = 40;
// 浸水深の帯を描くときの目盛りの上限（m）
const DEPTH_SCALE_MAX = 3.5;
// 浸水深の比べ物（大人の背の高さ）
const PERSON_HEIGHT_M = 1.7;

const $ = (id) => document.getElementById(id);

const state = {
  data: null,
  here: null, // { lat, lng, accuracy }
  map: null,
  floodLayer: null,
  hereMarker: null,
  spotId: null,
};

// ---------- 距離 ----------

function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const formatDistance = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);

// ---------- 地図 ----------

function setupMap() {
  const { data } = state;
  const map = L.map('map', { zoomControl: true, attributionControl: true });
  state.map = map;

  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    maxZoom: 18,
    maxNativeZoom: 18,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
  }).addTo(map);

  state.floodLayer = L.tileLayer(
    'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png', {
      maxZoom: 18,
      maxNativeZoom: 17,
      opacity: 0.6,
      attribution: '<a href="https://disaportal.gsi.go.jp/hazardmapportal/hazardmap/copyright/opendata.html">ハザードマップポータルサイト</a>',
    },
  );
  $('flood-layer').addEventListener('change', (e) => {
    if (e.target.checked) state.floodLayer.addTo(map);
    else state.floodLayer.remove();
  });

  const ordered = data.route.map((id) => data.ebisu.find((e) => e.id === id));
  L.polyline(ordered.map((e) => [e.lat, e.lng]), { className: 'route-line' }).addTo(map);

  ordered.forEach((e, i) => {
    const icon = L.divIcon({
      className: 'map-pin',
      html: `<span>${i + 1}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    L.marker([e.lat, e.lng], { icon, title: e.name, alt: `${i + 1}. ${e.name}` })
      .addTo(map)
      .on('click', () => focusSpot(e.id));
  });

  map.fitBounds(L.latLngBounds(ordered.map((e) => [e.lat, e.lng])).pad(0.3), { maxZoom: 17 });
  new ResizeObserver(() => map.invalidateSize()).observe($('map'));
}

function focusSpot(id) {
  const item = document.querySelector(`[data-spot="${id}"]`);
  if (!item) return;
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  item.querySelector('button')?.focus({ preventScroll: true });
}

// ---------- 恵比寿さんの一覧 ----------

function renderSpotList() {
  const { data, here } = state;
  const list = $('spot-list');
  list.replaceChildren();

  data.route.forEach((id, i) => {
    const e = data.ebisu.find((x) => x.id === id);
    const d = here ? distanceM(here, e) : null;
    const near = d != null && d <= ARRIVE_RADIUS_M;

    const li = document.createElement('li');
    li.className = 'card spot-item';
    li.dataset.spot = id;

    const head = document.createElement('div');
    head.className = 'spot-item-head';
    const num = document.createElement('span');
    num.className = 'spot-num';
    num.textContent = String(i + 1);
    num.setAttribute('aria-hidden', 'true');
    const name = document.createElement('h3');
    name.className = 'spot-name';
    name.textContent = e.name;
    head.append(num, name);

    const meta = document.createElement('p');
    meta.className = 'spot-meta';
    meta.textContent = [
      `${e.builtYear}年から`,
      e.area,
      d != null ? (near ? 'すぐそば' : `ここから${formatDistance(d)}`) : null,
    ].filter(Boolean).join('・');

    const landmark = document.createElement('p');
    landmark.className = 'spot-landmark';
    landmark.textContent = e.landmark;

    const btn = document.createElement('button');
    btn.type = 'button';
    if (near) {
      btn.className = 'btn btn-primary';
      btn.textContent = '着いた';
    } else {
      // 会場でのデモ用。現地に行かなくても、その場所にいることにして進める
      btn.className = 'btn btn-secondary';
      btn.textContent = 'ここに着いたことにする（デモ）';
    }
    btn.addEventListener('click', () => { location.hash = `#/spot/${id}`; });

    li.append(head, meta, landmark, btn);
    list.append(li);
  });
}

// ---------- 現在地 ----------

function setupGeolocation() {
  const status = $('geo-status');
  if (!('geolocation' in navigator)) {
    status.textContent = 'この端末では現在地を使えません。「着いたことにする」で進められます。';
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const first = !state.here;
      state.here = { lat, lng, accuracy };
      if (!state.hereMarker) {
        state.hereMarker = L.circleMarker([lat, lng], { className: 'here-marker', radius: 8 }).addTo(state.map);
      } else {
        state.hereMarker.setLatLng([lat, lng]);
      }
      status.textContent = `現在地を表示しています（誤差 ${Math.round(accuracy)}m）`;
      // 恵比寿さんから遠い場所（会場の外など）にいるときは、地図を動かさない
      if (first) {
        const nearest = Math.min(...state.data.ebisu.map((e) => distanceM(state.here, e)));
        if (nearest < 2000) state.map.setView([lat, lng], Math.max(state.map.getZoom(), 17));
      }
      renderSpotList();
    },
    () => {
      status.textContent = '現在地が分かりません。「着いたことにする」で進められます。';
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
}

// ---------- 恵比寿さんの前：水 ----------

// "0.5〜3m" や "0.5m未満" を [下限, 上限] に直す
function parseDepth(text) {
  if (!text) return null;
  const range = text.match(/([\d.]+)\s*〜\s*([\d.]+)m/);
  if (range) return [Number(range[1]), Number(range[2])];
  const under = text.match(/([\d.]+)m未満/);
  if (under) return [0, Number(under[1])];
  const over = text.match(/([\d.]+)m以上/);
  if (over) return [Number(over[1]), DEPTH_SCALE_MAX];
  return null;
}

function renderDepth(ebisu) {
  const box = $('depth');
  box.replaceChildren();
  const rows = [
    ['想定最大規模の大雨', ebisu.water.floodMax, '1000年に1回程度'],
    ['計画規模の大雨', ebisu.water.floodPlanned, '川の整備の目安'],
  ];
  for (const [label, text, note] of rows) {
    const range = parseDepth(text);
    const row = document.createElement('div');
    row.className = 'depth-row';

    const head = document.createElement('p');
    head.className = 'depth-label';
    const strong = document.createElement('strong');
    strong.textContent = text ?? '想定なし';
    head.append(`${label}（${note}）：`, strong);

    const track = document.createElement('div');
    track.className = 'depth-track';
    track.setAttribute('aria-hidden', 'true');
    if (range) {
      const bar = document.createElement('span');
      bar.className = range[1] > 0.5 ? 'depth-bar depth-bar-deep' : 'depth-bar';
      bar.style.left = `${(range[0] / DEPTH_SCALE_MAX) * 100}%`;
      bar.style.width = `${((Math.min(range[1], DEPTH_SCALE_MAX) - range[0]) / DEPTH_SCALE_MAX) * 100}%`;
      track.append(bar);
    }
    const person = document.createElement('span');
    person.className = 'depth-person';
    person.style.left = `${(PERSON_HEIGHT_M / DEPTH_SCALE_MAX) * 100}%`;
    track.append(person);

    row.append(head, track);
    box.append(row);
  }
  const scale = document.createElement('p');
  scale.className = 'depth-scale';
  scale.setAttribute('aria-hidden', 'true');
  scale.innerHTML = '<span>0m</span><span>大人の背の高さ</span><span>3.5m</span>';
  scale.children[1].style.left = `${(PERSON_HEIGHT_M / DEPTH_SCALE_MAX) * 100}%`;
  box.append(scale);
}

function renderTimeline(ebisu) {
  const list = $('flood-timeline');
  list.replaceChildren();
  const seen = state.data.floods.filter((f) => f.year >= ebisu.builtYear);
  for (const f of seen) {
    const li = document.createElement('li');
    const when = document.createElement('p');
    when.className = 'timeline-when';
    when.textContent = `${f.label}・建ってから${f.year - ebisu.builtYear}年後`;
    const name = document.createElement('p');
    name.className = 'timeline-name';
    name.textContent = f.name;
    const note = document.createElement('p');
    note.className = 'timeline-note';
    note.textContent = f.note;
    li.append(when, name, note);
    list.append(li);
  }
  if (!seen.length) {
    const li = document.createElement('li');
    li.textContent = '建ってから、大きな水害の記録はまだない';
    list.append(li);
  }
}

function renderSpot(ebisu) {
  const thisYear = new Date().getFullYear();
  $('spot-title').textContent = ebisu.name;
  $('spot-sub').textContent = `${ebisu.builtLabel}から${thisYear - ebisu.builtYear}年、${ebisu.area}に立っている`;
  $('spot-story').textContent = ebisu.history.story;
  renderDepth(ebisu);
  $('water-story').textContent = ebisu.water.story;
  renderTimeline(ebisu);
  document.title = `${ebisu.name}｜えびす時空さんぽ（試作）`;
}

// ---------- 画面の切り替え ----------

function route() {
  const m = location.hash.match(/^#\/spot\/([\w-]+)/);
  const ebisu = m && state.data.ebisu.find((e) => e.id === m[1]);
  const showSpot = Boolean(ebisu);

  $('view-map').hidden = showSpot;
  $('view-spot').hidden = !showSpot;

  if (showSpot) {
    if (state.spotId !== ebisu.id) {
      state.spotId = ebisu.id;
      renderSpot(ebisu);
      showSky(ebisu);
    }
    window.scrollTo(0, 0);
    $('spot-title').setAttribute('tabindex', '-1');
    $('spot-title').focus({ preventScroll: true });
  } else {
    stopSky();
    document.title = 'えびす時空さんぽ（試作）';
    state.map.invalidateSize();
    if (state.spotId) focusSpot(state.spotId);
  }
}

function setupToSky() {
  // 「この場所から見えた空へ」はハッシュを変えずにスクロールだけする（画面の切り替えと混ざらないように）
  $('to-sky').addEventListener('click', (e) => {
    e.preventDefault();
    $('sky-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('sky-title').setAttribute('tabindex', '-1');
    $('sky-title').focus({ preventScroll: true });
  });
}

// ---------- 起動 ----------

async function main() {
  state.data = await fetch(DATA_URL).then((r) => r.json());
  setupMap();
  renderSpotList();
  setupGeolocation();
  setupToSky();
  initSky();
  window.addEventListener('hashchange', route);
  route();
}

main().catch((err) => {
  console.error(err);
  $('geo-status').textContent = 'データを読み込めませんでした。リポジトリの直下でローカルサーバーを起動して開いてください。';
});
