const samples = new Map([
    ['live', {
        label: 'Live sample',
        title: 'Fortnite live with ModPackDad',
        copy: 'This design sample shows where the live video appears.',
        chat: 'Combined chat messages appear here during a broadcast.',
    }],
    ['offline', {
        label: 'Offline sample',
        title: 'ModPackDad is offline',
        copy: 'Check YouTube for recent uploads while you wait for the next stream.',
        chat: 'Chat is quiet while the stream is offline.',
    }],
]);

const requestedView = new URLSearchParams(window.location.search).get('view');
const sample = samples.get(requestedView);
const view = sample ? requestedView : 'current';
document.querySelector(`[data-view="${view}"]`).setAttribute('aria-current', 'page');

if (sample) {
    const setText = (id, value) => {
        document.getElementById(id).textContent = value;
    };
    document.getElementById('broadcast-state').className = `broadcast-state broadcast-state--${view}`;
    document.getElementById('player-shell').dataset.state = 'fallback';
    document.getElementById('provider-health').hidden = true;
    setText('broadcast-state-label', sample.label);
    setText('player-fallback-title', sample.title);
    setText('player-fallback-copy', sample.copy);
    setText('stream-kicker', 'Design sample');
    setText('stream-title', sample.title);
    setText('stream-summary', 'Select Current broadcast to check the actual stream.');
    setText('chat-connection-label', 'Design sample');
    setText('chat-empty', sample.chat);
} else {
    const playerApi = document.createElement('script');
    playerApi.src = 'https://www.youtube.com/iframe_api';
    playerApi.async = true;
    document.head.append(playerApi);
    import('/live/live.js');
}
