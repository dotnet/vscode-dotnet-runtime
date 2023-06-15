//@ts-check

'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const extensionConfig = {
  target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

  entry: './/src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new CopyPlugin({ patterns: [
      { from: path.resolve(__dirname, '../vscode-dotnet-runtime-library/install scripts'), to: path.resolve(__dirname, 'dist', 'install scripts') },
      { from: path.resolve(__dirname, '../vscode-dotnet-runtime-library/distro-data/distro-support.json'), to: path.resolve(__dirname, '../vscode-dotnet-runtime-library', 'dist', 'Acquisition/distro-data/distro-support.json') },
      { from: path.resolve(__dirname, '../images'), to: path.resolve(__dirname, 'images') },
      { from: path.resolve(__dirname, '../LICENSE.txt'), to: path.resolve(__dirname, 'LICENSE.txt') }
  ]}),
  ]
};
const uninstallConfig = {
  entry: './src/ExtensionUninstall.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'ExtensionUninstall.js',
    path: path.resolve(__dirname, 'dist'),
  },
  target: 'node',
};
module.exports = [
  extensionConfig,
  uninstallConfig
];