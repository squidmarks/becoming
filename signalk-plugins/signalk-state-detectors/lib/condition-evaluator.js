/**
 * Evaluates complex conditions with AND/OR logic
 */
class ConditionEvaluator {
  /**
   * Evaluate a condition tree against current data
   * @param {Object} condition - Condition definition
   * @param {Object} currentValues - Map of path -> value
   * @returns {boolean} - True if condition matches
   */
  evaluate(condition, currentValues) {
    if (!condition || !condition.rules) {
      return false;
    }

    const operator = condition.operator || 'AND';
    const rules = condition.rules;

    if (operator === 'AND') {
      return rules.every(rule => this.evaluateRule(rule, currentValues));
    } else if (operator === 'OR') {
      return rules.some(rule => this.evaluateRule(rule, currentValues));
    }

    return false;
  }

  /**
   * Evaluate a single rule (can be nested)
   * @param {Object} rule - Rule definition
   * @param {Object} currentValues - Map of path -> value
   * @returns {boolean} - True if rule matches
   */
  evaluateRule(rule, currentValues) {
    // Nested condition (has operator and rules)
    if (rule.operator && rule.rules) {
      return this.evaluate(rule, currentValues);
    }

    // Simple comparison rule
    const { path, operator, value } = rule;
    
    if (!path || !operator) {
      return false;
    }

    const currentValue = this.getValue(currentValues, path);
    
    // Handle undefined/null values
    if (currentValue === undefined || currentValue === null) {
      return false;
    }

    return this.compare(currentValue, operator, value);
  }

  /**
   * Get value from current values, handling nested paths
   * @param {Object} values - Current values map
   * @param {String} path - Path to value (may include wildcards)
   * @returns {*} - Value or undefined
   */
  getValue(values, path) {
    // Direct lookup first
    if (path in values) {
      return values[path];
    }

    // Handle wildcards (e.g., "propulsion.*.revolutions")
    if (path.includes('*')) {
      const regex = new RegExp('^' + path.replace(/\*/g, '[^.]+') + '$');
      const matchingPaths = Object.keys(values).filter(p => regex.test(p));
      
      if (matchingPaths.length > 0) {
        // Return array of matching values
        return matchingPaths.map(p => values[p]);
      }
    }

    return undefined;
  }

  /**
   * Compare two values using an operator
   * @param {*} left - Left value
   * @param {String} operator - Comparison operator
   * @param {*} right - Right value (can be another path or literal)
   * @returns {boolean} - Comparison result
   */
  compare(left, operator, right) {
    // Handle array values (from wildcard paths)
    if (Array.isArray(left)) {
      // For arrays, check if ANY match (OR logic)
      return left.some(val => this.compareValues(val, operator, right));
    }

    return this.compareValues(left, operator, right);
  }

  /**
   * Compare two scalar values
   * @param {*} left - Left value
   * @param {String} operator - Comparison operator
   * @param {*} right - Right value
   * @returns {boolean} - Comparison result
   */
  compareValues(left, operator, right) {
    switch (operator) {
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '==':
        return left == right;
      case '===':
        return left === right;
      case '!=':
        return left != right;
      case '!==':
        return left !== right;
      default:
        console.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }
}

module.exports = { ConditionEvaluator };
