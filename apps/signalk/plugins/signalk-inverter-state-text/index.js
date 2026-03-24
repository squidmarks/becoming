const STATE_MAP = {
  0: 'Power-on',
  1: 'Standby',
  2: 'AC Power (Bypass)',
  3: 'Inverter Operation',
  4: 'AC Power (Bypass)',
  5: 'Inverter Operation',
  6: 'Inverter to AC Power',
  7: 'Switching',
  8: 'Activating',
  9: 'Shutdown',
  10: 'Fault'
};

module.exports = function (app) {
  const plugin = {
    id: 'signalk-inverter-state-text',
    name: 'Inverter State Text Converter',
    description: 'Converts numeric inverter state to human-readable text'
  };

  plugin.schema = {
    title: 'Inverter State Text Converter',
    type: 'object',
    properties: {}
  };

  plugin.start = function (options, restartPlugin) {
    app.debug('Starting inverter state text converter plugin');

    const unsubscribe = app.streambundle.getSelfStream('electrical.inverters.0.state')
      .onValue(state => {
        if (state !== null && state !== undefined) {
          const stateText = STATE_MAP[state] || `Unknown (${state})`;
          
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path: 'electrical.inverters.0.stateText',
                    value: stateText
                  }
                ]
              }
            ]
          });
        }
      });

    plugin.stop = () => {
      app.debug('Stopping inverter state text converter plugin');
      unsubscribe();
    };
  };

  plugin.stop = function () {};

  return plugin;
};
