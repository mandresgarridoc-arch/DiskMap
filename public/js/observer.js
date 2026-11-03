// public/js/observer.js
// Frontend Observer Pattern implementation
// Mirrors backend observer for scan state updates

class Observable {
  constructor() {
    this.observers = [];
  }
  subscribe(observer) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
    return () => {
      this.observers = this.observers.filter(o => o !== observer);
    };
  }
  notify(event, data) {
    this.observers.forEach(obs => {
      try {
        if (typeof obs === 'function') obs(event, data);
        else if (typeof obs.update === 'function') obs.update(event, data);
      } catch (e) {
        console.error('Observer error:', e);
      }
    });
  }
}

class ScanStateObserver extends Observable {
  constructor() {
    super();
    this.state = {
      status: 'idle',
      filesScanned: 0,
      totalSize: 0,
      currentPath: '',
      result: null,
      error: null
    };
  }
  update(event, data) {
    if (data) this.state = { ...this.state, ...data };
    this.notify(event, this.state);
  }
  getState() { return this.state; }
}

// Global scan state observer
window.scanState = new ScanStateObserver();