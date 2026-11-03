// src/observer.js
// Observer Pattern for scan state updates (HU 2, HU 5)
// Subject maintains scan state; observers (UI components) receive notifications

class Observable {
  constructor() {
    this.observers = [];
  }
  subscribe(observer) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
    return () => this.unsubscribe(observer);
  }
  unsubscribe(observer) {
    this.observers = this.observers.filter(o => o !== observer);
  }
  notify(event, data) {
    for (const obs of this.observers) {
      try {
        if (typeof obs === 'function') obs(event, data);
        else if (typeof obs.update === 'function') obs.update(event, data);
      } catch (e) {
        console.error('Observer error:', e);
      }
    }
  }
}

// ScanStateSubject - holds the current scan state
class ScanStateSubject extends Observable {
  constructor() {
    super();
    this.state = {
      status: 'idle', // idle, scanning, complete, cancelled, error
      filesScanned: 0,
      totalSize: 0,
      currentPath: '',
      progress: 0,
      result: null,
      error: null,
      startTime: null
    };
  }
  getState() { return { ...this.state }; }
  setStatus(status) {
    this.state.status = status;
    if (status === 'scanning' && !this.state.startTime) {
      this.state.startTime = Date.now();
    }
    this.notify('status', this.getState());
  }
  updateProgress(data) {
    this.state.filesScanned = data.filesScanned;
    this.state.totalSize = data.totalSize;
    this.state.currentPath = data.currentPath;
    this.notify('progress', this.getState());
  }
  setResult(result) {
    this.state.result = result;
    this.state.status = 'complete';
    this.notify('complete', this.getState());
  }
  setError(error) {
    this.state.error = error;
    this.state.status = 'error';
    this.notify('error', this.getState());
  }
  cancel() {
    this.state.status = 'cancelled';
    this.notify('cancelled', this.getState());
  }
  reset() {
    this.state = {
      status: 'idle',
      filesScanned: 0,
      totalSize: 0,
      currentPath: '',
      progress: 0,
      result: null,
      error: null,
      startTime: null
    };
    this.notify('reset', this.getState());
  }
}

module.exports = { Observable, ScanStateSubject };