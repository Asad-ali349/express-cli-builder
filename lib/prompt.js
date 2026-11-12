/**
 * Answers a yes/no question: an explicit flag wins, then an injected `ask`
 * (tests), then an interactive prompt. Without a terminal the answer is
 * `fallback`, and a hint names the flag that changes it.
 */
async function decide(options, key, question, { fallback = false, flag = `--${key}` } = {}) {
  if (typeof options[key] === 'boolean') return options[key];
  if (typeof options.ask === 'function') return Boolean(await options.ask(question, key));
  if (!process.stdin.isTTY) {
    if (!fallback) console.log(`Skipped: ${question} (no terminal to ask; pass ${flag} to include it).`);
    return fallback;
  }
  const Enquirer = require('enquirer');
  const { answer } = await new Enquirer().prompt({ type: 'confirm', name: 'answer', message: question, initial: true });
  return answer;
}

/**
 * Picks one value from `choices`: an explicit option wins, then an injected
 * `ask`, then an interactive select. Without a terminal `missing` is thrown.
 */
async function choose(options, key, question, choices, missing) {
  const given = options[key];
  if (given !== undefined) {
    const match = choices.find((choice) => choice.toLowerCase() === String(given).toLowerCase());
    if (!match) throw new Error(`Unknown ${key} "${given}". Use one of: ${choices.join(', ')}`);
    return match;
  }
  if (typeof options.ask === 'function') return options.ask(question, key, choices);
  if (!process.stdin.isTTY) throw new Error(missing);
  const Enquirer = require('enquirer');
  const { answer } = await new Enquirer().prompt({ type: 'select', name: 'answer', message: question, choices });
  return answer;
}

module.exports = { decide, choose };
