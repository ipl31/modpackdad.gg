const required = [
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'TWITCH_BROADCASTER_USER_ID',
  'TWITCH_BOT_USER_ID',
  'TWITCH_EVENTSUB_SECRET',
  'TWITCH_CALLBACK_URL',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  await createSubscriptions();
}

async function createSubscriptions() {
  const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
  tokenUrl.searchParams.set('client_id', process.env.TWITCH_CLIENT_ID);
  tokenUrl.searchParams.set('client_secret', process.env.TWITCH_CLIENT_SECRET);
  tokenUrl.searchParams.set('grant_type', 'client_credentials');
  const tokenResponse = await fetch(tokenUrl, { method: 'POST' });
  if (!tokenResponse.ok) throw new Error(`Twitch token request failed (${tokenResponse.status})`);
  const { access_token: accessToken } = await tokenResponse.json();

  const types = [
    'channel.chat.message',
    'channel.chat.message_delete',
    'channel.chat.clear_user_messages',
    'channel.chat.clear',
  ];

  for (const type of types) {
    const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'client-id': process.env.TWITCH_CLIENT_ID,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type,
        version: '1',
        condition: {
          broadcaster_user_id: process.env.TWITCH_BROADCASTER_USER_ID,
          user_id: process.env.TWITCH_BOT_USER_ID,
        },
        transport: {
          method: 'webhook',
          callback: process.env.TWITCH_CALLBACK_URL,
          secret: process.env.TWITCH_EVENTSUB_SECRET,
        },
      }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`${type} subscription failed (${response.status}): ${body}`);
    console.log(`${type}: subscription requested`);
  }
}
