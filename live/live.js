const MAX_RENDERED_MESSAGES = 300;
const STATUS_REFRESH_MS = 30_000;
const CHAT_RECONNECT_MAX_MS = 30_000;
const AT_BOTTOM_THRESHOLD_PX = 72;

const elements = {
    broadcastState: document.getElementById('broadcast-state'),
    broadcastStateLabel: document.getElementById('broadcast-state-label'),
    playerShell: document.getElementById('player-shell'),
    playerFallbackTitle: document.getElementById('player-fallback-title'),
    playerFallbackCopy: document.getElementById('player-fallback-copy'),
    fallbackAction: document.getElementById('fallback-action'),
    streamKicker: document.getElementById('stream-kicker'),
    streamTitle: document.getElementById('stream-title'),
    streamSummary: document.getElementById('stream-summary'),
    categoryFact: document.getElementById('category-fact'),
    streamCategory: document.getElementById('stream-category'),
    timeFact: document.getElementById('time-fact'),
    timeLabel: document.getElementById('time-label'),
    streamTime: document.getElementById('stream-time'),
    youtubeWatchLink: document.getElementById('youtube-watch-link'),
    latestVideo: document.getElementById('latest-video'),
    latestVideoThumbnail: document.getElementById('latest-video-thumbnail'),
    latestVideoTitle: document.getElementById('latest-video-title'),
    latestVideoLink: document.getElementById('latest-video-link'),
    chatConnection: document.getElementById('chat-connection'),
    chatConnectionLabel: document.getElementById('chat-connection-label'),
    providerHealth: document.getElementById('provider-health'),
    viewerCount: document.getElementById('viewer-count'),
    chatLog: document.getElementById('chat-log'),
    chatEmpty: document.getElementById('chat-empty'),
    jumpLatest: document.getElementById('jump-latest'),
};

const state = {
    player: null,
    playerVideoId: null,
    playerMountGeneration: 0,
    playerPending: false,
    status: null,
    messages: new Map(),
    socket: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    statusTimer: null,
    durationTimer: null,
    userScrolledAway: false,
    unloading: false,
};

function apiUrl(path) {
    return new URL(path, window.location.origin).toString();
}

function chatUrl() {
    const url = new URL('/api/live/chat', window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
}

function safeHttpsUrl(value, allowedHosts, fallback) {
    try {
        const url = new URL(value);
        if (url.protocol === 'https:' && allowedHosts.has(url.hostname)) return url.toString();
    } catch {
        // Use the known-safe fallback below.
    }
    return fallback;
}

const YOUTUBE_LINK_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be']);
const YOUTUBE_IMAGE_HOSTS = new Set(['i.ytimg.com', 'yt3.ggpht.com']);

function isNearBottom() {
    const remaining = elements.chatLog.scrollHeight - elements.chatLog.scrollTop - elements.chatLog.clientHeight;
    return remaining <= AT_BOTTOM_THRESHOLD_PX;
}

function scrollToLatest() {
    elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
    state.userScrolledAway = false;
    elements.jumpLatest.hidden = true;
}

function setConnectionState(value, label) {
    elements.chatConnection.dataset.state = value;
    elements.chatConnectionLabel.textContent = label;
}

function setBroadcastState(value, label) {
    elements.broadcastState.className = `broadcast-state broadcast-state--${value}`;
    elements.broadcastStateLabel.textContent = label;
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

function formatElapsed(startedAt) {
    if (!startedAt) return '';
    const elapsed = Math.max(0, Date.now() - new Date(startedAt).getTime());
    const totalMinutes = Math.floor(elapsed / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    return `${minutes}m`;
}

function reportTelemetry(event, details = {}) {
    const allowed = new Set([
        'page_view',
        'player_ready',
        'player_error',
        'chat_connected',
        'chat_disconnected',
        'status_error',
    ]);
    if (!allowed.has(event)) return;

    const payload = JSON.stringify({ event, details, occurredAt: new Date().toISOString() });
    if (navigator.sendBeacon) {
        navigator.sendBeacon(apiUrl('/api/live/telemetry'), new Blob([payload], { type: 'application/json' }));
        return;
    }

    fetch(apiUrl('/api/live/telemetry'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
    }).catch(() => {});
}

function showPlayerFallback(title, copy, actionHref = 'https://youtube.com/@modpackdad') {
    elements.playerShell.dataset.state = 'fallback';
    elements.playerFallbackTitle.textContent = title;
    elements.playerFallbackCopy.textContent = copy;
    elements.fallbackAction.href = safeHttpsUrl(actionHref, YOUTUBE_LINK_HOSTS, 'https://youtube.com/@modpackdad');
}

function renderBroadcastPlayer(broadcast) {
    if (broadcast.embeddable === false) {
        state.playerVideoId = null;
        resetPlayerContainer();
        showPlayerFallback(
            'This broadcast cannot be embedded',
            'Watch directly on YouTube to continue.',
            broadcast.watchUrl,
        );
        return;
    }
    mountPlayer(broadcast.videoId);
}

function waitForYouTubeApi(timeoutMs = 10_000) {
    if (window.YT?.Player) return Promise.resolve(window.YT);

    return new Promise((resolve, reject) => {
        const previous = window.onYouTubeIframeAPIReady;
        const timeout = window.setTimeout(() => reject(new Error('YouTube player API timed out')), timeoutMs);
        window.onYouTubeIframeAPIReady = () => {
            window.clearTimeout(timeout);
            if (typeof previous === 'function') previous();
            resolve(window.YT);
        };
    });
}

function resetPlayerContainer({ invalidatePending = true } = {}) {
    if (invalidatePending) state.playerMountGeneration += 1;
    if (state.player?.destroy) state.player.destroy();
    state.player = null;
    state.playerPending = false;
    let container = document.getElementById('youtube-player');
    if (!container || container.tagName === 'IFRAME') {
        container?.remove();
        container = document.createElement('section');
        container.id = 'youtube-player';
        container.className = 'youtube-player';
        container.setAttribute('aria-label', 'ModPackDad YouTube livestream player');
        document.getElementById('player-fallback').before(container);
    } else {
        container.replaceChildren();
    }
}

async function mountPlayer(videoId) {
    if (!videoId || (state.playerVideoId === videoId && (state.player || state.playerPending))) return;

    const generation = state.playerMountGeneration + 1;
    state.playerMountGeneration = generation;
    state.playerVideoId = videoId;
    resetPlayerContainer({ invalidatePending: false });
    state.playerPending = true;
    elements.playerShell.dataset.state = 'loading';

    try {
        const YT = await waitForYouTubeApi();
        if (generation !== state.playerMountGeneration || state.playerVideoId !== videoId) return;
        state.player = new YT.Player('youtube-player', {
            videoId,
            width: '100%',
            height: '100%',
            playerVars: {
                autoplay: 0,
                controls: 1,
                playsinline: 1,
                rel: 0,
                origin: window.location.origin,
            },
            events: {
                onReady: () => {
                    if (generation !== state.playerMountGeneration || state.playerVideoId !== videoId) return;
                    state.playerPending = false;
                    elements.playerShell.dataset.state = 'ready';
                    reportTelemetry('player_ready', { videoId });
                },
                onError: (event) => {
                    if (generation !== state.playerMountGeneration || state.playerVideoId !== videoId) return;
                    state.playerVideoId = null;
                    resetPlayerContainer();
                    showPlayerFallback(
                        'The embedded player is unavailable',
                        'The stream may still be available directly on YouTube.',
                        `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
                    );
                    reportTelemetry('player_error', { code: event.data, videoId });
                },
            },
        });
    } catch (error) {
        if (generation !== state.playerMountGeneration || state.playerVideoId !== videoId) return;
        state.playerVideoId = null;
        resetPlayerContainer();
        showPlayerFallback(
            'The embedded player could not load',
            'Open YouTube to continue watching while the player reconnects.',
            `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        );
        reportTelemetry('player_error', { reason: error.message, videoId });
    }
}

function renderLatestVideo(video) {
    if (!video?.videoId) {
        elements.latestVideo.hidden = true;
        return;
    }

    elements.latestVideo.hidden = false;
    elements.latestVideoTitle.textContent = video.title || 'Latest video';
    const fallbackVideoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
    elements.latestVideoLink.href = safeHttpsUrl(video.url, YOUTUBE_LINK_HOSTS, fallbackVideoUrl);
    if (video.thumbnail) {
        elements.latestVideoThumbnail.src = safeHttpsUrl(video.thumbnail, YOUTUBE_IMAGE_HOSTS, '../logo.jpg');
        elements.latestVideoThumbnail.alt = video.title ? `Thumbnail for ${video.title}` : 'Latest ModPackDad video thumbnail';
    } else {
        elements.latestVideoThumbnail.removeAttribute('src');
        elements.latestVideoThumbnail.alt = '';
    }
}

function renderStatus(status) {
    state.status = status;
    window.clearInterval(state.durationTimer);
    state.durationTimer = null;

    const broadcast = status?.broadcast;
    const mode = status?.state || 'unavailable';
    const watchUrl = broadcast?.watchUrl || 'https://youtube.com/@modpackdad';
    elements.youtubeWatchLink.href = safeHttpsUrl(watchUrl, YOUTUBE_LINK_HOSTS, 'https://youtube.com/@modpackdad');
    renderLatestVideo(null);

    elements.categoryFact.hidden = !broadcast?.category;
    elements.streamCategory.textContent = broadcast?.category || '';
    elements.timeFact.hidden = true;

    if (mode === 'live' && broadcast) {
        setBroadcastState('live', 'Live now');
        elements.streamKicker.textContent = 'Now playing';
        elements.streamTitle.textContent = broadcast.title || 'ModPackDad is live';
        elements.streamSummary.textContent = status.stale
            ? 'Live metadata may be delayed, but the player remains available.'
            : 'Live on ModPackDad, powered by YouTube video delivery.';
        elements.timeFact.hidden = !broadcast.actualStartTime;
        elements.timeLabel.textContent = 'Live for';
        const updateDuration = () => {
            elements.streamTime.textContent = formatElapsed(broadcast.actualStartTime);
        };
        updateDuration();
        state.durationTimer = window.setInterval(updateDuration, 30_000);
        renderBroadcastPlayer(broadcast);
        return;
    }

    if (mode === 'upcoming' && broadcast) {
        setBroadcastState('upcoming', 'Scheduled');
        elements.streamKicker.textContent = 'Next broadcast';
        elements.streamTitle.textContent = broadcast.title || 'Next ModPackDad stream';
        const scheduled = formatDateTime(broadcast.scheduledStartTime);
        elements.streamSummary.textContent = scheduled
            ? `Scheduled for ${scheduled}. The player will update automatically when the broadcast starts.`
            : 'An upcoming broadcast is scheduled. Check back here when it begins.';
        elements.timeFact.hidden = !broadcast.scheduledStartTime;
        elements.timeLabel.textContent = 'Scheduled';
        elements.streamTime.textContent = scheduled;
        renderBroadcastPlayer(broadcast);
        return;
    }

    if (mode === 'offline') {
        setBroadcastState('offline', 'Offline');
        elements.streamKicker.textContent = 'Stream status';
        renderLatestVideo(status?.latestVideo);
        elements.streamTitle.textContent = 'The stream is offline';
        elements.streamSummary.textContent = status?.latestVideo
            ? 'Catch up with the latest ModPackDad video while waiting for the next live stream.'
            : 'There is no scheduled broadcast right now. Follow on YouTube or Twitch for the next notification.';
        state.playerVideoId = null;
        resetPlayerContainer();
        showPlayerFallback('ModPackDad is offline', 'No scheduled broadcast is currently available.');
        return;
    }

    setBroadcastState('unavailable', 'Status unavailable');
    elements.streamKicker.textContent = 'Service status';
    elements.streamTitle.textContent = 'Stream status is temporarily unavailable';
    elements.streamSummary.textContent = 'The website could not reach the live-status service. You can still check YouTube or Twitch directly.';
    state.playerVideoId = null;
    resetPlayerContainer();
    showPlayerFallback('Live status is unavailable', 'Use the platform links below while the website reconnects.');
}

async function refreshStatus() {
    try {
        const response = await fetch(apiUrl('/api/live/status'), {
            headers: { accept: 'application/json' },
            cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Live status returned ${response.status}`);
        renderStatus(await response.json());
    } catch (error) {
        if (!state.status) renderStatus({ state: 'unavailable' });
        reportTelemetry('status_error', { reason: error.message });
    }
}

function providerLabel(platform) {
    if (platform === 'youtube') return 'YT';
    if (platform === 'twitch') return 'T';
    return 'MPD';
}

function safeBadges(badges) {
    if (!Array.isArray(badges)) return [];
    return badges
        .map((badge) => typeof badge === 'string' ? badge : badge?.title || badge?.name)
        .filter(Boolean)
        .slice(0, 4)
        .map((badge) => String(badge).slice(0, 24));
}

function createMessageElement(message) {
    const article = document.createElement('article');
    article.className = 'chat-message';
    article.dataset.messageId = message.id;
    article.dataset.platform = message.platform || 'mpd';
    article.dataset.userId = message.userId || '';

    const source = document.createElement('i');
    source.className = 'chat-platform';
    source.textContent = providerLabel(message.platform);
    source.title = message.platform === 'youtube' ? 'YouTube' : message.platform === 'twitch' ? 'Twitch' : 'ModPackDad';

    const line = document.createElement('p');
    line.className = 'chat-line';

    for (const badge of safeBadges(message.badges)) {
        const badgeElement = document.createElement('span');
        badgeElement.className = 'chat-badge';
        badgeElement.textContent = badge;
        line.append(badgeElement);
    }

    const author = document.createElement('span');
    author.className = 'chat-author';
    author.textContent = `${message.displayName || message.username || 'Viewer'}:`;
    line.append(author);

    const text = document.createElement('span');
    text.className = 'chat-text';
    text.textContent = message.message || '';
    line.append(text);

    if (message.timestamp) {
        const time = document.createElement('time');
        time.className = 'chat-time';
        time.dateTime = message.timestamp;
        time.textContent = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(message.timestamp));
        line.append(time);
    }

    article.append(source, line);
    return article;
}

function updateChatEmptyState() {
    elements.chatEmpty.hidden = state.messages.size > 0;
}

function appendMessage(message, { suppressScroll = false } = {}) {
    if (!message?.id || state.messages.has(message.id)) return;

    const shouldFollow = !state.userScrolledAway && isNearBottom();
    state.messages.set(message.id, message);
    updateChatEmptyState();
    elements.chatLog.append(createMessageElement(message));

    while (state.messages.size > MAX_RENDERED_MESSAGES) {
        const oldestId = state.messages.keys().next().value;
        state.messages.delete(oldestId);
        elements.chatLog.querySelector(`[data-message-id="${CSS.escape(oldestId)}"]`)?.remove();
    }

    if (!suppressScroll && shouldFollow) {
        scrollToLatest();
    } else if (!suppressScroll) {
        elements.jumpLatest.hidden = false;
    }
}

function deleteMessage(messageId) {
    if (!messageId) return;
    state.messages.delete(messageId);
    elements.chatLog.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.remove();
    updateChatEmptyState();
}

function clearPlatform(platform) {
    for (const [id, message] of state.messages) {
        if (message.platform === platform) deleteMessage(id);
    }
}

function clearUser(platform, userId) {
    for (const [id, message] of state.messages) {
        if (message.platform === platform && message.userId === userId) deleteMessage(id);
    }
}

function updateProviderHealth(health = {}) {
    for (const pill of elements.providerHealth.querySelectorAll('.provider-pill')) {
        const provider = pill.dataset.provider;
        pill.dataset.status = health[provider]?.status || 'unknown';
        const detail = health[provider]?.message;
        pill.title = detail || `${provider} status: ${pill.dataset.status}`;
        const statusText = pill.querySelector('.provider-status-text');
        if (statusText) statusText.textContent = `: ${pill.dataset.status}`;
    }
}

function updateViewerCount(count) {
    if (!Number.isFinite(count) || count < 1) {
        elements.viewerCount.hidden = true;
        return;
    }
    elements.viewerCount.hidden = false;
    elements.viewerCount.textContent = `${count} website viewer${count === 1 ? '' : 's'}`;
}

function handleChatEvent(payload) {
    switch (payload?.type) {
        case 'snapshot':
            {
            const shouldFollow = !state.userScrolledAway && isNearBottom();
            state.messages.clear();
            elements.chatLog.querySelectorAll('.chat-message').forEach((node) => node.remove());
            for (const message of payload.messages || []) appendMessage(message, { suppressScroll: true });
            updateChatEmptyState();
            if (shouldFollow) scrollToLatest();
            else {
                state.userScrolledAway = true;
                elements.jumpLatest.hidden = state.messages.size === 0;
            }
            if (payload.status) renderStatus(payload.status);
            updateProviderHealth(payload.providerHealth);
            updateViewerCount(payload.viewerCount);
            break;
            }
        case 'chat.message':
            appendMessage(payload.message);
            break;
        case 'chat.delete':
            deleteMessage(payload.messageId);
            break;
        case 'chat.clear_user':
            clearUser(payload.platform, payload.userId);
            break;
        case 'chat.clear':
            clearPlatform(payload.platform);
            break;
        case 'status':
            renderStatus(payload.status);
            break;
        case 'provider.health':
            updateProviderHealth(payload.providers);
            break;
        case 'viewer.count':
            updateViewerCount(payload.count);
            break;
        default:
            break;
    }
}

function scheduleReconnect() {
    if (state.unloading || state.reconnectTimer) return;
    const delay = Math.min(CHAT_RECONNECT_MAX_MS, 1_000 * (2 ** state.reconnectAttempts));
    const jittered = Math.round(delay * (0.8 + Math.random() * 0.4));
    state.reconnectAttempts += 1;
    setConnectionState('reconnecting', `Retrying in ${Math.ceil(jittered / 1_000)}s`);
    state.reconnectTimer = window.setTimeout(() => {
        state.reconnectTimer = null;
        connectChat();
    }, jittered);
}

function connectChat() {
    if (state.unloading || state.socket?.readyState === WebSocket.OPEN || state.socket?.readyState === WebSocket.CONNECTING) return;
    setConnectionState('connecting', 'Connecting');

    let socket;
    try {
        socket = new WebSocket(chatUrl());
    } catch {
        setConnectionState('unavailable', 'Chat unavailable');
        scheduleReconnect();
        return;
    }

    state.socket = socket;
    socket.addEventListener('open', () => {
        state.reconnectAttempts = 0;
        setConnectionState('connected', 'Connected');
        reportTelemetry('chat_connected');
    });
    socket.addEventListener('message', (event) => {
        try {
            handleChatEvent(JSON.parse(event.data));
        } catch {
            // Ignore malformed server messages without breaking the live feed.
        }
    });
    socket.addEventListener('close', () => {
        if (state.socket === socket) state.socket = null;
        if (!state.unloading) {
            reportTelemetry('chat_disconnected');
            scheduleReconnect();
        }
    });
    socket.addEventListener('error', () => {
        socket.close();
    });
}

elements.chatLog.addEventListener('scroll', () => {
    state.userScrolledAway = !isNearBottom();
    elements.jumpLatest.hidden = !state.userScrolledAway;
}, { passive: true });

elements.jumpLatest.addEventListener('click', scrollToLatest);

function arrangeResponsiveOrder() {
    const layout = document.querySelector('.live-layout');
    const chat = document.querySelector('.chat-card');
    const info = document.querySelector('.stream-card');
    if (window.matchMedia('(max-width: 900px)').matches) {
        if (layout.firstElementChild !== chat) layout.insertBefore(chat, info);
    } else if (layout.firstElementChild !== info) {
        layout.insertBefore(info, chat);
    }
}

function startLiveServices() {
    state.unloading = false;
    refreshStatus();
    connectChat();
    window.clearInterval(state.statusTimer);
    state.statusTimer = window.setInterval(refreshStatus, STATUS_REFRESH_MS);
}

window.addEventListener('resize', arrangeResponsiveOrder, { passive: true });

window.addEventListener('pagehide', () => {
    state.unloading = true;
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    window.clearInterval(state.statusTimer);
    window.clearInterval(state.durationTimer);
    state.socket?.close(1000, 'page closed');
});

window.addEventListener('pageshow', (event) => {
    if (event.persisted) startLiveServices();
});

reportTelemetry('page_view');
arrangeResponsiveOrder();
startLiveServices();
