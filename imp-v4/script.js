/**
 * IMP Interactive Music Player — v1.5
 *
 * Changelog v1.5:
 * - BUGFIX: applyMetadataFromSearch scrolled wrong element
 * - BUGFIX: crossfadeToNext() correctly loads next track
 * - BUGFIX: Queue click no longer prematurely removes song
 * - BUGFIX: folderInput change event now handled correctly
 * - BUGFIX: Special characters in titles no longer break onclick handlers
 * - BUGFIX: isPlaying set synchronously before async play call
 * - BUGFIX: Duplicate modal closable via backdrop or Escape key
 * - BUGFIX: Gapless preload flag prevents repeated firing
 * - BUGFIX: setupTabDragAndDrop guard prevents duplicate listeners
 * - BUGFIX: Eye color always updated — prevents gray flash on state change
 * - BUGFIX: Eye CSS transition scoped — prevents gray interpolation
 * - IMPROVEMENT: Media Session API integration (OS-level media controls)
 * - IMPROVEMENT: Keyboard shortcut F to favorite / M to mute
 * - IMPROVEMENT: Prev button restarts track if >3s in
 * - IMPROVEMENT: Volume persisted to localStorage
 * - IMPROVEMENT: Canvas resizes correctly on window resize
 * - IMPROVEMENT: Preset notification de-duplicated
 */

// ============================================================================
// DOM REFERENCES
// ============================================================================

const audio           = document.getElementById('audio');
const fileInput       = document.getElementById('fileInput');
const folderInput     = document.getElementById('folderInput');
const volumeLevel     = document.getElementById('volumeLevel');
const centerBtn       = document.getElementById('centerBtn');
const eyeLeft         = document.getElementById('eyeLeft');
const eyeRight        = document.getElementById('eyeRight');
const mouthBars       = document.querySelectorAll('.mouth-bar');
const mouthContainer  = document.querySelector('.mouth');
const greenLight      = document.getElementById('greenLight');
const redLight        = document.getElementById('redLight');
const screen          = document.querySelector('.screen');
const audioLevelFill  = document.getElementById('audioLevelFill');
const audioLevelBar   = document.querySelector('.audio-level');
const trackTitle      = document.getElementById('trackTitle');
const trackInfo       = document.getElementById('trackInfo');
const progressRingFill = document.getElementById('progressRingFill');
const canvas          = document.getElementById('waveCanvas');
const ctx             = canvas.getContext('2d', { alpha: true, desynchronized: true });

// ============================================================================
// STATE
// ============================================================================

// Playback
let playlist          = [];
let originalPlaylist  = [];
let playQueue         = [];
let currentTrackIndex = 0;
let isPlaying         = false;
let volume            = parseInt(localStorage.getItem('impVolume') || '50');
let volumeTimeout     = null;
let shuffleMode       = false;
let repeatMode        = 'off'; // 'off' | 'all' | 'one'
let autoplayEnabled   = false;
let playbackSpeed     = 1.0;
let currentPreset     = 'flat';
let eqBands           = [0, 0, 0, 0, 0];

// Advanced playback
let gaplessEnabled        = true;
let crossfadeEnabled      = false;
let crossfadeDuration     = 3;
let normalizeEnabled      = false;
let replayGainEnabled     = false;
let fadeEffectsEnabled    = false;
let fadeDuration          = 2;
let loudnessEnabled       = false;
let nextAudio             = null;
let isCrossfading         = false;
let fadeInInterval        = null;
let fadeOutInterval       = null;
let gaplessPreloadFired   = false;

// Visuals
let animationsEnabled  = true;
let visualizerEnabled  = true;
let screenShakeEnabled = true;

// Animation state
let danceTimer         = 0;
let blinkTimer         = 0;
let isBlinking         = false;
let currentEmotion     = 'happy';
let eyeOffsetX         = 0;
let eyeOffsetY         = 0;
let mouthEnergy        = 0;
let currentPhoneme     = 'mm';
let lastPhonemeChange  = 0;
let lipSyncBenchmarkActive = false;
let lastEmotionChange  = 0;
let emotionLockDuration = 2000;
let idleState          = 'active';
let idleTimer          = 0;
let deepSleepTimer     = 0;
let lastInteractionTime = Date.now();
let swipeStartTime     = 0;

// Battery
let batteryLevel    = 100;
let isCharging      = false;
let batterySupported = false;

// Library
let currentLibraryView  = 'songs';
let librarySearchQuery  = '';
let tabOrder = ['songs', 'queue', 'albums', 'artists', 'genres', 'folders', 'favorites'];
let currentEditingSongUrl = null;

// Drag state
let draggedQueueIndex = null;
let draggedTab        = null;
let draggedTabIndex   = null;

// Audio graph
let audioCtx, analyser, source, gainNode;
let eq60, eq250, eq1k, eq4k, eq16k;

const dataArray = new Uint8Array(64);

// ============================================================================
// CONSTANTS
// ============================================================================

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma', '.opus', '.webm'];

const TAB_LABELS = {
  songs: 'Songs', albums: 'Albums', artists: 'Artists',
  genres: 'Genres', folders: 'Folders', queue: 'Queue', favorites: 'Favorites'
};

const EQ_PRESETS = {
  flat:       { name: '🎵 Flat',       emoji: '🎵', bands: [0,0,0,0,0],   color: '#6bb3e0', handStyle: 'normal',   bgGradient: 'linear-gradient(135deg,#0a0a0a,#1a1a2e)' },
  rock:       { name: '🤘 Rock',       emoji: '🤘', bands: [5,3,-2,3,5],  color: '#ff4444', handStyle: 'rock',     bgGradient: 'linear-gradient(135deg,#1a0a0a,#2e1a1a)' },
  pop:        { name: '🎤 Pop',        emoji: '🎤', bands: [2,4,3,2,3],   color: '#ff44ff', handStyle: 'peace',    bgGradient: 'linear-gradient(135deg,#1a0a1a,#2e1a2e)' },
  jazz:       { name: '🎷 Jazz',       emoji: '🎷', bands: [4,2,-1,2,4],  color: '#ffd700', handStyle: 'snap',     bgGradient: 'linear-gradient(135deg,#1a1a0a,#2e2e1a)' },
  classical:  { name: '🎻 Classical',  emoji: '🎻', bands: [4,3,-1,3,4],  color: '#9370db', handStyle: 'elegant',  bgGradient: 'linear-gradient(135deg,#0a0a1a,#1a1a2e)' },
  bass:       { name: '🔊 Bass Boost', emoji: '🔊', bands: [8,6,0,-2,2],  color: '#00ff88', handStyle: 'thumbsup', bgGradient: 'linear-gradient(135deg,#0a1a0a,#1a2e1a)' },
  electronic: { name: '⚡ Electronic', emoji: '⚡', bands: [6,3,0,3,6],   color: '#00ffff', handStyle: 'point',    bgGradient: 'linear-gradient(135deg,#0a1a1a,#1a2e2e)' }
};

const EMOTIONS = {
  sleeping: { width: 70, height: 4,  radiusLeft: '50% 50% 50% 50%/100% 100% 0% 0%', radiusRight: '50% 50% 50% 50%/100% 100% 0% 0%', opacity: 0.2, glow: 0.1 },
  bored:    { width: 65, height: 25, radiusLeft: '50% 50% 50% 50%/100% 100% 0% 0%', radiusRight: '50% 50% 50% 50%/100% 100% 0% 0%', opacity: 0.6, glow: 0.4 },
  curious:  { width: 60, height: 50, radiusLeft: '30% 70% 50% 50%/100% 100% 0% 0%', radiusRight: '70% 30% 50% 50%/100% 100% 0% 0%', opacity: 0.8, glow: 0.6 },
  content:  { width: 68, height: 42, radiusLeft: '50% 50% 50% 50%/100% 100% 0% 0%', radiusRight: '50% 50% 50% 50%/100% 100% 0% 0%', opacity: 1,   glow: 0.7 },
  happy:    { width: 70, height: 40, radiusLeft: '50% 50% 50% 50%/100% 100% 0% 0%', radiusRight: '50% 50% 50% 50%/100% 100% 0% 0%', opacity: 1,   glow: 0.8 },
  excited:  { width: 55, height: 55, radiusLeft: '50% 50% 50% 50%/100% 100% 0% 0%', radiusRight: '50% 50% 50% 50%/100% 100% 0% 0%', opacity: 1,   glow: 1   },
  grooving: { width: 65, height: 45, radiusLeft: '40% 60% 50% 50%/100% 100% 0% 0%', radiusRight: '60% 40% 50% 50%/100% 100% 0% 0%', opacity: 1,   glow: 0.9 },
  singing:  { width: 75, height: 38, radiusLeft: '50% 50% 50% 50%/100% 100% 0% 0%', radiusRight: '50% 50% 50% 50%/100% 100% 0% 0%', opacity: 1,   glow: 1   },
  focused:  { width: 65, height: 30, radiusLeft: '50% 50% 50% 50%/100% 100% 0% 0%', radiusRight: '50% 50% 50% 50%/100% 100% 0% 0%', opacity: 1,   glow: 0.8 },
  loving:   { width: 60, height: 45, radiusLeft: '50% 50% 0% 50%/60% 60% 0% 40%',   radiusRight: '50% 50% 50% 0%/60% 60% 40% 0%',   opacity: 1,   glow: 1.1 },
  hyped:    { width: 58, height: 58, radiusLeft: '50% 50% 50% 50%/100% 100% 0% 0%', radiusRight: '50% 50% 50% 50%/100% 100% 0% 0%', opacity: 1,   glow: 1.2 }
};

const PHONEME_DURATIONS = { aa: 150, ee: 120, oh: 180, mm: 100, ff: 90, ss: 100, rr: 130, dd: 110 };

// ============================================================================
// LIBRARY
// ============================================================================

const musicLibrary = {
  songs:    [],
  albums:   new Map(),
  artists:  new Map(),
  genres:   new Map(),
  folders:  new Map(),
  favorites: new Set(),
  metadata:  new Map()
};

function loadLibrary() {
  const saved = localStorage.getItem('impMusicLibrary');
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    musicLibrary.songs     = data.songs     || [];
    musicLibrary.favorites = new Set(data.favorites || []);
    if (data.metadata)  musicLibrary.metadata = new Map(data.metadata);
    if (data.tabOrder)  tabOrder = data.tabOrder;
    rebuildLibraryIndexes();
  } catch (e) {
    console.error('Error loading library:', e);
  }
}

function saveLibrary() {
  try {
    localStorage.setItem('impMusicLibrary', JSON.stringify({
      songs:    musicLibrary.songs,
      favorites: Array.from(musicLibrary.favorites),
      metadata:  Array.from(musicLibrary.metadata),
      tabOrder
    }));
  } catch (e) {
    console.warn('LocalStorage save failed (quota?):', e);
  }
}

function rebuildLibraryIndexes() {
  musicLibrary.albums.clear();
  musicLibrary.artists.clear();
  musicLibrary.genres.clear();
  musicLibrary.folders.clear();

  for (const song of musicLibrary.songs) {
    const meta   = musicLibrary.metadata.get(song.url) || {};
    const album  = meta.album  || 'Unknown Album';
    const artist = meta.artist || 'Unknown Artist';
    const genre  = meta.genre  || 'Unknown';
    const folder = meta.folder || 'Root';

    appendToMapList(musicLibrary.albums,  album,  song);
    appendToMapList(musicLibrary.artists, artist, song);
    appendToMapList(musicLibrary.genres,  genre,  song);
    appendToMapList(musicLibrary.folders, folder, song);
  }
}

function appendToMapList(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function addFilesToLibrary(files) {
  let processed = 0;
  const total = files.length;

  for (const file of files) {
    const song = {
      file,
      name: file.name.replace(/\.[^/.]+$/, ''),
      url:  URL.createObjectURL(file)
    };
    musicLibrary.songs.push(song);

    const onMetadataResult = () => {
      processed++;
      if (processed % 10 === 0 || processed === total) {
        rebuildLibraryIndexes();
        saveLibrary();
        renderLibrary();
        updateTrackCount();
      }
    };

    jsmediatags.read(file, {
      onSuccess: (tag) => {
        const t = tag.tags;
        musicLibrary.metadata.set(song.url, {
          title:  t.title  || song.name,
          artist: t.artist || 'Unknown Artist',
          album:  t.album  || 'Unknown Album',
          genre:  t.genre  || 'Unknown',
          year:   t.year   || '',
          folder: file.webkitRelativePath
            ? file.webkitRelativePath.split('/').slice(0, -1).join('/')
            : 'Root'
        });
        onMetadataResult();
      },
      onError: () => {
        musicLibrary.metadata.set(song.url, {
          title: song.name, artist: 'Unknown Artist',
          album: 'Unknown Album', genre: 'Unknown', folder: 'Root'
        });
        onMetadataResult();
      }
    });
  }

  rebuildLibraryIndexes();
  renderLibrary();
  updateTrackCount();

  if (playlist.length === 0 && files.length > 0) {
    playlist = [...musicLibrary.songs];
    originalPlaylist = [...musicLibrary.songs];
    loadTrack(0);
  }
}

// ============================================================================
// LIBRARY RENDERING
// ============================================================================

function renderLibraryTabs() {
  const container = document.querySelector('.library-tabs');
  if (!container) return;

  container.innerHTML = tabOrder.map(v => `
    <div class="library-tab ${currentLibraryView === v ? 'active' : ''}"
         data-lib-view="${v}" draggable="true" data-tab-name="${v}">
      ${TAB_LABELS[v]}
    </div>`).join('');

  container.querySelectorAll('.library-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.library-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentLibraryView  = tab.dataset.libView;
      librarySearchQuery  = '';
      document.getElementById('librarySearch').value = '';
      renderLibrary();
    });
  });

  setupTabDragAndDrop();
}

function renderLibrary() {
  const content = document.getElementById('libraryContent');
  if (!content) return;

  if (musicLibrary.songs.length === 0) {
    content.innerHTML = `
      <div class="empty-library">
        <div style="font-size:48px;opacity:0.3;margin-bottom:12px;">🎵</div>
        <div style="font-size:12px;line-height:1.5;">Your music library is empty<br>Add music from Settings</div>
      </div>`;
    attachLibraryDelegation(content);
    return;
  }

  const renderers = {
    songs:     renderSongsView,
    albums:    renderAlbumsView,
    artists:   renderArtistsView,
    genres:    renderGenresView,
    folders:   renderFoldersView,
    queue:     renderQueueView,
    favorites: renderFavoritesView
  };

  content.innerHTML = (renderers[currentLibraryView] || renderSongsView)();
  attachLibraryDelegation(content);
  setTimeout(setupQueueDragHandlers, 0);
}

function attachLibraryDelegation(content) {
  if (content._delegated) return;
  content._delegated = true;
  content.addEventListener('click', handleLibraryClick);
}

function handleLibraryClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.stopPropagation();

  const { action, url: rawUrl, key: rawKey, idx } = el.dataset;
  const url = rawUrl ? decodeURIComponent(rawUrl) : null;
  const key = rawKey ? decodeURIComponent(rawKey) : null;

  const actions = {
    'play-song':     () => playFromLibrary(url),
    'play-album':    () => playCollectionFromLibrary('albums', key),
    'play-artist':   () => playCollectionFromLibrary('artists', key),
    'play-genre':    () => playCollectionFromLibrary('genres', key),
    'play-folder':   () => playCollectionFromLibrary('folders', key),
    'queue-song':    () => addToQueue(url),
    'queue-album':   () => addAlbumToQueue(key),
    'favorite-song': () => toggleFavorite(url),
    'edit-song':     () => editMetadata(url),
    'remove-queue':  () => removeFromQueue(parseInt(idx)),
    'clear-queue':   () => clearQueue(),
    'play-queue-idx': () => playQueueAt(parseInt(idx))
  };

  actions[action]?.();
}

// Encode helpers for safe HTML attribute embedding
const encUrl = url => encodeURIComponent(url);
const encKey = key => encodeURIComponent(key);

function applySearch(items, termsFn) {
  if (!librarySearchQuery) return items;
  const terms = librarySearchQuery.toLowerCase().split(' ').filter(Boolean);
  return items.filter(item => {
    const fields = termsFn(item).map(s => (s || '').toLowerCase());
    return terms.every(term => fields.some(f => f.includes(term)));
  });
}

function renderSongsView() {
  const songs = applySearch(musicLibrary.songs, song => {
    const m = musicLibrary.metadata.get(song.url) || {};
    return [m.title || song.name, m.artist, m.album, m.genre, String(m.year || '')];
  });

  if (!songs.length) return emptyView('No songs found');

  return songs.map(song => {
    const m       = musicLibrary.metadata.get(song.url) || {};
    const title   = esc(m.title  || song.name);
    const artist  = esc(m.artist || 'Unknown Artist');
    const album   = esc(m.album  || 'Unknown Album');
    const playing = playlist[currentTrackIndex]?.url === song.url && isPlaying;
    const fav     = musicLibrary.favorites.has(song.url);

    return `
      <div class="library-item ${playing ? 'playing' : ''}" data-action="play-song" data-url="${encUrl(song.url)}">
        <div class="library-item-icon">${playing ? '▶' : '🎵'}</div>
        <div class="library-item-info">
          <div class="library-item-title">${title}</div>
          <div class="library-item-subtitle">${artist} • ${album}</div>
        </div>
        <div class="library-item-actions">
          <div class="library-item-action queue-action" data-action="queue-song" data-url="${encUrl(song.url)}" title="Add to queue"><span class="queue-icon"></span></div>
          <div class="library-item-action edit-action"  data-action="edit-song"  data-url="${encUrl(song.url)}" title="Edit metadata">✏️</div>
          <div class="library-item-action ${fav ? 'favorited' : ''}" data-action="favorite-song" data-url="${encUrl(song.url)}">${fav ? '❤' : '♡'}</div>
        </div>
      </div>`;
  }).join('');
}

function renderAlbumsView() {
  return renderGroupView({
    map: musicLibrary.albums, emptyMsg: 'No albums found',
    icon: '💿', action: 'play-album', queueAction: 'queue-album',
    getLabel: ([album]) => esc(album),
    getSubtitle: ([album, songs]) => {
      const m = musicLibrary.metadata.get(songs[0].url) || {};
      return `${esc(m.artist || 'Unknown Artist')} • ${songs.length} tracks`;
    },
    searchTerms: ([album, songs]) => {
      const m = musicLibrary.metadata.get(songs[0].url) || {};
      return [album, m.artist || ''];
    }
  });
}

function renderArtistsView() {
  return renderGroupView({
    map: musicLibrary.artists, emptyMsg: 'No artists found',
    icon: '🎤', action: 'play-artist',
    getLabel:    ([artist])        => esc(artist),
    getSubtitle: ([, songs])       => `${songs.length} tracks`,
    searchTerms: ([artist])        => [artist]
  });
}

function renderGenresView() {
  return renderGroupView({
    map: musicLibrary.genres, emptyMsg: 'No genres found',
    icon: '🎸', action: 'play-genre',
    getLabel:    ([genre])  => esc(genre),
    getSubtitle: ([, songs]) => `${songs.length} tracks`,
    searchTerms: ([genre])  => [genre]
  });
}

function renderFoldersView() {
  return renderGroupView({
    map: musicLibrary.folders, emptyMsg: 'No folders found',
    icon: '📁', action: 'play-folder',
    getLabel:    ([folder]) => esc(folder === 'Root' ? 'Root' : folder.split('/').pop()),
    getSubtitle: ([, songs]) => `${songs.length} tracks`,
    searchTerms: ([folder]) => [folder === 'Root' ? 'Root' : folder.split('/').pop()]
  });
}

function renderGroupView({ map, emptyMsg, icon, action, queueAction, getLabel, getSubtitle, searchTerms }) {
  if (!map.size) return emptyView(emptyMsg);
  const entries = applySearch(Array.from(map.entries()), searchTerms);
  if (!entries.length) return emptyView(emptyMsg);

  return entries.sort((a, b) => a[0].localeCompare(b[0])).map(entry => {
    const key = encKey(entry[0]);
    const queueBtn = queueAction
      ? `<div class="library-item-actions">
           <div class="library-item-action queue-action" data-action="${queueAction}" data-key="${key}" title="Add to queue"><span class="queue-icon"></span></div>
         </div>`
      : '';
    return `
      <div class="library-item" data-action="${action}" data-key="${key}">
        <div class="library-item-icon">${icon}</div>
        <div class="library-item-info">
          <div class="library-item-title">${getLabel(entry)}</div>
          <div class="library-item-subtitle">${getSubtitle(entry)}</div>
        </div>
        ${queueBtn}
      </div>`;
  }).join('');
}

function renderFavoritesView() {
  const favs = applySearch(
    musicLibrary.songs.filter(s => musicLibrary.favorites.has(s.url)),
    song => {
      const m = musicLibrary.metadata.get(song.url) || {};
      return [m.title || song.name, m.artist, m.album];
    }
  );

  if (!favs.length) return emptyView('No favorites found');

  return favs.map(song => {
    const m       = musicLibrary.metadata.get(song.url) || {};
    const playing = playlist[currentTrackIndex]?.url === song.url && isPlaying;
    return `
      <div class="library-item ${playing ? 'playing' : ''}" data-action="play-song" data-url="${encUrl(song.url)}">
        <div class="library-item-icon">${playing ? '▶' : '❤'}</div>
        <div class="library-item-info">
          <div class="library-item-title">${esc(m.title  || song.name)}</div>
          <div class="library-item-subtitle">${esc(m.artist || 'Unknown Artist')} • ${esc(m.album || 'Unknown Album')}</div>
        </div>
        <div class="library-item-action favorited" data-action="favorite-song" data-url="${encUrl(song.url)}">❤</div>
      </div>`;
  }).join('');
}

function renderQueueView() {
  if (!playQueue.length) {
    return `
      <div class="empty-library">
        <div style="font-size:48px;opacity:0.3;margin-bottom:12px;">♩</div>
        <div style="font-size:12px;">Queue is empty</div>
        <div style="font-size:10px;color:#888;margin-top:8px;">Add songs using the ⊕ button</div>
      </div>`;
  }

  const count = playQueue.length;
  const header = `
    <div style="padding:12px;display:flex;justify-content:space-between;align-items:center;background:rgba(107,179,224,0.1);border-radius:8px;margin-bottom:12px;">
      <div style="font-size:11px;color:#6bb3e0;font-weight:600;">
        <div>${count} song${count !== 1 ? 's' : ''} in queue</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Tap to play • Drag to reorder</div>
      </div>
      <button data-action="clear-queue" style="background:rgba(255,107,107,0.3);color:#ff6b6b;border:none;padding:6px 12px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">Clear All</button>
    </div>`;

  return header + playQueue.map((song, i) => {
    const m = musicLibrary.metadata.get(song.url) || {};
    return `
      <div class="library-item queue-item" data-queue-index="${i}" draggable="true">
        <div class="library-item-icon queue-number" style="font-size:12px;opacity:0.6;">${i + 1}</div>
        <div class="library-item-info" data-action="play-queue-idx" data-idx="${i}">
          <div class="library-item-title">${esc(m.title  || song.name)}</div>
          <div class="library-item-subtitle">${esc(m.artist || 'Unknown Artist')} • ${esc(m.album || 'Unknown Album')}</div>
        </div>
        <div class="library-item-actions">
          <div class="library-item-action drag-handle" style="cursor:move;opacity:0.3;" title="Drag to reorder">⋮⋮</div>
          <div class="library-item-action" data-action="remove-queue" data-idx="${i}" title="Remove">✕</div>
        </div>
      </div>`;
  }).join('');
}

function emptyView(msg) {
  return `<div class="empty-library"><div style="font-size:12px;">${msg}</div></div>`;
}

// ============================================================================
// PLAY FUNCTIONS
// ============================================================================

function switchToMainView() {
  document.querySelectorAll('.screen-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-view="main"]').classList.add('active');
  document.getElementById('mainView').style.display = 'flex';
  document.getElementById('libraryView').classList.remove('active');
  document.getElementById('settingsView').classList.remove('active');
  document.querySelector('.volume-indicator')?.classList.add('show-on-main');
}

function playFromLibrary(url) {
  const song = musicLibrary.songs.find(s => s.url === url);
  if (!song) return;

  playlist = [...musicLibrary.songs];
  originalPlaylist = [...playlist];
  currentTrackIndex = musicLibrary.songs.indexOf(song);

  if (shuffleMode) {
    shufflePlaylist();
    currentTrackIndex = playlist.findIndex(s => s.url === url);
  }

  loadTrack(currentTrackIndex);
  if (!isPlaying) centerBtn.click();
  switchToMainView();
}

function playCollectionFromLibrary(collectionKey, name) {
  const songs = musicLibrary[collectionKey].get(name);
  if (!songs?.length) return;

  playlist = [...songs];
  originalPlaylist = [...songs];
  currentTrackIndex = 0;

  if (shuffleMode) shufflePlaylist();
  loadTrack(0);
  if (!isPlaying) centerBtn.click();
  switchToMainView();
}

function playQueueAt(index) {
  if (index < 0 || index >= playQueue.length) return;
  const song = playQueue.splice(index, 1)[0];
  if (song) playFromLibrary(song.url);
}

function toggleFavorite(url) {
  if (musicLibrary.favorites.has(url)) musicLibrary.favorites.delete(url);
  else musicLibrary.favorites.add(url);
  saveLibrary();
  renderLibrary();
  updateFavoriteButton();
}

// ============================================================================
// QUEUE
// ============================================================================

function addToQueue(url) {
  const song = musicLibrary.songs.find(s => s.url === url);
  if (!song) return;

  const dupIdx = playQueue.findIndex(s => s.url === url);
  if (dupIdx !== -1) { showDuplicateDialog(song, url, dupIdx); return; }

  playQueue.push(song);
  const m = musicLibrary.metadata.get(url) || {};
  showQueueNotification(`Added to queue: ${m.title || song.name}`);
  renderLibrary();
}

function addAlbumToQueue(albumName) {
  const songs = musicLibrary.albums.get(albumName);
  if (!songs?.length) return;

  const newSongs = songs.filter(s => !playQueue.some(q => q.url === s.url));
  const dups     = songs.filter(s =>  playQueue.some(q => q.url === s.url));

  if (dups.length) { showAlbumDuplicateDialog(albumName, songs, newSongs, dups); return; }

  playQueue.push(...songs);
  showQueueNotification(`Added ${songs.length} track${songs.length !== 1 ? 's' : ''} from ${albumName}`);
  renderLibrary();
}

function removeFromQueue(index) {
  const removed = playQueue.splice(index, 1)[0];
  if (removed) {
    const m = musicLibrary.metadata.get(removed.url) || {};
    showQueueNotification(`Removed: ${m.title || removed.name}`);
  }
  renderLibrary();
}

function clearQueue() {
  const count = playQueue.length;
  if (!count) return;
  playQueue = [];
  renderLibrary();
  showQueueNotification(`Cleared ${count} song${count !== 1 ? 's' : ''} from queue`);
}

function dequeueNext() {
  return playQueue.length ? playQueue.shift() : null;
}

function moveQueueItem(from, to) {
  if (from === to || from < 0 || to < 0 || from >= playQueue.length || to >= playQueue.length) return;
  const [item] = playQueue.splice(from, 1);
  playQueue.splice(to, 0, item);
  renderLibrary();
}

function showQueueNotification(message) {
  let n = document.getElementById('queueNotification');
  if (!n) {
    n = document.createElement('div');
    n.id = 'queueNotification';
    n.className = 'queue-notification';
    document.body.appendChild(n);
  }
  n.textContent = message;
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 3000);
}


// ============================================================================
// DUPLICATE DIALOGS
// ============================================================================

function showDuplicateDialog(song, url, dupIdx) {
  const m = musicLibrary.metadata.get(url) || {};
  const modal = createModal(`
    <div class="duplicate-modal-header"><span>⚠️ Song Already in Queue</span></div>
    <div class="duplicate-modal-body">
      <div style="margin-bottom:15px;"><strong>"${esc(m.title || song.name)}"</strong> is already in your queue at position ${dupIdx + 1}.</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:20px;">Do you want to add it again or keep only the existing one?</div>
    </div>
    <div class="duplicate-modal-footer">
      <button class="duplicate-btn cancel-btn" id="dupKeep">Keep Existing</button>
      <button class="duplicate-btn add-btn" id="dupAdd">Add Again</button>
    </div>`);

  modal.querySelector('#dupKeep').addEventListener('click', () => closeModal(modal));
  modal.querySelector('#dupAdd').addEventListener('click', () => {
    playQueue.push(song);
    showQueueNotification(`Added to queue: ${m.title || song.name}`);
    renderLibrary();
    closeModal(modal);
  });
}

function showAlbumDuplicateDialog(albumName, allSongs, newSongs, dups) {
  const modal = createModal(`
    <div class="duplicate-modal-header"><span>⚠️ Duplicate Songs Found</span></div>
    <div class="duplicate-modal-body">
      <div style="margin-bottom:15px;"><strong>${dups.length}</strong> of <strong>${allSongs.length}</strong> tracks from <strong>"${esc(albumName)}"</strong> are already in your queue.</div>
      <div style="font-size:11px;color:#aaa;margin-bottom:20px;">${newSongs.length > 0 ? `${newSongs.length} new track${newSongs.length !== 1 ? 's' : ''} can be added.` : 'All tracks are already queued.'}</div>
    </div>
    <div class="duplicate-modal-footer">
      <button class="duplicate-btn cancel-btn" id="dupCancel">Cancel</button>
      ${newSongs.length > 0 ? `<button class="duplicate-btn add-btn" id="dupNew">Add New Only</button>` : ''}
      <button class="duplicate-btn add-all-btn" id="dupAll">${newSongs.length > 0 ? 'Add All' : 'Add All Again'}</button>
    </div>`);

  modal.querySelector('#dupCancel').addEventListener('click', () => closeModal(modal));
  modal.querySelector('#dupNew')?.addEventListener('click', () => {
    playQueue.push(...newSongs);
    showQueueNotification(`Added ${newSongs.length} new track${newSongs.length !== 1 ? 's' : ''}`);
    renderLibrary();
    closeModal(modal);
  });
  modal.querySelector('#dupAll').addEventListener('click', () => {
    playQueue.push(...allSongs);
    showQueueNotification(`Added ${allSongs.length} track${allSongs.length !== 1 ? 's' : ''} from ${albumName}`);
    renderLibrary();
    closeModal(modal);
  });
}

function createModal(innerHtml) {
  const modal = document.createElement('div');
  modal.className = 'duplicate-modal';
  modal.innerHTML = `<div class="duplicate-modal-content">${innerHtml}</div>`;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('active'), 10);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); });
  return modal;
}

function closeModal(modal) {
  if (!modal) modal = document.querySelector('.duplicate-modal');
  if (!modal) return;
  modal.classList.remove('active');
  setTimeout(() => modal.remove(), 300);
}

// ============================================================================
// METADATA EDITOR
// ============================================================================

function editMetadata(url) {
  currentEditingSongUrl = url;
  const m    = musicLibrary.metadata.get(url) || {};
  const song = musicLibrary.songs.find(s => s.url === url);
  document.getElementById('metaTitle').value  = m.title  || song?.name || '';
  document.getElementById('metaArtist').value = m.artist || '';
  document.getElementById('metaAlbum').value  = m.album  || '';
  document.getElementById('metaGenre').value  = m.genre  || '';
  document.getElementById('metaYear').value   = m.year   || '';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('metadataModal').classList.add('active');
}

function closeMetadataEditor() {
  document.getElementById('metadataModal').classList.remove('active');
  currentEditingSongUrl = null;
}

function saveMetadata() {
  if (!currentEditingSongUrl) return;
  const m = musicLibrary.metadata.get(currentEditingSongUrl) || {};
  m.title  = document.getElementById('metaTitle').value.trim()  || m.title;
  m.artist = document.getElementById('metaArtist').value.trim() || 'Unknown Artist';
  m.album  = document.getElementById('metaAlbum').value.trim()  || 'Unknown Album';
  m.genre  = document.getElementById('metaGenre').value.trim()  || 'Unknown';
  m.year   = document.getElementById('metaYear').value.trim()   || '';
  musicLibrary.metadata.set(currentEditingSongUrl, m);
  rebuildLibraryIndexes();
  saveLibrary();
  renderLibrary();

  if (playlist[currentTrackIndex]?.url === currentEditingSongUrl) {
    trackTitle.textContent = m.title;
    trackInfo.textContent  = `${m.artist} • ${m.album} • ${currentTrackIndex + 1} of ${playlist.length}`;
    updateMediaSession();
  }

  closeMetadataEditor();
}

async function searchMetadataOnline() {
  const titleInput  = document.getElementById('metaTitle');
  const artistInput = document.getElementById('metaArtist');
  const searchBtn   = document.getElementById('webSearchBtn');
  const resultsDiv  = document.getElementById('searchResults');
  const query       = titleInput.value.trim() || artistInput.value.trim();

  if (!query) {
    resultsDiv.innerHTML = '<div class="search-error">Please enter at least a title or artist name</div>';
    return;
  }

  searchBtn.disabled   = true;
  searchBtn.textContent = '🔍 Searching...';
  resultsDiv.innerHTML  = '<div class="search-loading">Searching...</div>';

  try {
    const q   = encodeURIComponent(`${query} ${artistInput.value.trim()}`);
    const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=5`);
    if (!res.ok) throw new Error('Search failed');

    const { recordings = [] } = await res.json();

    if (!recordings.length) {
      resultsDiv.innerHTML = '<div class="search-empty">No results found.</div>';
      return;
    }

    resultsDiv.innerHTML = recordings.map((r, i) => `
      <div class="search-result-item" data-ridx="${i}">
        <div class="search-result-title">${esc(r.title || 'Unknown')}</div>
        <div class="search-result-info">
          ${esc(r['artist-credit']?.[0]?.name || '')}
          ${r.releases?.[0]?.title ? ' • ' + esc(r.releases[0].title) : ''}
          ${r.releases?.[0]?.date  ? ' (' + r.releases[0].date.substring(0, 4) + ')' : ''}
          ${r.tags?.length ? '<br>🏷️ ' + esc(r.tags.slice(0, 3).map(t => t.name).join(', ')) : ''}
        </div>
      </div>`).join('');

    resultsDiv.querySelectorAll('.search-result-item').forEach(el => {
      const r = recordings[parseInt(el.dataset.ridx)];
      el.addEventListener('click', () => applyMetadataFromSearch(
        r.title || '',
        r['artist-credit']?.[0]?.name || '',
        r.releases?.[0]?.title || '',
        r.releases?.[0]?.date?.substring(0, 4) || '',
        r.tags?.slice(0, 3).map(t => t.name).join(', ') || ''
      ));
    });
  } catch {
    resultsDiv.innerHTML = '<div class="search-error">❌ Search failed. Check your internet connection.</div>';
  } finally {
    searchBtn.disabled    = false;
    searchBtn.textContent = '🔍 Search Web for Metadata';
  }
}

function applyMetadataFromSearch(title, artist, album, year, genres) {
  document.getElementById('metaTitle').value  = title;
  document.getElementById('metaArtist').value = artist;
  document.getElementById('metaAlbum').value  = album;
  document.getElementById('metaYear').value   = year;
  if (genres) document.getElementById('metaGenre').value = genres.split(',')[0].trim();
  document.querySelector('.metadata-modal-body')?.scrollTo(0, 0);
}

async function batchFetchMetadata() {
  const btn    = document.getElementById('batchMetadataBtn');
  const textEl = btn.querySelector('.setting-text');
  const orig   = textEl.textContent;

  const toUpdate = musicLibrary.songs.filter(s => {
    const m = musicLibrary.metadata.get(s.url) || {};
    return !m.genre || m.genre === 'Unknown'
        || !m.artist || m.artist === 'Unknown Artist'
        || !m.album  || m.album  === 'Unknown Album';
  });

  if (!toUpdate.length) { alert('All songs have complete metadata!'); return; }
  if (!confirm(`Found ${toUpdate.length} songs with missing metadata. Fetch from web?`)) return;

  textEl.textContent    = `Fetching... 0/${toUpdate.length}`;
  btn.style.pointerEvents = 'none';
  btn.style.opacity     = '0.6';

  let updated = 0;
  for (let i = 0; i < toUpdate.length; i++) {
    const song = toUpdate[i];
    const m    = musicLibrary.metadata.get(song.url) || {};
    try {
      if (i > 0) await new Promise(r => setTimeout(r, 1000));
      const q   = encodeURIComponent(`${m.title || song.name} ${m.artist || ''}`);
      const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=1`);
      if (res.ok) {
        const { recordings } = await res.json();
        const r = recordings?.[0];
        if (r) {
          if (!m.artist || m.artist === 'Unknown Artist') m.artist = r['artist-credit']?.[0]?.name || m.artist;
          if (!m.album  || m.album  === 'Unknown Album')  m.album  = r.releases?.[0]?.title || m.album;
          if (!m.genre  || m.genre  === 'Unknown') { const g = r.tags?.[0]?.name; if (g) m.genre = g; }
          if (!m.year) { const y = r.releases?.[0]?.date?.substring(0, 4); if (y) m.year = y; }
          musicLibrary.metadata.set(song.url, m);
          updated++;
        }
      }
    } catch (e) {
      console.error('Batch metadata error:', song.name, e);
    }
    textEl.textContent = `Fetching... ${i + 1}/${toUpdate.length}`;
  }

  rebuildLibraryIndexes();
  saveLibrary();
  renderLibrary();
  textEl.textContent      = orig;
  btn.style.pointerEvents = '';
  btn.style.opacity       = '';
  alert(`Updated metadata for ${updated} of ${toUpdate.length} songs!`);
}

// ============================================================================
// HTML ESCAPING
// ============================================================================

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

function esc(text) {
  if (text == null) return '';
  return String(text).replace(/[&<>"']/g, m => ESC_MAP[m]);
}

// Alias for HTML inline compatibility
function escapeHtml(t) { return esc(t); }

// ============================================================================
// BATTERY
// ============================================================================

async function initBattery() {
  if (!('getBattery' in navigator)) { fallbackBatteryMode(); return; }
  try {
    const battery = await navigator.getBattery();
    batterySupported = true;
    const update = () => updateBatteryInfo(battery);
    update();
    battery.addEventListener('levelchange',   update);
    battery.addEventListener('chargingchange', update);
  } catch {
    fallbackBatteryMode();
  }
}

function updateBatteryInfo(battery) {
  batteryLevel = battery.level * 100;
  isCharging   = battery.charging;
  updateBatteryDisplay();
  updateBatteryIndicators();
}

function fallbackBatteryMode() {
  batterySupported = false;
  updateBatteryDisplay();
}

function updateBatteryDisplay() {
  const display = document.getElementById('batteryDisplay');
  const icon    = document.getElementById('batteryIcon');
  if (!batterySupported) {
    if (display) display.textContent = 'N/A';
    if (icon)    icon.textContent    = '🔋';
    return;
  }
  const level = Math.round(batteryLevel);
  if (display) display.textContent = level + '%' + (isCharging ? ' ⚡' : '');
  if (icon)    icon.textContent    = isCharging ? '🔌' : level > 50 ? '🔋' : '🪫';
}

function updateBatteryIndicators() {
  const greenActive = isCharging || batteryLevel > 50;
  const redActive   = !isCharging && batteryLevel <= 20;
  greenLight.classList.toggle('active',   greenActive);
  greenLight.classList.toggle('inactive', !greenActive);
  redLight.classList.toggle('active',   redActive);
  redLight.classList.toggle('inactive', !redActive);
}

// ============================================================================
// AUDIO CONTEXT & EQ
// ============================================================================

function initAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Main analyser for waveform/visualizer (low-res is fine)
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.8;

  // High-res analyser for lip sync formant analysis (2048 bins = ~21Hz resolution)
  const lipAnalyser = audioCtx.createAnalyser();
  lipAnalyser.fftSize = 2048;
  lipAnalyser.smoothingTimeConstant = 0.5;

  eq60  = createFilter("lowshelf",  60);
  eq250 = createFilter("peaking",   250,  1);
  eq1k  = createFilter("peaking",   1000, 1);
  eq4k  = createFilter("peaking",   4000, 1);
  eq16k = createFilter("highshelf", 16000);
  gainNode = audioCtx.createGain();

  source = audioCtx.createMediaElementSource(audio);
  source.connect(eq60);
  eq60.connect(eq250); eq250.connect(eq1k);
  eq1k.connect(eq4k);  eq4k.connect(eq16k);
  eq16k.connect(gainNode);
  gainNode.connect(analyser);
  gainNode.connect(lipAnalyser);  // tap for lip sync
  analyser.connect(audioCtx.destination);

  LipSyncEngine.init(lipAnalyser, audioCtx.sampleRate);
  applyEQPreset(currentPreset);
}

function createFilter(type, frequency, Q) {
  const f = audioCtx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  if (Q != null) f.Q.value = Q;
  return f;
}

function applyEQPreset(key) {
  const preset = EQ_PRESETS[key];
  if (!preset) return;

  eqBands = [...preset.bands];

  if (eq60) {
    eq60.gain.value  = eqBands[0];
    eq250.gain.value = eqBands[1];
    eq1k.gain.value  = eqBands[2];
    eq4k.gain.value  = eqBands[3];
    eq16k.gain.value = eqBands[4];
  }

  document.body.style.background = preset.bgGradient;
  updateEQBars();
  if (progressRingFill) progressRingFill.style.stroke = preset.color;

  const nameEl = document.getElementById('presetName');
  if (nameEl) nameEl.textContent = preset.name;

  const ind = document.getElementById('presetIndicator');
  if (ind) {
    ind.textContent = preset.emoji;
    ind.style.color = preset.color;
    ind.classList.add('visible');
    setTimeout(() => ind.classList.remove('visible'), 2000);
  }
}

function updateEQBars() {
  const { color } = EQ_PRESETS[currentPreset];
  for (let i = 0; i < 5; i++) {
    const bar = document.getElementById(`eqBar${i}`);
    if (bar) {
      bar.style.height     = Math.abs(eqBands[i]) * 5 + '%';
      bar.style.background = `linear-gradient(to top,${color},${color}99)`;
    }
  }
}

function cyclePreset(dir) {
  const keys = Object.keys(EQ_PRESETS);
  currentPreset = keys[(keys.indexOf(currentPreset) + dir + keys.length) % keys.length];
  applyEQPreset(currentPreset);
  showPresetNotification();
  document.querySelectorAll('.preset-button').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === currentPreset)
  );
}

function showPresetNotification() {
  const preset = EQ_PRESETS[currentPreset];
  document.querySelector('.preset-notification')?.remove();

  if (!document.getElementById('presetAnimStyle')) {
    const s = document.createElement('style');
    s.id = 'presetAnimStyle';
    s.textContent = `@keyframes fadeInOut{
      0%  { opacity:0; transform:translate(-50%,-50%) scale(0.8) }
      20% { opacity:1; transform:translate(-50%,-50%) scale(1)   }
      80% { opacity:1; transform:translate(-50%,-50%) scale(1)   }
      100%{ opacity:0; transform:translate(-50%,-50%) scale(0.8) }
    }`;
    document.head.appendChild(s);
  }

  const n = document.createElement('div');
  n.className  = 'preset-notification';
  n.textContent = preset.name;
  n.style.cssText = [
    'position:absolute', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    `background:rgba(0,0,0,0.9)`, `color:${preset.color}`,
    'padding:20px 30px', 'border-radius:12px',
    'font-size:18px', 'font-weight:600', 'z-index:100',
    `box-shadow:0 0 30px ${preset.color}80`,
    `border:2px solid ${preset.color}`,
    'animation:fadeInOut 1.5s ease', 'pointer-events:none'
  ].join(';');

  screen.appendChild(n);
  setTimeout(() => n.remove(), 1500);
}

function createPresetButtons() {
  const container = document.getElementById('presetButtons');
  if (!container) return;

  for (const [key, preset] of Object.entries(EQ_PRESETS)) {
    const btn = document.createElement('div');
    btn.className   = 'preset-button' + (key === currentPreset ? ' active' : '');
    btn.style.color = preset.color;
    btn.textContent = preset.name;
    btn.dataset.preset = key;
    btn.addEventListener('click', e => {
      e.preventDefault();
      resetIdle();
      currentPreset = key;
      applyEQPreset(key);
      container.querySelectorAll('.preset-button').forEach(b =>
        b.classList.toggle('active', b.dataset.preset === key)
      );
    });
    container.appendChild(btn);
  }
}

// ============================================================================
// TRACK LOADING & PLAYBACK
// ============================================================================

function loadTrack(idx) {
  if (idx < 0 || idx >= playlist.length) return;
  currentTrackIndex     = idx;
  gaplessPreloadFired   = false;

  const track  = playlist[idx];
  const m      = musicLibrary.metadata.get(track.url) || {};
  const title  = m.title  || track.name;
  const artist = m.artist || 'Unknown Artist';
  const album  = m.album  || 'Unknown Album';

  audio.src           = track.url;
  audio.playbackRate  = playbackSpeed;
  trackTitle.textContent = title;
  trackInfo.textContent  = `${artist} • ${album} • ${idx + 1} of ${playlist.length}`;

  // LipSyncEngine: detect Hello World benchmark, reset on other tracks
  LipSyncEngine.reset();
  checkBenchmarkMode(title);

  updateProgressRing(0);
  volumeLevel.style.width = '0%';
  extractAlbumArt(track.file);
  updateFavoriteButton();
  updateMediaSession();
  renderLibrary();

  if (isPlaying) {
    initAudioContext();
    audioCtx.resume().then(() =>
      audio.play()
        .then(() => { if (fadeEffectsEnabled) fadeIn(audio, fadeDuration); })
        .catch(err => {
          console.log('Play error:', err);
          isPlaying = false;
          centerBtn.classList.remove('playing');
        })
    );
  }
}

async function extractAlbumArt(file) {
  const el = document.getElementById('albumArtwork');
  if (!file || !window.jsmediatags) { el.classList.remove('visible'); return; }
  try {
    jsmediatags.read(file, {
      onSuccess: tag => {
        const pic = tag.tags.picture;
        if (pic) {
          const b64 = btoa(pic.data.reduce((d, b) => d + String.fromCharCode(b), ''));
          el.src = `data:${pic.format};base64,${b64}`;
          el.classList.add('visible');
        } else {
          el.classList.remove('visible');
        }
      },
      onError: () => el.classList.remove('visible')
    });
  } catch {
    el.classList.remove('visible');
  }
}

function stopPlayback() {
  centerBtn.classList.remove('playing');
  isPlaying = false;
  screen.classList.remove('dancing');
  updateMediaSession();
}

// ============================================================================
// ADVANCED PLAYBACK
// ============================================================================

function fadeIn(audioEl, duration) {
  if (!fadeEffectsEnabled) return;
  clearInterval(fadeInInterval);
  audioEl.volume = 0;
  const target   = volume / 100;
  const steps    = 50;
  const inc      = target / steps;
  const interval = (duration * 1000) / steps;
  let step = 0;
  fadeInInterval = setInterval(() => {
    if (step++ >= steps) { clearInterval(fadeInInterval); audioEl.volume = target; return; }
    audioEl.volume = Math.min(target, audioEl.volume + inc);
  }, interval);
}

function fadeOut(audioEl, duration, callback) {
  if (!fadeEffectsEnabled) { callback?.(); return; }
  clearInterval(fadeOutInterval);
  const start    = audioEl.volume;
  const steps    = 50;
  const dec      = start / steps;
  const interval = (duration * 1000) / steps;
  let step = 0;
  fadeOutInterval = setInterval(() => {
    if (step++ >= steps) { clearInterval(fadeOutInterval); audioEl.volume = 0; callback?.(); return; }
    audioEl.volume = Math.max(0, audioEl.volume - dec);
  }, interval);
}

function crossfadeToNext() {
  if (!crossfadeEnabled || isCrossfading) return;
  const nextIdx = (currentTrackIndex + 1) % playlist.length;
  if (!playlist[nextIdx]) return;

  isCrossfading = true;
  fadeOut(audio, crossfadeDuration, () => { audio.pause(); isCrossfading = false; });
  loadTrack(nextIdx);
  audio.volume = 0;
  audio.play()
    .then(() => fadeIn(audio, crossfadeDuration))
    .catch(e => { console.log('Crossfade error:', e); isCrossfading = false; });
}

function preloadNextTrack() {
  const nextIdx = (currentTrackIndex + 1) % playlist.length;
  if (!playlist[nextIdx]) return;
  if (!nextAudio) { nextAudio = new Audio(); nextAudio.preload = 'auto'; }
  if (nextAudio.src !== playlist[nextIdx].url) {
    nextAudio.src = playlist[nextIdx].url;
    nextAudio.playbackRate = playbackSpeed;
  }
}

function applyNormalization() {
  if (!normalizeEnabled || !gainNode || !analyser) return;
  analyser.getByteFrequencyData(dataArray);
  const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
  gainNode.gain.value = Math.min(2.0, 128 / (avg + 1)) * 0.5;
}

function applyReplayGain(gain = 0) {
  if (!replayGainEnabled || !gainNode) return;
  gainNode.gain.value = Math.pow(10, gain / 20);
}

function applyLoudnessLeveling() {
  if (!loudnessEnabled || !gainNode || !analyser) return;
  analyser.getByteFrequencyData(dataArray);
  const rms = Math.sqrt(dataArray.reduce((s, v) => s + v * v, 0) / dataArray.length);
  gainNode.gain.value = Math.min(2.5, 70 / (rms + 1));
}

function updatePlaybackSpeed(speed) {
  playbackSpeed = speed;
  audio.playbackRate = speed;
  if (nextAudio) nextAudio.playbackRate = speed;
}

// ============================================================================
// MEDIA SESSION API
// ============================================================================

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const track = playlist[currentTrackIndex];
  if (!track) return;

  const m = musicLibrary.metadata.get(track.url) || {};
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  m.title  || track.name,
    artist: m.artist || 'Unknown Artist',
    album:  m.album  || 'Unknown Album'
  });
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  navigator.mediaSession.setActionHandler('play',          () => { if (!isPlaying) centerBtn.click(); });
  navigator.mediaSession.setActionHandler('pause',         () => { if (isPlaying)  centerBtn.click(); });
  navigator.mediaSession.setActionHandler('previoustrack', () => document.getElementById('prevBtn').click());
  navigator.mediaSession.setActionHandler('nexttrack',     () => document.getElementById('nextBtn').click());
  navigator.mediaSession.setActionHandler('seekto', d => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
}

// ============================================================================
// SHUFFLE
// ============================================================================

function shufflePlaylist() {
  const cur = playlist[currentTrackIndex];
  for (let i = playlist.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
  }
  currentTrackIndex = playlist.findIndex(t => t.url === cur?.url) || 0;
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showVolumeBar() {
  audioLevelBar.classList.add('visible');
  audioLevelFill.style.height = volume + '%';
  clearTimeout(volumeTimeout);
  volumeTimeout = setTimeout(() => audioLevelBar.classList.remove('visible'), 2000);
}

function updateProgressRing(progress) {
  if (!progressRingFill) return;
  const r = progressRingFill.r.baseVal.value;
  const c = 2 * Math.PI * r;
  progressRingFill.style.strokeDasharray  = `${c} ${c}`;
  progressRingFill.style.strokeDashoffset = c - (progress * c);
  progressRingFill.style.stroke = EQ_PRESETS[currentPreset]?.color || '#6bb3e0';
}

function updateFavoriteButton() {
  const el    = document.getElementById('favoriteIcon');
  const track = playlist[currentTrackIndex];
  const fav   = track && musicLibrary.favorites.has(track.url);
  el.textContent = fav ? '❤' : '♡';
  el.classList.toggle('active', !!fav);
  el.style.color = fav ? '#ff6b6b' : '';
}

function updateTrackCount() {
  const el = document.getElementById('trackCount');
  if (el) el.textContent = musicLibrary.songs.length;
}

function resetIdle() {
  lastInteractionTime = Date.now();
  idleState           = 'active';
  deepSleepTimer      = 0;
}

function updateIdleState() {
  if (isPlaying) { idleState = 'active'; deepSleepTimer = 0; screen.style.opacity = '1'; return; }
  const s = (Date.now() - lastInteractionTime) / 1000;
  if      (s < 20)  idleState = 'active';
  else if (s < 60)  idleState = 'curious';
  else if (s < 120) idleState = 'bored';
  else { idleState = 'sleepy'; deepSleepTimer++; }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ============================================================================
// LIP SYNC — AMPLITUDE FALLBACK
// Used for non-benchmark songs when no phoneme timeline is loaded.
// Still produces plausible viseme output from audio analysis.
// ============================================================================

function _amplitudeFallbackLip(avg, data, now) {
  const bass   = data[2] / 255;
  const mid    = data[Math.floor(data.length / 2)] / 255;
  const treble = data[data.length - 3] / 255;
  const energy = avg / 255;

  let phoneme = 'SIL';
  if      (bass > 0.6 && energy > 0.5)   phoneme = 'AA';
  else if (treble > 0.5 && mid < 0.3)     phoneme = Math.random() > 0.5 ? 'IY' : 'S';
  else if (energy > 0.6)                   phoneme = Math.random() > 0.5 ? 'OW' : 'ER';
  else if (energy > 0.3)                   phoneme = ['D','N','L'][Math.floor(Math.random()*3)];
  else                                      phoneme = 'SIL';

  const viseme = LipSyncEngine.VisemeMapper.map(phoneme);

  // Simple interpolation via a reused interpolator-like approach
  const baseHeights = LipSyncEngine.VISEME_SHAPES[viseme] || LipSyncEngine.VISEME_SHAPES.REST;
  const scaledHeights = baseHeights.map(h => h * (0.5 + energy * 0.8));

  return { viseme, heights: scaledHeights, phoneme, isRest: energy < 0.1 };
}

// ============================================================================
// BENCHMARK DETECTION — auto-activates Hello World lip sync
// ============================================================================

function checkBenchmarkMode(trackTitle) {
  // v2: LipSyncEngine runs real-time analysis on ALL tracks automatically.
  // Show the indicator whenever playing.
}

function setViewportHeight() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

// ============================================================================
// FILE HANDLING
// ============================================================================

async function scanForAudioFiles(files) {
  return Array.from(files)
    .filter(f => AUDIO_EXTENSIONS.some(e => f.name.toLowerCase().endsWith(e)) || f.type.startsWith('audio/'))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function handleAudioFiles(files) {
  if (!files.length) return;
  trackTitle.textContent = 'Scanning files...';
  trackInfo.textContent  = '';
  const audioFiles = await scanForAudioFiles(files);
  if (audioFiles.length) {
    addFilesToLibrary(audioFiles);
    if (autoplayEnabled && !isPlaying) setTimeout(() => centerBtn.click(), 500);
    trackTitle.textContent = `Added ${audioFiles.length} track${audioFiles.length > 1 ? 's' : ''}`;
    trackInfo.textContent  = 'Check Library tab';
  } else {
    trackTitle.textContent = 'No audio files found';
    trackInfo.textContent  = '';
  }
}

// ============================================================================
// SETTINGS HELPERS
// ============================================================================

function setupToggle(id, cb) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', e => {
    e.preventDefault();
    resetIdle();
    const active = el.querySelector('.toggle-switch').classList.toggle('active');
    cb(active);
  });
}

function disableToggle(id) {
  document.getElementById(id)?.querySelector('.toggle-switch')?.classList.remove('active');
}

function setDisplayPair(id1, id2, show) {
  const d = show ? 'flex' : 'none';
  const b = show ? 'block' : 'none';
  document.getElementById(id1).style.display = d;
  document.getElementById(id2).style.display = b;
}

// ============================================================================
// ANIMATION — CHARACTER
// ============================================================================

function setEmotion(emotion) {
  const e = EMOTIONS[emotion];
  if (!e) return;
  // Convert legacy px values → % so eyes scale with the face container.
  // Base reference: 75px wide, 45px tall eye = 100% / 100%
  const w = (e.width  / 75  * 100).toFixed(1) + '%';
  const h = (e.height / 45 * 100).toFixed(1) + '%';
  eyeLeft.style.width        = w;
  eyeLeft.style.height       = h;
  eyeLeft.style.borderRadius = e.radiusLeft;
  eyeLeft.style.opacity      = e.opacity;
  eyeRight.style.width        = w;
  eyeRight.style.height       = h;
  eyeRight.style.borderRadius = e.radiusRight;
  eyeRight.style.opacity      = e.opacity;
}

function setMouthExpression(type, intensity = 1) {
  const { color } = EQ_PRESETS[currentPreset];
  let phonemeClass = 'mm';
  let emotionClass = '';

  if (type === 'smile')      { phonemeClass = 'ee'; emotionClass = 'emotion-smile'; }
  else if (type === 'wide-smile') { phonemeClass = 'aa'; emotionClass = 'emotion-smile'; }
  else if (type === 'sleepy') {
    const b = Math.sin(danceTimer * 0.5);
    mouthBars.forEach(bar => {
      bar.style.opacity   = '0.3';
      bar.style.transform = `scaleY(${0.5 + b * 0.1})`;
    });
  }

  if (mouthContainer) mouthContainer.className = `mouth phoneme-${phonemeClass} ${emotionClass}`.trim();

  if (type !== 'sleepy') {
    const scale = 0.6 + 0.4 * intensity;
    mouthBars.forEach(bar => {
      bar.style.opacity   = type === 'flat' ? '0.4' : '1';
      bar.style.transform = `scaleY(${scale})`;
    });
  }

  mouthBars.forEach(bar => {
    bar.style.background = `linear-gradient(180deg,${color},${color}dd)`;
    bar.style.boxShadow  = `0 0 8px ${color}99,inset 0 1px 3px rgba(255,255,255,0.3)`;
  });
}

// ============================================================================
// DRAW LOOP
// ============================================================================

function drawWave() {
  requestAnimationFrame(drawWave);

  if (analyser && isPlaying) analyser.getByteFrequencyData(dataArray);
  else dataArray.fill(0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isPlaying && animationsEnabled) danceTimer += 0.05;

  const avg    = dataArray.reduce((a, b) => a + b, 0) / 64;
  const preset = EQ_PRESETS[currentPreset];

  updateIdleState();
  idleTimer++;

  // Eye color — always updated to prevent gray glitch
  const glow = 15 + Math.min(1, avg / 180) * 35;
  eyeLeft.style.background  = eyeRight.style.background  = `linear-gradient(to top,${preset.color},${preset.color}dd)`;
  eyeLeft.style.boxShadow   = eyeRight.style.boxShadow   = `0 0 ${animationsEnabled ? glow : 15}px ${preset.color}aa`;

  // Brightness pulse
  document.body.style.filter = (isPlaying && animationsEnabled && avg > 100)
    ? `brightness(${1 + Math.min(0.15, (avg - 100) / 800)})`
    : 'brightness(1)';

  const now = Date.now();

  // Emotion & eye movement
  if (isPlaying && animationsEnabled) {
    if (currentPreset === 'rock' && avg > 130 && Math.random() > 0.95) {
      eyeLeft.classList.add('headbang');
      eyeRight.classList.add('headbang');
      setTimeout(() => { eyeLeft.classList.remove('headbang'); eyeRight.classList.remove('headbang'); }, 300);
    }
    eyeOffsetX = lerp(eyeOffsetX, Math.sin(danceTimer * 3) * 4, 0.1);
    eyeLeft.style.transform  = `translateX(${eyeOffsetX}px)`;
    eyeRight.style.transform = `translateX(${eyeOffsetX}px)`;

    if (now - lastEmotionChange > emotionLockDuration) {
      if (avg > 200) { currentEmotion = 'hyped'; lastEmotionChange = now; }
      else if (avg > 150) { const e = ['grooving', 'excited', 'loving'][Math.floor(Math.random() * 3)]; currentEmotion = e; lastEmotionChange = now; }
      else if (avg > 80)  { currentEmotion = 'grooving'; lastEmotionChange = now; }
      else                { currentEmotion = 'content';  lastEmotionChange = now; }
    }
    if (avg > 100 && Math.random() > 0.985) {
      currentEmotion    = Math.random() > 0.5 ? 'singing' : 'excited';
      lastEmotionChange = now;
    }
  } else {
    eyeLeft.classList.remove('headbang');
    eyeRight.classList.remove('headbang');

    switch (idleState) {
      case 'active':
        currentEmotion = 'happy';
        eyeOffsetX = lerp(eyeOffsetX, 0, 0.05);
        eyeLeft.style.transform = eyeRight.style.transform = `translateX(${eyeOffsetX}px)`;
        break;
      case 'curious':
        if (now - lastEmotionChange > emotionLockDuration) {
          currentEmotion    = idleTimer % 300 < 150 ? 'curious' : 'content';
          lastEmotionChange = now;
        }
        eyeOffsetX = lerp(eyeOffsetX, Math.sin(idleTimer * 0.02) * 5, 0.05);
        eyeLeft.style.transform = eyeRight.style.transform = `translateX(${eyeOffsetX}px)`;
        break;
      case 'bored':
        currentEmotion = 'bored';
        eyeOffsetX = lerp(eyeOffsetX, Math.sin(idleTimer * 0.01) * 2, 0.03);
        eyeLeft.style.transform = eyeRight.style.transform = `translateX(${eyeOffsetX}px)`;
        break;
      case 'sleepy':
        currentEmotion = 'sleeping';
        eyeOffsetY = lerp(eyeOffsetY, Math.sin(idleTimer * 0.02) * 2, 0.05);
        eyeLeft.style.transform = eyeRight.style.transform = `translateY(${eyeOffsetY}px)`;
        screen.style.opacity = deepSleepTimer > 60 ? '0.7' : '1';
        break;
      default:
        // Always restore screen opacity when awake
        screen.style.opacity = '1';
        break;
    }
  }

  if (animationsEnabled) {
    setEmotion(currentEmotion);
    blinkTimer++;
    const blinkThresh = currentEmotion === 'hyped' ? 100 : currentEmotion === 'sleeping' ? 400 : 250;
    if (!isBlinking && blinkTimer > blinkThresh + Math.random() * 200) { isBlinking = true; blinkTimer = 0; }
    if (isBlinking) {
      eyeLeft.style.height = eyeRight.style.height = '3px';
      if (Math.random() > 0.6) isBlinking = false;
    }
  }

  if (visualizerEnabled) {
    // ── PHONEME LIP SYNC ─────────────────────────────────────────────────────
    LipSyncEngine.setEmotion(currentEmotion);
    let lip;
    try { lip = LipSyncEngine.tick(isPlaying && avg > 20); }
    catch(e) { lip = { viseme:'REST', heights:new Array(8).fill(3), openness:0, isRest:true, phoneme:'SIL' }; }

    if (mouthBars.length === 8) {
      const { viseme, heights, openness, isRest, phoneme } = lip;
      currentPhoneme = phoneme || 'SIL';

      // Glow intensity scales with mouth openness (looks energetic when singing)
      const mouthGlow = isRest ? 0.15 : 0.4 + openness * 1.2;
      const glowColor = preset.color;

      // Reduce blinking when mouth is open (looks focused on singing)
      if (!isRest && openness > 0.3) blinkTimer = Math.min(blinkTimer, 60);

      // Update mouth container class for CSS fallback
      if (mouthContainer) {
        mouthContainer.className = `mouth lipsync-active viseme-${viseme.toLowerCase()}`;
      }

      mouthBars.forEach((bar, i) => {
        // Heights as % of mouth container so they scale with the face
        const hPct = Math.max(5, Math.min(92, heights[i] / 54 * 90));
        bar.style.height = hPct + '%';
        bar.style.transform = 'scaleY(1)';

        if (isRest) {
          const smilePct = [8, 12, 16, 20, 20, 16, 12, 8];
          bar.style.height     = smilePct[i] + '%';
          bar.style.opacity    = '0.75';
          bar.style.background = `linear-gradient(180deg, ${glowColor}, ${glowColor}cc)`;
          bar.style.boxShadow  = `0 0 6px ${glowColor}55, inset 0 1px 2px rgba(255,255,255,0.2)`;
        } else {
          const isVowel    = viseme.startsWith('OPEN_') || viseme.includes('SING');
          const topColor   = isVowel ? glowColor : glowColor + 'cc';
          const glowAmount = 6 + openness * 18;
          bar.style.opacity    = '1';
          bar.style.background = `linear-gradient(180deg, ${topColor}, ${glowColor}bb)`;
          bar.style.boxShadow  = `0 0 ${glowAmount}px ${glowColor}${Math.floor(mouthGlow * 255).toString(16).padStart(2,'0')}, inset 0 1px 3px rgba(255,255,255,0.25)`;
        }
      });

      // Eye glow syncs with singing energy
      const eyeGlow = isRest ? 15 : 15 + openness * 25;
      eyeLeft.style.boxShadow = eyeRight.style.boxShadow =
        `0 0 ${animationsEnabled ? eyeGlow : 15}px ${preset.color}aa`;
    }
  } else {
    setMouthExpression('smile', 0.5);
  }
  if (!visualizerEnabled || (!isPlaying && idleState === 'sleepy')) return;

  // Hand drawing — positioned at 75% down the face container
  const cy       = canvas.height * 0.75;
  const leftAvg  = dataArray.slice(0, 32).reduce((a, b) => a + b, 0) / 32;
  const rightAvg = dataArray.slice(32).reduce((a, b) => a + b, 0) / 32;
  const danceOffset = (isPlaying && animationsEnabled) ? Math.sin(danceTimer) * 15 : 0;

  ctx.shadowBlur  = 25;
  ctx.shadowColor = `${preset.color}aa`;

  const handFns = {
    rock: drawRockHands, peace: drawPeaceHands, thumbsup: drawThumbsUpHands,
    point: drawPointingHands, snap: drawSnappingHands, elegant: drawElegantHands
  };
  (handFns[preset.handStyle] || drawNormalHands)(cy, leftAvg, rightAvg, danceOffset, preset.color);
  ctx.shadowBlur = 0;
}

// ============================================================================
// HAND DRAWING
// ============================================================================

function drawNormalHands(cy, la, ra, doff, color) {
  const draw = (xPos, yPos, flip) => {
    ctx.save();
    ctx.translate(xPos, yPos);
    const angle = flip * (-15 - (isPlaying ? (la / 255) * 25 + Math.cos(danceTimer * 1.5) * 12 : 0));
    const len   = 50 + (isPlaying ? (la / 255) * 20 + Math.sin(danceTimer * 2) * 8 : 0);
    ctx.rotate(angle * Math.PI / 180);
    const g = ctx.createLinearGradient(0, 0, flip * len, 0);
    g.addColorStop(0, color); g.addColorStop(1, color + '99');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(flip * (len - 10), -10);
    ctx.quadraticCurveTo(flip * len, -10, flip * len, 0);
    ctx.quadraticCurveTo(flip * len, 10, flip * (len - 10), 10);
    ctx.lineTo(0, 10); ctx.closePath(); ctx.fill();
    [[-8, 8], [0, 10], [8, 8]].forEach(([dy, r]) => {
      ctx.beginPath(); ctx.arc(flip * len, dy, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  };
  draw(canvas.width * 0.2,  cy + doff,  1);
  draw(canvas.width * 0.8, cy - doff, -1);
}

function drawRockHands(cy, la, ra, doff, color) {
  const intensity = isPlaying ? (la + ra) / 510 : 0;
  [
    [canvas.width * 0.2, cy + doff, -20 - intensity * 30 + Math.sin(danceTimer * 4) * 15,  15, -18, 5, 18,  0.3, -8, 12, -0.8],
    [canvas.width * 0.8, cy - doff,  20 + intensity * 30 - Math.sin(danceTimer * 4) * 15, -15, -18, 5, 18, -0.3,  8, 12,  0.8]
  ].forEach(([tx, ty, ang, sx, sy, x1, y1, r1, x2, y2, r2]) => {
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang * Math.PI / 180); ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx,  sy, 5, 18,  r1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx, -sy, 5, 18, -r1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x2,  y2, 4, 12,  r2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function drawPeaceHands(cy, la, ra, doff, color) {
  const intensity = isPlaying ? (la + ra) / 510 : 0;
  [
    [canvas.width * 0.2, cy + doff, -10 - intensity * 20,  15, -8,  0.2,  15,  8, -0.2],
    [canvas.width * 0.8, cy - doff,  10 + intensity * 20, -15, -8, -0.2, -15,  8,  0.2]
  ].forEach(([tx, ty, ang, x1, y1, r1, x2, y2, r2]) => {
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang * Math.PI / 180); ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x1, y1, 5, 20, r1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x2, y2, 5, 20, r2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function drawThumbsUpHands(cy, la, ra, doff, color) {
  const bounce = Math.sin(danceTimer * 3) * 10;
  [
    [canvas.width * 0.2, cy + doff + bounce, -90, -20, -0.5],
    [canvas.width * 0.8, cy - doff - bounce,  90,  20,  0.5]
  ].forEach(([tx, ty, ang, tx2, r]) => {
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang * Math.PI / 180); ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0,   0, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(tx2, 0,  6, 20, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function drawPointingHands(cy, la, ra, doff, color) {
  const pulse = Math.sin(danceTimer * 5) * 5;
  [
    [canvas.width * 0.2 + pulse, cy + doff,  25],
    [canvas.width * 0.8 - pulse, cy - doff, -25]
  ].forEach(([tx, ty, px]) => {
    ctx.save(); ctx.translate(tx, ty); ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0,  0, 12, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px, 0,  5, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function drawSnappingHands(cy, la, ra, doff, color) {
  const snap = Math.floor(danceTimer * 2) % 2 === 0 ? 0 : 8;
  [
    [canvas.width * 0.2, cy + doff, -30,  10, -15 - snap, -0.5,  15, 10 + snap,  0.3],
    [canvas.width * 0.8, cy - doff,  30, -10, -15 - snap,  0.5, -15, 10 + snap, -0.3]
  ].forEach(([tx, ty, ang, x1, y1, r1, x2, y2, r2]) => {
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang * Math.PI / 180); ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0,  0,  12, 16, 0,  0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x1, y1,  5, 15, r1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x2, y2,  5, 18, r2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function drawElegantHands(cy, la, ra, doff, color) {
  const wave = Math.sin(danceTimer * 2) * 15;
  [
    [canvas.width * 0.2, cy + doff + wave, -45,  18],
    [canvas.width * 0.8, cy - doff - wave,  45, -18]
  ].forEach(([tx, ty, ang, fx]) => {
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang * Math.PI / 180); ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.ellipse(fx, -12 + i * 8, 4, 16, (fx > 0 ? 0.1 : -0.1) * (i - 1.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
}

// ============================================================================
// DRAG & DROP — QUEUE
// ============================================================================

function setupQueueDragHandlers() {
  const content = document.getElementById('libraryContent');
  if (!content) return;

  content.addEventListener('dragstart', e => {
    const item = e.target.closest('.queue-item');
    if (!item) return;
    draggedQueueIndex = parseInt(item.dataset.queueIndex);
    item.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
  });

  content.addEventListener('dragover', e => {
    e.preventDefault();
    const item = e.target.closest('.queue-item');
    if (!item || draggedQueueIndex === null) return;
    e.dataTransfer.dropEffect = 'move';
    content.querySelectorAll('.queue-item').forEach(i => i.style.borderTop = '');
    item.style.borderTop = '2px solid #6bb3e0';
  });

  content.addEventListener('dragleave', e => {
    const item = e.target.closest('.queue-item');
    if (item) item.style.borderTop = '';
  });

  content.addEventListener('drop', e => {
    e.preventDefault();
    const item = e.target.closest('.queue-item');
    if (!item || draggedQueueIndex === null) return;
    const to = parseInt(item.dataset.queueIndex);
    if (draggedQueueIndex !== to) moveQueueItem(draggedQueueIndex, to);
    content.querySelectorAll('.queue-item').forEach(i => { i.style.opacity = ''; i.style.borderTop = ''; });
  });

  content.addEventListener('dragend', () => {
    draggedQueueIndex = null;
    content.querySelectorAll('.queue-item').forEach(i => { i.style.opacity = ''; i.style.borderTop = ''; });
  });
}

// ============================================================================
// DRAG & DROP — TABS
// ============================================================================

function setupTabDragAndDrop() {
  const tc = document.querySelector('.library-tabs');
  if (!tc || tc._tabDragReady) return;
  tc._tabDragReady = true;

  tc.addEventListener('dragstart', e => {
    if (!e.target.classList.contains('library-tab')) return;
    draggedTab      = e.target;
    draggedTabIndex = tabOrder.indexOf(e.target.dataset.tabName);
    e.target.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  });

  tc.addEventListener('dragover', e => {
    e.preventDefault();
    const tab = e.target.closest('.library-tab');
    if (!tab || !draggedTab || tab === draggedTab) return;
    e.dataTransfer.dropEffect = 'move';
    tc.querySelectorAll('.library-tab').forEach(t => t.style.borderLeft = '');
    tab.style.borderLeft = '3px solid #6bb3e0';
  });

  tc.addEventListener('dragleave', e => {
    const t = e.target.closest('.library-tab');
    if (t) t.style.borderLeft = '';
  });

  tc.addEventListener('drop', e => {
    e.preventDefault();
    const tab = e.target.closest('.library-tab');
    if (!tab || !draggedTab || tab === draggedTab) return;
    const di = tabOrder.indexOf(tab.dataset.tabName);
    if (draggedTabIndex !== di) {
      const [moved] = tabOrder.splice(draggedTabIndex, 1);
      tabOrder.splice(di, 0, moved);
      saveLibrary();
      renderLibraryTabs();
      showQueueNotification('Tab order saved');
    }
    tab.style.borderLeft = '';
  });

  tc.addEventListener('dragend', e => {
    if (e.target.classList.contains('library-tab')) {
      e.target.style.opacity = '';
      tc.querySelectorAll('.library-tab').forEach(t => t.style.borderLeft = '');
    }
    draggedTab = null;
    draggedTabIndex = null;
  });
}

// ============================================================================
// EVENT LISTENERS — PLAYBACK CONTROLS
// ============================================================================

centerBtn.addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  if (!playlist.length) { document.getElementById('addFilesBtn').click(); return; }

  if (!isPlaying) {
    isPlaying = true;
    initAudioContext();
    audioCtx.resume().then(() =>
      audio.play()
        .then(() => {
          centerBtn.classList.add('playing');
          currentEmotion = 'excited';
          if (fadeEffectsEnabled) fadeIn(audio, fadeDuration);
          const mainTab = document.querySelector('.screen-tab[data-view="main"]');
          if (mainTab?.classList.contains('active') && screenShakeEnabled) screen.classList.add('dancing');
          updateMediaSession();
        })
        .catch(err => {
          console.log('Play error:', err);
          isPlaying = false;
          centerBtn.classList.remove('playing');
          alert('Cannot play audio. Please try again.');
        })
    );
  } else {
    if (fadeEffectsEnabled) {
      fadeOut(audio, fadeDuration, () => { audio.pause(); stopPlayback(); audio.volume = volume / 100; });
    } else {
      audio.pause();
      stopPlayback();
    }
  }
});

document.getElementById('prevBtn').addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  currentEmotion = 'curious';
  setTimeout(() => { currentEmotion = 'happy'; }, 400);
  if (!playlist.length) return;
  if (audio.currentTime > 3) audio.currentTime = 0;
  else loadTrack((currentTrackIndex - 1 + playlist.length) % playlist.length);
});

document.getElementById('nextBtn').addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  currentEmotion = 'curious';
  setTimeout(() => { currentEmotion = 'happy'; }, 400);
  if (playlist.length) loadTrack((currentTrackIndex + 1) % playlist.length);
});

document.getElementById('shuffleIcon').addEventListener('click', function(e) {
  e.preventDefault();
  resetIdle();
  shuffleMode = !shuffleMode;
  this.classList.toggle('active', shuffleMode);
  if (!playlist.length) return;
  if (shuffleMode) { shufflePlaylist(); renderLibrary(); }
  else {
    const cur  = playlist[currentTrackIndex];
    playlist   = [...originalPlaylist];
    currentTrackIndex = Math.max(0, playlist.findIndex(t => t.url === cur?.url));
    renderLibrary();
  }
});

document.getElementById('repeatIcon').addEventListener('click', function(e) {
  e.preventDefault();
  resetIdle();
  const modes = ['off', 'all', 'one'];
  const icons = ['↻', '↻', '⟲'];
  const next  = (modes.indexOf(repeatMode) + 1) % 3;
  repeatMode  = modes[next];
  this.textContent = icons[next];
  this.classList.toggle('active', repeatMode !== 'off');
});

document.getElementById('favoriteIcon').addEventListener('click', function(e) {
  e.preventDefault();
  resetIdle();
  const track = playlist[currentTrackIndex];
  if (track) toggleFavorite(track.url);
});

document.getElementById('volUpBtn').addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  if (!playlist.length) { document.getElementById('addFilesBtn').click(); return; }
  volume = Math.min(100, volume + 10);
  audio.volume = volume / 100;
  localStorage.setItem('impVolume', volume);
  showVolumeBar();
});

document.getElementById('volDownBtn').addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  volume = Math.max(0, volume - 10);
  audio.volume = volume / 100;
  localStorage.setItem('impVolume', volume);
  showVolumeBar();
});

// ============================================================================
// EVENT LISTENERS — AUDIO ELEMENT
// ============================================================================

audio.addEventListener('ended', () => {
  const next = dequeueNext();
  if (next) { playFromLibrary(next.url); return; }

  if (repeatMode === 'one') {
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Play error:', e));
  } else if (repeatMode === 'all' || currentTrackIndex < playlist.length - 1) {
    loadTrack((currentTrackIndex + 1) % playlist.length);
    audio.play()
      .then(() => { if (fadeEffectsEnabled) fadeIn(audio, fadeDuration); })
      .catch(e => console.log(e));
  } else {
    if (fadeEffectsEnabled) {
      fadeOut(audio, fadeDuration, () => stopPlayback());
    } else {
      stopPlayback();
    }
  }
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;

  const progress = audio.currentTime / audio.duration;
  volumeLevel.style.width = (progress * 100) + '%';
  updateProgressRing(progress);

  const remaining = audio.duration - audio.currentTime;

  if (crossfadeEnabled && !isCrossfading && remaining <= crossfadeDuration && remaining > 0) {
    preloadNextTrack();
    if (currentTrackIndex < playlist.length - 1 || repeatMode === 'all') crossfadeToNext();
  }

  if (gaplessEnabled && !crossfadeEnabled && !gaplessPreloadFired && remaining <= 5) {
    gaplessPreloadFired = true;
    preloadNextTrack();
  }

  if (normalizeEnabled)     applyNormalization();
  else if (loudnessEnabled) applyLoudnessLeveling();

  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
    try {
      navigator.mediaSession.setPositionState({
        duration:     audio.duration,
        playbackRate: audio.playbackRate,
        position:     audio.currentTime
      });
    } catch {}
  }
});

// Seek bar
const volumeIndicator = document.querySelector('.volume-indicator');
if (volumeIndicator) {
  const getSeekPct = x => Math.max(0, Math.min(1, (x - volumeIndicator.getBoundingClientRect().left) / volumeIndicator.offsetWidth));
  const seek = pct => { audio.currentTime = pct * audio.duration; volumeLevel.style.width = pct * 100 + '%'; LipSyncEngine.reset(); };

  volumeIndicator.addEventListener('click', e => { if (audio.duration) seek(getSeekPct(e.clientX)); });
  volumeIndicator.addEventListener('touchstart', e => { e.preventDefault(); if (audio.duration) seek(getSeekPct(e.touches[0].clientX)); });
  volumeIndicator.addEventListener('touchmove',  e => { e.preventDefault(); if (audio.duration) seek(getSeekPct(e.touches[0].clientX)); });
}

// ============================================================================
// EVENT LISTENERS — FILE INPUT
// ============================================================================

fileInput.addEventListener('change', async e => {
  resetIdle();
  currentEmotion = 'excited';
  setTimeout(() => { currentEmotion = 'loving'; }, 600);
  await handleAudioFiles(Array.from(e.target.files));
  e.target.value = '';
});

folderInput.addEventListener('change', async e => {
  resetIdle();
  currentEmotion = 'excited';
  setTimeout(() => { currentEmotion = 'loving'; }, 600);
  await handleAudioFiles(Array.from(e.target.files));
  e.target.value = '';
});

document.querySelector('.player').addEventListener('dragover', e => e.preventDefault());
document.querySelector('.player').addEventListener('drop', async e => {
  e.preventDefault();
  resetIdle();
  currentEmotion = 'excited';
  trackTitle.textContent = 'Scanning files...';
  trackInfo.textContent  = '';
  const audioFiles = await scanForAudioFiles(Array.from(e.dataTransfer.files));
  if (audioFiles.length) {
    addFilesToLibrary(audioFiles);
    trackTitle.textContent = `Added ${audioFiles.length} track${audioFiles.length > 1 ? 's' : ''}`;
    trackInfo.textContent  = 'Check Library tab';
  } else {
    trackTitle.textContent = 'No audio files found';
    trackInfo.textContent  = '';
  }
});

// ============================================================================
// EVENT LISTENERS — TAB NAVIGATION
// ============================================================================

document.querySelectorAll('.screen-tab').forEach(tab => {
  tab.addEventListener('click', e => {
    e.preventDefault();
    resetIdle();
    const view = tab.dataset.view;
    document.querySelectorAll('.screen-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (view !== 'main') screen.classList.remove('dancing');
    else if (isPlaying && screenShakeEnabled) screen.classList.add('dancing');
    document.querySelector('.volume-indicator')?.classList.toggle('show-on-main', view === 'main');
    document.getElementById('mainView').style.display = view === 'main' ? 'flex' : 'none';
    document.getElementById('libraryView').classList.toggle('active', view === 'library');
    document.getElementById('settingsView').classList.toggle('active', view === 'settings');
  });
});

// ============================================================================
// EVENT LISTENERS — SETTINGS
// ============================================================================

document.getElementById('metadataModal')?.addEventListener('click', e => {
  if (e.target.id === 'metadataModal') closeMetadataEditor();
});

document.getElementById('librarySearch').addEventListener('input', e => {
  librarySearchQuery = e.target.value;
  renderLibrary();
});

document.getElementById('clearLibraryBtn')?.addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  if (!confirm('Clear entire library?')) return;
  Object.assign(musicLibrary, {
    songs: [], albums: new Map(), artists: new Map(),
    genres: new Map(), folders: new Map()
  });
  musicLibrary.favorites.clear();
  musicLibrary.metadata.clear();
  saveLibrary();
  renderLibrary();
  playlist = []; originalPlaylist = []; currentTrackIndex = 0;
  audio.pause(); audio.src = '';
  stopPlayback();
  trackTitle.textContent = 'Library cleared';
  trackInfo.textContent  = '';
  updateTrackCount();
});

document.getElementById('addFilesBtn')?.addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  fileInput.removeAttribute('webkitdirectory');
  fileInput.removeAttribute('directory');
  fileInput.click();
});

document.getElementById('addFolderBtn')?.addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  folderInput.click();
});

document.getElementById('batchMetadataBtn')?.addEventListener('click', e => {
  e.preventDefault();
  resetIdle();
  batchFetchMetadata();
});

setupToggle('autoplayToggle',   v => { autoplayEnabled = v; });
setupToggle('animationsToggle', v => {
  animationsEnabled = v;
  if (!v) { eyeLeft.style.transform = ''; eyeRight.style.transform = ''; }
});
setupToggle('screenShakeToggle', v => {
  screenShakeEnabled = v;
  if (!v) screen.classList.remove('dancing');
  else if (isPlaying && document.querySelector('.screen-tab[data-view="main"]')?.classList.contains('active')) {
    screen.classList.add('dancing');
  }
});
setupToggle('visualizerToggle', v => { visualizerEnabled = v; });

// LipSync v2: auto-mode, no manual toggle needed

// Update phoneme/viseme debug display in settings
setInterval(() => {
  const phEl = document.getElementById('activePhonemeDisplay');
  const viEl = document.getElementById('activeVisemeDisplay');
  if (phEl) phEl.textContent = currentPhoneme || '—';
  if (viEl && LipSyncEngine.isActive()) {
    viEl.textContent = LipSyncEngine.VisemeMapper.map(currentPhoneme) || '—';
  } else if (viEl) {
    viEl.textContent = '—';
  }
}, 100);

setupToggle('gaplessToggle', v => {
  gaplessEnabled = v;
  if (v && crossfadeEnabled) {
    crossfadeEnabled = false;
    disableToggle('crossfadeToggle');
    setDisplayPair('crossfadeDuration', 'crossfadeSlider', false);
  }
});

setupToggle('crossfadeToggle', v => {
  crossfadeEnabled = v;
  setDisplayPair('crossfadeDuration', 'crossfadeSlider', v);
  if (v && gaplessEnabled) { gaplessEnabled = false; disableToggle('gaplessToggle'); }
});

setupToggle('normalizeToggle', v => {
  normalizeEnabled = v;
  if (v) { replayGainEnabled = false; loudnessEnabled = false; disableToggle('replayGainToggle'); disableToggle('loudnessToggle'); }
});

setupToggle('replayGainToggle', v => {
  replayGainEnabled = v;
  if (v) { normalizeEnabled = false; loudnessEnabled = false; disableToggle('normalizeToggle'); disableToggle('loudnessToggle'); applyReplayGain(); }
});

setupToggle('fadeEffectsToggle', v => {
  fadeEffectsEnabled = v;
  setDisplayPair('fadeDuration', 'fadeSlider', v);
});

setupToggle('loudnessToggle', v => {
  loudnessEnabled = v;
  if (v) { normalizeEnabled = false; replayGainEnabled = false; disableToggle('normalizeToggle'); disableToggle('replayGainToggle'); }
});

document.getElementById('speedSlider')?.addEventListener('input', e => {
  const s = e.target.value / 100;
  document.getElementById('speedValue').textContent = s.toFixed(1) + 'x';
  updatePlaybackSpeed(s);
});
document.getElementById('crossfadeSlider')?.addEventListener('input', e => {
  crossfadeDuration = parseInt(e.target.value);
  document.getElementById('crossfadeValue').textContent = crossfadeDuration + 's';
});
document.getElementById('fadeSlider')?.addEventListener('input', e => {
  fadeDuration = parseFloat(e.target.value);
  document.getElementById('fadeValue').textContent = fadeDuration.toFixed(1) + 's';
});

// ============================================================================
// EVENT LISTENERS — TOUCH / SWIPE
// ============================================================================

const mainView = document.getElementById('mainView');

mainView.addEventListener('touchstart', e => {
  touchStartX  = e.changedTouches[0].screenX;
  touchStartY  = e.changedTouches[0].screenY;
  swipeStartTime = Date.now();
}, { passive: true });

mainView.addEventListener('touchend', e => {
  const dx  = e.changedTouches[0].screenX - touchStartX;
  const dy  = e.changedTouches[0].screenY - touchStartY;
  const vel = Math.abs(dx) / (Date.now() - swipeStartTime);
  resetIdle();

  const onMain = document.querySelector('.screen-tab[data-view="main"]')?.classList.contains('active');

  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) > 50 && vel > 0.3) {
      if (onMain) cyclePreset(dx > 0 ? -1 : 1);
      else if (playlist.length) {
        if (dx > 0) document.getElementById('prevBtn').click();
        else        document.getElementById('nextBtn').click();
      }
    }
  } else if (Math.abs(dy) > 50) {
    volume = dy > 0 ? Math.max(0, volume - 10) : Math.min(100, volume + 10);
    audio.volume = volume / 100;
    localStorage.setItem('impVolume', volume);
    showVolumeBar();
  }
}, { passive: true });

// ============================================================================
// EVENT LISTENERS — KEYBOARD
// ============================================================================

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  resetIdle();

  const adjustVolume = delta => {
    volume = Math.max(0, Math.min(100, volume + delta));
    audio.volume = volume / 100;
    localStorage.setItem('impVolume', volume);
    showVolumeBar();
  };

  switch (e.code) {
    case 'Space':      e.preventDefault(); centerBtn.click(); break;
    case 'ArrowRight': e.preventDefault(); e.shiftKey ? cyclePreset(1)  : document.getElementById('nextBtn').click(); break;
    case 'ArrowLeft':  e.preventDefault(); e.shiftKey ? cyclePreset(-1) : document.getElementById('prevBtn').click(); break;
    case 'ArrowUp':    e.preventDefault(); adjustVolume(5);  break;
    case 'ArrowDown':  e.preventDefault(); adjustVolume(-5); break;
    case 'KeyE':       e.preventDefault(); cyclePreset(1); break;
    case 'KeyF':
      e.preventDefault();
      const t = playlist[currentTrackIndex];
      if (t) { toggleFavorite(t.url); showQueueNotification(musicLibrary.favorites.has(t.url) ? '❤ Favorited' : '♡ Unfavorited'); }
      break;
    case 'KeyM':
      e.preventDefault();
      audio.muted = !audio.muted;
      showQueueNotification(audio.muted ? '🔇 Muted' : '🔊 Unmuted');
      break;
    case 'Escape':
      closeMetadataEditor();
      closeModal();
      break;
  }
});

// ============================================================================
// WINDOW EVENTS
// ============================================================================

setViewportHeight();
window.addEventListener('resize', () => {
  setViewportHeight();
  canvas.width  = canvas.offsetWidth  * 2;
  canvas.height = canvas.offsetHeight * 2;
});
window.addEventListener('orientationchange', () => setTimeout(setViewportHeight, 100));

setInterval(() => {
  if (!batterySupported && isPlaying) {
    batteryLevel = Math.max(0, batteryLevel - 0.05);
    updateBatteryDisplay();
    updateBatteryIndicators();
  }
}, 1000);

// ============================================================================
// INIT
// ============================================================================

canvas.width  = canvas.offsetWidth  * 2;
canvas.height = canvas.offsetHeight * 2;
audio.volume  = volume / 100;
audio.load();

loadLibrary();
renderLibraryTabs();
renderLibrary();
updateTrackCount();
updateFavoriteButton();
createPresetButtons();
applyEQPreset(currentPreset);
initBattery();
drawWave();
