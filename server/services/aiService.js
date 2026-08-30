const { GoogleGenAI } = require('@google/genai');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
// Keeps the prompt (and Gemini's per-request token cost) bounded for
// pathologically large files — the assistant is meant for in-editor
// snippets/files, not whole-repo analysis.
const MAX_CODE_CHARS = 20000;

const VALID_ACTIONS = ['review', 'optimize', 'explain'];

function isAiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
}

let client = null;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim() });
  return client;
}

// One prompt builder per action rather than a single "always include all
// three sections" template — an "explain" response forced into an "Issues
// Found" / "Refactored Code Block" shape would just be empty noise. Each
// action still uses the same Markdown-sections contract end to end.
function buildPrompt({ code, language, action, selection }) {
  const lang = language || 'plaintext';
  const trimmedSelection = selection && selection.trim() ? selection.trim() : null;

  const target = trimmedSelection
    ? `The user has selected this snippet to focus on:\n\n\`\`\`${lang}\n${trimmedSelection}\n\`\`\`\n\nHere is the full file it comes from, for context:\n\n\`\`\`${lang}\n${code}\n\`\`\``
    : `Here is the file:\n\n\`\`\`${lang}\n${code}\n\`\`\``;

  const persona =
    `You are an expert ${lang} code assistant embedded in DevSangam, a real-time collaborative code editor. ` +
    'Respond in clean, well-structured Markdown only — no preamble like "Sure, here is...", no closing remarks. ' +
    'Prefer bullet points over paragraphs. Use fenced code blocks with the language tag for any code you show.';

  if (action === 'review') {
    return `${persona}

Review the code below for bugs, edge cases, and logic errors.

${target}

Structure your response exactly like this:
## Issues Found
- One bullet per issue: name the problem, why it's a problem, and when it would occur (e.g. "empty array", "concurrent writes", "off-by-one on the last element"). If there truly are none, write a single bullet: "No issues found."

## Refactored Code Block
Only include this section if at least one issue needs a code change. A single fenced \`${lang}\` code block with the corrected version of the whole file (not just the fixed lines).`;
  }

  if (action === 'optimize') {
    return `${persona}

Suggest performance and algorithmic efficiency improvements for the code below.

${target}

Structure your response exactly like this:
## Optimization Suggestions
- One bullet per suggestion: the current inefficiency (e.g. time/space complexity, redundant work, unnecessary allocations) and the concrete improvement. If the code is already efficient, write a single bullet: "No significant optimizations found."

## Refactored Code Block
A single fenced \`${lang}\` code block with the optimized version of the whole file.`;
  }

  if (action === 'explain') {
    return `${persona}

Explain what the code below does, in plain language, for someone reading it for the first time.

${target}

Structure your response exactly like this:
## Explanation
A clear, structured walkthrough broken into logical steps or sections — reference key variables, functions, and control flow by name. Do not include a refactored code block for this action.`;
  }

  throw new Error(`Unsupported action: ${action}`);
}

async function analyzeCode({ code, language, action, selection }) {
  const truncatedCode = code.length > MAX_CODE_CHARS ? `${code.slice(0, MAX_CODE_CHARS)}\n...[truncated]` : code;
  const prompt = buildPrompt({ code: truncatedCode, language, action, selection });

  const ai = getClient();
  const response = await ai.models.generateContent({ model: MODEL, contents: prompt });

  const markdown = response.text?.trim();
  if (!markdown) {
    throw new Error('Empty response from Gemini');
  }
  return markdown;
}

module.exports = { analyzeCode, isAiConfigured, VALID_ACTIONS };
