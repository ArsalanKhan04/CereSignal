// plotly.js-basic-dist is a multi-megabyte WebGL bundle that jsdom cannot render.
// Mapped in package.json's jest.moduleNameMapper so importing EEGPlot in a test
// does not drag the real bundle in.
const Plotly = {
  newPlot: jest.fn(),
  react: jest.fn(),
  relayout: jest.fn(),
  restyle: jest.fn(),
  purge: jest.fn(),
  toImage: jest.fn(() => Promise.resolve('data:image/png;base64,')),
};

export default Plotly;
