export class ChatBuffer {
  constructor({ maxMessages = 300, suppressedIdentities = [] } = {}) {
    this.maxMessages = Math.max(1, maxMessages);
    this.messages = new Map();
    this.suppressedIdentities = new Set(suppressedIdentities);
  }

  isSuppressed(message) {
    return this.suppressedIdentities.has(`${message.platform}:${message.userId}`)
      || this.suppressedIdentities.has(`${message.platform}:message:${message.platformMessageId}`);
  }

  add(message) {
    if (!message?.id || this.messages.has(message.id) || this.isSuppressed(message)) return false;
    this.messages.set(message.id, message);
    while (this.messages.size > this.maxMessages) {
      this.messages.delete(this.messages.keys().next().value);
    }
    return true;
  }

  delete(messageId) {
    return this.messages.delete(messageId);
  }

  clearUser(platform, userId) {
    const removed = [];
    for (const [id, message] of this.messages) {
      if (message.platform === platform && message.userId === userId) {
        this.messages.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  clearPlatform(platform) {
    const removed = [];
    for (const [id, message] of this.messages) {
      if (message.platform === platform) {
        this.messages.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  list() {
    return [...this.messages.values()];
  }
}
