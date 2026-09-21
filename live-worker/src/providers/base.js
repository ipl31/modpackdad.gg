export class ChatProvider {
  constructor(name) {
    this.name = name;
    this.health = {
      status: 'unknown',
      message: 'Provider has not connected yet.',
      updatedAt: null,
    };
  }

  markHealthy(message = 'Connected') {
    this.health = { status: 'healthy', message, updatedAt: new Date().toISOString() };
  }

  markDegraded(message) {
    this.health = { status: 'degraded', message, updatedAt: new Date().toISOString() };
  }

  markUnavailable(message) {
    this.health = { status: 'unavailable', message, updatedAt: new Date().toISOString() };
  }

  getHealth() {
    return { ...this.health };
  }
}
