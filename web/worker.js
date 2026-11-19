// Runs the analysis off the main thread so typing stays smooth on long documents.
import { analyze } from '../src/index.js';

self.onmessage = ({ data }) => {
  const { id, text, opts } = data;
  try {
    self.postMessage({ id, result: analyze(text, opts) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
