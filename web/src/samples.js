// Sample documents, bundled from the repository's samples/ folder.
import blog from '../../samples/ai-blog-post.md?raw';
import landing from '../../samples/ai-landing-page.html?raw';
import script from '../../samples/ai-script.py?raw';
import component from '../../samples/ai-component.jsx?raw';
import readme from '../../samples/ai-readme.md?raw';
import humanReadme from '../../samples/human-readme.md?raw';
import notes from '../../samples/human-notes.md?raw';
import page from '../../samples/handmade-page.html?raw';

export const SAMPLES = [
  { file: 'ai-blog-post.md', label: 'Blog post', type: 'MD', text: blog },
  { file: 'ai-landing-page.html', label: 'Landing page', type: 'HTML', text: landing },
  { file: 'ai-script.py', label: 'Python script', type: 'PY', text: script },
  { file: 'ai-component.jsx', label: 'React component', type: 'JSX', text: component },
  { file: 'ai-readme.md', label: 'Project README', type: 'MD', text: readme },
  { file: 'human-readme.md', label: 'Technical README', type: 'MD', text: humanReadme, human: true },
  { file: 'human-notes.md', label: 'Moving notes', type: 'MD', text: notes, human: true },
  { file: 'handmade-page.html', label: 'Allotment site', type: 'HTML', text: page, human: true },
];
