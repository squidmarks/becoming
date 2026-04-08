export class EventDetector {
  constructor(rules = []) {
    this.rules = rules;
    this.previousValues = new Map();
    this.eventStates = new Map();
  }

  updateRules(rules) {
    this.rules = rules;
  }

  detectEvents(path, value, timestamp, source) {
    const events = [];
    const previousValue = this.previousValues.get(path);

    const rulesForPath = this.rules.filter(rule => rule.path === path);

    for (const rule of rulesForPath) {
      const event = this.evaluateRule(rule, previousValue, value, timestamp, source);
      if (event) {
        events.push(event);
        this.eventStates.set(rule.name, {
          active: event.type.includes('started') || event.type.includes('rising'),
          timestamp
        });
      }
    }

    this.previousValues.set(path, value);

    return events;
  }

  evaluateRule(rule, previousValue, currentValue, timestamp, source) {
    if (previousValue === undefined || previousValue === null) {
      return null;
    }

    switch (rule.type) {
      case 'threshold_crossing':
        return this.detectThresholdCrossing(rule, previousValue, currentValue, timestamp, source);
      
      case 'sign_change':
        return this.detectSignChange(rule, previousValue, currentValue, timestamp, source);
      
      case 'state_change':
        return this.detectStateChange(rule, previousValue, currentValue, timestamp, source);
      
      default:
        console.warn(`Unknown event rule type: ${rule.type}`);
        return null;
    }
  }

  detectThresholdCrossing(rule, previousValue, currentValue, timestamp, source) {
    const threshold = rule.threshold;

    if (rule.direction === 'rising') {
      if (previousValue <= threshold && currentValue > threshold) {
        return {
          name: rule.name,
          type: 'threshold_crossing',
          path: rule.path,
          description: rule.description,
          timestamp,
          source,
          fromValue: previousValue,
          toValue: currentValue,
          threshold,
          direction: 'rising'
        };
      }
    } else if (rule.direction === 'falling') {
      if (previousValue >= threshold && currentValue < threshold) {
        return {
          name: rule.name,
          type: 'threshold_crossing',
          path: rule.path,
          description: rule.description,
          timestamp,
          source,
          fromValue: previousValue,
          toValue: currentValue,
          threshold,
          direction: 'falling'
        };
      }
    }

    return null;
  }

  detectSignChange(rule, previousValue, currentValue, timestamp, source) {
    if (typeof previousValue !== 'number' || typeof currentValue !== 'number') {
      return null;
    }

    const prevSign = Math.sign(previousValue);
    const currSign = Math.sign(currentValue);

    if (prevSign === currSign || currSign === 0) {
      return null;
    }

    if (rule.direction === 'positive' && currSign > 0) {
      return {
        name: rule.name,
        type: 'sign_change',
        path: rule.path,
        description: rule.description,
        timestamp,
        source,
        fromValue: previousValue,
        toValue: currentValue,
        direction: 'positive'
      };
    } else if (rule.direction === 'negative' && currSign < 0) {
      return {
        name: rule.name,
        type: 'sign_change',
        path: rule.path,
        description: rule.description,
        timestamp,
        source,
        fromValue: previousValue,
        toValue: currentValue,
        direction: 'negative'
      };
    }

    return null;
  }

  detectStateChange(rule, previousValue, currentValue, timestamp, source) {
    if (previousValue === currentValue) {
      return null;
    }

    return {
      name: rule.name,
      type: 'state_change',
      path: rule.path,
      description: rule.description,
      timestamp,
      source,
      fromValue: previousValue,
      toValue: currentValue
    };
  }

  isEventActive(eventName) {
    const state = this.eventStates.get(eventName);
    return state ? state.active : false;
  }

  getEventState(eventName) {
    return this.eventStates.get(eventName);
  }

  getAllEventStates() {
    const states = {};
    for (const [name, state] of this.eventStates.entries()) {
      states[name] = state;
    }
    return states;
  }
}
