// Stand-in for react-plotly.js — see src/__mocks__/plotly.ts.
import React from 'react';

const Plot: React.FC<Record<string, unknown>> = () => <div data-testid="plotly-stub" />;

export default Plot;
