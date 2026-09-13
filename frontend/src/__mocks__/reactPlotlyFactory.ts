// Stand-in for react-plotly.js/factory — hands back the stub component from reactPlotly.tsx.
import Plot from './reactPlotly';

const createPlotlyComponent = () => Plot;

export default createPlotlyComponent;
