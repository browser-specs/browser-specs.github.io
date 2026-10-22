// The page's entry point: It replaces the page's static shell, the header and the loading message, with the list.
import { render } from 'preact';
import { App } from './App.tsx';

const root = document.getElementById('page')!;
root.textContent = '';
render(<App />, root);
