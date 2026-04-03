import { createSessionState } from '../../shared/src/session-state.js';

export class InMemorySessionStore {
  constructor() {
    this.sessions = new Map();
  }

  create(sessionId) {
    const session = createSessionState(sessionId);
    this.sessions.set(session.sessionId, session);
    return session;
  }

  get(sessionId) {
    return this.sessions.get(sessionId);
  }

  ensure(sessionId) {
    return this.get(sessionId) ?? this.create(sessionId);
  }

  save(session) {
    this.sessions.set(session.sessionId, session);
    return session;
  }

  list() {
    return [...this.sessions.values()];
  }
}
