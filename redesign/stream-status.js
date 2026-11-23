const label = document.getElementById('stream-status');
const twitchLink = document.getElementById('watch-twitch');
const youtubeLink = document.getElementById('watch-youtube');

async function refreshStatus() {
    let twitch = 'unavailable';
    let youtube = 'unavailable';
    try {
        const response = await fetch('/api/live/status', {
            headers: { accept: 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(7000),
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
            throw new Error('Status API unavailable');
        }
        const status = await response.json();
        if (!status.stale) {
            if (status.state === 'live' && status.broadcast?.videoId) youtube = 'live';
            if (status.state === 'offline' || status.state === 'upcoming') youtube = 'offline';
        }
        if (status.twitchState === 'live' || status.twitchState === 'offline') {
            twitch = status.twitchState;
        }
    } catch {
        // Unknown status never exposes a watch link.
    }

    twitchLink.hidden = twitch !== 'live';
    youtubeLink.hidden = youtube !== 'live';
    if (twitch === 'live' || youtube === 'live') {
        label.dataset.state = 'live';
        label.textContent = 'Live now';
    } else if (twitch === 'offline' && youtube === 'offline') {
        label.dataset.state = 'offline';
        label.textContent = 'Offline';
    } else {
        label.dataset.state = 'unavailable';
        label.textContent = 'Live status unavailable';
    }
}

refreshStatus();
window.setInterval(refreshStatus, 30_000);
