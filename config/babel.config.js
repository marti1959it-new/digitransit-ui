const productionPlugins = [
  [
    'babel-plugin-transform-react-remove-prop-types',
    {
      mode: 'unsafe-wrap',
    },
  ],
];

module.exports = function (api) {
  api.cache(true);
  const presets = [
    [
      '@babel/preset-env',
      {
        debug: true,
        bugfixes: true,
        modules: 'auto',
      },
    ],
    [
      '@babel/preset-react',
      {
        development: process.env.NODE_ENV === 'development',
        useBuiltIns: true,
      },
    ],
  ];
  const plugins = [
    'relay',
    'babel-plugin-optimize-clsx',
    '@babel/plugin-transform-class-properties',
    '@babel/plugin-transform-object-rest-spread',
    [
      '@babel/plugin-transform-runtime',
      {
        helpers: true,
        regenerator: true,
        useESModules: true,
      },
    ],
    ['inline-react-svg'],
  ];
  if (process.env.NODE_ENV === 'production') {
    plugins.push(...productionPlugins);
  }
  return {
    presets,
    plugins,
  };
};
