declare module 'plotly.js-basic-dist' {
  const Plotly: any;
  export default Plotly;
}

// react-plotly.js 4 ships typings only as exports-map entries, which the "node"
// moduleResolution that react-scripts forces cannot see.
declare module 'react-plotly.js/factory' {
  import { ComponentType } from 'react';
  const createPlotlyComponent: (plotly: any) => ComponentType<any>;
  export default createPlotlyComponent;
}
