const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_MESSAGE_LENGTH = 1_000;

export function sanitizeText(value, maxLength = MAX_MESSAGE_LENGTH) {
  return String(value ?? '')
    .replace(CONTROL_CHARACTERS, '')
    .slice(0, maxLength);
}

function youtubeBadges(author = {}) {
  const badges = [];
  if (author.isChatOwner) badges.push('broadcaster');
  if (author.isChatModerator) badges.push('moderator');
  if (author.isChatSponsor) badges.push('member');
  if (author.isVerified) badges.push('verified');
  return badges;
}

export function normalizeYouTubeMessage(item) {
  const { id, snippet = {}, authorDetails = {} } = item ?? {};
  if (!id || !snippet.displayMessage || moderationDirective('youtube', item)) return null;

  return {
    id: `youtube:${id}`,
    platform: 'youtube',
    platformMessageId: id,
    userId: sanitizeText(authorDetails.channelId, 160),
    username: sanitizeText(authorDetails.displayName, 120),
    displayName: sanitizeText(authorDetails.displayName, 120),
    avatar: sanitizeText(authorDetails.profileImageUrl, 500),
    badges: youtubeBadges(authorDetails),
    message: sanitizeText(snippet.displayMessage),
    timestamp: snippet.publishedAt || new Date().toISOString(),
    metadata: {},
  };
}

export function normalizeTwitchMessage(event, timestamp = new Date().toISOString()) {
  if (!event?.message_id || !event?.message?.text) return null;

  return {
    id: `twitch:${event.message_id}`,
    platform: 'twitch',
    platformMessageId: event.message_id,
    userId: sanitizeText(event.chatter_user_id, 160),
    username: sanitizeText(event.chatter_user_login, 120),
    displayName: sanitizeText(event.chatter_user_name || event.chatter_user_login, 120),
    avatar: '',
    badges: (event.badges || [])
      .map((badge) => sanitizeText(badge?.set_id, 24))
      .filter(Boolean)
      .slice(0, 8),
    message: sanitizeText(event.message.text),
    timestamp,
    metadata: {
      color: sanitizeText(event.color, 24),
    },
  };
}

export function moderationDirective(platform, payload) {
  if (platform === 'youtube') {
    const snippet = payload?.snippet ?? {};
    if (snippet.type === 'tombstone') {
      return { type: 'chat.clear', platform };
    }
    if (snippet.type === 'messageDeletedEvent') {
      const deletedId = snippet.messageDeletedDetails?.deletedMessageId;
      return deletedId ? {
        type: 'chat.delete',
        platform,
        messageId: `youtube:${deletedId}`,
      } : null;
    }
    if (snippet.type === 'userBannedEvent') {
      const userId = snippet.userBannedDetails?.bannedUserDetails?.channelId;
      return userId ? { type: 'chat.clear_user', platform, userId } : null;
    }
    return null;
  }

  if (platform === 'twitch') {
    const type = payload?.subscriptionType;
    const event = payload?.event ?? {};
    if (type === 'channel.chat.message_delete') {
      return event.message_id ? {
        type: 'chat.delete',
        platform,
        messageId: `twitch:${event.message_id}`,
      } : null;
    }
    if (type === 'channel.chat.clear_user_messages') {
      return event.target_user_id ? {
        type: 'chat.clear_user',
        platform,
        userId: event.target_user_id,
      } : null;
    }
    if (type === 'channel.chat.clear') {
      return { type: 'chat.clear', platform };
    }
  }

  return null;
}
